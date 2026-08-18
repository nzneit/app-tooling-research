# Decisions

Append-only ledger. `D-####` IDs are contiguous from D-0001 and never reused; superseded
decisions are marked superseded in place, never deleted. Entry format: `### D-####: title`
followed by `**Date**`, `**What**`, `**Why**`, `**From**`, `**Affects**` lines.

## Start here

A **reading order**, not an enumeration — this list is deliberately partial and always was, so
never treat absence from it as evidence that a decision does not bind. The ledger below is the
complete and authoritative set; every `D-####` in it is in force unless its own entry says
superseded. Read these first because they constrain the most: D-0001 (survey-only depth) ·
D-0003 (free OSS only) · D-0004 (declare assumptions) · D-0007 (STE summaries) · D-0027
(the four-rung dependency ladder) · D-0029 (the ceiling's unit).

*Ruled 2026-08-17 (intake item c). This block was previously headed "Constraints in force" and
listed D-0001 to D-0007 plus D-0011. It read as a complete enumeration and never was one — at the
commit that created it, it already omitted D-0008 and D-0009 — so it did not go stale, it was
partial from birth. Relabelling it removes the completeness claim rather than committing the repo
to maintaining a list that will drift again; the alternative rules considered were "every standing
constraint" and "program-wide only", both of which recreate the maintenance burden that produced
the defect.*

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

### D-0025: Add meta track 9900-process-design; reserve the 99xx band for meta tracks
**Date**: 2026-08-14
**What**: New research track **9900-process-design**: how to improve and standardise this repo's own research machinery — `templates/` (research-plan, report, spike scaffold), `scripts/` (the `check-docs.ts` validator and `new-spike.ts`), and the process conventions that govern them — so that future tracks are cheaper to run and likelier to be right. It is seeded from three sources named by the user: (1) this repo's own recorded defects, mined from the git history, the decision ledger, the spike findings' deviation lists, and the post-draft correction annotations in accepted reports; (2) FMEA as practised in process design, alongside adjacent mistake-proofing traditions (poka-yoke, checklists, pre-mortems, blameless defect taxonomies); (3) published work on agentic research workflows and their documented failure modes, since this repo's tracks are executed largely by AI agents. Scope is the machinery, not the program's purpose: this track may not redesign the track lifecycle, the wave structure, or the shared rubric — a proposal touching those is a separate, larger track. **Numbering**: this is the program's first track about the repo itself rather than the application under study, so the **99xx band is reserved for meta/process tracks** and the 00xx–09xx band stays with application-tooling tracks. This keeps the README index legible as app-tooling tracks continue to be added (D-0024 already anticipates one) and preserves lexicographic sort. No new ID alphabet is introduced; the four-digit track namespace is unchanged.
**Why**: User directive 2026-08-14. The repo has now run enough work — seven accepted tracks, two spikes, four multi-agent survey workflows, and an adversarial plan review — to have an evidence base of real recurring defects rather than speculation about them. Fixing the machinery is worth doing while that evidence is fresh and while ten tracks remain unstarted, so the improvements compound rather than arriving after the work they would have helped.
> **2026-08-15 correction (in place; the original text above is left intact as the record).** "Ten tracks remain unstarted" is wrong. At commit `1b7cb46`, which introduced this entry, `README.md` carried 14 track rows of which **6** were non-accepted (0100, 0110, 0120, 0130, 0140, 9900); adding D-0024's anticipated but unminted track gives 7. No reading of the record yields ten. The decision itself is unaffected — the rationale's direction holds at 6 as it does at 10 — but the number is not evidence and should not be cited as such. Found by the 9900 survey, which also records that this is a live instance of its own corpus category G, inside the entry that founded the track, and structurally invisible to `check-docs.ts`.
**From**: user directive 2026-08-14
**Affects**: templates/, scripts/, the doc-system conventions, and every future track

### D-0026: Make agent-facing conventions durable — CLAUDE.md and the design-panel skill
**Date**: 2026-08-14
**What**: Two repo-owned, agent-facing files are added. **`CLAUDE.md`** at the repo root: the auto-loaded entry point for any session, carrying what the repo is, the pre-commit checks, the non-negotiables (no AI attribution in commits; never edit vendored files; the append-only ledger; commits stay local; user-only questions go to `intake/`), and pointers to the convention skills. **`.claude/skills/design-panel/SKILL.md`**: the repo's own elaboration of the design-panel pattern — a grounding phase (audit actual usage, survey comparable systems) feeding parallel variants under *opposing* constraints, judged against a stated default and burden of proof, with each variant required to state what it refuses and the panel's output required to land in a named durable file. It is a **sibling to, not an edit of**, the vendored codebase-design skill, which stays byte-verbatim per D-0017 and remains authoritative for code-interface design.
**Why**: User directive 2026-08-14, prompted by discovering that the pattern an agent described as "the repo's own" was not durably written anywhere. Auditing it found three layers: the vendored skill (durable, but scoped to code interfaces and not surfaced as an invocable skill in practice), one wave's plan file (an execution record, not a reusable convention), and the grounding phase plus variant count actually used (written down nowhere). Each reuse silently re-derived the uncovered parts differently — four variants in Wave 3, two later — with nothing to detect the drift. Recorded as category I of the 9900 seed corpus. The root previously had no `CLAUDE.md`, so no convention reached a fresh session automatically, and subagents never see the user's own memory, which is where the commit-attribution rule had been living.
**From**: user directive 2026-08-14; tracks/9900-process-design/seed-defect-corpus.md categories H and I
**Affects**: every future session and subagent; 9900 may refine or supersede the content

### D-0027: Dependency envelope — a four-rung ladder, strict by default
**Date**: 2026-08-14
**What**: The "dependency-free root" rule is a **preference ladder, not a prohibition**. Each rung requires justification to climb, and the default is the lowest. **Rung 0 — strict** (default): the improvement is an in-house `check-docs.ts` extension using only Node's standard library; nothing new enters the checking path. **Rung 1 — npm-only**: an npm dependency is permitted for things that do not make sense to roll ourselves. **Rung 2 — CI-only**: an external binary may run in CI but not in the pre-commit path, when we truly cannot live without the tooling. **Rung 3 — forced local install**: a binary every contributor must install, permitted only where there is no practical way to replicate the tool's fidelity in-house *and* the CI expense of rung 2 would be too great. Rungs 2 and 3 are not ordered by contributor burden — rung 3 asks more of contributors than rung 2 — but by where the cost lands; the choice between them is a cost-placement decision, not an escalation of permissiveness. Vale is the named example that may reach rung 2 or 3, because mechanical ASD-STE100 checking has no clear in-house equivalent at comparable fidelity. This supersedes nothing: it interprets the spike-harness spec's "the repo root `package.json` stays dependency-free and the validator stays zero-dep" (D-0017), which constrained npm dependencies and was silent on binaries.
**Why**: User ruling 2026-08-14 on intake item a, which the 9900 track could not decide for itself because it is a constraint boundary rather than a tool comparison. The ladder keeps the zero-dependency identity as the default while refusing to eliminate genuinely irreplaceable tooling on constraint alone — a tool now has to lose on merit, or win by showing in-house replication is impractical.
**From**: intake/2026-08-14-9900-process-scope.md item a
**Affects**: 9900 and any future proposal to add tooling anywhere in this repo

### D-0028: Terminology — "gap sweep" and "completeness scan" are different passes
**Date**: 2026-08-17
**What**: Two distinct passes get two distinct names, and one word stops doing both jobs. A **gap sweep** is the cross-cutting adversarial pass over a *wave's finished reports* that hunts for falsified claims. A **completeness scan** is the *within-track* check asking which candidates a survey never considered. The term **"gap scan" is retired**; every one of its 22 occurrences across six files was renamed to "completeness scan", including in the two accepted reports (0060, 0070), each of which carries a dated in-place annotation recording the rename so the edit is visible rather than silent. No claim in any document changed.
**Why**: User ruling 2026-08-17 on intake item f. The two terms appeared 38 and 18 times respectively, denoted genuinely different things, and neither was defined anywhere — so every reader inferred the distinction or missed it. The 9900 report's position, adopted here, is that one sentence of definition fixes this and that a blocking preferred-term validator check would have been actively harmful: it would have pushed authors toward collapsing two real concepts into one word, which is the wrong repair. This is a case where the cheap mechanical control is worse than the free editorial one.
**From**: intake/2026-08-15-9900-report-rulings.md item f
**Affects**: all future reports and plans; the 9900 corpus; the two annotated accepted reports

### D-0029: The ceiling's unit — a "step" is a logical workflow step
**Date**: 2026-08-17
**What**: Under the **net steps hold** ceiling (intake 2026-08-14 item b), a **step** means *a logical step in the workflow, or dynamic workflow, that executes a track* — an orchestration stage such as investigate, verify, critique, price, or synthesise. It does **not** mean a line of prose, a validator check, or a document someone may read. Consequences: a rung-0 validator check is ceiling-free; a byte added to an always-loaded file is ceiling-free; a new named pass in the execution of a track is ceiling-**governed** and needs an offset. Two things follow that the report did not assume. First, the ceiling now governs **how tracks are run**, not only what authors must do — so the shape of the agent workflow that executes a track is the budgeted object. Second, because always-loaded bytes are ceiling-free but recur on every session of every track forever, they must still be **priced and reported** in the agent-token unit; ceiling-free is not cost-free, and a report that omits that price is incomplete.
**Why**: User ruling 2026-08-17 on intake item a. The 9900 report assumed a step was "a mandatory per-track authoring or review action" (its assumption A-1) and flagged that its arithmetic was contingent on the definition. The actual intent was neither that reading nor the broader "anything an author or agent must do or read". The report's four shipped items stay free under this reading, so its recommendation is unaffected; what changes is that future proposals are scored against workflow stages rather than authoring actions. **This supersedes assumption A-1 of the 9900 report**, which is annotated in place there.
**From**: intake/2026-08-15-9900-report-rulings.md item a
**Affects**: every future control proposal; the 9900 report's step arithmetic; the design of track-executing workflows

### D-0030: Payment classes — a cancelled proposal is not an offset
**Date**: 2026-08-17
**What**: Under net steps hold, an offset must retire, merge, or time-box something **that exists**. A **cancelled proposal** — paying by not building something that was never built — is **not** admitted as payment. The two adjacent classes the survey also invoked are constrained with it: a **future rate-limit** (a promise to constrain later additions) is not payment because it retires nothing now, and a **tooling offset** (retiring a candidate never adopted) is not payment for the same reason. An offset names a thing currently in the process and removes it.
**Why**: User ruling 2026-08-17 on intake item b, confirming the 9900 report's recommendation. The class is unfalsifiable: any control can name a hypothetical it forecloses, so admitting it makes the ceiling unenforceable in principle rather than merely lenient. Nine of the survey's 43 proposed controls paid in one of these three classes, and three separate controls each claimed to be the budget authority for the others — which cannot all be true, and is the symptom this rules out.
**From**: intake/2026-08-15-9900-report-rulings.md item b
**Affects**: every future control proposal scored against the ceiling

### D-0031: This repo gets CI, running the existing gate only
**Date**: 2026-08-17
**What**: A GitHub Actions workflow (`.github/workflows/ci.yml`) runs the gate this repo already has — `node scripts/check-docs.ts`, then `node --test scripts/*.test.ts` — on pull requests and pushes to `main`. It adds **no new check, tool, or dependency**; there is no install step, because the root declares no dependencies and the validator is zero-dependency by design. Adding any check to this workflow is a ceiling decision under D-0029, not a CI-config change, and the workflow file says so. This settles the question the 9900 plan assigned to the track and the report failed to answer.
**Why**: User ruling 2026-08-17 on intake item g, choosing shape (ii) of three. The repo is public, so Actions costs nothing here, and the real gap was that the gate was **available but unenforced**: no git hooks are installed, `core.hooksPath` is unset, and `package.json` declares no scripts, so nothing but discipline ran the checks. Shape (ii) closes that without depending on adopting any tool the report skipped. It also makes D-0027's **rung 2** — a binary in CI but never pre-commit — a real option for future tracks rather than a notional one, which was the reason the question mattered. Noted as a cost, not a free win: CI moves cost from contributor wall-clock to pipeline time, a reallocation across the three cost units that all matter, and it adds a place where a check can be silently disabled.
**From**: intake/2026-08-15-9900-report-rulings.md item g
**Affects**: every commit and pull request; the availability of D-0027 rung 2 to future tracks

### D-0032: The ledger's opening list is a reading order, not an enumeration
**Date**: 2026-08-17
**What**: `DECISIONS.md`'s opening block is retitled from **"Constraints in force"** to **"Start here"** and states explicitly that it is a partial reading order, that absence from it is never evidence a decision does not bind, and that the ledger below is the complete and authoritative set. No membership rule is adopted and no checker is built.
**Why**: User ruling 2026-08-17 on intake item c (delegated: "I don't have a preference how we handle this"). The block listed D-0001 to D-0007 plus D-0011 and had not been touched since the initial commit, while D-0012 to D-0027 accrued. Verification reframed the defect usefully: at that same initial commit it **already** omitted D-0008 and D-0009, so nothing in it became false over time — an enumeration presented as complete was partial from birth. The two alternative rules considered ("every standing constraint that binds future work" and "program-wide constraints only") both commit the repo to maintaining a list that will drift again, recreating the defect; relabelling removes the completeness claim permanently and costs nothing to maintain. Recorded plainly: this was decided by the agent under an explicit delegation, not by the repo owner.
**From**: intake/2026-08-15-9900-report-rulings.md item c
**Affects**: readers of DECISIONS.md; no other document

### D-0033: The gate review becomes a named stage, funded by retiring the wave close-out pass
**Date**: 2026-08-17
**What**: The adversarial review that has been running ad hoc becomes a **named stage in the workflow that runs an acceptance gate**, with two lenses it must carry: **falsification** (attack the claims in the artifacts under acceptance) and **machinery** (attack the validator, templates and conventions themselves). It runs at **acceptance gates**, which are batched — four gate events have covered nine acceptances — and explicitly **not once per track**. It is funded by **retiring the wave close-out whole-branch review**, whose single recorded occurrence it absorbs; the machinery lens exists precisely so that retirement loses no coverage, since that pass produced two `check-docs.ts` fixes a claims-only review could not have generated. **Net stage change under D-0029: zero.** This is therefore *not* an exception to net steps hold and needs no reviewed justification — the report cut it for lack of an offset, and an offset exists once the pass being replaced is named correctly.
**Why**: User delegation 2026-08-17 on intake item d ("I don't have a preference how we handle this"), decided by the agent on the evidence. That evidence is now two independent instances, not one. The Wave 1 gap sweep falsified factual claims in **three of five reports** and changed the adopted set in three of five tracks. Then on 2026-08-15 an adversarial review of the drafted 9900 report — an artifact that had *already* passed per-lane verification and a completeness critic — returned **six blockers**, including a citation sub-count produced by an unstated counting rule, a corpus claim answered from the half of the evidence that had been tested, and an in-scope question the track was assigned and silently dropped. A control that finds defects in the very report arguing against it has met its burden. Recorded plainly, because the ceiling rule cares about this: the rule wanted someone other than the proposer to agree, and what happened instead is that the owner delegated. If the owner disagrees, this is the entry to reverse.
**From**: intake/2026-08-15-9900-report-rulings.md item d; tracks/9900-process-design/report.md flagged item (a)
**Affects**: acceptance gates from the next one onward; supersedes the 9900 report's cut of this control

### D-0034: Citation pinning — refuse the proposed rule, adopt the version-in-prose convention
**Date**: 2026-08-17
**What**: The immutable-ref control as the 9900 report scoped it — a regex-only, warn-level, diff-scoped check over `github.com` and `raw.githubusercontent.com` — is **refused**. In its place one **authoring convention** is adopted: *when a report prints a version number beside a `registry.npmjs.org/<pkg>/latest` link, cite the version-pinned endpoint instead* (`registry.npmjs.org/typebox/1.3.13`). No validator, no network, no new workflow stage, so it is ceiling-free under D-0029 and needs no offset. The GitHub half of the question is **not settled and not dropped**: it stays open behind a named cheap experiment — one commits-API call per cited path across the eight accepted reports, giving each citation's file-level staleness and therefore a hazard estimate rather than a four-day null.
**Why**: User delegation 2026-08-17 on intake item e, decided on evidence from the n=10 experiment the report itself pre-scoped (run 2026-08-17; sample of ten unique mutable-ref citations drawn systematically from the 94 across six accepted reports). Result: **10/10 still resolve, 9 still support their claim, 1 drifted, 0 broke**. Three findings drove this ruling rather than the headline. **First, the proposed control scores 0-for-10**: all four GitHub-family citations passed, and the single failure was an npm `/latest` endpoint, which the proposed scope excludes — granting a ceiling exception to a control that would have caught nothing is not defensible. **Second, the pass rate is a floor, not a rate.** The horizon was three to four days, and the pre-registered falsifier ("if the number is high, drop it") was written without a horizon; honoring its letter would convert a null into a false clearance. Three of the nine passes are structurally uninformative — an archived repository that cannot drift, and two packages that have not published in five and twenty-three months — so the effective sample of citations *capable* of decaying was about four, of which one did. **Third, the real failure class is narrower and more fixable than the one proposed**: not a mutable URL but a **printed fact copied out of a mutable endpoint into prose**. The observed instance is 0010's `typebox (1.3.13)`, where `/latest` moved to 1.3.14 on 2026-08-14 and 1.3.15 by 2026-08-17 while the claim the citation supports survived intact. The projection worth recording: on the publish cadences these ten cells measured, roughly half the `/latest` citations would point at a different version within thirty days.
**From**: intake/2026-08-15-9900-report-rulings.md item e; the n=10 experiment, 2026-08-17
**Affects**: all future reports; 0010's printed typebox version is left as-is, because a report is a dated snapshot and carries an "As of" line — the convention applies going forward rather than retroactively
