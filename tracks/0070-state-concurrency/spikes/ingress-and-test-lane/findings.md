# Findings — ingress-and-test-lane

**Status**: complete
**Track**: [0070-state-concurrency](../../research-plan.md)
**Report**: [report.md](../../report.md)
**Date started**: 2026-08-14

Scope: **every** 0070 report check that a desk spike can settle — composition wiring, the
schedulable ingress seam, regression pinning, the `xstate/graph` path suite, the cancellation
chain, the optimistic-update unit, and the invalidate-don't-set bridge (including its oxlint
layering check). The report's remaining two items are not spike checks: the ordering-stamp
**contract question** is raised through intake (see Decision impact), and the **fact re-checks**
need the app profile, not code — what this spike can say about them is recorded under Assumption
touchpoints.

Interfaces implemented per [design.md](design.md)'s **Chosen interface**, now in full:
`createStateKit` / `StateKit` (including `optimisticMutation` and `useOptimisticMutation`),
`StreamDecl` / `DispatchTarget` (machine + store + query arms, with the stamped `write` fast path),
`Wire` (both arms), `IngressFeed`, `createRaceHarness` / `RaceHarness`, `IngressStats`,
`IngressInspectionEvent`, `IngressConfigError`. Pinned runtime: xstate 5.32.5, zustand 5.0.15,
@tanstack/react-query 5.101.4, fast-check 4.9.0, @fast-check/worker 0.6.0, react 19.2.8,
happy-dom 20.11.2, oxlint 1.78.0, vitest 4.1.10, typescript 7.0.2, Node 24.18.0, darwin/arm64.

**Suite**: 13 files, 58 tests, all passing; `npm run typecheck` clean.

## Checks

| Report check | Verdict | Evidence |
|---|---|---|
| **Composition wiring end to end** — machine → vanilla store → React and store → machine on the app's actual xstate/zustand versions | **go** | `test/composition.test.ts::carries machine -> store -> React and store -> machine through Wire declarations` — `actor.subscribe` → store action → `useStore` selector renders `42` in happy-dom (React 19.2.8 + RTL 16.3.2); `store.subscribe(selector, (next, prev))` → `actor.send` lands `7` in machine context; `kit.dispose()` cuts both wires (a later `THROTTLE 99` leaves the store at `7`). Both directions declared as two `Wire` literals. |
| **…measure the glue in lines** | **go** | `test/glue-count.test.ts::wires both directions in a bounded number of caller-authored lines` counts the marked regions in `test/composition.test.ts`: **10 caller-authored lines** through `wires: Wire[]` + `createStateKit`, vs **30 lines** hand-rolled to reach the same wiring shape (equals short-circuit, run-to-completion mailbox, ordered teardown) — a **3.0×** reduction. Of the 30 baseline lines, **~12 are the inlined mailbox/run-to-completion mechanics** (`mailbox`, `draining`, `runToCompletion`) that `createStateKit` gets for free — excluding them leaves an 18-line baseline, an **~1.8×** reduction, which is the fairer like-for-like number for the subscribe/send/teardown wiring itself. Note also that the two sides are not asserted to the same depth: the baseline test (`costs more glue when hand-rolled without the kit (baseline)`, test/composition.test.ts:154) checks only final values after settling, whereas the kit-side re-entrancy test additionally asserts wire-callback nesting depth — so "same guarantees" overstates it; the manual baseline is not shown to guard against re-entrancy the way the kit-side assertion does. Counts are non-blank, non-comment lines and are asserted, so they cannot drift silently. |
| **…no feedback loop or re-entrancy hazard under synchronous listener fan-out** | **go** | `test/composition.test.ts::converges a write-back listener at a bounded dispatch count, with no re-entrancy` — a genuine cycle (the machine clamps whatever the store writes back at it, so the projection really changes) settles at **2 store writes / 2 machine sends** and terminates at 10; observed nesting depth of the wire callback is **1**, i.e. invariant 9's shared mailbox queued the re-entrant send instead of recursing. |
| **Schedulable ingress seam (decisive)** — `fc.scheduler` property, scheduled synthetic MQTT vs scheduled REST resolution, stale write rejected | **go** | `test/ingress-race.test.ts::rejects the stale REST write under every fc-chosen interleaving (stamped guard)` — 200 runs, **12 distinct scheduler task orderings** explored. Per run: every accepted write strictly increases, `dispatched + stale === 3` (accounting closes), and the store converges to the newest stamp (v3) in *every* interleaving. Non-vacuity is asserted: fc produced both REST-lands-first runs (22/200) and runs where the guard rejected a stale write (191/200). Pipeline order itself pinned by `test/ingress-pipeline.test.ts::runs dedup -> guard -> mask -> dispatch in order, once per message` (the inspect tap yields exactly `dedup:pass, guard:pass, mask:pass, dispatch:pass`). |
| **…the failure replays from `{seed, path}`** | **go** | `test/replay-and-pinning.test.ts::reproduces the identical scheduler interleaving from the reported seed and path`. **Mechanism verified**: (1) `fc.check(property, { numRuns: 500, endOnFailure: true })` returns `RunDetails` carrying `seed` and `counterexamplePath`; (2) `fc.check(sameProperty, { seed, path: counterexamplePath, endOnFailure: true })` re-runs with `numRuns === 1` and the same `counterexamplePath`; (3) verified *beyond* "it failed again" — each run records `s.report()` filtered to released tasks and mapped to `taskId`, and the two runs' orderings are asserted `toStrictEqual`, i.e. the same interleaving, not merely the same verdict. A representative discovery: failure on run 1, `seed 11863131`, `path "0"`, task ordering `[1, 4, 3, 2]`. |
| **Regression pinning** — found interleaving → `fc.schedulerFor`, deterministic in CI | **go** | `test/replay-and-pinning.test.ts::rejects the stale write deterministically under fc.schedulerFor (stamped)` — `fc.schedulerFor([2, 3, 1, 4])` (both MQTT pushes released, then the REST call settles and its hydrate lands last) with no fast-check search: `writes === [2, 3]`, `stats.stale === 1`, `stats.dispatched === 2`, final version 3. The same harness code takes `fc.scheduler()` or `fc.schedulerFor(ordering)`, per design.md's `createRaceHarness(s: fc.Scheduler)`. |
| **…`@fast-check/worker`, a deliberately hung property killed without taking the runner down** | **go** | `test/worker-lane.test.ts` (3 tests). `propertyFor(new URL(import.meta.url), { isolationLevel: "predicate" })` lives in its own module `test/hung-property.ts` per the library's model. A predicate containing a synchronous `for (;;) {}` fails in **~1.09 s** under `{ timeout: 1000, endOnFailure: true }` with `Property failed after 1 tests / Counterexample: [7]` — on the main thread this would wedge the runner permanently, so the bounded return is itself the proof the worker was terminated. The two sibling tests in the same file (one of them a second worker-backed property) run to completion afterwards: the runner survived. |
| **`xstate/graph` path suite** — generate a shortest-paths suite with `filterEvents` against a production-shaped machine, on the app's actual xstate minor | **go** | `test/path-suite.test.ts` (9 tests). `import { getShortestPaths } from "xstate/graph"` resolves **inside core xstate 5.32.5** (`require.resolve` lands in `node_modules/xstate/`; `@xstate/graph` and `@xstate/test` are absent and asserted to be unresolvable) — the report's "core xstate ≥5.20.0" claim holds at the pinned minor with **no new dependency**. From an `idle → submitting → success/failure` machine with a retry edge and a cancel edge, `getShortestPaths` yields **4 paths — one per reachable state** (each opening with the synthetic `xstate.init` step), and **every generated path runs as its own test** against a live actor, asserting the actor's state at *every* step, not only at the end. `filterEvents` works and is honestly characterised: filtering `CANCEL` leaves the count at 4 (CANCEL returns to an already-reached state, so it lies on no shortest path) but guarantees no generated path uses the edge; filtering `FAILURE` — the only entry to `failure` — really does shrink the suite to **3 paths** over 3 states. |
| **…decide abstract-model vs production-machine reuse** | **go (with a stated boundary)** | Reuse works **only for machines whose transitions are caller-sendable events**. `test/path-suite.test.ts::cannot traverse past an invoke: done/error events are not caller-sendable` — the same flow written the production way (`submitting` invokes a `fromPromise`, with `onDone`/`onError`) generates paths reaching **2 of 4 states**: traversal calls `logic.transition()` with no running actor system, the invoked promise never settles, and `xstate.done.actor.*` is never emitted, so `success` and `failure` are unreachable *by generation* even though a live actor reaches them in milliseconds. **Verdict**: point `getShortestPaths` at the machine's *event-driven* shape — either the production machine where async outcomes arrive as events (the pattern this track already blesses: the ingress dispatches events, actors do not fetch inline), or a small abstract sibling model for flows built on `invoke`. Do not expect one generated suite to cover an invoke-heavy chart. Also recorded: shortest paths cover every **state** but not every **edge** (`RETRY` and `RESET` reach no new state and are omitted) — edge coverage needs `getSimplePaths` or a hand-written test, and the suite must not be sold as transition coverage. |
| **…assess whether xstate-audition's helpers are worth vendoring** | **no-go (don't vendor)** | The capability that was actually missing when driving a live actor through generated paths is "wait until the snapshot satisfies a predicate". `test/path-suite.test.ts::the same production machine IS drivable live — with ~10 lines of local helper` implements it inline in **12 lines** over `actor.subscribe` + `getSnapshot` + a timeout, and drives the invoke-based machine to `success`. Against that, xstate-audition is ~388 weekly downloads, single maintainer, quiet ~21 months (report candidate list). Vendoring buys ~12 lines of code and costs a copy to maintain: **recommend the local helper**, and revisit only if live-actor assertions grow past a handful of shapes. |
| **Cancellation chain** — actor stop → `fromPromise` signal → mutator → fetch abort | **go** | `test/cancellation.test.ts::aborts the in-flight fetch when the actor stops, and calls it a cancellation` — a `fromPromise` child actor forwards its xstate-supplied `signal` (asserted `instanceof AbortSignal`, i.e. the ≥5.13.0 floor is live at 5.32.5) into a **local mutator-shaped wrapper** which forwards it into an injected `fetch`. `actor.stop()` alone aborts the in-flight request: the fake fetch records `aborted === true` for `/rig/1`. The chain has no missing link — and the assertion that the signal reached `fetch` is exactly the check that catches 0060's refined two-step result: `TS2353` at compile time on the naive binding, and a silent drop only after the request type is widened to make it build. |
| **…`AbortError` normalized as a cancellation outcome, not a taxonomy class** | **go, with a cross-track reconciliation to record** | `test/cancellation.test.ts::keeps AbortError OUT of the four-class taxonomy, while real failures stay in it`: an HTTP 409 with a *declared* body normalizes to class 3 and stays a taxonomy error, while an aborted fetch resolves as a cancellation. **The reconciliation the report asked for**: 0060's own spike normalizer classifies an aborted fetch as **class 1 with `reason: 'aborted'`** (`transport-boundary/errors`), i.e. *inside* the taxonomy, and excludes it from its retry predicate. Both can be true: the boundary keeps `reason: 'aborted'` for retry decisions, and the state layer maps it to a cancellation before any consumer sees it. `isCancellation()` in `src/optimistic.ts` therefore recognises **three** shapes — a platform `AbortError`, TanStack's `CancelledError`, and a class-1/`reason: 'aborted'` boundary error — and `kit.optimisticMutation` returns `{ outcome: 'cancelled' }` for all three, never `{ outcome: 'rolledBack' }`. **Action for the gate**: record this mapping with the owners of `transport-boundary/errors`; it is a one-function contract, not a taxonomy change. |
| **…`AbortSignal.any()` composition: a boundary-owned signal aborts all in-flight work on simulated connection loss** | **go** | `test/cancellation.test.ts::aborts EVERY in-flight call from one boundary-owned signal` — three concurrent in-flight fetches (two kit-bound mutations, which compose `AbortSignal.any([kit.signal, per-call])` internally, plus one machine-driven `fromPromise` composing `AbortSignal.any([kit.signal, actorSignal])` explicitly). One `boundary.abort()` aborts **all three** (`aborted === [true, true, true]`, all three URLs in the abort log), disposes the kit, resolves both mutations as `{ outcome: 'cancelled' }`, normalizes the machine leg as a cancellation, and rolls both optimistic writes back out of the cache. The converse is asserted too (`does not let one actor's abort touch another's in-flight work`): a per-actor abort cancels only its own call and leaves `kit.signal` unaborted. |
| **Optimistic-update unit** — implement the wrapper (`cancelQueries` + snapshot + rollback + `isMutating` gate) | **go** | `test/optimistic.test.ts::runs cancelQueries -> snapshot -> optimistic write -> mask hold, in that order` — the four steps are observed in design.md's exact order (spies record `["cancelQueries", "getQueryData", "setQueryData"]`, and step 4 is observed *through the ingress*: a push for the same entity is withheld while the mutation is in flight, then released through guard → dispatch at settle). The bundle is non-optional by construction — there is no option to skip a step. Rollback: `rolls back to the exact snapshot on failure, leaving the error untouched` (cache restored; the error is returned by identity, not re-wrapped). Settle gate: `gates reconciliation on the last in-flight mutation for the key` — with two overlapping mutations, the first settle invalidates **nothing** and the second invalidates exactly once, for the key and its `alsoInvalidate` extras. The React adapter runs the same internals through TanStack's lifecycle (`test/optimistic-hook.test.tsx`, 3 tests, happy-dom): optimistic value visible while `isPending`, `UseMutationResult` returned unchanged, rollback on failure. |
| **…the `fc.scheduler` property interleaving two mutations and a refetch (the maintainer-documented residual race is the acceptance test)** | **go — the race is real, and the bundle converges anyway** | `test/optimistic.test.ts::converges on the server value in EVERY interleaving, and never reconciles early` — 60 runs over `fc.scheduler()` × two booleans (does the second mutation fail; does the refetch start before or after the mutations). Per run: the settle gate fires **exactly one** reconciliation (`invalidateCalls === 1`) no matter how the tasks interleave; a failed mutation leaves neither client nor server trace (`server === 1`, outcomes `["confirmed", "rolledBack"]`); and the cache **converges on the server's value in every interleaving**. Non-vacuity is measured **by the committed suite**, not asserted in prose: the property builds a Set of the scheduler orderings it explored (from `s.report()`, as `test/ingress-race.test.ts` does) and asserts `orderings.size > 1` — so fc cannot quietly run one interleaving 60 times — plus `rollbacks > 0` and `staleOverwrites > 0`, where a run counts as having hit the residual race when an observed cache value moves *backwards* (an optimistic value replaced by older server data). Representative figures over three seeded runs: **8 distinct orderings** each time, **41-53 of 60 runs** hitting the backwards move, **27-35** rollback runs. So the maintainer-documented race between a refetch and an in-flight optimistic write **does happen** and is user-visible as a transient flicker; what the bundle guarantees is that it is transient — the settle-gate invalidation reconciles it, and the property fails if it ever does not. |
| **Invalidate-don't-set bridge** — one push-covered query (`staleTime: Infinity`), MQTT → `invalidateQueries`, no query data copied into Zustand | **go** | `test/bridge.test.ts::keeps REST the cache's single writer: the push event only invalidates` — a dual-leg entity (`rig/1`) served by a real `QueryObserver` at `staleTime: Infinity`, plus an MQTT-only entity (`alarm/1`) as the control so "nothing reached the store" cannot pass vacuously. A synthetic MQTT message carrying a tempting `speed: 999` payload causes **exactly one** REST refetch and **zero** cache writes of its own: every value the QueryCache ever holds carries `source: "rest"` (asserted over all cache updates), `999` never appears, and the Zustand store's write log contains only the MQTT-only entity's value. `staleTime: Infinity` is what makes the push the sole trigger — mounting a second observer afterwards adds no fetch. Gap handling stays write-free too (`bulk-invalidates the family on a reconnect gap, still without writing data`: `[["rig","1"], ["rig"]]` invalidated, `setQueryData` never called). The forward path is live and guarded: `writes the cache ONLY on the stamped fast path, always after cancelQueries` shows `cancelQueries → setQueryData` for a stamped message, a stale stamp dropped, and an unstamped message on the *same* stream falling back to invalidation. |
| **…the layering lint rejects a deliberate violation in this repo's oxlint version** | **go** | `test/layering-lint.test.ts` (5 tests) runs the real **oxlint 1.78.0** binary via `execFile` over `lint-fixtures/`. The violation fixture (a store module that reads the QueryCache *and* subscribes to the transport feed) exits **1** with two `eslint(no-restricted-imports)` diagnostics naming `'@tanstack/react-query'` and `'../query/rig-queries.ts'`; the clean store and the exempted composition root exit **0** with no diagnostics; a non-store module importing the transport feed exits **1** under the base rule. Both D-0002 rules — single-writer and no-store-copy — are expressible with `no-restricted-imports` alone, no new toolchain. |
| **…does 0010's oxlint overrides-merge caveat bite?** | **yes — it bites; mitigation verified** | `test/layering-lint.test.ts::CONFIRMS the overrides-merge caveat: an override REPLACES the base rule options`. In oxlint 1.78.0 an `overrides[].rules` entry **replaces** the base entry's options rather than merging them: the base config bans `**/transport/*` repo-wide and demonstrably fires on a non-store fixture, yet inside `**/stores/**` — where an override supplies its own `paths`/`patterns` — the base pattern is **silently gone** (2 diagnostics, not 3, and the transport import goes unflagged). This is a *false-negative* failure mode: the rule appears configured and quietly stops covering the very directory it most needs to cover. **Mitigation, verified in the same test**: restate every base pattern inside each override (`.oxlintrc.mitigated.json` → 3 diagnostics, transport included). Recommend the mitigation as the standing pattern, plus a lint-config test like this one wherever `overrides` is used. |

## Deviations

Environment and interface deviations, per the spike harness spec.

1. **Synthetic everything.** No broker, no 0060 boundary, no orval client, no server, no browser:
   the feed is `RaceHarness.feed` (the design's second adapter at the seam), the REST leg is a
   scheduler-wrapped in-memory fake or an injected `fetch`, and messages are hand-built
   `ValidatedMessage`s — 0010's validators are assumed upstream, as design.md specifies ("the kit
   never re-validates").
2. **The mutator and the four-class taxonomy are duplicated locally** in `test/mutator.ts`, not
   imported from the 0060 spike — the harness spec's isolation rule ("even when two spikes need
   the same helper, each carries its own copy"). It is a *shape* copy: `mutator(config, {signal,
   fetchImpl})` forwarding the signal into `fetch`, and a `BoundaryError` union of the same four
   classes including the same `reason: 'aborted'` case. The local wrapper's signature puts `signal`
   inside its **second** argument (`{signal, fetchImpl}`) — that is 0060 design.md's original sketch
   shape, the one 0060's own spike proved orval's `client: 'react-query'` output does **not** use
   (orval's `httpClient: 'axios'` convention threads `signal` through the mutator's **first**
   argument instead, and binding the sketch's shape literally against the real generated call site
   fails with `TS2353`). Consequence: this spike proves the *chain*
   works with a mutator-shaped function; it does not prove **orval's** generated mutator threads
   `signal` — that check belongs to the 0060 spike, which owns it.
3. **`RaceHarness.settle()` uses `s.waitIdle()`, not `s.waitAll()`.** design.md names `waitAll`
   parenthetically; fast-check 4.9.0 deprecates it in favour of `waitIdle`, which also awaits tasks
   scheduled *by* a released task — exactly the shape the race checks need. `settle()` loops
   `waitIdle` plus a microtask flush until `s.count() === 0`, and **throws
   `SettleNotQuiescentError`** rather than returning quietly with work outstanding (a silent return
   would let assertions pass vacuously against partial state).
4. **`RaceHarness.wrap` checks the abort signal after the scheduled release, not at call time.**
   `s.scheduleFunction(f)` invokes `f` eagerly and schedules only its *resolution*, so a call-time
   check could not see a signal aborted while the call was parked. The wrapper checks both (fast
   path on entry, and again at the commit point), per invariant 10.
5. **`IngressError.envelope` is widened to `ValidatedMessage | null`.** design.md types it
   `ValidatedMessage`; a wire fan-out failure has no message of its own, and the spike refuses to
   let it masquerade as a real envelope in an `onError` log.
6. **The stamped `write` path is implemented, and `cancelQueries` is *not* awaited before it.**
   design.md requires `write` to be "always preceded by `cancelQueries`", but the pipeline is
   synchronous by invariant 1 (one JS turn) while `cancelQueries` returns a promise. The kit
   *initiates* cancellation and then writes in the same turn; that is sufficient, because
   cancelling in-flight fetches happens synchronously inside `cancelQueries` — what the returned
   promise adds is only the awaiting of their unwinding. Awaiting it would break the one-turn
   pipeline. A stream declaring `write` **without** a `stamp` selector is now a composition-root
   error (`IngressConfigError`), since invariant 5 would make the member dead config.
7. **The settle gate counts in the kit, not in TanStack.** design.md says "the kit's `isMutating`
   count for the key"; this spike shows why that wording matters — `queryClient.isMutating()`
   returns **0** for framework-free `optimisticMutation` calls (they create no MutationCache
   entries), so delegating the gate to the QueryClient would fail open on exactly the surface the
   property suite exercises. On the React path the two agree (`isMutating() === 1` while pending,
   asserted). Both surfaces share one kit-owned counter keyed by `hashKey(queryKey)`.
8. **Rollback removes the query when there was no prior entry.** In TanStack Query v5 an updater
   yielding `undefined` **bails out**, so the documented `setQueryData(key, context.previous)`
   rollback silently does nothing when `previous` was `undefined` (asserted directly in
   `test/optimistic.test.ts`). `rollback()` therefore calls `removeQueries({ queryKey, exact:
   true })` in that case. This is a live footgun in the recipe the report cites, worth carrying
   into the app's shared wrapper.
9. **Cancellation rolls back too.** design.md spells out rollback for the error path; a cancelled
   mutation also has no confirmation, so the spike rolls back unconditionally and only the outcome
   label differs (`cancelled` vs `rolledBack`). With two concurrent mutations on one key, a
   rollback restores a snapshot that predates the other's optimistic write — the known TanStack
   caveat; the settle-gate invalidation is what reconciles it, and the fc property asserts the
   convergence rather than assuming it.
10. **`StateKit` carries the React hook, so the kit's module graph imports React.** design.md puts
    `optimisticMutation` and `useOptimisticMutation` on the same object; `src/react.ts` is a
    genuinely thin adapter, but any importer of the kit now pulls `react` transitively. Harmless
    here (Node tests import it fine); a real package should expose the hook from a `/react`
    subpath entry point so non-React consumers do not pay for it.
11. **React-rendering tests run under happy-dom**, not a browser
    (`// @vitest-environment happy-dom` in `test/composition.test.ts` and
    `test/optimistic-hook.test.tsx`); every other file runs in the Node environment. RTL's
    auto-cleanup does not self-register without vitest `globals`, so both files call
    `afterEach(cleanup)` explicitly.
12. **`@types/react` / `@types/react-dom` were added** beyond the brief's install list —
    `tsc --noEmit` cannot resolve `react` without them. Resolved to 19.2.18 / 19.2.4.
13. **Task 8's temporary `SpikeInternals.__maskHold` is deleted.** It existed only so the mask
    stage could be tested before the optimistic unit existed; `kit.optimisticMutation({ mask })`
    now registers holds for real, and the invariant-6 test runs through that path
    (`test/ingress-pipeline.test.ts::withholds the latest masked item and releases it through
    guard -> dispatch`). Nothing outside design.md's Chosen interface remains on `StateKit`.
14. **The lint fixtures are lint-only.** `lint-fixtures/**` is outside `tsconfig.json`'s `include`
    and outside vitest's `include`; those files are never typechecked or executed, only linted.
15. **Two exports beyond design.md's Chosen interface**, both deliberate and both small.
    `isCancellation(error)` is the recognizer that keeps a platform `AbortError`, TanStack's
    `CancelledError` and 0060's class-1 / `reason: 'aborted'` shape out of the taxonomy — it is
    the cross-track mapping named in the checks table, so it has to be callable and testable on
    its own rather than buried inside `mutate()`. `OptimisticConfigError` is thrown when a
    mutation is declared on a kit with no `queryClient`: design.md specifies that failure mode
    ("query targets (or any mutation use) without `queryClient`") but names only
    `IngressConfigError`, which `createStateKit` raises at construction — a mutation declared
    later needs its own throw site, on both the core and the hook (they now fail at the same
    point). Both are additive; no design.md member changed shape.

### Assumption touchpoints

- **A-1 (no server-issued ordering stamp today) — the pivotal finding of this spike.** The
  monotonic guard rejects the stale REST write **only in stamped mode**. The same race with the
  `stamp` selector omitted is recorded honestly as its counterpart:
  `test/ingress-race.test.ts::cannot reject the stale REST write while unstamped (A-1, honest
  counterpart)` — over 200 runs `stats.stale === 0` and all three deliveries are written, and fc
  finds interleavings where the store ends at the *oldest* version (v1). Pinned deterministically
  at `test/replay-and-pinning.test.ts::shows the same pinned interleaving losing the race while
  unstamped`: `writes === [2, 3, 1]`, final version **1**. Epoch rules carry no ordering signal
  across the two legs, so unstamped adjudication is last-writer-wins by construction. Task 9 adds
  the other half of the picture: the **stamped** path is now implemented end to end for query
  targets too (`cancelQueries → setQueryData`, stale stamps dropped, unstamped messages on the same
  stream falling back to invalidation), so the cost of the missing field is measurable in both
  directions — with the stamp, push writes the cache and the stale write is rejected; without it,
  the only safe rule is invalidate-don't-set and a REST round trip per event.
- **A-2 (React ≥18, React 19 unknown)** — `react` / `react-dom` resolved to **19.2.8**. zustand
  5.0.15's `useStore`, `@testing-library/react` 16.3.2, `react-dom/client` and
  @tanstack/react-query 5.101.4's `useMutation`/`useQuery`/`QueryClientProvider` all work on it
  unmodified, including the optimistic hook adapter. This does not confirm the *app's* React major,
  only that the recommended kit runs on 19. **`useOptimistic` was deliberately not used**: the
  bundle's state lives in the QueryCache (so the ingress mask and the settle gate can see it), and
  `useOptimistic` state is component-scoped and discarded on unmount — the report's conditional
  positioning of it survives this spike unexercised.
- **A-4 / A-5 (xstate v5, zustand v4-or-5)** — both wires bind structurally to the real xstate
  5.32.5 actor (`subscribe` / `getSnapshot` / `send`) and the real zustand 5.0.15 vanilla store with
  `subscribeWithSelector`, with no adapter shims and no casts at the wire declarations. A-4's second
  half — "can move within-v5 to ≥5.20.0 for `xstate/graph`" — is confirmed at 5.32.5: the export is
  in core and needs no new package.
- **A-7 (≤ ~1k msg/s)** — still **not measured**. The pipeline is *not* uniformly O(1) per message
  as designed: stream routing (`pipeline()`) does a **linear `entries.find(e => e.match(msg.topic))`
  scan** over the declared streams, so per-message cost is O(streams) there; dedup/guard/mask are
  map lookups plus a compare. At realistic stream counts the linear scan is not expected to
  dominate, but no throughput number was taken in this spike.
- **A-9 (test framework — jest or vitest, vitest assumed)** — the assumption held and cost nothing:
  vitest 4.1.10 hosts `fc.assert`, `fc.check`, `fc.schedulerFor`, `@fast-check/worker`'s `assert`,
  RTL, happy-dom and the `execFile`-driven oxlint check with **no adapter package**.
  `@fast-check/worker` needed no transpilation step: its worker loads the raw `.ts` predicate module
  directly under Node 24's type stripping, provided that module imports nothing from the test
  runner. The A-9 fact re-check ("the adapters' peer ranges") is therefore moot for the recommended
  lane — nothing in it depends on the framework choice beyond `describe`/`it`, so a jest app would
  need only the same two identifiers.
- **A-11 (oxlint recent enough)** — confirmed at **1.78.0** for the rules this track needs
  (`no-restricted-imports` only; no JS-plugins alpha involved). The overrides-merge caveat 0010
  flagged **does bite in this version** (see the checks table) — an operational constraint on how
  the rules are written, not a reason to change tools.
- **A-14 (`AbortSignal.any()` availability)** — used unpolyfilled on Node 24; the composition
  behaviour the report describes (one boundary signal aborting every composed child) is confirmed.
  Browser Baseline-2024 availability is unchanged desk fact, not re-verified here.

## Decision impact

- **Supports D-0016 across every check it named.** The single-dispatch ingress
  (dedup → guard → mask → dispatch) is buildable behind two entry points; the seam is schedulable
  (`fc.scheduler` drives it, `fc.schedulerFor` pins it, `{seed, path}` replays it); `xstate/graph`
  is in core at the pinned minor with no new dependency; `AbortController`/`AbortSignal` plus
  `AbortSignal.any()` carries cancellation end to end with no new runtime dependency; the
  `useOptimisticMutation` bundle holds under scheduled interleavings; and invalidate-don't-set plus
  the oxlint layering rules are both real, testable mechanisms rather than conventions. **No
  amendment is proposed** — findings never change a decision by themselves, and nothing here
  contradicts an accepted decision.
- **Sharpens the ordering-stamp contract question (the intake item) with measured evidence — this
  is the finding to carry to the app owner and 0010.** Without the stamp: the client cannot even
  *observe* a lost race (`stats.stale === 0`, final version 1 instead of 3, nothing counted), and
  the only safe dual-leg rule is invalidate-don't-set, which costs a REST round trip per push event
  and leaves a window in which the cache is knowingly stale. With the stamp: the same guard code
  rejects the stale write in **every** interleaving fc explores, and the query target may write the
  cache directly (`cancelQueries → setQueryData`) — the round trip disappears. The change asked of
  callers is **one `stamp` selector per stream, plus one `write`**, with no interface reshaping:
  adding both to an existing stream declaration is the entire diff in `test/bridge.test.ts`.
  Recommend citing `test/ingress-race.test.ts` (both arms), `test/replay-and-pinning.test.ts` and
  `test/bridge.test.ts::writes the cache ONLY on the stamped fast path` when the requirement goes
  to intake.
- **Adds one small cross-track item for `transport-boundary/errors` (0060's module).** The
  cancellation-normalization mapping is settled on this side, pending the owners' record: an
  aborted fetch may stay class 1 / `reason: 'aborted'` inside the boundary (it is already excluded
  from the retry predicate), and the state layer maps that shape — along with a raw `AbortError`
  and TanStack's `CancelledError` — to `{ outcome: 'cancelled' }`. No new taxonomy class, no
  relocation: one recognizer function, tested. One open sub-question both sides must carry into
  that record: whether an aborted request should also raise a class-1 telemetry envelope — 0060's
  spike currently emits one on every abort (see A's cross-track item under Decision impact).
- **Supports the report's fast-check/worker CI shape.** Per-PR `fc.assert` at reduced `numRuns`,
  nightly under `@fast-check/worker`, and an `fc.schedulerFor` regression per fixed race are all
  runnable in this stack today with no adapter packages.
- **Two operational cautions for the build**, both discovered here and both cheap to honour:
  restate base `no-restricted-imports` patterns inside every oxlint `overrides` entry (the caveat
  bites silently, in the false-negative direction), and never roll an optimistic write back with
  `setQueryData(key, previous)` when `previous` may be `undefined` (v5 bails out; remove the query
  instead).
