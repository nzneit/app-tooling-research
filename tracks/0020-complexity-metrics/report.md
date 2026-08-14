# 0020-complexity-metrics — report

## Summary (STE)

This track examined eight tools that report cyclomatic and cognitive complexity for TypeScript and React code. A gap sweep on 2026-08-13 added two candidates. The team excluded eslint-plugin-sonarjs because its current license is not open source. We recommend that the team adopt three tools together. The oxlint complexity rules give a free cyclomatic gate in the current linter. Biome, limited to one rule in CI, adds the cognitive-complexity gate.

The tool fta-cli makes a ranked list of complex files for refactor planning. The GPL-licensed tool cognitive-complexity-ts can add ranked cognitive scores as an optional supplement. The most important risk is the Biome rule. It is not React-aware, and we did not prove that its scores match the SonarSource algorithm. Compare Biome scores with the SonarSource algorithm on real components in the spike.

**As of**: 2026-08-13 (amended 2026-08-13 after the Wave 1 gap sweep; versions evaluated are listed per candidate)
**Recommendation**: adopt — oxlint complexity rules (baseline cyclomatic gate) + Biome scoped to `lint/complexity/noExcessiveCognitiveComplexity` in CI (primary cognitive gate, ratcheted via `--suppress` seeding) + fta-cli (ranked refactor reporting); cognitive-complexity-ts (GPL-3.0) optional for ranked per-function cognitive scores. eslint-plugin-sonarjs is excluded by license ruling (SSALv1 after v2.0.4; D-0003).

## Survey

### oxlint built-in complexity rules (v1.78.0)

oxlint ships 849 rules (114 on by default, 318 auto-fixable) per the [rules reference](https://oxc.rs/docs/guide/usage/linter/rules), and **every complexity-family rule is off by default** — none are in the default correctness set. The app's current oxlint adoption therefore almost certainly enforces no complexity limits until `.oxlintrc.json` opts in. The family covers cyclomatic complexity ([`eslint/complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html), default max 20, `classic`/`modified` variants — but a recent port, added only in v1.37.0) plus the size guardrails: [`eslint/max-depth`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-depth.html), [`eslint/max-lines`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines.html), [`eslint/max-lines-per-function`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines-per-function.html), [`eslint/max-nested-callbacks`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-nested-callbacks.html), [`eslint/max-params`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-params.html), [`eslint/max-statements`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-statements.html), [`eslint/max-classes-per-file`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-classes-per-file.html), and `unicorn/max-nested-calls`.

**No cognitive-complexity rule exists natively** — no `sonarjs/*` rule appears among the 849; porting the sonarjs rules is an open community request ([oxc discussion #4863](https://github.com/oxc-project/oxc/discussions/4863)). Interim third-party routes exist (the JS-plugin API loading eslint-plugin-sonarjs — now moot under the same SSALv1 exclusion recorded below — or [oxlint-plugin-complexity](https://github.com/itaymendel/oxlint-plugin-complexity)) but are unevaluated. Output is threshold-gating diagnostics only: no per-file/per-function score export, ranking, or trends. TS/TSX parse natively with no type info needed ([CLI docs](https://oxc.rs/docs/guide/usage/linter/cli)); suppression is via `oxlint-disable` directives, though ignore comments cannot change thresholds ([ignore-comments docs](https://oxc.rs/docs/guide/usage/linter/ignore-comments.html)). MIT ([npm](https://registry.npmjs.org/oxlint/latest)); weekly releases from the oxc-project org ([releases](https://github.com/oxc-project/oxc/releases)); v1.78.0 shipped 2026-08-10.

### ESLint core `complexity` rule (v10.8.1)

ESLint core's [`complexity` rule](https://eslint.org/docs/latest/rules/complexity) is the mature cyclomatic reference: off by default, default max 20, options `{max, variant: "classic"|"modified"}`; counts if/else-if, switch cases, `&&`/`||`, `?.`, ternaries, and default params, with class field initializers scored separately. The message states both numbers ("{{name}} has a complexity of {{complexity}}. Maximum allowed is {{max}}." per the [rule source](https://raw.githubusercontent.com/eslint/eslint/main/lib/rules/complexity.js)) but gives no per-increment locations. MIT, extremely active (10.8.1 current per the [registry](https://registry.npmjs.org/eslint/latest), OpenJS-backed), purely syntactic on TS/TSX via `@typescript-eslint/parser`, and zero marginal cost once ESLint runs in CI. Also home to the strongest sidecar-file ratchet mechanism found in the track, relevant again if ESLint-in-CI arrives via another track: [bulk suppressions](https://eslint.org/docs/latest/use/suppressions) (since v9.24.0, [announcement](https://eslint.org/blog/2025/04/introducing-bulk-suppressions/); `--prune-suppressions`, [`--pass-on-unpruned-suppressions` in v9.28.0](https://eslint.org/blog/2025/05/eslint-v9.28.0-released/), [API-level `applySuppressions` in v10.1.0](https://eslint.org/blog/2026/03/eslint-v10.1.0-released/)).

### eslint-plugin-sonarjs (v4.2.0)

**Status: EXCLUDED by license under D-0003 (user ruling, 2026-08-13).** Technically the strongest output in the track, and out of scope for adoption.

**License**: the [npm metadata](https://registry.npmjs.org/eslint-plugin-sonarjs/latest) declares LGPL-3.0-only, but the shipped tarball's [LICENSE file](https://unpkg.com/eslint-plugin-sonarjs@4.2.0/LICENSE) and every bundled source header are the **Sonar Source-Available License v1.0 (SSALv1)** — source-available, not OSI open source. The [SonarJS monorepo README](https://github.com/SonarSource/SonarJS) confirms releases after 2024-11-29 are SSALv1; version archaeology via unpkg shows v2.0.4 as the last release shipping LGPL-3.0 text, and v3.0.2 (2025-02-13) onward shipping SSALv1. **Ruling (user, 2026-08-13): all releases after v2.0.4 are SSALv1 source-available and are excluded under D-0003. This is decided, not open — no legal check is pending.** Pinning the ESLint-8-era v2.0.4 was considered and rejected as stale.

**Capability (retained as the reference bar)**: `sonarjs/cognitive-complexity` (S3776, default threshold 15) names both the actual score and the limit in every diagnostic and computes secondary locations for each +1 increment ([rule source](https://raw.githubusercontent.com/SonarSource/SonarJS/master/packages/analysis/src/jsts/rules/S3776/rule.ts)) — genuinely actionable refactor pointers. It is React-aware: it detects functional components and special-cases JSX short-circuit expressions, which matters for a hooks-heavy app. First-class TS via `@typescript-eslint/parser` (dependency range `typescript >=5 <6.1.0`); flat-config `recommended` preset for ESLint 9/10 ([README](https://unpkg.com/eslint-plugin-sonarjs@4.2.0/README.md)). Maintenance is strong (4.2.0 on 2026-07-14, monthly cadence, [releases API](https://api.github.com/repos/SonarSource/SonarJS/releases)) — irrelevant to adoption, but these capabilities define what the OSS replacements below do and do not reach: Biome restores the same algorithm under a clean license without the per-increment locations or React-awareness.

### Biome noExcessiveCognitiveComplexity (v2.5.8)

Biome's Rust linter ships [`lint/complexity/noExcessiveCognitiveComplexity`](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/), an implementation of the SonarSource cognitive-complexity algorithm (the rule docs cite SonarJS's cognitive-complexity rule as their source); available since Biome v1.0.0, **off by default** (not in the recommended set), default threshold 15 via `maxAllowedComplexity` (range 1–254; 255 is reserved as an internal overflow score). The diagnostic states both numbers — "Excessive complexity of 21 detected (max: 15)." plus a refactor note — but review of the [rule source](https://raw.githubusercontent.com/biomejs/biome/main/crates/biome_js_analyze/src/lint/complexity/no_excessive_cognitive_complexity.rs) confirms it attaches a **single primary range at the function head and no per-increment secondary locations** — the one diagnostic-depth regression vs the excluded S3776. The scoring machinery tracks the Campbell spec in outline: structural +1 for if/else, switch, loops, catch, finally, ternaries, and labeled break/continue; logical-operator sequences counted once per run of identical operators; nesting penalties for loops, catch, if/else, switch, and ternaries; else-if chains de-nested to avoid double counting. Declared and observed deviations: a `with`-statement increment the source itself flags as "a personal judgement call" beyond the SonarSource paper, no recursion increment found, and **no JSX/React special-casing anywhere in the rule** (unlike S3776's component detection and JSX short-circuit handling).

Operationally it fits D-0002 as a CI-only standalone next to oxlint, scoped so the two never overlap: `biome lint --only=complexity/noExcessiveCognitiveComplexity` runs just this rule (per the [CLI reference](https://biomejs.dev/reference/cli/), `--only` promotes an off, non-recommended rule to `warn`, so CI pairs it with `--error-on-warnings`), or a minimal `biome.json` sets the rule to `error` with the recommended set disabled; `--skip` takes precedence over `--only`; `--max-diagnostics` defaults to 20 and must be raised for baseline runs. Suppressions ([docs](https://biomejs.dev/analyzer/suppressions/)): `biome-ignore` (next line), `biome-ignore-all` (file), and `biome-ignore-start`/`biome-ignore-end` ranges, all requiring an explanation; `biome lint --write --suppress` (with `--reason`) writes those comments for every existing violation — the seeding half of a ratchet, held in source comments rather than an ESLint-style sidecar file (no baseline-file mechanism exists in Biome's docs). Reporters are built in ([reporters reference](https://biomejs.dev/reference/reporters/)): `github` (workflow-command annotations), `gitlab` (Code Quality artifact for the MR widget), `rdjson` (reviewdog diagnostic JSON), plus sarif/json/junit/checkstyle. MIT OR Apache-2.0 ([npm](https://registry.npmjs.org/@biomejs/biome/latest)); 2.5.8 published 2026-08-11 on a weekly cadence (2.5.5 → 2.5.8 across 2026-07-21 to 2026-08-11, [releases API](https://api.github.com/repos/biomejs/biome/releases)); single npm package with platform-specific binaries.

### fta-cli (v3.0.1)

MIT Rust/SWC CLI ([repo](https://github.com/sgb-io/fta), [npm](https://registry.npmjs.org/fta-cli)) reporting per-file cyclomatic complexity, Halstead metrics, LOC, and a composite FTA score with maintainability bands (>60 "Needs improvement", 50–60 "Could be better", <50 "OK" — [scoring docs](https://ftaproject.dev/docs/scoring)). **No cognitive complexity, and per-file granularity only** (no per-function breakdown), so it cannot satisfy the track alone — its value is the ranked refactor backlog and cheap CI cap. Output as table/CSV/JSON plus a scriptable `runFta()`; CI gating via `score_cap` in `fta.json` (non-zero exit on breach, provider-agnostic — [configuration docs](https://ftaproject.dev/docs/configuration)); no built-in trend/baseline mode, so trends mean storing JSON artifacts and diffing (a community [fta-github-action](https://github.com/exiguus/fta-github-action) exists). Native TS/TSX parsing, ~1600 files/sec claimed. Maintenance is the caveat: v3.0.1 shipped 2026-08-10 but cadence is roughly one release per year from a single maintainer (~330 stars, [releases](https://github.com/sgb-io/fta/releases)); adoption is healthier than stars suggest (~147k weekly downloads, [npm downloads API](https://api.npmjs.org/downloads/point/last-week/fta-cli)). Note v3 changed scores vs 2.x (SWC upgrade, operator/operand counting fixes) — relevant when baselining.

### cognitive-complexity-ts (v0.8.2)

TypeScript-native analyzer of the SonarSource cognitive-complexity metric built on the TypeScript compiler API ([repo](https://github.com/Deskbot/Cognitive-Complexity-TS)), and the only candidate found in this track that **exports ranked cognitive scores** rather than pass/fail diagnostics. `ccts-json` emits a recursive score tree ([shared/types.ts](https://raw.githubusercontent.com/Deskbot/Cognitive-Complexity-TS/master/shared/types.ts)): a per-file record (kind, score, inner) containing container records (kind: class/function/module/type, name, score, line, column, inner) — per-function scores with positions, directly sortable into a cognitive refactor backlog; `ccts`/`ccts-ui` opens an HTML GUI over the same data, and a typed Node API (`build/src/api.js` + `.d.ts`) supports scripting ([npm](https://registry.npmjs.org/cognitive-complexity-ts/latest)). Score fidelity is self-documented rather than certified: the [README](https://raw.githubusercontent.com/Deskbot/Cognitive-Complexity-TS/master/README.md) discloses deliberate deviations from the spec — classes, files, namespaces, and types also receive scores; recursive references (not just recursive calls) increment; `&`/`|` carry no increment — and carries an explicit "unaffiliated with Sonar Source" disclaimer. JSX/TSX support is not stated in the README (spike-verify; the underlying TypeScript compiler does parse TSX).

License and health: **GPL-3.0** (npm field and repo SPDX) — OSI-approved, so OSS-valid under D-0003; copyleft is flagged per the rubric, but a dev-time CLI invoked in CI neither links into nor ships with the app, so its obligations stay with the tool (forks or derived tooling would inherit GPL). Health is the honest weak point: a single maintainer (Thomas Richards, the only npm maintainer since the first release on 2020-05-10), 42 stars, 5 forks, 1 open issue, no GitHub releases; repo created 2019-11-05, last push 2026-05-22 ([GitHub API](https://api.github.com/repos/Deskbot/Cognitive-Complexity-TS)); ~6.0k weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/cognitive-complexity-ts)); v0.8.x pre-1.0. It bundles its own `typescript` (^5.9.3), so it does not couple to the app's TS version. Role: optional, non-gating ranked-cognitive supplement — replaceable reporting garnish, never a gate.

### lizard (v1.23.0)

MIT ([LICENSE.txt](https://raw.githubusercontent.com/terryyin/lizard/master/LICENSE.txt)) multi-language CLI reporting per-function NLOC, CCN (cyclomatic), tokens, and parameter counts ([README](https://github.com/terryyin/lizard)). **No cognitive complexity** — an open request ([#432](https://github.com/terryyin/lizard/issues/432)) with an unmerged PR ([#440](https://github.com/terryyin/lizard/pull/440)) the maintainer pushed back on in March 2026. TS/TSX support uses a heuristic token-based "fuzzy" parser, not a real AST, with a documented history of TS miscounts (#476, #471, #331 — [issue search](https://github.com/terryyin/lizard/issues?q=is%3Aissue+typescript)), though the 1.22.x–1.23.0 line substantially improved TS/TSX/JSX handling ([CHANGELOG](https://raw.githubusercontent.com/terryyin/lizard/master/CHANGELOG.md)). Requires Python >=3.8 and pip ([PyPI](https://pypi.org/project/lizard/)) — a second toolchain and a suppression syntax (`#lizard forgives`) disjoint from the JS lint stack. Active (repo pushed 2026-08-13, 1.23.0 released 2026-06-02) but effectively single-maintainer since 2012. Rejected for this track: misses the cognitive half, heuristic TS parsing, foreign toolchain.

### typhonjs-escomplex (v0.1.0)

**Effectively dead — the research plan's flag is confirmed.** Last npm publish and last master commit are both 2018-12-21 ([npm](https://www.npmjs.com/package/typhonjs-escomplex), [commits API](https://api.github.com/repos/typhonjs-node-escomplex/typhonjs-escomplex/commits?per_page=3)); 15 open issues untouched; the [README](https://raw.githubusercontent.com/typhonjs-node-escomplex/typhonjs-escomplex/master/README.md) still references a "fall '18" roadmap. MPL-2.0 (OSS-compliant, moot). Beyond maintenance: the escomplex metric family ([escomplex README](https://github.com/escomplex/escomplex)) has no cognitive complexity; the Babel parser frozen in 2018 predates years of TS syntax; and there is no maintained CLI (the historical [complexity-report](https://github.com/escomplex/complexity-report) is explicitly unmaintained). Rejected.

## Key questions

### 1. What complexity coverage does oxlint already ship, and at which rule maturity?

oxlint v1.78.0 ships nine complexity-related rules, **all off by default** (none in the default correctness set), enabled only via `.oxlintrc.json`:

- `eslint/complexity` — cyclomatic complexity (default max 20; `classic`/`modified` variants) — restriction category, **added v1.37.0, the newest and least battle-tested of the family**
- `eslint/max-depth` — nested block depth (default 4) — pedantic, since v0.15.12
- `eslint/max-lines` — lines per file (default 300) — pedantic, since v0.2.14
- `eslint/max-lines-per-function` — lines per function (default 50) — pedantic, since v0.15.12
- `eslint/max-nested-callbacks` — callback nesting (default 10) — pedantic, since v0.15.12
- `eslint/max-params` — parameter count (default 3) — style, since v0.2.14
- `eslint/max-statements` — statements per function (default 10) — style, since v1.35.0
- `eslint/max-classes-per-file` — classes per file (default 1) — pedantic, since v0.3.4
- `unicorn/max-nested-calls` — nested call expressions — style

Maturity: the max-* family is long-standing; `eslint/complexity` is a faithful but recent port of ESLint core's rule. Cognitive complexity is absent entirely.

### 2. Where is the gap that requires a second CLI in CI?

| Capability | oxlint v1.78.0 | Biome v2.5.8 (scoped, CI-only) |
|---|---|---|
| Cyclomatic complexity | yes — `eslint/complexity` (recent port, v1.37.0) | no rule — not needed; oxlint covers it |
| Cognitive complexity | **no native rule**; sonarjs port is an open request ([#4863](https://github.com/oxc-project/oxc/discussions/4863)) | yes — `noExcessiveCognitiveComplexity` (SonarSource algorithm, MIT OR Apache-2.0) |
| Actual-vs-allowed numbers in message | yes | yes — "Excessive complexity of 21 detected (max: 15)." |
| Per-increment secondary locations | no | no — single range at the function head |
| React/JSX-aware cognitive scoring | no | no — no JSX special-casing in the rule source |
| Score export / ranking / trends | no — pass/fail diagnostics only | no scores — diagnostics via json/github/gitlab/rdjson/sarif reporters; ranking needs fta-cli + cognitive-complexity-ts |
| Baseline ratchet on legacy code | no | inline seeding — `--suppress` writes `biome-ignore` comments; no sidecar baseline file |

The gap is twofold: **cognitive complexity** (oxlint has none; after the sonarjs exclusion, Biome's `noExcessiveCognitiveComplexity` is the only maintained in-family OSS source) and **turning numbers into refactor opportunities** (both linters emit threshold diagnostics only; ranking needs fta-cli's per-file JSON and, for the cognitive metric specifically, cognitive-complexity-ts's per-function score tree). Cyclomatic alone does not require a second tool — oxlint covers it config-only. **Nothing in this track now requires ESLint-in-CI**; if track 0040 stands one up for hooks rules, ESLint core `complexity` can ride along there as a zero-marginal-cost parity hedge.

### 3. Threshold-gating vs trend reporting — which serves refactor planning, and what generates a readable report?

Both, in a ratchet: pure hard-threshold gating on a legacy codebase blocks unrelated PRs with pre-existing violations, and pure trend dashboards have no OSS-native persistent store for JS complexity. With ESLint out of the composition, the ratchet changes shape: Biome has **no sidecar baseline file** (nothing like `eslint-suppressions.json` appears in its docs), but `biome lint --write --suppress` (with `--reason`) writes required-explanation `biome-ignore` comments at every existing violation — a one-time seeding commit — after which CI fails only new or worsened functions, and cleanup happens by deleting comments as code is refactored ([CLI reference](https://biomejs.dev/reference/cli/), [suppressions docs](https://biomejs.dev/analyzer/suppressions/)). The diff-averse alternative keeps source untouched: `--reporter=rdjson` piped into [reviewdog](https://github.com/reviewdog/reviewdog) enforces only on changed lines. For reference: ESLint's [bulk suppressions](https://eslint.org/docs/latest/use/suppressions) remain the strongest sidecar-file ratchet if ESLint-in-CI arrives via track 0040, and [Betterer](https://github.com/phenomnomnominal/betterer) — no stable release since 2022-08-09 ([registry](https://registry.npmjs.org/@betterer/betterer)) — is superseded by these linter-native mechanisms.

Readable reports, per surface: Biome ships the reporting surface built in ([reporters reference](https://biomejs.dev/reference/reporters/)) — `--reporter=github` emits workflow-command annotations on PRs, `--reporter=gitlab` emits a Code Quality artifact for the [merge-request widget](https://docs.gitlab.com/ci/testing/code_quality/) with per-MR new-vs-resolved diffs, and json/junit/checkstyle/sarif cover artifact needs. SARIF upload to GitHub code scanning still needs paid Code Security on private repos ([docs](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github)), **conflicting with D-0003's no-paid stance** — the github reporter or reviewdog is the free path. fta-cli `--json` remains the ranked worst-files list (trend = diff stored CI artifacts), and cognitive-complexity-ts's `ccts-json`/HTML UI adds the ranked cognitive view. Badges via the [shields.io endpoint badge](https://shields.io/badges/endpoint-badge) from a published summary JSON.

### 4. How do cyclomatic and cognitive scores diverge on React/hooks-heavy code, and which metric should gate?

Direction of divergence: **cognitive ≫ cyclomatic** on hooks-heavy components. Cognitive complexity accumulates across nested functions, so a component whose `useEffect`/handler callbacks and JSX `&&`/ternary short-circuits are each simple can still blow the component-level score, while per-function cyclomatic scores each callback separately and stays quiet. This is documented in the implementation's own trackers ([eslint-plugin-sonarjs#422](https://github.com/SonarSource/eslint-plugin-sonarjs/issues/422), [SonarJS#3289](https://github.com/SonarSource/SonarJS/issues/3289), Sonar community threads on [hook nesting overflow](https://community.sonarsource.com/t/react-hook-nested-functions-complexity-overflow/74131) and [functional-component scoring](https://community.sonarsource.com/t/sonarqube-counts-incorrect-cognitive-complexity-for-react-functional-components-bug-no-functionality/30852)); part signal (nesting is the real readability problem in fat components), part React-idiom noise. Biome's implementation accumulates the same way but has **no React special-casing at all** (S3776's component detection and JSX short-circuit handling have no counterpart in its rule source), so on JSX-heavy components the noise floor is, if anything, higher.

The literature does not crown either metric: the origin white paper ([Campbell, SonarSource](https://www.sonarsource.com/docs/CognitiveComplexity.pdf); peer-reviewed at [TechDebt 2018](https://dl.acm.org/doi/abs/10.1145/3194164.3194186)) and a supportive [ESEM 2020 meta-analysis](https://arxiv.org/pdf/2007.12520) favor cognitive for understandability, while [Lavazza et al., JSS 2023](https://dl.acm.org/doi/10.1016/j.jss.2022.111561) found it no better than LOC/cyclomatic, and a [2023 study of 216 developers](https://arxiv.org/html/2303.07722) found both only modest predictors. Verdict: **gate on cognitive complexity, ratcheted with threshold headroom for JSX** (it flags the nested-hook components cyclomatic misses); with the gate now implemented by Biome's non-React-aware rule, that headroom matters more, not less; keep cyclomatic as a secondary testability signal; treat both primarily as refactor-opportunity ranking inputs, not absolute pass/fail lines.

**Survey verification note outcome**: the flagged claim that typhonjs-escomplex has had no releases since 2018 is confirmed exactly — last npm publish and last master commit are both 2018-12-21; it was scored accordingly (weak on maintenance) and rejected.

## Rubric comparison

| Criterion (weight) | oxlint complexity rules | ESLint core `complexity` | eslint-plugin-sonarjs | Biome noExcessiveCognitiveComplexity | fta-cli | cognitive-complexity-ts |
|---|---|---|---|---|---|---|
| License (high) | strong — MIT (npm metadata) | strong — MIT | **excluded — SSALv1 (not OSS) after v2.0.4; user ruling 2026-08-13 under D-0003** | strong — MIT OR Apache-2.0 | strong — MIT | adequate — GPL-3.0 (OSS-valid; copyleft flagged, acceptable for a dev-time CLI) |
| Maintenance health (high) | strong — weekly releases, oxc-project org | strong — ESLint core, OpenJS-backed | strong — but moot (excluded) | strong — weekly releases (2.5.5 → 2.5.8, 2026-07-21 to 2026-08-11), active org | adequate — fresh v3.0.1 but ~1 release/yr, single maintainer | weak — single maintainer since 2019, 42 stars, v0.8.x pre-1.0, last push 2026-05-22, ~6k weekly downloads |
| TypeScript fit (high) | strong — native TS/TSX, no type info needed | strong — syntactic, runs via @typescript-eslint/parser | strong — but moot (excluded) | strong — native TS/TSX parsing, no type info needed | strong — native SWC parsing of .ts/.tsx | adequate — TypeScript compiler API (bundles typescript ^5.9.3); JSX/TSX support unstated, spike-verify |
| Browser compatibility (n-a) | n-a | n-a | n-a | n-a | n-a | n-a |
| Contract-format support (n-a) | n-a | n-a | n-a | n-a | n-a | n-a |
| Integration cost (medium) | strong — config-only, already adopted (D-0002) | strong — zero marginal once ESLint-in-CI exists | n-a (excluded) | strong — single binary, scoped via `--only` or minimal biome.json; reporters built in | strong — npx + optional fta.json; exit-code gating | adequate — npx CLI, JSON to stdout; no thresholds or gating, artifact-only |
| Runtime overhead (n-a) | n-a | n-a | n-a | n-a | n-a | n-a |
| Output quality (high) | weak — no cognitive metric; threshold diagnostics only, no score export | adequate — both numbers in message, no per-increment locations | strong — but moot (excluded) | adequate — actual-vs-allowed in message; no per-increment locations, no score export; github/gitlab/rdjson/sarif reporters | weak — no cognitive; per-file only; ranked scores + JSON are its upside | strong (for ranking) — recursive per-function/class/file score tree with name/line/column, plus HTML UI; no gating |
| Escape hatch (low) | strong — disable directives + JS-plugin API | strong — disable comments, per-glob overrides | n-a (excluded) | strong — biome-ignore/-all/-start/-end (reason required), `--suppress` seeding | strong — full JSON/CSV export, runFta() API, forkable | adequate — typed API, small forkable codebase; forks inherit GPL |

The eslint-plugin-sonarjs column is retained for reference only: it defines the capability bar (per-increment secondary locations, React-awareness) that the OSS replacements do not fully reach, and it is excluded from adoption by license.

Early-eliminated candidates: **lizard** (MIT, active, but no cognitive complexity — open PR #440 unmerged — heuristic non-AST TS parsing with a miscount history, and a Python toolchain foreign to a JS CI) and **typhonjs-escomplex** (dead since 2018-12-21 on both npm and master, no cognitive complexity, 2018-era parser, no maintained CLI).

## Recommendation

**Adopt, as a per-need composition** (no single tool covers the track):

1. **Baseline cyclomatic gate — oxlint built-in rules (adopt now, config-only).** Enable `eslint/complexity` plus `max-depth`, `max-lines-per-function`, and `max-nested-callbacks` in `.oxlintrc.json`. Zero new dependencies, satisfies D-0002 (oxlint stays the fast default), covers the cyclomatic half at every developer's keyboard, not just CI. Example starting point:

```json
{
  "rules": {
    "eslint/complexity": ["warn", { "max": 20 }],
    "eslint/max-depth": ["warn", { "max": 4 }],
    "eslint/max-lines-per-function": ["warn", { "max": 80, "skipBlankLines": true, "skipComments": true }],
    "eslint/max-nested-callbacks": ["warn", { "max": 4 }]
  }
}
```

2. **Primary cognitive gate — Biome scoped to `lint/complexity/noExcessiveCognitiveComplexity` (adopt, CI-only).** This replaces the previous ESLint + eslint-plugin-sonarjs plan, which died with the license ruling (sonarjs releases after v2.0.4 are SSALv1 and excluded under D-0003). Biome implements the same SonarSource algorithm under MIT OR Apache-2.0 as a single Rust binary, and D-0002 explicitly permits a standalone CLI in CI for rules oxlint cannot cover. Run it scoped so it never overlaps oxlint: `biome lint --only=complexity/noExcessiveCognitiveComplexity --error-on-warnings --max-diagnostics=none` (the `--only` promotion of an off rule lands at `warn`, hence `--error-on-warnings`), or commit a minimal `biome.json` with the recommended set off and this one rule at `error`. Ratchet by seeding once with `biome lint --write --suppress --reason="complexity baseline 2026-08-13"`, which writes inline `biome-ignore` comments at existing violations so CI fails only new or worsened functions. Surface results with the built-in `github` (annotations) or `gitlab` (Code Quality widget) reporter — no third-party annotation action needed. Consolidation exit: if oxc lands cognitive complexity natively (open request, discussion #4863), drop Biome for one fewer tool.

3. **Refactor-opportunity reporting — fta-cli (adopt).** Run in CI, store `--json` output as an artifact, surface the ranked worst-files list (and optionally a `score_cap` as a coarse backstop). This supplies the cyclomatic/Halstead ranking layer neither linter produces; the cognitive gate's own PR surfacing is handled by Biome's built-in reporters (item 2).

4. **Optional ranked-cognitive supplement — cognitive-complexity-ts (trial in the spike; adopt only if the ranked view earns its keep).** `ccts-json` is the only OSS output found that exports ranked per-function cognitive scores (recursive tree with name/line/column/score), closing the gap where Biome is pass/fail-only and fta ranks by cyclomatic/Halstead. GPL-3.0 is OSS-valid under D-0003 and its copyleft does not attach to app code for a CI-invoked dev-time CLI, but it is flagged per the rubric; bus factor 1, 42 stars, and pre-1.0 status confine it to a non-gating, easily-removed reporting role.

**Constraints applied**: D-0001 (survey-only — nothing was installed or run; all claims are desk-verified against registries, repos, and docs, and the spike section below reserves hands-on validation), D-0002 (oxlint retained as default; Biome, fta-cli, and the optional cognitive-complexity-ts confined to CI), D-0003 (OSS-only — drove the sonarjs exclusion under the 2026-08-13 user ruling, the SonarQube Server exclusion, the GPL-copyleft flag on cognitive-complexity-ts, and the rejection of paid GitHub Code Security for SARIF on private repos), D-0004 (facts/app-profile.md is unfilled; every substitute assumption is declared below).

**Risks (honest ranking, weakest link first)**:

- **Biome's cognitive-rule fidelity is the weakest link.** The same-algorithm claim rests on the rule citing SonarJS as its source, not on numeric verification; the source adds a with-statement increment beyond the spec, shows no recursion increment, and has no React/JSX special-casing — so scores on hooks-heavy components can diverge from the S3776 reference in either direction. The spike must triangulate before the gate goes ratcheted-error.
- **Lost diagnostic depth vs the excluded sonarjs.** Biome emits one range at the function head with no per-increment secondary locations, so refactor pointers are coarser; mitigated by cognitive-complexity-ts's per-function score tree and HTML UI (item 4).
- **The ratchet lives in source comments.** `--suppress` seeding writes `biome-ignore` comments into files — a churny one-time diff, reason strings included — and Biome has no sidecar baseline file to prune; the alternative (rdjson + reviewdog diff-filtering) enforces only on touched lines and lets untouched legacy debt persist silently.
- **oxlint's `eslint/complexity` is a recent port (v1.37.0)** — parity with ESLint core is asserted, not battle-tested; the spike compares the two one-off, and if track 0040 lands ESLint-in-CI, core `complexity` can run there as a standing parity hedge.
- **cognitive-complexity-ts is a bus-factor-1, pre-1.0 GPL project** with self-declared spec deviations (file/class/type scores, recursion-reference increments) — acceptable only because its role is optional and non-gating.
- **fta-cli bus factor**: single maintainer, roughly annual releases; mitigated by MIT source, full JSON export, and its supplementary (non-gating) role. Its per-file granularity may be too coarse if the app concentrates complexity in few large files.
- **Toolchain sprawl**: three CLIs in CI (oxlint + Biome + fta, optionally + ccts) is the D-0002-accepted cost; Biome must stay scoped via `--only` or minimal config, or it silently duplicates oxlint's rule surface — document a single source of truth for thresholds.

**Assumptions declared in place of facts** (facts/app-profile.md is unfilled; see the assumed-facts list filed with this report):

- TypeScript version assumed >=5.0. No tool in the final composition couples to the app's TypeScript version: Biome and fta-cli parse natively, and cognitive-complexity-ts bundles its own typescript (^5.9.3). (The previous sonarjs-driven <6.1.0 cap is obsolete with the exclusion.)
- CI provider assumed GitHub Actions; Biome's `github` reporter (workflow-command annotations) was selected on that basis. On GitLab, swap to `--reporter=gitlab`, which feeds the Code Quality widget and strengthens the trend story.
- Repository assumed private without paid GitHub Code Security, so SARIF code scanning (including Biome's `sarif` reporter) was treated as unavailable and the free annotation paths chosen instead.
- App scale assumed mid-sized (low thousands of source files at most), making the one-time `--suppress` seeding diff and fta's per-file ranking tractable.
- Current `.oxlintrc.json` assumed to enable no complexity-family rules (all are off by default).
- ESLint assumed absent from the repo today; after the sonarjs exclusion this track no longer needs it, so no ESLint-in-CI cost was included (track 0040 may still introduce it independently).

## What a spike would validate

Pre-scoped per D-0001 for later hands-on work:

- Run Biome scoped (`--only=complexity/noExcessiveCognitiveComplexity`) on the real codebase: violation counts at `maxAllowedComplexity` 15/20/25 on the hooks-heaviest components, and how much is signal vs JSX-idiom noise given the rule's lack of React special-casing.
- Triangulate score fidelity: hand-score a sample of components against the Campbell spec, then compare Biome's and cognitive-complexity-ts's numbers on the same files; decide the acceptable divergence before the gate goes error-level.
- Exercise the suppression-seeded ratchet end to end: measure the `biome lint --write --suppress` baseline diff, verify a new violation fails CI (`--error-on-warnings`) while baseline code passes, and confirm how stale `biome-ignore` comments get cleaned up during refactors.
- Compare oxlint `eslint/complexity` scores against ESLint core `complexity` on the same files (one-off, local) to confirm parity of the recent port (same `max`, same variant).
- Run fta-cli v3 across the codebase: does the per-file ranking point at the components the team already believes need refactoring, and is file-level granularity actionable at the app's actual scale?
- Confirm the CI-provider branch: wire Biome's `github` or `gitlab` reporter, check whether `--max-diagnostics` limits annotation output, and measure added pipeline time for the Biome + fta run.
- cognitive-complexity-ts: confirm it parses `.tsx` (the README does not state JSX support), assess whether the JSON tree and HTML UI beat fta's ranking for refactor planning, and check that its declared deviations (class/file/type scores, recursion-reference increments) do not distort the ranking.
- Watch oxc discussion #4863: if oxlint gains a native cognitive-complexity rule, re-evaluate dropping Biome to shrink the toolchain.

## Sources

- https://oxc.rs/docs/guide/usage/linter/rules — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-depth.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines-per-function.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-nested-callbacks.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-params.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-statements.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-classes-per-file.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/ignore-comments.html — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/cli — accessed 2026-08-13
- https://registry.npmjs.org/oxlint/latest — accessed 2026-08-13
- https://github.com/oxc-project/oxc/releases — accessed 2026-08-13
- https://github.com/oxc-project/oxc/discussions/4863 — accessed 2026-08-13
- https://github.com/itaymendel/oxlint-plugin-complexity — accessed 2026-08-13
- https://eslint.org/docs/latest/rules/complexity — accessed 2026-08-13
- https://raw.githubusercontent.com/eslint/eslint/main/lib/rules/complexity.js — accessed 2026-08-13
- https://registry.npmjs.org/eslint/latest — accessed 2026-08-13
- https://eslint.org/docs/latest/use/formatters/ — accessed 2026-08-13
- https://eslint.org/docs/latest/use/suppressions — accessed 2026-08-13
- https://eslint.org/blog/2025/04/introducing-bulk-suppressions/ — accessed 2026-08-13
- https://eslint.org/blog/2025/05/eslint-v9.28.0-released/ — accessed 2026-08-13
- https://eslint.org/blog/2026/03/eslint-v10.1.0-released/ — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-sonarjs — accessed 2026-08-13
- https://registry.npmjs.org/eslint-plugin-sonarjs/latest — accessed 2026-08-13
- https://www.npmjs.com/package/eslint-plugin-sonarjs — accessed 2026-08-13
- https://unpkg.com/eslint-plugin-sonarjs@4.2.0/LICENSE — accessed 2026-08-13
- https://unpkg.com/eslint-plugin-sonarjs@4.2.0/package.json — accessed 2026-08-13
- https://unpkg.com/eslint-plugin-sonarjs@4.2.0/README.md — accessed 2026-08-13
- https://unpkg.com/eslint-plugin-sonarjs@4.2.0/cjs/helpers/accessibility.js — accessed 2026-08-13
- https://github.com/SonarSource/SonarJS — accessed 2026-08-13
- https://api.github.com/repos/SonarSource/SonarJS/releases — accessed 2026-08-13
- https://raw.githubusercontent.com/SonarSource/SonarJS/master/packages/analysis/src/jsts/rules/S3776/rule.ts — accessed 2026-08-13
- https://github.com/SonarSource/eslint-plugin-sonarjs/issues/422 — accessed 2026-08-13
- https://github.com/SonarSource/SonarJS/issues/3289 — accessed 2026-08-13
- https://community.sonarsource.com/t/react-hook-nested-functions-complexity-overflow/74131 — accessed 2026-08-13
- https://community.sonarsource.com/t/sonarqube-counts-incorrect-cognitive-complexity-for-react-functional-components-bug-no-functionality/30852 — accessed 2026-08-13
- https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/ — accessed 2026-08-13
- https://raw.githubusercontent.com/biomejs/biome/main/crates/biome_js_analyze/src/lint/complexity/no_excessive_cognitive_complexity.rs — accessed 2026-08-13
- https://biomejs.dev/reference/cli/ — accessed 2026-08-13
- https://biomejs.dev/reference/reporters/ — accessed 2026-08-13
- https://biomejs.dev/analyzer/suppressions/ — accessed 2026-08-13
- https://registry.npmjs.org/@biomejs/biome/latest — accessed 2026-08-13
- https://api.github.com/repos/biomejs/biome/releases — accessed 2026-08-13
- https://www.sonarsource.com/docs/CognitiveComplexity.pdf — accessed 2026-08-13
- https://www.sonarsource.com/blog/cognitive-complexity-because-testability-understandability/ — accessed 2026-08-13
- https://dl.acm.org/doi/abs/10.1145/3194164.3194186 — accessed 2026-08-13
- https://arxiv.org/pdf/2007.12520 — accessed 2026-08-13
- https://dl.acm.org/doi/10.1016/j.jss.2022.111561 — accessed 2026-08-13
- https://www.sciencedirect.com/science/article/abs/pii/S0164121222002370 — accessed 2026-08-13
- https://arxiv.org/html/2303.07722 — accessed 2026-08-13
- https://github.com/sgb-io/fta — accessed 2026-08-13
- https://registry.npmjs.org/fta-cli — accessed 2026-08-13
- https://ftaproject.dev/docs/scoring — accessed 2026-08-13
- https://ftaproject.dev/docs/configuration — accessed 2026-08-13
- https://ftaproject.dev/docs/getting-started — accessed 2026-08-13
- https://github.com/sgb-io/fta/releases — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/fta-cli — accessed 2026-08-13
- https://github.com/exiguus/fta-github-action — accessed 2026-08-13
- https://github.com/Deskbot/Cognitive-Complexity-TS — accessed 2026-08-13
- https://raw.githubusercontent.com/Deskbot/Cognitive-Complexity-TS/master/README.md — accessed 2026-08-13
- https://raw.githubusercontent.com/Deskbot/Cognitive-Complexity-TS/master/shared/types.ts — accessed 2026-08-13
- https://registry.npmjs.org/cognitive-complexity-ts/latest — accessed 2026-08-13
- https://registry.npmjs.org/cognitive-complexity-ts — accessed 2026-08-13
- https://api.github.com/repos/Deskbot/Cognitive-Complexity-TS — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/cognitive-complexity-ts — accessed 2026-08-13
- https://github.com/terryyin/lizard — accessed 2026-08-13
- https://pypi.org/project/lizard/ — accessed 2026-08-13
- https://pypi.org/pypi/lizard/json — accessed 2026-08-13
- https://raw.githubusercontent.com/terryyin/lizard/master/LICENSE.txt — accessed 2026-08-13
- https://raw.githubusercontent.com/terryyin/lizard/master/CHANGELOG.md — accessed 2026-08-13
- https://api.github.com/repos/terryyin/lizard — accessed 2026-08-13
- https://github.com/terryyin/lizard/issues/432 — accessed 2026-08-13
- https://github.com/terryyin/lizard/pull/440 — accessed 2026-08-13
- https://github.com/terryyin/lizard/issues?q=is%3Aissue+typescript — accessed 2026-08-13
- https://www.npmjs.com/package/typhonjs-escomplex — accessed 2026-08-13
- https://registry.npmjs.org/typhonjs-escomplex — accessed 2026-08-13
- https://github.com/typhonjs-node-escomplex/typhonjs-escomplex — accessed 2026-08-13
- https://api.github.com/repos/typhonjs-node-escomplex/typhonjs-escomplex — accessed 2026-08-13
- https://api.github.com/repos/typhonjs-node-escomplex/typhonjs-escomplex/commits?per_page=3 — accessed 2026-08-13
- https://raw.githubusercontent.com/typhonjs-node-escomplex/typhonjs-escomplex/master/README.md — accessed 2026-08-13
- https://github.com/escomplex/escomplex — accessed 2026-08-13
- https://github.com/escomplex/complexity-report — accessed 2026-08-13
- https://www.npmjs.com/package/eslint-formatter-gitlab — accessed 2026-08-13
- https://registry.npmjs.org/eslint-formatter-gitlab — accessed 2026-08-13
- https://www.npmjs.com/package/eslint-formatter-codeclimate — accessed 2026-08-13
- https://docs.gitlab.com/ci/testing/code_quality/ — accessed 2026-08-13
- https://registry.npmjs.org/@microsoft/eslint-formatter-sarif — accessed 2026-08-13
- https://registry.npmjs.org/@microsoft/eslint-formatter-sarif/latest — accessed 2026-08-13
- https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/uploading-a-sarif-file-to-github — accessed 2026-08-13
- https://github.com/reviewdog/reviewdog — accessed 2026-08-13
- https://github.com/reviewdog/action-eslint — accessed 2026-08-13
- https://github.com/ataylorme/eslint-annotate-action — accessed 2026-08-13
- https://github.com/phenomnomnominal/betterer — accessed 2026-08-13
- https://registry.npmjs.org/@betterer/betterer — accessed 2026-08-13
- https://shields.io/badges/endpoint-badge — accessed 2026-08-13
