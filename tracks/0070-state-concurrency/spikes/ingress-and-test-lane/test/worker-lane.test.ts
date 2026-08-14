// CHECK 3b — one property wired through @fast-check/worker, and a deliberately
// hung property killed without taking the runner down. The predicates live in
// test/hung-property.ts because @fast-check/worker re-executes the defining
// module inside the worker thread.

import { describe, expect, it } from "vitest";
import { assert as workerAssert } from "@fast-check/worker";
import { hungProperty, soundProperty } from "./hung-property.ts";

// Spawning worker threads is slow enough on a loaded machine to overrun
// vitest's 5 s default, so every test here carries an explicit budget.
const WORKER_TEST_TIMEOUT = 30_000;

describe("worker-backed property lane (check 3b)", () => {
  it(
    "runs a sound property to completion inside a worker",
    async () => {
      await expect(workerAssert(soundProperty, { numRuns: 25 })).resolves.toBeUndefined();
    },
    WORKER_TEST_TIMEOUT,
  );

  it(
    "kills a deliberately hung property on timeout",
    async () => {
      const startedAt = Date.now();
      await expect(
        workerAssert(hungProperty, { numRuns: 1, timeout: 1000, endOnFailure: true }),
      ).rejects.toThrow(/Property failed/);
      // Tight enough that the 1 s library timeout — not some ambient give-up —
      // is pinned as the cause: an unkilled `for (;;) {}` would never return.
      expect(Date.now() - startedAt).toBeLessThan(5_000);
    },
    WORKER_TEST_TIMEOUT,
  );

  it(
    "leaves the runner alive after the kill",
    async () => {
      expect(1 + 1).toBe(2);
      await expect(workerAssert(soundProperty, { numRuns: 10 })).resolves.toBeUndefined();
    },
    WORKER_TEST_TIMEOUT,
  );
});
