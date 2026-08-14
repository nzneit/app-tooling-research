// spike-0070-ingress-and-test-lane — public interface types.
// Transcribed from design.md "Chosen interface". Findings are the durable
// artifact; see findings.md.
//
// Task 9 installed @tanstack/react-query 5.101.4, so `QueryClient`, `QueryKey`
// and `UseMutationResult` are now the REAL imports design.md names — the
// structural stand-ins Task 8 declared are gone.

import type { QueryClient, QueryKey, UseMutationResult } from "@tanstack/react-query";

export type { QueryClient, QueryKey, UseMutationResult };

/** Server-issued monotonic ordering token (design.md §Stamp, assumption A-1). */
export type Stamp = number | bigint;

/** A message that already cleared 0010's validators below 0060's seam. */
export interface ValidatedMessage<P = unknown> {
  readonly topic: string;
  readonly packetId: string;
  readonly payload: P;
}

export type FeedEvent<P = unknown> =
  | { kind: "message"; message: ValidatedMessage<P> }
  | { kind: "gap" };

/**
 * THE SEAM (dependency category 3 — remote but owned).
 * Two adapters exist from day one: the production closure over 0060's actor.on
 * surface, and `createRaceHarness(...).feed`. Returns unsubscribe.
 */
export type IngressFeed = (deliver: (event: FeedEvent) => void) => () => void;

export type DispatchTarget<P> =
  | { machine: { send(e: object): void }; event: (msg: ValidatedMessage<P>) => object }
  | { store: (msg: ValidatedMessage<P>) => void }
  | {
      query: (msg: ValidatedMessage<P>) => QueryKey;
      family?: QueryKey;
      write?: (msg: ValidatedMessage<P>) => (current: unknown) => unknown;
    };

export interface StreamDecl<P = unknown> {
  /** MQTT wildcard string ('orders/+/updated', 'rig/#') or a predicate. */
  topic: string | ((topic: string) => boolean);
  entity: (msg: ValidatedMessage<P>) => string;
  stamp?: (msg: ValidatedMessage<P>) => Stamp | undefined;
  dispatch: DispatchTarget<P>;
  onGap?: () => void;
}

export type Wire =
  | {
      fromMachine: {
        subscribe(cb: (snap: any) => void): { unsubscribe(): void };
        getSnapshot(): any;
      };
      select: (snap: any) => any;
      into: (next: any) => void;
      equals?: (a: any, b: any) => boolean;
    }
  | {
      fromStore: {
        subscribe(sel: (s: any) => any, cb: (next: any, prev: any) => void): () => void;
      };
      select: (state: any) => any;
      event: (next: any, prev: any) => object | null;
      toMachine: { send(e: object): void };
    };

export interface IngressError extends Error {
  code: "unmatched-topic" | "dispatch-failed";
  /**
   * The message that failed — or `null` when the failure has no message of its
   * own, i.e. a wire fan-out callback threw inside the shared run-to-completion
   * mailbox (invariant 9). design.md types this `ValidatedMessage`; the spike
   * widens it so a wire failure cannot masquerade as a real envelope in an
   * `onError` log (recorded in findings.md).
   */
  envelope: ValidatedMessage | null;
  cause?: unknown;
}

export interface IngressInspectionEvent {
  stage: "dedup" | "guard" | "mask" | "dispatch" | "gap";
  stream?: string;
  entity?: string;
  verdict: "pass" | "drop" | "withheld" | "released";
  message?: ValidatedMessage;
}

export interface IngressStats {
  readonly duplicate: number;
  readonly stale: number;
  readonly masked: number;
  readonly dispatched: number;
  readonly unmatched: number;
  readonly gaps: number;
}

export interface StateKitConfig {
  feed?: IngressFeed;
  streams?: Record<string, StreamDecl<any>>;
  wires?: Wire[];
  queryClient?: QueryClient;
  signal?: AbortSignal;
  onError?: (error: IngressError) => void;
  inspect?: (ev: IngressInspectionEvent) => void;
  dedupCapacity?: number;
}

// ── The optimistic unit (design.md §"The optimistic unit") ─────────────

export interface OptimisticMutationOptions<TData, TVars> {
  /** Production adapter: the orval mutator-wrapped client fn; test adapter:
   *  `harness.wrap(fake)`. The kit ALWAYS passes `ctx.signal` (composed via
   *  `AbortSignal.any` from `kit.signal` + a per-call controller). */
  mutationFn: (vars: TVars, ctx: { signal: AbortSignal }) => Promise<TData>;
  queryKey: (vars: TVars) => QueryKey;
  /** Pure updater — replayable in properties with no test double. */
  optimistic: (vars: TVars, current: unknown) => unknown;
  /** Registers a pending-write hold with the kit's ingress mask for the
   *  entity, from optimistic-apply to settle. Omit for entities with no push
   *  leg. */
  mask?: (vars: TVars) => { stream: string; entity: string };
  /** Extra keys invalidated at settle (ride the same settle gate). */
  alsoInvalidate?: (vars: TVars, data?: TData) => QueryKey[];
}

export type MutationOutcome<TData> =
  | { outcome: "confirmed"; data: TData }
  | { outcome: "rolledBack"; error: unknown } // taxonomy error, untouched
  | { outcome: "cancelled" }; // AbortError — never a taxonomy class

export interface OptimisticMutation<TData, TVars> {
  mutate(vars: TVars): Promise<MutationOutcome<TData>>;
}

export interface StateKit {
  readonly signal: AbortSignal;
  readonly stats: IngressStats;

  /** Framework-free optimistic core, BOUND to this kit's mask registry and
   *  queryClient. Non-optional bundle, in order: cancelQueries → snapshot →
   *  optimistic write → mask hold → (error) rollback → (settle) mask release +
   *  invalidate only when the kit's in-flight count for the key === 1. */
  optimisticMutation<TData, TVars>(
    opts: OptimisticMutationOptions<TData, TVars>,
  ): OptimisticMutation<TData, TVars>;

  /** Thin React adapter over `optimisticMutation` — same bundle, same mask
   *  binding; returns TanStack's `UseMutationResult` unchanged. */
  useOptimisticMutation<TData, TVars>(
    opts: OptimisticMutationOptions<TData, TVars>,
  ): UseMutationResult<TData, unknown, TVars>;

  dispose(): void;
}

export interface RaceHarness {
  /** Second adapter at the IngressFeed seam — what makes the seam real. */
  readonly feed: IngressFeed;
  push(...items: Array<ValidatedMessage | "gap">): void;
  wrap<F extends (...a: any[]) => Promise<any>>(fn: F, label?: string): F;
  settle(): Promise<void>;
}
