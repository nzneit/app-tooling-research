# Wave 1 candidate-gap sweep

This is a user-directed, post-survey sweep (run 2026-08-13) hunting for candidates the five Wave 1 survey reports missed, one hunter pass per track: 0010-contract-pipeline, 0020-complexity-metrics, 0030-duplication-detection, 0040-hooks-linting, 0050-logging. Search angles: npm/GitHub sweeps for maintained alternatives to each recommended stack; adjacent-ecosystem tools that stack bias tends to exclude (Rust linters, JVM analyzers, Go binaries); industry-standard facades and compatibility targets the surveys never weighed (OpenTelemetry Logs, PMD-CPD-compatible detectors); 2025-2026 new arrivals that postdate common survey sources; and deliberate closure of loose ends the reports themselves named (plato heirs, ESLintCC, scc/tokei-class counters, research-grade clone detectors, the bunyan lineage). Every candidate was checked for license, last activity, and capability fit against the track's decision criteria, then binned as challenger, worth-noting, or checked-and-disqualified. Bottom line up front: every track surfaced at least one challenger, and three tracks (0020, 0030, 0040) contain findings that contradict specific factual claims in their reports.

## Challengers

### 0010-contract-pipeline

**TypeBox (@sinclair/typebox)** — https://github.com/sinclairzx81/typebox
- What: Runtime type system whose schemas ARE JSON Schema — one TypeBox schema yields static TS types (`Static<T>`) and compiled validators (TypeCompiler, with CSP-safe AOT code emission via `TypeCompiler.Code()`, like Ajv standalone). Near-top performer in the same moltar benchmarks the report cites.
- License / activity: MIT; npm 0.34.52 published 2026-07-11, active release stream through Jul 2026.
- Challenges: The report's cross-cutting validator comparison (Key question 2) compared Zod/valibot/ArkType/Ajv/typia but omitted TypeBox entirely — the only other candidate that natively executes JSON Schema. On the AsyncAPI leg it would collapse the recommended two-artifact build (Ajv standalone validators + Modelina types, with Modelina scored weak/dormant) into one artifact: JSON Schema -> TypeBox schemas -> both types and compiled validators from a single source, eliminating the report's Modelina risk.
- Re-evaluating would take: A spike of the JSON Schema -> TypeBox codegen route, with the schema2typebox glue's maintenance state as the go/no-go check (single maintainer, quiet ~10 months, draft-2020-12 "not expected to fully work"), plus a check of dialect coverage against Ajv's superior spec-completeness for arbitrary draft-2020-12 keywords.

### 0020-complexity-metrics

**Biome — lint/complexity/noExcessiveCognitiveComplexity** — https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/
- What: Biome's Rust linter ships a native implementation of the SonarSource cognitive-complexity algorithm (default threshold 15, configurable 1-254, off by default) with first-class TS/TSX parsing; runnable as a standalone CLI scoped to just this rule alongside an existing oxlint setup.
- License / activity: MIT OR Apache-2.0; v2.5.8 published 2026-08-11, very active org with weekly-cadence releases.
- Challenges: Directly attacks the report's #1 stated risk — eslint-plugin-sonarjs ships under SSALv1 (not OSS) and the recommendation is contingent on a legal check. If sonarjs fails that check, the report's stated fallback ("oxlint cyclomatic + fta only", losing cognitive complexity entirely) is wrong: Biome restores a cognitive gate config-only, under a clean license, possibly without standing up ESLint-in-CI at all. Even if sonarjs passes, Biome stress-tests whether ESLint-in-CI is needed for the cognitive half.
- Re-evaluating would take: A spike checking whether pass/fail diagnostics suffice (no per-increment secondary locations like S3776, no score export) and whether a second linter next to oxlint is acceptable under D-0002.

**cognitive-complexity-ts** — https://github.com/Deskbot/Cognitive-Complexity-TS
- What: TypeScript-native analyzer implementing the SonarSource cognitive-complexity metric that outputs per-function and per-file scores (CLI with JSON output plus an HTML UI) rather than pass/fail diagnostics — i.e., ranked cognitive scores for refactor planning.
- License / activity: GPL-3.0 (OSS-compliant for a dev-time CLI under D-0003); v0.8.2 on npm 2026-05-22, repo pushed same day; ~6k weekly downloads, 42 stars, single maintainer.
- Challenges: The only tool found that exports ranked cognitive-complexity scores — the exact capability gap the report papers over by pairing sonarjs (diagnostics only) with fta-cli (ranking, but cyclomatic/Halstead per-file only, no cognitive). It stress-tests fta-cli's "ranked refactor reporting" slot and materially changes the license-fail fallback, which currently abandons the cognitive metric.
- Re-evaluating would take: Spike validation of score fidelity vs S3776, a policy note on GPL copyleft for a dev-time tool, and an explicit accept/reject of the small single-maintainer v0.8 project risk.

### 0030-duplication-detection

**fallow** — https://github.com/fallow-rs/fallow
- What: TS/JS "codebase intelligence" analyzer (Rust, npm-distributed) with a suffix-array duplication detector offering strict/mild/weak/semantic modes across TS/TSX, CSS, and Vue/Svelte/Astro regions, plus dead-code, cycles, and complexity. Outputs JSON, SARIF, Markdown, HTML, GitHub annotations, GitLab Code Quality; `fallow audit` gates PRs and `--baseline` quarantines existing findings.
- License / activity: MIT; npm 3.16.0 published 2026-08-13, repo pushed 2026-08-13, 4.3k stars.
- Challenges: Attacks both declared weak points of the jscpd recommendation at once — it ships the stored baseline/quarantine ratchet the report says "no candidate" has (Key Question 3), and its reporting surface matches jscpd's. A "semantic" duplication mode may also narrow the Type-2 gap. Could replace the hand-built ratchet wrap or the backbone itself.
- Re-evaluating would take: A head-to-head run against the repo comparing detection quality, the baseline/quarantine mechanics, and reporting against jscpd-plus-wrap; at minimum the report must argue against it.

**clone-alert** — https://github.com/BaryshevRS/clone-alert
- What: PMD-CPD-compatible token-based copy-paste detector (Karp-Rabin over real TypeScript-compiler-Scanner tokens) for TS/JS/JSX/TSX/Vue/Svelte, validated against PMD golden fixtures and 10-27x faster. Reporters: text/json/xml/csv/sarif/markdown/ai/badge; ships a GitHub Action and a committed content-fingerprint `--baseline` file so CI fails only on NEW clones.
- License / activity: MIT; npm 1.1.5 published 2026-08-05, repo pushed 2026-08-09; 3 stars, bus factor 1.
- Challenges: Directly falsifies the report's "no stored clone-level baseline anywhere" finding — its committed-baseline, new-clones-only CI gate is exactly the ratchet the recommendation proposes to hand-build over jscpd JSON. Also removes PMD CPD's TSX disqualifier while keeping CPD compatibility. It plausibly changes the "wrap" half of adopt+wrap.
- Re-evaluating would take: Verifying the baseline gate in practice and an explicit risk decision on a 2026-era, 3-star, single-maintainer project.

**Simian Similarity Analyzer** — https://github.com/quandarypeak/simian
- What: The classic language-agnostic line/token similarity analyzer, historically proprietary but open-sourced by Quandary Peak under Apache-2.0; JVM jar with `-ignoreIdentifiers`, `-ignoreVariableNames`, and `-ignoreLiterals` normalization (rename-tolerant/Type-2-style detection) and plain/XML/YAML/emacs/vs output.
- License / activity: Apache-2.0 (verified via GitHub API; formerly commercial — likely why surveys skip it); v4.2.1 released 2026-04-01, last main commit 2026-04-14, repo pushed 2026-06-19; 11 stars.
- Challenges: Stress-tests the load-bearing claim that no maintained tool besides bus-factor-1, four-months-quiet similarity-ts offers identifier-normalized detection — Simian provides it with a corporate steward.
- Re-evaluating would take: A spike settling whether `ignoreIdentifiers` actually covers TypeScript/TSX (the documented language list names JavaScript but not TS), whether text/XML-only reporting is acceptable, and whether the JVM dependency is tolerable given the same off-stack knock the report gave PMD CPD.

### 0040-hooks-linting

**eslint-plugin-zustand-rules** — https://github.com/paulschoen/eslint-plugin-zustand-rules
- What: Nine ESLint rules enforcing Zustand best practices: `require-shallow-selector` detects selectors returning fresh objects/arrays and autofixes with `useShallow`; `use-store-selectors` flags whole-store subscriptions; `no-state-mutation` catches direct mutations that skip subscription notifications.
- License / activity: MIT; 1.2.1 published 2026-08-07.
- Challenges: Directly contradicts the report's ranked-anti-patterns claim that "Zustand selectors returning fresh objects (needs useShallow)" is "not covered by any hooks rule; review concern" — `require-shallow-selector` lints exactly that, with an autofix, moving anti-pattern #6 from convention-and-review to lintable and plausibly growing the adoption set.
- Re-evaluating would take: A false-positive check of the rules against the codebase and an accept/reject of a ~3.1k-weekly-download, 12-star, single-maintainer dependency.

**eslint-plugin-react-hooks-addons** — https://github.com/szhsin/eslint-plugin-react-hooks-addons
- What: Single rule `no-unused-deps` that flags dependencies listed in useEffect/useLayoutEffect arrays but not used in the callback — the inverse of exhaustive-deps, which only finds missing deps. Explicitly designed to run in tandem with eslint-plugin-react-hooks; supports `additionalHooks` and an intentional-dep marker comment.
- License / activity: MIT; 0.5.1 published 2026-02-09; ~52.8k weekly downloads.
- Challenges: The report ranks over-broad/unstable dependencies causing MQTT reconnect churn as anti-pattern #2 and concedes it is only "partially lintable via exhaustive-deps"; this rule closes precisely the extra-dependency half of that gap (an unused dep re-triggers the effect and rebuilds the connection), plausibly adding a third plugin to the recommended ESLint-in-CI set.
- Re-evaluating would take: A tandem run alongside react-hooks v7 to confirm no rule conflicts, plus `additionalHooks` configuration for the app's custom MQTT hooks.

### 0050-logging

**OpenTelemetry JS Logs stack (@opentelemetry/api-logs + sdk-logs + OTLP-HTTP exporter, plus the new opentelemetry-browser SDK)** — https://github.com/open-telemetry/opentelemetry-js (browser: https://github.com/open-telemetry/opentelemetry-browser)
- What: Vendor-neutral Logs Bridge API plus SDK — LoggerProvider with per-logger instances, a LogRecordProcessor pipeline, BatchLogRecordProcessor for batching/flush, and an OTLP-HTTP exporter, explicitly usable in the browser, with a dedicated official Browser SDK repo actively developed (pushed 2026-08-13). Call sites depend on api-logs; processors/exporters are the sink seam.
- License / activity: Apache-2.0; api-logs/sdk-logs 0.221.0 published 2026-07-21.
- Challenges: The survey never evaluated OTel, yet it stress-tests the core recommendation: instead of a project-owned facade over consola, the facade surface could be the industry-standard Logs API, making the record shape, batching, and remote shipping off-the-shelf and vendor-portable — exactly the pieces the report scopes as custom facade work.
- Re-evaluating would take: An explicit argue-against (or spike) covering the honest caveats that keep consola defensible: sdk-logs is 0.x/experimental (Logs Bridge API alpha, breaking changes allowed), browser support is "experimental and mostly unspecified", bundle weight far exceeds consola's 2.45 kB, and pattern-based throttling would still be a custom LogRecordProcessor.

## Worth noting

### 0010-contract-pipeline
- **schema2typebox** (MIT; npm 1.7.8, repo push 2025-10-20, ~10 months quiet) — necessary codegen glue for the TypeBox challenger route (draft-07 JSON Schema -> TypeBox source, with $ref resolution), but single-maintainer, 81 stars, and draft-2020-12 "not expected to fully work"; its maintenance is the go/no-go check if the TypeBox route is spiked.
- **json-schema-to-ts** (MIT; npm 3.1.1 from 2024-08-29, repo pushed 2026-05-09) — type-level `FromSchema` pairing types and Ajv validators from literally the same as-const schema constant; a cleaner types-half for the built AsyncAPI leg than Modelina, but a spike-time alternative, not a decider (2-year npm release gap).
- **quicktype** (Apache-2.0; npm 26.0.0, 2026-07-20) — well-maintained multi-language types source, but its runtime converters are structural-only (constraints dropped — the same disqualifier the report applied to typia-without-tags), so it cannot displace Ajv and adds nothing over the named fallbacks.
- **msw-auto-mock** (MIT; npm 0.32.1, 2026-04-18) — the main standalone MSW-ecosystem generator the survey skipped; only a decoupled fallback if orval's own MSW/faker mock output disappoints in the spike.

### 0020-complexity-metrics
- **eslint-plugin-maintainability** (MIT; v3.0.16, 2026-08-11) — the only MIT-licensed cognitive-complexity ESLint rule that drops into the exact slot sonarjs occupies, but an 8-month-old, low-adoption, single-author mega-collection with unverified S3776 fidelity; spike only if both sonarjs (license) and Biome (second-linter objection) fall through.
- **code-complexity** (MIT; last release 2023-09-21, repo pushed 2025-11-15, ~120k weekly downloads) — adds the one prioritization axis the recommended stack lacks, git churn-times-complexity hotspot ranking; no cognitive metric and a ~3-year release gap keep it a cheap bolt-on next to fta-cli, not a challenger.

### 0030-duplication-detection
- **seenit** (MIT; npm 0.3.0, 2026-08-02; 1 star, pre-1.0) — working proof that a thin wrap could add Type-2 coverage to jscpd itself via normalize-identifiers-then-match (published recall 0.81, precision 0.84-0.86), shrinking dependence on similarity-ts; agent-workflow tool, displaces nothing.
- **mori** (MIT; created 2026-07-29, no tagged release) — rename-tolerant structural similarity with exactly the JSON/HTML/SARIF reporters the report faults similarity-ts for lacking, but two weeks old with 1 star; watch-list material.
- **ast-grep** (MIT; 15.5k stars, pushed 2026-08-13) — not a clone detector (it finds instances of a pattern you already wrote), but a valuable burn-down companion: turn one detector finding into a metavariable pattern to sweep all renamed variants repo-wide. Changes no verdict.

### 0040-hooks-linting
- **Biome react hooks rules** (MIT OR Apache-2.0; 2.5.8, 2026-08-11) — very active, but its hooks coverage roughly duplicates the oxlint fast lane kept under D-0002, with known fidelity gaps vs exhaustive-deps (issue #2149) and none of the v7 compiler-powered rules; adopting it would swap the baseline linter rather than extend the recommendation.
- **eslint-plugin-react-refresh** (MIT; 0.5.4, 2026-08-10; ~40.3M weekly downloads) — healthy and cheap to add, but polices HMR boundary hygiene, not hooks anti-patterns; neither overlaps with nor stress-tests the recommended set.
- **typescript-eslint type-checked rules** (MIT; 8.67.0, 2026-08-10) — `no-misused-promises`/`no-floating-promises` catch the async-effect-callback anti-pattern invisible to every syntactic plugin in the report, and the recommended ESLint-in-CI lane already exists to host them; but this is a general TS-strictness adoption question, not a hooks-plugin decision.

### 0050-logging
- **missionlog** (MIT; v4.1.3, 2026-05-26; ~11.7k downloads/week) — natively provides the two things the report says the facade must hand-build over consola (per-tag runtime-reconfigurable levels and a single output-handler seam) in under half consola's size; bus factor 1, 34 stars, and no transport ecosystem keep it a design reference or micro-base, not a displacement.
- **workbox-background-sync** (MIT; v7.4.1, 2026-05-04) — Google-maintained queue-persist-and-replay (IndexedDB + Background Sync, including replay after the tab closes) that the report's hand-copied Sentry IndexedDB-decorator pattern cannot match; worth citing in the remote-sink spike, requires a service worker.

## Checked and disqualified

### 0010-contract-pipeline
- **asyncapi-validator** — runtime document parsing and Ajv eval-compilation in the client (the opposite of the build-time standalone approach), no types or factories, dormant since 2025-03.
- **swagger-typescript-api** — types-plus-client only: no runtime validation schemas, no mocks/factories (same disqualifier as openapi-typescript), weaker 3.1 coverage.
- **oazapfts** — compile-time-only response typing: a malformed partner payload passes silently, failing the D-0006 keystone outright.
- **feTS (client)** — pure type inference on the client side; no runtime validation, schemas, or factories, and nothing for AsyncAPI.
- **OpenAPI Generator (OpenAPITools)** — healthy, but TS targets emit permissive types+client with no validator/zod/faker output, and drag a JVM into the build for strictly less than orval/kubb provide.

### 0020-complexity-metrics
- **eslintcc** — hard-pins eslint@8.57.0 (incompatible with the recommended ESLint 10 flat-config stack), no release in 2+ years, cyclomatic-family only. Closes the "ESLintCC" hint.
- **scc** — token-count complexity estimate, per-file only, no cognitive metric or gating; strictly dominated by fta-cli. Closes the "scc/tokei-class counters" hint.
- **es6-plato** — dead ~7 years, built on the 2018-frozen escomplex lineage already rejected via typhonjs-escomplex. Closes the "plato heirs" hint.
- **codehawk-cli** — wraps dead typhonjs-escomplex; its own author built fta-cli as the Rust successor, which the report already recommends. Closes the "code-health CLIs" hint.
- **@barney-media/cognitive-typescript** — right problem space, clean Apache-2.0, but v0.3.0, days old, 2 stars: fails the maintenance-health bar as unproven; re-check in 6-12 months. Closes the "2025-2026 new arrivals" angle (peers complexijs and codopsy-ts are even less mature).

### 0030-duplication-detection
- **basta** — dead for nine years, superseded by the same author's jscpd, which the report already recommends.
- **NiCad (Open-NiCad)** — fails D-0003 (no recognized OSS license, non-OSS TXL dependency), no TS/TSX grammar. Closes the "research-grade detectors" question.
- **Semgrep (Community Edition)** — wrong problem class: matches patterns you author, has no duplicate-discovery mode; rules-registry licensing adds friction.
- **@opensip-cli/clone-detection** — a library substrate with no CLI/reporters/baseline; adopting it re-opens the build option already rejected under D-0001.

### 0040-hooks-linting
- **react-doctor / oxlint-plugin-react-doctor** — license disqualifier under D-0003: modified MIT with field-of-use restrictions. The most interesting miss otherwise (rules hosted inside the adopted oxlint fast lane); re-check if Million relicenses.
- **eslint-plugin-xstate** — dead ~2.7 years, predates the XState v5 ecosystem, and targets machine-definition correctness, not React hooks usage.
- **eslint-plugin-ssr-friendly** — dormant ~2.75 years and wrong problem: the app is a client-side SPA with no SSR.
- **eslint-plugin-react-compiler (standalone)** — superseded: its checks were merged into eslint-plugin-react-hooks (default in v7's recommended preset, already recommended); the standalone package is stranded on an abandoned RC line.
- **eslint-plugin-zustand (sairajchouhan)** — its single rule is a strict subset of eslint-plugin-zustand-rules' `use-store-selectors`; zero marginal coverage.

### 0050-logging
- **winston** — no browser story at all (Node-streams architecture, Node-oriented transports); disqualified on the track's highest-weight browser-compatibility criterion.
- **browser-bunyan** — conceptually the closest missed candidate (browser-first structured records with batched server stream), but dead: last publish January 2022.
- **js-logger** — loglevel-class feature shape, dormant since November 2020; loglevel already covers it with better maintenance.
- **anylogger / ulog** — the ecosystem's closest SLF4J analog and directly relevant prior art for the facade's shape, but both dormant since 2021 (ulog never exited beta).
- **diary** — viable-looking micro-base, but no npm release since January 2024, bus factor 1, and no runtime per-logger level API.
- **electron-log** — healthy, wrong platform: its distinguishing transports presume an Electron runtime; in a plain browser SPA it degrades to a console wrapper.
- **rrweb / OpenReplay tracker** — active and genuinely OSS, but solves session replay, not leveled logging; could later consume the facade's records as an extra sink without affecting the base pick.

## Suggested dispositions

- **0010-contract-pipeline: amend report** — add TypeBox to the Key question 2 validator comparison and record the single-artifact TypeBox route as the spike alternative for the built AsyncAPI leg (it removes the Modelina risk), with schema2typebox maintenance as the stated go/no-go; the OpenAPI-leg recommendation itself stands.
- **0020-complexity-metrics: amend report** — the license-fail fallback ("lose cognitive entirely") is factually wrong now that Biome offers the same algorithm under MIT/Apache, and cognitive-complexity-ts fills the ranked-cognitive-scores gap the sonarjs+fta pairing papers over; both belong in the decision tree.
- **0030-duplication-detection: amend report** — the Key Question 3 finding "no candidate has a stored clone-level baseline" is falsified by fallow and clone-alert, and the hand-built-ratchet half of adopt+wrap must be re-argued against them (fallow at minimum); Simian also needs an argue-against on the identifier-normalized audit slot.
- **0040-hooks-linting: amend report** — two ranked-anti-pattern claims are contradicted by maintained plugins (zustand-rules makes #6 lintable with autofix; react-hooks-addons closes the extra-dependency half of #2), so the lintable/not-lintable table and the adoption set both need revision.
- **0050-logging: add survey-verification note** — the consola-plus-facade recommendation likely survives (OTel Logs is 0.x/experimental in the browser and heavy), but the report evaluated no industry-standard facade and must explicitly argue why it rejects the OTel Logs API as the facade surface; cite missionlog as facade design prior art and workbox-background-sync in the remote-sink spike. No gap here rises to changing the base pick.

No track came back empty: all five surfaced at least one genuine challenger. The weakest signal is 0050, where the challenger forces an argument, not a change; the strongest are 0020, 0030, and 0040, where specific report claims (the license-fail fallback, the no-stored-baseline finding, and two not-lintable rankings) are contradicted by maintained tools found in this sweep.
