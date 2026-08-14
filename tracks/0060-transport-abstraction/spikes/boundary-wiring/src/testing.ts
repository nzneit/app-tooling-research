// Entry point 3 — `transport-boundary/testing` (never in the production bundle).
// The second adapter at each real seam, plus scripting grips. Grips are adapter
// substance, deliberately NOT part of the ports.

import type {
  BrokerConnectOptions,
  BrokerHandlers,
  BrokerLink,
  BrokerPort,
  FetchLike,
} from "./types.js";

export interface MemoryBroker extends BrokerPort {
  deliver(
    topic: string,
    payload: Uint8Array | string,
    meta?: { messageId?: number; dup?: boolean; qos?: 0 | 1 | 2 },
  ): void;
  /** emits close/offline; the machine reacts (the #909 window) */
  dropConnection(): void;
  restoreConnection(): void;
  /** QoS-1 duplicate injection: re-delivers the next N messages verbatim */
  duplicateNext(times?: number): void;
  /** drives bounded retry -> give-up -> 'degraded' */
  refuseReconnects(): void;
  allowReconnects(): void;
  readonly published: readonly { topic: string; payload: Uint8Array; qos: 0 | 1 }[];
  readonly subscriptions: readonly string[];
  /** every subscribe packet ever sent, including resubscribes after reconnect */
  readonly subscribeLog: readonly string[];
  readonly connected: boolean;
  readonly ended: boolean;
}

const encoder = new TextEncoder();

export function memoryBrokerAdapter(): MemoryBroker {
  let handlers: BrokerHandlers | null = null;
  let connected = false;
  let ended = false;
  let refusing = false;
  let duplicates = 0;
  let autoMessageId = 1;
  const published: { topic: string; payload: Uint8Array; qos: 0 | 1 }[] = [];
  const subs = new Set<string>();
  const subscribeLog: string[] = [];

  const broker: MemoryBroker = {
    connect(_opts: BrokerConnectOptions, h: BrokerHandlers): BrokerLink {
      handlers = h;
      ended = false;
      // Connection is established on a microtask, like a real socket handshake.
      queueMicrotask(() => {
        if (ended || refusing || handlers !== h) return;
        connected = true;
        h.onLifecycle("connect");
      });
      return {
        async subscribe(filter) {
          subs.add(filter);
          subscribeLog.push(filter);
        },
        async unsubscribe(filter) {
          subs.delete(filter);
        },
        async publish(topic, payload, o) {
          if (!connected) throw new Error("memory broker: not connected");
          published.push({ topic, payload, qos: o.qos });
        },
        async end() {
          ended = true;
          connected = false;
          handlers = null;
        },
      };
    },

    deliver(topic, payload, meta) {
      const h = handlers;
      if (h === null || !connected) return;
      const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
      const qos = meta?.qos ?? 1;
      const messageId = meta?.messageId ?? (qos === 0 ? undefined : autoMessageId++);
      h.onMessage(topic, bytes, { messageId, dup: meta?.dup ?? false, qos });
      if (duplicates > 0) {
        duplicates--;
        h.onMessage(topic, bytes, { messageId, dup: true, qos });
      }
    },

    dropConnection() {
      if (!connected) return;
      connected = false;
      handlers?.onLifecycle("close");
      handlers?.onLifecycle("offline");
      // The adapter owns the retry loop: it keeps trying until told otherwise.
      retry();
    },

    restoreConnection() {
      refusing = false;
      if (connected || handlers === null) return;
      connected = true;
      handlers.onLifecycle("connect");
    },

    duplicateNext(times = 1) {
      duplicates += times;
    },

    refuseReconnects() {
      refusing = true;
    },

    allowReconnects() {
      refusing = false;
    },

    get published() {
      return published;
    },
    get subscriptions() {
      return [...subs];
    },
    get subscribeLog() {
      return subscribeLog;
    },
    get connected() {
      return connected;
    },
    get ended() {
      return ended;
    },
  };

  function retry(): void {
    queueMicrotask(() => {
      if (ended || connected || handlers === null) return;
      if (refusing) {
        handlers.onLifecycle("reconnect");
        handlers.onLifecycle("error", new Error("memory broker: connection refused"));
        handlers.onLifecycle("close");
        retry();
        return;
      }
      connected = true;
      handlers.onLifecycle("connect");
    });
  }

  return broker;
}

export interface ScriptedRoute {
  method: string;
  url: string | RegExp;
  status: number;
  body?: unknown;
  contentType?: string;
  delayMs?: number;
}

/** Handler-table REST adapter; honors abort. */
export function scriptedFetchAdapter(routes: readonly ScriptedRoute[]): FetchLike {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init.method ?? "GET").toUpperCase();
    const route = routes.find(
      (r) =>
        r.method.toUpperCase() === method &&
        (typeof r.url === "string" ? url.includes(r.url) : r.url.test(url)),
    );
    if (route === undefined) throw new TypeError(`scriptedFetchAdapter: no route for ${method} ${url}`);
    if (route.delayMs !== undefined) {
      await new Promise<void>((resolve, rejectPromise) => {
        const timer = setTimeout(resolve, route.delayMs);
        init.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            rejectPromise(abortError());
          },
          { once: true },
        );
      });
    }
    if (init.signal.aborted) throw abortError();
    const contentType = route.contentType ?? "application/json";
    const body =
      route.body === undefined
        ? ""
        : typeof route.body === "string"
          ? route.body
          : JSON.stringify(route.body);
    return new Response(body, { status: route.status, headers: { "content-type": contentType } });
  };
}

function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}
