# 0150-message-inbox — research plan

**Status**: draft

## Goal

Decide whether, and in what shape, selected inbound MQTT streams should get the **inbox
pattern** — a durable record of a message's identity written in the *same* IndexedDB
transaction as the effect that message applies, so that at-least-once delivery becomes
effectively-once processing across page reloads and tab crashes. The track produces the
dedup-key design, the acknowledgement policy, the transaction scope, the retention and
recovery policy, and the adopt / adopt + wrap / build / skip verdict on the storage layer
underneath, applied **per topic, opt-in** rather than to all traffic. It starts from 0060's
accepted transport boundary (D-0015) and 0070's accepted single-dispatch ingress (D-0016), and
it may extend those seams but owns neither.

## What the confirmed session mode settles, and what it opens

The client runs **`clean: false` with a persisted clientId** (facts/app-profile.md,
2026-08-17). This **settles the question the plan was originally gated on**: under a
persistent session the broker retains session state and queues QoS 1 messages while the
client is disconnected, redelivering them on reconnect. Cross-reload redelivery is therefore
real, the accepted in-memory dedup guard cannot see it (it keys on packet identity, and
Packet Identifiers are per-session slots released for reuse on acknowledgement), and **skip
is no longer the default verdict**. It also falsifies 0060's assumption A-5 and 0070's A-6;
both accepted reports now carry dated in-place corrections.

It opens something sharper than duplication. **mqtt.js sends the PUBACK from inside the
`handleMessage` callback**, and the default handler completes immediately — so the
acknowledgement goes out before any asynchronous work the application starts has committed.
Under a persistent session the app therefore *appears* to have at-least-once delivery across
reloads while a crash between acknowledgement and effect loses the message permanently, with
no redelivery, silently. **`clean: false` without deferred acknowledgement buys the
appearance of durability without the substance.** Losing a message is worse than applying one
twice, and the inbox is the same mechanism that closes both windows — which makes the
acknowledgement seam, not the storage library, the track's centre of gravity.

(The mqtt.js acknowledgement-path claims above come from the plan-grounding sweep and were
verified twice against source. The report re-verifies them at the pinned version before
building on them.)

## The durable path is per topic; the acknowledgement path is not

IndexedDB round trips are wanted only for **selected topics** (user, 2026-08-18). This is the
right shape and it has a pre-authorized home: 0060's accepted `ChannelPolicy` already carries
`validate`, `direction`, `qos`, `sample`, and `reasonCode` per channel, and the spike that
refused per-row `dedupeKey` overrides said a second dedup policy should arrive as "a policy-row
addition, not an interface redesign". A durability flag on the policy row is exactly that, and
it should not require reshaping any interface.

**Selectivity buys frequency, not isolation.** `handleMessage` is a single client-wide hook,
serialized one message at a time across *every* topic, so a durable write performed inside it
to defer one topic's acknowledgement blocks the pump for all topics — the non-durable majority
included. Per-topic policy reduces how *often* the slow path executes, not its blast radius
when it does. The same is true of 0060's delivery queue, which is shared and sheds oldest.

**With the rate known, that blast radius is small.** The durable path's ceiling is **~5 msg/s
across 6 of roughly 40 topics** (user, 2026-08-18), against a ~50 msg/s aggregate. Five per
second is a 200 ms serialized budget per message. The only measured baseline in hand — 1,000
single-record transactions at 630.7 ms under relaxed durability, Chrome 92 — puts a
single-store commit at ~0.63 ms; a two-store commit with a real payload is plausibly 1.5–3 ms,
and 10–20 ms is a pessimistic allowance for main-thread contention. That is a **0.8% duty cycle
nominally and 10% pessimistically**, with the worst added latency for a non-durable message
queued behind one durable commit equal to a single transaction — 20 ms in the pessimistic case.

So head-of-line blocking is a bounded, measurable cost here, not a design blocker. **This
corrects the previous framing in this plan, which called it a first-class problem before the
rate was known** — that emphasis was wrong, and it changes which option leads in question 2.
Two orders of magnitude of headroom nominally, one pessimistically, means per-message deferral
is likely to fit without batching, and the report should treat *that* as the hypothesis to
disprove rather than reaching for a batching scheme first. The arithmetic above is a bound
computed from a third-party benchmark on a different engine version, not a measurement of this
application; the report measures before it commits.

## What MQTT 3.1.1 and keepalive 30 s settle, and what they hand to the broker

The client speaks **MQTT 3.1.1 (protocol version 4)** with **keepalive 30 s**, and there is no
session-expiry interval (user, 2026-08-18). Spec claims below were verified against the OASIS
text during plan grounding; the report re-verifies before building.

**Four questions this plan had open are now closed.**

1. **The acknowledgement seam is `handleMessage`, and nothing else.** `customHandleAcks` is a
   silent no-op below protocol version 5 and `manualAcks` does not exist. No alternative.
2. **A producer-supplied idempotency key must live inside the payload.** 3.1.1 has no User
   Properties and no Correlation Data, so there is no protocol-level slot to carry an id
   beside the message. Question 3's "producer-supplied key" branch means a change to the
   vendored AsyncAPI schemas — full stop, with no cheaper variant.
3. **Overlapping-filter copies are indistinguishable.** 3.1.1 has no Subscription Identifier,
   so when one publish matches two of the client's filters the copies arrive as identical
   PUBLISH packets on the same concrete topic. A content-hash key *cannot* separate them, and
   no protocol fix exists. If the app subscribes to overlapping filters, either the key comes
   from the payload or the filters must stop overlapping. This makes intake item e sharper
   rather than merely cautionary.
4. **Retention is not derivable after all.** This plan previously reasoned that the dedup
   window falls out of the broker's session-expiry interval. **That was wrong for this app**:
   3.1.1 has no session-expiry concept at any level — the spec states only lower bounds on
   session lifetime and leaves the upper bound to "administrative policies". So retention is a
   broker-configuration input, and on the common defaults it may be *unbounded*. The window
   must be chosen on other grounds and the reasoning written down.

**And one thing the keepalive value does not settle, but should worry us.** Thirty seconds
gives a 45 s server-side deadline ([MQTT-3.1.2-24], 1.5×), and only client-sent packets reset
it. That is an enormous margin against a 1.5–20 ms commit — thousands of times over — so
keepalive starvation from durable writes is quantitatively dead as a concern. But it is a
*tight* keepalive for a browser: Chromium throttles timers in a tab hidden more than five
minutes to roughly once per minute, and WebSocket activity is not on the exemption list. A
60 s timer cannot service a 45 s deadline, so a backgrounded tab plausibly disconnects,
resumes its session, and replays — repeatedly. The report should establish whether this
happens today, because if it does it is a live behaviour independent of the inbox, and
raising keepalive above ~120 s is the obvious mitigation.

## What "undefined" actually means, and why the broker product is now the critical unknown

Per-session queue depth and in-flight window were reported as undefined. **An unconfigured
setting is a default in force, not an absent limit**, and the defaults were measured across the
mainstream brokers during plan grounding. They do not merely differ in magnitude — they invert
in behaviour, which means the design cannot be finished without knowing the product:

| | queue depth | in-flight | session expiry | drops | retransmits while connected |
|---|---|---|---|---|---|
| Mosquitto | 1000 | 20 | never | newest | no (since 1.5) |
| EMQX | 1000 | 32 | 2 h | **oldest** | no (v5; v4 was 30 s) |
| HiveMQ CE | 1000 | 50 | never | newest | unverified |
| VerneMQ | 1000 online + 1000 offline | 20 | never | newest | **yes, 20 s** |
| AWS IoT | no published per-session depth | 100 (fixed) | 1 h | newest | **yes, up to 1 h** |

Four consequences, each of which changes code. **Overflow is silent**: the broker drops queued
messages with no protocol signal to the client, so the only way to notice is application-level
gap detection. **Drop direction inverts** — EMQX punches a hole in the middle of the record
while the others truncate the tail, and recovery logic differs completely. **Three brokers
retransmit under deferral**, turning the design's own latency into duplicate deliveries, which
the inbox must absorb idempotently on packet identity. **Session expiry splits the field**, so
"an abandoned tab queues forever" is true on three brokers and false on two — where the
opposite risk applies and a backgrounded tab silently loses its subscriptions and its queue.

## Key questions

1. **What is the inbox for?** Four goals are routinely conflated and want different stores,
   retention, read paths, and failure costs: (a) suppressing duplicate *application* of a
   redelivered message, (b) preventing *loss* in the acknowledged-but-not-applied window,
   (c) surviving reload without a full refetch, (d) operating offline. The charter named (a);
   the confirmed session mode makes (b) live and arguably primary, since its failure is
   silent and unrecoverable. The report ranks them and states what it deliberately does
   **not** buy, before any candidate is compared.
2. **Should acknowledgement be deferred until the effect commits — and at what cost to the
   topics that never asked for durability?** The track's hardest question, because the obvious
   answer collides with an accepted rule and because per-topic selectivity does not contain
   the damage. Deferring means doing durable work inside `handleMessage` before calling its
   callback, and 0060 Key question 5 requires the opposite — "never do slow work in
   `handleMessage`" — because the handler is serialized one-at-a-time and slow work starves
   the keepalive ([#1935](https://github.com/mqttjs/MQTT.js/issues/1935)), and because
   mqtt.js's README warns the client hangs if the callback is never called. At the stated
   ~5 msg/s the collision is much less severe than it looks — see the duty-cycle bound above —
   so the options are no longer evenly matched. The report tests them in this order:
   - **Defer per message, releasing acknowledgements through a single receipt-ordered queue.**
     *The leading candidate and the hypothesis to disprove* — but note the qualifier, which is
     load-bearing and was missing from this plan's previous draft. **[MQTT-4.6.0-2] requires a
     client to send PUBACKs in the order the corresponding PUBLISHes were received.** So
     deferring on the 6 durable topics while acknowledging the other 34 immediately is
     *non-conforming*, and so is letting two durable topics' independent IndexedDB commits
     release acks in completion order. The conforming shape is one ordered release queue over
     **all** traffic: a message's ack waits for every earlier message's ack, durable or not.
     The cost is bounded and small — a non-durable ack waits at most for the durable commits
     ahead of it, single-digit to low-tens of milliseconds — but it must be built in from the
     start, and it is the third and sharpest instance of *selectivity does not buy isolation*.
     Beyond that the semantics stay simple: atomicity at one-message granularity, no batch
     window to tune. Measure it rather than assuming, and measure what queues behind it.
   - **Never block; write durably after the ack.** Preserves the pump exactly as accepted and
     gives up on closing the loss window — the inbox then deduplicates but does not prevent
     loss. The fallback if measurement kills the option above, and a legitimate answer if
     question 1 ranks (a) above (b); either way it must be a stated choice, not an outcome
     arrived at silently.
   - **Batch commits and release acks together.** Now an *optimization*, not a necessity. The
     ordered-release queue above already gives the batching boundary for free, so this is a
     tuning knob on it rather than a separate design. Its ceiling: held acknowledgements consume
     the broker's in-flight window, which on MQTT 3.1.1 is broker policy rather than a protocol
     value — measured defaults are 20 (Mosquitto, VerneMQ), 32 (EMQX), 50 (HiveMQ CE), 100 (AWS
     IoT, fixed). At 5 msg/s a 20-deep window is about 4 seconds of deferral headroom before
     the broker stops sending. Reach for batching only if per-message deferral measures badly.
   - **A second connection for durable topics.** Structural isolation, at the price of running
     against 0070 A-6's "a **single** client connection (multiple connections would void the
     per-topic ordering baseline)" and, under `clean: false`, a second clientId and a second
     persistent session. Recorded as considered and **not** recommended: it buys isolation the
     duty-cycle bound says is not needed — though note it is the *only* option that genuinely
     escapes [MQTT-4.6.0-2]'s ordering constraint, since ack ordering is per-connection.

   Also settled by the protocol version: deferral is **legal but against the grain**.
   [MQTT-4.5.0-2] says a client must acknowledge "regardless of whether it elects to process"
   the message, and sets no deadline — so holding a PUBACK violates nothing, but 3.1.1 treats
   PUBACK as *received*, not *processed*, which is why broker behaviour under deferral diverges
   so sharply (question 5a).

   Protocol-version constraint on the seam itself: `manualAcks` does not exist in mqtt.js and
   `customHandleAcks` is silently a no-op below protocol version 5 — overriding `handleMessage`
   is the mechanism that works on both.
3. **What is the dedup key, given that MQTT supplies none — and where in the pipeline is it
   computed?** The protocol defines no application-visible unique message identifier, and the
   Packet Identifier cannot survive a reload, which is exactly the case a persistent session
   creates. The fork is a producer-supplied idempotency key (a contract change, sibling to
   D-0019's stamp request) versus a canonicalized content hash (which needs a canonicalization
   scheme and inherits question 4's hazards). Coupled to it: raw wire bytes before Ajv dedup
   malformed redeliveries and need no canonicalization but key on bytes the app may never
   understand, while the parsed object after Ajv needs canonicalization and opens a window
   where a validated-but-not-yet-recorded message is applied twice. This pair, not the storage
   library, is the track's decision.
4. **How does the key avoid suppressing deliveries that are not redeliveries?** Two are
   protocol-mandated and byte-identical to an already-processed message. Retained-message
   replay fires on every new subscription ([MQTT-3.3.1-6]), and `resubscribe: true` — now
   redundant against a retained session — re-triggers it on every reconnect, while 0060 treats
   reconnect as an unrecoverable gap that the retained message *repairs*. Overlapping topic
   filters may legitimately yield one copy per matching subscription (3.1.1 §3.3.5). A
   content-hash key silently swallows both. Also settled here: QoS 0 has no redelivery
   identity at all — measured in the 0060 spike (`check-2::cannot dedup QoS-0 packets`) — and
   is not queued by the broker, so the report says whether QoS 0 is in scope.
5. **Where does the replay backlog actually get lost — and it is not where this plan first
   said.** The earlier framing here was an uncapped backlog (~18,000 messages after an hour
   offline) overrunning 0060's delivery-queue bound of 256. **Both halves of that were wrong.**
   The backlog is capped at the broker by a default of ~1000, not unbounded; and deferred
   acknowledgement makes the broker's in-flight window (20–100) the flow-control point, so the
   client-side delivery queue never sees a flood at all. Per-message deferral therefore *fixes*
   the overrun rather than suffering it — the burst becomes a paced drain, roughly 3 s at
   3 ms/commit for a 1000-message backlog. **The real loss is upstream and silent**: the broker
   discards beyond its cap with no protocol signal, so the client cannot tell a complete replay
   from a truncated one. The report answers what detects that — application-level sequence-gap
   detection is the only mechanism available on 3.1.1 — and what the app does when it fires.
   Two sub-questions survive: whether 0060's oldest-first shedding is still defensible once
   some rows are durable (it is not, if the queue is ever reached), and what the drain costs
   the other 34 topics, which queue behind the same serialized pump and the same ordered ack
   release.
5a. **What does the broker actually do under deferral — and which broker is it?** Not a
   detail, and not answerable from the spec: [MQTT-4.4.0-1] requires redelivery *only* on
   reconnect, so in-connection retransmission is a broker choice. VerneMQ retransmits after
   20 s, NanoMQ after 10 s, AWS for up to an hour; Mosquitto and EMQX 5 do not. On a
   retransmitting broker the design's own commit latency manufactures the duplicates the inbox
   exists to suppress — self-inflicted, absorbed correctly, but it must be expected rather than
   discovered. Combined with the drop-direction and expiry splits in the table above, **naming
   the broker product and version is the single highest-value fact still missing** (intake item
   h). The report must not write a design that is only correct on one of them without saying so.
6. **Atomicity or durability — which guarantee is actually being bought?** These are not the
   same purchase on the stated browser matrix. IndexedDB *does* give all-or-nothing commit
   across object stores on both engines. It does *not* give a flush guarantee: Firefox has
   been relaxed since 40 and exposes no `durability` option below 126 (the stated floor is
   ~124), Chromium's default moved to relaxed in the 121–122 range, and Chrome's own
   documentation says `strict` "does not ensure that changes are actually written immediately
   to disk". The report states the guarantee in terms it can buy and must not sell power-loss
   safety. It also pins the shipped-behaviour source for the Chromium milestone rather than
   the pre-ship intent source — the two disagree, and both are in circulation.
7. **What is the transaction scope, and is there anything to be atomic with?** The pattern
   requires the key write and the effect write to share one transaction. If effects land only
   in in-memory Zustand/xstate state, there is **nothing to be atomic with** and the pattern
   degrades to a durable seen-set — a materially smaller design that the report must name as
   such rather than describe as an inbox.
8. **What does this cost at the durable topics' actual rate, and does it fit the accepted
   pipeline?** The rate that matters is the selected topics' share of the ~50 msg/s aggregate,
   not the aggregate — so the first job is to get that number (intake item b) rather than
   design against the worst case. The 0060 ingress pipeline is fixed and synchronous — one JS
   turn, riding Zustand's synchronous commit for atomicity — and was benched above 1k msg/s in
   Node; IndexedDB is asynchronous and its per-transaction cost is dominated by the durability
   flush (Nolan Lawson measured 1,000 single-record transactions at 10,456 ms strict versus
   631 ms relaxed in Chrome 92). So: one transaction per message, or batching? Batching trades
   atomicity granularity and latency for throughput and interacts directly with question 2's
   ack pacing. Note the prior deviation already on record — the kit *initiates* `cancelQueries`
   and writes in the same turn because awaiting it would break the one-turn invariant; an
   awaited IndexedDB commit is the same problem, larger. And note the measurement trap: a
   benchmark of the durable path alone understates the real cost, because what the connection
   actually pays is that latency multiplied by everything queued behind it.
9. **What is the read path at startup, and what may not happen until it finishes?** Does the
   dedup set load wholesale before the first dispatch, or does each message pay a `get` on the
   hot path? And must subscription be withheld until the load completes — because under a
   persistent session the broker's queued backlog begins arriving *immediately* on connect, so
   subscribing first means the replay races an empty dedup set and is processed as new. This
   is the exact failure the track exists to prevent, and the session mode makes it the common
   case rather than an edge case.
10. **What happens when the schema changes under a persisted store?** Contracts are vendored
    and change between deploys. Is the store tagged with a contract version and dropped
    wholesale on mismatch, stored as raw bytes plus a version tag, or a parsed projection that
    a schema change invalidates silently? Include the mixed-version deploy: two tabs on
    different app versions share one origin database and one `versionchange` event, which
    blocks until every other connection closes.
11. **Multi-tab: who owns the session, and who owns the inbox?** Two questions now, and the
    first may be a live defect rather than a design choice. MQTT requires a broker to
    disconnect an existing client when a second connects with the same ClientId
    ([MQTT-3.1.4-2]), so a *shared* persisted clientId means two tabs evict each other in a
    loop; a *per-tab* clientId instead leaves an abandoned persistent session queueing
    messages on the broker for every tab ever closed. Which it is, is intake item f. Second,
    tabs share one IndexedDB but hold independent connections, so one logical message can
    arrive twice into one shared store: Web Locks (crash-safe handoff, no lease or heartbeat,
    FIFO per resource) or BroadcastChannel? 0060 dismissed coordination on assumption A-13 and
    flagged it as reopening if tabs share a connection; durable storage is cross-tab by
    construction, so this track reopens it regardless. Note both an open IndexedDB connection
    and a held Web Lock forfeit back/forward-cache eligibility.
12. **Retention, compaction, reset, and poison recovery.** An earlier draft of this plan
    reasoned that the retention window is **derivable** from the broker's session-expiry
    interval, since the broker never redelivers beyond it. **That does not hold here**: MQTT
    3.1.1 has no session-expiry concept, and three of the five surveyed brokers never expire a
    persistent session by default — so on those, "how far back can a redelivery arrive?" has no
    upper bound and the window must be *chosen*. Choose it against the practical redelivery
    horizon and the storage budget, and write the reasoning down. The sizing is comfortable
    either way: at 5 msg/s, keys alone run about 1.2 MB per hour retained, so even a 24-hour
    window is ~28 MB, well inside quota. Storing payloads rather than keys alone changes this by
    whatever the payload size is, which is the number to get. Also decide what runs the pruning
    and when (a sweep on
    startup, a rolling delete, an index range), and the recovery half — persistence removes
    "reload fixes it" as an escape hatch permanently, so the report specifies what clears the
    inbox, who can trigger it, how a corrupt store is *detected*, and what the app does
    meanwhile. Storage eviction is whole-origin and LRU by default; `navigator.storage.persist()`
    prompts the user in Firefox.
13. **Which way is the design biased, and how is "working" distinguished from "never firing"?**
    The failure modes are asymmetric. A false negative reproduces today's behaviour. A false
    positive silently drops real work, raises no error, and now survives the reload that used
    to fix it. The design should be biased toward false negatives, and the report should
    require a dedup-hit counter on 0060's existing telemetry wire.
14. **Adopt or build, and what would an adopted engine be paid for?** Every surveyed sync
    engine either requires a companion server the front-end team does not control, gates the
    relevant storage behind payment, or states outright that duplicate handling is the
    application's problem. Per-topic scoping strengthens the "build on one thin wrapper"
    hypothesis further — a heavyweight engine is a poor trade for a store that only a fraction
    of traffic touches — so the report says explicitly what a heavier dependency would buy,
    and the burden of proof sits with adoption.
15. **Is the await-in-transaction footgun controlled by runtime error, by review discipline, or
    by static rule?** IndexedDB commits a transaction as soon as it goes unused within a tick,
    so awaiting any foreign promise inside one kills it. Dexie fails loudly
    (`PrematureCommitError`); `idb` documents the rule and leaves it to you. A third option
    exists and is already this repo's own mechanism: an oxlint `no-restricted-syntax` rule
    (D-0002, with D-0020's override-restatement rule applying). Very loose TypeScript
    strictness, high agent-authored churn, and ~50 engineers argue against the discipline
    option.
16. **How is the central claim falsified?** The claim is "a crash between applied and recorded
    cannot double-apply, and a crash between acknowledged and applied cannot lose."
    `fake-indexeddb` is an in-memory reimplementation of exactly the auto-commit and durability
    timing under test, so it can confirm the design's shape and never its guarantee. Neither
    prior spike reached a real browser. Does this track require a real-browser lane (0120's
    harness, or `@vitest/browser`), plus a real broker for the persistent-session replay path
    — and if neither is reachable under D-0001, does the report say plainly that its central
    claim is unverified?
17. **What does the policy row actually look like, and what combinations are illegal?** The
    concrete interface deliverable, and the place per-topic selection is declared. A durability
    field joins `validate`, `direction`, `qos`, `sample`, and `reasonCode` on 0060's accepted
    `ChannelPolicy`, per the pre-authorized "policy-row addition, not an interface redesign".
    Is it a boolean, or does it carry the key selector and the retention window with it? At
    least one combination is nonsense and should be unrepresentable rather than merely
    discouraged: **durable on a `qos: 0` row**, which has neither a redelivery to deduplicate
    nor an acknowledgement to defer, and which the broker does not queue across a
    disconnection. `direction: 'out'` rows are out of scope by the same reasoning. The report
    also says what a durable row means when its filter is a **wildcard** matching many concrete
    topics, given the ingress kit already treats an entity observed on a second concrete topic
    of the same wildcard stream while unstamped as a declaration error.

## Seams this track cites rather than restates

Owned elsewhere and **not reopened here**: the four-class error taxonomy and the quarantine
ring's shape (0060 KQ3/KQ4, D-0015); the fixed ingress pipeline order and its bounded-queue
shedding invariant (0060 spike design.md, O1/I9 — though question 5 may propose a change to
its sizing); the single-dispatch ingress and the monotonic guard's `(stream, entity)` keying,
which is **ordering authority and not identity** and must not be conflated with a dedup key
(0070 KQ7, D-0016); the abort/cancellation contract (D-0018); the `no-restricted-imports`
layering rule and its restatement requirement (D-0002, D-0020).

Two extension points are already pre-authorized, and the report should land inside them rather
than redesigning:

- The 0060 spike **refused a quarantine-store port with a named trigger**: "the IndexedDB
  escalation would be the second adapter — introduce the port then, not before." If this track
  recommends persistence, it *is* that trigger.
- The same design **refused per-row `dedupeKey` overrides** because no second dedup policy
  existed, while stating the shape a second one should take: "a policy-row addition, not an
  interface redesign." A durable key is that second policy. The acceptance bar 0070 set for
  extending the ingress is the yardstick: one selector per stream, no interface reshaping.

Three dedup layers already exist and are deliberately distinguished in writing — TanStack
Query's *request* dedup above the seam, 0060's protocol *redelivery* dedup at ingress, and the
kit's own LRU stage. A durable inbox is a fourth. The report says which it joins, replaces, or
subsumes.

**Carried in from the corrections**: 0060 A-5 and 0070 A-6 are falsified, and each accepted
report now says so in place. Two consequences land in this track rather than in a revision of
theirs — the reconnect-replay burst against the bounded queue (question 5) and the durable
identity the packet-identity guard cannot provide (question 3). Two do not: the 0060 spike's
hard-coded `readonly clean: true` config constant, and whether `resubscribe: true` should stay
on against a retained session. Both are flagged in 0060's correction and belong to whoever
reopens D-0015, if anyone does.

## What this track does not decide

The **outbound half** — durably queuing messages this client publishes — is out of scope. But
both halves land in one origin's IndexedDB, at one schema version, under one eviction, quota,
multi-tab, and worker decision. The report therefore **reserves** that space and makes those
shared calls once; otherwise the deferral becomes a rewrite. Also out of scope: reopening the
quarantine ring's no-replay rule for inbound contract violations (0060 KQ4), except to note
whether a durable store changes its cost; and the broker-side question of whether persistent
sessions should be used at all, which is an operations call, not a front-end one.

## Candidates

- build on raw IndexedDB — the build option; no dependency, full transaction control
- idb — https://github.com/jakearchibald/idb — ~1.5 kB promise wrapper that keeps the native
  `IDBTransaction` intact and surfaces per-transaction `durability`
- Dexie.js — https://github.com/dexie/Dexie.js — transaction zones, `PrematureCommitError`,
  `Dexie.waitFor()`; DB-wide durability only
- idb-keyval — https://github.com/jakearchibald/idb-keyval — single object store by design;
  assess whether a one-store inbox is a real shape or a disqualifier
- RxDB — https://github.com/pubkey/rxdb — open-core local-first DB; free tier caps open
  collections at 13
- TinyBase — https://github.com/tinyplex/tinybase — reactive store; its "transactions" are
  in-memory and its IndexedDB persister is a separate async layer
- @sqlite.org/sqlite-wasm — https://github.com/sqlite/sqlite-wasm — real SQL transactions over
  OPFS; Worker-only, and the full VFS needs COOP/COEP
- @electric-sql/pglite — https://github.com/electric-sql/pglite — Postgres in WASM over
  IndexedDB or OPFS; priced for bundle weight
- Web Locks API — leader election with crash-safe handoff, no heartbeat
- BroadcastChannel — cross-tab messaging; the lighter coordination primitive
- broadcast-channel — https://github.com/pubkey/broadcast-channel — polyfilled channel with a
  leader-election helper; four runtime dependencies
- tab-election — https://github.com/dabbott/tab-election — leader election; licence evidence is
  a manifest string only
- canonicalize — https://github.com/erdtman/canonicalize — RFC 8785 JSON canonicalization, the
  missing half of any content-hash key
- hash-wasm / @noble/hashes / `crypto.subtle` — hashing options for a content key; note
  `crypto.subtle.digest` is async and therefore hostile to the one-turn pipeline
- fake-indexeddb — https://github.com/dumbmatter/fakeIndexedDB — the vitest lane, with the
  caveat that it reimplements the timing under test
- aedes — the 0060 spike's real-broker harness, reused for persistent-session replay tests

**Prior art, not adoptable**: workbox-background-sync and Sentry's offline transport (both
outbox-shaped, neither deduplicates); y-indexeddb and automerge-repo's IndexedDB adapter
(content-keyed writes and compaction thresholds); MassTransit, NServiceBus, and Kafka's
transactional consumer (the pattern's invariants, all keyed on a producer-supplied id, and
Kafka's exactly-once works only because the consumer's position and its output land in the
same transaction — the structural point this track is testing in a browser).

**Eliminated on constraint, recorded so they are not re-surveyed**: Replicache (the shipped npm
tarball declares vendor terms, not an SPDX licence — already recorded by 0070); Zero,
PowerSync, ElectricSQL, LiveStore, Evolu (each requires a companion server or relay the
front-end team does not control); the `wa-sqlite` npm package (third-party republication, one
version from 2024, no `license` field in the manifest — the upstream repo is MIT and alive,
which is a provenance question, not a licence one); localForage (no transaction concept, last
published 2021); mqtt-localforage-store and its siblings (dead since 2019, and mqtt.js's Store
is for *outbound* in-flight packets — the inbound QoS 1 path never touches it).

**Flagged for an owner ruling, not eliminated**: Triplit ships AGPL-3.0-only, which the shared
rubric flags rather than bars.

## Survey verification notes

- **Re-verify the acknowledgement path at the pinned mqtt.js version before designing on it.**
  That PUBACK is sent from inside the `handleMessage` callback is the single load-bearing
  mechanism behind questions 1, 2 and 8. It was source-verified twice in the plan-grounding
  sweep, which is enough to plan against and not enough to build on.
- **Verify licence and provenance separately.** They are different checks and this candidate set
  contains a clean example of each failing alone: `@sqlite.org/sqlite-wasm` declares Apache-2.0
  in its manifest and ships no licence text anywhere, while `wa-sqlite` ships MIT text with no
  manifest field under a republisher's account. Neither is settled by GitHub's detected licence.
- **Do not price the free option with the vendor's benchmarks for its paid one.** RxDB's
  headline storage comparisons measure its free Dexie storage against its own premium storage.
  The directional claim (per-transaction overhead dominates, not data volume) is independently
  corroborated and safe; the specific numbers are marketing for a product the OSS-only rule
  puts out of reach.
- `idb` has had no publish and no repo push since 2025-05-07 — quiet, not archived, ~16M weekly
  downloads. Score it honestly against Maintenance health rather than waving it through on
  popularity.
- Chromium is rewriting IndexedDB on top of SQLite, citing poor reliability from the LevelDB
  backing store. Check where that lands relative to the app's Chromium floor before leaning on
  measured throughput figures from the old engine.

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | n-a |
| Integration cost | high |
| Runtime overhead | high |
| Output quality | medium |
| Escape hatch | high |

**Proposed tenth criterion — "Transaction fidelity", weighted high**: does the candidate
preserve, expose, or destroy a genuine multi-object-store atomic commit, and does it fail loudly
or silently when a transaction is broken? This is the axis the track exists to reason about and
no existing criterion carries it — Browser compatibility covers engine support, not whether a
wrapper's abstraction keeps the guarantee. Per **D-0023** a track-specific criterion needs its
own ledger entry and may not cite 0100 as precedent, so this is **proposed, not adopted**: it is
a ruling for the go gate.

## Facts needed

Session mode is **answered** (`clean: false`, persisted clientId — facts/app-profile.md). The
remainder are raised in
[intake/2026-08-17-0150-inbox-facts.md](../../intake/2026-08-17-0150-inbox-facts.md), plus the
standing gaps in `facts/app-profile.md` (the whole Contracts section; reconnect frequency,
which the session mode makes more consequential than it was). The four that now gate the
survey rather than colour it:

- **Which topics get the durable path, and what share of the ~50 msg/s do they carry?** (item
  b) — now the track's primary input rather than one of several. It is the selection rule that
  goes on the policy row, it sets the rate every cost estimate is built on, and paired with
  "are their effects idempotent?" it decides how much of the design is needed at all.
- **Is the persisted clientId shared across tabs or per-tab?** (item f) — the two readings have
  opposite failure modes and one of them is a live defect independent of this track.
- **Is there a stable per-message identifier in any payload today**, and can one be added?
  (item c)
- **Where do effects currently land** (item d) — durable storage, or in-memory state only? If
  in-memory only, there is nothing for the key write to be atomic with.
