# Design — 0060 boundary-wiring (transport-boundary interface)

This document is the judged output of a design-it-twice interface panel, per the vendored codebase-design skill's DESIGN-IT-TWICE.md (at `.claude/skills/codebase-design/`): four sub-agents designed the `transport-boundary` module's interface in parallel under four different design constraints — minimize the interface, maximise flexibility, optimise for the most common caller, and ports & adapters at every cross-seam dependency — and a judge compared them on depth, locality, and seam placement, then composed the chosen interface below, grafting the strongest elements. The panel brief's fixed constraints (see ../../report.md, "Key questions" and "Recommendation") bind every candidate and the chosen design.

## Problem space

The `transport-boundary` module is one deep module fronting two protocols: an MQTT leg (mqtt.js 5.15.2 over WSS, wrapped in an xstate 5.32.5 actor system) and a REST leg (0010's orval mutator with per-status zod validation). Any interface the panel produces must satisfy these constraints, fixed by the accepted 0060 recommendation:

- **Choke point below cache/retry/dedup (D-0006).** Nothing unvalidated is ever cached; a quarantined payload never becomes a TanStack Query cache entry. Validation runs immediately inside each ingress. (This "dedup" is the caller-side TanStack Query *request* dedup, above the seam — distinct from the MQTT protocol-level *redelivery* dedup at the ingress; see O1.)
- **Exactly one ingress per protocol** — one MQTT message handler, one REST fetch function. Coverage lint (oxlint `no-restricted-imports`) bans `mqtt` and the raw generated client outside the package.
- **The two-wire rule.** Discrete domain events leave via a typed `actor.on`/`emit()` surface; continuous connection state leaves via `actor.subscribe` selector projection. Neither wire may leak the other's shape.
- **TanStack Query lives outside the module.** The module supplies the validated, taxonomy-erroring fetch function that becomes the queryFn; nothing inside the module imports TanStack Query.
- **The four-class error taxonomy is owned by `transport-boundary/errors`** (class 1 transient/transport, class 2 contract violation, class 3 application reason-code, class 4 unknown/unroutable), with deduped telemetry observable via a wildcard discrete-event tap and, on the REST leg, a caller-owned QueryCache `onError` tap.
- **Policy table** keyed like AsyncAPI channels, matched with mqtt-pattern at the single MQTT ingress; unknown topics → class 4 + quarantine. **Bounded quarantine ring** for rejected payloads (inspection, never replay). **Reconnect**: bounded retry → give-up → `degraded` with publish gating.

Dependencies, classified per the vendored DEEPENING.md categories:

- **MQTT broker** (reached via mqtt.js) — category 3, remote but owned: port at the seam, production adapter over mqtt.js, in-process test adapter. This is the seam the brief blesses as real.
- **REST origin** (reached via fetch) — category 3, remote but owned: a WHATWG-fetch-shaped port; production adapter is bound global fetch, test adapter is a scripted handler table.
- **Time/scheduling** — ambient, treated under the category-3 recipe because two adapters already ship: real timers and xstate's `SimulatedClock`.
- **xstate 5.32.5, mqtt-pattern 2.1.1, 0010's compiled Ajv validators and orval client + per-status zod** — all category 1, in-process: pure computation merged into the implementation, no adapters, no seams.
- **TanStack Query 5.101.4** — not a dependency: it sits above the seam and consumes the module's fetch function.

Illustrative sketch (constraint-grounding only, not the proposal):

```ts
const boundary = createTransportBoundary({ mqtt: { url }, policy, rest: { baseUrl } });
boundary.actor.on('message.plant/{plantId}/telemetry', (e) => store.apply(e.params.plantId, e.payload)); // wire 1
boundary.actor.subscribe((s) => connStore.setState(project(s)));                                          // wire 2
useQuery({ queryKey, queryFn: ({ signal }) => boundary.fetcher({ url, method: 'GET' }, { signal }) });    // REST, above the seam
```

## Candidates considered

### minimal (1–3 entry points, maximum leverage per entry point)

Three entry points: root factory, `/errors`, `/mutator`. The handle is four members, and the MQTT surface is a *raw xstate `ActorRef`* — commands (`subscribe`/`unsubscribe`/`publish`/`reconnect`) go through `actor.send`, both wires through `actor.on`/`actor.subscribe`.

```ts
createTransportBoundary<const P extends PolicyTable>(config: BoundaryConfig<P>): TransportBoundary<P>;
interface TransportBoundary<P> {
  readonly actor: ActorRef<BoundarySnapshot, BoundaryCommand<P>, BoundaryEmitted<P>>; // resold xstate surface
  readonly fetcher: BoundaryFetcher;      // the queryFn; rejects BoundaryError only
  quarantine(): readonly QuarantineEntry[];
  dispose(): Promise<void>;
}
// config: { mqtt: {url, auth?, reconnect?, bounds?}, policy: P, rest, adapters?: {broker?, fetch?}, inspect? }
// '/errors': BoundaryError union + five guards + retryOnlyTransient — normalizers NOT exported
// '/mutator': boundaryMutator const bound to the single live handle (invariant: one live handle, or throw)
```

**Strongest point:** the policy table as one declaration with sevenfold payoff, and the refusal to export `fromZodError`/`fromAjvErrors` — no code outside the package can construct taxonomy values, giving the permanent two-shape normalisation problem total locality. **Weakest point:** the raw `ActorRef` makes the whole of xstate's actor surface part of the interface (a wide interface disguised as one property, and maximum blast radius for the xstate-v6 / 0070-fallback risk), and `/mutator` is a module-level singleton slot — disguised global state that fails the deletion test in isolation.

### flexible (many use cases, many extension points)

Four entry points (root, `/errors`, `/rest`, `/testing`). Verbs on the handle instead of a command channel; a *structural* narrowed actor ref; a wide declarative policy row; pure construction + `start()`.

```ts
interface TransportBoundary<C extends ChannelMap> {
  readonly actor: BoundaryActorRef<C>;               // on / subscribe / getSnapshot only — no send
  select<T>(sel, onChange, isEqual?): Unsubscribe;    // wire-2 sugar
  subscribeChannel<K>(channel: K, listener?): Unsubscribe;  // refcounted interest + typed listener
  publish<K>(channel: K, params, payload, opts?): Promise<PublishOutcome>; // outcomes as values
  onTelemetry(listener): Unsubscribe;
  readonly quarantine: QuarantineView;
  start(): void; untilConnected(signal?): Promise<void>; stop(): Promise<void>;
}
// ChannelSpec rows carry: filter, validate, direction, qos, interest, decode?, onFailure?, sample?, dedupeKey?, validateOut?
// broker injected as a constructed BrokerConnector (mqttBrokerConnector | memoryBrokerConnector)
```

**Strongest point:** the narrowed structural `BoundaryActorRef` — it satisfies the two-wire rule with three methods, works with `useSelector`/`useSyncExternalStore`, withholds `send`, and localizes the xstate v6 migration to one internal file. Flexibility lands as *data* (policy-row fields), never as knobs over the invariants. **Weakest point:** configuration breadth is interface — per-row `decode`/`onFailure`/`dedupeKey` hooks and the eager-vs-refcounted interest duality are surface a caller may have to learn, most of it speculative at the assumed rates.

### common-caller (default case trivial; advanced cases may cost more)

A facade sized by call-site frequency: `messages` / `publish` / `connection` / `onTelemetry` plus a raw-`actor` escape hatch; `broker: string | BrokerAdapter` shorthand; a preconfigured QueryClient factory.

```ts
interface TransportBoundary<C> {
  messages<K>(channel: K, handler): Unsubscribe;   // refcount + validate + dedup + typed payload
  publish<K>(channel: K, payload, params?): Promise<void>;
  connection: { readonly current: ConnectionState; subscribe(l): Unsubscribe };
  onTelemetry(l): Unsubscribe;
  dispose(): Promise<void>;
  readonly actor: ActorRef<…>;                     // the advanced 10%
  readonly quarantine: { size; list() };
}
// 'transport-boundary/rest': boundaryFetch + createBoundaryQueryClient() + retryClass1Only + queryCacheErrorTap
// REST test seam: MSW stand-in (category 2) — deliberately no fetch port
```

**Strongest point:** the frequency-ordered surface — the REST feature caller imports nothing (generated hooks sit on the mutator), and `messages()` is the best one-call MQTT ergonomics of the four. **Weakest point:** `createBoundaryQueryClient()` constructs and returns a `QueryClient`, which requires the package to import TanStack Query — a violation of the fixed constraint that TanStack Query lives outside the module and nothing inside it imports TanStack Query. That point of the comparison is forfeit. The raw-`ActorRef` escape hatch shares minimal's coupling weakness.

### ports-adapters (a port at every cross-seam dependency)

Three ports — `BrokerPort`, `HttpPort` (fetch-shaped), `ClockPort` (xstate `Clock`-compatible) — each with a shipped production and test adapter, injected as an optional second argument with production defaults. Narrowed actor ref; `lease()` for refcounted interest; `rest.request` as the mutator target; adapters are taxonomy-free so classification happens above the ports.

```ts
createTransportBoundary<T extends ChannelMap>(config: BoundaryConfig<T>, ports?: Partial<BoundaryPorts>): TransportBoundary<T>;
interface BoundaryPorts { broker: BrokerPort; http: HttpPort; clock: ClockPort }
interface TransportBoundary<T> {
  readonly actor: BoundaryActorRef<T>;             // on / subscribe / getSnapshot
  lease<K>(channel: K): ChannelLease;
  publish<K>(channel, payload, params?): Promise<void>;
  readonly rest: { request<TData>(spec, opts?): Promise<TData>; retryPredicate(count, err): boolean };
  readonly quarantine: { entries(); capacity };
  start(): void; stop(): Promise<void>;
}
// discipline: each port ships a contract-test suite run against BOTH of its adapters
```

**Strongest point:** testability as a property of the seams — the memory broker plus `SimulatedClock` make the give-up policy, #909 duplicate windows, and gating walkable in microseconds *through the same interface callers use*, and the dual-adapter contract suites keep the test adapters honest. The caller-owned one-line mutator binding (no package-level singleton) is also the cleanest orval integration of the four. **Weakest point:** the adapters are shallow by design and the port definitions are permanent owned surface; `BrokerPort`'s vocabulary leans on mqtt.js's, a pragmatic leak.

## Comparison

**Depth.** minimal wins the entry-point count but partly by reselling: exposing a raw xstate `ActorRef` means the interface — everything a caller must know — includes xstate's actor surface, its command-queue semantics, and its version churn. That is leverage borrowed, not created. The narrowed structural ref (flexible, ports-adapters) is genuinely deeper: three methods carry both wires, and everything else xstate does becomes implementation. flexible's policy row is the widest single leverage point but pays for it with speculative fields (custom `decode`, per-row `dedupeKey`) that fail the deletion test today. common-caller's `messages()` and the zero-import REST path are the best caller economics in the set — depth measured as behaviour per unit of interface *learned* peaks there — but its QueryClient factory buys that convenience by breaking a fixed constraint. ports-adapters' depth is real but its six shipped adapters are individually shallow; their value is the roles they fill, and the contract-suite obligation is a permanent cost.

**Locality.** minimal's unexported normalizers give the two-shape problem (0010 risk 3) the tightest containment of the four — no external construction of taxonomy values, ever. The narrowed actor ref (flexible, ports-adapters) concentrates the xstate v6-alpha exposure and the 0070 RxJS-fallback blast radius into one internal file and two interface methods; minimal and common-caller instead spread that risk across every `actor` consumer. ports-adapters concentrates all mqtt.js quirks in one adapter file. minimal's `/mutator` singleton is the one locality failure among otherwise strong candidates: a hidden global slot whose lifecycle invariant (one live handle) leaks into test design. ports-adapters' caller-owned binding moves that fact into app code where it visibly belongs.

**Seam placement.** All four agree the broker seam is real (mqtt.js adapter vs in-process adapter — the seam the brief names). Three of four give the REST origin a fetch-shaped port with two adapters; common-caller instead uses an MSW stand-in (category 2, internal seam) — defensible, but it makes the REST leg's failure paths (malformed bodies, undeclared statuses) harder to script through the interface than a handler-table adapter does. ports-adapters alone surfaces the clock, and its justification survives the two-adapter test without inventing anything: `SimulatedClock` ships in the incumbent dependency, so the second adapter exists before the seam does. Without it, every reconnect/give-up test is wall-clock-bound — the costliest tests in the suite. All four correctly refuse the hypothetical seams (validator port, quarantine-store port, telemetry port, topic-matcher port): one adapter each, so no port.

**Verdict.** minimal is the strongest base — its entry-point economy, config shape, policy-table typing, invariants, and taxonomy locality are the best-reasoned in the set — but two of its choices (raw `ActorRef`, `/mutator` singleton) are its own weakest points and both have clean replacements in the other candidates. The chosen design is minimal's skeleton with the narrowed actor ref and verb pair grafted from flexible/ports-adapters, the caller-owned mutator binding and the clock adapter pair grafted from ports-adapters, and common-caller's combined refcount-plus-listener subscription ergonomics.

## Chosen interface

Three entry points: `transport-boundary` (factory, handle, ports, production adapters), `transport-boundary/errors` (taxonomy owner), `transport-boundary/testing` (test adapters; never in the production bundle). The orval mutator target is a one-line caller-owned file, not a package entry point.

```ts
// ═════════════════════════════════════════════════════════════════
// Entry point 1 — `transport-boundary`
// ═════════════════════════════════════════════════════════════════

import type { BoundaryError, TelemetryEvent } from 'transport-boundary/errors';

/**
 * Pure construction: no I/O, no timers, no connection until start().
 * Omitted adapters default to production (mqttJsBrokerAdapter, bound
 * globalThis.fetch, systemClock) — everyday callers never see the ports.
 */
export function createTransportBoundary<const P extends PolicyTable>(
  config: BoundaryConfig<P>,
  adapters?: Partial<BoundaryAdapters>,
): TransportBoundary<P>;

/** The three real seams. Each port has exactly two shipped adapters. */
export interface BoundaryAdapters {
  broker: BrokerPort;   // mqttJsBrokerAdapter (prod) | memoryBrokerAdapter (test)
  fetch: FetchLike;     // bound globalThis.fetch (prod) | scriptedFetchAdapter (test)
  clock: ClockPort;     // systemClock (prod) | xstate SimulatedClock (test)
}

// ── Configuration ────────────────────────────────────────────────

export interface BoundaryConfig<P extends PolicyTable> {
  mqtt: {
    url: string;                          // wss:// (ws:// permitted in dev)
    auth?: {                              // deliberate narrow strip of mqtt.js options
      username?: string; password?: string; clientId?: string;
      transformWsUrl?: (url: string) => string;   // WSS token refresh, delegated
    };
    reconnect?: {
      periodMs?: number;                  // default 1000 (mqtt.js reconnectPeriod)
      maxAttempts?: number;               // default 10; exhausted → 'degraded'
      backoffMs?: (attempt: number) => number;    // default exp, cap 30s
    };
    bounds?: {                            // mqtt.js has no size bounds; these are ours
      delivery?: number;                  // inbound delivery queue, default 256
      publish?: number;                   // outbound queue while reconnecting, default 64
      quarantine?: number;                // ring size, default 100
    };
  };
  /** THE leverage point: one table types routing, validation, events, and publish. */
  policy: P;
  rest: { baseUrl: string; timeoutMs?: number; headers?: HeadersInit };
  telemetry?: { dedupeWindowMs?: number };        // default 60_000
  /** Dev only: xstate inspection pass-through — every event crossing the seam,
   *  quarantine-bound rejects included. */
  inspect?: (event: unknown) => void;
}

/** Keyed like AsyncAPI channels; matched at the single MQTT ingress with mqtt-pattern. */
export type PolicyTable = Record<string /* e.g. 'plant/{plantId}/telemetry' */, ChannelPolicy<any>>;

export interface ChannelPolicy<T> {
  validate: CompiledValidator<T>;         // 0010's compiled Ajv standalone validator, injected not created
  direction?: 'in' | 'out' | 'inout';     // default 'in'; publish is typed away on 'in' rows
  qos?: 0 | 1;                            // default 0
  sample?: number;                        // 0–1 validation sampling knob; default 1 (validate-always)
  /**
   * Marks this a contracted error/status channel (KQ3: "a contracted
   * error/status topic payload that validates on MQTT"). Runs only after
   * `validate` succeeds — the choke-point order is unchanged, so an invalid
   * payload on a reason-code channel is still class 2, quarantined, exactly
   * as usual, and `select` never runs. On a successful validation, `select`
   * extracts the reason code (and optional detail) from the validated
   * payload; the boundary constructs a class-3 `ReasonCodeError`
   * (`status: null` on this leg, `body` the selector's result) and emits it
   * on the deduped telemetry wire. The channel's typed `message.*` event
   * still fires on the discrete wire regardless — callers may consume
   * either, or both. See Error modes.
   */
  reasonCode?: { select: (payload: Validated<T>) => { code: string | number; detail?: unknown } };
}

export interface CompiledValidator<T> {
  (data: unknown): data is T;
  errors?: readonly unknown[] | null;     // Ajv standalone error slot
}

type PayloadOf<P, K extends keyof P> = P[K] extends ChannelPolicy<infer T> ? T : never;
export type InboundChannel<P extends PolicyTable> =
  { [K in keyof P & string]: P[K]['direction'] extends 'out' ? never : K }[keyof P & string];
export type OutboundChannel<P extends PolicyTable> =
  { [K in keyof P & string]: P[K]['direction'] extends 'out' | 'inout' ? K : never }[keyof P & string];
export type TopicParams = Readonly<Record<string, string>>;
export type Unsubscribe = () => void;

// ── The handle ───────────────────────────────────────────────────

export interface TransportBoundary<P extends PolicyTable> {
  /** Both wires, and nothing else. Structural — no xstate type on the interface;
   *  compatible with @xstate/react useSelector and useSyncExternalStore. */
  readonly actor: BoundaryActorRef<P>;

  /**
   * Refcounted broker interest (0→1 subscribes the channel's filter; 1→0
   * unsubscribes). The listener form additionally attaches a typed wire-1
   * listener; the returned Unsubscribe releases both. Legal before start() —
   * interest is applied at connect and resubscribed across reconnects.
   */
  subscribe<K extends InboundChannel<P>>(
    channel: K,
    listener?: (e: Extract<BoundaryEmitted<P>, { type: `message.${K}` }>) => void,
  ): Unsubscribe;

  /**
   * Validated, gated MQTT egress. Topic built from the channel key + params
   * (mqtt-pattern fill). Resolves on adapter acceptance (QoS 1: on ack).
   * Rejects only BoundaryError — see error modes.
   */
  publish<K extends OutboundChannel<P>>(
    channel: K,
    payload: PayloadOf<P, K>,
    params?: TopicParams,
    opts?: { qos?: 0 | 1; retain?: boolean },
  ): Promise<void>;

  /**
   * The single REST ingress (0010's orval-mutator behaviour, instance-bound):
   * what TanStack Query consumes as its queryFn. Resolves only validated,
   * branded payloads; rejects only BoundaryError. Performs no caching, retry,
   * or dedup — those belong to the caller's TanStack layer above this seam.
   */
  readonly fetcher: BoundaryFetcher;

  /** Read-only bounded quarantine ring. Inspection only; never replay. */
  readonly quarantine: { entries(): readonly QuarantineEntry[]; readonly capacity: number };

  start(): void;                // idempotent; begins connecting, applies declared interest
  reconnect(): void;            // re-arms bounded retry from 'degraded'; no-op otherwise
  dispose(): Promise<void>;     // idempotent teardown: stop actors → cleanups → end broker link
}

// ── The two wires (narrowed, structural actor ref) ───────────────

export interface BoundaryActorRef<P extends PolicyTable> {
  /** Wire 1 — discrete domain events + telemetry; '*' is the 0050 wildcard tap.
   *  Connection state NEVER appears here. */
  on<T extends BoundaryEmitted<P>['type'] | '*'>(
    type: T,
    listener: (ev: T extends '*' ? BoundaryEmitted<P>
                    : Extract<BoundaryEmitted<P>, { type: T }>) => void,
  ): Unsubscribe;
  /** Wire 2 — continuous connection presentation, for selector projection
   *  (store.setState(project(snapshot)); React via useSelector).
   *  Message payloads NEVER appear here. */
  subscribe(listener: (snapshot: BoundarySnapshot) => void): Unsubscribe;
  getSnapshot(): BoundarySnapshot;
}

export type BoundaryEmitted<P extends PolicyTable> = MessageEvent<P> | TelemetryEmission;

export type MessageEvent<P extends PolicyTable> = {
  [K in InboundChannel<P>]: {
    type: `message.${K}`;                 // narrows per channel via actor.on
    channel: K;
    topic: string;                        // concrete matched topic
    params: TopicParams;                  // named wildcards extracted by mqtt-pattern
    payload: Validated<PayloadOf<P, K>>;  // branded at the ingress — the only place brands are applied
  }
}[InboundChannel<P>];

export interface TelemetryEmission { type: 'telemetry'; event: TelemetryEvent }

export interface BoundarySnapshot {
  readonly connection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'ended';
  readonly attempt: number;               // current reconnect attempt; 0 while connected
  readonly publishGated: boolean;         // true in 'degraded' | 'ended'
  readonly subscriptions: readonly string[];  // refcounted concrete topic filters
  readonly depths: { readonly delivery: number; readonly publish: number; readonly quarantine: number };
  readonly degradedSince?: number;
}

declare const ValidatedBrand: unique symbol;
export type Validated<T> = T & { readonly [ValidatedBrand]: true };

// ── The REST fetch function ──────────────────────────────────────

export type BoundaryFetcher = <TOk>(
  req: { url: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
         params?: Record<string, unknown>; data?: unknown; headers?: HeadersInit },
  opts?: { signal?: AbortSignal },        // threaded into fetch — cancellation is real, not a no-op
) => Promise<Validated<TOk>>;

export interface QuarantineEntry {
  readonly raw: unknown;
  readonly error: BoundaryError;
  readonly endpointOrTopic: string;
  readonly timestamp: number;
}

// ── Ports (taxonomy-free: adapters deliver raw transport facts;
//    classification happens above the ports, so both adapters of a
//    port exercise identical normalization code) ──────────────────

export interface BrokerPort {
  connect(opts: BrokerConnectOptions, handlers: BrokerHandlers): BrokerLink;
}
export interface BrokerConnectOptions {
  readonly url: string;
  readonly clientId: string;
  readonly clean: true;                   // A-5: clean sessions, fixed
  readonly reconnectPeriodMs: number;     // adapter owns the retry LOOP; module owns give-up POLICY
  readonly transformWsUrl?: (url: string) => string;
  readonly username?: string; readonly password?: string;
}
export interface BrokerHandlers {
  onMessage(topic: string, payload: Uint8Array, meta: { messageId?: number; dup: boolean; qos: 0 | 1 | 2 }): void;
  /** Raw lifecycle facts; connection-failure INFERENCE from close/offline timing
   *  (browsers hide many WebSocket errors) is module logic above the port. */
  onLifecycle(e: 'connect' | 'reconnect' | 'close' | 'offline' | 'error', detail?: unknown): void;
}
export interface BrokerLink {
  subscribe(filter: string, opts: { qos: 0 | 1 }): Promise<void>;
  unsubscribe(filter: string): Promise<void>;
  publish(topic: string, payload: Uint8Array, opts: { qos: 0 | 1; retain?: boolean }): Promise<void>;
  end(): Promise<void>;
}

export type FetchLike = (input: string | URL, init: RequestInit & { signal: AbortSignal }) => Promise<Response>;

/** xstate Clock-compatible by construction — SimulatedClock satisfies it as shipped. */
export interface ClockPort {
  setTimeout(fn: (...args: unknown[]) => void, timeoutMs: number): unknown;
  clearTimeout(id: unknown): void;
}

/** Production adapters (also the defaults). */
export function mqttJsBrokerAdapter(): BrokerPort;   // mqtt.js 5.15.2 over WSS, entirely contained
export const globalFetchAdapter: FetchLike;          // bound globalThis.fetch
export const systemClock: ClockPort;
```

```ts
// ═════════════════════════════════════════════════════════════════
// Entry point 2 — `transport-boundary/errors` (taxonomy owner)
// Imports no transport code; 0050 and 0070 depend on it freely.
// ═════════════════════════════════════════════════════════════════

interface ErrorBase {
  readonly leg: 'mqtt' | 'rest';
  readonly endpointOrTopic: string;
  readonly timestamp: number;
  readonly raw: unknown;    // original evidence (ZodError, Ajv errors, TypeError, raw packet) — inspectable, never rethrown
}

export interface TransportError extends ErrorBase {          // class 1 — transient/transport (the only retryable class)
  readonly class: 1;
  readonly reason: 'network' | 'timeout' | 'aborted' | 'connection-lost'
                 | 'publish-gated' | 'queue-overflow' | 'disposed';
}
export interface ContractViolation extends ErrorBase {       // class 2 — contract violation
  readonly class: 2;
  readonly schemaPath: string;
  readonly issues: readonly { path: string; message: string }[];  // one shape over Zod and Ajv detail
}
export interface ReasonCodeError<TBody = unknown> extends ErrorBase {  // class 3 — a DECLARED body that PARSED
  readonly class: 3;
  readonly status: number | null;         // null on the MQTT leg
  readonly body: TBody;
}
export interface UnroutableError extends ErrorBase {         // class 4 — unknown/unroutable
  readonly class: 4;
  readonly cause: 'unknown-topic' | 'undeclared-status' | 'unknown-content-type' | 'undecodable';
}

export type BoundaryError =
  | TransportError | ContractViolation | ReasonCodeError | UnroutableError;

// Guards — the zodios isErrorFromPath idiom:
export function isBoundaryError(e: unknown): e is BoundaryError;
export function isTransient(e: unknown): e is TransportError;
export function isContractViolation(e: unknown, at?: string): e is ContractViolation;
export function isReasonCode<TBody = unknown>(e: unknown, endpointOrTopic?: string, status?: number): e is ReasonCodeError<TBody>;
export function isUnroutable(e: unknown): e is UnroutableError;

/** Deduped telemetry envelope — the one 0050 shape, emitted by both taps. */
export interface TelemetryEvent {
  readonly error: BoundaryError;
  readonly dedupKey: string;      // endpointOrTopic + schemaPath (0010's rule)
  readonly count: number;         // occurrences folded within the dedupe window (≥ 1)
  readonly firstSeen: number;
  readonly lastSeen: number;
}

/**
 * TanStack-ready retry predicate: true only for class 1 (never 'aborted'), at
 * most 3 attempts. Structurally typed — no TanStack import; drop into
 * `defaultOptions.queries.retry`.
 */
export function retryOnlyTransient(failureCount: number, error: unknown): boolean;

// DELIBERATELY NOT EXPORTED from the package: fromZodError / fromAjvErrors.
// They live in this module (both ingresses import them; the module imports from
// neither ingress) but are an internal seam: no code outside the package may
// construct taxonomy values, so the permanent two-shape normalisation problem
// (0010 risk 3) has total locality inside the package.
```

```ts
// ═════════════════════════════════════════════════════════════════
// Entry point 3 — `transport-boundary/testing` (never in prod bundle)
// The second adapter at each real seam, plus scripting grips.
// Grips are adapter substance, deliberately NOT part of the ports.
// ═════════════════════════════════════════════════════════════════

export function memoryBrokerAdapter(): MemoryBroker;
export interface MemoryBroker extends BrokerPort {
  deliver(topic: string, payload: Uint8Array | string,
          meta?: { messageId?: number; dup?: boolean }): void;
  dropConnection(): void;                 // emits close/offline; the machine reacts (the #909 window)
  restoreConnection(): void;
  duplicateNext(times?: number): void;    // QoS-1 duplicate injection
  refuseReconnects(): void;               // drives bounded retry → give-up → 'degraded'
  readonly published: readonly { topic: string; payload: Uint8Array; qos: 0 | 1 }[];
  readonly subscriptions: readonly string[];   // asserts refcount behaviour
}

/** Handler-table REST adapter; must honor abort (contract-tested against the prod adapter). */
export function scriptedFetchAdapter(
  routes: readonly { method: string; url: string | RegExp; status: number;
                     body?: unknown; contentType?: string; delayMs?: number }[],
): FetchLike;

// Clock: xstate's SimulatedClock satisfies ClockPort as shipped — adopted, not invented.
//   import { SimulatedClock } from 'xstate';
//   createTransportBoundary(config, { broker, fetch, clock: simulatedClock });

// Discipline: each port ships one contract-test suite run against BOTH of its
// adapters. The suite is the port's executable specification; the spike's
// real-broker items (#909 replay, #1935 pump behaviour, reconnect edges) are
// the mqttJsBrokerAdapter half of the broker suite.
```

```ts
// ═════════════════════════════════════════════════════════════════
// Caller-owned orval binding — app code, not a package entry point.
// orval's override.mutator points at this one-line file; oxlint bans
// importing it outside generated code.
// ═════════════════════════════════════════════════════════════════
// app/api/mutator.ts
import { boundary } from '../transport';
export const customInstance = <T>(req: Parameters<BoundaryFetcher>[0],
                                  opts?: { signal?: AbortSignal }) =>
  boundary.fetcher<T>(req, opts);
```

### Invariants

- **I1 — choke point (D-0006).** Nothing unvalidated crosses the interface. `message.*` payloads have passed their channel's compiled Ajv validator before emission; `fetcher` resolutions have passed their per-status zod schema. Everything delivered is `Validated<T>`-branded, and the ingress is the only place brands are applied.
- **I2 — class-3 MQTT construction (`reasonCode` channels).** A `ReasonCodeError` is constructed on the MQTT leg only after its channel's `validate` succeeds — an invalid payload on a `reasonCode` channel is class 2, exactly like any other channel, and `select` never runs. Construction is additive, never substitutive: it emits on the deduped telemetry wire without suppressing the channel's `message.*` event on the discrete wire — the two-wire rule holds, and callers may consume either or both.
- **I3 — quarantine ≠ cache.** A rejected payload goes to the ring plus a deduped telemetry event and never appears on either wire nor as a `fetcher` resolution — so it can never become a TanStack Query cache entry (rejections are thrown, never returned).
- **I4 — two wires, never crossed.** Connection state never appears in `BoundaryEmitted`; message payloads never appear in `BoundarySnapshot`. The types make crossing a compile error.
- **I5 — one ingress per protocol.** Exactly one broker `onMessage` registration per instance; all REST crosses `fetcher`. oxlint `no-restricted-imports` bans `mqtt` and the raw generated client outside the package directory.
- **I6 — below-the-seam purity.** The package never imports TanStack Query, not even type-only; `fetcher` never caches, retries, or dedups.
- **I7 — symmetric choke point.** Outbound `publish` payloads validate against the same channel validator; a failing payload rejects class 2 before any network activity (compile-time typing via `PayloadOf` makes this a runtime backstop).
- **I8 — ports are taxonomy-free.** Adapters deliver raw transport facts and never construct or receive `BoundaryError` values; classification lives above the ports.
- **I9 — bounded everything.** Delivery, publish, and quarantine stores are count-bounded (the bounds mqtt.js does not have are owned here); overflow sheds oldest and emits a class-1 `queue-overflow` telemetry event; depths are observable on wire 2. mqtt.js's own unbounded queues are kept empty by gating above the adapter.
- **I10 — lifecycle.** Construction is pure (no I/O, no timers). `start()` and `dispose()` are idempotent. After `dispose()`: snapshot is `ended`, wire silence, `publish`/`fetcher` reject class-1 `disposed`.
- **I11 — every content type defined** (the ts-rest #789 lesson). An unparseable or unmapped body on either leg is class 4 (`undecodable` / `unknown-content-type`) + quarantine — never a silent validation skip.
- **I12 — handler isolation.** A throwing wire-1 listener never skips sibling listeners and never re-enters the broker callback (the mitt hazard, designed out by the actor mailbox).
- **I13 — no replay.** The quarantine ring is inspection only; a permanent schema mismatch stays broken.

### Ordering constraints

- **O1 — ingress pipeline order (fixed).** Inbound MQTT: redelivery dedup (messageId + topic — MQTT protocol-level, pre-validation; distinct from the caller-side TanStack Query *request* dedup that "below cache/retry/dedup" (Problem space, D-0006) refers to) → policy-table match (mqtt-pattern, pre-parsed rows) → validate (compiled Ajv, synchronous) → bounded enqueue → emit. Redelivery dedup precedes validation so a protocol-legal duplicate can produce neither a second emission nor a second quarantine entry. On a `reasonCode` channel, a successful validate additionally constructs the class-3 `ReasonCodeError` at this same emit step, onto the telemetry wire, alongside — not instead of — the `message.*` emission (see Error modes). Dispatch to listeners happens off the packet pump (bounded delivery queue + microtask), so slow consumers never starve keepalive (#1935); they surface as `depths.delivery` growth, then shedding.
- **O2 — per-topic FIFO.** Wire-1 events for a given topic preserve post-dedup broker arrival order. No ordering is guaranteed across channels or across wires.
- **O3 — interest before connect.** `subscribe()` calls made before `start()` (or while reconnecting) are applied at connect and resubscribed across reconnects; refcounts are exact — N subscribes need N releases before the broker-level unsubscribe.
- **O4 — reconnect policy.** Bounded attempts (`maxAttempts` × backoff, timed on the ClockPort) → `degraded`; only an explicit `reconnect()` re-arms. While `reconnecting`, publishes queue (bounded); in `degraded`/`ended` they reject immediately class-1 `publish-gated` — gating is observable, never silent.
- **O5 — telemetry.** Quarantine push happens-before its telemetry emission; repeats fold by `dedupKey` within the window into `count`. Telemetry events carry no ordering guarantee relative to `message.*` events.
- **O6 — wire-2 consistency.** Snapshot notifications fire on state/depth change only (coalescing allowed); `getSnapshot()` is always consistent with the last notification. `dispose()` resolution guarantees the broker link is closed and no further events fire; it does not abort caller-owned REST requests — their AbortSignals belong to the TanStack layer above the seam.

### Error modes

- **`fetcher`** rejects only `BoundaryError`: class 1 (network / timeout / abort), class 2 (any body — 2xx included — failing its declared schema), class 3 (a declared non-2xx body that *parses* against its per-status schema; thrown so TanStack treats it as an error and never retries it), class 4 (undeclared status, unknown content type). Never a raw `ZodError`, Ajv array, or `TypeError`.
- **`publish`** rejects only `BoundaryError`: class 1 (`publish-gated`, `queue-overflow`, `connection-lost`, `disposed`) or class 2 (egress validation). It throws a plain `Error` synchronously only on programmer error (unknown channel, `direction: 'in'` row).
- **The MQTT wire never throws into callers.** Class 2 (Ajv failure) and class 4 (unknown topic / undecodable) become quarantine + telemetry, never `message.*` events; class 1 conditions surface as wire-2 state transitions plus telemetry, with connection failure *inferred* from close/offline timing because browsers hide many WebSocket errors. Reason-code channels are the one case where class 3 is also constructed on this leg — see below.
- **Class 3 on the MQTT leg (`reasonCode` channels).** A channel whose policy row carries `reasonCode` still validates first — the choke-point order is unchanged, so an invalid payload on that channel is class 2 as usual, quarantined, and `reasonCode.select` never runs. On a successful validation, the boundary calls `select` on the validated payload and constructs a `ReasonCodeError` (`status: null` on this leg, `body` the selector's `{code, detail?}`), then emits it on the deduped telemetry wire — the same `actor.on('*', …)` tap classes 1/2/4 use — never thrown, consistent with "the MQTT wire never throws into callers" above. This is additive, not substitutive: the channel's typed `message.*` event still fires on the discrete wire with the full `Validated<T>` payload, so the two-wire rule holds and callers may consume the message, the telemetry-side `ReasonCodeError`, or both.
- **Factory** throws a plain `Error` synchronously on invalid configuration (bad URL scheme, empty policy table, malformed channel key, non-positive bounds). Programmer errors sit outside the four-class taxonomy, which describes runtime traffic only.

### Performance notes

- The policy table is compiled once at construction (mqtt-pattern filters pre-parsed). Per-message cost: linear filter scan (tens of rows, A-11) + compiled Ajv (microseconds, per 0010) + one assign + one emit — immaterial at the assumed ≤1k msg/s (A-4); `sample` is the escape knob if the spike's rate measurement says otherwise.
- `getSnapshot()` is O(1) amortised on a cache, but each invalidation rebuilds the snapshot in O(subscriptions log subscriptions) — the refcounted filter list is mapped and sorted — and every ingress step (enqueue, dispatch, quarantine push) invalidates it, so a live wire-2 subscriber sees two notifications per message. Measured in the 0060 spike: ~57k–60k msg/s with a subscriber attached versus ~44k–61k without, i.e. no material cost at the assumed rates, but the projection is not free and consumers must select narrowly (measured under full-suite worker contention; isolated runs are ~5× faster — see findings.md). Wire 2 is designed for selector projection, so consumers re-render only when the selected value changes.
- `fetcher` adds exactly one zod parse per response below the seam; cache/dedup/refetch costs live above it in TanStack Query.
- Port indirection costs one call frame per I/O operation and zero per-message allocation. No new runtime framework: xstate and mqtt.js are incumbents (~0 marginal bundle); mqtt-pattern is ~100 lines (adopt-or-vendor, a spike item).

### Usage sketch

```ts
// app/transport.ts — composition root
export const boundary = createTransportBoundary({
  mqtt: { url: 'wss://broker.example/mqtt', reconnect: { maxAttempts: 8 } },
  policy: {
    'plant/{plantId}/telemetry':   { validate: validatePlantTelemetry, qos: 1 },
    'plant/{plantId}/command':     { validate: validatePlantCommand, direction: 'out', qos: 1 },
  },
  rest: { baseUrl: 'https://api.example' },
  inspect: import.meta.env.DEV ? devInspector : undefined,
});
boundary.start();

// Wire 1 → Zustand (refcounted interest + typed listener, one call):
const off = boundary.subscribe('plant/{plantId}/telemetry', (e) =>
  usePlantStore.getState().applyTelemetry(e.params.plantId, e.payload));

// Wire 2 → Zustand, selector projection:
boundary.actor.subscribe((s) => useConnStore.setState({ connection: s.connection, gated: s.publishGated }));

// 0050 telemetry tap — one line, both legs' MQTT-side events, deduped:
boundary.actor.on('*', (ev) => { if (ev.type === 'telemetry') telemetrySink.record(ev.event); });

// TanStack Query — outside the seam, caller-owned:
declare module '@tanstack/react-query' { interface Register { defaultError: BoundaryError } }
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryOnlyTransient } },
  queryCache: new QueryCache({ onError: (e, q) => { if (isBoundaryError(e)) telemetrySink.recordQuery(e, q.queryKey); } }),
});
// Generated hooks call boundary.fetcher via the caller-owned mutator; signal threads through (spike go/no-go).

// Tests — same interface, adapters injected:
const broker = memoryBrokerAdapter();
const clock = new SimulatedClock();
const b = createTransportBoundary(config, { broker, clock, fetch: scriptedFetchAdapter(routes) });
b.start();
broker.dropConnection(); broker.refuseReconnects(); clock.increment(8 * 30_000);
expect(b.actor.getSnapshot().connection).toBe('degraded');
```

## Rationale

**Why minimal as the base.** Its entry-point economy is real depth, not parsimony for its own sake: one factory whose policy table is a single declaration with sevenfold payoff (typed event, typed publish, routing, ingress validation, class-4 fencing, quarantine wiring, telemetry), one taxonomy module importable by 0050/0070 without a byte of transport code, and a caller-consumable error surface of about three lines (`retry: retryOnlyTransient`, the `Register` augmentation, a guard at the call site). Its invariant set (choke point, two wires, bounded everything, content-type totality, no replay) was the most complete of the four and is carried nearly verbatim. Its strongest locality move — keeping `fromZodError`/`fromAjvErrors` unexported so no code outside the package can construct taxonomy values — is kept deliberately, resolving the mild tension with the track report's KQ3 (which lists the normalizers among the errors module's exports) in favour of containment: the normalizers still live in `transport-boundary/errors` and both ingresses still import them, exactly as the report specifies; they are simply not re-exported at the package's public seam, which strengthens the report's own "no other module constructs taxonomy values" rule rather than weakening it.

**Grafts taken.**
- **The narrowed structural `BoundaryActorRef`** (from flexible and ports-adapters) replaces minimal's raw xstate `ActorRef`. This is the decisive graft: it satisfies the fixed two-wire rule with three methods, withholds `send` (no raw command channel to misuse), stays compatible with `useSelector`/`useSyncExternalStore`, and shrinks the xstate v6-alpha and 0070-RxJS-fallback blast radius from "the whole first entry point" to two methods and one internal file. Leverage borrowed from an incumbent is still coupling; leverage owned at three methods is depth.
- **Verbs instead of commands** — `subscribe(channel, listener?)` (common-caller's combined refcount-plus-listener ergonomics, flexible's `subscribeChannel` shape) and `publish(channel, payload, params?)`. Typed generics give the same safety as minimal's command union with less caller ceremony, and the command channel disappears from the interface entirely.
- **The caller-owned mutator binding** (from ports-adapters) replaces minimal's `/mutator` entry point and its single-live-handle invariant. The static-import fact orval imposes belongs to the app's composition root — one visible line — not to the package as a hidden global slot. This deletes minimal's only knowingly shallow entry point and its worst locality leak.
- **The clock adapter pair** (from ports-adapters) joins broker and fetch as the third real seam. It passes the two-adapter test without inventing anything — `SimulatedClock` ships in the incumbent dependency — and converts the suite's costliest tests (bounded retry → give-up → `degraded`) into microsecond deterministic ones, through the same interface callers use.
- **Taxonomy-free ports and the dual-adapter contract-suite discipline** (from ports-adapters), so both adapters of every port exercise identical normalization code and the memory broker cannot drift into a fiction.
- **Pure construction + `start()`** (from flexible and ports-adapters) over minimal's connect-on-create, and **the richer `TelemetryEvent`** (`dedupKey`/`count`/`firstSeen`/`lastSeen`) over minimal's count-only shape.
- **`direction` on the policy row** (from flexible) — one cheap field that types publish away from inbound-only channels.

**Rejected, and why.**
- **common-caller's `createBoundaryQueryClient()` and `/rest/register` side-effect import**: constructing a `QueryClient` requires the package to import TanStack Query, violating the fixed constraint that the module supplies the validated fetch function and nothing more. The same convenience is recovered constraint-cleanly by `retryOnlyTransient` (structurally typed, in `/errors`) plus a documented three-line caller recipe.
- **flexible's configuration breadth**: per-row `decode`, `onFailure` hooks, `dedupeKey` overrides, `shouldStore`, `telemetry.keyOf`, and the eager-vs-on-demand interest duality all fail the deletion test today — each is a fact a caller may have to learn, purchased against no present use case. Strict-UTF-8-JSON decode, packet-identity dedup, and refcounted interest are invariants, not knobs; if a second decode or dedup policy ever materialises, it is a policy-row addition, not an interface redesign.
- **flexible's `PublishOutcome` values**: outcomes-as-values add a second error vocabulary beside the taxonomy. One vocabulary (`publish` rejects `BoundaryError`; guards narrow it) keeps the interface smaller and gating remains fully observable via wire 2 and telemetry.
- **the raw-`ActorRef` escape hatch** (minimal, common-caller): the module either owns its interface or it doesn't. The `inspect` config hook already provides the dev-plane visibility the escape hatch mostly existed for.
- **Hypothetical seams, unanimously refused by all four candidates and by this design**: validator port (Ajv/zod are fixed by 0010), quarantine-store port (the IndexedDB escalation would be the second adapter — introduce the port then, not before), telemetry port (the wildcard tap already is the surface), topic-matcher and emitter ports (pure in-process, subsumed). One adapter means a hypothetical seam; two adapters means a real one — this design ships exactly three real seams, each with both adapters named.

---

> **Gate ratification (2026-08-14, D-0018):** `rest.contract` (the declared-status table this
> spike introduced) is ratified into the `rest` config with a **passthrough + drift-warning**
> unknown-field policy — orval's strip default must be configured or post-processed away at
> build time, and undocumented response fields raise a deduped warning naming endpoint and
> fields. Aborted requests raise **no telemetry envelope**: cancellation is an outcome, not a
> taxonomy event (supersedes this spike's per-abort class-1 emission; a boundary stats counter
> carries visibility). Ordering-stamp requirement recorded as D-0019; oxlint override
> restatement is the standing rule per D-0020.
