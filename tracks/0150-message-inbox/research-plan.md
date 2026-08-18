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

### The premise question: who publishes to those 6 topics?

**This is now the first thing the track must establish, because one answer makes the whole
design decorative.** `MQTTProtocolConverter` derives a delivered message's QoS from the JMS
persistence flag with the ternary **inverted** —
`qoS = message.isPersistent() ? QoS.AT_MOST_ONCE : QoS.AT_LEAST_ONCE` — and that line is
reached whenever the JMS property `ActiveMQ.MQTT.QoS` is absent, which is the case for every
message originating from an OpenWire/JMS, STOMP, AMQP, or Camel producer. So if the publishers
on those 6 topics are not themselves MQTT clients — the normal case in a shop running Classic —
their messages arrive at the browser **at QoS 0**: no PUBACK exists to defer, the subscription
is not durable, nothing is retained while offline, and the inbox degrades to fire-and-forget
with permanent loss on a tab crash. This is **AMQ-7045**, open since 2018 with no fix version
and unchanged in 6.3.1. Establish the producer technology for those 6 topics before any other
work in this track.

### What holds if the producers are MQTT clients

- **Durability is per-subscription and QoS-gated.** A durable JMS subscription is created only
  when `cleanSession=false` **and** clientId is non-null **and** requested QoS ≥ 1. So the 6
  QoS-1 topics get real durable subscriptions while the other ~34 QoS-0 subscriptions get no
  session state and **are not restored on reconnect** — a deviation from MQTT 3.1.1 §3.1.2.4.
  The client must re-SUBSCRIBE everything on every reconnect or go silently deaf on 34 of 40
  topics. **This reverses what an earlier draft of this plan said**: `resubscribe: true` is not
  redundant here, it is *required*, and the same wrong claim was written into 0060's report
  annotation and has been corrected there.
- **The two tiers have opposite loss semantics.** The shipped
  `constantPendingMessageLimitStrategy limit="1000"` applies only to non-durable
  `TopicSubscription`s, so the 34 QoS-0 topics silently discard oldest beyond prefetch+1000,
  while the 6 durable ones never drop — they accumulate against disk instead.
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

### The live finding: a per-tab clientId with `clean: false` is an unbounded broker liability

**The clientId is unique per browser tab** (user, 2026-08-18). That settles the multi-tab
branch — there is no steal war, because two tabs never present the same clientId, and **the
prediction this plan made in its previous revision is falsified**. The other branch is the live
one, and it is worse. Verified against `apache/activemq` source; three corrections were made to
the first framing, all of which made it more severe.

Every tab that has ever connected minted **6 durable JMS subscriptions** (one per QoS-1 topic)
that nothing removes: `offlineDurableSubscriberTimeout` defaults to `-1` and the reaper `Timer`
is never constructed. Then:

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

**This is a live production liability independent of this track, and it is probably already
accruing.** It should be raised with whoever owns the broker now rather than at the go gate.
Diagnosis note for them: do **not** rank offenders by pending count —
`DurableTopicSubscription.getPendingQueueSize()` returns 0 for inactive subscriptions (an
unresolved `// TODO: need to get from store`), so the JMX attribute and the web console column
both read zero for exactly the orphans being hunted. The leading indicator is the *length* of
`BrokerViewMBean.getInactiveDurableTopicSubscribers()`, which should be flat and will instead
climb by 6 per tab, plus per-topic `getStoreMessageSize()` and the KahaDB `db-*.log` file count.

### The tension this creates with the track itself

The cleanest remedy is **`cleanSession: true` per tab**: the MQTT strategy only sets a
subscription name when `!isCleanSession()`, so no durable subscription is created at all, and a
reconnect with the same clientId under `clean: true` also *deletes* durable subs left from the
`clean: false` era. QoS 1 still gives at-least-once for the life of the connection.

But that removes what made this track live. Under `clean: true` there is no offline queueing and
no cross-reload redelivery — the original null hypothesis returns, and the durable half of the
inbox has no traffic to act on. What survives is narrower and still real: **the acknowledged-
but-not-applied loss window inside a live connection**, which the ack-deferral design closes and
which nothing else does.

So the report should evaluate a third architecture that this plan has not yet stated, and it may
be the right answer: **`clean: true` per tab, application-level resync on reconnect, and the
inbox scoped to the in-connection ack window.** Gap handling on reconnect is not new work — it
is exactly 0070's accepted invalidate-don't-set rule, which already treats every reconnect as a
gap. That combination removes the broker liability entirely, keeps the loss-window fix, and
costs the durability-across-reload property that the 6 topics may or may not actually need
(intake item b). If durability across a reload *is* required, the clientId must key to the user
or device rather than the tab, and then single-connection leader election becomes mandatory
because link stealing is enabled.

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
     rather than re-subscribing explicitly, the app goes deaf on the 34 QoS-0 topics after its
     first reconnect. Check which.
  2. **A will message would fire on every ordinary tab close.** mqtt.js sends no DISCONNECT on
     page unload, and ActiveMQ's `onWebSocketClose` synthesises one — which is why a normally
     closed tab cleans up immediately — but [MQTT-3.1.2-8] means any configured will is published
     on every close and refresh, not only on genuine failures. Check whether a will is set.

  Also worth adopting regardless of the link-stealing decision: **`reconnectOnConnackError: true`**
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
11. **Multi-tab — answered, and it decides the clientId strategy rather than the inbox.** The
    clientId is unique per tab, so link stealing (enabled on the `wss` connector) never fires
    between tabs and there is no steal war; **the previous revision's prediction is falsified**
    and is left in the record above rather than deleted. What the answer buys instead is the
    unbounded durable-subscription liability described above, whose remedy — `clean: true` per
    tab, or a user/device-scoped clientId — is a *connection* decision this track surfaces but
    does not own. Two things remain genuinely this track's:
    - **If the clientId ever becomes user- or device-scoped** (the branch that keeps durability
      across a reload), link stealing makes single-connection **leader election mandatory**, not
      optional: one elected tab owns the MQTT connection *and* the IndexedDB writes, the others
      observe. Web Locks is the natural primitive — crash-safe handoff, no lease or heartbeat,
      FIFO per resource — with BroadcastChannel for change notification, since IndexedDB has no
      native change events. This is the trigger 0060's assumption A-13 named.
    - **Regardless of clientId strategy**, tabs share one IndexedDB. If more than one tab writes
      the inbox, the dedup store needs either a single writer or transactions that are correct
      under concurrent writers. The report says which.
    Note both an open IndexedDB connection and a held Web Lock forfeit back/forward-cache
    eligibility.
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

- **Who publishes to the 6 topics — MQTT clients, or JMS/OpenWire/STOMP/AMQP/Camel producers?**
  (item b) — **the premise question, ahead of everything else.** ActiveMQ Classic inverts the
  JMS-persistence-to-QoS mapping (AMQ-7045, open since 2018), so messages from a non-MQTT
  producer reach the browser at QoS 0: no acknowledgement to defer, no durable subscription, no
  offline retention. If the producers are JMS services — the normal case in a Classic shop —
  this track's design is decorative for those topics and the report must say so rather than
  specify a mechanism that cannot engage.
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
