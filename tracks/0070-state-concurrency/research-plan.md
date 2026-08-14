# 0070-state-concurrency — research plan

**Status**: draft

## Goal

Decide the blessed composition patterns for the Zustand + xstate layer with
race-condition prevention as a first-class design goal. The track produces a race
taxonomy for this app's traffic shape (concurrent MQTT events and REST responses feeding
shared stores), sorts each race into architecturally-solved vs tooling-solved, and
recommends the store-and-machine composition idiom plus the test and lint tooling that
keeps races out. Coordinates with 0060: validated messages enter state only through the
transport boundary.

## Key questions

1. Race taxonomy: which races does this app face — stale REST response vs fresher MQTT
   event, out-of-order MQTT messages, double-submit, optimistic-update rollback,
   reconnect replay — and what evidence exists for each?
2. Which races are solved architecturally — state machines, single-writer stores, actor
   ownership, monotonic guards at ingress — and what are the blessed Zustand-xstate
   composition patterns: which state lives in stores vs machines, and how do actors and
   stores wire together?
3. Which races are solved by tooling — lint rules, fast-check property tests,
   @xstate/test model-based tests — and what is the CI shape?
4. @xstate/store: does it replace or complement Zustand in this stack?
5. TanStack Query overlap with 0060: if the boundary adopts it for REST lifecycle, which
   races disappear for free (dedup, cancellation, staleness tracking) and which remain?
6. Cancellation idiom: AbortController propagation, RxJS switchMap semantics, Effect
   interruption, xstate actor stop — which does the app standardize on, and how does it
   cross the 0060 boundary?
7. Ingress ordering: how does validated 0060 output enter stores — a single dispatch
   path per topic? What guard decides stale-vs-fresh when a REST response races an MQTT
   event?

## Candidates

- xstate v5 actors — https://github.com/statelyai/xstate — actor model, state machines
- @xstate/store — https://github.com/statelyai/xstate — small store from the xstate team
- Zustand middleware patterns — https://github.com/pmndrs/zustand — official middlewares and store patterns
- TanStack Query — https://github.com/TanStack/query — request lifecycle (shared candidate with 0060)
- RxJS cancellation semantics — https://github.com/ReactiveX/rxjs — switchMap/exhaustMap idioms as prior art
- Effect — https://github.com/Effect-TS/effect — structured concurrency, interruption
- fast-check — https://github.com/dubzzz/fast-check — property-based testing; fc.scheduler for race scheduling
- @xstate/test — https://github.com/statelyai/xstate — model-based test generation

## Survey verification notes

- The deliverable is patterns + tooling, not one library: expect a recommendation naming
  an idiom set plus adopted test tooling — possibly "build (patterns) + adopt (test tools)".
- Verify @xstate/test's xstate-v5 status; it historically lagged xstate major versions.
- fast-check's `fc.scheduler()` race-detection arbitrary is the feature to assess, not
  general property testing.

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | n-a |
| Integration cost | high |
| Runtime overhead | medium |
| Output quality | medium |
| Escape hatch | high |

## Facts needed

- Which stores and machines exist today; where races have actually bitten (bug history)
- MQTT ordering metadata availability (shared with 0060)
- Test framework in use (for fast-check and @xstate/test integration)
- Team appetite for RxJS or Effect (shared with 0060)
