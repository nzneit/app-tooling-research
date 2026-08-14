# Findings — boundary-wiring

**Status**: complete
**Track**: [0060-transport-abstraction](../../research-plan.md)
**Report**: [report.md](../../report.md)
**Date started**: 2026-08-14

Interface authority: [design.md](design.md), "Chosen interface". Both legs are
built and checked here: the MQTT leg against a real in-process broker, and the
REST leg through orval's real generated `client: 'react-query'` output over a
synthetic OpenAPI contract.

Environment for every number below: Node v24.18.0, darwin/arm64, vitest 4.1.10,
typescript 7.0.2. Resolved dependency versions: `mqtt@5.15.2`, `xstate@5.32.5`,
`mqtt-pattern@2.1.1`, `@tanstack/react-query@5.101.4`; dev: `orval@8.24.0`,
`oxlint@1.78.0`, `zod@4.4.3`, `aedes@1.1.1`, `ws@8.21.3`, `@types/ws@8.18.1`,
`ajv@8.20.0`. `websocket-stream` was **not** needed — `ws`'s own
`createWebSocketStream` gives aedes the Duplex it wants. `react@19.2.8` is
installed transitively as `@tanstack/react-query`'s peer; nothing in the spike
imports it (orval's query-options builders make the REST checks React-free).
**zod major**: orval 8.24.0's `override.zod.version` defaults to `'auto'`,
inferring from the installed package and otherwise falling back to zod 4 output;
with `zod@4.4.3` installed it emitted zod-v4 API (`zod.int()`, `zod.enum([...])`),
so zod 4 is the supported major and the one pinned.

Suite: **99 tests, 17 files, all green**; `npm run typecheck` clean. The
real-broker tests (aedes over ws + mqtt.js, in-process) close every server in
`afterEach`; vitest exits 0 with no leaked handles across repeated runs.

## Checks

| Report check | Verdict | Evidence |
|---|---|---|
| **Signal threading (decisive for the REST seam)**: orval `client: 'react-query'` passes `context.signal` through the custom mutator into fetch | **go** | `test/check-9-signal-threading.test.ts` (5 tests + a compile-time block) runs the **real generated client** (`app/api/generated/plants.ts`, orval 8.24.0, `client: 'react-query'`, `httpClient: 'axios'`, `override.mutator` → `app/api/mutator.ts`) over a **real** `QueryClient`. No React: orval emits query-options builders, so `queryClient.fetchQuery(getListPlantsQueryOptions())` exercises the same queryFn a `useQuery` hook would. `::GO: cancelling the query aborts the underlying fetch` — the injected `FetchLike` records the `AbortSignal` the transport actually received; it is not aborted while in flight, and `client.cancelQueries({queryKey})` flips it to `aborted === true`. `::resolves the validated body end to end through the generated client` covers the success path, hook-free and standalone. Generated output is committed (`app/api/`, `contract/plants.openapi.json`, `orval.config.ts`). **One correction to design.md is required — see Deviations**: orval threads `signal` into the mutator's **first** argument (the request config), so the design's literal one-liner `(req, opts) => boundary.fetcher(req, opts)` does not carry it. The failure arrives in **two steps**, both pinned. Step 1, compile time: the one-liner's request parameter is `Parameters<BoundaryFetcher>[0]`, which has no `signal`, and orval passes a **fresh object literal**, so the type rule rejects it — `TS2353: Object literal may only specify known properties, and 'signal' does not exist in type '{url; method; params?; data?; headers?}'`. The compile proof types a stand-in `declare function` plus a hand-written object literal that demonstrates this same type rule, not the real generated call site compiled against the naive mutator. `_designLiteralBindingDoesNotEvenCompile` holds that as an `@ts-expect-error` (verified live: deleting the directive reproduces TS2353 at `check-9:230`, and `tsc` would flag it as unused otherwise). Step 2, and the actual hazard: widen the request parameter so it builds, keep design.md's `fetcher(req, opts)` body, and the signal is dropped **silently at runtime** with no diagnostic left. `::post-widening hazard: once the request type is widened, the signal is dropped` is exactly that state — the request is a pre-built variable, which is what widening achieves — and shows the caller's controller aborting while the transport signal stays `false` and the request completes anyway. |
| Taxonomy-aware retry predicate (class 1 only) through TanStack Query | **go** | `test/check-10-taxonomy-retry-register.test.ts`, "taxonomy-aware retry through TanStack Query" (4 tests) — a `QueryClient` built by `app/query-client.ts` with `retry: retryOnlyTransient`, counting transport attempts at the port. Class-1 `network`: **4** attempts (the original + three retries). Class-2 contract violation: **1**. Class-3 reason code: **1**. Class-4 undeclared status: **1**. The class-2 row is the one that matters — TanStack's default would have retried it three times with backoff. |
| Global `Register` error type compiles and narrows at call sites | **go** | Same file, `_registerNarrowsAtCallSites` — `tsc --noEmit` **is** the assertion. `declare module '@tanstack/react-query' { interface Register { defaultError: BoundaryError } }` lives in `app/query-client.ts`; the block then assigns `client.getQueryState(...)!.error` to a `BoundaryError` with no cast, narrows `class === 1` to read `reason` and `class === 3` to read `status`, and carries four `@ts-expect-error` lines that fail the build if they stop being errors (`class 1` has no `status`, `class 3` has no `reason`, there is no `class 5`, and the QueryCache `onError` tap rejects a bare `Error`). Typecheck reports no unused-directive errors, so every one of them is a live error today. |
| REST leg: DECLARED vs UNDECLARED status (class 3 / class 4 / class 2 split) | **go**, with a disclosed caveat — validated bodies are **stripped** of unknown fields (Deviations) | `test/check-10-…::declared vs undeclared` (9 tests). The per-status schemas are **orval's generated zod** (`override.zod.generateEachHttpStatus: true` → `ListPlants409Response`, `ListPlants422Response`, …) wired into a declared-status table in `app/contract.ts`. A declared **409** whose body parses → class 3, `status: 409`, parsed body, **no** quarantine entry. A declared **422** validates against the 422 schema, not the 409 one, so its `fields` array reaches the caller intact — note that the 409 schema would also *parse* that body, stripping `fields`, so per-status schemas preserve the right fields rather than reject the wrong status's shape (see the stripping bullet under Deviations). A declared 409 whose body **fails** its schema → class 2 with real zod issues normalised into the shared `{path, message}` shape (`schemaPath: '#/code'`) + quarantine. A **2xx** body failing its schema → class 2, never a resolution. An **undeclared 418** → class 4 `undeclared-status` + quarantine, with `raw: {status: 418, declared: [200, 409, 422]}`. An **undeclared path** → class 4 even on a 200 (I1: with no declared schema nothing can be validated, so nothing crosses). Path params match the contract **template**, so `GET /v1/plants/{plantId}` is the endpoint identity and telemetry dedupKeys do not fragment one per plant id. |
| Non-JSON ingress on the REST leg (ts-rest #789 lesson, I11) | **go** | `test/check-11-rest-non-json.test.ts` (10 tests) walks the full matrix **on 2xx and on non-2xx**, which is the column ts-rest #789 actually breaks in. `text/html` → class 4 `unknown-content-type` + quarantine with the HTML body retained (both statuses). Missing `content-type` → class 4 `unknown-content-type` (both). JSON content type with an unparseable body → class 4 `undecodable` + quarantine (both). JSON content type with an **empty** body → class 4 `undecodable` (both). `application/problem+json` on a declared 409 → decoded and validated normally → class 3, no quarantine: the JSON family is accepted, not just the exact string. `::never silently skips` asserts the shape of the bug directly — the non-JSON 2xx leaves as a rejection, never as a resolved value. |
| Deduped four-class telemetry reaches a 0050 stub via the QueryCache `onError` tap | **go** | `test/check-12-telemetry-querycache.test.ts` (5 tests). The tap is design.md's usage sketch wired for real in `app/query-client.ts` (`new QueryCache({ onError: (e, q) => { if (isBoundaryError(e)) sink.recordQuery(e, q.queryKey) } })`) feeding the stub in `app/telemetry-sink.ts`. `::delivers all FOUR classes to the logging stub, each with its query key` — classes 2, 3, 4 from one rig and class 1 (transport failure) from another, each tagged with its query key; the retried class-1 attempts fold into **one** envelope. `::carries the design's TelemetryEvent envelope` — the record's envelope has exactly the five documented keys (`count`, `dedupKey`, `error`, `firstSeen`, `lastSeen`), `dedupKey === 'GET /v1/plants|c3:E_CONFLICT'`, `count: 1`, and `envelope.error` **is** the same object the tap saw (one error, two taps, no re-wrapping). `::dedupes repeats inside the window` — four failures produce four QueryCache taps but one leading-edge envelope, then a folded `count: 4` summary when `SimulatedClock.increment(60_000)` closes the window. `::feeds the SAME sink from the MQTT wildcard tap` — an unknown MQTT topic and an undeclared REST status land in the same sink in the same envelope shape, and only the REST one carries a query key. |
| Coverage layers in this repo: oxlint `no-restricted-imports` overrides allow the ingress and ban `mqtt`/raw-client elsewhere | **go** | `test/check-13-layering-lint.test.ts` (6 tests) runs the **real oxlint 1.78.0** binary via `execFile` over `lint-fixtures/`, against two committed configs. `.oxlintrc.json`: the MQTT ingress fixture importing `mqtt` exits **0** with no diagnostics; feature code importing `mqtt` **and** the generated client exits **1** with two `eslint(no-restricted-imports)` diagnostics and the I5 help text; the clean feature exits 0. The load-bearing case — `lint-fixtures/ingress/mqtt-ingress.violation.ts`, inside the directory the override exempts — exits **1** with exactly two diagnostics (the generated client and a feature import) and **none** for `mqtt`: the allowance is granted without taking the other bans down with it. D-0002 holds: both rules are `no-restricted-imports`, no new toolchain. The report's coverage-layer ask that the boundary package exports only validating accessors holds too: `check-5::keeps the normalizers off every public entry point` pins entry point 2 (`/errors`) to its exact five-guard-plus-`retryOnlyTransient` surface and asserts the five normalizer/constructor names are absent from entry points 1 and 3 (root and `/testing`) as well — though the root entry's full export surface, unlike `/errors`, is not pinned exactly, only these absences. And only the MQTT ingress needs an oxlint override at all: the REST ingress imports no generated code (see Deviations), so the report's "two ingress modules" clause is answered, not narrowed — one of the two never needed an exemption. |
| …does 0010's oxlint overrides-merge caveat bite? | **yes — it bites; mitigation verified** | `check-13::CONFIRMS 0010's caveat: an override REPLACES the base rule options`. In oxlint 1.78.0 an `overrides[].rules` entry **replaces** the base entry's options rather than merging them. `.oxlintrc.naive.json` differs from `.oxlintrc.json` in one way — its ingress override does not restate the base `patterns` block — and on the identical fixture it produces **1** diagnostic instead of **2**: the generated-client ban silently vanishes inside `**/ingress/**`. Outside the override both configs are byte-for-byte equivalent in behaviour (`featureNaive` deep-equals `featureMitigated`), which is what makes this a **false negative** rather than a visible misconfiguration — the rule looks configured and keeps firing everywhere except the one directory that most needs it. **Mitigation**: restate every base pattern verbatim inside each override, and pin it with a test — `check-13::keeps the mitigation honest: the restatement is verbatim` parses `.oxlintrc.json` and asserts every base pattern also appears in the override, so the copy cannot drift. This independently reproduces the 0070 spike's finding on the same oxlint version. |
| mqtt-pattern adopt-vs-vendor | **adopt** (recommendation; see Decision impact) | `test/check-14-mqtt-pattern-size.test.ts` (4 tests) measures the **installed** package. `mqtt-pattern@2.1.1`, MIT. Runtime code: **89 non-blank lines / 2 911 bytes** (`index.js`, 121 lines raw) plus its one real dependency `mqtt-match` at **12 lines / 388 bytes** — **101 non-blank lines (136 raw) / 3 299 bytes** of runtime code in total. Its other declared dependency, `ts-toolbelt@^9.6.0`, is a **types-only** library declared as a runtime dep: ~248 KB of `.d.ts` on disk (≈1 MB of disk blocks) that no bundler emits — asserted (`index.d.ts` imports it `import type`, `index.js` never mentions it) so the number is never mistaken for shipped weight. The boundary uses exactly four exports (`clean`, `exec`, `fill`, `matches`), each asserted against a real topic. One sharp edge is pinned: `fill` stringifies a missing param to the literal `"undefined"` instead of throwing, which is why `src/internal/policy.ts` checks the supplied params rather than scanning the produced topic. |
| Reconnect edges: `reconnecting` → recovery, and bounded give-up → `degraded` with publish gating | go | Real broker. `test/check-1-reconnect.test.ts::goes reconnecting when the server socket dies and recovers on restart` — aedes stopped (listener closed + every socket terminated) → snapshot `reconnecting`, `attempt >= 1`; aedes restarted on the same port → `connected`, `attempt` back to 0. `::gives up after bounded retries into degraded, gates publish, and re-arms on reconnect()` — `maxAttempts: 3`, `backoffMs: 150` → `degraded`, `publishGated: true`, `attempt: 3`, `degradedSince` set; `publish` while degraded rejects class-1 `publish-gated`; restarting the broker does **not** silently recover (give-up ended the adapter's retry loop), and only `reconnect()` re-arms → `connected`. Deterministic twin on the memory adapter + `SimulatedClock`: `::counts exactly maxAttempts backoff windows before degrading` (5 windows → degraded) and `::queues publishes while reconnecting and flushes them on recovery` (depth 1 while reconnecting, flushed to `plant/p9/command` on reconnect). |
| Offline-window resubscribe + redelivery dedup (mqtt.js #909) | go (with a recorded deviation on how the duplicate is produced) | Real broker. `test/check-2-offline-dedup.test.ts::resubscribes after reconnect and dedups a redelivered packet` — real offline window (aedes stopped, mqtt.js `reconnecting`, aedes restarted), resubscribe observed **broker-side** in aedes's `subscribe` event (`subscribeLog.length` 1 → 2, filter `plant/+/telemetry` both times); a packet replayed with the same `(topic, messageId)` and `dup: true` twice produces exactly **one** dispatch and **zero** extra quarantine entries. `::dedups on packet identity, not payload content` — two genuinely distinct QoS-1 packets with identical bodies both deliver (the guard is not over-eager). Memory adapter: `::passes exactly one dispatch when the adapter duplicates a QoS-1 packet` (3 injected duplicates → 1 dispatch, 0 quarantine) and `::cannot dedup QoS-0 packets (no messageId) and says so by delivering both`. |
| Non-blocking pump under flood (mqtt.js #1935) | go | `test/check-3-pump.test.ts::caps the delivery queue, quarantines overflow, and dispatches nothing on the pump` — 200 packets, 30 us synchronous validator, 50 us listener, `delivery: 16`: **zero** listener calls during the synchronous flood (dispatch is off the packet pump), `depths.delivery` pinned at 16, 16 delivered + 184 shed = 200 accounted for, every shed packet quarantined class-1 `queue-overflow`, one leading-edge telemetry event and one folded summary with `count: 184`, connection stays `connected`. Real broker: `::keeps the mqtt.js client connected while a slow consumer sheds` — 300 QoS-1 packets enqueued into aedes in one synchronous turn, 300 us listener, `delivery: 8`. Asserted, not merely logged: `delivered + shed === 300`, `shed > 0`, `peakDepth === 8` (the configured bound), connection stays `connected` and never enters `reconnecting` or `degraded`. Stable across 5 consecutive runs at exactly **24 delivered / 276 shed / peak 8-of-8**. |
| Policy table (mqtt-pattern over AsyncAPI-style keys); unknown topic → class 4 + quarantine | go | `test/check-4-policy.test.ts` (9 tests). `::matches an AsyncAPI-keyed channel and extracts named wildcards` — `plant/{plantId}/telemetry` matches `plant/plant-7/telemetry` with `params {plantId: 'plant-7'}`; the broker filter is the cleaned `plant/+/telemetry`. `::routes an unknown topic to class 4 + quarantine, and to no wire-1 message`. `::treats an inbound packet on an outbound-only channel as unroutable`. `::fills the publish topic from the channel key + params` → `plant/p42/command`. `::validates outbound payloads against the same validator (I7)`. `::throws plain Errors on programmer error` and `::rejects the factory synchronously on invalid configuration` (bad scheme, empty table, non-positive bound). |
| `reasonCode` channel: class-3 on telemetry **and** the typed message event (I2) | go | `test/check-4-policy.test.ts::constructs class-3 on a reasonCode channel WITHOUT suppressing message.* (I2)` — a valid `plant/p3/status` payload fires `message.plant/{plantId}/status` with the full validated payload **and** a `ReasonCodeError` on the wildcard telemetry tap (`class: 3`, `status: null`, `body {code: 'E_OVERTEMP', detail: 'sensor 2'}`), with no quarantine entry. `::keeps the choke-point order on a reasonCode channel` — an invalid payload on the same channel is class 2, quarantined, no message event, and `select` never runs (zero class-3 telemetry). |
| Quarantine ring + normalizers over real Ajv errors; deduped four-class telemetry on the `'*'` tap | go | `test/check-5-quarantine-normalizers.test.ts` (8 tests). Ring: `::evicts the oldest entry at capacity` (cap 3, 5 rejects → oldest two evicted, oldest-first order preserved). Normalizers over **real** ajv@8 output: `::normalizes a real ajv@8 error array into the one issue shape` compiles a schema, feeds `{tempC: 'hot', extra: 1}`, and normalizes the actual `validate.errors` (`keyword`/`schemaPath`/`instancePath` present) — Ajv's empty `instancePath` becomes `/`, never `""`. `::carries the real Ajv error array as the class-2 evidence, through the public interface` — the quarantined error's `raw` is a **shallow copy** of `validate.errors` holding the same `ErrorObject` instances (Ajv reuses and overwrites that array on the next call, so the copy is what makes the evidence survive; the error objects themselves are untouched). `::produces the identical issue shape from a Zod-shaped error` (structural); the **real** `ZodError` path is now covered too, by `check-10::class 2: a DECLARED status whose body FAILS its per-status schema`. Telemetry: `::folds repeats by dedupKey inside the window and emits one summary at close` — 5 identical rejects → 5 quarantine entries but **1** emission (`count: 1`), then one summary with `count: 5` when the window closes. `::surfaces all four classes on the one wildcard tap` — classes 1, 2, 3 and 4 all observed through `actor.on('*')`. `::keeps the normalizers off every public entry point` — `fromAjvErrors`/`fromZodError`/the class constructors are absent from all three entry points; `/errors` exports exactly the five guards + `retryOnlyTransient`. |
| Non-JSON ingress on the MQTT leg (ts-rest #789 lesson, I11) | go | `test/check-6-non-json.test.ts` (8 tests). Invalid UTF-8, a binary blob, valid-UTF-8-but-not-JSON, an empty payload and truncated JSON each become class-4 `undecodable` + quarantine with the raw bytes retained, and **never** a wire-1 message. `::separates 'decoded but wrong' (class 2) from 'could not decode' (class 4)` — `42`, `null`, `[1,2,3]` and a wrong-shaped object all decode and then fail the contract as class 2, so nothing is silently skipped and the two failure kinds stay distinguishable. `::never lets a bad payload starve a good one behind it`. Real broker: `::quarantines a genuinely binary MQTT payload as class 4` — a binary QoS-1 publish through aedes is quarantined and a following good payload still arrives on the same connection. |
| Two-wire surface (I4) | go | `test/check-7-two-wire.test.ts` (5 runtime tests + a compile-time block). Wire 1: `::delivers the typed message event and nothing about the connection` — event keys are exactly `channel/params/payload/topic/type`; a connection drop produces nothing on this wire. Wire 2: `::projects connection state and depths, and never a message payload` — no `payload`/`topic`/`params` key on any snapshot, the serialized snapshot never contains `tempC`, and `getSnapshot()` equals the last notification (O6). `::feeds both wires from the one ingress` — one delivery raises `depths.delivery` to 1 on wire 2 *before* the microtask dispatch, then the wire-1 event fires and the depth returns to 0. `::notifies wire 2 on change only`. Type level (`tsc --noEmit` is the assertion, via `@ts-expect-error` in `_neverCrossTheWires`): `ev.connection` / `ev.publishGated` / `ev.depths` are errors on wire 1, `s.payload` / `s.topic` / `s.params` are errors on wire 2, the `'*'` union must be narrowed before either shape is read, `publish` is typed away from `direction: 'in'` rows, `subscribe` from `direction: 'out'` rows, and a wrong payload type is rejected. |
| REST seam contract: `fetcher` rejects only `BoundaryError`, threads abort, dies clean | go | `test/rest-seam.test.ts` (8 tests). A declared 2xx that parses resolves branded; a declared 409 that parses rejects class 3 with the status; an aborted request rejects class-1 `aborted` and is never retried; after `dispose()` the fetcher rejects class-1 `disposed`; `retryOnlyTransient` is unit-checked at its boundaries (retries at failure counts 0–2, stops at 3, refuses class 2 and refuses a raw `Error`). Plus the lifecycle group: idempotent `start`/`dispose` with both wires silent afterwards, wire-1 listener isolation (I12), and exact interest refcounting (O3). |
| Per-message interpretation + dispatch overhead >= 1k msg/s | go | `test/check-8-bench.test.ts::interprets and dispatches well above 1k msg/s` — 50 000 messages through the real pipeline (redelivery dedup → mqtt-pattern match → strict UTF-8 + `JSON.parse` → compiled ajv@8 validator → bounded enqueue → microtask dispatch to a wire-1 listener), after a 2 000-message warm-up: **43 700–61 200 msgs/sec, 16.4–22.9 us/message** across runs; a `reasonCode` channel (which additionally constructs and dedupes a class-3 error per message) measures 47 500–50 000 msgs/sec, 20.0–21.1 us/message. `::stays above 1k msg/s with a wire-2 subscriber attached` — 20 000 messages with a live snapshot subscriber (40 000 notifications, two per message): 57 300–60 400 msgs/sec, 16.6–17.4 us/message. Headroom over A-4's <= 1k msg/s assumption is ~44–60x, so the policy table's `sample` knob stays unused. **Deviation: Node, not a browser.** |
| Conditional re-checks (openapi-ts monorepo activity; a stable ts-rest 3.53/4.0) | not triggered | Both are conditioned on a slot being reopened — openapi-react-query being reconsidered, or the contract-first REST slot reopening. Neither happened: orval + mutator is confirmed by the checks above, so no re-check was due. Recorded rather than silently dropped. |

## Deviations

- **The REST contract is synthetic, not 0010's real one.** `contract/plants.openapi.json`
  is a 3-operation OpenAPI 3.0.3 document written for this spike: `GET /v1/plants`,
  `GET /v1/plants/{plantId}`, `POST /v1/plants/{plantId}/commands`, each declaring
  200/202 plus **409 and 422 with deliberately different error-body shapes**
  (`{code, detail?}` vs `{code, fields}`), and **no 418 anywhere** so an
  undeclared status exists to test class 4 with. It stands in for 0010's config;
  what it cannot show is anything specific to the real contract's size, `$ref`
  depth, or naming.
- **The REST leg's transport is entirely injected: no real fetch, no HTTP
  server, anywhere.** Every REST check (`check-9` through `check-12`,
  `rest-seam.test.ts`) runs against `scriptedFetchAdapter` — the fetch port's
  own shipped test adapter — but the production `globalFetchAdapter`
  (`src/adapters/system.ts`, the thin wrapper around `globalThis.fetch`) is
  never referenced by a single test. design.md's dual-adapter contract-suite
  discipline — "both adapters of every port exercise identical normalization
  code" — is met for the broker port (`mqttJsBrokerAdapter` over a real aedes
  broker, and `memoryBrokerAdapter`, both exercised across the suite) and for
  the clock port (the real-broker reconnect tests default to `systemClock`'s
  wall-clock timers alongside the explicit `SimulatedClock` twins), but **not**
  for the fetch port: only one of its two shipped adapters is ever run. This is
  asymmetric with the declared real-broker MQTT leg.
- **The decisive REST check substitutes orval's query-options builders for the
  report's "generated hooks," with no React rendered anywhere in this spike.**
  `check-9` calls `queryClient.fetchQuery(getListPlantsQueryOptions())`
  directly, which exercises the identical generated `queryFn` a `useQuery` hook
  would run — but no component ever mounts, and `react` is installed only as
  `@tanstack/react-query`'s transitive peer (Environment, above). This is a
  React-free / hook-free substitution for the report's decisive item, not a
  hook-level check.
- **`rest.contract` is an addition to design.md's config shape.** design.md fixes
  the *behaviour* — class 3 is "a declared non-2xx body that parses against its
  per-status schema", class 4 is `undeclared-status` — but never says how the
  per-status schemas reach the single REST ingress. They now arrive as data on
  `BoundaryConfig.rest.contract`, keyed `'METHOD /path/{param}'` (an OpenAPI
  `paths` entry, flattened) with the operation's declared statuses mapped to
  their schemas. This is the REST analogue of the policy table and keeps I5
  intact: the ingress imports no generated code. Schemas are typed structurally
  (`ResponseSchema`, a `safeParse` shape), so nothing below the seam imports zod
  and orval's generated schemas satisfy it as shipped.
- **orval's generated zod schemas STRIP unknown response fields, and that is
  now part of what `rest.contract` means.** orval emits `zod.object({...})`, and
  a zod object is strip-by-default: any property the schema does not declare is
  **removed from the value the caller receives**. Verified on both paths —
  `check-10::STRIPS unknown fields from a validated 2xx body (zod object
  default)` (a server-added `serverAddedField` on a 200 never reaches the
  caller) and `check-10::STRIPS unknown fields from a class-3 body too` (a
  `traceId` alongside a declared reason code is removed from
  `ReasonCodeError.body`; it survives only in `raw`, the pre-parse evidence).
  Three consequences the gate must weigh before ratifying `rest.contract` into
  design.md:
  - **Backward-compatible server additions are invisible to callers** until the
    contract is regenerated. That is either the point of a validating boundary
    (nothing undeclared crosses, I1 taken literally) or a silent data loss,
    depending on the deployment model — it is a deliberate choice, not a
    detail, and zod offers all three modes (`strip` / `passthrough` / `strict`).
  - **The boundary does not merely validate, it rewrites.** `fetcher` resolves
    the schema's *output*, not the response body. `Validated<T>` therefore
    brands a transformed value; any coercion or default in a generated schema
    would ride the same path.
  - **Per-status schemas discriminate less than they appear to.** The 422 body
    `{code, fields}` parses cleanly against the 409 schema (`{code, detail?}`)
    with `fields` stripped — so what the per-status lookup buys is *preserving
    the right fields*, not *rejecting the wrong status's shape*. An earlier
    comment in `check-10` claimed the mismatch would be a class-2 violation;
    it would not, and the comment is corrected. `strict` mode would make the
    discrimination real, at the cost of failing every forward-compatible
    addition.

- **An UNDECLARED endpoint is class 4 even on a 2xx.** With no declared schema
  there is nothing to validate against, and I1 says nothing unvalidated crosses
  the interface. So an unmatched path — or a matched path with an undeclared
  status — is `undeclared-status`, success statuses included. The consequence
  worth stating plainly: a boundary configured without `rest.contract` cannot
  resolve anything through `fetcher`. That is intended (an MQTT-only app simply
  never calls it) but it is a behaviour change from the Task 5 seam, which
  passed 2xx bodies through unvalidated.
- **design.md's one-line orval binding is wrong as written, and the spike
  corrects it.** design.md sketches
  `const customInstance = <T>(req, opts?) => boundary.fetcher<T>(req, opts)`,
  reading `signal` from the second argument. orval 8.24.0 with
  `httpClient: 'axios'` generates
  `customInstance<PlantList>({url, method, params, signal}, options)` — the
  signal is in the **first** argument and the second is orval's
  `SecondParameter` (per-call request options). The failure has two steps, and
  an earlier draft of these findings described only the second: **the literal
  one-liner does not compile at all.** Its request parameter is
  `Parameters<BoundaryFetcher>[0]`, which carries no `signal`, and orval's call
  site passes a fresh object literal, so TypeScript's excess-property check
  rejects it (TS2353) before anything runs. TypeScript catches the naive form
  for free. **The hazard is one step later**: hit TS2353, widen the request
  parameter so it builds, keep the `fetcher(req, opts)` body — and cancellation
  is dropped silently at runtime with nothing left to complain. So the binding
  must widen the type **and** read `req.signal`; widening alone is the trap.
  `app/api/mutator.ts` does both, and `check-9` pins both steps
  (`_designLiteralBindingDoesNotEvenCompile` for the type error,
  `::post-widening hazard: once the request type is widened, the signal is
  dropped` for the runtime one). **This is a one-line correction to the
  design's sketch, not a change to any interface.**
- **Where `signal` lands depends on `output.httpClient`, and the fetch
  convention is incompatible with `BoundaryFetcher` for a second reason.** The
  same contract generated with `httpClient: 'fetch'` (committed as
  `app/api/generated/plants.fetch.ts` + `app/api/mutator-fetch.ts`, purely as
  evidence) calls the mutator as `(url, RequestInit)` with `signal` on the
  RequestInit — argument two. It also types every operation as a
  status-discriminated **envelope** (`{data: Conflict; status: 409} & {headers}`),
  i.e. a declared 409 is a *resolved value*. design.md's `BoundaryFetcher`
  contract is the opposite ("resolves only validated, branded payloads; rejects
  only BoundaryError"), and the entire class-3 story depends on the rejection —
  TanStack Query only sees an error if the queryFn rejects. `httpClient: 'axios'`
  is therefore the convention this design requires; the twin's mutator resolves
  the body, which its generated type does not describe, and
  `check-9::threads the signal under orval's OTHER mutator convention too`
  asserts all of it rather than glossing it. `axios` itself is never installed or
  imported anywhere in this spike: `httpClient: 'axios'` only selects orval's
  mutator **call convention** — the shape of the arguments orval passes to the
  mutator — and the runtime request still travels the boundary's own
  `FetchLike`, never the axios library.
- **orval's split `schemas:` directory does not compile under
  `moduleResolution: nodenext`.** With `output.schemas` set, orval emits
  `from './model'` — an extensionless barrel import that TypeScript rejects
  (TS2834), and `output.tsconfig` did not change that. Worked around by dropping
  `schemas:` so `mode: 'single'` inlines the models into the one generated file.
  Recorded because a real adoption on a nodenext codebase hits it immediately.
- **The composition root exposes `installBoundary()` / `boundary()` instead of
  one `export const boundary`.** orval's mutator forces a static import of the
  app's single boundary; design.md puts that fact in app code, and it stays
  there. The spike needs a different scripted fetch table per test, so
  `app/transport.ts` holds the live handle in a slot with an installer. That is
  a test affordance in caller-owned code — not a package-level singleton, which
  is the thing design.md rejected.
- **The REST leg records class 1 and class 3 on telemetry without quarantining
  them.** design.md's I3 covers rejected *payloads* (class 2 and class 4, which
  are quarantined here as on the MQTT leg). A transport failure has no payload
  and a contracted reason code is a *valid* body, so both are telemetry-only —
  symmetric with the MQTT leg, where `connection-lost` and `reasonCode` class-3
  events are telemetry-only too. Without this the four-class QueryCache-tap
  check could not be written, because classes 1 and 3 would produce no envelope.
  One consequence to note: an aborted request also produces a class-1 `aborted`
  telemetry envelope (see the cross-track item under Decision impact).
- **`endpointOrTopic` on the REST leg is the contract key, not the concrete
  URL.** A declared request reports `'GET /v1/plants/{plantId}'`; an undeclared
  one reports `'GET /v1/plants/p-42'`. 0010's dedupKey rule is
  endpointOrTopic + schemaPath, and a concrete URL would fragment the key once
  per path parameter and once per query string. The concrete evidence still
  travels in `raw`.
- **`ZodErrorLike.path` widened from `(string | number)[]` to `PropertyKey[]`.**
  That is zod v4's actual issue path type (`readonly path: PropertyKey[]`); the
  narrower declaration made a real `ZodError` structurally unassignable.
  Segments are stringified into the shared `{path, message}` issue shape, so
  nothing downstream changed.
- **Content-type matching is a substring test, not a media-type parse.** The
  REST ingress accepts a body when `contentType.includes("json")`, which is what
  makes the JSON family (`application/problem+json`) work without an allow-list.
  It is also loose enough to accept nonsense like `text/html; charset=json-ish`.
  Immaterial at spike scale — every content type in the check matrix is
  classified correctly — but a shipping rule needs a real media-type parse
  (type/subtype plus a `+json` structured-suffix check, parameters discarded)
  rather than a substring match.
- **Bench measured in Node, not a browser.** The report check asks for a real
  browser; this spike measures in Node v24.18.0 with the memory broker adapter.
  The measured path is the whole boundary pipeline; what Node omits is the
  WebSocket socket, the MQTT codec and the browser's main-thread contention.
  With ~44–60x headroom over the assumed peak the conclusion is robust to a
  large browser penalty, but the browser number is still unmeasured.
- **The broker is in-process (aedes over `ws`), not a deployed one.** Real MQTT
  over a real socket with a real codec, but on localhost and in the same Node
  process, so nothing here measures WAN latency, proxy behaviour, or a
  production broker's own quirks.
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
- **The deduped envelope is constructed below the seam; the QueryCache tap adds
  the query key.** design.md shows the tap handing the error to a 0050 sink and
  separately fixes the `TelemetryEvent` envelope, without saying who folds
  repeats. The boundary is the only place a `BoundaryError` is constructed, so
  it is the only place that can fold them; the tap contributes the one fact only
  the TanStack layer knows. `app/telemetry-sink.ts` pairs the two by error
  identity, and `check-12` asserts `envelope.error === record.error`.
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
- **Assumptions touched.** **A-4 (<= 1k msg/s)** — comfortable by ~44–60x on
  this pipeline, so the `sample` knob stays unused. **A-5 (clean sessions)** —
  held fixed, and it is precisely what makes broker-driven #909 redelivery
  unreproducible (above). **A-11 (tens of policy rows)** — the linear scan is
  measured at that scale only; nothing here says what hundreds of rows cost.
  **A-14 (episodic reconnects)** — the give-up policy is verified but only
  against episodic drops, never a flapping link. **A-1/A-2 (unfilled
  facts/app-profile.md, D-0004)** — the topic scheme and the REST contract are
  both synthetic stand-ins, so "runs over the app's real topic scheme" and
  "over 0010's real config" remain unverified.

## Decision impact

Nothing in the chosen interface had to change to make these checks pass, which
is the main result: **D-0015's transport-boundary shape survives contact with a
real broker and with orval's real generated output.** The one correction the
spike forces is to a code sketch (the mutator's one line), not to any interface.
Concretely, for the accepted recommendation —

- **The decisive REST check is a go.** orval's `client: 'react-query'` output
  threads `context.signal` through a custom mutator into fetch, and cancellation
  is real: the hand-written-wrapper fallback the report reserved is **not
  needed**. What the spike adds is the condition attached to that go — the
  mutator must read `signal` off the request object, and the generation must use
  `httpClient: 'axios'`. Both are one-line facts, and both are now asserted, but
  either one taken wrongly reproduces the failure the report warned about —
  though not in one step: the naive binding fails to compile (TS2353), and it is
  the natural fix for *that* (widening the request type) which turns it into the
  silent runtime no-op. Both steps are asserted in `check-9`.
- **The caller-facing error surface really is three lines.** `retry:
  retryOnlyTransient`, the `Register` augmentation, and the QueryCache `onError`
  tap — all in `app/query-client.ts`, all exercised. The `Register` graft pays
  for itself: `error` narrows to the four-class union at call sites with no cast
  and no type argument, and the compile-time block fails the build if that ever
  regresses.
- **The declared-status table is the REST leg's policy table, and it needs a
  home in the interface.** `rest.contract` is the only interface addition this
  task makes. Without it the class-3/class-4 distinction is unimplementable, and
  with it both legs have the same shape: one declarative table, compiled once,
  driving routing + validation + taxonomy. It should be added to design.md's
  `rest` config — and the ratification carries **one substantive choice**: the
  generated zod objects strip unknown fields by default, so `fetcher` resolves
  the schema's *output*, not the response body. Ratify `strip` (nothing
  undeclared crosses; backward-compatible server additions stay invisible until
  the contract is regenerated), `passthrough` (additions survive, but
  `Validated<T>` stops meaning "exactly the declared shape"), or `strict` (an
  addition becomes a class-2 contract violation) — deliberately, rather than by
  inheriting orval's default. Evidence for what the default does: the two
  `check-10::STRIPS …` tests.
- **The three ports earn their keep.** The give-up policy, the offline window
  and the pump bound are all walked *through the same interface callers use*,
  in microseconds, because `BrokerPort` and `ClockPort` have two adapters each.
  The `FetchLike` port is what makes "the underlying fetch aborted" observable
  at all — the decisive check is an assertion on the signal the transport
  received, which an MSW stand-in could not give as directly.
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
- **mqtt-pattern: adopt, and keep vendoring cheap.** 101 non-blank lines (136 raw, 3.3 KB) of MIT
  runtime code across two packages, four functions used, no runtime transitive weight
  (its `ts-toolbelt` dep is types-only). Adopting costs nothing a bundler will
  notice and buys the `+name` extraction the policy table is built on. The
  vendor option stays open precisely *because* it is ~100 lines: if the package
  goes dormant — plausible, given the dead MQTT-wrapper ecosystem the report
  documents — copying it in is an afternoon, not a project. Recommend adopt now,
  re-evaluate only on a maintenance signal, and keep the four-function usage
  surface (asserted in `check-14`) small enough that the swap stays cheap.
- **The layering lint is a real mechanism, and its footgun is now documented.**
  `no-restricted-imports` expresses I5 with no new toolchain (D-0002 holds), but
  oxlint 1.78.0's `overrides` **replace** rather than merge rule options — so an
  override written to grant the MQTT ingress its `mqtt` import silently disables
  the generated-client ban in that same directory. The standing pattern is:
  restate every base pattern verbatim inside each override, and pin the
  restatement with a config test. This is the second independent confirmation of
  the caveat on this oxlint version (the 0070 spike found it too); recommend
  adopting the restatement mitigation as the repo-wide standing pattern and
  closing 0010's open question at the gate.
- **Open cross-track item — abort normalization, for the owners of
  `transport-boundary/errors`.** The 0070 spike's `isCancellation()` maps three
  shapes to a cancellation outcome, one of which is *this* module's class-1
  `reason: 'aborted'` error; its optimistic-mutation kit still rolls back the
  optimistic write as usual and labels the outcome `cancelled` rather than
  `rolledBack`. Both readings are correct at
  their own level — the boundary keeps `aborted` inside the taxonomy so its
  retry predicate can exclude it, and the state layer maps it to a cancellation
  before any consumer sees it — but the mapping is a contract between two
  modules and is currently written down only on 0070's side. It is a
  one-function agreement, not a taxonomy change. **Action for the gate:** record
  it against `transport-boundary/errors`, and decide there whether an aborted
  request should also raise a telemetry envelope (this spike emits one; on a
  cancellation-heavy screen that is arguably noise).
- **Still unverified, and it is all "real app" rather than "real design":** the
  browser bench number, a deployed broker, the app's real topic scheme, and
  0010's real contract. Every check that could be run against a real dependency
  was; the residue is the four facts `facts/app-profile.md` does not yet supply.
