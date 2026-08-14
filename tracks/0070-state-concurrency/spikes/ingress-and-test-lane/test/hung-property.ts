// Worker-backed properties. Per @fast-check/worker's model the predicate file
// is re-executed inside a dedicated worker thread, so it lives in its OWN
// module and imports nothing from the test runner — only fast-check and
// @fast-check/worker, both resolvable from this spike's node_modules.
// Node ≥22.18 strips the TypeScript annotations when the worker loads it.

import fc from "fast-check";
import { propertyFor } from "@fast-check/worker";

const property = propertyFor(new URL(import.meta.url), { isolationLevel: "predicate" });

/** Well-behaved: proves the worker lane itself carries a normal property. */
export const soundProperty = property(fc.integer(), fc.integer(), (a: number, b: number) => {
  return a + b === b + a;
});

/**
 * Deliberately hung: a synchronous infinite loop. On the main thread this would
 * wedge the runner forever — fast-check could neither shrink nor report. The
 * input is constant so the hang is hit on run 1, deterministically.
 */
export const hungProperty = property(fc.constant(7), (n: number) => {
  if (n === 7) {
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      /* never yields */
    }
  }
  return true;
});
