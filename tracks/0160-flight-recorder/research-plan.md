# 0160-flight-recorder — research plan

**Status**: draft

## Goal

Decide whether, and in what shape, the application gets a **flight recorder** — a
memory-bounded, per-bucket capture of the most recent xstate transitions, MQTT messages, HTTP
exchanges, and arbitrary app-declared event streams, held in RAM until a trigger (an explicit
application call, or a global failure net) bundles the retained history into a schema-defined
payload and POSTs it to the team's own backend — so that an error report carries what led up
to the error rather than only the error itself. The track produces the capture-interface
design (the bucket abstraction and its startup-injected per-bucket config), the
byte-accounting and eviction policy, the trigger and bundling semantics, the delivery policy,
the payload-schema recommendation, and the adopt / adopt + wrap / build / skip verdict on the
recorder core. It taps seams that 0060 (D-0015), 0070 (D-0016) and 0050 (D-0014) already
own; it extends those seams where they are pre-authorized to extend, and owns none of them.

## What the charter settles (brainstorm 2026-08-22, recorded in D-0040)

1. **Triggers are explicit application calls plus global failure nets, and nothing else.**
   The app decides when to report (an imperative `capture(reason)` call), and the recorder
   additionally arms last-resort nets — `window.onerror`, `unhandledrejection`, React error
   boundaries. Two trigger classes were considered and **excluded**: automatic subscriptions
   to existing error surfaces (the 0060 taxonomy, 0050 error-level events), and declarative
   threshold rules evaluated by the recorder itself (N failures in T seconds). The recorder
   is a passive observer with a trigger input; it classifies nothing and evaluates nothing.
2. **The report endpoint exists; the payload schema is ours to define.** The recommendation
   should author the schema as a vendored OpenAPI contract so 0010's pipeline (D-0010)
   generates its types and validators like any other contracted surface, and D-0006's
   validation discipline applies to it.
3. **The capture envelope is 10–50 MB.** A rough envelope, not a hard budget — but the
   design pressure it sets is *bounded by construction and byte-accounted*, not payload
   starvation. At the app's ~50 msg/s aggregate and few-KB payloads, tens of MB is minutes
   of full-rate history.
4. **Delivery's null hypothesis is retry-within-session.** A bundle that cannot be delivered
   is held in memory and retried with backoff; a tab death loses it. The charter fixes only
   that nothing durable holds a pending bundle by default — whether retries are bounded and
   drop with a counter or run until the tab dies was never ruled and is question 10's choice
   *(corrected 2026-08-23: an earlier draft of this plan asserted both variants in different
   sections; the failure-mode enumeration caught the contradiction)*. Durable parking of
   pending bundles (IndexedDB) must *earn* its way in against the RAM-disk risk below —
   question 10 carries the burden of proof, and the user's stated concern is the reason.
5. **Replay-on-another-device and regression-test generation are door-open only.** Their
   only claim on this track is the reserved-decisions checklist in question 12 — data-model
   properties that are cheap to carry now and unrecoverable to add later. Nothing about
   replay is designed, and no rubric weight rewards it beyond that checklist.

Also settled at charter: the **build** posture (owned recorder kit) and the **adopt + wrap**
posture (an existing SDK's core behind a facade) enter the survey at **equal merit** — the
user held them level, so neither carries a default and neither carries the burden of proof.
The third posture — extending 0050's logging facade — is retained as the weaker challenger,
kept alive chiefly to force the question of what the recorder *shares* with the facade
rather than as a likely end state (question 14).

## The RAM-disk premise, and what it does to the design space

The devices run their OS from a **RAM disk** (facts/app-profile.md, 2026-08-22). The browser
profile — IndexedDB included — is therefore RAM too, and three consequences follow before
any candidate is compared:

- **"Spill to disk" is not an escape from the memory ceiling.** An IndexedDB write spends
  the same physical resource as the in-memory ring. Persistence changes *which process*
  holds the bytes and *what survives a tab crash*, never the budget.
- **Durability across a power cycle does not exist on the device, full stop.** Parking a
  pending bundle durably buys exactly the tab-crash/reload window and nothing more.
- **Every candidate SDK's offline/persistence feature is neutralized.** Sentry's offline
  transport is an IndexedDB queue ([offline.js, `dbName 'sentry-offline'`](https://docs.sentry.io/platforms/javascript/configuration/transports/));
  0050's blessed offline-buffer prior art is the same pattern. On these devices it survives
  nothing a memory buffer wouldn't, which removes one of the standing reasons to adopt an
  SDK at all — and the sharper risk runs the other way: a durable pending queue
  *accumulates* while the backend is down, and a full RAM disk is an OS-level failure. A
  recorder built to observe failures must not be able to cause one.

## What the plan-grounding sweep found (2026-08-22)

A six-lane grounding sweep ran at charter time — two lanes over the accepted 0060/0070/0050
artifacts, four over external sources — to build this plan's seam citations and candidate
list. As with 0150 (D-0038), the sweep grounds the plan and does not survey: D-0001 depth is
unchanged and the go gate is untouched. Findings the questions below build on:

**The tap map is mostly pre-designed.** 0060's wire 1 (`boundary.actor.on('*')`) was built
as the one-line observer tap — its own doc calls `'*'` "the 0050 wildcard tap" — and carries
validated per-channel message events plus the deduped `TelemetryEvent` envelope for all four
error classes in a single passive subscription (0060 spike design.md, "The two wires";
findings.md check-5). Attaching there has no broker-interest side effect, unlike the
handle's `subscribe()`, which refcounts real broker subscriptions and which a recorder must
never call. Listener isolation is verified: a throwing wire-1 listener never skips siblings
and never re-enters the broker callback (invariant I12). For xstate, one `inspect` observer
on the root actor observes the entire actor system including spawned children, can be
attached and detached at runtime via `actor.system.inspect()` (public API, source-verified
at tag xstate@5.32.5, undocumented), and costs near zero when detached (`system.ts:157` —
early return before any allocation).

**Capture-by-reference is unsafe on every tap; serialize-at-capture is forced, and
measured cheap.** Wire-1 payloads and telemetry errors are shared live objects — the
quarantined Ajv evidence is a shallow copy whose `ErrorObject`s Ajv reuses, and no
freeze/clone of payloads is specified anywhere (0060 findings check-5, check-12). xstate
inspection events are shallow spreads whose `snapshot`/`actorRef`/`_transitions` fields
reference the live machine graph — buffering a raw event pins the whole graph and is
mutation-unsafe (xstate 5.32.5 `system.ts:161`, `State.ts:351`). So a ring holding raw
references holds neither bounded nor stable history. Measured on desktop V8 as a proxy:
`JSON.stringify` of a ~200 B event is ~0.44 µs, +TextEncoder ~0.85 µs, a ~12 KB object
~17 µs — at 50 events/s that is ~0.1–0.25 % of one core, under ~3 % even at a 10× device
derate. Eager projection to a bounded serialized record at capture time is therefore the
leading hypothesis, not a luxury (question 3).

**Nothing in the field bounds by bytes.** Sentry breadcrumbs (default 100, `slice(-max)`,
2048-char message truncation), Bugsnag (hard cap 100), Rollbar (hard cap 100), mnemonist's
rings (item capacity), rrweb (checkout every N events / N ms) — every surveyed buffer bounds
by count or time. No byte-budgeted ring exists on npm or GitHub as of 2026-08-22. Byte
accounting against the 10–50 MB envelope is custom work under **every** posture (question 2).

**The slot itself is empty.** npm and GitHub searches for the pattern ("flight recorder",
breadcrumb ring + trigger dump, in-memory log buffer dump-on-error) return only vendor
error-monitoring SDKs, aviation tools, and non-browser software. The genuine implementations
of "bounded recent history, dump on trigger" live inside Sentry, Bugsnag, and Rollbar. This
is the same shape 0060 found for its slot; unlike 0060, two of those SDK cores are honestly
extractable (candidates below), which is why adopt + wrap enters at equal merit.

**The Firefox floor decides the last-gasp story.** `fetch(…, {keepalive: true})` shipped in
Firefox 133 (2024-11-26); the app's floor is ~124 (2024-03-19). On floor Firefox the only
sender that survives page dismissal is `navigator.sendBeacon`, whose 64 KiB quota is a
*shared in-flight* budget across all keepalive-class requests per the Fetch spec — and which
floor-era Firefox has been observed not to enforce at all (non-contractual; do not design on
it). `CompressionStream` is available across the whole matrix (Firefox 113+/Chromium 80+)
but is async-only, so a last-gasp handler cannot await compression. Consequence carried into
question 9: **two payload budgets**, not one — the triggered bundle (large, async POST,
worker-side gzip at a conservative 5–10×) and any last-gasp summary (≤ 64 KiB, pre-serialized,
uncompressed).

**Crash-shaped deaths are invisible in-page, and on floor Firefox invisible entirely.**
Renderer OOM, unresponsive kills, and app-manager kills fire no page event; the Reporting
API delivers crash reports out-of-band via the `Reporting-Endpoints` response header —
Chromium 96+ (dedicated `crash-reporting` endpoint name Chromium 139+), while Firefox 124
predates all Reporting API support. The global nets the charter names catch what a page can
see; what a page cannot see needs a server-side complement (Chromium arm only) or
absence-based detection, and the report must say which deaths produce no report (question 7).

**Two capture gaps exist in the accepted boundary, and both have pre-authorized routes.**
Successful *outbound* MQTT publishes appear on neither wire — `MessageEvent` is typed over
inbound channels only, and the only egress record is the test-only memory adapter — so an
outbound bucket needs a new emission, and 0060's "a policy-row addition, not an interface
redesign" is the sanctioned shape. And aborted REST requests raise no telemetry by D-0018
ruling; the compensating "boundary stats counter" is ratified language with **no design
anywhere** — this track is plausibly the trigger that finally designs it (question 5).

## What the failure-mode enumeration changed (2026-08-23)

After drafting, a D-0036-shape coverage-forcing enumeration ran over this plan on user
directive — eight lanes, 152 failure modes, each mapped to the key question that owns it;
[plan-fmea-enumeration.md](plan-fmea-enumeration.md) is the durable register, carrying the
severity-ranked shortlist, the adjudication, and every finding preserved verbatim. Nine
modes were unowned and two were defects in this plan's own text; the amendments are
annotated in place, and the largest are: **question 16 is new** (the plan was silently
single-tab); **question 9 gains bundle identity** (anonymous bundles were undedupable and
uncorrelatable, and question 7's own absence-based compensation was unimplementable over
them); **question 7's prescribed seal protocol was unsound** (index snapshots tear under
continued capture — corrected to copy-or-freeze); and **the charter section and question
10 disagreed about the retry null** (corrected: the charter fixes no-durable-parking;
question 10 owns retry termination). Intake items i–l were added for the facts the pass
surfaced. The same pass runs again at report stage, over the actual recommended design
(question 15).

## Key questions

1. **What does the recorder buy over the surfaces the program has already accepted — and
   what is the skip verdict's honest content?** The null worth stating before any candidate
   is compared: 0050's facade already owns remote sinks and will ship error-level events;
   0060 already emits a deduped telemetry envelope for every taxonomy failure. The recorder's
   distinct claim is *retrospective, full-fidelity, cross-bucket context* — telemetry is
   deduped (leading edge + folded summary per 60 s window, so five identical failures emit
   twice), logs are leveled and throttled, and neither retains what preceded the failure.
   The report states what the recorder uniquely buys, and if that claim does not survive
   scrutiny the honest verdict is skip or a thin 0050 extension.
2. **What is the bound's unit, and how is the envelope enforced?** Count-based caps bound
   nothing when payload size is unbounded; byte caps require metering. The sweep's platform
   findings fix the honest meter: serialized UTF-8 bytes (`TextEncoder`/`Blob` semantics),
   metered once at capture on the already-serialized record — heap bytes are engine-dependent
   (1–2× UTF-16 code units) and unmeasurable cross-browser, since
   `performance.measureUserAgentSpecificMemory` is Chromium-only behind COOP/COEP and
   `performance.memory` is deprecated. Sub-questions: per-bucket byte caps, a global
   envelope, or both, and which wins when they disagree; eviction (evict-oldest within a
   bucket is the presumptive policy — state what, if anything, justifies another); what
   happens when a *single entry* exceeds its bucket's budget (truncate with markers per
   question 12's RD-5, or refuse); and drop accounting — every eviction and truncation must
   be countable in the bundle itself, because a capture that silently thinned is worse than
   a capture that says so. Four additions from the enumeration pass (2026-08-23):
   **truncation must force a copy** — a `slice()` of a large string is a V8
   SlicedString/SpiderMonkey dependent string that retains the entire parent, so a 4 KB
   truncated record can pin a 12 MB body for its ring lifetime while the meter reads
   4 KB, and question 15's boundedness properties must test retention, not just the
   meter; **if a global envelope binds, say which bucket pays** — cross-bucket
   evict-oldest deterministically starves the quiet buckets (xstate, logs) whose sparse
   entries are oldest, handing the noisy bucket's redundant traffic the space the rare
   context needed; **projection failures are drops too** — an entry lost because the
   scrubber threw is neither an eviction nor a truncation, and is counted or the
   accounting lies; and the meter states what it does with **per-entry index/metadata
   overhead**.
3. **Is capture-time serialization the design, and what is the projection per bucket?** The
   leading hypothesis from the sweep: project every captured item to a bounded, serialized,
   immutable record inside the capture call, and let the ring hold only strings/bytes plus a
   small index. Test it rather than assume it — the cost numbers are desktop-proxy, and the
   capture call runs inside seams with hard latency discipline (0060's shared dispatch turn,
   0070's one-JS-turn pipeline — see question 4). The projection needs a cycle- and
   depth-bounded serializer (`safe-stable-stringify`'s `maximumDepth`/`maximumBreadth` is
   the off-the-shelf shape; @statelyai/inspect's replacer — HTMLElement→outerHTML,
   function→name — is MIT prior art worth copying), and per-bucket scrubbers, since xstate
   context and Zustand state can hold actor refs, functions, and cycles that
   `JSON.stringify` throws on or drops silently. The enumeration pass (2026-08-23) adds
   four hazards the projection design must answer: **serializer-level loss carries
   markers** — depth/breadth elision strings (`[Circular]`, "N more items") and JSON
   coercions (Map/Set → `{}`, dropped `undefined`) are well-formed wrong evidence
   indistinguishable from real values, the same anti-pattern RD-5 exists to prevent one
   layer down, so elision and coercion get structured markers, not in-band strings;
   **the serialize walk executes app code** — getters, Proxy traps, and `toJSON` run
   inside the capture turn, can throw, stall, or mutate (a revoked immer draft throws
   mid-walk; BigInt throws in plain `JSON.stringify`), so the projection guards against
   the walk itself, not only value shapes; **a sibling listener may mutate the payload
   before the recorder's listener runs** — dispatch order is not the recorder's to
   choose; and **a named fallback** — if eager projection fails its cost test on
   device-class hardware, what is plan B (capture-turn shallow snapshot plus idle-time
   serialization is the obvious candidate), so the report does not discover the need
   mid-design.
4. **Where exactly does each built-in bucket attach, and at which layer's view of the
   traffic?** The concrete tap-map deliverable, grounded by the sweep:
   - **MQTT bucket**: wire-1 `actor.on('*')` sees *validated* payloads post-0010; the 0070
     kit's `inspect` hook sees the same traffic with pipeline verdicts (dedup/guard/mask/
     dispatch) attached but is a **single function slot**, not a registry — if the recorder
     takes it, devtools cannot, so composition is the integrator's problem and the report
     must design the multiplex or refuse the tap. Raw/invalid traffic appears only in the
     quarantine ring (poll-only, count-bounded 100, evict-oldest) and as deduped telemetry.
     The report says which layer the bucket records — validated events, pipeline verdicts,
     or both — and how quarantined evidence rides along at trigger time.
   - **HTTP bucket**: wrap the caller-owned orval mutator / `fetcher` (post-validation
     pairs, template-key identity `GET /v1/plants/{plantId}`, `BoundaryError` rejections),
     or decorate the injectable `FetchLike` adapter (pre-validation view, real
     `AbortSignal`). The artifacts describe adapter *substitution*, not decoration — the
     decorator reading is inference the survey verifies. Aborts are invisible on telemetry
     by D-0018; if the recorder needs them, designing the ratified-but-undesigned stats
     counter is the sanctioned route. And pair-at-completion capture structurally misses
     the in-flight exchange — often the very hang being reported — while RD-4 requires an
     in-flight entry to say so (added 2026-08-23): the record model needs a
     request-record plus an outcome-record joined by a correlation id, reconciled with
     question 3's immutable records and question 12's HAR projectability.
   - **xstate bucket**: `actor.system.inspect()` per root. Five event types are actually
     emitted at 5.32.5 (`@xstate.transition` is declared in the union and never emitted;
     `@xstate.action` is emitted and undocumented; the docs' four-type list and microstep
     shape diverge from source — pin to source). The report chooses which types constitute
     the "transition" bucket, knowing @statelyai/inspect's wire format silently drops
     microstep and action events, and defines an owned projection — xstate v6 is actively
     reworking inspection upstream, so the raw `InspectionEvent` shape must not be the
     stored schema.
   - **Log bucket** (if any): a facade `Sink` via `addSink` receives post-redaction records;
     0050's throttle semantics would thin it unless exempted `contract.*`-style, and the
     facade does not exist yet — its report is a signature sketch with an unexecuted spike
     list. The bucket is optional and must not create a build-order dependency on 0050.
   - **Custom buckets**: the standard interface (question 6) is the attach point; the four
     built-ins above must be expressible *as* adapters over it, or the interface is wrong.
   - **When taps attach, not only where** (added 2026-08-23): everything emitted before a
     bucket attaches is never captured — including the connect-time replay burst a
     `clean: false` session delivers immediately, and `xstate.init` — so boot-window
     failures, a prime error class, get empty buckets indistinguishable from "nothing
     happened". Worse, 0060's `inspect` is a constructor-only config slot, which puts
     recorder construction *before* boundary construction while the HTTP wrap needs the
     boundary first — an init-order cycle the design must break at the composition root.
     The report states the attach-before-start ordering per bucket, stamps attached-since
     markers so a bundle distinguishes quiet from not-yet-attached, and says how a tap's
     silent death (boundary `dispose()` and recreation, facade reconfiguration) is
     detected — tap liveness belongs in question 6's health block.
5. **What do the capture gaps cost, and does the track pay to close them?** Outbound MQTT
   publishes (no production observation surface — needs a 0060 emission via the
   pre-authorized policy-row route) and aborted REST requests (D-0018). For each: is the
   gap acceptable for an error report, and if not, what is the minimal extension and who
   owns it? The report must not silently widen 0060's interfaces; it lands inside the
   pre-authorized shapes or it names the D-0015 reopening it would require.
6. **What is the standard interface, and what does a bucket declaration look like?** The
   concrete deliverable the charter asked for: a `record(bucket, entry)`-shaped sink with
   per-bucket config injected at service startup — capacity (count and bytes), projection/
   scrubber, redaction rules, enabled flag. Sub-questions: is a bucket's config a row in a
   registry the way 0060's `ChannelPolicy` is (the proven shape in this program), which
   combinations are illegal and unrepresentable (a bucket with no bound; a trigger from a
   bucket that doesn't exist), what the recorder exposes for observation of itself (drop
   counters, current byte totals — the bundle's own health block), and whether `record()`
   is safe to call from anywhere or only below the view layer (the layering blueprint says
   services/machines, never components — align with D-0002's restricted-import discipline).
   Three additions from the enumeration pass (2026-08-23): **unrepresentable cannot lean
   on the type system here** — the app's strictness is very loose with heavy
   agent-authored churn (facts/app-profile.md), so an `any`-typed config that compiles
   with a missing capacity field is the expected case, and the recorder validates its own
   config at runtime at startup, with a fail-fast-or-fail-safe ruling; **a kill switch**
   — the charter injects config at startup, but a recorder that is itself degrading the
   fleet needs disabling without a redeploy, and the report says whether that is a
   runtime-config seam, a remote flag, or explicitly refused; and **the thread
   dimension** — `record()` is main-thread as designed, worker-origin events would need a
   bridge nobody has designed, and whether any app code runs in workers is intake item k
   rather than an undeclared assumption.
7. **What can each trigger actually see, and what is the trigger protocol?** Global nets
   catch what a page can observe; renderer OOM/unresponsive/app-manager kills fire no event,
   and on floor Firefox the Reporting API contributes nothing (no support before ~130/149),
   so those deaths produce no report on that arm — the report says so plainly and weighs the
   Chromium-only `Reporting-Endpoints` server-side complement (a backend-header change, no
   client code) plus absence-based detection as the compensations. Protocol sub-questions:
   how nets chain with any existing handlers (intake item g); trigger dedup and cooldown —
   an error loop must not produce a bundle storm, and cooldown-suppressed triggers are
   themselves counted; whether a trigger during an in-flight bundle coalesces, queues, or
   drops; and what minimal synchronous work the net handler does. *(Corrected 2026-08-23:
   this question previously prescribed "snapshot the ring indices, then bundle async" —
   unsound, found independently by three enumeration lanes. A ring overwrites slots in
   place, so under continued capture the async bundler reads post-trigger data at
   pre-trigger positions, and no drop counter can see it because nothing was evicted. The
   seal must copy or freeze the entry references — O(n) pointer copies of immutable
   serialized records, cheap by construction — and stamp a per-bucket cut marker so
   buckets sealed milliseconds apart are honest about their cut points.)* Four more
   findings from the pass: **the nets arm late** — module-eval, config-wiring, and
   first-mount errors fire before any net exists, so boot-loop failures produce no bundle
   unless a pre-arm stub buffers them (Sentry's loader snippet is the prior art; a
   question 14 comparison point); **React 18 error boundaries are not a passive net** —
   React 18.3.1 has no root-level error hooks, and a boundary-caught error never reaches
   `window.onerror` in production (dev behaviour differs, hiding the gap from tests), so
   this charter-named net is really a recorder-supplied boundary component or
   per-boundary wiring — enumerated app work, not an armed hook; **cross-origin scripts
   yield opaque `"Script error."`** events with no stack, so the nets' yield depends on
   script origins; and **absence-based detection needs a designer** — the report names
   who builds the server-side heartbeat-gap check it leans on, which presupposes question
   9's bundle identity.
8. **Does capture continue past the trigger?** The charter wants "possibly slightly after"
   — a configurable post-trigger window (T ms or N items per bucket) before the bundle
   seals, so the report includes the immediate aftermath. Sub-questions: what a second
   trigger during the window does; whether the window delays delivery or the bundle ships
   and a supplement follows — a supplement carries its base bundle's id (question 9) and
   needs a delivery slot question 10's one-at-a-time rule must grant; the default
   (plausibly zero).
9. **What is the bundle, and what are the two budgets?** The envelope header: trigger
   reason and stack (tracekit/error-stack-parser prior art), app build/version, config
   snapshot, per-bucket drop/truncation counters, 0070's six `IngressStats` counters and
   wire-2 depths, both clocks (question 12's RD-2), schema version — **and identity**
   (added 2026-08-23): a device id, a page-incarnation id, and a bundle id, with
   supplements naming their base. Without these, at-least-once retry duplicates are
   undedupable at the backend (a POST that lands but loses its 2xx is re-sent and stored
   twice), same-device bundles cannot be told apart or joined across tabs and reloads,
   and question 7's absence-based detection has nothing to key on; whether a device
   identifier is available to page code and may appear in reports is intake item i. The
   body: per-bucket ordered records. Format sub-questions: JSON with worker-side `CompressionStream` gzip
   (5–10× planning ratio; 15× measured on synthetic repetitive JSON is the upper bound),
   size ceilings the backend will accept (intake item c), and the **two-budget split** the
   platform findings force — the triggered bundle has no hard size problem, while any
   last-gasp path is ≤ 64 KiB, sendBeacon-only on floor Firefox, pre-serialized,
   uncompressed. Whether a last-gasp summary exists at all is decided here: the charter's
   triggers do not include page dismissal, but a bundle already in flight when the tab dies
   is a delivery question, not a new trigger. Two more sub-questions from the pass
   (2026-08-23): **peak memory at seal** — the rings, the assembled JSON string, and the
   worker's structured-clone copy are transiently co-resident at 2–3× the envelope (up to
   ~150 MB at the 50 MB end), at the moment the device is likeliest already degraded, and
   a renderer OOM here destroys the evidence and lands in question 7's no-report death
   class — the design budgets the spike (transferable `ArrayBuffer` output instead of
   string cloning is the obvious lever) rather than discovering it; and **the compression
   failure path** — a gzip worker that dies degrades to uncompressed or smaller, never to
   silent loss.
10. **Delivery: what carries the bundle, and does anything survive the tab?** The null is
    fixed by charter only in shape: in-memory retry with backoff and jitter (0050's copied
    loglevel-plugin-remote design is the house idiom), one bundle at a time, nothing
    durable by default. **This question owns retry termination** (clarified 2026-08-23
    after the enumeration caught the contradiction): bounded-then-drop-with-a-counter and
    retry-until-tab-death are materially different under a sustained outage — freed memory
    and lost evidence, versus pinned memory and a late win — and the charter ruled
    neither. It also owns the **delivery semantics**: retries are at-least-once, so the
    backend deduplicates on question 9's bundle id, and the report says so to whoever
    owns the endpoint. Durable parking must prove: hard cap (a bundle or
    two, evict-oldest, self-deleting on send), a real evidence win over the null (the
    tab-crash-during-delivery window — quantified against how often deliveries are
    actually interrupted, intake item l; without that figure the proof is judgment
    wearing a proof's clothes), and no accumulation path under a dead backend —
    against the RAM-disk premise above. Also owned here: **delivery independence** — the
    report must not assume 0060's REST surface is alive, because the failure being reported
    may be the boundary itself; a recorder POST is plausibly a bare `fetch` outside the
    boundary, and the report says whether that violates the D-0006 choke-point rule or
    falls outside it (the report endpoint is *our* contract, not a partner's — but then its
    schema validation happens where?).
11. **How does the recorder not become the incident?** The self-interference question, with
    the sweep's hazards enumerated: capture runs inside 0060's shared dispatch turn — a slow
    listener causes shedding *for every consumer* (bound 256, shed-oldest), so the capture
    budget per event is the recorder's hardest latency constraint; the HTTP bucket must not
    capture the recorder's own report POST (self-capture loop); the global nets must not
    re-trigger on the recorder's own throw (loop protection; wire-1 listener isolation I12
    covers the boundary side but `onerror` sees everything); and the recorder must never
    report through itself. The enumeration pass (2026-08-23) extends the list: **every
    in-path tap needs its own isolation contract** — I12 covers wire-1 listeners only,
    while the mutator/`FetchLike` wrap sits inside the app's request path (a capture
    throw fails the app's request itself), the 0070 `inspect` hook is a bare synchronous
    call inside the pipeline turn, and xstate observers run synchronously in actor
    processing with no documented throw isolation — question 15 verifies containment per
    tap, not once; and **the seal itself is a hazard** — question 9's trigger-time memory
    spike lands exactly when the device is likeliest degraded, so "do not become the
    incident" covers the collection step, not only steady-state capture. The failure bias
    is stated like 0150's question 13: a recorder
    that silently under-captures is acceptable; one that degrades the app is not.
12. **Which data-model decisions are reserved for replay and regression tests, and which
    are explicitly not?** The door-open ruling's whole claim on the design, distilled from
    prior art (HAR 1.2, Playwright trace, rrweb, Chrome DevTools Recorder, @mswjs/source,
    MQTT recorder tools) by the grounding sweep. Reserved, per captured item or per bundle:
    - **RD-1** per-bucket monotonic sequence numbers (timestamps cannot break same-ms ties;
      @mswjs/source replays same-endpoint entries strictly in recorded order);
    - **RD-2** two clocks — wall epoch-ms and a monotonic offset from one shared origin
      (Playwright's `wallTime`+`monotonicTime` pattern); deltas are derived at replay,
      never stored;
    - **RD-3** one shared clock domain across buckets (a single-threaded runtime needs no
      vector clock — reserve the shared origin, nothing more);
    - **RD-4** direction/role and terminal outcome per item (in/out for MQTT; aborted/
      fulfilled for HTTP — an entry in flight at trigger time must say so);
    - **RD-5** explicit truncation markers `{truncated, originalSize}` (HAR's silent `-1`
      sentinels are the anti-pattern; a truncated capture without a flag replays as a wrong
      response rather than a refused one);
    - **RD-6** per-payload `{mimeType, encoding}` in-band (binary payloads die without it);
    - **RD-7** an envelope header with format version, creator, app build, platform,
      config snapshot, **and instance identity — device id, page-incarnation id, bundle
      id** (added 2026-08-23: without them same-device bundles cannot be joined,
      deduplicated, or ordered across tabs and reloads — exactly the
      cheap-now/unrecoverable-later class this list exists for) (HAR
      `log.version/creator`; Playwright context options; rrweb Meta);
    - **RD-8** per-bucket `{schemaId, schemaVersion}` for app-defined buckets;
    - **RD-9** ring self-sufficiency — each bucket can say whether its oldest retained item
      is a complete starting point, and stamps how many items dropped before the window
      (rrweb's checkout mechanism is the prior art; a transitions-only xstate ring that
      never snapshots full state is the single biggest foreclosure risk);
    - **RD-10** redaction markers distinct from truncation `{redacted, ruleId}` (no
      surveyed format marks redaction in-band; Chromium sanitizes HAR silently — replay
      must be able to substitute synthetic values knowingly).
    Not reserved (regenerable or constraint-free): pacing deltas, replay speed, HAR's
    fine-grained timing breakdown, server IPs/connection ids, DOM/pixel data, UI-flow
    selectors. Two format-level pre-commitments are worth making now and no more: the HTTP
    bucket stays **losslessly projectable to HAR 1.2 entries** (the shortest regression
    path is HAR → `@mswjs/source` `fromTraffic` → MSW handlers, already order- and
    timing-faithful; pre-1.0, peer `msw ^2.10` — verify at adoption against the D-0022 MSW
    line), and the MQTT bucket record carries `{topic, packetId, payload}` plus explicit
    gap markers in arrival order — exactly the `ValidatedMessage | 'gap'` shape 0070's
    `RaceHarness.push` consumes, which makes captures convertible into pinned
    `fc.schedulerFor` regression properties through the seam production already uses. The
    xstate reservation: initial persisted snapshot (`getPersistedSnapshot`), ordered
    external events (`sourceRef === undefined`, excluding `xstate.init`), machine
    id+version; the deterministic replay mechanism it preserves is the pure
    `transition()`/`initialTransition()` API (xstate ≥ 5.19), not live re-sending — the
    docs' event-sourcing pattern has no determinism guarantee and re-arms real timers,
    promises, and `Math.random` delay ids.
13. **Redaction: whose rules, applied where, marked how?** 0050's ruling is that redaction
    lives in the facade as a single choke point — but that choke point covers facade sinks,
    and the recorder's buckets never pass through it. Share the **rule set** (fast-redact
    style field/path/pattern rules), not the choke point; apply per-bucket at projection
    time (capture-time redaction is irreversible — RD-10 marks it); and get the actual
    constraints from intake item b, because what may leave the device at all is a fact only
    the team can supply. And redaction covers the **whole bundle**, not only bucket
    records (added 2026-08-23): the trigger's error message and stack are free-text PII
    carriers, the config snapshot can embed secrets, and quarantine ride-along is by
    definition traffic no schema accepted — all three bypass every bucket's projection
    scrubber unless the seal applies the rules to them explicitly.
14. **Adopt, wrap, build — what would an adopted core be paid for?** The equal-merit
    comparison, honestly run. **Sentry's SDK core** (MIT, active): a real breadcrumb ring,
    the failure nets, attachments for arbitrary buckets, delivery to an owned endpoint via
    `tunnel` or a custom `Transport` — paid for in Sentry's envelope protocol as the wire
    format (publicly specced, but not our schema; a custom Transport re-shaping to our
    OpenAPI contract keeps the machinery and drops the protocol), count-based bounding
    (byte accounting is custom regardless), and one global ring (the per-bucket taxonomy
    must be encoded or split across attachments). **Bugsnag** (MIT): owned endpoints and a
    public payload spec, but a hard 100-crumb cap and no attachments — likely dominated;
    say so with evidence rather than assumption. **Faro** (Apache-2.0): passes the
    owned-receiver test but is a batch shipper (250 ms/50-item flush), not a recorder — the
    recorder semantics would still be built. **OTel browser**: Logs still "Development",
    Events API deprecated — confirms D-0014's rejection rather than reopening it. **rrweb**:
    documents exactly the checkout+trigger pattern but records the DOM, not domain events —
    an optional later bucket, never the core. The build posture's honest bill of materials,
    from the sweep: the byte-budgeted ring and the payload schema are the only non-trivial
    owned pieces; serialization, stack parsing, and backoff are adoptable micro-deps
    (`safe-stable-stringify`/`devalue`, `tracekit`/`error-stack-parser`,
    `exponential-backoff`/`p-retry`) under D-0027 rung-1 justification. The report weighs
    both against the same rubric with the RAM-disk neutralization of SDK persistence and
    the replay-door schema ownership (question 12) priced in.
15. **How is the recommendation falsified, and what would a spike validate?** The capture
    cost numbers are desktop-proxy (Node/V8) — a spike measures projection cost and
    shedding behaviour against 0060's real dispatch path (the aedes harness exists) on
    hardware closer to the device (intake item f). The failure nets are hard to test in
    jsdom; the report says which claims need a real browser lane (0120's future harness)
    and, per the 0150 precedent, states plainly which of its claims are unverified if no
    lane can reach them. Byte-accounting invariants (never exceeds cap; drop counters
    account for every eviction) are property-testable with the accepted fast-check lane.
    Four obligations added by the enumeration pass (2026-08-23): measure projection
    against **live app-shaped objects** (getter walks, proxies), not inert literals — the
    current figures measure the wrong operand; verify **throw containment per tap**
    (mutator wrap, 0070 `inspect`, xstate observer), not only wire-1's I12; test
    boundedness as **retention**, not metered bytes (the SlicedString hazard in question
    2); and the report carries one standing obligation — **re-run this enumeration over
    the recommended design**: the D-0036 coverage-forcing pass that produced this plan's
    2026-08-23 amendments runs again when there is an actual design to enumerate, and its
    register lands beside the report.
16. **Multi-tab: which tab owns the evidence?** (Added 2026-08-23 — the enumeration pass
    found the plan silently single-tab.) Each tab runs an independent in-RAM recorder,
    and the app profile is explicit that single-connection-per-device is "stated as
    intent, not as an enforced property" — so with two tabs open, at most one holds the
    MQTT connection, and a trigger in the connectionless tab seals an MQTT bucket that is
    empty in a way indistinguishable from "no traffic", while a trigger in the connected
    tab misses the erroring tab's xstate/HTTP/log history. N tabs also multiply the
    envelope (N × 10–50 MB of device RAM) and arm N independent failure nets, so one
    device-level cause produces N near-duplicate bundles whose per-instance cooldowns
    cannot see each other. The report answers: what a bundle records about its own tab
    context (question 9's page-incarnation id is the prerequisite); whether cross-tab
    trigger coordination (BroadcastChannel is the light primitive; 0150's plan owns the
    Web Locks leader-election analysis) is in scope or explicitly refused with the
    duplicate cost stated; and what the design assumes about tab usage at all — intake
    item j, connecting to the single-connection enforcement question intake
    2026-08-17-0150 item f already raised. What it must not do is silently assume one
    tab.

## Seams this track cites rather than restates

Owned elsewhere and not reopened here: the two-wire rule and wire shapes, the four-class
taxonomy, the quarantine ring's inspection-only policy, and the delivery-queue bounds (0060,
D-0015/D-0018); the fixed synchronous ingress pipeline, its `inspect`/`stats` observation
surfaces, and the one-JS-turn invariant (0070, D-0016); the facade's ownership of
throttle-by-pattern, redaction, remote sinks, and runtime reconfiguration (0050, D-0014);
the layering lint discipline (D-0002, D-0020).

Pre-authorized extension points this track may land in, with their exact language: 0060's
"a policy-row addition, not an interface redesign" (the route for an outbound-publish
emission, question 5) and the D-0018 "boundary stats counter" (named, undesigned — the abort
visibility route). The 0070 acceptance bar for extending the ingress — one selector per
stream, no interface reshaping — is the yardstick if the recorder wants anything from the
kit beyond the existing `inspect` slot.

Distinct from neighbours, stated to prevent conflation: **0150's inbox is effect
durability; this track is diagnostics.** The inbox writes message identity in the same
transaction as the effect; the recorder observes and never participates in any transaction.
They meet only if question 10 adopts durable parking, at which point the shared
origin/schema/eviction/multi-tab decisions 0150's plan reserves apply to this track's store
too — one origin, one reservation, decided once.

## What this track does not decide

Replay and regression-test *design* — a future track owns both; this track only carries the
question-12 reservations. The backend/receiving side beyond "accepts the contracted payload
over HTTP" (endpoint particulars are intake item c). Whether 0050's facade, when built,
routes its remote sink through recorder machinery or vice versa — flagged to whoever builds
the facade, not decided here. Any change to 0060's interfaces beyond the pre-authorized
shapes. DOM/session-replay capture (rrweb-shaped) — named as a possible later bucket under
RD-8 and not evaluated.

## Candidates

Postures, entering at equal merit (charter ruling):

- build — owned recorder kit; the sweep's bill of materials says the only non-trivial owned
  pieces are the byte-budgeted ring and the payload schema
- Sentry JS SDK core (@sentry/core / @sentry/browser) —
  https://github.com/getsentry/sentry-javascript — MIT (manifest and LICENSE agree,
  v10.70.0); breadcrumb ring + failure nets + attachments + `tunnel`/custom `Transport` to
  an owned endpoint; ~36 KB gzip error-only (its own CI size-limit budget)
- @bugsnag/js — https://github.com/bugsnag/bugsnag-js — MIT; owned `endpoints` +
  public payload spec; breadcrumbs hard-capped at 100, no attachments
- @grafana/faro-web-sdk — https://github.com/grafana/faro-web-sdk — Apache-2.0; custom
  receiver supported, but a 250 ms/50-item batch shipper, not a recorder

Pieces adoptable inside any posture (D-0027 rung 1, each needing its justification):

- mnemonist (CircularBuffer/FixedDeque) — https://github.com/Yomguithereal/mnemonist — MIT;
  the one maintained TS ring library; item-count capacity only
- safe-stable-stringify — https://github.com/BridgeAR/safe-stable-stringify — MIT;
  cycle-safe with `maximumDepth`/`maximumBreadth`; dormant-stable (2.5.0, 2024)
- devalue — https://github.com/sveltejs/devalue — MIT, active; rich-type round-tripping if
  the replay door wants it; not plain JSON — pick one serializer, not both
- tracekit — https://github.com/csnover/TraceKit — MIT, alive (0.4.9, 2026-03);
  error-stack-parser 2.1.4 (MIT, dormant-stable) is the alternative
- exponential-backoff — https://github.com/coveooss/exponential-backoff — Apache-2.0;
  p-retry 8 (MIT, ESM-only) alternative; both replaceable by ~20 owned lines
- @statelyai/inspect — https://github.com/statelyai/inspect — MIT, pre-1.0 and sporadic
  (0.7.2); **prior art, likely not adopted**: its serialization recipe is worth copying,
  its wire format drops `@xstate.microstep`/`@xstate.action`, and its adapters target
  inspectors, not rings

Prior art, not adoptable: rrweb's checkout mechanism (the ring+trigger semantics, on the
wrong signal); Sentry's envelope protocol and offline transport (the latter neutralized by
the RAM disk); HAR 1.2 / Playwright trace / Chrome DevTools Recorder JSON (capture-format
lessons, question 12); @mswjs/source (the HAR→MSW regression path the HTTP bucket stays
projectable to; pre-1.0, peer msw ^2.10); 0070's `RaceHarness` (the MQTT replay bridge);
mqtt_recorder and siblings (the minimal MQTT capture tuple).

Eliminated on constraint, recorded so they are not re-surveyed (verified against shipped
tarballs and licenses, 2026-08-22): OpenTelemetry JS browser logs/events (Logs still
"Development", Events API deprecated on npm — D-0014 confirmed); posthog-js
(protocol-coupled to a PostHog server); highlight.run (now LaunchDarkly's SDK, hardwired to
vendor backends); @openreplay/tracker (requires the multi-licensed OpenReplay backend);
@datadog/browser-logs, @microsoft/applicationinsights-web, logrocket (paid/vendor-cloud
only); @elastic/apm-rum (requires Elastic APM Server); rollbar.js (dominated: ring hard-cap
100, no attachments, no schema control); stacktrace-js (dead since 2020, wraps what is
adoptable directly); denque/ring-buffer-ts/@stdlib circular buffers (unbounded, dormant, or
disproportionate packaging for ~30 lines).

## Survey verification notes

- **Every measured number in this plan is proxy hardware.** Serialization costs and gzip
  ratios were measured on a desktop (Node 24/V8, native zlib) — a stand-in for Chromium on
  developer hardware, not the RAM-disk device (D-0004). The 15.2× gzip ratio came from a
  deliberately repetitive synthetic corpus; 5–10× is the planning range. Re-measure before
  any figure becomes load-bearing in the report.
- **The Firefox keepalive floor is decisive and must be re-pinned.** Firefox 133 shipped
  `fetch keepalive`; the floor fact reads "~124". If the fleet's actual floor is ≥ 133 the
  two-budget design relaxes materially — check the real floor (intake item f) before
  designing around its absence. The claim that floor-era Firefox does not enforce the
  64 KiB beacon cap is third-party source-reading, non-contractual either way.
- **Docs/source divergences found by the sweep, source wins**: xstate's docs list four
  inspection event types, source emits five and declares six; the documented microstep
  shape is the JSON projection, not the object shape; @statelyai/inspect's docs say
  last-response-sticky where its code shows one-shot handlers. Pin all xstate claims to tag
  `xstate@5.32.5`; the raw `InspectionEvent` shape is explicitly not stable across the
  coming v6.
- **The `FetchLike` decorator tap is inference.** The 0060 artifacts describe adapter
  substitution, never decoration. Verify the decorating adapter composes before the report
  recommends it.
- **License checks were manifest + LICENSE text, both read.** The field's two composite
  cases (posthog-js, OpenReplay) are recorded above; re-verify any candidate that moves
  between now and the survey.

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

Browser compatibility is weighted high because the Firefox ~124 floor is decisive for the
delivery design (keepalive absent; Reporting API absent), not merely a support checkbox.
Escape hatch is high because the adopt + wrap posture's visible cost is wire-format lock-in
(Sentry's envelope), and the wrap must contain it.

**Proposed tenth criterion — "Boundedness", weighted high**: does the candidate bound its
memory by construction, in bytes as well as items, and does it fail loudly (counters,
truncation markers) or silently when a bound is hit? This is the axis the track exists to
reason about — the charter's memory envelope is the design's first constraint — and no
existing criterion carries it: Runtime overhead scores steady-state cost, not behaviour at
the cap, and the sweep found the entire field bounds by count while this track's envelope is
denominated in bytes. Per **D-0023** a track-specific criterion needs its own ledger entry
and may not cite 0100 (or 0150's parallel proposal) as precedent, so this is **proposed, not
adopted** — a ruling for the go gate.

## Facts needed

The charter answered the gating scope questions (triggers, schema ownership, envelope,
delivery null, replay posture — D-0040). The remainder are raised in
[intake/2026-08-22-0160-recorder-facts.md](../../intake/2026-08-22-0160-recorder-facts.md):

- **Payload sizes** (item a) — typical and worst-case MQTT payload and REST body sizes; the
  byte budgets, truncation defaults, and history-depth arithmetic all start here.
- **What may leave the device** (item b) — PII/sensitivity constraints on report contents;
  decides the redaction rule set and whether raw payloads ship at all.
- **The report endpoint's particulars** (item c) — same-origin or CORS, size ceiling, auth,
  and whether it shares infrastructure with the MQTT broker or REST backend (delivery
  independence, question 10).
- **Initial buckets and depths** (item d) — the config seeds; also which xstate machines
  matter and whether machines carry `version`.
- **Build identity at runtime** (item e) — RD-7 needs an app build/version stamp.
- **Device hardware and the real browser floor** (item f) — CPU class for de-rating the
  measured costs; the actual Firefox version the fleet runs (the keepalive question).
- **Incumbent error handling** (item g) — any existing `onerror`/`unhandledrejection`
  handlers or reporting paths the nets must chain with rather than fight.
- **Reporting-Endpoints feasibility** (item h) — whether ops can add response headers for
  the Chromium crash-report complement.
