# App Tooling Research

Survey + recommendation research for extracting purpose-built tooling out of an existing
TypeScript React app (React, Zustand, xstate, mqtt.js over WSS, REST APIs with reason-code
JSON bodies, vendored AsyncAPI/OpenAPI contracts, oxlint).

**Spec:** [docs/superpowers/specs/2026-08-13-tooling-research-program-design.md](docs/superpowers/specs/2026-08-13-tooling-research-program-design.md)
· **Decisions:** [DECISIONS.md](DECISIONS.md)
· **App facts:** [facts/app-profile.md](facts/app-profile.md)

> **Frontier:** 0150-message-inbox chartered (D-0038) and its gating fact answered — sessions are `clean: false` with a persisted clientId, which falsifies 0060 A-5 and 0070 A-6 (both corrected in place) and makes 0150 live rather than a skip. Scope, volume and protocol now known — ~6 of ~40 topics at ~5 msg/s, MQTT 3.1.1, keepalive 30 s — so per-message ack deferral fits at a ~1–10% duty cycle, but [MQTT-4.6.0-2] forces all acks through one receipt-ordered release queue, and the replay burst turns out to be broker-capped and paced rather than the 18k flood first feared. The broker is **ActiveMQ Classic**, which changes the premise: it maps JMS persistence to MQTT QoS with the ternary inverted (AMQ-7045, open since 2018), so messages from any non-MQTT producer arrive at QoS 0 with no acknowledgement to defer and no durable subscription — making "who publishes to those 6 topics" the question the track's viability now rests on. Two ship-blockers belong to whoever owns the broker: abandoned durable subscriptions are never reaped (`offlineDurableSubscriberTimeout` defaults -1, the reaper is never constructed) and a full store blocks every publisher indefinitely. The clientId is device-scoped with one connection at a time, so orphaned durable subscriptions accrue at device rate rather than tab rate — still real, since one never-acking subscriber pins every KahaDB journal file written since, across **all** destinations, until persistent producers block broker-wide, but the fix is now one broker-side setting (`offlineDurableSubscriberTimeout`) rather than an application redesign. Cross-reload durability genuinely works, so 0150 keeps both halves of its value. Calls waiting: **what enforces the single-connection invariant** (intake 0150 item f — link stealing is on, so two tabs on one device would fight); who publishes to the 6 topics, which AMQ-7045 makes decisive; the ActiveMQ version (CVE floor 6.2.4+); and whether any of this reopens D-0015/D-0016. Next: the user's go gate on six drafted plans — 0100 (revised), 0110–0150 — plus the 0150 rubric ruling D-0023 requires. Open elsewhere: the build-tool fact (intake 0090 item a), the 0100 agentic-churn intake, the D-0003 boundary on already-licensed tools (intake supply-chain item d), the D-0019 ordering stamp with the contract owners, and two passes deferred rather than dropped — the one-off lifecycle FMEA (D-0036) and the citation staleness sweep (D-0034).

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
| 0150-message-inbox | Durable inbox pattern for selected inbound MQTT streams, over IndexedDB transactions (D-0038) | planned |
| 9900-process-design | **Meta:** improve this repo's own templates, scripts, and process conventions (D-0025) | accepted |
