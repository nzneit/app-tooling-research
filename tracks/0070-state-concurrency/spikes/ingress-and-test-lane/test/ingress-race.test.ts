// CHECK 2 (decisive) — the single-dispatch ingress under an fc.scheduler
// property: scheduled synthetic MQTT messages raced against a scheduled REST
// resolution, both entering state through the one ingress entry point. The
// monotonic guard must reject the stale write in every interleaving.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { runRace } from "./race-fixture.ts";

describe("schedulable ingress seam (check 2)", () => {
  it("rejects the stale REST write under every fc-chosen interleaving (stamped guard)", async () => {
    // Coverage guards: the property must not pass vacuously — fc has to have
    // produced BOTH the interleaving where the REST hydrate lands first and one
    // where it lands stale behind a newer push.
    let sawRestFirst = false;
    let sawStaleRejected = false;
    const orderings = new Set<string>();

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), async (s) => {
        const { writes, stats, finalVersion, order } = await runRace(s, true);
        orderings.add(order.join(","));
        if (writes[0] === 1) sawRestFirst = true;
        if (stats.stale > 0) sawStaleRejected = true;

        // Every accepted write strictly increases: the monotonic guard.
        for (let i = 1; i < writes.length; i++) {
          expect(writes[i]!).toBeGreaterThan(writes[i - 1]!);
        }
        // Drop accounting closes over all three deliveries.
        expect(stats.dispatched + stats.stale).toBe(3);
        expect(stats.duplicate).toBe(0);
        expect(stats.unmatched).toBe(0);
        // Convergence is interleaving-independent: the newest stamp always wins.
        expect(finalVersion).toBe(3);
        // Whenever the REST hydrate did not land first, it IS the stale write
        // and the guard rejected it.
        if (writes[0] !== 1) {
          expect(stats.stale).toBeGreaterThanOrEqual(1);
          expect(writes).not.toContain(1);
        }
      }),
      { numRuns: 200 },
    );

    expect(sawRestFirst).toBe(true);
    expect(sawStaleRejected).toBe(true);
    expect(orderings.size).toBeGreaterThan(1);
  });

  it("cannot reject the stale REST write while unstamped (A-1, honest counterpart)", async () => {
    // Same race, `stamp` selector omitted. Epoch rules carry no ordering signal
    // across legs, so a late REST resolution overwrites newer MQTT state.
    let sawStaleWin = false;
    await fc.assert(
      fc.asyncProperty(fc.scheduler(), async (s) => {
        const { stats, finalVersion } = await runRace(s, false);
        expect(stats.stale).toBe(0); // nothing to adjudicate with
        expect(stats.dispatched).toBe(3); // every delivery is written
        if (finalVersion === 1) sawStaleWin = true;
      }),
      { numRuns: 200 },
    );
    expect(sawStaleWin).toBe(true);
  });
});
