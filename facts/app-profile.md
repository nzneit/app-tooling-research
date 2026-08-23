# App Profile

Facts about the application under study, supplied by the user (the app repo is not
accessible from here — D-0004). Reports cite this file; a missing fact becomes a declared
assumption in the report. Partial answers are fine.

**Status**: partially filled (2026-08-14: React, TypeScript, strictness, repo layout, import
style, build tool, MQTT QoS + rate, CI, browser targets, scale, team size). Still unfilled:
Node version, package manager, the whole Contracts section, test framework, and vetoes.

## Stack
- React version: 18.3.1 (2026-08-14, user — React 19 not in play)
- TypeScript version: 5.9.3 (2026-08-14, user)
- TypeScript strictness: very loose (2026-08-14, user — see track 0100 for the
  enforcement design; the codebase receives a high volume of agent-authored code)
- Node version: **>= 24** (2026-08-14, user) — clears every floor in play (Vite 8, knip
  `^20.19.0 || >=22.12.0`, MSW `>=18`)
- Build tool (Vite / webpack / other): **Vite 8.0.16**, with **@vitejs/plugin-react 6.0.2**
  (2026-08-14, user). Decisive for React Compiler: plugin 6.x carries **no internal Babel**,
  so the compiler wires through `@rolldown/plugin-babel` + `reactCompilerPreset`, never the
  legacy `react({ babel: … })` option. Note 8.0.16 is below 8.2, where native
  `resolve.tsconfigPaths` left experimental — so alias resolution likely still runs through
  `vite-tsconfig-paths` today.
- Package manager: **bun, exclusively** (2026-08-14, user, clarified). Bun alone installs and
  manages dependencies; the tracked lockfile is the **text `bun.lock`** format, and **there
  is no `package-lock.json` in the repo**. Two consequences. First, tooling that requires an
  npm/yarn-shaped lockfile is eliminated on constraint, not merit — this removed five
  candidates from track 0140, including the whole `npm audit` family. Second, the text format
  is the supported one: nearly every scanner draws its line at text-versus-binary, so the
  broad candidate list survives where it would have collapsed on `bun.lockb`. Because there
  is no second lockfile, the npm/bun drift hazard does **not** apply; a CI invariant asserting
  no `package-lock.json` reappears is worth keeping as cheap prevention rather than a fix.
- Monorepo or single package: **pseudo-monorepo** (2026-08-14, user) — the codebase is
  split across separate package directories, but those directories carry **no individual
  package.json and no individual versioning**. There is one root package.json and
  everything is downstream of it: no npm/pnpm/yarn workspaces, no per-directory
  dependency lists, no independent versions. Directories express package-like intent
  without npm package boundaries. Consequence to carry into every recommendation: JS
  tooling that advertises "monorepo support" generally keys it on package.json
  workspaces and will not engage here; conversely, nothing at the package-manager level
  enforces which directory may import what, so directory boundaries are convention plus
  path-based lint rules only.
- Internal import style: **scoped-alias specifiers** (2026-08-14, user) — cross-directory
  imports are written `import … from '@appname/path/to/thing'`. `@appname` is the app's
  own scope: not a published npm package, not present in the root package.json
  dependencies, and backed by no per-directory manifest. It can only resolve through a
  tsconfig `paths` mapping plus matching alias configuration wherever else modules are
  resolved (bundler, test runner, lint import resolvers). Two consequences to carry:
  internal specifiers are syntactically indistinguishable from real external scoped
  packages, so any tool that classifies imports or checks specifiers against
  package.json may misread them; and because `paths` required `baseUrl` before TS 4.1,
  the tsconfig may still carry `baseUrl` — which TypeScript 7.0 removed and the oxlint
  type-aware lane rejects outright (intake 2026-08-14-0100 item d).

## Contracts
- OpenAPI version(s):
- AsyncAPI version(s):
- Rough counts (contracts / operations / message types):
- Current TS type-generation tool:

## MQTT
- QoS levels used: 1 and 0
- Topic-scheme shape (redacted example ok): varies a bit by use case
- Rough peak message rate (msgs/sec): ~50 per second
- **Payload sizes: typically under 10 KB, worst case ~50 KB** (2026-08-23, user — intake
  2026-08-22-0160 item a). Consequences for any buffer sized in bytes: the worst case is
  **5× the typical**, so a count-based bound cannot bound memory (100 retained messages is
  1 MB or 5 MB depending only on traffic) — which is the concrete justification for 0160's
  byte accounting. And the *duration* a fixed count buys is short: at ~50 msg/s aggregate,
  100 messages is **about two seconds** of history. REST response-body sizes were not
  supplied and remain an assumption.
- Session mode: **`clean: false` with a persisted clientId** (2026-08-17, user) — a
  **persistent** session, not mqtt.js's default. This **falsifies 0060 assumption A-5 and
  0070 assumption A-6**, both of which declared `clean: true`; each accepted report now
  carries a dated in-place correction, and the 0060 spike's `design.md` hard-codes
  `readonly clean: true` as a fixed config value. Four consequences carry into every
  affected recommendation. (1) The broker **retains session state and queues QoS 1 messages
  while the client is disconnected**, redelivering them on reconnect — so cross-reload
  redelivery is real, which is what makes track 0150 live rather than a skip. (2) The
  mqtt.js duplicate-delivery history that A-5 declared out of scope
  ([#909](https://github.com/mqttjs/MQTT.js/issues/909)) is **in** scope. (3) A reconnect is
  no longer automatically a gap for QoS 1 streams, so 0070's "every reconnect is a gap" rule
  is now over-conservative there (safe, but paying invalidation round-trips it may not owe);
  it still holds for QoS 0, which is not queued. (4) `resubscribe: true` is redundant against
  a retained session and re-triggers retained-message delivery on every reconnect. **Still
  unanswered and consequential**: whether the persisted clientId is shared across tabs or is
  per-tab — see intake 2026-08-17-0150 item f. The two readings have opposite failure modes
  and one of them is a live defect independent of any inbox.
- Durable-ingest scope: **per topic, opt-in** (2026-08-18, user) — IndexedDB round trips are
  wanted only for messages on selected topics, not for all traffic. This lands as a field on
  0060's accepted per-channel `ChannelPolicy` row, which is the extension shape that track's
  spike pre-authorized ("a policy-row addition, not an interface redesign"). Two consequences
  to carry. It lowers the cost estimate — the rate that matters is the selected topics' share
  of the ~50 msg/s, not the aggregate — and it correspondingly shrinks retention and quota.
  It does **not** buy isolation: `handleMessage` is one client-wide serialized hook and 0060's
  delivery queue is shared, so a durable write blocks every other topic while it runs and a
  burst on non-durable topics can shed durable ones.
- Durable-ingest volume: **~6 of roughly 40 topics, ceiling ~5 msg/s** (2026-08-18, user) —
  against the ~50 msg/s aggregate, so the durable path is about a tenth of traffic. Three
  consequences, computed rather than assumed. (1) Five per second is a 200 ms serialized budget
  per message, so per-message acknowledgement deferral runs at roughly a **0.8% duty cycle
  nominally and 10% pessimistically**, and head-of-line blocking of the other 34 topics is a
  bounded cost rather than a blocker — batching is an optimization here, not a necessity.
  (2) Dedup-key retention is **derivable from the broker's session-expiry interval** (the
  broker never redelivers beyond it), and sizes at roughly 1.2 MB of keys per hour of expiry —
  comfortable at any plausible setting. (3) The reconnect replay burst does **not** shrink with
  this: it is sized by session expiry, so an hour offline queues ~18,000 durable-topic messages
  against 0060's delivery-queue bound of 256.
  > **2026-08-18 revision.** Consequence (2) is withdrawn and consequence (3) is materially
  > reduced; the protocol version and the broker defaults below supersede both. Retention is
  > **not** derivable (3.1.1 has no session expiry), and the replay burst is capped at the
  > broker (~1000, not 18,000) and paced by the in-flight window once acks are deferred.
- Protocol version: **MQTT 3.1.1 (protocolVersion 4)**, no session-expiry interval
  (2026-08-18, user). Keepalive **30 s**. Four consequences, spec-verified. `handleMessage` is
  the only acknowledgement seam (`customHandleAcks` is a no-op below v5, `manualAcks` does not
  exist). There are **no User Properties or Correlation Data**, so a producer-supplied
  idempotency key has to go inside the payload — a vendored-schema change, with no cheaper
  variant. There are **no Subscription Identifiers**, so copies of one publish delivered for
  two overlapping filters are indistinguishable and a content hash cannot separate them.
  And 3.1.1 has **no session-expiry concept at all** — the spec bounds session lifetime only
  from below and leaves the upper bound to "administrative policies" — so how long a persistent
  session survives is broker configuration, not protocol. Note also that **[MQTT-4.6.0-2]
  requires PUBACKs to be sent in the order the PUBLISHes were received**, which constrains any
  per-topic acknowledgement deferral to a single receipt-ordered release queue. Keepalive 30 s
  gives a 45 s server deadline (1.5×) — vast headroom against a millisecond-scale commit, but
  tight for a backgrounded browser tab, where Chromium throttles timers to ~60 s after five
  minutes hidden and WebSocket is not an exemption; whether that is causing background
  disconnect-resume cycles today is worth checking independently of this track.
- Broker: **Apache ActiveMQ Classic** (2026-08-18, user; version not yet stated). A JMS broker
  with an MQTT transport, not a native MQTT broker — so no native-broker default transfers, and
  the earlier Mosquitto/EMQX/HiveMQ/VerneMQ/AWS comparison is superseded for this app. Source
  read at tag `activemq-6.3.1`; findings put to an adversarial refuter, which overturned two.
  **The premise-level finding**: `MQTTProtocolConverter` maps JMS persistence to MQTT QoS with
  the ternary **inverted** (`isPersistent() ? AT_MOST_ONCE : AT_LEAST_ONCE`), on the path taken
  whenever the `ActiveMQ.MQTT.QoS` property is absent — i.e. for every message from an
  OpenWire/JMS, STOMP, AMQP or Camel producer. Such messages reach the browser at **QoS 0**:
  no PUBACK, no durable subscription, no offline retention. This is **AMQ-7045**, open since
  2018, unchanged in 6.3.1. **Resolved 2026-08-18 (user): the 6 durable-path topics are fed by
  MQTT clients**, so the inverted branch — reached only when `ActiveMQ.MQTT.QoS` is absent — is
  never taken for them, and track 0150 is viable. The defect still governs any topic added to
  that policy row later from a JMS service. The residual is that the property carries the
  *publisher's* QoS: a QoS-0 MQTT publish becomes a `NON_PERSISTENT` JMS message, unstored for
  offline durable subscribers and delivered at QoS 0 whatever the browser subscribed at — the
  same failure mode from an upstream, correctable cause. Producer publish QoS is now the gating
  fact (intake item b). **Qualified the same day**: the user reports that **one or more producers
  may drop MQTT support in future**. That makes the premise a
  *runtime* property rather than a settled fact: a producer migrating to JMS/AMQP/STOMP/Camel
  takes the AMQ-7045 path with no visible break — SUBSCRIBE still succeeds, the durable JMS
  subscription still exists (it is created from the **requested** QoS), messages still arrive —
  and only offline retention stops. 0150 question 18 owns detecting it from `packet.qos` at
  ingress. Related and easy to trip: ActiveMQ keys durable subscriptions on
  `(clientId, "<QoS>:<topic>")`, so **QoS is part of the subscription's identity** — promoting a
  topic creates a new durable subscription and demoting one strands the old permanently, which is
  the orphan mechanism firing on a config change rather than a device retirement.
- **Subscription QoS across the ~40 topics** (2026-08-18, user): **all ~6 durable-path candidates
  are QoS 1 today**; the other ~34 are a **mix of QoS 1 and QoS 0**. An earlier entry in this
  file said the 6 were QoS 1 and the other ~34 were QoS 0 — that was wrong and this corrects it.
  The consequence is larger than the correction: ActiveMQ creates a durable JMS subscription for
  *every* QoS-1 subscription on a `clean: false` session, with no way to know which ones the app
  intended to be durable. **The QoS-1 topics among the ~34 are therefore already durable today** —
  accumulating while offline, pinning journal files, exempt from the
  `constantPendingMessageLimitStrategy limit="1000"` ceiling that bounds QoS-0 subscribers, and
  never reaped — without the app having asked for any of it, and without an inbox to deduplicate
  their reconnect replay. Per-device durable-subscription count is **N × (6 + that unknown
  number)**, so every 6-based sizing figure is a floor. **Sized the same day: roughly 75% of the
  other ~34 are QoS 1** — about 26 incidental durable subscriptions on top of the 6 intended, so
  ~32 per device carrying ~39 msg/s if rate tracks topic count. The unintended durable path is
  roughly **eight times** the intended one. **How many genuinely need offline retention is not
  known** (user, 2026-08-18: expects none, offered to assume all). D-0039 rules **size for all,
  design for none**, and reframes the question into one that can be answered by reading the
  handler: *is the effect accumulating or replacing?* Only accumulating effects need offline
  retention; replacing effects get the current value from the first message after reconnect.
- **The broker may not stay ActiveMQ Classic** (2026-08-18, user): a decent chance of swapping to
  **Eclipse Mosquitto**, on a **3-to-6-month horizon** — inside the service life of anything
  designed now, so 0150 designs for both brokers (D-0039). Every ActiveMQ-specific finding above is therefore time-limited, and
  several *invert* rather than lapse. The decisive one is retention: ActiveMQ durable
  subscriptions never drop, while Mosquitto defaults to `max_queued_messages` **1000 per client,
  dropping newest** — about **26 seconds** of offline backlog at ~39 msg/s, or ~3 minutes even
  after a demotion audit, against ActiveMQ's unbounded. Covering an overnight absence on
  Mosquitto needs roughly 144,000, two orders of magnitude above default. In the other direction
  Mosquitto's 20-message in-flight window is far safer for deferred acknowledgement than
  ActiveMQ's ~3,200 outstanding. Also flipping on a swap: `sessionPresent` becomes usable
  (Mosquitto sets it per spec), `resubscribe: true` becomes redundant again (Mosquitto restores
  QoS-0 subscriptions per §3.1.2.4 — **so the correction this program made to 0060's annotation
  is ActiveMQ-conditional**), subscriptions are not keyed by QoS so demotion strands nothing, and
  a producer dropping MQTT fails loudly rather than silently. 0150 question 19 owns the
  compatibility matrix and the per-broker minimum-configuration checklist.
  Other consequences carried into 0150: durable subscriptions exist only
  for QoS ≥ 1, so **QoS-0 subscriptions are not restored on reconnect and `resubscribe: true`
  is required** (this corrects an earlier note in 0060's annotation); the shipped
  `constantPendingMessageLimitStrategy limit="1000"` applies only to non-durable subscribers,
  giving the two tiers opposite loss semantics; durable prefetch is 100 per subscription, so
  deferred acknowledgement does get real backpressure; there is **no in-connection
  retransmission** and also **no poison-message cap or DLQ** on the MQTT path; `sessionPresent`
  is hardcoded to 0 in every CONNACK; and MQTT 5 is actively rejected, permanently foreclosing
  User Properties and Subscription Identifiers. **Two operations-owned ship-blockers**:
  `offlineDurableSubscriberTimeout` defaults to -1 and the reaper `Timer` is never even
  constructed, while `sendFailIfNoSpace` defaults false with no timeout — so abandoned durable
  subscriptions accrete forever and a full store **blocks every publisher indefinitely**; and
  every subscription is created `retroactive(true)`, so a new clientId inherits the undrained
  backlog of every abandoned one (likely mechanism of **AMQ-9592**, open — a confidentiality
  concern if topics are user-scoped). **Still unanswered**: the producers' publish QoS, *which* 6
  topics, whether their effects are idempotent, payload size, and the ActiveMQ
  version (CVE floor 6.2.4+ / 5.19.2+ — a `wss://` connector is exposed despite the advisory
  wording) — intake 2026-08-17-0150 items b and h.
- Connector setting: **`allowLinkStealing` is enabled on the `wss` connector** (2026-08-18,
  user). This overrides ActiveMQ's own behaviour, where the flag defaults false and the
  WebSocket transport factories never set it — so the code default is to *reject* a duplicate
  clientId with CONNACK 0x02, while this deployment *steals the link*: a second connection
  presenting the same clientId disconnects the first. Combined with mqtt.js's 1000 ms
  `reconnectPeriod`, a clientId shared across browser tabs produces a **steal war** — each tab
  reconnects and steals back — and every steal calls `DurableTopicSubscription.deactivate()`,
  returning unacknowledged messages to pending in producer order, resubscribing the QoS-0 topics
  and re-triggering retained delivery. 0060's boundary caps reconnection at `maxAttempts`
  (default 10) with exponential backoff before declaring `degraded`, so the **predicted
  observable symptom is both tabs going `degraded` and silently stopping**, not indefinite
  flapping. This turned out **not** to be live — tabs never share a clientId, so the prediction
  is falsified. Left in place as the record; see the next entry for the branch that is live.
  **2026-08-18 ruling — keep link stealing enabled.** The operator offered to disable it; the
  recommendation is to decline, and the reasoning is in the 0150 plan. In short: it cannot help,
  because the flag is consulted only when a clientId is already registered and with unique
  per-tab ids the only such event is one tab reconnecting against its own ghost, where stealing
  is the wanted outcome. It would cost 14–30 s of extra outage per ungraceful drop (up to ~60 s),
  since ActiveMQ polls its 45 s keepalive threshold on a 15 s grid and therefore reaps the ghost
  *after* mqtt.js has already begun retrying. It would put the broker in violation of
  [MQTT-3.1.4-2], which requires disconnecting the existing client on a duplicate ClientId. And
  it would re-arm `TopicRegion.addConsumer`'s "Durable consumer is in use" throw, gated on the
  same flag. Historical link-stealing races were fixed by 5.12.0 (2015); below that version
  AMQ-5856 makes the flag inert over MQTT-on-WebSocket anyway. If reconnect latency is the real
  concern the lever is **keepalive** — 30 s sets the 45 s floor on both sides — traded against
  the background-tab throttling hazard recorded above.
- clientId scope: **device-scoped and a static roster** — multiple clients, a fixed number of
  them, each with a unique persistent clientId, one connection using it at a time (2026-08-18,
  user, across two clarifications; an earlier statement was first read here as per-tab minting,
  which was wrong, and the entry below is corrected in place). One client means one clientId and
  one set of 6 durable subscriptions, reused across tabs and reloads, with the total count fixed
  by the roster. This is the most favourable shape available: in steady state **nothing new is
  orphaned**, and exposure concentrates at provisioning and decommissioning rather than in normal
  use. Two residual cases remain, and one orphan is sufficient for either to matter — a client
  retired or reimaged without unsubscribing, and a client offline far longer than expected.
  Consequently `offlineDurableSubscriberTimeout` is **no longer the recommended fix**: it would
  silently delete a legitimately-absent client's queued backlog, which is the guarantee this work
  exists to provide, and on a fixed roster a decommissioning procedure targets the real failure
  instead. Storage also becomes computable: roster size × longest expected offline window ×
  message rate. Three further consequences. **(1) The orphan
  liability shrinks by orders of magnitude but does not disappear**, and it is important that the
  mechanism is unchanged: because one never-acking durable subscriber is sufficient to pin every
  journal file written since it was created, a single decommissioned laptop, cleared profile, or
  departed user still causes unbounded growth. Device scoping lowers the *rate* of new orphans,
  not the *severity* of one. `offlineDurableSubscriberTimeout` remains the only automatic reclaim
  and is still unset. **(2) Cross-reload durability actually works**, which is what the inbox
  track wants: close a tab, reopen it, and the broker replays what the device missed. **(3) The
  single-connection invariant is stated as intent, not as an enforced property** — "there
  *should* only be a single client connecting with a unique clientId at a time". With link
  stealing enabled, two tabs on one device would present the same clientId and produce the steal
  war described above. What enforces it is intake 2026-08-17-0150 item f.
  > **Superseded 2026-08-18, kept as the record of the misreading.** The text below was written
  > against "a unique clientId per tab" and describes a liability at a rate that does not obtain.
  > Its *mechanisms* are all still accurate and still worth reading; only the rate is wrong.
  Each tab mints **6
  durable JMS subscriptions** that nothing removes (`offlineDurableSubscriberTimeout` defaults
  `-1`, and the reaper `Timer` is never constructed). Verified in `apache/activemq` source:
  KahaDB removes a topic message's index entries only when *no* durable subscription still
  references its sequence, and a journal file is GC'd only when nothing points into it — so one
  never-acking orphan pins every data file written since it was created. **The pinning is not
  confined to these 6 topics**: journal files are shared by all destinations and GC is
  all-or-nothing per file, so retained bytes track the broker's *total* persistent write volume.
  There is also no quiet period — `Topic.canOptimizeOutPersistence()` is
  `durableSubscribers.size() == 0`, so once one tab has connected the topics keep consuming disk
  with zero tabs open. Orphan count additionally drives heap, since `keepDurableSubsActive`
  defaults true and each offline subscription keeps an in-memory cursor. Endgame: `storeUsage`
  is broker-wide, and at its high water mark persistent producers call `waitForSpace()` and
  block **indefinitely** — every publisher, not just these topics. The MQTT specification warns
  against exactly this pattern (§3.1.3.1 non-normative: random clientIds "should be actively
  discouraged when the CleanSession is set to 0"), and ActiveMQ's own "Manage durable
  subscribers" page names the failure mode. Diagnosis note: **do not rank offenders by pending
  count** — `getPendingQueueSize()` returns 0 for inactive subscriptions (an unresolved
  `// TODO: need to get from store`), so JMX and the web console both read zero for exactly the
  orphans being hunted; use the length of `BrokerViewMBean.getInactiveDurableTopicSubscribers()`,
  per-topic `getStoreMessageSize()`, and the KahaDB `db-*.log` file count. The cleanest remedy,
  `clean: true` per tab, removes the liability but also removes cross-reload redelivery — which
  is what made track 0150 live; that tension is written up in the track's plan.

## Environment
- CI provider: **GitHub Actions on GitHub Enterprise Cloud**, application repo is
  **private**, with **custom on-prem (self-hosted) runners of varying sizes** (2026-08-14,
  user). Consequences: runner hardware is the organisation's own choice, so memory-hungry
  whole-repo tools are not capped by GitHub-hosted runner sizes; Enterprise *Cloud* means the
  GHES air-gap caveat on advisory-database sync does not apply; and code scanning on a
  private repo still depends on whether the enterprise licenses Code Security / Advanced
  Security, which remains unanswered.
- Scanning preference: an **offline vulnerability database fed by a periodic sync** is the
  preferred operating model, though outbound access is believed available (2026-08-14, user).
- Browser targets: Firefox version ~124 , Chromium latest - (latest - 2)
  - **Confirmed 2026-08-23 (user, intake 2026-08-22-0160 items f and h): the fleet runs
    Firefox 124 today, and it is Firefox only** — Chromium is a possible future, not a
    current arm. Both halves are consequential for 0160 and neither relaxes. `fetch
    keepalive` shipped in Firefox 133 (2024-11-26), so the only page-dismissal-surviving
    sender is `sendBeacon` (≤ 64 KiB, shared in-flight quota, and in practice
    `text/plain` only cross-origin) — 0160's two-budget delivery design is therefore
    load-bearing rather than precautionary. Firefox parses `Reporting-Endpoints` only from
    130 and generates no crash reports at any version, so the Chromium crash-report
    complement contributes **nothing to this fleet today**: renderer OOM and unresponsive
    kills produce no report at all, and absence-based detection at the backend is the only
    compensation. Revisit if a Chromium arm appears.
- **Device runtime: the OS runs from a RAM disk** (2026-08-22, user — surfaced while
  chartering 0160). Three consequences carried into every persistence recommendation.
  (1) The browser profile — IndexedDB included — is RAM, so "spill to disk" spends the same
  physical budget as an in-memory buffer; persistence changes which process holds the bytes
  and what survives a tab crash, never the footprint. (2) Durability across a device power
  cycle does not exist on-device at all; anything that must survive a power cycle must
  leave the device first. (3) A durable queue that accumulates while a backend is down
  competes with the OS for RAM, and a full RAM disk is an OS-level failure — bounded-by-
  construction is a safety property here, not a style preference. Note this does not
  change 0150's premise (its durable inbox targets tab-crash/reload atomicity, which RAM
  backing preserves), but it does mean 0150's guarantee also ends at a power cycle.
- **Flight-recorder capture envelope: 10–50 MB** (2026-08-22, user) — the rough memory
  envelope for 0160's in-RAM capture buffers across all buckets. An envelope, not a hard
  budget; byte-accounting and per-bucket apportionment are 0160 design questions.
- **Flight-recorder day-one depths: last 100 MQTT messages, 25 HTTP exchanges, 100 xstate
  transitions, 50 log lines** (2026-08-23, user — intake 2026-08-22-0160 item d). These are
  config seeds, and the arithmetic they imply is worth carrying — in two parts, because the
  payload sizes above cover MQTT only. The **computable** term: 100 MQTT messages costs
  **1 MB typically and 5 MB at the worst-case payload size**. The other three buckets have no
  measured record size, so sizing them by analogy adds roughly 1.5 MB, for ~2.5 MB typical and
  ~6.5 MB worst — an estimate, not a fact. Either way memory is not the binding constraint at
  these depths; **history duration is**: 100 MQTT messages is about **two seconds** at the
  ~50 msg/s peak rate. Which xstate machines matter most, whether machine definitions carry
  `version`, and REST response-body sizes were not answered and remain assumptions.
- **Device hardware: desktop-class but low power, 6–16 GB RAM, contended between services**
  (2026-08-23, user — intake 2026-08-22-0160 item f). Makes 0160's guessed 10× de-rate of
  desktop-measured capture costs too pessimistic, though the answer gives a hardware class
  rather than a factor — so the spike measures rather than re-guesses. The RAM figure is generous
  against a tens-of-MB envelope, but the memory is shared with other services on the same
  RAM disk, so "there is plenty of RAM" is not a safe premise for any component that grows.
- **App build identifier at runtime: `major.minor.patch.full_commit_sha.hotfix_number`**
  (2026-08-23, user — intake 2026-08-22-0160 item e), where a standard build's hotfix number
  is 0 and increments monotonically per hotfix build. Stated in the future tense ("will be"),
  and the answer defines the **format** without confirming that page code can read it at
  runtime — which is the half that decides whether a build change is owed. So 0160's RD-7
  envelope stamp has a defined shape, and "readable by the bundle at runtime" stays a declared
  assumption; if it is not, `appBuild` needs a build-time define. Because the full commit SHA
  is embedded, a report is attributable to an exact tree.
- **A fleet-unique device identifier is available to page code** (2026-08-23, user — intake
  2026-08-22-0160 item i). Satisfies 0160's RD-7 instance identity: retried POSTs become
  deduplicable at the backend, same-device bundles can be joined across tabs and reloads, and
  absence-based crash detection has a key. The item also asked whether that id **may appear
  inside a report leaving the device**, and that half went unanswered — the same class of
  question item b left unruled, so it stays a declared assumption rather than a settled fact.
- **Two tabs at most, with distinct views** (2026-08-23, user — intake 2026-08-22-0160
  item j). So multi-tab is a live condition, not a hypothetical: per-device recorder memory is
  2× the envelope, two independent failure nets can report one device-level cause twice, and —
  because at most one tab holds the MQTT connection — the connectionless tab's empty MQTT
  bucket must be distinguishable from a quiet one. It also gives intake 2026-08-17-0150 item f
  its answer's shape: two concurrent tabs exist, so whatever enforces the single-connection
  invariant has to work at N=2.
- **An incumbent React error boundary already exists** (2026-08-23, user — intake
  2026-08-22-0160 item g). No incumbent `window.onerror` or `unhandledrejection` reporter was
  named, so 0160's global nets arm without a known conflict, but the React net should be one
  call inside the existing boundary rather than a second boundary the app must mount.
- **Redaction today is a key-name scrubber** (2026-08-23, user — intake 2026-08-22-0160
  item b): an existing function takes an object and scrubs the *values* of any key or
  sub-key whose name matches a list of strings. Two things follow, and the second matters
  more than the first. The mechanism maps exactly onto the `keys` rule form 0050 specified
  and 0160 adopts, so the recorder shares a rule shape the team already runs — deep key
  matching, no path or pattern rules needed to reach parity. But the question asked what
  *policy* governs what may leave the device — PII, credentials, who reads the reports,
  whether anything regulatory applies — and the answer describes a **mechanism**, not a
  policy. So no constraint has actually been ruled: 0160 keeps its conservative default and
  treats the key list as the current best expression of intent rather than as an approved
  disclosure boundary.
- **Web Workers are a scheduled goal, not current** (2026-08-23, user — intake
  2026-08-22-0160 item k): some code is expected to move to workers, with no date. So
  "everything is main-thread" is a **temporary** truth and must not be designed into anything
  as permanent. 0160 records it as exactly that and names the two costs a future bridge must
  pay — a recorder-global sequence cannot be stamped synchronously from a worker, and a
  worker's `performance.timeOrigin` differs from the page's — without designing the bridge.
- **An error-report HTTP endpoint exists; its payload schema is ours to define**
  (2026-08-22, user). 0160's recommendation authors the schema as a vendored OpenAPI
  contract so the 0010 pipeline generates its types and validators. **Particulars answered
  2026-08-23** (user — intake 2026-08-22-0160 item c): it is **cross-origin**, a **cloud
  service on infrastructure separate from the MQTT broker and the REST backend**, its
  **maximum payload size is negotiable**, and **no auth arrangement is defined yet** ("let's
  keep things flexible"). Four consequences. (1) Delivery independence is a *fact*: the
  report path does not share fate with the transport being diagnosed, which is the premise
  0160's question 10 had to assume. (2) Cross-origin means a CORS preflight on every
  contented JSON POST — acceptable for the triggered bundle, and it makes `Content-Encoding:
  gzip` free to *ask for* since the preflight is already paid. Note the item asked whether
  gzip is accepted and the answer covered only the size half, so whether the endpoint will
  decode compressed bodies is still open. (3) `sendBeacon` **cannot set
  request headers at all**, and cross-origin it is restricted to CORS-safelisted content
  types, so the last-gasp path must be `text/plain` with any credential carried in the body
  (or a `SameSite=None; Secure` cookie) — an auth design decided before the endpoint is
  built, not after. (4) A negotiable ceiling means 0160 should state the number it needs
  rather than discover it.
- Test framework: **vitest 4.1.9** (2026-08-14, user) — retires an assumption standing since
  Wave 2
- Approximate app scale (LOC or file count): 150,000 lOC
- Team size: ~50

## Vetoes and existing investments
- Existing team decisions that would disqualify candidates:
- **Snyk is already licensed and in use** (2026-08-14, user) — but the team reports not
  knowing how to configure or use it properly for this repository, and is "not really
  married to it". This is an existing investment rather than a veto, and it creates a live
  tension with D-0003, whose letter bars paid products while its rationale ("procurement is
  off the table") does not apply to something already bought. Ruling requested as intake
  [2026-08-14-supply-chain-gates](../intake/2026-08-14-supply-chain-gates.md) item d.
