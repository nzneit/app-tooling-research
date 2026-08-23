# 0160 — failure-mode enumeration over the research plan (2026-08-23)

**Status**: complete — plan amended in place; this file is the durable record
**Method**: D-0036's coverage-forcing enumeration, run one-off on user directive
(2026-08-23) over the drafted research plan, ahead of the go gate. Per D-0036 the FMEA
*apparatus* is not used: no Severity/Occurrence/Detection ratings, no Action Priority, no
RPN — severity is a qualitative high/medium/low label, findings are ranked into a
shortlist, and the unranked remainder is preserved verbatim in the appendix rather than
discarded. This is a one-off pass on one plan, not a standing per-plan control; making it
standing would be a D-0029/D-0035 ceiling decision needing its own ruling.

**Shape**: one workflow stage (within the D-0035 ceiling), eight parallel hunters, one per
stage group of the recorder pipeline — taps, projection, buffering, triggers, bundling,
delivery, config/startup, page-lifecycle/concurrency. Each hunter read the plan and the
relevant accepted artifacts, enumerated what fails at its stages, and mapped every failure
mode to the plan key question that owns deciding it (owned / partial / UNOWNED), with
instructions to verify the plan text before claiming UNOWNED. The adjudication below is
the session agent's, checked against the plan text; the hunters' verbatim output is the
appendix.

**Totals**: 152 failure modes across 8 lanes. After adjudication: **9 UNOWNED** (3 high,
4 medium, 2 low), **~70 partially owned**, the remainder fully owned — which is the
coverage evidence that the question set holds for most of the space. Two findings are
defects in the plan's own text rather than coverage gaps, and they rank with the highest.

## Shortlist (severity-ranked; disposition for each)

1. **Multi-tab capture topology is entirely unowned** *(high, UNOWNED)*. Each tab runs an
   independent in-RAM recorder; the clientId is device-scoped with single-connection
   intent "stated as intent, not as an enforced property" (facts/app-profile.md). A
   trigger in the connectionless tab seals an empty MQTT bucket that reads as "no
   traffic"; a trigger in the connected tab misses the erroring tab's history; N tabs
   multiply the envelope and the nets, and a shared-cause failure double-reports with no
   cross-tab dedup. The plan's only multi-tab sentence was conditional on durable parking
   and scoped to the IndexedDB store. → **New key question 16**; intake item j (tab usage
   patterns); ties to intake 2026-08-17-0150 item f.
2. **The bundle has no identity** *(high, UNOWNED)*. No device id, no page-incarnation
   id, no bundle id, no supplement linkage anywhere in Q9's envelope or RD-7 — so
   at-least-once delivery duplicates are undedupable server-side (a POST that lands but
   loses its 2xx is re-sent), Q7's own absence-based crash detection is unimplementable
   over anonymous bundles, and a Q8 supplement cannot name its base. → **Q9 identity
   block; RD-7 amended; Q10 names at-least-once semantics; intake item i** (device
   identity available to page code).
3. **Q7's prescribed trigger protocol is unsound as written** *(high, plan defect — found
   independently by three hunters plus an out-of-lane note)*. "Snapshot the ring indices,
   then bundle async" retains positions, not records: capture continues at ~50 msg/s
   (Q8 keeps it running deliberately), the ring overwrites the snapshotted slots during
   multi-hundred-ms assembly, and the bundle silently presents post-trigger data as
   pre-trigger history — with drop counters unable to see it, because nothing was
   evicted. → **Q7 rewritten** to copy-or-freeze semantics and a snapshot-consistency
   requirement, plus a per-bucket cut marker at seal.
4. **Trigger-time memory spike** *(high, partial)*. Sealing co-residents the rings, the
   assembled JSON string, and the worker's structured-clone copy — transiently 2–3× the
   envelope (up to ~150 MB at the 50 MB end) at the moment the device is likeliest
   already degraded; a renderer OOM here destroys the evidence and lands in the
   no-report death class. → **Q9 gains a peak-memory budget sub-question** (transferable
   encoding vs string clone); **Q11's hazard list gains the spike**.
5. **In-path taps have no isolation contract** *(high, partial)*. I12 covers wire-1
   only. The mutator/FetchLike wrap sits inside every app HTTP request; the 0070
   `inspect` hook is a bare synchronous call inside the ingress turn; xstate observers
   run synchronously in actor processing with no documented throw isolation. A capture
   bug converts to failed app requests or a broken pipeline turn. → **Q11's hazard list
   extended to every in-path tap; Q15 verifies isolation per tap**.
6. **Bootstrap errors precede the nets, and React 18 boundaries cannot be armed
   passively** *(high, partial)*. Module-eval/config/first-mount errors fire before any
   net exists, and React 18.3.1 has no root-level error hooks — an error caught by a
   boundary never reaches `window.onerror` in production (dev behavior differs, so
   testing hides the gap). The charter-named "React error boundaries" net is actually
   per-boundary app integration. → **Q7 amended** (arming order, pre-arm buffering as a
   Q14 comparison point, the boundary reality, cross-origin `Script error.` opacity).
7. **Serializer-level fidelity loss is unmarked** *(high, partial)*. Map/Set → `{}`,
   dropped `undefined`, `[Circular]`/"N more items" elision strings indistinguishable
   from real values — well-formed wrong evidence with drop counters at zero, the HAR
   anti-pattern RD-5 exists to prevent, arising one layer below where RD-5 applies.
   → **Q3 amended**: serializer elision/coercion carries structured markers; the walk
   executes app code (getters/Proxy traps/toJSON) — named as a hazard; BigInt/revoked-
   proxy throws; a fallback if eager projection fails its cost test.
8. **Loose TypeScript defeats unrepresentable-config** *(high, partial)*. Q6's
   enforcement strategy was type-level; the app's strictness is "very loose" with heavy
   agent-authored churn, so an `any`-typed config with no capacity field compiles.
   → **Q6 amended**: runtime config validation at startup is the backstop; fail-fast vs
   fail-safe is posed.
9. **A binding global envelope starves the quiet bucket** *(high, partial)*.
   Cross-bucket evict-oldest deterministically victimizes the sparse buckets (xstate,
   logs) whose entries are oldest — the forensically rare context loses to the noisy
   bucket's redundant traffic. → **Q2 amended** to pose which bucket pays.
10. **Truncation by `slice` retains the parent string** *(high, UNOWNED)*. A V8
    SlicedString/SpiderMonkey dependent string pins the full flat parent: a 12 MB body
    truncated to a 4 KB record retains ~12 MB for the ring lifetime while the meter says
    4 KB — unbounded divergence, concentrated on exactly the largest payloads, invisible
    to metered-bytes property tests. → **Q2 amended**: truncation must force a copy;
    Q15's properties test retention, not just the meter.
11. **Redaction bypasses non-bucket content** *(high, partial)*. The trigger's error
    message and stack (free-text PII carriers), the config snapshot, and quarantine
    ride-along (unvalidated traffic by definition) never pass any bucket's projection
    scrubber. → **Q13 amended**: redaction covers the whole bundle.
12. **Pair-at-completion HTTP capture loses the in-flight exchange** *(high, partial)*.
    The hanging request being reported settles never — so it was never captured; RD-4
    requires in-flight entries to say so, which pair-capture structurally cannot.
    → **Q4 amended**: request-record + outcome-record with a correlation id, reconciled
    with Q3's immutability and Q12's HAR projectability.
13. **The charter section and Q10 state two different retry nulls** *(medium, plan
    defect)*. "Retried until sent or the tab dies" (charter §4) vs "bounded retries,
    then drop with a counter" (Q10) are materially different designs. The user's actual
    ruling fixed only *no durable parking by default* — retry termination was never
    ruled. → **Charter §4 corrected; Q10 now owns the bounded-vs-unbounded choice**,
    with the deciding fact (delivery-interruption frequency) added as intake item l.
14. **Attach ordering and the pre-attach window are unowned** *(medium, UNOWNED — high
    variant in the taps lane)*. Everything emitted before a bucket attaches is never
    captured — including the connect-time replay burst under `clean: false` and
    `xstate.init` — and 0060's `inspect` is a constructor-only config slot, creating an
    init-order cycle at the composition root. Boot-window failures, a prime error class,
    get empty buckets indistinguishable from "nothing happened". → **Q4 amended**
    (attach-before-start ordering, attached-since markers); tap-liveness joins Q6's
    health block (taps also die silently at `dispose()`/facade reconfiguration).
15. **Config is frozen at startup with no retune or kill path** *(medium, UNOWNED)*. No
    diagnostic turn-up, and no way to disable a recorder that is itself degrading the
    fleet, short of redeploy. → **Q6 amended** to pose the kill-switch/retune question
    against the charter's startup-injection ruling.
16. **Worker-origin events are invisible; the thread topology is an undeclared
    assumption** *(low, UNOWNED)*. → **intake item k**; one sentence in Q6.

Also acted on, below the shortlist: Q8's supplement gains correlation identity via the
bundle id (folded into 2); Q7 names an owner for absence-based detection (folded into 2);
RD-7 gains per-runtime-instance identity (folded into 1 and 2); Q15 gains the
report-stage obligation to run this same enumeration over the *recommended design* —
closing the loop this pass opened at plan level.

## What was not acted on

Roughly 55 partially-owned and 75 fully-owned modes stand as found; the owned set is the
evidence that the plan's questions cover most of the space, and the un-acted partials are
refinements the survey should consume when answering their owning questions. **They are
preserved verbatim in the appendix below** (D-0036's runners-up requirement; seed-corpus
category J is the failure it prevents). Notable un-acted items the surveyor should read
before answering Q2, Q7, Q9, Q10 and Q14: metered-UTF-8 vs resident-RAM drift, quarantine
ride-along bytes belonging to no budget, the sendBeacon quota shared with 0050's remote
sink at dismissal, adopted SDKs' own nets preempting the Q7 protocol, cooldown-suppressed
triggers being unaccounted, and the gzip-worker failure path.

---

## Appendix — the full enumeration, verbatim

Eight lanes, 152 modes, hunter output unedited. Owner verdicts are the hunters'; the
shortlist above records where adjudication acted.

### Lane: taps (20 modes)

**[high] Capture work stalls the shared dispatch turn and sheds for everyone**
- Stage: wire-1 tap / 0060 dispatch turn + 0070 pipeline
- Mechanism: Recorder projection/serialization runs synchronously inside 0060's shared listener dispatch (and, if the kit inspect tap is taken, inside 0070's one-JS-turn ingress pipeline). A slow capture — large payload, deep scrub, device-class CPU — delays every consumer and pushes the bounded delivery queue (256, shed-oldest) into shedding.
- Effect: App-wide message loss caused by the observer: shed events vanish for all consumers, not just the recorder's bucket, and the recorder degrades the app it exists to diagnose.
- Owner: Q11
- Rationale: Q11 owns it verbatim: "capture runs inside 0060's shared dispatch turn — a slow listener causes shedding for every consumer (bound 256, shed-oldest), so the capture budget per event is the recorder's hardest latency constraint". Q3 names both seams ("0060's shared dispatch turn, 0070's one-JS-turn pipeline") and owns testing the projection cost; Q15 owns re-measuring against the real dispatch path on device-class hardware.

**[high] Pre-attach window and attach ordering have no owner**
- Stage: startup wiring
- Mechanism: Every bucket attaches to a live seam (wire-1 listener, actor.system.inspect(), mutator wrap, addSink) at some moment after boundary.start()/actor start. Everything emitted earlier is never captured: the connect handshake, xstate.init and initial snapshots, and — on this clean:false fleet — the reconnect replay burst the broker delivers immediately at connect. Worse, 0060's `inspect` hook is a constructor-only config field (design.md: `inspect?: (event) => void` in BoundaryConfig), so using it forces the recorder to exist before the boundary while the HTTP wrap needs boundary.fetcher to exist first — an init-order cycle at the composition root.
- Effect: Bundles for startup failures — a prime error class — carry empty or midstream buckets, with nothing distinguishing 'nothing happened' from 'not yet attached'.
- Owner: partial:Q4 — Q4 fixes where each bucket attaches, never when; no question owns attach ordering at startup or the constructor-only-slot init cycle
- Rationale: Q4 asks "Where exactly does each built-in bucket attach, and at which layer's view of the traffic?" — a placement question. The word 'attach' otherwise appears only in the sweep's xstate note ("can be attached and detached at runtime"). Q6's "per-bucket config injected at service startup" is about config shape, not wiring order. Q12's RD-9 ("stamps how many items dropped before the window") only marks incompleteness after the fact and cannot express not-yet-attached.

**[high] Taps without an isolation contract sit in the app's critical path**
- Stage: in-path taps / isolation limits
- Mechanism: I12 (throwing wire-1 listener never skips siblings, never re-enters the broker callback) is verified for wire 1 only. The mutator/FetchLike wrap puts recorder code inside every app HTTP request — a capture bug rejects or corrupts the request itself. The 0070 inspect hook is a bare synchronous function call inside the ingress pipeline. xstate system.inspect observers run synchronously during actor event processing with no documented throw isolation — a throwing observer can disrupt transition processing.
- Effect: A recorder defect converts directly into failed app requests, a broken ingress turn, or a wedged machine — the exact 'recorder becomes the incident' outcome, via taps Q11 never enumerates.
- Owner: partial:Q11 — the question owns the category but its enumerated hazards omit every in-path tap except wire-1
- Rationale: Q11's hazard list is explicit and closed: the dispatch turn, the self-capture POST loop, nets re-triggering on the recorder's own throw, and never reporting through itself — with "wire-1 listener isolation I12 covers the boundary side". Throw isolation for the mutator wrap, the 0070 inspect slot, and the xstate observer appears nowhere, and Q15's spike/verification list does not include verifying isolation on any tap but the boundary's.

**[high] Recorder's own throw re-enters through the global net**
- Stage: failure nets x wire-1 tap
- Mechanism: I12 protects sibling listeners from a throwing recorder listener, but the exception still surfaces as an uncaught error; window.onerror is a recorder trigger, so a deterministic capture bug fires the net on every event — trigger, bundle, throw again.
- Effect: Bundle storm / trigger loop driven by the recorder itself.
- Owner: Q11
- Rationale: Owned verbatim: "the global nets must not re-trigger on the recorder's own throw (loop protection; wire-1 listener isolation I12 covers the boundary side but `onerror` sees everything)" — and Q7's trigger dedup/cooldown sub-question owns bounding the storm.

**[high] Buffered references mutate or pin live graphs**
- Stage: capture-by-reference at every tap
- Mechanism: Wire-1 payloads and telemetry `raw` evidence are shared live objects (Ajv reuses its ErrorObjects; no freeze/clone is specified anywhere); xstate inspection events shallow-spread references into the live machine graph. A ring of references is neither byte-bounded nor stable — retained history mutates under it and pins the actor graph.
- Effect: Bundles carry wrong (later-mutated) evidence, and the 'bounded' buffer secretly retains unbounded live structure.
- Owner: Q3
- Rationale: Q3 owns serialize-at-capture as the tested design ("project every captured item to a bounded, serialized, immutable record inside the capture call") with per-bucket cycle/depth-bounded serializers and scrubbers; the grounding sweep supplies the mechanism ("Capture-by-reference is unsafe on every tap; serialize-at-capture is forced"). Owned — listed as coverage evidence.

**[medium] Single inspect slot contention, and an unisolated multiplex if one is designed**
- Stage: 0070 kit inspect slot
- Mechanism: The kit's inspect is one function slot, not a registry: if the recorder takes it, devtools cannot (or dev builds hand it to devtools and silently lose the verdict bucket, making field bundles differ from dev repros). Any multiplexer the report designs fans out synchronously inside the pipeline turn with no I12-style isolation, so one consumer's throw or stall takes the other's view down with it.
- Effect: Lost pipeline-verdict capture, dev/field capture divergence, or a shared-fate multiplexer inside the ingress turn.
- Owner: Q4
- Rationale: Owned explicitly: "a **single function slot**, not a registry — if the recorder takes it, devtools cannot, so composition is the integrator's problem and the report must design the multiplex or refuse the tap." The isolation quality of the multiplex is a design obligation inside that sentence (with Q11 supplying the do-not-degrade bias).

**[medium] Taps die silently: dispose(), boundary recreation, facade reconfiguration**
- Stage: tap lifecycle / dispose()
- Mechanism: boundary.dispose() guarantees wire silence (I10/O6); if the app disposes and recreates the boundary in a recovery flow, the recorder's held Unsubscribes point at the dead instance and nothing re-attaches to the new one. Same family: 0050's facade owns runtime reconfiguration, which could replace or drop the recorder's Sink. Capture keeps 'working' over stale rings.
- Effect: The next trigger ships history that stops at the dispose with no marker — diagnosis chases evidence that predates the incident, the worst kind of silent under-capture.
- Owner: partial:Q6 — the self-observation health block owns counters, not tap liveness or re-attach
- Rationale: Q6 names "what the recorder exposes for observation of itself (drop counters, current byte totals — the bundle's own health block)" — a liveness/attached-since field would live there but is not named. The word 'dispose' does not appear anywhere in the plan; 'detached' appears only in the sweep's xstate note. Q11's stated bias ("silently under-captures is acceptable") accepts the outcome without owning its detection.

**[medium] No bucket records the connection-state timeline**
- Stage: wire-2 / boundary going degraded
- Mechanism: The four built-ins tap wire 1, the inspect slots, the mutator, and addSink. The reconnecting→degraded history exists only on wire 2 (BoundarySnapshot), and the boundary's internal machine is deliberately unreachable behind the narrowed actor ref, so the xstate bucket cannot see it either. Class-1 connection telemetry on wire 1 is deduped to two emissions per 60 s window; Q9's envelope carries only instantaneous "wire-2 depths" at bundle time.
- Effect: For connectivity incidents — a likely trigger class on this fleet — the bundle cannot show when reconnects began, how attempts progressed, or when publish gating engaged; the lead-up the recorder exists to preserve is missing for boundary failures specifically (which Q10 acknowledges are a report subject).
- Owner: partial:Q4 — the tap map enumerates no wire-2/connection bucket; Q9 carries only an instantaneous depths snapshot
- Rationale: Q4's bucket list (MQTT, HTTP, xstate, log, custom) contains nothing attached to `actor.subscribe`/wire 2; the only wire-2 mention in any question is Q9's envelope item "0070's six IngressStats counters and wire-2 depths". A custom bucket (Q6) could carry it, but nothing directs the report to consider one.

**[medium] The error stream is only tappable post-dedup — the full-fidelity claim fails for the error bucket**
- Stage: wire-1 telemetry granularity
- Mechanism: The only error-event tap is the deduped TelemetryEvent envelope (O5 folds repeats by dedupKey within the 60 s window — Q1's own words: "five identical failures emit twice"). The recorder therefore records the app's errors at exactly the granularity Q1 names as the deficit the recorder answers. No pre-dedup error tap exists, and Q5's pre-authorized extension routes (outbound-publish emission, stats counter) do not include one.
- Effect: Bundles under-represent error storms; the report's Q1 claim of "retrospective, full-fidelity, cross-bucket context" silently does not hold for the one bucket most relevant to an error report — an internal conflict between Q1's claim and Q4's tap map.
- Owner: partial:Q1 — Q1 states the dedup semantics as the deficit but never confronts that the recorder's own error capture rides the same deduped wire
- Rationale: Q1: "telemetry is deduped… and neither retains what preceded the failure" — framed as what the recorder buys context over, not as a limit on the recorder's own error bucket. Q4's MQTT layer choices are "validated events, pipeline verdicts, or both"; telemetry-stream granularity is not among them, and no question asks 0060 for a pre-dedup tap or prices one.

**[medium] Quarantine evidence evicted before trigger, or unmetered at trigger time**
- Stage: quarantine ride-along
- Mechanism: The ring is poll-only, count-bounded 100, evict-oldest. Between fault and trigger, an invalid-payload storm evicts the relevant entries; harvesting on telemetry emissions cannot compensate because O5 folds repeats (two emissions per window while pushes continue). Entries hold `raw` live objects, so bundling them means serializing at trigger time — bypassing Q2's meter-once-at-capture accounting and adding unmetered bytes against the backend ceiling. The plan's tap map also overlooks 0060's `inspect` config hook, which per design.md sees "every event crossing the seam, quarantine-bound rejects included" and could capture rejects per-event.
- Effect: The invalid-payload evidence the quarantine exists to preserve is absent from the bundle, or its unmetered serialization blows the size budget at delivery.
- Owner: partial:Q4 — owns "how quarantined evidence rides along at trigger time" but names neither the eviction race, the bypass of Q2's capture-time metering, nor the boundary inspect hook as an alternative tap
- Rationale: Q4: "Raw/invalid traffic appears only in the quarantine ring (poll-only, count-bounded 100, evict-oldest) and as deduped telemetry… how quarantined evidence rides along at trigger time" — the 'only' is itself inaccurate against design.md's inspect hook. Q2 fixes metering "once at capture on the already-serialized record", which structurally has no capture point for trigger-time ride-along bytes.

**[medium] Bucket coverage silently tracks app subscription interest**
- Stage: wire-1 passivity / broker interest
- Mechanism: Wire 1 emits only for channels with live refcounted broker interest (O3). When the last app consumer unsubscribes, the topic goes silent at the broker and the configured bucket records nothing — configured bucket ≠ captured topic, varying at runtime. The compensating move, the recorder calling subscribe(), is forbidden only in the plan's grounding prose — and on this clean:false ActiveMQ deployment a recorder QoS-1 subscribe would mint a durable JMS subscription keyed (clientId, QoS:topic) that nothing reaps (app-profile orphan mechanism).
- Effect: Silent per-topic capture gaps in field bundles; or, if an integrator violates the unenforced prohibition, broker-side durable-subscription orphans that pin journal files — the recorder causing an ops-level failure.
- Owner: partial:Q4 — the attach point is owned but the coverage consequence is not, and the never-subscribe rule is grounding prose no question enforces
- Rationale: The prohibition lives in the sweep section ("the handle's subscribe(), which refcounts real broker subscriptions and which a recorder must never call"), not in a question. Q6's illegal-and-unrepresentable list is "a bucket with no bound; a trigger from a bucket that doesn't exist" — a bucket expressing broker interest is not on it, so nothing makes the prohibition unrepresentable or documents that capture coverage follows app interest.

**[medium] Reconnect replay burst wipes pre-outage history at the trigger-likeliest moment**
- Stage: seam traffic shape
- Mechanism: The persistent session (clean:false) queues QoS-1 traffic broker-side during an outage; on reconnect up to ~1000 messages replay, paced by the in-flight window (app profile). Evict-oldest rings sized by steady-state ~50 msg/s arithmetic flush minutes of pre-outage context in seconds — precisely when app calls or failure nets are most likely to trigger.
- Effect: The bundle contains the burst, not the lead-up; Q2's drop counters honestly report that history thinned, but the evidence is already gone.
- Owner: partial:Q2 — eviction policy and drop accounting are owned, but the sizing arithmetic assumes steady rate and no question weighs burst arrival shapes
- Rationale: Q2 owns per-bucket caps, evict-oldest, and "every eviction and truncation must be countable"; its history-depth arithmetic starts from intake item a payload sizes at the charter's "~50 msg/s aggregate". The plan's only storm language is Q7's trigger "bundle storm" — a different mechanism. The replay burst is documented in facts/app-profile.md, not requested or consumed by any question.

**[medium] FetchLike decoration may not compose**
- Stage: HTTP tap
- Mechanism: The 0060 artifacts describe adapter substitution, never decoration; a decorating adapter is effectively a third adapter that the dual-adapter contract-suite discipline never tests, and it can break bound-fetch and abort-threading semantics the port contract-tests for.
- Effect: The HTTP bucket's pre-validation tap option rests on an unverified integration; recommending it untested ships a design that fails at adoption.
- Owner: Q4
- Rationale: Owned twice over: Q4's HTTP bullet ("The artifacts describe adapter *substitution*, not decoration — the decorator reading is inference the survey verifies") and the survey verification note ("Verify the decorating adapter composes before the report recommends it").

**[medium] Pre-validation FetchLike view ingests credentials**
- Stage: HTTP tap layer choice
- Mechanism: The FetchLike adapter receives the full RequestInit including Authorization headers (and the MQTT side's transformWsUrl carries token refresh); capturing at that layer writes secrets into the ring before any redaction rules run, and capture-time bytes are already metered and retained.
- Effect: Bundles exfiltrate credentials to the report backend unless the projection scrubs them — a leave-the-device violation intake item b exists to prevent.
- Owner: Q13
- Rationale: Q13 owns rules applied "per-bucket at projection time" with the actual constraints from intake item b, and Q4 owns the layer choice that creates the exposure ("pre-validation view, real AbortSignal"). Jointly owned; listed as coverage evidence with the mechanism made concrete.

**[medium] Outbound publishes and aborted requests are invisible to every tap**
- Stage: capture gaps at the seam
- Mechanism: MessageEvent is typed over inbound channels only, so successful publishes appear on no wire; aborted REST requests raise no telemetry by D-0018 ruling. A report about a failed command flow lacks the very messages the app tried to send.
- Effect: Field bundles cannot answer 'what did the app do' for the outbound half of an incident unless the track pays for the pre-authorized extensions.
- Owner: Q5
- Rationale: Q5 owns both gaps explicitly, including the closure routes (0060's "a policy-row addition, not an interface redesign" for outbound emission; the ratified-but-undesigned D-0018 stats counter for aborts) and the reopening cost if the routes don't fit. Owned — coverage evidence.

**[medium] Undocumented API and v6 rework under the xstate bucket**
- Stage: xstate tap
- Mechanism: actor.system.inspect() is public-but-undocumented, source-verified only at tag 5.32.5; five of six declared event types are actually emitted; docs diverge from source; v6 is reworking inspection upstream. A minor xstate upgrade can silently change or remove the tap and the event shape.
- Effect: The xstate bucket breaks or its stored records change shape across an ordinary dependency bump.
- Owner: Q4
- Rationale: Owned: Q4's xstate bullet pins to source, owns choosing the captured event types, and mandates "an owned projection — … the raw InspectionEvent shape must not be the stored schema"; the survey verification notes repeat the pin. Owned — coverage evidence.

**[medium] HTTP bucket captures the recorder's own report POST**
- Stage: self-capture / delivery coupling
- Mechanism: If Q10 routes delivery through boundary.fetcher (the D-0006 choke-point question), the mutator tap sees every report POST — each bundle's delivery becomes the next bundle's content, and retries multiply entries at the worst time. If delivery is a bare fetch outside the boundary, no exclusion is needed — so the exclusion mechanism and the delivery-path choice are one coupled decision.
- Effect: Ring pollution and feedback growth during incident delivery, or an exclusion mechanism designed against the wrong delivery path.
- Owner: Q11
- Rationale: Q11 owns the loop explicitly ("the HTTP bucket must not capture the recorder's own report POST (self-capture loop)") and Q10 owns the delivery-path choice that determines whether the hazard exists ("a recorder POST is plausibly a bare fetch outside the boundary"). Owned across the two — coverage evidence of the coupling.

**[low] Capture stamp lags broker arrival by queue latency**
- Stage: timestamps across the delivery queue
- Mechanism: Wire-1 dispatch runs off the packet pump through a bounded queue plus microtask (O1), and the accepted MessageEvent carries no arrival-timestamp field — the recorder can only stamp at listener invocation. Under backlog (depth up to 256, exactly the interesting moments) stamps skew by queue latency, misordering MQTT entries against HTTP/xstate entries stamped at other points.
- Effect: Replay and cross-bucket diagnosis reconstruct a wrong interleaving during the loaded windows that matter most; RD-1/RD-2 sequencing is faithfully recorded but measures the wrong instant.
- Owner: partial:Q12 — RD-2/RD-3 reserve clock domains and a shared origin, but not the stamp point relative to the queue
- Rationale: Q12's RD-2 fixes "wall epoch-ms and a monotonic offset from one shared origin" and RD-3 one clock domain — nothing about where the stamp is taken. Q5's pre-authorized extension list (outbound emission, stats counter) does not contemplate asking 0060 for an arrival stamp on wire-1 events.

**[low] Log bucket depends on an unbuilt facade and inherits throttle thinning**
- Stage: log bucket / 0050 seam
- Mechanism: addSink exists only as a signature sketch with an unexecuted spike list; 0050's throttle-by-pattern thins sink traffic unless the recorder's stream is exempted contract.*-style; records arrive post-redaction under the facade's (unspecified) marking convention.
- Effect: The bucket is unbuildable today or silently thinned in the field; its upstream redactions carry no RD-10 {redacted, ruleId} markers, so replay substitutes values unknowingly — a small break in Q12's marker uniformity.
- Owner: partial:Q13 — the bucket's existence, thinning, and build-order are owned by Q4; marker alignment for upstream-redacted records is owned by no one
- Rationale: Q4's log-bucket bullet owns the facade dependency and throttle exemption ("must not create a build-order dependency on 0050"). Q13 owns applying shared rules "per-bucket at projection time" with RD-10 marking — but the log bucket's records are redacted upstream of projection, in a facade whose marker convention does not exist yet; neither Q4 nor Q13 reconciles that.

**[low] MQTT/HTTP buckets have a hard build-order dependency on the unbuilt boundary**
- Stage: host-seam availability
- Mechanism: The whole tap map is defined over 0060/0070 seams that are accepted designs, not code in the app (D-0004; the app-profile Contracts section is still unfilled). The plan raises build-order only for the log bucket; nothing states what the recorder taps in the app as it exists today, or that the recommendation is sequenced behind boundary adoption.
- Effect: The report can ship a recorder design that is unimplementable until 0060/0070 land, with the sequencing assumption undeclared — the exact 'silent assumption' the repo's rules route to intake.
- Owner: partial:Q4 — build-order is confronted solely in the log-bucket bullet; the MQTT/HTTP buckets' equivalent dependency is unstated
- Rationale: Q4: "The bucket is optional and must not create a build-order dependency on 0050" — said of the log bucket only. The goal section ("It taps seams that 0060, 0070 and 0050 already own") treats the seams as extant; no question or intake item asks whether/when the app adopts them or what an interim tap would be.

**Lane notes**: Hunter lane: capture taps and host-seam interaction. Sources read in full: tracks/0160-flight-recorder/research-plan.md, facts/app-profile.md (MQTT + Environment), tracks/0060-transport-abstraction/spikes/boundary-wiring/design.md (wire shapes, I1-I13, O1-O6, BoundaryConfig.inspect, dispose semantics, port/adapter contract discipline). Coverage summary for the adjudicator: 8 owned (Q11 x3, Q4 x3, Q3, Q5, Q13), 11 partial, 0 fully UNOWNED after verification against plan text — the nearest-to-unowned items are startup attach ordering (partial:Q4), silent tap death across dispose/reconfigure (partial:Q6), and the wire-2 connection-timeline blindness (partial:Q4). One out-of-lane observation for whichever hunter owns trigger/bundling: Q7's prescribed minimal-sync-work design ("snapshot the ring indices, then bundle async") is unsound as literally worded under continued eviction — an index snapshot over a circular buffer whose slots are reused corrupts the async-read bundle; the design needs copy-or-freeze semantics, which Q7/Q8 do not currently name.


### Lane: projection (23 modes)

**[medium] Serializer throw on unsupported values (BigInt, revoked Proxy)**
- Stage: projection at capture
- Mechanism: JSON.stringify throws TypeError on BigInt; a property read on a revoked immer Proxy (a leaked draft reachable from Zustand/xstate context or an event payload) throws mid-walk. The hazard concentrates in the xstate/Zustand/custom buckets — MQTT wire-1 payloads are post-JSON.parse and cannot contain these types.
- Effect: The entry is lost at capture; if the throw is not contained it propagates into the host seam (see the in-band containment mode).
- Owner: partial:Q3 — the hazard class is named but BigInt/proxy-revocation are not, and nothing requires the chosen serializer to tolerate every ECMAScript value
- Rationale: Q3: xstate context and Zustand state 'can hold actor refs, functions, and cycles that JSON.stringify throws on or drops silently' — the throw class is acknowledged; the specific value types and an acceptance test for serializer totality are not.

**[high] Unmarked serializer-level fidelity loss (type coercion and depth/breadth elision)**
- Stage: projection at capture
- Mechanism: Two mechanisms, one gap. (a) JSON semantics serialize Map/Set to {}, drop undefined and Symbol-keyed properties, coerce NaN/Infinity to null and Date to string — a Zustand store using Map/Set projects to empty husks that pass the byte meter (they are tiny) and any schema check. (b) safe-stable-stringify's maximumDepth/maximumBreadth — Q3's named off-the-shelf shape — replaces elided content with in-band strings ('[Circular]', '... N more items') indistinguishable from genuine string values.
- Effect: The bundle contains well-formed but wrong evidence with drop counters at zero; at replay it presents as a wrong value rather than a refused one — the exact HAR anti-pattern RD-5 exists to prevent, arising one layer below where RD-5 is applied. RD-9's 'complete starting point' can be silently false.
- Owner: partial:Q3 — the 'drops silently' class is named, but no question requires serializer-level loss to carry an RD-5-style structured marker
- Rationale: Q3 prescribes the bounded serializer; Q12's RD-5 prescribes {truncated, originalSize} markers but only for byte-cap truncation, and RD-10 only for redaction. No plan text connects serializer elision/coercion to the marker requirement.

**[medium] Projection/scrubber failures invisible in drop accounting**
- Stage: projection at capture
- Mechanism: Q2's accounting clause enumerates 'every eviction and truncation'; an entry lost because the projection or scrubber threw is neither. A scrubber broken by an app refactor can fail on every entry of a bucket indefinitely with all counters reading zero.
- Effect: 'A capture that silently thinned' — the outcome Q2 itself declares worse than saying so — via a loss path its own accounting does not count.
- Owner: partial:Q2 — drop accounting is owned but enumerated as eviction+truncation only; projection-error counting is unassigned
- Rationale: Q2: 'every eviction and truncation must be countable in the bundle itself, because a capture that silently thinned is worse than a capture that says so.' Q6's generic 'drop counters' could absorb projection errors, but nothing says they are drops.

**[high] Scrubber/projection throw escapes into an in-band tap**
- Stage: projection at capture
- Mechanism: Wire-1 throw containment is verified (I12) and Q11 covers the recorder's own throw reaching onerror. But the HTTP tap wraps the orval mutator / FetchLike adapter — in-band on the app's call path, not a passive listener — so a projection throw there rejects the app's real HTTP request; and throw containment for an xstate system.inspect() observer is verified nowhere in the plan.
- Effect: The recorder degrades the app — Q11's explicitly forbidden outcome — through the one tap where capture sits inside the app's own request path, and possibly through the actor system.
- Owner: partial:Q11 — the principle and net-loop protection are owned; the in-band wrapper throw and inspect-observer containment are absent from Q11's enumerated hazards and from Q15's browser-lane list
- Rationale: Q11 enumerates: shared-dispatch shedding, self-capture of the report POST, net re-trigger on the recorder's own throw ('I12 covers the boundary side but onerror sees everything'), never report through itself. The in-band HTTP wrapper and xstate observer are not in the list; Q11's failure-bias sentence covers the requirement but no mechanism.

**[medium] Capture-time serialization executes app code (getters, Proxy traps, toJSON)**
- Stage: projection at capture
- Mechanism: The serialize walk invokes property getters, Proxy traps, and toJSON on live app objects inside 0060's shared dispatch turn / 0070's one-JS-turn pipeline. A computed getter can be expensive, can throw, or can mutate state — the 'passive observer' actively executes observed-object code at capture time.
- Effect: Latency spikes and side effects attributed to the recorder; a mutating getter corrupts both the app and the evidence being taken of it.
- Owner: partial:Q3 — projection design and cost-testing are owned, but cost is framed as stringify throughput; getter/toJSON execution is not named as a hazard anywhere
- Rationale: Q3's cost evidence is JSON.stringify microbenchmarks on inert objects; its hazard list (actor refs, functions, cycles) is about value shape, not about the walk executing code. No question requires the projection to guard against live-object traps.

**[high] Projection cost paid before any bound applies (pathological large entry)**
- Stage: projection cost / metering
- Mechanism: The meter runs 'once at capture on the already-serialized record' (Q2), so a pathological 5 MB payload pays the full serialize+TextEncoder walk (ms-scale on device hardware) inside the dispatch turn before truncate-or-refuse can act — at burst rate, repeatedly. maximumDepth/maximumBreadth bound structure, not string-valued field length, so a single huge string field passes every structural bound.
- Effect: The recorder blows Q11's per-event latency budget — causing shedding for every consumer — for entries the ring will immediately truncate or refuse: full cost, no evidence.
- Owner: partial:Q2 — the oversized-entry policy is owned but placed after serialization; no question owns a pre-serialization size guard
- Rationale: Q2 asks 'what happens when a single entry exceeds its bucket's budget (truncate... or refuse)' — a post-hoc decision. Q11 names the latency constraint and intake item a collects worst-case payload sizes, but no question converts either into a guard that runs before the cost is incurred.

**[high] Recorder-induced shedding during the incident**
- Stage: projection cost / host seam
- Mechanism: A slow capture listener in 0060's shared dispatch turn causes shed-oldest (bound 256) for every consumer, so the app itself loses live messages precisely during the anomaly worth recording.
- Effect: App degradation plus evidence loss at the worst possible moment.
- Owner: Q11
- Rationale: Owned verbatim: 'capture runs inside 0060's shared dispatch turn — a slow listener causes shedding for every consumer (bound 256, shed-oldest), so the capture budget per event is the recorder's hardest latency constraint'; Q15's spike measures projection cost and shedding against the real dispatch path. Coverage evidence.

**[medium] Inline cost figures measure the wrong operand**
- Stage: plan-level (cost evidence)
- Mechanism: The plan's 0.44–17 µs numbers are bare JSON.stringify (+TextEncoder); the actual per-event work is safe-stable-stringify (measurably slower than native), plus a scrubber path-walk, plus two clock reads, plus metering — plausibly several times the quoted figure before the 10× device derate is applied.
- Effect: The '~0.1–0.25 % of one core' claim underpinning eager projection as 'the leading hypothesis' understates the composed cost; a spike that re-runs only bare stringify on device hardware would satisfy the verification note's letter and validate nothing.
- Owner: partial:Q15 — the spike owns measuring 'projection cost... against 0060's real dispatch path', but the plan's caveat flags proxy hardware only, never workload composition
- Rationale: Survey verification notes: 'Every measured number in this plan is proxy hardware' — hardware is the only stated confound. Nothing requires the spike's operand to be the full composed projection (safe serializer + scrubber + clocks + meter).

**[high] Torn ring snapshot at trigger**
- Stage: trigger / bundling seam
- Mechanism: Q7's protocol is 'snapshot the ring indices, then bundle async'. A ring overwrites slots in place, so during async bundling at ~50 msg/s ingress the snapshotted index range is overwritten and the bundle reads post-trigger entries (or a torn mix) as pre-trigger history. Because Q3's entries are immutable serialized strings, the safe variant — copy the entry references, not the indices — is O(n) pointer copies, but the plan never draws that distinction.
- Effect: The bundle silently presents wrong history; no drop counter can catch it because nothing was evicted — the region was overwritten under the snapshot.
- Owner: partial:Q7 — the trigger protocol is owned and a mechanism is named, but the named mechanism is the unsafe variant and no question owns snapshot consistency against concurrent eviction
- Rationale: Q7: 'what minimal synchronous work the net handler does (snapshot the ring indices, then bundle async)' — the literal text prescribes index snapshotting. Q8's post-trigger window makes continued ingress during bundling the designed-in normal case, sharpening the race.

**[high] Pair-at-completion HTTP capture loses in-flight exchanges**
- Stage: capture model / record immutability
- Mechanism: Q4's HTTP tap records 'post-validation pairs' — an entry exists only when an exchange settles — so a request still pending at trigger time (often the hang being reported) was never captured at all. RD-4 requires an in-flight entry to say so, which pair-capture structurally cannot. Splitting into a request-record plus an outcome-record collides with Q3's immutable eager-serialized records and needs a correlation id that no RD reserves — while HAR projectability (Q12) needs the pairing reassembled.
- Effect: The most incriminating exchange is absent from the bundle, or the record model must break immutability / invent an unreserved correlation key to satisfy RD-4 and HAR at once.
- Owner: partial:Q4 — the tap layer is owned and RD-4 states the requirement, but the two-phase capture mechanism reconciling immutability, correlation, and HAR pairing is owned by no question
- Rationale: Q4: 'wrap the caller-owned orval mutator / fetcher (post-validation pairs...)'. Q12 RD-4: 'an entry in flight at trigger time must say so'. The two are in tension and neither question's text notices; RD-1 sequence numbers order entries but do not pair them.

**[medium] Sibling-listener mutation before capture**
- Stage: capture timing / mutation window
- Mechanism: Wire-1 payloads are shared live objects with 'no freeze/clone of payloads... specified anywhere' (sweep finding); listeners run in attach order. If the recorder attaches after an app consumer that mutates the payload in place, the projection faithfully serializes post-mutation state — evidence differing from what other consumers saw at delivery.
- Effect: Wrong evidence with no marker. Serialize-at-capture bounds staleness to within the dispatch turn but not across sibling listeners in the same turn.
- Owner: partial:Q3 — serialize-at-capture is owned as the answer to the shared-live-object finding, but recorder attach-order relative to mutating consumers is undecided
- Rationale: The sweep states the shared-object fact and Q3 answers it with eager projection; Q4 owns 'at which layer's view of the traffic' between layers, but ordering within wire-1's listener list appears nowhere in the plan.

**[medium] No fallback if eager projection fails its cost test**
- Stage: plan-level (Q3 answerability)
- Mechanism: Q3 says 'test it rather than assume it', and the sweep independently establishes that capture-by-reference is unsafe on every tap. If the device-hardware test fails, both known shapes are excluded and no third shape (cheap structural clone at capture with deferred serialization, sampling, per-bucket eagerness) is scoped anywhere in the plan.
- Effect: Q3 becomes unanswerable as posed, or the report improvises an unsurveyed capture architecture at writing time — the exact outcome a survey plan exists to prevent.
- Owner: partial:Q3 — the falsification test is owned; the contingency if it falsifies is not
- Rationale: Q3: 'Eager projection... is therefore the leading hypothesis, not a luxury' and 'Test it rather than assume it'. The plan brands eager projection a hypothesis but assigns no question the branch where the hypothesis fails while by-reference remains forbidden.

**[high] Redaction bypass for non-bucket bundle content**
- Stage: scrubbing / redaction
- Mechanism: Q13 applies redaction rules 'per-bucket at projection time', but the bundle also carries the trigger's Error message and stack (free text, notorious PII carriers), the config snapshot, and quarantined raw/invalid payloads riding along at trigger time (Q4) — none of which pass any bucket's projection scrubber. Quarantine content is precisely the unvalidated traffic the app never accepted.
- Effect: PII/sensitive data leaves the device in violation of intake-item-b constraints, through exactly the paths the redaction design structurally does not cover.
- Owner: partial:Q13 — 'whose rules, applied where' is owned but answered as per-bucket projection; no question assigns a scrub point to envelope-header fields or ride-along evidence
- Rationale: Q13: 'apply per-bucket at projection time (capture-time redaction is irreversible — RD-10 marks it)'. Q9 puts 'trigger reason and stack' in the header; Q4 owns how quarantined evidence rides along but says nothing about scrubbing it. The gap sits between the three questions.

**[medium] Mixed clock provenance for ride-along evidence**
- Stage: clock acquisition
- Mechanism: Quarantine-ring entries were stamped (or not stamped) by 0060 at their original capture; the recorder only reads them at trigger time. Stamping them with recorder-read-time clocks misdates them by up to the ring's whole retention window; passing 0060's own stamps through mixes clock domains inside one bundle, violating RD-3's single shared domain.
- Effect: Cross-bucket ordering between quarantined evidence and bucket entries is wrong or unestablishable at analysis and replay time.
- Owner: partial:Q4 — Q4 owns how quarantined evidence rides along and RD-2/RD-3 define the target clock format, but timestamp provenance for trigger-time-read evidence is addressed by neither
- Rationale: Q4: 'how quarantined evidence rides along at trigger time'; Q12 RD-3: 'one shared clock domain across buckets'. Neither text notices that ride-along data by construction was not captured under the recorder's clock discipline.

**[low] Wall-clock step during capture**
- Stage: clock acquisition
- Mechanism: RAM-disk devices plausibly boot with a wrong clock and NTP-step later, so wall epoch-ms alone would reorder and misdate entries mid-recording; Firefox additionally coarsens performance.now() to ~1 ms, making same-ms ties routine.
- Effect: Contained by design: RD-1 sequence numbers break ties, RD-2's dual clocks (wall plus monotonic offset from one shared origin, deltas derived at replay and never stored) keep intra-bundle ordering step-immune, RD-3 fixes one domain. Residual is only bundle-to-server-log correlation across a step, which is out of scope.
- Owner: Q12
- Rationale: RD-1/RD-2/RD-3 own this precisely, with prior-art citations ('timestamps cannot break same-ms ties'; Playwright's wallTime+monotonicTime pattern). Coverage evidence — the clock-acquisition design is the best-covered part of this stage group.

**[medium] Double serialization at bundle assembly**
- Stage: bundle assembly / serialization
- Mechanism: Ring entries are pre-serialized JSON strings (Q3); a JSON bundle (Q9) must therefore either re-parse every entry to compose the body (parsing tens of MB — seconds even in a worker, after structured-cloning the strings there), embed entries as escaped strings (double-encoded payloads, ~5–15 % inflation, backend double-parse, and the HAR-projectability tooling of Q12 sees strings, not objects), or hand-splice raw JSON text outside any serializer.
- Effect: A trigger-time cost spike when the app is already unhealthy, or a bundle format that fights its own vendored OpenAPI schema validation (D-0006 validates a payload of double-encoded strings how?).
- Owner: partial:Q9 — bundle format, worker-side gzip, and the two-budget split are owned; the entry-embedding mechanics forced by Q3's pre-serialized entries are named by neither Q3 nor Q9
- Rationale: Q9's format sub-questions cover 'JSON with worker-side CompressionStream gzip', size ceilings, and budgets; the interaction with Q3's stored representation — the only three possible embeddings, each with a distinct cost — appears nowhere.

**[medium] Reentrant capture loop through the log bucket**
- Stage: projection / self-interference
- Mechanism: A projection or scrubber that logs a diagnostic (truncation warning, scrub-rule hit) through the 0050 facade feeds the log bucket's sink; the log bucket's own projection truncates or scrubs and logs again — unbounded same-turn recursion. Distinct from Q11's three named loops (self-capture of the report POST, net re-trigger, reporting through itself).
- Effect: Stack overflow or hang inside a dispatch turn — app degradation, Q11's forbidden outcome.
- Owner: partial:Q11 — self-interference is owned and three loop classes are enumerated; the record-during-projection reentrancy class is not among them
- Rationale: Q11's hazard list is explicit and specific, which is what makes the omission checkable: the log-bucket feedback path exists only because Q4's optional log bucket taps the facade the recorder's own internals would naturally log through.

**[medium] Adopted core's normalizer conflicts with the RD fidelity contract**
- Stage: projection under adopt posture
- Mechanism: Sentry's event/breadcrumb pipeline runs its own normalize (default depth 3, '[Object]'/'[Array]' substitution, 2048-char message truncation) — unmarked loss, structurally identical to the RD-5 anti-pattern. Under adopt+wrap, either that normalization layer is replaced with the owned projection (which is most of the build posture's serialization work anyway) or its output ships RD-violating records.
- Effect: The adopt posture's priced benefit silently shrinks by the whole projection layer, or the wrap ships records that break the replay reservations the track pays to keep open.
- Owner: partial:Q14 — Q14 prices envelope lock-in, count-based bounding, and the one-global-ring problem, but not normalizer fidelity against Q12's reservations
- Rationale: Q14 names Sentry's costs as 'Sentry's envelope protocol as the wire format... count-based bounding (byte accounting is custom regardless), and one global ring' — the serialization/normalization layer is absent from the bill, and Q12's 'priced in' clause covers schema ownership, not projection fidelity.

**[medium] JSON-only projection hollows the replay reservations**
- Stage: projection fidelity vs replay door
- Mechanism: The reserved xstate replay data (initial persisted snapshot, ordered external events) round-trips through Q3's serializer; events carrying Date/Map/class instances come back as strings and husks, and transition()-replay with coerced events diverges wherever a guard or assign inspects the rich type. The candidates list flags the tension (devalue for 'rich-type round-tripping if the replay door wants it'; 'pick one serializer, not both') but no question ties the serializer choice to an RD acceptance check.
- Effect: The door Q12 pays to hold open is closed silently by a serializer default, discovered only when a future replay track finds the captures unusable — the definition of an unrecoverable-later loss.
- Owner: partial:Q12 — the reservations are owned as data-model properties, but their dependence on Q3's serializer fidelity is stated nowhere
- Rationale: Q12 reserves 'ordered external events' and names the pure transition() API as the preserved mechanism; Q3 owns the serializer. The link — reserved data is only as replayable as the projection is faithful — is in neither question's text, only implicit in the candidates section.

**[medium] UTF-8 meter systematically under-counts resident RAM**
- Stage: metering / memory accounting
- Mechanism: Q2 fixes the meter as serialized UTF-8 bytes, but if the ring holds JS strings the resident cost is engine string representation — up to ~2× the metered figure for two-byte strings, plus per-entry index/metadata (seq, clocks, topic) that at few-hundred-byte entries is a comparable overhead the meter never sees. Q3's 'the ring hold only strings/bytes' contains the fix (store TextEncoder output as Uint8Array, making meter equal heap) but no question decides strings-vs-bytes or names the consequence.
- Effect: A '50 MB' capture can occupy materially more RAM on a device where RAM is also the OS's disk — eroding the envelope the charter makes the design's first constraint, invisibly to the recorder's own byte totals (Q6's health block).
- Owner: partial:Q2 — the meter choice is owned and the heap divergence acknowledged ('1–2× UTF-16 code units... unmeasurable'), but no question owns calibrating the envelope against resident RAM or deciding the stored representation
- Rationale: Q2 picks UTF-8 as 'the honest meter' precisely because heap is unmeasurable — but honesty about measurability is not a decision about the gap between metered and resident bytes; the strings-vs-bytes storage decision that closes the gap is named in Q3's text only as an unexamined 'strings/bytes'.

**[medium] Large legal entry displaces a bucket's history**
- Stage: metering / eviction
- Mechanism: A 5 MB entry that fits under its bucket's byte cap still evicts minutes of few-KB context under evict-oldest — one item replaces the history that made it interpretable.
- Effect: Bundle arrives byte-legal but context-poor; drop counters do record the eviction wave, so the thinning is at least visible.
- Owner: Q2
- Rationale: Owned: Q2 asks for eviction policy justification ('evict-oldest within a bucket is the presumptive policy — state what, if anything, justifies another'), the single-entry-exceeds-budget rule, and drop accounting; intake item a supplies the worst-case payload sizes and truncation defaults that decide whether a per-entry cap below the bucket cap is needed. Coverage evidence.

**[low] Last-gasp summary must exist pre-serialized**
- Stage: serialization / last-gasp path
- Mechanism: A dismissal-time handler cannot await CompressionStream and has only sendBeacon's 64 KiB shared quota on floor Firefox, so any last-gasp summary must already exist as serialized bytes before the trigger — which Q3's eager-serialized ring is the only design that provides.
- Effect: Design coherence: eager serialization is what makes any last-gasp path feasible at all; a deferred-projection fallback (see the eager-fails mode) silently forfeits it.
- Owner: Q9
- Rationale: Owned: Q9's two-budget split specifies the last-gasp path as '≤ 64 KiB, sendBeacon-only on floor Firefox, pre-serialized, uncompressed'. The dependency on Q3's answer is implicit but the binding constraint is stated. Coverage evidence.

**[low] Config snapshot cannot serialize its own projection/scrubber fields**
- Stage: envelope / config snapshot
- Mechanism: Q6's per-bucket config includes function-valued fields (projection, scrubber); RD-7's config snapshot serializes them to nothing or a name, so the bundle cannot say which projection/scrubber version produced its records.
- Effect: Analysis and replay cannot distinguish records produced under different scrubber versions; RD-8 versions app-bucket schemas but nothing versions built-in projections.
- Owner: partial:Q9 — the envelope's config snapshot is owned; serializability of function-valued config and a projection-version identifier are unaddressed
- Rationale: Q9 lists 'config snapshot' in the header and Q12 RD-7 reserves it; Q6 defines config as containing 'projection/scrubber' — functions. No text reconciles the two by requiring projection identity to be a serializable id+version.

**Lane notes**: Stage group: projection and serialization. No fully UNOWNED mode survived verification against the plan text — Q2/Q3/Q11 were written from the grounding sweep and carry most of this stage's load, so honest verdicts cluster at owned and partial. The recurring partial pattern is layer displacement: a requirement is stated at one layer while the same hazard recurs unnamed at another (RD-5 markers exist at the byte-cap layer but not the serializer layer; throw containment is verified at wire-1 but not at the in-band HTTP wrap or the xstate inspect observer; redaction is applied at bucket projection while header stacks and quarantine ride-along bypass it; the byte bound applies after the serialization cost is already paid). The four highest-leverage partials for the adjudicator: (1) torn ring snapshot — Q7's own text prescribes the unsafe mechanism ('snapshot the ring indices'); (2) redaction bypass for header/quarantine content — a PII-egress path against intake item b; (3) pair-at-completion HTTP capture vs RD-4's in-flight requirement — a live contradiction between Q4 and Q12; (4) unmarked serializer-level loss (Map/Set husks, depth elision) — evidence that is wrong rather than absent, undetectable by drop counters. One plan-level answerability risk: Q3 brands eager projection a testable hypothesis but scopes no fallback if it fails while capture-by-reference stays forbidden. Files read in full: /home/nn/Projects/app-tooling-research/tracks/0160-flight-recorder/research-plan.md, /home/nn/Projects/app-tooling-research/facts/app-profile.md.


### Lane: buffering (23 modes)

**[high] Global-envelope eviction starves the quiet bucket**
- Stage: eviction (cross-bucket)
- Mechanism: If a global byte envelope binds (Q2 leaves per-bucket vs global vs both open), some bucket must surrender bytes. Evict-oldest applied across buckets deterministically victimizes the quietest bucket, whose entries are the oldest: MQTT at ~50 msg/s continuously refreshes its share while sparse xstate/log entries age and are evicted first. The same mode appears in the adopt posture via Sentry's single global breadcrumb ring.
- Effect: The forensically rare context (state-machine history, log lines) is exactly what is missing from the bundle; the noisy bucket's redundant traffic survives. Evidence loss biased against the data an error report needs most.
- Owner: partial:Q2 — cross-bucket victim selection is unasked
- Rationale: Q2 asks 'per-bucket byte caps, a global envelope, or both, and which wins when they disagree' and scopes eviction 'within a bucket' ('evict-oldest within a bucket is the presumptive policy'). Which bucket pays when the global envelope binds is never posed. Q14 names the adopt-posture variant ('one global ring (the per-bucket taxonomy must be encoded or split across attachments)'), so the adopt side is priced; the owned-design side is not.

**[high] Substring truncation retains the parent string (SlicedString/dependent-string)**
- Stage: byte accounting (truncation path)
- Mechanism: Truncating an oversized entry via str.slice(0, N) creates a V8 SlicedString (SpiderMonkey dependent string) that retains the entire parent flat string. A 12 MB REST body truncated to a 4 KB record pins ~12 MB of heap for the entry's full ring lifetime while the meter records 4 KB. Fires preferentially on the largest payloads — exactly the ones truncated — so divergence is unbounded, not the 1–2x encoding factor Q2 acknowledges.
- Effect: A metered '10 MB' ring can retain hundreds of MB of real heap on a RAM-disk device. Q15's property tests ('never exceeds cap') run against metered bytes and pass while the physical envelope is violated by orders of magnitude. Mitigation (force a copy; store TextEncoder output) is cheap but must be asked for.
- Owner: UNOWNED
- Rationale: Searched the plan for flatten/copy/retention semantics: absent. Q2's heap acknowledgment ('engine-dependent (1–2x UTF-16 code units)') covers only the bounded encoding factor. Q3 requires 'bounded, serialized, immutable' records but says nothing about allocation provenance of truncated strings. RD-5 marks truncation in-band but does not touch how the truncated string is produced.

**[high] Bundle assembly memory spike at trigger time**
- Stage: trigger/bundling (memory)
- Mechanism: At trigger: the index snapshot pins up to a full envelope of immutable entries while rings continue capturing to cap (Q8 keeps capture running); JSON assembly materializes another envelope-sized body string; handing it to the gzip worker structured-clones it. Transient footprint ~2–3x the envelope (up to ~150 MB at the 50 MB end) — at the moment the device is plausibly already under the memory pressure that caused the trigger.
- Effect: Renderer OOM kill during bundling destroys the evidence, and per Q7 that death class produces no report at all on the Firefox arm. The recorder's collection step raises the probability of exactly the invisible failure it exists to document.
- Owner: partial:Q11 — umbrella covers 'not become the incident' but enumerates only latency/loop hazards
- Rationale: Q11's enumerated hazards are dispatch-turn latency, self-capture loop, net re-trigger, report-through-itself — no memory-spike item. Q9 chooses 'worker-side CompressionStream gzip' with no peak-memory sub-question. Q7's 'snapshot the ring indices, then bundle async' names the mechanism that causes the pinning without costing it. Intake f.3 requests device RAM, which contextualizes but does not design for the spike.

**[medium] Async bundling races continued capture/eviction over the snapshot**
- Stage: buffering (snapshot consistency)
- Mechanism: Q7 fixes 'snapshot the ring indices, then bundle async' — indices into a live ring. If storage is reused (a byte-ring over an ArrayBuffer, the natural shape for byte budgeting), captures arriving during async bundling overwrite slots the snapshot references; the bundler reads interleaved new bytes. Alternatively eviction must stall until the bundle seals, breaking the byte bound during exactly the post-trigger burst.
- Effect: Bundle contains corrupted or wrong-epoch entries with correct-looking metadata, or the ring temporarily exceeds its cap. Either a lying report or an unbounded interval.
- Owner: partial:Q7 — snapshot mechanism named, pin-vs-copy-vs-stall consistency unasked
- Rationale: Q7's sub-question ends at 'snapshot the ring indices, then bundle async'; nothing in Q7, Q8, or Q2 poses what protects snapshotted entries from concurrent eviction/overwrite. Q3's immutable-record hypothesis makes the immutable-string variant safe for correctness (at the memory cost in the bundling-spike mode) but the plan never conditions the snapshot design on that choice.

**[medium] Per-entry index/metadata bytes are outside the meter**
- Stage: byte accounting (metadata)
- Mechanism: Q2 meters 'once at capture on the already-serialized record'; Q3's ring holds 'strings/bytes plus a small index'. But RD-1 (sequence), RD-2 (two clocks), RD-4 (direction/outcome), RD-6 (mime/encoding) mandate per-item metadata living in that index, plus per-string object headers and array slots. For small entries (xstate action events ~100–200 B serialized) metadata is comparable to payload.
- Effect: A bucket that meters full can physically occupy 30–100% more than its budget; 'small index' is asserted, never budgeted. Worst for high-count small-entry buckets — the xstate and log buckets.
- Owner: partial:Q2 — the meter is defined; whether index bytes count against any budget is unasked
- Rationale: Q2's meter definition ('serialized UTF-8 bytes... metered once at capture on the already-serialized record') structurally excludes the index; no sub-question in Q2, Q3, or Q6 mentions overhead accounting. Q6's health block exposes 'current byte totals' which would report the same under-count.

**[medium] Metered UTF-8 cap vs physical-RAM envelope, bounded-factor drift**
- Stage: byte accounting (denomination)
- Mechanism: The 10–50 MB envelope is denominated in device RAM (charter, RAM-disk section); the meter is serialized UTF-8. JS strings store as UTF-16 (or latin1) plus headers, so honest metering under-counts physical heap by an engine-dependent 1–2x even before retention pathologies.
- Effect: A recorder configured to the envelope's top (50 MB metered) legitimately occupies ~100+ MB of real RAM on a device where RAM is the OS's disk. The envelope is exceeded while every invariant holds.
- Owner: partial:Q2 — divergence acknowledged, no derate decision required
- Rationale: Q2 states 'heap bytes are engine-dependent (1–2x UTF-16 code units) and unmeasurable cross-browser' — the fact is owned. No sub-question asks the report to translate the metered cap into a physical-RAM claim (e.g., set metered cap = envelope/2), so the report can answer Q2 fully and still ship a config that violates the charter envelope.

**[medium] Eviction/accounting cost at permanent saturation runs in the dispatch turn**
- Stage: eviction (saturation cost)
- Mechanism: The envelope holds minutes at ~50 msg/s, so after warm-up the ring is always full and every capture evicts; variable-size entries mean one insert can evict several entries, with byte-total bookkeeping each time. This runs inside 0060's shared dispatch turn, where a slow listener sheds for every consumer (bound 256, shed-oldest). A naive structure (array shift, byte re-summation) makes the at-cap regime the expensive one.
- Effect: Steady-state capture cost is higher than the projection-only figures the plan carries; shedding caused by the recorder thins every consumer's traffic, not just the recorder's.
- Owner: partial:Q15 — spike measures 'projection cost and shedding', not at-cap eviction cost
- Rationale: Q11 owns the latency-budget constraint and Q15 owns the spike, but Q15's scope sentence names 'projection cost and shedding behaviour against 0060's real dispatch path' — a spike run with filling rather than saturated rings satisfies it while validating the wrong regime. Nothing requires the measurement at cap.

**[medium] Sustained string churn drives GC pauses on the device**
- Stage: buffering (GC behavior)
- Mechanism: 50/s KB-scale strings allocated and released continuously for days: survivors promote to old space, churn drives frequent minor GCs and periodic major GC/compaction whose pauses land inside the dispatch turn and 0070's one-JS-turn pipeline; multiplied on the Atom/ARM-class CPU intake f.1 asks about. Fragmentation from varied-size entries raises the footprint above live bytes between compactions.
- Effect: Recorder-attributable jank and shed events in steady state — the app degrades slowly rather than at trigger time, the failure bias Q11 declares unacceptable.
- Owner: partial:Q15 — no soak/duration dimension in the spike scope
- Rationale: The plan's cost evidence is per-operation micro-benchmarks ('~0.44 µs... ~17 µs'); GC behavior only manifests over sustained runs. Q15's spike list (projection cost, shedding, byte-invariant properties, browser-lane claims) names no soak measurement; Q11 owns the constraint but not the evidence path.

**[medium] Envelope collides with real device memory headroom**
- Stage: byte accounting (envelope vs device)
- Mechanism: The recorder permanently occupies its envelope once warm (rings fill and stay full) on a device whose OS, browser, app, and 'disk' all share RAM. If free headroom is small, the constant 10–50 MB tax plus the trigger-time spike push the device toward OOM — and the failure being recorded may itself be memory pressure.
- Effect: The recorder raises baseline pressure fleet-wide; worst case it converts recoverable pressure into renderer kills that (Q7) produce no report on the Firefox arm.
- Owner: partial:Q11 — fact requested (intake f.3), no question owns a headroom verdict or runtime response
- Rationale: Verified against the intake file: item f.3 explicitly asks 'How much total RAM do the devices have, and what else shares the RAM disk? Contextualizes the 10–50 MB envelope' — the fact is requested, so this is not UNOWNED. But no key question consumes it as a design input (Q2's arithmetic starts from payload sizes, item a), and no question owns whether the recorder responds to pressure at runtime or how the report justifies the envelope against measured headroom.

**[medium] Per-tab recorder multiplies the envelope and the nets**
- Stage: buffering (multi-tab)
- Mechanism: The recorder is page-scoped. Two tabs of the app — single-connection is 'stated as intent, not as an enforced property' per the app profile — each hold up to the envelope and each arm onerror/unhandledrejection, so device RAM cost is N x 10–50 MB and one device-level failure fires N triggers producing N bundles. Q7's dedup/cooldown is in-page state and cannot see the sibling tab.
- Effect: Envelope silently doubled on the device; duplicate bundles inflate backend traffic and mislead absence-based detection (Q7's compensation) about how many incidents occurred.
- Owner: UNOWNED
- Rationale: Searched the plan for tab/multi-tab: delivery's 'until sent or the tab dies' (Q10), the tab-crash window, and the 0150 reservation sentence — 'the shared origin/schema/eviction/multi-tab decisions 0150's plan reserves apply to this track's store too' — which is explicitly conditional on Q10 adopting durable parking and scoped to the IndexedDB store. No question addresses the in-RAM envelope's per-tab multiplication or cross-tab trigger dedup.

**[medium] Structure-unaware truncation yields unparseable entries or corrupts the bundle**
- Stage: byte accounting (truncation mechanics)
- Mechanism: Cutting a serialized JSON record at a metered byte boundary produces invalid JSON and can end mid-code-point or on a lone surrogate (TextEncoder substitutes U+FFFD, shifting byte counts). If bundle assembly splices pre-serialized entries verbatim into the body — the natural zero-copy design given capture-time serialization — one truncated entry makes the entire bundle unparseable.
- Effect: Worst case the whole report is undeliverable or unreadable at the backend, not just one entry; best case truncated entries are dead weight that RD-5 marks but nothing can interpret.
- Owner: partial:Q2 — truncate-vs-refuse owned; truncation mechanics and entry-embedding format unasked
- Rationale: Q2 poses 'truncate with markers per question 12's RD-5, or refuse'; RD-5 owns the marker shape. Neither Q2 nor Q9's format sub-questions (JSON, gzip, ceilings, two budgets) asks how a truncated string stays embeddable — re-escape vs splice vs NDJSON — or requires UTF-safe cut points.

**[medium] Upstream shedding is invisible to the recorder's drop counters**
- Stage: byte accounting (drop attribution)
- Mechanism: 0060's dispatch queue sheds-oldest at bound 256 before events reach record(); anything shed there was never captured, so the recorder's per-bucket drop counters truthfully read zero while the retained window is thinned upstream. RD-9's 'how many items dropped before the window' stamp is then confidently wrong.
- Effect: The bundle claims a complete window it does not have; a debugging session trusts a gap-free MQTT history that is missing exactly the burst that preceded the failure.
- Owner: partial:Q9 — upstream counters ride in the header, window-correlation unasked
- Rationale: Q9's envelope header includes '0070's six IngressStats counters and wire-2 depths' — the compensating evidence exists in-bundle. But cumulative counters cannot say whether shedding intersected the retained window; no question requires capturing counter deltas at window edges or reconciling them with RD-9 stamps. Q11 owns not causing shedding, not accounting for it.

**[medium] Quarantine ride-along bytes belong to no budget**
- Stage: trigger/bundling (quarantine ride-along)
- Mechanism: Q4 has the MQTT bucket decide 'how quarantined evidence rides along at trigger time'. The quarantine ring is 0060's: count-bounded (100), not byte-bounded, holding raw invalid payloads of unbounded individual size, never passed through the recorder's at-capture meter. Bundling 100 raw payloads adds unmetered megabytes at trigger time.
- Effect: The bundle blows past the size ceiling negotiated under Q9/item c or the envelope-derived expectations; the overweight component is the one no counter in the health block describes.
- Owner: partial:Q4 — ride-along decision owned; its byte accounting assigned to no budget
- Rationale: Q4 poses the ride-along question and Q9 owns bundle-size ceilings, but Q2's meter is defined 'once at capture on the already-serialized record' — quarantine items were never captured by the recorder, so they fall structurally outside the accounting scheme and no text bridges the gap.

**[medium] App-supplied projection for a custom bucket is slow or huge inside the dispatch turn**
- Stage: capture/projection (custom buckets)
- Mechanism: Q6 injects projection/scrubber per bucket as config; app code declares a custom bucket whose projection stringifies a large Zustand graph (~5 MB → milliseconds per event, extrapolating the plan's own 17 µs/12 KB figure) or returns a multi-MB string per entry. JS cannot preempt it; it runs inside 0060's shared dispatch turn and 0070's one-JS-turn pipeline.
- Effect: Shedding for every consumer (the Q11 hazard) caused not by the recorder's code but by injected config; the byte cap catches output size after the cost is already paid.
- Owner: partial:Q6 — projection injection owned; no constraint or measurement obligation on app-supplied projections
- Rationale: Q3's depth/breadth-bounded serializer bounds the built-in projections; Q6 defines the config slot and Q11 states the latency bias, but no question asks how the interface constrains, documents, or self-measures a hostile-cost app-supplied projection — the composition point where Q11's guarantee escapes the recorder's own control.

**[low] No field signal can detect actual-footprint envelope violation**
- Stage: byte accounting (field observability)
- Mechanism: performance.measureUserAgentSpecificMemory is Chromium-only behind COOP/COEP; performance.memory is deprecated (both stated in Q2). The Q6 health block exposes metered bytes and drop counters only, so the heap-divergence modes (encoding factor, slice retention, index overhead) are undetectable on the fleet, especially the Firefox arm.
- Effect: If metered-vs-physical drift occurs in production, nothing notices until devices misbehave; the report cannot honestly claim the envelope holds, only that the meter does.
- Owner: partial:Q6 — health block owns metered self-observation; stating footprint verification as an unverifiable residual is unasked
- Rationale: Q2 owns the measurement-impossibility facts; Q6 owns 'drop counters, current byte totals — the bundle's own health block'. Q15's 'states plainly which of its claims are unverified' is scoped to spike/browser-lane verification of the recommendation, not to runtime field observability, though it is the nearest hook.

**[low] Post-trigger capture evicts the lead-up it is about to seal**
- Stage: buffering (post-trigger window)
- Mechanism: Q8 keeps capture running for a window after the trigger. In a saturated ring every post-trigger entry evicts the oldest pre-trigger entry, so the aftermath overwrites the lead-up before the bundle seals — unless the snapshot pinned the pre-trigger entries, which is the bundling-spike trade. Whether window entries count against the bucket budget or a separate supplement budget is unasked.
- Effect: The bundle's cause-side history is shortened by exactly the window length, or memory doubles during the window; either way the default interacts with eviction in a way the report could ship without noticing.
- Owner: partial:Q8 — window semantics owned; the eviction/byte interaction with the unsealed bundle unasked
- Rationale: Q8 poses second-trigger behavior, delay-vs-supplement, and the default; none of its sub-questions touches what the window does to a full ring's pre-trigger contents. Q7's snapshot sentence is the implicit mitigation but no text connects them.

**[medium] Per-bucket vs global envelope enforcement ambiguity**
- Stage: byte accounting (enforcement design)
- Mechanism: Two enforcement schemes (per-bucket caps, global envelope) can disagree: buckets individually under cap while the sum exceeds the envelope, or a global cap starving configured bucket capacities.
- Effect: Without a decided winner the envelope is enforced by accident; with one, the design is deliberate. This is the mode the track exists to decide.
- Owner: Q2
- Rationale: Owned verbatim: 'per-bucket byte caps, a global envelope, or both, and which wins when they disagree'. Coverage evidence; the residual cross-bucket victim-selection gap is reported separately.

**[medium] A single entry exceeds its bucket's budget**
- Stage: buffering (oversized entry)
- Mechanism: One 20 MB REST body or MQTT payload arrives at a bucket with a 5 MB cap; storing it evicts everything and still does not fit.
- Effect: Either the bucket self-erases to hold one item, or the item is refused and the history has a silent hole.
- Owner: Q2
- Rationale: Owned verbatim: 'what happens when a single entry exceeds its bucket's budget (truncate with markers per question 12's RD-5, or refuse)'. One residual noted: Q2's drop-accounting sentence counts 'every eviction and truncation' — a refusal is neither, so refusal counting rides on interpretation; folded into the truncation-mechanics finding.

**[medium] An unbounded bucket is configurable**
- Stage: byte accounting (config validity)
- Mechanism: A bucket declared with no byte and no count cap grows without limit at ingest rate.
- Effect: Envelope violated by configuration rather than by code.
- Owner: Q6
- Rationale: Owned verbatim: 'which combinations are illegal and unrepresentable (a bucket with no bound; ...)'. Coverage evidence.

**[medium] Accounting drift between counters and ring contents**
- Stage: byte accounting (verification)
- Mechanism: Incrementally maintained byte totals (add on capture, subtract on evict) drift if any path — truncation, refusal, window supplement, snapshot pinning — forgets its update; drop counters miss an eviction path.
- Effect: The health block and RD-9 stamps lie; caps are enforced against a wrong total.
- Owner: Q15
- Rationale: Owned verbatim: 'Byte-accounting invariants (never exceeds cap; drop counters account for every eviction) are property-testable with the accepted fast-check lane.' Coverage evidence — with the caveat, reported separately, that these invariants quantify metered bytes, so they cannot catch heap-retention divergence.

**[medium] Adopted cores bound by count only and drop silently**
- Stage: buffering (posture pricing)
- Mechanism: Sentry slice(-max) with 2048-char truncation, Bugsnag/Rollbar hard-cap 100 — count bounds with unbounded per-item size, silent discard, no drop counters. The sweep confirmed no byte-budgeted ring exists on npm.
- Effect: An adopt posture that keeps the vendor ring inherits unbounded-byte and silent-drop behavior; byte accounting is custom work regardless of posture.
- Owner: Q14
- Rationale: Owned: Q14 prices Sentry's 'count-based bounding (byte accounting is custom regardless)' and the sweep section states 'Byte accounting against the 10–50 MB envelope is custom work under every posture (question 2)'. Coverage evidence.

**[low] The Boundedness criterion may not survive the gate**
- Stage: plan/rubric
- Mechanism: The tenth criterion is 'proposed, not adopted — a ruling for the go gate' under D-0023. If declined, no rubric criterion scores at-cap behavior: the plan itself states 'Runtime overhead scores steady-state cost, not behaviour at the cap'.
- Effect: Q14's equal-merit comparison under-weights the axis the track exists for; a silently-dropping adopted core scores the same as a loudly-bounded owned ring.
- Owner: partial:Q14 — comparison runs 'against the same rubric', whose boundedness axis is contingent on a ruling outside questions 1-15
- Rationale: The plan flags the contingency itself in the rubric section and routes it to the gate; the failure mode is the decline branch, for which no question provides a fallback weighting. Design-side coverage (Q2) is unaffected either way.

**[low] Drop counters overflow**
- Stage: byte accounting (counter width)
- Mechanism: Examined and dismissed: JS safe integers reach 2^53; at 50 events/s a per-bucket drop counter needs ~5.7 million years to overflow.
- Effect: None in any plausible deployment.
- Owner: Q2
- Rationale: Reported so the adjudicator sees the brief's item was checked, not skipped. Counter lifetime/reset semantics (cumulative vs per-window) are real and owned by Q2's drop-accounting sentence plus RD-9's 'stamps how many items dropped before the window' (Q12).

**Lane notes**: Stage group: buffering, byte accounting, eviction. Sources read in full: tracks/0160-flight-recorder/research-plan.md, facts/app-profile.md (MQTT + Environment), and intake/2026-08-22-0160-recorder-facts.md (read to verify ownership of hardware facts before claiming anything missing — this verification overturned one planned UNOWNED: intake item f.3 does request device RAM and names the envelope contextualization, so 'envelope vs device memory' is partial:Q11, not UNOWNED). Two UNOWNED findings survived text search: (1) substring-truncation parent-string retention (no flatten/copy language anywhere; Q2's 1-2x heap acknowledgment covers only the encoding factor, and Q15's metered-byte invariants would pass through the violation), and (2) per-tab multiplication of the in-RAM envelope and failure nets (the plan's only multi-tab language is the 0150-reservation sentence, explicitly conditional on Q10 adopting durable parking and scoped to that store). Recurring pattern for the adjudicator: everything denominated in metered bytes is well owned (Q2/Q6/Q15 form a strong core — enforcement, unrepresentable configs, property-tested invariants), while everything physical — heap retention, per-entry overhead, GC behavior, trigger-time peak memory, per-device multiplicity — is at best partially owned. The three high-severity modes (cross-bucket starvation under a global cap, slice-retention accounting blowout, trigger-time bundling spike) all sit in that metered-vs-physical seam. One dismissed worry recorded in-line (counter overflow) so the brief's checklist is visibly exhausted.


### Lane: triggers (24 modes)

**[high] Boundary net cannot be armed passively on React 18**
- Stage: failure nets — React error boundary arm
- Mechanism: The app runs React 18.3.1 (app-profile: 'React 19 not in play'), which has no root-level onCaughtError/onUncaughtError options (React 19 API). In production React 18, an error caught by an error boundary is not rethrown to window.onerror. So the charter-named 'React error boundaries' net only exists where the app mounts a recorder-supplied boundary component or hand-wires capture() into each componentDidCatch; every unwired boundary swallows its error class silently. Dev builds diverge (React's guarded-callback dev behavior surfaces caught errors to window listeners), so dev/jsdom testing shows coverage production does not have.
- Effect: A charter-named trigger class is silently absent for every boundary-recovered failure; the report can ship a 'net' design that is actually unenumerated per-boundary app work; the gap is invisible in dev testing.
- Owner: partial:Q7 — Q7 owns what each trigger can see, but nothing asks how a boundary net is armed on React 18, whether existing app boundaries must be enumerated and wired, or records that boundary-caught errors never reach window.onerror in production
- Rationale: Charter point 1 lists 'React error boundaries' among the armed nets; Q7's sub-questions cover chaining, dedup/cooldown, in-flight behavior, and sync work only. Intake item g requests 'any existing `onerror`/`unhandledrejection` handlers or reporting paths' — boundaries are neither handlers nor requested. No plan text mentions React version or boundary mechanics.

**[high] Index snapshot torn by continued capture during async bundling**
- Stage: trigger protocol — snapshot consistency
- Mechanism: Q7's own example answer — 'snapshot the ring indices, then bundle async' — retains positions, not records. Capture continues at ~50 msg/s during async bundling, and Q8's post-trigger window explicitly keeps buckets live before the bundle 'seals'. Ring eviction overwrites the oldest slots the snapshot indices reference before the worker copies them, and drop counters keep advancing after the header is drafted.
- Effect: Silently corrupt bundle on every trigger under load: the oldest pre-trigger evidence is replaced by post-trigger records, and header counters disagree with the body — breaking Q2's 'a capture that silently thinned is worse than a capture that says so' at the trigger seam.
- Owner: partial:Q7 — Q7 owns the minimal-synchronous-work decision but never asks how the sealed bundle's view is isolated from ongoing writes; its parenthetical example (indices, not references or copies) is unsafe under eviction; Q8's 'before the bundle seals' implies sealing semantics no question defines
- Rationale: Q7: 'what minimal synchronous work the net handler does (snapshot the ring indices, then bundle async)'. Q8: 'a configurable post-trigger window... before the bundle seals'. Neither question, nor Q2's drop accounting, asks about snapshot-vs-writer consistency.

**[high] Error loop produces a bundle storm**
- Stage: trigger protocol — storms
- Mechanism: A render/effect loop or promise-rejection retry loop fires the net once per iteration; each trigger snapshots, serializes, gzips tens of MB in a worker, and POSTs — CPU, transient RAM, and network amplification on a device whose OS shares the RAM.
- Effect: The recorder becomes the incident (Q11's stated unacceptable outcome) and the backend is flooded with near-identical bundles.
- Owner: Q7
- Rationale: Owned verbatim: 'trigger dedup and cooldown — an error loop must not produce a bundle storm'.

**[high] Recorder's own failures re-enter the nets**
- Stage: failure nets — self-trigger
- Mechanism: A projection/serializer throw, the gzip worker's unhandled error (dedicated-worker errors propagate to the parent window's error event when unhandled on the Worker object), or an unhandled rejection from the report POST fires onerror/unhandledrejection, which triggers a new bundle, whose construction fails the same way — a loop; the HTTP bucket additionally capturing the recorder's own POST compounds it.
- Effect: Trigger loop and storm; recursive self-capture; recorder degrades the app it observes.
- Owner: Q11
- Rationale: Owned verbatim: 'the global nets must not re-trigger on the recorder's own throw (loop protection; wire-1 listener isolation I12 covers the boundary side but `onerror` sees everything)'; 'the HTTP bucket must not capture the recorder's own report POST'; 'the recorder must never report through itself'.

**[high] Deaths that fire no page event**
- Stage: failure nets — invisible deaths
- Mechanism: Renderer OOM, unresponsive kills, app-manager kills, and power cycles fire no page event; the Reporting API is Chromium-only and floor Firefox ~124 predates all of it; on the RAM-disk device a power cycle also destroys any parked state.
- Effect: No bundle at all for the most severe death class; on the Firefox arm no report by any mechanism.
- Owner: Q7
- Rationale: Owned explicitly and at length: 'renderer OOM/unresponsive/app-manager kills fire no event... those deaths produce no report on that arm — the report says so plainly and weighs the Chromium-only `Reporting-Endpoints` server-side complement... plus absence-based detection'. Intake item h covers the ops-header feasibility.

**[medium] Cross-origin 'Script error.' opacity**
- Stage: failure nets — visibility
- Mechanism: window.onerror for an exception thrown by a script served cross-origin without crossorigin="anonymous" plus CORS headers yields message 'Script error.', null stack, zero file/line. The Q9 envelope header's 'trigger reason and stack' is empty, and dedup keyed on message/stack collapses all such distinct failures into one identity, so cooldown then suppresses genuinely different incidents.
- Effect: Bundles with opaque trigger identity; over-dedup suppresses distinct failures; whether any app scripts load cross-origin is a fact no intake item requests.
- Owner: partial:Q7 — 'what can each trigger actually see' frames it, but the plan enumerates only crash-shaped blind spots; 'Script error.' opacity, crossorigin/CORS script mechanics, and the does-the-app-load-cross-origin-scripts fact appear nowhere (no intake item)
- Rationale: Plan-text search: 'cross-origin'/'CORS' appears only for the report endpoint (intake item c); 'Script error' appears nowhere. Q7's enumerated blind spots are all crash-shaped deaths.

**[medium] Trigger fires before config injection or net arming**
- Stage: trigger protocol — startup
- Mechanism: Q6 fixes per-bucket config as 'injected at service startup'. An error during app bootstrap (module init, early MQTT connect) or an early explicit capture() arrives before buckets, config, or nets exist: the call throws (recorder becomes the incident), silently drops with no counter, or the pre-arming window simply produces no bundle. Net-arming order relative to incumbent-handler installation is also undefined.
- Effect: Exactly the startup failures a last-resort net exists for go unrecorded, or an early capture() call becomes a crash; the loss is silent.
- Owner: partial:Q6 — Q6 owns injection-at-startup and illegal combinations, but no question asks what a pre-injection trigger or record()/capture() call does (throw, drop-with-counter, queue) or when nets arm relative to bootstrap; Q6's 'safe to call from anywhere' is spatial (layering), not temporal
- Rationale: Q6: 'per-bucket config injected at service startup'; 'which combinations are illegal and unrepresentable (a bucket with no bound; a trigger from a bucket that doesn't exist)' — both static, not temporal. Q7's protocol sub-questions (chaining, cooldown, in-flight, sync work) are all steady-state. No plan text mentions bootstrap ordering.

**[medium] Net fires during page dismissal**
- Stage: trigger protocol — teardown
- Mechanism: An error thrown in pagehide/unload/teardown code fires onerror at the moment the async pipeline (worker gzip, then POST) can no longer complete: Q7's snapshot-sync/bundle-async split never finishes, and on floor Firefox only a synchronous sendBeacon of a pre-serialized ≤64 KiB summary could survive. The alternative — synchronous bundling in the handler — janks dismissal.
- Effect: Teardown-window failures produce nothing, or an unbounded synchronous bundling attempt blocks page dismissal.
- Owner: partial:Q9 — Q9 decides 'whether a last-gasp summary exists at all' and its ≤64 KiB budget, but frames dismissal as 'a delivery question, not a new trigger' for a bundle already in flight; a net trigger originating during dismissal (no bundle built yet) falls between Q7's async bundling and Q9's in-flight delivery and is assigned to neither
- Rationale: Q9: 'the charter's triggers do not include page dismissal, but a bundle already in flight when the tab dies is a delivery question, not a new trigger' — this rules out dismissal-as-trigger but never addresses a real error whose trigger time coincides with dismissal. Q7's sync-work sub-question assumes async completion is available.

**[medium] The capture envelope itself raises the invisible-death rate**
- Stage: failure nets — invisible deaths
- Mechanism: 10–50 MB of resident buffers plus trigger-time duplication (serialized bundle assembly, structured-clone copy into the worker, gzip output can transiently multiply resident bytes) on a device whose OS also lives in RAM raises the probability of renderer/OS OOM — precisely the death class Q7 says fires no event and which destroys the buffers. Intake item f requests CPU class and the Firefox floor but no item requests device RAM headroom, so the envelope has no denominator.
- Effect: The recorder increases the rate of the one failure it cannot report; every byte-budget decision in Q2 is anchored to an envelope with no measured headroom behind it.
- Owner: partial:Q11 — Q11 owns 'one that degrades the app is not [acceptable]' and Q7 owns naming invisible deaths, but neither links the envelope to the no-event death rate, no question owns peak (trigger-time) memory as distinct from steady-state, and no intake item asks for device RAM headroom
- Rationale: Intake f reads 'CPU class for de-rating the measured costs; the actual Firefox version' — no RAM figure. The RAM-disk section's 'must not be able to cause one' argument is applied only to the durable-parking queue, not to the capture envelope or trigger-time copies.

**[medium] onerror handoff fights incumbents in both directions**
- Stage: failure nets — handler chaining
- Mechanism: Assigning window.onerror replaces any incumbent handler (and returning true suppresses default reporting an incumbent may rely on); conversely, any handler installed after the recorder — a late-loading script, another SDK in the app — reassigns window.onerror and silently disarms the net, with no signal that it happened. addEventListener-vs-assignment mechanics differ for both suppression and ordering.
- Effect: Either incumbent reporting breaks, or the net is dead without anyone knowing and failures produce no bundle.
- Owner: partial:Q7 — 'how nets chain with any existing handlers (intake item g)' owns the install-time direction; the post-install clobbering direction (detecting or tolerating a later reassignment) is not asked anywhere
- Rationale: Q7 and intake g are phrased around existing handlers the nets 'must chain with rather than fight' — incumbents present at install. Nothing in the plan mentions being overwritten later or verifying the net stays armed.

**[medium] Late-handled rejections and stackless rejection reasons**
- Stage: failure nets — unhandledrejection semantics
- Mechanism: unhandledrejection fires at the microtask checkpoint even when the app attaches a handler one tick later (the browser then fires rejectionhandled); a net that bundles immediately produces spurious bundles for benign, ultimately-handled rejections unless it debounces against the paired event. Separately, rejection reasons may be strings/undefined/plain objects with no stack, so tracekit parsing fails and both the Q9 header and dedup identity degrade.
- Effect: False-positive multi-MB bundles at fleet scale for non-failures; opaque or colliding trigger identities for real ones.
- Owner: partial:Q7 — the 'what can each trigger actually see' frame covers it, but neither the rejectionhandled pairing nor stackless reasons appear anywhere in the plan; Q9's header assumes 'trigger reason and stack' exist
- Rationale: Plan-text search: 'rejectionhandled' absent; 'unhandledrejection' appears only as the net's name (charter point 1, intake g). Q9 lists 'trigger reason and stack (tracekit/error-stack-parser prior art)' without a no-stack case.

**[medium] Classify-nothing recorder cannot filter net noise**
- Stage: failure nets — noise vs charter
- Mechanism: Global nets receive benign or no-signal errors — 'ResizeObserver loop limit exceeded', extension- or environment-injected script failures, opaque 'Script error.' events. Charter point 1 rules the recorder 'classifies nothing and evaluates nothing', which forecloses relevance filtering at the net; cooldown bounds the rate of bundles but not the junk fraction.
- Effect: Junk bundles consume the delivery path and backend attention, or the implementer adds an ad-hoc ignore-list that violates the charter without the report ever examining the tension.
- Owner: partial:Q7 — dedup and cooldown are owned, but no question owns reconciling net noise with the charter's classification ban, or whether an ignore-list is a classifier
- Rationale: Charter point 1: 'it classifies nothing and evaluates nothing'. Q7's protocol sub-questions never mention noise, benign errors, or filtering; the only volume control named is cooldown.

**[medium] Cooldown-suppressed triggers are unaccounted**
- Stage: trigger protocol — suppression accounting
- Mechanism: Dedup/cooldown drops trigger N+1; a genuinely distinct second incident inside the window produces no bundle and no record that suppression occurred. Q2's drop accounting covers bucket evictions/truncations and Q9's header carries 'per-bucket drop/truncation counters' — neither counts suppressed or coalesced triggers.
- Effect: The backend sees one incident where there were several; the plan's own 'a capture that silently thinned is worse than a capture that says so' principle breaks at the trigger layer.
- Owner: partial:Q7 — cooldown is owned; carrying a suppressed-trigger count into the next bundle is named nowhere (Q9's header enumerates bucket-level counters only)
- Rationale: Q9 envelope header list: 'per-bucket drop/truncation counters, 0070's six IngressStats counters and wire-2 depths, both clocks, schema version' — no trigger-level counter. Q2's accounting language is explicitly per-bucket.

**[medium] Fleet-synchronized trigger storm**
- Stage: trigger protocol — fleet correlation
- Mechanism: One poisoned broadcast MQTT message or a shared-backend outage hits every device on the static roster within the same second; each device triggers and POSTs a multi-MB bundle simultaneously. Per-device cooldown (Q7) does not de-correlate devices, and Q10's jitter applies to retries, not first sends.
- Effect: Backend/network spike sized roster × bundle size; the report endpoint — whose aggregate capacity no intake item asks about (item c asks the per-request ceiling) — may be what falls over, taking legitimate reports with it.
- Owner: partial:Q10 — the delivery null owns 'backoff and jitter' for retries; first-send jitter and fleet-correlated triggering appear nowhere, and intake c requests size ceiling, not aggregate capacity
- Rationale: Q10: 'in-memory retry with backoff and jitter... one bundle at a time'. Plan-text search: 'fleet' appears only in the Firefox-floor verification note; no question considers more than one device.

**[medium] Adopted SDK's own nets and dedup preempt the Q7 protocol**
- Stage: failure nets — adopted core
- Mechanism: Under adopt + wrap, Sentry's browser instrumentation installs its own onerror/onunhandledrejection wrapping and applies SDK-internal policy (Dedupe integration, rate limits, beforeSend/sampling) before events reach any custom Transport. The Q7-designed trigger protocol (cooldown, coalescing, storm rules) must be expressed through or fight the core's pipeline; triggers the core drops internally never reach the wrap.
- Effect: The report's designed trigger semantics are silently not the effective semantics; incidents are dropped by SDK policy invisible to the bundle's own accounting.
- Owner: partial:Q14 — Q14 lists 'the failure nets' among what an adopted core is paid for and prices envelope-protocol lock-in, but no question asks whose trigger protocol wins when the core brings its own dedup/sampling; Q7 designs the protocol as if the recorder owns the nets outright
- Rationale: Q14: 'a real breadcrumb ring, the failure nets, attachments... paid for in Sentry's envelope protocol as the wire format' — the priced costs are wire format, count bounding, and the single ring; net/dedup ownership is not among them. Q7 never mentions the adopted-core case.

**[medium] Absence-based detection has no designer**
- Stage: failure nets — compensations
- Mechanism: Q7 weighs 'absence-based detection' as a compensation for no-event deaths, but detecting absence requires the backend to track an expected report/heartbeat cadence per device — backend design the scope section excludes ('The backend/receiving side beyond "accepts the contracted payload over HTTP"'), and no intake item asks whether the backend can or will do it (item h covers only Reporting-Endpoints headers).
- Effect: The report recommends a compensation nobody is chartered to design and no fact supports; the invisible-death gap stays open in practice while the report reads as if it were covered.
- Owner: partial:Q7 — the compensation is named, but it is unownable within the track's declared scope and no intake item requests the backend-side feasibility fact
- Rationale: Q7: 'weighs the Chromium-only Reporting-Endpoints server-side complement (a backend-header change, no client code) plus absence-based detection as the compensations' — the parenthetical cost analysis exists only for the first compensation. Scope section and intake list carry nothing for absence detection.

**[medium] capture() called in a hot path**
- Stage: explicit trigger — misuse
- Mechanism: App code places capture(reason) inside a message handler, effect, or render body; every call is a full trigger driving the recorder's most expensive path (snapshot, serialize, worker gzip, POST) at event rate.
- Effect: Self-DoS through the recorder; bundle storm identical in cost to an error loop but originating from sanctioned API use.
- Owner: Q7
- Rationale: Owned by generic wording: 'trigger dedup and cooldown' and 'whether a trigger during an in-flight bundle coalesces, queues, or drops' are stated over triggers, and the charter defines triggers as 'explicit application calls plus global failure nets' — the explicit class is inside the protocol question. (The motivating example is an error loop, so the surveyor should be held to applying cooldown to the explicit class too.)

**[medium] Trigger during an in-flight bundle**
- Stage: trigger protocol — concurrency
- Mechanism: A second trigger arrives while bundling or POST is in flight; unbounded queueing would stack multiple multi-MB bundles in RAM, naive dropping loses the second incident, coalescing changes bundle semantics.
- Effect: Memory spike on a RAM-disk device, or a lost incident, depending on the unexamined choice.
- Owner: Q7
- Rationale: Owned verbatim: 'whether a trigger during an in-flight bundle coalesces, queues, or drops'. Q10's 'one bundle at a time' bounds the delivery side.

**[medium] Second trigger or tab death inside the aftermath window**
- Stage: trigger protocol — post-trigger window
- Mechanism: During Q8's configurable post-trigger window the bundle is unsealed; a second trigger must extend, fork, or seal early, and a tab death before sealing loses the whole bundle if delivery waits on the seal.
- Effect: Incident bundle never ships, or aftermath semantics are ambiguous across bundles.
- Owner: Q8
- Rationale: Owned verbatim: 'what a second trigger during the window does; whether the window delays delivery or the bundle ships and a supplement follows; the default (plausibly zero)' — the ship-then-supplement option is exactly the loss bound.

**[medium] Failure-net claims unverifiable in the accepted test lanes**
- Stage: verification — nets
- Mechanism: jsdom does not faithfully implement onerror/unhandledrejection dispatch, worker error propagation, or sendBeacon; net behavior claims can only be verified in a real browser lane that does not exist yet (0120's future harness).
- Effect: The report's trigger-protocol claims ship unverified, or verification silently substitutes dev-mode React behavior (which diverges from production for boundaries).
- Owner: Q15
- Rationale: Owned verbatim: 'The failure nets are hard to test in jsdom; the report says which claims need a real browser lane (0120's future harness) and, per the 0150 precedent, states plainly which of its claims are unverified if no lane can reach them.'

**[low] Trigger referencing a nonexistent bucket**
- Stage: explicit trigger — declaration validity
- Mechanism: A capture/trigger configuration names a bucket that was never declared or is disabled; without unrepresentability the trigger silently bundles nothing for that bucket.
- Effect: Bundle missing an expected bucket with no error at declaration time.
- Owner: Q6
- Rationale: Owned verbatim: 'which combinations are illegal and unrepresentable (a bucket with no bound; a trigger from a bucket that doesn't exist)'.

**[low] capture() layering is unexamined where record() layering is**
- Stage: explicit trigger — layering
- Mechanism: Q6 asks the D-0002 restricted-import question for record() only. capture(reason) callable from the component layer is precisely what makes the hot-path misuse mode reachable, and no lint discipline is asked for it.
- Effect: The convention gap invites render-path triggering; the misuse mode above becomes likely rather than possible.
- Owner: partial:Q6 — 'whether `record()` is safe to call from anywhere or only below the view layer... align with D-0002' names record() only; capture() appears in the charter but in no layering question
- Rationale: Q6's layering sub-question is explicitly about record(); the trigger call's allowed call sites are not assigned to any question.

**[low] App-supplied trigger reason/context is unmetered**
- Stage: explicit trigger — reason budget
- Mechanism: Q2's byte meter covers bucket records at capture time; the envelope header (trigger reason, stack, config snapshot) is assembled at trigger time outside bucket accounting. A large app-supplied reason or context object inflates the bundle past the backend's ceiling (intake c) and trivially overflows any ≤64 KiB last-gasp summary.
- Effect: Bundle rejected at the endpoint or last-gasp quota blown — by the one payload component no budget governs.
- Owner: partial:Q9 — the header's contents are enumerated ('trigger reason and stack...') but no budget or truncation rule for app-supplied header data is named; Q2's meter is explicitly per-bucket
- Rationale: Q2: metering happens 'once at capture on the already-serialized record' — bucket entries. Q9 lists header fields and body budgets but assigns no cap to the reason/context the explicit call supplies.

**[low] Background-tab throttling stalls bundling and delivery**
- Stage: trigger protocol — background tab
- Mechanism: Chromium throttles timers to ~1/min after five minutes hidden (documented in app-profile's keepalive entry); a net firing in a backgrounded tab has its async bundling and retry backoff timers throttled, and if the device's app manager kills the hidden tab meanwhile, the in-memory bundle dies with it (the delivery null is retry-within-session).
- Effect: Bundles for incidents in backgrounded tabs are delayed by minutes and disproportionately lost.
- Owner: partial:Q10 — 'does anything survive the tab' owns the loss window generally, but background-timer throttling is never named in the plan (app-profile raises it only for MQTT keepalive)
- Rationale: Q10's null and durable-parking burden address tab death; no question mentions visibility state or throttling. App-profile: 'Chromium throttles timers to ~60 s after five minutes hidden' — carried into no 0160 question.

**Lane notes**: Stage group: triggers and failure nets. Coverage picture: Q7 and Q11 form a strong owned spine — error-loop storms, in-flight coalescing, invisible deaths, self-trigger loop protection, and incumbent chaining (intake g) are all explicitly owned, and Q8/Q6/Q15 own the aftermath window, declaration validity, and the jsdom limitation. No mode survived scrutiny as fully UNOWNED — every candidate had adjacent plan language, so verdicts are owned or partial with the missing piece named. The recurring gap shapes: (1) React 18 mechanics — the charter names error boundaries as a passive net that React 18.3.1 cannot provide passively (highest-consequence finding, since it invalidates a charter premise); (2) temporal edges — trigger before config injection and net-fire during dismissal both fall between questions (Q6/Q7 and Q7/Q9 respectively); (3) Q7's own example answer (index snapshot) is unsound under continued capture and no question owns seal/consistency semantics; (4) accounting stops at the bucket layer — suppressed triggers and the app-supplied reason are unmetered; (5) everything is single-device — fleet-correlated first-send storms and aggregate endpoint capacity have no owner; (6) 'Script error.' opacity and unhandledrejection false-positive pairing are visibility blind spots the plan's crash-death enumeration does not reach; (7) absence-based detection is offered as a compensation the track's scope declaration cannot design. Facts no intake item requests: device RAM headroom (item f asks CPU class only), whether any scripts load cross-origin, backend absence-detection feasibility, and aggregate report-endpoint capacity.


### Lane: bundling (18 modes)

**[medium] Second trigger inside the window**
- Stage: post-trigger window
- Mechanism: Trigger A opens a T-ms/N-item window; trigger B fires inside it. If B restarts the window, an error loop extends it indefinitely and the bundle never seals; if B is silently dropped, its reason and stack are lost.
- Effect: Bundle starvation under an error loop, or lost trigger evidence for the second failure.
- Owner: Q8
- Rationale: Q8 poses exactly 'what a second trigger during the window does', and Q7's 'trigger dedup and cooldown — an error loop must not produce a bundle storm' bounds the loop case. Owned; coverage evidence.

**[medium] Window delays delivery past tab death**
- Stage: post-trigger window
- Mechanism: A nonzero window holds the seal open; when the triggering failure is fatal (crash cascade, imminent renderer kill), the tab dies inside T with nothing shipped.
- Effect: No report for exactly the fatal failure class the recorder exists for.
- Owner: Q8
- Rationale: Q8 poses 'whether the window delays delivery or the bundle ships and a supplement follows; the default (plausibly zero)' — the zero default is the stated mitigation. Owned; coverage evidence.

**[medium] Supplement bundle has no correlation identity or delivery slot**
- Stage: post-trigger window
- Mechanism: The ship-then-supplement option produces two POSTs for one trigger. Q9's envelope enumeration contains no bundle id or supplement linkage, and Q10's null is one bundle at a time with bounded retries — a supplement sealing while the base bundle is still retrying has no defined slot, and the backend receives two unlinkable payloads.
- Effect: Aftermath evidence arrives unattributable to its trigger, or the supplement is dropped by the one-at-a-time rule.
- Owner: partial:Q8 — Q8 poses the supplement option, but nothing owns the schema linkage (correlation id) between supplement and base bundle, nor the supplement's delivery slot against Q10's one-bundle-at-a-time null
- Rationale: Q8: 'the bundle ships and a supplement follows'; Q10: 'one bundle at a time, bounded retries, then drop'. Neither question, nor Q9's envelope list, mentions correlating or scheduling the second payload.

**[high] Eviction overwrites the snapshot during async bundling**
- Stage: bundle sealing
- Mechanism: Q7's hypothesized protocol snapshots ring indices synchronously and bundles async; capture continues (Q8 wants it to). At ~50 msg/s, writers wrap the ring and evict-oldest (Q2's presumptive policy) reclaims slots the snapshot's indices still reference while multi-MB assembly takes hundreds of ms to seconds. An error loop in the aftermath accelerates the overwrite of exactly the pre-trigger context.
- Effect: Bundle silently contains post-trigger data in pre-trigger positions or loses the lead-up — defeating the recorder's distinct claim (Q1), and disagreeing with drop counters read at seal.
- Owner: partial:Q7 — Q7 owns the sync/async split and names index snapshotting, but no question owns seal semantics: what protects the snapshotted region (copy-out, eviction pause, slot versioning) against continued writes during async bundling
- Rationale: Q7's only bundling language is the parenthetical '(snapshot the ring indices, then bundle async)' — it states the design that creates the race and stops there. Q2 owns eviction policy, Q8 owns deliberate post-trigger capture; neither poses snapshot stability. Searched the plan for seal/quiesce/freeze semantics: absent.

**[medium] No common cut across buckets**
- Stage: bundle sealing
- Mechanism: A single synchronous snapshot turn would give a consistent leading cut (single-threaded runtime), but nothing requires snapshotting all buckets in one turn — a per-bucket lazy snapshot interleaves with event delivery. Worse, Q8's window shape 'T ms or N items per bucket' seals buckets at divergent trailing instants, since N-item windows fill at bucket-specific rates.
- Effect: Cross-bucket causality is wrong at both window edges — an MQTT message present in its bucket whose xstate consequence is absent, and asymmetric aftermath windows per bucket. RD-2/RD-3 clocks make the misalignment detectable at analysis, not prevented.
- Owner: partial:Q7 — the snapshot-then-bundle hypothesis implies a consistent leading cut but no question poses 'do all buckets cut at the same logical instant', and Q8's per-bucket window options actively diverge the trailing cut without noting it
- Rationale: Q12 RD-3 reserves 'one shared clock domain across buckets' — a data-model reservation for ordering, not a sealing-semantics decision. No question text anywhere requires or even mentions a consistent cross-bucket cut.

**[high] Trigger-time memory spike: rings + bundle + encoded copies co-resident**
- Stage: bundle assembly
- Mechanism: Assembling the bundle concatenates up to the 10–50 MB envelope into a new JSON string while the rings still hold the originals (2x envelope); TextEncoder output or worker postMessage of a string copies again (strings are not transferable, ArrayBuffers are — a design choice nobody poses); gzip output adds more. Transient resident set reaches 2–3x the envelope on a device whose RAM is also the OS disk. The stringify/concat also runs hundreds of ms on the main thread adjacent to 0060's shared dispatch turn, causing shed-oldest for every consumer at the moment of failure.
- Effect: Renderer OOM or app-manager kill at trigger time — which Q7 establishes produces no report at all — or the app degradation Q11's stated bias forbids. The recorder becomes the incident precisely when armed.
- Owner: partial:Q11 — Q11 owns 'not become the incident' as a class but its enumerated hazards are all capture-path (per-event dispatch budget, self-POST loop, net re-trigger); trigger-time bundling cost and the transient resident-set multiple are never enumerated. Q2's byte metering covers ring contents, not the assembly copy; Q9's worker-side gzip offloads CPU, not resident bytes; app-profile states the 10–50 MB envelope covers 'capture buffers', leaving the bundle copy unbudgeted
- Rationale: Q11's hazard list: shared dispatch turn per-event cost, HTTP self-capture, net loop protection, never-report-through-itself — bundling absent. Q7: 'snapshot the ring indices, then bundle async' — async does not mean off-main-thread or memory-free. No plan text accounts for peak memory at trigger time.

**[medium] Contract validation of the bundle is infeasible or a second spike**
- Stage: payload schema
- Mechanism: Charter point 2 plus D-0006 make the payload a validated contracted surface, but Q3's rings hold pre-serialized strings. Validating the assembled bundle against 0010-generated validators requires re-parsing tens of MB into an object tree (another full copy plus hundreds of ms CPU at trigger time), or the contract types records as opaque strings (validating nothing where the payload is richest), or client-side validation is skipped — and the first schema mismatch is discovered as a backend 400 after the incident.
- Effect: Either a second trigger-time memory/CPU spike stacked on bundle assembly, or a contract discipline that is hollow for the recorder's own payload.
- Owner: partial:Q10 — Q10 poses 'its schema validation happens where?' as a choke-point/boundary question, but nothing owns the structural conflict between Q3's serialize-at-capture design and validating the contracted payload at feasible cost
- Rationale: Q10's parenthetical raises validation location only. Q3 and charter point 2 are decided independently; no question connects them. The conflict is between two of the plan's own commitments — a plan-level finding as much as a field one.

**[medium] Byte-truncation of a serialized record yields invalid JSON**
- Stage: bundle assembly
- Mechanism: Q2 offers truncate-with-markers when a single entry exceeds its bucket budget; records are already serialized at capture (Q3). Truncating serialized bytes at the cap boundary produces an unparseable fragment; bundling concatenates records without re-parsing, so one truncated record makes the entire bundle invalid JSON, the backend rejects with 400, and Q10's bounded retries end in a drop.
- Effect: Systematic loss of every bundle containing an oversized entry — precisely the big-payload incidents intake item a exists to size.
- Owner: partial:Q2 — Q2 poses single-entry truncation and RD-5 marks it, but nothing states the structural constraint that truncation must happen at/before projection, never on serialized bytes, for the assembled bundle to remain parseable
- Rationale: Q2: 'truncate with markers per question 12's RD-5, or refuse' — the marker shape {truncated, originalSize} implies structured truncation but the plan never notes that byte-level truncation of a serialized record breaks JSON validity, and Q3 is what makes records byte strings.

**[medium] Schema evolution strands old-build bundles**
- Stage: payload schema
- Mechanism: The fleet updates staggered; a device on app build N-1 POSTs a bundle shaped by contract v1 to a backend validating v2 — or, if Q10 adopts durable parking, a parked v1 bundle is re-sent by v2 code after reload. Strict validation rejects with a permanent 4xx; Q10's retry null does not distinguish permanent from transient, so the bundle burns its retry budget and drops with only a local counter.
- Effect: Reports lost from exactly the stale devices most likely to be failing; the evidence loss is invisible server-side.
- Owner: partial:Q9 — Q9, RD-7, and RD-8 reserve version stamps (schema version in the envelope), but no question owns the compatibility policy (additive-only contract, backend accepts N-1, reject-and-count) and no intake item asks the backend's tolerance for old schema versions
- Rationale: Searched the plan for evolution/compatibility language: 'schema version' appears as an envelope field (Q9) and RD-7/RD-8 stamps only. Intake item c asks origin/ceiling/auth/infrastructure, not version tolerance. Stamps let the failure be diagnosed later; nothing prevents it.

**[medium] Custom buckets cannot be strictly typed by the contract**
- Stage: payload schema
- Mechanism: Q6's standard interface admits arbitrary app-declared buckets; the vendored OpenAPI contract must then either type bucket bodies as free-form (D-0006 strictness hollow exactly where the payload is most variable) or enumerate every bucket (each new custom bucket forces a contract change, regenerated validators, and a backend redeploy — coupling routine app feature work to the report pipeline).
- Effect: Either unvalidated regions in the contracted payload or evolution churn that amplifies the old-bundle stranding mode.
- Owner: partial:Q12 — RD-8 reserves per-bucket {schemaId, schemaVersion} for app-defined buckets, which is the hook, but no question decides how the OpenAPI contract types app-defined bucket bodies
- Rationale: Q6 owns the bucket interface, Q9 owns the bundle format, Q12 RD-8 owns the stamps; the tension between open bucket extensibility and a closed validated contract falls between them — no plan text addresses it.

**[high] No device, session, or bundle identity in the envelope**
- Stage: envelope header
- Mechanism: Q9's header list (trigger reason/stack, build/version, config snapshot, drop counters, IngressStats, clocks, schema version) and RD-7 (format version, creator, app build, platform, config snapshot) contain no device id, session/page-load id, or bundle id — although the fleet is a fixed roster of device-scoped MQTT clientIds. Three concrete consequences: (a) Q10's retry is at-least-once — a POST that commits server-side but loses its response is re-sent and stored twice with no dedup key; (b) Q7's own compensation, absence-based crash detection, requires knowing which devices should have reported and is unimplementable over anonymous bundles; (c) a Q8 supplement cannot name its base bundle.
- Effect: Duplicate multi-MB reports the backend cannot dedup, evidence uncorrelatable across bundles or to server-side logs, and a compensation mechanism the plan itself proposes that cannot be built.
- Owner: UNOWNED
- Rationale: Verified against the plan text: Q9's envelope enumeration, all of RD-1..RD-10, and intake items a–h. Only build identity is requested (item e). Item c's 'auth' concerns the endpoint's transport requirements, not in-schema identity, and gives no bundle or session id. No question raises server-side dedup of retried POSTs, report-to-device correlation, or the identity that absence-based detection needs. Q9 owns the header as a surface, but this failure mode — anonymous, duplicable, uncorrelatable bundles — is raised nowhere.

**[medium] Header fields escape all byte accounting**
- Stage: envelope header
- Mechanism: Q2 meters serialized ring records once at capture; the envelope's trigger reason and stack are produced at trigger time from arbitrary content — capture(reason) with an interpolated dump, or an onerror message embedding serialized state (a common app anti-pattern) — and the config snapshot is similarly unbounded. None of it passes a bucket cap or RD-5 truncation.
- Effect: The header alone can blow the backend ceiling (413, then bounded retries, then drop) and trivially exceeds any 64 KiB last-gasp budget, which Q9 requires to be pre-serialized and pre-bounded.
- Owner: partial:Q2 — Q2's 'global envelope' language could be stretched to the whole bundle, but every metering, eviction, and truncation sub-question is denominated in buckets and capture-time records; nothing bounds header fields generated at trigger time
- Rationale: Q2: 'metered once at capture on the already-serialized record', 'per-bucket byte caps, a global envelope, or both', 'a single entry exceeds its bucket's budget' — all bucket-scoped. Q9 enumerates header contents with no bounds. A report author answering Q2 as posed would not naturally bound the trigger-reason string.

**[medium] Header and config snapshot bypass redaction**
- Stage: envelope header
- Mechanism: Q13 applies the shared rule set per-bucket at projection time; envelope fields never pass a projection. Error messages and stacks routinely embed live values (URLs with tokens, state fragments in thrown messages), and the config snapshot ships the redaction rule paths themselves — field topology that intake item b may class as sensitive.
- Effect: PII or secrets leave the device through the one payload built to manage exactly that risk, with no RD-10 marker because no rule ever ran.
- Owner: partial:Q13 — Q13 owns the rule set and fixes the application point as per-bucket at projection time, but no question applies redaction to envelope-header content (reason, stack, config snapshot)
- Rationale: Q13: 'apply per-bucket at projection time' — the header is not a bucket and has no projection. Q9 lists the header fields without any redaction language. Intake item b governs what may leave the device but nothing routes header content through its constraints.

**[medium] Compression path fails or cannot be constructed**
- Stage: bundle assembly
- Mechanism: Q9's format is worker-side CompressionStream gzip. The worker itself may be unbuildable in the host app — CSP worker-src/blob: restrictions, bundler asset handling for a vendored worker file — a fact no intake item requests; and a mid-stream throw or worker OOM on a multi-MB input on the RAM-constrained device leaves the bundle uncompressed with no posed fallback (send uncompressed and risk the ceiling, compress on the main thread, or drop).
- Effect: Bundles undeliverable, or delivered 5–10x larger than every size assumption in the design, on the arm where budgets are tightest.
- Owner: partial:Q9 — Q9 names worker-side gzip and carries the planning ratio, but poses no compression-failure fallback, and intake items a–h omit the app's CSP/worker-construction constraints entirely
- Rationale: Q9: 'JSON with worker-side CompressionStream gzip (5–10x planning ratio...)' — stated as the format hypothesis with no failure branch. Q15's spike list covers projection cost and shedding, not worker feasibility. Searched intake items: no CSP or worker fact requested.

**[medium] Permanent rejection treated as transient**
- Stage: delivery
- Mechanism: Q10's null retries with backoff until sent or tab death, bounded then drop. A 413 (bundle over ceiling), 400 (schema mismatch or invalid JSON from the truncation mode), or auth failure is deterministic, yet the retry loop holds the multi-MB bundle in RAM through the entire backoff schedule before dropping. Compounding it, intake item c's 'size ceiling' is un-denominated: with Content-Encoding gzip, a proxy limit on compressed bytes and an app-server post-inflate limit are different numbers, so the client cannot even know which bound it hit.
- Effect: RAM held for the full retry schedule on undeliverable bundles, then silent evidence loss with only a local counter; no shrink/split/re-truncate recovery exists.
- Owner: partial:Q10 — Q10 owns retry/backoff/bounded/drop and Q9 owns asking the ceiling via intake c, but no question classifies permanent vs transient delivery failures or poses an oversize-recovery policy, and intake c does not denominate the ceiling (compressed vs inflated)
- Rationale: Q10: 'retried with backoff until sent or the tab dies... bounded retries, then drop with a counter' — no response-class distinction anywhere in the plan. Q9: 'size ceilings the backend will accept (intake item c)' — the fact is asked; behavior on breach is not.

**[low] Trigger protocol split across three questions (plan-level)**
- Stage: post-trigger window
- Mechanism: Q7 owns trigger-during-in-flight-bundle (coalesce/queue/drop) plus dedup/cooldown; Q8 owns second-trigger-in-window and window-vs-delivery; Q10 owns one-bundle-at-a-time. These are states of one machine (armed, windowing, sealing, delivering), and independently-answered questions can compose into contradiction — e.g. Q8 answers ship-plus-supplement while Q10 holds one-at-a-time and Q7 answers drop for the in-flight case, leaving the window-elapses-while-retrying transition undefined.
- Effect: The report answers all three questions faithfully yet ships a trigger state machine with undefined transitions — a hole discovered at implementation, not survey.
- Owner: partial:Q7 — each fragment is explicitly owned (Q7, Q8, Q10 all cite their piece), but no question owns the composed trigger/window/delivery protocol as one state machine
- Rationale: Q7: 'whether a trigger during an in-flight bundle coalesces, queues, or drops'; Q8: 'what a second trigger during the window does'; Q10: 'one bundle at a time'. All present; composition absent. Reported as a plan-structure risk, mild because the same report author likely answers all three together.

**[medium] Tab death during delivery loses the bundle**
- Stage: delivery
- Mechanism: On floor Firefox (~124), an in-flight multi-MB fetch POST dies with the page — keepalive shipped in 133 — and sendBeacon's 64 KiB quota cannot carry the bundle. The report vanishes in the crash-during-delivery window.
- Effect: Evidence loss for failures that kill the tab mid-delivery — the exact window durable parking would have to justify itself against.
- Owner: Q10
- Rationale: Explicitly owned: Q10 weighs durable parking against 'a real evidence win over the null (the tab-crash-during-delivery window)', with the RAM-disk premise bounding what parking buys and Q9 owning the last-gasp 64 KiB split. Owned; coverage evidence.

**[low] Planning gzip ratio overstates real compression**
- Stage: bundle assembly
- Mechanism: The 5–10x planning ratio came from desktop V8/zlib on synthetic JSON (15.2x on deliberately repetitive corpus). Real bundles carrying base64-encoded binary payloads (RD-6) and high-entropy ids compress far worse — base64 binary approaches 1.3x — inflating the POST several-fold over plan against an unknown ceiling.
- Effect: Size-budget arithmetic wrong; ceiling pressure and 413s the design did not anticipate.
- Owner: Q9
- Rationale: Owned: Q9 carries 5–10x explicitly as a planning range with 15x named as the synthetic upper bound, and the survey-verification notes mandate 'Re-measure before any figure becomes load-bearing in the report.' Owned; coverage evidence.

**Lane notes**: Hunter stage group: post-trigger window, bundling/sealing, snapshot consistency, envelope header, payload schema evolution, size/compression, and trigger-time memory behavior. Method: read /home/nn/Projects/app-tooling-research/tracks/0160-flight-recorder/research-plan.md in full and the MQTT/Environment sections of /home/nn/Projects/app-tooling-research/facts/app-profile.md; every owner verdict was checked against the literal question text before assignment, and owned modes are reported as coverage evidence. Distribution: 4 owned (Q8 x2, Q10, Q9), 12 partial, 1 UNOWNED. The single UNOWNED (missing device/session/bundle identity in the envelope) was verified against Q9's header enumeration, all of RD-1..RD-10, and intake items a-h — only build identity (item e) is requested, and the mode's consequences (server-side dedup of at-least-once retries, supplement correlation, and the absence-based detection Q7 itself proposes) appear nowhere. Two near-UNOWNED modes were conservatively downgraded to partial (header byte accounting -> partial:Q2; header redaction bypass -> partial:Q13) because a broad reading of those questions could stretch to them, though their sub-question text is bucket-denominated throughout. Highest-severity cluster: the seal-vs-eviction race during async bundling (partial:Q7), the trigger-time resident-set multiple of the 10-50 MB envelope (partial:Q11 — Q11's hazard enumeration is capture-path only), and the identity gap (UNOWNED). One genuine plan-internal conflict: Q3's serialize-at-capture rings vs charter point 2 / D-0006 validation of the assembled payload (surfaced under partial:Q10, which asks where validation happens but not whether it is feasible over string-holding rings).


### Lane: delivery (15 modes)

**[medium] Charter and Q10 state two different retry nulls**
- Stage: delivery — retry policy (plan-internal)
- Mechanism: Charter point 4 (plan line 36-37) fixes the null as 'held in memory and retried with backoff until sent or the tab dies'; Q10 (line 253-256) opens 'The null is fixed by charter' and then states 'bounded retries, then drop with a counter'. Unbounded-until-tab-death and bounded-then-drop are materially different designs: under a sustained outage the first pins the bundle's memory indefinitely but survives a late backend recovery; the second frees memory but discards evidence that a recovery ten minutes later would have delivered.
- Effect: The surveyor can design either policy and cite the plan for it; the report ships one behavior while the charter record (D-0040) describes the other, and the divergence surfaces only in the field as either unexplained memory residency or unexplained report loss.
- Owner: partial:Q10 — Q10 owns delivery and states a null, but its restatement contradicts the charter text it claims to be fixed by; nothing in the plan reconciles the two
- Rationale: Both texts quoted verbatim above; no other plan section addresses retry termination. This is a kind-(b) plan defect: the question cannot be answered as posed because its premise ('fixed by charter') and its content disagree.

**[medium] Pending bundle's bytes live outside the envelope's denominator**
- Stage: delivery — sustained outage / bundling
- Mechanism: The 10-50 MB envelope is defined over 'in-RAM capture buffers across all buckets' (app-profile, Environment). At bundling time the rings, the serialized body, and the gzip copy coexist (a transient peak near 2x the retained bytes), and during a sustained outage the held bundle stays resident for minutes-to-hours while rings keep capturing for future triggers. Q2's byte accounting meters capture records into buckets; Q10 bounds the bundle count ('one bundle at a time') but never says the pending bundle's bytes are charged against the global envelope.
- Effect: On a RAM-disk device the recorder's true footprint can exceed the envelope it exists to enforce — 'bounded by construction' (the RAM-disk section's stated safety property) fails at exactly the component this track adds, and a full RAM disk is an OS-level failure per the plan's own premise.
- Owner: partial:Q10 — 'one bundle at a time' bounds count, and Q2 owns the buckets' accounting, but no question states whether pending/in-flight bundle bytes (and the bundling-time transient) count against the global envelope
- Rationale: Q2's sub-questions enumerate per-bucket caps, global envelope, eviction, oversize entries, drop accounting — all over captured entries. Q9 owns bundle format, Q10 delivery; neither mentions the bundle's memory residency. The RAM-disk section says a recorder 'must not be able to cause' an OS-level failure, which is the design pressure this mode escapes.

**[medium] Duplicate delivery: same bundle stored twice by the backend**
- Stage: delivery — retry after ambiguous failure
- Mechanism: A POST times out or the connection drops after the server persisted the bundle but before the client observed a 2xx. The retry loop re-sends the identical bundle. If Q10 adopts durable parking, the window widens: a parked bundle whose original send actually landed just before a tab crash is re-sent next session ('self-deleting on send' deletes only on a confirmed send).
- Effect: The backend stores the same trigger's report twice; incident counts and any alerting double; with parking the duplicate can arrive a session later, looking like a fresh incident.
- Owner: UNOWNED
- Rationale: Verified by grep: 'idempot' appears nowhere in the plan; 'duplicate' nowhere; 'dedup' only in Q1/Q4 (0060 telemetry, pipeline verdicts) and Q7 ('trigger dedup and cooldown — an error loop must not produce a bundle storm'), which is trigger-side and pre-bundle. Q10 specifies backoff, jitter, one-at-a-time, bounded retries — but never at-least-once vs at-most-once semantics or the ambiguous-outcome retry. 'What this track does not decide' scopes out the receiving side, so no question can own it there either.

**[medium] No report identity in the schema, so server-side dedup is impossible**
- Stage: receiving side — dedup key
- Mechanism: Q9's envelope-header enumeration (trigger reason and stack, app build/version, config snapshot, drop/truncation counters, IngressStats, both clocks, schema version) contains no bundle/report UUID, and RD-1..RD-10 reserve replay properties without reserving report identity. The payload schema is a vendored OpenAPI contract (charter point 2), so adding an id after adoption is a schema revision across client and backend.
- Effect: Even a backend that wants to drop retransmitted bundles (the previous mode) has no key to dedup on; the omission is cheap now and a contract change later — exactly the 'unrecoverable to add later' class Q12 exists to catch, but for delivery rather than replay.
- Owner: partial:Q9 — Q9 owns the envelope header where a report id would live, but its enumeration lacks one and no question owns duplicate-report semantics that would motivate it
- Rationale: Q9 text read in full: the header list is concrete and id-free. Q12's reservations were checked item by item (RD-1 is per-bucket sequence numbers, not report identity). The not-decided section excludes the backend beyond 'accepts the contracted payload over HTTP'.

**[medium] sendBeacon 64 KiB quota consumed by 0050's remote sink at the same dismissal moment**
- Stage: last-gasp delivery — shared beacon quota
- Mechanism: The plan's own sweep finding (line 119-120) states the 64 KiB quota is 'a shared in-flight budget across all keepalive-class requests'. The moments are correlated, not independent: an incident produces error-level log traffic that 0050's facade remote sink flushes and a recorder trigger at the same time, and on floor Firefox both dismissal-surviving senders must be sendBeacon. If the sink's beacon is in flight first, the recorder's last-gasp summary gets sendBeacon() === false and nothing retries — the page is dying.
- Effect: The last-gasp summary is silently lost precisely in the failure scenarios where both systems fire together; the ≤64 KiB budget Q9 designs to is necessary but not sufficient.
- Owner: partial:Q9 — Q9 owns the two-budget split and the ≤64 KiB last-gasp budget, but no question owns cross-component budgeting of the shared quota; the not-decided section defers recorder/facade machinery sharing to 'whoever builds the facade' without covering quota contention
- Rationale: Searched: 'quota' appears once (line 119, the shared-budget fact) and 'beacon' only in the platform findings, Q9's budget line, and the verification note about floor-Firefox non-enforcement. The fact is recorded; no question converts it into a coordination requirement. Mechanism is contingent on 0050's eventual sink transport (its report is a signature sketch), which is exactly why it needs an owner now.

**[high] Recorder's own report POST captured by the HTTP bucket**
- Stage: capture — self-interference with delivery
- Mechanism: The HTTP bucket wraps the orval mutator or FetchLike adapter (Q4). A multi-MB report POST passing through the wrap becomes an HTTP-bucket entry, evicting most or all retained HTTP history under byte accounting; each retry adds another. Whether it is excluded automatically depends on Q10's carrier choice — a bare fetch outside the boundary escapes the wrap for free, a boundary-routed POST needs an explicit filter — so the two questions' answers must compose.
- Effect: Evidence eviction and self-referential bundles; in the loop case each bundle contains the previous bundle's POST.
- Owner: Q11
- Rationale: Explicitly owned: Q11 'the HTTP bucket must not capture the recorder's own report POST (self-capture loop)', plus 'the recorder must never report through itself'. Coverage evidence; the Q4/Q10 composition dependency is worth the adjudicator noting but does not weaken ownership.

**[high] Report POST rides the 0060 REST surface that is itself the reported failure**
- Stage: delivery — independence from the boundary
- Mechanism: If delivery routes through the boundary's fetch machinery, a boundary-wide failure (the very TelemetryEvent that pulled the trigger) also takes down report delivery; retries fail with the same cause.
- Effect: Reports are undeliverable exactly when the program most needs them; the outage that triggered the recorder suppresses its own evidence.
- Owner: Q10
- Rationale: Explicitly owned: Q10 'delivery independence — the report must not assume 0060's REST surface is alive, because the failure being reported may be the boundary itself; a recorder POST is plausibly a bare fetch outside the boundary', including the honest open sub-question of where D-0006 schema validation then happens. Intake c(4) requests the infrastructure-sharing fact and the plan's facts-needed section ties it to Q10 by name.

**[medium] Preflight blocks or delays the report POST**
- Stage: delivery — CORS at trigger and dismissal time
- Mechanism: A cross-origin JSON POST requires a CORS preflight; gzip via Content-Encoding is a non-safelisted request header forcing preflight even where the content type alone would not; at dismissal time the preflight round trip cannot complete before the page dies, and a sendBeacon carrying a non-safelisted content type cross-origin is likewise preflighted and dropped.
- Effect: Delivery fails structurally (every attempt), not transiently — backoff cannot fix it; on the last-gasp path the loss is silent.
- Owner: Q10
- Rationale: Owned via the plan's facts-needed section: item c is 'same-origin or CORS, size ceiling, auth ... (delivery independence, question 10)', and intake c(1) spells out the mechanism ('CORS preflight on a JSON POST — risky at page-dismissal time, and it constrains any sendBeacon path to CORS-safelisted content types'). The carrier decision Q10 owns cannot be made without resolving it. Note for the adjudicator: the Content-Encoding-forces-preflight interaction with intake c(2)'s gzip question is not spelled anywhere, but it falls squarely inside Q10's carrier design once item c is answered.

**[medium] Auth cannot ride the last-gasp sender**
- Stage: last-gasp delivery — auth
- Mechanism: navigator.sendBeacon cannot set request headers. If the report endpoint requires an Authorization header (intake c(3), unanswered), the only dismissal-surviving sender on floor Firefox cannot authenticate at all — auth must be cookie-based or a URL token, which is a backend design change, not a client option. Separately, on the global-net path the credential may live in app state that is precisely what just failed.
- Effect: The entire last-gasp arm 401s silently, or the design discovers at implementation time that it needs a backend change the survey never priced.
- Owner: partial:Q10 — intake c(3) requests the fact ('is that credential available to the page at trigger time'), and Q10 owns the carrier, but no plan or intake text names the sendBeacon-cannot-carry-headers constraint that can invalidate the last-gasp design regardless of the fact's answer
- Rationale: 'auth' appears in the plan only in the facts-needed line for item c; Q9's last-gasp budget line and Q10's delivery text never mention authentication mechanics. The missing piece is a design constraint, not a fact, so the intake item alone does not cover it.

**[medium] Oversized bundle rejected; retry loop cannot ever succeed**
- Stage: receiving side — size rejection
- Mechanism: The gzip planning ratio (5-10x) is corpus-dependent — the plan's own verification note says the 15.2x figure came from deliberately repetitive synthetic JSON. A bundle compressing worse than planned exceeds the endpoint ceiling and gets 413. Q10's null retries the identical bundle with backoff — a permanent failure treated as transient — then drops with a counter. No text anywhere provides rejection classification (4xx-permanent vs 5xx/network-transient) or a shrink-and-resend path.
- Effect: Evidence lost after wasted retries even though a truncated bundle would have been accepted; the drop counter records that something was lost but not that it was recoverable.
- Owner: partial:Q9 — Q9 owns 'size ceilings the backend will accept (intake item c)' for sizing ahead of time, and Q10 bounds the retries, but neither owns the client's reaction to a rejection: no permanent/transient distinction, no downsize-and-retry
- Rationale: Q9 and Q10 read in full; 'reject' appears in the plan only for BoundaryError rejections, D-0014's rejection, and MQTT 5 rejection — never for the report endpoint's response handling.

**[medium] Version-skewed bundle rejected by a backend validating a newer contract**
- Stage: receiving side — schema drift
- Mechanism: The schema is a vendored OpenAPI contract on both sides. Fleet devices on a RAM-disk OS update by image, so rollout windows with old client builds are real; a backend already validating the next contract version 400s a bundle that is valid per the build that produced it, and retries cannot fix a validation failure.
- Effect: Reports lost during rollout windows — the periods when new-build errors are most likely and the reports most valuable.
- Owner: partial:Q9 — Q9 stamps 'schema version' in the envelope header (and RD-7 reserves format version/creator/build), which makes multi-version acceptance possible, but no question owns the compatibility policy (how many versions back the backend accepts, who coordinates evolution), and 'What this track does not decide' scopes out the receiving side beyond 'accepts the contracted payload over HTTP'
- Rationale: The version stamp is present in Q9's enumeration — genuine partial coverage. The policy that makes the stamp useful is explicitly outside the track's scope, and no intake item asks the backend's validation posture (item c asks origin, size, auth, infrastructure only).

**[medium] Later triggers starved while a stuck bundle holds the delivery slot**
- Stage: delivery — outage concurrency
- Mechanism: One-bundle-at-a-time plus a sustained outage means the slot is occupied by a bundle that cannot send; a second, possibly more important incident triggers during that window and must coalesce, queue, or drop.
- Effect: The second incident's evidence is never bundled, or a queue of bundles accumulates against the memory envelope (interacting with the unaccounted-bundle-bytes mode above).
- Owner: Q7
- Rationale: Explicitly owned: Q7 'whether a trigger during an in-flight bundle coalesces, queues, or drops', with Q10 owning the one-at-a-time slot policy the question presupposes. Coverage evidence; the memory interaction of a 'queues' answer feeds the partial finding on bundle bytes.

**[medium] Bundle lost when the tab dies during backoff or mid-POST**
- Stage: delivery — tab death mid-retry
- Mechanism: Reload, navigation, or renderer crash during a backoff wait discards the in-memory bundle; on floor Firefox (no fetch keepalive) even an in-flight POST is aborted at dismissal. The drop is not recorded anywhere that survives.
- Effect: The exact evidence-loss window the durable-parking option exists to close; without parking, silent loss.
- Owner: Q10
- Rationale: Explicitly owned twice: Q10 makes 'the tab-crash-during-delivery window' the evidence-win test durable parking must pass, and Q9 rules 'a bundle already in flight when the tab dies is a delivery question, not a new trigger' and owns whether a last-gasp summary exists. Coverage evidence.

**[low] The burden of proof cannot be discharged: the deciding fact is requested nowhere**
- Stage: plan — durable-parking ruling
- Mechanism: Q10 requires durable parking to prove 'a real evidence win over the null (the tab-crash-during-delivery window)'. That win is quantified by how often deliveries are interrupted — fleet tab-crash/reload frequency and outage duration patterns — and no intake item requests any such figure (item f covers CPU class, Firefox version, and RAM; item g covers incumbent handlers).
- Effect: The report's parking verdict rests on unstated judgment presented as a passed or failed proof; either verdict is unfalsifiable, which is the failure shape Q15 polices for other claims but not this one.
- Owner: partial:Q10 — states the proof obligations precisely, but the plan requests no fact that could discharge the evidence-win prong; the hard-cap and no-accumulation prongs are decidable from design alone
- Rationale: Intake items a-h read in full against Q10's three prongs. The multi-tab/origin/eviction consequences of adopting parking ARE owned — the seams section defers them to 0150's reservations ('one origin, one reservation, decided once') — so only the quantification gap remains.

**[low] Dropped-bundle counter has no carrier if no later bundle ships**
- Stage: delivery observability
- Mechanism: Q10's null ends in 'drop with a counter', and counters surface in the bundle's own health block (Q6) — i.e. in the next bundle. If no later trigger fires in the session, the drop is observable nowhere; Q7's absence-based detection is scoped to crash-shaped deaths, not delivery failures.
- Effect: Silent evidence loss invisible to the team, violating the plan's own principle (Q2) that 'a capture that silently thinned is worse than a capture that says so' — at the delivery stage instead of the capture stage.
- Owner: partial:Q6 — owns drop counters and the health block as bundle-borne data, but nothing owns surfacing a delivery drop when no subsequent bundle ever ships; Q7's absence-based detection covers crash deaths only
- Rationale: Q6 text: 'what the recorder exposes for observation of itself (drop counters, current byte totals — the bundle's own health block)' — all in-bundle. Q7's compensations ('server-side complement ... plus absence-based detection') are attached to invisible deaths, not undelivered bundles.

**Lane notes**: Hunter for the delivery/receiving stage group. Method: full read of research-plan.md (all 15 questions, charter, RAM-disk section, sweep findings, seams, not-decided, verification notes, facts-needed), full read of facts/app-profile.md and intake/2026-08-22-0160-recorder-facts.md, then targeted greps (idempot|duplicate|dedup|retry|beacon|quota|auth|CORS|reject|413) to verify every UNOWNED/partial claim against the plan text before asserting it. Fifteen modes: 5 fully owned (coverage evidence: Q7, Q9, Q10 x2, Q11), 9 partial, 1 UNOWNED. The single UNOWNED is duplicate delivery after ambiguous failure — Q7's dedup is strictly trigger-side/pre-bundle, Q10 specifies the retry loop without at-least-once/at-most-once semantics, and the receiving side is explicitly out of scope, so nothing owns it on either end; its cheapest fix (a report UUID in the Q9 envelope) is also the subject of the adjacent partial finding. Notable kind-(b) plan defect: the charter's retry null ('until sent or the tab dies') and Q10's restatement ('bounded retries, then drop') contradict each other while Q10 claims to be fixed by charter. Cross-stage handoff: the 'trigger during held bundle' mode (Q7-owned) and the 'bundle bytes outside the envelope' partial interact if Q7 answers 'queue' — flagged in both rationales.


### Lane: config (13 modes)

**[high] Bucket declared with no bound**
- Stage: config validation at startup
- Mechanism: A bucket is registered in the startup-injected config with neither a count cap nor a byte cap; the ring retains every projected record indefinitely.
- Effect: Unbounded RAM growth in the capture buffers; on the RAM-disk devices a full RAM disk is an OS-level failure (plan, RAM-disk premise section), so the recorder becomes the incident it exists to observe.
- Owner: Q6
- Rationale: Q6 explicitly names "a bucket with no bound" among the combinations that must be "illegal and unrepresentable"; Q2 separately owns enforcement of the byte envelope. Owned.

**[medium] Per-bucket caps conflict with the global envelope**
- Stage: config validation at startup
- Mechanism: The sum of configured per-bucket byte caps exceeds the 10-50 MB envelope, or a single bucket's cap exceeds the global cap; each bucket honors its own bound while the aggregate does not.
- Effect: Capture footprint exceeds the charter envelope despite every local bound holding.
- Owner: Q2
- Rationale: Q2 asks "per-bucket byte caps, a global envelope, or both, and which wins when they disagree" — this conflict is a named sub-question. Owned.

**[low] Trigger configured against a nonexistent bucket**
- Stage: config validation at startup
- Mechanism: A trigger or post-trigger-window declaration references a bucket id absent from (or disabled in) the registry.
- Effect: Inert trigger or startup fault; a capture the app believes is armed never fires.
- Owner: Q6
- Rationale: Q6 names "a trigger from a bucket that doesn't exist" as a combination to make illegal and unrepresentable. Owned.

**[low] record() reachable from the view layer**
- Stage: layering rule
- Mechanism: Components import the recorder and call record() from render/effect paths; nothing at the package-manager level enforces directory boundaries in the pseudo-monorepo (app-profile), so only path-based lint stands between convention and drift.
- Effect: Layering erosion plus capture cost inside render paths; per Q11's bias, app degradation is the unacceptable direction.
- Owner: Q6
- Rationale: Q6 asks "whether record() is safe to call from anywhere or only below the view layer (the layering blueprint says services/machines, never components — align with D-0002's restricted-import discipline)", and the seams section cites the D-0002/D-0020 lint discipline as the enforcement mechanism. Owned.

**[medium] Nets clobber or are clobbered by incumbent handlers**
- Stage: startup ordering (nets vs incumbents)
- Mechanism: The recorder assigns window.onerror/unhandledrejection instead of chaining, or an incumbent handler installed later replaces the recorder's; whichever installs last wins silently.
- Effect: Either the team's existing reporting path stops working or the recorder's failure nets never fire; both are silent.
- Owner: Q7
- Rationale: Q7 explicitly owns "how nets chain with any existing handlers (intake item g)", and intake item g requests the incumbent-handler facts. Owned.

**[high] Loose TS strictness defeats the unrepresentable-config strategy**
- Stage: config validation at startup
- Mechanism: Q6's enforcement strategy is type-level unrepresentability, but the app's TypeScript strictness is "very loose" with a high volume of agent-authored code (app-profile); an any-typed or partially-typed config object with a missing capacity field compiles and reaches the recorder, and no plan text names runtime validation of the recorder's own config as a backstop — D-0006 validation discipline is invoked for the payload contract only (charter item 2), not for startup config.
- Effect: An illegal combination the design believed impossible (e.g. an effectively unbounded bucket) runs in the field; bounded-by-construction — the safety property the RAM-disk premise elevates — silently fails.
- Owner: partial:Q6 — Q6 owns enumerating illegal combinations but no sub-question asks what validates config at runtime when compile-time unrepresentability is unavailable in this codebase
- Rationale: Q6: "which combinations are illegal and unrepresentable" presumes the type system carries the enforcement; app-profile: "TypeScript strictness: very loose". The plan never mentions runtime config validation, a config schema check at startup, or fail-fast-vs-fail-safe on bad config.

**[medium] record() called against an undeclared or disabled bucket**
- Stage: config validation at runtime
- Mechanism: App code (custom buckets are app-declared) calls record('bucket-x', entry) for a bucket never registered in the startup config, or one whose enabled flag is off. The recorder must throw, drop silently, or auto-create — auto-create violates bounded-by-construction, throwing on the app thread violates Q11's bias.
- Effect: Either an app-thread exception from a diagnostics call, or silent loss of a stream the app believes it is recording.
- Owner: partial:Q6 — Q6's named illegal combinations are declaration-time; the call-time case of record() into a bucket that does not exist is not enumerated, though Q11's failure bias ("silently under-captures is acceptable; one that degrades the app is not") supplies the decision rule once the case is posed
- Rationale: Q6 names "a trigger from a bucket that doesn't exist" but not a record() into one; Q6's self-observation sub-question (drop counters) gives a natural place to count such calls, but nothing asks the question.

**[medium] Trigger surface conflicts with the services-only layering rule**
- Stage: layering rule
- Mechanism: React error boundaries are components by construction, and an explicit capture(reason) call plausibly originates in UI flows (a report-a-problem control); if the D-0002 restricted-import rule confines recorder imports to services/machines, the boundary net and view-originated triggers are illegal by the discipline the plan says to align with — forcing either a lint exemption that erodes D-0002 or an indirection nobody designed.
- Effect: The charter-mandated React-error-boundary net cannot be built without breaking the layering rule, or the rule acquires a normalized exemption.
- Owner: partial:Q6 — Q6 asks the layering question for record() only; neither Q6 nor Q7 asks it for capture(reason) or for the error-boundary components the recorder itself arms
- Rationale: Q6: "whether record() is safe to call from anywhere or only below the view layer"; charter item 1 mandates "React error boundaries" as nets. No plan text reconciles the two.

**[medium] Buckets attach after the traffic they should have seen**
- Stage: startup ordering (taps vs boundary/machines)
- Mechanism: The recorder is one service in the app's composition order; if wire-1 attachment happens after the 0060 boundary connects, the connect-time burst — which under clean:false is the QoS-1 queued-redelivery replay (app-profile MQTT section) — passes unrecorded; if actor.system.inspect() attaches after root actors start, xstate.init and the earliest transitions are never observed. RD-9's "how many items dropped before the window" cannot count events never seen.
- Effect: The bundle for any boot-window failure has empty or truncated buckets exactly when pre-failure context matters most; the report ships a design that never stated an attach-before-start requirement or a composition-order constraint.
- Owner: UNOWNED
- Rationale: Q4 asks "Where exactly does each built-in bucket attach, and at which layer's view" — location and layer, never timing; the sweep notes inspect "can be attached and detached at runtime" without ordering it against actor start; no question, seam note, or intake item addresses recorder startup order relative to boundary connect or machine startup. Searched the full plan for startup/ordering language before claiming this.

**[high] Failure nets armed after bootstrap errors fire**
- Stage: startup ordering (nets arming)
- Mechanism: Errors during module evaluation, config wiring, or first React mount occur before the recorder service arms onerror/unhandledrejection and before any error boundary exists in the tree; nothing buffers early errors (no pre-arm stub is discussed, though Sentry-style loaders are prior art the Q14 comparison could weigh). A boot-loop failure lands in this window on every occurrence.
- Effect: A whole class of failures — startup crashes, plausibly the most common on a fleet device — produces no bundle, and unlike Q7's crash-death classes the plan never says so.
- Owner: partial:Q7 — Q7 owns the "which deaths produce no report" disclosure and absence-based detection, but its enumeration is by death type (OOM, unresponsive, app-manager kills), not by time; the pre-arm temporal window is never named
- Rationale: Q7: "Global nets catch what a page can observe" — a bootstrap error is page-observable but occurs before the observer exists, a gap orthogonal to Q7's enumeration. Intake item g covers incumbent handlers, not arming time.

**[medium] Config frozen at startup with no retune or kill path**
- Stage: hot reconfiguration
- Mechanism: The charter fixes "startup-injected per-bucket config"; changing a bucket depth, enabling a bucket on a misbehaving device, or disabling a recorder that is itself degrading the app requires redeploying the app to the fleet. Meanwhile 0050's facade owns runtime reconfiguration for its own sinks, so a log bucket fed through the facade can have its throttle/redaction changed at runtime while the recorder's config — and the RD-7 config snapshot the bundle stamps — claims stability.
- Effect: Operational rigidity in the field (no diagnostic turn-up, no kill switch short of redeploy), a retrofit that is expensive later, and bundles whose config snapshot can misstate the effective capture conditions for the log bucket.
- Owner: UNOWNED
- Rationale: Goal and Q6 both state config is "injected at service startup" as settled shape; Q6's sub-questions contain no reconfiguration question; the seams section cites "runtime reconfiguration" as 0050-facade-owned for facade concerns only; intake item d requests "the config seeds" (initial buckets and depths), not whether runtime tuning is needed; Q11 owns preventing degradation by design, not remediating it operationally. Searched the plan for reconfiguration language before claiming this — the only occurrence is the 0050 seam citation.

**[medium] Payload-schema skew between fleet clients and the backend validator**
- Stage: version skew across deploys
- Mechanism: The bundle schema is a vendored OpenAPI contract validated under D-0006 discipline; when the schema evolves, devices still running an older app build POST old-schema bundles that a strictly-validating backend rejects; the client's Q10 null (bounded retries, then drop with a counter) then discards the evidence — precisely during deploy windows, when errors are likeliest.
- Effect: Reports become undeliverable for the un-updated part of the fleet; the loss is silent on the server side and counted only in a client that never gets to ship the counter.
- Owner: partial:Q9 — the envelope carries "schema version" (Q9, RD-7) and Q10 asks where our contract's validation happens, but no question owns a version-tolerance policy, intake item c requests origin/size/auth/infrastructure and not version tolerance, and no intake item asks the fleet's update model or cadence
- Rationale: Q9 envelope header list includes "schema version"; RD-7 reserves format version; Q10: "but then its schema validation happens where?". Stamping the version is owned; deciding what the backend does with a stale one is not.

**[medium] Recorder never initialized — silent no-op**
- Stage: config absent
- Mechanism: The integration is omitted, gated behind a flag that is off, or lazy-loaded so late it never runs; record() calls no-op or the module is never imported; nets are never armed. Nothing off-device observes the recorder's health, because Q6's health surface (drop counters, byte totals) lives inside the bundle — which never ships from a recorder that never started.
- Effect: The team believes flight-recorder coverage exists; the absence is discovered at the first incident that needed a bundle.
- Owner: partial:Q6 — Q6 owns the recorder's self-observation but only as "the bundle's own health block", an in-band channel that cannot report a dead recorder; Q7's "absence-based detection" is framed for crash deaths on the Chromium arm, not for detecting recorder-never-started
- Rationale: Q6: "what the recorder exposes for observation of itself (drop counters, current byte totals — the bundle's own health block)"; Q7: "absence-based detection" — the generalization to liveness of the recorder itself is unasked.

**Lane notes**: Stage group: configuration and startup lifecycle. Plan read in full (/home/nn/Projects/app-tooling-research/tracks/0160-flight-recorder/research-plan.md); app facts from /home/nn/Projects/app-tooling-research/facts/app-profile.md (MQTT clean:false redelivery burst, RAM-disk premise, loose TS strictness, pseudo-monorepo lint-only boundaries). Five modes are cleanly owned (Q2, Q6 x3, Q7) and are reported as coverage evidence. Two modes are fully UNOWNED after text search: startup ordering of tap attachment vs boundary/actor start (Q4 covers where, never when), and the absence of any hot-reconfiguration/kill-switch question (config-at-startup is charter-settled shape with no question testing whether runtime change is needed; intake d asks only for initial seeds). The highest-severity partials: loose TS strictness undermining Q6's unrepresentability strategy with no runtime config validation named anywhere, and the pre-arm window in which bootstrap errors fire before nets exist (a whole failure class producing no bundle, unnamed by Q7's death-type enumeration).


### Lane: lifecycle (16 modes)

**[high] Trigger in one tab misses the device's MQTT history**
- Stage: multi-tab — capture topology
- Mechanism: Each tab runs an independent in-RAM recorder. The app-profile (clientId scope entry, 2026-08-18) says the clientId is device-scoped with a single-connection-at-a-time intent that is 'stated as intent, not as an enforced property'. So when two tabs are open, at most one holds the mqtt.js connection; wire-1 and the 0070 inspect hook in the other tab see nothing. A capture(reason) or global-net trigger in the connectionless tab seals a bundle whose MQTT bucket is empty; a trigger in the connected tab misses the erroring tab's xstate/HTTP/log history. If both tabs do connect (the unenforced case), the link-steal war churns both connections and both recorders capture reconnect storms instead of traffic.
- Effect: The bundle's primary bucket is empty or misleading — an empty MQTT ring reads as 'no traffic' rather than 'wrong tab' — and the cross-bucket retrospective context that Q1 names as the recorder's distinct claim does not exist device-wide. The eventual report could ship a per-tab design that never considered which tab owns the evidence.
- Owner: UNOWNED
- Rationale: Full-text search: the plan's only multi-tab mention is line 374 — 'They meet only if question 10 adopts durable parking, at which point the shared origin/schema/eviction/multi-tab decisions 0150's plan reserves apply to this track's store too' — conditional and store-scoped, saying nothing about capture, triggers, or which tab holds the MQTT tap. Q4's tap map, Q7's trigger protocol, and Q9's bundle contents are all silently single-tab. No intake item (a–h) asks about tab usage patterns, and the plan does not cite intake 2026-08-17-0150 item f (single-connection enforcement) even though the app-profile flags it as consequential.

**[medium] Concurrent tabs double-report a shared-cause failure**
- Stage: multi-tab — trigger/delivery
- Mechanism: Every tab arms window.onerror/unhandledrejection/error-boundary nets independently. A device-level cause (backend down, broker down, shared-store corruption) throws in all tabs within the same window; each recorder's dedup/cooldown state is per-instance in-memory, so each tab seals and POSTs its own bundle with no cross-tab coordination (no BroadcastChannel/Web Locks/leader election anywhere in the plan). RD-3 deliberately reserves only one shared clock domain per runtime, so the two bundles' monotonic origins are unrelated and the backend cannot interleave them.
- Effect: N-tabs-fold duplicate load on the report endpoint at exactly the fleet-wide-failure moment, and two same-device bundles that cannot be deduplicated or correlated with each other.
- Owner: UNOWNED
- Rationale: Q7 owns 'trigger dedup and cooldown — an error loop must not produce a bundle storm', but its protocol sub-questions (chaining with incumbent handlers, coalescing an in-flight bundle) are all intra-recorder; nothing in Q7 or Q10 mentions a second recorder instance. The line-374 multi-tab mention covers only the conditional durable store.

**[high] Capture envelope never validated against device RAM, and it multiplies per tab**
- Stage: multi-tab / RAM-disk memory pressure
- Mechanism: The 10–50 MB envelope is stated per recorder ('across all buckets'), and every tab instantiates its own rings, so N tabs hold N × envelope — plus serialization churn and any bfcached copies — on a device whose OS, browser, and browser profile all share one RAM pool. Nothing establishes what fraction of device RAM 50 MB (or 2×50 MB) is: intake item f requests 'CPU class for de-rating the measured costs; the actual Firefox version' — not RAM size — and no other fact or intake item supplies it.
- Effect: The recorder raises baseline memory pressure and with it the probability of exactly the death classes that produce no report (renderer OOM, tab discard, OS OOM-kill, RAM-disk exhaustion). A survey report could recommend an envelope apportionment that is unsafe on the actual hardware, with no declared assumption flagging the gap.
- Owner: partial:Q2 — Q2 owns enforcing the envelope (units, caps, eviction, drop accounting) but nothing owns validating the envelope against device RAM or deciding whether it is per-tab or per-device; intake item f omits RAM size
- Rationale: Q2 asks 'per-bucket byte caps, a global envelope, or both' — enforcement machinery only. The RAM-disk premise section reasons hard about durable-queue accumulation ('a full RAM disk is an OS-level failure') but never turns the same lens on the in-RAM envelope itself. Q11's hazard list is latency/loops, not footprint. The intake item f text confirms RAM is not requested.

**[high] Bundle-assembly transient memory spike breaches the envelope**
- Stage: bundling concurrency / workers
- Mechanism: Sealing a bundle snapshots ring indices, concatenates per-bucket records into one JSON payload, then moves it to the gzip worker — structured clone copies the string unless transfer is used, and the worker holds input plus compressed output. Peak footprint is transiently 2–3× the retained history: a near-full 50 MB capture can spike past 100–150 MB for the duration of compression, on top of every other tab's envelope, at the worst possible moment — immediately after a failure, when the device may already be degraded.
- Effect: The renderer is OOM-killed mid-bundling: the evidence is lost, the death is a silent class producing no report, and the recorder caused the incident it was observing.
- Owner: partial:Q11 — Q11 owns the 'recorder must not become the incident' frame, but its enumerated hazards are dispatch-turn latency, self-capture of the report POST, net re-trigger, and report-through-itself; peak memory at bundling is absent, and Q2's metering is capture-time ring bytes only
- Rationale: Q11's hazard list is explicit and closed ('the sweep's hazards enumerated: …') and contains no memory-spike entry. Q9 prescribes 'JSON with worker-side CompressionStream gzip' without a copy-cost or peak-footprint sub-question. Q2 meters 'once at capture on the already-serialized record' — bundling copies are outside its meter by construction.

**[medium] Gzip-worker failure loses the bundle silently**
- Stage: workers — gzip worker lifecycle
- Mechanism: Q9's worker-side gzip requires spawning a Worker at trigger time or at startup. Worker creation can fail (CSP worker-src, resource exhaustion on the RAM-constrained device); the worker can be killed mid-compress under memory pressure; and while the bundle exists only in worker memory, a tab death loses it even though the main thread believed delivery was in progress. An adopted-SDK posture adds a second variant: the SDK's transport knows nothing about an external worker pipeline.
- Effect: A triggered bundle is silently dropped (no drop counter fires — Q2's accounting covers ring evictions, not pipeline losses), or the recorder's own throw in the worker-error handler feeds the Q11 loop hazard.
- Owner: partial:Q9 — Q9 names worker-side gzip as the mechanism and owns the format decision, but no sub-question owns worker creation failure, fallback (compress on main thread? ship uncompressed?), or where the bundle lives during compression
- Rationale: The only worker mentions in the plan are the sweep finding (line 125, 'worker-side gzip at a conservative 5–10×') and Q9's format sub-question (line 245). Neither carries a failure-handling sub-question, and Q11's hazard list does not include the worker path.

**[low] Worker-origin app events are invisible to every tap**
- Stage: workers — capture reach
- Mechanism: All four built-in taps are main-thread (wire-1 listener, orval mutator/FetchLike wrap, actor.system.inspect, facade sink), and Q6's record() interface is designed without a thread dimension — its 'safe to call from anywhere' sub-question is about the view-layer/service layering (D-0002), not about which thread. If any app code runs in a Web Worker — no app-profile fact says either way, and 'arbitrary app-declared event streams' (the charter's fourth bucket class) could originate there — those events cannot reach record() without a postMessage bridge nobody designs.
- Effect: A silent capture gap the report never declares; a custom-bucket consumer discovers at integration time that the standard interface cannot be called from their code's thread.
- Owner: UNOWNED
- Rationale: No question or intake item asks about the app's worker/thread topology. Q6 addresses call-site legality only in layering terms ('only below the view layer... align with D-0002'). Severity low because the stack (React/Zustand/xstate/mqtt.js over WSS) is plausibly all main-thread — but that is an undeclared assumption, which is itself the plan-level gap.

**[medium] bfcache entry and restore semantics are undefined**
- Stage: reload / bfcache
- Mechanism: On a bfcache-eligible navigation, pagehide fires with persisted=true and the page freezes with buffers intact; timers (delivery backoff, Q8 post-trigger window) suspend; on pageshow(persisted) the page resumes with a dead MQTT socket and a QoS-1 redelivery burst. Three concrete sub-failures: (1) if Q9's last-gasp path keys on pagehide without checking persisted, it sends a death summary for a page that returns — a false death report, duplicated per restore; (2) a bundle mid-retry when the page is cached stalls indefinitely and Chrome may evict the page for pending network activity; (3) a bfcached page pins the full envelope in RAM while invisible to the user. The always-open WSS likely makes these pages bfcache-ineligible in practice — but the plan neither claims nor verifies that, so a design (or an adopted SDK's built-in behavior) could rely on unload finality that does not hold.
- Effect: False or duplicate death reports, stalled delivery, unaccounted RAM pinning, or a survey recommendation that silently assumes pagehide means death.
- Owner: partial:Q9 — Q9 decides whether a last-gasp/page-dismissal sender exists and owns the in-flight-bundle-when-tab-dies question, but nothing anywhere distinguishes bfcache entry from real dismissal, and no question owns restore/re-arm or frozen-state behavior
- Rationale: Grep confirms zero occurrences of bfcache/pagehide/pageshow/visibility/unload in the plan. Q9's closest text: 'the charter's triggers do not include page dismissal, but a bundle already in flight when the tab dies is a delivery question' — it reasons about dismissal without the persisted=true branch where the tab does not die.

**[medium] Crash-reload loop defeats the in-memory trigger cooldown and storms the endpoint**
- Stage: reload — crash loop
- Mechanism: An error that reloads the page (app-manager restart, error-boundary-driven reload, watchdog) re-runs startup: nets re-arm, the error fires early, a near-empty bundle POSTs, the page reloads again. Q7's dedup/cooldown state is in-memory and resets to zero on every incarnation, so it bounds nothing across the loop; each incarnation also starts with empty rings, so every bundle in the storm is context-free.
- Effect: A bundle storm of useless reports at exactly the moment the device is sickest — the failure Q7 says must not happen, produced by a path its in-memory mechanism cannot see.
- Owner: partial:Q7 — Q7 owns dedup/cooldown ('an error loop must not produce a bundle storm') for in-session loops; a cross-incarnation cooldown needs state that survives reload, and the plan never connects Q7's cooldown to Q10's durable-parking decision (the one mechanism that could carry a cooldown stamp across the reload window)
- Rationale: Q7's protocol sub-questions are all within one recorder lifetime. The premise section prices durable parking solely as pending-bundle survival ('buys exactly the tab-crash/reload window'), never as cooldown/loop-detection state, so no question owns the cross-reload variant of the storm.

**[medium] Post-freeze QoS-1 redelivery burst flushes the ring history**
- Stage: backgrounded tab — freeze and resume
- Mechanism: A frozen tab (Chromium after ~5 min hidden) freezes the whole app with the recorder — so no in-page events are missed — but the broker's 45 s keepalive deadline drops the connection, and the clean:false session queues QoS-1 messages meanwhile (app-profile: burst capped ~1000 at the broker). On unfreeze, reconnect delivers the burst through wire-1 in seconds; evict-oldest sweeps the MQTT ring, replacing the pre-freeze history with redelivered backlog exactly when a post-resume error would need the pre-freeze context. The app-profile records this throttling/disconnect cycle as a live suspicion ('whether that is causing background disconnect-resume cycles today is worth checking').
- Effect: Evidence silently replaced by burst traffic; the bundle after a resume-adjacent error shows the flood, not the cause. Drop counters (Q2) at least make the flush visible.
- Owner: partial:Q2 — Q2 owns the eviction policy and drop accounting, so the flush is counted, but no question considers burst-flush as a scenario (e.g., time-bucketed retention, burst detection, or freeze/resume markers in the ring), and Q4's MQTT bucket design does not mention resume redelivery
- Rationale: Q2's eviction text weighs only 'evict-oldest within a bucket is the presumptive policy — state what, if anything, justifies another' with no scenario pressure; the plan never mentions backgrounding, freezing, or throttling (grep-confirmed), despite the app-profile carrying the mechanism.

**[low] Throttled timers stall the post-trigger window and delivery retries**
- Stage: backgrounded tab — timer throttling
- Mechanism: Chromium throttles hidden-tab timers to ~1/min after 5 min (fully suspended when frozen). A Q8 post-trigger window (T ms) armed just before backgrounding does not seal for minutes; delivery backoff timers (Q10 null: retry with backoff, bounded retries) stretch from seconds to minutes each, so 'bounded retries' can span an hour of wall clock — or expire the bundle without ever retrying at a useful cadence.
- Effect: Bundles seal and deliver late, or the retry budget is consumed at throttled cadence and the bundle drops; combined with a device power cycle in the stall window, evidence that had minutes to escape never left.
- Owner: partial:Q8 — Q8 owns the window's semantics (what a second trigger does, whether the window delays delivery, the default) and Q10 owns retry bounds, but neither mentions that background throttling changes both mechanisms' time base
- Rationale: Q8 and Q10 are written in ideal-timer terms; no plan text mentions visibility state or throttling (grep-confirmed). Low severity because the null hypothesis already tolerates delivery loss and the default window is 'plausibly zero'.

**[medium] Browser-initiated tab discard silently destroys buffers and pending bundles**
- Stage: RAM-disk memory pressure — tab discard
- Mechanism: Under memory pressure (likelier on a RAM-disk device, likelier still with a 10–50 MB envelope resident), Chromium discards hidden tabs with no page event — no pagehide, no net fires; the document is simply gone and reloads on next focus with document.wasDiscarded set. All rings and any in-retry bundle vanish. The recorder's own footprint raises the discard probability, a feedback loop.
- Effect: A death class that produces no report and leaves no evidence; frequent enough on constrained devices to be a routine evidence hole rather than an edge case.
- Owner: partial:Q7 — Q7 owns the silent-death class ('renderer OOM/unresponsive/app-manager kills fire no event') and its compensations (Reporting API on Chromium, absence-based detection), and browser tab-discard falls inside that class — but it is unnamed, its Reporting API coverage differs (discard is not a crash report), and the recorder-footprint-raises-discard-rate feedback belongs to Q11's frame and appears in neither list
- Rationale: Q7's enumeration is concrete and does not include memory-saver/discard; the report obligation 'says which deaths produce no report' would only catch it if the surveyor already knew to list it — which is exactly what this finding forces.

**[medium] Power cycle mid-capture or mid-delivery loses everything, by design**
- Stage: device power cycle
- Mechanism: The OS runs from a RAM disk; a power cycle destroys rings, in-flight bundles, worker state, and any IndexedDB parking simultaneously. No trigger can fire and no sender can run.
- Effect: Deaths by power cycle produce no report and no evidence; only server-side absence detection notices.
- Owner: Q10
- Rationale: Squarely owned: the premise section rules 'Durability across a power cycle does not exist on the device, full stop', Q10 carries the does-anything-survive-the-tab decision under that premise, and Q7 owns stating plainly which deaths produce no report plus the absence-based-detection compensation. This row is coverage evidence, not a gap.

**[medium] Bundle envelope carries no tab or page-incarnation identity**
- Stage: multi-tab / bundle schema
- Mechanism: Q9's envelope header and Q12's RD-7 reserve format version, creator, app build, platform, and config snapshot — but no per-runtime-instance id (tab id, page-load nonce, incarnation counter). With two tabs reporting (mode above) or a reload loop, the backend cannot tell two same-device bundles apart, cannot dedupe them, and cannot tell 'tab closed' from 'device gone' when running the absence-based detection Q7 leans on.
- Effect: Same-device bundles are unattributable and unorderable; RD-1's within-bucket sequence numbers and RD-2/RD-3's per-runtime clocks cannot be joined across bundles from one device. Since RD-7 is explicitly the cheap-now/unrecoverable-later list, omitting instance identity is exactly the foreclosure Q12 exists to prevent.
- Owner: partial:Q12 — RD-7 reserves the envelope-identity fields and would be the natural home, but its enumerated list omits any runtime-instance identity, and Q9's header list matches it
- Rationale: Both lists are exhaustive in the plan text (Q9: 'trigger reason and stack, app build/version, config snapshot, per-bucket counters, IngressStats, both clocks, schema version'; RD-7: 'format version, creator, app build, platform, and config snapshot'); neither names a session/tab/incarnation id, and the multi-tab reality that makes it necessary is itself unowned.

**[medium] Second trigger while a bundle is in flight**
- Stage: intra-tab concurrency — triggers
- Mechanism: An error loop or a capture(reason) call during an in-flight bundle raises coalesce/queue/drop ambiguity; unhandled, it double-snapshots rings or interleaves two bundling passes over shared buffers.
- Effect: Duplicate or torn bundles, or unbounded bundling work during an error storm.
- Owner: Q7
- Rationale: Explicitly owned: Q7 asks 'whether a trigger during an in-flight bundle coalesces, queues, or drops' and 'trigger dedup and cooldown'. Coverage evidence.

**[low] Global nets fight incumbent onerror/unhandledrejection handlers**
- Stage: intra-tab concurrency — handler chaining
- Mechanism: The app may already register handlers or another reporter; last-writer-wins on window.onerror or double-handling on addEventListener duplicates or suppresses reports.
- Effect: Lost or duplicated failure-net triggers.
- Owner: Q7
- Rationale: Explicitly owned: Q7 'how nets chain with any existing handlers (intake item g)', and intake item g requests the incumbent-handler facts. Coverage evidence.

**[low] Two tabs sharing a durable parking store**
- Stage: multi-tab — durable store (conditional)
- Mechanism: If Q10 adopts IndexedDB parking, two tabs write pending bundles into one origin-scoped store: eviction races, double-send on recovery, cap accounting shared across writers.
- Effect: Duplicate delivery or clobbered pending bundles.
- Owner: Q10
- Rationale: Conditionally owned by the 'Distinct from neighbours' paragraph: 'They meet only if question 10 adopts durable parking, at which point the shared origin/schema/eviction/multi-tab decisions 0150's plan reserves apply to this track's store too — one origin, one reservation, decided once.' This is the plan's only multi-tab ownership, and it activates only on that branch. Coverage evidence for the store; note it does not extend to capture or triggers (see the UNOWNED multi-tab rows).

**Lane notes**: Stage group: page/environment lifecycle and concurrency. Ownership verdicts verified by full-text grep of the plan for tab/worker/bfcache/pagehide/pageshow/visibility/freeze/background/multi/reload/discard/power/unload: the only multi-tab mention is line 374 (conditional on Q10 durable parking, store-scoped); workers appear only as Q9's 'worker-side gzip' prescription; bfcache/pagehide/pageshow/backgrounding/discard appear nowhere. Direct answers to the brief's explicit checks: (1) the plan does NOT own multi-tab at the capture/trigger/reporting level — the app-profile's device-scoped clientId with an unenforced single-connection invariant makes this the highest-value gap, since the MQTT bucket's contents depend on which tab holds the connection; (2) capture is main-thread-only by construction and the plan never states or verifies that assumption; the worker in the plan is the gzip worker, whose failure handling is unowned; (3) a frozen tab's recorder misses nothing in-page because the whole app freezes with it — the real hazard is broker-side: the clean:false session queues QoS-1 during the freeze and the resume burst flushes the ring via evict-oldest; (4) power cycle is genuinely owned (premise + Q10 + Q7 absence detection); (5) the RAM-disk pressure gap is not the premise section's durable-queue argument (well covered) but the in-RAM envelope itself: intake item f asks for CPU class, not RAM size, and nothing decides per-tab vs per-device envelope. One practical note for the adjudicator: the always-open WSS connection likely makes these pages bfcache-ineligible in Chromium and Firefox, which would moot much of the bfcache row in practice — but the plan neither claims nor verifies that, and an adopted SDK's unload assumptions would inherit the ambiguity, so the row stands as a plan gap rather than a predicted field failure.
