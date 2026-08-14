// Public types for the `transport-boundary` module. Authoritative source:
// ../design.md, "Chosen interface". Spike code — findings.md is the durable artifact.

import type { BoundaryError } from "./errors/index.js";
import type { TelemetryEvent } from "./errors/index.js";

// ── Branding ─────────────────────────────────────────────────────

declare const ValidatedBrand: unique symbol;
/** Applied at the ingress, and only there (I1). */
export type Validated<T> = T & { readonly [ValidatedBrand]: true };

// ── Policy table ─────────────────────────────────────────────────

export interface CompiledValidator<T> {
  (data: unknown): data is T;
  /** Ajv standalone error slot. */
  errors?: readonly unknown[] | null;
}

export interface ChannelPolicy<T> {
  /** 0010's compiled Ajv standalone validator, injected not created. */
  validate: CompiledValidator<T>;
  /** default 'in'; publish is typed away on 'in' rows. */
  direction?: "in" | "out" | "inout";
  qos?: 0 | 1;
  /** 0-1 validation sampling knob; default 1 (validate-always). */
  sample?: number;
  /**
   * Marks this a contracted error/status channel. Runs only after `validate`
   * succeeds, so an invalid payload on a reasonCode channel is still class 2
   * and `select` never runs (I2). On success the boundary constructs a class-3
   * ReasonCodeError (`status: null` on this leg) onto the deduped telemetry
   * wire — additive, never substitutive: `message.*` still fires.
   */
  reasonCode?: {
    select: (payload: Validated<T>) => { code: string | number; detail?: unknown };
  };
}

/** Keyed like AsyncAPI channels, e.g. 'plant/{plantId}/telemetry'. */
export type PolicyTable = Record<string, ChannelPolicy<any>>;

type DirectionOf<R> = R extends { direction: infer D } ? D : "in";

export type PayloadOf<P extends PolicyTable, K extends keyof P> =
  P[K] extends ChannelPolicy<infer T> ? T : never;

export type InboundChannel<P extends PolicyTable> = {
  [K in keyof P & string]: DirectionOf<P[K]> extends "out" ? never : K;
}[keyof P & string];

export type OutboundChannel<P extends PolicyTable> = {
  [K in keyof P & string]: DirectionOf<P[K]> extends "out" | "inout" ? K : never;
}[keyof P & string];

export type TopicParams = Readonly<Record<string, string>>;
export type Unsubscribe = () => void;

// ── Configuration ────────────────────────────────────────────────

export interface BoundaryConfig<P extends PolicyTable> {
  mqtt: {
    /** wss:// (ws:// permitted in dev). */
    url: string;
    auth?: {
      username?: string;
      password?: string;
      clientId?: string;
      transformWsUrl?: (url: string) => string;
    };
    /**
     * How long a single connection attempt may hang before the adapter aborts
     * it and the retry loop takes over. Default 4000.
     *
     * Addition to design.md's config shape (recorded in findings.md): it was a
     * hardcoded 4000 inside the mqtt.js adapter, which is exactly the kind of
     * fact the interface is supposed to own rather than bury in an adapter.
     */
    connectTimeoutMs?: number;
    reconnect?: {
      /** default 1000 (mqtt.js reconnectPeriod) — the adapter's retry LOOP. */
      periodMs?: number;
      /** default 10; exhausted -> 'degraded' — the module's give-up POLICY. */
      maxAttempts?: number;
      /** default exponential, cap 30s. */
      backoffMs?: (attempt: number) => number;
    };
    /** mqtt.js has no size bounds; these are ours (I9). */
    bounds?: {
      delivery?: number;
      publish?: number;
      quarantine?: number;
    };
  };
  policy: P;
  rest: { baseUrl: string; timeoutMs?: number; headers?: HeadersInit };
  telemetry?: { dedupeWindowMs?: number };
  /** Dev only: every event crossing the seam, quarantine-bound rejects included. */
  inspect?: (event: unknown) => void;
}

// ── Wires ────────────────────────────────────────────────────────

export type MessageEvent<P extends PolicyTable> = {
  [K in InboundChannel<P>]: {
    type: `message.${K}`;
    channel: K;
    /** concrete matched topic */
    topic: string;
    /** named wildcards extracted by mqtt-pattern */
    params: TopicParams;
    payload: Validated<PayloadOf<P, K>>;
  };
}[InboundChannel<P>];

export interface TelemetryEmission {
  type: "telemetry";
  event: TelemetryEvent;
}

export type BoundaryEmitted<P extends PolicyTable> = MessageEvent<P> | TelemetryEmission;

export interface BoundarySnapshot {
  readonly connection:
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "degraded"
    | "ended";
  readonly attempt: number;
  readonly publishGated: boolean;
  readonly subscriptions: readonly string[];
  readonly depths: {
    readonly delivery: number;
    readonly publish: number;
    readonly quarantine: number;
  };
  readonly degradedSince?: number;
}

/**
 * Both wires, and nothing else. Structural — no xstate type on the interface;
 * compatible with @xstate/react useSelector and useSyncExternalStore.
 */
export interface BoundaryActorRef<P extends PolicyTable> {
  /** Wire 1 — discrete domain events + telemetry; '*' is the 0050 wildcard tap. */
  on<T extends BoundaryEmitted<P>["type"] | "*">(
    type: T,
    listener: (
      ev: T extends "*" ? BoundaryEmitted<P> : Extract<BoundaryEmitted<P>, { type: T }>,
    ) => void,
  ): Unsubscribe;
  /** Wire 2 — continuous connection presentation, for selector projection. */
  subscribe(listener: (snapshot: BoundarySnapshot) => void): Unsubscribe;
  getSnapshot(): BoundarySnapshot;
}

// ── The handle ───────────────────────────────────────────────────

export interface QuarantineEntry {
  readonly raw: unknown;
  readonly error: BoundaryError;
  readonly endpointOrTopic: string;
  readonly timestamp: number;
}

export type BoundaryFetcher = <TOk>(
  req: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    params?: Record<string, unknown>;
    data?: unknown;
    headers?: HeadersInit;
  },
  opts?: { signal?: AbortSignal },
) => Promise<Validated<TOk>>;

export interface TransportBoundary<P extends PolicyTable> {
  readonly actor: BoundaryActorRef<P>;
  /**
   * Refcounted broker interest (0->1 subscribes, 1->0 unsubscribes). The
   * listener form additionally attaches a typed wire-1 listener; the returned
   * Unsubscribe releases both. Legal before start() (O3).
   */
  subscribe<K extends InboundChannel<P>>(
    channel: K,
    listener?: (e: Extract<BoundaryEmitted<P>, { type: `message.${K}` }>) => void,
  ): Unsubscribe;
  /** Validated, gated MQTT egress. Rejects only BoundaryError. */
  publish<K extends OutboundChannel<P>>(
    channel: K,
    payload: PayloadOf<P, K>,
    params?: TopicParams,
    opts?: { qos?: 0 | 1; retain?: boolean },
  ): Promise<void>;
  /** The single REST ingress; what TanStack Query consumes as its queryFn. */
  readonly fetcher: BoundaryFetcher;
  /** Read-only bounded quarantine ring. Inspection only; never replay (I13). */
  readonly quarantine: {
    entries(): readonly QuarantineEntry[];
    readonly capacity: number;
  };
  start(): void;
  reconnect(): void;
  dispose(): Promise<void>;
}

// ── Ports (taxonomy-free: adapters deliver raw transport facts) ───

export interface BrokerConnectOptions {
  readonly url: string;
  readonly clientId: string;
  /** A-5: clean sessions, fixed. */
  readonly clean: true;
  /** adapter owns the retry LOOP; module owns give-up POLICY. */
  readonly reconnectPeriodMs: number;
  /** per-attempt connect timeout; the module owns the value, the adapter applies it. */
  readonly connectTimeoutMs: number;
  readonly transformWsUrl?: (url: string) => string;
  readonly username?: string;
  readonly password?: string;
}

export interface BrokerHandlers {
  onMessage(
    topic: string,
    payload: Uint8Array,
    meta: { messageId?: number; dup: boolean; qos: 0 | 1 | 2 },
  ): void;
  /** Raw lifecycle facts; failure INFERENCE from close/offline timing is module logic. */
  onLifecycle(
    e: "connect" | "reconnect" | "close" | "offline" | "error",
    detail?: unknown,
  ): void;
}

export interface BrokerLink {
  subscribe(filter: string, opts: { qos: 0 | 1 }): Promise<void>;
  unsubscribe(filter: string): Promise<void>;
  publish(topic: string, payload: Uint8Array, opts: { qos: 0 | 1; retain?: boolean }): Promise<void>;
  end(): Promise<void>;
}

export interface BrokerPort {
  connect(opts: BrokerConnectOptions, handlers: BrokerHandlers): BrokerLink;
}

export type FetchLike = (
  input: string | URL,
  init: RequestInit & { signal: AbortSignal },
) => Promise<Response>;

/** xstate Clock-compatible by construction — SimulatedClock satisfies it as shipped. */
export interface ClockPort {
  setTimeout(fn: (...args: unknown[]) => void, timeoutMs: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface BoundaryAdapters {
  broker: BrokerPort;
  fetch: FetchLike;
  clock: ClockPort;
}
