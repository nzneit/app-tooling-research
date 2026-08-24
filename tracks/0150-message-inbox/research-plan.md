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

## The broker is ActiveMQ Classic, and it changes the premise

**None of the native-broker defaults apply.** ActiveMQ Classic is a JMS broker with an MQTT
transport layered over it, so the earlier survey of Mosquitto/EMQX/HiveMQ/VerneMQ/AWS defaults
is superseded wholesale for this app; that comparison is retained only in the intake file as
the record of why the product mattered. Findings below were read from `apache/activemq` source
and Apache JIRA and then put to an adversarial refuter, which overturned two of them. Claims
were checked against release tag `activemq-6.3.1`, not only `main` (an unreleased
`6.4.0-SNAPSHOT`); the report re-pins citations to whichever tag the operator actually runs.

### The premise question: answered — the producers are MQTT clients

**Answered 2026-08-18 (user): the 6 topics are fed by MQTT clients.** This clears the
existential risk the section below was written around, and the track is viable on its own terms.
The hazard was **AMQ-7045**: `MQTTProtocolConverter` derives a delivered message's QoS from the
JMS persistence flag with the ternary **inverted** —
`qoS = message.isPersistent() ? QoS.AT_MOST_ONCE : QoS.AT_LEAST_ONCE` — and that line is reached
only when the JMS property `ActiveMQ.MQTT.QoS` is **absent**, which is the case for every message
originating from an OpenWire/JMS, STOMP, AMQP, or Camel producer. An inbound MQTT PUBLISH goes
through the converter, which sets that property, so the inverted branch is never taken for these
topics. AMQ-7045 remains open and unfixed in 6.3.1; it simply does not sit on this path. The
original question and the reasoning are kept above rather than deleted, because the finding
still governs any *future* topic sourced from a JMS service — including one added later to this
same policy row.

**The residual.** The `ActiveMQ.MQTT.QoS` property carries the **publisher's** QoS, so it moves
the hazard one hop upstream rather than removing it: an MQTT producer publishing at **QoS 0**
yields a `NON_PERSISTENT` JMS message, which is not written to the store for an offline durable
subscriber and is delivered at QoS 0 regardless of what the browser subscribed at. The failure
mode is then identical to AMQ-7045's — nothing to acknowledge, nothing retained — but the cause
is a knob rather than a decade-old broker defect. This is a source-level inference from the same
converter reading; confirm it empirically alongside the delivered-QoS check.

### The answer is conditional and revocable, so the design must treat it that way

**A fact supplied 2026-08-18 changes the status of everything above from a settled premise to a
runtime property: one or more producers may drop MQTT support in future**, at which point their
messages take the AMQ-7045 path after all.

*(An earlier revision of this section read a user statement as "some of the candidate
subscriptions are QoS 0" and built a promote-or-exclude framing on it. **That was a misreading
and this is the correction**: all ~6 durable-path candidates are QoS 1 today, so the durable path
covers the set as drafted and no promotion is needed. The statement was about the wider ~40, and
its real consequence is recorded above under the tier boundary — where it is a larger finding
than the misreading was.)*

The second fact is the serious one, because **the degradation is silent**. A producer that
migrates to JMS, AMQP, STOMP or Camel does not break the connection, the subscription, or the
message flow. SUBSCRIBE still succeeds at QoS 1. The durable JMS subscription still exists — it
is created from the **requested** QoS, which has not changed. Messages still arrive and still
decode. What stops is retention while the tab is closed, and what disappears is the PUBACK there
was to defer. An inbox on that topic keeps deduplicating and quietly stops preventing loss, and
nothing anywhere reports it. That is the worst failure shape available: a guarantee that lapses
without an error.

**Two consequences for this track.**

- **The value splits into two guarantees with different owners, and the design must not let one
  take the other down with it.** *Guarantee A, client-owned and permanent*: the effect and its
  identity record commit in one IndexedDB transaction, so a crash between applying and recording
  cannot double-apply. This holds at any QoS, under any producer technology, forever — no
  upstream party can revoke it, and it still earns its keep against retained-message replay
  ([MQTT-3.3.1-6]) and overlapping-filter duplicates (§3.3.5). *Guarantee B, broker-dependent and
  revocable*: messages published while the tab is closed are retained and redelivered. This needs
  QoS ≥ 1 end to end and dies with a producer migration. The report should state which guarantee
  each recommendation buys, and a design that becomes incoherent when B lapses is the wrong
  design.
- **Delivered QoS must be asserted at runtime, not assumed at design time.** mqtt.js surfaces
  `packet.qos` on every incoming message, so the boundary can compare delivered QoS against the
  policy row's declared QoS on the spot. Declared `durable` with `qos: 1`, delivered `qos: 0` is
  exactly the silent lapse above, and it becomes a detectable, reportable condition that fits
  0060's existing four-class taxonomy and quarantine ring rather than needing new machinery.
  Question 18 owns the shape.

### Subscription QoS is part of the durable subscription's identity, not a tuning knob

**This follows from a fact already established and deserves stating on its own**, because the
first fact above invites exactly the change that trips it. ActiveMQ keys durable topic
subscriptions on `(clientId, "<QoS>:<topic>")` — the QoS is *in the key*. So promoting a topic
from QoS 0 to QoS 1 to put it on the durable path does not modify a subscription; it **creates a
new one**. And the reverse is worse: demoting a topic that was running at QoS 1 leaves the old
`1:<topic>` durable subscription behind, still registered, still pinning journal files, and
nothing reaps it (`offlineDurableSubscriberTimeout` is -1 and the reaper `Timer` is never
constructed). That is the orphan mechanism firing on a **configuration change** rather than a
device retirement — across a static roster, once per device. Any QoS change to a durable-path
topic therefore needs the same decommissioning procedure a retired client does.

One adjacent consequence worth carrying: `canOptimizeOutPersistence()` lets the broker skip the
store entirely for a persistent publish to a topic with **no durable subscribers**. Until the
first client has subscribed durably, a QoS-1 publish to one of these 6 topics is not retained by
anyone. That is a cold-start property of provisioning, not of steady state, and it belongs with
the `retroactive(true)` provisioning question below.

### What holds, now that the producers are MQTT clients

- **Durability is per-subscription and QoS-gated.** A durable JMS subscription is created only
  when `cleanSession=false` **and** clientId is non-null **and** requested QoS ≥ 1. Every QoS-0
  subscription therefore carries no session state and **is not restored on reconnect** — a
  deviation from MQTT 3.1.1 §3.1.2.4. The client must re-SUBSCRIBE everything on every reconnect
  or go silently deaf on its QoS-0 topics. **This reverses what an earlier draft of this plan
  said**: `resubscribe: true` is not redundant here, it is *required*, and the same wrong claim
  was written into 0060's report annotation and has been corrected there.
- **The two tiers have opposite loss semantics.** The shipped
  `constantPendingMessageLimitStrategy limit="1000"` applies only to non-durable
  `TopicSubscription`s, so QoS-0 topics silently discard oldest beyond prefetch+1000, while
  durable ones never drop — they accumulate against disk instead.
- **The tier boundary is QoS, not intent — and that is the finding.** Corrected 2026-08-18:
  earlier drafts of this plan wrote "the 6 QoS-1 topics" against "the other ~34 QoS-0
  subscriptions", which is wrong. All ~6 durable-path candidates are QoS 1 **and so are an
  unknown number of the other ~34**, which are a mix. ActiveMQ does not know which subscriptions
  this app wanted to be durable; it creates a durable JMS subscription for *every* QoS-1
  subscription on a `clean: false` session. So the app is **already paying for durability it
  never asked for** on those topics — offline accumulation, journal pinning, no reaping, no
  `constantPendingMessageLimitStrategy` ceiling — and has been since the session mode was set.
  Three consequences land in this track rather than outside it:
  - **The orphan liability is not N × 6.** It is N × (6 + however many of the ~34 are QoS 1).
    Every sizing figure in this plan that counted 6 subscriptions per device is a floor, not an
    estimate, until that count is known.
  - **The reconnect replay burst is correspondingly larger** (question 5). The 6 topics carry
    ~5 msg/s of the ~50 msg/s aggregate; the incidental durable subscriptions among the other
    ~34 draw from the remaining ~45 msg/s and replay into the *same* bounded queue and the same
    receipt-ordered ack release. The burst competes with the path that needs it, and the input
    is up to an order of magnitude larger than the 6-topic figure implies.
  - **Those topics have no inbox.** Replayed messages on them are applied with only the
    per-connection packet-identity guard, which by construction cannot span the reconnect that
    caused the replay. Whatever double-apply hazard motivates this track exists there too, today,
    unmitigated — the report should say so plainly even though fixing it is out of scope.

  The obvious remedy — **demote any QoS-1 subscription among the ~34 that does not need offline
  retention** — is cheap in the client and runs straight into the identity trap below: the
  stranded `1:<topic>` durable subscription outlives the demotion and pins the journal forever.
  Audit and decommissioning are one procedure, not two.

**Sized 2026-08-18: roughly 75% of the other ~34 are QoS 1** (user). The arithmetic below assumes
message rate tracks topic count, which is a guess and is the first thing the survey should
replace with a measurement — but the order of magnitude is what matters and it is not close.

**How many of them genuinely need offline retention is not known**, and D-0039 rules the
planning posture: **size for all, design for none.** Sizing for all is safe and costs only
arithmetic — it is what makes the table below the planning figures rather than the 6-topic
numbers they replace. Designing for all is *not* safe: it builds machinery for a case the person
closest to the app expects does not exist, and it forecloses the demotion audit, which is the
cheapest remedy available. The report treats "probably none" as a hypothesis with a named test,
never as a fact. **The test**: "does this topic need offline retention?" is unanswerable from
memory, but it reduces to "**is this topic's effect accumulating or replacing?**" — a replacing
effect needs none, because the first message after reconnect carries the current value; only an
accumulating effect does. That is the same idempotence question this plan already asks of the 6,
and against the other ~26 it is a code-reading task rather than a recall task.

| | topics | rate | durable subs per device |
|---|---|---|---|
| inbox path (intended) | ~6 | ~5 msg/s | 6 |
| incidental durable | ~26 | ~34 msg/s | ~26 |
| QoS 0 (genuinely non-durable) | ~8 | ~11 msg/s | 0 |
| **total durable** | **~32** | **~39 msg/s** | **~32** |

**The unintended durable path is about eight times the intended one**, on every axis. Three
figures in this plan are superseded by that: per-device durable subscriptions go from 6 to ~32;
outstanding prefetch goes from 6 × 100 = 600 to ~32 × 100 = **~3,200** per device, which is much
closer to the ~32k figure this plan congratulated itself on avoiding; and offline accrual runs at
~39 msg/s rather than 5, so **one hour offline is ~140,000 messages per device**, not ~18,000.
On reconnect roughly an eighth of those — the inbox topics' share, ~18,000 per offline hour —
need an IndexedDB commit before their acknowledgement can be released, which at 3 ms/commit is
about a minute of paced drain per hour offline, and at 20 ms is closer to six. Bounded and
survivable, but it is a drain measured in minutes rather than the ~3 s the 1000-message figure
suggested.
- **Deferral gets real backpressure, and is safe from retransmission.** Durable MQTT
  subscriptions take `DEFAULT_DURABLE_TOPIC_PREFETCH` = **100**, per subscription — so at most
  6×100 = 600 outstanding, not the feared ~32k (which applies only to QoS-0/clean-session
  subscriptions). And ActiveMQ performs **no in-connection retransmission**: there is no timer
  on the delivery path, so the broker will never grow impatient mid-commit. Redelivery happens
  only on reconnect, in producer order. `redeliveryPolicy`/`maximumRedeliveries` do not apply
  to the MQTT path at all.
- **`sessionPresent` is hardcoded to 0** in the CONNACK codec, on every connection. No recovery
  logic may read it.
- **DUP is a hint, not a guarantee.** The refuter overturned an investigator finding here: DUP
  *is* set on reconnect redelivery, via a per-clientId packet-id map — but only within one
  broker process lifetime, only under a 5000-entry LRU, and only until some connection uses
  `cleanSession=true`. Useful as a corroborating signal; never as the dedup mechanism.

### The orphan liability: real, but at device scale rather than tab scale

**The clientId is device-scoped, with a single connection using it at a time** (user,
2026-08-18). An earlier revision of this plan read a prior statement as *per-tab minting* and
built two sections on that reading; **that was a misreading and this section is the correction**.
One device means one clientId, one set of 6 durable subscriptions, reused across tabs and
reloads — so orphans accrue per departed *device*, not per tab opened.

**Refined again 2026-08-18: the roster is static** — multiple clients, a fixed number of them,
each with a unique persistent clientId. That is the most favourable shape available, and it
changes the liability from *unbounded accrual* to a *bounded set plus a hygiene problem*. In
steady state nothing new is orphaned: N clients hold N × 6 durable subscriptions, that number does
not grow, and a client that goes offline and returns drains its backlog and releases its pin.

**Two residual cases, and only two.** First, **roster change**: a client that is retired,
replaced, or reimaged without unsubscribing leaves a permanent orphan, and one is sufficient —
a single never-acking subscriber pins every journal file written since, across all destinations.
Second, **a client that stays offline far longer than expected**, which pins the store for the
duration without ever being wrong to do so. Every mechanism described below still holds; what has
changed is that the arrival rate of new orphans is now approximately zero, and the exposure is
concentrated at provisioning and decommissioning events rather than spread across normal use.

Each device that has ever connected holds **6 durable JMS subscriptions** that nothing removes:
`offlineDurableSubscriberTimeout` defaults to `-1` and the reaper `Timer` is never constructed.
Then:

- **One orphan pins the whole store.** KahaDB removes a topic message's index entries only when
  *no* durable subscription still references its sequence (`isSequenceReferenced`), and a
  journal data file is GC'd only when nothing points into it. A never-acking subscriber
  therefore pins every data file written since it was created.
- **The pinning is not confined to those 6 topics.** Journal files are append-only and shared
  by *all* destinations, and GC is all-or-nothing per file — so a file holding one pinned MQTT
  message also retains every already-acked queue and topic record co-located in it. **Retained
  bytes track the broker's total persistent write volume**, not the 5 msg/s on the six topics.
  This is the correction that matters most for sizing.
- **There is no quiet period.** `Topic.canOptimizeOutPersistence()` is
  `durableSubscribers.size() == 0`, so once one tab has ever connected, persistence is never
  optimised out — the topics keep consuming disk even with zero tabs open.
- **Orphan count still matters, for heap.** `keepDurableSubsActive` defaults true, so every
  offline durable subscription keeps an in-memory `DurableTopicSubscription` accumulating into
  its pending cursor. Heap, index size, MBean count and restart recovery time all scale with the
  number of orphans, and heap exhaustion may arrive before the store limit does.
- **The endgame is broker-wide.** `storeUsage` is shared across all destinations; at the high
  water mark, `sendFailIfNoSpace` being false means persistent producers call `waitForSpace()`
  and block **indefinitely** — every publisher on the broker, not just these topics.

Two authorities say this pattern is wrong, and they should be cited rather than paraphrased.
The MQTT specification itself, §3.1.3.1 non-normative comment: *"A Client implementation could
provide a convenience method to generate a random ClientId. Use of such a method should be
actively discouraged when the CleanSession is set to 0."* And ActiveMQ's own "Manage durable
subscribers" page names the exact failure: offline durable subscribers mean the broker *"needs
to keep all the messages sent to those topics… this message piling can over time exhaust broker
store limits… and lead to the overall slowdown of the system."*

**This is still a live liability independent of this track, and still worth raising with whoever
owns the broker** — just at a rate set by device churn rather than tab churn, and therefore a
matter of weeks-to-months rather than hours. `offlineDurableSubscriberTimeout` remains the fix,
and it remains unset.
Diagnosis note for them: do **not** rank offenders by pending count —
`DurableTopicSubscription.getPendingQueueSize()` returns 0 for inactive subscriptions (an
unresolved `// TODO: need to get from store`), so the JMX attribute and the web console column
both read zero for exactly the orphans being hunted. The leading indicator is the *length* of
`BrokerViewMBean.getInactiveDurableTopicSubscribers()`, which should be flat and will instead
climb by 6 per tab, plus per-topic `getStoreMessageSize()` and the KahaDB `db-*.log` file count.

### Remediation, and why `clean: true` is no longer the recommendation

An earlier revision of this plan recommended **`cleanSession: true`** as the cleanest remedy,
reasoning that no durable subscription is created when `!isCleanSession()` is false, so the
liability disappears at source. **At device scope that trade is no longer worth making**, and the
recommendation is withdrawn. It would throw away cross-reload durability — which now actually
works, because the device's session persists and the broker replays what it missed — in exchange
for suppressing a liability that has dropped from tab-rate to device-rate and has a direct
broker-side fix. Keep `clean: false`.

What remains true regardless of that choice: **`clean: true` reclaims nothing already leaked.**
`deleteDurableSubs` operates only on `lookupSubscription(clientId)`, the subscriptions of the
clientId connecting at that moment, so it never touches orphans left by devices that are gone.
The existing backlog comes back only via `offlineDurableSubscriberTimeout` or a JMX sweep.

**And with a static roster, `offlineDurableSubscriberTimeout` stops being the obvious answer.**
It reaps any subscription offline longer than the threshold — and a reaped client reconnects
successfully, then receives **nothing**, silently, because ActiveMQ hardcodes `sessionPresent = 0`
and cannot tell it. It also loses everything queued during its absence, which is precisely the
guarantee this track exists to provide. So a timeout is safe only if it comfortably exceeds the
longest *legitimate* absence, and on a fixed roster that number is knowable — shift patterns,
overnight shutdowns, holiday closures. If any client can be legitimately offline for an unbounded
period (a spare unit in storage, a seasonal installation), **no safe timeout exists** and the
timeout is the wrong tool.

The better fit for a static roster is a **decommissioning procedure**: when a client is retired
or reimaged, explicitly remove its durable subscriptions — an MQTT UNSUBSCRIBE, a single
`clean: true` connect under that clientId, or `BrokerView.destroyDurableSubscriber(clientId,
subscriptionName)` over JMX. That targets the actual failure (roster change) instead of
approximating it with a timer, and it cannot silently delete a live client's backlog. The report
should recommend both a procedure and a monitor — the length of
`getInactiveDurableTopicSubscribers()` should equal the number of currently-offline roster
members, and any excess is an orphan.

Either way the app must **re-SUBSCRIBE unconditionally on every connect**, which it needs to do
regardless for the QoS-0 topics ActiveMQ never restores.

**One event on a static roster deserves its own answer: provisioning a new client.** Every
subscription is created `retroactive(true)`, so a newly-minted clientId's starting position is
the union of sequences still outstanding for every other durable subscriber on those topics —
meaning a replacement unit would receive the undrained backlog of the whole fleet as one burst,
into the deferred-PUBACK path, bounded by disk rather than by 5 msg/s. This is a source-level
inference flagged as needing empirical confirmation, and it is exactly the kind of claim a spike
should test rather than a report assert. If it holds, provisioning needs a defined procedure too.

### What this restores for the track

Both halves of the inbox's value proposition are live again. **Cross-reload redelivery is real**:
the device's durable subscriptions queue QoS-1 messages while every tab is closed and replay them
on return, so duplicate suppression across a reload has genuine traffic to act on. **And the
acknowledged-but-not-applied loss window inside a live connection** remains the thing only the
ack-deferral design closes. The third architecture the previous revision proposed — `clean: true`
plus application-level resync — is retained as the **fallback** if the broker-side change proves
unavailable, not as the leading option.

### Two ship-blockers that belong to operations, not the front end

1. **Abandoned durable subscriptions are never reaped, and a full store blocks publishers.**
   `offlineDurableSubscriberTimeout` defaults to `-1`, and the cleanup `Timer` is not merely
   idle — `TopicRegion` never constructs it. Meanwhile `sendFailIfNoSpace` defaults false with
   no timeout, so at store exhaustion producing threads call `waitForSpace()` and **block
   indefinitely**. Combined: every cleared browser profile, new device, or regenerated clientId
   mints a permanent durable subscription that accretes forever, and the eventual failure is
   not "this client misses messages" but "every publisher to the broker wedges". Setting
   `offlineDurableSubscriberTimeout` is a prerequisite to shipping this design, not a tuning
   nicety — and that makes broker ownership part of the track's audience.
2. **Every subscription is created `retroactive(true)`.** A new durable subscription's starting
   position is the union of message sequences still outstanding for *every* durable subscriber
   on that topic — so a first-time clientId inherits the undrained backlog of every abandoned
   one, delivered at QoS 1 into the deferred-PUBACK path, bounded by disk rather than by
   5 msg/s. This is also the likely mechanism behind **AMQ-9592** (open, affects 5.18.5/6.1.3):
   messages published while one clientId was offline delivered to a different clientId. If any
   of the 6 topics are user-scoped, that is a confidentiality question and topic-level
   authorization must do the isolating, not the session.

### Smaller, but each changes code

- **Duplicate clientId over WSS *steals the link*, and that is the right setting — keep it.**
  `allowLinkStealing` defaults false and the WebSocket factories never set it, but the operator
  has enabled it on the `wss` connector and offered to turn it off. **The recommendation is to
  decline**, on four grounds, verified in `apache/activemq` and mqtt.js source:
  1. **It cannot help.** The flag is consulted only when a clientId is already in
     `clientIdSet`. With unique-per-tab clientIds, the sole event that reaches that branch is
     *one tab reconnecting against its own ghost* — where stealing is exactly the wanted
     outcome. There is no second party whose session could be hijacked.
  2. **It costs real outage.** Both sides declare death at 1.5× keepalive = 45 s, but ActiveMQ
     polls on a 15 s grid with `lastReceiveTime` snapped forward to tick boundaries, so the
     broker reaps 45–60 s after the last inbound frame — always *after* mqtt.js has begun
     retrying. The client is structurally guaranteed to knock at least once on a still-occupied
     clientId. Disabling adds roughly 14–30 s of outage per ungraceful drop, up to ~60 s when
     the browser surfaces the close promptly. With stealing on, the first retry at ~1 s wins.
  3. **It would make the broker non-conformant.** [MQTT-3.1.4-2]: "If the ClientId represents a
     Client already connected to the Server then the Server MUST disconnect the existing
     Client." Link stealing *is* the specified behaviour; the offer is to violate the spec, not
     to harden against it.
  4. **It re-arms a second, unrelated gate.** `TopicRegion.addConsumer` throws "Durable consumer
     is in use" under the same `!isAllowLinkStealing()` condition, and `clean: false` at QoS ≥ 1
     does create durable subscriptions here. More failure surface for no benefit.

  The historical objection is stale: every WebSocket and durable-subscription link-stealing race
  (AMQ-5237, 5385, 5396, 5473, 5856) was fixed by 5.12.0 in 2015. **But the version cuts both
  ways** — below 5.12.0, AMQ-5856 says link stealing simply does not work over MQTT-on-WebSocket,
  so the flag would already be inert and the real fix is an upgrade. **If reconnect latency is
  the actual concern, the lever is keepalive, not this flag**: 30 s sets the 45 s floor on both
  sides, and lowering it to ~10 s would give a 15–20 s ghost. Note that pulls against the
  background-tab throttling hazard already recorded, so it is a trade rather than a free win.
- **Two app-side checks fell out of the link-stealing analysis, and both may be live.** Neither
  is decidable from here (D-0004), so both are intake items rather than findings.
  1. **`reconnectPeriod: 0` would silently disable mqtt.js's resubscribe.** 0060's boundary owns
     an exponential backoff with a give-up policy, while mqtt.js's own reconnect is a fixed
     `setInterval` — which strongly implies the boundary sets `reconnectPeriod: 0`. In mqtt.js
     5.15.2 the resubscribe bookkeeping is gated on `reconnectPeriod > 0`, so `_resubscribeTopics`
     is never populated and `options.resubscribe` becomes a **no-op**. Ordinarily invisible,
     because a broker restores subscriptions on a `clean: false` reconnect — but **ActiveMQ does
     not restore QoS-0 subscriptions**, so if the boundary is relying on mqtt.js's resubscribe
     rather than re-subscribing explicitly, the app goes deaf on every QoS-0 topic after its
     first reconnect. Check which.
  2. **A will message would fire on every ordinary tab close.** mqtt.js sends no DISCONNECT on
     page unload, and ActiveMQ's `onWebSocketClose` synthesises one — which is why a normally
     closed tab cleans up immediately — but [MQTT-3.1.2-8] means any configured will is published
     on every close and refresh, not only on genuine failures. Check whether a will is set.

- **Assessed and not recommended: disconnecting explicitly on page hide.** Proposed 2026-08-18
  and verified against source; the proposer's own instinct ("an optimization that works only some
  of the time") is right, and the reason is structural rather than statistical.
  - **It does nothing for the storage liability.** An MQTT DISCONNECT does not remove, expire, or
    reduce a durable subscription — ActiveMQ's `onMQTTDisconnect` sends a `RemoveInfo` for the
    *connection* plus a `ShutdownInfo` and never constructs a `RemoveSubscriptionInfo`. The
    session surviving a disconnect is the entire point of `clean: false`.
  - **It is mildly counterproductive.** Queueing begins the instant the subscription deactivates
    (`offlineTimestamp` is stamped immediately, and `keepDurableSubsActive` defaults true so the
    sub keeps matching), so disconnecting deliberately opens the accrual window sooner and more
    often. Subscription count unchanged; queued volume up.
  - **Its addressable set is empty for the ghost problem.** Split terminations by whether the
    socket closes. Process death — crash, OOM, tab discard, force-quit — closes it at the OS
    level, so ActiveMQ sees the close and releases the clientId promptly with or without a
    handler. The cases that leave a half-open socket and the 45–60 s ghost — network partition,
    sleep, power loss — are by definition cases where no JavaScript runs. **The handler fires
    only where things were already clean, and never where they are dirty.**
  - **The browser already closes the socket cleanly.** The WebSockets standard requires the user
    agent to start a 1001 closing handshake when the document goes away, which is exactly what
    drives ActiveMQ's synthesised DISCONNECT.
  - **`client.end()` cannot drain the inbox.** Its only wait condition is on `outgoing` —
    client-originated publishes — while the deferred-PUBACK pattern lives entirely in the
    *incoming* path, which `end()` cannot see. Worse, when outgoing publishes are pending it
    registers `once('outgoingEmpty', setTimeout(finish, 10))`, an event plus a macrotask that
    will not run before unload — so the DISCONNECT is silently skipped exactly when the app is
    busiest. Any implementation must use `end(true)`. And a PUBACK resolving after `end()` is
    stored offline and never sent, so the broker redelivers on reconnect: the proposal *increases*
    duplicate delivery, which the inbox absorbs but should expect.
  - **Nothing async can complete in the handler anyway.** Chrome's Page Lifecycle documentation
    is explicit that freezable tasks are suspended in the frozen and terminated states, so
    callback-based APIs — IndexedDB included — cannot be relied on there.

  **Two narrow reasons it might still be worth doing**, both judged on their own merits rather
  than as broker fixes. First, **will suppression**, which is a live bug if a will is configured:
  `MQTTSocket.onWebSocketClose` tests a `receivedDisconnect` flag set only by a real DISCONNECT
  frame, so on an ordinary tab close it calls `onTransportError()` — **publishing the will** —
  *before* synthesising the DISCONNECT. An explicit DISCONNECT suppresses it ([MQTT-3.14.4-3]).
  Second, **bfcache eligibility on Firefox**, where an open WebSocket is understood to block it;
  `pagehide` + reconnect on `pageshow` is the documented pattern. That is a navigation-performance
  benefit with nothing to do with the broker, and it may be moot if the inbox's own IndexedDB
  connection forfeits bfcache regardless — which the report should check.

  **If it is implemented**: bind to `pagehide`, never `visibilitychange` (which fires on every
  tab switch, minimise and screen lock, and would rebuild ~40 subscriptions each time) and never
  `unload` (a hard bfcache blocker in both engines). Note also that `freeze`/`resume` — Chromium
  only — targets the one mechanism that actually kills a hidden tab's connection, since Chrome
  133+ freezes hidden-and-silent tab groups after five minutes under Energy Saver.
- **Recorded because it changes the background-tab picture**: Chromium's intensive timer
  throttling does apply here — an open WebSocket is *not* on the exemption list, confirmed in
  Blink source where `WebSocketChannelImpl` registers only `DisableBackForwardCache()` and
  pointedly not `DisableAggressiveThrottling()`. So a 30 s keepalive in a tab hidden beyond five
  minutes is serviced at ~60 s and exceeds ActiveMQ's 45 s threshold. The failure is asymmetric
  and therefore confusing to diagnose: **inbound WebSocket delivery is not throttled** (its task
  queue is explicitly unthrottled), so the tab keeps receiving messages at full speed right up
  until the broker times it out for not pinging.
- Also worth adopting regardless of the link-stealing decision: **`reconnectOnConnackError: true`**
  (present since mqtt.js 5.10.3, absent from `defaultConnectOptions`, so currently falsy). Without
  it, recovery from any refused CONNACK depends on the broker closing the socket rather than on
  the client. It costs nothing when connections are accepted.
- **No poison-message escape.** With no redelivery policy on the MQTT path and no DLQ routing,
  a message the browser can never commit is redelivered on every reconnect forever and wedges
  that subscription's progress. The inbox needs its own give-up-and-acknowledge rule.
- **Topic names are transposed both ways**: `/`↔`.`, `#`↔`>`, `+`↔`*`. A topic containing a
  literal `.` therefore aliases onto a different MQTT topic. Audit the 6 filters for this
  before treating topic strings as identity.
- **Version floor is a security floor.** CVE-2026-40046's fix was missed for all 6.0.0+ until
  6.2.4, and a `wss://` connector decodes MQTT with the same class as an `mqtt://` one — so the
  advisory wording "not enabling mqtt transport connectors are not impacted" does not exempt
  this deployment. Establish the running version.

## The broker may not stay ActiveMQ, which demotes most of the section above

**There is a decent chance of a swap to Eclipse Mosquitto, on a 3-to-6-month horizon** (user,
2026-08-18). That horizon is inside the service life of anything designed now, so question 19's
premise is **settled affirmative** (D-0039): the report designs for both brokers, and
ActiveMQ-specific behaviour may not appear as a design assumption anywhere in the deliverable.
The swap is not a footnote on the ActiveMQ findings — it is a statement about their **shelf
life**, and it should change how this plan is written rather than being appended to it. Nearly everything above is
ActiveMQ implementation behaviour, not MQTT semantics: AMQ-7045 and the inverted persistence
ternary, `(clientId, "<QoS>:<topic>")` subscription keying, `offlineDurableSubscriberTimeout` and
its never-constructed reaper, `retroactive(true)`, prefetch 100 per subscription,
`constantPendingMessageLimitStrategy`, hardcoded `sessionPresent = 0`,
`canOptimizeOutPersistence()`, AMQ-9592. **None of it survives the swap.** Several findings do not
merely lapse, they *invert*.

**The retention arithmetic inverts hardest, and it is the number that should drive the decision.**
Mosquitto's `max_queued_messages` defaults to **1000 per client** and drops **newest** when full
(measured in the broker-defaults table, intake item h). ActiveMQ's durable subscriptions never
drop — they accumulate against disk without limit. So the *same application configuration* gives:

| | offline retention at ~39 msg/s | after a demotion audit, ~5 msg/s |
|---|---|---|
| ActiveMQ Classic | unbounded (bounded by disk; blocks publishers when full) | unbounded |
| Mosquitto (defaults) | **~26 seconds** | **~3 minutes** |

Read that second row twice. On Mosquitto defaults, the guarantee this track exists to provide —
"messages that arrived while the tab was closed are still there" — **covers about half a minute**,
and even a perfect demotion audit only buys three. Covering a single overnight absence at 5 msg/s
needs ~144,000 queued messages, a `max_queued_messages` two orders of magnitude above default.
That is a broker configuration change without which the design does not function, and it is
invisible from the client. Worse, Mosquitto drops **newest**: a client past its cap reconnects to
a stale prefix and silently misses the recent tail, which for most app semantics is the wrong end
to keep.

**The backpressure story inverts the other way, in our favour.** Mosquitto's in-flight window is
**20** against ActiveMQ's ~3,200 outstanding across 32 durable subscriptions. Deferred
acknowledgement stops the broker after 20 unacked messages — tight, safe, exactly the
backpressure that makes deferral sound. **So ActiveMQ gives generous retention with dangerous
backpressure, and Mosquitto gives safe backpressure with thin retention.** Both need
configuration work, in opposite directions, and neither is the default.

**Four more flips worth naming, because a design that assumes either broker breaks silently on
the other:**

- **`sessionPresent` becomes usable.** Mosquitto sets it per spec; ActiveMQ hardcodes 0. Recovery
  logic that reads it works on one and silently mis-recovers on the other.
- **`resubscribe: true` becomes redundant again.** Mosquitto restores all subscriptions on a
  `clean: false` reconnect per §3.1.2.4, including QoS 0. **This plan corrected 0060's annotation
  once already** — "redundant" → "required" — and the correction is *ActiveMQ-conditional*. It is
  right today and wrong after a swap. 0060's annotation should say which broker it assumes.
- **The QoS-identity trap disappears.** Mosquitto does not key subscriptions by QoS, so a
  demotion does not strand anything. The demotion audit is *safe* on Mosquitto and *hazardous*
  on ActiveMQ — the same remedy, opposite risk profiles.
- **A producer dropping MQTT stops being silent.** There is no JMS side to fall back to, so it
  cannot publish at all: a loud failure instead of question 18's invisible degradation. The
  guard stays worth having — it is nearly free, and it is the only thing that catches the
  ActiveMQ case — but its urgency is broker-dependent.

**The design rule this imposes.** Express the design against **MQTT 3.1.1 semantics**, keep
broker behaviour in a compatibility matrix rather than in design assumptions, and detect at
runtime what the protocol does not guarantee. Guarantee A — effect and identity commit in one
IndexedDB transaction — is broker-independent by construction and survives every swap untouched,
which makes the A/B split above load-bearing rather than tidy. Guarantee B is a broker
configuration property that must be *asserted*, not assumed.

**Two mechanisms carry that weight, and both are broker-agnostic.** Question 18's delivered-QoS
comparison, and **application-level sequence-gap detection** — which is the only thing that
catches Mosquitto's silent newest-drop, ActiveMQ's cap-discard, *and* a producer migration, with
one mechanism, on a protocol version that offers nothing itself. That raises the value of
**D-0019's requested monotonic ordering stamp**, which was justified by the REST-vs-MQTT race and
now has a second, independent justification: a per-topic sequence is exactly what gap detection
consumes. The report should say so to the contract owners.

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
     deferring on the 6 inbox topics while acknowledging every other topic immediately is
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
   the other ~34 topics, which queue behind the same serialized pump and the same ordered ack
   release.
5a. **What does the broker actually do under deferral? — answered, and favourably.** ActiveMQ
   Classic performs **no in-connection retransmission**: there is no timer on the delivery path,
   so a message the browser is still committing will never be re-sent underneath it. Deferral is
   safe from the angle that would have made it self-defeating on VerneMQ or NanoMQ. Redelivery
   is coupled entirely to connection loss — anything unacknowledged when the socket dies comes
   back in bulk on reconnect, in producer order, bounded per subscription by the prefetch of
   100. What remains for the report: that ActiveMQ has **no poison-message escape** on the MQTT
   path (no redelivery cap, no DLQ routing), so a message the inbox can never commit is
   redelivered on every reconnect forever and permanently wedges that subscription. A
   give-up-and-acknowledge rule is therefore mandatory, and it needs a policy: after how many
   attempts, recorded where, and surfaced to whom.
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
11. **Multi-tab — the invariant is stated, and the question is what enforces it.** The clientId
    is device-scoped and "there *should* only be a single client connecting with a unique
    clientId at a time". That is a design intent, and the whole architecture rests on it: with
    link stealing enabled, two tabs on one device present the same clientId and produce the steal
    war this plan described two revisions ago — tab B evicting tab A, A reconnecting and stealing
    back, until 0060's give-up policy parks both in `degraded`. So the question is not *whether*
    single-connection is right, it is **what makes it true**:
    - **If nothing enforces it**, the invariant holds by user habit, and one person opening a
      second tab breaks it. That is intake item f and it should be checked before the gate.
    - **If something does**, the report records what and confirms it survives the cases that
      matter — a crashed leader, a backgrounded leader, a leader whose tab is frozen.
    **Single-connection leader election is therefore the enforcement mechanism for an invariant
    the design already assumes**, rather than a repair or an optimization. Web Locks is the
    natural primitive: crash-safe handoff with no lease or heartbeat, FIFO per resource, so a
    dead leader's lock is released by the browser rather than waiting on a timeout. One elected
    tab owns the MQTT connection *and* the IndexedDB writes; the others observe, with
    BroadcastChannel for change notification since IndexedDB has no native change events. This
    is precisely the trigger 0060's assumption A-13 named ("reopens if tabs share one MQTT
    connection").
    - **Independent of that**, tabs share one IndexedDB. If more than one tab could ever write
      the inbox — including during a leader handoff — the dedup store needs either a single
      writer or transactions correct under concurrent writers. The report says which.
    Note both an open IndexedDB connection and a held Web Lock forfeit back/forward-cache
    eligibility, so leader election and the bfcache benefit discussed above are in tension.
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
18. **How does the boundary detect that a durable topic has silently stopped being durable?**
    Added 2026-08-18, from the fact that one or more producers may drop MQTT support. Question 17
    makes `durable` + `qos: 0` unrepresentable in the *declaration*; that is necessary and not
    sufficient, because the QoS that matters is the one **delivered**, which no declaration
    controls and which can change with no deploy on this side. The check itself is cheap —
    compare `packet.qos` against the row's declared QoS at ingress — so the design work is in
    what happens next, and the report must choose rather than list:
    - **What class is it?** It is not a contract violation (the payload is fine) and not a
      transport fault (the connection is healthy). It is a *degradation of a declared guarantee*,
      which the four-class taxonomy (0060 KQ3, D-0015) may not have a home for. Say whether this
      needs a fifth class, a reason code inside an existing one, or a channel outside the
      taxonomy entirely.
    - **Does the message still take the durable path?** Writing it to the inbox still buys
      guarantee A, and refusing it buys nothing — so the likely answer is yes, process normally,
      report loudly. Confirm that, because the opposite reflex is to quarantine.
    - **How is it reported without a storm?** At 5 msg/s a lapsed topic trips this on every
      message. The dedup-and-warn-once shape already ratified for REST unknown-field drift
      (D-0018) is the obvious precedent and should be reused rather than reinvented.
    - **Is the inverse worth checking?** Delivered QoS 1 on a row not declared durable means a
      topic gained a guarantee nobody planned to use — cheap to detect on the same comparison,
      and it is how a *new* durable-path candidate announces itself.
19. **Which of this design's guarantees survive a broker swap, and which are configuration?**
    Added 2026-08-18, from the possible move to Mosquitto. This is a question about the *report's*
    structure as much as the design's: a recommendation that reads as "this works" when it means
    "this works on ActiveMQ 6.3.1 with these three settings" is a defect, and this plan has
    already written several such sentences. The report should carry a short **compatibility
    matrix** — retention limit and drop policy, in-flight window, `sessionPresent` fidelity,
    subscription restoration on `clean: false` reconnect, subscription identity, offline-session
    expiry — across at minimum ActiveMQ Classic and Mosquitto, since those are the two live
    candidates, and state for each design element whether it is protocol-guaranteed,
    broker-guaranteed, or configuration. Two specific outputs are worth more than the matrix:
    - **The minimum broker configuration the design requires, per broker, as a checklist an
      operator can act on.** On Mosquitto that is dominated by `max_queued_messages`, which must
      rise roughly two orders of magnitude above default or the offline guarantee covers minutes.
      This is the deliverable most likely to be missing when the design is judged to have failed
      in production.
    - **Whether any design element requires a broker feature neither candidate guarantees**, in
      which case it is not a design element but a wish.

    Note the interaction with question 5: the reconnect replay burst is sized by the broker's
    queue depth, and the two candidates differ by orders of magnitude in both directions —
    unbounded on one, 1000 on the other. A burst design tuned to either is wrong on the other,
    so the burst handling must be driven by observed backlog rather than a configured expectation.

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
multi-tab, worker, and **memory-budget** decision. The report therefore **reserves** that space
and makes those shared calls once; otherwise the deferral becomes a rewrite.

The memory budget is this track's own to state and bound (**D-0043**: each track owns its
footprint and models no sibling's). It is a real number this report owes, not a browser concern
it can defer to quota — on a RAM-disk device IndexedDB *is* RAM, so the store, its dedup keys,
and its in-flight transactions are charged against the same physical budget as the OS and every
other service. State it per device, bound it by construction the way 0160 bounds its envelope,
and say what happens at the bound. Nothing in the repo adds this track's number to a sibling's,
which D-0043 records as a deliberate residual rather than an oversight. Also out of scope: reopening the
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

- ~~Who publishes to the 6 topics?~~ **Answered 2026-08-18: MQTT clients today**, so AMQ-7045
  is off this path and the track is viable — but **one or more producers may drop MQTT support in
  future**, which puts them back on it silently. The premise is therefore a runtime property, not
  a settled fact, and question 18 exists because of it. What still gates the survey (item b):
  **which of the candidate topics are subscribed at QoS 0** — some are, so the durable path
  covers fewer than 6 as drafted, and each one is a promote-or-exclude call — and **at what QoS
  the producers publish**, since a QoS-0 publish yields a `NON_PERSISTENT` JMS message that is
  unstored offline and delivered at QoS 0 whatever the browser subscribed at. One empirical
  check answers both: subscribe at QoS 1, publish through the real path, read `packet.qos`.
- **Which topics get the durable path, and what share of the ~50 msg/s do they carry?** (item
  b) — the selection rule that goes on the policy row, the rate every cost estimate is built
  on, and paired with "are their effects idempotent?" it decides how much of the design is
  needed at all.
- **The ActiveMQ version, the connector URI, and `offlineDurableSubscriberTimeout`** (item h) —
  the first is a security floor, the second decides the multi-tab failure mode, and the third
  is a prerequisite to shipping rather than a tuning question.
- **Is the persisted clientId shared across tabs or per-tab?** (item f) — the two readings have
  opposite failure modes and one of them is a live defect independent of this track.
- **Is there a stable per-message identifier in any payload today**, and can one be added?
  (item c)
- **Where do effects currently land** (item d) — durable storage, or in-memory state only? If
  in-memory only, there is nothing for the key write to be atomic with.
