// CHECK 3b — one property wired through @fast-check/worker, and a deliberately
// hung property killed without taking the runner down. The predicates live in
// test/hung-property.ts because @fast-check/worker re-executes the defining
// module inside the worker thread.

import { describe, expect, it } from "vitest";
import { assert as workerAssert } from "@fast-check/worker";
import { hungProperty, soundProperty } from "./hung-property.ts";

describe("worker-backed property lane (check 3b)", () => {
  it("runs a sound property to completion inside a worker", async () => {
    await expect(workerAssert(soundProperty, { numRuns: 25 })).resolves.toBeUndefined();
  });

  it("kills a deliberately hung property on timeout", async () => {
    const startedAt = Date.now();
    await expect(
      workerAssert(hungProperty, { numRuns: 1, timeout: 1000, endOnFailure: true }),
    ).rejects.toThrow(/Property failed/);
    // Bounded: the worker was terminated, not merely waited on.
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  }, 30_000);

  it("leaves the runner alive after the kill", async () => {
    expect(1 + 1).toBe(2);
    await expect(workerAssert(soundProperty, { numRuns: 10 })).resolves.toBeUndefined();
  });
});
