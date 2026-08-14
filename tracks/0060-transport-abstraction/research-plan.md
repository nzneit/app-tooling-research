# 0060-transport-abstraction — research plan

**Status**: draft

## Goal

Decide the shape of a unified, typed transport boundary so UI code never touches mqtt.js
or fetch directly. The boundary is the validation choke point required by D-0006 and
handed off by 0010 (D-0010): it consumes 0010's pipeline artifacts (orval-wrapped REST
client with per-status zod validation; compiled Ajv validators for AsyncAPI payloads),
maps HTTP reason-code bodies into a typed error taxonomy, normalizes both legs' error
shapes into 0010's four-class taxonomy for 0050, and exposes subscriptions and requests
in one idiom. The report decides build vs adopt + wrap composition.

## Key questions

1. Interface shape: event emitter, observable, async iterable, or store-adapter — which
   composes best with the Zustand and xstate consumers (coordinate with 0070)?
2. Where exactly does runtime validation hook in — one ingress per protocol — and how do
   0010's coverage layers (branded types, oxlint no-restricted-imports bans,
   validating-accessor-only exports) attach to this boundary so no code path consumes a
   contracted message around it (D-0006)?
3. Error taxonomy: how do ZodError (REST leg) and Ajv error objects (MQTT leg) normalize
   into 0010's four-class taxonomy (transport error / contract violation / contracted
   business error / unknown topic-or-endpoint), which module owns the taxonomy, and how
   does it surface through 0050's facade as a first-class contract-break signal?
4. Failure plumbing: where do 0010's reject-and-quarantine semantics live (bounded ring
   of raw payload + structured error + topic/endpoint + timestamp), and how is the
   quarantine inspected in dev and in prod?
5. Reconnection, backpressure, and QoS: what does the boundary own
   (resubscribe-on-reconnect, inflight replay, queue bounds, ordering) vs delegate to
   mqtt.js?
6. REST lifecycle: does TanStack Query live inside the boundary (caching, retries,
   dedup, cancellation) or outside it — and where is the seam with 0070's
   race-prevention concerns?
7. Build vs adopt: is this mostly a build with adopted pieces? Which pieces — 0010's
   orval-generated client vs openapi-fetch or ts-rest as the REST surface; RxJS vs
   native async iterables/EventTarget vs xstate actors as the MQTT surface?
8. Per-topic validation policy: where is 0010's per-topic policy table (validate-always
   vs sampled) declared, and how does the boundary enforce it?

## Candidates

- custom boundary layer (build) — the build option, composing 0010's artifacts
- RxJS — https://github.com/ReactiveX/rxjs — observables; retry/backpressure/cancellation operators
- Effect — https://github.com/Effect-TS/effect — typed effects, errors as values, streams
- TanStack Query — https://github.com/TanStack/query — REST request lifecycle (cache, dedup, retries)
- openapi-fetch — https://github.com/openapi-ts/openapi-typescript — ~6 kB typed fetch client over openapi-typescript types
- ts-rest — https://github.com/ts-rest/ts-rest — contract-first REST client with runtime validation
- zodios — https://github.com/ecyrbe/zodios — zod-typed REST client (0010 flags the stack dormant since 2023)
- xstate actors as transport adapters — https://github.com/statelyai/xstate — fromCallback/fromEventObservable wrapping mqtt.js
- mitt — https://github.com/developit/mitt — ~200 B emitter primitive for the build option
- emittery — https://github.com/sindresorhus/emittery — typed async emitter primitive for the build option

## Survey verification notes

- zodios dormancy (0010: @zodios/core last shipped 2023-08-22, Zod ^3 only) — confirm, likely eliminate early.
- TanStack Query scope here is boundary composition (REST lifecycle inside the choke point), not general data-fetching DX.
- The boundary ships to the browser: every candidate scores Browser compatibility and Runtime overhead.

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | medium |
| Integration cost | high |
| Runtime overhead | high |
| Output quality | medium |
| Escape hatch | high |

## Facts needed

- MQTT: topic scheme, QoS levels, peak message rate, reconnect frequency (questions 4–5, 8)
- Whether messages carry ordering metadata (timestamps or sequence numbers)
- REST: approximate operation count; the app's current fetch/client layer
- Browser targets; bundle budget (RxJS and Effect are meaningful adds)
- Team conventions or vetoes on RxJS or Effect adoption
