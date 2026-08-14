// The framework-free optimistic core (design.md graft 1). The React hook in
// ./react.ts is a thin adapter over these SAME internals, so both surfaces run
// one bundle — design.md's non-optional order:
//   (1) cancelQueries  (2) snapshot  (3) optimistic write  (4) mask hold
//   (5) on error: rollback  (6) on settle: mask release + invalidate ONLY when
//       the kit's in-flight count for the key === 1 (the settle gate).

import { hashKey, isCancelledError, type QueryClient } from "@tanstack/react-query";
import type {
  MutationOutcome,
  OptimisticMutation,
  OptimisticMutationOptions,
  QueryKey,
} from "./types.ts";

/** Everything the optimistic unit borrows from the kit it is bound to. */
export interface OptimisticDeps {
  readonly queryClient: QueryClient | undefined;
  readonly kitSignal: AbortSignal;
  /** The ingress mask registry (invariant 6). Returns the release. */
  hold(stream: string, entity: string): () => void;
  /** Kit-owned in-flight mutation counts per hashed queryKey — the settle
   *  gate's counter (design.md: "the kit's isMutating count for the key"). It
   *  is the kit's own, not the QueryCache's, so the framework-free core and the
   *  React hook share one gate. */
  readonly inFlight: Map<string, number>;
}

export interface OptimisticContext {
  readonly queryKey: QueryKey;
  readonly keyHash: string;
  /** Cache value before the optimistic write. `undefined` means "no entry". */
  readonly snapshot: unknown;
  readonly releaseMask: () => void;
}

export class OptimisticConfigError extends Error {
  override readonly name = "OptimisticConfigError";
}

const noop = (): void => {};

/**
 * Cancellation, not a taxonomy class (invariant 10). Recognizes three shapes:
 * a platform `AbortError`, TanStack Query's `CancelledError`, and the shape
 * 0060's boundary hands up for an aborted fetch — a class-1 transport error
 * with `reason: 'aborted'` (`transport-boundary/errors`). The state layer maps
 * all three to `{ outcome: 'cancelled' }`; it never re-classifies.
 */
export function isCancellation(error: unknown): boolean {
  if (isCancelledError(error)) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; class?: unknown; reason?: unknown };
  if (e.name === "AbortError") return true;
  return e.class === 1 && e.reason === "aborted";
}

export function requireClient(deps: OptimisticDeps): QueryClient {
  if (deps.queryClient === undefined) {
    throw new OptimisticConfigError(
      "optimisticMutation requires a queryClient on the kit config",
    );
  }
  return deps.queryClient;
}

/** Steps 1-4, in order. Increments the settle gate's counter first, so a
 *  second concurrent mutation for the same key is visible to the first. */
export async function begin<TData, TVars>(
  deps: OptimisticDeps,
  opts: OptimisticMutationOptions<TData, TVars>,
  vars: TVars,
): Promise<OptimisticContext> {
  const queryClient = requireClient(deps);
  const queryKey = opts.queryKey(vars);
  const keyHash = hashKey(queryKey);
  deps.inFlight.set(keyHash, (deps.inFlight.get(keyHash) ?? 0) + 1);

  /** Set the moment step (3) lands, so a later failure inside `begin` knows
   *  there is an optimistic write to undo. */
  let applied: OptimisticContext | undefined;

  try {
    await queryClient.cancelQueries({ queryKey }); // (1)
    const snapshot = queryClient.getQueryData(queryKey); // (2)
    queryClient.setQueryData(queryKey, (current: unknown) => opts.optimistic(vars, current)); // (3)
    applied = { queryKey, keyHash, snapshot, releaseMask: noop };
    const masked = opts.mask?.(vars); // (4)
    const releaseMask =
      masked === undefined ? noop : deps.hold(masked.stream, masked.entity);
    return { ...applied, releaseMask };
  } catch (error) {
    // The bundle could not be entered. Undo whatever DID land: a throwing
    // `mask` selector or `hold` would otherwise strand an unconfirmed
    // optimistic value in the cache, with no settle to reconcile it…
    if (applied !== undefined) rollback(deps, applied);
    // …and never leak a gate count either.
    release(deps, keyHash);
    throw error;
  }
}

/** Step 5. Unconditional for any non-confirmed outcome (invariant 7).
 *
 *  `setQueryData(key, undefined)` is a documented no-op in TanStack Query v5
 *  (an updater returning `undefined` bails out), so the standard
 *  `setQueryData(key, ctx.previous)` recipe silently fails to undo the
 *  optimistic write when there was no cache entry to begin with. Rolling back
 *  to "no entry" therefore has to remove the query. Recorded in findings.md.
 */
export function rollback(deps: OptimisticDeps, ctx: OptimisticContext): void {
  const queryClient = requireClient(deps);
  if (ctx.snapshot === undefined) {
    queryClient.removeQueries({ queryKey: ctx.queryKey, exact: true });
    return;
  }
  queryClient.setQueryData(ctx.queryKey, ctx.snapshot);
}

function release(deps: OptimisticDeps, keyHash: string): void {
  const remaining = (deps.inFlight.get(keyHash) ?? 1) - 1;
  if (remaining > 0) deps.inFlight.set(keyHash, remaining);
  else deps.inFlight.delete(keyHash);
}

/** Step 6. The gate is read BEFORE this mutation leaves the count, so
 *  `=== 1` means "I am the last one in flight for this key". */
export async function settle<TData, TVars>(
  deps: OptimisticDeps,
  opts: OptimisticMutationOptions<TData, TVars>,
  vars: TVars,
  ctx: OptimisticContext,
  data?: TData,
): Promise<void> {
  const queryClient = requireClient(deps);
  const isLastInFlight = (deps.inFlight.get(ctx.keyHash) ?? 0) === 1;
  try {
    ctx.releaseMask();
    if (!isLastInFlight) return; // premature reconciliation prevented
    const keys: QueryKey[] = [ctx.queryKey, ...(opts.alsoInvalidate?.(vars, data) ?? [])];
    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  } finally {
    release(deps, ctx.keyHash);
  }
}

/** The per-call signal: `AbortSignal.any([kit.signal, perCall])` (invariant 10). */
export function composeSignal(deps: OptimisticDeps): {
  signal: AbortSignal;
  done: () => void;
} {
  const perCall = new AbortController();
  const signal = AbortSignal.any([deps.kitSignal, perCall.signal]);
  // Aborting the per-call controller when the call is over detaches the
  // composed listener from the long-lived kit signal.
  return { signal, done: () => perCall.abort() };
}

/** design.md ENTRY POINT 1 member — `kit.optimisticMutation`. */
export function createOptimisticMutation<TData, TVars>(
  deps: OptimisticDeps,
  opts: OptimisticMutationOptions<TData, TVars>,
): OptimisticMutation<TData, TVars> {
  requireClient(deps); // fail at the composition root, not at mutate() time
  return {
    async mutate(vars: TVars): Promise<MutationOutcome<TData>> {
      const ctx = await begin(deps, opts, vars);
      const { signal, done } = composeSignal(deps);
      let outcome: MutationOutcome<TData>;
      let data: TData | undefined;
      try {
        data = await opts.mutationFn(vars, { signal });
        outcome = { outcome: "confirmed", data };
      } catch (error) {
        outcome = isCancellation(error)
          ? { outcome: "cancelled" }
          : { outcome: "rolledBack", error }; // taxonomy error, untouched
      } finally {
        done();
      }
      try {
        if (outcome.outcome !== "confirmed") rollback(deps, ctx); // (5)
      } finally {
        // Exactly one settle per mutate, on every path, even if rollback threw
        // — otherwise the gate count would leak and NOTHING for this key would
        // ever reconcile again (invariant 7).
        await settle(deps, opts, vars, ctx, data);
      }
      return outcome;
    },
  };
}
