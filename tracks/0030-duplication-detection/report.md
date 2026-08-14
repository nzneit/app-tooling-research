# 0030-duplication-detection — report

## Summary (STE)

This track examined tools that find duplicated code in a React and TypeScript codebase. A follow-up sweep added fallow, clone-alert, and Simian to the first four candidates. We now recommend that the team adopt fallow as the primary detector and CI gate. Its committed baseline blocks new clones and quarantines the existing ones. Its semantic mode also detects clones with renamed identifiers. Keep jscpd and the similarity-ts audit as fallbacks until a spike confirms fallow.

The most important risk is that fallow is five months old and has one dominant author. Its detection quality is not yet proven against jscpd on real code. The next step is a spike that runs fallow and jscpd head-to-head on the application code.

**As of**: 2026-08-13 (versions evaluated are listed per candidate; amended 2026-08-13 after the Wave 1 gap sweep)
**Recommendation**: adopt — fallow (primary detector, committed-baseline ratchet, CI gate); jscpd (named fallback backbone + burn-down reporting); similarity-ts (interim scheduled audit for renamed clones until fallow's semantic mode is spike-validated)

## Survey

### jscpd (v5.0.15)

Token-based copy/paste detector using Rabin-Karp hashing; MIT-licensed, distributed via npm/cargo/brew ([repo](https://github.com/kucherenko/jscpd)). Evaluated at **5.0.15** (Rust engine, published 2026-08-13 — the day of this survey) alongside the legacy TypeScript engine at 4.3.0 (same day). v5 is a documented drop-in CLI replacement for v4 — same `.jscpd.json`, same reporters, 24–37x faster — though it drops v4's LevelDB/Redis stores and Node programmatic API ([docs/rust.md](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md)).

Maintenance is extremely active: near-weekly releases through Jun–Aug 2026, 6.0k stars, bundled by GitHub Super Linter, Codacy, and MegaLinter ([repo API](https://api.github.com/repos/kucherenko/jscpd)). Caveat: a single dominant maintainer (kucherenko authored ~62% of commits per the [contributors API](https://api.github.com/repos/kucherenko/jscpd/contributors)).

TypeScript fit is strong at the surface: `typescript` and `tsx` are first-class among 223 formats, and v5's `--cross-formats js-ts` preset compares TS/TSX against JS/JSX with erasable type syntax stripped ([docs/rust.md](https://github.com/kucherenko/jscpd/blob/master/docs/rust.md)). The structural gap: the documented modes (`strict|mild|weak`) only vary whitespace/comment handling — there is **no identifier abstraction**, so systematically renamed variables (Type-2 clones) defeat detection ([docs/typescript.md](https://github.com/kucherenko/jscpd/blob/master/docs/typescript.md)).

Output quality is best-in-class: 13 reporters including interactive HTML, markdown (PR-comment-ready), JSON, SARIF for GitHub Code Scanning, badge, a token-efficient `ai` reporter, and `console-full` with `--blame` side-by-side author attribution (`==` same author / `<=` different author) — directly useful for review discussions and burn-down ownership ([README](https://raw.githubusercontent.com/kucherenko/jscpd/master/README.md)). CI ergonomics: zero-config npx run or self-contained Rust binary, an official GitHub Action with `threshold`/`exit-code`/`upload-sarif` inputs and `duplication-percentage`/`clones-found` outputs, and documented pre-commit recipes ([docs/ci-and-hooks.md](https://github.com/kucherenko/jscpd/blob/master/docs/ci-and-hooks.md)).

**Verified: jscpd has no baseline or ratchet mechanism** — see Key question 3.

### PMD CPD (v7.26.0)

The copy-paste detector bundled with PMD, a mature JVM-based analyzer under a BSD-style license with Apache-2.0 components ([LICENSE](https://github.com/pmd/pmd/blob/main/LICENSE)). Maintenance is healthy: roughly monthly releases (7.26.0 on 2026-06-29) on a two-decade-old community project ([releases](https://github.com/pmd/pmd/releases)).

TypeScript support is real but shallow, and it eliminates CPD for this track:

1. **No TSX.** The TypeScript language module registers only the `.ts` extension ([TsLanguageModule.java](https://github.com/pmd/pmd/blob/main/pmd-javascript/src/main/java/net/sourceforge/pmd/lang/typescript/TsLanguageModule.java)); no documented mechanism forces `.tsx` onto the language ([open issue #4945](https://github.com/pmd/pmd/issues/4945)). For a React codebase, a large share of the duplication surface is invisible.
2. **No rename tolerance for TS.** `--ignore-identifiers` and `--ignore-literals` are documented for Java and C++ only ([CPD docs](https://docs.pmd-code.org/latest/pmd_userdocs_cpd.html)); the [TypeScriptCpdLexer](https://github.com/pmd/pmd/blob/main/pmd-javascript/src/main/java/net/sourceforge/pmd/lang/typescript/cpd/TypeScriptCpdLexer.java) is a thin ANTLR wrapper with no anonymization — so CPD on TS is effectively Type-1-only.
3. **JVM in CI.** Distribution is zip, Homebrew, or a Temurin Docker image — no npm package ([installation docs](https://github.com/pmd/pmd/blob/main/docs/pages/pmd/userdocs/installation.md), [docker](https://github.com/pmd/docker)) — an off-stack toolchain for a JS team.

Reports are text-oriented (text, xml, csv, markdown, vs); no HTML dashboard, no SARIF, no baseline mechanism ([CPD docs](https://docs.pmd-code.org/latest/pmd_userdocs_cpd.html)).

### similarity-ts (v0.5.0)

A Rust CLI that detects similar functions/types/classes in TS/JS via AST comparison, not tokens: oxc-parser ASTs scored with TSED (Tree Structure Edit Distance on APTED), with size penalties and bloom-filter pre-filtering ([repo](https://github.com/mizchi/similarity), [author write-up](https://zenn.dev/mizchi/articles/introduce-ts-similarity?locale=en)). MIT-licensed; TS/JS is the only "production ready" target. Evaluated at **0.5.0** (crates.io, published 2026-04-11).

Detection is the differentiator: Type-2 (renamed identifiers) is explicitly handled via a configurable `--rename-cost` (default 0.3), with renamed function pairs demoed at 88–89% similarity. Uniquely in this candidate set, it also compares type aliases/interfaces/classes structurally (`--types`, `--classes`, `--structural-weight`/`--naming-weight`) — relevant for duplicated store shapes and reason-code types. Type-3 (reordered/edited statements) recall is not claimed anywhere and is unverified; an `--experimental-overlap` mode targets partial clones.

The weak half: output is ANSI console text only — VSCode-clickable `file:line` pairs with similarity % and impact priority. The CLI source defines **no JSON/SARIF/HTML/markdown reporter and no baseline** ([main.rs](https://raw.githubusercontent.com/mizchi/similarity/main/crates/similarity-ts/src/main.rs)); the only CI hook is `--fail-on-duplicates` (exit 1 on any finding). The author's intended workflow is piping output to an AI agent. Maturity is thin: a ~14-month-old solo project (mizchi authored ~96% of commits per the [contributors API](https://api.github.com/repos/mizchi/similarity/contributors)), no npm distribution ([npm 404](https://registry.npmjs.org/similarity-ts)), ~4 months of quiet since the 0.5.0 release and last push (2026-04-16) ([repo API](https://api.github.com/repos/mizchi/similarity)). Install is `cargo install` or prebuilt [GitHub Releases binaries](https://github.com/mizchi/similarity/releases).

### fallow (v3.16.0)

*Added 2026-08-13 from the Wave 1 gap sweep (docs/2026-08-13-wave-1-gap-sweep.md).* A Rust "codebase intelligence" binary for TypeScript/JavaScript, npm-distributed, that runs dead-code, circular-dependency, complexity/health, architecture-boundary, and duplication analysis in one pass without Node tooling in the analysis path ([README](https://raw.githubusercontent.com/fallow-rs/fallow/main/README.md)). Evaluated at **3.16.0** (npm, published 2026-08-13 per the [registry](https://registry.npmjs.org/fallow)). License is MIT for the CLI; the project is open-core — the npm description reads "Free static analysis of code and styles, optional paid runtime intelligence (Fallow Runtime)" ([npm latest](https://registry.npmjs.org/fallow/latest)). Everything this track needs is in the free MIT CLI; the paid runtime product is excluded under D-0003 and unused here.

Maintenance is a study in contrasts. Velocity and adoption are exceptional for its age: 4.3k stars, repo pushed 2026-08-13, 21 npm versions since 2026-07-01 ([repo API](https://api.github.com/repos/fallow-rs/fallow), [registry](https://registry.npmjs.org/fallow)). But the project was created 2026-03-17 — five months old — and one author (BartWaardenburg) holds ~87% of contributions ([contributors API](https://api.github.com/repos/fallow-rs/fallow/contributors)). The npm wrapper requires Node >= 22 and ships Ed25519-signature-plus-SHA-256-verified platform binaries; cargo and Docker are alternative channels ([npm latest](https://registry.npmjs.org/fallow/latest), [CI docs](https://docs.fallow.tools/integrations/ci)).

The duplication detector is the most capable in this candidate set on paper ([duplication docs](https://docs.fallow.tools/analysis/duplication)). Algorithm: suffix array with LCP, avoiding quadratic pairwise comparison. Four modes: `strict` and `mild` (the default) are documented as producing identical results — AST-based tokenization already strips whitespace/comments; `weak` lets string-literal values differ (copied code with changed URLs/messages); `semantic` applies token-type normalization to match structurally equivalent code with **renamed identifiers and different literals — i.e., Type-2 detection inside a token-based gate**, with renamed identifiers reported alongside each clone. An optional `--near` flag adds function-scoped near-miss clones at 80% shingle similarity (partial Type-3). Defaults mirror jscpd: `minTokens` 50, `minLines` 5, plus `minOccurrences` 2 and an optional percentage `--threshold`. Import/require wiring is stripped from the token stream by default (structural boilerplate, not copy-paste), and intentional clones can be suppressed by fingerprint via `duplicates.ignoredClones`. Coverage: TS/JS first-class; the [file-types docs](https://docs.fallow.tools/analysis/file-types) additionally list Vue/Svelte/Astro/MDX/HTML/CSS-family files and explicitly enumerate React Native `.web.tsx`/`.ios.tsx`/`.android.tsx`/`.native.tsx` variants — plain `.tsx` rides the standard TS handling (only the platform-suffixed variants need special resolution), and the [limitations page](https://docs.fallow.tools/analysis/limitations) records no TSX or duplication caveat; the spike confirms it regardless. Honest concession from fallow's own docs: jscpd v5 is faster at raw scanning; fallow's pitch is one-pass integration with dead-code/health analysis.

The ratchet is the headline ([CI docs](https://docs.fallow.tools/integrations/ci)): `--save-baseline <path>` writes a JSON baseline that is **committed to the repository**; `--baseline <path>` then quarantines everything in it — "only new issues (not in the baseline) get reported." Findings are fingerprinted as rule_id + path + snippet, surviving whitespace-only changes (note: a file **move** changes the path, so quarantined findings resurface — see Risks). `fallow audit` gates PRs with a pass/warn/fail verdict in `gate: new-only` mode (default; compares against the PR base, fails only on introduced findings) or `gate: all`, and takes per-analysis baselines including `--dupes-baseline`. `--changed-since <ref>` scopes any run to modified files. Exit codes are conventional (0 clean / 1 findings / 2 fatal). Baselines do not auto-shrink; the documented practice is periodic regeneration on main as debt burns down — a manual but honest ratchet.

Reporting for `dupes` ([CLI reference](https://docs.fallow.tools/cli/dupes)): `human`, `json`, `sarif`, `compact`, `markdown`, `codeclimate`, `gitlab-codequality`, `pr-comment-github`, `pr-comment-gitlab`, `review-github`, `review-gitlab`, plus GitHub annotations, job summaries, and SVG badges; clones are grouped into clone groups and clone families with extract-function/extract-module refactoring suggestions and impact ranking (duplicated tokens x occurrences with a capped spread boost). An official GitHub Action (`fallow-rs/fallow@v3`) exposes the audit verdict as an output and posts PR summary/review comments; a GitLab CI template does the equivalent for MRs. What is missing versus jscpd: an interactive HTML dashboard and `--blame` author attribution.

### clone-alert (v1.1.5)

*Added 2026-08-13 from the Wave 1 gap sweep.* A PMD-CPD-compatible copy-paste detector for the TS ecosystem: real TypeScript-compiler `Scanner` tokens fed through a Karp-Rabin rolling hash and a faithful port of PMD's `MatchCollector`, validated against PMD's vendored golden fixtures (~2–5% divergence, attributed to match bucketing), benchmarked 10–27x faster than CPD at 1.3–2.6x less memory ([README](https://raw.githubusercontent.com/BaryshevRS/clone-alert/master/README.md)). MIT; npm install with a single runtime dependency (`typescript`), Node 18+; evaluated at **1.1.5** (published 2026-08-05 per the [registry](https://registry.npmjs.org/clone-alert)).

Capabilities land squarely on this track's gaps. Coverage: `.ts/.mts/.cts`, `.js/.mjs/.cjs`, **`.jsx`/`.tsx`**, Vue SFCs, Svelte 5+, Angular templates — removing CPD's TSX disqualifier while keeping CPD compatibility. Normalization: opt-in `--ignore-identifiers` and `--ignore-literals` — the options CPD documents for Java/C++ only, here ported to TS tokens (strict PMD-like comparison by default). Reporters: text, json, xml, csv (two variants), markdown, sarif, `ai`, and a shields badge endpoint. And the decisive feature: a committed `--baseline` JSON of **content-based fingerprints** — CI "fails only on new duplicates," and because fingerprints are content-only, "accepted clones stay suppressed even after the code moves." `CPD-OFF`/`CPD-ON` comment markers and a first-party GitHub Action round it out. Default `--minimum-tokens` is 50.

The disqualifier is maturity, not capability: repo created 2026-06-16 (~8 weeks old), 3 stars, 0 forks, one open issue, a single npm maintainer ([repo API](https://api.github.com/repos/BaryshevRS/clone-alert), [registry](https://registry.npmjs.org/clone-alert)). It matters to this report as the second falsifier of the old "no stored baseline" finding, as a design reference (content-only fingerprints are more move-robust than fallow's path-inclusive ones), and as the CPD-compatible fallback shape — not as an adoptable CI gate today. Re-check in 6–12 months.

### Simian (v4.2.1)

*Added 2026-08-13 from the Wave 1 gap sweep.* The classic language-agnostic line-based similarity analyzer — roughly two decades of commercial history, now open-sourced by Quandary Peak under Apache-2.0 ([repo API](https://api.github.com/repos/quandarypeak/simian)); v4.2.1, tagged "First OSS release," shipped 2026-04-01, with the repo last pushed 2026-06-19 and 11 stars ([releases](https://api.github.com/repos/quandarypeak/simian/releases)). It runs as a Java jar on JDK 8+ (tested through 21).

Detection is line-based with per-language tokenization and an unusually rich normalization surface ([README](https://raw.githubusercontent.com/quandarypeak/simian/main/README.md)): ignore identifiers, variable names, literals, strings, numbers, characters, modifiers, and bracket placement — rename-tolerant, Type-2-style matching, under a corporate steward rather than a solo author. The README's language list explicitly names both JavaScript **and TypeScript**. The catch for this stack: TSX is not named, and unrecognized files fall back to plain-text matching — whether `.tsx` routes through the TS lexer (and therefore whether identifier normalization applies to the React component surface, where this codebase's duplication lives) is unverified. Default threshold is 6 lines. Output formats are plain, xml, yaml, emacs, and vs — no JSON, SARIF, markdown, or HTML — and there is no baseline or CI gating beyond exit status. The JVM requirement carries the same off-stack knock this report gave PMD CPD. See the Recommendation for the explicit argue-for/against on the audit slot.

### custom ts-morph AST comparison (build option; ts-morph v28.0.0)

The substrate is excellent: [ts-morph](https://github.com/dsherret/ts-morph) (MIT) wraps the official TypeScript Compiler API and gives exact TS/TSX ASTs. But the library is effectively single-maintainer, its last stable release (28.0.0) dates to 2025-04-12, and its majors chase TypeScript compiler majors ([release 28.0.0](https://github.com/dsherret/ts-morph/releases/tag/28.0.0)) — a build inherits that upgrade treadmill.

A credible Type-2/3 detector is a real pipeline, not a script: unit extraction, identifier/literal normalization (with TSX-specific rules), fingerprinting at scale via winnowing ([Schleimer/Wilkerson/Aiken, SIGMOD 2003](https://theory.stanford.edu/~aiken/publications/papers/sigmod03.pdf)) or a SourcererCC-style token index ([ICSE 2016](https://dl.acm.org/doi/10.1145/2884781.2884877)), clone-class grouping, threshold tuning against React's structural monoculture (near-isomorphic `useEffect`/handler bodies are the dominant false-positive source), and then every reporter and the baseline mechanism hand-built. Realistically multiple engineer-weeks before the first trustworthy report, with zero community to absorb upkeep. The cautionary tale is [jsinspect](https://github.com/danielstjules/jsinspect), the historical JS AST-clone tool, [unpublished since August 2017](https://www.npmjs.com/package/jsinspect). And similarity-ts already *is* this build, in a faster parser. **Verdict: do not build.**

## Key questions

**1. Token-based vs AST/semantic similarity: which catches real reimplementations?** Both, but for different clone types — they are complements, not substitutes. Per the standard taxonomy ([survey, arXiv 2606.25272](https://arxiv.org/html/2606.25272)): exact token-sequence matchers (jscpd, CPD) reliably catch Type-1 (whitespace/comment variants); Type-2 (renamed identifiers) requires identifier normalization, which jscpd lacks entirely and CPD supports only for Java/C++; Type-3 (copy-tweaked statements) degrades under exact hashing because a single edited statement splits a clone into blocks that can each fall under `min-tokens` (inference, flagged as such). Bag-of-tokens overlap matching can reach Type-3 — [SourcererCC](https://ar5iv.labs.arxiv.org/html/1603.01661) hit 86–99% Type-3 recall at 86% precision on BigCloneBench ([UCI ISR](https://isr.uci.edu/content/sourcerercc-scaling-type-3-clone-detection-large-software-repositories)) — an approach no TS-ecosystem tool used until fallow's optional `--near` mode (function-scoped shingle matching at 80% similarity, third-party-unvalidated) approximated it. AST tree-edit-distance (similarity-ts) handles Type-2 by design and tolerates moderate statement edits; its Type-3 recall is unverified and is a spike question. **Amended 2026-08-13:** the sweep additions change the Type-2 half of this answer — fallow's `semantic` mode (token-type normalization) and clone-alert's opt-in `--ignore-identifiers` (over real TS-Scanner tokens) both deliver rename-normalized detection inside maintained token-based tools, so Type-2 coverage no longer requires an AST tool or a separate audit pass. Practical answer, revised: fallow's mode ladder spans Type-1 (`strict`/`mild`), literal variants (`weak`), Type-2 (`semantic`), and partial Type-3 (`--near`) inside the CI gate itself; similarity-ts remains the finest-grained instrument for ranked function/type-level similarity; jscpd remains the fastest pure Type-1/near-2 scanner.

**2. What thresholds avoid noise on React/TypeScript?** No published TS/React calibration study exists; tuning is empirical per codebase. Starting points: jscpd defaults `--min-tokens 50`, `--min-lines 5` ([apps/jscpd README](https://github.com/kucherenko/jscpd/tree/master/apps/jscpd)); more-sensitive community configs use 30/3 ([jscpd docs](https://jscpd.dev/getting-started/introduction)). PMD CPD conventionally starts at `--minimum-tokens 100` (finer-grained tokens). similarity-ts defaults to a similarity threshold of ~0.85 (README; the CLI investigator recorded 0.87 — the discrepancy is minor and spike-resolvable), examples span 0.7–0.9. React-specific noise controls in jscpd: `--ignore-pattern` regexes to drop import blocks, `jscpd:ignore-start/end` comments, and `--ignore` globs — the vendored AsyncAPI/OpenAPI contracts and any generated code **must** be glob-excluded or they will dominate the report ([MegaLinter's shipped template](https://raw.githubusercontent.com/oxsecurity/megalinter/main/TEMPLATES/.jscpd.json) is a real-world reference). Recommend two calibration runs (min-tokens 50 and 30) in the spike. **Amended 2026-08-13:** the sweep additions land on the same operating point — fallow defaults to min-tokens 50 / min-lines 5 / min-occurrences 2 and strips import wiring from the token stream by default, removing the import-block noise the `--ignore-pattern` advice above targets ([duplication docs](https://docs.fallow.tools/analysis/duplication)); clone-alert defaults to minimum-tokens 50; Simian defaults to 6 lines. Calibration transfers between jscpd and fallow almost unchanged, which keeps the fallback cheap.

**3. Can we ratchet with a stored baseline?** **Verification-note outcome: the earlier "jscpd baseline option" claim is FALSE.** Verified three independent ways on 2026-08-13: grep over the fetched docs found zero baseline/ratchet hits; the v5 CLI source ([cli.rs](https://raw.githubusercontent.com/kucherenko/jscpd/master/rust/crates/cpd/src/cli.rs)) defines no baseline field; and a GitHub issue search for "baseline" in kucherenko/jscpd returns nothing relevant ([search](https://api.github.com/search/issues?q=repo:kucherenko/jscpd+baseline)). jscpd itself ships only `--threshold <pct>` (fail above a duplication percentage) and `--exit-code` (fail on any clone). **Correction (2026-08-13): this report previously generalized that finding to "no candidate ships a stored clone-level baseline." That claim is falsified by the Wave 1 gap sweep.** Stored, committed, clone-level baselines exist off the shelf in two maintained TS-ecosystem tools: **fallow** (`--save-baseline`/`--baseline` committed JSON with rule+path+snippet fingerprints, per-analysis `--dupes-baseline`, and a `fallow audit` new-only PR gate with a pass/warn/fail verdict — [CI docs](https://docs.fallow.tools/integrations/ci)) and **clone-alert** (a committed JSON of content-only fingerprints; CI fails solely on new clones, and suppressions survive file moves — [README](https://raw.githubusercontent.com/BaryshevRS/clone-alert/master/README.md)). Simian has no baseline. The ratchet options, re-ranked: (a) **adopt fallow's baseline + audit gate** — now the recommendation; platform-independent (works on GitHub and GitLab alike) and clone-level, with manual baseline regeneration on main as the burn-down ratchet; (b) **clone-alert's committed baseline** — mechanically the cleanest fingerprint design, but on a 3-star, 8-week-old project; (c) the previous jscpd-side patterns, retained as fallback: percentage ratchet via `--threshold` (coarse — deletions elsewhere can mask new duplication), diff-scoped gating via the [pull-requests-jscpd action](https://github.com/marketplace/actions/pull-requests-jscpd), and SARIF → GitHub Code Scanning's new-alerts-on-PR behavior as a platform-layer baseline ([worked example](https://dev.to/vvbogdanov/add-a-50x-faster-duplicate-code-gate-to-github-actions-with-jscpd-rs-kml)) — the latter two GitHub-dependent; (d) [Betterer](https://phenomnomnominal.github.io/betterer/docs/results-file/) is a true stored-baseline harness but is effectively stalled (npm latest 6.0.0-alpha.1, 2024-12-01) — do not depend on it. SonarQube's native new-code gates remain excluded by D-0003.

**4. Which report formats serve the workflow?** jscpd covers every format the plan names: interactive HTML dashboard, markdown for PR comments, SARIF for PR annotations via Code Scanning, SVG badge, JSON/XML/CSV for custom tooling, `ai` for LLM-assisted triage, and `--blame` author attribution for burn-down ownership. PMD CPD offers text-oriented formats only (no HTML, no SARIF). similarity-ts is console-only — the weakest reporting in the set. Third-party [jscpd-html-reporter](https://github.com/SpitfireSatya/jscpd-html-reporter) adds git-blame attribution but needs a v5-compatibility check before use. **Amended 2026-08-13:** fallow's `dupes` command reaches near-parity with jscpd on the formats that matter — JSON, SARIF, markdown, CodeClimate/GitLab Code Quality, first-party PR-comment and review-comment renderers (which jscpd lacks), GitHub annotations, job summaries, and badges — plus clone-family grouping with extract-function/extract-module suggestions; its two gaps are the interactive HTML dashboard and blame attribution, which stay jscpd's edge for burn-down review sessions. clone-alert spans text through SARIF/`ai`/badge; Simian (plain/xml/yaml/emacs/vs) is the weakest surface in the amended set.

## Rubric comparison

| Criterion (weight) | jscpd 5.0.15 | fallow 3.16.0 | similarity-ts 0.5.0 | custom ts-morph build |
|---|---|---|---|---|
| License (high) | strong — MIT ([repo](https://github.com/kucherenko/jscpd)) | strong — MIT CLI ([npm](https://registry.npmjs.org/fallow/latest)); paid Fallow Runtime excluded per D-0003 and unused | strong — MIT ([repo](https://github.com/mizchi/similarity)) | strong — ts-morph MIT; detector first-party |
| Maintenance health (high) | strong — released 2026-08-13, near-weekly cadence; single-maintainer caveat | adequate — 21 releases Jul–Aug 2026, 4.3k stars, pushed 2026-08-13; but 5 months old, ~87% single-author, open-core steward | weak — solo author (~96% commits), ~4 months quiet | weak — zero-community bespoke code; TS-major churn via ts-morph |
| TypeScript fit (high) | strong — TS/TSX first-class, `--cross-formats js-ts`; but no identifier abstraction (misses Type-2) | strong — TS/TSX (React Native variants enumerated) + Vue/Svelte/Astro/CSS; `semantic` rename normalization; `--near` near-miss | strong — TS/TSX flagship target, rename-tolerant APTED, type-level similarity | strong — official compiler ASTs; fit must be built, not configured |
| Browser compatibility (n-a) | n-a — dev-time CLI | n-a | n-a | n-a |
| Contract-format support (n-a) | n-a — contracts get glob-excluded, not parsed | n-a | n-a | n-a |
| Integration cost (medium) | strong — npx or static binary, GitHub Action, hook recipes | strong — npx, official Action with audit verdict outputs + PR comments, GitLab template; Node >= 22 | adequate — static binary, no npm, ratchet needs scripting | weak — weeks of pipeline work before the first report |
| Runtime overhead (n-a) | n-a — never ships to the app | n-a | n-a | n-a |
| Output quality (high) | strong — 13 reporters (HTML, markdown, SARIF, badge, JSON, ai) + `--blame` | strong — JSON/SARIF/markdown/PR-comment/review/CodeClimate + annotations, summaries, badges; no HTML dashboard or blame | weak — console text only, no machine-readable format | weak — every reporter and the baseline are bespoke work |
| Escape hatch (low) | strong — JSON/SARIF, v4 Node API, Rust crate API | strong — plain-JSON committed baseline, JSON/SARIF output, fingerprint ignores, config files | adequate — comment ignores, excludes, tunable costs | strong — fully owned code |

**Eliminated below the table — PMD CPD (7.26.0):** strong license and maintenance, but weak on both defining criteria: TypeScript fit (no `.tsx` registration, no rename normalization for TS — effectively Type-1-only on this stack) and output quality (no HTML/SARIF, no baseline), plus a JVM toolchain cost. Its differentiators (many languages, Java-grade ignore options) do not apply here.

**Eliminated below the table — clone-alert (1.1.5):** capability-complete for this track (TSX, TS-token identifier normalization, committed content-fingerprint baseline, SARIF/markdown/ai reporters), and the mechanically cleanest baseline design surveyed — but an ~8-week-old, 3-star, zero-fork, single-maintainer project fails the high-weight maintenance-health bar for a merge-blocking gate. Retained as the CPD-compatible fallback shape and as the fingerprint design reference; re-check in 6–12 months.

**Eliminated below the table — Simian (4.2.1):** corporate-stewarded, Apache-2.0, genuinely rename-tolerant — but weak on output quality (plain/xml/yaml only; no JSON/SARIF/markdown/HTML, no baseline), off-stack (JVM, the same knock as CPD), unverified on `.tsx` (unrecognized files degrade to plain-text matching, which would strip normalization exactly where the React duplication surface lives), and thin as an OSS project so far (one release since open-sourcing, 11 stars, no push in ~2 months). See the Recommendation for the audit-slot argument.

## Recommendation

**Adopt: fallow as the primary detector, committed-baseline ratchet, and CI gate. Keep jscpd as the named fallback backbone and similarity-ts as an interim scheduled audit for renamed clones. Do not build.**

*This recommendation changed on 2026-08-13.* The original recommendation was adopt + wrap: jscpd as backbone plus a hand-built ratchet script, with similarity-ts auditing renamed clones. The Wave 1 gap sweep falsified the finding that plan rested on — "no candidate ships a stored clone-level baseline" — and surfaced fallow, which attacks both of the old plan's declared weakest links at once. Head-to-head on paper, on the four axes that decide it:

- **Ratchet mechanics — fallow wins decisively.** A committed, reviewable JSON baseline with finding-level fingerprints, per-analysis quarantine, a new-only PR gate with a pass/warn/fail verdict, and diff scoping — versus a hand-built percentage ratchet whose coarseness this report itself flagged as a risk (deletions elsewhere mask new duplication in the same merge). fallow's mechanism is also platform-independent (GitHub Action and GitLab template both first-party), where the old plan's only clone-level routes assumed GitHub Code Scanning. The entire "wrap" half of adopt + wrap disappears.
- **Detection quality — fallow wins on paper, unproven in practice.** Its mode ladder is a superset of jscpd's: `strict`/`mild` cover jscpd's whitespace/comment-normalized matching, `weak` adds literal normalization, `semantic` adds the rename normalization jscpd structurally lacks — which moves Type-2 detection *into the merge-blocking gate*, converting the old plan's number-one risk (a gate blind to the track's named target, backstopped only by a skippable audit) into covered ground. `--near` reaches toward Type-3. None of this has third-party validation yet, and fallow's own docs concede jscpd v5 is faster at raw scanning — which is why the spike's first item is a bake-off, not a formality.
- **Reporting — near-parity, jscpd keeps two real edges.** fallow covers JSON, SARIF, markdown, PR-comment/review renderers, annotations, badges, and clone-family refactor suggestions; jscpd keeps the interactive HTML dashboard and `--blame` author attribution, which matter for burn-down review sessions. This gap is why jscpd stays fully specified as the fallback rather than being dropped, and it can be run ad hoc for dashboards without being the gate.
- **Maintenance — jscpd wins, and this is the load-bearing risk of the change.** Nine years and ecosystem embedding (Super Linter, Codacy, MegaLinter) versus five months; ~62% versus ~87% single-author concentration; pure OSS versus an open-core steward. fallow's velocity (21 releases in six weeks, 4.3k stars) is real but young. The rubric grades fallow's maintenance *adequate*, not strong.

The decision logic: the old plan's two declared risks — gate blindness to renamed clones and the absence of any stored baseline — were structural, unfixable within that plan except by hand-building custom infrastructure in permanent tension with D-0001's adopt-over-build bar. fallow's one comparative weakness, project youth, is not structural: it is testable in a one-day spike and hedged by a fallback that stays cheap precisely because the two tools share threshold semantics (min-tokens 50 / min-lines 5) and reporter families, so calibration work transfers. Weighed against the rubric, fallow now matches or beats jscpd on three of the four high-weight criteria and concedes only maintenance; the recommendation follows, with adoption gated on the spike bake-off below.

**The Simian question — argued explicitly for the renamed-clone audit slot.** For: Simian is the only rename-normalized detector in the amended set with a corporate steward (Quandary Peak) rather than a solo author, under Apache-2.0, with two decades of production pedigree and a deterministic, dependency-light jar; its README names TypeScript in the supported-language list. Against: `.tsx` is not in that list and unrecognized files degrade to plain-text matching — so identifier normalization, the sole reason to want Simian, is unverified exactly where this codebase's duplication lives (the same failure shape that eliminated PMD CPD); it drags a JVM into CI; its output (plain/xml/yaml) feeds none of the workflow's PR-comment/SARIF/markdown surfaces; and its OSS-era track record is one release and two quiet months — thin evidence that open-sourcing came with active stewardship. Verdict: similarity-ts keeps the interim audit slot despite bus factor 1 and four quiet months, because the audit is advisory — nothing breaks if it stalls — and its TS/TSX-native function- and type-level similarity ranking fits the burn-down goal better than line-level matches. Simian is the named successor only if similarity-ts's dormancy hardens into abandonment *and* a spike check confirms `.tsx` routes through Simian's TypeScript lexer. And the slot itself is provisional: if fallow's `semantic` mode validates in the spike, gate-level Type-2 coverage makes a separate rename audit redundant, and the slot dissolves.

**clone-alert's disposition.** It falsified the old Key Question 3 finding and independently removes CPD's TSX disqualifier, but at 3 stars, 8 weeks, and bus factor 1 it cannot carry a merge gate today. It stays on the record for three reasons: as the fingerprint design reference (content-only fingerprints survive file moves; fallow's path-inclusive fingerprints do not), as the CPD-compatible fallback if fallow disappoints and a committed baseline is still wanted, and as a re-check candidate in 6–12 months.

The build option fails the D-0001 bar even more decisively than before: the AST detector exists (similarity-ts), the reporting surface exists twice over (jscpd's 13 reporters; fallow's CI-native formats), and now the baseline/ratchet mechanics a build would have hand-rolled exist off the shelf in two independent tools (fallow, clone-alert). The ecosystem's prior bespoke attempt (jsinspect) rotted. A build would only re-enter consideration if a spike shows every adopted tool failing on a concrete, named gap — and even then as a thin wrapper over an existing detector's output, not a detector from scratch.

A plausible starting sequence for the spike (fallow primary path):

```sh
npx fallow dupes --mode semantic --min-tokens 50 --save-baseline fallow-baselines/dupes.json
npx fallow audit --gate new-only --dupes-baseline fallow-baselines/dupes.json
```

And the retained jscpd fallback config, unchanged from the original plan:

```json
{
  "format": ["typescript", "tsx"],
  "minTokens": 50,
  "minLines": 5,
  "ignore": ["**/node_modules/**", "**/contracts/**", "**/*.gen.ts", "**/dist/**"],
  "reporters": ["html", "markdown", "json"],
  "gitignore": true
}
```

**Risks — the honest weakest links:**

- **fallow is five months old with ~87% single-author concentration and an open-core steward.** Commercial backing cuts both ways: it funds the velocity, and it creates drift risk (features migrating toward the paid tier). Mitigations: the CLI is MIT, the baseline is plain committed JSON, the config surface is small, and the jscpd fallback shares threshold semantics — switching costs are a day, not a quarter.
- **fallow's detection quality is unvalidated by any third party.** The mode ladder is documentation, not measurement; `semantic` precision on React's structural monoculture (near-isomorphic hook/handler bodies) could be noisy, and fallow's own docs concede jscpd v5 wins raw scanning speed. The spike bake-off is the gate on this recommendation, not a follow-up.
- **fallow's baseline fingerprints include the file path.** A refactor that moves files resurfaces quarantined clones as "new," failing PRs that added no duplication. Known workaround: regenerate the baseline in the moving PR. clone-alert's content-only fingerprint design proves this is fixable; worth an upstream issue.
- **Reporting gaps for burn-down.** No interactive HTML dashboard and no blame attribution in fallow; burn-down review sessions may still want ad-hoc jscpd runs for those two surfaces — acceptable, but it means two tools in occasional use.
- **If fallow fails the spike, both original risks return.** The fallback (jscpd + percentage ratchet + optional GitHub-layer routes, similarity-ts audit) reinstates a gate that is blind to renames and a coarse ratchet — tolerable, but strictly worse; the fallback drill in the spike keeps it honest.
- **Threshold noise is unvalidated.** All threshold guidance is generic; React's structural monoculture may make defaults noisy on this codebase (D-0001 blocked hands-on validation).

**Constraints applied:** D-0001 (survey-only — no tool was executed; all claims trace to documentation, source, and registry metadata; spikes pre-scoped below), D-0002 (adding standalone CLIs in CI is sanctioned), D-0003 (OSS-only — all recommended tools MIT/Apache; fallow's paid Runtime tier is excluded and unused; SonarQube's native new-code gating noted and excluded), D-0004 (facts/app-profile.md is unfilled; every fact used is declared below), D-0007 (STE summary).

**Assumptions declared in place of facts** (facts/app-profile.md is unfilled):

- CI provider is GitHub Actions, and the repo is hosted on GitHub. This is now less load-bearing than in the original plan: fallow's committed baseline works on any CI, and it ships both a GitHub Action and a GitLab template; only the optional SARIF/Code Scanning surfacing and the jscpd-fallback diff-scoped routes are GitHub-specific.
- GitHub Code Scanning is available (public repo, or GitHub Advanced Security licensed). Only the optional SARIF surfacing routes depend on this.
- CI runners provide Node >= 22 (fallow's npm wrapper engine requirement); the cargo/Docker channels are the fallback if not.
- App scale is a small-to-mid TypeScript monorepo (order of 10²–10³ source files). jscpd v5's and fallow's performance make scale a non-issue up to well beyond this; similarity-ts pairwise comparison and report sizes were not validated at scale.
- A meaningful share of the duplication surface lives in `.tsx` (React components/hooks). This is what eliminates PMD CPD and drives both the fallow TSX confirmation and the Simian TSX-lexer question; if the codebase were `.ts`-only, those gaps would not bite.
- Vendored AsyncAPI/OpenAPI contracts and generated code live in dedicated directories that ignore globs can exclude (both fallow config and jscpd `--ignore` support this).
- CI runners can fetch and execute a prebuilt Rust binary from GitHub Releases (for similarity-ts, which has no npm package; applies while the interim audit slot lives).
- The current duplication percentage and clone inventory are unknown; the initial committed baseline must come from the spike's measurement run on main.

## What a spike would validate

Pre-scoped per D-0001:

- **fallow vs jscpd bake-off (the gate on this recommendation)**: run both at min-tokens 50 and 30 on the application repo; compare finding overlap, false-positive density in React hook/handler code, runtimes, and report usefulness for review. If fallow's `mild` mode misses clones jscpd finds, or drowns signal in noise, fall back to the jscpd plan.
- **fallow baseline + audit mechanics end-to-end**: `--save-baseline` on main, commit the file, then verify on the actual CI that a PR adding a new clone fails, a PR touching only pre-existing clones passes, and a PR that *moves* a file with baselined clones behaves acceptably (path-inclusive fingerprint risk). Confirm the `audit` verdict output and PR comments render usefully.
- **fallow `semantic` mode precision/recall**: seed known renamed-identifier clones (the track's named target) and copy-tweaked hooks; measure whether `semantic` catches the renames without flooding on React's structural monoculture, and whether `--near` catches statement-edited variants. The outcome decides whether the similarity-ts audit slot dissolves.
- **TSX handling**: confirm fallow and jscpd (`--cross-formats js-ts`) both detect and correctly position clones in real `.tsx` components — the one fallow coverage claim resting on inference from the file-types docs rather than an explicit statement.
- **similarity-ts Type-3 recall** (while the audit slot lives): sweep `--threshold` 0.7–0.9 over the seeded clones; measure recall/precision and resolve the 0.85-vs-0.87 default discrepancy; time the release-binary fetch in CI and run `--fail-on-duplicates` as an advisory job.
- **Exclusion hygiene**: verify ignore globs in both tools cleanly drop the vendored contracts and generated code, and that fallow's default import stripping removes the boilerplate jscpd needs `--ignore-pattern` for.
- **Fallback drills**: keep the jscpd path warm — the ~50-line percentage-ratchet script over jscpd JSON, plus a v5-compatibility check of the pull-requests-jscpd action and jscpd-html-reporter before relying on either. Check clone-alert's baseline gate only if fallow's mechanics disappoint. Check whether Simian's TS lexer handles `.tsx` (a 10-minute jar run) only if the rename-audit slot survives and similarity-ts's dormancy hardens.

## Sources

- https://github.com/kucherenko/jscpd — accessed 2026-08-13
- https://raw.githubusercontent.com/kucherenko/jscpd/master/README.md — accessed 2026-08-13
- https://raw.githubusercontent.com/kucherenko/jscpd/master/docs/rust.md — accessed 2026-08-13
- https://raw.githubusercontent.com/kucherenko/jscpd/master/docs/typescript.md — accessed 2026-08-13
- https://raw.githubusercontent.com/kucherenko/jscpd/master/docs/ci-and-hooks.md — accessed 2026-08-13
- https://raw.githubusercontent.com/kucherenko/jscpd/master/rust/crates/cpd/src/cli.rs — accessed 2026-08-13
- https://github.com/kucherenko/jscpd/tree/master/apps/jscpd — accessed 2026-08-13
- https://registry.npmjs.org/jscpd — accessed 2026-08-13
- https://registry.npmjs.org/jscpd/latest — accessed 2026-08-13
- https://api.github.com/repos/kucherenko/jscpd — accessed 2026-08-13
- https://api.github.com/repos/kucherenko/jscpd/contributors — accessed 2026-08-13
- https://api.github.com/search/issues?q=repo:kucherenko/jscpd+baseline — accessed 2026-08-13
- https://jscpd.dev/getting-started/introduction — accessed 2026-08-13
- https://github.com/pmd/pmd/releases — accessed 2026-08-13
- https://github.com/pmd/pmd/blob/main/LICENSE — accessed 2026-08-13
- https://pmd.github.io/pmd/pmd_languages_js_ts.html — accessed 2026-08-13
- https://pmd.github.io/pmd/pmd_userdocs_cpd.html — accessed 2026-08-13
- https://docs.pmd-code.org/latest/pmd_userdocs_cpd.html — accessed 2026-08-13
- https://github.com/pmd/pmd/blob/main/pmd-javascript/src/main/java/net/sourceforge/pmd/lang/typescript/TsLanguageModule.java — accessed 2026-08-13
- https://github.com/pmd/pmd/blob/main/pmd-javascript/src/main/java/net/sourceforge/pmd/lang/typescript/cpd/TypeScriptCpdLexer.java — accessed 2026-08-13
- https://github.com/pmd/pmd/issues/4945 — accessed 2026-08-13
- https://github.com/pmd/pmd/blob/main/docs/pages/pmd/userdocs/installation.md — accessed 2026-08-13
- https://github.com/pmd/docker — accessed 2026-08-13
- https://pmd.github.io/2023/05/30/PMD-7.0.0-rc3/ — accessed 2026-08-13
- https://github.com/mizchi/similarity — accessed 2026-08-13
- https://raw.githubusercontent.com/mizchi/similarity/main/README.md — accessed 2026-08-13
- https://raw.githubusercontent.com/mizchi/similarity/main/crates/similarity-ts/src/main.rs — accessed 2026-08-13
- https://github.com/mizchi/similarity/releases — accessed 2026-08-13
- https://crates.io/crates/similarity-ts — accessed 2026-08-13
- https://crates.io/api/v1/crates/similarity-ts — accessed 2026-08-13
- https://api.github.com/repos/mizchi/similarity — accessed 2026-08-13
- https://api.github.com/repos/mizchi/similarity/contributors — accessed 2026-08-13
- https://zenn.dev/mizchi/articles/introduce-ts-similarity?locale=en — accessed 2026-08-13
- https://registry.npmjs.org/similarity-ts — accessed 2026-08-13
- https://github.com/fallow-rs/fallow — accessed 2026-08-13
- https://raw.githubusercontent.com/fallow-rs/fallow/main/README.md — accessed 2026-08-13
- https://api.github.com/repos/fallow-rs/fallow — accessed 2026-08-13
- https://api.github.com/repos/fallow-rs/fallow/contributors — accessed 2026-08-13
- https://registry.npmjs.org/fallow — accessed 2026-08-13
- https://registry.npmjs.org/fallow/latest — accessed 2026-08-13
- https://docs.fallow.tools — accessed 2026-08-13
- https://docs.fallow.tools/llms.txt — accessed 2026-08-13
- https://docs.fallow.tools/quickstart — accessed 2026-08-13
- https://docs.fallow.tools/analysis/duplication — accessed 2026-08-13
- https://docs.fallow.tools/analysis/file-types — accessed 2026-08-13
- https://docs.fallow.tools/analysis/limitations — accessed 2026-08-13
- https://docs.fallow.tools/integrations/ci — accessed 2026-08-13
- https://docs.fallow.tools/cli/dupes — accessed 2026-08-13
- https://github.com/BaryshevRS/clone-alert — accessed 2026-08-13
- https://raw.githubusercontent.com/BaryshevRS/clone-alert/master/README.md — accessed 2026-08-13
- https://api.github.com/repos/BaryshevRS/clone-alert — accessed 2026-08-13
- https://registry.npmjs.org/clone-alert — accessed 2026-08-13
- https://github.com/quandarypeak/simian — accessed 2026-08-13
- https://raw.githubusercontent.com/quandarypeak/simian/main/README.md — accessed 2026-08-13
- https://api.github.com/repos/quandarypeak/simian — accessed 2026-08-13
- https://api.github.com/repos/quandarypeak/simian/releases — accessed 2026-08-13
- https://github.com/dsherret/ts-morph — accessed 2026-08-13
- https://registry.npmjs.org/ts-morph/latest — accessed 2026-08-13
- https://api.github.com/repos/dsherret/ts-morph — accessed 2026-08-13
- https://github.com/dsherret/ts-morph/releases/tag/28.0.0 — accessed 2026-08-13
- https://theory.stanford.edu/~aiken/publications/papers/sigmod03.pdf — accessed 2026-08-13
- https://dl.acm.org/doi/10.1145/2884781.2884877 — accessed 2026-08-13
- https://arxiv.org/pdf/1512.06448 — accessed 2026-08-13
- https://arxiv.org/html/2606.25272 — accessed 2026-08-13
- https://ar5iv.labs.arxiv.org/html/1603.01661 — accessed 2026-08-13
- https://isr.uci.edu/content/sourcerercc-scaling-type-3-clone-detection-large-software-repositories — accessed 2026-08-13
- https://www.researchgate.net/figure/Recall-per-Clone-Type-and-Precision-Measured-for-BigCloneBench-with-Different_tbl1_325730356 — accessed 2026-08-13
- https://github.com/danielstjules/jsinspect — accessed 2026-08-13
- https://www.npmjs.com/package/jsinspect — accessed 2026-08-13
- https://megalinter.io/latest/descriptors/copypaste_jscpd/ — accessed 2026-08-13
- https://raw.githubusercontent.com/oxsecurity/megalinter/main/TEMPLATES/.jscpd.json — accessed 2026-08-13
- https://github.com/marketplace/actions/pull-requests-jscpd — accessed 2026-08-13
- https://github.com/getunlatch/jscpd-github-action — accessed 2026-08-13
- https://dev.to/vvbogdanov/add-a-50x-faster-duplicate-code-gate-to-github-actions-with-jscpd-rs-kml — accessed 2026-08-13
- https://www.augmentcode.com/learn/automate-away-duplicate-code-a-practical-guide — accessed 2026-08-13
- https://phenomnomnominal.github.io/betterer/docs/results-file/ — accessed 2026-08-13
- https://registry.npmjs.org/@betterer/cli — accessed 2026-08-13
- https://github.com/SpitfireSatya/jscpd-html-reporter — accessed 2026-08-13
