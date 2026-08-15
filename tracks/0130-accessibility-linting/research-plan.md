# 0130-accessibility-linting — research plan

**Status**: draft

## Goal

Establish automated accessibility enforcement — static linting and dynamic runtime
checking — for a React 18 UI whose content is substantially driven by asynchronous MQTT
messages and REST responses rather than by user-initiated navigation. This matters
because the app's real accessibility risk is disproportionately **dynamic**: focus
management and live-region announcements around machine-driven (xstate) state
transitions, rather than the static markup mistakes jsx-a11y-style rules catch. A
finding from the initial scan reframes the whole track: **oxlint now implements all 36 of
jsx-a11y's non-deprecated rules**, and the parity-tracking issue is closed — so the
horizon scan's premise that oxlint ships "only a subset" no longer holds, and the
question is no longer "how do we close the static gap" but "is there a static gap left at
all, and is the real work elsewhere?" The track must therefore determine what oxlint and
Biome already cover for free, whether an ESLint-in-CI accessibility lane is justified at
all, where axe-core runtime checking must pick up what no static linter can reach, and
what remains genuinely out of automated reach and must be named as residual manual risk.
Throughout, the gate must resist being quietly satisfied by a suppression comment in a
codebase where review capacity is the scarce resource.

## Key questions

1. **Residual static gap** — with oxlint implementing all 36 non-deprecated jsx-a11y
   rules 1:1 and the parity issue closed, is there any remaining static gap that justifies
   keeping or growing an ESLint-in-CI accessibility lane, or does oxlint alone already
   satisfy the lane policy's oxlint-native-first preference for this surface?
2. **Biome overlap and authority** — Biome already runs in CI for the complexity ratchet.
   Does enabling its 37-rule accessibility group add coverage beyond oxlint, or would
   running both engines double-report the same violations? If they overlap, which engine
   is authoritative, and which must have its accessibility rules explicitly disabled?
3. **The static blind spot** — for a UI whose content, focus targets, and live regions
   change in response to MQTT pushes and xstate transitions rather than clicks, what
   classes of defect can no static JSX linter ever catch in principle (focus never moving
   on a state transition, a live region that never announces, dynamically injected content
   missing labels)?
4. **The announcement-timing residual** — this is the gap the candidate list does not
   obviously close, and the track must not imply otherwise. axe-core and its bindings
   audit DOM and ARIA *structure*: that a live region exists with the right role and
   attributes. They do not verify that it actually **announces to assistive technology at
   the right moment** after an MQTT-driven update. Does any OSS tool close that
   specifically, or is it honestly out of automated-CI reach and must be named as a
   manual screen-reader-testing residual risk with an owner?
5. **Where runtime checking lives** — should axe-core assertions run against component
   tests (jest-axe over a jsdom/happy-dom tree: cheap and fast, but blind to real focus
   and announcement timing), in the 0120 browser lane (against a real browser: catches
   timing-dependent behaviour, slower and lower coverage), or both with distinct
   responsibilities? **This track owns the axe decision**; 0120 supplies runner
   axe-binding availability as an input fact.
6. **vitest-axe viability** — vitest-axe has not published since 2022 and documents an
   unfixed Happy-DOM bug. Should the track recommend jest-axe's matcher instead (it works
   under vitest's Jest-compatible `expect.extend`), deferring vitest-axe unless the app's
   real test setup proves otherwise?
7. **Severity and rollout under agentic churn** — should new rules land blocking on
   new and changed lines only, rather than as repo-wide warnings that become a permanent
   backlog amnesty? What prevents an agent from satisfying the gate with an
   `eslint-disable`, `oxlint-disable`, or `biome-ignore` comment instead of a real fix?
8. **Scope boundary** — is validating labelling of contract-driven dynamic content out of
   scope here (belonging to 0010), or is there a seam where this track hands a requirement
   to that one?

## Candidates

- oxlint native jsx-a11y rules — https://github.com/oxc-project/oxc — Rust linter shipping accessibility rules natively with no ESLint runtime; verified to implement all 36 non-deprecated jsx-a11y rules 1:1, parity issue oxc#22264 closed (1.78.0, 2026-08-10)
- @biomejs/biome accessibility group — https://biomejs.dev/linter/rules/ — already an accepted CI dependency for the complexity ratchet; ships 37 accessibility rules covering nearly the same surface (2.5.8, 2026-08-11)
- eslint-plugin-jsx-a11y — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y — the canonical full ruleset, 39 rules of which 3 are deprecated; npm publish-lag risk specifically, not abandonment — repo alive with commits through 2026-01-06 (6.10.2, npm 2024-10-25)
- eslint-plugin-jsx-a11y-x — https://github.com/es-tooling/eslint-plugin-jsx-a11y-x — actively published fork with the same rules and no external deps; answers the canonical package's publish lag if the ESLint lane is kept (0.2.0, 2026-05-10)
- @eslint-react/eslint-plugin — https://eslint-react.xyz — confirmed to carry **no** accessibility rule category; listed to close the horizon scan's open question explicitly, not a contender (5.18.6, 2026-08-13)
- axe-core — https://github.com/dequelabs/axe-core — the runtime rules engine underlying every axe binding below; MPL-2.0 (4.13.0, 2026-08-05)
- @axe-core/react — https://github.com/dequelabs/axe-core-npm — dev-mode auditor running axe-core against the live mounted React tree; the natural fit for MQTT-driven dynamic content static analysis cannot see (4.13.0, 2026-08-11)
- jest-axe — https://github.com/nickcolley/jest-axe — `toHaveNoViolations` matcher wrapping axe-core for component tests; works under vitest via Jest-compatible `expect.extend` (11.0.0, 2026-07-26)
- @axe-core/playwright — https://github.com/dequelabs/axe-core-npm — browser-driven assertions; conditional on 0120 selecting Playwright (4.13.0, 2026-08-11)
- vitest-axe — https://github.com/chaance/vitest-axe — **stale**: no npm publish since 2022-10-21, last repo push 2025-02-11, known unfixed Happy-DOM bug in its own README (0.1.0)

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

| Criterion | Weight |
|---|---|
| License | low — MIT for the lint tooling; axe-core and its bindings are MPL-2.0, file-level copyleft with no concern for dev and test tooling that is not redistributed |
| Maintenance health | high — jsx-a11y's publish lag against oxlint's, Biome's, and axe-core's active 2026 cadence is the central risk to weigh, and directly motivates the fork as a fallback |
| TypeScript fit | low — every candidate operates on JSX or DOM structure, not type information; loose strictness changes nothing |
| Browser compatibility | medium — the runtime candidates depend on which DOM environment they execute against (jsdom, happy-dom, or a real browser), which materially changes what they can detect |
| Contract-format support | n-a — scoped to UI accessibility; no interaction with the contract surface |
| Integration cost | high — the core problem is slotting accessibility checking into an oxlint-primary, ESLint-in-CI, Biome-in-CI stack without three engines double-reporting one violation |
| Runtime overhead | medium — static linting is near-zero inside existing passes; runtime axe checks add real test and CI time that must stay bounded |
| Output quality | high — with scarce review capacity, false positives get reflexively suppressed and false negatives ship; precision and recall decide whether the gate is trusted |
| Escape hatch | medium — spec meaning, the cost of removing a tool later: lint rules revert by config, while axe assertions embedded in tests cost more to unwind. Whether the gate can be *suppressed* is Key question 7, scored under Output quality |

## Facts needed

- Test framework (vitest is assumed, unconfirmed) and the DOM environment used by unit tests (jsdom versus happy-dom) — axe behaviour and known bugs differ by environment
- Which runner 0120 selects — `@axe-core/playwright` is only relevant under Playwright
- Whether the ESLint-in-CI lane carries any accessibility rules today, or whether this is greenfield
- Whether Biome's accessibility group is currently enabled, disabled, or untouched
- CI provider, and whether a diff-scoped changed-lines-only gate is feasible there
- Whether any MQTT-driven components manage focus or live-region announcements today — greenfield behaviour or a retrofit
- Build tool — `@axe-core/react` must be wired to dev-only builds so axe-core never ships to production
