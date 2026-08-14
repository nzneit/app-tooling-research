// The React adapter over the framework-free optimistic core (design.md graft 1:
// "The hook becomes a thin adapter, which is exactly what a hook should be").
// It runs the SAME begin/rollback/settle internals `optimisticMutation` runs —
// TanStack awaits `onMutate` before `mutationFn` and awaits `onSettled` before
// the mutation is done, which is exactly the bundle's required ordering.

import { useMutation } from "@tanstack/react-query";
import {
  begin,
  composeSignal,
  rollback,
  settle,
  type OptimisticContext,
  type OptimisticDeps,
} from "./optimistic.ts";
import type { OptimisticMutationOptions, UseMutationResult } from "./types.ts";

export function useOptimisticMutationImpl<TData, TVars>(
  deps: OptimisticDeps,
  opts: OptimisticMutationOptions<TData, TVars>,
): UseMutationResult<TData, unknown, TVars> {
  return useMutation<TData, unknown, TVars, OptimisticContext>(
    {
      mutationFn: (vars: TVars) => {
        const { signal, done } = composeSignal(deps);
        return opts.mutationFn(vars, { signal }).finally(done);
      },
      onMutate: (vars: TVars) => begin(deps, opts, vars), // (1)-(4)
      onError: (_error: unknown, _vars: TVars, ctx: OptimisticContext | undefined) => {
        if (ctx !== undefined) rollback(deps, ctx); // (5)
      },
      onSettled: (
        data: TData | undefined,
        _error: unknown,
        vars: TVars,
        ctx: OptimisticContext | undefined,
      ) => (ctx === undefined ? undefined : settle(deps, opts, vars, ctx, data)), // (6)
    },
    // Bound to the KIT's queryClient — the hook needs no QueryClientProvider
    // above it to reach the same cache the ingress invalidates.
    deps.queryClient,
  );
}
