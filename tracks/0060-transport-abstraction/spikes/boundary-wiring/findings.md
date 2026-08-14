# Findings — boundary-wiring

**Status**: in progress
**Track**: [0060-transport-abstraction](../../research-plan.md)
**Report**: [report.md](../../report.md)
**Date started**: 2026-08-14

Interface authority: [design.md](design.md), "Chosen interface". The MQTT leg,
both wires, the policy table, the quarantine ring, the normalizers and the bench
are built and checked here; the REST leg (orval mutator, per-status zod,
layering lint) is the next task's and only its seam surface exists so far.

Environment for every number below: Node v24.18.0, darwin/arm64, vitest 4.1.10,
typescript 7.0.2. Resolved dependency versions: `mqtt@5.15.2`, `xstate@5.32.5`,
`mqtt-pattern@2.1.1`, `aedes@1.1.1` (dev), `ws@8.21.3` (dev),
`@types/ws@8.18.1` (dev), `ajv@8.20.0` (dev). `websocket-stream` was **not**
needed — `ws`'s own `createWebSocketStream` gives aedes the Duplex it wants.

Suite: **58 tests, 11 files, all green**; `npm run typecheck` clean. The
real-broker tests (aedes over ws + mqtt.js, in-process) close every server in
`afterEach`; vitest exits 0 with no leaked handles across repeated runs.

## Checks

| Report check | Verdict | Evidence |
|---|---|---|
| Reconnect edges: `reconnecting` → recovery, and bounded give-up → `degraded` with publish gating | go | Real broker. `test/check-1-reconnect.test.ts::goes reconnecting when the server socket dies and recovers on restart` — aedes stopped (listener closed + every socket terminated) → snapshot `reconnecting`, `attempt >= 1`; aedes restarted on the same port → `connected`, `attempt` back to 0. `::gives up after bounded retries into degraded, gates publish, and re-arms on reconnect()` — `maxAttempts: 3`, `backoffMs: 150` → `degraded`, `publishGated: true`, `attempt: 3`, `degradedSince` set; `publish` while degraded rejects class-1 `publish-gated`; restarting the broker does **not** silently recover (give-up ended the adapter's retry loop), and only `reconnect()` re-arms → `connected`. Deterministic twin on the memory adapter + `SimulatedClock`: `::counts exactly maxAttempts backoff windows before degrading` (5 windows → degraded) and `::queues publishes while reconnecting and flushes them on recovery` (depth 1 while reconnecting, flushed to `plant/p9/command` on reconnect). |
| Offline-window resubscribe + redelivery dedup (mqtt.js #909) | go (with a recorded deviation on how the duplicate is produced) | Real broker. `test/check-2-offline-dedup.test.ts::resubscribes after reconnect and dedups a redelivered packet` — real offline window (aedes stopped, mqtt.js `reconnecting`, aedes restarted), resubscribe observed **broker-side** in aedes's `subscribe` event (`subscribeLog.length` 1 → 2, filter `plant/+/telemetry` both times); a packet replayed with the same `(topic, messageId)` and `dup: true` twice produces exactly **one** dispatch and **zero** extra quarantine entries. `::dedups on packet identity, not payload content` — two genuinely distinct QoS-1 packets with identical bodies both deliver (the guard is not over-eager). Memory adapter: `::passes exactly one dispatch when the adapter duplicates a QoS-1 packet` (3 injected duplicates → 1 dispatch, 0 quarantine) and `::cannot dedup QoS-0 packets (no messageId) and says so by delivering both`. |
| Non-blocking pump under flood (mqtt.js #1935) | go | `test/check-3-pump.test.ts::caps the delivery queue, quarantines overflow, and dispatches nothing on the pump` — 200 packets, 30 us synchronous validator, 50 us listener, `delivery: 16`: **zero** listener calls during the synchronous flood (dispatch is off the packet pump), `depths.delivery` pinned at 16, 16 delivered + 184 shed = 200 accounted for, every shed packet quarantined class-1 `queue-overflow`, one leading-edge telemetry event and one folded summary with `count: 184`, connection stays `connected`. Real broker: `::keeps the mqtt.js client connected while a slow consumer sheds` — 300 QoS-1 packets enqueued into aedes in one synchronous turn, 300 us listener, `delivery: 8`. Asserted, not merely logged: `delivered + shed === 300`, `shed > 0`, `peakDepth === 8` (the configured bound), connection stays `connected` and never enters `reconnecting` or `degraded`. Stable across 5 consecutive runs at exactly **24 delivered / 276 shed / peak 8-of-8**. |
| Policy table (mqtt-pattern over AsyncAPI-style keys); unknown topic → class 4 + quarantine | go | `test/check-4-policy.test.ts` (9 tests). `::matches an AsyncAPI-keyed channel and extracts named wildcards` — `plant/{plantId}/telemetry` matches `plant/plant-7/telemetry` with `params {plantId: 'plant-7'}`; the broker filter is the cleaned `plant/+/telemetry`. `::routes an unknown topic to class 4 + quarantine, and to no wire-1 message`. `::treats an inbound packet on an outbound-only channel as unroutable`. `::fills the publish topic from the channel key + params` → `plant/p42/command`. `::validates outbound payloads against the same validator (I7)`. `::throws plain Errors on programmer error` and `::rejects the factory synchronously on invalid configuration` (bad scheme, empty table, non-positive bound). |
| `reasonCode` channel: class-3 on telemetry **and** the typed message event (I2) | go | `test/check-4-policy.test.ts::constructs class-3 on a reasonCode channel WITHOUT suppressing message.* (I2)` — a valid `plant/p3/status` payload fires `message.plant/{plantId}/status` with the full validated payload **and** a `ReasonCodeError` on the wildcard telemetry tap (`class: 3`, `status: null`, `body {code: 'E_OVERTEMP', detail: 'sensor 2'}`), with no quarantine entry. `::keeps the choke-point order on a reasonCode channel` — an invalid payload on the same channel is class 2, quarantined, no message event, and `select` never runs (zero class-3 telemetry). |
| Quarantine ring + normalizers over real Ajv errors; deduped four-class telemetry on the `'*'` tap | go | `test/check-5-quarantine-normalizers.test.ts` (8 tests). Ring: `::evicts the oldest entry at capacity` (cap 3, 5 rejects → oldest two evicted, oldest-first order preserved). Normalizers over **real** ajv@8 output: `::normalizes a real ajv@8 error array into the one issue shape` compiles a schema, feeds `{tempC: 'hot', extra: 1}`, and normalizes the actual `validate.errors` (`keyword`/`schemaPath`/`instancePath` present) — Ajv's empty `instancePath` becomes `/`, never `""`. `::carries the real Ajv error array as the class-2 evidence, through the public interface` — the quarantined error's `raw` is a **shallow copy** of `validate.errors` holding the same `ErrorObject` instances (Ajv reuses and overwrites that array on the next call, so the copy is what makes the evidence survive; the error objects themselves are untouched). `::produces the identical issue shape from a Zod-shaped error` (structural; a real `ZodError` lands in Task 6). Telemetry: `::folds repeats by dedupKey inside the window and emits one summary at close` — 5 identical rejects → 5 quarantine entries but **1** emission (`count: 1`), then one summary with `count: 5` when the window closes. `::surfaces all four classes on the one wildcard tap` — classes 1, 2, 3 and 4 all observed through `actor.on('*')`. `::keeps the normalizers off every public entry point` — `fromAjvErrors`/`fromZodError`/the class constructors are absent from all three entry points; `/errors` exports exactly the five guards + `retryOnlyTransient`. |
| Non-JSON ingress on the MQTT leg (ts-rest #789 lesson, I11) | go | `test/check-6-non-json.test.ts` (8 tests). Invalid UTF-8, a binary blob, valid-UTF-8-but-not-JSON, an empty payload and truncated JSON each become class-4 `undecodable` + quarantine with the raw bytes retained, and **never** a wire-1 message. `::separates 'decoded but wrong' (class 2) from 'could not decode' (class 4)` — `42`, `null`, `[1,2,3]` and a wrong-shaped object all decode and then fail the contract as class 2, so nothing is silently skipped and the two failure kinds stay distinguishable. `::never lets a bad payload starve a good one behind it`. Real broker: `::quarantines a genuinely binary MQTT payload as class 4` — a binary QoS-1 publish through aedes is quarantined and a following good payload still arrives on the same connection. |
| Two-wire surface (I4) | go | `test/check-7-two-wire.test.ts` (5 runtime tests + a compile-time block). Wire 1: `::delivers the typed message event and nothing about the connection` — event keys are exactly `channel/params/payload/topic/type`; a connection drop produces nothing on this wire. Wire 2: `::projects connection state and depths, and never a message payload` — no `payload`/`topic`/`params` key on any snapshot, the serialized snapshot never contains `tempC`, and `getSnapshot()` equals the last notification (O6). `::feeds both wires from the one ingress` — one delivery raises `depths.delivery` to 1 on wire 2 *before* the microtask dispatch, then the wire-1 event fires and the depth returns to 0. `::notifies wire 2 on change only`. Type level (`tsc --noEmit` is the assertion, via `@ts-expect-error` in `_neverCrossTheWires`): `ev.connection` / `ev.publishGated` / `ev.depths` are errors on wire 1, `s.payload` / `s.topic` / `s.params` are errors on wire 2, the `'*'` union must be narrowed before either shape is read, `publish` is typed away from `direction: 'in'` rows, `subscribe` from `direction: 'out'` rows, and a wrong payload type is rejected. |
| Per-message interpretation + dispatch overhead >= 1k msg/s | go | `test/check-8-bench.test.ts::interprets and dispatches well above 1k msg/s` — 50 000 messages through the real pipeline (redelivery dedup → mqtt-pattern match → strict UTF-8 + `JSON.parse` → compiled ajv@8 validator → bounded enqueue → microtask dispatch to a wire-1 listener), after a 2 000-message warm-up: **43 700–61 200 msgs/sec, 16.4–22.9 us/message** across runs; a `reasonCode` channel (which additionally constructs and dedupes a class-3 error per message) measures 47 500–50 000 msgs/sec, 20.0–21.1 us/message. `::stays above 1k msg/s with a wire-2 subscriber attached` — 20 000 messages with a live snapshot subscriber (40 000 notifications, two per message): 57 300–60 400 msgs/sec, 16.6–17.4 us/message. Headroom over A-4's <= 1k msg/s assumption is ~44–60x, so the policy table's `sample` knob stays unused. **Deviation: Node, not a browser.** |

## Deviations

- **Bench measured in Node, not a browser.** The report check asks for a real
  browser; this spike measures in Node v24.18.0 with the memory broker adapter.
  The measured path is the whole boundary pipeline; what Node omits is the
  WebSocket socket, the MQTT codec and the browser's main-thread contention.
  With ~44–60x headroom over the assumed peak the conclusion is robust to a
  large browser penalty, but the browser number is still unmeasured.
- **Broker-driven QoS-1 redelivery is unreachable under A-5, so the duplicate is
  injected at the adapter seam.** A-5 fixes `clean: true` sessions, which is
  exactly the configuration in which a broker never replays an unacked QoS-1
  packet across an offline window — the #909 duplicate cannot be produced by
  aedes without violating a fixed constraint of the design. Everything around
  the duplicate is real (aedes stopped and restarted, mqtt.js reconnecting,
  SUBSCRIBE observed broker-side); the duplicate itself is replayed into the
  `BrokerPort` with the same `(topic, messageId)` and `dup: true`, which is
  byte-for-byte the packet a broker would resend. The guard is therefore
  verified, but "a real broker redelivers" is not.
- **QoS-0 packets are undedupable and the guard says so.** Redelivery dedup is
  keyed on `topic + messageId` per O1; QoS 0 carries no messageId, so a QoS-0
  duplicate passes through (`check-2::cannot dedup QoS-0 packets`). This is a
  property of the design's chosen key, recorded rather than papered over.
- **Real-broker shedding needs a burst, not a stream.** Published one-at-a-time
  (awaiting each ack), 300 packets were delivered with zero shedding — the
  microtask drain keeps up with one packet per I/O turn, which is the *correct*
  outcome but demonstrates nothing about the bound. Shedding reproduces only
  when the burst is fired without awaiting, so several packets land inside one
  turn of the packet pump. Recorded because it sets the shape of any future
  load test: the bound is a burst-absorption bound, not a throughput bound.
- **The normalizers live in `src/errors/normalize.ts`, beside the entry point,
  not inside its file.** design.md says they live in `transport-boundary/errors`
  but are not exported. TypeScript has no per-symbol export visibility, so the
  entry point is `src/errors/index.ts` and the normalizers sit next to it in the
  same module directory, imported by both ingresses and by this spike's own
  tests. The design's actual rule — no code outside the package can construct
  taxonomy values — holds and is asserted
  (`check-5::keeps the normalizers off every public entry point`).
- **Wire 1 is a boundary-owned emitter, not xstate's `emit`.** xstate 5.32.5
  does support `actor.on('*')` with try/catch isolation, but it reports a
  throwing listener via `reportUnhandledError`, which resurfaces as an unhandled
  exception on a later macrotask. The boundary's own emitter has the same
  `on`/`'*'` semantics and routes listener throws to `inspect` instead (I12,
  `rest-seam.test.ts::isolates a throwing wire-1 listener from its siblings`).
  xstate still owns the connection machine and its ClockPort-timed backoff, and
  `BoundaryActorRef` is structural exactly as designed, so no interface changed.
- **Telemetry dedupe is leading-edge + trailing summary.** design.md fixes the
  envelope (`count >= 1`, `firstSeen`, `lastSeen`) and says repeats "fold by
  dedupKey within the window into `count`" without fixing when the fold is
  emitted. Implemented as: emit immediately on the first occurrence in a window
  (`count: 1`), fold repeats silently, and emit one summary carrying the folded
  count when the window closes. This is the reading that makes the fold both
  real (5 rejects → 1 emission) and observable, and it is timed on the ClockPort
  so `SimulatedClock` walks it in microseconds.
- **Egress validation failures are quarantined as well as thrown.** I3 says a
  rejected payload goes to the ring plus telemetry; the design's `publish`
  error mode only specifies the class-2 rejection. Outbound rejects are pushed
  to the ring too, so "nothing rejected disappears silently" holds symmetrically.
- **`SimulatedClock.increment` does not cascade.** A timer scheduled *during* a
  flush starts at the already-advanced now, so one `increment(8 * 30_000)` fires
  one backoff window, not eight (design.md's usage sketch implies otherwise).
  Test mechanics only — no interface consequence; the tests advance once per
  window.
- **Channel-key parameters use `{name}`, translated to mqtt-pattern's `+name`
  at construction.** design.md keys the table like AsyncAPI channels
  (`plant/{plantId}/telemetry`) and matches with mqtt-pattern, whose own syntax
  is `plant/+plantId/telemetry`. The translation is one function
  (`src/internal/policy.ts`, `toPattern`) run once per row at construction.
- **`mqtt.connectTimeoutMs` added to `BoundaryConfig`, and `connectTimeoutMs`
  to `BrokerConnectOptions`** (default 4000). design.md's config shape does not
  carry it, and the first cut hardcoded `connectTimeout: 4000` inside the
  mqtt.js adapter — a per-attempt timing policy buried in an adapter, which is
  exactly what the port exists to prevent. Additive on both the config and the
  owned port; covered by
  `check-1::threads connectTimeoutMs to the broker port, defaulting to 4000`.
- **Wire 2 notifies on connection-context change, not only on state-value
  change.** The bounded-retry sequence re-enters `reconnecting` without changing
  the state value, so `attempt` — a documented `BoundarySnapshot` field —
  advanced invisibly to wire-2 consumers. O6 says notifications fire on
  "state/depth change"; `attempt` is read here as part of that state. Regression
  test: `check-1::counts exactly maxAttempts backoff windows before degrading`
  now asserts wire 2 observes `[2, 3, 4, 5]`.

## Decision impact

Nothing in the chosen interface had to change to make these checks pass, which
is the main result: D-0015's transport-boundary shape survives contact with a
real broker. Concretely, for the accepted recommendation —

- **The three ports earn their keep.** The give-up policy, the offline window
  and the pump bound are all walked *through the same interface callers use*,
  in microseconds, because `BrokerPort` and `ClockPort` have two adapters each.
  The `SimulatedClock` graft in particular converts the suite's most expensive
  tests into deterministic ones: the real-broker give-up test takes seconds, its
  memory twin takes microseconds and asserts the exact attempt count.
- **The two-wire rule is enforceable at compile time**, not just by convention —
  the expect-error block in `check-7` fails the build if either wire ever starts
  leaking the other's shape.
- **A-4 (<= 1k msg/s) is comfortable by ~44–60x** on this pipeline, so the policy
  row's `sample` knob is dead weight today. It is one optional field and costs
  nothing to keep, but nothing in the spike justifies using it.
- **Bounded-everything is the load-bearing invariant.** Under flood the boundary
  keeps the mqtt.js client alive and sheds observably (quarantine + telemetry +
  wire-2 depths) instead of growing without limit — mqtt.js supplies no bounds
  of its own, so this is behaviour the module adds rather than configures.
- **The REST leg's class-3/class-4 split is unbuilt and is Task 6's obligation.**
  The `fetcher` seam currently throws class 3 for **every** non-2xx JSON body.
  design.md reserves class 3 for a *declared* status whose body parses against
  its per-status schema, and routes an *undeclared* status to class 4
  `undeclared-status`; nothing in this task constructs `undeclared-status` at
  all. Task 6 owns the declared-status table and that branch — deliberately not
  built here.
- **Still open for the next task:** signal threading through orval's generated
  hooks (the decisive REST check), per-status zod validation and the
  declared-status table (above), the QueryCache `onError` telemetry tap, the
  oxlint layering rule, and the mqtt-pattern adopt-vs-vendor recommendation.
