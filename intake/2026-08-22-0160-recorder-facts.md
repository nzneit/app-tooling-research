# 2026-08-22: 0160-flight-recorder — facts the survey needs (intake)

**Status**: open
**Owner**: app owner (a–g), plus whoever owns the report backend (c, h)

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

## d — Initial buckets and depths

Which buckets should exist on day one, and roughly how much history does each want — e.g.
"last 100 MQTT messages, last 20 HTTP exchanges, last 200 transitions, last 50 log lines"?
The charter's examples are placeholders; the real numbers are config seeds the app team
owns. Also: which xstate machines matter most for diagnosis, and do the app's machines set
`version` on their definitions (the replay reservation stamps machine id + version)?

→ Resolution: config seeds recorded in the report's recommended defaults

## e — Build identity at runtime

Is an app build identifier (version string, commit hash, build timestamp) available to
client code at runtime? The bundle envelope stamps it (plan RD-7) so a report is
attributable to the code that produced it. If none exists today, adding one is a build
change worth flagging early.

→ Resolution: updates facts/app-profile.md (Environment section)

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

## g — Incumbent error handling

Does anything already register `window.onerror`, `unhandledrejection` handlers, or React
error boundaries with reporting side effects — an existing crash reporter, an analytics
snippet, hand-rolled logging? The recorder's failure nets must chain with incumbents rather
than fight them (double-reporting, handler-ordering surprises), and if an incumbent
reporting path exists, the report should say whether 0160 replaces or joins it.

→ Resolution: updates facts/app-profile.md; may reshape plan question 7

## h — Reporting-Endpoints feasibility (Chromium crash complement)

Renderer crashes (OOM, unresponsive kills) fire no page event and are invisible to the
recorder's nets by construction. Chromium can deliver out-of-band crash reports to a URL
named in a `Reporting-Endpoints` response header on the app's documents — a backend header
change, no client code, no vendor. (Floor-era Firefox has no Reporting API support at all,
so this is Chromium-arm-only coverage.) Is adding such a header operationally feasible, and
is there an endpoint that could receive `application/reports+json` POSTs?

→ Resolution: decides plan question 7's crash-complement recommendation
