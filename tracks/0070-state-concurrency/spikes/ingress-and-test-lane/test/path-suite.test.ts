// CHECK 4 (report list) — the `xstate/graph` path suite.
//
// "Generate and run one shortest-paths suite (with `filterEvents`) against a
//  small production-shaped machine on the app's actual xstate minor; confirm
//  ≥5.20.0 is reachable…; decide abstract-model vs production-machine reuse;
//  assess whether xstate-audition's helpers are worth vendoring for live-actor
//  assertions."
//
// Every generated path below is executed as its own test against a LIVE actor.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createActor, createMachine, fromPromise } from "xstate";
import { getShortestPaths } from "xstate/graph";
import type { AnyStateMachine } from "xstate";

const require_ = createRequire(import.meta.url);
const xstateVersion: string = JSON.parse(
  readFileSync(require_.resolve("xstate/package.json"), "utf8"),
).version;

// ── The production-shaped machine ────────────────────────────────────
// idle → submitting → success | failure, with a retry edge and a cancel edge.
// Double-submit protection is structural: SUBMIT has no enabled transition in
// `submitting` (design.md's "free no-op" posture).

const submitMachine = createMachine({
  id: "submit",
  initial: "idle",
  states: {
    idle: { on: { SUBMIT: "submitting" } },
    submitting: { on: { SUCCESS: "success", FAILURE: "failure", CANCEL: "idle" } },
    failure: { on: { RETRY: "submitting", RESET: "idle" } },
    success: { on: { RESET: "idle" } },
  },
});

const allEvents = [
  { type: "SUBMIT" },
  { type: "SUCCESS" },
  { type: "FAILURE" },
  { type: "RETRY" },
  { type: "RESET" },
  { type: "CANCEL" },
] as const;

const unfiltered = getShortestPaths(submitMachine, { events: [...allEvents] });

// `filterEvents` narrows the suite to the happy/retry lanes: the abandonment
// (CANCEL) lane is covered by its own hand-written test, so generating it here
// would be duplicate coverage. The filter is evaluated per (snapshot, event).
// THIS is the suite every path of which runs as a test below.
const filtered = getShortestPaths(submitMachine, {
  events: [...allEvents],
  filterEvents: (_snapshot, event) => event.type !== "CANCEL",
});

// A second filter, kept only to show `filterEvents` really does shape the
// reachable set: dropping FAILURE makes the `failure` state unreachable.
const withoutFailureLane = getShortestPaths(submitMachine, {
  events: [...allEvents],
  filterEvents: (_snapshot, event) => event.type !== "FAILURE",
});

const describePath = (steps: readonly { event: { type: string } }[]): string => {
  const sent = steps.map((s) => s.event.type).filter((t) => t !== "xstate.init");
  return sent.length === 0 ? "<initial state>" : sent.join(" -> ");
};

describe("xstate/graph path suite", () => {
  it("imports getShortestPaths from CORE xstate at the pinned version (>=5.20.0 claim)", () => {
    expect(xstateVersion).toBe("5.32.5");
    expect(typeof getShortestPaths).toBe("function");
    // The specifier resolves inside the xstate package itself — no @xstate/graph
    // and no @xstate/test (npm-deprecated, xstate-v4-pinned) is installed.
    expect(require_.resolve("xstate/graph")).toContain("node_modules/xstate/");
    expect(() => require_.resolve("@xstate/graph")).toThrow();
    expect(() => require_.resolve("@xstate/test")).toThrow();
  });

  it("generates one shortest path per reachable state, and filterEvents shapes it", () => {
    // Recorded in findings.md — these counts are asserted so they cannot drift.
    // Shortest paths = one per reachable state (the initial state included).
    expect(unfiltered).toHaveLength(4);
    expect(filtered).toHaveLength(4);

    // Honest reading of the CANCEL filter: the count is UNCHANGED, because
    // CANCEL only returns to `idle`, which is already reached in zero steps —
    // it lies on no shortest path. What the filter guarantees is that no
    // generated path may use the edge, which is what the suite's scope needs.
    expect(filtered.flatMap((p) => p.steps.map((s) => s.event.type))).not.toContain("CANCEL");
    expect(new Set(filtered.map((p) => String(p.state.value)))).toStrictEqual(
      new Set(["idle", "submitting", "success", "failure"]),
    );

    // …and where a filtered event IS the only way into a state, the reachable
    // set really does shrink: no FAILURE edge, no `failure` state, 3 paths.
    expect(withoutFailureLane).toHaveLength(3);
    expect(new Set(withoutFailureLane.map((p) => String(p.state.value)))).toStrictEqual(
      new Set(["idle", "submitting", "success"]),
    );
  });

  // ── EVERY generated path runs as a test against a live actor ───────
  describe.each(filtered.map((path) => ({ name: describePath(path.steps), path })))(
    "path: $name",
    ({ path }) => {
      it("reaches the generated target state, step for step", () => {
        const actor = createActor(submitMachine).start();
        try {
          for (const step of path.steps) {
            // Every generated path opens with the synthetic `xstate.init`
            // step; a live actor has already taken it by `.start()`.
            if (step.event.type === "xstate.init") {
              expect(actor.getSnapshot().value).toStrictEqual(step.state.value);
              continue;
            }
            actor.send(step.event);
            // The live actor must agree with the generated model at EVERY step,
            // not merely at the end.
            expect(actor.getSnapshot().value).toStrictEqual(step.state.value);
          }
          expect(actor.getSnapshot().value).toStrictEqual(path.state.value);
        } finally {
          actor.stop();
        }
      });
    },
  );

  it("covers every state but NOT every edge (shortest paths omits RETRY and RESET)", () => {
    const visited = new Set<string>();
    for (const path of filtered) {
      visited.add(String(path.state.value));
      for (const step of path.steps) visited.add(String(step.state.value));
    }
    expect(visited).toStrictEqual(new Set(["idle", "submitting", "success", "failure"]));

    const edges = filtered.flatMap((p) => p.steps.map((s) => s.event.type));
    expect(edges).toContain("SUBMIT");
    expect(edges).toContain("FAILURE");
    expect(edges).toContain("SUCCESS");
    // RETRY and RESET reach no NEW state, so shortest-paths omits them: edge
    // coverage needs getSimplePaths (or a hand-written test), not this suite.
    expect(edges).not.toContain("RETRY");
    expect(edges).not.toContain("RESET");
  });
});

// ── Abstract model vs production machine (the reuse verdict) ─────────

const invokeDrivenMachine: AnyStateMachine = createMachine({
  id: "submitAsync",
  initial: "idle",
  states: {
    idle: { on: { SUBMIT: "submitting" } },
    submitting: {
      invoke: {
        src: fromPromise(async () => ({ ok: true })),
        onDone: "success",
        onError: "failure",
      },
    },
    failure: { on: { RETRY: "submitting" } },
    success: { on: { RESET: "idle" } },
  },
});

describe("abstract model vs production machine", () => {
  it("cannot traverse past an invoke: done/error events are not caller-sendable", () => {
    const paths = getShortestPaths(invokeDrivenMachine, {
      events: [{ type: "SUBMIT" }, { type: "RETRY" }, { type: "RESET" }],
    });
    const reached = new Set(paths.map((p) => String(p.state.value)));
    // Traversal calls logic.transition() with no running actor system, so the
    // invoked promise never settles and `xstate.done.actor.*` is never emitted.
    // `success` and `failure` are unreachable BY GENERATION even though a live
    // actor reaches them in milliseconds.
    expect(reached).toStrictEqual(new Set(["idle", "submitting"]));
    expect(reached.has("success")).toBe(false);
  });

  it("the same production machine IS drivable live — with ~10 lines of local helper", async () => {
    // The xstate-audition capability (runUntilSnapshot) in local form. Its size
    // is the whole vendoring argument: see findings.md.
    const runUntilSnapshot = <T extends { getSnapshot(): { value: unknown } }>(
      actor: T & { subscribe(cb: (s: { value: unknown }) => void): { unsubscribe(): void } },
      predicate: (value: unknown) => boolean,
      timeoutMs = 1000,
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        if (predicate(actor.getSnapshot().value)) return resolve(actor.getSnapshot().value);
        const timer = setTimeout(() => {
          sub.unsubscribe();
          reject(new Error("runUntilSnapshot: timed out"));
        }, timeoutMs);
        const sub = actor.subscribe((snapshot) => {
          if (!predicate(snapshot.value)) return;
          clearTimeout(timer);
          sub.unsubscribe();
          resolve(snapshot.value);
        });
      });

    const actor = createActor(invokeDrivenMachine).start();
    actor.send({ type: "SUBMIT" });
    await expect(runUntilSnapshot(actor, (v) => v === "success")).resolves.toBe("success");
    actor.stop();
  });
});
