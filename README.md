# App Tooling Research

Survey + recommendation research for extracting purpose-built tooling out of an existing
TypeScript React app (React, Zustand, xstate, mqtt.js over WSS, REST APIs with reason-code
JSON bodies, vendored AsyncAPI/OpenAPI contracts, oxlint).

**Spec:** [docs/superpowers/specs/2026-08-13-tooling-research-program-design.md](docs/superpowers/specs/2026-08-13-tooling-research-program-design.md)
· **Decisions:** [DECISIONS.md](DECISIONS.md)
· **App facts:** [facts/app-profile.md](facts/app-profile.md)

> **Frontier:** 0150-message-inbox chartered (D-0038) and its gating fact answered — sessions are `clean: false` with a persisted clientId, which falsifies 0060 A-5 and 0070 A-6 (both corrected in place) and makes 0150 live rather than a skip. Scope, volume and protocol now known — ~6 of ~40 topics at ~5 msg/s, MQTT 3.1.1, keepalive 30 s — so per-message ack deferral fits at a ~1–10% duty cycle, but [MQTT-4.6.0-2] forces all acks through one receipt-ordered release queue, and the replay burst turns out to be broker-capped and paced rather than the 18k flood first feared. The broker is **ActiveMQ Classic**, which maps JMS persistence to MQTT QoS with the ternary inverted (AMQ-7045, open since 2018) — but that branch is reached only when `ActiveMQ.MQTT.QoS` is absent, and **the 6 topics are fed by MQTT clients**, so the defect is off this path and the track is viable — *today*. **One or more producers may drop MQTT support**, which puts them back on it with no visible break: SUBSCRIBE still succeeds, the durable subscription still exists, messages still arrive, and only offline retention silently stops. So the premise is a runtime property, not a settled fact, and the design splits into a **client-owned guarantee nobody can revoke** (effect and identity commit atomically) and a **broker-dependent one that can lapse** (offline retention) — with a `packet.qos` assertion at ingress to make the lapse visible (new question 18). All ~6 candidates are QoS 1 today, so the durable path covers the set as drafted — but the other ~34 are a **mix of QoS 1 and 0**, and ActiveMQ makes a durable subscription out of *every* QoS-1 subscription on a `clean: false` session. Those topics are **already durable today**, accumulating offline and pinning journals with no inbox and no reaping, so the per-device liability is N × (6 + an unknown), every 6-based sizing figure is a floor, and the replay burst draws on the ~45 msg/s outside the durable path. Demoting them is cheap in the client and strands the old `1:<topic>` subscription forever, since ActiveMQ keys durable subscriptions on `(clientId, "<QoS>:<topic>")` — audit and decommissioning are one procedure. Two ship-blockers belong to whoever owns the broker: abandoned durable subscriptions are never reaped (`offlineDurableSubscriberTimeout` defaults -1, the reaper is never constructed) and a full store blocks every publisher indefinitely. The clientId is device-scoped on a **static roster**, so in steady state nothing new is orphaned and the exposure concentrates at provisioning and decommissioning — which withdraws the `offlineDurableSubscriberTimeout` recommendation, since reaping a legitimately-absent client silently discards the backlog this work exists to preserve; a decommissioning procedure targets the real failure instead. Cross-reload durability genuinely works, so 0150 keeps both halves of its value. Calls waiting: **how many of the other ~34 topics are QoS 1, and whether any need offline retention** (intake 0150 item b — it sizes a liability the app is already carrying); **the producers' publish QoS** (same item, one empirical check: subscribe at QoS 1, publish through the real path, read `packet.qos`); **what enforces the single-connection invariant** (item f — link stealing is on, so two tabs on one device would fight); the ActiveMQ version (CVE floor 6.2.4+); and whether any of this reopens D-0015/D-0016. Next: the user's go gate on six drafted plans — 0100 (revised), 0110–0150 — plus the 0150 rubric ruling D-0023 requires. Open elsewhere: the build-tool fact (intake 0090 item a), the 0100 agentic-churn intake, the D-0003 boundary on already-licensed tools (intake supply-chain item d), the D-0019 ordering stamp with the contract owners, and two passes deferred rather than dropped — the one-off lifecycle FMEA (D-0036) and the citation staleness sweep (D-0034).

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
