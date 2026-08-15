# 0110-react-compiler — research plan

**Status**: draft

## Goal

Decide whether and how the app adopts the React Compiler to replace manual
`useMemo`/`useCallback` hygiene, given three facts specific to this app that generic
adoption guides do not address. **React 18.3.1** forces the non-zero-config install path
(`react-compiler-runtime` plus an explicit `target: '18'`) rather than React 19's
automatic one. The **build tool is unknown** and the repo is a pseudo-monorepo resolved
only through tsconfig `paths` aliases, so any integration must be verified against
whichever bundler is actually in use rather than assumed to be Vite. And the app's
**xstate v5** machines interact with `@xstate/react`'s reference-equality checks in a way
([statelyai/xstate#5426](https://github.com/statelyai/xstate/issues/5426)) that may still
require exactly the manual memoization the compiler exists to eliminate. Because the
codebase receives a high volume of agent-authored code, the track treats the compiler's
**silent bailout** behaviour as a first-class risk: a gate that can be silently no-op'd
is not a safety net. The output is a measurement-first, incrementally-gated rollout plan
with an explicit falsifiable evidence threshold for moving from "wait" to "go" — not a
blanket recommendation. Track 0040 already adopted the compiler's lint rules via
eslint-plugin-react-hooks 7.x; this track does not revisit that.

## Key questions

1. **Install path — resolved, and it is the harder branch.** The versions are confirmed:
   **Vite 8.0.16, `@vitejs/plugin-react` 6.0.2, Node ≥ 24** (facts/app-profile.md). Plugin 6.x
   **carries no internal Babel**, so the legacy `react({ babel: { plugins: [...] } })` recipe
   — which most published React Compiler guidance still shows — **does not apply here at
   all**. The compiler must wire through **`@rolldown/plugin-babel` with the
   `reactCompilerPreset` helper**, and React 18.3.1 additionally requires
   `react-compiler-runtime` plus an explicit `target: '18'`. So the survey's first job is to
   verify that this specific combination works end to end and does not break Fast Refresh —
   not to choose between install paths. Two follow-ons: does re-introducing a Babel pass into
   a deliberately Babel-free Vite 8 pipeline cost meaningful build time at 150k LOC, and does
   it interact with alias resolution? Note 8.0.16 sits below 8.2, where Vite's native
   `resolve.tsconfigPaths` left experimental, so `vite-tsconfig-paths` is likely still in the
   chain — confirm which resolves `@appname/*` today.
2. **React 18 config burden** — `react-compiler-runtime` plus an explicit `target: '18'`
   is mandatory for React 18.3.1. Who keeps the runtime version and target string in
   sync, and what breaks if they drift — a build error, or a silent no-op?
3. **xstate v5 reference-equality hazard** — does the app construct machines via
   `setup().createMachine()` factories closing over per-render-varying config (the
   pattern behind #5426), or via stable module-level definitions passed through
   `.provide()`? If the former, does the compiler's auto-memoization get defeated by the
   manual `useMemo` that must remain, and is that combination safe or a new footgun?
4. **Measurement before rollout** — what does `react-compiler-healthcheck` report against
   this codebase (component and hook counts, incompatible patterns, bailout rate), and is
   that a recurring CI signal or a one-time audit?
5. **Silent-bailout visibility** — given the volume of agent-authored code, how are
   bailouts surfaced continuously rather than checked once: eslint-plugin-react-hooks
   7.x compiler diagnostics promoted to CI failures, oxlint's experimental
   `react/react-compiler` nursery rule, or build-time warnings nobody reads?
6. **Suppression resistance** — the mirror of question 5, and the question this track
   must not skip given its own framing. Can an agent satisfy the bailout gate by
   suppression rather than by fixing the incompatible pattern — an `eslint-disable` on
   the react-hooks compiler diagnostic, an `oxlint-disable` on the nursery rule, or a
   blanket `"use no memo"` directive? What makes each of those visible and countable?
7. **Incremental rollout and rollback unit** — with no package.json per directory to
   scope a staged rollout, what unit does incremental adoption use (directory globs via
   the compiler's `sources` option, per-file `"use memo"`/`"use no memo"`, or a
   feature-flagged config), and what is the concrete rollback lever if a production
   regression appears?
8. **Complexity-ratchet interaction** — compiler-driven deletion of manual memo wrapping
   shifts function complexity scores. This track **flags the trigger condition only**;
   the re-baselining mechanism and its ownership belong to 0020, which owns the Biome
   cognitive ratchet under D-0011. What does 0020 need to be told, and when?
9. **Evidence gate for go/no-go** — what specific falsifiable threshold flips the
   recommendation from "wait" to "go" (a healthcheck bailout rate below some figure, zero
   xstate-related infinite-render regressions across a staging soak, a measured
   render-count reduction on MQTT-fed high-churn views)? Is that threshold reachable
   before the in-tree Rust port ships to npm and changes the calculus?

## Candidates

- babel-plugin-react-compiler — https://www.npmjs.com/package/babel-plugin-react-compiler — the official Babel plugin performing the auto-memoization transform (1.0.0, 2025-10-07; stable line unchanged since, though experimental prereleases continue)
- react-compiler-runtime — https://www.npmjs.com/package/react-compiler-runtime — the memo-cache shim required to target React 17/18; mandatory for this app (1.0.0, 2025-10-07)
- react-compiler-healthcheck — https://www.npmjs.com/package/react-compiler-healthcheck — pre-adoption CLI reporting compatibility and bailout signals before the switch is flipped (1.0.0, 2025-10-07)
- eslint-plugin-react-hooks (v7 line) — https://www.npmjs.com/package/eslint-plugin-react-hooks — bundles the compiler's rules-of-React diagnostics; already adopted by 0040 (7.1.1, 2026-04-17)
- oxlint `react/react-compiler` rule — https://oxc.rs/docs/guide/usage/linter/rules.html — lint-only compiler diagnostics inside the primary linter, no separate install; experimental nursery category (oxlint 1.78.0, 2026-08-10)
- Oxc/Rolldown native transform — https://github.com/rolldown/rolldown/pull/9801 — a Rust-native non-Babel install path, relevant only if the build tool is or becomes Rolldown-based; experimental, merged 2026-06-17, not separately published
- eslint-plugin-react-compiler (standalone) — https://www.npmjs.com/package/eslint-plugin-react-compiler — **stale and superseded**: no publish since 2025-05-14, still pre-1.0; functionality migrated into eslint-plugin-react-hooks 7.x. Documented fallback only
- **Do-nothing baseline** — keep hand-written memoization enforced by the eslint-plugin-react-hooks 7.x rules already in CI. Zero new dependency and zero new silent-bailout surface, against zero automatic gain. Scored as a strategy, and the recommendation must beat it explicitly

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

| Criterion | Weight |
|---|---|
| License | low — every realistic candidate is MIT; not a discriminator here |
| Maintenance health | high — the stable channel has been frozen at 1.0.0 since 2025-10-07 while an experimental channel and an in-tree Rust port keep moving, and one candidate is abandoned; health must be read per package, not inferred from the "official" label |
| TypeScript fit | medium — the compiler works on TS/JSX ASTs; very loose strictness affects diagnostic noise but blocks nothing |
| Browser compatibility | n-a — a build-time transform emitting standard JS through the existing bundle target |
| Contract-format support | n-a — unrelated to the contract surfaces |
| Integration cost | high — unknown build tool, no per-directory manifests, and the forced React 18 install path make this the crux of the track |
| Runtime overhead | medium — the memo cache adds a bounded per-component cost, worth weighing against MQTT-fed high-frequency updates |
| Output quality | high — auto-memoization correctness is the entire value proposition, including its collision with xstate's reference-equality checks |
| Escape hatch | medium — spec meaning, the cost of removing the tool later: reverting a build-step config and re-adding manual memoization. The separate question of whether the *gate* can be silently suppressed is Key question 6, scored under Output quality |

## Facts needed

- Build tool and exact plugin chain (Vite + `@vitejs/plugin-react`, webpack + babel-loader, rspack, or Rolldown) — decides which install path is reachable at all
- Whether xstate machines use `setup().createMachine()` factories inside components or stable module-level definitions — decides whether the decisive risk fires
- Current volume and location of manual `useMemo`/`useCallback`/`React.memo`, especially in MQTT-fed high-update views — sizes the win against the do-nothing baseline
- CI provider and budget for an added healthcheck or build step
- Node version pinned in CI (assumed ≥20)
- Whether agent-authored code already violates rules-of-React patterns at a measurable rate — raises expected bailout rates and changes the rollout risk
