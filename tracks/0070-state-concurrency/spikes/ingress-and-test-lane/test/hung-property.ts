// Worker-backed properties. Per @fast-check/worker's model the predicate file
// is re-executed inside a dedicated worker thread, so it lives in its OWN
// module and imports nothing from the test runner — only fast-check and
// @fast-check/worker, both resolvable from this spike's node_modules.
// Node ≥22.18 strips the TypeScript annotations when the worker loads it.

import fc from "fast-check";
import { propertyFor } from "@fast-check/worker";

// This module is re-executed inside every spawned worker, so it must stay free
// of top-level side effects — building properties only.

/** Default isolation ("file"): workers are reused across runs. ~0.4 s for 25
 *  runs, versus ~7.7 s at "predicate" (one worker spawn per run) — measured. */
const sharedWorkerProperty = propertyFor(new URL(import.meta.url));

/** One worker per predicate run: what a property that may wedge its worker
 *  needs, so a hung run cannot poison a reused worker. */
const isolatedWorkerProperty = propertyFor(new URL(import.meta.url), {
  isolationLevel: "predicate",
});

/** Well-behaved: proves the worker lane itself carries a normal property. */
export const soundProperty = sharedWorkerProperty(
  fc.integer(),
  fc.integer(),
  (a: number, b: number) => a + b === b + a,
);

/**
 * Deliberately hung: a synchronous infinite loop. On the main thread this would
 * wedge the runner forever — fast-check could neither shrink nor report. The
 * input is constant so the hang is hit on run 1, deterministically.
 */
export const hungProperty = isolatedWorkerProperty(fc.constant(7), (n: number) => {
  if (n === 7) {
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      /* never yields */
    }
  }
  return true;
});
