// CHECK 2 (replay) + CHECK 3a (regression pinning).
//
// Replay mechanism verified here, end to end:
//   1. fc.check(property, { endOnFailure: true }) returns RunDetails carrying
//      `seed` and `counterexamplePath`.
//   2. fc.check(sameProperty, { seed, path: counterexamplePath, endOnFailure: true })
//      re-runs ONLY that case and reproduces the identical failure.
//   3. Verified beyond "it failed again": each run records the scheduler's
//      s.report() task-release ordering, and the two runs' orderings are
//      asserted equal — i.e. the same interleaving, not merely the same verdict.
//   4. That ordering is then frozen into fc.schedulerFor(ordering), which
//      replays the interleaving with no fast-check search at all.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runRace } from "./race-fixture.ts";

/** The A-1 hazard as a property: unstamped, convergence is NOT
 *  interleaving-independent, so this property is expected to fail. */
function convergenceProperty(record: (order: number[]) => void) {
  return fc.asyncProperty(fc.scheduler(), async (s) => {
    const { finalVersion, order } = await runRace(s, false);
    record(order);
    return finalVersion === 3;
  });
}

describe("counterexample replay from {seed, path} (check 2)", () => {
  it("reproduces the identical scheduler interleaving from the reported seed and path", async () => {
    let discovered: number[] = [];
    const discovery = await fc.check(
      convergenceProperty((order) => {
        discovered = order;
      }),
      { numRuns: 500, endOnFailure: true },
    );

    expect(discovery.failed).toBe(true);
    expect(discovery.counterexamplePath).not.toBeNull();
    const seed = discovery.seed;
    const path = discovery.counterexamplePath!;
    const firstOrdering = discovered;
    expect(firstOrdering.length).toBeGreaterThan(0);

    let replayed: number[] = [];
    const replay = await fc.check(
      convergenceProperty((order) => {
        replayed = order;
      }),
      { seed, path, endOnFailure: true },
    );

    expect(replay.failed).toBe(true);
    expect(replay.numRuns).toBe(1); // the path selects exactly that one case
    expect(replay.counterexamplePath).toBe(path);
    // The decisive assertion: same seed + path => same task-release ordering.
    expect(replayed).toStrictEqual(firstOrdering);
  });
});

describe("pinned interleaving as a deterministic regression (check 3a)", () => {
  // One member of the family fc explores above, frozen by task id (the search
  // seed above is random per run, so the pinned case is constructed rather than
  // copied from any single discovery run — same shape either way). Both MQTT
  // pushes (v2, v3) release before the REST call settles, so the REST hydrate
  // (v1) lands last and is the stale write.
  const PINNED_ORDERING = [2, 3, 1, 4];

  it("rejects the stale write deterministically under fc.schedulerFor (stamped)", async () => {
    const s = fc.schedulerFor(PINNED_ORDERING);
    const { writes, stats, finalVersion, order } = await runRace(s, true);

    expect(order).toStrictEqual(PINNED_ORDERING);
    expect(writes).toStrictEqual([2, 3]); // v1 never reaches the store
    expect(stats.stale).toBe(1); // rejected by the monotonic guard
    expect(stats.dispatched).toBe(2);
    expect(finalVersion).toBe(3);
  });

  it("shows the same pinned interleaving losing the race while unstamped (A-1)", async () => {
    const s = fc.schedulerFor(PINNED_ORDERING);
    const { writes, stats, finalVersion, order } = await runRace(s, false);

    expect(order).toStrictEqual(PINNED_ORDERING);
    expect(writes).toStrictEqual([2, 3, 1]);
    expect(stats.stale).toBe(0);
    expect(finalVersion).toBe(1); // the stale REST hydrate wins
  });
});
