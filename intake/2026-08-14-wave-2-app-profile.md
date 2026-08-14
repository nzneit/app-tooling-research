# 2026-08-14: Wave 2 app-profile questions (intake)

**Status**: open
**Owner**: app owner

Wave 2 survey reports (0060-transport-abstraction, 0070-state-concurrency) were drafted
against an unfilled facts/app-profile.md; each report declares its assumptions inline. This
file collects the decision-relevant assumption clusters as questions, one lettered item per
cluster, so they can be answered in one pass. Resolving: fill in facts/app-profile.md and
flip this Status to resolved.

## a — can the vendored contracts carry a server-issued monotonic ordering stamp?

Can a sequence/version field be added to mutable-entity messages in the vendored AsyncAPI
payload schemas (and ideally the matching REST bodies)? This is 0070's pivotal
stale-vs-fresh requirement (Key question 7, assumption A-1): without it the client cannot
decide stale-REST-vs-fresher-MQTT by construction, and the interim rule is
invalidate-don't-set with extra round-trips. 0070 raises this as a formal contract
requirement flowing up to 0010 and 0060.

2026-08-14 update — elevated to formal requirement **D-0019**, now with measured evidence
from the 0070 spike (tests: ingress-race both arms, replay-and-pinning, bridge
stamped-fast-path): unstamped, the client cannot even observe the lost race; stamped, the
guard rejects the stale write in every explored interleaving. Flexibility for partial
contract control: adoption is per-stream opt-in (one `stamp` selector), any existing
monotonic field on both legs qualifies as the stamp, and uncontrolled contracts stay on
invalidate-don't-set indefinitely.

## b — MQTT reconnect frequency and offline-queue expectations

Is reconnection an occasional network blip or a persistently flapping connection, and does
the app need an offline publish/message queue beyond mqtt.js's unbounded default? 0060's A-14
assumes low, episodic reconnects sized to mqtt.js's default `reconnectPeriod` (1000 ms) and
the boundary's bounded give-up policy; a flapping-connection environment needs that policy
re-tuned.

## c — peak message rate and topic scheme

What is the actual peak inbound MQTT message rate, and what does the real topic scheme look
like? Carried unanswered from the Wave 1 intake (0010's cluster c), this is now load-bearing
for 0060's per-message overhead budget (A-4), the policy table's sampled-validation tier (Key
question 8), and 0070's guard/dispatch cost model (A-7) — all currently assumed ≤ ~1k msg/s.

## d — team stance on RxJS and Effect

Does the team hold any preference, prior investment, or veto against RxJS or Effect? Both
0060 (A-9) and 0070 (A-10) assume no team veto exists and that the rejection of both
libraries rests on rubric/evidence grounds alone, not measured team sentiment or existing
statechart/property-testing experience.

## e — TypeScript version

What TypeScript version does the app run? xstate v5 only requires ≥5.0, but TanStack Query's
stated support window raises the effective floor to ≥5.4 (0070's A-3; 0060's A-2 is corrected
to note the same). A version below 5.4 would need resolving before TanStack Query lands.

## f — bundle budget for the TanStack Query + boundary additions

Is there a hard bundle-size budget, and does it tolerate the ~17 kB gz TanStack Query adds
(0060's A-7 assumes yes, with the incumbent xstate/mqtt.js deps at ~0 marginal cost)? A
stricter budget would force re-scoring TanStack Query against the rubric.

## g — test framework

Is the test framework jest, vitest, or something else? 0070's A-9 assumes vitest for the
`fc.scheduler` interleaving-test lane and the `@fast-check/vitest`/`@fast-check/jest` adapter
choice; raw `fc.assert` and the `xstate/graph` model-based lane work under any runner, so this
is non-blocking but decides which adapter package (if any) is added.

## h — xstate and Zustand major versions in production

Is the app's xstate already on v5 (actors/`emit`/`setup`), and can it move within-v5 to
≥5.20.0? Is Zustand on v4 or v5? 0060's A-1 and 0070's A-4/A-5 all depend on this — a v4
xstate app invalidates the "zero marginal dependency cost" argument that the whole
architecture rests on, and `xstate/graph` needs ≥5.20.0.

## i — React version, specifically whether React 19 is in play

0070's A-2 positions `useOptimistic` as conditional on React 19; below it the idiom is moot
and optimistic UI stays entirely in the Key question 5 rollback unit.

## j — mqtt.js session and QoS settings in production

Does the app run `clean: true` sessions, QoS 0/1, `resubscribe: true`, and
`queueQoSZero: true` (mqtt.js's documented defaults)? 0060's A-5 and 0070's A-6 assume
these hold; a `clean: false` or QoS 2 deployment changes the dedup-guard and gap-fill design
in both reports.

## k — backend idempotency-key support

Does the backend support Stripe-style idempotency keys for mutation endpoints? 0070's A-13
notes this is unknown; without backend support, double-submit protection stands entirely on
the client-side finite-state fix (no enabled transition while `submitting`).

## l — multi-tab / multi-connection requirement

Can the app run multiple tabs sharing one logical session, and if so must they coordinate
over a single MQTT connection? 0060's A-13 assumes no such requirement, which is the grounds
for dismissing broadcast-channel; a multi-tab requirement reopens that candidate and affects
0070's "single client connection" ordering baseline (A-6).
