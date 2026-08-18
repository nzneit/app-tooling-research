# App Tooling Research

Survey + recommendation research for extracting purpose-built tooling out of an existing
TypeScript React app (React, Zustand, xstate, mqtt.js over WSS, REST APIs with reason-code
JSON bodies, vendored AsyncAPI/OpenAPI contracts, oxlint).

**Spec:** [docs/superpowers/specs/2026-08-13-tooling-research-program-design.md](docs/superpowers/specs/2026-08-13-tooling-research-program-design.md)
· **Decisions:** [DECISIONS.md](DECISIONS.md)
· **App facts:** [facts/app-profile.md](facts/app-profile.md)

> **Frontier:** the meta track 9900 (D-0025) has a drafted report and **all seven gating rulings are resolved** (D-0028 to D-0034, 2026-08-17) — the report now awaits only the user's acceptance decision. It recommends **build, at rung 0, and change less than we could**; D-0029 redefined the ceiling's unit as a logical workflow step, D-0033 restored the gate review as a named stage at net-zero cost, and D-0031 put the existing gate into CI. Five plans still await the user's go gate: 0100 (revised), 0110–0140. Open elsewhere: the build-tool fact (intake 0090 item a), the 0100 agentic-churn intake, the D-0003 boundary on already-licensed tools (intake supply-chain item d), and the D-0019 ordering stamp with the contract owners.

## How it works

Track numbers run in two bands: **00xx–09xx** for tracks about the application's tooling,
and **99xx** for meta tracks about this repo's own research machinery (D-0025).

Each track lives in `tracks/NNNN-<slug>/` and moves through one lifecycle:
`research-plan.md` (key questions, candidates, rubric weights) → `report.md` (source-linked
survey + recommendation: **adopt / adopt + wrap / build / skip**, opening with an
ASD-STE100-style summary) → later `spikes/`. Track statuses: `planned → surveying →
report drafted → accepted`; `deferred` marks a track parked until scheduled. Acceptance is
recorded as a `D-####` entry in [DECISIONS.md](DECISIONS.md). Questions only the user can
answer go through dated files in `intake/`. Run `node scripts/check-docs.ts` before
committing.

Accepted tracks may run **spikes**: standalone, exact-pinned npm packages under
`tracks/<track>/spikes/<slug>/`, scaffolded by `node scripts/new-spike.ts <track-dir> <slug>`
and isolated per the [spike harness spec](docs/superpowers/specs/2026-08-14-spike-harness-design.md).
Each spike designs its interfaces first (`design.md`, per the vendored
[codebase-design skill](.claude/skills/codebase-design/SKILL.md)) and records go/no-go results
in `findings.md` — the durable artifact.

## Tracks

| Track | Scope | Status |
|---|---|---|
| 0010-contract-pipeline | Contracts → TS types + runtime validation schemas + factories/mocks; live validation of all contracted inbound messages (keystone) | accepted |
| 0020-complexity-metrics | Cyclomatic + cognitive complexity analysis and reporting | accepted |
| 0030-duplication-detection | Near-duplicate code detection and de-duplication reporting | accepted |
| 0040-hooks-linting | React hooks anti-pattern lint coverage beyond the basics | accepted |
| 0050-logging | Config- and runtime-controllable logging facade (sinks, levels, throttling) | accepted |
| 0060-transport-abstraction | Unified typed MQTT+REST boundary; validation choke point (Wave 2 — starts from 0010's accepted report) | accepted |
| 0070-state-concurrency | Composable Zustand+xstate patterns; race-condition prevention (Wave 2 — starts from 0010's accepted report) | accepted |
| 0090-horizon-scan | "Anything else" discovery session | accepted |
| 0100-type-strictness | Raise + enforce TypeScript strictness against high-volume agentic code churn (D-0021) | planned |
| 0110-react-compiler | Whether and how to adopt the React Compiler on React 18.3.1 (D-0022) | planned |
| 0120-e2e-testing | End-to-end browser testing of the live MQTT-over-WSS and reason-code REST flows (D-0022) | planned |
| 0130-accessibility-linting | Static + automated accessibility checking for the React UI (D-0022) | planned |
| 0140-supply-chain | Dependency vulnerability and supply-chain auditing (D-0022) | planned |
| 9900-process-design | **Meta:** improve this repo's own templates, scripts, and process conventions (D-0025) | report drafted |
