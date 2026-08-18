# Findings — durable-inbox

**Status**: complete
**Track**: [0150-message-inbox](../../research-plan.md)
**Authority**: D-0039 — this spike ran **before** 0150's survey and report, on user directive.
There is no `report.md` to link yet; these findings are an input to the one that still has to be
written, not a substitute for it.
**Date started**: 2026-08-18

Interface authority: [design.md](design.md), "Chosen interface".

Environment for every number below: Node **v24.18.0**, darwin/arm64, vitest **4.1.10**, typescript
**7.0.2**. Resolved dependencies — runtime: `mqtt@5.15.2`; dev: `aedes@1.1.1`, `ws@8.21.3`,
`@types/ws@8.18.1`, `fake-indexeddb@6.2.5`, `playwright@1.62.1`, `esbuild@0.28.2`,
`@types/node@26.2.0`. Playwright's Chromium headless shell is an **out-of-tree ~215 MB download**
into `~/Library/Caches/ms-playwright` — `npm ci` alone does not reproduce this environment; run
`npx playwright install --only-shell chromium`.

Suite: **32 tests, 5 files, all green**; `npm run typecheck` clean, no leaked handles across
repeated runs.

**Three lanes, and only one of them can falsify the central claim.**

| Lane | What it is | What it can prove |
|---|---|---|
| node + fake-indexeddb | in-memory reimplementation of IndexedDB | storage **logic** — atomicity, rollback, `add()`/ConstraintError as the dedup primitive, schema migration. **Never** commit semantics or durability. |
| node + aedes | real broker, real mqtt.js, real wire | the deferral **mechanism** — ack timing, receipt ordering, withhold→redelivery, offline replay. Not the production brokers' backpressure. |
| real Chromium | `launchPersistentContext` + SIGKILL | the **central claim**, and nothing else in this spike can. |

## Checks

| Check | Verdict | Evidence |
|---|---|---|
| **check-10 (decisive): a crash between applied and recorded cannot double-apply** | **go** | `test/check-10-crash.test.ts`. Real Chromium via `chromium.launchPersistentContext`, real process death by `SIGKILL` to every PID matching `user-data-dir=<profile>`, then relaunch of the same profile and a read. The page is served from a **fixed-port local http origin** held in the test process, because IndexedDB is keyed by origin and `about:blank`/`file://` are opaque — a store written under one is unreadable after restart. The **real `src/` adapter** runs in the page: esbuild bundles `test/browser-entry.ts`, which imports `src/adapters/indexeddb-inbox.ts`. Crash offsets 150/300/500/800 ms into a 3000-message run. Run 1: `effects=identities` at **16/16, 343/343, 738/738, 1387/1387**. Run 2: **20/20, 274/274, 708/708, 1422/1422**. Never once `effects > identities` — i.e. never an effect that survived without the identity that would suppress its redelivery. |
| **check-10 negative control: the test can detect the bug it rules out** | **go — and this is the load-bearing half** | Same file, same rig, against a deliberately **two-transaction** implementation (effect committed, gap, identity committed) with the window widened to 400 ms. Result: **effects=2, identities=1** — the split reproduced, on both runs. A crash test whose control does not split proves nothing, and the verified precedent is exact: with random 0–40 ms offsets an earlier attempt returned **zero splits across every trial of both variants**, a uniformly clean result that reads as a pass. The assertion is written so that a non-splitting control **fails the test**. |
| Identity + effect commit atomically; duplicate suppressed across close/reopen | go | `test/check-1-atomicity.test.ts` (7 tests). Three deliveries of one key → `applied, duplicate, duplicate`; after `close()` and reopen on the same engine, the fourth is still `duplicate` with `identityCount: 1`. `::a suppressed duplicate does NOT re-apply its writes` commits the same key with a *different* value and reads back the **first** value after reopen — if suppression were a cache consulted beside the write rather than the transaction itself, the second would land. |
| Two concurrent writers of one key → exactly one apply | go | Same file. `Promise.all` of two commits on the same key yields exactly one `applied` and one `duplicate`. This is `add()` + ConstraintError doing the work: there is no check-then-write window to lose. |
| Schema bump drops effects, keeps identities (S4) | go | Same file. v1→v2: `reset: true`, `writes: []`, `identityCount: 1`, and the retained key still suppresses. A contract change costs a rehydration, not a round of double-application. |
| Cold-store reporting (the eviction blind spot) | go | Same file. A fresh store reports `cold: true`. A cold inbox cannot suppress the replay it is about to receive; the design reports that blindness rather than reading it as health. |
| PUBACK written only AFTER the commit resolves (A1) | go | `test/check-3-real-broker.test.ts`, real aedes + real mqtt.js. A gated commit holds the message 250 ms with **zero** PUBACKs observed at the broker's `ack` tap; releasing the gate produces exactly one. |
| **[MQTT-4.6.0-2] receipt-ordered acknowledgement** | go | Same file. Six messages with commit latency deliberately **inverted** against arrival order (first is slowest, 90 ms → 15 ms). PUBACK messageIds arrive strictly ascending. `maxInFlight === 1` — see Deviations, this is a finding rather than a pass. |
| A withheld ack leaves the message with the broker, which redelivers it | go | Same file. An injected commit failure → `failed: 1`, **zero** PUBACKs; reconnect on the same `clean:false` session → redelivered, committed, `applied: 1`. This is the "cannot lose" half, exercised end to end. |
| Offline QoS-1 backlog retained and replayed (Guarantee B) | go, against aedes | Same file. Disconnect, publish 8 while offline, reconnect → all 8 applied, `suppressed: 0`. |
| **Replay after a reload is suppressed** | go | Same file. A message applied by one pipeline, then the client destroyed and a **new** pipeline built over the same durable store: the republished message yields `suppressed: 1`, `applied: 0`, and **no delivered event**. This is precisely the case the connection-scoped `messageId + topic` guard is structurally unable to cover. |
| **Hydration is protected by the ack, not by withholding SUBSCRIBE** | go — and it **corrects both panel designs** | Same file. On a **resumed** `clean:false` session the broker replays its stored queue on CONNACK with `subscribeLog.length` unchanged — no SUBSCRIBE was issued by that connection at all — so emission-order guards cannot win the race. With `state === 'loading'` the deliveries are rejected: `applied: 0`, **zero** PUBACKs, broker still owns every message. |
| Retained delivery bypasses the inbox (D5, [MQTT-3.3.1-6]) | go | `test/check-2-ingest.test.ts`. Two retained deliveries of one id → **2** delivered events, `suppressed: 0`, `applied: 0`. A retained replay is the repair for a reconnect gap; suppressing it is the actively harmful case. |
| Delivered-QoS drift detected both directions, warned once (Q18) | go | Same file. Five QoS-0 deliveries on a declared-QoS-1 row → `qosDrift: 5`, `applied: 5` (the message still takes the durable path — it still buys Guarantee A), and exactly **one** class-1 telemetry envelope. The inverse — QoS 1 on a declared-QoS-0 row — also fires, which is how the next durable candidate announces itself. No fifth error class was minted. |
| Overlapping filters each apply once; one id on two topics is two messages (Q17, Q13) | go | Same file. Two channels matching one concrete topic each apply exactly once (§3.3.5). The same producer id on `plant/p1/…` and `plant/p2/…` applies **twice** — the chosen bias: including the concrete topic can only split keys, producing a false negative (apply twice) and never a false positive (silently drop real work). |
| `id: null` and over-long ids are legal and loud | go | Same file. `identityMissing: 1`, quarantined `durable-identity-missing`, **acknowledged**, never applied. An id above `MAX_ID_LENGTH` is refused with `rejection: 'too-long'` — that shape is a stringified payload being used as a content hash, which is the one key shape this design refuses. |
| A malformed redelivery is never deduplicated and never applied (D1) | go | Same file. `applied: 0`, `suppressed: 0`, one quarantine entry. |
| Bounded retry, then bounded give-up, never wedging the connection | go | Same file. Transient arm: attempts 1–2 reject with `inbox-commit-failed:quota:attempt-N`, attempt 3 applies, `givenUp: 0`, state back to `ready`. Poison arm: after `MAX_COMMIT_ATTEMPTS` the message is **acknowledged and lost**, `givenUp: 1`, quarantined `inbox-unavailable` — and non-durable traffic still flows immediately afterwards. |
| `durable` + `qos: 0` / outbound / no-qos are **unrepresentable** (Q17) | go | `test/check-4-illegal-rows.test.ts`. Four `@ts-expect-error` directives over union-arm violations; `tsc --noEmit` **is** the assertion and reports no TS2578, so every directive is a live error today. |
| **The await-in-transaction footgun is unwritable, not lint-policed** (Q15) | go | Same file. `durable: async (p) => ({...})` returns `Promise<DurableEntry>` and fails to compile. There is no caller-authored code inside the transaction to put an `await` in, because the projection returns data and the adapter opens the transaction afterwards. |
| Dedup key composition and its rejections | go | Same file. `inboxKey('plant/+/telemetry','plant/p1/telemetry','m1')` → `17:plant/+/telemetry18:plant/p1/telemetrym1`; the length prefixes are shown to prevent the `("ab","c")` vs `("a","bc")` collision; every malformed input returns a result and **never throws** into the inbound pump. |

## Deviations

- **The design panel ran two variants, not the canonical three-plus.** DESIGN-IT-TWICE names four
  constraints; this panel used two (minimal-seam, broker-portable) chosen as the two that actually
  pull this module apart. Stated in design.md rather than glossed. The panel is cheap to re-run if
  the gate thinks a common-caller or ports-and-adapters variant would have moved the verdict.
- **`durability: 'strict'` is NOT verified and cannot be, by this method.** The groundwork measured
  strict/relaxed/default surviving SIGKILL **identically** (2000/2000 rows at 118/124/128 ms),
  because SIGKILL leaves the OS page cache intact — it tests browser-process death, not `fsync`.
  Discriminating strict from relaxed needs a forced VM power-off or a fault-injection filesystem.
  The design ships `'default'` and records `tx.durability` for observability; the claim this spike
  supports is **process-crash** durability, which is the crash the track is actually about.
- **`fake-indexeddb` 6.2.5 does not model the auto-commit boundary**, and its verdict on a foreign
  `await` inside a transaction was measured **flipping run to run**. A single probe on this machine
  threw `InvalidStateError`; that is not reproducible enough to test against. This is exactly why
  the design makes the hazard unrepresentable instead of covering it — and why every
  node+fake-indexeddb row above confirms the design's **shape** and never its **guarantee**.
- **aedes cannot punish deferred acknowledgement.** It has no in-flight window, no queue cap and no
  drop policy, so the two behaviours most likely to falsify per-message deferral in production —
  Mosquitto's 20-message in-flight window and 1000-message newest-drop, ActiveMQ Classic's ~3,200
  outstanding — are **not exercised at all**. A green broker lane means the mechanism works
  against aedes.
- **aedes resembles Mosquitto, not ActiveMQ.** It restores subscriptions on a `clean:false`
  reconnect without a resubscribe and sets `sessionPresent` correctly — both of which ActiveMQ
  Classic does *not* do. The Node lane therefore naturally tests the **post-migration** world;
  ActiveMQ's deviations would have to be simulated deliberately and were not.
- **One upstream aedes defect was designed around rather than hit**: aedes silently drops QoS-1
  messages when QoS-0 traffic shares the same client (moscajs/aedes#994, open — a per-client
  `brokerCounter` high-water mark in `dedupe()`; measured at 0 of 20 delivered). Every broker test
  keeps QoS-0 traffic on a separate clientId. Had it not been, the spike would have reported a
  **false failure of the inbox design**.
- **`maxInFlight` reads 1 in every run, and that is the finding.** mqtt.js 5.15.2's inbound pump is
  single-slot, so the client self-limits to one outstanding inbound message and the broker's
  in-flight window is **unobservable from the client**. Reported precisely so its uninformativeness
  is on the record rather than mistaken for a pass. It also means **batching is foreclosed**, not
  merely unimplemented: the handler cannot hold two messages, and `manualAcks` does not exist in
  this version.
- **The union-arm diagnostic is poor, and it was measured rather than predicted.** An illegal row
  produces `TS2322: … Type 'DurableProjection<Reading>' is not assignable to type 'undefined'`,
  reported at the **declaration** rather than the offending property. It names `undefined` — from
  the `durable?: never` arm — instead of the rule the engineer broke. Correct, nearly unreadable,
  and a real cost under high agentic churn on loose TypeScript. It is the price of not moving the
  accepted factory signature to police a policy-row addition. The alternative (a conditional
  constraint on the factory) buys a readable message and reshapes an accepted interface.
- **`idb` and Dexie were not compared here.** The adapter is raw IndexedDB. The groundwork reports
  working two-store implementations of all three, so the choice is believed not to be load-bearing,
  but this spike did not run that comparison and the survey must not read "raw" as a conclusion it
  reached.
- **`test/aedes-broker.ts` is a copy of the 0060 spike's harness, not an import.** D-0017 forbids
  imports across the spike boundary. Three additions: persistent-session support, a PUBACK wire tap
  (the [MQTT-4.6.0-2] witness), and a null guard on the `ack` event — aedes emits `ack` with a null
  packet when a PUBACK arrives for a retired messageId, which this design produces deliberately
  every time a stale-epoch ack is discarded.

## What went unverified

Named rather than omitted, because a green suite invites the opposite reading.

1. **The crash and the broker together.** The crash lane is a real browser with no broker; the
   broker lane is Node with no browser. "Tab killed mid-commit while a PUBACK is deferred, then the
   broker redelivers on reconnect" is verified as two halves that are never joined — and the join
   is where a real deployment would fail. This is the cheapest of these gaps to close.
2. **Guarantee B against either broker that will actually run it.** See Deviations.
3. **Power-loss durability at any setting.** See Deviations.
4. **Multi-tab, in any form.** Two tabs on one origin database, a `versionchange` blocked by a
   second connection, leader election, and the link-stealing war two tabs presenting one
   device-scoped clientId would produce. The design's claim is narrow — `add()` inside the
   transaction makes concurrent *writers* safe — and check-1 tests exactly that and nothing more.
5. **Whole-origin eviction.** Chromium per-bucket LRU when storage is not persisted, Safari's
   7-day no-interaction wipe, and whether `navigator.storage.persist()` is granted on the target
   platform. Any of them empties the inbox out of band and produces exactly the double-application
   this track exists to prevent, arriving from the storage side. `cold` reports the blindness after
   the fact; nothing here measures how often it happens on a real fleet.
6. **Whether the app's payloads carry a stable per-message identifier at all.** Every fixture
   payload has an `id` by construction, so a green suite says nothing about it. This is intake item
   b, and it decides whether any topic can be declared durable.
7. **Production cost on the app's hardware and browser matrix.** Commit latencies here come from a
   headless shell on one machine, and the Node lane's latencies are scripted rather than measured.

## Decision impact

- **The central claim survives falsification, and the falsifier works.** This is the one thing the
  survey could not have produced and the report should lead with. It is a *process-crash* claim,
  under `durability: 'default'`, in Chromium.
- **Both pre-authorized extension points held.** The whole change is one policy field plus one
  storage port; the accepted factory signature did not move, and no accepted interface was
  reshaped. The 0060 spike's "introduce the port then, not before" trigger has now fired, correctly.
- **Question 15 is answered by shape, not by tooling.** No oxlint rule is needed for the
  await-in-transaction hazard, because a pure synchronous projection leaves nowhere to put an
  `await`. That is a better answer than the rule the plan proposed, and it is cheaper.
- **Question 17 is answered**: `durable` + `qos: 0` is unrepresentable via union arms, at the cost
  of a poor diagnostic, which is recorded rather than hidden.
- **Question 18 is answered cheaply**: one comparison, both directions, folded and warned once, no
  fifth error class. Sequence-gap detection stays deferred — and the deferral is only defensible
  while intake item b is unanswered. If every payload turns out to carry an ordering stamp, it is
  ~60 lines and no new port, and it should be revisited on its own merits.
- **A correction to both panel designs, and to the plan**: hydration is protected by withholding
  the **acknowledgement**, not by withholding SUBSCRIBE. On a resumed session the backlog arrives
  on CONNACK regardless of what this connection subscribed to.
- **The head-of-line cost is not tunable away.** One in-flight message is how [MQTT-4.6.0-2] is
  satisfied without a release queue, and it is the same serialization the production client already
  has. If measured p99 commit latency lands above ~20 ms, the answer is the never-block fallback,
  not batching — batching is foreclosed by mqtt.js 5.15.2.
- **What this does not settle**: the adopt / adopt+wrap / build / skip verdict, the storage-library
  choice, and the track's acceptance. D-0039 is explicit that this spike does none of those.
