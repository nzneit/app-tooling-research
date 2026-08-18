// The composition above the two ports. Stands in for 0060's accepted boundary:
// this spike does not rebuild the boundary, it builds the inbox that plugs into
// it, so everything here is the minimum needed to exercise `ingest`.

import type { PolicyTable, TopicParams, Validated } from "./policy.js";
import type { BrokerHandlers, InboxStorePort, PacketMeta } from "./ports.js";
import { ingest, type IngressContext, type MutableInboxStatus, type PreparedRow } from "./internal/ingest.js";
import {
  percentiles,
  type InboxHydrated,
  type InboxStatus,
  type MessageDelivered,
  type TelemetryEmission,
  type TransportReason,
} from "./status.js";

export interface QuarantineEntry {
  readonly raw: unknown;
  readonly reason: TransportReason;
  readonly topic: string;
  readonly channel: string;
  readonly cause: unknown;
}

export interface PipelineOptions {
  readonly policies: PolicyTable;
  readonly inbox: InboxStorePort;
  readonly now?: () => number;
  /** Bounded, oldest-first eviction, as the accepted quarantine ring behaves. */
  readonly quarantineCapacity?: number;
}

export interface Pipeline {
  readonly handlers: BrokerHandlers;
  /** Opens the inbox and emits `inbox.hydrated`. Durable deliveries are withheld
   *  until this resolves. */
  start(): Promise<InboxHydrated>;
  readonly status: InboxStatus;
  readonly delivered: readonly MessageDelivered[];
  readonly telemetry: readonly TelemetryEmission[];
  readonly quarantine: readonly QuarantineEntry[];
  readonly hydrated: InboxHydrated | null;
  readonly lifecycle: readonly string[];
}

/** Exact match, then a single-level `+` / trailing `#` match. Enough for the
 *  spike; the accepted boundary owns real topic matching (mqtt-pattern). */
function matchChannel(policies: PolicyTable, topic: string): { channel: string; params: TopicParams } | null {
  if (Object.hasOwn(policies, topic)) return { channel: topic, params: {} };
  for (const filter of Object.keys(policies)) {
    const f = filter.split("/");
    const t = topic.split("/");
    if (f[f.length - 1] === "#") {
      if (t.length >= f.length - 1 && f.slice(0, -1).every((seg, i) => seg === "+" || seg === t[i])) {
        return { channel: filter, params: {} };
      }
      continue;
    }
    if (f.length !== t.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < f.length; i++) {
      const seg = f[i] ?? "";
      const val = t[i] ?? "";
      if (seg === "+") params[`p${String(i)}`] = val;
      else if (seg !== val) {
        ok = false;
        break;
      }
    }
    if (ok) return { channel: filter, params };
  }
  return null;
}

export function createPipeline(options: PipelineOptions): Pipeline {
  const now = options.now ?? (() => Date.now());
  const capacity = options.quarantineCapacity ?? 64;

  const delivered: MessageDelivered[] = [];
  const telemetry: TelemetryEmission[] = [];
  const quarantine: QuarantineEntry[] = [];
  const lifecycle: string[] = [];
  const commitSamples: number[] = [];
  const attempts = new Map<string, number>();
  const warned = new Map<string, number>();

  const hasDurable = Object.values(options.policies).some((p) => "durable" in p && p.durable);

  const status: MutableInboxStatus = {
    state: hasDurable ? "loading" : "absent",
    pending: 0,
    maxInFlight: 0,
    applied: 0,
    suppressed: 0,
    identityMissing: 0,
    failed: 0,
    givenUp: 0,
    qosDrift: 0,
    commitMs: { p50: 0, p99: 0, max: 0 },
  };

  let hydrated: InboxHydrated | null = null;

  const ctx: IngressContext = {
    inbox: options.inbox,
    clock: { now },
    status,
    commitSamples,
    attempts,
    emit(ev) {
      delivered.push({ type: "message", ...ev });
    },
    quarantine(entry) {
      quarantine.push(entry);
      while (quarantine.length > capacity) quarantine.shift();
    },
    // D-0018's ratified shape: fold by dedupKey, emit once per key. At 5 msg/s a
    // lapsed topic would otherwise trip this on every message.
    warnOnce(key, reason, detail) {
      const seen = (warned.get(key) ?? 0) + 1;
      warned.set(key, seen);
      if (seen > 1) return;
      telemetry.push({ type: "telemetry", class: 1, reason, dedupKey: key, count: 1, detail });
    },
  };

  const handlers: BrokerHandlers = {
    onMessage(topic, payload, meta: PacketMeta) {
      const matched = matchChannel(options.policies, topic);
      if (matched === null) {
        ctx.quarantine({ raw: payload, reason: "queue-overflow", topic, channel: "?", cause: "unrouted" });
        return;
      }
      const policy = options.policies[matched.channel];
      if (policy === undefined) return;

      let decoded: unknown;
      try {
        decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
      } catch (cause) {
        ctx.quarantine({ raw: payload, reason: "network", topic, channel: matched.channel, cause });
        return; // class 4 undecodable in the accepted taxonomy; acked, never applied
      }
      if (!policy.validate(decoded)) {
        ctx.quarantine({ raw: decoded, reason: "network", topic, channel: matched.channel, cause: "invalid" });
        return; // D1: a malformed redelivery is never deduplicated and never applied
      }

      const row: PreparedRow = {
        channel: matched.channel,
        declaredQos: policy.qos ?? 0,
        durable: "durable" in policy && policy.durable ? policy.durable : undefined,
      };
      return ingest(ctx, row, {
        topic,
        params: matched.params,
        payload: decoded as Validated<unknown>,
        raw: payload,
        meta,
      });
    },
    onLifecycle(e) {
      lifecycle.push(e);
    },
  };

  return {
    handlers,
    async start() {
      const h = await options.inbox.open();
      if (hasDurable) status.state = "ready";
      hydrated = {
        type: "inbox.hydrated",
        writes: h.writes,
        schemaVersion: h.schemaVersion,
        reset: h.reset,
        cold: h.cold,
        durability: h.durability,
      };
      return hydrated;
    },
    get status() {
      return { ...status, commitMs: percentiles(commitSamples) };
    },
    get delivered() {
      return delivered;
    },
    get telemetry() {
      return telemetry;
    },
    get quarantine() {
      return quarantine;
    },
    get hydrated() {
      return hydrated;
    },
    get lifecycle() {
      return lifecycle;
    },
  };
}
