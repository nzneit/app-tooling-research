// CHECK 5 (report list) — the cancellation chain.
//
// "Verify actor stop aborts a real fetch through the orval mutator
//  (`fromPromise` signal → mutator → `fetch`), that `AbortError` is normalized
//  as a cancellation outcome (not a taxonomy class) …, and that
//  `AbortSignal.any()` composition with a boundary-owned signal aborts all
//  in-flight work on simulated connection loss."
//
// The mutator and the taxonomy slice are local duplicates (test/mutator.ts);
// `fetch` is injected. Everything else is the real thing: real xstate actors,
// the real `fromPromise` signal, the real kit signal.

import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createActor, createMachine, fromPromise } from "xstate";
import { createStateKit, isCancellation } from "../src/index.ts";
import {
  createControlledFetch,
  mutator,
  normalizeRestError,
  type BoundaryError,
  type ControlledFetch,
} from "./mutator.ts";

interface Rig {
  rigId: string;
  speed: number;
}

const tick = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

/** The production shape: a state that invokes a promise actor which forwards
 *  the actor-scoped signal into the mutator. */
function fetchMachine(controlled: ControlledFetch, outcomes: string[], seen: AbortSignal[]) {
  return createMachine({
    id: "rigFetch",
    initial: "idle",
    states: {
      idle: { on: { FETCH: "loading" } },
      loading: {
        invoke: {
          src: fromPromise(async ({ signal }: { signal: AbortSignal }) => {
            seen.push(signal);
            try {
              return await mutator<Rig>(
                { url: "/rig/1" },
                { signal, fetchImpl: controlled.fetchImpl },
              );
            } catch (error) {
              // Normalize where production normalizes: at the REST leg.
              const normalized: BoundaryError = normalizeRestError(error, "/rig/1");
              outcomes.push(isCancellation(normalized) ? "cancelled" : `class-${normalized.class}`);
              throw error;
            }
          }),
          onDone: "loaded",
          onError: "failed",
        },
      },
      loaded: {},
      failed: {},
    },
  });
}

describe("cancellation chain: actor stop -> fromPromise signal -> mutator -> fetch", () => {
  it("aborts the in-flight fetch when the actor stops, and calls it a cancellation", async () => {
    const controlled = createControlledFetch();
    const outcomes: string[] = [];
    const seen: AbortSignal[] = [];
    const actor = createActor(fetchMachine(controlled, outcomes, seen)).start();

    actor.send({ type: "FETCH" });
    await tick();

    // The signal reached fetch (dropping it in the mutator is the silent no-op
    // 0060's report warns about — this is the assertion that catches it).
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal); // xstate >= 5.13.0 floor, live at 5.32.5
    expect(controlled.pending).toHaveLength(1);
    expect(controlled.pending[0]!.aborted).toBe(false);

    actor.stop(); // <- the whole chain hangs off this
    await tick();

    expect(controlled.pending[0]!.aborted).toBe(true);
    expect(controlled.aborts).toStrictEqual(["/rig/1"]);
    expect(outcomes).toStrictEqual(["cancelled"]);
  });

  it("keeps AbortError OUT of the four-class taxonomy, while real failures stay in it", async () => {
    const controlled = createControlledFetch();
    const outcomes: string[] = [];
    const actor = createActor(fetchMachine(controlled, outcomes, [])).start();

    actor.send({ type: "FETCH" });
    await tick();
    controlled.pending[0]!.fail(409, { reason: "CONFLICT" }); // a DECLARED status
    await tick();

    expect(outcomes).toStrictEqual(["class-3"]); // contracted business error
    expect(actor.getSnapshot().value).toBe("failed");
    actor.stop();

    // …and the three shapes that ARE cancellations, per invariant 10.
    const aborted = new Error("The operation was aborted.");
    aborted.name = "AbortError";
    expect(isCancellation(aborted)).toBe(true);
    // 0060's normalizer puts an aborted fetch at class 1 / reason 'aborted';
    // the state layer still reads it as a cancellation, never as a class.
    expect(isCancellation(normalizeRestError(aborted, "/rig/1"))).toBe(true);
    expect(isCancellation(normalizeRestError(new Error("socket hang up"), "/rig/1"))).toBe(false);
    expect(
      isCancellation({ class: 3, status: 409, body: {}, endpointOrTopic: "/rig/1", raw: null }),
    ).toBe(false);
  });
});

describe("AbortSignal.any() composition on simulated connection loss", () => {
  it("aborts EVERY in-flight call from one boundary-owned signal", async () => {
    const boundary = new AbortController(); // logout / connection loss
    const controlled = createControlledFetch();
    const queryClient = new QueryClient();
    const kit = createStateKit({ signal: boundary.signal, queryClient });

    // Three concurrent in-flight calls: two kit-bound mutations (the kit
    // composes AbortSignal.any([kit.signal, per-call]) itself) …
    const mutation = kit.optimisticMutation<Rig, { rigId: string; speed: number }>({
      mutationFn: (vars, ctx) =>
        mutator<Rig>(
          { url: `/rig/${vars.rigId}`, method: "PATCH", body: vars },
          { signal: ctx.signal, fetchImpl: controlled.fetchImpl },
        ),
      queryKey: (vars) => ["rig", vars.rigId],
      optimistic: (vars) => ({ rigId: vars.rigId, speed: vars.speed }),
    });
    const first = mutation.mutate({ rigId: "1", speed: 10 });
    const second = mutation.mutate({ rigId: "2", speed: 20 });

    // … and one machine-driven fetch composing the SAME kit signal with its own
    // actor-scoped signal, exactly as design.md's invariant 10 prescribes.
    const actorSignals: AbortSignal[] = [];
    const machineOutcomes: string[] = [];
    const actor = createActor(
      createMachine({
        id: "rig3",
        initial: "loading",
        states: {
          loading: {
            invoke: {
              src: fromPromise(async ({ signal }: { signal: AbortSignal }) => {
                const composed = AbortSignal.any([kit.signal, signal]);
                actorSignals.push(composed);
                try {
                  return await mutator<Rig>(
                    { url: "/rig/3" },
                    { signal: composed, fetchImpl: controlled.fetchImpl },
                  );
                } catch (error) {
                  machineOutcomes.push(
                    isCancellation(normalizeRestError(error, "/rig/3")) ? "cancelled" : "error",
                  );
                  throw error;
                }
              }),
              onError: "failed",
            },
          },
          failed: {},
        },
      }),
    ).start();

    await tick();
    expect(controlled.pending).toHaveLength(3);
    expect(controlled.pending.every((p) => !p.aborted)).toBe(true);

    boundary.abort(); // ← simulated connection loss / logout
    await tick();

    // Every in-flight call aborted from the ONE boundary signal.
    expect(controlled.pending.map((p) => p.aborted)).toStrictEqual([true, true, true]);
    expect(new Set(controlled.aborts)).toStrictEqual(new Set(["/rig/1", "/rig/2", "/rig/3"]));
    expect(kit.signal.aborted).toBe(true); // boundary abort disposed the kit
    expect(actorSignals[0]!.aborted).toBe(true);

    // …and each one is a CANCELLATION outcome, never a taxonomy class.
    expect(await first).toStrictEqual({ outcome: "cancelled" });
    expect(await second).toStrictEqual({ outcome: "cancelled" });
    expect(machineOutcomes).toStrictEqual(["cancelled"]);

    // The optimistic writes were rolled back by the same settle path.
    expect(queryClient.getQueryData(["rig", "1"])).toBeUndefined();
    expect(queryClient.getQueryData(["rig", "2"])).toBeUndefined();

    actor.stop();
    kit.dispose();
  });

  it("does not let one actor's abort touch another's in-flight work", async () => {
    const controlled = createControlledFetch();
    const kit = createStateKit({ queryClient: new QueryClient() });
    const outcomes: string[] = [];

    const start = (url: string) => {
      const perActor = new AbortController();
      const composed = AbortSignal.any([kit.signal, perActor.signal]);
      const promise = mutator<Rig>({ url }, { signal: composed, fetchImpl: controlled.fetchImpl })
        .then(() => outcomes.push(`${url}:done`))
        .catch((error: unknown) =>
          outcomes.push(`${url}:${isCancellation(error) ? "cancelled" : "error"}`),
        );
      return { perActor, promise };
    };

    const a = start("/rig/a");
    const b = start("/rig/b");
    await tick();

    a.perActor.abort(); // only actor A stops
    await tick();
    controlled.pending[1]!.succeed({ rigId: "b", speed: 3 });
    await Promise.all([a.promise, b.promise]);

    expect(outcomes).toStrictEqual(["/rig/a:cancelled", "/rig/b:done"]);
    expect(kit.signal.aborted).toBe(false);
    kit.dispose();
  });
});
