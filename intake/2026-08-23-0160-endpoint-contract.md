# 2026-08-23: the report endpoint's contract — three asks 0160 generated and never registered (intake)

**Status**: open
**Owner**: whoever owns the report backend (the cloud service intake 2026-08-22-0160 item c describes)

These three items came out of the **acceptance gate** on
[0160-flight-recorder](../tracks/0160-flight-recorder/report.md) (2026-08-23). Each was already a
load-bearing dependency of the recommended design, and each existed only as a sentence inside the
report — one of them as a sentence claiming it had been raised as intake when it had not. That is
the failure D-0042 exists to prevent, caught one stage later than it should have been, and the
repair is this file.

None of them blocks the report's verdict, and none blocks the spike. All three are **cheap now and
expensive later**, because the endpoint is a service the team is still building: item a needs a
route added before the OpenAPI contract freezes, item b is a storage-key decision that becomes a
migration once bundles are landing, and item c decides whether a negotiated number means what the
client thinks it means. Answer them in that order if you answer them at all.

**Answering**: append a paragraph under an item, starting `YYYY-MM-DD update — `. Partial answers
are fine and so is "I don't know" — both are recorded as answers. You are not limited to the
options; a better third option is a good outcome. If an earlier paragraph in this file is now wrong,
mark it superseded in place rather than leaving it to contradict the new one, the way
[DECISIONS.md](../DECISIONS.md) handles a superseded entry.

## a — will the endpoint expose a second route that accepts the ≤ 64 KiB loss marker?

**Today**: the endpoint accepts one payload, the triggered bundle, and its schema is ours to define
(facts/app-profile.md, "An error-report HTTP endpoint exists"). The loss marker is a second, much
smaller payload — `{formatVersion, identity, trigger reason, per-bucket drop counters,
sealedButUndelivered: bundleId}`, a few hundred bytes — sent by `sendBeacon` as a `text/plain` Blob
when a tab is dismissed with a sealed bundle still in flight
([report question 9](../tracks/0160-flight-recorder/report.md)).

Why it is contested: the report **refused durable parking** — no IndexedDB queue of sealed bundles —
and named this marker as the entire compensation, on the grounds that a loss reported is better than
a loss that is silent. But `sendBeacon` returns only whether the request was queued; **its response
is unobservable**. So an endpoint with no route for the marker, or one whose parser rejects it,
discards the compensation *and the client can never learn that happened*. This is the one item where
the failure mode is invisible on both sides.

**Options**
1. **A second route** — `POST /v1/flight-recorder/loss-marker`, `text/plain` body containing JSON,
   documented in the same vendored OpenAPI document as the bundle. Costs one handler.
2. **One route, two shapes** — the bundle route accepts either payload and discriminates on
   `formatVersion`/a `kind` field. Cheaper for you, but it makes the bundle route's parser accept a
   `text/plain` body, and a malformed marker and a malformed bundle become the same 400.
3. **No marker route** — the client keeps sending markers into a 404. Delivery losses stay silent,
   and 0160's durable-parking refusal loses the leg it stands on.

**Recommendation**: **1**. It is one handler on a service that is not built yet, and it keeps the two
failure modes distinguishable at the receiver, which is the whole point of the marker. (2) works and
costs less, but collapses the diagnosis it exists to enable. (3) is a real option only if the team
would rather accept silent delivery loss than add a route — and if that is the answer, say so, because
it reopens the durable-parking verdict rather than merely declining a route.

**Who inherits this**: 0160's question 9 (the two budgets), question 10 (the durable-parking refusal
and its revisit trigger), the vendored OpenAPI contract, and the spike's delivery lane.

→ Resolution: the ruling → updates the report's questions 9 and 10 and the vendored contract

## b — does the endpoint deduplicate on `(deviceId, pageIncarnationId, bundleId)`, or append?

**Today**: nothing is specified. Intake 2026-08-22-0160 item c settled the endpoint's origin,
infrastructure, size posture and auth posture, and asked nothing about storage semantics.

Why it is contested: delivery is **at-least-once by design**. A POST that lands but loses its 2xx is
re-sent, so the same bundle can arrive twice; and with two tabs open, one device-level cause produces
up to two near-duplicate bundles whose per-tab cooldowns cannot see each other. The report chose to
accept both — bounded retry rather than exactly-once, and no cross-tab coordination — **because the
backend would collapse the duplicates**. Three client-side rulings rest on that: the retry loop
(question 10), the refusal of cross-tab trigger coordination (question 16), and the durable-parking
refusal. Nobody asked for it, and append-only is the common shape for a log intake.

**Options**
1. **Upsert on `(deviceId, pageIncarnationId, bundleId)`** — the last write wins; a re-sent bundle
   overwrites its own earlier copy. This is what the report assumes.
2. **Append, and dedup at read time** — store everything, collapse in queries and dashboards. Fine
   for storage, but every incident count is inflated until someone remembers the rule.
3. **Append, no dedup anywhere** — the client would then need exactly-once delivery, which it cannot
   have, or cross-tab coordination, which question 16 refused with reasons.

**Recommendation**: **1**. The key is already in every bundle header, and it is three columns of a
unique index on a service being designed now. (2) is acceptable if the read side is genuinely the
only consumer, but it should be a stated decision rather than a default. (3) is the one answer that
sends work back to the client, and the work it sends back is work the report argued against on
evidence.

**Who inherits this**: 0160 questions 9, 10 and 16, and the "Still assumed" list in its report.

→ Resolution: the ruling → retires a declared assumption in tracks/0160-flight-recorder/report.md

## c — is the negotiated size ceiling measured in wire bytes, and will the endpoint decode gzip?

**Today**: intake 2026-08-22-0160 item c answered "max payload size is negotiable" and did not answer
the compression half of the same question. The report's ask is **50 MB uncompressed with gzip
accepted**.

Why it is contested, and it is not the number: 0160's memory envelope is denominated in the **ring's**
metered UTF-8 bytes, and every record body is a JSON string that gets **re-escaped** when embedded in
the bundle's own JSON — roughly 1.4–1.7× for typical content, plus unmetered header, marker and
quarantine bytes. So the worked 20 MiB-per-tab configuration produces a POST of roughly 28–34 MB
before compression. A ceiling agreed against the ring figure is agreed against the wrong number by a
factor of about 1.5, and the failure appears only in the field, only on the largest bundles — the ones
most worth having.

**Options**
1. **50 MB uncompressed, gzip accepted** — the report's ask. 28–34 MB is a floor for the uncompressed
   worst case, so 40 MB would leave under 20% headroom; a realistic gzipped bundle arrives an order of
   magnitude under 50 MB, and the uncompressed worst case still fits if compression is refused.
2. **A lower ceiling, gzip required** — the client compresses in a worker before every POST and the
   endpoint rejects anything uncompressed. Smaller commitment for you; it makes a dead gzip worker a
   delivery failure rather than a degrade-to-uncompressed, which the report currently treats as a
   total-by-construction fallback.
3. **A lower ceiling, no gzip** — the client ships uncompressed and the recorder's envelope has to
   shrink to fit, which reduces how much history a bundle can carry.

**Recommendation**: **1**, and state the number in **wire bytes** whichever option wins. Cross-origin
means every bundle POST already pays a CORS preflight, so `Content-Encoding: gzip` costs no extra
round trip — gzip is free to accept and cheap to decline. (2) is defensible but removes the design's
compression-failure fallback. (3) is a real trade: it buys a smaller commitment and costs history.

**Who inherits this**: 0160 question 9's ceiling ask, question 2's wire-inflation factor, the worked
configuration's envelope, and the spike's ring-bytes-to-wire-bytes measurement.

→ Resolution: the ruling → updates the report's question 9 and the vendored contract
