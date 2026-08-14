# Wave 1 close-out

**Date**: 2026-08-13. Wave 1 (tracks 0010–0050) is complete: five survey reports drafted, gap-swept, amended, user-accepted (D-0010..D-0014), and verified by a final whole-branch review (verdict: done with fixes; the fixes landed and were re-review-verified before the history was squashed to a single initial commit).

## Before Wave 2 starts

Two validator maintenance items flagged by the final review as fix-before-spikes (both one-line changes in `scripts/check-docs.ts`):

1. Narrow the report check's path match from `endsWith("report.md")` to exactly `tracks/<dir>/report.md`, so future `tracks/*/spikes/*/report.md` and `draft-report.md` files are not falsely policed for an STE summary.
2. Add `intake/` to the link-checked file set (`linkedDocs` in `main()`) — intake files accumulate path references.

Deferred validator hardening that can ride indefinitely (all confirmed loud-fail or unreachable in the current corpus): titled/reference-style link forms, bare `#fragment` links, date-led index-row overmatch, markdown-linked track cells, dangling-symlink ENOENT, 4-backtick nested fences, anchor-fragment test coverage.

## Wave 2 pointers

- Draft `tracks/0060-transport-abstraction/research-plan.md` and `tracks/0070-state-concurrency/research-plan.md` **from 0010's accepted report** (D-0005, D-0010): the transport boundary is the validation choke point (D-0006), consuming the orval-wrap + built-AsyncAPI-leg pipeline; the 0060/0070 error-shape normalization coordination point is flagged in both the 0010 and 0050 reports.
- `facts/app-profile.md` is still unfilled; `intake/2026-08-13-app-profile.md` (status open) lists every assumption the five reports made, phrased as questions. Answering them retroactively strengthens the accepted reports and grounds Wave 2.
- **Prior art for the 0010 spike (user-flagged 2026-08-13):** [offbook](https://github.com/nzneit/offbook) implements the accepted AsyncAPI-leg pipeline end to end — @asyncapi/parser → per-channel payload schema → `ajv.compile` (`allErrors: true, strict: false` + ajv-formats), differing only in compile time (startup vs the recommended Ajv-standalone build step). Patterns to reuse in the spike: draft-07 dialect pinning with an explicit "post-draft-07 keyword NOT enforced" diagnostic instead of silence (`src/registry/index.ts`); fail-closed handling when a schema does not compile (channel stays cataloged, every payload reports `schema-compile-failed` — never a silent GREEN); `anyOf`-wrapping for v2 `message.oneOf`/v3 multi-message topics; and schema-derived fakes (json-schema-faker, deterministic per-topic seeds) round-trip-validated through the same Ajv validator (`src/engine/faker.ts`) — json-schema-faker is a factory-leg candidate the 0010 survey did not list. Its MQTT-binding diagnostics are also taxonomy prior art for 0060.
