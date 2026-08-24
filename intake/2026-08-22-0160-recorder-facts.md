# 2026-08-22: 0160-flight-recorder — facts the survey needs (intake)

**Status**: open
**Owner**: app owner (a–g, i–l), plus whoever owns the report backend (c, h)

> **Items a–l answered 2026-08-23** (inline below, in the user's words). All twelve are
> recorded in [facts/app-profile.md](../facts/app-profile.md) and the 0160 report was revised
> against them. **Two items remain open**: **m** and **n** below, added 2026-08-23 from the
> failure-mode enumeration over the recommended design.
>
> **Six answers did not fully close their questions**, and the report carries each as a
> declared assumption rather than inferring the rest:
>
> - **item b** described the app's existing scrubbing *mechanism*, not a *policy* — nobody has
>   ruled what may leave the device, so the report keeps a conservative default and does not
>   read "a scrubber exists" as permission to ship payloads verbatim.
> - **item a** answered for MQTT payloads only; REST response-body sizes are still assumed by
>   analogy, and so are the non-MQTT terms of the byte arithmetic.
> - **item c** answered the endpoint's size question but not whether it accepts
>   `Content-Encoding: gzip`; the report specifies gzip as an *ask*, not a capability.
> - **item e** defined the build identifier's format in the future tense without saying whether
>   page code can read it at runtime — the half that decides whether a build change is owed.
> - **item i** answered that a fleet-unique device id is available, but not whether it may
>   appear inside a report leaving the device (the same question item b left unruled).
> - **item h** was answered with browser composition (Firefox today, possibly Chromium later)
>   rather than the operational feasibility it asked about. Inert today either way, since
>   Firefox emits no crash reports at any version.
>
> **Seven, on a re-read at 0160's acceptance gate (2026-08-23).** A clause-by-clause pass over
> this file at the gate found one more, which the first pass missed because it is not a
> not-quite-answer but a *truncated* one:
>
> - **item j**'s answer stops mid-clause — "They have distinct views and distinct" — so what
>   else distinguishes the two tabs is unread. The candidates that would complete it (distinct
>   sessions, logins, or clientIds) bear on the single-connection invariant and on 0160's RD-7
>   identity, so the report carries the unread half as a declared assumption and reads only the
>   half that was written. **The lesson is D-0042's own**: the answering check must test the
>   answer text for completeness, not only the question's clauses for coverage — a sentence
>   that simply stops reads as an answer.

Track [0160-flight-recorder](../tracks/0160-flight-recorder/research-plan.md) asks whether
the app gets a memory-bounded per-bucket capture of recent events with triggered error
reporting. The chartering session answered the scope questions (triggers, schema ownership,
the 10–50 MB envelope, delivery's null hypothesis, the replay posture — D-0040). The items
below are facts, not scope: none blocks the go gate, but **a**, **b** and **c** gate parts
of the survey — the byte arithmetic, the redaction design, and the delivery design
respectively cannot be settled without them. Partial answers are fine, and "I don't know"
is worth recording.

## a — Typical and worst-case payload sizes

Roughly how large are (1) a typical and a worst-case MQTT message payload, and (2) a typical
and a worst-case REST response body, in bytes? Order of magnitude is enough.

Every byte-budget figure in the track starts here: how much history 10–50 MB actually holds
per bucket, where truncation thresholds sit, and whether full-payload capture is even
plausible for the buckets that matter. At the ~50 msg/s aggregate, 2 KB average payloads
make a 20 MB envelope ≈ 200 s of full-rate history; 20 KB payloads make it ≈ 20 s.

→ Resolution: updates facts/app-profile.md (MQTT section, payload-size fact)
Typical mqtt payload size is under 10 KB . Worst case mqtt payload is like 50 KB

## b — What may leave the device in an error report

Are there PII, credential, or other sensitivity constraints on what an error report may
contain? Concretely: may raw MQTT payloads and HTTP request/response bodies ship to the
report endpoint verbatim, or must fields be redacted — and if so, which? Who reads the
reports, and does anything regulatory apply to the devices' data?

This decides the redaction rule set (plan question 13), whether the recorder shares 0050's
rules, and it interacts with the replay door: an irreversibly redacted payload cannot
replay, so every redaction is marked (plan RD-10) — but the *rules* are a fact only the
team can supply.

→ Resolution: updates facts/app-profile.md and the plan's question 13
Current functionality that exists today in the app is having a scrubbing function accept an object and then any keys, or sub keys, that match a list of strings will get their values scrubbed.

## c — The report endpoint's particulars

The endpoint exists (charter, 2026-08-22) and the payload schema is ours. What remains:

1. Is it **same-origin** with the app, or cross-origin? (Cross-origin means CORS preflight
   on a JSON POST — risky at page-dismissal time, and it constrains any sendBeacon path to
   CORS-safelisted content types.)
2. What is the **maximum payload size** it will accept, and is gzip (`Content-Encoding`)
   accepted?
3. What **auth** does it require, and is that credential available to the page at trigger
   time?
4. Does it share infrastructure with the MQTT broker or the REST backend — i.e. when the
   transport boundary is degraded, is the report endpoint plausibly still reachable? (Plan
   question 10's delivery-independence design depends on the answer.)

→ Resolution: updates facts/app-profile.md (new report-endpoint entry)
1. Cross origin.
2. Max payload size is negotiable
3. No defined auth arrangement yet, leet's keep things flexible.
4. Separate infrastructure. It will be a service with an endpoint in the cloud to accept our payloads.

## d — Initial buckets and depths

Which buckets should exist on day one, and roughly how much history does each want — e.g.
"last 100 MQTT messages, last 20 HTTP exchanges, last 200 transitions, last 50 log lines"?
The charter's examples are placeholders; the real numbers are config seeds the app team
owns. Also: which xstate machines matter most for diagnosis, and do the app's machines set
`version` on their definitions (the replay reservation stamps machine id + version)?

→ Resolution: config seeds recorded in the report's recommended defaults
Let's keep the last 100 MQTT messages, last 25 http exchanges, last 100 transitions, and last 50 log lines.

## e — Build identity at runtime

Is an app build identifier (version string, commit hash, build timestamp) available to
client code at runtime? The bundle envelope stamps it (plan RD-7) so a report is
attributable to the code that produced it. If none exists today, adding one is a build
change worth flagging early.

→ Resolution: updates facts/app-profile.md (Environment section)
The app build identifier will be semver plus some more: major.minor.patch.full_commit_sha.hotfix_number
Where a standard build's hotfix number is 0, and then it monotonically increments whenever a hotfix build is made.

## f — Device hardware, and the fleet's real browser floor

1. What CPU class are the RAM-disk devices (desktop-class, embedded/Atom-class, ARM)? The
   plan's capture-cost figures were measured on a desktop and de-rated 10× as a guess; the
   real class replaces the guess.
2. What Firefox version does the fleet actually run? The profile says "~124". This is
   unusually consequential: `fetch keepalive` shipped in Firefox 133, so at ≤ 132 the only
   page-dismissal-surviving sender is sendBeacon (≤ 64 KiB) — the plan's two-budget
   delivery design exists because of this line. At ≥ 133 it relaxes materially.
3. How much total RAM do the devices have, and what else shares the RAM disk? Contextualizes
   the 10–50 MB envelope and the durable-parking risk ruling.

→ Resolution: updates facts/app-profile.md (Environment section)
1. desktop class, but low power
2. It is currently firefox 124
3. The devices have anywhere from 6 GB to 16 GB. It is a shared resource with a bit of contention between services on how the memory gets used.

## g — Incumbent error handling

Does anything already register `window.onerror`, `unhandledrejection` handlers, or React
error boundaries with reporting side effects — an existing crash reporter, an analytics
snippet, hand-rolled logging? The recorder's failure nets must chain with incumbents rather
than fight them (double-reporting, handler-ordering surprises), and if an incumbent
reporting path exists, the report should say whether 0160 replaces or joins it.

→ Resolution: updates facts/app-profile.md; may reshape plan question 7
A React error boundary exists

## h — Reporting-Endpoints feasibility (Chromium crash complement)

Renderer crashes (OOM, unresponsive kills) fire no page event and are invisible to the
recorder's nets by construction. Chromium can deliver out-of-band crash reports to a URL
named in a `Reporting-Endpoints` response header on the app's documents — a backend header
change, no client code, no vendor. (Floor-era Firefox has no Reporting API support at all,
so this is Chromium-arm-only coverage.) Is adding such a header operationally feasible, and
is there an endpoint that could receive `application/reports+json` POSTs?

→ Resolution: decides plan question 7's crash-complement recommendation
It's all firefox today, but maybe someday down the line it could be chromium.

<!-- The answer line above was filed below the i–l divider until 2026-08-23, where 0160's
     acceptance gate found item h reading as unanswered in place while its answer floated
     orphaned in the next section's preamble. Moved, not changed. -->

*Items i–l added 2026-08-23, from the failure-mode enumeration over the plan
([register](../tracks/0160-flight-recorder/plan-fmea-enumeration.md)).*

## i — Is a device identifier available to page code, and may it appear in reports?

The bundle needs a device id, a page-incarnation id, and a bundle id (plan question 9) —
without them, retried POSTs duplicate server-side, same-device bundles cannot be joined,
and absence-based crash detection has nothing to key on. The MQTT clientId is
device-scoped on a static roster (facts/app-profile.md) and is the obvious candidate: is
it accessible to application code at runtime, and is it acceptable inside a report
payload? If not, what device identity is available and permitted?

→ Resolution: updates facts/app-profile.md; feeds plan questions 7, 9, 16
Yep, device identifier is available that is unique across a fleet.

## j — Tab usage patterns

How many tabs of the app are typically open on a device — and is more than one ever
legitimate, even transiently? Each tab runs an independent recorder (plan question 16), so
the answer sizes the real per-device memory cost (N × envelope), decides whether cross-tab
trigger coordination is worth designing, and connects to the single-connection enforcement
question intake 2026-08-17-0150 item f already raised.

→ Resolution: feeds plan question 16; may update facts/app-profile.md
Two tabs at most today are open for the app. They have distinct views and distinct

## k — Does any application code run in Web Workers?

All four built-in taps and the `record()` interface are main-thread; worker-origin events
would need a postMessage bridge nobody has designed. If the app is entirely main-thread
today, the report declares that as a stated (and checkable) assumption instead of a silent
one; if not, the interface needs a thread story.

→ Resolution: settles plan question 6's thread dimension
There is some amount of code today that could run in web workers in the near future. It's a scheduled goal for the applicaiton down the line. I don't have exact dates.

## l — How often are deliveries actually interrupted?

Rough figures, order of magnitude: how often do tabs crash or get reloaded in normal
fleet operation, and what do backend outages look like (frequency, typical duration)?
Plan question 10 requires durable parking to prove "a real evidence win over the null" —
the tab-crash-during-delivery window — and that proof is arithmetic only if an
interruption rate exists to multiply. "Nobody has measured" is an acceptable answer and
becomes the report's declared assumption.

→ Resolution: feeds plan question 10's parking verdict
Nobody has measured

*Items m–n added 2026-08-23, from the failure-mode enumeration over the recommended design
([register](../tracks/0160-flight-recorder/design-fmea-enumeration.md)).*

## m — Content-Security-Policy, and how `index.html` is served

Does the app ship a CSP, and does its `script-src` permit inline scripts (`'unsafe-inline'`)
or a per-response nonce? Vite 8 emits a static `index.html`, so a nonce would have to be
injected by whatever serves it.

The report's boot-window compensation is a small inline pre-arm stub in the document head: it
catches errors that fire before the app bundle loads and replays them into the recorder's nets
at init. Under a restrictive CSP it silently never runs, and an empty replay queue at init is
byte-identical to "no pre-boot errors occurred" — so a blocked stub is invisible, which is
exactly the class of silent gap the design exists to prevent. This survey used the same CSP
lens to disqualify fast-redact as a dependency (it compiles with the `Function` constructor),
so the recorder's own prescribed script owes the same check. If inline is barred, the fallback
is an external stub file loaded before the app bundle.

→ Resolution: settles report question 7's pre-arm design; updates facts/app-profile.md

## n — Outbound MQTT publish volume

Roughly what share of the ~50 msg/s aggregate is outbound publishes rather than inbound
messages? Order of magnitude is enough. The app profile records the aggregate rate with no
inbound/outbound split.

Report question 5 declines to pay for the outbound capture gap — successful outbound publishes
appear on no production surface, and closing it needs a new 0060 emission via the
pre-authorized policy-row route — partly on the assumption that outbound volume is small
relative to inbound. If it is material, that verdict should be reopened before the emission
route is dismissed, since an error report that cannot show what the app *sent* is missing half
of any request/response story.

→ Resolution: confirms or overturns report question 5's verdict
