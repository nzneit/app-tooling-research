# Spike: ingress-and-test-lane

Part of `0070-state-concurrency`. Scope: the report checks listed in [findings.md](findings.md).
Interfaces come from [design.md](design.md) ("Chosen interface" + its 11 invariants).

## Layout

| Path | Role |
|---|---|
| `src/kit.ts` | ENTRY POINT 1 — `createStateKit`: dedup → guard → mask → dispatch, wires, gap handling, teardown |
| `src/harness.ts` | ENTRY POINT 2 — `createRaceHarness`: the fc.scheduler test adapter of the `IngressFeed` seam |
| `src/topic.ts` | MQTT topic-pattern matching (`+` / `#`) and wildcard detection |
| `src/types.ts` | the public interface types |
| `test/composition.test.ts` | check 1 — machine ↔ store ↔ React, bounded write-back convergence (happy-dom) |
| `test/glue-count.test.ts` | check 1 — the glue-line numbers recorded in findings.md, pinned |
| `test/ingress-race.test.ts` | check 2 — the `fc.scheduler` race property (stamped + unstamped) |
| `test/ingress-pipeline.test.ts` | check 2 — pipeline order and invariants 1/3/4/6/8/10/11 |
| `test/replay-and-pinning.test.ts` | check 2 replay + check 3a — `{seed, path}` and `fc.schedulerFor` |
| `test/hung-property.ts` + `test/worker-lane.test.ts` | check 3b — the `@fast-check/worker` lane |

## Run

npm ci && npm test

Isolated per the
[spike harness spec](../../../../docs/superpowers/specs/2026-08-14-spike-harness-design.md):
standalone package, exact-pinned deps, no imports across the spike boundary.
