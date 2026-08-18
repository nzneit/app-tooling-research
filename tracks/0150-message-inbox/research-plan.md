# 0150-message-inbox — research plan

**Status**: draft

## Goal

Decide whether, and in what shape, selected inbound MQTT streams should get the **inbox
pattern** — a durable record of a message's identity written in the *same* IndexedDB
transaction as the effect that message applies, so that at-least-once delivery becomes
effectively-once processing across page reloads and tab crashes. The track produces the
dedup-key design, the transaction scope, the retention and recovery policy, and the
adopt / adopt + wrap / build / skip verdict on the storage layer underneath. It starts from
0060's accepted transport boundary (D-0015) and 0070's accepted single-dispatch ingress
(D-0016), and it may extend those seams but owns neither.

## The null hypothesis this track must defeat first

**There may be no traffic for the durable half to act on.** 0060 assumption A-5 records
`clean: true` sessions, which is also mqtt.js's default. Under a clean session the broker
keeps no session state, so there is **no cross-reload QoS 1 redelivery** — redelivery exists
only *within* a live connection, and that case is already covered by the accepted in-memory
dedup guard (0060, pre-validation, keyed messageId + topic) and the ingress kit's LRU
(`dedupCapacity`, default 1024). If A-5 holds and no other duplicate source exists, the
honest verdict is **skip**, and the track's value is the recorded reasoning.

The report states this null hypothesis **before** comparing any storage candidate, and names
what defeats it: persistent sessions (`clean: false`), a clustered or bridged broker,
shared subscriptions, publisher-side retransmission, or an observed production incident.
Surveying storage tools first and discovering this in the recommendation is the failure mode
to avoid — it is seed-corpus category D (a search never checked for width) pointed at a
premise instead of a candidate list.

## Key questions

1. **What is the inbox for?** Three goals are routinely conflated and want different stores,
   retention, read paths, and failure costs: (a) suppressing duplicate *application* of a
   redelivered message, (b) surviving reload without a full refetch, (c) operating offline.
   The charter names (a). The report picks one as primary and states what it deliberately
   does **not** buy, before any candidate is compared.
2. **What is the dedup key, given that MQTT supplies none?** The protocol defines no
   application-visible unique message identifier. The Packet Identifier is a per-session
   reusable *slot* — it is released for reuse once acknowledged — so 0060/0070's
   `messageId + topic` key is correct within a connection and **structurally cannot survive a
   reload**. The fork is therefore: a producer-supplied idempotency key (a contract change,
   sibling to D-0019's stamp request) versus a canonicalized content hash (which needs a
   canonicalization scheme and inherits the hazards in question 3). This, not the storage
   library, is the track's decision.
3. **How does the key avoid suppressing deliveries that are not redeliveries?** Two are
   protocol-mandated and byte-identical to an already-processed message. Retained-message
   replay fires on every new subscription ([MQTT-3.3.1-6]) and mqtt.js defaults
   `resubscribe: true`, so every reconnect re-triggers it — and 0060 treats every reconnect as
   an unrecoverable gap, which makes the retained message *the repair*. Overlapping topic
   filters may legitimately yield one copy per matching subscription (3.1.1 §3.3.5). A
   content-hash key silently swallows both. Also settled here: QoS 0 has no redelivery
   identity at all — measured in the 0060 spike (`check-2::cannot dedup QoS-0 packets`) — so
   the report says whether QoS 0 is in scope.
4. **Atomicity or durability — which guarantee is actually being bought?** These are not the
   same purchase on the stated browser matrix. IndexedDB *does* give all-or-nothing commit
   across object stores on both engines. It does *not* give a flush guarantee: Firefox has
   been relaxed since 40 and exposes no `durability` option below 126 (the stated floor is
   ~124), Chromium's default moved to relaxed in the 121–122 range, and Chrome's own
   documentation says `strict` "does not ensure that changes are actually written immediately
   to disk". The report states the guarantee in terms it can buy and must not sell power-loss
   safety. It also pins the shipped-behaviour source for the Chromium milestone rather than
   the pre-ship intent source — the two disagree, and both are in circulation.
5. **Where does the inbox sit relative to parsing and validation, and what is hashed?** Raw
   wire bytes before Ajv dedups malformed redeliveries too and needs no canonicalization, but
   keys on bytes the app may never understand. The parsed, canonicalized object after Ajv
   needs a canonicalization scheme and opens a window where a validated-but-not-yet-recorded
   message can be applied twice.
6. **What is the transaction scope, and is there anything to be atomic with?** The pattern
   requires the key write and the effect write to share one transaction. If effects land only
   in in-memory Zustand/xstate state, there is **nothing to be atomic with** and the pattern
   degrades to a durable seen-set — a materially smaller design that the report must name as
   such rather than describe as an inbox.
7. **What does this cost at 50 msg/s, and does it fit the accepted pipeline?** The 0060
   ingress pipeline is fixed and synchronous — one JS turn, riding Zustand's synchronous
   commit for atomicity — and was benched above 1k msg/s in Node. IndexedDB is asynchronous
   and its per-transaction cost is dominated by the durability flush (Nolan Lawson measured
   1,000 single-record transactions at 10,456 ms strict versus 631 ms relaxed in Chrome 92).
   So: one transaction per message, or batching? Batching trades atomicity granularity and
   latency for throughput, and the report must price both. Note the prior deviation already on
   record — the kit *initiates* `cancelQueries` and writes in the same turn because awaiting it
   would break the one-turn invariant; an awaited IndexedDB commit is the same problem, larger.
8. **What is the read path at startup, and what may not happen until it finishes?** Does the
   dedup set load wholesale before the first dispatch, or does each message pay a `get` on the
   hot path? And must subscription be withheld until the load completes — because subscribing
   first means the first redelivered messages race an empty set and are processed as new,
   which is the exact failure the track exists to prevent.
9. **What happens when the schema changes under a persisted store?** Contracts are vendored and
   change between deploys. Is the store tagged with a contract version and dropped wholesale on
   mismatch, stored as raw bytes plus a version tag, or a parsed projection that a schema change
   invalidates silently? Include the mixed-version deploy: two tabs on different app versions
   share one origin database and one `versionchange` event, which blocks until every other
   connection closes.
10. **Multi-tab: who owns the inbox?** Tabs share one IndexedDB but hold independent MQTT
    connections, so one logical message can arrive twice into one shared store. 0060 dismissed
    coordination on assumption A-13 ("no multi-tab coordination requirement exists") and flagged
    it as reopening if tabs share a connection — durable storage is cross-tab by construction,
    so this track reopens it. Which primitive: Web Locks (crash-safe handoff, no lease or
    heartbeat, FIFO per resource) or BroadcastChannel? Note both an open IndexedDB connection
    and a held Web Lock forfeit back/forward-cache eligibility.
11. **Retention, compaction, reset, and poison recovery.** How far back must a duplicate be
    recognised, and what prunes the store? Persistence removes "reload fixes it" as an escape
    hatch permanently, so the report specifies what clears the inbox, who can trigger it, how a
    corrupt store is *detected*, and what the app does meanwhile. Storage eviction is
    whole-origin and LRU by default; `navigator.storage.persist()` prompts the user in Firefox.
12. **Which way is the design biased, and how is "working" distinguished from "never firing"?**
    The failure modes are asymmetric. A false negative reproduces today's behaviour. A false
    positive silently drops real work, raises no error, and now survives the reload that used to
    fix it. The design should be biased toward false negatives, and the report should require a
    dedup-hit counter on 0060's existing telemetry wire.
13. **Adopt or build, and what would an adopted engine be paid for?** Every surveyed sync engine
    either requires a companion server the front-end team does not control, gates the relevant
    storage behind payment, or states outright that duplicate handling is the application's
    problem. The honest shape may be "build on one thin wrapper" — the report says explicitly
    what a heavier dependency would buy.
14. **Is the await-in-transaction footgun controlled by runtime error, by review discipline, or
    by static rule?** IndexedDB commits a transaction as soon as it goes unused within a tick,
    so awaiting any foreign promise inside one kills it. Dexie fails loudly
    (`PrematureCommitError`); `idb` documents the rule and leaves it to you. A third option
    exists and is already this repo's own mechanism: an oxlint `no-restricted-syntax` rule
    (D-0002, with D-0020's override-restatement rule applying). Very loose TypeScript
    strictness, high agent-authored churn, and ~50 engineers argue against the discipline option.
15. **How is the central claim falsified?** The claim is "a crash between applied and recorded
    cannot double-apply." `fake-indexeddb` is an in-memory reimplementation of exactly the
    auto-commit and durability timing under test, so it can confirm the design's shape and never
    its guarantee. Neither prior spike reached a real browser. Does this track require a
    real-browser lane (0120's harness, or `@vitest/browser`), and if none is reachable under
    D-0001, does the report say plainly that its central claim is unverified?

## Seams this track cites rather than restates

Owned elsewhere and **not reopened here**: the four-class error taxonomy and the quarantine
ring's shape (0060 KQ3/KQ4, D-0015); the fixed ingress pipeline order and its bounded-queue
shedding invariant (0060 spike design.md, O1/I9); the single-dispatch ingress and the
monotonic guard's `(stream, entity)` keying, which is **ordering authority and not identity**
and must not be conflated with a dedup key (0070 KQ7, D-0016); the abort/cancellation contract
(D-0018); the `no-restricted-imports` layering rule and its restatement requirement (D-0002,
D-0020).

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

## What this track does not decide

The **outbound half** — durably queuing messages this client publishes — is out of scope. But
both halves land in one origin's IndexedDB, at one schema version, under one eviction, quota,
multi-tab, and worker decision. The report therefore **reserves** that space and makes those
shared calls once; otherwise the deferral becomes a rewrite. Also out of scope: reopening the
quarantine ring's no-replay rule for inbound contract violations (0060 KQ4), except to note
whether a durable store changes its cost.

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

**Prior art, not adoptable**: workbox-background-sync and Sentry's offline transport (both
outbox-shaped, neither deduplicates); y-indexeddb and automerge-repo's IndexedDB adapter
(content-keyed writes and compaction thresholds); MassTransit, NServiceBus, and Kafka's
transactional consumer (the pattern's invariants, all keyed on a producer-supplied id).

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
- The mqtt.js ack seam is protocol-version-dependent: `manualAcks` does not exist, and
  `customHandleAcks` is silently replaced by a no-op unless `protocolVersion === 5` (the default
  is 4). Overriding `handleMessage` works on both. Do not describe a seam the library lacks.
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

Beyond the standing gaps in `facts/app-profile.md` (the whole Contracts section; reconnect
frequency), this track's questions are raised in
[intake/2026-08-17-0150-inbox-facts.md](../../intake/2026-08-17-0150-inbox-facts.md). The four
that gate the survey rather than colour it:

- **Session mode** (`clean: true` or `false`) — decides whether the null hypothesis stands.
- **Which streams, and are their effects idempotent?** Only non-idempotent effects need an inbox.
- **Is there a stable per-message identifier in any payload today**, and can one be added?
- **Where do effects currently land** — durable storage, or in-memory state only? If in-memory
  only, there is nothing for the key write to be atomic with.
