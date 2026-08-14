// @vitest-environment happy-dom
// CHECK 6 (report list), React half — `useOptimisticMutation` as design.md's
// "thin adapter over optimisticMutation — same bundle, same mask binding;
// returns TanStack's UseMutationResult unchanged".
//
// The bundle itself is proven framework-free in test/optimistic.test.ts; what
// this file adds is that the hook runs the SAME internals through TanStack's
// mutation lifecycle (onMutate -> mutationFn -> onError -> onSettled) and hands
// back an unmodified UseMutationResult.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createStateKit } from "../src/index.ts";
import type { StateKit } from "../src/index.ts";

interface Counter {
  value: number;
}

const KEY = ["counter"] as const;

// vitest runs without `globals`, so RTL's auto-cleanup never registers.
afterEach(() => cleanup());

function Panel({
  kit,
  mutationFn,
}: {
  kit: StateKit;
  mutationFn: (vars: { delta: number }, ctx: { signal: AbortSignal }) => Promise<Counter>;
}) {
  const query = useQuery<Counter>({
    queryKey: [...KEY],
    queryFn: async () => ({ value: 0 }),
    staleTime: Infinity,
    retry: false,
  });
  const mutation = kit.useOptimisticMutation<Counter, { delta: number }>({
    mutationFn,
    queryKey: () => [...KEY],
    optimistic: (vars, current) => ({
      value: ((current as Counter | undefined)?.value ?? 0) + vars.delta,
    }),
  });

  return (
    <div>
      <span data-testid="value">{query.data?.value ?? "-"}</span>
      <span data-testid="status">
        {mutation.isPending ? "pending" : mutation.isError ? "error" : mutation.status}
      </span>
      <button onClick={() => mutation.mutate({ delta: 5 })}>bump</button>
    </div>
  );
}

describe("useOptimisticMutation (the React adapter)", () => {
  it("applies the optimistic write while pending and confirms through UseMutationResult", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const kit = createStateKit({ queryClient });
    let confirm!: (value: Counter) => void;

    render(
      <QueryClientProvider client={queryClient}>
        <Panel
          kit={kit}
          mutationFn={() => new Promise<Counter>((resolve) => (confirm = resolve))}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("0"));
    fireEvent.click(screen.getByText("bump"));

    // The optimistic write is visible in the SAME cache the ingress invalidates.
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("5"));
    expect(screen.getByTestId("status").textContent).toBe("pending");
    // On the React surface the mutation IS in the MutationCache, so TanStack's
    // own `isMutating()` agrees with the kit's gate count of 1.
    expect(queryClient.isMutating()).toBe(1);

    confirm({ value: 5 });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("success"));
    kit.dispose();
  });

  it("rolls back the optimistic write when the mutation fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const kit = createStateKit({ queryClient });
    let reject!: (error: unknown) => void;

    render(
      <QueryClientProvider client={queryClient}>
        <Panel
          kit={kit}
          mutationFn={() => new Promise<Counter>((_resolve, rej) => (reject = rej))}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("0"));
    fireEvent.click(screen.getByText("bump"));
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("5"));

    reject(new Error("server said no"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("error"));
    // Rolled back to the snapshot, then reconciled by the settle-gate refetch.
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe("0"));
    kit.dispose();
  });
});
