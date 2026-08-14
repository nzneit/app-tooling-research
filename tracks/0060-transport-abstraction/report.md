# 0060-transport-abstraction — report

## Summary (STE)

This track examined ten candidates for a unified, typed transport boundary over mqtt.js and fetch. We recommend a build: a small owned package that composes the artifacts from track 0010. The MQTT and connection surface is an xstate 5 actor system over the incumbent mqtt.js. The REST surface is the orval-wrapped client from track 0010. We adopt TanStack Query outside the boundary as the REST request lifecycle. No new runtime framework, RxJS or Effect, enters the boundary.

The most important risk is that we own the boundary glue forever. The dead MQTT-wrapper ecosystem shows that no upstream will maintain this code for us. Known mqtt.js edge cases, the xstate v6 alpha, and harmful TanStack Query retry defaults add smaller risks. The next step is a spike that connects the actor system to a real broker. The spike must also confirm that orval passes the cancellation signal through the mutator.

**As of**: 2026-08-14 (versions evaluated are listed per candidate)
**Recommendation**: build — a thin, owned `transport-boundary` package composing 0010's artifacts, with adopted pieces at the edges: xstate 5.32.5 (incumbent) actor system as the MQTT/connection surface over mqtt.js 5.15.2 (incumbent); 0010's orval 8.24.0 mutator-wrapped client as the REST surface; TanStack Query 5.101.4 adopted **outside** the boundary as the REST consumption lifecycle; mqtt-pattern 2.1.1 (adopt-or-vendor) for topic matching; RxJS 7.8.2 and Effect 3.22.1 explicitly not adopted

## Survey

All facts below were verified against the live web on 2026-08-14. Per D-0001 this is desk research only; nothing was installed or run. Track 0010's accepted report is binding upstream context: the boundary consumes an orval-wrapped REST client with per-status zod validation, compiled Ajv standalone validators on the AsyncAPI leg, the four-class error taxonomy, and reject-and-quarantine failure semantics (D-0010). Cross-cutting choke-point, quarantine, and policy-table prior art is synthesized under Key questions 2, 4, 5, and 8.

### custom boundary layer (build) — composing mqtt 5.15.2 + 0010's artifacts

The build option composes 0010's pipeline artifacts behind one typed boundary: two ingresses (mqtt.js wrapper, orval mutator), an error normalizer to the four-class taxonomy, a per-topic policy table, and a bounded quarantine ring. Every part has shipping prior art to copy. The structural blueprint is tRPC's links architecture (@trpc/client 11.18.0): ordered pipelines ending in a **terminating link** per transport, with [`splitLink` routing operations to different transports by predicate](https://trpc.io/docs/client/links) behind one facade — 0060's exact problem, solved in shipping OSS. The REST-leg shape copies zodios's declarative endpoint tables with per-status `errors` schemas and validate-by-default posture ([api-definition](https://www.zodios.org/docs/api/api-definition), [client docs](https://www.zodios.org/docs/client)) plus its [`isErrorFromPath` caller-facing guards](https://www.zodios.org/docs/client/error); Effect's shaped-client combinators ([platform README @0.97.1](https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/README.md)) show the boundary as a composed value, not a class hierarchy.

The wrapped transport is healthy: mqtt 5.15.2 ([published 2026-07-06](https://registry.npmjs.org/mqtt/latest), repo pushed 2026-07-20, 2.58M weekly downloads, ~quarterly cadence). Its license is MIT despite GitHub's NOASSERTION detection artifact — [`LICENSE.md`](https://raw.githubusercontent.com/mqttjs/MQTT.js/main/LICENSE.md) carries the verbatim MIT text; recorded so nobody trips on the flag later. Its [README](https://raw.githubusercontent.com/mqttjs/MQTT.js/main/README.md) documents the delegation surface: `reconnectPeriod` (default 1000 ms), `resubscribe: true`, `queueQoSZero: true`, QoS 1/2 stores, `transformWsUrl` for WSS auth refresh, and the `handleMessage` one-at-a-time backpressure hook. Three documented hazards land on whoever wraps it: **no size bound exists for the offline queue or in-memory stores** (bounding is necessarily ours); duplicate delivery across offline resubscribe windows ([#909](https://github.com/mqttjs/MQTT.js/issues/909)) plus protocol-legal QoS 1 duplicates; and keepalive starvation when `handleMessage` does slow work ([#1935](https://github.com/mqttjs/MQTT.js/issues/1935)). Browsers additionally "cannot catch many WebSocket errors for security reasons" (README), so connection failure must be inferred from `close`/`offline` timing.

The wrapper ecosystem is a graveyard — async-mqtt dormant since 2022 (obsoleted by mqtt.js v5's first-party `*Async` APIs), paho-mqtt's last npm publish 2018, precompiled-mqtt dead, mqtt-react-hooks the wrong altitude for a validation choke point (sources in the prior-art investigation file). Nobody who needs a serious browser MQTT boundary found anything to adopt; they all wrote the thin owned wrapper. Nothing eliminates the build: its risks are authoring cost and unproven glue, not license, maintenance, or capability gates. **Selected — the recommendation's core.**

### xstate actors (5.32.5) — the MQTT/connection surface idiom

MIT ([LICENSE in repo](https://raw.githubusercontent.com/statelyai/xstate/main/LICENSE)); maintenance strong — repo pushed on the access date, three v5 patches in July 2026 (5.32.3–5.32.5), 5+ distinct human committers in the last 15 commits, [5.18M weekly downloads](https://api.npmjs.org/downloads/point/last-week/xstate). Caveat recorded: a **v6.0.0-alpha line is in flight** (alpha.36 published 2026-08-12) with breaking roadmap items ([discussion #5061](https://github.com/statelyai/xstate/discussions/5061)).

This candidate is an adopted *shape*, not an adopted transport: a prior-art search surfaced no maintained mqtt.js↔xstate adapter (only v4-era WebSocket blog material), so all mqtt glue is owned code either way — choosing xstate actors is a flavor of the build, at **zero marginal dependency cost because xstate is incumbent** (assumption A-1). What it buys over a hand-rolled emitter: lifecycle-scoped cleanup (the callback actor "can (optionally) return a cleanup function, which is called when the actor is stopped" — [callback.ts](https://raw.githubusercontent.com/statelyai/xstate/main/packages/core/src/actors/callback.ts)); a typed emitted-event surface with wildcard tap (`emit()`/`actor.on`, [`types.emitted`](https://stately.ai/docs/event-emitter)); snapshot-subscribable connection state; [systemId discovery with root-only stop](https://stately.ai/docs/system); and a free system-wide dev [inspection API](https://stately.ai/docs/inspection). Two source-verified design constraints: a bare `fromCallback` actor has no snapshot, no `onDone`, and emits nothing via `.subscribe()` — so the handed-out surface must be a **parent machine that invokes the callback actor**; and `fromEventObservable` requires an observable, i.e. it only pays off if RxJS is independently adopted. **Selected as the build's MQTT/connection surface idiom**, contingent on 0070 staying on xstate (Key question 1).

### TanStack Query (@tanstack/react-query 5.101.4)

MIT ([LICENSE in repo](https://raw.githubusercontent.com/TanStack/query/main/LICENSE)); the healthiest candidate in the set — releases days apart, repo pushed 2026-08-13, [63.7M weekly downloads](https://api.npmjs.org/downloads/point/last-week/@tanstack/react-query), six-plus active human maintainers, and **no React v6 exists on npm** (only a Solid-adapter 6.0.0-rc.0), so no imminent churn. query-core is zero-dependency, `sideEffects: false`; measured 17.0 kB gz including query-core ([bundlejs](https://deno.bundlejs.com/?q=@tanstack/react-query@5.101.4)).

The [queryFn seam](https://tanstack.com/query/latest/docs/framework/react/guides/query-functions) is bring-your-own-transport by contract ("literally any function that returns a promise"; must throw for errors; AbortSignal supplied), and orval natively generates the entire hook layer (`client: 'react-query'`) from [0010's existing config](https://orval.dev/docs/guides/react-query) — so the marginal integration is configuration, not code. Two default behaviors are actively hostile to this track and become boundary obligations: failed queries are ["silently retried 3 times, with exponential backoff"](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) — a class-2 contract violation would burn ~7 s of pointless refetching that delays the 0050 signal — and [cancellation is opt-in](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): unless the queryFn consumes `signal`, unmount-cancellation is a silent no-op. The `Register` interface supports one [global typed error](https://tanstack.com/query/latest/docs/framework/react/typescript), fitting the taxonomy's single-owner design; [QueryCache global callbacks](https://tanstack.com/query/latest/docs/reference/QueryCache) receive the Query object + `meta` as a 0050 tap. **Selected — adopt, outside the boundary** (the seam is stated crisply under Key question 6).

### RxJS (7.8.2)

Apache-2.0 ([LICENSE.txt at tag 7.8.2](https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/LICENSE.txt)). Enormous load-bearing adoption (~99.96M weekly downloads) but an unusual maintenance shape: **one stable patch in 40 months** (7.8.2, 2025-02-22), a v8 line abandoned in alpha, v9 at beta.0 (2026-08-04, rebased onto a WICG-Observable polyfill package), and the project's own release notes describe hardening "single-maintainer publishing" ([9.0.0-beta.0 notes](https://api.github.com/repos/ReactiveX/rxjs/releases/tags/9.0.0-beta.0)). The capabilities are real: [`retry` with delay-function backoff](https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/operators/retry.ts), `fromEvent` over Node-style emitters (mqtt.js's 3-argument `message` event needs the `resultSelector` overload to infer), `fromFetch` with abort-on-unsubscribe, and native xstate consumption via [`fromObservable`/`fromEventObservable`](https://stately.ai/docs/observable-actors). But the costs buy little here: ~8–17.6 kB gz ([bundlephobia](https://bundlephobia.com/api/size?package=rxjs@7.8.2)) plus Rx semantics plus a v7→v9 migration, for retry/cancellation vocabulary that is partly redundant with mqtt.js-owned reconnect and the machine's delayed transitions; Zustand has no observable affordance (hand-rolled sink regardless); and RxJS has **no consumer-driven backpressure** — only shedding/buffering — so KQ4/KQ5's bounded-queue code is custom under RxJS too, and a passive `fromEvent` wrap cannot reach mqtt.js's ack-based `handleMessage` hook. **Not selected** (viable, not eliminated): the named fallback MQTT surface if 0070 leaves xstate.

### Effect (effect 3.22.1 / @effect/platform 0.97.1)

MIT ([LICENSE](https://raw.githubusercontent.com/Effect-TS/effect/main/LICENSE)); maintenance strong on raw signals (pushed on the access date, 296 contributors, company-funded) — but the health is currently spent on a v3→v4 rewrite: v4 is at RC (rc.109 published on the access date) while the vendor's guidance is ["v3 remains our recommended choice for production for now"](https://www.effect.website/blog/releases/effect/40-beta), and the HttpClient is 0.x in v3 (its own docs list it ["Unstable"](https://effect.website/docs/platform/introduction/)) and namespaced `unstable/` on the v4 branch. Its primitives map almost one-to-one onto this boundary — typed error channels ([two error types](https://effect.website/docs/error-management/two-error-types/)), verified abort-on-interrupt reaching real fetch AbortControllers ([fetchHttpClient.ts](https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/src/internal/fetchHttpClient.ts)), dropping/sliding/suspend stream buffers — but the adopt-grain is wrong: no xstate or Zustand bridge exists ([xstate discussion #4968](https://github.com/statelyai/xstate/discussions/4968)), so Effect exits to the incumbent consumers only through `toAsyncIterable`/`runPromise` (source-verified at [Stream.ts @3.22.1](https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/effect%403.22.1/packages/effect/src/Stream.ts)), where its typed error channel — the headline benefit — is erased and errors must be reified into plain taxonomy objects anyway. Its Schema would be a *third* validation technology against 0010's two-leg design, and it is the heaviest candidate (the vendor's own v4 post: a minimal v3 Effect+Stream+Schema program is ~70 kB minified). **Rejected as a component adoption; retained as the best prior art** for the taxonomy's tagged-union type design and cancellation semantics.

### openapi-fetch (0.17.0)

MIT (LICENSE files verified at [monorepo root](https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/LICENSE) and [package](https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/packages/openapi-fetch/LICENSE)). Measured 2.91 kB gz ([bundlejs](https://deno.bundlejs.com/?q=openapi-fetch)) — the plan's "~6 kB" figure is the project's own pre-gzip minified claim. Currently dormant: no release in any monorepo package since 2026-02-11, and **zero default-branch commits — human or bot — since 2026-05-05** ([commits query](https://api.github.com/repos/openapi-ts/openapi-typescript/commits?since=2026-05-06T00:00:00Z&per_page=10) returns empty), offset by 7.29M weekly downloads and five named maintainers. Decisive for this track: **types-only by explicit design** — runtime validation closed ["not planned" (#1420)](https://github.com/openapi-ts/openapi-typescript/issues/1420) — so it cannot meet D-0006 alone; adopting it would mean a second generator over the same vendored contract (disjoint type identities vs orval's models) plus hand-written validation middleware duplicating the accepted mutator. Its error union is un-narrowed by status ([discussion #1618](https://github.com/openapi-ts/openapi-typescript/discussions/1618): manual cast required) and empty-body error statuses yield `error: undefined` ([open bug #2530](https://github.com/openapi-ts/openapi-typescript/issues/2530)). **Not selected as the REST surface — adopt the pattern, not the package**: the single-instance middleware shape (per-request hooks keyed by `schemaPath` + method + status, registered once via [`use()`](https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/docs/openapi-fetch/middleware-auth.md)) is imitated on top of orval's mutator.

### ts-rest (@ts-rest/core 3.52.1)

MIT (root file under the British spelling `LICENCE`; [SPDX MIT per GitHub's license API](https://api.github.com/repos/ts-rest/ts-rest/license)) — no hard OSS gate fails, but two independent disqualifiers stack. (1) **Maintenance weak-trending-dormant**: no npm publish of any tag since 3.53.0-rc.1 (2025-06-02); stable frozen at Zod-3-only 3.52.1 since 2025-03-04; the Zod-4/v4 effort stalled in [draft PR #863](https://github.com/ts-rest/ts-rest/pull/863) since 2026-02-06 with community reports of year-long silence and users migrating to oRPC; ["Maintenance and upgrades" #866](https://github.com/ts-rest/ts-rest/issues/866) unanswered since June 2026. (2) **Structural contract-direction conflict**: its hand-authored TS DSL is the source of truth and OpenAPI is an *output* — the reverse of the vendored-OpenAPI-first pipeline — leaving a parallel contract invisible to 0010's oasdiff drift gate; the only OpenAPI→ts-rest bridge, [@openapi-ts-rest/core](https://api.github.com/repos/Carminepo2/openapi-ts-rest), has **no LICENSE file and no license field anywhere — all rights reserved by default, failing D-0003** — and is itself dormant (last publish 2024-10-31). **Rejected for adoption; monitor v4** (revival signal: a stable 3.53/4.0 npm release). Prior art retained: source-verified per-status validation covering declared error statuses ([client.ts @v3.52.1](https://raw.githubusercontent.com/ts-rest/ts-rest/v3.52.1/libs/ts-rest/core/src/lib/client.ts)), [`throwOnUnknownStatus`](https://ts-rest.com/client/fetch) as the class-4 trigger, per-route validation overrides — and the cautionary hole that validation **silently skips non-JSON bodies** ([#789](https://github.com/ts-rest/ts-rest/issues/789)).

### zodios (@zodios/core 10.9.6)

**Eliminated — 0010's dormancy flag confirmed exactly.** Last npm publish of any kind: 10.9.6 on 2023-08-22 (registry `modified` matches — [registry](https://registry.npmjs.org/@zodios/core)); the v11 rewrite died at beta.19 (2023-04-09); last human commit 2023-09-15; peers pinned `zod ^3.x` + `axios ^0.x || ^1.0.0`. The repo's fresh-looking `pushed_at` (2026-08-11) is entirely dependabot branch churn per the [events feed](https://api.github.com/repos/ecyrbe/zodios/events?per_page=10) — a health-check trap worth recording. MIT, so the elimination is purely on maintenance (a high-weight criterion). Its design outlived it and the boundary copies it: [validate-by-default](https://www.zodios.org/docs/client) endpoint tables with per-status `errors` schemas, and [`isErrorFromPath`-style guard functions](https://www.zodios.org/docs/client/error) as the caller-facing taxonomy API.

### mitt (3.0.1)

MIT ([LICENSE in repo](https://raw.githubusercontent.com/developit/mitt/main/LICENSE)); 195 B gz measured ([bundlejs](https://deno.bundlejs.com/?q=mitt@3.0.1)). **Effectively dormant**: no commit to main and no release since 2023-07-04, with one-line fixes (`sideEffects`, NodeNext types, unsubscribe-return) unmerged for 1–3 years despite 29.9M weekly downloads ([repo issues](https://api.github.com/repos/developit/mitt/issues?state=open&per_page=30)). Boundary-critical hazard, source-verified in [src/index.ts](https://raw.githubusercontent.com/developit/mitt/main/src/index.ts): `emit` has no try/catch — a throwing handler skips all remaining handlers and re-enters the mqtt.js callback; `off(type)` silently clears all handlers of a type. **Not adoptable as an npm dependency** (weak maintenance on a high-weight criterion); if a minimal fan-out primitive is ever wanted, vendor its ~110 lines. Under the selected actor surface it is subsumed by the actor mailbox regardless.

### emittery (2.0.0)

MIT ([license in repo](https://raw.githubusercontent.com/sindresorhus/emittery/main/license)); active (2.0.0 on 2026-03-04, 0 open issues) but single-maintainer, and the 2.x line has ~72k of its 46.4M weekly downloads (~78% are the Jest-pinned 0.13.1) — a five-month-old breaking major with little field-testing. Its standout capability — typed, AbortSignal-cancellable async iterators — only matters if the async-iterable idiom had won (it did not, Key question 1), and those iterators ["buffer data each time an event is emitted"](https://github.com/sindresorhus/emittery#api) with **no stated bound**, failing KQ5's queue-bounds requirement out of the box. Async-only delivery (`emit()` defers to the next microtask and resolves when all listeners finish) would dictate the boundary's ordering model. **Not selected**; subsumed by the actor mailbox.

### Wave 2 gap scan — challenger and residual finds

A category sweep (typed MQTT wrappers, unified boundary libraries, observable/async-iterable libraries, typed OpenAPI clients, browser buses) surfaced one challenger and several absorbable finds; every find was dispositioned.

- **oRPC (@orpc/client 1.15.0)** — the living occupant of ts-rest's slot (MIT, published 2026-08-08, ~1M weekly downloads, client-side [`ResponseValidationPlugin`](https://orpc.dev/docs/plugins/response-validation)). **Dismissed in the same breath as ts-rest**: same TS-authored-contract architecture with the same vendored-contract re-authoring cost 0010's orval decision already priced out — its only OpenAPI-ingestion route is the Hey API integration its own docs flag ["still unstable"](https://orpc.dev/docs/openapi/integrations/hey-api) (`experimental_toORPCClient`), its response-validation plugin has documented limits (type-transforming schemas unsupported), and it brings nothing to the MQTT leg where this track's hard problems live. Recorded as the representative if a contract-first REST client is ever reconsidered.
- **mqtt-pattern (2.1.1)** — **absorbed into the build's parts list** (adopt-or-vendor): MQTT topic-filter matching with named wildcards for KQ8's policy table; MIT, patched 2026-02-16, ~100 lines, trivially vendorable ([registry](https://registry.npmjs.org/mqtt-pattern)). Neither emitter primitive nor any framework candidate provides topic matching.
- **openapi-react-query (0.5.4)** — absorbed as evidence, not adopted: [shipping proof](https://openapi-ts.dev/openapi-react-query/) of the "typed client inside TanStack Query's lifecycle" composition (Key question 6); presupposes openapi-fetch, and orval generates its own hooks; shares the openapi-ts monorepo's release lull.
- **The MQTT wrapper graveyard** — ngx-mqtt (Angular-pinned), rxjs-mqtt/musquette/observable-mqtt (dormant/dead), async-mqtt (obsoleted by mqtt.js v5 async APIs), paho-mqtt (npm publish 2018), u8-mqtt/mqtt.ts (hobby-scale), mqtt-emitter (2019), emqx MCP SDK (wrong problem) — **collectively absorbed as evidence** that the typed-MQTT-wrapper category is empty and the MQTT surface is necessarily built.
- **Effection** (Effect's slot at ~2 orders of magnitude less adoption, no schema/error-value story — falls a fortiori with Effect); **IxJS** (the async-iterable operator library: ~25 months without a release — named so that idiom is never re-weighed without it); **native Observable API + observable-polyfill** (Chromium-only incubation, pre-1.0 polyfill — recorded as a forward-compatibility design note: keep the subscription surface shaped like subscribe + AbortSignal); **nanoevents** (third emitter primitive, moot under the actor surface); **typescript-event-target** (the shim if a native-EventTarget surface is ever chosen); **evt** (2.5.9 — typed emitter with context-based detach, [last publish 2025-01-15](https://registry.npmjs.org/evt): single-maintainer with slowing cadence, overlapping emittery without an offsetting advantage — dismissed); **eventemitter3** (5.0.4 — [maintained, 2026-01-19](https://registry.npmjs.org/eventemitter3), but an equivalent Node-style sync primitive to the already-listed mitt for this boundary, changing no decision — dismissed); **strict-event-emitter** (0.5.1 — MSW's typed emitter, [dormant since 2023-09-21](https://registry.npmjs.org/strict-event-emitter) — dismissed); **feTS** ("doesn't perform any runtime operations" — the openapi-fetch D-0006 failure at ~1/140th the adoption); **oazapfts / swagger-typescript-api / openapi-qraft / Microsoft Kiota** (typed-client *generators* — [oazapfts 7.5.0](https://registry.npmjs.org/oazapfts), maintained 2026-03-20; [swagger-typescript-api 13.12.6](https://registry.npmjs.org/swagger-typescript-api), 2026-07-17; [openapi-qraft 2.14.1](https://registry.npmjs.org/@openapi-qraft/react), a typed-TanStack-hooks generator, 2026-05-26; Kiota's TS runtime [still prerelease](https://registry.npmjs.org/@microsoft/kiota-abstractions) at `@microsoft/kiota-abstractions` 1.0.0-preview.103 with no runtime response-validation story relevant to D-0006 — all dismissed as 0010-category codegen, a decision settled on orval); **SWR/alova** (KQ6 is about *where* the lifecycle library sits, not which one); **tRPC/Hono RPC/Connect** (server-coupling or protobuf contracts — though tRPC's links/splitLink topology is absorbed as the copied architecture); **wonka/xstream/@most/core/callbag** (maintenance-mode or dead); **broadcast-channel** (dismissed on assumption A-13 — reopens if tabs share one MQTT connection).

## Key questions

**1. Interface shape: event emitter, observable, async iterable, or store-adapter — which composes best with the Zustand and xstate consumers?**
An actor/emitter-shaped surface: a machine-rooted xstate actor system for the MQTT leg and connection state, plus plain promise-returning validated request functions for the REST leg. No single one of the four idioms wins alone; the xstate actor surface natively presents three at once — typed emitted events (`emit()`/`actor.on` with a wildcard tap), snapshot subscription as the store-adapter, and an inbound command channel (`actor.send`) that emitters and observables lack entirely. The alternatives lose on composition: RxJS composes first-class with xstate but Zustand needs a hand-rolled sink anyway, and it costs ~8–17.6 kB gz plus a v7→v9 transition; async iterables have no multicast primitive, emittery's buffered iterators are unbounded, and the idiom's operator library (IxJS) is ~25 months stale; bare emitters have no lifecycle scoping, no connection-state story, no command channel (and mitt has no error isolation); Effect Streams exit to the incumbents only through `toAsyncIterable`/`runPromise`, erasing the typed error channel. Because `fromCallback` actors have no snapshot/`onDone` (source-verified), the handed-out surface is a parent machine invoking the callback actor; the REST leg stays promise-shaped, optionally wrapped as `fromPromise` request actors where 0070's machines drive fetching. Two wires exist for two different jobs, and the boundary keeps them distinct: discrete domain events — contract-break emissions and other one-shot business events — reach Zustand and 0050 through the typed `actor.on`/`emit()` emitted-event surface with its wildcard tap; continuous state — connection presentation and full snapshots — reaches Zustand through `actor.subscribe(snapshot => store.setState(project(snapshot)))`, the machine-to-store wire 0070 blesses as its composition idiom (0070 Key question 2). React reads connection state directly via `@xstate/react` `useSelector`, with no Zustand hop needed. **Coordination note for 0070**: this shape is decisively cheapest only if 0070 stays on xstate; if 0070 moves off xstate, the MQTT-surface idiom must be re-decided, with RxJS the named fallback.

**2. Where does runtime validation hook in, and how do 0010's coverage layers attach (D-0006)?**
Exactly one terminating ingress per protocol, with validation immediately inside it — the pattern all four surveyed choke-point designs converge on (zodios endpoint tables, Effect shaped clients, TanStack's queryFn seam, tRPC's splitLink two-transport topology). MQTT ingress: the mqtt.js `message` handler inside the boundary's callback actor — 0010's compiled Ajv validator runs there synchronously, before `sendBack`/`emit`, via a policy-table lookup (question 8), never blocking `handleMessage` (the [#1935](https://github.com/mqttjs/MQTT.js/issues/1935) lesson). REST ingress: 0010's orval mutator, which zod-parses non-2xx reason-code bodies per status; it sits **below** TanStack Query's retry/cache loop, so nothing unvalidated is ever cached, retried, or structurally shared. 0010's three coverage layers attach at these two points: oxlint [`no-restricted-imports`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports) bans `mqtt` and the raw generated client outside the boundary directory (D-0002; overrides-merge caveat per 0010; RxJS deep-path bans unnecessary since RxJS is not adopted); branded types are applied in exactly one place per protocol — the ingress; and the boundary package exports only validating accessors — the started root actor ref plus its `types.emitted` union, the wrapped request functions, and the taxonomy guard helpers — never the raw mqtt client, never raw fetch. One spec item copied from ts-rest's open defect [#789](https://github.com/ts-rest/ts-rest/issues/789): the ingress must define behavior for **every** content type, not just JSON.

**3. Error taxonomy: normalization, ownership, and the 0050 surface.**
Normalization rules, per leg and class: **class 1 (transport error)** — fetch rejection (network/abort/CORS) or timeout on REST; mqtt.js `error`/`close`/`offline`-derived connection failure on MQTT (partly *inferred* from close/offline timing, since browsers hide many WS errors); **class 2 (contract violation)** — a ZodError from a 2xx body failing its schema or a non-2xx body failing its own per-status schema (0010's rule) on REST; Ajv error objects from a payload failing its channel's compiled validator on MQTT; **class 3 (contracted business error)** — a non-2xx reason-code body that *parses* against its declared per-status schema (a successful parse, not a failure, per 0010) on REST; a contracted error/status topic payload that validates on MQTT; **class 4 (unknown topic-or-endpoint)** — an undeclared response status (ts-rest's `throwOnUnknownStatus` is the shipping prior art) or unknown endpoint on REST; an inbound topic matching no policy-table entry on MQTT. **Ownership — the seam 0070 will cite: the four-class taxonomy is owned by a single module of the boundary package, `transport-boundary/errors` (proposed file `src/transport-boundary/errors.ts`).** It exports (i) the `BoundaryError` discriminated union — the four classes as tagged variants carrying `{leg, endpointOrTopic, timestamp, raw}`; (ii) the two normalizers `fromZodError()` and `fromAjvErrors()` — the permanent two-shape integration surface 0010's risk 3 names; and (iii) caller-facing guard functions in the zodios `isErrorFromPath` style. No other module constructs taxonomy values; both ingresses import from it, and it imports from neither — so 0070 and 0050 can depend on it without touching transport code. Effect's tagged-error-union design is the type-level prior art to imitate, without adopting Effect. **Surface through 0050's facade** — three first-class taps: every quarantine push emits a deduped four-class telemetry event (dedup key: endpoint-or-topic + schema path, per 0010; Sentry `zodErrorsIntegration` is the event-shape prior art); the boundary actor's wildcard `actor.on('*', …)` listener gives 0050 a one-line tap on every boundary event including contract-break emissions — the discrete-event surface of the Key question 1 `actor.on`/`actor.subscribe` split; and on the REST leg the `BoundaryError` union is registered as TanStack Query's global error type via the `Register` interface, with QueryCache's global `onError` as the lifecycle-level secondary tap.

**4. Failure plumbing: where do reject-and-quarantine semantics live, and how is the quarantine inspected?**
The quarantine is a boundary-owned, count-bounded in-memory ring (N≈50–200, the Redux-DevTools [`maxAge`](https://github.com/reduxjs/redux-devtools/blob/main/extension/docs/API/Arguments.md) shape) holding 0010's `{raw payload, structured BoundaryError, topic/endpoint, timestamp}`. It lives below both ingresses — below TanStack Query's cache on the REST leg (a quarantined payload must never become a cache entry) and inside the boundary actor's context on the MQTT leg (a bounded array trimmed by a slicing `assign`). Dev inspection is free via the xstate [Inspect API](https://stately.ai/docs/inspection) — `createActor(logic, { inspect })` receives events for every actor in the system, so every message crossing the boundary, quarantine-bound rejects included, is observable with zero custom tooling — plus a `window`-scoped read-only debug accessor (Redux-DevTools style). Prod: ring contents are **not** shipped; the boundary emits only the deduped four-class telemetry event to 0050, with Sentry's [`shouldStore` predicate](https://docs.sentry.io/platforms/javascript/best-practices/offline-caching/) as prior art for a keep-policy hook. Named escalation if quarantined evidence must survive reloads: the Sentry offline-transport pattern (IndexedDB, `maxQueueSize` default 30) — not adopted by default. Replay is deliberately absent for inbound violations: a permanent schema mismatch stays broken; quarantine is for inspection, not retry.

**5. Reconnection, backpressure, and QoS: boundary-owned vs delegated to mqtt.js?**
Delegate the mechanisms, own the bounds and the policy. **Delegated to mqtt.js** (documented defaults at 5.15.2): WSS transport; auto-reconnect timing (`reconnectPeriod`); resubscribe-on-reconnect (`resubscribe: true`, clean sessions); QoS 0 offline queueing (`queueQoSZero: true`); QoS 1/2 inflight persistence + replay via stores; keepalive; auth refresh via `transformWsUrl`. **Owned by the boundary**: queue bounds (mqtt.js documents no size bound for its offline queue or stores — a counted publish queue or bounded custom Store is necessarily ours); duplicate suppression and ordering (QoS 1 duplicates are protocol-legal, plus the [#909](https://github.com/mqttjs/MQTT.js/issues/909) resubscribe-duplicate history; ordering metadata assumed absent per A-8, so dedup keys on messageId + topic); a derived connection-state machine (`connecting → connected → reconnecting → degraded → ended`) projected from the client's event surface — required because browsers hide many WebSocket errors — which is the parent machine of question 1 and adds what mqtt.js has no concept of: a give-up policy (mqtt.js retries forever; delayed transitions give bounded attempts and an explicit `degraded` state), publish gating by connection state, and subscription refcounts for per-feature subscriptions; and backpressure above the client — validate synchronously (compiled Ajv is microseconds per 0010), push into the boundary's own bounded delivery queue, never do slow work in `handleMessage`. RxJS would not have changed this split: it has no consumer-driven backpressure, only shedding/buffering, and a passive `fromEvent` wrap cannot reach the ack-based `handleMessage` hook. REST-leg reconnection is separate and free: TanStack Query's [`online` network mode](https://raw.githubusercontent.com/TanStack/query/main/docs/framework/react/guides/network-mode.md) pauses queries offline and auto-resumes on reconnect, independent of MQTT broker state — the two connectivity notions stay independent by default, which is probably correct.

**6. REST lifecycle: does TanStack Query live inside the boundary or outside it — and where is the 0070 seam?**
The ownership boundary, stated crisply for 0070 to restate verbatim:

> **TanStack Query lives OUTSIDE (above) the transport boundary. The boundary exports validated, branded, taxonomy-erroring request functions — 0010's mutator-wrapped orval client — and those functions are the queryFns. TanStack Query owns, above the boundary: caching, request deduplication, retries (via a taxonomy-aware predicate that retries only class-1 transport errors), background refetch, offline pause/resume, and cancellation signaling. The boundary owns, below the queryFn seam: validation, reason-code parsing, taxonomy mapping, branding, and quarantine. Nothing inside the boundary imports or depends on TanStack Query.**

Rationale: (1) D-0006 ordering — validation must sit below cache/retry/dedup so nothing unvalidated is ever cached or structurally shared, and a quarantined payload must never become a cache entry; (2) the QueryCache is a server-state **store** — burying a second store inside the boundary would hide server-state ownership from 0070's Zustand/xstate domain; (3) it covers only the request/response leg — no subscription idiom exists for MQTT; (4) the queryFn contract is purpose-built for exactly this composition, and orval already generates the hook layer from 0010's existing config (openapi-react-query is independent shipping proof of the same shape). Two obligations land in the boundary's definition-of-done: register the `BoundaryError` union as the global `Register` error type with a taxonomy-aware retry predicate (defaults silently retry a class-2 contract violation 3 times with backoff), and thread `context.signal` into fetch in the mutator (cancellation is otherwise a silent no-op; spike item: verify orval's react-query output passes `signal` through the mutator). **The 0070 race seam**: per-query-key request races → TanStack Query (shared in-flight requests, structural sharing); cross-stream and state-machine races (MQTT-pushed vs REST-fetched state, mutation-vs-subscription echo, command sequencing) → 0070. The one open hazard 0070 must adjudicate before adoption completes: QueryCache-vs-Zustand entity ownership for data arriving on both legs — either push MQTT updates into the QueryCache via `setQueryData` (single server-state store) or partition entity ownership so no entity is served by both legs.

**7. Build vs adopt: which pieces?**
Mostly a build, with adopted pieces at the edges — every "adopt the framework" alternative lost on its own evidence. REST surface: 0010's orval-wrapped client stands; both contract-first challengers fall (zodios confirmed dormant; ts-rest rejected on stacked maintenance and contract-direction disqualifiers, its only OpenAPI bridge unlicensed and failing D-0003), and openapi-fetch is types-only by design (cannot meet D-0006) — its middleware *pattern* is adopted, not the package. MQTT surface: the xstate actor idiom over mqtt.js — a build-with-an-adopted-idiom at zero marginal dependency cost, since the gap scan proves the typed-MQTT-wrapper category is a graveyard and the mqtt glue is owned code under *every* candidate; xstate contributes lifecycle-scoped cleanup, typed emitted events, the reconnection-presentation statechart, systemId discovery, and the free inspection plane. RxJS is viable but not selected: its operator advantages are partly redundant with mqtt.js-owned reconnect and the machine's delayed transitions, it adds ~8–17.6 kB gz, and it is mid-transition with self-described single-maintainer publishing. Effect is rejected as a component: wrong adopt-grain (typed errors die at the exit), a third validation technology, and the worst window of its release cycle — it survives as prior art. Emitter primitives are subsumed by the actor mailbox (mitt vendor-only if ever needed; emittery only pays off under the async-iterable idiom). Adopted around the boundary: TanStack Query (outside, question 6); mqtt-pattern for topic matching (adopt-or-vendor, ~100 lines); the tRPC links/splitLink topology as the copied architecture.

**8. Per-topic validation policy: where is the policy table declared, and how is it enforced?**
The policy table is declared in the boundary package, beside 0010's compiled-validator map, keyed by AsyncAPI channel; it is enforced by topic-filter match (mqtt-pattern) + table lookup at the single MQTT ingress, before validation runs. Every shipping implementation of this pattern is broker-side and commercial — [EMQX Enterprise Schema Validation](https://docs.emqx.com/en/emqx/latest/data-integration/schema-validation.html), [HiveMQ Data Hub](https://docs.hivemq.com/hivemq/latest/data-hub/validation.html), [Confluent Enterprise](https://docs.confluent.io/platform/current/schema-registry/schema-validation.html) — flagged per D-0003/D-0011 as design prior art only, never candidates. The consistent shape to copy: a declarative table of `{topic filter → schema ref → on-failure action + log/metric emission}`, with actions translated to the browser: `drop` → reject-and-quarantine; `redirectTo` → the quarantine ring (the browser's dead-letter topic); log/metrics → 0050 telemetry. Confluent's negative lesson binds: the policy must run real validators, not schema-ID presence checks. Under the assumed ≤1k msg/s rate (A-4), validate-always is affordable everywhere; the sampled tier is a knob the table carries but does not yet use. **KQ8 is a build-only capability regardless of which libraries sit around the boundary** — no OSS library, client- or broker-side, ships it.

## Rubric comparison

Leading candidates as columns; scores strong/adequate/weak with terse evidence; weights from the research plan. "n-a" where the criterion is inapplicable by design.

| Criterion (weight) | build (custom boundary) | xstate actors 5.32.5 | TanStack Query 5.101.4 | RxJS 7.8.2 | Effect 3.22.1 | openapi-fetch 0.17.0 | ts-rest 3.52.1 |
|---|---|---|---|---|---|---|---|
| License (high) | strong — all primitives MIT, in-repo verified (mqtt.js NOASSERTION is a detection artifact) | strong — MIT LICENSE in repo | strong — MIT LICENSE in repo | strong — Apache-2.0 in repo | strong — MIT in repo | strong — MIT files at root + package | strong — MIT (`LICENCE` file, SPDX-verified) |
| Maintenance health (high) | adequate — mqtt.js healthy (5.15.2, 2026-07-06); owned glue has no upstream | strong — pushed on access date, 3 July patches, 5+ committers; v6-alpha caveat | strong — releases days apart, 6+ maintainers, 63.7M wk downloads | adequate — 1 stable patch in 40 months, bus factor ~1 on publishing, v9 at beta.0 | strong — daily activity, 296 contributors; health spent on v3→v4 rewrite | adequate→weak — zero commits since 2026-05-05, no release since 2026-02-11 | weak — no publish in ~14.5 months, v4 stalled in draft, #866 unanswered |
| TypeScript fit (high) | strong — hand-authored discriminated unions + brands, prior-art-proven | strong — `setup()`/`types.emitted`, typed `fromCallback` generics | strong — full inference + `Register` global error type | strong — typed 9-arity pipe; 3-arg emitter events need resultSelector | strong — typed E channel, the most type-driven surface in the set | strong — per-status types, but error union un-narrowed (#1618) | adequate — `{status, body}` unions, but stable is Zod-3-only |
| Browser compatibility (high) | strong — mqtt.js browser ESM, ws/wss exactly this app's transport | strong — plain ESM, `sideEffects: false`, no Node APIs | strong — zero-dep query-core, dual builds | strong — ESM + tslib only; v9 `sideEffects: true` watch item | strong — pure-TS ESM, FetchHttpClient; FinalizationRegistry needs ~2021+ | strong — thin native-fetch wrapper | strong — fetch-based, 16.9 kB gz |
| Contract-format support (medium) | strong — consumes 0010's zod + Ajv artifacts natively, both legs | weak — neither format; Ajv hand-wired in the actor | weak — zero contract awareness; restored via orval codegen | n-a — stream library; validators attach as operators by design | weak — no OpenAPI/AsyncAPI; Schema is a competing 3rd validator | adequate — OpenAPI 3.x types only, zero runtime artifacts | weak — TS DSL is source of truth; OpenAPI is an *output* |
| Integration cost (high) | adequate — highest authoring cost, but zero impedance with 0010/consumers; every part has a copyable design | adequate — zero new deps (incumbent), but all mqtt glue bespoke + v6 migration | adequate — orval generates the hook layer; taxonomy/retry/signal/ownership work remains | adequate — thin wrap, but Zustand sink hand-rolled + Rx semantics + v7→v9 | weak — new programming model, no Zustand/xstate bridges, benefits die at the exit | adequate — near-zero setup but needs a 2nd generator + bespoke middleware for D-0006 | weak — parallel contract invisible to the oasdiff drift gate |
| Runtime overhead (high) | strong — no framework runtime; compiled-Ajv hot path already budgeted by 0010 | adequate — ~0 marginal (incumbent); per-message machine interpretation unmeasured | adequate — 17.0 kB gz + cache bookkeeping; negligible at REST rates | adequate — ~8–17.6 kB gz tree-shaken; negligible CPU at ≤1k msg/s | adequate — fiber runtime fine at rate; ~70 kB min minimal v3 program is the cost | strong — 2.91 kB gz measured, "virtually zero runtime" | adequate — 16.9 kB gz + one parse per response |
| Output quality (medium) | adequate — unproven until spike; risk sits on mqtt.js edge cases (#909, #1935) | strong — typed events + wildcard, snapshot state, systemId, inspection stream | strong — status × fetchStatus model, structural sharing, cache-level taps | adequate — best operator vocabulary but untyped error channel | strong — typed error values, verified abort-on-interrupt, bounded buffer strategies | adequate — typed per-status pair, but un-narrowed union + `error: undefined` bug #2530 | adequate — per-status validation incl. errors, but opt-in-off + non-JSON hole #789 |
| Escape hatch (high) | strong — every seam owned; mqtt.js deep-override points reachable | strong — raw client fully in hand inside the actor; degrades to plain emitter | strong — bring-your-own-transport queryFn; headless zero-dep core | strong — subscribe/unsubscribe adapts anywhere; promise bridges | strong — toAsyncIterable/runPromise/ManagedRuntime, source-verified | strong — custom fetch, use()/eject(), thin enough to bypass | strong — `api: ApiFetcher` replaces the whole HTTP layer |

Weighted read: the **build + xstate actors + TanStack Query (outside)** composition carries no weak score on any high-weight criterion. RxJS clears that same bar — its only high-weight exposure is maintenance shape, scored adequate rather than weak — so a build + RxJS + TanStack set is not rubric-eliminated; its non-selection rests on the cost/redundancy case in its Survey entry (bundle, Rx semantics, and a v7→v9 transition buying capabilities the incumbents already cover). Effect and ts-rest each carry a weak on Integration cost (high). Eliminated early or scoped out of the table: **zodios 10.9.6** (eliminated — no npm publish of any kind since 2023-08-22, v11 dead at beta.19, Zod-3/axios-pinned; the fresh `pushed_at` is dependabot churn); **mitt 3.0.1** (weak maintenance on a high-weight criterion — dormant since 2023-07-04 with trivial fixes unmerged for years, no error isolation; vendor-only if a minimal emitter is ever needed); **emittery 2.0.0** (only justified had the async-iterable idiom won; unbounded iterator buffers fail KQ5's bounds; ~0.16% of its own download base on the 2.x line); **oRPC** (dismissed with ts-rest as the same architecture with the same vendored-contract re-authoring cost, its OpenAPI-ingestion route self-flagged unstable); and the gap-scan residue (Effection, IxJS, native Observable API, nanoevents, evt/eventemitter3/strict-event-emitter, feTS, the 0010-category generators oazapfts/swagger-typescript-api/openapi-qraft/Kiota, SWR/alova, tRPC/Hono/Connect, wonka/xstream/@most/callbag, broadcast-channel, the MQTT wrapper graveyard) — each dispositioned in the Survey's gap-scan subsection. The @openapi-ts-rest/core bridge is separately flagged as **failing D-0003** (no license anywhere).

## Recommendation

**Shape: build** (of the four shapes: adopt / adopt + wrap / build / skip) — a thin, owned `transport-boundary` package, with adopted pieces at its edges.

**What is built** (each part with named, source-verified shipping prior art):

- Two terminating ingresses in a tRPC-links-shaped pipeline: the mqtt.js callback actor (MQTT) and 0010's orval mutator (REST), each running validation immediately inside (Key question 2).
- The parent connection machine (`connecting/connected/reconnecting/degraded/ended`) with give-up policy, publish gating, subscription refcounts, dedup guard, and a bounded delivery queue (Key question 5), exported as the boundary's actor surface (Key question 1).
- The **`transport-boundary/errors`** module: the four-class `BoundaryError` union, the `fromZodError`/`fromAjvErrors` normalizers, and guard helpers — the taxonomy's single owner, citable by 0070 and 0050 (Key question 3).
- The bounded quarantine ring with dev inspection (xstate inspect + debug accessor) and prod telemetry to 0050 (Key question 4).
- The per-topic policy table `{topic filter → validator → on-failure action + telemetry}`, keyed by AsyncAPI channel, enforced at the MQTT ingress (Key question 8) — a build-only capability no OSS ships.

**What is adopted**: mqtt.js 5.15.2 (incumbent — reconnect/resubscribe/QoS/offline-queue mechanisms); xstate 5.32.5 (incumbent — the actor idiom, with `@xstate/react` 6.1.0 for snapshots); TanStack Query 5.101.4 **outside** the boundary per the Key-question-6 seam statement, with orval generating the hook layer; mqtt-pattern 2.1.1 (adopt-or-vendor, ~100 lines) for topic matching. 0010's artifacts (orval 8.24.0 client + per-status zod, compiled Ajv validators) are consumed as delivered — nothing here reopens 0010.

**What is explicitly not adopted**: RxJS 7.8.2 (the named fallback MQTT surface only if 0070 leaves xstate), Effect 3.22.1 (prior art for taxonomy typing and cancellation), openapi-fetch 0.17.0 (pattern only), ts-rest 3.52.1 / zodios 10.9.6 / oRPC (rejected / eliminated / dismissed above), mitt / emittery / nanoevents (subsumed by the actor mailbox).

**Rationale.** Every framework-adoption path was tested against its own evidence and lost. The MQTT-wrapper category is empty (gap scan), so the mqtt glue is owned code under every candidate; the only real question was which idiom wraps it. The incumbent xstate does so at zero marginal dependency cost with the richest consumer-facing surface (typed events + snapshot + commands + inspection), while RxJS and Effect each charge real bundle, concept, and version-transition costs for capabilities the composition already has (mqtt.js owns reconnect; the machine owns policy; TanStack Query owns the REST lifecycle above the seam). The REST surface was settled by 0010, and both contract-first challengers are confirmed dead or decaying. What remains genuinely novel — the taxonomy normalizer, the policy table, the quarantine, the connection machine — is exactly the part no library sells, and each piece has a named shipping design to copy.

**Constraints applied**: D-0001 (desk research only; every open verification lands in the spike section), D-0002 (coverage lint stays on oxlint `no-restricted-imports`; no new lint toolchain), D-0003/D-0011 (all selected pieces are MIT/Apache-2.0 OSS; the commercial broker-side policy engines — EMQX Enterprise, HiveMQ Data Hub, Confluent Enterprise — are prior art only; @openapi-ts-rest/core is flagged as unlicensed and thus non-OSS), D-0004 (facts/app-profile.md is unfilled; every substituted assumption is declared below), D-0006 (the validation choke point drives the one-ingress-per-protocol design and the below-the-cache ordering), D-0007 (STE summary above), D-0010 (0010's handoff consumed as delivered: orval + mutator, compiled Ajv validators, four-class taxonomy, reject-and-quarantine).

**Risks:**

1. **The build is owned forever** — no upstream will maintain the boundary glue (the dead wrapper ecosystem proves nobody else will). Mitigated by its deliberately small size and the copied designs.
2. **mqtt.js edge-case history lands on us**: duplicate delivery across offline windows ([#909](https://github.com/mqttjs/MQTT.js/issues/909)), resubscribe caveats ([#1216](https://github.com/mqttjs/MQTT.js/issues/1216)), handleMessage keepalive starvation ([#1935](https://github.com/mqttjs/MQTT.js/issues/1935)). Mitigated by the dedup guard, the clean-session assumption (A-5), and never blocking the packet pump; spike-verify.
3. **xstate v6 alpha in flight** (6.0.0-alpha.36 on 2026-08-12; breaking roadmap items in [#5061](https://github.com/statelyai/xstate/discussions/5061)) — boundary code targets v5 `setup()`; isolate xstate API touchpoints for a cheaper migration.
4. **0070 coupling**: the actor-surface choice presumes 0070 stays on xstate; if not, the MQTT idiom must be re-decided, with RxJS the named fallback (Key question 1 coordination note).
5. **TanStack Query defaults are actively harmful for contract violations** (silent 3-retry backoff on class-2 errors) and cancellation is opt-in — the taxonomy-aware retry predicate and mutator signal-threading are definition-of-done, not polish.
6. **Dual sources of truth** (QueryCache vs Zustand for entities served by both legs) is an unadjudicated 0070 decision; adopting TanStack Query without deciding it recreates the shadow-state problem the boundary exists to prevent.
7. **Per-message actor-interpretation overhead is unmeasured** at an unknown peak rate; the ≤1k msg/s assumption (A-4) makes it immaterial, but a spike must measure if rates are higher.
8. **Two error shapes forever**: `fromZodError` + `fromAjvErrors` makes 0010's risk 3 permanent in one module — deliberate and contained, but real integration surface.

**Assumptions declared in place of facts (D-0004; facts/app-profile.md is unfilled — each is a question for the app owner):**

- **A-1**: The app's xstate is already v5 (actors/`emit`/`setup` are v5-only); a v4 app would need a migration first, materially weakening the zero-marginal-cost argument.
- **A-2**: TypeScript ≥ 5.0 (xstate v5 hard requirement; 0010's zod-4 assumption) and React within `^18 || ^19` (react-query 5 peer range).
- **A-3**: mqtt.js is on the current 5.x line (5.15.2 evaluated) over WSS.
- **A-4**: Peak MQTT rate ≤ ~1k msg/s (0010's assumption carried forward) — makes per-message overhead immaterial and the sampled validation tier optional.
- **A-5**: QoS 0/1 with `clean: true` sessions — keeps the worst resubscribe/duplicate bug history out of scope; the dedup guard is retained regardless.
- **A-6**: Browser targets are evergreen and cross-engine (Chromium + Firefox + Safari) — rules out the native Observable API today.
- **A-7**: The bundle budget tolerates ~17 kB gz for TanStack Query; the incumbent deps (xstate, mqtt.js) are ~0 marginal.
- **A-8**: Messages carry no ordering metadata — dedup keys on MQTT packet identity (messageId + topic).
- **A-9**: No team vetoes exist on any selected piece, and no incumbent data-fetching cache layer needs migrating.
- **A-10**: The vendored OpenAPI contracts are 3.x with non-2xx reason-code bodies modeled per-status (0010's assumption, inherited).
- **A-11**: The REST operation count is moderate (tens), keeping the hook surface and policy tables tractable.
- **A-12**: The build tool is a mainstream ESM bundler; REST payloads are JSON-compatible (structural-sharing requirement).
- **A-13**: No multi-tab coordination requirement exists (grounds for the broadcast-channel dismissal — reopens if tabs share one MQTT connection).
- **A-14**: Reconnect frequency is low and episodic — occasional network blips, not a persistently flapping connection — so mqtt.js's default `reconnectPeriod` (1000 ms) and the boundary's bounded give-up policy (Key question 5) are sized for that shape; a flapping-connection environment would need the give-up/backoff policy re-tuned.

## What a spike would validate

Pre-scoped per D-0001; each item is a go/no-go check.

- **Signal threading (decisive for the REST seam)**: configure orval's `client: 'react-query'` output over 0010's config and confirm the generated hooks pass `context.signal` through the custom mutator into fetch; confirm the taxonomy-aware retry predicate (retry class 1 only) and the global `Register` error type compile and narrow at call sites. Fail: cancellation is a silent no-op and the seam design needs a hand-written wrapper layer.
- **Machine + callback-actor prototype against a real broker**: reconnect edges (give-up policy, `degraded` state, publish gating), resubscribe behavior across an offline window with the dedup guard active (the #909 scenario), and confirmation that validation + bounded-queue push in the `message` path never blocks the packet pump (the #1935 scenario).
- **Quarantine ring + normalizers over real error shapes**: implement the bounded ring and `fromZodError`/`fromAjvErrors` over real ZodError and Ajv error objects (extends 0010's failure-semantics prototype); verify the deduped four-class telemetry event shape reaches a 0050 stub via both the wildcard `actor.on('*')` discrete-event tap (Key question 1) and the QueryCache `onError` tap.
- **Per-message overhead at the owner-supplied peak rate**: measure machine-interpretation + emitted-event dispatch per MQTT message in a real browser; the ≤1k msg/s assumption (A-4) predicts it is immaterial — verify, and exercise the policy table's sampled tier if rates are higher.
- **Policy-table enforcement**: run mqtt-pattern matching over the app's real topic scheme (fact needed) against the AsyncAPI-channel-keyed table; decide adopt-vs-vendor for mqtt-pattern's ~100 lines; verify unknown topics route to class 4 + quarantine.
- **Non-JSON ingress behavior**: define and test the ingress behavior for every content type on both legs (the ts-rest #789 lesson) — no silent validation skip.
- **Coverage layers in this repo**: verify oxlint `no-restricted-imports` overrides allow the two ingress modules and ban `mqtt`/raw-client imports everywhere else (0010's overrides-merge caveat), and that the boundary package exports only validating accessors.
- **Conditional re-checks**: openapi-ts monorepo activity only if openapi-react-query is ever reconsidered; a stable ts-rest 3.53/4.0 release only if the contract-first REST slot is reopened (in which case oRPC, not ts-rest, is the representative).

## Sources

All accessed 2026-08-14. Primary evidence was gathered in the nine Wave 2 investigation files (rxjs.md, effect.md, tanstack-query.md, openapi-fetch.md, ts-rest-zodios.md, xstate-actors.md, emitters.md, prior-art.md, gap-scan.md under .superpowers/sdd/2026-08-14-wave-2/survey-0060/); the URLs below are their consolidated source set. Binding upstream: tracks/0010-contract-pipeline/report.md (accepted); plan: tracks/0060-transport-abstraction/research-plan.md; app facts: facts/app-profile.md (unfilled — assumptions A-1…A-13 per D-0004).

### mqtt.js and the build's prior art

- https://registry.npmjs.org/mqtt/latest — accessed 2026-08-14
- https://api.github.com/repos/mqttjs/MQTT.js — accessed 2026-08-14
- https://api.github.com/repos/mqttjs/MQTT.js/releases?per_page=5 — accessed 2026-08-14
- https://api.github.com/repos/mqttjs/MQTT.js/commits?per_page=5 — accessed 2026-08-14
- https://raw.githubusercontent.com/mqttjs/MQTT.js/main/LICENSE.md — accessed 2026-08-14
- https://raw.githubusercontent.com/mqttjs/MQTT.js/main/README.md — accessed 2026-08-14
- https://raw.githubusercontent.com/mqttjs/MQTT.js/main/src/lib/client.ts — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/mqtt — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/895 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/pull/1650 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/749 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/1157 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/1216 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/909 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/issues/1935 — accessed 2026-08-14
- https://github.com/mqttjs/MQTT.js/pull/678 — accessed 2026-08-14
- https://registry.npmjs.org/@trpc/client — accessed 2026-08-14
- https://trpc.io/docs/client/links — accessed 2026-08-14
- https://www.zodios.org/docs/api/api-definition — accessed 2026-08-14
- https://docs.emqx.com/en/emqx/latest/data-integration/schema-validation.html — accessed 2026-08-14
- https://docs.hivemq.com/hivemq/latest/data-hub/validation.html — accessed 2026-08-14
- https://docs.hivemq.com/hivemq/latest/data-hub/policies.html — accessed 2026-08-14
- https://raw.githubusercontent.com/hivemq/hivemq-community-edition/master/README.md — accessed 2026-08-14
- https://docs.confluent.io/platform/current/schema-registry/schema-validation.html — accessed 2026-08-14
- https://docs.sentry.io/platforms/javascript/best-practices/offline-caching/ — accessed 2026-08-14
- https://registry.npmjs.org/@sentry/browser — accessed 2026-08-14
- https://developer.chrome.com/docs/workbox/modules/workbox-background-sync — accessed 2026-08-14
- https://registry.npmjs.org/workbox-background-sync — accessed 2026-08-14
- https://github.com/reduxjs/redux-devtools/blob/main/extension/docs/API/Arguments.md — accessed 2026-08-14
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports — accessed 2026-08-14
- https://api.github.com/repos/mqttjs/async-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/async-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-react-hooks — accessed 2026-08-14
- https://api.github.com/repos/VictorHAS/mqtt-react-hooks — accessed 2026-08-14
- https://registry.npmjs.org/precompiled-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/u8-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/paho-mqtt — accessed 2026-08-14
- https://api.github.com/repos/eclipse-paho/paho.mqtt.javascript — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-localforage-store — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-level-store — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-jsonl-store — accessed 2026-08-14

### xstate actors

- https://registry.npmjs.org/xstate/latest — accessed 2026-08-14
- https://registry.npmjs.org/xstate — accessed 2026-08-14
- https://api.github.com/repos/statelyai/xstate — accessed 2026-08-14
- https://raw.githubusercontent.com/statelyai/xstate/main/LICENSE — accessed 2026-08-14
- https://api.github.com/repos/statelyai/xstate/releases?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/statelyai/xstate/commits?per_page=15 — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/xstate — accessed 2026-08-14
- https://stately.ai/docs/actors — accessed 2026-08-14
- https://stately.ai/docs/system — accessed 2026-08-14
- https://stately.ai/docs/event-emitter — accessed 2026-08-14
- https://stately.ai/docs/actions — accessed 2026-08-14
- https://stately.ai/docs/typescript — accessed 2026-08-14
- https://stately.ai/docs/inspection — accessed 2026-08-14
- https://stately.ai/docs/observable-actors — accessed 2026-08-14
- https://github.com/statelyai/xstate/discussions/5061 — accessed 2026-08-14
- https://github.com/statelyai/xstate/discussions/4968 — accessed 2026-08-14
- https://github.com/statelyai/xstate/discussions/1292 — accessed 2026-08-14
- https://raw.githubusercontent.com/statelyai/xstate/main/packages/core/src/actors/callback.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/statelyai/xstate/main/packages/core/src/actors/observable.ts — accessed 2026-08-14
- https://registry.npmjs.org/@xstate/react/latest — accessed 2026-08-14
- https://deno.bundlejs.com/?q=xstate — accessed 2026-08-14
- https://www.kevinhxu.com/posts/xstate-websocket-machine/index.html — accessed 2026-08-14
- https://dev.to/mattpocockuk/xstate-why-i-love-invoked-callbacks-2f6i — accessed 2026-08-14

### TanStack Query

- https://github.com/TanStack/query — accessed 2026-08-14
- https://api.github.com/repos/TanStack/query — accessed 2026-08-14
- https://api.github.com/repos/TanStack/query/releases?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/TanStack/query/contributors?per_page=10 — accessed 2026-08-14
- https://raw.githubusercontent.com/TanStack/query/main/LICENSE — accessed 2026-08-14
- https://raw.githubusercontent.com/TanStack/query/main/README.md — accessed 2026-08-14
- https://registry.npmjs.org/@tanstack/react-query — accessed 2026-08-14
- https://registry.npmjs.org/@tanstack/react-query/latest — accessed 2026-08-14
- https://registry.npmjs.org/@tanstack/query-core/latest — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/@tanstack/react-query — accessed 2026-08-14
- https://tanstack.com/query/latest — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/query-functions — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/query-retries — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/framework/react/typescript — accessed 2026-08-14
- https://raw.githubusercontent.com/TanStack/query/main/docs/framework/react/guides/network-mode.md — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/reference/QueryClient — accessed 2026-08-14
- https://tanstack.com/query/latest/docs/reference/QueryCache — accessed 2026-08-14
- https://orval.dev/docs/guides/react-query — accessed 2026-08-14
- https://deno.bundlejs.com/?q=@tanstack/react-query@5.101.4 — accessed 2026-08-14

### RxJS

- https://github.com/ReactiveX/rxjs — accessed 2026-08-14
- https://registry.npmjs.org/rxjs/latest — accessed 2026-08-14
- https://registry.npmjs.org/rxjs — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs/releases?per_page=15 — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs/releases/tags/9.0.0-beta.0 — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs/contributors?per_page=10 — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/rxjs — accessed 2026-08-14
- https://bundlephobia.com/api/size?package=rxjs@7.8.2 — accessed 2026-08-14
- https://bundlephobia.com/api/exports-sizes?package=rxjs@7.8.2 — accessed 2026-08-14
- https://deno.bundlejs.com/?q=rxjs@7.8.2 — accessed 2026-08-14 (API returned 404; subset measurement deferred to spike)
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/LICENSE.txt — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/master/LICENSE.txt — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/package.json — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/operators/retry.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/operators/retryWhen.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/observable/dom/fetch.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/observable/fromEvent.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/src/internal/Observable.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/7.8.2/CHANGELOG.md — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs/contents/src/internal/operators?ref=7.8.2 — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/rxjs/contents/packages — accessed 2026-08-14
- https://raw.githubusercontent.com/ReactiveX/rxjs/9.0.0-beta.0/packages/rxjs/package.json — accessed 2026-08-14
- https://registry.npmjs.org/@rxjs%2Fobservable-polyfill — accessed 2026-08-14
- https://registry.npmjs.org/@rxjs%2Fobservable — accessed 2026-08-14 (404 — not yet published)
- https://registry.npmjs.org/observable-polyfill — accessed 2026-08-14
- https://registry.npmjs.org/-/v1/search?text=rxjs%20mqtt&size=6 — accessed 2026-08-14
- https://github.com/WICG/observable — accessed 2026-08-14
- https://groups.google.com/a/chromium.org/g/blink-dev/c/stxSgTgMHog — accessed 2026-08-14

### Effect

- https://github.com/Effect-TS/effect — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/main/LICENSE — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect/releases?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect/releases/tags/effect%403.22.1 — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect/contents/packages — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect/contents/packages/effect/src/unstable?ref=main — accessed 2026-08-14
- https://api.github.com/repos/Effect-TS/effect/contributors?per_page=1 — accessed 2026-08-14
- https://api.github.com/search/code?q=toAsyncIterable+repo:Effect-TS/effect — accessed 2026-08-14
- https://registry.npmjs.org/effect/latest — accessed 2026-08-14
- https://registry.npmjs.org/effect — accessed 2026-08-14
- https://registry.npmjs.org/@effect/platform/latest — accessed 2026-08-14
- https://registry.npmjs.org/@effect/platform — accessed 2026-08-14
- https://registry.npmjs.org/@effect/platform-browser/latest — accessed 2026-08-14
- https://registry.npmjs.org/-/package/effect/dist-tags — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/effect — accessed 2026-08-14
- https://bundlephobia.com/api/size?package=effect@3.22.1 — accessed 2026-08-14
- https://www.effect.website/blog/releases/effect/40-beta — accessed 2026-08-14
- https://www.infoq.com/news/2026/04/effect-v4-beta/ — accessed 2026-08-14
- https://www.sandromaglione.com/newsletter/my-effect-v4-beta-migrations — accessed 2026-08-14
- https://effect.website/docs/stream/introduction/ — accessed 2026-08-14
- https://effect.website/docs/stream/creating/ — accessed 2026-08-14
- https://effect.website/docs/stream/operations/ — accessed 2026-08-14
- https://effect.website/docs/error-management/two-error-types/ — accessed 2026-08-14
- https://effect.website/docs/concurrency/basic-concurrency/ — accessed 2026-08-14
- https://effect.website/docs/batching/ — accessed 2026-08-14
- https://effect.website/docs/runtime/ — accessed 2026-08-14
- https://effect.website/docs/micro/new-users/ — accessed 2026-08-14
- https://effect.website/docs/additional-resources/myths/ — accessed 2026-08-14
- https://effect.website/docs/platform/introduction/ — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/README.md — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/src/Socket.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/src/internal/fetchHttpClient.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/%40effect%2Fplatform%400.97.1/packages/platform/src/internal/httpClient.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/Effect-TS/effect/refs/tags/effect%403.22.1/packages/effect/src/Stream.ts — accessed 2026-08-14
- https://github.com/Effect-TS/effect/issues/3999 — accessed 2026-08-14
- https://github.com/tim-smart/effect-atom — accessed 2026-08-14
- https://standardschema.dev/schema — accessed 2026-08-14

### openapi-fetch

- https://registry.npmjs.org/openapi-fetch/latest — accessed 2026-08-14
- https://api.github.com/repos/openapi-ts/openapi-typescript — accessed 2026-08-14
- https://api.github.com/repos/openapi-ts/openapi-typescript/releases?per_page=15 — accessed 2026-08-14
- https://api.github.com/repos/openapi-ts/openapi-typescript/commits?per_page=20 — accessed 2026-08-14
- https://api.github.com/repos/openapi-ts/openapi-typescript/commits?since=2026-05-06T00:00:00Z&per_page=10 — accessed 2026-08-14 (empty array)
- https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/LICENSE — accessed 2026-08-14
- https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/packages/openapi-fetch/LICENSE — accessed 2026-08-14
- https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/packages/openapi-fetch/README.md — accessed 2026-08-14
- https://openapi-ts.dev/openapi-fetch/ — accessed 2026-08-14
- https://openapi-ts.dev/openapi-fetch/api — accessed 2026-08-14
- https://openapi-ts.dev/openapi-fetch/middleware-auth — accessed 2026-08-14
- https://raw.githubusercontent.com/openapi-ts/openapi-typescript/main/docs/openapi-fetch/middleware-auth.md — accessed 2026-08-14
- https://github.com/openapi-ts/openapi-typescript/issues/1420 — accessed 2026-08-14
- https://github.com/openapi-ts/openapi-typescript/discussions/1618 — accessed 2026-08-14
- https://github.com/openapi-ts/openapi-typescript/issues/2530 — accessed 2026-08-14
- https://deno.bundlejs.com/?q=openapi-fetch — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/openapi-fetch — accessed 2026-08-14
- https://openapi-ts.dev/about — accessed 2026-08-14

### ts-rest, zodios, and the bridge

- https://registry.npmjs.org/@ts-rest/core — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/releases?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/commits?per_page=15 — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/commits?sha=v4&per_page=5 — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/branches?per_page=100 — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/issues?state=all&sort=updated&direction=desc&per_page=12 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/pull/863 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/issues/866 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/issues/789 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/issues/270 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/issues/871 — accessed 2026-08-14
- https://github.com/ts-rest/ts-rest/issues/872 — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/license — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/contents/ — accessed 2026-08-14
- https://api.github.com/repos/ts-rest/ts-rest/contributors?per_page=8 — accessed 2026-08-14
- https://raw.githubusercontent.com/ts-rest/ts-rest/v3.52.1/libs/ts-rest/core/src/lib/client.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/ts-rest/ts-rest/main/libs/ts-rest/core/src/lib/client.ts — accessed 2026-08-14
- https://ts-rest.com/ — accessed 2026-08-14
- https://ts-rest.com/client/fetch — accessed 2026-08-14
- https://deno.bundlejs.com/?q=@ts-rest/core@3.52.1 — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/@ts-rest/core — accessed 2026-08-14
- https://registry.npmjs.org/@zodios/core — accessed 2026-08-14
- https://api.github.com/repos/ecyrbe/zodios — accessed 2026-08-14
- https://api.github.com/repos/ecyrbe/zodios/commits?per_page=15 — accessed 2026-08-14
- https://api.github.com/repos/ecyrbe/zodios/events?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/ecyrbe/zodios/branches?per_page=100 — accessed 2026-08-14
- https://api.github.com/repos/ecyrbe/zodios/contents/LICENSE — accessed 2026-08-14
- https://raw.githubusercontent.com/ecyrbe/zodios/main/README.md — accessed 2026-08-14
- https://www.zodios.org/docs/client — accessed 2026-08-14
- https://www.zodios.org/docs/client/error — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/@zodios/core — accessed 2026-08-14
- https://github.com/Carminepo2/openapi-ts-rest — accessed 2026-08-14
- https://api.github.com/repos/Carminepo2/openapi-ts-rest — accessed 2026-08-14
- https://api.github.com/repos/Carminepo2/openapi-ts-rest/contents/ — accessed 2026-08-14
- https://raw.githubusercontent.com/Carminepo2/openapi-ts-rest/main/package.json — accessed 2026-08-14
- https://raw.githubusercontent.com/Carminepo2/openapi-ts-rest/main/packages/core/package.json — accessed 2026-08-14
- https://raw.githubusercontent.com/Carminepo2/openapi-ts-rest/main/packages/cli/package.json — accessed 2026-08-14
- https://registry.npmjs.org/@openapi-ts-rest/core — accessed 2026-08-14

### mitt and emittery

- https://registry.npmjs.org/mitt/latest — accessed 2026-08-14
- https://registry.npmjs.org/mitt — accessed 2026-08-14
- https://api.github.com/repos/developit/mitt — accessed 2026-08-14
- https://api.github.com/repos/developit/mitt/commits?per_page=10 — accessed 2026-08-14
- https://api.github.com/repos/developit/mitt/issues?state=open&per_page=30 — accessed 2026-08-14
- https://raw.githubusercontent.com/developit/mitt/main/README.md — accessed 2026-08-14
- https://raw.githubusercontent.com/developit/mitt/main/src/index.ts — accessed 2026-08-14
- https://raw.githubusercontent.com/developit/mitt/main/LICENSE — accessed 2026-08-14
- https://deno.bundlejs.com/?q=mitt@3.0.1 — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/mitt — accessed 2026-08-14
- https://registry.npmjs.org/emittery/latest — accessed 2026-08-14
- https://registry.npmjs.org/emittery — accessed 2026-08-14
- https://api.github.com/repos/sindresorhus/emittery — accessed 2026-08-14
- https://raw.githubusercontent.com/sindresorhus/emittery/main/readme.md — accessed 2026-08-14
- https://github.com/sindresorhus/emittery#api — accessed 2026-08-14
- https://raw.githubusercontent.com/sindresorhus/emittery/main/index.js — accessed 2026-08-14
- https://raw.githubusercontent.com/sindresorhus/emittery/main/license — accessed 2026-08-14
- https://github.com/sindresorhus/emittery/releases — accessed 2026-08-14
- https://deno.bundlejs.com/?q=emittery@2.0.0 — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/emittery — accessed 2026-08-14
- https://api.npmjs.org/versions/emittery/last-week — accessed 2026-08-14
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncDispose — accessed 2026-08-14

### Gap scan

- https://registry.npmjs.org/@orpc/client — accessed 2026-08-14
- https://registry.npmjs.org/@orpc/openapi-client — accessed 2026-08-14
- https://api.github.com/repos/middleapi/orpc — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/@orpc%2Fclient — accessed 2026-08-14
- https://orpc.dev/docs/getting-started — accessed 2026-08-14
- https://orpc.dev/docs/plugins/response-validation — accessed 2026-08-14
- https://orpc.dev/docs/openapi/integrations/hey-api — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-pattern — accessed 2026-08-14
- https://github.com/RangerMauve/mqtt-pattern — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/mqtt-pattern — accessed 2026-08-14
- https://registry.npmjs.org/openapi-react-query — accessed 2026-08-14
- https://openapi-ts.dev/openapi-react-query/ — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/openapi-react-query — accessed 2026-08-14
- https://registry.npmjs.org/fets — accessed 2026-08-14
- https://api.github.com/repos/ardatan/fets — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/fets — accessed 2026-08-14
- https://the-guild.dev/blog/announcing-fets-client — accessed 2026-08-14
- https://the-guild.dev/openapi/fets/client/quick-start — accessed 2026-08-14
- https://registry.npmjs.org/effection — accessed 2026-08-14
- https://api.github.com/repos/thefrontside/effection — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/effection — accessed 2026-08-14
- https://registry.npmjs.org/ix — accessed 2026-08-14
- https://github.com/ReactiveX/IxJS — accessed 2026-08-14
- https://api.github.com/repos/ReactiveX/IxJS — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/ix — accessed 2026-08-14
- https://registry.npmjs.org/wonka — accessed 2026-08-14
- https://api.github.com/repos/0no-co/wonka — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/wonka — accessed 2026-08-14
- https://registry.npmjs.org/xstream — accessed 2026-08-14
- https://registry.npmjs.org/@most/core — accessed 2026-08-14
- https://github.com/callbag/callbag — accessed 2026-08-14
- https://dev.to/framemuse/browsers-now-have-observables-and-i-created-a-framework-for-it-42mm — accessed 2026-08-14
- https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Concepts — accessed 2026-08-14
- https://registry.npmjs.org/oazapfts — accessed 2026-08-14
- https://registry.npmjs.org/swagger-typescript-api — accessed 2026-08-14
- https://registry.npmjs.org/@openapi-qraft/react — accessed 2026-08-14
- https://github.com/OpenAPI-Qraft/openapi-qraft — accessed 2026-08-14
- https://registry.npmjs.org/@microsoft/kiota-abstractions — accessed 2026-08-14
- https://registry.npmjs.org/swr — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/swr — accessed 2026-08-14
- https://registry.npmjs.org/alova — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/alova — accessed 2026-08-14
- https://trpc.io/docs/quickstart — accessed 2026-08-14
- https://hono.dev/docs/guides/rpc — accessed 2026-08-14
- https://connectrpc.com/docs/introduction/ — accessed 2026-08-14
- https://registry.npmjs.org/ngx-mqtt — accessed 2026-08-14
- https://github.com/sclausen/ngx-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/@eduardorothdev/rxjs-mqtt — accessed 2026-08-14
- https://github.com/eduardoRoth/rxjs-mqtt — accessed 2026-08-14
- https://registry.npmjs.org/musquette — accessed 2026-08-14
- https://github.com/martenbiehl/musquette — accessed 2026-08-14
- https://registry.npmjs.org/observable-mqtt — accessed 2026-08-14
- https://github.com/srishina/mqtt.ts — accessed 2026-08-14
- https://registry.npmjs.org/mqtt-emitter — accessed 2026-08-14
- https://github.com/emqx/mcp-typescript-sdk — accessed 2026-08-14
- https://registry.npmjs.org/nanoevents — accessed 2026-08-14
- https://api.github.com/repos/ai/nanoevents — accessed 2026-08-14
- https://api.npmjs.org/downloads/point/last-week/nanoevents — accessed 2026-08-14
- https://registry.npmjs.org/typescript-event-target — accessed 2026-08-14
- https://registry.npmjs.org/evt — accessed 2026-08-14
- https://github.com/garronej/evt — accessed 2026-08-14
- https://registry.npmjs.org/eventemitter3 — accessed 2026-08-14
- https://registry.npmjs.org/strict-event-emitter — accessed 2026-08-14
- https://registry.npmjs.org/broadcast-channel — accessed 2026-08-14
