# App Tooling Research

Survey + recommendation research for extracting purpose-built tooling out of an existing
TypeScript React app (React, Zustand, xstate, mqtt.js over WSS, REST APIs with reason-code
JSON bodies, vendored AsyncAPI/OpenAPI contracts, oxlint).

**Spec:** [docs/superpowers/specs/2026-08-13-tooling-research-program-design.md](docs/superpowers/specs/2026-08-13-tooling-research-program-design.md)
· **Decisions:** [DECISIONS.md](DECISIONS.md)
· **App facts:** [facts/app-profile.md](facts/app-profile.md)

> **Frontier:** Wave 3 accepted (D-0018–D-0020) — next: raise the ordering-stamp requirement (D-0019) with contract owners, or schedule the 0090 horizon scan.

## How it works

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
| 0090-horizon-scan | "Anything else" discovery session | deferred |
