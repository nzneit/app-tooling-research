# Tooling Research Program — Design

**Date:** 2026-08-13
**Status:** Accepted — Wave 1 executed (acceptances D-0010..D-0014 in DECISIONS.md)
**Repo:** `app-tooling-research` (renamed 2026-08-14 from `composable-state-management-tooling`; the local directory keeps the old name)

## Purpose

Design a structured research program for an existing TypeScript React application, with the goal of extracting as much as can be justified into purpose-built tooling instead of kludgey in-house solutions. This repo is the research home: it holds each track's research plan, its survey + recommendation report, and (later) any spikes. The application repo itself is not accessible from here; app facts are supplied by the user and recorded in `facts/app-profile.md`.

## The application under study

- React + TypeScript
- Zustand and xstate for state
- mqtt.js — MQTT over WebSockets Secure
- RESTful APIs whose responses (including many non-2xx statuses) carry reason codes in JSON bodies used for control flow and error handling
- Vendored AsyncAPI and OpenAPI contracts, with TS types generated from them
- Kludgey object factories built on those derived types (a replacement target)
- oxlint

## Constraints (decided during brainstorming)

1. **Deliverable depth:** survey + recommendation documents. No prototyping during research; the repo structure must be ready to hold spikes later.
2. **Lint stack:** pragmatic mix. oxlint stays for speed; recommendations may add ESLint (or standalone CLIs) in CI or pre-push for rules oxlint cannot cover.
3. **Candidates:** OSS only. No paid products and no self-hosted server products (this excludes SonarQube Server; the OSS SonarJS ESLint rules remain in scope). Refined by D-0011: eslint-plugin-sonarjs releases after v2.0.4 (SSALv1) are excluded.
4. **Grounding:** the app repo is not accessible. Reports cite `facts/app-profile.md`; where a fact is missing, the report states the assumption made in its place.

## Repo structure

Four-digit zero-padded track prefixes keep lexicographic sort correct as tracks are added.

```
├── README.md                     # entry point: track index, statuses, frontier pointer
├── DECISIONS.md                  # append-only decision ledger (D-####)
├── facts/
│   └── app-profile.md            # user-supplied facts about the real app
├── intake/
│   ├── _TEMPLATE.md              # dated question files for input only the user can give
│   └── YYYY-MM-DD-<topic>.md
├── templates/
│   ├── research-plan.md          # questions, candidates, rubric weights
│   └── report.md                 # survey findings + recommendation
├── scripts/
│   └── check-docs.ts             # doc-system validator (adapted from offbook, Apache-2.0)
├── docs/superpowers/specs/       # design docs (this file)
└── tracks/
    ├── 0010-contract-pipeline/
    ├── 0020-complexity-metrics/
    ├── 0030-duplication-detection/
    ├── 0040-hooks-linting/
    ├── 0050-logging/
    ├── 0060-transport-abstraction/   # dir created when Wave 2 starts
    ├── 0070-state-concurrency/        # dir created when Wave 2 starts
    └── 0090-horizon-scan/         # created only when scheduled
```

### Track lifecycle

Each track directory contains:

1. **`research-plan.md`** — written first, from the template: the questions the track must answer, the starting candidate list, and rubric weights. Small by design.
2. **`report.md`** — the deliverable: source-linked survey, rubric-scored comparison, and a recommendation of one of four shapes:
   - **adopt** — use the tool as-is
   - **adopt + wrap** — tool behind a thin in-house facade
   - **build** — no tool fits; purpose-built is justified
   - **skip** — not worth doing (a legitimate outcome)

   Every report ends with a **"what a spike would validate"** section so future spike work is pre-scoped.
3. **`spikes/`** — empty during research; later, one subdirectory per spike with its own README, keeping throwaway code quarantined from the docs.

### Report summaries (ASD-STE100 style)

After a report's body is first drafted, a summary is prepended at the top of the file, above all other content, written in the style of ASD-STE100 Simplified Technical English. Full STE compliance requires the ASD-STE100 approved dictionary; reports follow its core writing rules rather than the letter of the dictionary:

- Use the active voice. Use the simple present or simple past tense.
- Keep sentences short: at most 20 words for an instruction, at most 25 words for a description.
- Keep paragraphs to at most 6 sentences, with one topic per paragraph.
- Use one word for one meaning, and use the same word for the same thing every time.
- Do not write noun clusters longer than 3 words. Keep the articles ("the", "a").
- Write one instruction per sentence for any step the reader must do.

The summary must state, in this order: what the track examined; the recommendation (adopt / adopt + wrap / build / skip) and the chosen tool, if any; the most important risk; the next step. Maximum length: 2 paragraphs. The `templates/report.md` file carries the summary block and this rule list, so no report can ship without one.

## Doc system (adopted from offbook)

Five conventions adopted from the offbook documentation system ([nzneit/offbook](https://github.com/nzneit/offbook), `docs/specs/doc-system.md`), slimmed to fit a research repo. Offbook is Apache-2.0; adapted validator code keeps its license header and NOTICE attribution.

### Permanent ID namespaces

The repo has exactly two permanent ID namespaces: **`D-####`** (decisions) and the **four-digit track numbers** (`0010`–`9990`). Everything else — intake question handles, draft labels — is ephemeral by design and graduates to a permanent ID only when it resolves. No new ID alphabet may appear without a change to this spec.

### Decision ledger (`DECISIONS.md`)

Append-only; IDs are contiguous from `D-0001` and never reused (superseded decisions are marked superseded in place, never deleted). Entry format, MADR-style:

```markdown
### D-0003: OSS-only candidates
**Date**: 2026-08-13
**What**: Shortlists contain only free OSS; no paid or self-hosted-server products.
**Why**: Procurement is off the table for this effort.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks
```

A **Constraints in force** section at the top of the ledger lists the D-IDs that actively constrain current work. Track documents cite decisions by ID instead of restating them. Report acceptance is itself a ledger entry (the adopt/wrap/build/skip call, with the track's report as `From`).

The ledger is seeded at scaffold time with the decisions this brainstorm already made: survey-only deliverable depth; pragmatic lint mix; OSS-only candidates; app facts supplied via `facts/app-profile.md`; themed-wave track structure; live validation of all contracted inbound messages as 0010 scope; STE-style report summaries; four-digit track prefixes; adoption of this doc system.

### Intake convention (slim)

Questions only the user can answer (missing app facts, scope calls) get one dated file in `intake/`, created from `intake/_TEMPLATE.md`, instead of living only in chat. Open items carry ephemeral local handles (a, b, c). Resolving an item either updates `facts/app-profile.md` or allocates a `D-####`; the file's `**Status**:` flips from `open` to `resolved` in place — no archive-move ceremony; git history is the archive.

### Validator (`scripts/check-docs.ts`)

A zero-dependency hand-parsing script adapted from offbook's `check-docs.ts` (its entry parser, ID checker, anchor resolver, and relative-link checker transfer nearly verbatim; its requirements-registry and test-trace checks do not apply here). Exits nonzero on problems; run before committing, and in CI when the repo has one. Checks:

- `D-####` IDs unique, well-formed, and contiguous from `D-0001` (contiguity enforces never-delete)
- Every relative markdown link and `path#heading` cross-reference resolves (headings by slug, or additive `<!-- anchor: ... -->` back-anchors)
- Every `tracks/` directory has a README index row; rows with status `planned` or `deferred` may precede their directory (created when the track's work starts); statuses come from the allowed vocabulary
- Track directory names match the four-digit prefix format
- Every `report.md` opens with its STE-style summary section
- Intake files conform to the template with `**Status**: open|resolved`
- The README carries the `> **Frontier:**` line (presence-checked)

### Entry point and frontier

`README.md` is the single entry point: the track index answers "what is this program and where does each track stand," and a one-line **frontier pointer** names the next action (e.g., "surveying 0010; Wave 2 blocked on its acceptance") so any future session starts oriented.

## Track definitions

### Wave 1 — independent tracks

#### 0010-contract-pipeline (keystone)

One pipeline from the vendored AsyncAPI/OpenAPI contracts to three artifact kinds: TS types (replacing the current generation if warranted), runtime validation schemas, and object factories/mocks (replacing the kludgey ones). Its conclusions feed both Wave 2 tracks.

**Scope requirement — live validation of all contracted inbound messages.** The runtime-validation output must support validating every inbound message from any contracted interface, on both protocols:

- **MQTT payloads** (AsyncAPI): every message on every subscribed topic, validated as it arrives.
- **REST response bodies** (OpenAPI): every response, explicitly including non-2xx bodies — the reason-code error bodies are contracted surfaces the app branches on, so a partner breaking the error shape is a breaking change like any other.

**Key questions:**

- Can one generator cover both OpenAPI and AsyncAPI, or do we pair two?
- Zod vs alternatives (valibot, ArkType, typia, Ajv on raw JSON Schema): bundle size, TS inference quality, and error-message quality when a partner breaks an interface.
- Factories generated from schemas or from types?
- Contract drift: how to detect in CI when a vendored contract update lands incompatibly.
- **Coverage guarantee:** how to ensure no contracted message enters the app unvalidated — a choke point in the transport layer (requirement handed to 0060) plus a mechanism (type-level design, lint rule, or codegen structure) that makes bypassing validation hard to write.
- **Hot-path cost:** overhead of validating high-frequency MQTT traffic; mitigations (compiled validators like Ajv/typia vs interpreted like Zod; per-topic policies; validate-always vs sample-in-prod). Candidates are compared on validation throughput, not just DX.
- **Failure semantics:** on live validation failure — reject, pass through flagged, or quarantine? How the failure surfaces as a first-class "partner introduced a breaking interface" signal (wired into 0050-logging for reporting).

**Starting candidates:** orval, kubb, hey-api/openapi-ts, openapi-zod-client, typed-openapi, AsyncAPI Modelina, AsyncAPI Generator, json-schema-to-zod, typia, zod-fixture, @anatine/zod-mock, fishery.

#### 0020-complexity-metrics

Cyclomatic and cognitive complexity in one track — the same analyzers report both.

**Key questions:** What does oxlint already cover? Where is the gap requiring ESLint-in-CI with eslint-plugin-sonarjs (`cognitive-complexity`)? Threshold-gating in CI vs trend reporting, and what generates a readable report?

**Starting candidates:** oxlint built-ins, ESLint `complexity` rule, eslint-plugin-sonarjs, fta-cli, lizard, typhonjs-escomplex.

#### 0030-duplication-detection

Detect near-duplicate code and produce actionable reports for deliberate de-duplication.

**Key questions:** Token-based vs AST/semantic similarity — which catches poorly-thought-out reimplementations in practice? Thresholds that avoid noise? Ratcheting (block new duplication in CI while burning down existing)? Report format for review workflows (HTML, markdown, PR comments)?

**Starting candidates:** jscpd, PMD CPD, similarity-ts, custom ts-morph AST comparison (assessed as a "build" option).

#### 0040-hooks-linting

React hooks anti-pattern coverage beyond the basics.

**Key questions:** Gap analysis between eslint-plugin-react-hooks (including the React-Compiler-powered checks in v6) and oxlint's react rule implementations. Which anti-patterns matter most for this app (effects-as-derived-state, stale closures, setState-in-render, unnecessary effects)? Whether React Compiler adoption itself belongs on the horizon scan.

**Starting candidates:** eslint-plugin-react-hooks (latest), oxlint react/react-perf rule sets, eslint-plugin-react-you-might-not-need-an-effect, eslint-plugin-react-perf.

#### 0050-logging

A logging facade meeting the spec: config-file and runtime control of sinks/locations, per-logger levels, throttling/sampling by pattern or by logger. Expected shape is **adopt + wrap** — a base library plus a thin facade owning throttling and runtime reconfiguration, since pattern-based throttling is rare off the shelf.

**Key questions:** Which base has the best browser story and transport pluggability? Remote sink batching/flush (could MQTT itself be a log transport)? Redaction? What facade surface keeps call sites stable if the base is swapped later?

**Starting candidates:** loglevel (+ plugins), pino (browser mode), tslog, consola, adze, LogLayer, roarr, debug.

### Wave 2 — architecture tracks (start after 0010's report is accepted)

#### 0060-transport-abstraction

UI code never touches mqtt.js or fetch directly: a unified, typed boundary that validates inbound messages via 0010's schemas, maps HTTP reason-code bodies into a typed error taxonomy, and exposes subscriptions/requests in one idiom. **Inherited requirement from 0010:** this boundary is the validation choke point — no code path may consume a contracted message around it.

**Key questions:** Interface shape — event emitter, observable, async iterable, or store-adapter? Where exactly does runtime validation hook in, and how do failures surface as first-class contract-break errors? Reconnection, backpressure, QoS handling? Is this mostly a build with adopted typed-client pieces?

**Starting candidates:** custom layer (build), RxJS, Effect, TanStack Query (REST side), openapi-fetch, ts-rest, zodios, xstate actors as transport adapters.

#### 0070-state-concurrency

Composable patterns for the Zustand + xstate layer with race-condition prevention as a first-class design goal.

**Key questions:** Taxonomy of the races actually faced (stale REST response vs fresher MQTT event, out-of-order messages, double-submit, optimistic-update rollback). Which are solved architecturally (state machines, single-writer stores, actor ownership) vs by tooling (lint rules, fast-check property tests, xstate model-based testing)? Blessed Zustand↔xstate composition patterns? Overlap between TanStack Query's request lifecycle management and 0060?

**Starting candidates:** xstate v5 actors, @xstate/store, Zustand middleware patterns, RxJS cancellation semantics, Effect, fast-check, @xstate/test.

### Deferred

#### 0090-horizon-scan

The "anything else" session: dead-code detection (knip), dependency architecture rules (dependency-cruiser, madge), MSW for API mocking in tests (ties into 0010's factories), type coverage, plus whatever the other tracks surface. Directory created only when scheduled.

## Shared evaluation rubric

Every report scores its shortlist against one rubric (kept in `templates/research-plan.md`), scored **strong / adequate / weak** with a sentence of evidence per score:

1. **License** — OSS, permissive preferred; copyleft flagged.
2. **Maintenance health** — release cadence, issue responsiveness, bus factor, backing org.
3. **TypeScript fit** — TS-first design, inference quality, no `any` leakage.
4. **Browser compatibility** — runs in the app's actual runtime (only for tooling that ships to the browser).
5. **Contract-format support** — which OpenAPI/AsyncAPI versions it parses (only for contract-touching tracks).
6. **Integration cost** — adoption effort against this stack; fits the pragmatic oxlint + ESLint-in-CI mix.
7. **Runtime overhead** — bundle size and hot-path performance for browser-shipped tooling; validation throughput for 0010.
8. **Output quality** — error messages, report formats, CI-friendliness.
9. **Escape hatch** — pain of swapping it out later; whether a thin facade contains the blast radius.

Weights vary by track and are declared up front in each track's `research-plan.md`.

## App profile (`facts/app-profile.md`)

Seeded as a fill-in checklist for the user. Contents:

- React, TypeScript, Node versions; build tool; package manager; monorepo or single package
- OpenAPI and AsyncAPI versions of the vendored contracts; rough counts of contracts/operations/message types; the tool currently generating TS types
- MQTT specifics: QoS levels used, topic-scheme shape, rough peak message rate
- CI provider; browser targets; test framework; approximate app scale; team size
- Existing team decisions/vetoes that would disqualify candidates

Reports cite these facts; missing facts become declared assumptions.

## Execution model

**Sequencing.** Wave 1 tracks are independent — any order or parallel, with 0010 first as the keystone. Wave 2 starts only after the user accepts 0010's report.

**Per-track flow** (each step is a commit scoped to that track: its directory plus any ledger entry or README row it flips):

1. Draft `research-plan.md` from the template. User skims — a lightweight "go" gate.
2. Survey executes as source-linked web research; with ultracode available, as a multi-agent workflow (parallel per-candidate investigators on the shared rubric, cross-candidate synthesis, completeness critic). Every report records its "as of" date and the versions evaluated.
3. Draft `report.md`, then prepend the ASD-STE100-style summary (see "Report summaries"). **User review is the real gate**; acceptance flips the README status and is recorded as a `D-####` ledger entry.

Questions that block a survey and need the user go through `intake/` (see "Intake convention"); `scripts/check-docs.ts` runs before each commit.

**Done criteria per track:** every key question answered or explicitly deferred with a reason; every shortlisted candidate scored on the rubric with evidence; recommendation states rationale and risks; every claim cites the app profile or declares its assumption; "what a spike would validate" section present; STE-style summary prepended at the top of the file; acceptance recorded in `DECISIONS.md`.

**Status tracking:** README index, one row per track: `planned → surveying → report drafted → accepted` (plus `deferred` for tracks parked until scheduled), plus the frontier pointer. Small commits to `main`, one track per commit.

## Out of scope

- Spikes, prototypes, or any code beyond repo scaffolding (docs, templates, directory structure, and the `check-docs.ts` validator).
- Changes to the application repo.
- Paid or self-hosted-server products in any shortlist.
- The horizon-scan track's content (scheduled separately).
