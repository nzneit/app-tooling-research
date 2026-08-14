# 0040-hooks-linting — report

## Summary (STE)

This track examined lint tools that find React hooks anti-patterns. We compared seven candidates against the oxlint baseline that decision D-0002 keeps in place. We recommend adoption of three ESLint plugins in a CI lint step. The plugins are eslint-plugin-react-hooks, eslint-plugin-react-you-might-not-need-an-effect, and eslint-plugin-react-hooks-addons. Together they add compiler-powered rules, unnecessary-effect rules, and an unused-dependency rule that oxlint does not have. oxlint keeps the two classic hooks rules for fast feedback.

The most important risk is double reports, because both linters apply two rules with known differences. Two of the three plugins also have only one maintainer. The next step is a spike that runs the new configuration on the application code. The spike measures noise, sets the rule severities, and tests the new Zustand plugin.

**As of**: 2026-08-13 (versions evaluated are listed per candidate; amended 2026-08-13 after the Wave 1 gap sweep)
**Recommendation**: adopt — eslint-plugin-react-hooks v7 (`recommended` preset) + eslint-plugin-react-you-might-not-need-an-effect (`recommended` preset) + eslint-plugin-react-hooks-addons `no-unused-deps` (warn) in ESLint-in-CI; oxlint keeps `react/exhaustive-deps` and gains `react/rules-of-hooks` as the fast lane; eslint-plugin-zustand-rules is a named spike candidate, not adopted

## Survey

### eslint-plugin-react-hooks (v7.1.1)

The canonical React-team hooks plugin, MIT-licensed, maintained in the [facebook/react monorepo](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/README.md). Evaluated at **7.1.1** (stable, 2026-04-17 per the [npm registry](https://registry.npmjs.org/eslint-plugin-react-hooks)); canary builds published as recently as 2026-08-13, so development is continuous between stables. The version history matters: v6.0.0 (2025-04-21) introduced React-Compiler-powered rules as opt-in, and **v7.0.0 (2025-10-08) promoted them into the default `recommended` preset** ([CHANGELOG](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md)). Sources describing `recommended` as just two rules are describing v6 or earlier.

Current rule set ([react.dev reference](https://react.dev/reference/eslint-plugin-react-hooks)): the two classics (`rules-of-hooks` error, `exhaustive-deps` warn) plus 14 compiler-powered rules, mostly at error — `set-state-in-render`, `set-state-in-effect`, `purity`, `immutability`, `refs`, `globals`, `static-components`, `use-memo`, `preserve-manual-memoization`, `error-boundaries`, `config`, `gating`, and (at warn) `unsupported-syntax` and `incompatible-library`. `component-hook-factories` was deprecated to a no-op in 7.1.1. This set directly covers the track's target anti-patterns: setState-in-render, effects-as-derived-state (`set-state-in-effect`), stale/incomplete dependencies (`exhaustive-deps`), and render impurity/mutation (`purity`, `immutability`, `globals`, `refs`).

Two verified facts anchor the integration story. First, **the plugin has no React version floor**: the 7.1.1 manifest declares no React peerDependency at all — only `eslint ^3–^10` and Node >= 18 ([npm registry, 7.1.1](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1)). Second, the compiler-powered rules **do not require adopting React Compiler**: the [React Compiler 1.0 announcement](https://react.dev/blog/2025/10/07/react-compiler-1) states "The linter does not require the compiler to be installed, so there's no risk in upgrading eslint-plugin-react-hooks." The rules bundle their own parsers (`@babel/parser`, `hermes-parser`), so TS/TSX is analyzed regardless of the project's ESLint parser; the plugin itself has shipped TypeScript declarations since v5.2.0. Escape hatches are standard ESLint mechanics: per-line disables, per-rule severity overrides on the preset, and warn-level defaults on the two noisiest rules.

### oxlint react/react-perf rule sets (oxlint v1.78.0)

The adopted baseline under D-0002, MIT-licensed, evaluated at oxlint **1.78.0** (2026-08-10; ~3–4 day release cadence per [releases](https://github.com/oxc-project/oxc/releases)). Key baseline facts: the `react` and `react-perf` plugins are **not enabled by default** — defaults are eslint/typescript/unicorn/oxc, and setting `plugins` overwrites that default set ([plugins doc](https://oxc.rs/docs/guide/usage/linter/plugins.html)). Within the react plugin, `react/exhaustive-deps` is category correctness (on once the plugin is enabled, with safe fixes and the upstream `additionalHooks` option — [rule doc](https://oxc.rs/docs/guide/usage/linter/rules/react/exhaustive-deps)), while `react/rules-of-hooks` sits in the off-by-default pedantic category and must be enabled explicitly ([rule doc](https://oxc.rs/docs/guide/usage/linter/rules/react/rules-of-hooks)).

Fidelity to the ESLint originals is good but not exact, and some divergences are deliberate: `rules-of-hooks` intentionally flags top-level hook-like calls (a known technical false positive, kept to avoid masking runtime errors — [source](https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/rules/react/rules_of_hooks.rs)); `exhaustive-deps` has a JSX-variable false positive closed as not-planned ([#17765](https://github.com/oxc-project/oxc/issues/17765)), an open missing-dependency false negative under whole-object destructuring ([#25621](https://github.com/oxc-project/oxc/issues/25621)), diagnostics anchored to different lines than ESLint ([#18328](https://github.com/oxc-project/oxc/issues/18328)), and no custom stable-reference support — relevant to Zustand-style stable setters ([#14326](https://github.com/oxc-project/oxc/issues/14326), open).

On the compiler-powered front, oxlint ships an experimental `react/react-compiler` rule at **nursery** maturity (off by default, no fix) wrapping `oxc_react_compiler::lint()` — it reports conditional hooks, setState during render, ref access during render, and props/state mutation ([source](https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/rules/react/react_compiler.rs)); the [parity umbrella #1022](https://github.com/oxc-project/oxc/issues/1022) notes it will later be split into separate rules. It is not yet a CI-grade substitute for the v7 ESLint rules. The `react-perf` plugin natively implements all four eslint-plugin-react-perf rules (off by default, one open FP issue [#17743](https://github.com/oxc-project/oxc/issues/17743)).

### @eslint-react (v5.18.6)

The [Rel1cx/eslint-react](https://github.com/Rel1cx/eslint-react) family, MIT, evaluated at **5.18.6** (released 2026-08-13, the survey day). Structurally important: `eslint-plugin-react-hooks-extra` — the sub-plugin this track's plan implicitly targeted — **is no longer part of the umbrella**; its rules were consolidated into core `react-x` at [v2.0.0 (2025-09-26)](https://www.eslint-react.xyz/docs/release-notes/v2.0.0), and the standalone package is stranded on a 2.x line. Any adoption must target `react-x` or the umbrella.

Hooks-relevant coverage today ([rules index](https://eslint-react.xyz/docs/rules)): reimplementations of `rules-of-hooks` and [`exhaustive-deps`](https://eslint-react.xyz/docs/rules/exhaustive-deps) (suggestion-fixes by default, dangerous autofix behind an explicit flag), `set-state-in-effect`, `set-state-in-render` (experimental), `use-memo`, `no-unnecessary-use-prefix`, and render-purity rules (`purity`, `immutability`) aligned with React Compiler validation semantics since v5.12.0. Notably **narrower than its reputation**: `no-unnecessary-use-callback`/`-memo` were removed in v5.0.0 ([changelog](https://eslint-react.xyz/docs/changelog)), and the family never had a `no-unnecessary-use-effect`. Its genuinely additive pieces for this app are the type-aware rules (TS is a required peer dependency; `recommended-type-checked` presets) and `react-web-api`'s effect-cleanup leak rules (`no-leaked-event-listener|-timeout|-interval|-fetch|…`).

Health is a split verdict: extremely active (v5.18.6 and v5.18.5 both shipped 2026-08-13; ~1.8–2.0M weekly downloads per package per the npm downloads API) but effectively single-maintainer — Rel1cx authored ~97% of ~7,400 human commits ([contributors API](https://api.github.com/repos/Rel1cx/eslint-react/contributors)) — with three major versions and rule renames/removals in ~11 months. Floors are also the steepest in the set: ESM-only, flat config only, ESLint 9+, TS 5.x, Node 20+ ([presets](https://eslint-react.xyz/docs/presets), v2.0.0 notes).

### eslint-plugin-react-you-might-not-need-an-effect (v1.0.1)

MIT, evaluated at **1.0.1** (2026-06-15 per the [npm registry](https://registry.npmjs.org/eslint-plugin-react-you-might-not-need-an-effect/latest)); ~518.6k weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-you-might-not-need-an-effect)). Nine rules, each mapped one-to-one in the [README](https://raw.githubusercontent.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/main/README.md) to a named section of the React docs' [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect): `no-derived-state`, `no-chain-state-updates`, `no-event-handler`, `no-adjust-state-on-prop-change`, `no-reset-all-state-on-prop-change`, `no-pass-live-state-to-parent`, `no-pass-data-to-parent`, `no-external-store-subscription` (points at `useSyncExternalStore`), and `no-initialize-state`. Diagnostics link back to the docs section; the `recommended` preset reports warnings, `strict` errors. It deliberately does not attempt the docs' caching or data-fetching patterns.

False-positive profile (key question 3, detailed there): roughly a dozen explicitly-titled FP reports across the tracker's history, **all closed via rule-logic fixes, zero open issues as of 2026-08-13** ([issue tracker](https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues?q=is%3Aissue+false+positive)). The engine traces state/props through aliases and call chains; the deepest-inference rules (parent-communication) generated most FPs. Maintenance is active but solo (bus factor 1; v1.0.0 was a declared-stability release, 2026-05-31). Integration is flexible: peer dep `eslint >=8.40.0`, flat and legacy config, and the README states it also runs under oxlint's JS plugin support (alpha; one oxlint-only FP, [#66](https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues?q=is%3Aissue+is%3Aclosed), closed).

### eslint-plugin-react-hooks-addons (v0.5.1)

*Added 2026-08-13 from the Wave 1 gap sweep.* A single-rule plugin by Zheng Song (szhsin), MIT, evaluated at **0.5.1** (2026-02-09 per the [npm registry](https://registry.npmjs.org/eslint-plugin-react-hooks-addons)); ~52.8k weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-hooks-addons)), first release 2021-12, repo pushed 2026-08-08 with dependency maintenance ([repo API](https://api.github.com/repos/szhsin/eslint-plugin-react-hooks-addons)). The one rule, `no-unused-deps`, flags dependencies listed in `useEffect`/`useLayoutEffect` arrays but never used inside the callback — the exact inverse of `exhaustive-deps`, which only reports missing deps. The [README](https://raw.githubusercontent.com/szhsin/eslint-plugin-react-hooks-addons/master/README.md) states the plugin "is supposed to work in tandem with eslint-plugin-react-hooks, as it doesn't check things that have already been reported by that plugin" — complementary by explicit design, so it adds no double-reporting to the v7 preset.

Mechanics: `additionalHooks` takes a `{ pattern, replace }` regex object to extend (or, with `replace: true`, substitute) the checked hooks — the seam for the app's custom MQTT effect hooks; intentional trigger-only dependencies are excluded by marking them with a `/* effect dep */` comment (marker name configurable via `effectComment`), and only unmarked unused deps are reported. No autofix. Both the flat `recommended` and `recommended-legacy` presets set the rule at **error** ([index.ts](https://raw.githubusercontent.com/szhsin/eslint-plugin-react-hooks-addons/master/index.ts)); this report overrides it to warn. The peer dependency is a maximally tolerant `eslint >=3.0.0`, with flat and legacy configs shipped. Health: 20 stars and bus factor 1, but the tracker tells a calm story — four issues total in ~4.5 years, one false-positive report ever (#52, 2022, a `useMemo` interaction, closed), one open feature request ([issues search API](https://api.github.com/search/issues?q=repo:szhsin/eslint-plugin-react-hooks-addons+is:issue&per_page=50)). The structural FP surface is inherent rather than incidental: a dependency used purely as a re-run trigger is flagged until annotated — and for this app that is the point, because an unused dep in an MQTT connect effect is precisely what rebuilds connections (anti-pattern #2's extra-dependency half).

### eslint-plugin-zustand-rules (v1.2.1)

*Added 2026-08-13 from the Wave 1 gap sweep.* MIT, effectively single-maintainer (the [contributors API](https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules/contributors) lists the author, a semantic-release bot, and one outside contributor), evaluated at **1.2.1** (2026-08-07 per the [npm registry](https://registry.npmjs.org/eslint-plugin-zustand-rules)); ~3.1k weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-zustand-rules)), 12 stars ([repo API](https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules)). Nine rules enforcing Zustand practice ([README](https://raw.githubusercontent.com/paulschoen/eslint-plugin-zustand-rules/main/README.md)). The headline for this track is **`require-shallow-selector`**: it detects selectors that build fresh objects or arrays (unnecessary re-renders; render loops under Zustand v5) and autofixes by wrapping the selector in `useShallow` and adding the import — exactly ranked anti-pattern #6. Also correctness-class: `use-store-selectors` (whole-store subscriptions and the deprecated equality-function argument) and `no-state-mutation` (direct mutations that skip subscription notifications, autofixed into `set` calls). The remaining rules are structural conventions (`no-repeated-store-selectors`, `no-logic-in-selectors`, `selector-name-matches-property`, `enforce-state-before-actions`, `enforce-slices-when-large-state`, `no-multiple-stores`). Store detection combines identifiers imported from zustand with a `^use([A-Z]\w*)?Store$` hook-name pattern (`storeHookPattern` option); the README itself warns that a standalone non-Zustand hook matching the pattern "will still get rewritten" — a documented false-positive class in which the **autofix rewrites working code**. ESLint ^8 || ^9; flat config via `configs['flat/recommended']` (all rules at error except `selector-name-matches-property` at warn).

The timeline is the honest problem. The project shipped 1.0.0/1.0.2 in October 2024 — a line whose rules were not actually exported (issue #2, "Definition for rule(s) was not found") — then sat dormant for ~22 months with issues unanswered, then released v1.1.0 through v1.2.1 in a three-day burst 2026-08-05..07 ([releases](https://github.com/paulschoen/eslint-plugin-zustand-rules/releases), [issue tracker](https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules/issues?state=all&per_page=30)), introducing `require-shallow-selector`, flat-config support, and the autofix batch. The capability that corrects this report is therefore real but **six to eight days old at survey time**, with zero field history; the download count accrued mostly against the broken 1.0.x line and says nothing about the new rules' false-positive rate. Verdict: genuine coverage, unproven implementation — spike candidate, not adoption set (decision argued in the Recommendation).

### eslint-plugin-react-perf (v3.3.3)

Four rules flagging unstable references passed as JSX props ([repo](https://github.com/cvazac/eslint-plugin-react-perf), MIT). Three findings eliminate it. First, it is **dormant**: last npm release 3.3.3 on 2024-10-18, last commit 2025-01-07 — a bugfix still unreleased ~19 months later ([registry](https://registry.npmjs.org/eslint-plugin-react-perf), commits API). Second, **oxlint already implements all four rules natively** as its opt-in `react-perf` plugin ([example rule doc](https://oxc.rs/docs/guide/usage/linter/rules/react_perf/jsx-no-new-object-as-prop)), so under D-0002 the ESLint plugin closes zero gap. Third, the rule family is being obsoleted by React Compiler's auto-memoization ([react.dev compiler introduction](https://react.dev/learn/react-compiler/introduction)), and the rules blanket-flag every inline literal whether or not the receiver is memoized — a high-FP design. It contributes nothing to hooks anti-pattern coverage (no dependency, closure, or effect analysis). **Do not adopt**; if the team wants these checks at all, enable oxlint's `react-perf` plugin at zero new-tool cost.

## Key questions

**1. Gap analysis: which eslint-plugin-react-hooks rules does oxlint mirror today?**

Verified React version requirement first, as the plan demands: **the compiler-powered rules have no React version floor.** eslint-plugin-react-hooks 7.1.1 declares no React peerDependency at all — its only requirements are `eslint ^3–^10` and Node >= 18 ([npm registry, 7.1.1](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1)) — and the React team states the linter works without the compiler installed and "even if your app hasn't adopted the compiler yet" ([compiler 1.0 announcement](https://react.dev/blog/2025/10/07/react-compiler-1), [react.dev reference](https://react.dev/reference/eslint-plugin-react-hooks)). The React 17+ floor applies only to adopting React Compiler itself (via `react-compiler-runtime` for 17/18), which is out of this track's scope.

Rule-by-rule, eslint-plugin-react-hooks 7.1.1 `recommended` vs oxlint 1.78.0:

| v7 rule (preset severity) | oxlint equivalent (category) | Status |
|---|---|---|
| rules-of-hooks (error) | react/rules-of-hooks (pedantic, off by default) | mirrored — one deliberate divergence: oxlint flags top-level hook-like calls |
| exhaustive-deps (warn) | react/exhaustive-deps (correctness) | partial — FP closed not-planned (#17765), open FN (#25621), different diagnostic lines (#18328), no stable-reference option (#14326) |
| set-state-in-render (error) | react/react-compiler (nursery, off) | partial — nursery-only, not CI-grade |
| refs (error) | react/react-compiler (nursery, off) | partial — nursery-only |
| immutability (error) | react/react-compiler (nursery, off; props/state mutation) | partial — nursery-only |
| static-components (error) | react/no-unstable-nested-components (suspicious, off) | partial — adjacent rule, nested-component creation only |
| set-state-in-effect (error) | none | missing |
| purity (error) | none | missing |
| globals (error) | none | missing |
| use-memo (error) | none | missing |
| preserve-manual-memoization (error) | none | missing |
| error-boundaries (error) | none | missing |
| incompatible-library (warn) | none | missing |
| unsupported-syntax (warn) | none | missing |
| config (error) | none | missing — compiler-config validation |
| gating (error) | none | missing — compiler-gating validation |
| component-hook-factories | — | n/a — deprecated to a no-op in 7.1.1 |

Other adopted rules: all nine eslint-plugin-react-you-might-not-need-an-effect rules are **missing** from oxlint natively (its README claims oxlint JS-plugin compatibility, but that runtime is alpha — [oxc.rs announcement](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha)). The gap-sweep additions are likewise absent from oxlint natively: it has no unused-dependency inverse of `exhaustive-deps` (its nearest open issue, stable-reference support [#14326](https://github.com/oxc-project/oxc/issues/14326), is a different problem) and no Zustand-aware rules at all. Net: oxlint mirrors the two classics (one well, one partially) and nothing else at stable maturity; the 14 compiler-powered rules, the unnecessary-effect family, and the unused-dependency inverse are the material gap, and ESLint-in-CI is the sanctioned way to close it under D-0002.

**2. Which anti-patterns matter most for this app?**

Ranked for an app whose canonical state lives outside React (Zustand, xstate) with long-lived MQTT-over-WSS subscriptions, grounded in the React docs: (1) **subscription/effect lifecycle mistakes** — MQTT subscribe without symmetric cleanup piles up connections and duplicate handlers ([Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)); highest impact, but mostly architectural, not lintable — the practical detectors are Strict Mode remounts and a single shared `useMqttTopic`-style hook. (2) **Over-broad/unstable dependencies causing reconnect churn** — React's own worked example is a chat connection rebuilt on every keystroke ([Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies)); now lintable from both directions (gap-sweep correction — this report previously called it only "partially lintable via exhaustive-deps"): `exhaustive-deps` catches the missing-dep half, and react-hooks-addons' `no-unused-deps` catches the extra-dependency half — a dep listed but unused in the callback, whose only effect is re-triggering the connection rebuild. (3) **Missing/suppressed deps → stale closures** — MQTT handlers capturing stale store snapshots; lintable, plus an audit of existing disable comments; the sanctioned `useEffectEvent` fix is stable only since React 19.2, and the app's React version is an unfilled fact. (4) **Effects-as-derived-state / syncing store state into local state** — doubly redundant here since Zustand/xstate hooks already deliver subscribed values ([You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)); well lintable via `set-state-in-effect` plus the YMNNAE taxonomy. (5) **setState-in-render** — rare but crash-severity; lintable. (6) **Zustand selectors returning fresh objects** (needs `useShallow` — [zustand README](https://github.com/pmndrs/zustand)) — gap-sweep correction: no longer uncovered — eslint-plugin-zustand-rules' `require-shallow-selector` lints exactly this and autofixes by wrapping the selector in `useShallow`; but the rule is six to eight days old (v1.1.0, 2026-08-05), so it enters as a spike candidate rather than the adoption set, and review remains the interim owner. The recommendation now covers everything stably lintable in this list; item 1 must still be owned by convention and review, and item 6 has a named lintable path pending the zustand-rules spike.

**3. What does eslint-plugin-react-you-might-not-need-an-effect catch, and what is its false-positive profile?**

It catches seven named patterns from the React docs page plus state initialization and external-store subscription in effects (table in the Survey section). The FP record, honestly summarized from the tracker: the largest cluster is **indirection the static tracer could not follow** — debounce wrappers, HOC-wrapped props, refs passed as props, destructured arrow-function props — hitting the parent-communication rules hardest; second, **third-party idioms misread as anti-patterns** — props fed into React Query options, React Router `location.state` — tripping `no-event-handler`; third, occasional **legitimate synchronization effects flagged** (infinite-scroll fetch). All reported FPs were fixed in rule logic rather than dismissed, and the tracker is fully drained (0 open issues, 2026-08-13). Containment is built in: the `recommended` preset warns rather than errors. For this app, the React-Query-style FP class is the one to watch given the REST/mqtt.js data flows, and whether `no-external-store-subscription` fires usefully depends on an unfilled fact — whether components hand-subscribe to Zustand/xstate/mqtt in effects or use the libraries' hooks.

**4. Does React Compiler adoption belong on the 0090 horizon scan?**

**Yes — compiler adoption belongs on 0090, not in this track.** `babel-plugin-react-compiler` 1.0.0 is stable (2025-10-07, still the latest stable line), production-tested at Meta, supports React 17+ (`react-compiler-runtime` for 17/18), and integrates via Babel/Vite/Metro/Next.js swc — a build-pipeline change with rollout gating and a `"use no memo"` escape hatch, and no first-class oxc-toolchain path yet ([react.dev introduction](https://react.dev/learn/react-compiler/introduction)). What it would obsolete in this track: the entire eslint-plugin-react-perf/oxlint react-perf inline-allocation family and manual `useMemo`/`useCallback` hygiene (auto-memoization), while adding `preserve-manual-memoization` as a migration guard. What it would **not** obsolete: `exhaustive-deps` (the compiler memoizes correct code; it does not fix dependency lies) or the unnecessary-effect rules (it does not remove effects). The compiler's lint rules are free-standing and land in this track now via eslint-plugin-react-hooks v7.

## Rubric comparison

| Criterion (weight) | eslint-plugin-react-hooks 7.1.1 | oxlint react rules 1.78.0 | @eslint-react 5.18.6 | react-you-might-not-need-an-effect 1.0.1 | react-hooks-addons 0.5.1 | zustand-rules 1.2.1 |
|---|---|---|---|---|---|---|
| License (high) | strong — MIT, facebook/react monorepo | strong — MIT | strong — MIT across all sub-plugins | strong — MIT | strong — MIT | strong — MIT |
| Maintenance health (high) | strong — React team at Meta; canary builds through 2026-08-13 | strong — releases every ~3–4 days; groomed parity tracker | adequate — very active but ~97% one maintainer; 3 majors in ~11 months with rule renames | adequate — active, 0 open issues, FPs fixed not dismissed; bus factor 1 | adequate — ~4.5 years, four issues ever, deps maintained through 2026-08; bus factor 1 | weak — 22-month dormancy, broken 1.0.x exports, key rules 6–8 days old; bus factor 1, 12 stars |
| TypeScript fit (high) | strong — TS source since v5.2.0; bundled parsers analyze TS/TSX regardless of ESLint parser | strong — native TS/TSX; some TS-edge FIXMEs in exhaustive-deps | strong — TS-first, typescript-eslint based, type-checked presets | adequate — syntactic only; runs on TS/TSX via standard parsers, nothing type-aware | adequate — syntactic only; runs on TS/TSX via standard parsers | adequate — syntactic only; documents curried create() TS store detection |
| Browser compatibility (n-a) | n-a — dev-time tool | n-a | n-a | n-a | n-a | n-a |
| Contract-format support (n-a) | n-a | n-a | n-a | n-a | n-a | n-a |
| Integration cost (medium) | adequate — drop-in flat preset, eslint ^3–^10, Node >= 18; needs the ESLint-in-CI lane D-0002 permits | strong — already adopted; gap closure is config-only | adequate — clean presets incl. disable-conflict, but ESM-only/ESLint 9+/TS 5+/Node 20+ floors, oxlint overlap, config churn | strong — one plugin, eslint >= 8.40, flat+legacy; oxlint JS-plugin path exists (alpha) | strong — one rule, eslint >=3.0.0, flat+legacy, tandem-by-design with react-hooks | adequate — flat preset on eslint ^8/^9, but per-rule adoption needed: the preset errors opinionated structure rules |
| Runtime overhead (n-a) | n-a — lint-time only (CI time grows: compiler rules run a Babel-based pass) | n-a | n-a | n-a | n-a | n-a |
| Output quality (high) | strong — canonical Rules-of-React diagnostics; 7.1.0 improved reporting and set-state-in-effect coverage | adequate — both hooks rules present, but documented FP/FN and line-placement divergences from the originals | strong — documented rules with examples; suggestion-fixes; compiler-aligned semantics | strong — every diagnostic links to the matching React docs section; warn-level recommended preset | strong — complement by design (skips what exhaustive-deps reports); intentional deps markable in code | adequate — targeted diagnostics with autofixes, but a documented rewrite FP on name-matched non-Zustand hooks and zero field history |
| Escape hatch (low) | strong — standard disables, per-rule overrides, warn defaults on the noisy pair | strong — eslint-style directives, per-rule config, additionalHooks | strong — granular disable-* and off presets | adequate — standard ESLint suppression, recommended vs strict | strong — effect-dep marker comment, additionalHooks, standard disables | strong — storeHookPattern/maxCalls/maxProperties options, per-rule severities, standard disables |

**Eliminated below the table — eslint-plugin-react-perf (3.3.3):** weak maintenance (dormant since Jan 2025 with an unreleased bugfix), weak integration cost (duplicates oxlint's native react-perf plugin, violating D-0002's rationale), weak output quality (flags every inline literal regardless of memoization), and a rule family React Compiler is obsoleting. Strong license does not rescue three weak scores on weighted criteria.

## Recommendation

**Adopt — a two-lane composition under D-0002. No wrapper is needed; the "wrap" is pure configuration.**

Lane 1, oxlint (fast, editor/pre-commit): enable the `react` plugin and explicitly turn on `react/rules-of-hooks`; `react/exhaustive-deps` comes on with the plugin at correctness. This is config-only on the adopted linter:

```json
{
  "plugins": ["eslint", "typescript", "unicorn", "oxc", "react"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn"
  }
}
```

Note the `plugins` array must restate the defaults, because setting it overwrites the default set. Leave `react-perf` and the nursery `react/react-compiler` rule off.

Lane 2, ESLint-in-CI (canonical gate): a fresh ESLint 9 flat-config step running exactly three plugins — eslint-plugin-react-hooks v7 `recommended` (17 rules including the 14 compiler-powered checks oxlint lacks at stable maturity), eslint-plugin-react-you-might-not-need-an-effect `recommended` (nine unnecessary-effect rules, warn severity), and eslint-plugin-react-hooks-addons (single rule `no-unused-deps`, overridden from the preset's error to warn):

```js
// eslint.config.js — CI lane only
import reactHooks from "eslint-plugin-react-hooks";
import reactYMNNAE from "eslint-plugin-react-you-might-not-need-an-effect";
import reactHooksAddons from "eslint-plugin-react-hooks-addons";

export default [
  reactHooks.configs.recommended,
  reactYMNNAE.configs.recommended,
  reactHooksAddons.configs.recommended,
  {
    rules: {
      // the addons preset defaults to error; hold at warn until the spike sizes the annotation debt
      "react-hooks-addons/no-unused-deps": [
        "warn",
        { additionalHooks: { pattern: "useMqtt\\w+" } }, // placeholder — set from the app's real custom effect hooks
      ],
    },
  },
];
```

**Double-reporting policy, stated honestly:** `rules-of-hooks` and `exhaustive-deps` will run in both lanes, and the implementations demonstrably disagree in places (oxlint's deliberate top-level-call FP; #17765 closed not-planned; #25621 FN; different diagnostic lines). The ESLint v7 implementation is canonical — where the lanes disagree, ESLint wins, which is why oxlint's `exhaustive-deps` is set to warn above rather than error. The alternative (disabling the mirrors in one lane) would either slow the feedback loop or weaken the gate; accepting occasional duplicate warnings is the cheaper cost. The spike measures the actual disagreement rate. `no-unused-deps` adds no third voice to this: it deliberately skips what eslint-plugin-react-hooks reports, and oxlint has no unused-dependency rule at all.

**Gap-sweep additions (2026-08-13) — the two decisions, stated plainly.**

**eslint-plugin-react-hooks-addons: adopt now, at warn.** It closes the extra-dependency half of ranked anti-pattern #2 — the MQTT reconnect-churn pattern this report previously conceded was only partially lintable — with a rule that is complementary to the v7 preset by explicit design. The risk profile matches what this report already accepted for YMNNAE: bus factor 1, contained by warn severity, a degrade-to-noise failure mode, and trivial removability (one rule, no autofix, no config entanglement). Its ~4.5-year history with one false-positive report ever clears the maintenance bar that the days-old alternative below does not. The spike sets the final severity and the real `additionalHooks` pattern after the annotation debt is counted.

**eslint-plugin-zustand-rules: spike candidate, not adopted.** The capability is real — `require-shallow-selector` makes anti-pattern #6 lintable with an autofix, which this report previously said no hooks rule covered — but every version containing it is six to eight days old, shipped after 22 months of dormancy on a 1.0.x line whose rules never loaded, by a single maintainer with 12 stars, and carries a README-documented false-positive class in which the autofix rewrites non-Zustand hooks that merely match a name pattern. An autofix that edits working code needs field evidence before it belongs near a gate — and warn severity contains noisy diagnostics but not a bad rewrite, because `--fix` applies fixers regardless of severity. Adopting it six days after release would be indistinguishable from not having surveyed it. The spike (scoped below) runs its three correctness-class rules at warn with the autofix in dry-run; individual rules graduate on demonstrated signal plus evidence that the August 2026 burst was a restart, not a blip.

**Why not the others.** @eslint-react is skipped for now: its hooks/effects coverage is now substantially a subset of eslint-plugin-react-hooks v7 (`set-state-in-effect`, `set-state-in-render`, `purity`, `immutability` all exist upstream from the React team), its unnecessary-effect reputation is outdated (`no-unnecessary-use-callback`/`-memo` removed in v5, never had `no-unnecessary-use-effect`), and what remains genuinely additive (type-aware rules, `react-web-api` leak rules) does not justify a bus-factor-1 dependency with three majors of churn in 11 months and the steepest platform floors in the set. Its `react-web-api` leak rules are the first candidate to revisit in the spike if browser-API cleanup bugs prove real. eslint-plugin-react-perf is rejected outright (dormant, duplicates oxlint, obsoleted by React Compiler). Building anything is not on the table: the canonical implementation is maintained by the React core team and the niche detector has an active, responsive maintainer — there is no gap a build would fill.

**Risks — the weakest links:**

- **Both lint lanes double-report two rules with known divergences.** Developers may see conflicting diagnostics for the same line. Mitigated by the ESLint-is-canonical policy and oxlint-at-warn, but not eliminated; if the spike measures high disagreement, demote or disable oxlint's `exhaustive-deps`.
- **Two adopted plugins are bus-factor 1.** Nick van Dyke's (YMNNAE) and Zheng Song's (react-hooks-addons) track records are good — FPs fixed and tracker drained on one, four issues in ~4.5 years on the other — but neither has an institutional backstop. Containment: both run at warn, so if either stalls or rots it degrades to noise, not a broken gate — and neither niche has a maintained alternative in this survey's candidate set (@eslint-react removed its unnecessary-effect equivalents; nothing else inverts `exhaustive-deps`).
- **`no-unused-deps` flags intentional trigger-only dependencies until they are annotated.** A dep used purely to re-run an effect is the rule's one structural FP class; the effect-dep marker comment converts each into documented intent. If the spike finds a large annotation debt, the rollout changes from enforce-now to annotate-first — the same audit posture as the exhaustive-deps suppressions.
- **Anti-pattern #6 stays gate-less until the zustand-rules spike.** Deferring that adoption is a deliberate trade: fresh-object selectors keep relying on review and the `useShallow` convention in the interim, with a named, autofixable lint path ready if the spike clears it.
- **Compiler-powered rules are new to this codebase and their hit count is unknown.** The v7 preset turns 12 of them on at error. A codebase with pervasive render-phase mutation could see a large initial wall of errors; the preset supports per-rule severity overrides, and the spike sizes this before the gate is enforced.
- **YMNNAE's known FP classes align with this app's data layer.** React-Query-style options objects and parent-communication indirection are its historical FP hotspots; warn severity plus targeted per-rule disables contain this.
- **CI lint time grows.** The compiler-powered rules run a Babel-based analysis pass; the ESLint lane will be materially slower than oxlint. That is the D-0002 trade by design — fast lane stays fast — but the spike should record the wall-time delta.
- **The most damaging app-specific anti-pattern is not lintable.** MQTT subscribe/unsubscribe asymmetry (question 2's #1) is caught by no candidate; it needs a shared-hook convention and Strict Mode, which this track can recommend but not enforce.

**Constraints applied:** D-0001 (survey-only — nothing installed or executed; every claim traces to registries, documentation, source, and issue trackers; spikes pre-scoped below), D-0002 (oxlint stays the fast default; ESLint added in CI only for rules oxlint cannot cover — the gap table is the justification), D-0003 (all recommended tools MIT OSS, no paid tiers), D-0004 (facts/app-profile.md is unfilled; every assumption declared below), D-0007 (STE summary).

**Assumptions declared in place of facts** (facts/app-profile.md is unfilled):

- The app's React version is unknown — and, verified, **irrelevant to this recommendation**: eslint-plugin-react-hooks 7.1.1 has no React peerDependency. React version matters only for `useEffectEvent` (19.2+) fix guidance and future compiler adoption (17+).
- No ESLint lane exists today; the CI step is a fresh ESLint 9 flat-config install. eslint-plugin-react-hooks tolerates eslint ^3–^10, YMNNAE >= 8.40.0, and react-hooks-addons >= 3.0.0, so an existing older ESLint would also work.
- CI runners provide Node >= 18 (the eslint-plugin-react-hooks floor) and can run npm-installed CLIs.
- The current `.oxlintrc.json` does not already enable the `react` or `react-perf` plugins; the Lane-1 change is therefore additive.
- Components consume Zustand/xstate via the libraries' hooks rather than hand-rolled effect subscriptions; if hand-subscription is common, `no-external-store-subscription` becomes one of the highest-value rules here.
- The names of the app's custom effect-style hooks (the `useMqttTopic` convention) are unknown; the `additionalHooks` pattern in the Lane-2 config is a declared placeholder, set during the spike.
- Hooks matching the `use*Store` naming convention are assumed to be Zustand stores; any non-Zustand hook matching that pattern is a documented rewrite hazard for the zustand-rules spike, whose `storeHookPattern` must be narrowed first.
- The app uses mqtt.js over WSS with REST alongside (per the program's framing); the "not lintable" verdict on subscription-lifecycle bugs assumes an arbitrary client object, not a wrapper library with its own lint rules.
- React Compiler is not currently adopted in the build; `preserve-manual-memoization` and `config`/`gating` diagnostics are therefore expected to be silent.
- The count of existing `exhaustive-deps` suppression comments is unknown and assumed small; a large count changes the rollout from "enforce now" to "audit first".

## What a spike would validate

Pre-scoped per D-0001:

- Run the Lane-2 ESLint config on the app; record diagnostics per rule. Decide severity overrides — especially whether `set-state-in-effect`, `purity`, and `immutability` produce an actionable list or an initial wall of errors.
- Measure the YMNNAE false-positive rate on real code, specifically the parent-communication rules and any React-Query/router idioms; decide `recommended` vs `strict` and any per-rule disables.
- Quantify oxlint-vs-ESLint disagreement on `exhaustive-deps` and `rules-of-hooks` (same files, diff the diagnostics); decide whether oxlint's mirrors stay at warn, move to error, or get disabled.
- Audit every existing `eslint-disable`/`oxlint-disable` of `exhaustive-deps` surfaced by the new lane; classify as stale-closure risk vs legitimate.
- Count `no-unused-deps` hits and classify each as reconnect-churn bug (remove the dep) vs intentional trigger (annotate with the effect-dep marker); set the real `additionalHooks` pattern from the app's custom effect hooks; decide whether the rule graduates from warn to error once the annotation debt reaches zero.
- Trial eslint-plugin-zustand-rules without adopting it: run `require-shallow-selector`, `use-store-selectors`, and `no-state-mutation` at warn — not the full `flat/recommended` preset, whose structural-convention rules are opinionated errors — dry-run the `useShallow` autofix and hand-review every proposed rewrite, and verify `storeHookPattern` captures no non-Zustand `use*Store` hooks. Graduate individual rules only on demonstrated signal plus continued maintainer activity after the August 2026 release burst.
- Record the CI wall-time delta of the ESLint lane (compiler-powered rules run a Babel-based pass) against the oxlint baseline.
- Trial oxlint's alpha JS-plugin runtime loading eslint-plugin-react-hooks and YMNNAE (the reserved `react-hooks` namespace must be aliased); assess whether the ESLint lane can collapse into oxlint once the runtime is stable.
- Check whether @eslint-react's `react-web-api` leak rules find real missing cleanups (timers, listeners, observers) on the app; adopt that single sub-plugin only on demonstrated hits.
- Confirm whether a shared `useMqttTopic`-style hook exists; if not, prototype one and verify Strict Mode double-invocation exposes subscribe/unsubscribe asymmetry in dev.

## Sources

- https://registry.npmjs.org/eslint-plugin-react-hooks — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1 — accessed 2026-08-13
- https://react.dev/reference/eslint-plugin-react-hooks — accessed 2026-08-13
- https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/README.md — accessed 2026-08-13
- https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md — accessed 2026-08-13
- https://react.dev/blog/2025/10/07/react-compiler-1 — accessed 2026-08-13
- https://x.com/reactjs/status/1973518734708133989 — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/react/exhaustive-deps — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/react/rules-of-hooks — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/react/react-compiler.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/react_perf/jsx-no-new-object-as-prop — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/plugins.html — accessed 2026-08-13
- https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha — accessed 2026-08-13
- https://github.com/oxc-project/oxc/tree/main/crates/oxc_linter/src/rules/react — accessed 2026-08-13
- https://github.com/oxc-project/oxc/tree/main/crates/oxc_linter/src/rules/react_perf — accessed 2026-08-13
- https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/rules/react/react_compiler.rs — accessed 2026-08-13
- https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/rules/react/rules_of_hooks.rs — accessed 2026-08-13
- https://raw.githubusercontent.com/oxc-project/oxc/main/crates/oxc_linter/src/rules/react/exhaustive_deps.rs — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/1022 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/14326 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/17743 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/17765 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/18328 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/20791 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/25621 — accessed 2026-08-13
- https://registry.npmjs.org/oxlint/latest — accessed 2026-08-13
- https://github.com/oxc-project/oxc/releases — accessed 2026-08-13
- https://github.com/Rel1cx/eslint-react — accessed 2026-08-13
- https://github.com/Rel1cx/eslint-react/releases — accessed 2026-08-13
- https://registry.npmjs.org/@eslint-react/eslint-plugin/latest — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-x/latest — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-hooks-extra — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-hooks-extra/latest — accessed 2026-08-13
- https://eslint-react.xyz/docs/rules — accessed 2026-08-13
- https://eslint-react.xyz/docs/rules/exhaustive-deps — accessed 2026-08-13
- https://eslint-react.xyz/docs/rules/set-state-in-render — accessed 2026-08-13
- https://eslint-react.xyz/docs/presets — accessed 2026-08-13
- https://eslint-react.xyz/docs/changelog — accessed 2026-08-13
- https://www.eslint-react.xyz/docs/release-notes/v2.0.0 — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/@eslint-react/eslint-plugin — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-x — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-dom — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-web-api — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-hooks-extra — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-you-might-not-need-an-effect — accessed 2026-08-13
- https://api.github.com/repos/Rel1cx/eslint-react — accessed 2026-08-13
- https://api.github.com/repos/Rel1cx/eslint-react/contributors — accessed 2026-08-13
- https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect — accessed 2026-08-13
- https://raw.githubusercontent.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/main/README.md — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-you-might-not-need-an-effect — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-you-might-not-need-an-effect/latest — accessed 2026-08-13
- https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/releases — accessed 2026-08-13
- https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues?q=is%3Aissue+false+positive — accessed 2026-08-13
- https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues?q=is%3Aissue+is%3Aclosed — accessed 2026-08-13
- https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues?q=is%3Aissue+is%3Aopen — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-perf — accessed 2026-08-13
- https://github.com/cvazac/eslint-plugin-react-perf — accessed 2026-08-13
- https://api.github.com/repos/cvazac/eslint-plugin-react-perf — accessed 2026-08-13
- https://api.github.com/repos/cvazac/eslint-plugin-react-perf/commits — accessed 2026-08-13
- https://react.dev/learn/you-might-not-need-an-effect — accessed 2026-08-13
- https://react.dev/learn/removing-effect-dependencies — accessed 2026-08-13
- https://react.dev/learn/synchronizing-with-effects — accessed 2026-08-13
- https://react.dev/learn/react-compiler/introduction — accessed 2026-08-13
- https://react.dev/reference/react/memo — accessed 2026-08-13
- https://registry.npmjs.org/babel-plugin-react-compiler — accessed 2026-08-13
- https://github.com/TheAlexLichter/oxlint-react-compiler-rules — accessed 2026-08-13
- https://voidzero.dev/posts/announcing-oxlint-js-plugins — accessed 2026-08-13
- https://blog.logrocket.com/react-19-2-is-here/ — accessed 2026-08-13
- https://github.com/pmndrs/zustand — accessed 2026-08-13
- https://www.debugbear.com/blog/react-compiler — accessed 2026-08-13
- https://raw.githubusercontent.com/szhsin/eslint-plugin-react-hooks-addons/master/README.md — accessed 2026-08-13
- https://raw.githubusercontent.com/szhsin/eslint-plugin-react-hooks-addons/master/index.ts — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-react-hooks-addons — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-react-hooks-addons — accessed 2026-08-13
- https://api.github.com/repos/szhsin/eslint-plugin-react-hooks-addons — accessed 2026-08-13
- https://api.github.com/search/issues?q=repo:szhsin/eslint-plugin-react-hooks-addons+is:issue&per_page=50 — accessed 2026-08-13
- https://raw.githubusercontent.com/paulschoen/eslint-plugin-zustand-rules/main/README.md — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-zustand-rules — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/eslint-plugin-zustand-rules — accessed 2026-08-13
- https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules — accessed 2026-08-13
- https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules/contributors — accessed 2026-08-13
- https://api.github.com/repos/paulschoen/eslint-plugin-zustand-rules/issues?state=all&per_page=30 — accessed 2026-08-13
- https://github.com/paulschoen/eslint-plugin-zustand-rules/releases — accessed 2026-08-13
