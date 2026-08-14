# Design — 0070 ingress-and-test-lane (state-concurrency pattern kit)

This document is the output of a design-it-twice interface panel: four sub-agents produced four parallel design variants of the same module cluster — each under a different design constraint (minimize the interface; maximise flexibility; optimise for the common caller; ports & adapters everywhere) — and a judge compared them on depth, locality, and seam placement, then chose and grafted, per the vendored codebase-design skill's DESIGN-IT-TWICE.md. The module cluster under design is the state-concurrency pattern kit accepted by the track report (see ../../report.md): the single-dispatch ingress kit, the Zustand↔xstate composition helpers, the `useOptimisticMutation` wrapper, and the fc.scheduler test lane.

## Problem space

**Constraints any interface must satisfy** (fixed by the panel brief and the accepted report; none was up for redesign):

- **Single-dispatch ingress**: validated messages enter state through one entry point per stream, in the fixed pipeline order dedup → guard → mask → dispatch.
- **Guards** are per-(topic, entity) monotonic, stamp-ready but stamp-absent today (assumption A-1 in the report): without a server-issued stamp the guard runs local epoch/dedup rules, and the interface must accept a stamp when contracts gain one **without reshaping callers**. The Chosen interface below declares `stream`s whose `topic` may be an MQTT wildcard pattern spanning several concrete topics, so this constraint is realized as a `(stream, entity)` guard key that stamped mode honors regardless of concrete topic and unstamped mode narrows to `(stream, concreteTopic, entity)` per wildcarded stream (invariant 4) — the reconciliation between "(topic, entity)" here and "(stream, entity)" there is welcome, since it makes the wildcard/ordering interaction explicit instead of assumed.
- **Entity ownership is partitioned**: REST-backed entities live in the QueryCache; MQTT-only entities live in Zustand/machine state behind the ingress; dual-leg entities use invalidate-don't-set (`staleTime: Infinity` on push-covered queries; the MQTT event invalidates, REST remains the cache's single writer). Copying query data into Zustand is banned.
- **Cancellation**: `AbortController`/`AbortSignal` is the only primitive; every async function takes and forwards a signal; commit points check `signal.aborted`; a boundary-owned signal composes with per-actor signals via `AbortSignal.any()`; machine async work is spawned as child actors.
- **Composition wires**: machine → store is `actor.subscribe` selector projection into `setState`; store → machine is `subscribeWithSelector` `(next, prev)` → `actor.send`. Discrete events ride the 0060 boundary's `actor.on` wire, not these.
- **`useOptimisticMutation`** bundles non-optionally: `cancelQueries` + snapshot + rollback + the `isMutating() === 1` settle gate.
- **Runtime pieces beneath the interfaces**: xstate 5.32.5, zustand 5.0.15; test lane fast-check 4.9.0 (`fc.scheduler` + `fc.schedulerFor`), @fast-check/worker 0.6.0, `xstate/graph`.

**Dependencies and their DEEPENING.md categories**:

| Dependency | Category | Consequence for the interface |
|---|---|---|
| 0060 transport-boundary feed (mqtt.js and the broker sit below 0060's own seam) | 3 — remote but owned | A port at the seam, with a production adapter and a test adapter — the module's one externally declared seam |
| REST leg (own API via 0010's orval mutator) | 3 — remote but owned | Injected functions (queryFns/mutationFns); the kit never fetches. Production adapter: the orval client; test adapter: a scheduler-wrapped in-memory fake |
| xstate 5.32.5 actors, zustand 5.0.15 stores | 1 — in-process | Injected instances, no port — real actors and real vanilla stores run in the test suite; a port here would be a single-adapter hypothetical seam |
| TanStack QueryClient | 1 — in-process (in-memory cache) | Injected instance, no port — tests run a real QueryClient |
| fast-check 4.9.0 | 1 — in-process, test lane only | Injected scheduler; zero production footprint |
| React | 1 — in-process peer | Touched only by the hook adapter over the framework-free optimistic core |

**Illustrative sketch** (grounding, not a proposal): the irreducible per-message work every candidate must hide is roughly

```typescript
// per validated message, in one JS turn:
if (seen.has(msg.packetId)) return drop('duplicate');          // 1. dedup
const key = `${stream}:${entity(msg)}`;
const s = stamp?.(msg);
if (s !== undefined && s <= highWater.get(key)) return drop('stale');  // 2. guard
if (pendingMask.has(key)) return withhold(key, msg);           // 3. mask
dispatchToOwner(msg);                                          // 4. dispatch
```

— plus gap/epoch bookkeeping on reconnect, mask release on mutation settle, wire lifecycle, teardown ordering, and the fc.scheduler shaping of the test feed. The design question is what interface concentrates all of that behind the fewest concepts a caller must learn.

## Candidates considered

### Candidate 1 — minimal (1–3 entry points, maximum leverage per entry point)

```typescript
export type IngressFeed = (deliver: (event: FeedEvent) => void) => () => void; // the seam
export function createStateKit(config: StateKitConfig): StateKit;
export function createRaceHarness(s: fc.Scheduler): RaceHarness;

interface StateKitConfig { feed?, streams?, wires?, queryClient?, signal?, onError?, inspect?, dedupCapacity? }
interface StateKit {
  readonly signal: AbortSignal;
  useOptimisticMutation(opts): UseMutationResult;   // BOUND to the kit's mask registry
  dispose(): void;
}
interface RaceHarness { readonly feed: IngressFeed; push(...); wrap(fn); settle(); }
```

One deep module, two entry points; the optimistic hook hangs off the kit so it shares the pending-write mask registry with the ingress invisibly. Streams declare facts (`topic`, `entity`, optional `stamp`, one `dispatch` target of three shapes); wires are declared in the same config; ten stated invariants carry the pipeline order, guard semantics, mask, settle gate, gap handling, and teardown ordering. **Strongest point**: the bound hook — mask coordination between ingress and optimism happens by construction, with zero caller wiring, something separate entry points cannot provide; depth is the highest of the four. **Weakest point**: wires cannot exist without a kit instance (a transport-free machine↔store pair still constructs a streamless kit), and the optimistic bundle is only exercisable through React's hook surface.

### Candidate 2 — flexible (many use cases, many extension points)

```typescript
export interface IngressFeed { subscribe(onMessage): Unsubscribe; onReconnect(cb): Unsubscribe; }
export interface MonotonicGuard { decide(msg, key): GuardVerdict; resetEpoch(streamId?): void; }
export interface MaskProvider { isMasked(key): boolean; }
export interface DispatchTarget<T> { dispatch(msg, ctx: { authority: 'payload' | 'identity-only' }): void; }
export interface StampOrder { compare(a, b): number; }
export interface Ingress { declareStream(spec): StreamHandle; attach(feed): Unsubscribe; taps; dispose(); }
export function createIngress(opts?): Ingress;
// + composition module, + useOptimisticMutation, + test-lane module
```

Every stage of the fixed pipeline is a pluggable port with shipped adapters (`toActor`/`toStoreAction`/`toSink`, `queryPendingMask`/`explicitMask`, `numericStampOrder`/`lexicalStampOrder`), plus read-only taps and a dormant `stampedWrite`. **Strongest point**: the `authority: 'identity-only'` marker makes invalidate-don't-set unviolable through the extensible target surface, and every extension point is bounded by stated invariants. **Weakest point**: depth is measured against the interface, and this interface is the widest of the four — five port vocabularies to learn before declaring one stream — and the `MonotonicGuard` port ships with a single adapter, which the skill calls a hypothetical seam (the candidate concedes this itself).

### Candidate 3 — common-caller (the default case is trivial)

```typescript
export function createIngress(config: { streams: Record<TopicPattern, StreamSpec>, queryClient?, signal?, ... }): Ingress;
// StreamSpec = QueryStream { entity?, invalidate, family?, stamp?, write? }
//            | StateStream { entity?, dispatch, stamp?, mask? }
export function machineToStore(actor, store, project): Teardown;
export function storeToMachine(store, select, actor, toEvent): Teardown;
export function useOptimisticMutation(opts): OptimisticMutationResult;  // shared hidden registry
export function scheduledFeed(s: fc.Scheduler): ScheduledFeed;
export function scheduledFetch(s, label, impl): queryFn;
```

Streams are keyed by MQTT topic-pattern strings (`'vehicles/+/state'`); the common caller states two facts per stream; `family` gives O(1) reconnect-gap invalidation; compose helpers are standalone with bind-time failure and loop detection; the test lane is two functions. **Strongest point**: the caller-facing declaration vocabulary is the leanest — topic patterns as record keys and a `family` key for gap sweeps are genuinely better defaults than any other candidate's. **Weakest point**: the hook and the ingress coordinate through a hidden module-global pending-writes registry — an invariant coupling two modules that maintainers must simply know, with worse locality than an explicit binding; and standalone wires give up a shared re-entrancy queue with ingress dispatch.

### Candidate 4 — ports-adapters (a port for every cross-seam dependency)

```typescript
export interface SourcePort { subscribe(topics, onMessage): Unsubscribe; onGap(listener): Unsubscribe; }
export interface FetchPort { run<T>(op, signal): Promise<T>; }
export interface SchedulerPort { now(): number; defer(label, task): void; }
export function createIngress(deps: IngressDeps): Ingress;   // attach / mask / stats / dispose
export function createOptimisticMutation(deps, config): { mutate(vars): Promise<Outcome> }; // framework-free
export function useOptimisticMutation(config): ...;          // thin React adapter over the core
export function createRuntimeKit(deps): production adapters bundled;
export function createTestKit(s: fc.Scheduler): TestKit;     // test adapters at all three ports
```

Three ports, each with named production + test adapters; `stats` drop accounting as the property suite's assertion surface; attach-time `DualLegPolicyError` when an epoch-guarded dual-leg stream declares a non-invalidate target. **Strongest point**: the framework-free optimistic core with the React hook as a thin adapter — the full non-optional bundle is exercisable by fc.scheduler properties without React in the loop; also `stats` and mutation outcomes (`confirmed`/`rolledBack`/`cancelled`) as honest observable results. **Weakest point**: the constraint manufactures seams — `FetchPort`'s production adapter is a near-identity pass-through and `SchedulerPort` is at admitted risk of decaying to a single-adapter hypothetical seam; and its drop-don't-queue mask semantics (release = resync by invalidation) has no meaning for MQTT-only entities, which have no REST leg to resync from.

## Comparison

**Depth.** The minimal candidate is the deepest module: two entry points buy the entire fixed pipeline, gap recovery, both wires, signal composition, and one correctly-ordered teardown, and its bound hook makes the Figma-style mask a structural property rather than a wiring task. The common-caller candidate is nearly as deep per stream declaration and leaner at the declaration site, but pays for it with the hidden shared registry. The ports-adapters candidate keeps its ingress deep but spends caller budget on three port types, two of which its own trade-off section flags as thin; the flexible candidate spends the most — five port vocabularies — and is by the skill's own measure the shallowest, since every extension point is interface the caller can meet. Leverage per unit of interface learned ranks: minimal > common-caller > ports-adapters > flexible.

**Locality.** The A-1 → stamped-contract transition is the acid test: in minimal and common-caller it is one optional `stamp` selector (plus, later, one `write` member) per stream — guard internals change in exactly one module. Flexible matches that but adds a guard-port surface whose contract ("any implementation MUST be monotonic") pushes a correctness obligation onto adapter authors — an anti-locality move. The mask is where candidates separate hardest: minimal's kit-bound hook concentrates ingress↔optimism coordination inside one module; common-caller's module-global registry spreads the same knowledge across two modules and every reader's head; ports-adapters makes the caller pass `ingress` into the mutation deps and declare `masks` explicitly — honest but manual. Minimal wins locality decisively.

**Seam placement.** The skill's rule — one adapter means a hypothetical seam, two means a real one — cuts cleanly here. The two real seams every candidate agrees on: the **feed port** (production adapter closing over 0060's `actor.on` surface; test adapter from the fc.scheduler harness) and the **REST-leg function shape** (production adapter: the orval mutator client; test adapter: the scheduler-wrapped fake). Minimal and common-caller ship exactly these two and no more. Flexible ships five seams, one of them (the guard port) single-adapter by its own admission; ports-adapters ships a `SchedulerPort` and a `FetchPort` whose production halves fail the deletion test alone. Extra seams are not free — they are interface, and they dilute depth. Two adapters, two seams, nothing else: minimal and common-caller place seams correctly; the graft question is only which of their surfaces to combine.

## Chosen interface

The chosen design is the **minimal** candidate as the base, with three grafts: a framework-free optimistic core beneath the hook (from ports-adapters), MQTT topic-pattern strings and the `family` gap-sweep key (from common-caller), and read-only drop accounting via `stats` (from ports-adapters). One package, two entry points, two real seams.

```typescript
// ═════════════════════════════════════════════════════════════════════
// @app/state-kit — public interface (complete)
// ═════════════════════════════════════════════════════════════════════
import type { QueryClient, QueryKey, UseMutationResult } from '@tanstack/react-query';
import type * as fc from 'fast-check';

// ── Messages and the feed seam ───────────────────────────────────────

/** Server-issued monotonic ordering token. Extractors parse to a type
 *  totally ordered under `>`. Absent today (A-1); the slot exists NOW so
 *  no caller reshapes when contracts gain the field. */
export type Stamp = number | bigint;

/** A message that already cleared 0010's validators below 0060's seam.
 *  The kit never re-validates. */
export interface ValidatedMessage<P = unknown> {
  readonly topic: string;      // concrete topic, e.g. "orders/42/updated"
  readonly packetId: string;   // dedup identity: messageId + topic (A-8)
  readonly payload: P;         // branded, taxonomy-clean payload
}

export type FeedEvent<P = unknown> =
  | { kind: 'message'; message: ValidatedMessage<P> }
  | { kind: 'gap' };  // reconnect with possible loss — EVERY reconnect under clean:true

/**
 * THE SEAM (dependency category 3 — remote but owned). Port contract:
 *  - deliveries are serialized — a message's pipeline completes before the
 *    next delivery begins; no re-entrant deliver();
 *  - per-topic arrival order is preserved (MQTT §4.6, single connection, A-6);
 *    nothing is promised across topics — that is the guard's job, and for
 *    wildcarded streams in unstamped mode it is the reason the guard key
 *    includes the concrete topic (invariant 4);
 *  - the adapter MUST emit { kind: 'gap' } on any reconnect that may have
 *    lost messages.
 * Two adapters exist from day one — the production closure over 0060's
 * actor.on surface, and harness.feed — so this seam is real.
 * Returns unsubscribe.
 */
export type IngressFeed = (deliver: (event: FeedEvent) => void) => () => void;

// ── Stream declaration ───────────────────────────────────────────────

export type DispatchTarget<P> =
  /** MQTT-only entity owned by a machine: kit calls actor.send(event(msg)).
   *  An event with no enabled transition is a free no-op (double-submit
   *  posture inherited from the chart). */
  | { machine: { send(e: object): void }; event: (msg: ValidatedMessage<P>) => object }
  /** MQTT-only entity owned by a Zustand slice: the slice's EXPORTED action.
   *  The kit is that action's only transport-side caller (single writer,
   *  backed by oxlint no-restricted-imports, D-0002). Must be synchronous. */
  | { store: (msg: ValidatedMessage<P>) => void }
  /** Dual-leg entity: invalidate-don't-set today. `write` is honored ONLY
   *  for messages whose stamp passed the guard, always preceded by
   *  cancelQueries — the stamped fast path lands by ADDING this member,
   *  reshaping no caller. `family` is the prefix bulk-invalidated on gap;
   *  when absent the kit falls back to replaying every QueryKey it has
   *  seen from `query(msg)` this session. */
  | {
      query: (msg: ValidatedMessage<P>) => QueryKey;
      family?: QueryKey;
      write?: (msg: ValidatedMessage<P>) => (current: unknown) => unknown;
    };

export interface StreamDecl<P = unknown> {
  /** String form supports MQTT wildcards ('orders/+/updated', 'rig/#');
   *  predicate form for anything richer. */
  topic: string | ((topic: string) => boolean);
  /** Guard/mask key half. Mask key is always (stream, entity) — see the
   *  mask invariant (6). Guard key is (stream, entity) in stamped mode,
   *  where the stamp totally orders regardless of concrete topic; in
   *  unstamped mode (A-1) it is (stream, entity) for a literal-topic
   *  stream and (stream, concreteTopic, entity) for a wildcarded stream
   *  (invariant 4) — an `entity` that spans two concrete topics of the
   *  same wildcard stream while unstamped is a declaration error. */
  entity: (msg: ValidatedMessage<P>) => string;
  /** Stamp selector — stamp-ready, stamp-absent today (A-1). Adding this
   *  later is the ONLY change needed to flip the stream from epoch rules
   *  to stamp adjudication. */
  stamp?: (msg: ValidatedMessage<P>) => Stamp | undefined;
  dispatch: DispatchTarget<P>;
  /** Store/machine streams needing a reset on gap declare it here;
   *  query streams get family/seen-key invalidation automatically. */
  onGap?: () => void;
}

// ── Composition wires ────────────────────────────────────────────────

export type Wire =
  /** machine → store: actor.subscribe selector projection into an exported
   *  store action. Continuous state only. `equals` (default Object.is)
   *  short-circuits identical projections — the echo/feedback guard. */
  | {
      fromMachine: { subscribe(cb: (snap: any) => void): { unsubscribe(): void };
                     getSnapshot(): any };
      select: (snap: any) => any;
      into: (next: any) => void;               // the store stays single-writer
      equals?: (a: any, b: any) => boolean;
    }
  /** store → machine: subscribeWithSelector (next, prev) → actor.send.
   *  `event` returning null sends nothing (the meaningful-transition filter). */
  | {
      fromStore: { subscribe(sel: (s: any) => any,
                             cb: (next: any, prev: any) => void): () => void };
      select: (state: any) => any;
      event: (next: any, prev: any) => object | null;
      toMachine: { send(e: object): void };
    };

// ── Kit configuration ────────────────────────────────────────────────

export interface IngressError extends Error {
  code: 'unmatched-topic' | 'dispatch-failed';
  envelope: ValidatedMessage;
  cause?: unknown;
}

export interface IngressInspectionEvent {
  stage: 'dedup' | 'guard' | 'mask' | 'dispatch' | 'gap';
  stream?: string;
  entity?: string;
  verdict: 'pass' | 'drop' | 'withheld' | 'released';
  message?: ValidatedMessage;
}

export interface IngressStats {           // read-only drop accounting;
  readonly duplicate: number;             // the property suite's cheap
  readonly stale: number;                 // assertion surface
  readonly masked: number;
  readonly dispatched: number;
  readonly unmatched: number;
  readonly gaps: number;
}

export interface StateKitConfig {
  feed?: IngressFeed;                     // required iff streams present
  streams?: Record<string, StreamDecl<any>>;
  wires?: Wire[];
  queryClient?: QueryClient;              // required iff any query target or mutation is used
  signal?: AbortSignal;                   // boundary-owned (logout / teardown)
  onError?: (error: IngressError) => void;         // default: dev-warn and continue
  inspect?: (ev: IngressInspectionEvent) => void;  // read-only tap: observes, never alters
  dedupCapacity?: number;                 // LRU bound, default 1024
}

// ── The optimistic unit ──────────────────────────────────────────────

export interface OptimisticMutationOptions<TData, TVars> {
  /** Production adapter: the orval mutator-wrapped client fn; test adapter:
   *  harness.wrap(fake). The kit ALWAYS passes ctx.signal (composed via
   *  AbortSignal.any from kit.signal + a per-call controller); the fn must
   *  forward it. */
  mutationFn: (vars: TVars, ctx: { signal: AbortSignal }) => Promise<TData>;
  queryKey: (vars: TVars) => QueryKey;
  /** Pure updater — replayable in properties with no test double. */
  optimistic: (vars: TVars, current: unknown) => unknown;
  /** Registers a pending-write hold with the kit's ingress mask for the
   *  entity, from optimistic-apply to settle. Omit for entities with no
   *  push leg. */
  mask?: (vars: TVars) => { stream: string; entity: string };
  /** Extra keys invalidated at settle (ride the same settle gate). */
  alsoInvalidate?: (vars: TVars, data?: TData) => QueryKey[];
}

export type MutationOutcome<TData> =
  | { outcome: 'confirmed'; data: TData }
  | { outcome: 'rolledBack'; error: unknown }   // taxonomy error, untouched
  | { outcome: 'cancelled' };                   // AbortError — never a taxonomy class

export interface OptimisticMutation<TData, TVars> {
  mutate(vars: TVars): Promise<MutationOutcome<TData>>;
}

// ── ENTRY POINT 1 ────────────────────────────────────────────────────

export interface StateKit {
  /** Aborts on config.signal abort or dispose(). Machine async composes:
   *  AbortSignal.any([kit.signal, actorSignal]). */
  readonly signal: AbortSignal;
  readonly stats: IngressStats;

  /** Framework-free optimistic core, BOUND to this kit's mask registry and
   *  queryClient. Non-optional bundle, in order:
   *    (1) cancelQueries(queryKey)  (2) snapshot  (3) optimistic write
   *    (4) mask hold registered     (5) on error: rollback to snapshot
   *    (6) on settle: mask release + invalidate ONLY when the kit's
   *        isMutating count for the key === 1 (the settle gate).
   *  No step can be skipped or reordered. This is the surface the
   *  fc.scheduler property suite exercises — no React in the loop. */
  optimisticMutation<TData, TVars>(
    opts: OptimisticMutationOptions<TData, TVars>
  ): OptimisticMutation<TData, TVars>;

  /** Thin React adapter over optimisticMutation — same bundle, same mask
   *  binding; returns TanStack's UseMutationResult unchanged. */
  useOptimisticMutation<TData, TVars>(
    opts: OptimisticMutationOptions<TData, TVars>
  ): UseMutationResult<TData, unknown, TVars>;

  dispose(): void;                        // idempotent
}

export function createStateKit(config: StateKitConfig): StateKit;

// ── ENTRY POINT 2 — the test adapter of the seam ─────────────────────

export interface RaceHarness {
  /** Second adapter at the IngressFeed seam — what makes the seam real. */
  readonly feed: IngressFeed;
  /** Each item becomes one fc-scheduled task; fc explores delivery
   *  interleavings across runs. 'gap' schedules a reconnect gap. */
  push(...items: Array<ValidatedMessage | 'gap'>): void;
  /** s.scheduleFunction wrapper for the REST leg (queryFns, mutationFns,
   *  fakes). Respects AbortSignal: an aborted wrapped call rejects with
   *  AbortError. */
  wrap<F extends (...a: any[]) => Promise<any>>(fn: F, label?: string): F;
  /** Drain every scheduled task in fc-chosen order (s.waitAll). */
  settle(): Promise<void>;
}

/** Accepts fc.scheduler() for exploration or fc.schedulerFor(ordering) to
 *  pin a found interleaving as a deterministic regression test — same
 *  harness code either way. */
export function createRaceHarness(s: fc.Scheduler): RaceHarness;
```

**Invariants and ordering constraints** (part of the interface — everything a caller must know):

1. **Pipeline order is fixed per message**: dedup → guard → mask → dispatch, synchronously, in one JS turn (riding Zustand's synchronous commit for atomicity). Not configurable; observable only via `inspect` and `stats`.
2. **Single dispatch**: at most one kit per feed; the kit is the sole transport-side writer of every stream's target. Enforced by oxlint `no-restricted-imports` (D-0002): outside the composition root, neither the feed nor store internals are importable.
3. **Guard**: monotonic per entity. Stamped → key is `(stream, entity)`, strictly-greater wins, regressions and equals dropped (`stats.stale`, visible in `inspect`); the stamp totally orders regardless of concrete topic. Unstamped (A-1) → epoch rules only, keyed per invariant 4 (`(stream, entity)` for a literal-topic stream, `(stream, concreteTopic, entity)` for a wildcarded one): pre-gap/pre-dispose stragglers dropped; same-epoch messages pass in feed order. Mode selection is per-message and data-driven — callers change nothing when contracts gain stamps beyond adding the `stamp` selector.
4. **Guard key under wildcard streams (disambiguation)**: unstamped-mode ordering leans on the feed seam's per-topic delivery guarantee (the `IngressFeed` contract above), which does not extend across concrete topics. So for a wildcarded `topic` pattern (`'orders/+/updated'`, `'rig/#'`), the unstamped guard keys by `(stream, concreteTopic, entity)` — one high-water mark per concrete topic — instead of by `(stream, entity)`. This is sound only if each `entity` value is delivered on exactly one concrete topic within the stream; the kit does not assume this silently. An entity observed on a second concrete topic of the same wildcard stream while unstamped is a declaration error: the guard cannot place the message in that entity's ordered sequence, so it drops the message and counts it under `stats.stale`, visible via `inspect` (`stage: 'guard'`, `verdict: 'drop'`) — the same accounting path as an ordinary stale drop, and the caller's signal to fix the stream's `entity` extractor. Stamped mode has no such restriction: the stamp totally orders per `(stream, entity)` regardless of concrete topic, so a wildcard stream may freely fan one entity across topics once stamped.
5. **Invalidate-don't-set**: unstamped query targets only ever invalidate; the app must set `staleTime: Infinity` on push-covered queries (dev-mode warning where detectable). `write` fires only stamp-guarded and cancelQueries-preceded. Copying query data into Zustand is banned (lint-enforced; no `DispatchTarget` shape can read the QueryCache, so the interface offers no affordance for it either).
6. **Mask (withhold-latest, not drop)**: while a `(stream, entity)` has an in-flight kit-bound mutation, incoming server data for it is withheld; on settle, the **latest** withheld item is released back through guard → dispatch. Query targets coalesce into the settle-gate invalidation; store/machine targets receive the released item — chosen over drop-and-resync because MQTT-only entities have no REST leg to resync from. The mask key stays `(stream, entity)` even under wildcarded streams — it does not split by concrete topic the way the unstamped guard does (invariant 4): mask coordinates with the caller-declared `mask` on `OptimisticMutationOptions`, and invariant 4's disambiguation rule already guarantees a given entity has at most one legitimate concrete topic per stream, so no topic qualifier is needed here.
7. **Settle gate**: invalidation fires only when the mutation is the last in flight for its key (`isMutating() === 1`). Rollback on error is unconditional and restores the pre-optimistic snapshot, even if caller code observing the outcome throws.
8. **Gap**: bumps all guard epochs; bulk-invalidates each query stream's `family` (or replays its seen-key set when `family` is absent); sends `{ type: 'ingress.gap' }` to machine targets (no enabled transition → free no-op); calls `onGap` on streams that declare it; increments `stats.gaps`. `refetchOnReconnect` covers never-pushed keys.
9. **Wires carry continuous projections only**; discrete events ride 0060's `actor.on`. Wire fan-out is synchronous; a send that would re-enter dispatch is queued run-to-completion (mailbox semantics — no re-entrancy, no live-lock).
10. **Cancellation**: `kit.signal` composes the boundary signal with dispose; each `mutationFn` call gets a per-call signal composed via `AbortSignal.any()`; commit points check `signal.aborted` before writing; `AbortError` resolves as `{ outcome: 'cancelled' }` and is never classified into the four-class taxonomy (owned by `transport-boundary/errors`).
11. **Teardown order** on `dispose()`: feed unsubscribe → store→machine wires → machine→store wires → signal abort → registries cleared. Idempotent; a feed delivering after dispose is silently ignored.

**Error modes**: `createStateKit` throws synchronously — `IngressConfigError` — on `streams` without `feed`, and on query targets (or any mutation use) without `queryClient`: misconfiguration fails at the composition root, not at message time. At message time, `unmatched-topic` and `dispatch-failed` route to `onError` and the pipeline continues — a poisoned message never stalls a stream (at-most-once past validation; no retry). Guard/mask drops are never exceptions; they are counted and inspectable.

**Performance**: O(1) per message (map lookups plus one compare); bounded dedup LRU (`dedupCapacity`); synchronous fan-out is immaterial at A-7's ≤1k msg/s.

## Worked usage example

One dual-leg stream declared over a wildcard topic (`orders/+/updated`, invalidate-don't-set), one machine→store wire, and one `fc.scheduler` property driven through `RaceHarness` — the same seam production uses, per invariant 1's "observable only via `inspect` and `stats`":

```typescript
import { createStateKit, createRaceHarness, type StreamDecl, type Wire } from '@app/state-kit';
import { QueryClient } from '@tanstack/react-query';
import { createActor, createMachine } from 'xstate';
import { createStore } from 'zustand/vanilla';
import fc from 'fast-check';

interface OrderUpdated { orderId: string; status: 'placed' | 'shipped' }

// Dual-leg entity: MQTT invalidates, REST (elsewhere) remains the writer.
// entity() disambiguates by orderId — invariant 4's requirement for a
// wildcarded stream: each orderId arrives on exactly one concrete topic.
const orderStream: StreamDecl<OrderUpdated> = {
  topic: 'orders/+/updated',
  entity: (msg) => msg.payload.orderId,
  dispatch: {
    query: (msg) => ['order', msg.payload.orderId],
    family: ['order'],                       // O(1) reconnect-gap invalidation
  },
};

const rigMachine = createMachine({ id: 'rig', initial: 'idle', states: { idle: {} } });
const rigActor = createActor(rigMachine).start();
const rigStore = createStore<{ status: string }>(() => ({ status: 'idle' }));

const wires: Wire[] = [
  { fromMachine: rigActor, select: (snap) => snap.value, into: (v) => rigStore.setState({ status: v }) },
];

const queryClient = new QueryClient();

// One fc.scheduler property: two updates for the same order, in fc-chosen
// interleaving, must each clear dedup → guard → mask → dispatch exactly once.
const property = fc.asyncProperty(fc.scheduler(), async (s) => {
  const harness = createRaceHarness(s);
  const kit = createStateKit({ feed: harness.feed, streams: { order: orderStream }, wires, queryClient });

  harness.push(
    { topic: 'orders/42/updated', packetId: 'm1:orders/42/updated', payload: { orderId: '42', status: 'placed' } },
    { topic: 'orders/42/updated', packetId: 'm2:orders/42/updated', payload: { orderId: '42', status: 'shipped' } },
  );
  await harness.settle();

  const seen = kit.stats.dispatched + kit.stats.stale + kit.stats.duplicate;
  kit.dispose();
  return seen === 2;
});

await fc.assert(property);
```

`orderStream` typechecks as a query-target `StreamDecl<OrderUpdated>`; `wires[0]` typechecks as the `fromMachine` arm of `Wire` because `rigActor` structurally satisfies `{ subscribe(cb): { unsubscribe(): void }; getSnapshot(): any }`; `harness.push` takes the same `ValidatedMessage` shape the seam contract declares. `createStateKit`, `createRaceHarness`, and `orderStream.dispatch` are exactly the Chosen interface above — nothing here is a stand-in surface.

## Rationale

**Why minimal won.** It is the deepest module of the four by the skill's own measure — leverage at the interface: two entry points and one port type buy the entire fixed pipeline, gap recovery, both wire directions with re-entrancy protection, signal composition, and one correctly-ordered teardown. Its decisive structural idea is the **kit-bound optimistic unit**: because ingress and optimism live behind one interface, the pending-write mask works by construction — no caller ever wires "tell the ingress a write is pending", and the non-optional bundle cannot be taken apart. That beats common-caller's hidden module-global registry (same capability, worse locality — the coupling lives in two modules and every maintainer's head) and beats ports-adapters' manual `deps.ingress` + `masks` plumbing (honest but a per-call-site tax). It also has the best locality on the design's pivotal unknown: the A-1 stamp transition is one added selector per stream, contained entirely inside the kit. And it places exactly the two seams that are real — the feed port and the REST-leg function shape, each with a production and a test adapter shipped from day one — and no others.

**Grafts taken.**
1. **Framework-free optimistic core** (from ports-adapters): `kit.optimisticMutation` beneath the `useOptimisticMutation` hook, with `confirmed`/`rolledBack`/`cancelled` outcomes. The report's acceptance test — an fc.scheduler property interleaving two mutations and a refetch — now exercises the full bundle through the same interface production uses, without React or RTL in the loop. The hook becomes a thin adapter, which is exactly what a hook should be.
2. **Topic-pattern strings and `family`** (from common-caller): `topic` accepts MQTT `+`/`#` wildcard strings (the vocabulary the vendored AsyncAPI contracts already speak) alongside predicates, and query targets may declare a `family` prefix so a reconnect gap is one bulk invalidation instead of a seen-key replay — with the zero-config replay retained as the fallback.
3. **`stats` drop accounting** (from ports-adapters): read-only counters as the property suite's cheapest assertion surface (`expect(kit.stats.duplicate).toBe(1)`), complementing the `inspect` tap, which stays read-only per flexible's discipline.

**Rejected, and why.**
- **Flexible's port-per-stage surface** (`DispatchTarget`, `MaskProvider`, `StampOrder`, `MonotonicGuard`): each port is interface a caller can meet, so each dilutes depth; the guard port ships one adapter — a hypothetical seam by the two-adapter rule — and its "implementations MUST be monotonic" contract pushes the kit's core correctness obligation onto adapter authors. The fixed pipeline needs policy slots (`stamp`, `mask`, `write`), not pluggable stages.
- **Ports-adapters' `SchedulerPort` and `FetchPort`**: the candidate's own trade-off section concedes both are thin — the production fetch adapter is a near-identity pass-through and the scheduler port risks decaying to single-adapter indirection. The REST leg is already a real seam as a plain injected function shape; time never needs a port here (dedup can be size-bounded).
- **Drop-and-resync mask semantics** (ports-adapters): resync-by-invalidation is meaningless for MQTT-only entities, which have no REST leg. Withhold-latest releases through guard → dispatch and coalesces to invalidation for query targets — strictly more general at the same bounded cost (one item per masked entity).
- **Standalone wire helpers** (common-caller): kept inside `StateKitConfig` instead, because the shared run-to-completion queue between ingress dispatch and wire fan-out is a correctness property (invariant 9) that standalone helpers would forfeit, and one teardown ordering (invariant 11) is worth the small detour of a streamless kit for transport-free pairs.
- **Common-caller's `CompositionLoopError` throw at re-entrancy depth 2**: minimal's mailbox-style queueing is strictly better — it makes the hazard impossible rather than making it crash, matching the actor-model posture the whole architecture rests on.
