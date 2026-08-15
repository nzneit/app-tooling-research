# Decisions

Append-only ledger. `D-####` IDs are contiguous from D-0001 and never reused; superseded
decisions are marked superseded in place, never deleted. Entry format: `### D-####: title`
followed by `**Date**`, `**What**`, `**Why**`, `**From**`, `**Affects**` lines.

## Constraints in force

D-0001 · D-0002 · D-0003 · D-0004 · D-0005 · D-0006 · D-0007 · D-0011

## Ledger

### D-0001: Survey-only research depth
**Date**: 2026-08-13
**What**: Research deliverables are survey + recommendation documents; no prototyping during research. Spikes come later, pre-scoped by each report's "What a spike would validate" section.
**Why**: Cheapest path to defensible adopt/build/skip calls while keeping spike space reserved.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks

### D-0002: Pragmatic lint mix
**Date**: 2026-08-13
**What**: oxlint stays as the fast default linter; recommendations may add ESLint or standalone CLIs in CI or pre-push for rules oxlint cannot cover.
**Why**: Best capability coverage at acceptable toolchain sprawl.
**From**: brainstorming session 2026-08-13
**Affects**: 0020, 0030, 0040

### D-0003: OSS-only candidates
**Date**: 2026-08-13
**What**: Shortlists contain only free OSS runnable locally or in CI; no paid products and no self-hosted-server products. SonarQube Server is excluded; the SonarJS ESLint rules stay in scope.
**Why**: Procurement is off the table for this effort.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks
**Note**: refined by D-0011 (2026-08-13) — eslint-plugin-sonarjs releases after v2.0.4 are SSALv1 (source-available, not OSS) and are excluded; only the LGPL-3.0 v2.0.4 line qualifies under this constraint.

### D-0004: App facts via facts/app-profile.md
**Date**: 2026-08-13
**What**: The application repo is not accessible from this repo. Reports cite facts/app-profile.md; a missing fact becomes a declared assumption in the report.
**Why**: The app cannot be shared; grounding must be explicit and auditable.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks

### D-0005: Themed-wave track structure
**Date**: 2026-08-13
**What**: Seven core tracks in two waves plus deferred 0090-horizon-scan. Merged tracks: validation+codegen+factories (0010), cyclomatic+cognitive (0020), state+races (0070). Wave 2 (0060, 0070) starts only after 0010's report is accepted.
**Why**: Merged topics share one tooling surface; separate surveys would duplicate work.
**From**: brainstorming session 2026-08-13
**Affects**: program structure

### D-0006: Live validation of all contracted inbound messages
**Date**: 2026-08-13
**What**: 0010's runtime-validation output must support validating every inbound message from any contracted interface: MQTT payloads (AsyncAPI) and REST response bodies including non-2xx reason-code bodies (OpenAPI). 0060's unified boundary is the validation choke point.
**Why**: Partner breaking changes must surface as first-class errors, on error shapes as much as happy paths.
**From**: brainstorming session 2026-08-13 (user revision)
**Affects**: 0010, 0060

### D-0007: ASD-STE100-style report summaries
**Date**: 2026-08-13
**What**: Every report.md opens with a prepended "Summary (STE)" section following ASD-STE100 core writing rules; max 2 paragraphs; content order: what was examined, recommendation + tool, most important risk, next step.
**Why**: Fast, unambiguous executive read; enforceable by the validator.
**From**: brainstorming session 2026-08-13
**Affects**: all reports

### D-0008: Four-digit track prefixes
**Date**: 2026-08-13
**What**: Track directories use four-digit zero-padded prefixes (0010–9990).
**Why**: Lexicographic sort stays correct with runway for insertions.
**From**: brainstorming session 2026-08-13
**Affects**: tracks/ layout

### D-0009: Adopt offbook doc-system conventions
**Date**: 2026-08-13
**What**: Adopted from offbook: two permanent ID namespaces (D-#### + track numbers), this ledger, the slim intake convention (resolved files stay in place), the check-docs.ts validator (adapted under Apache-2.0 with attribution), and the README frontier pointer. Not adopted: StrictDoc/ReqIF grammar, separate requirements registry, archive strata.
**Why**: Proven conventions matching this repo's traceability needs; validator logic reusable nearly verbatim.
**From**: https://github.com/nzneit/offbook (docs/specs/doc-system.md)
**Affects**: repo structure, process

### D-0010: Accept 0010-contract-pipeline recommendation
**Date**: 2026-08-13
**What**: Adopt + wrap, composed pipeline — OpenAPI leg: adopt orval 8.24.0 + wrap (mutator wires non-2xx zod validation per D-0006); AsyncAPI leg: build thin (@asyncapi/parser extraction → Ajv 8 standalone compiled validators + Modelina types + fishery factories); drift CI: adopt oasdiff + @asyncapi/diff. TypeBox single-artifact route is the spike alternative for the AsyncAPI leg (schema2typebox maintenance is the go/no-go).
**Why**: No single tool covers both contract formats; this composition is the best-evidenced per-leg choice.
**From**: tracks/0010-contract-pipeline/report.md (user acceptance at the batched Wave 1 gate)
**Affects**: 0010, 0060, 0070

### D-0011: Accept 0020-complexity-metrics recommendation; sonarjs excluded by license
**Date**: 2026-08-13
**What**: Adopt — oxlint complexity rules (cyclomatic baseline) + Biome `lint/complexity/noExcessiveCognitiveComplexity` (cognitive gate) + fta-cli (ranked refactor reporting); cognitive-complexity-ts as optional ranked-cognitive supplement (GPL-3.0, dev-time only). eslint-plugin-sonarjs is excluded: releases after v2.0.4 ship under SSALv1, which is source-available, not OSS, and fails D-0003 (user ruling).
**Why**: Clean-license cognitive coverage without standing up an ESLint lane for this track.
**From**: tracks/0020-complexity-metrics/report.md (user acceptance at the batched Wave 1 gate)
**Affects**: 0020, and any future track shortlisting SonarSource npm packages

### D-0012: Accept 0030-duplication-detection recommendation
**Date**: 2026-08-13
**What**: Adopt — fallow as primary detector (committed-baseline ratchet (`fallow dupes --save-baseline`/`--baseline`; `fallow audit --dupes-baseline`), strict/mild/weak/semantic modes, SARIF/Markdown reporting (no interactive HTML dashboard — jscpd keeps that edge)); jscpd is the named fallback backbone; similarity-ts holds the renamed-clone audit slot; the spike decides whether fallow's semantic mode dissolves it (Simian is the successor only if similarity-ts abandons).
**Why**: The gap sweep falsified the no-stored-baseline finding; fallow dominates the jscpd-plus-hand-built-ratchet plan on detection modes, ratchet mechanics, and reporting.
**From**: tracks/0030-duplication-detection/report.md (user acceptance at the batched Wave 1 gate)
**Affects**: 0030

### D-0013: Accept 0040-hooks-linting recommendation
**Date**: 2026-08-13
**What**: Adopt — ESLint-in-CI with eslint-plugin-react-hooks v7 (`recommended` preset, compiler-powered rules included, no React version floor) + eslint-plugin-react-you-might-not-need-an-effect; eslint-plugin-react-hooks-addons (no-unused-deps, warn) joins the CI set; eslint-plugin-zustand-rules is a named spike candidate, not adopted; oxlint fast lane keeps `react/exhaustive-deps` and gains `react/rules-of-hooks`.
**Why**: Closes the compiler-powered and unnecessary-effect gaps oxlint cannot cover, within the D-0002 pragmatic mix.
**From**: tracks/0040-hooks-linting/report.md (user acceptance at the batched Wave 1 gate)
**Affects**: 0040
**Note**: corrected 2026-08-13 — the original entry misstated eslint-plugin-zustand-rules as adopted (transcription error vs the report).

### D-0014: Accept 0050-logging recommendation
**Date**: 2026-08-13
**What**: Adopt + wrap — consola as the base + a thin project-owned facade owning throttle-by-pattern, redaction, remote sinks, and runtime reconfiguration; 0010 contract-validation failures report through the facade as first-class events (D-0006). The OpenTelemetry Logs API is rejected as the facade surface today (0.x/experimental in the browser, heavy); revisit when its browser support stabilizes.
**Why**: Smallest maintained org-backed base with runtime reporters/levels; the facade keeps a future swap cheap.
**From**: tracks/0050-logging/report.md (user acceptance at the batched Wave 1 gate)
**Affects**: 0050, 0010

### D-0015: Accept 0060-transport-abstraction report
**Date**: 2026-08-14
**What**: Build — a thin owned `transport-boundary` package: an xstate 5.32.5 actor system over incumbent mqtt.js 5.15.2 as the MQTT/connection surface; 0010's orval-generated, mutator-wrapped client as the REST surface; TanStack Query 5.101.4 adopted outside the boundary as the REST server-state layer; mqtt-pattern 2.1.1 for topic matching; the four-class error taxonomy owned by `transport-boundary/errors`. Two-wire rule: discrete domain events leave via the typed `actor.on`/`emit()` surface; continuous state via `actor.subscribe` selector projection. RxJS 7.8.2 and Effect 3.22.1 are prior art only, not adopted; zodios eliminated (dormant).
**Why**: No maintained OSS package occupies the unified MQTT+REST typed-boundary slot, and the composition keeps D-0006 validation below cache/retry/dedup so nothing unvalidated is ever cached.
**From**: tracks/0060-transport-abstraction/report.md (user acceptance at the Wave 2 gate, 2026-08-14 — signaled by directing spikes for both tracks)
**Affects**: 0060, 0070, 0050

### D-0016: Accept 0070-state-concurrency report
**Date**: 2026-08-14
**What**: Build (patterns) + adopt (test tooling) — an owned Zustand↔xstate composition idiom and single-dispatch ingress kit with per-(topic, entity) monotonic guards on incumbents xstate 5.32.5 + zustand 5.0.15, with `AbortController`/`AbortSignal` propagation as the cancellation standard; adopt fast-check 4.9.0 (`fc.scheduler`) + @fast-check/worker 0.6.0 and `xstate/graph` in core xstate ≥5.20.0 (@xstate/test is npm-deprecated/v4-pinned). @xstate/store 4.2.3 is the named challenger, not adopted; p-queue 9.3.3 is the blessed residual coordination primitive. Entity ownership is partitioned (QueryCache vs Zustand/machine state) with invalidate-don't-set as the interim bridge; the server-issued ordering-stamp requirement is raised as a formal contract question via intake.
**Why**: The composition carries no weak score on any high-weight rubric criterion and adds zero new runtime dependencies; stale-vs-fresh arbitration is undecidable client-side without a server-issued stamp, which no library can fix.
**From**: tracks/0070-state-concurrency/report.md (user acceptance at the Wave 2 gate, 2026-08-14 — signaled by directing spikes for both tracks)
**Affects**: 0070

### D-0017: Adopt the isolated spike harness and vendor the codebase-design skill
**Date**: 2026-08-14
**What**: Spikes run as fully standalone npm packages under `tracks/<track>/spikes/<slug>/` — own exact-pinned package.json + committed lockfile, no npm workspaces, no imports across the spike boundary, node_modules git-ignored; scaffolded by `scripts/new-spike.ts` from `templates/spike/`; findings.md is the durable deliverable (validated by check-docs.ts). The codebase-design skill (SKILL.md, DEEPENING.md, DESIGN-IT-TWICE.md) is vendored verbatim from mattpocock/skills at `.claude/skills/codebase-design/` (MIT, commit 8b78b53) and governs spike design: deep modules, real seams only, and design-it-twice interface panels recorded in each spike's design.md.
**Why**: User directive (2026-08-14): attempt 0060/0070 spikes, keep each spike's work isolated, and establish a reusable R&D harness for future track spikes.
**From**: docs/superpowers/specs/2026-08-14-spike-harness-design.md
**Affects**: repo structure, process, 0060, 0070, and every future spike

### D-0018: Accept Wave 3 spike findings; ratify boundary contracts
**Date**: 2026-08-14
**What**: Both Wave 3 spikes accepted as complete with every in-scope check go (0060 boundary-wiring: 99 tests incl. the real-broker MQTT leg and orval REST leg; 0070 ingress-and-test-lane: 60 tests incl. the fc.scheduler race lane); the two findings.md files are the durable record. Ratified into the 0060 design: `rest.contract` (the declared-status table) with a **passthrough + drift-warning** unknown-field policy — undocumented response fields survive to callers and raise a deduped warning naming the endpoint and fields, so action can be taken case by case in code; this deviates from orval's strip default, so the build must configure or post-process the generated zod schemas (not exercised by the spike), and `Validated<T>` consequently means "at least the declared shape". Ratified the abort-normalization contract: an aborted request stays class-1 `reason: 'aborted'` inside the boundary (retry-excluded) and the state layer maps that shape — with raw `AbortError` and TanStack's `CancelledError` — to `{outcome: 'cancelled'}` with normal rollback; aborts raise **no telemetry envelope** (supersedes the spike's per-abort emission; visibility via a boundary stats counter). Also ratified: the signal-threading go conditions (mutator reads `req.signal`; orval `httpClient: 'axios'` convention), 0070's additive exports (`isCancellation`, `OptimisticConfigError`), and mqtt-pattern as adopt with the ~100-line vendor path reserved.
**Why**: Every high-stakes findings claim survived adversarial review and live verification; the two ratifications were the findings' explicitly queued choices (user call at the Wave 3 gate).
**From**: tracks/0060-transport-abstraction/spikes/boundary-wiring/findings.md, tracks/0070-state-concurrency/spikes/ingress-and-test-lane/findings.md
**Affects**: 0060, 0070, 0050, 0010

### D-0019: Server-issued ordering stamp — contract requirement with graceful fallback
**Date**: 2026-08-14
**What**: The program formally requests a server-issued monotonic ordering stamp (per-entity version or per-topic sequence) in the vendored contracts — raised to the app owner and 0010 via intake item a. Measured basis (0070 spike): without a stamp the client cannot even observe a lost REST-vs-MQTT race (`stats.stale === 0`, final version 1 of 3); with one, the same guard rejects the stale write in every interleaving fc explores and the invalidate round trip disappears (tests: ingress-race both arms, replay-and-pinning, bridge stamped-fast-path). The requirement is deliberately flexible: adoption is per-stream opt-in (one `stamp` selector plus an optional `write`, no interface reshaping); any existing monotonic field present on both legs may serve as the stamp — no new field is needed where one already exists; contracts we do not control stay partitioned or on invalidate-don't-set indefinitely, which remains the sanctioned safe bridge (D-0016).
**Why**: Stale-vs-fresh arbitration is provably undecidable client-side without a stamp, and per-stream opt-in means partial contract control cannot block incremental adoption.
**From**: tracks/0070-state-concurrency/spikes/ingress-and-test-lane/findings.md (user call at the Wave 3 gate)
**Affects**: 0010, 0060, 0070, contract owners

### D-0020: oxlint override-restatement standing rule
**Date**: 2026-08-14
**What**: Repo-wide standing rule for oxlint configs: every `overrides` entry touching `no-restricted-imports` restates the base ban patterns verbatim inside the override, and each config carries a drift test asserting the restatement. Basis: on oxlint 1.78.0, `overrides` REPLACE base rule options rather than merging, so an allowance override silently drops the base ban list — a false negative confirmed independently by both Wave 3 spikes. Closes 0010's overrides-merge open caveat.
**Why**: The failure mode is a silent false negative in the layering lint that D-0002/D-0006 depend on; the mitigation is proven twice and cheap.
**From**: both Wave 3 spike findings (user call at the Wave 3 gate)
**Affects**: 0040, 0060, 0070, and any future oxlint config

### D-0021: Add track 0100-type-strictness (enforcement under agentic churn)
**Date**: 2026-08-14
**What**: New research track 0100-type-strictness: how to raise TypeScript strictness from the app's very loose baseline (TS 5.9.3) and enforce it in a codebase that receives a high volume of agent-authored code. It owns the design the 0090 type-coverage area left gated: the resolved strictness fact selects the allowlist-first branch of 0090's decision rule, and 0090's direct-adopt of type-coverage 2.30.1 becomes an input to this track rather than a finished wiring. Scope includes gaming-resistant ratchet design (diff-scoped vs global-metric), suppression-insertion gates, boundary type-anchoring on the 0010/0060 contract types, and how the result composes with the 0020/0030 ratchets into one agent-resistant quality gate. Side effect: 0090's proposed future tracks would mint as 0110 (React Compiler) and 0120 (e2e browser testing).
**Why**: User directive 2026-08-14, alongside the new app facts (React 18.3.1, TypeScript 5.9.3, very loose strictness); a high volume of buggy agent-authored code is a standing pressure the program's enforcement designs must survive, and a one-tool adoption cannot answer it.
**From**: user directive 2026-08-14; intake/2026-08-14-0090-app-facts.md item b resolution
**Affects**: 0090, 0100, and the ratchet designs from 0020/0030

### D-0022: Accept the 0090 horizon-scan report; sweep items become their own tracks
**Date**: 2026-08-14
**What**: The 0090 report is accepted, with one amendment. Accepted as written: **direct adopt** of knip 6.32.2 (dead code, unused deps), dependency-cruiser 18.2.0 (module-boundary rules), MSW 2.15.0 on the REST leg via orval `mock: true`, type-coverage 2.30.1 (as an input to 0100, which owns the ratchet design), and size-limit 13.0.3 (bundle budget); **skip** of MSW on the MQTT-over-WSS leg, where the aedes-over-ws harness proved by the 0060 spike keeps the role. **Amendment (user directive)**: the three anything-else sweep items do not land as scan-depth adoptions — each becomes its own planned research track that evaluates candidates. Accessibility linting becomes **0130**, supply-chain auditing becomes **0140**, and browser testing becomes **0120** (also covered by the minting in this entry). The sweep's findings become each track's starting candidate, not its conclusion. Also minted per user approval: **0110-react-compiler**, from the report's future-track disposition. Post-draft annotations recorded in the report against later-supplied facts (React 18.3.1, TS 5.9.3 very loose, pseudo-monorepo layout, `@appname/*` alias imports) are accepted as part of it; the two open items they name — the dependency-cruiser-vs-oxlint boundary split and the knip `--tsConfig` pin — carry into 0130/0140 scoping and the 0100 revision rather than blocking acceptance.
**Why**: The survey answered every key question at the depth its disposition required, and the user's amendment corrects a real weakness: the sweep evaluated one candidate per area, which is a proposal, not a survey. Areas worth adopting are worth comparing alternatives for.
**From**: tracks/0090-horizon-scan/report.md (user acceptance 2026-08-14)
**Affects**: 0090, 0100, 0110, 0120, 0130, 0140

### D-0023: Track 0100 adds a tenth rubric criterion — Suppression auditability
**Date**: 2026-08-14
**What**: Track 0100-type-strictness scores its candidates against the shared nine-criterion rubric **plus one track-specific tenth criterion, "Suppression auditability"**, weighted high. It scores how visible and reviewable a mechanism's suppressions are: an *auditable* escape is inventoried, budgeted, and countable (a sidecar suppressions file, a shrinking allowlist, an unused-suppression report); a *silent* escape is a comment that turns the rule off with no inventory. The shared "Escape hatch" criterion keeps its spec meaning unchanged — the cost of removing the tool later — and is scored separately. This is a **deliberate, bounded deviation** from the spec's single shared rubric ("Shared evaluation rubric"): it applies to 0100 only, and any future track wanting a track-specific criterion needs its own ledger entry rather than citing this one as precedent.
**Why**: An adversarial review found the plan had silently redefined "Escape hatch" to mean suppression semantics, which breaks cross-track comparability and loses the exit-cost signal on the track most likely to recommend committed baselines and inline markers. Suppression auditability is the axis 0100 exists to reason about, so it earns explicit weight rather than being smuggled into another criterion's name.
**From**: adversarial review of tracks/0100-type-strictness/research-plan.md (user call 2026-08-14)
**Affects**: 0100, and the spec's rubric section as a named exception

### D-0024: Split the TypeScript 7 question — migration in 0100, compiler upgrade later
**Date**: 2026-08-14
**What**: The TypeScript 7 question splits in two. **Track 0100 owns the bounded part**: removing `baseUrl` (removed in TS 7.0, and rejected as a hard error by oxlint's type-aware lane) and migrating the `@appname/*` alias to `paths`-only form, which is a no-op for the alias mapping itself but requires auditing bare imports that relied on `baseUrl`'s fallback-root role — those can silently retarget to a same-named real package rather than failing. The sanctioned detection step is to pass through TypeScript 6.0 without `"ignoreDeprecations": "6.0"`, which surfaces every fallback-dependent import as a deprecation error. **A separate, not-yet-minted track owns the rest**: upgrading the app's own `typescript` dependency from 5.9.3 to 7.x. That is gated on ecosystem readiness (no stable programmatic API before ~7.1, so parts of the toolchain still track 6.x), not on strictness. Adopting the fast type-aware lint lane does **not** require the upgrade, because `oxlint-tsgolint` bundles its own typescript-go engine.
**Why**: The two halves have different costs, different blockers, and different owners. Folding a compiler-major migration into a strictness track would make 0100 unable to produce one coherent recommendation, while leaving the `baseUrl` work out of 0100 would block its own lane routing.
**From**: 0090/0100 verification workflows (user call 2026-08-14)
**Affects**: 0100, 0060, and a future TypeScript-upgrade track
