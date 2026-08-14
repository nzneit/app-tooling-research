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
