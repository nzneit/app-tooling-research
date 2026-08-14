# Findings — ingress-and-test-lane

**Status**: in progress
**Track**: [0070-state-concurrency](../../research-plan.md)
**Report**: [report.md](../../report.md)
**Date started**: 2026-08-14

Scope so far: the first three report checks (composition wiring, the schedulable ingress seam,
regression pinning). The `xstate/graph` path suite, the cancellation chain, the optimistic-update
unit and the invalidate-don't-set bridge are not yet exercised.

Interfaces implemented per [design.md](design.md)'s **Chosen interface**: `createStateKit` /
`StateKit`, `StreamDecl` / `DispatchTarget` (machine + store + query arms), `Wire` (both arms),
`IngressFeed`, `createRaceHarness` / `RaceHarness`, `IngressStats`, `IngressInspectionEvent`,
`IngressConfigError`. Pinned runtime: xstate 5.32.5, zustand 5.0.15, fast-check 4.9.0,
@fast-check/worker 0.6.0, vitest 4.1.10, typescript 7.0.2, Node 24.18.0.

**Suite**: 7 files, 30 tests, all passing; `npm run typecheck` clean.

## Checks

| Report check | Verdict | Evidence |
|---|---|---|
| **Composition wiring end to end** — machine → vanilla store → React and store → machine on the app's actual xstate/zustand versions | **go** | `test/composition.test.ts::carries machine -> store -> React and store -> machine through Wire declarations` — `actor.subscribe` → store action → `useStore` selector renders `42` in happy-dom (React 19.2.8 + RTL 16.3.2); `store.subscribe(selector, (next, prev))` → `actor.send` lands `7` in machine context; `kit.dispose()` cuts both wires (a later `THROTTLE 99` leaves the store at `7`). Both directions declared as two `Wire` literals. |
| **…measure the glue in lines** | **go** | `test/glue-count.test.ts::wires both directions in a bounded number of caller-authored lines` counts the marked regions in `test/composition.test.ts`: **10 caller-authored lines** through `wires: Wire[]` + `createStateKit`, vs **30 lines** hand-rolled to reach the same wiring shape (equals short-circuit, run-to-completion mailbox, ordered teardown) — a **3.0×** reduction. Of the 30 baseline lines, **~12 are the inlined mailbox/run-to-completion mechanics** (`mailbox`, `draining`, `runToCompletion`) that `createStateKit` gets for free — excluding them leaves an 18-line baseline, an **~1.8×** reduction, which is the fairer like-for-like number for the subscribe/send/teardown wiring itself. Note also that the two sides are not asserted to the same depth: the baseline test (`converges a write-back listener…`, manual block) checks only final values after settling, whereas the kit-side re-entrancy test additionally asserts wire-callback nesting depth — so "same guarantees" overstates it; the manual baseline is not shown to guard against re-entrancy the way the kit-side assertion does. Counts are non-blank, non-comment lines and are asserted, so they cannot drift silently. |
| **…no feedback loop or re-entrancy hazard under synchronous listener fan-out** | **go** | `test/composition.test.ts::converges a write-back listener at a bounded dispatch count, with no re-entrancy` — a genuine cycle (the machine clamps whatever the store writes back at it, so the projection really changes) settles at **2 store writes / 2 machine sends** and terminates at 10; observed nesting depth of the wire callback is **1**, i.e. invariant 9's shared mailbox queued the re-entrant send instead of recursing. |
| **Schedulable ingress seam (decisive)** — `fc.scheduler` property, scheduled synthetic MQTT vs scheduled REST resolution, stale write rejected | **go** | `test/ingress-race.test.ts::rejects the stale REST write under every fc-chosen interleaving (stamped guard)` — 200 runs, **12 distinct scheduler task orderings** explored. Per run: every accepted write strictly increases, `dispatched + stale === 3` (accounting closes), and the store converges to the newest stamp (v3) in *every* interleaving. Non-vacuity is asserted: fc produced both REST-lands-first runs (22/200) and runs where the guard rejected a stale write (191/200). Pipeline order itself pinned by `test/ingress-pipeline.test.ts::runs dedup -> guard -> mask -> dispatch in order, once per message` (the inspect tap yields exactly `dedup:pass, guard:pass, mask:pass, dispatch:pass`). |
| **…the failure replays from `{seed, path}`** | **go** | `test/replay-and-pinning.test.ts::reproduces the identical scheduler interleaving from the reported seed and path`. **Mechanism verified**: (1) `fc.check(property, { numRuns: 500, endOnFailure: true })` returns `RunDetails` carrying `seed` and `counterexamplePath`; (2) `fc.check(sameProperty, { seed, path: counterexamplePath, endOnFailure: true })` re-runs with `numRuns === 1` and the same `counterexamplePath`; (3) verified *beyond* "it failed again" — each run records `s.report()` filtered to released tasks and mapped to `taskId`, and the two runs' orderings are asserted `toStrictEqual`, i.e. the same interleaving, not merely the same verdict. A representative discovery: failure on run 1, `seed 11863131`, `path "0"`, task ordering `[1, 4, 3, 2]`. |
| **Regression pinning** — found interleaving → `fc.schedulerFor`, deterministic in CI | **go** | `test/replay-and-pinning.test.ts::rejects the stale write deterministically under fc.schedulerFor (stamped)` — `fc.schedulerFor([2, 3, 1, 4])` (both MQTT pushes released, then the REST call settles and its hydrate lands last) with no fast-check search: `writes === [2, 3]`, `stats.stale === 1`, `stats.dispatched === 2`, final version 3. The same harness code takes `fc.scheduler()` or `fc.schedulerFor(ordering)`, per design.md's `createRaceHarness(s: fc.Scheduler)`. |
| **…`@fast-check/worker`, a deliberately hung property killed without taking the runner down** | **go** | `test/worker-lane.test.ts` (3 tests). `propertyFor(new URL(import.meta.url), { isolationLevel: "predicate" })` lives in its own module `test/hung-property.ts` per the library's model. A predicate containing a synchronous `for (;;) {}` fails in **~1.09 s** under `{ timeout: 1000, endOnFailure: true }` with `Property failed after 1 tests / Counterexample: [7]` — on the main thread this would wedge the runner permanently, so the bounded return is itself the proof the worker was terminated. The two sibling tests in the same file (one of them a second worker-backed property) run to completion afterwards: the runner survived. |

## Deviations

Environment and interface deviations, per the spike harness spec.

1. **`@tanstack/react-query` is not installed** (not needed by these three checks). design.md's
   interface imports `QueryKey` and `QueryClient` from it; `src/types.ts` declares both
   structurally instead (`QueryKey = readonly unknown[]`, `QueryClientLike` = the
   `invalidateQueries` slice the ingress touches). Swapping in the real imports is a type-only
   change — no member of the surface moves. The query `DispatchTarget` arm is implemented
   (invalidate-don't-set plus the `family`/seen-key gap sweep) but is exercised only by the
   composition-root error-mode test; Task 9 owns the real bridge check. This spike implements
   invalidate-don't-set only, not the stamp-guarded write path design.md's `write` member names —
   so `createStateKit` throws `IngressConfigError` at construction if a query stream declares
   `dispatch.write`, rather than silently ignoring it (`test/ingress-pipeline.test.ts::refuses a
   query target that declares 'write', at the composition root`). Task 9 lands the stamped write
   path and lifts the restriction.
2. **`StateKit.optimisticMutation` / `useOptimisticMutation` are not implemented** — deferred to
   Task 9 per the task brief. They are absent from `StateKit`, not redesigned. The mask stage of
   the pipeline IS implemented and correctly ordered.
3. **`SpikeInternals.__maskHold` is an addition to the surface, not in design.md.** Because mask
   holds are registered by the (not-yet-built) optimistic unit, the mask stage would otherwise be
   unreachable — and therefore untestable — through the public interface. The spike exposes the
   registration under a `__` name so invariant 6 can be verified now
   (`test/ingress-pipeline.test.ts::withholds the latest masked item and releases it through
   guard -> dispatch`). Task 9 should delete it once `optimisticMutation` registers holds.
4. **`RaceHarness.settle()` uses `s.waitIdle()`, not `s.waitAll()`.** design.md names `waitAll`
   parenthetically; fast-check 4.9.0 deprecates it in favour of `waitIdle`, which also awaits
   tasks scheduled *by* a released task — exactly the shape check 2 needs (the REST resolution
   schedules its own ingress delivery). `settle()` loops `waitIdle` plus a microtask flush until
   `s.count() === 0`, so it is correct under either.
5. **`RaceHarness.wrap` checks the abort signal after the scheduled release, not at call time.**
   `s.scheduleFunction(f)` invokes `f` eagerly and schedules only its *resolution*, so a call-time
   check could not see a signal aborted while the call was parked. The wrapper checks both (fast
   path on entry, and again at the commit point), per invariant 10. Evidence:
   `test/ingress-pipeline.test.ts::rejects a scheduler-wrapped REST call whose signal aborted
   before it settled`.
6. **Synthetic everything.** No broker, no 0060 boundary, no orval client, no server: the feed is
   `RaceHarness.feed` (the design's second adapter at the seam) and the REST leg is a
   scheduler-wrapped in-memory fake. Messages are hand-built `ValidatedMessage`s — 0010's
   validators are assumed upstream, as design.md specifies ("the kit never re-validates").
7. **React-rendering tests run under happy-dom**, not a browser (`// @vitest-environment happy-dom`
   in `test/composition.test.ts`); every other file runs in the Node environment.
8. **`@types/react` / `@types/react-dom` were added** beyond the brief's install list —
   `tsc --noEmit` cannot resolve `react` without them. Resolved to 19.2.18 / 19.2.4.

### Assumption touchpoints

- **A-2 (React ≥18, React 19 unknown)** — `react` and `react-dom` at `latest` resolved to
  **19.2.8**, i.e. **React major 19**. zustand 5.0.15's `useStore` (useSyncExternalStore),
  `@testing-library/react` 16.3.2 and `react-dom/client` all work on it unmodified. This does not
  confirm the *app's* React major, only that the recommended kit runs on 19 — the A-2 fact
  re-check still needs the app profile. `useOptimistic` itself was not exercised.
- **A-1 (no server-issued ordering stamp today) — the pivotal finding of this spike.** The
  monotonic guard rejects the stale REST write **only in stamped mode**. The same race with the
  `stamp` selector omitted is recorded honestly as its counterpart:
  `test/ingress-race.test.ts::cannot reject the stale REST write while unstamped (A-1, honest
  counterpart)` — over 200 runs `stats.stale === 0` and all three deliveries are written, and fc
  finds interleavings where the store ends at the *oldest* version (v1). Pinned deterministically
  at `test/replay-and-pinning.test.ts::shows the same pinned interleaving losing the race while
  unstamped`: `writes === [2, 3, 1]`, final version **1**. Epoch rules carry no ordering signal
  across the two legs, so unstamped adjudication is last-writer-wins by construction. This is
  evidence *for* the report's position, not against it: it is precisely why invalidate-don't-set
  is the interim rule for dual-leg entities and why the stamp is a raised contract requirement.
  Adding the stamp is one selector per stream — no caller reshaping, as designed.
- **A-4 / A-5 (xstate v5, zustand v4-or-5)** — both wires bind structurally to the real
  xstate 5.32.5 actor (`subscribe` / `getSnapshot` / `send`) and the real zustand 5.0.15 vanilla
  store with `subscribeWithSelector`, with no adapter shims and no casts at the wire declarations.
- **A-7 (≤ ~1k msg/s)** — not measured. The pipeline is *not* uniformly O(1) per message as
  designed: stream routing (`pipeline()`) does a **linear `entries.find(e => e.match(msg.topic))`
  scan** over the declared streams, so per-message cost is O(streams) there; dedup/guard/mask are
  map lookups plus a compare. At the stream counts a spike of this shape would realistically
  declare, the linear scan is not expected to dominate, but no throughput number was taken.
- **A-9 (vitest)** — vitest 4.1.10 hosts `fc.assert`, `fc.check`, `fc.schedulerFor` and
  `@fast-check/worker`'s `assert` with no adapter package. `@fast-check/worker` needed no
  transpilation step: its worker loads the raw `.ts` predicate module directly under Node 24's
  type stripping, provided that module imports nothing from the test runner.

## Decision impact

- **Supports D-0016 / the report's Key question 7 recommendation.** The single-dispatch ingress
  (dedup → guard → mask → dispatch) is buildable behind two entry points, and the seam is
  schedulable: `fc.scheduler` drives it, `fc.schedulerFor` pins it, `{seed, path}` replays it.
  The report's architectural precondition ("race properties become cheap only after the ingress
  seam exists") holds and is now demonstrated rather than argued.
- **Supports the report's fast-check/worker CI shape.** Per-PR `fc.assert` at reduced `numRuns`,
  nightly under `@fast-check/worker`, and an `fc.schedulerFor` regression per fixed race are all
  runnable in this stack today with no adapter packages.
- **Sharpens the A-1 contract request with measured evidence.** The unstamped counterpart tests
  quantify what the missing stamp costs: with no stamp, a REST resolution that loses the race
  silently overwrites newer MQTT state (final version 1 instead of 3) and nothing is counted as
  stale — the client cannot even *observe* the loss. Recommend citing these two tests when the
  ordering-stamp requirement goes to the app owner and 0010.
- **No amendment proposed.** Findings never change a decision by themselves; nothing here
  contradicts an accepted decision.
