# 0160-flight-recorder — report

## Summary (STE)

This track examined how the application gets a flight recorder: a memory-bounded capture of recent xstate transitions, MQTT messages, HTTP exchanges, and custom event streams, held per bucket in RAM, and sent to the team's own endpoint when a trigger fires. We compared a built recorder kit against three open-source SDK cores behind a facade, and against an extension of the 0050 logging facade.

We recommend **build**: an owned recorder kit behind a small capture interface, with two adopted micro-dependencies (safe-stable-stringify for the projection core, tracekit for stack parsing) and several copied designs (Sentry's client-report loss counters, 0050's remote-sink backoff idiom, @statelyai/inspect's serialization recipe). The survey found that the hard parts — byte accounting, per-bucket rings, serialize-at-capture projection, the seal protocol, the trigger discipline, the two-budget delivery, and the owned payload schema — are owned work under every posture. What an adopted SDK core would contribute is small, and its history buffer holds live object references, which the capture-safety analysis forbids. The wrap would pay a real integration and bundle cost to reuse machinery the program has already copied or can copy in few lines.

The app facts arrived while this report was being written and it was revised against them. They make the byte arithmetic concrete: the 100 requested MQTT messages cost about 1 MB and buy about two seconds of history at the fleet's peak message rate, so the report recommends a deeper MQTT buffer. Record sizes for the other three buckets were not given, so their share of the budget is still an estimate. They also close the delivery design — the endpoint is a separate cloud service, so a report can leave a device whose transport is broken — and they confirm the constraint the whole delivery shape exists for: the fleet runs Firefox 124 only, so no request survives page dismissal except a small beacon, and renderer crashes produce no report at all.

Two risks matter most. The owned capture code is the weakest link, because it runs inside other modules' latency budgets. And what may leave the device is still unruled: the team has a scrubbing tool, but nobody has stated a policy, so this report keeps a conservative default rather than inferring permission from the tool. The next step is a spike that measures projection cost on the real dispatch path; the design-level failure-mode enumeration beside this report names the hazards it must exercise.

**As of**: 2026-08-23 (versions evaluated are listed per candidate)
**Recommendation**: build — owned recorder kit behind the capture interface in Key question 6; micro-deps under D-0027 rung 1; Sentry core retained as design prior art, not a dependency

## Survey

### build — owned recorder kit (composing the program's accepted seams)

The build posture assembles the recorder from seams this program already owns and verified at charter time: 0060's wire-1 wildcard tap for validated MQTT traffic ([design.md:267-268](../0060-transport-abstraction/spikes/boundary-wiring/design.md) — "'*' is the 0050 wildcard tap"), the caller-owned orval mutator for HTTP pairs, `actor.system.inspect()` for the xstate actor tree (public at [xstate@5.32.5](https://github.com/statelyai/xstate/blob/xstate%405.32.5/packages/core/src/system.ts), source-verified), and 0050's `addSink` for the optional log bucket. The bill of materials the grounding sweep predicted held up under this survey's verification: the only non-trivial owned pieces are the byte-budgeted per-bucket ring, the seal/bundle/delivery pipeline, and the vendored OpenAPI payload schema. Everything else is either a micro-dep or a copied design:

- **safe-stable-stringify 2.5.0** (MIT, zero deps, 2,513 B min+gzip per the [Bundlephobia API](https://bundlephobia.com/api/size?package=safe-stable-stringify@2.5.0)) — the projection core: cycle-safe, `maximumDepth`/`maximumBreadth` bounds, deterministic key order. Verified in [v2.5.0 source](https://raw.githubusercontent.com/BridgeAR/safe-stable-stringify/v2.5.0/index.js): depth exhaustion emits the JSON strings `"[Object]"`/`"[Array]"`, breadth exhaustion appends `"...": "N items not stringified"` (objects) or a final `"... N items not stringified"` element (arrays), circular references become `"[Circular]"`, and BigInt serializes via `String(value)` by default rather than throwing (`bigint` option defaults true; `strict: true` flips both BigInt and circulars to throwing). Two findings the projection design must absorb: the elision markers are **in-band strings**, so the recorder's wrapper must detect the bounds being hit and emit its own structured markers (plan question 3's rule); and array-breadth elision has an off-by-one — when `length === maximumBreadth + 1`, one element is dropped with **no marker** (read from source, not executed; the spike re-tests it). Maintenance is dormant-stable: no npm publish since 2024-08-24, repo pushed 2026-02-05.
- **tracekit 0.4.9** (MIT, zero deps, 4,027 B min+gzip) — stack parsing for the trigger header. The revival is real: 0.4.8 2026-02-14, 0.4.9 2026-03-05, repo pushed 2026-08-03; dedicated Chromium (`at fn (url:line:col)`) and Gecko (`fn@url:line:col`) regexes with eval-frame sub-parsers ([tracekit.js](https://raw.githubusercontent.com/csnover/TraceKit/master/tracekit.js)). The alternative, error-stack-parser 2.1.4, has had no publish since 2022-06-06 and no repo push since 2023-01-27 — dormant, and dominated here.
- **The ring itself is owned, not adopted.** mnemonist 0.40.4 (MIT, pushed 2026-04-30) remains the one maintained TS ring library, and its `CircularBuffer` has verified evict-oldest overwrite semantics while `FixedDeque` throws at capacity ([circular-buffer.js](https://raw.githubusercontent.com/yomguithereal/mnemonist/master/circular-buffer.js); the docs state CircularBuffer "will overwrite old values when overflowing capacity"). But the recorder's ring evicts by **bytes** — a while-loop of evictions until the new record fits, with every evicted record's size returned to decrement the byte total and increment the drop counter — and CircularBuffer's overwrite is implicit: the evicted slot is not returned, so byte accounting would need a `peekFirst()` before every full-capacity push. At that point the dependency carries less than the ~60 owned lines it displaces, which is the same disproportionate-packaging argument that eliminated denque and ring-buffer-ts at charter. mnemonist stays on the shelf as the fallback if the owned ring's property tests find surprises.
- **Backoff is copied, not adopted.** exponential-backoff 3.1.3 (Apache-2.0, CJS-only, 2,040 B) and p-retry 8.0.0 (MIT, ESM-only) both verify healthy, but 0050 already ruled the house idiom: copy the loglevel-plugin-remote design (queue, interval, exponential backoff with jitter, cap) rather than depend on a package — the recorder's delivery loop reuses that copied design ([0050 report, Key question 2](../0050-logging/report.md)).
- **devalue 5.9.1** (MIT, actively maintained — published 2026-08-20) round-trips Map/Set/Date/BigInt/cycles via an index-pool JSON encoding, and is the serializer the replay door would want — but it throws on class instances without custom reducers, has no depth/breadth bounds, and the plan's rule is one serializer, not two. Rejected for the projection core; named as the revisit candidate if a future replay track needs rich-type round-tripping.
- **fast-redact 3.5.0 is disqualified as a dependency, confirming 0050's "copy the style" ruling on new evidence**: it compiles accessors with the `Function` constructor ([lib/redactor.js line 9, lib/restorer.js line 19](https://raw.githubusercontent.com/davidmarkclements/fast-redact/v3.5.0/lib/redactor.js)), which throws under a CSP without `unsafe-eval` — a hazard to import into a hardened page. It is also effectively dormant (last publish and last push both 2024-03-19). The recorder shares 0050's fast-redact-*style* rule set as data, with an owned applier.

The build's integration surface is the four taps plus the composition root; its owned risk is concentrated in exactly the pieces the rubric's new Boundedness criterion scores, which is why question 15's spike list and the design-level enumeration beside this report both target the ring and the seal first.

### Sentry JavaScript SDK core (@sentry/browser / @sentry/core 10.70.0) — the adopt + wrap candidate

MIT (manifest and LICENSE agree at [10.70.0](https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/LICENSE)), very active (10.70.0 published 2026-08-10). This survey verified the wrap mechanics in source, and they are **sounder than the plan assumed** — three plan-era claims fall:

- **A custom `Transport` receives the structured envelope, not bytes**: `send(request: Envelope)` where an envelope is a `[headers, items[]]` tuple whose event items carry the structured `Event` object and whose attachment items carry `Uint8Array` ([types/transport.ts, types/envelope.ts](https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/transport.ts)). Re-shaping into the team's vendored OpenAPI schema is a plain object-mapping exercise — no envelope parsing, no protocol lock-in at the wire. The plan's "paid for in Sentry's envelope protocol as the wire format" overstated the cost; the correction is recorded here.
- **maxBreadcrumbs has no hard 100 ceiling**: the default is 100 (`DEFAULT_MAX_BREADCRUMBS` in [scope.ts](https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/scope.ts)) and the option is clamped nowhere in the current SDK; the cap is enforced push-then-`slice(-max)`, oldest evicted.
- **Breadcrumb overflow is counted, not silent**: every overflowing `addBreadcrumb` records a `buffer_overflow` client-report outcome, flushed as a `client_report` envelope item through the same transport on visibilitychange-hidden ([client-reports spec](https://develop.sentry.dev/sdk/telemetry/client-reports/)). This is the field's best loss-accounting design and this report copies it into the build (question 2).

The rest of the wrap's mechanics, verified: `Sentry.init` without a DSN never constructs the transport and never installs integrations — the SDK is mechanically dead, so a wrap must pass a syntactically valid **dummy DSN** ([client.ts constructor and `_isEnabled()`](https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/client.ts)); `globalHandlersIntegration` arms both nets transport-agnostically (side effect: sets `Error.stackTraceLimit = 50` globally); the SDK's own POSTs use a cached pre-instrumentation fetch, and a custom transport must do the same or its requests generate fetch breadcrumbs; attachments (`scope.addAttachment`) accumulate unbounded client-side and ride as `string | Uint8Array` envelope items with **no client-side size check** (the develop spec's 20 MiB discard rule is unimplemented in the JS SDK); `tunnel` redirects the POST wholesale but keeps the envelope format, so tunnel-without-custom-transport pushes schema conversion to the server. Size: Sentry's own CI budget caps error-only `import { init }` at 33 KB gzip ([.size-limit.js at 10.70.0](https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/.size-limit.js)); no primary source gives a number for a minimal `BrowserClient` custom setup (it can only be smaller); Bundlephobia's 145 KB gzip figure measures importing the entire package including replay/feedback and must not be quoted as the error-only cost.

**Why the wrap still loses is capture-side, not delivery-side.** Breadcrumbs retain **live caller references**: `addBreadcrumb` pushes a shallow-spread copy whose nested values — `breadcrumb.data` above all — remain the caller's objects, with only `message` touched (truncated to 2048 chars), and normalization of `data` deferred to event-prep time (`normalizeDepth` default 3, breadth 1000). Pre-trigger history in Sentry's ring is therefore exactly the mutation-unsafe, graph-pinning capture the charter sweep ruled out for every tap — wire-1 payloads are shared live objects, xstate inspection events reference the live machine graph. Fixing it means projecting to a bounded serialized record *before* `addBreadcrumb` — at which point the SDK's ring is an array holding the recorder's own strings, the SDK's normalizer must be bypassed (its depth-3 default silently coerces the already-serialized record's structure if applied), and the reuse has hollowed to the nets, the transport plumbing, and the client-report counters. Each of those is small: the nets are ~200 lines with the loader-snippet pattern (whose reference implementation lives in the FSL-licensed getsentry/sentry repo — pattern reimplementable, script not reusable under D-0003), the transport plumbing duplicates the backoff idiom 0050 already copied, and the client-report design is copied into the build here. Add the wrap's running costs — dummy DSN, suppressing default integrations that wrap fetch/XHR/console/DOM and would double-instrument surfaces 0060/0070 own under governance, a global `Error.stackTraceLimit` write, one count-bounded global ring versus per-bucket taxonomy, no byte accounting anywhere in the breadcrumb path (the v10 logs subsystem has an 800 KB estimated-weight flush, but it does not apply to breadcrumbs), and v8→v10 major-version churn in about two years — and the equal-merit comparison resolves to build on the evidence rather than on a default.

### @bugsnag/js (8.10.0)

MIT, actively maintained under SmartBear (quarterly releases through 8.10.0, 2026-07-10; repo pushed 2026-08-20), 15,128 B min+gzip, and the one candidate with a genuinely public machine-readable payload spec (an [OpenAPI 3.0.3 document on SwaggerHub](https://api.swaggerhub.com/apis/smartbear-public/bugsnag-error-reporting-api/1/swagger.json)) plus an `endpoints` config that points at arbitrary owned servers. The plan's "likely dominated" hypothesis **survives, on grounds stronger than assumed**: (1) the payload ceiling is 1 MB — `json-payload.js` strips **all** event metadata client-side when the serialized payload exceeds 1,000,000 chars, replacing it with a warning string inside the payload, and the server 400s anything still larger — so a 10–50 MB capture envelope cannot ride this SDK under any configuration; (2) breadcrumbs are hard-capped at 100 (range 0–100, default 25) with a footgun: an out-of-range value **falls back to the default 25 rather than clamping** — logged as a config warning, so not silent, but not enforced either — while cap eviction itself is a silent slice; (3) there is no attachment or blob mechanism at all (metadata of JSON primitives is the only channel; the spec's one binary route is native minidumps), and the delivery layer is underscore-internal (`client._setDelivery`), so the only supported seam is endpoint redirection of Bugsnag's fixed payload-version-4 schema — the SDK hardcodes `payloadVersion: '4'` while the published spec says current is 5. Wire-format detail for anyone who does vendor the spec: pin to what the SDK emits, not the spec's "current". Verdict: **dominated for this use** — the transport ceiling alone disqualifies it, before the boundedness comparison starts. (Source note: the Bugsnag files were read on the repository's default branch, which carried 8.9.0 at survey time rather than the published 8.10.0; the cited code is identical wherever both were checked, but the citations are branch-pinned, not tag-pinned, unlike every other candidate here.)

### @grafana/faro-web-sdk (2.10.0)

Apache-2.0, org-backed and very active (2.10.0 published 2026-08-17; repo pushed the day of this survey). The plan's characterization is **confirmed in source**: Faro is a shipper, not a recorder. `defaultBatchingConfig = { enabled: true, sendTimeout: 250, itemLimit: 50 }`, flush on the 250 ms tick / 50 items / visibilitychange-hidden, and `signalBuffer` cleared on every flush ([batchExecutor.ts](https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/transports/batchExecutor.ts)); an exhaustive grep of the 2.10.0 tree finds no ring, breadcrumb trail, or replay store in any package — the one buffer that superficially resembles a recorder (`ItemBuffer`) is an **unbounded** array scoped to an in-flight user action, not consultable history. Error instrumentation attaches the error only, never recent context. Offline behaviour is drop-oriented: a 30-task promise buffer that throws "Task buffer full" (batch silently dropped), one retry then drop, rate-limit backoff that drops. Its transports are a genuinely public seam (`BaseTransport` abstract class; custom transports bypass `FetchTransport` entirely), so a wrap is mechanically possible — but what would ride it is capture instrumentations the recorder mostly must **not** use (console/error wrapping overlapping owned taps, `dedupe: true` collapsing identical signals — history-distorting for a recorder) while the entire recorder core is still built. Rejected as the core; its receiver-side payload format (mirrored by Grafana Alloy's Apache-2.0 `faro.receiver` structs) is noted as prior art for anyone designing the report backend.

### Eliminated and prior-art candidates

The charter-time eliminations (OTel browser logs "Development" status, posthog-js/highlight/OpenReplay/Datadog/AppInsights/LogRocket/Elastic on vendor-coupling or paid backends, rollbar.js dominated, stacktrace-js dead, standalone ring packages disproportionate) were re-checked only where a candidate had moved: none of the moves change a verdict. Prior art carried into the design: rrweb's checkout mechanism (ring self-sufficiency, question 12 RD-9), HAR 1.2 (the HTTP bucket's projectability target and its `-1` sentinel anti-pattern), @mswjs/source (the HAR→MSW regression path), Playwright's dual-clock trace, @statelyai/inspect 0.7.2 (serialization recipe worth copying; too heavy to adopt at 12,655 B min+gzip with six runtime deps including ws and superjson, and peer-pinned to xstate ^5.5.1 — not declared compatible with the v6 alphas), and Sentry's client-report loss accounting (copied into the build).

## Key questions

### 1. What does the recorder buy over the accepted surfaces — and what is the skip verdict's honest content?

The null was stated before any candidate was compared: 0050's facade will own remote sinks and error-level events (D-0014), and 0060 already emits a deduped `TelemetryEvent` for every taxonomy failure. The recorder's distinct claim survives scrutiny, and it is exactly one claim: **retrospective, full-fidelity, cross-bucket context**. Telemetry is deduped by design — leading edge plus a folded summary per window, so five identical failures emit twice and the three in between are unrecoverable; facade logs are leveled and throttled by pattern, and 0050's throttle exists precisely to thin chatter; and neither surface retains *what preceded* a failure — the boundary's delivery queue sheds, the quarantine ring holds only rejects, and wire-2 snapshots coalesce. When an error report needs "the last 100 transitions, the last 100 messages, and the last 25 HTTP exchanges as they interleaved," no accepted surface can produce it after the fact, and the surfaces' own bounds (shed-oldest at 256, quarantine 100) are sized for liveness, not diagnosis. The skip verdict's honest content is therefore: keep shipping error events without their lead-up, and accept that diagnosis of field failures continues to depend on reproducing them — which the RAM-disk fleet makes harder than usual, since nothing on the device survives to be inspected. That is a real option with real savings (every owned line in this report), and the report rejects it on the charter's own premise: the team asked for lead-up capture because error events alone have not been enough. A thin-0050-extension verdict was also weighed and rejected in question 14.

### 2. What is the bound's unit, and how is the envelope enforced?

**The unit is serialized UTF-8 bytes, metered once at capture, per bucket, with a global envelope above the buckets.** The platform verification confirmed there is no honest alternative: `performance.measureUserAgentSpecificMemory` is Chromium-only behind cross-origin isolation, `performance.memory` is deprecated and non-standard ([BCD](https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Performance.measureUserAgentSpecificMemory.json)), so no UA meter exists at the Firefox ~124 floor. The meter's honesty caveat is stated rather than hidden: UTF-8 byte counts meter the serialized record the ring actually holds; JS strings are UTF-16 internally, so heap retention can run near 2× the metered figure for string-heavy data, and the envelope numbers in config should be read as serialized-payload budgets, not heap budgets. Enforcement design, each point answering the plan's sub-questions:

- **Both caps, bucket wins locally, envelope wins globally.** Each bucket has `{maxCount, maxBytes}`; eviction within a bucket is evict-oldest (nothing surveyed justified another policy — Sentry, Bugsnag, LogTape, and the boundary's own queues all shed oldest, and diagnosis wants the newest history). The global envelope is enforced as a **sizing-time invariant, not a runtime scavenger**: startup config validation rejects a config whose Σ maxBytes exceeds the envelope, rather than evicting across buckets at runtime. This is the direct answer to the enumeration's starvation finding — cross-bucket evict-oldest deterministically starves quiet buckets (xstate, logs) whose sparse entries are oldest, handing the noisy bucket the space the rare context needed. With per-bucket ceilings that sum inside the envelope, no bucket can ever pay for another's traffic, and "which bucket pays" has a static answer: each pays for itself.
- **A single entry larger than its bucket's budget is truncated with structured markers** (`{truncated: true, originalSize}` per RD-5), never refused — a refused capture is a silent gap in history, and the truncation-visible alternative is strictly more diagnosable. Truncation **must copy**: `slice()` of a large string is a V8 SlicedString / SpiderMonkey dependent string that retains the whole parent, so a metered 4 KB record can pin a multi-MB payload for its ring lifetime while the meter reads 4 KB. The projection forces a real copy on every truncation, and question 15's boundedness property tests test **retention** (the parent is collectable), not just the meter.
- **Drop accounting counts four species separately**: evictions (ring pressure), truncations (stored but cut, with markers), oversized (unstorable even at the truncation floor — the boundary case where `maxEntryBytes`' floor still exceeds the bucket budget), and projection failures (the scrubber or the walk threw — the enumeration's "drops too" finding). The ledger invariant is stated in the interface (question 6, I4): recorded = retained + evicted + oversized, with projection failures counting entries that never became records — a bundle accounts for every absence. Counters are per bucket, monotonic, and ride in the bundle's health block, alongside a Sentry-style outcome design copied from the field's best practice: the client-report pattern verified in this survey ([buffer_overflow outcomes flushed through the same transport](https://develop.sentry.dev/sdk/telemetry/client-reports/)) is the precedent for shipping the loss ledger inside the same delivery channel, even when everything else is empty. One consequence of question 6's fail-safe-loud ruling lands here: a config whose Σ maxBytes exceeds the envelope is a **table-level** validation error that cannot be localized to a row, so the recorder comes up disabled-loud (`configErrors` populated, every entry point inert) rather than guessing which bucket to shrink.
- **Per-entry index and metadata overhead is declared, not metered**: the meter counts the serialized record's bytes; the ring's per-entry fixed overhead (sequence numbers, clocks, byte length, marker flags — tens of bytes) is a stated constant entered into the one envelope formula the design uses, Σ(maxBytes + PER_RECORD_OVERHEAD × maxCount) + headerAllowance ≤ `envelopeBytes`, so it is budgeted without pretending the meter sees it. The constant's measured value is a spike deliverable.
- **Ring bytes are not wire bytes, and the endpoint ceiling is negotiated on the latter** (added 2026-08-23). Every budget above is denominated in the ring's metered UTF-8 bytes, but each record body is a JSON string that gets re-escaped when embedded in the bundle's own JSON — roughly 1.4–1.7× for typical content, far worse for control characters — on top of unmetered header and marker bytes. That factor is an estimate the spike measures, and it is the price of serialize-at-capture rather than an accident: the ring holds each body as a finished JSON *string* precisely so it owns its memory (I2), and a string embedded in JSON is escaped again. A bucket table validated as in-envelope therefore produces a materially larger POST, so intake item c's size question must be asked and answered in wire bytes, and the 5–10× gzip planning ratio applies to the wire figure, not the ring figure. Without this distinction the failure appears only in the field, only on the largest bundles — the ones most worth having.

**The byte arithmetic, now partly on real figures** (intake items a and d answered 2026-08-23). MQTT payloads are typically under 10 KB with a worst case near 50 KB, and the day-one depths are 100 MQTT messages, 25 HTTP exchanges, 100 xstate transitions, and 50 log lines. Item a answered for MQTT only, so the figures below are stated in two parts — what the answer computes, and what is still sized by analogy — rather than as one composite number. Two conclusions follow, and they point in opposite directions.

First, **memory is not the binding constraint at these depths**. The computable term is the MQTT bucket: 100 messages costs **1 MB typically and 5 MB at the worst-case payload size**. The other three buckets have no measured record size — REST body sizes remain unanswered (see *Facts, and what remains assumed*) — so sizing them by analogy at roughly 10 KB per HTTP record, 4 KB per transition and 1 KB per log line adds about **1.5 MB**, for ~2.5 MB typical and ~6.5 MB worst. Only the first term is a fact. Even the assumed total sits inside the charter's 10 MB floor for one tab; two tabs at worst-case payloads is the first figure that would press it, which is one reason the worked configuration denominates its envelope per tab and says so. Second, **the depths buy very little history**: at the ~50 msg/s figure the profile records — a **peak** rate, and an aggregate that includes outbound publishes the wire-1 tap never sees (intake item n, open) — 100 MQTT messages is about **two seconds** of lead-up. The error bars run both ways: below peak the same 100 messages spans longer, while the bucket also carries the adapter's synthetic gap records, so its record rate runs above its message rate. Two seconds is the right order of magnitude, and it is the number worth reacting to. A recorder whose entire claim is "what preceded the failure" delivering two seconds of it is worth stating plainly, because the envelope permits far more — at 10 KB typical payloads a 12 MiB MQTT bucket holds roughly 1,200 messages, on the order of **24 seconds** at the same rate, and still leaves room for the other three buckets inside a 20 MiB per-tab envelope. The report's recommendation is therefore to **adopt the requested depths as counts and raise the MQTT bucket specifically**, or to accept two seconds knowingly; the worked configuration below takes the first option and the table can be tuned in one config edit either way. What makes either choice safe is the byte cap: the 5× spread between typical and worst-case payloads means a count-only bound would let the same 100 messages occupy 1 MB or 5 MB depending only on the traffic — which is the concrete local justification for byte accounting that the field-wide survey could only argue in general.

### 3. Is capture-time serialization the design, and what is the projection per bucket?

**Yes — eager projection at capture is the design under every posture**, and this survey hardened the charter-time hypothesis into a specification. The forcing facts stand: wire-1 payloads and telemetry errors are shared live objects (Ajv reuses `ErrorObject`s; no freeze/clone is specified anywhere in 0060), xstate inspection events reference the live machine graph, and — new this survey — the adopt+wrap candidate's own ring stores caller references and defers normalization to event-prep, so no surveyed candidate provides safe capture either. The projection contract, absorbing the four enumeration hazards:

1. **The walk is guarded, not just the shapes.** Serialization executes app code — getters, Proxy traps, `toJSON` (a revoked immer draft throws mid-walk; plain `JSON.stringify` throws on BigInt, though safe-stable-stringify's default serializes it). The projection wraps the entire walk in a try/catch whose failure path produces a counted projection-failure drop with the entry's bucket, sequence number, and error class — never a throw into the tap (the tap sits in someone else's latency-disciplined path, question 11).
2. **Bounded by construction**: safe-stable-stringify with `maximumDepth`/`maximumBreadth` set per bucket, wrapped so bound-hits emit structured markers `{elided: true, at, count?, cause}` (the library's in-band `"[Object]"`/`"... N items not stringified"`/`"[Circular]"` strings are precisely the well-formed wrong evidence RD-5 exists to prevent one layer down). **The mechanism needs correcting from the obvious one** (added 2026-08-23): a plain `replacer` cannot see breadth elision at all, because the library sorts and *slices* the key list before iterating — elided keys are never offered to the replacer — and the array off-by-one emits no in-band string either, so at `length === maximumBreadth + 1` an element vanishes with nothing to detect. Detecting the library's output strings cannot work either: they are indistinguishable from app strings with the same content. So the wrapper owns the bound decisions rather than observing them — it walks with its own depth/breadth accounting and hands the serializer already-bounded structures, or the design accepts an owned walk and re-prices safe-stable-stringify's rung-1 justification down to its cycle handling. The spike settles which, and the sorted-then-sliced behaviour has a second consequence worth stating: breadth elision keeps the lexicographically-first N keys, so a wide record can retain `channel` and `params` while dropping `topic`.
3. **Per-bucket scrubbers run inside the projection**, before bytes are metered: the xstate scrubber copies @statelyai/inspect's recipe (HTMLElement→outerHTML, function→name) and projects the five actually-emitted event types to an owned record shape — the raw `InspectionEvent` is explicitly not the stored schema, since v6 is reworking inspection upstream (v6 alphas were publishing near-daily at survey time, `6.0.0-alpha.47` the day of this survey); the MQTT scrubber serializes the already-validated payload plus `{channel, topic, params, direction}` — **not `packetId`**, which wire 1's `MessageEvent` does not carry (corrected 2026-08-23; the id is constructed inside 0070's ingress, the surface question 4 refuses to tap, so a replay conversion must synthesize one from topic plus arrival order); the HTTP scrubber captures template-key identity (`GET /v1/plants/{plantId}`), status, and bounded bodies, and must **type-detect non-plain bodies** — a `FormData`, `Blob`, or `ReadableStream` in the request has no enumerable own properties and serializes to `{}` with no bound hit to detect, so it is stamped `{elided, cause: 'unserializable'}` rather than recorded as an empty body, while a `Uint8Array` goes the other way and expands into an index-keyed object until breadth truncates it (RD-6's `encoding: 'base64'` is unreachable from a synchronous tap, so binary bodies are marked, never captured); the log scrubber passes the facade's already-redacted `LogRecord` through.
4. **Sibling mutation is accepted and stamped, not fought**: dispatch order on a shared tap is not the recorder's to choose, so a sibling listener may mutate a payload before the recorder's listener runs. The record carries its capture position implicitly (sequence number within the dispatch turn); the report states plainly that captured history is "as seen at the recorder's position in dispatch order," which is the strongest claim any passive observer can make.
5. **The named fallback exists before it is needed**: if the spike's on-device measurement fails the capture-cost budget (the desktop-proxy figures — ~0.44 µs for a ~200 B record, ~17 µs for ~12 KB — clear a ~3%-of-a-core budget at 50 records/s even de-rated 10×, and item f's answer, desktop-class but low power, makes a 10× de-rate too pessimistic without saying by how much; the spike replaces the guess with a measurement rather than a smaller guess, and the divisor is the recorder's *total* record rate, which runs above the MQTT rate alone), plan B is a capture-turn shallow snapshot (top-level own-property copy with primitives inlined) plus idle-time serialization, which trades a bounded mutation window for capture-turn cost. It is a fallback, not the design, because it re-admits a slice of the mutation hazard.

### 4. Where exactly does each built-in bucket attach, and at which layer's view of the traffic?

The tap map, with each attachment point pinned to its authority during this survey (file:line citations are to the accepted artifacts; phrases like "constructor-only" are structural characterizations of the cited text, not quotations):

- **MQTT bucket — wire 1, validated view, with quarantine ride-along at seal.** The bucket attaches one wildcard listener on the boundary's wire-1 surface (design.md:267-268 designs `'*'` as the wildcard tap; I12 at design.md:491 guarantees a throwing listener never skips siblings and never re-enters the broker callback). It records the *validated* per-channel view — the raw/invalid view exists only as the quarantine ring, which stays inspection-only (design.md:492, I13): at assembly time the **transport adapter** — app code, not the recorder, which reads no host surface (I6) — copies `quarantine.entries()` into the bundle's own quarantine section rather than recording quarantined traffic continuously, so no policy is touched. The section is byte-capped and marked (corrected 2026-08-23): 0060's ring is bounded at 100 by *count*, and it holds schema-rejected traffic whose commonest rejection causes are malformed and oversized, so an uncapped ride-along would put unmetered megabytes into a bundle every counter reads as in-envelope. The recorder must never call `handle.subscribe()` — that surface refcounts real broker interest (design.md:225-230), and a recorder that subscribes changes what the broker delivers. The 0070 kit's `inspect` slot is **refused** as the MQTT tap: it is a single function slot ("read-only tap: observes, never alters", 0070 spike design.md:261) and taking it evicts devtools; the report's ruling is that the slot stays free and the recorder gets its pipeline-verdict visibility from the `IngressStats` counters instead (six counters, design.md:245-252), read at bundle-assembly time by the transport adapter (question 9) — verdict-per-message capture is explicitly traded away for composability, and if that trade ever reverses, the multiplex must be designed as a 0070 extension under its "one selector per stream, no interface reshaping" bar (D-0019's acceptance language, paraphrased).
- **HTTP bucket — the orval mutator wrap, request-record plus outcome-record.** The mutator is caller-owned by design (0060 design.md:466-475: orval's `override.mutator` points at a one-line file wrapping `boundary.fetcher`), so wrapping it is app-side composition, not a boundary change: the wrapped mutator emits a request-record at issue (template-key identity, method, sequenced) and an outcome-record at settlement (status or `BoundaryError` class, duration, bounded body), joined by a correlation id — the two-record model the enumeration forced, because pair-at-completion structurally misses the in-flight exchange that is often the hang being reported, and RD-4 requires an in-flight entry to say so. The `FetchLike` adapter decoration alternative is **rejected on verified grounds**: 0060's seam contract is adapter *substitution* — "each port has exactly two shipped adapters" (design.md:145-150) and the design's own rule is that two adapters make a seam real — so a decorating third adapter is outside the described shape; the mutator wrap sees the post-validation pairs the diagnosis actually wants; and aborts remain invisible by D-0018 ruling (question 5 prices the gap).
- **xstate bucket — one `actor.system.inspect()` observer per root actor, fanned into one tap.** The adapter owns the N observers and stamps `meta.sourceId` per root; the bucket keeps a single tap, because `attach()` supersedes on a second call and N naive attaches would mark the bucket dead N−1 times while capturing one machine (found by the enumeration, 2026-08-23). Public API, source-verified at 5.32.5 (`ActorSystem.inspect` declared without `@internal`, `system.ts:60-64`; near-zero cost detached). The bucket records an owned projection of the five event types actually emitted (`@xstate.transition` is declared and never emitted; `@xstate.action` is emitted and undocumented — pinned to source at charter), and the report chooses **snapshot-bearing microstep events plus external events** as the "transition" bucket's content, with action events off by default (config row), because @statelyai/inspect's wire format silently dropping microstep/action events is the cautionary precedent for choosing by documentation instead of source. The observer attaches per root actor at actor creation — which is the composition-root ordering problem question 6's health block addresses (`attachedSince` stamps), since machines started before the recorder observes them are otherwise indistinguishable from idle machines.
- **Log bucket — optional, a facade `Sink` via `addSink`, post-redaction.** The facade does not exist yet (0050's surface is a signature sketch; D-0014 records the acceptance), so this bucket is declared optional and must not create a build-order dependency: the recorder ships without it, and when the facade lands, `addSink('recorder', sink, { minLevel })` attaches the bucket in one line. Two 0050 semantics are priced in: throttle rules thin what sinks receive, so the bucket records the post-throttle stream unless the config exempts `recorder`-relevant patterns the way `-contract.*` exemptions already work (0050 report.md:157); and records arrive post-redaction, which is correct — the recorder must not hold a less-redacted view than the facade's sinks.
- **Custom buckets** attach through the same interface the built-ins use (question 6); the built-ins' privilege audit is part of question 15's falsification list — if any built-in needs a capability the public interface lacks, the interface is wrong.
- **The first-connect backlog is a declared capture gap** (added 2026-08-23 — a plan question-4 sub-question the first draft skipped). The app runs a persistent session (`clean: false`), so the broker delivers a queued backlog immediately on connect; if the boundary connects during construction, that burst arrives before the wire-1 tap can attach, and it is exactly the history a bundle would want. The design's answer is honest rather than clever: the composition root attaches the tap before calling `start()` where the boundary's lifecycle permits it, and where it does not, the bucket's `attachedSince` stamp makes the gap visible rather than silent. What the tap **can** always see is the reconnect: wire 1 carries no gap concept, so without an explicit marker a bundle splices pre- and post-reconnect records into unbroken history with every drop counter at zero — the adapter therefore records a synthetic gap record from its wire-2 subscription (worked example above), which is also what makes the stream convertible to 0070's `ValidatedMessage | 'gap'` shape at all.
- **When taps attach**: the composition root constructs the recorder core first (rings + config, no taps), then constructs the boundary with no recorder involvement, then attaches taps in dependency order (xstate observers at actor creation, mutator wrap at client module init, wire-1 listener after boundary construction, log sink whenever the facade exists). The init-order cycle the enumeration found — 0060's `inspect` is a constructor-only config slot, which would force recorder-before-boundary while the HTTP wrap needs boundary-first — is dissolved by the `inspect` refusal above: no recorder tap uses a constructor-only slot, so every tap attaches *after* its host exists. Each attachment stamps `attachedSince` (both clocks), the bundle distinguishes quiet-since-attach from not-yet-attached, and the boot window before attachment is priced in question 7's pre-arm design.

### 5. What do the capture gaps cost, and does the track pay to close them?

Two gaps, both charter-verified, each with a pre-authorized route and a different verdict:

- **Outbound MQTT publishes: not paid for now.** `MessageEvent` is typed over inbound channels only and the only egress record is the never-in-prod memory adapter (0060 design.md:283-291, 431-447; the gap statement itself is D-0040's). Closing it means a new boundary emission via the pre-authorized "policy-row addition, not an interface redesign" route (design.md:575). The report's verdict: the gap is acceptable for the initial recorder because outbound publishes are app-initiated by construction — and because outbound volume is assumed to be a small fraction of the ~50 msg/s aggregate, an assumption the app profile does not supply and this report declares (see *Facts, and what remains assumed*; intake item n now asks for the split and is open) — the state machines that publish can `record()` their own intent through the custom-bucket interface at the call site, which captures the *decision* to publish without touching 0060. What that misses is the boundary's actual wire behaviour (a publish that never left, QoS downgrades), so the report flags the emission as the named follow-up if field bundles show publish-shaped mysteries: one policy row, an `egress` event on wire 1, recorder picks it up with zero interface change. The D-0015 reopening this avoids is real: a typed egress event class on wire 1 widens the wire's type union, which is an interface change 0060 would have to ratify.
- **Aborted REST requests: partially closed by the HTTP bucket itself, counter still recommended.** D-0018's ruling stands — aborts raise no telemetry envelope, visibility via a "boundary stats counter" that remains ratified language with no design (DECISIONS.md:147-152). The two-record HTTP bucket narrows this gap materially without touching the boundary: a request-record with no outcome-record at seal *is* the abort/in-flight evidence, in the bundle, with RD-4 marking. What the bucket cannot see is aborts of requests made outside the wrapped mutator (there should be none, by D-0002's restricted-imports discipline) and abort *reasons*. The report therefore recommends 0160 supply the missing design as a proposal to 0060's owners rather than building around it: the stats counter as three monotonic integers on the existing `stats` surface (`aborted`, `timedOut`, `settled`), read at bundle-assembly time by the transport adapter into the wire body's environment block — the same route question 9 uses for `IngressStats`, which keeps the recorder observation-only — with no new events and no telemetry, inside D-0018's letter. Whether to build it is 0060's call; the recorder is complete without it, just blinder to non-mutator aborts that lint says should not exist.

### 6. What is the standard interface, and what does a bucket declaration look like?

The interface below is the output of a grounded design panel run per the repo's [design-panel convention](../../.claude/skills/design-panel/SKILL.md) and the vendored design-it-twice pattern for code interfaces: the grounding phase was this survey's evidence sweep, three variants were proposed under opposing constraints (minimal 1–3-entry-point surface; everything-is-a-policy-row registry; ports-and-adapters with first-class tap lifecycle), and a judge ruled against a stated default — the burden of proof sat on displacing 0060's proven policy-row registry idiom. No deviations from the convention's shape; the full panel record (all three stances, complete variant artifacts, refusals, and the judge's reasoning verbatim) is preserved in [design-panel-record.md](design-panel-record.md).

**The verdict**: the minimal-surface variant wins *carrying the default inside it* — its frozen bucket table is exactly the ChannelPolicy registry compiled once at construction, so the registry idiom is executed at maximum depth rather than displaced — with two adoptions from the losing variants: the registry variant's per-name unknown-bucket ledger (under loose TS the typo names itself; an aggregate count hides which name was wrong), and the ports variant's self-observed tap-death doctrine expressed through the existing `detach(reason)` (the mqtt adapter watches wire-2 and reports its own seam's death; detach never discards the ring — when capture stopped is itself evidence). The judge's highest-value rejections, recorded so they stay rejected: `record()` returning an outcome value (hands every tap recorder state to branch on — under agent churn an invitation to grow `if (!out.accepted)` paths inside the boundary's dispatch turn; outcomes are health counters, never caller-branchable), any runtime config-override seam (a second config channel startup validation never audits — the kill switch needs only a construction-time bit riding the app's startup-config channel plus a reload), fail-fast construction (a diagnostics tool must not take the app down at boot for an observability typo — the ruled posture is **fail-safe-loud**: `createFlightRecorder` never throws, an invalid row disables that bucket, and every rejection lands in `health().configErrors`, in every bundle header, and behind a one-line startup assertion), a tap lifecycle registry with recorder-invoked probes (the init-order cycle dissolves by construction order — the recorder has no dependencies and is built first — and probes are more recorder-executed app code to contain), and any read/query API over ring contents (the only reader is the seal).

**What the judged design leaves deliberately unsolved**, carried into the enumeration and the spike rather than papered over: a source that dies with no observable teardown is detectable only forensically (`attachedSince` plus stagnant `lastRecordAt` read against corroborating buckets — no liveness oracle is pretended; probe-at-seal is the named escalation if the enumeration shows a real occurrence); mid-session kill without a reload is unsupported by design, and disable-without-redeploy presupposes the app's startup-config channel exists and carries the bit (a fact, not a feature); per-record index overhead sits outside the byte meter as a validator constant needing a spike-measured value; post-trigger records are identified only by `seq > cut.seq` (a consumer rule, no per-record flag); capturing 0070's ingress-verdict traffic is left to the composition layer (question 4's refusal of the single `inspect` slot stands; question 9 routes the stats); and the bounded correlation open-set needs a sizing rule before the OpenAPI contract freezes `openAtSeal`.

```typescript
// flight-recorder — capture interface (signature sketch, D-0001: design, no implementation).
// Posture-independent: whether the machinery behind the seam is owned code or a wrapped
// SDK core, this surface is what the app AND the four built-in taps program against.
//
// Three runtime entry points: the record path (attach → record), capture, health.
// createFlightRecorder/dispose are composition-root lifecycle, not app-facing calls.
// Everything else in this file is a record shape, not a callable.
//
// ── Invariants (the interface's real content) ─────────────────────────────────
// I1  No throw crosses the seam outward. record(), attach(), detach(), capture() and
//     health() never throw into the caller; every internal failure — a projection
//     walk that throws in app getters/proxies/toJSON included — is a COUNTED drop.
// I2  Serialize-at-capture. When record() returns, the recorder holds no reference to
//     the caller's entry. Stored bodies own their memory: truncation COPIES, never
//     slices (a V8 SlicedString/SpiderMonkey dependent string retains its parent).
// I3  Bounded by construction. Per bucket, count ≤ maxCount and bytes ≤ maxBytes at
//     every instant; bytes are serialized UTF-8, metered once at capture, charged
//     post-truncation. The global envelope is enforced STATICALLY by the config
//     validator — Σ(maxBytes + PER_RECORD_OVERHEAD × maxCount) + headerAllowance ≤
//     config.envelopeBytes — never by cross-bucket eviction. The invariant is
//     PER RECORDER INSTANCE; one recorder per page is enforced at construction, and
//     the quarantine ride-along is byte-capped separately because it enters the
//     bundle without passing the meter.
// I4  The ledger reconciles, in fields a bundle actually carries:
//     drops.recorded = BucketHealth.count + drops.evicted + drops.oversized, and
//     projectionFailures + reentrant + tapErrors count entries that never became
//     records. A bundle accounts for every absence; there is no uncounted loss.
// I5  Seal = O(n) copy of immutable record references + a per-bucket cut marker
//     {seq, wallMs, monoMs}. Index snapshots are forbidden — they tear under
//     continued capture.
// I6  Observation only. The recorder subscribes to nothing, publishes nothing,
//     classifies nothing, participates in no transaction, and never reports through
//     itself. The injected transport MUST NOT route through any fetcher a tap wraps
//     (structural no-self-capture: the http tap wraps the app's orval mutator; the
//     recorder's POST rides a bare fetch behind the transport seam).
// I7  No privileged callers. The four built-in taps (mqtt, http, xstate, log) and
//     every failure net — window.onerror, unhandledrejection, the React boundary
//     adapter — use exactly this surface. If a built-in needs more, this interface
//     is wrong.
// I8  Config is fail-safe-loud. createFlightRecorder NEVER throws (a diagnostics
//     tool must not take the app down at boot — the ruled choice; fail-fast was
//     considered and refused). An invalid bucket row disables that bucket; every
//     rejection appears in health().configErrors and in every bundle header.
//     "Silent" is averted by the ledger and the one-line startup assertion
//     (health().configErrors.length === 0), not by throwing.
// I9  capture() is synchronous through the seal; bundling, compression (worker-side),
//     and delivery run behind the seam, never on the record() path. The interface is
//     main-thread only — a temporary truth, not a designed-in one; the two costs a
//     future worker bridge must pay are named under RD-3 (question 12), not solved.
// I10 Layering: record() is for services and state machines, enforced by the repo's
//     restricted-imports discipline (D-0002) — no stronger rule invented here.
//     Components reach the recorder only through the error-boundary adapter.

// ── Construction (composition root, service startup) ──────────────────────────

export function createFlightRecorder(config: RecorderConfig): FlightRecorder;

export interface RecorderConfig {
  /** THE kill switch: one bit, read once at construction (the seam ruling — see
   *  report; a recorder-owned remote flag is refused). Disable-without-redeploy
   *  rides whatever channel already feeds startup config, plus a reload. Disabled:
   *  every entry point is an inert no-op and health().enabled === false. */
  enabled: boolean;

  /** RD-7 identity seeds. pageIncarnationId and per-capture bundleId are generated
   *  behind the seam from crypto.getRandomValues — NOT crypto.randomUUID, which is
   *  secure-context-only and absent on an http:// origin (added 2026-08-23: the
   *  enumeration found that a plain-http fleet would otherwise throw inside a
   *  constructor I8 forbids from throwing, silently disabling every recorder in the
   *  fleet). A fleet-unique device id IS available to page code (item i answered);
   *  whether it may ride a report leaving the device is the half item i did not
   *  answer, so the field stays optional and the recorder degrades rather than
   *  throws when the composition root omits it. */
  identity: { appBuild: string; deviceId?: string };

  /** The global envelope in serialized-UTF-8 bytes — the operand I3 validates
   *  against (added 2026-08-23: I3 previously named a bound the config surface had
   *  no field to express, leaving the design's most load-bearing number a hidden
   *  constant undetermined between the charter's 10 MB and 50 MB, whose two
   *  consequences are "ships" and "fleet-wide inert recorder"). Validation is
   *  Σ(maxBytes + PER_RECORD_OVERHEAD × maxCount) + headerAllowance ≤ envelopeBytes.
   *  Note this budgets RING bytes; the wire body re-escapes every record body inside
   *  the bundle's own JSON at roughly 1.4–1.7×, so an endpoint ceiling (intake c)
   *  must be negotiated on wire bytes, not on this number. */
  envelopeBytes: number;

  /** The bucket table — 0060 ChannelPolicy's proven shape: declarative rows,
   *  validated and FROZEN at construction. No runtime add/remove (refused: 0050's
   *  addSink dynamism is the wrong precedent for evidence machinery — the bundle's
   *  config digest must stay truthful for the whole session). A bucket not
   *  declared here does not exist. */
  buckets: Record<string, BucketPolicy>;

  /** ONE rule set for the WHOLE bundle (0050's rule shape, shared as rules — the
   *  facade's choke point covers facade sinks; this one covers bucket projections
   *  AND, at seal, the fields that bypass them: the trigger's error/stack, the
   *  caller context, and the quarantine ride-along). Redaction stamps
   *  {redacted, ruleId} markers, structurally distinct from truncation (RD-10).
   *  Per-bucket rule sets refused; path rules provide per-bucket scoping where
   *  needed. (The config snapshot is NOT in this list: Q9 ships a digest, and a
   *  digest is not redactable.) */
  redaction: RedactionRules;

  /** Trigger discipline — global; per-bucket windows refused. */
  trigger?: {
    /** Suppression window after a seal; suppressed triggers are counted. Default 30_000. */
    cooldownMs?: number;
    /** Post-trigger window before the bundle closes: first of ms / maxItems, across
     *  all buckets. Default { ms: 0 } — seal immediately. Post-window records are
     *  identified by seq > cut.seq; no extra field. */
    postTrigger?: { ms?: number; maxItems?: number };
  };

  /** Nets the recorder can arm itself — each is internally an adapter over
   *  capture() (I7). The React boundary cannot be armed from config (React 18.3.1
   *  has no root error hook) and is a separate adapter export below. Chaining with
   *  incumbent handlers: the nets call any previous handler; intake item g.
   *  Nets carry liveness like taps do (added 2026-08-23): they are armed via
   *  addEventListener, and at every seal the recorder re-checks that its own
   *  handlers are still reachable, reporting the result in health().nets — because
   *  any later `window.onerror = …` by another script disarms the recorder
   *  permanently and silently, which no counter could otherwise distinguish from a
   *  quiet fleet. */
  nets?: { windowErrors?: boolean; unhandledRejections?: boolean };

  /** The delivery seam — the posture boundary. Retry/backoff/one-at-a-time,
   *  worker-side gzip, and the wire format live behind it (owned fetch+backoff or
   *  a wrapped SDK transport; the interface cannot tell). MUST NOT route through
   *  any tapped fetcher (I6). Its errors are its own to absorb: the recorder never
   *  reports through itself. */
  transport: (bundle: SealedBundle) => void | Promise<void>;
}

export interface BucketPolicy {
  maxCount: number;
  /** Serialized-UTF-8 budget for retained bodies, charged POST-truncation (the
   *  stored body's own size; RD-5's originalSize carries the pre-truncation figure).
   *  Per-record index/meta overhead is outside the meter, bounded by maxCount, and
   *  entered into the envelope check as PER_RECORD_OVERHEAD × maxCount. */
  maxBytes: number;
  /** Per-entry ceiling; a larger projection is truncated WITH COPY and marked
   *  {truncated, originalSize}. Default min(maxBytes / 8, 256 KiB). The validator
   *  rejects maxEntryBytes > maxBytes, so `oversized` is a defense-in-depth species
   *  (reachable only when a record's markers and meta cannot fit the floor). */
  maxEntryBytes?: number;
  /** Pre-serialization narrowing/scrub — the ONLY behavior a row may carry. Runs
   *  app code and may throw: a throw is a counted projectionFailure, never an
   *  exception into the tap (I1). Omitted: the entry goes straight to the bounded
   *  serializer (cycle-safe, depth/breadth-capped, structured {elided} markers for
   *  every elision and JSON coercion — never only in-band strings). */
  project?: (entry: unknown) => unknown;
  /** RD-8 — required on EVERY row, uniformly: built-in taps ship their own ids
   *  (recorder.mqtt@1, recorder.http@1, recorder.xstate@1, recorder.log@1), so the
   *  validator needs no built-in/app distinction. */
  schema: { schemaId: string; schemaVersion: string };
}

/** Rules are DATA, never live RegExp objects (amended 2026-08-23 — three
 *  enumeration lanes converged on this). A shared `/g`- or `/y`-flagged RegExp
 *  carries `lastIndex` between calls, so redaction succeeds on one record and
 *  silently skips the next — half the fleet's records ship the secret while the
 *  other half carry {redacted} markers, so the bundle looks scrubbed while leaking;
 *  and if the frozen config makes lastIndex non-writable, every match throws
 *  instead, emptying every bucket. Patterns are therefore source+flags strings: the
 *  validator rejects the `g` and `y` flags outright, and the applier compiles once
 *  and never shares mutable state across records. */
export interface RedactionRules {
  keys?: string[];
  paths?: string[];
  patterns?: { source: string; flags?: string; ruleId: string }[];
}

// ── The handle: three entry points ────────────────────────────────────────────

export interface FlightRecorder {
  /** Entry point 1 — the record path. Stamps attachedSince and increments the
   *  bucket's attach epoch, so a bundle distinguishes "quiet" from
   *  "not-yet-attached" and boot-window gaps are visible. One live tap per bucket:
   *  a second attach() supersedes the first (old tap marked detached
   *  'superseded', epoch++) — matching source-recreation reality. A bucket fed by
   *  SEVERAL sources (the xstate bucket observes one root actor per machine) keeps
   *  one tap: its adapter owns the N observers, fans them into that tap, and stamps
   *  meta.sourceId — superseding per source would make every attach after the first
   *  mark the bucket dead (added 2026-08-23; the enumeration found the plain reading
   *  silently captured one machine of N). Unknown bucket name (the expected typo
   *  under loose TS): an inert tap plus a counted config error — no throw (I1/I8);
   *  unknownBuckets and configErrors are each capped (see RecorderHealth), because
   *  a dynamic name like attach(`mqtt-${topic}`) would otherwise allocate forever
   *  inside a memory-bounded component. Attach order breaks the plan's init cycle:
   *  the recorder has no dependencies, so it is constructed first; each tap attaches
   *  as its source constructs. One recorder per page: construction registers a
   *  page-global marker and a second construction returns the first instance with a
   *  counted config error, because I3's envelope is a per-instance invariant that
   *  everyone reads as a per-device budget. */
  attach(bucket: string): RecorderTap;

  /** Entry point 2 — the ONE trigger path. Explicit app calls and every net land
   *  here identically. Synchronous through the seal (I5/I9): per bucket, copy the
   *  entry references, stamp the cut marker, snapshot DropCounters and the
   *  correlation open-set. Returns a receipt, never a promise — delivery is not
   *  the caller's concern. 'suppressed' inside cooldownMs of a seal; 'coalesced'
   *  while a post-trigger window holds a bundle open (reason appended to that
   *  bundle's header). Both are counted (health().triggers). */
  capture(reason: string, opts?: CaptureOptions): CaptureReceipt;

  /** Entry point 3 — the recorder's own state; 0070's IngressStats move: a cheap
   *  immutable snapshot that doubles as the assertion surface. The startup guard
   *  against I8 hiding a typo'd config in the fleet is one line:
   *  health().configErrors.length === 0. */
  health(): RecorderHealth;

  /** Composition-root lifecycle only (tests, HMR): disarms the nets it armed,
   *  frees rings. Not an app-facing entry point. */
  dispose(): void;
}

export interface RecorderTap {
  /** THE sink. Synchronous, fire-and-forget, never throws, never blocks (I1).
   *  Inside, in order, before return: project → bounded-serialize WITH REDACTION AS
   *  THE REPLACER (walk guarded; app code may throw) → meter UTF-8 →
   *  truncate-with-copy → stamp {seq, gseq, wallMs, monoMs} → evict-oldest to fit
   *  (I2/I3). Redaction sees the object graph, never the finished JSON string
   *  (corrected 2026-08-23): key and path rules need the graph, and substituting
   *  over a serialized string would either re-parse it or corrupt the body across
   *  JSON syntax — so the applier runs as the serializer's replacer, inside the same
   *  walk, which is what Q13's "inside the capture-turn walk" describes. meta carries only facts the tap knows; policy lives in config —
   *  nothing per-call is policy. Returns void: outcome is health-countable, never
   *  caller-branchable — a tap sitting in someone else's latency path must never
   *  gain a reason to branch or retry. Re-entrant calls are refused and counted: a
   *  getter that logs re-enters through the facade into the log bucket's record()
   *  mid-eviction, and unguarded that corrupts the byte total and the seq counter
   *  or ends in a RangeError thrown into the dispatch turn I1 protects. */
  record(entry: unknown, meta?: RecordMeta): void;

  /** Marks the tap dead in health and every later bundle. Three callers, one
   *  member: the composition root wires source teardown here (boundary dispose →
   *  detach('boundary-disposed')); a tap that can OBSERVE its own seam die calls it
   *  itself — the mqtt adapter watches wire-2 and calls detach('connection-ended'),
   *  the log adapter detaches when the facade drops its sink; and the recorder
   *  detaches a tap whose body has thrown past a threshold
   *  (detachReason 'self-protective' — tap self-protection only, never a trigger,
   *  so the charter's exclusion of recorder-evaluated rules is untouched).
   *  The call is EPOCH-GUARDED: a stale handle from a superseded epoch is a no-op
   *  plus a counted config error, never a death marker on the live tap — the
   *  unguarded version had the worked example's own onBoundaryDispose closure
   *  marking a live tap dead after a reconnect (added 2026-08-23). Detach never
   *  discards evidence: the ring, its records, and the death marker remain for the
   *  next bundle — when capture stopped is itself evidence. Honest limit: a source
   *  that dies with NO observable teardown is detectable only as attachedSince + a
   *  stagnant lastRecordAt — the bundle exposes both and the reader judges; no
   *  liveness oracle is pretended. */
  detach(reason: string): void;
}

export interface RecordMeta {
  /** Record type within the bucket (e.g. 'message' | 'telemetry' for mqtt). */
  kind?: string;
  /** RD-4. */
  direction?: 'in' | 'out';
  /** Joins multi-record exchanges (http request-record + outcome-record). The
   *  recorder keeps a bounded per-bucket open-set: phase 'open' adds the id,
   *  'settled' removes it; ids still open at seal are stamped into the bucket
   *  block — in-flight-at-seal is explicit even when either half was evicted. */
  correlationId?: string;
  /** Default 'settled' (a point event). */
  phase?: 'open' | 'settled';
  /** Terminal outcome for settled records: 'fulfilled' | 'aborted' | 'error' |
   *  app-defined (RD-4). */
  outcome?: string;
  /** RD-6 — per payload. */
  mimeType?: string;
  encoding?: 'utf-8' | 'base64' | 'json';
  /** RD-9: marks a self-sufficient starting point (the xstate tap stamps its
   *  periodic persisted-snapshot records). At seal, oldestIsComplete = no
   *  evictions yet OR the oldest retained record carries this bit. */
  checkpoint?: boolean;
}

export interface CaptureOptions {
  /** Header material. The stack is parsed behind the seam; error, stack, and
   *  context all pass the redaction rules at seal (whole-bundle ruling, plan Q13). */
  error?: unknown;
  context?: Record<string, unknown>;
}

export type CaptureReceipt =
  | { outcome: 'sealed'; bundleId: string }
  | { outcome: 'coalesced'; bundleId: string } // joined the open bundle
  | { outcome: 'suppressed' }                  // cooldown; counted
  | { outcome: 'disabled' };                   // kill switch

// ── Health (the observation block; also embedded in every bundle header) ─────

export interface RecorderHealth {
  readonly enabled: boolean;
  /** I8 residue — startup validation rejections, human-readable, stable order.
   *  CAPPED (32 entries + an overflow count): it rides every bundle header, and
   *  entries derived from caller strings must not grow without bound. */
  readonly configErrors: readonly string[];
  readonly configErrorsOverflow: number;
  readonly buckets: Readonly<Record<string, BucketHealth>>;
  readonly triggers: { readonly sealed: number; readonly coalesced: number; readonly suppressed: number };
  /** Liveness of the armed nets, re-checked at each seal (added 2026-08-23): a
   *  later `window.onerror = …` from any other script disarms the recorder
   *  silently and permanently, and without this a disarmed net is indistinguishable
   *  from a quiet one across a whole release. */
  readonly nets: { readonly windowErrors: 'armed' | 'disarmed' | 'off'; readonly unhandledRejections: 'armed' | 'disarmed' | 'off' };
  /** Delivery outcomes reported back by the transport adapter (added 2026-08-23 —
   *  Q10's counters previously existed in no type and had no channel home). */
  readonly delivery: { readonly failed: number; readonly rejected: number; readonly evictedPending: number };
  /** record() traffic to undeclared bucket names, keyed by the offending name —
   *  under loose TS the typo names itself. CAPPED at 16 distinct names plus an
   *  overflow counter: attach() takes a free string, so one agent-authored dynamic
   *  name (attach(`mqtt-${topic}`)) would otherwise mint a map entry per value
   *  forever — an unbounded allocator, outside the byte meter, inside the component
   *  whose thesis is bounded-by-construction, and a caller-derived string channel in
   *  every header. Names are redacted at seal like all free text. */
  readonly unknownBuckets: Readonly<Record<string, number>>;
  readonly unknownBucketsOverflow: number;
}

export interface BucketHealth {
  readonly attachedSince?: number;  // absent = never attached (≠ quiet)
  readonly detachedAt?: number;
  readonly detachReason?: string;
  readonly attachEpoch: number;     // increments per attach/supersede
  readonly lastRecordAt?: number;
  readonly seq: number;             // last stamped sequence number
  readonly count: number;
  readonly bytes: number;           // current metered total
  readonly drops: DropCounters;
}

/** The ledger (I4). All counters cumulative since construction. */
export interface DropCounters {
  readonly recorded: number;           // records stamped since construction (I4's LHS)
  readonly evicted: number;            // ring pressure (count or bytes)
  readonly truncated: number;          // stored, but cut, with markers
  readonly oversized: number;          // unstorable even at truncation floor
  readonly projectionFailures: number; // the walk, project(), or redaction threw
  readonly tapErrors: number;          // the tap body threw outside projection
  readonly reentrant: number;          // record() re-entered from inside a walk
}

// ── The sealed bundle (input to the transport seam; the OpenAPI contract's seed) ─

export interface SealedBundle {
  readonly header: BundleHeader;
  readonly buckets: Readonly<Record<string, SealedBucket>>;
  /** The MQTT quarantine ride-along, when the composition root wires it (added
   *  2026-08-23: Q4 promised this section and no type carried it). It is filled by
   *  the transport adapter at assembly time from the boundary's own read-only
   *  `quarantine.entries()` — not by the recorder, which reads no host surface (I6)
   *  — and it is BYTE-CAPPED and marked, because 0060's ring is bounded at 100
   *  entries by COUNT and holds schema-rejected traffic whose whole failure mode is
   *  being malformed or oversized: uncapped it would put unmetered megabytes into a
   *  bundle every counter reads as in-envelope. */
  readonly quarantine?: {
    readonly entries: readonly CapturedRecord[];
    readonly bytes: number;
    readonly truncatedEntries: number;
    readonly droppedForBytes: number;
  };
}

export interface BundleHeader {
  readonly formatVersion: string;                   // RD-7
  readonly creator: { readonly name: string; readonly version: string }; // RD-7 (HAR log.creator)
  readonly platform: string;                        // RD-7: userAgent at seal
  readonly bundleId: string;
  readonly baseBundleId?: string;                   // supplements name their base
  readonly deviceId?: string;
  readonly pageIncarnationId: string;
  readonly appBuild: string;
  /** RD-2/RD-3: one shared clock domain; every record's monoMs offsets this origin. */
  readonly clockOrigin: { readonly wallMs: number; readonly monoMs: number };
  readonly sealedAt: { readonly wallMs: number; readonly monoMs: number };
  readonly trigger: {
    readonly reason: string;
    readonly coalescedReasons: readonly string[];
    readonly error?: { readonly message: string; readonly stack?: string; readonly markers?: readonly LossMarker[] };
  };
  /** Digest, not the raw config — plus the I8 residue, so a thinned config is visible. */
  readonly configDigest: string;
  readonly configErrors: readonly string[];
  /** Full health snapshot at seal: drop ledger, byte totals, tap liveness. */
  readonly health: RecorderHealth;
}

export interface SealedBucket {
  readonly schema: { readonly schemaId: string; readonly schemaVersion: string }; // RD-8
  readonly cut: { readonly seq: number; readonly wallMs: number; readonly monoMs: number }; // I5
  readonly counters: DropCounters;              // at cut
  readonly attach: { readonly attachedSince?: number; readonly detachedAt?: number; readonly detachReason?: string; readonly epoch: number };
  /** RD-9. True only if no evictions have occurred OR the oldest retained record
   *  carries meta.checkpoint AND that record is itself unmarked — a checkpoint
   *  stored truncated (an xstate persisted snapshot is the largest record a bucket
   *  produces, and maxEntryBytes applies to it like any other) is not a replayable
   *  starting point, and claiming otherwise promotes RD-5's anti-pattern from one
   *  record to the whole window (added 2026-08-23). */
  readonly oldestIsComplete: boolean;
  readonly droppedBeforeWindow: number;         // RD-9 (== counters.evicted at cut)
  readonly openAtSeal: readonly string[];       // RD-4: correlation ids in flight, capped
  readonly openAtSealOverflow: number;          // ids elided by that cap
  readonly records: readonly CapturedRecord[];  // seq order; seq > cut.seq ⇒ post-trigger
}

export interface CapturedRecord {
  readonly seq: number;                          // RD-1: per-bucket monotonic
  /** Recorder-global monotonic counter, stamped in the same synchronous step as
   *  seq (added 2026-08-23). Per-bucket sequences plus timestamps cannot order
   *  records ACROSS buckets — Firefox clamps timer precision to ~1 ms at the floor,
   *  so at ~50 events/s ties are the normal case — and cross-bucket interleaving is
   *  the recorder's one distinct claim (Q1). One counter makes the total order
   *  exact and costs one integer per record. */
  readonly gseq: number;
  readonly wallMs: number;                       // RD-2
  readonly monoMs: number;                       // offset from header.clockOrigin
  readonly sourceId?: string;                    // which source fed a multi-source bucket
  readonly kind?: string;
  readonly direction?: 'in' | 'out';
  readonly phase?: 'open' | 'settled';
  readonly outcome?: string;
  readonly correlationId?: string;
  readonly mimeType?: string;                    // RD-6
  readonly encoding?: 'utf-8' | 'base64' | 'json';
  readonly bytes: number;                        // metered UTF-8 size of body
  readonly body: string;                         // owns its memory (I2)
  readonly markers?: readonly LossMarker[];      // structured, never only in-band
}

export type LossMarker =
  | { readonly truncated: true; readonly originalSize: number }              // RD-5
  | { readonly redacted: true; readonly ruleId: string; readonly at?: string } // RD-10
  /** `cause: 'circular'` is in the union because the chosen serializer renders
   *  cycles as the in-band string "[Circular]" — and cycles are exactly what the
   *  motivating data shapes (the xstate actor graph, reused Ajv ErrorObjects) carry,
   *  so omitting the cause would leave the design's own anti-pattern in place for
   *  its own worst case. `cause: 'unserializable'` covers a value the walk cannot
   *  represent at all — a FormData or Blob request body serializes to `{}` with no
   *  depth or breadth exhaustion to detect, which would otherwise be recorded as an
   *  empty body indistinguishable from a genuinely empty one (both added
   *  2026-08-23). */
  | { readonly elided: true; readonly at: string; readonly count?: number;
      readonly cause: 'depth' | 'breadth' | 'coercion' | 'circular' | 'unserializable' };

// ── react-net.ts (separate module: the core stays React-free) ─────────────────

import type { ComponentType, ReactNode } from 'react';

/** The React net's FALLBACK form. The recommended integration is one
 *  recorder.capture('react-error-boundary', {error, context}) call inside the app's
 *  existing boundary (item g); this factory exists for subtrees that have none.
 *  An adapter with ZERO privileged access (I7): it only calls capture() — React
 *  18.3.1 has no root error hook, so this is a component the app mounts, not a
 *  hook the recorder arms. The only recorder import permitted in React land (I10). */
export function createRecorderBoundary(
  recorder: FlightRecorder,
): ComponentType<{ fallback: ReactNode; children?: ReactNode }>;
```

The worked example — the MQTT bucket declared, tapped, dying observably, and a trigger sealing — doubles as the built-ins' privilege audit (invariant I7):

```typescript
// ── Composition root, service startup ─────────────────────────────────────────
const recorder = createFlightRecorder({
  enabled: startupConfig.flightRecorder !== 'off',      // the kill-switch seam
  // I3's operand, not a hidden constant. PER TAB: the fleet runs at most two tabs
  // (intake j), so the device pays 2× this — 40 MiB of serialized bytes, nearer
  // 80 MiB of heap by Q2's UTF-16 caveat, against 6–16 GB of contended RAM.
  envelopeBytes: 20 * MiB,
  identity: { appBuild: BUILD_ID, deviceId: startupConfig.deviceId },
  redaction: {
    keys: ['password', 'token'],
    paths: ['payload.operator.*'],
    // patterns are data, not RegExp objects; g/y flags are rejected by the validator
    patterns: [{ source: 'Bearer\\s+[A-Za-z0-9._-]+', flags: 'i', ruleId: 'bearer' }],
  },
  trigger: { cooldownMs: 30_000, postTrigger: { ms: 0 } },  // defaults, spelled out
  buckets: {
    // Counts are intake item d's day-one depths; MQTT is raised from the requested 100
    // because 100 is ~2 s at 50 msg/s (Q2's arithmetic) and the envelope has the room.
    // The mqtt bucket is ONE declarative row — same row shape any app bucket uses.
    //
    // Each maxBytes is a WORST-CASE RESERVE, not an expected fill: at the analogy
    // record sizes in Q2, http/xstate/log expect to hold well under a quarter of
    // theirs. Tightening those three toward 1 MiB / 1 MiB / 0.25 MiB would free
    // ~4.75 MiB for a ~1,700-message MQTT ring (~34 s) inside this same envelope —
    // a real tuning choice, and one the spike's measured record sizes should settle
    // rather than this table guessing twice.
    mqtt: {
      maxCount: 1_200,                  // ~24 s at ~50 msg/s; the requested 100 was ~2 s
      maxBytes: 12 * MiB,               // Σ over all rows validated ≤ envelopeBytes (I3)
      maxEntryBytes: 64 * KiB,          // ~31% above item a's ESTIMATED 50 KB worst case
      schema: { schemaId: 'recorder.mqtt', schemaVersion: '1' },
      // no project(): wire-1 events are already plain validated data — the default
      // bounded serializer is the projection
    },
    // 25 exchanges = 50 records under the two-record model (request + outcome).
    http:   { maxCount: 50, maxBytes: 4 * MiB, schema: { schemaId: 'recorder.http', schemaVersion: '1' } },
    // 100 records ≈ FEWER than 100 transitions: a transition emits a microstep event
    // plus its external event, and Q12's checkpoints share the ring. Raise if field
    // bundles show the window is too short.
    xstate: { maxCount: 100, maxBytes: 2 * MiB, project: projectInspectionEvent,
              schema: { schemaId: 'recorder.xstate', schemaVersion: '1' } },
    log:    { maxCount: 50, maxBytes: 1 * MiB, schema: { schemaId: 'recorder.log', schemaVersion: '1' } },
  },
  transport: postBundleToReportEndpoint,  // bare fetch + backoff; never the wrapped fetcher (I6)
});
// The one-line guard fail-safe-loud (I8) demands:
console.assert(recorder.health().configErrors.length === 0, recorder.health().configErrors);

// ── The mqtt tap: a privilege-free adapter over the same surface (I7) ─────────
// Recorder exists before the boundary (it has no dependencies), so attach-before-
// traffic is just construction order — no init cycle.
const mqttTap = recorder.attach('mqtt');                 // stamps attachedSince
const stop = boundary.actor.on('*', (ev) => {            // 0060 wire-1 wildcard tap
  if (ev.type === 'telemetry') {
    mqttTap.record(ev.event, { kind: 'telemetry' });
  } else {
    mqttTap.record(
      { channel: ev.channel, topic: ev.topic, params: ev.params, payload: ev.payload },
      { kind: 'message', direction: 'in', mimeType: 'application/json', encoding: 'json' },
    );
  }
  // record() serialized, redacted, metered, stamped, and (if needed) evicted before
  // returning; a payload whose getter throws became drops.projectionFailures — the
  // listener never sees an exception (I1) and the dispatch turn never slows.
});
// wire-2 is the liveness feed, not a record source: a tap that can observe its own
// seam die reports it through the same detach member — no extra surface.
const stopWire2 = boundary.actor.subscribe((snap) => {
  if (snap.connection === 'ended') mqttTap.detach('connection-ended');
  // A reconnect is a capture gap the tap CAN see and the wire cannot express: wire 1
  // carries no gap concept, so without this a bundle splices pre- and post-reconnect
  // records into unbroken history with every drop counter at zero. The synthetic gap
  // record is what makes the MQTT stream convertible to 0070's `ValidatedMessage |
  // 'gap'` at all (Q12's pre-commitment).
  if (snap.connection === 'reconnected') mqttTap.record({ gap: true }, { kind: 'gap' });
});
const disposeReg = onBoundaryDispose(() => {
  stop(); stopWire2(); mqttTap.detach('boundary-disposed');   // epoch-guarded: a stale
});                                                            // handle cannot mark a live tap dead
onBoundaryRecreate(() => disposeReg.cancel());                 // and the closure is unregistered
// Boundary recovery is the composition root's move, not the recorder's: recreate the
// boundary, then recorder.attach('mqtt') again — epoch++ and a fresh attachedSince
// keep the gap visible in the next bundle; the old ring's records remain until eviction.

// ── A trigger, sealing and bundling ───────────────────────────────────────────
// From a service or state machine (I10) — or identically from a net:
const receipt = recorder.capture('pump-controller-stuck', { error });
// receipt: { outcome: 'sealed', bundleId: 'b_01J…' }
//
// Synchronously, before capture() returned (I5/I9): each bucket's immutable record
// references were pointer-copied, cut markers {seq, wallMs, monoMs} stamped, the
// drop ledger and correlation open-set snapshotted. The SealedBundle — header with
// identity, clock origin, trigger, configDigest + configErrors, full health; per-
// bucket records with seq/two clocks/markers, oldestIsComplete, droppedBeforeWindow,
// openAtSeal — then flowed to `transport` behind the seam (worker gzip, retry, POST).
const second = recorder.capture('pump-controller-stuck', { error });
// second: { outcome: 'suppressed' } — inside cooldownMs; counted in health().triggers.
//
// What a bundle's liveness block distinguishes, per bucket (the three diagnoses):
//   attach.attachedSince absent                       -> never attached (boot-window gap)
//   attachedSince present, detachedAt set with reason -> died at a known time; ring kept
//   attachedSince present, no detach, stale lastRecordAt -> quiet — or an unobservable
//   death, which the reader judges from the corroborating buckets (honest limit).
```


### 7. What can each trigger actually see, and what is the trigger protocol?

**What each death produces, stated plainly per arm.** In-page errors: `window.onerror` and `unhandledrejection` see them, with one ceiling — cross-origin scripts without CORS attributes yield opaque `"Script error."` events with no stack, so the nets' yield depends on script origins (the app's own bundle is same-origin; third-party scripts, if any, report opaquely). Component-tree errors: React 18.3.1 has **no root-level error hook**, and a boundary-caught error never reaches `window.onerror` in production (development behaviour differs, which hides the gap from tests) — so the charter's "React error boundaries" net is app work rather than an armed hook. **The app already has a boundary** (intake item g, answered 2026-08-23), which makes the integration one line rather than a new component: the existing boundary's `componentDidCatch` calls `recorder.capture('react-error-boundary', { error, context })`. The recorder still ships `createRecorderBoundary(recorder)` for subtrees that have no boundary, but the recommended path is the incumbent, because a second boundary mounted around the first would change where the app's own error UI renders. Coverage is bounded by where boundaries actually sit: an error in a subtree with no boundary above it unmounts the tree without reaching either one, so the integration checklist is "which subtrees have a boundary", not "is the boundary installed". No incumbent `window.onerror` or `unhandledrejection` reporter was named, so the global nets arm without a known conflict — chaining is still implemented, since the fact is "none named", not "none exists". Renderer deaths (OOM, unresponsive kills, app-manager kills): no page event fires, ever. **The fleet is Firefox 124 and only Firefox** (intake items f and h, answered 2026-08-23), which settles this in the unhelpful direction: Firefox parses `Reporting-Endpoints` only from 130 and generates no crash-type reports at any version, so **crash-shaped deaths produce no report at all on this fleet, full stop**. The Chromium complement is real but inert here — crash reports have been deliverable via the `Reporting-Endpoints` header since Chrome 96 to the endpoint named `default` (the plan's "Chromium 139+" claim is corrected: 139 only added the dedicated `crash-reporting` endpoint *name*; [WICG spec delivery rule](https://wicg.github.io/crash-reporting/)), carrying `reason: 'oom' | 'unresponsive'`, `is_top_level`, and `visibility_state` as `application/reports+json`. Since Chromium is named as a possible future rather than a current arm, the recommendation is **not to add the header now** and to revisit it the day a Chromium arm appears, where it remains a backend header change with no client code. The only compensation available today is absence-based detection at the backend: a device whose bundles stop arriving mid-session is the crash signal, keyed on question 9's device and page-incarnation identity, built by whoever owns the report backend (backend work, not recorder work — the recorder's contribution is the identity fields that make the query possible). This is the largest single hole in the design's coverage, and on this fleet it has no client-side floor.

**The protocol.** A trigger — explicit `capture(reason)` or a net — runs a bounded synchronous sequence: stamp the trigger header (reason, tracekit-parsed stack, both clocks), **seal by copy**: per bucket, copy the entry references (O(n) pointer copies of immutable serialized records) and stamp a per-bucket cut marker, then snapshot the health ledger and the correlation open-set. Everything after — assembly, redaction of the trigger header itself (question 13), serialization, optional compression, delivery — is async off the trigger turn. Index-snapshot sealing stays forbidden for the reason the enumeration proved: rings overwrite in place, so an async bundler reading live rings sees post-trigger data at pre-trigger positions with no counter able to notice. Dedup and cooldown: one bundle per cooldown window (config; the interface's default is 30 s); suppressed triggers return a counted `{outcome: 'suppressed'}` receipt and ride the *next* bundle's health block, so an error loop shows up as `triggers.suppressed: 4000`, not as 4000 bundles. A trigger during an in-flight post-trigger window **coalesces** into the open window (`{outcome: 'coalesced'}`; the reason is appended to that bundle's header); a trigger past cooldown while a sealed bundle is still delivering seals normally, and the delivery loop bounds what accumulates — question 10's rule.

**The nets arm late, and the pre-arm answer is owned and small.** Module-eval, config-wiring, and first-mount errors fire before any recorder exists. The compensation is a pre-arm stub in the HTML head, before the app bundle: ~30 owned lines that register `error`/`unhandledrejection` listeners into a bounded array (count-capped; these are pre-boot errors, not history), which the recorder drains and replays into its own nets at init, then removes. **Its one deployment dependency is stated rather than assumed** (added 2026-08-23): an inline `<script>` does not execute under a CSP without `'unsafe-inline'` or a per-response nonce, and Vite 8 emits a static `index.html`, so whoever serves it would have to inject the nonce. This report used exactly that CSP lens to disqualify fast-redact as a dependency, and it applies to the recorder's own prescribed script — an empty replay queue at init is byte-identical to "no pre-boot errors occurred", so a blocked stub is invisible. The app's CSP and how `index.html` is served are raised for intake rather than assumed permissive (**intake item m**, open); an external stub file is the fallback if inline is barred. This copies the queue-and-replay *pattern* of Sentry's loader snippet — whose reference implementation was checked and found license-encumbered (the loader template lives in the FSL-1.1 getsentry/sentry repo, source-available but not OSS, so verbatim reuse fails D-0003; the pattern is ~50 lines and reimplementable). Boot-loop failures before even the stub (HTML did not parse, bundle 404) produce no report; absence-based detection is again the only net under those deaths.

### 8. Does capture continue past the trigger?

Yes, as a single configurable **global** post-trigger window — `trigger.postTrigger: {ms, maxItems}`, whichever fills first, across all buckets — **defaulting to zero**. Per-bucket windows were the panel's registry variant's proposal and were rejected: the window catches the aftermath of *one* incident, which is not a per-stream property. The default is zero because the charter's "possibly slightly after" is a want, not a requirement, and a zero default keeps the common path simple: seal-at-trigger, one bundle, done. When a window is configured, the seal happens in two cuts: the trigger cut (history to the trigger instant, per-bucket cut markers) and the window cut (the aftermath), shipped as **one bundle** whose records are partitioned by the cut markers — not a base-plus-supplement pair. The supplement design was considered and rejected for the initial recommendation: a supplement needs its own delivery slot under the one-at-a-time rule, doubles the identity bookkeeping (base id + supplement id), and the whole window is bounded by config anyway; if a future need arises for ship-now-supplement-later (for example a window long enough that holding the bundle risks losing everything to a tab death), RD-7's bundle identity already carries `baseBundleId`, by which a supplement names its base, so the door is open. A second trigger during the window coalesces (question 7); the window delays delivery by at most `ms`, which the config validator caps (a window longer than the cooldown is rejected as configuration error).

### 9. What is the bundle, and what are the two budgets?

**The envelope header** (question 6's `BundleHeader` is the schema seed): format version; trigger block (reason, parsed stack, coalesced reasons); app build identity (item e: `major.minor.patch.full_commit_sha.hotfix` — a defined format; whether page code can *read* it at runtime is the half item e did not answer, and is carried below as an assumption); a **config digest plus the validation residue** rather than the raw config snapshot — the digest satisfies RD-7's attribution need (the resolvable config lives in deployment) while dissolving the secrets-in-config-snapshot hazard the enumeration flagged, and `configErrors` riding every header makes a thinned config visible; the full health snapshot at seal (four-species drop ledger, byte totals, tap liveness with `attachedSince`/detach reasons, cut markers, ring self-sufficiency stamps per RD-9); both clocks (RD-2: wall epoch-ms and monotonic offset, one shared origin) — **and identity**: `deviceId` (item i: a fleet-unique device identifier is available to page code; whether it may leave the device inside a report is the half item i did not answer), `pageIncarnationId` (a UUID minted once per page load), `bundleId`, and `baseBundleId` reserved for supplements naming their base. 0070's six `IngressStats` counters and wire-2 depths ride the wire payload too, but outside the recorder's surface: the transport adapter — app code assembling the OpenAPI wire body from the `SealedBundle` — reads them at assembly time and stamps them with their own read clock, which keeps the recorder observation-only (question 6, I6) and the environment block honest about when it was read. Identity is what makes at-least-once delivery deduplicable at the backend (a POST that lands but loses its 2xx is re-sent; the backend upserts on `(deviceId, pageIncarnationId, bundleId)`), lets same-device bundles join across tabs and reloads, and gives question 7's absence-based detection its key. **The body**: per-bucket ordered record arrays, each record carrying its sequence number, clocks, direction/outcome, `{mimeType, encoding}` where payload-bearing, and marker blocks (truncation, elision, redaction — structurally distinct per RD-5/RD-10). The quarantine ride-along is its own section with the same record discipline.

**The two budgets, confirmed by the platform verification.** Budget one, the triggered bundle: an ordinary async `fetch` POST with no hard size problem (the endpoint's actual ceiling is intake item c). Compression is **conditional, not assumed**: `CompressionStream` is available across the whole matrix (Chromium 80+, Firefox 113+ — floor-safe) and worker-hosted gzip with a transferable `ArrayBuffer` result is the mechanically right shape (strings are not transferable; a transferred buffer is zero-copy), but compressed *request* bodies are thin prior art — OTLP sanctions `Content-Encoding: gzip` yet the OTel JS browser exporter has an open issue rather than an implementation, general-purpose servers do not decode request bodies by default, and `Content-Encoding` is not CORS-safelisted so cross-origin it forces a preflight. **Intake item c makes gzip cheap to *ask for*, and the ask itself is unanswered** (2026-08-23): the endpoint is cross-origin, its size ceiling is negotiable, and it is a cloud service the team is building, so the JSON POST preflights regardless and `Content-Encoding: gzip` costs no extra round trip. Item c answered the size half of that sub-question and not the gzip half, so the recommendation flips from "uncompressed by default" to **specify gzip in the contract** as a design ask on an endpoint still being built, not as a confirmed capability — if it will not decode gzipped bodies, budget one falls back to uncompressed and the ceiling below becomes load-bearing. The number to negotiate, stated rather than discovered: the worked table's ~19 MiB of ring bytes inflates to roughly 28–34 MB on the wire before compression and about 3–7 MB after it at the 5–10× planning ratio (15× measured on deliberately repetitive synthetic JSON is a ceiling, not a plan). Which side of the wire the ceiling is measured on decides the ask, and 28–34 MB is a **floor** for the uncompressed worst case, since the ring meter excludes header, marker, and quarantine-ride-along bytes. A 40 MB uncompressed ceiling would therefore leave under 20% headroom — too thin to be worth negotiating twice — so **ask for a 50 MB uncompressed ceiling with gzip accepted**: a realistic gzipped bundle arrives an order of magnitude under it, and the uncompressed worst case still fits if compression is refused. Budget two, the last-gasp path: ≤ 64 KiB, `sendBeacon`-only at the Firefox floor (`fetch keepalive` shipped in 133; the 64 KiB quota is shared across all in-flight keepalive-class requests, body lengths count, over-quota rejects as a network error — spec-verbatim), pre-serialized, uncompressed, and **content-typed to survive**: a cross-origin beacon with `application/json` preflights per spec and in Chromium a Blob with a non-safelisted type is refused outright (Chrome 59 restriction, still current in BCD), so any beacon is JSON bytes in a `text/plain` Blob, or nothing — and since the endpoint is confirmed cross-origin, that is not a precaution but the only shape that works. **`sendBeacon` also cannot set request headers at all**, which turns intake item c's "no auth arrangement yet, let's keep things flexible" into a design input rather than a deferral: whatever auth the endpoint eventually requires, the last-gasp route cannot carry it in a header, so it must be a credential in the body or a `SameSite=None; Secure` cookie. That is cheap to accommodate while the endpoint is being designed and expensive to retrofit, so it belongs in the contract now. What rides budget two is decided here: **a loss marker, not a mini-bundle** — `{formatVersion, identity, trigger reason, per-bucket drop counters, sealedButUndelivered: bundleId}` at a few hundred bytes, sent on `visibilitychange`-hidden (paired with `pagehide` per current guidance) only when a sealed bundle is in flight or pending. It converts "bundle never arrived" from silence into a positively-reported loss at the backend. The full bundle never rides budget two. **The marker is part of the vendored contract, not an undocumented second format** (added 2026-08-23): it gets its own schema and route in the OpenAPI document alongside the bundle, and intake item c gains the question — because a beacon's response is unobservable, an endpoint with no route or parser for it discards the entire compensation for refusing durable parking, and the client can never learn that happened. Its `formatVersion` is the same handle the bundle uses, so it can evolve. One further caveat the platform check surfaced: `visibilitychange`-hidden fires on a tab *switch*, not only on close, so the marker is sent at most once per sealed-bundle-in-flight and the backend treats a later successful bundle as superseding it.

**Peak memory at seal is budgeted, not discovered.** The transient co-residency — sealed record copies (pointer copies; the strings are shared), the assembled body string, and its worker copy — is bounded by construction: assembly streams per bucket into the worker (bucket-sized chunks, transferable buffers) rather than building one envelope-sized string on the main thread, capping the peak at roughly envelope + largest-bucket rather than 2–3× envelope — in metered serialized bytes, so the heap figure the spike must actually check can run to about twice that per question 2's UTF-16 caveat. The number that matters — whether even that fits on a degraded device — is a spike measurement (question 15) against intake item f's hardware answer; the design lever (transferables, per-bucket streaming) is fixed now so the spike measures the right shape. The compression failure path is total-by-construction: a dead gzip worker degrades to the uncompressed body on the main-thread path, never to silent loss.

### 10. Delivery: what carries the bundle, and does anything survive the tab?

**The null holds, now with its termination ruled**: in-memory retry with exponential backoff and jitter (the copied 0050/loglevel-plugin-remote idiom), one bundle in flight at a time plus **at most one pending** — a third seal arriving while both slots are full evicts the older pending bundle with a counted drop, so sealed evidence can never accumulate unboundedly behind a slow endpoint — and, this question's charter-assigned choice, **bounded retries, then drop with a counter**: default 8 attempts / ~5 minutes horizon, then the bundle is freed and `health().delivery.failed` increments, riding the next bundle and the last-gasp loss marker. Three rules the enumeration forced into this loop, each cheap and each closing a way the delivery machine can become the incident:

- **Every attempt carries a deadline.** A bare `fetch` has no timeout in any browser, so an endpoint that completes its handshake and then stalls — a shape no infrastructure separation prevents, since a cloud service can stall for reasons of its own — leaves attempt 1 unsettled forever. The attempt counter never advances, the horizon never elapses, and one hung POST pins a whole sealed bundle (up to tens of MB, and by then the rings have evicted its contents, so the bundle is their only copy) for the life of the tab: precisely the pinned memory this question chose bounded-then-drop to avoid. Each attempt therefore runs under `AbortSignal.timeout`, and a timed-out attempt is a failed attempt.
- **Server backpressure is honoured.** A 429 or 503 with `Retry-After` sets the next delay, above the client's own schedule. Without it, one device-level cause fires nets in every tab on every device, each starting an independent 8-attempt schedule against an endpoint that is plausibly already the thing failing — a phase-aligned fleet-wide upload storm amplifying the incident being reported. This is the half of Sentry's transport this report did not copy at first (it copied the client-report loss counters and left the rate-limit handling), and it is the half that protects the receiver.
- **4xx is permanent, not transient.** A schema rejection from the endpoint is deterministic: retrying it eight times pins memory for nothing, and counting it as `failed` points the diagnosis at the network. A 4xx drops immediately into `health().delivery.rejected`, which is the fleet-wide signal that the vendored contract and the assembled body have drifted — the one failure that would otherwise silence the whole fleet while every counter blamed connectivity.

(All of this lives behind question 6's `transport` seam — it is delivery policy, invisible to the capture surface; the counters return through the seam into `health().delivery`.) Bounded-then-drop beats retry-until-tab-death on this fleet's bias: under a sustained outage the pinned bundle is 10–50 MB of RAM on a RAM-disk device for an indefinite win, and the charter's own safety rule — a recorder must never become the incident — prices pinned memory higher than a late delivery. The evidence gap is declared: item l came back "nobody has measured", so the retry horizon is a judgment defaulting safe, revisitable the day a rate exists. Delivery is **at-least-once**; the report says so to the endpoint's owners (intake item c) with the dedup key from question 9.

**Durable parking fails its burden of proof at survey depth.** The charter set the bar: a hard cap, a real evidence win over the null, no accumulation path under a dead backend. The evidence win is the tab-crash-during-delivery window, and it cannot be quantified — item l came back "nobody has measured", the pre-declared acceptable answer, which becomes this report's assumption rather than leaving a question open. Against an unquantified win stand three verified costs: on this fleet IndexedDB is RAM (parking buys the tab-crash window only, never a power cycle); a parked queue under a dead backend accumulates against the OS unless capped-and-reaped code exists and is itself correct; and the multi-tab/origin/schema/eviction reservations 0150 owns would all activate for this store too (the tracks share an origin decision the moment both persist). The verdict: **no durable parking in the recommended design**; the revisit trigger is named — if fleet measurement (or field bundles) ever shows delivery interruption is common *and* 0150's store ships (so the origin/schema decisions are made once), parking a single sealed bundle (cap: one, evict-newest-refused, self-deleting on send) becomes a cheap rider on 0150's machinery. Until both hold, the loss marker (question 9) is the compensation: losses are reported, not silent.

**Delivery independence**: the report POST is a bare `fetch` outside 0060's boundary, deliberately — the failure being reported is plausibly the boundary itself, and the recorder must not depend on the surface it is diagnosing. This does not violate the D-0006 choke-point rule as ratified: that rule governs *contracted partner traffic through the transport boundary*, and the report endpoint is the team's own contract, vendored in this repo, validated at the schema level by 0010's generated validators **at build/test time** (the bundle is validated against the generated schema in tests and in the spike; runtime validation of an outbound diagnostic POST adds cost in exactly the degraded moment and is explicitly skipped, with the reasoning recorded). **Item c confirms the premise rather than leaving it assumed** (2026-08-23): the endpoint is a cloud service on infrastructure separate from both the MQTT broker and the REST backend, so the report path genuinely does not share fate with the transport being diagnosed. It is cross-origin, so every bundle POST carries a CORS preflight — acceptable for budget one, and the reason gzip is free to specify. Auth is undecided and the design's ask is narrow: whatever is chosen must be expressible without request headers on the beacon route (question 9), which points at a body credential.

### 11. How does the recorder not become the incident?

The failure bias is inherited from 0150's phrasing: a recorder that silently under-captures is acceptable; one that degrades the app is not. Per-hazard:

- **Capture cost in disciplined paths**: every tap body is bounded — project, meter, push, return; no allocation beyond the record; no I/O; no delivery work on capture turns. The budget is the shared dispatch turn's (0060 sheds for every consumer past 256) and the 0070 one-JS-turn pipeline's; the spike measures projection against live app-shaped objects on device-class hardware before any figure is trusted (question 15).
- **Throw containment per tap, not once**: I12 protects wire-1 siblings (design.md:491), but the mutator wrap sits *inside* the app's request path — a throw there fails the app's request — and the xstate observer runs synchronously in actor processing with no documented isolation. Every tap therefore wraps its entire body in its own try/catch whose failure path increments `drops.tapErrors` and, past a threshold, detaches the tap (`detachReason: 'self-protective'`); a tap may fail itself, never its host. The threshold governs tap self-protection only and never a trigger, so the charter's exclusion of recorder-evaluated rules is untouched. Question 15 verifies containment per tap.
- **Cost containment, not only throw containment** (added 2026-08-23). The enumeration found the one capture-path step this report had not budgeted: redaction. Config-supplied patterns run per record inside the capture turn against bodies up to `maxEntryBytes`, and a pattern with nested quantifiers backtracks superlinearly — a stall, not a throw, so the try/catch never sees it and no drop counter records it, while 0060's shared dispatch turn sheds for every consumer. Three answers, all cheap: patterns are data with `g`/`y` rejected (question 6), the applier scans the bounded projection rather than raw input, and the spike measures redaction cost at `maxEntryBytes` alongside projection cost — a rule set is app config in an agent-authored codebase, so it must be treated as untrusted input to a hot path.
- **Re-entrancy is refused and counted**: the projection walk executes app code by design, and a getter that logs re-enters the recorder through the facade into the log bucket's `record()` — synchronously, inside the outer `record()`, with the byte total and sequence counter mid-update. Unguarded, that corrupts the ledger invisibly or ends in a `RangeError` thrown into the very dispatch turn I1 promises never to throw into (which then fires the recorder's own net). The guard is a flag; the loss is `drops.reentrant`.
- **Self-capture loops, three cuts**: the HTTP wrap skips requests carrying the recorder's own marker header (the wrap adds `x-recorder-request: 1` to its POST and filters on it — the same shape as Sentry's `isSentryRequestUrl`, which this design copies structurally); the nets ignore errors whose stack tops in recorder frames during an active seal (re-entrancy flag, not stack parsing on the hot path: a `sealing` boolean suppresses net-triggered re-seals, counted); and the recorder never reports through itself — its own failures are counters in the bundle, never `record()` calls.
- **The seal is a hazard and is budgeted as one**: question 9's streaming assembly caps the spike; the cooldown caps seal frequency; and the seal path allocates only pointer copies plus the per-bucket chunk in flight.
- **The kill switch is a seam, ruled by the panel and recorded with its refusals**: one `enabled` bit read once at construction, riding whatever channel already feeds startup config, plus a reload — disable-without-redeploy because redeploy ≠ reload. Two stronger variants were considered and refused: a recorder-owned remote flag (a recorder that polls or acts on its own channel is new failure machinery inside the tool meant to observe failures, and it breaks observation-only), and per-bucket enabled flags (a disabled bucket is an undeclared bucket — two spellings of absence is one too many under loose TS). The limits are stated rather than hidden: mid-session kill without a reload is unsupported by design, and the seam presupposes the app's startup-config channel exists and carries the bit — a fact to confirm at integration, not a recorder feature.

### 12. Which data-model decisions are reserved for replay, and which are explicitly not?

All ten reservations survive into the recommended record and bundle shapes, two of them amended by the enumeration and said so plainly rather than claimed intact. Enforcement points: RD-1 per-bucket monotonic sequence numbers (ring-assigned at push) **plus a recorder-global `gseq`** — per-bucket sequences and timestamps cannot order records *across* buckets, and Firefox clamps timer precision to about a millisecond at the app's floor, so at ~50 events/s ties are the normal case and the cross-bucket interleaving that is this recorder's one distinct claim (question 1) would be plausible-but-unordered; one integer per record makes it exact; RD-2 two clocks per record and per cut marker (wall epoch-ms + monotonic offset from one shared `performance.timeOrigin`-anchored origin; deltas derived at replay, never stored); RD-3 one shared clock domain (single-threaded runtime; the origin is stamped once in the envelope) — **a temporary truth rather than a designed-in one**, since item k reports workers as a scheduled goal: a worker-origin record would break two of these reservations rather than extend them, because `gseq` cannot be stamped from a worker in the same synchronous step as `seq` (so cross-thread ordering needs a per-thread sequence plus a merge rule, not one counter) and a worker's `performance.timeOrigin` differs from the page's (so RD-2's single shared origin needs a per-thread offset in the envelope). Naming those two costs is all this report does; the bridge is not designed here, and question 6's interface stays main-thread (I9); RD-4 direction/role and terminal outcome per item (the HTTP bucket's two-record model makes in-flight-at-seal a first-class state, not a missing pair); RD-5 truncation markers `{truncated, originalSize}` (structured, never HAR's silent `-1`); RD-6 `{mimeType, encoding}` on every payload-bearing record; RD-7 envelope identity (format version, creator, app build, platform, device id, page-incarnation id, bundle id, and `baseBundleId` by which a supplement names its base) — **amended**: the reserved config *snapshot* ships as a config *digest* plus the validation residue, because a snapshot in every bundle is a standing secrets-exfiltration channel and a digest still attributes a bundle to its configuration, with the trade recorded here rather than buried (a digest resolves only against deployment records, so a fleet running drifted configs can find a digest it cannot resolve); RD-8 `{schemaId, schemaVersion}` on every bucket row, built-ins included, so the validator needs no special case; RD-9 ring self-sufficiency (each bucket stamps `droppedBeforeWindow` and whether its oldest record is a complete starting point — **and that flag now also requires the oldest record to be unmarked**, since a checkpoint stored truncated is not a replayable starting point, and claiming otherwise promotes RD-5's own anti-pattern from one record to a whole window). For the xstate bucket the checkpoint row is an occasional `getPersistedSnapshot`, and **the tap owns that cadence, not the recorder** — a recorder-run timer calling into app code is the shape the design panel refused, and the tap already runs inside the actor system it is snapshotting; RD-10 redaction markers `{redacted, ruleId}` distinct from truncation. Explicitly not reserved, unchanged from the plan: pacing deltas, replay speed, HAR timing breakdown, server IPs/connection ids, DOM/pixel data, UI-flow selectors. The two format-level pre-commitments hold and are now design columns: the HTTP bucket's record fields are chosen to be losslessly projectable to HAR 1.2 entries (the regression path HAR → @mswjs/source `fromTraffic` → MSW handlers; @mswjs/source remains pre-1.0 with peer `msw ^2.10` — re-verify at adoption against the D-0022 MSW line), and the MQTT record carries `{channel, topic, params, payload, direction}` plus the explicit gap records the adapter synthesizes from wire-2 reconnects, in arrival order — which is what makes the stream convertible to the `ValidatedMessage | 'gap'` shape 0070's `RaceHarness.push` consumes (0070 spike design.md:329-331) and thence into pinned scheduler properties through the seam production already uses. The packet identity that conversion also wants is *not* available at wire 1 (corrected 2026-08-23): 0070 constructs it inside the ingress this track refuses to tap, so a replay tool synthesizes it from topic plus arrival order, and the report says so rather than reserving a field the tap cannot fill. The xstate reservation is unchanged: initial persisted snapshot, ordered external events (`sourceRef === undefined`, excluding `xstate.init`), machine id+version, replayable through the pure `transition()`/`initialTransition()` API (exports verified at 5.32.5; introduced 5.19.0) — never live re-sending.

### 13. Redaction: whose rules, applied where, marked how?

**The app already has a scrubber, and it is the rule shape this design specified** (intake item b, answered 2026-08-23): a function that takes an object and scrubs the values of any key or sub-key whose name matches a list of strings. That is deep key-name matching — exactly the `keys` rule form 0050 specified and question 6 carries — so the recorder shares a rule shape the team already runs, and `paths` and `patterns` become optional refinements rather than parity requirements. It also defuses the sharpest hazard the enumeration found in this area: seeding the `keys` rules from the incumbent's list leaves the pattern rules — whose `lastIndex` statefulness would have leaked on alternate records — simply empty by default.

**What was not answered is the policy.** The question asked what may leave the device — PII, credentials, who reads the reports, whether anything regulatory applies — and the answer describes a mechanism. So no disclosure boundary has actually been ruled, and this report treats the existing key list as the current best expression of intent rather than as an approved boundary: the conservative default below stands until someone with the authority to rule says otherwise, and shipping raw payloads verbatim is not authorized by "a scrubber exists". That is a question for a person, not a design, and it is the one open item that should not be closed by inference.

Share the **rule set**, not the choke point — 0050's choke point covers facade sinks, and recorder buckets never pass through it. The rules are fast-redact-style field/path/pattern data (the package itself is disqualified — CSP `unsafe-eval` hazard verified in source — so the applier is owned, shared with the facade when the facade lands); they apply **per bucket at projection time**, inside the capture-turn walk, so redacted values never enter the ring at all; every application stamps `{redacted, ruleId}` (RD-10), keeping redaction distinguishable from truncation and replayable-with-synthetic-values. The enumeration's whole-bundle finding is absorbed as a second application point: **the seal applies the same rules to the envelope's own free text** — the trigger's error message and stack (free-text PII carriers, including `cause` chains and `AggregateError` members), the caller-supplied `context`, the health block's caller-derived strings (`unknownBuckets` keys, `configErrors`), and the quarantine ride-along, which is by definition traffic no schema accepted, so no projection scrubber ever ran over it. The config snapshot is *not* in this list, because question 9 replaced it with a digest — a digest cannot be redacted and does not need to be, which is the cheaper answer to the same hazard. The default until a policy is ruled stays the conservative one — payloads redact to structural skeletons (keys kept, leaf values redacted) for any bucket carrying app data, seeded with the incumbent scrubber's key list, and the config marks which buckets may carry values verbatim. An irreversibly redacted payload cannot replay; RD-10's markers make that a visible property of each record rather than a discovery.

### 14. Adopt, wrap, build — what would an adopted core be paid for?

Run honestly at equal merit, the comparison resolves on capture-side evidence (Survey, Sentry section, carries the detail): the wrap's candidate machinery divides into (a) what the recorder must bypass — the reference-holding breadcrumb ring and event-prep normalization, which violate serialize-at-capture and would double-process already-serialized records; (b) what the recorder must suppress — default integrations that wrap fetch/XHR/console/DOM under nobody's governance next to 0060/0070's owned taps, plus the global `Error.stackTraceLimit` write; and (c) what is genuinely reusable — the nets (~200 lines equivalent), transport plumbing that duplicates 0050's already-copied backoff idiom, attachments-as-channel (mooted by owning the schema outright), and the client-report loss accounting (copied as a design, at zero dependency cost). Paying a dummy-DSN wart, an integration-suppression matrix, ~33 KB gzip (the CI budget for error-only init; the minimal custom client is smaller but has no published figure), and v8→v10-in-two-years churn for (c) is the trade the rubric scores below. Bugsnag is dominated with evidence rather than assumption (1 MB transport ceiling with silent client-side metadata stripping; hard 100-crumb cap with silent-fallback-to-25 footgun; no attachments; internal-only delivery seam). Faro is confirmed a shipper whose reusable half is the half the recorder must not use (history-distorting dedup, overlapping instrumentation), while its recorder half does not exist. The 0050-extension challenger is rejected as a posture but pays rent as a boundary-drawing exercise: what the recorder genuinely shares with the facade is the redaction rule set (data, not code), the copied backoff design, and the log bucket's sink seam — and nothing else; the facade's record shape is log-specific, its throttles exist to thin exactly what a recorder must keep, and making the unbuilt facade a build-order dependency would couple two undelivered systems. The build's bill of materials, verified: two micro-deps in (safe-stable-stringify, tracekit — both D-0027 rung-1 justified in the Survey), three designs copied with citation (Sentry client reports, loglevel-plugin-remote backoff via 0050, @statelyai/inspect serialization recipe), mnemonist shelved, fast-redact and devalue and error-stack-parser rejected with reasons, the ring and schema owned.

### 15. How is the recommendation falsified, and what would a spike validate?

The claims that need a lab rather than a source link, each mapped to a lane (the spike list proper is the report's penultimate section): projection cost on live app-shaped objects (getter walks, proxies — the current figures measure inert literals on desktop V8, the wrong operand twice over); throw containment per tap under deliberate scrubber failure; boundedness as **retention** (force truncations, assert the parent strings are collectable — a WeakRef-based property test; the SlicedString hazard); the ring's byte invariants under fast-check (never exceeds cap; every eviction/truncation/projection-failure counted; drop accounting exact under interleaved push/seal); seal-under-load (continued capture during seal never contaminates the sealed copy); the safe-stable-stringify array-breadth off-by-one; and the delivery loop's bounded-then-drop under a scripted dead endpoint. Claims no available lane can reach are stated per the 0150 precedent: the failure nets and the pre-arm stub need a real browser (jsdom cannot arm `window.onerror` faithfully) — named for 0120's future harness; renderer-crash behaviour and the Reporting-Endpoints complement are unreachable from any harness this repo owns; and every cost number remains proxy-*operand* — inert literals on desktop V8 — until the spike runs on device-class hardware (item f answered the hardware, not the numbers). **The standing obligation is discharged beside this report**: the same D-0036-shape enumeration that amended the plan ran again over this report's recommended design; its register is [design-fmea-enumeration.md](design-fmea-enumeration.md), and the amendments it forced are annotated in place in this report.

### 16. Multi-tab: which tab owns the evidence?

The design's stance: **per-tab recorders, shared identity, no coordination — with the assumption declared, not silent.** Each tab runs an independent recorder (per-tab rings are unavoidable — the history *is* per-tab), and the bundle records its tab context via question 9's page-incarnation id plus the mqtt bucket's liveness block (the mqtt tap self-detaches on wire-2 `connection-ended` and its `attachedSince`/`detachReason` ride every bundle — so the connectionless tab's empty MQTT bucket reads as "this tap never attached" or "detached at T: connection-ended," not "no traffic," dissolving the enumeration's misdiagnosis hazard with machinery question 6 already carries). Cross-tab trigger coordination is **explicitly refused for the initial design, with the duplicate cost stated**: N tabs arm N nets, so one device-level cause can produce up to N near-duplicate bundles whose per-tab cooldowns cannot see each other; the backend dedups by `(deviceId, trigger time-bucket, reason)` for reporting purposes, which costs nothing client-side. The refusal's reasons: BroadcastChannel-based cooldown sharing is easy but wrong-by-default (suppressing tab B's bundle because tab A reported loses tab B's distinct history — the near-duplicates carry different evidence); Web Locks leader election is owned by 0150's question 11 for the connection invariant, and the recorder must not pre-empt that design (one leader-election design, decided once — cited, not restated); and **intake item j now answers N = 2, with distinct views** (2026-08-23), which moves this question from precautionary to load-bearing without changing the design. Three consequences, on facts. The memory cost is real but affordable: the envelope is **per tab**, the device pays 2× — 40 MiB of serialized bytes at the worked configuration, nearer 80 MiB of heap by question 2's UTF-16 caveat, against 6–16 GB of contended RAM — and the worked example says so in a comment rather than leaving the reading ambiguous. The duplicate-bundle cost is bounded at two, which is cheap to dedup at the backend and not worth client machinery. And the diagnosis hazard is now concrete rather than hypothetical: with two tabs, and one MQTT connection if the single-connection invariant holds — the profile states that as intent, not as an enforced property, with enforcement still open as 0150's intake item f — one tab's MQTT bucket is empty in normal operation, so the liveness answer above — the mqtt tap self-detaching on wire-2 with `attachedSince`/`detachReason` in every bundle — is what stands between a reader and concluding "the broker went quiet" from a bundle sealed in the tab that never had the connection. Distinct views also means the two tabs' xstate and HTTP histories are genuinely different evidence, which is the concrete reason cooldown-sharing would be wrong: suppressing tab B's bundle because tab A reported would discard the half of the picture the reader needs. The one hard rule is unchanged and now cheap to keep: every identity, cooldown, and delivery decision is correct at any N, merely duplicative.

## Rubric comparison

Ten criteria — the shared nine plus "Boundedness", adopted for this track at weight high by D-0041: does the candidate bound its memory by construction, in bytes as well as items, and does it fail loudly (counters, markers) or silently at a bound.

| Criterion (weight) | build (owned kit) | Sentry core 10.70.0 | @bugsnag/js 8.10.0 | @grafana/faro-web-sdk 2.10.0 |
|---|---|---|---|---|
| License (high) | strong — owned code; deps MIT (safe-stable-stringify, tracekit) | strong — MIT, manifest + LICENSE | strong — MIT | strong — Apache-2.0 |
| Maintenance health (high) | adequate — owned burden on the team; both micro-deps healthy-to-dormant-stable, both replaceable | strong — very active (10.70.0, 2026-08-10); caveat: v8→v10 major churn in ~2 years | strong — quarterly under SmartBear (8.10.0, 2026-07-10) | strong — Grafana org, ~biweekly releases |
| TypeScript fit (high) | strong — TS-authored against the app's own types | strong — TS-authored, typed envelope tuples | adequate — JS core with shipped typings | strong — TS-authored |
| Browser compatibility (high) | strong — every primitive floor-checked this survey (TextEncoder, CompressionStream FF113+, sendBeacon FF31+, BroadcastChannel FF38+) | adequate — works at floor, but keepalive-dependent transport behaviour noted in its own source; ES/browserslist floor not re-verified here | adequate — legacy-broad by reputation; FF124 floor not re-verified here | adequate — modern-evergreen posture; FF124 floor not re-verified here |
| Contract-format support (n-a) | n-a | n-a | n-a | n-a |
| Integration cost (high) | adequate — four taps plus a composition root, all on pre-designed seams, but every line owned | weak — dummy DSN, default-integration suppression matrix, double-instrumentation governance beside 0060/0070, envelope→schema mapping | weak — cannot carry the payload at all (1 MB ceiling); only the endpoint redirects | weak — the reusable half is the half a recorder must not use; the recorder half absent |
| Runtime overhead (high) | strong — ~6.5 KB gzip of deps plus the owned kit; capture cost owned and budgeted | adequate — ≤33 KB gzip error-only (CI budget); steady-state fine | adequate — 15.1 KB gzip, moot given the ceiling | adequate — 34.4 KB gzip incl. web-vitals/ua-parser |
| Output quality (medium) | strong — the vendored OpenAPI schema is the deliverable; 0010 generates its validators | adequate — structured `Event` objects, mappable; Sentry-shaped semantics leak without care | adequate — genuinely public OpenAPI spec, but fixed Bugsnag v4 shape (SDK emits 4; spec says current is 5) | adequate — own TransportBody shape, no standalone versioned spec |
| Escape hatch (high) | strong — owned interface; both deps swappable behind it (mnemonist shelved as the ring fallback) | adequate — custom Transport contains the wire, but capture call sites (breadcrumb/attachment APIs) become the lock-in a wrap must also contain | weak — delivery seam is underscore-internal; the payload shape is not escapable | adequate — BaseTransport is a public seam |
| Boundedness (high, D-0041) | strong by design — byte + count caps, a six-counter loss ledger (four record-loss species plus two interference counters, reconciling against `recorded`), structured markers, capped health maps and a byte-capped quarantine ride-along; the claim is construction plus property tests, and stays provisional until the spike runs them | adequate — count caps with **counted** overflow (client reports: the field's best loss accounting, copied here) but no byte accounting on the capture path, attachments unbounded client-side, maxValueLength unset by default | weak — silent oldest-drop at the crumb cap, misconfiguration falling back to the default 25 rather than clamping (logged, not enforced), and a 1 MB cliff that strips all metadata client-side | weak — bounded by batch/task counts and drop-oriented, but drops are quiet, `ItemBuffer` is unbounded, and nothing counts bytes |

The 0050-extension challenger is scored in prose (question 14): it is not a candidate implementation but a boundary claim, and what survives of it is the shared redaction rule set, the copied backoff design, and the log bucket's one-line `addSink` attachment.

Two rows carry an **evidence asymmetry** worth naming, because the verdict must not lean on them: Browser compatibility scores the build "strong" because this survey floor-checked each primitive it uses while the three SDKs are marked "not re-verified here", and Runtime overhead scores the build on its dependency bytes with the owned kit unquantified against Sentry's measured CI budget. Both differentials are partly artifacts of what was measured rather than findings about the candidates. The recommendation rests on capture-safety and Boundedness, where the evidence is symmetric and read from each candidate's own source.

## Recommendation

**Build: an owned recorder kit** — per-bucket byte-and-count-bounded rings of capture-time-serialized records behind the capture interface in Key question 6, the trigger protocol of question 7, the two-budget delivery of questions 9–10, and a vendored OpenAPI payload contract generated through 0010's pipeline. Adopt exactly two packages, both D-0027 rung-1 justified in the Survey: safe-stable-stringify 2.5.0 (cycle-safe bounded projection; wrapped so its in-band elision becomes structured markers) and tracekit 0.4.9 (dual-engine stack parsing). Copy three designs with citation: Sentry's client-report loss accounting, the loglevel-plugin-remote backoff idiom 0050 already copied, and @statelyai/inspect's serialization recipe. Own the ring (~60 lines; mnemonist shelved as fallback), the seal, the bundle assembly, and the schema.

**Rationale.** The charter held build and adopt+wrap at equal merit, so this verdict rests on what the survey verified rather than on a default. Three findings decide it. First, the hard requirements are owned work under every posture — no surveyed library bounds memory by bytes, none serializes at capture, none carries per-bucket taxonomy, and the payload schema is ours by charter — so adoption cannot shrink the risky code, only relocate the plumbing around it. Second, the strongest adoptable core fails the capture-safety requirement at its center: Sentry's ring stores caller references and defers normalization to event-prep, which is precisely the mutation-unsafe, graph-pinning capture the taps forbid; fixing it from outside reduces the SDK's contribution to nets, plumbing, and counters — each small, each already copied or copyable. Third, the wrap's residual costs are not hypothetical: a dummy DSN to make the SDK function at all, suppression of default integrations that would double-instrument 0060/0070's governed surfaces, a global `Error.stackTraceLimit` write, and major-version churn. The build concentrates its risk in ~a few hundred owned lines whose properties (byte invariants, drop accounting, seal correctness) are exactly what the accepted fast-check lane property-tests best.

**Why not Sentry core (and when to revisit).** The full mechanics are in the Survey and question 14. The honest summary: the wrap is mechanically sound — this survey verified the structured-envelope transport, the no-hard-crumb-cap, and the counted overflow that the plan got wrong in Sentry's favor — and it still loses, because what it reuses is not where this track's risk lives. Revisit triggers, stated: if the team ever adopts a Sentry backend for general error monitoring, the recorder's bundle can ride a Sentry envelope attachment through the same custom-Transport seam this report mapped, and the two systems meet cleanly there; and if the owned nets/pre-arm stub prove harder in the field than the ~250 lines this report estimates, adopting `globalHandlersIntegration` alone (with a dummy DSN and every other integration disabled) is a contained fallback the interface permits.

**Runners-up.** Sentry core is the runner-up posture if the team weighs bought machinery over owned lines despite the capture-side rework — nothing else is close. Bugsnag is disqualified for this use by its 1 MB transport ceiling regardless of posture preference. Faro is not a recorder; its receiver format is prior art for the backend, nothing more.

**Risks (honest).**

1. **The owned capture code is the weakest link, and it runs in other modules' disciplined paths.** Mitigation: every piece copies a cited design; the interface isolates taps behind their own throw containment; the spike measures the real operand (live app-shaped objects) on device-class hardware before adoption; the boundedness properties are fast-check lanes, not review promises.
2. **The gating facts came back, and one of them came back as a mechanism rather than a policy.** Items a–l are answered (see Facts, below): the endpoint design and the config seeds are settled, and the byte arithmetic is settled for MQTT and still sized by analogy for the other three buckets. What is *not* settled is what may legitimately leave the device — item b described the app's existing key-name scrubber, which tells us how the team scrubs and not what they are obliged to scrub. Nobody named a PII, credential, or regulatory constraint, and this report will not infer a disclosure boundary from the existence of a tool. Until someone with the authority rules on it, the conservative default holds; the risk is that a design shipped on "a scrubber exists" sends field payloads to a cloud endpoint under a policy no one wrote.
3. **The projection-cost figures are proxy-hardware twice over** — desktop V8, inert literals. Item f softens the hardware half — desktop-class but low power makes the guessed 10× de-rate too pessimistic, though the answer does not say by how much, so the spike replaces the guess with a measurement rather than a smaller guess — and does nothing about the operand half: the figures still measure inert literals rather than the getter-bearing, proxy-wrapped objects the taps will actually walk. If the spike's on-device numbers fail the budget, plan B (capture-turn shallow snapshot + idle serialization) is named in question 3, and it re-admits a bounded mutation window; that trade would need its own ruling.
4. **xstate v6 is moving** (near-daily alphas at survey time; inspection being reworked upstream). The bucket's owned projection and pinned-to-source event choices insulate the stored schema, but the tap itself must be re-verified at v6 adoption — flagged to whoever runs that migration.
5. **The nets under-report by construction, and the fleet has no second arm.** Item f/h confirm Firefox 124 only, so the Chromium crash-report complement contributes nothing today: renderer OOM and unresponsive kills produce no report at all, and errors before the pre-arm stub loads produce none either. Absence-based detection at the backend is the sole compensation, it is backend work keyed on this report's identity fields, and if nobody builds it those deaths stay dark. This is the design's largest coverage hole and it has no client-side floor on this fleet — worth stating in the same breath as the recommendation rather than in a footnote.
6. **The recorder can degrade its neighbour through memory alone** (added 2026-08-23). The plan separates this track from 0150 on the grounds that they meet only if durable parking is adopted, and question 10 refuses parking — but on a RAM-disk device IndexedDB *is* RAM, so 0150's inbox store, its dedup keys, and its transactions compete for the same physical budget as this recorder's rings and its held bundles, in every tab. IndexedDB writes fail under storage pressure, and 0150's central claim is that the effect and the message identity commit together. The recorder can therefore break a durability guarantee it never touches, through a channel neither track's boundary analysis covers: "must not degrade the app" has been checked against latency and throw containment, and not against memory as a shared resource. The envelope figure the fleet ships must be chosen against 0150's footprint too, and this belongs in whichever track ships second.
7. **The 10–50 MB envelope is config, not law.** A misconfigured bucket table is the likeliest real-world failure given the app's loose TS; the runtime config validator is load-bearing, and its ruled posture is fail-safe-loud (question 6, I8): an invalid row disables that bucket, a table-level violation disables the recorder, and both are visible in `health().configErrors`, in every bundle header, and behind a one-line startup assertion — an app without a recorder, never a recorder that takes down the app, and never a silent thinning either.

**Constraints applied.** D-0001 (survey-only: every interface in this report is a signature sketch; the spike list is pre-scoped, not executed). D-0003 (all recommended packages free OSS; Sentry's loader snippet found FSL-licensed and its pattern reimplemented, not reused). D-0004 (missing app facts became the declared assumptions below). D-0006 (the report payload is a vendored contract through 0010's pipeline; D-0006's letter governs *inbound* contracted traffic, so an outbound diagnostic POST falls outside it rather than being an exception to it, and D-0040's "validation discipline applies" is read as build- and test-time discipline — argued in question 10, with the deterministic-4xx compensation in that question's delivery rules). D-0023/D-0041 (Boundedness adopted for this track only). D-0027 (each adopted micro-dep carries its rung-1 justification in the Survey). The plan's question 15 obligation is discharged: the design-level failure-mode enumeration ran over this recommendation and its register sits beside this report.

**Facts, and what remains assumed.** Intake items a–l were answered on 2026-08-23 and are recorded in facts/app-profile.md; this report was revised against them rather than shipping its placeholders. Items **m** (the app's CSP) and **n** (outbound MQTT volume) were added the same day from the design-level enumeration and remain **open**, so the intake register is not closed. Four of the twelve answers settled less than their question asked, and each is carried below rather than read as closed. What they settled, and where each one landed:

| Fact | Effect on this report |
|---|---|
| MQTT payloads under 10 KB typical, ~50 KB worst (a) | Question 2's MQTT arithmetic is real; the 5× spread is the local justification for byte caps |
| Depths: 100 MQTT / 25 HTTP / 100 transitions / 50 log lines (d) | Adopted as counts, with MQTT raised — 100 is ~2 s of history and the envelope affords ~24 s |
| Deep key-name scrubbing exists today (b) | The rule shape is already the team's; pattern rules default empty. **The policy is still unruled** |
| Endpoint: cross-origin, separate cloud infra, negotiable ceiling, auth undecided (c) | Delivery independence confirmed; gzip becomes an ask rather than a deferral; beacon auth must be body/cookie |
| Build id `major.minor.patch.sha.hotfix` (e) | RD-7's `appBuild` has a defined format. **Whether page code can read it at runtime was not answered** |
| Desktop-class low-power, 6–16 GB contended (f) | A 10× de-rate is too pessimistic; the spike measures rather than re-guesses |
| **Firefox 124, Firefox only** (f, h) | The two-budget delivery design is load-bearing; the Chromium crash complement is inert today |
| A React error boundary already exists (g) | The React net is one call in the incumbent, not a second boundary |
| Fleet-unique device id available (i) | RD-7 identity, backend dedup, and absence detection all have their key. **Permissibility in a report was not answered** |
| Two tabs, distinct views (j) | Multi-tab is a live condition: 2× envelope per device, and question 16's liveness answer is load-bearing |
| Workers are a scheduled goal (k) | Single-thread is recorded as a temporary truth, not designed in; RD-3 names the two costs a future bridge must pay |
| Nobody has measured interruption rates (l) | The pre-declared acceptable answer; the durable-parking refusal stands on its other two legs |

Still assumed, and each with its consequence if wrong:

- **REST response-body sizes** — item a answered for MQTT only. The HTTP bucket's byte budget is sized by analogy to MQTT; if REST bodies are much larger, that row needs re-sizing before first ship, and question 2's non-MQTT byte terms move with it.
- **The app build identifier is readable by page code at runtime** — item e defined the format in the future tense and did not say whether the bundle can read it. If it cannot, RD-7's `appBuild` needs a build-time define, which is a build change worth requesting early rather than discovering at integration.
- **The fleet-unique device id may be included in a report leaving the device** — item i answered availability, not permissibility, and this is the same class of question item b left unruled. If it may not, RD-7 needs a salted per-install pseudonym and the backend's dedup key moves to it.
- **The report endpoint will decode gzipped request bodies** — item c answered the size half of its compression question and not the encoding half. If it will not, budget one ships uncompressed and the ceiling ask becomes load-bearing rather than generous.
- **Which xstate machines matter, and whether machine definitions carry `version`** (part of item d, unanswered). RD-7 stamps whichever identity exists; a missing `version` weakens replay attribution, not capture.
- **Outbound MQTT publish volume is a small fraction of the aggregate** — **intake item n** now asks for the split and is open; the profile records none. Question 5's decision not to pay for the outbound capture gap rests on it; if outbound volume is material, reopen that verdict before dismissing the emission route.
- **The app's CSP permits the pre-arm stub, or a nonce can be injected into the served `index.html`** (**intake item m**, open). Without it the boot-window compensation silently does not exist.
- **The backend can set response headers on the app's documents and stand up a `reports+json` receiver** — item h's line answered browser composition (Firefox today, Chromium maybe later) rather than the feasibility it asked about. Inert today, since Firefox emits no crash reports at any version; it becomes gating the day a Chromium arm appears.
- **No incumbent `onerror`/`unhandledrejection` reporter exists** — item g named a boundary and no global handlers, which is "none named" rather than "none exists"; the nets install chaining-safe regardless.
- **Workers are not in play at first ship** — the only surviving half of item k's answer.

## What a spike would validate

- **Projection cost on the real operand**: serialize live app-shaped objects (getter-bearing, Proxy-wrapped, immer-drafted) through the bounded projection inside 0060's dispatch path (the aedes harness exists), on device-class hardware (item f: desktop-class, low power); accept/reject the eager-projection design against the ~3%-of-core budget, with plan B pre-named.
- **Boundedness as retention**: fast-check properties asserting the ring never exceeds `maxBytes`/`maxCount`, that the four record-loss species and the two interference counters reconcile against I4's equation, and — via WeakRef/GC probes — that truncated records hold no reference to their parent strings (the SlicedString hazard). Includes the two unbounded-allocation paths the enumeration found outside the rings: capped `unknownBuckets`/`configErrors` under a dynamic-name flood, and the byte-capped quarantine ride-along under oversized rejects.
- **Redaction as a hot-path cost and a correctness property**: measure the applier at `maxEntryBytes` with a realistic rule set (the cost the first draft never budgeted), assert that a `g`/`y` pattern is rejected by the validator rather than silently skipping alternate records, and assert markers appear exactly where rules fired.
- **The elision mechanism**: whether bound-hits are detectable at all through safe-stable-stringify's replacer (they are not for breadth, which slices before iterating) and therefore whether the wrapper owns the walk — the finding that most affects the build's bill of materials.
- **Re-entrancy**: a projection getter that logs must produce a counted `reentrant` drop, not a corrupted ledger or a `RangeError` escaping into the host's dispatch turn.
- **Per-record overhead and the wire-inflation factor**: measure `PER_RECORD_OVERHEAD` for the envelope formula, and the ring-bytes-to-wire-bytes ratio for a representative bundle, since the endpoint ceiling is negotiated on the latter.
- **Seal under load**: continued capture during seal never mutates the sealed copy; per-bucket cut markers are exact; the safe-stable-stringify array-breadth off-by-one is exercised and its wrapper marker verified.
- **Throw containment per tap**: a scrubber that throws mid-walk fails only its tap (counted, self-detaching at threshold), on all four built-ins — including the mutator wrap, where a containment failure fails an app request.
- **Delivery**: bounded-then-drop against a scripted dead endpoint (drop counter lands in the next bundle); the loss-marker beacon under 64 KiB as a `text/plain` Blob; worker-side gzip producing a transferable buffer with the degrade-to-uncompressed path forced.
- **Bundle validity**: every sealed bundle validates against the vendored OpenAPI schema via 0010's generated validators in the test lane.
- **Real-browser lane (deferred to 0120's harness, per the 0150 precedent for naming unreachable checks)**: net arming/chaining, the pre-arm stub's queue-and-replay, the `capture()` call inside the incumbent boundary's `componentDidCatch` in a production build (and the fallback component `createRecorderBoundary` returns), and visibilitychange-hidden flush timing. Renderer-crash deaths and `Reporting-Endpoints` delivery are unreachable from any harness this repo owns and stay unverified.

## Sources

Repo-internal citations (file:line) reference the working tree at commit `dc1696f`; external sources were accessed 2026-08-23 unless marked otherwise. Charter-time findings cited from the research plan carry their original access date (2026-08-22) in the plan.
- https://registry.npmjs.org/@sentry/browser/latest — accessed 2026-08-23
- https://registry.npmjs.org/@sentry/core/latest — accessed 2026-08-23
- https://registry.npmjs.org/@sentry/browser — accessed 2026-08-23
- https://registry.npmjs.org/@sentry/core — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/LICENSE — accessed 2026-08-23
- https://api.github.com/repos/getsentry/sentry-javascript/git/trees/10.70.0?recursive=1 — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/transport.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/transports/base.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/breadcrumbs.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/isSentryRequestUrl.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/browser/src/integrations/globalhandlers.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/attachment.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/clientreport.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/clientreport.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/datacategory.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/api.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/scope.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/.size-limit.js — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/prepareEvent.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/client.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/envelope.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/envelope.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/browser/src/transports/fetch.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/browser/src/sdk.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/string.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/normalize.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/browser/src/client.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/envelope.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/types/options.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/sdk.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/browser/src/integrations/breadcrumbs.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/10.70.0/packages/core/src/utils/scopeData.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/9.46.0/packages/core/src/utils/prepareEvent.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry-javascript/8.55.0/packages/core/src/utils/prepareEvent.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry/master/src/sentry/templates/sentry/js-sdk-loader.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=@sentry/browser@10.70.0 — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/configuration/options/ — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/best-practices/sentry-testkit/ — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/troubleshooting/ — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/configuration/transports/ — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/install/loader/ — accessed 2026-08-23
- https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/ — accessed 2026-08-23
- https://develop.sentry.dev/sdk/data-model/envelope-items/ — accessed 2026-08-23
- https://develop.sentry.dev/sdk/data-model/envelopes/ — accessed 2026-08-23
- https://develop.sentry.dev/sdk/telemetry/attachments/ — accessed 2026-08-23
- https://develop.sentry.dev/sdk/telemetry/client-reports/ — accessed 2026-08-23
- https://github.com/getsentry/sentry-docs/issues/4496 — accessed 2026-08-23
- https://api.github.com/repos/getsentry/sentry-javascript/commits?path=packages/core/src/scope.ts — accessed 2026-08-23
- https://api.github.com/search/code?q=repo:getsentry/sentry-javascript+isSentryRequestUrl — accessed 2026-08-23
- https://api.github.com/search/code?q=repo:getsentry/sentry-javascript+maxValueLength — accessed 2026-08-23
- https://api.github.com/search/code?q=repo:getsentry/sentry-javascript+applyScopeDataToEvent — accessed 2026-08-23
- https://api.github.com/search/code?q=repo:getsentry/sentry+js-sdk-loader — accessed 2026-08-23
- https://registry.npmjs.org/@bugsnag/js/latest — accessed 2026-08-23
- https://registry.npmjs.org/@bugsnag/js — accessed 2026-08-23
- https://docs.bugsnag.com/platforms/javascript/configuration-options/ — accessed 2026-08-23
- https://docs.bugsnag.com/platforms/javascript/ — accessed 2026-08-23
- https://docs.bugsnag.com/platforms/javascript/customizing-error-reports/ — accessed 2026-08-23
- https://docs.bugsnag.com/api/error-reporting/ — accessed 2026-08-23
- https://docs.bugsnag.com/api/ — accessed 2026-08-23
- https://developer.smartbear.com/bugsnag/docs/reporting-events-and-sessions — accessed 2026-08-23
- https://api.swaggerhub.com/apis/smartbear-public/bugsnag-error-reporting-api/1/swagger.json — accessed 2026-08-23
- https://bugsnagerrorreportingapi.docs.apiary.io/ — accessed 2026-08-23
- https://bugsnagerrorreportingapi.docs.apiary.io/reference/0/notify/send-error-reports — accessed 2026-08-23
- https://bugsnagerrorreportingapi.docs.apiary.io/api-description-document — accessed 2026-08-23
- https://raw.githubusercontent.com/bugsnag/bugsnag-js/master/packages/core/config.js — accessed 2026-08-23
- https://raw.githubusercontent.com/bugsnag/bugsnag-js/master/packages/core/client.js — accessed 2026-08-23
- https://raw.githubusercontent.com/bugsnag/bugsnag-js/master/packages/core/lib/json-payload.js — accessed 2026-08-23
- https://raw.githubusercontent.com/bugsnag/bugsnag-js/master/packages/delivery-xml-http-request/delivery.js — accessed 2026-08-23
- https://raw.githubusercontent.com/bugsnag/bugsnag-js/master/packages/delivery-xml-http-request/README.md — accessed 2026-08-23
- https://codeload.github.com/bugsnag/bugsnag-js/tar.gz/refs/heads/next — accessed 2026-08-23
- https://api.github.com/repos/bugsnag/bugsnag-js — accessed 2026-08-23
- https://github.com/bugsnag/bugsnag-js/issues/1786 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=@bugsnag/js@8.10.0 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=@bugsnag/browser@8.10.0 — accessed 2026-08-23
- https://docs.bugsnag.com/platforms/android/configuration-options/ — accessed 2026-08-23
- https://docs.bugsnag.com/platforms/ios/configuration-options/ — accessed 2026-08-23
- https://registry.npmjs.org/@grafana/faro-web-sdk/latest — accessed 2026-08-23
- https://registry.npmjs.org/@grafana/faro-web-sdk — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/transports/const.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/transports/batchExecutor.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/transports/base.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/transports/types.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/core/src/api/ItemBuffer.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/web-sdk/src/transports/fetch/transport.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/web-sdk/src/config/makeCoreConfig.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/web-sdk/src/instrumentations/index.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/faro-web-sdk/main/packages/web-sdk/src/instrumentations/getWebInstrumentations.ts — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=@grafana/faro-web-sdk@2.10.0 — accessed 2026-08-23
- https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/ — accessed 2026-08-23
- https://api.github.com/repos/grafana/faro-web-sdk — accessed 2026-08-23
- https://api.github.com/repos/grafana/faro-web-sdk/git/trees/main?recursive=1 — accessed 2026-08-23
- https://api.github.com/repos/grafana/alloy — accessed 2026-08-23
- https://api.github.com/repos/grafana/alloy/git/trees/main?recursive=1 — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/alloy/main/internal/component/faro/receiver/payload.go — accessed 2026-08-23
- https://raw.githubusercontent.com/grafana/alloy/main/internal/component/faro/receiver/internal/payload/payload.go — accessed 2026-08-23
- https://github.com/grafana/faro-web-sdk.git — accessed 2026-08-23
- https://registry.npmjs.org/mnemonist/latest — accessed 2026-08-23
- https://registry.npmjs.org/safe-stable-stringify/latest — accessed 2026-08-23
- https://registry.npmjs.org/devalue/latest — accessed 2026-08-23
- https://registry.npmjs.org/tracekit/latest — accessed 2026-08-23
- https://registry.npmjs.org/error-stack-parser/latest — accessed 2026-08-23
- https://registry.npmjs.org/exponential-backoff/latest — accessed 2026-08-23
- https://registry.npmjs.org/p-retry/latest — accessed 2026-08-23
- https://registry.npmjs.org/fast-redact/latest — accessed 2026-08-23
- https://registry.npmjs.org/xstate/latest — accessed 2026-08-23
- https://registry.npmjs.org/@statelyai/inspect/latest — accessed 2026-08-23
- https://registry.npmjs.org/mnemonist — accessed 2026-08-23
- https://registry.npmjs.org/safe-stable-stringify — accessed 2026-08-23
- https://registry.npmjs.org/devalue — accessed 2026-08-23
- https://registry.npmjs.org/tracekit — accessed 2026-08-23
- https://registry.npmjs.org/error-stack-parser — accessed 2026-08-23
- https://registry.npmjs.org/exponential-backoff — accessed 2026-08-23
- https://registry.npmjs.org/p-retry — accessed 2026-08-23
- https://registry.npmjs.org/fast-redact — accessed 2026-08-23
- https://registry.npmjs.org/xstate — accessed 2026-08-23
- https://registry.npmjs.org/@statelyai%2Finspect — accessed 2026-08-23
- https://api.github.com/repos/yomguithereal/mnemonist — accessed 2026-08-23
- https://api.github.com/repos/BridgeAR/safe-stable-stringify — accessed 2026-08-23
- https://api.github.com/repos/sveltejs/devalue — accessed 2026-08-23
- https://api.github.com/repos/csnover/TraceKit — accessed 2026-08-23
- https://api.github.com/repos/stacktracejs/error-stack-parser — accessed 2026-08-23
- https://api.github.com/repos/coveooss/exponential-backoff — accessed 2026-08-23
- https://api.github.com/repos/sindresorhus/p-retry — accessed 2026-08-23
- https://api.github.com/repos/davidmarkclements/fast-redact — accessed 2026-08-23
- https://api.github.com/repos/statelyai/xstate — accessed 2026-08-23
- https://api.github.com/repos/statelyai/inspect — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=mnemonist@0.40.4 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=safe-stable-stringify@2.5.0 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=devalue@5.9.1 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=tracekit@0.4.9 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=error-stack-parser@2.1.4 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=exponential-backoff@3.1.3 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=p-retry@8.0.0 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=fast-redact@3.5.0 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=xstate@5.32.5 — accessed 2026-08-23
- https://bundlephobia.com/api/size?package=@statelyai/inspect@0.7.2 — accessed 2026-08-23
- https://raw.githubusercontent.com/yomguithereal/mnemonist/master/circular-buffer.js — accessed 2026-08-23
- https://raw.githubusercontent.com/yomguithereal/mnemonist/master/fixed-deque.js — accessed 2026-08-23
- https://raw.githubusercontent.com/yomguithereal/mnemonist/master/circular-buffer.d.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/yomguithereal/mnemonist/master/utils/iterables.js — accessed 2026-08-23
- https://raw.githubusercontent.com/yomguithereal/mnemonist/master/utils/typed-arrays.js — accessed 2026-08-23
- https://raw.githubusercontent.com/Yomguithereal/obliterator/master/foreach.js — accessed 2026-08-23
- https://yomguithereal.github.io/mnemonist/circular-buffer — accessed 2026-08-23
- https://raw.githubusercontent.com/BridgeAR/safe-stable-stringify/v2.5.0/index.js — accessed 2026-08-23
- https://raw.githubusercontent.com/BridgeAR/safe-stable-stringify/v2.5.0/readme.md — accessed 2026-08-23
- https://raw.githubusercontent.com/sveltejs/devalue/main/README.md — accessed 2026-08-23
- https://raw.githubusercontent.com/davidmarkclements/fast-redact/v3.5.0/lib/redactor.js — accessed 2026-08-23
- https://raw.githubusercontent.com/davidmarkclements/fast-redact/v3.5.0/lib/restorer.js — accessed 2026-08-23
- https://raw.githubusercontent.com/davidmarkclements/fast-redact/v3.5.0/lib/modifiers.js — accessed 2026-08-23
- https://raw.githubusercontent.com/davidmarkclements/fast-redact/v3.5.0/index.js — accessed 2026-08-23
- https://raw.githubusercontent.com/csnover/TraceKit/master/README.md — accessed 2026-08-23
- https://raw.githubusercontent.com/csnover/TraceKit/master/tracekit.js — accessed 2026-08-23
- https://raw.githubusercontent.com/stacktracejs/error-stack-parser/master/README.md — accessed 2026-08-23
- https://raw.githubusercontent.com/stacktracejs/error-stack-parser/master/error-stack-parser.js — accessed 2026-08-23
- https://raw.githubusercontent.com/coveooss/exponential-backoff/master/README.md — accessed 2026-08-23
- https://raw.githubusercontent.com/sindresorhus/p-retry/main/readme.md — accessed 2026-08-23
- https://raw.githubusercontent.com/statelyai/xstate/xstate%405.32.5/packages/core/src/index.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/statelyai/xstate/xstate%405.32.5/packages/core/src/system.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/statelyai/xstate/xstate%405.32.5/packages/core/src/createActor.ts — accessed 2026-08-23
- https://raw.githubusercontent.com/statelyai/xstate/main/packages/core/CHANGELOG.md — accessed 2026-08-23
- https://fetch.spec.whatwg.org/ — accessed 2026-08-23
- https://fetch.spec.whatwg.org/#http-network-or-cache-fetch — accessed 2026-08-23
- https://raw.githubusercontent.com/whatwg/fetch/main/fetch.bs — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/RequestInit — accessed 2026-08-23
- https://w3c.github.io/beacon/ — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Request.keepalive.json — accessed 2026-08-23
- https://www.mozilla.org/en-US/firefox/133.0/releasenotes/ — accessed 2026-08-23
- https://www.firefox.com/en-US/firefox/133.0/releasenotes/?redirect_source=mozilla-org — accessed 2026-08-23
- https://www.firefox.com/en-US/firefox/124.0/releasenotes/ — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Navigator.sendBeacon.json — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_request_header — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.CompressionStream.json — accessed 2026-08-23
- https://opentelemetry.io/docs/specs/otlp/ — accessed 2026-08-23
- https://github.com/open-telemetry/opentelemetry-js/issues/5686 — accessed 2026-08-23
- https://docs.datadoghq.com/session_replay/browser/ — accessed 2026-08-23
- https://github.com/DataDog/browser-sdk/issues/2350 — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Performance.measureUserAgentSpecificMemory.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Performance.memory.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Window.pagehide_event.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Document.visibilitychange_event.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Window.beforeunload_event.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.BroadcastChannel.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.LockManager.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/http.headers.Reporting-Endpoints.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/http.headers.Report-To.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.ReportingObserver.json — accessed 2026-08-23
- https://bcd.developer.mozilla.org/bcd/api/v0/current/api.CrashReportBody.json — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/CrashReportBody — accessed 2026-08-23
- https://wicg.github.io/crash-reporting/ — accessed 2026-08-23
- https://developer.chrome.com/release-notes/139 — accessed 2026-08-23
- https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API — accessed 2026-08-23
- https://developer.chrome.com/docs/capabilities/web-apis/reporting-api — accessed 2026-08-23
- https://issues.chromium.org/issues/40904184 — accessed 2026-08-23
