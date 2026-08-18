# Design — 0150 durable-inbox (the inbox module over IndexedDB transactions)

The interface below is the judged output of a **design-it-twice panel**, per the vendored
[codebase-design skill](../../../../.claude/skills/codebase-design/SKILL.md) and its
[DESIGN-IT-TWICE](../../../../.claude/skills/codebase-design/DESIGN-IT-TWICE.md) pattern. Two
independent designs were produced in parallel under deliberately opposing constraints — *minimal
seam* and *broker-portable and self-asserting* — each returning a complete typed interface, its
go/no-go checks, and an account of what it could not prove. A separate judge compared them
against a stated default and produced this synthesis.

**Deviation from the canonical panel, stated up front**: DESIGN-IT-TWICE asks for three or more
variants under the named constraints (minimize entry points / maximize flexibility / optimize the
common caller / ports-and-adapters). This panel ran **two**. The reduction was deliberate and is
the one place this design cut a corner for the day's schedule (D-0039, "we need this spike
today"): the two constraints that actually pull this module apart are *how small can the seam be*
and *how much runtime self-assertion does a revocable guarantee need*, and the four canonical
constraints collapse onto those two here. A reader who thinks a common-caller or
ports-and-adapters variant would have changed the verdict should say so at the gate — the panel
is cheap to re-run.

## Problem space

**What the module is for.** An inbound MQTT message at QoS 1 must apply its effect and record its
identity in ONE IndexedDB transaction, and only then may the PUBACK be written. That turns
at-least-once delivery into effectively-once **across page reloads and tab crashes** — the case
the accepted in-connection packet-identity guard is structurally unable to cover, because MQTT
Packet Identifiers are per-connection slots released on acknowledgement.

**Fixed constraints, none of them negotiable by this module.**

- **mqtt.js 5.15.2, protocolVersion 4.** The PUBACK for an inbound QoS-1 message is written from
  inside the `handleMessage` callback. That callback is the *only* deferral hook at MQTT 3.1.1:
  `customHandleAcks` is stubbed out below MQTT 5, and `manualAcks` does not exist in this version.
- **The inbound pump is single-slot.** mqtt.js pulls one packet, invokes the handler, and waits
  for its continuation before pulling the next. Two consequences, and they point in opposite
  directions: [MQTT-4.6.0-2] receipt-ordered acknowledgement holds **by construction**, and every
  topic — including the ~34 non-durable ones — head-of-line blocks behind every durable commit.
- **MQTT 3.1.1 supplies no application-visible message identity.** No User Properties, no
  Subscription Identifiers, no session expiry. The durable key must come from the payload.
- **Sessions are `clean: false` with a persisted, device-scoped clientId**, on a static roster.
- **The broker is ActiveMQ Classic today and likely Mosquitto within 3–6 months** (D-0039). The
  two fail in opposite directions: ActiveMQ's durable subscriptions never drop and accumulate
  against disk, while Mosquitto defaults to 1000 queued per client and drops **newest**.
- **IndexedDB commits a transaction at the end of the microtask checkpoint.** Awaiting any
  non-IndexedDB promise inside one kills it, usually after a partial write has already landed.

**Dependencies, classified by [DEEPENING](../../../../.claude/skills/codebase-design/DEEPENING.md)
category** — this classification is what decides where ports go and where they must not:

| Dependency | Category | Consequence for this design |
|---|---|---|
| IndexedDB | **2 — local, substitutable** | An internal seam, not a port… **except** that the 0060 spike already named the IndexedDB escalation as the trigger for a real port ("the second adapter — introduce the port then, not before"). Two adapters now exist (`indexedDbInboxStore`, `memoryInboxStore`), so `InboxStorePort` is a **real** seam and not a hypothetical one. `fake-indexeddb` is *engine injection* into the one adapter, not a third adapter — hence `IndexedDbInboxOptions.factory`. |
| MQTT broker | **3 — remote but owned** | A port with a production adapter (`mqttjsBrokerPort`) and a test adapter (aedes in-process). |
| Clock | **3** | Injected as `now()`, so retention and latency are deterministic under test. |
| The app's effects | **1 — in process** | No adapter. The effect crosses as *data* (`EffectWrite[]`), which is what makes it committable. |

**Illustrative sketch — NOT the proposal.** The obvious shape, written out so the panel had
something concrete to reject:

```ts
// NOT THE PROPOSAL. Kept because its two defects drove the whole design.
policy = { durable: true, dedupeKey: (p) => p.id }
onMessage: async (packet) => {
  const tx = db.transaction(['inbox', 'state'], 'readwrite')
  tx.objectStore('inbox').add({ key: keyOf(packet) })
  await applyEffect(packet, tx)   // (1) caller-authored async INSIDE the transaction
  ack()                            // (2) ordering and stale-epoch left to chance
}
```

Defect (1) is the await-in-transaction footgun handed straight to ~50 engineers on very loose
TypeScript. Defect (2) acknowledges without asking whether the connection that delivered the
message still exists. Both are addressed structurally below rather than by documentation.

## Candidates considered

### minimal-seam (1–3 entry points, maximum leverage per entry point)

One optional field on the policy row, one new port, one widened return type. The projection is
**pure and synchronous by return type**, so it returns `{id, writes}` as data and the adapter
opens the transaction *after* it has returned.

```ts
type DurableProjection<T> = (payload: Validated<T>, params: TopicParams) => DurableEntry
interface DurableEntry { readonly id: string | null; readonly writes: readonly EffectWrite[] }
```

**Strongest point**: the footgun becomes unwritable rather than lint-policed — there is no
caller-authored code inside the transaction to put an `await` in. `async (p) => ...` returns
`Promise<DurableEntry>` and fails to compile.
**Weakest point**: effects must be expressible as a list of structured-cloneable writes computed
by a pure function, so read-modify-write effects (increment a counter, merge into a stored record)
are not expressible at all.

### broker-portable (self-asserting; every broker-dependent guarantee proven at runtime)

A `GuaranteeLedger` cataloguing each guarantee by tier — client / protocol / broker /
configuration / producer — with a `SequenceWitness` doing application-level gap detection, and a
`provenFloor` a caller can read.

**Strongest point**: it is the only variant that can *notice* Guarantee B lapsing — a producer
leaving MQTT, or a broker silently dropping the newest messages — which is the failure mode this
deployment is most exposed to and least able to see.
**Weakest point**: gap detection consumes a producer-supplied ordering stamp whose existence is an
open intake question, and the available in-process broker cannot exhibit any of the drop
behaviours the detector detects. Building the detector today means building it against a broker
that cannot falsify it, for a stamp that may not exist.

## Comparison

**Depth.** minimal-seam is the deeper module: its entire public delta is one policy field, one
port, one widened return type, one snapshot member and two error reasons, and behind that it hides
transaction scoping, duplicate suppression, retention pruning, schema migration, stale-epoch
acknowledgement, and bounded give-up. broker-portable adds five public types and a whole second
entry point, and much of that surface is *vocabulary the caller must learn* rather than complexity
the module absorbs — eight guarantee ids across four states and five tiers. Its own account of its
costs names the failure mode correctly: the first instinct on a dashboard full of `unproven` is to
default it to `holding`, which deletes the design.

**Locality.** minimal-seam keeps every decision where its information is. Retention lives on the
adapter constructor, because "how far back can a redelivery arrive?" is an operations fact and
MQTT 3.1.1 gives no derivable answer; the boundary's interface does not grow a dial whose right
value nobody in the front end knows. broker-portable spreads guarantee bookkeeping across the
ingest path, a new entry point, and the caller's dashboard.

**Seam placement.** This is decisive. D-0038 and the 0060 spike pre-authorized exactly two
extensions: a **policy-row addition**, and the **IndexedDB storage port**. minimal-seam spends its
entire surface inside those two. broker-portable spends most of its surface outside both, and one
of its elements — a `done` continuation crossing an accepted port — reshapes an interface this
track is supposed to cite rather than own.

**Verdict: minimal-seam, with seven grafts from broker-portable.** The grafts are small and each
fixes something minimal-seam got wrong rather than adding a feature: union arms instead of a
conditional constraint that would have moved the factory signature; `id: string | null` instead of
throwing into the pump; **bounded commit retry**, which matters most, because without a withhold
branch the "cannot lose" half of the claim has no client-owned mechanism at all; `cold` on
hydration; `reset(reason)` on the port; `epoch` on the packet rather than only on the link; and
`commitMs` percentiles plus `maxInFlight` instead of a single slowest-commit number.

**Rejected from broker-portable**: the `GuaranteeLedger`, the `SequenceWitness`, `provenFloor`,
the `done` continuation, and a second emitted event type. The cheap 80% of what the ledger buys is
recovered by **one comparison** — delivered `packet.qos` against the row's declared qos, both
directions, folded and warned once per channel. That ships. Sequence-gap detection is deferred
**deliberately and conditionally**: it is roughly sixty lines and no new port, and it should be
revisited on its own merits the moment intake item c comes back "every payload carries an ordering
stamp" — without the ledger.

## Chosen interface

The full typed surface is `src/policy.ts`, `src/ports.ts` and `src/status.ts`; the entry point is
`src/index.ts`. Rather than restate it here, this section records what a caller must know that the
types do not say.

### Invariants

- **I1** A durable projection runs only after `validate` succeeds. A malformed redelivery is a
  contract violation as usual, is **never deduplicated**, and is never applied — so it cannot
  double-apply.
- **I2** `commit` opens exactly one readwrite transaction spanning the identity store and every
  store named in `writes`, and awaits nothing but IndexedDB requests inside it.
- **I3** The identity record is written with `add()`, never `put()`. Suppression **is** the
  transaction — a ConstraintError aborts the whole transaction and discards the writes — so there
  is no check-then-write window and two concurrent writers cannot both win.
- **I4** A delivery with RETAIN set **bypasses the inbox entirely**: never recorded, never
  suppressed, always applied. A retained replay is the repair for the gap every reconnect creates
  ([MQTT-3.3.1-6]); suppressing it is the actively harmful case.
- **I5** The durable key is `<channel filter> + <concrete topic> + <producer id>`, the first two
  length-prefixed so no component can forge a boundary in the next. There is **no content-hash
  fallback**, at any point, for any reason.
- **I6** `id: null` is legal and loud: quarantined, acknowledged, warned once per channel, and
  applied nowhere.
- **I7** A schema bump drops the **effect** stores and keeps the **identity** store. Identities are
  opaque strings no contract change can invalidate, so a deploy costs a rehydration rather than a
  round of double-application.
- **I8** Guarantee B is never read by any code path. If the broker stops retaining, or the
  delivered QoS drops to 0, nothing branches — `suppressed` simply stops incrementing.

### Ordering constraints

- **O1** At most **one** `onMessage` call is in flight at a time. mqtt.js gives this for free; the
  memory adapter enforces it deliberately. This is why there is **no ordered ack-release queue**:
  with no concurrency there is nothing to reorder, and [MQTT-4.6.0-2] holds by construction over
  all traffic. *The smallest correct implementation of an ordering requirement turned out to be a
  prohibition rather than a mechanism.*
- **O2** The PUBACK is written only after the returned promise fulfils. No timeout, no watchdog.
- **O3** If the link's epoch changed between delivery and settlement, the continuation is called
  **with an error**, never bare. Bare would route the late PUBACK onto the client's outgoing queue
  and replay it on the next connection, where packet identifiers have been reassigned —
  acknowledging a *different* message and losing it silently.
- **O4** The continuation is never simply dropped. That stalls the inbound parser permanently and
  the keepalive detector tears the client down at 1.5× keepalive (45 s here).
- **O5** Hydration is guarded by the **ack**, not by withholding SUBSCRIBE. See Rationale.

### Error modes

`commit` rejects only with `InboxCommitError`, carrying `quota | closed | aborted | schema |
unknown`, and never rejects for a duplicate. Above the port, exactly two conditions withhold an
acknowledgement: the inbox is still hydrating, and a commit failed with attempts remaining. Every
other failure acknowledges — including bounded give-up after `MAX_COMMIT_ATTEMPTS`, because
ActiveMQ Classic has no redelivery cap and no DLQ on the MQTT path, so a message the inbox can
never commit would be redelivered forever and permanently wedge that subscription. All three new
telemetry reasons (`inbox-unavailable`, `qos-drift`, `durable-identity-missing`) are **class 1**
with a new reason and no fifth class, reusing D-0018's fold-and-warn-once shape.

### Performance notes

`InboxStatus` reports `commitMs` as `{p50, p99, max}` rather than a single number, because
everything on the connection queues behind each commit. `maxInFlight` reads **1** in every run,
and that is itself the finding: stock mqtt.js self-limits to one outstanding inbound message, so
the broker's in-flight window — 20 on Mosquitto, ~3,200 outstanding on ActiveMQ — is unobservable
from the client. Above 1 means the client was swapped.

### Usage sketch

```ts
const inbox = indexedDbInboxStore({
  databaseName: "app-inbox",
  effectStores: ["readings"],
  schemaVersion: 1,
  retentionMs: 24 * 60 * 60 * 1000, // chosen, not derived: 3.1.1 has no session expiry
});

const policies = {
  "plant/+/telemetry": {
    validate: isReading,
    direction: "in",
    qos: 1,
    durable: (p) => ({ id: p.id, writes: [{ op: "put", store: "readings", key: p.id, value: p.value }] }),
  },
} satisfies PolicyTable;

const pipeline = createPipeline({ policies, inbox });
const hydration = await pipeline.start();   // durable deliveries are withheld until this resolves
applyWrites(hydration.writes);              // ONE apply function, shared with live delivery
if (hydration.cold) reportBlindInbox();     // cannot suppress the replay it is about to receive
```

## Rationale

**Why the effect crosses as data.** It is the single decision everything else follows from. A pure
synchronous projection returning `EffectWrite[]` means the adapter opens the transaction *after*
the caller's code has finished, so there is no caller-authored code inside the transaction and the
await-in-transaction footgun has nowhere to happen. That converts a flaky test into a structural
guarantee — which matters here specifically, because `fake-indexeddb` 6.2.5 does **not** model the
auto-commit-at-microtask-checkpoint boundary, and its verdict on a foreign await was measured
flipping run to run. A hazard that cannot be reliably tested must be made unrepresentable instead.

**What it costs, honestly.** The app's state for durable topics becomes a projection of IndexedDB
rather than the source of truth, and read-modify-write effects are not expressible: an append is
recoverable as `put(\`${stream}/${seq}\`, item)` plus a read-side fold, a counter is not. If a
topic's effect calls another service or drives a state machine, that row cannot be durable and
there is no partial credit. This will be the first thing an engineer hits, and it will feel
arbitrary until they read this paragraph.

**Why hydration is guarded by the acknowledgement rather than by withholding SUBSCRIBE.** Both
panel variants got this wrong, and the correction is measured in `check-3`: on a **resumed**
`clean: false` session the broker replays its stored outgoing queue on CONNACK, *before any
SUBSCRIBE*, because the subscription is already in the session — not because this connection asked
for it. Emission order therefore cannot win the race. Rejecting while `state === 'loading'`
withholds the ack, so the broker keeps the message rather than the client applying it against an
unhydrated projection. Subscribe-withholding is kept as a belt for the *first* connection only.

**Why bounded retry rather than give up on the first failure.** Without a withhold branch, the
"cannot lose" half of the central claim has no client-owned mechanism and nothing to test. Three
attempts give a transient `QuotaExceededError` a second chance, cannot wedge the pump, and make
the poison case a real check. The give-up is bounded **per session** and not absolutely: the
attempt map is in memory, so a reload resets the count. Making it durable would put it inside the
transaction that is failing, which is circular — so the honest claim is the narrower one.

**What is deliberately not here.** Sequence-gap detection, a guarantee ledger, batching (mqtt.js
cannot hold two messages in the handler, so it is not merely unimplemented but foreclosed), and
any multi-tab coordination. The last is the largest gap and is named in findings.md rather than
papered over.
