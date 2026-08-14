// createTransportBoundary — the one deep module fronting both protocols.
// Ordering constraints O1-O6 and invariants I1-I13 live here; design.md is
// authoritative for both.

import type { BoundaryError, TelemetryEvent } from "../errors/index.js";
import {
  fromAjvErrors,
  reasonCodeError,
  transportError,
  unroutableError,
  type ErrorContext,
} from "../errors/normalize.js";
import type {
  BoundaryActorRef,
  BoundaryAdapters,
  BoundaryConfig,
  BoundaryFetcher,
  BoundarySnapshot,
  BrokerHandlers,
  BrokerLink,
  ClockPort,
  PolicyTable,
  QuarantineEntry,
  TopicParams,
  TransportBoundary,
  Unsubscribe,
  Validated,
} from "../types.js";
import { globalFetchAdapter, systemClock } from "../adapters/system.js";
import { mqttJsBrokerAdapter } from "../adapters/mqttjs.js";
import { createConnectionActor, defaultBackoff } from "./connection.js";
import { RedeliveryGuard } from "./dedup.js";
import { WireOne } from "./emitter.js";
import { compilePolicy, fillTopic, matchTopic, type CompiledRow } from "./policy.js";
import { DeliveryPump } from "./pump.js";
import { QuarantineRing } from "./quarantine.js";
import { TelemetryDeduper } from "./telemetry.js";

interface WireEvent {
  type: string;
  [k: string]: unknown;
}

interface Delivery {
  row: CompiledRow;
  topic: string;
  params: TopicParams;
  data: unknown;
}

interface PendingPublish {
  topic: string;
  bytes: Uint8Array;
  qos: 0 | 1;
  retain: boolean | undefined;
  resolve: () => void;
  reject: (e: BoundaryError) => void;
}

const DEFAULTS = {
  reconnectPeriodMs: 1000,
  connectTimeoutMs: 4000,
  maxAttempts: 10,
  delivery: 256,
  publish: 64,
  quarantine: 100,
  dedupeWindowMs: 60_000,
} as const;

export function createTransportBoundary<const P extends PolicyTable>(
  config: BoundaryConfig<P>,
  adapters?: Partial<BoundaryAdapters>,
): TransportBoundary<P> {
  // ── Configuration (programmer errors throw plain Error, synchronously) ──
  const scheme = /^wss?:\/\//.exec(config.mqtt.url);
  if (scheme === null)
    throw new Error(`boundary: mqtt.url must be ws:// or wss:// (got "${config.mqtt.url}")`);
  const rows = compilePolicy(config.policy);
  const rowByChannel = new Map(rows.map((r) => [r.channel, r]));

  const bounds = config.mqtt.bounds ?? {};
  const reconnectCfg = config.mqtt.reconnect ?? {};
  const clock: ClockPort = adapters?.clock ?? systemClock;
  const broker = adapters?.broker ?? mqttJsBrokerAdapter();
  const doFetch = adapters?.fetch ?? globalFetchAdapter;
  const inspect = config.inspect;
  const now = () => Date.now();

  const maxAttempts = reconnectCfg.maxAttempts ?? DEFAULTS.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0)
    throw new Error("boundary: reconnect.maxAttempts must be a positive integer");
  const publishBound = bounds.publish ?? DEFAULTS.publish;
  if (!Number.isInteger(publishBound) || publishBound <= 0)
    throw new Error("boundary: publish bound must be a positive integer");

  // ── Machinery ───────────────────────────────────────────────────
  const wire1 = new WireOne<WireEvent>((err, ev) => {
    inspect?.({ type: "listener-error", error: err, event: ev.type });
  });
  const quarantine = new QuarantineRing(bounds.quarantine ?? DEFAULTS.quarantine);
  const telemetry = new TelemetryDeduper(
    config.telemetry?.dedupeWindowMs ?? DEFAULTS.dedupeWindowMs,
    clock,
    (event: TelemetryEvent) => {
      inspect?.({ type: "telemetry", event });
      wire1.emit({ type: "telemetry", event });
    },
  );
  const guard = new RedeliveryGuard();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const pump = new DeliveryPump<Delivery>(bounds.delivery ?? DEFAULTS.delivery, deliver, shed);
  const conn = createConnectionActor({
    maxAttempts,
    backoffMs: reconnectCfg.backoffMs ?? defaultBackoff,
    clock,
    now,
  });

  const interest = new Map<string, number>();
  const publishQueue: PendingPublish[] = [];
  const wire2 = new Set<(s: BoundarySnapshot) => void>();

  let link: BrokerLink | null = null;
  /** Bumped whenever the link is replaced, so a closing link's late callbacks are ignored. */
  let generation = 0;
  let started = false;
  let disposed = false;
  let snapshot: BoundarySnapshot | null = null;
  let notified: BoundarySnapshot | null = null;

  // ── Wire 2 ──────────────────────────────────────────────────────

  function ctx(endpointOrTopic: string, raw: unknown, leg: "mqtt" | "rest" = "mqtt"): ErrorContext {
    return { leg, endpointOrTopic, timestamp: now(), raw };
  }

  function computeSnapshot(): BoundarySnapshot {
    const state = conn.state();
    return {
      connection: state,
      attempt: conn.attempt(),
      publishGated: state === "degraded" || state === "ended",
      subscriptions: [...interest.keys()]
        .map((c) => rowByChannel.get(c)?.filter ?? c)
        .sort(),
      depths: {
        delivery: pump.depth,
        publish: publishQueue.length,
        quarantine: quarantine.size,
      },
      degradedSince: conn.degradedSince(),
    };
  }

  function sameSnapshot(a: BoundarySnapshot, b: BoundarySnapshot): boolean {
    return (
      a.connection === b.connection &&
      a.attempt === b.attempt &&
      a.publishGated === b.publishGated &&
      a.degradedSince === b.degradedSince &&
      a.depths.delivery === b.depths.delivery &&
      a.depths.publish === b.depths.publish &&
      a.depths.quarantine === b.depths.quarantine &&
      a.subscriptions.length === b.subscriptions.length &&
      a.subscriptions.every((s, i) => s === b.subscriptions[i])
    );
  }

  /** O6: notify on state/depth change only; getSnapshot() agrees with the last notification. */
  function markDirty(): void {
    snapshot = null;
    if (wire2.size === 0) return;
    const next = getSnapshot();
    if (notified !== null && sameSnapshot(notified, next)) return;
    notified = next;
    for (const l of [...wire2]) {
      try {
        l(next);
      } catch (err) {
        inspect?.({ type: "listener-error", error: err, event: "snapshot" });
      }
    }
  }

  function getSnapshot(): BoundarySnapshot {
    if (snapshot === null) snapshot = computeSnapshot();
    return snapshot;
  }

  // ── Quarantine + telemetry (O5: push happens-before emission) ────

  function reject(raw: unknown, error: BoundaryError): void {
    quarantine.push(raw, error);
    inspect?.({ type: "quarantine", error });
    telemetry.record(error);
    markDirty();
  }

  // ── Ingress pipeline (O1) ───────────────────────────────────────

  function ingest(
    topic: string,
    payload: Uint8Array,
    meta: { messageId?: number; dup: boolean; qos: 0 | 1 | 2 },
  ): void {
    inspect?.({ type: "ingress", topic, bytes: payload.byteLength, meta });

    // 1. redelivery dedup (pre-validation, so a duplicate produces neither a
    //    second emission nor a second quarantine entry)
    if (guard.isDuplicate(topic, meta.messageId)) {
      inspect?.({ type: "redelivery-suppressed", topic, messageId: meta.messageId });
      return;
    }

    // 2. policy-table match
    const match = matchTopic(rows, topic);
    if (match === null) {
      reject(payload, unroutableError(ctx(topic, payload), "unknown-topic"));
      return;
    }

    // 3. strict UTF-8 + JSON decode (I11: every content type defined)
    let data: unknown;
    try {
      data = JSON.parse(decoder.decode(payload));
    } catch (err) {
      reject(payload, unroutableError(ctx(topic, err), "undecodable"));
      return;
    }

    // 4. validate (compiled Ajv, synchronous)
    const validate = match.row.policy.validate;
    const sampled = match.row.sample >= 1 || Math.random() < match.row.sample;
    if (sampled && !validate(data)) {
      const errors = [...(validate.errors ?? [])];
      reject(data, fromAjvErrors(errors, ctx(topic, errors)));
      return;
    }

    // 5. bounded enqueue -> 6. emit, off the packet pump
    pump.push({ row: match.row, topic, params: match.params, data });
    markDirty();
  }

  function deliver(item: Delivery): void {
    wire1.emit({
      type: `message.${item.row.channel}`,
      channel: item.row.channel,
      topic: item.topic,
      params: item.params,
      payload: item.data,
    });
    // I2: additive class-3 construction, only after validate succeeded.
    const rc = item.row.policy.reasonCode;
    if (rc !== undefined) {
      try {
        const selected = rc.select(item.data as never);
        telemetry.record(reasonCodeError(ctx(item.topic, item.data), null, selected));
      } catch (err) {
        inspect?.({ type: "listener-error", error: err, event: "reasonCode.select" });
      }
    }
    markDirty();
  }

  function shed(item: Delivery): void {
    reject(item.data, transportError(ctx(item.topic, item.data), "queue-overflow"));
  }

  // ── Broker link ─────────────────────────────────────────────────

  function makeHandlers(gen: number): BrokerHandlers {
    return {
      onMessage(topic, payload, meta) {
        if (gen !== generation || disposed) return;
        ingest(topic, payload, meta);
      },
      onLifecycle(e, detail) {
        inspect?.({ type: "lifecycle", event: e, detail });
        if (gen !== generation || disposed) return;
        switch (e) {
          case "connect":
            conn.send({ type: "BROKER_CONNECT" });
            break;
          case "close":
          case "offline":
          case "error": {
            const wasUp = conn.state() === "connected";
            conn.send({ type: "BROKER_DOWN" });
            if (wasUp)
              telemetry.record(
                transportError(ctx(config.mqtt.url, detail ?? null), "connection-lost"),
              );
            break;
          }
          case "reconnect":
            break;
        }
        markDirty();
      },
    };
  }

  function openLink(): void {
    if (link !== null || disposed) return;
    const gen = ++generation;
    link = broker.connect(
      {
        url: config.mqtt.url,
        clientId: config.mqtt.auth?.clientId ?? `boundary-${Math.random().toString(16).slice(2)}`,
        clean: true,
        reconnectPeriodMs: reconnectCfg.periodMs ?? DEFAULTS.reconnectPeriodMs,
        connectTimeoutMs: config.mqtt.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs,
        transformWsUrl: config.mqtt.auth?.transformWsUrl,
        username: config.mqtt.auth?.username,
        password: config.mqtt.auth?.password,
      },
      makeHandlers(gen),
    );
  }

  async function closeLink(): Promise<void> {
    const l = link;
    link = null;
    if (l === null) return;
    generation++;
    try {
      await l.end();
    } catch (err) {
      inspect?.({ type: "link-end-failed", error: err });
    }
  }

  // Wire 2 must see `attempt` climb during the bounded-retry sequence, which
  // re-enters 'reconnecting' without changing the state value.
  conn.onChange(markDirty);

  conn.onTransition((state) => {
    if (state === "connected") {
      // O3: declared interest is applied at connect and resubscribed across reconnects.
      const l = link;
      if (l !== null) {
        for (const channel of interest.keys()) {
          const row = rowByChannel.get(channel);
          if (row !== undefined) void l.subscribe(row.filter, { qos: row.qos }).catch(noop);
        }
      }
      flushPublishQueue();
    } else if (state === "degraded") {
      // Give-up: stop the adapter's retry loop; gate publishes (O4).
      telemetry.record(transportError(ctx(config.mqtt.url, null), "connection-lost"));
      void closeLink();
      drainPublishQueue("publish-gated");
    } else if (state === "ended") {
      void closeLink();
      drainPublishQueue("disposed");
    }
    markDirty();
  });

  // ── Egress ──────────────────────────────────────────────────────

  function gatedError(topic: string, reason: "publish-gated" | "disposed"): BoundaryError {
    return transportError(ctx(topic, null), reason);
  }

  function drainPublishQueue(reason: "publish-gated" | "disposed"): void {
    while (publishQueue.length > 0) {
      const p = publishQueue.shift() as PendingPublish;
      p.reject(gatedError(p.topic, reason));
    }
    markDirty();
  }

  function flushPublishQueue(): void {
    const l = link;
    if (l === null) return;
    while (publishQueue.length > 0) {
      const p = publishQueue.shift() as PendingPublish;
      void l
        .publish(p.topic, p.bytes, { qos: p.qos, retain: p.retain })
        .then(p.resolve)
        .catch(() => p.reject(transportError(ctx(p.topic, null), "connection-lost")));
    }
    markDirty();
  }

  function enqueuePublish(p: PendingPublish): void {
    publishQueue.push(p);
    while (publishQueue.length > publishBound) {
      const oldest = publishQueue.shift() as PendingPublish;
      const err = transportError(ctx(oldest.topic, null), "queue-overflow");
      reject(null, err);
      oldest.reject(err);
    }
    markDirty();
  }

  async function publish(
    channel: string,
    payload: unknown,
    params?: TopicParams,
    opts?: { qos?: 0 | 1; retain?: boolean },
  ): Promise<void> {
    const row = rowByChannel.get(channel);
    if (row === undefined) throw new Error(`boundary: unknown channel "${channel}"`);
    if (row.direction === "in")
      throw new Error(`boundary: channel "${channel}" is inbound-only (direction: 'in')`);
    const topic = fillTopic(row, params);

    // I7: symmetric choke point — egress validates against the same validator.
    if (!row.policy.validate(payload)) {
      const errors = [...(row.policy.validate.errors ?? [])];
      const err = fromAjvErrors(errors, ctx(topic, errors));
      reject(payload, err);
      throw err;
    }

    const state = conn.state();
    if (disposed || state === "ended") throw gatedError(topic, "disposed");
    if (state === "degraded") {
      const err = gatedError(topic, "publish-gated");
      telemetry.record(err);
      throw err;
    }

    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const qos = opts?.qos ?? row.qos;
    const l = link;
    if (state === "connected" && l !== null) {
      try {
        await l.publish(topic, bytes, { qos, retain: opts?.retain });
        return;
      } catch {
        throw transportError(ctx(topic, null), "connection-lost");
      }
    }
    // idle | connecting | reconnecting -> bounded queue (O4)
    return new Promise<void>((resolve, rej) => {
      enqueuePublish({ topic, bytes, qos, retain: opts?.retain, resolve, reject: rej });
    });
  }

  // ── Interest (refcounted) ───────────────────────────────────────

  function subscribeChannel(channel: string, listener?: (e: never) => void): Unsubscribe {
    const row = rowByChannel.get(channel);
    if (row === undefined) throw new Error(`boundary: unknown channel "${channel}"`);
    if (row.direction === "out")
      throw new Error(`boundary: channel "${channel}" is outbound-only (direction: 'out')`);

    const count = (interest.get(channel) ?? 0) + 1;
    interest.set(channel, count);
    if (count === 1 && link !== null && conn.state() === "connected")
      void link.subscribe(row.filter, { qos: row.qos }).catch(noop);

    const offListener =
      listener === undefined
        ? undefined
        : wire1.on(`message.${channel}`, listener as (e: never) => void);
    markDirty();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      offListener?.();
      const next = (interest.get(channel) ?? 1) - 1;
      if (next <= 0) {
        interest.delete(channel);
        if (link !== null && conn.state() === "connected")
          void link.unsubscribe(row.filter).catch(noop);
      } else {
        interest.set(channel, next);
      }
      markDirty();
    };
  }

  // ── REST leg (seam surface; per-status zod validation is 0060 Task 6) ────

  const fetcher: BoundaryFetcher = async <TOk>(
    req: Parameters<BoundaryFetcher>[0],
    opts?: { signal?: AbortSignal },
  ) => {
    if (disposed)
      throw transportError({ leg: "rest", endpointOrTopic: req.url, timestamp: now(), raw: null }, "disposed");
    const url = buildUrl(config.rest.baseUrl, req.url, req.params);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (opts?.signal !== undefined) {
      if (opts.signal.aborted) abort();
      else opts.signal.addEventListener("abort", abort, { once: true });
    }
    const timer =
      config.rest.timeoutMs === undefined
        ? undefined
        : clock.setTimeout(() => {
            timedOut = true;
            abort();
          }, config.rest.timeoutMs);

    let res: Response;
    try {
      res = await doFetch(url, {
        method: req.method,
        headers: mergeHeaders(config.rest.headers, req.headers),
        body: req.data === undefined ? undefined : JSON.stringify(req.data),
        signal: controller.signal,
      });
    } catch (err) {
      throw transportError(
        ctx(url, err, "rest"),
        timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "network",
      );
    } finally {
      if (timer !== undefined) clock.clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", abort);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      const err = unroutableError(ctx(url, contentType, "rest"), "unknown-content-type");
      reject(await res.text().catch(() => null), err);
      throw err;
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (parseErr) {
      const err = unroutableError(ctx(url, parseErr, "rest"), "undecodable");
      reject(null, err);
      throw err;
    }
    if (!res.ok) throw reasonCodeError(ctx(url, body, "rest"), res.status, body);
    return body as Validated<TOk>;
  };

  // ── Handle ──────────────────────────────────────────────────────

  const actor: BoundaryActorRef<P> = {
    on: ((type: string, listener: (e: never) => void) =>
      wire1.on(type, listener)) as BoundaryActorRef<P>["on"],
    subscribe(listener) {
      wire2.add(listener);
      return () => wire2.delete(listener);
    },
    getSnapshot,
  };

  const handle = {
    actor,
    subscribe: subscribeChannel,
    publish,
    fetcher,
    quarantine: {
      entries: (): readonly QuarantineEntry[] => quarantine.entries(),
      get capacity() {
        return quarantine.capacity;
      },
    },
    start(): void {
      if (started || disposed) return;
      started = true;
      openLink();
      conn.send({ type: "START" });
      markDirty();
    },
    reconnect(): void {
      if (disposed || conn.state() !== "degraded") return;
      openLink();
      conn.send({ type: "RECONNECT" });
      markDirty();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      conn.send({ type: "DISPOSE" });
      drainPublishQueue("disposed");
      markDirty();
      conn.stop();
      pump.dispose();
      telemetry.dispose();
      guard.clear();
      await closeLink();
      // I10: wire silence after dispose(). Both wires — wire-2 subscribers have
      // already received the terminal 'ended' snapshot from markDirty() above,
      // so dropping them here leaks nothing and keeps no listener alive.
      wire1.clear();
      wire2.clear();
    },
  };

  return handle as unknown as TransportBoundary<P>;
}

function noop(): void {}

function buildUrl(baseUrl: string, url: string, params?: Record<string, unknown>): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const path = url.startsWith("/") ? url : `/${url}`;
  const search =
    params === undefined
      ? ""
      : new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) =>
            v === undefined || v === null ? [] : [[k, String(v)] as [string, string]],
          ),
        ).toString();
  return search === "" ? `${base}${path}` : `${base}${path}?${search}`;
}

function mergeHeaders(a: HeadersInit | undefined, b: HeadersInit | undefined): HeadersInit {
  const out = new Headers(a);
  new Headers(b).forEach((v, k) => out.set(k, v));
  if (!out.has("content-type")) out.set("content-type", "application/json");
  return out;
}
