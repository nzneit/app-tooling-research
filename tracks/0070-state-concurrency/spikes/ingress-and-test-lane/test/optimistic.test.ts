// CHECK 6 (report list) — the optimistic-update unit.
//
// "Implement the shared `useOptimisticMutation` wrapper (`cancelQueries` +
//  snapshot + rollback + `isMutating` gate) and subject it to an `fc.scheduler`
//  property interleaving two mutations and a refetch — the maintainer-
//  documented residual race is the acceptance test."
//
// The bundle under test is `kit.optimisticMutation` — the framework-free core
// (design.md graft 1), so the property runs with no React in the loop. The hook
// adapter over the same internals is covered by test/optimistic-hook.test.tsx.

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createRaceHarness, createStateKit } from "../src/index.ts";
import type { RaceHarness, ValidatedMessage } from "../src/index.ts";

interface Counter {
  value: number;
}

interface Delta {
  delta: number;
  fail?: boolean;
}

const KEY = ["counter"] as const;

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

const tick = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe("the optimistic bundle (design.md's non-optional order)", () => {
  it("runs cancelQueries -> snapshot -> optimistic write -> mask hold, in that order", async () => {
    const order: string[] = [];
    const queryClient = freshClient();
    queryClient.setQueryData(KEY, { value: 1 });

    vi.spyOn(queryClient, "cancelQueries").mockImplementation((async (...args: unknown[]) => {
      order.push("cancelQueries");
      return QueryClient.prototype.cancelQueries.apply(queryClient, args as never);
    }) as typeof queryClient.cancelQueries);
    vi.spyOn(queryClient, "getQueryData").mockImplementation(((...args: unknown[]) => {
      order.push("getQueryData");
      return QueryClient.prototype.getQueryData.apply(queryClient, args as never);
    }) as typeof queryClient.getQueryData);
    vi.spyOn(queryClient, "setQueryData").mockImplementation(((...args: unknown[]) => {
      order.push("setQueryData");
      return QueryClient.prototype.setQueryData.apply(queryClient, args as never);
    }) as typeof queryClient.setQueryData);

    const harness = createRaceHarness(fc.schedulerFor([1]));
    const withheld: string[] = [];
    const kit = createStateKit({
      feed: harness.feed,
      queryClient,
      streams: {
        counter: {
          topic: "counter/+/updated",
          entity: (m: ValidatedMessage<Counter>) => "c1",
          dispatch: { query: () => [...KEY] },
        },
      },
      inspect: (ev) => {
        if (ev.verdict === "withheld") withheld.push(`${ev.stage}:${ev.stream}`);
      },
    });

    let confirm!: (value: Counter) => void;
    const mutation = kit.optimisticMutation<Counter, Delta>({
      mutationFn: () => new Promise<Counter>((resolve) => (confirm = resolve)),
      queryKey: () => [...KEY],
      optimistic: (vars, current) => ({ value: (current as Counter).value + vars.delta }),
      mask: () => ({ stream: "counter", entity: "c1" }),
    });

    const settled = mutation.mutate({ delta: 5 });
    await tick();

    expect(order).toStrictEqual(["cancelQueries", "getQueryData", "setQueryData"]);
    expect(queryClient.getQueryData(KEY)).toStrictEqual({ value: 6 }); // optimistic

    // Step (4) — the mask hold — is observable only through the ingress: a push
    // for the same entity is withheld while the mutation is in flight.
    harness.push({
      topic: "counter/c1/updated",
      packetId: "p1",
      payload: { value: 99 },
    } satisfies ValidatedMessage<Counter>);
    await harness.settle();
    expect(withheld).toStrictEqual(["mask:counter"]);
    expect(kit.stats.masked).toBe(1);

    confirm({ value: 6 });
    expect(await settled).toStrictEqual({ outcome: "confirmed", data: { value: 6 } });
    expect(kit.stats.dispatched).toBe(1); // released through guard -> dispatch
    kit.dispose();
    vi.restoreAllMocks();
  });

  it("rolls back to the exact snapshot on failure, leaving the error untouched", async () => {
    const queryClient = freshClient();
    const snapshot = { value: 7 };
    queryClient.setQueryData(KEY, snapshot);
    const kit = createStateKit({ queryClient });
    const boom = new Error("500 from the server");

    const mutation = kit.optimisticMutation<Counter, Delta>({
      mutationFn: () => Promise.reject(boom),
      queryKey: () => [...KEY],
      optimistic: (vars, current) => ({ value: (current as Counter).value + vars.delta }),
    });

    const outcome = await mutation.mutate({ delta: 3 });
    expect(outcome).toStrictEqual({ outcome: "rolledBack", error: boom });
    expect((outcome as { error: unknown }).error).toBe(boom); // identity, not re-wrapped
    expect(queryClient.getQueryData(KEY)).toStrictEqual(snapshot);
    kit.dispose();
  });

  it("removes the key when rolling back to NO prior entry (setQueryData cannot)", async () => {
    const queryClient = freshClient();
    const kit = createStateKit({ queryClient });

    // The hazard this guards against: in TanStack Query v5 an updater that
    // yields `undefined` BAILS OUT, so the documented
    // `setQueryData(key, ctx.previous)` rollback silently does nothing when
    // `previous` was undefined.
    queryClient.setQueryData(KEY, { value: 1 });
    queryClient.setQueryData(KEY, undefined);
    expect(queryClient.getQueryData(KEY)).toStrictEqual({ value: 1 }); // ← the bail-out
    queryClient.removeQueries({ queryKey: [...KEY], exact: true });

    const outcome = await kit
      .optimisticMutation<Counter, Delta>({
        mutationFn: () => Promise.reject(new Error("nope")),
        queryKey: () => [...KEY],
        optimistic: (vars, current) => ({ value: ((current as Counter | undefined)?.value ?? 0) + vars.delta }),
      })
      .mutate({ delta: 4 });

    expect(outcome.outcome).toBe("rolledBack");
    expect(queryClient.getQueryData(KEY)).toBeUndefined(); // really gone
    kit.dispose();
  });

  it("gates reconciliation on the last in-flight mutation for the key", async () => {
    const queryClient = freshClient();
    queryClient.setQueryData(KEY, { value: 0 });
    const invalidations: unknown[] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((async (
      filters: unknown,
    ) => {
      invalidations.push(filters);
    }) as typeof queryClient.invalidateQueries);

    const kit = createStateKit({ queryClient });
    const resolvers: Array<(v: Counter) => void> = [];
    const mutation = kit.optimisticMutation<Counter, Delta>({
      mutationFn: () => new Promise<Counter>((resolve) => resolvers.push(resolve)),
      queryKey: () => [...KEY],
      optimistic: (vars, current) => ({ value: (current as Counter).value + vars.delta }),
      alsoInvalidate: () => [["counter", "history"]], // rides the same gate
    });

    const first = mutation.mutate({ delta: 1 });
    const second = mutation.mutate({ delta: 2 });
    await tick();
    expect(resolvers).toHaveLength(2); // genuinely concurrent

    // Why the kit owns the counter: TanStack's own `isMutating()` sees NOTHING
    // on this surface, because the framework-free core creates no MutationCache
    // entries. Delegating the gate to the QueryClient would fail open here.
    expect(queryClient.isMutating()).toBe(0);

    resolvers[0]!({ value: 1 });
    await first;
    expect(invalidations).toStrictEqual([]); // gate held: 2 in flight, not 1

    resolvers[1]!({ value: 3 });
    await second;
    // …and fires exactly once, at the end — for the key AND its extra keys.
    expect(invalidations).toStrictEqual([
      { queryKey: [...KEY] },
      { queryKey: ["counter", "history"] },
    ]);
    kit.dispose();
    vi.restoreAllMocks();
  });
});

// ── The acceptance test: two mutations racing a refetch ─────────────

interface RaceRun {
  /** Cache values observed, in order — the transient states a user would see. */
  observed: number[];
  finalCache: number;
  server: number;
  invalidateCalls: number;
  outcomes: string[];
}

async function runOptimisticRace(
  harness: RaceHarness,
  secondFails: boolean,
  refetchFirst: boolean,
): Promise<RaceRun> {
  const queryClient = freshClient();
  const kit = createStateKit({ queryClient });
  const server = { value: 0 };
  let invalidateCalls = 0;

  const realInvalidate = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filters?: never, options?: never) => {
    invalidateCalls++;
    return realInvalidate(filters, options);
  }) as typeof queryClient.invalidateQueries;

  // The REST leg, scheduler-wrapped at both ends: the read captures the server
  // value when the request LEAVES (a response in flight can therefore be
  // stale), and the write applies when the response LANDS.
  const readCounter = harness.wrap(async () => ({ value: server.value }), "GET /counter");
  const applyDelta = harness.wrap(async (delta: number) => delta, "PATCH /counter");

  queryClient.setQueryData(KEY, { value: 0 });
  const observed: number[] = [];
  const observer = new QueryObserver<Counter>(queryClient, {
    queryKey: [...KEY],
    queryFn: readCounter,
    staleTime: Infinity,
    retry: false,
  });
  const unsubscribe = observer.subscribe((result) => {
    const value = result.data?.value;
    if (value !== undefined && observed[observed.length - 1] !== value) observed.push(value);
  });

  const mutation = kit.optimisticMutation<Counter, Delta>({
    mutationFn: async (vars) => {
      const delta = await applyDelta(vars.delta);
      if (vars.fail === true) throw new Error("server rejected");
      server.value += delta;
      return { value: server.value };
    },
    queryKey: () => [...KEY],
    optimistic: (vars, current) => ({ value: ((current as Counter | undefined)?.value ?? 0) + vars.delta }),
  });

  const refetch = (): Promise<unknown> =>
    queryClient.refetchQueries({ queryKey: [...KEY] }).catch(() => undefined);

  // fc decides how these interleave; the ORDER OF INITIATION is the one thing a
  // scheduler cannot choose for us, so it is a property input too.
  const started: Array<Promise<unknown>> = [];
  if (refetchFirst) started.push(refetch());
  const first = mutation.mutate({ delta: 1 });
  const second = mutation.mutate({ delta: 2, ...(secondFails ? { fail: true } : {}) });
  started.push(first, second);
  if (!refetchFirst) started.push(refetch());

  await harness.settle();
  const outcomes = (await Promise.all([first, second])).map((o) => o.outcome);
  await Promise.all(started.map((p) => p.catch(() => undefined)));
  await harness.settle();

  unsubscribe();
  const finalCache = (queryClient.getQueryData(KEY) as Counter).value;
  kit.dispose();
  queryClient.clear();
  return { observed, finalCache, server: server.value, invalidateCalls, outcomes };
}

describe("fc.scheduler property: two mutations interleaved with a refetch", () => {
  it("converges on the server value in EVERY interleaving, and never reconciles early", async () => {
    let staleOverwrites = 0; // the maintainer-documented residual race, observed
    let rollbacks = 0;
    let runs = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.boolean(),
        fc.boolean(),
        async (s, secondFails, refetchFirst) => {
          runs++;
          const run = await runOptimisticRace(createRaceHarness(s), secondFails, refetchFirst);

          // 1. The settle gate: two overlapping mutations for one key reconcile
          //    ONCE, at the last settle — never in the middle.
          expect(run.invalidateCalls).toBe(1);

          // 2. Rollback: a failed mutation leaves no trace of its optimistic
          //    write; the server never saw its delta either.
          const expectedServer = secondFails ? 1 : 3;
          expect(run.server).toBe(expectedServer);
          if (secondFails) {
            expect(run.outcomes).toStrictEqual(["confirmed", "rolledBack"]);
            rollbacks++;
          } else {
            expect(run.outcomes).toStrictEqual(["confirmed", "confirmed"]);
          }

          // 3. Convergence: whatever the refetch did in the middle, the cache
          //    ends on the server's truth.
          expect(run.finalCache).toBe(expectedServer);

          // 4. Non-vacuity bookkeeping — THE residual race: a refetch landing
          //    between an optimistic write and its settle shows up as an
          //    observed value going BACKWARDS (the optimistic value replaced by
          //    older server data). Counting it proves the property is exercising
          //    the race the report calls the acceptance test, not just the
          //    happy path.
          if (run.observed.some((v, i) => i > 0 && v < run.observed[i - 1]!)) staleOverwrites++;
          return true;
        },
      ),
      { numRuns: 60 },
    );

    // The residual race is REAL, not hypothetical: fc found interleavings where
    // a transient value was visible. (Recorded in findings.md.)
    expect(runs).toBe(60);
    expect(rollbacks).toBeGreaterThan(0);
    expect(staleOverwrites).toBeGreaterThan(0);
  }, 60_000);
});
