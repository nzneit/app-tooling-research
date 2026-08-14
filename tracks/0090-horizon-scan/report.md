# 0090-horizon-scan — report

## Summary (STE)

This track examined the tooling areas that tracks 0010–0070 did not cover. We recommend seven direct adoptions. The tools are knip, dependency-cruiser, MSW for REST test mocks, type-coverage, size-limit, eslint-plugin-jsx-a11y, and OSV-Scanner. We recommend two future tracks: React Compiler adoption and Playwright end-to-end tests. MSW does not fit the MQTT test lane; the aedes broker harness from the 0060 spike keeps that role.

The most important risk is two unknown app facts. The build tool fact gates the size-limit choice and the React Compiler install path. The strictness fact gates the type-coverage ratchet design. Most winning tools have one maintainer each. The next step is to answer the intake questions and accept or amend each disposition.

**As of**: 2026-08-14 (versions evaluated are listed per area)
**Recommendation**: adopt (seven direct adoptions) — knip 6.32.2, dependency-cruiser 18.2.0, MSW 2.15.0 (REST leg, via orval `mock: true`), type-coverage 2.30.1, size-limit 13.0.3, eslint-plugin-jsx-a11y 6.10.2, OSV-Scanner 2.5.0; two proposed future tracks — React Compiler adoption, Playwright end-to-end testing; one skip — MSW on the MQTT-over-WSS leg (the aedes-over-ws harness stands)

## Dispositions

This is a discovery scan, not seven full surveys (research plan: "each area is scored at
the depth its call requires"). **Future track** means a full survey track is warranted;
**direct adopt** means the field resolved cleanly enough to recommend from this scan;
**skip** means not worth doing. Rubric scores live inside each survey section below, at
scan depth; areas dispositioned "future track" get full scoring in that track.

| Area | Winner | Disposition |
|---|---|---|
| Dead code & unused dependencies | knip 6.32.2 | direct adopt |
| Dependency-architecture rules in CI | dependency-cruiser 18.2.0 | direct adopt |
| Test-lane REST mocking | MSW 2.15.0 via orval `mock: true` | direct adopt |
| Test-lane MQTT mocking | — | skip — the aedes-over-ws harness (0060 spike) stands |
| Type coverage / any-leakage ratchet | type-coverage 2.30.1 | direct adopt, ratchet design gated on the strictness fact (intake) |
| React Compiler adoption | babel-plugin-react-compiler 1.0.0 | **future track** (proposed 0100) |
| Bundle-budget enforcement in CI | size-limit 13.0.3 | direct adopt, with a build-tool-fact caveat (intake) |
| Accessibility linting (sweep) | eslint-plugin-jsx-a11y 6.10.2 | direct adopt into the ESLint-in-CI lane |
| End-to-end browser testing (sweep) | Playwright 1.62.1 | **future track** (proposed 0110) |
| Supply-chain vulnerability auditing (sweep) | OSV-Scanner 2.5.0 | direct adopt |

## Survey

### 1. Dead code & unused dependencies — knip

#### knip — primary and only living candidate

[knip](https://github.com/webpro-nl/knip) is at **v6.32.2**, published 2026-08-11 ([npm registry](https://registry.npmjs.org/knip)), with 616 published versions since a 2022-10-09 first release and a release roughly every 2-5 days through July-August 2026 — an actively maintained project, not a stale one. Weekly downloads are **~12.58M** ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/knip)), dwarfing both of its former competitors. License is **ISC**, confirmed directly from the published package manifest ([registry.npmjs.org/knip/6.32.2](https://registry.npmjs.org/knip/6.32.2)) — permissive, no OSS-only conflict.

**Single-tool coverage confirmed**: knip finds unused files, unused/unlisted dependencies, unused exports, and unused exported types/enum members in one run against one config, which is exactly the three-in-one claim to verify. [Knip's own comparison page](https://knip.dev/explanations/comparison-and-migration) states ts-prune "couldn't detect unused dependencies or mutually recursive dead code" and depcheck doesn't do exports at all — knip was built to unify what used to be three separate tools.

**Production mode vs. default mode is a real, documented distinction, not a marketing footnote.** [Knip's production-mode docs](https://knip.dev/features/production-mode) describe default mode as comprehensive — it includes config, test, and Storybook-style files, so exports only used by tests won't be flagged. Production mode restricts analysis to shipped source and `dependencies` (excluding `devDependencies`), which is what would actually catch dead code reachable from the app's real entry point(s). The two modes are meant to run separately, not as a replacement of one by the other — for this app that means CI likely wants both: production mode gated as a hard failure, default mode as an advisory pass. Exports intentionally used only by tests can be exempted per-export with an `@internal` JSDoc tag rather than broad ignore rules.

**Competing tools are both archived and both point at knip.** [ts-prune](https://github.com/nadeesha/ts-prune) was archived by its owner on 2025-09-19; its README now reads "For new projects, we recommend knip." [depcheck](https://github.com/depcheck/depcheck) was archived 2025-06-16; its README states it's "no longer actively maintained" and explicitly recommends knip for "better support for TypeScript, monorepos, and modern build tools." Download counts corroborate the migration: depcheck ~1.77M/week and ts-prune ~602K/week ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/depcheck), [ts-prune](https://api.npmjs.org/downloads/point/last-week/ts-prune)) — both still non-trivial from installed-base inertia, but an order of magnitude below knip and declining as archival notices propagate. `unimported` remains alive but is narrower by design — file-import reachability only, no export- or dependency-level analysis — so it's not a substitute for the exports+deps half of the requirement. No 2026 entrant surfaced in search that credibly beats knip on scope; the discovery search itself (["knip vs unimported dead code detection 2026"](https://www.pistack.xyz/posts/2026-06-19-dead-code-detection-tools-knip-ts-prune-vulture-unimported/)) treats knip as the reference point other tools are compared against, not a peer among equals.

**Config cost for an app with unknown build tool/monorepo status is low, not zero.** Knip ships 182 plugins ([knip.dev/reference/plugins](https://knip.dev/reference/plugins)) covering Vite, webpack, Vitest, ESLint, TanStack Router, and most mainstream tooling, auto-enabled by detecting config files and `package.json` dependencies — so whichever build tool and test runner this app turns out to use, knip likely needs no manual plugin wiring for it. No React-specific, Zustand-, xstate-, or mqtt.js-specific plugin exists or is needed: those are plain library imports that knip's core file/export/dependency graph already walks without a plugin. Monorepo support (workspace-aware analysis) exists as a documented first-class feature, so the app's unresolved monorepo-or-single-package status doesn't gate adoption — it changes one config block, not the tool choice. `npx knip` runs zero-config for a baseline pass; getting to a clean, low-noise CI gate is where real config time goes.

**Bus factor is the one clear weakness.** Knip is maintained by a single person, Lars Kappert ([@webpro](https://github.com/webpro)), and [GitHub Sponsors data](https://github.com/sponsors/webpro) shows a monthly aggregated average around $520 — thin funding for a tool this widely depended on. Release cadence and issue responsiveness are currently strong (14 open issues at last check, near-weekly releases), so there's no near-term maintenance red flag, but a CI gate this load-bearing carries real single-maintainer risk that the two archived predecessors (each also effectively single-maintainer) illustrate isn't hypothetical.

**Documented false-positive modes to plan config around**: dead code confined to a single file (tree-shakeable but invisible to knip's inter-file graph), and non-standard file types (`.vue`/`.svelte`, irrelevant here since this is a `.tsx` app). [Knip's FAQ](https://knip.dev/reference/faq) is explicit that `ignore` patterns hide findings rather than fix the underlying incompleteness, and recommends narrowing `project`/entry globs and per-export `ignoreExportsUsedInFile` over blanket suppression — a real but bounded config-discipline cost.

**Rubric — knip v6.32.2**

| Criterion (weight) | Score | Evidence |
|---|---|---|
| License (high) | strong | ISC, confirmed from the published manifest ([registry](https://registry.npmjs.org/knip/6.32.2)) — permissive, no conflict with D-0003. |
| Maintenance health (high) | strong | 616 releases since 2022, releases every 2-5 days through mid-2026, ~12.58M weekly downloads, both direct competitors archived in its favor ([releases](https://github.com/webpro-nl/knip/releases), [npm](https://api.npmjs.org/downloads/point/last-week/knip)) — but see bus-factor risk above. |
| TypeScript fit (high) | strong | TypeScript-native compiler-API analysis is the tool's core purpose, ships `typescript` support directly ([getting started](https://knip.dev/overview/getting-started)). |
| Integration cost (high) | adequate | `npx knip` runs zero-config, 182 auto-detected plugins cover unknown build tool/test runner/monorepo cases, but reaching a low-noise CI gate needs entry-point/`project` glob tuning and a production-vs-default mode split ([plugins](https://knip.dev/reference/plugins), [production mode](https://knip.dev/features/production-mode)). |
| Output quality (medium) | adequate | Catches inter-file dead files/exports/deps well per practitioner writeups, but explicitly misses same-file dead code and needs config discipline to avoid false positives ([FAQ](https://knip.dev/reference/faq)). |
| Escape hatch (medium) | adequate | Per-export `@internal` tag and `ignoreExportsUsedInFile` exist for targeted suppression; broad `ignore` patterns are documented as an anti-pattern rather than a safe escape hatch ([FAQ](https://knip.dev/reference/faq)). |

**Ruled out:** **ts-prune** — archived 2025-09-19, README redirects to knip; not scored ([repo](https://github.com/nadeesha/ts-prune)). **depcheck** — archived 2025-06-16, README redirects to knip; not scored ([repo](https://github.com/depcheck/depcheck)).

### 2. Dependency-architecture rules in CI — dependency-cruiser

#### dependency-cruiser 18.2.0

[npm](https://registry.npmjs.org/dependency-cruiser) latest published 2026-08-10 (4 days pre-access); [GitHub](https://github.com/sverweij/dependency-cruiser) 7,062 stars, 38 open issues, pushed 2026-08-10. MIT. 3.2M [downloads/week](https://api.npmjs.org/downloads/point/last-week/dependency-cruiser). Standalone CLI (`depcruise`) with its own config file — entirely orthogonal to oxlint/ESLint, so it cannot collide with the oxlint-overrides-replace-options fragility already logged against `no-restricted-imports` (D-0020). Forbidden-dependency rules match `from`/`to` path regex including `pathNot`, and `to.path` matches bare module specifiers, so the choke-point invariant is directly expressible: `{from:{pathNot:'^src/transport'}, to:{path:'^mqtt$'}}` plus a twin rule for the generated contract client — [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md). Ships a built-in `no-circular` rule (`via`/`viaOnly` refinable) and resolves `compilerOptions.paths` natively. CI output is the strongest of the four: `err`/`err-long` (rule name + comment + violating edge), `err-html`, `markdown` (PR/step-summary ready), `teamcity`/`azure-devops` annotations, plus `dot`/`mermaid`/`d2`/`archi` graph output for an actual architecture diagram — [CLI docs](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md). Bus factor 1: sverweij holds 2,354 of the top-5 [contributions](https://api.github.com/repos/sverweij/dependency-cruiser/contributors) vs. 13 next; mitigated by an unusually high release cadence.

#### madge 8.0.0

[npm](https://registry.npmjs.org/madge) published 2024-08-05 — **2 years stale**; [GitHub](https://github.com/pahen/madge) 10,156 stars but pushed only 2026-01-21 (~7 months idle), 124 open issues. MIT, 3.0M downloads/week. Confirmed via [README](https://github.com/pahen/madge#readme): madge is a graph-builder + circular-dependency detector + visualizer (svg/dot/json) with **no forbidden-import or layer-rule engine at all** — it cannot express "only transport may import mqtt" in any form, only flag cycles. tsconfig support covers alias *resolution*, not enforcement. Bus factor 1 (pahen 374 of [10 contributors](https://api.github.com/repos/pahen/madge/contributors), next at 21); effectively feature-frozen.

#### eslint-plugin-boundaries 7.2.0

[npm](https://registry.npmjs.org/eslint-plugin-boundaries) published 2026-08-09 (5 days pre-access); [GitHub](https://github.com/javierbrea/eslint-plugin-boundaries) 957 stars, 14 open issues, pushed 2026-08-13. MIT, 1.5M downloads/week. The `boundaries/dependencies` rule (successor to deprecated `boundaries/element-types`/`boundaries/external`) can gate one external package to one element type: `{from:{element:{type:'transport'}}, allow:{to:{module:{origin:'external', source:'mqtt'}}}}`, `default:'disallow'` — [rule docs](https://www.jsboundaries.dev/docs/rules/dependencies/). TS path aliases resolve via the standard `eslint-import-resolver-typescript` `settings['import/resolver']` block. No dedicated circular-dependency rule — layer direction only discourages cross-layer cycles, not same-layer ones. Ships an [oxlint-integration example](https://github.com/javierbrea/eslint-plugin-boundaries/tree/master/examples/oxlint-integration) loading itself via oxlint `jsPlugins`, but that oxlint feature is [alpha and explicitly not subject to semver](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha) — the safer path today is the program's existing, already-sanctioned ESLint-in-CI lane. Bus factor 1 (javierbrea 522 of [10 contributors](https://api.github.com/repos/javierbrea/eslint-plugin-boundaries/contributors), rest mostly Renovate bots), release cadence excellent.

#### sheriff — @softarc/sheriff-core + @softarc/eslint-plugin-sheriff 0.19.6

[npm](https://registry.npmjs.org/@softarc/sheriff-core) published 2025-09-22 — **~11 months stale**, though [GitHub](https://github.com/softarc-consulting/sheriff) shows a push as recently as 2026-06-02 with no release cut since; 312 stars against 45 open issues (weak triage ratio), 29 forks. MIT. Small footprint: 20K/week ([eslint plugin](https://api.npmjs.org/downloads/point/last-week/@softarc/eslint-plugin-sheriff)) + 109K/week (core). Checked the [dependency-rules docs](https://sheriff.softarc.io/docs/dependency-rules), [README](https://github.com/softarc-consulting/sheriff/blob/main/README.md) and [config reference](https://sheriff.softarc.io/docs/configuration) directly: Sheriff's tag system governs internal-module-to-internal-module access only — **no mechanism exists to tag or gate an external npm package**, so it cannot express this program's choke-point invariant at all. Disqualifying for the stated question, independent of maintenance posture. Bus factor 1 (rainerhahnekamp 218 of [10 contributors](https://api.github.com/repos/softarc-consulting/sheriff/contributors), next at 7).

**Rubric**

**dependency-cruiser** — License: strong, MIT. Maintenance health: strong, latest release 4 days pre-access, active issue closing, bus-factor-1. TypeScript fit: strong, native `tsconfig.paths` resolution, no extra resolver package. Integration cost: strong, standalone CI step with zero interaction with oxlint's rule-override fragility. Output quality: strong, rule-annotated err-long plus markdown/HTML/TeamCity/Azure/graph formats. Escape hatch: adequate, allowances live in one central rule file, easy to audit but no inline-comment override.

**madge** — License: strong, MIT. Maintenance health: weak, 2-year-old release and 7-month-idle repo under one maintainer. TypeScript fit: adequate, alias resolution for graphing only. Integration cost: weak, buys nothing over dependency-cruiser since it has no rule engine to enforce anything. Output quality: adequate, strong SVG/graph output but no violation-message concept. Escape hatch: weak, no rule/allow-list concept exists.

**eslint-plugin-boundaries** — License: strong, MIT. Maintenance health: strong, release 5 days pre-access, active churn. TypeScript fit: strong, mature `eslint-import-resolver-typescript` integration. Integration cost: adequate, fits the existing ESLint-in-CI lane cleanly but adds full ESLint-AST cost since oxlint is primary; the oxlint-native path is alpha. Output quality: adequate, standard ESLint messages, no graph output. Escape hatch: strong, per-rule allow/disallow policy is ESLint-disable-able like any rule the team already knows.

**sheriff** — License: strong, MIT. Maintenance health: weak, 11-month release gap and high open-issue-to-star ratio on bus-factor-1. TypeScript fit: adequate, TS-native zero-dependency config, but that same minimalism is why external-package gating was never built. Integration cost: weak, cannot express the required invariant at all — a second tool would still be needed. Output quality: adequate, readable `verify`/`export` output for internal violations only. Escape hatch: weak, no external-dependency concept to escape from.

### 3. Test-lane network mocking — MSW (REST: adopt; MQTT: skip)

This area carries **two verdicts, not one**: MSW is a clean adopt on the REST leg and an
explicit **skip** on the MQTT-over-WSS leg, where the already-proven aedes-over-ws
harness stays the answer. The disposition table reflects both.

#### MSW core — version and maintenance

Latest is **2.15.0** ([registry](https://registry.npmjs.org/msw/2.15.0)), engines `node >=18`, optional peer `typescript >=4.8.x`. ~19.5M weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/msw)), MIT license, 18.1k GitHub stars, last push 2026-07-24, 41 open issues on an 18k-star repo — a healthy ratio ([repo API](https://api.github.com/repos/mswjs/msw)). Bus factor is the honest weak spot: **kettanaito holds ~95% of all contributions** (1,386 of ~1,465), next contributor at 34 ([contributors API](https://api.github.com/repos/mswjs/msw/contributors)); the project's own README calls itself "a hobby project maintained in spare time" with no funded full-time maintainer ([mswjs/msw](https://github.com/mswjs/msw)). Activity is strong; sustainability is single-person.

#### REST leg — orval already generates MSW + faker mocks

Orval (adopted 8.24.0 in 0010) emits MSW handlers and faker-backed response factories from the same OpenAPI contract via `mock: true` (shorthand for `generators: [{type:'msw'},{type:'faker'}]`), or an MSW-only scoped entry ([orval MSW guide](https://orval.dev/docs/guides/msw/), [mocking-msw.md](https://github.com/orval-labs/orval/blob/master/skills/orval/mocking-msw.md)). Each operation gets a `get<Op>MockHandler()` returning an `http.*` handler over a `get<Op>ResponseMock()` faker factory; handlers accept static override objects or async override functions per-call, plus `server.use()` for per-test overrides — the standard MSW escape hatch, not a bolt-on. Because 0010 already confirmed orval's `generateEachHttpStatus` drives per-status zod schemas, the generated MSW/faker mocks are schema-derived per documented status (2xx and reason-code 4xx/5xx bodies alike), staying in lockstep with the contract rather than hand-authored. **Fishery composition is a non-issue, not a solved integration**: fishery was scoped to the AsyncAPI leg only (orval has no AsyncAPI support), so the two factory systems sit on different legs and never need to interoperate — there is nothing to reconcile.

MSW + vitest is the documented default pattern: `setupServer(...)` in a setup file, `server.listen()`/`resetHandlers()`/`close()` in `beforeAll`/`afterEach`/`afterAll` ([Vitest mocking guide](https://vitest.dev/guide/mocking/requests)). TanStack Query (adopted in 0060) composes with no special-casing — a fresh `QueryClient` per test with `retry: false`/`gcTime: 0` avoids cross-test caching leakage ([example](https://github.com/raisiqueira/example-msw-vite/)). No Service Worker file is needed for Node-only test runs.

#### WebSocket leg — stable API, wrong abstraction level for MQTT

MSW's `ws` namespace has shipped since a November 2024 announcement ("first mocking library to support REST, GraphQL, and WebSocket at once") and appears in current 2.15.0 docs with no experimental flag ([Enter WebSockets](https://mswjs.io/blog/enter-websockets/), [WebSocket docs](https://mswjs.io/docs/websocket/), [ws API](https://mswjs.io/docs/api/ws/)). It's WHATWG-standard-shaped: `WebSocketClientConnection`/`WebSocketServerConnection` expose `message`/`close`/`error` events, `.send()` accepts `string | Blob | ArrayBuffer`, and subprotocol is readable via `info.protocols`. That is real binary-payload plumbing — but it is a raw pipe, not protocol awareness. MQTT-over-WebSocket means mqtt.js binary-encodes CONNECT/SUBSCRIBE/PUBLISH/PINGREQ control packets and calls `.send()` on the socket; an MSW `ws` handler would receive those as opaque bytes and would have to *parse* them and hand-construct valid CONNACK/SUBACK/PUBACK/PINGRESP replies, session state, QoS 1/2 semantics, and wildcard topic matching by hand — i.e., write a small MQTT broker inside a mock handler. MSW's own docs state "no plans to support custom WebSocket protocols" ([WebSocket docs](https://mswjs.io/docs/websocket/)); the team's own `@mswjs/socket.io-binding` — built for a far simpler, JS-native, text-based protocol — is explicit that it does **not** provide full feature parity (rooms, namespaces, broadcasting missing) ([bindings docs](https://mswjs.io/docs/websocket/bindings/), [socket.io-binding](https://github.com/mswjs/socket.io-binding)). No comparable MQTT binding exists anywhere in the ecosystem.

More decisive still: mqtt.js's Node.js build transports over the **`ws` npm package**, not the global `WebSocket` class — "ws module is used in NodeJS, WebSocket is used in browsers" ([MQTT.js README](https://github.com/mqttjs/MQTT.js/)) — while MSW's `WebSocketInterceptor` patches only the global `WebSocket`; `ws`-package or Undici WebSocket clients are only reachable at the HTTP-Upgrade layer via the separate `HttpRequestInterceptor`, losing the `ws.link()` event API entirely ([MSW discussion #2414](https://github.com/mswjs/msw/discussions/2414), [interceptors repo](https://github.com/mswjs/interceptors)). In a vitest run under Node (the default for a headless MQTT test lane), MSW's WebSocket mocking likely would not even see mqtt.js's traffic without extra glue — on top of the protocol-reimplementation problem. This confirms the 0060 spike's choice: **aedes 1.1.1 over `ws` 8.21.3**, already exercised in-process for reconnect, offline-resubscribe dedup, backpressure, and non-JSON-ingress scenarios ([spike findings](../0060-transport-abstraction/spikes/boundary-wiring/findings.md)), is correct and MSW should not be reached for on the MQTT leg.

**Rubric**

| Candidate | License | Maintenance health | TS fit | Integration cost | Output quality | Escape hatch |
|---|---|---|---|---|---|---|
| MSW (REST/HTTP leg, via orval `mock: true`) | strong — MIT, unambiguous | adequate — huge adoption/cadence but bus-factor-1 "hobby project" per maintainer's own README | strong — TS >=4.8 optional peer, fully typed generated handlers | strong — orval already emits handlers+faker from the owned OpenAPI contract; vitest/TanStack Query wiring is boilerplate | strong — per-status, schema-derived faker mocks track the contract via `generateEachHttpStatus` | strong — static or async per-handler override plus `server.use()` per test |
| MSW (`ws` namespace, MQTT leg) | strong — same package/license | adequate — same core, same bus-factor-1 caveat | strong — same typed core | weak — mqtt.js's Node transport (`ws` package) bypasses MSW's global-`WebSocket` patch; only HTTP-Upgrade-layer interception remains, losing the `ws.link()` API | weak — no MQTT semantics; would require hand-building broker logic MSW explicitly disclaims supporting | weak — no viable in-MSW escape; the real fix is the already-adopted aedes-over-ws harness |

### 4. Type coverage / any-leakage ratchet — type-coverage

**Recommendation: [`type-coverage`](https://github.com/plantain-00/type-coverage) 2.30.1** as an `--at-least`-gated CI step, backed by `--history-file` for trend tracking.

#### type-coverage (plantain-00) — evaluated at 2.30.1

Produces a single **percentage metric**: `(identifiers whose resolved type is not any) / (total identifiers)`, computed via the TypeScript compiler API — [readme](https://github.com/plantain-00/type-coverage#readme). CI-gate support is built in and exactly fits a ratchet workflow: `--at-least <n>` fails the run below a threshold, `--update-if-higher` raises the stored threshold only when coverage improves (a one-way ratchet), `--history-file` persists trend data, `--strict` also counts `any` buried in type arguments (e.g. `Promise<any>`), and `type-coverage:ignore-next-line` / `--ignore-catch` / `--report-unused-ignore` give granular, auditable escape hatches — [readme](https://github.com/plantain-00/type-coverage#readme). Monorepo use is via a per-invocation `-p/--project <tsconfig>` flag — no workspace auto-discovery, so a multi-package repo needs one invocation per project (a small script, not a blocker) — [readme](https://github.com/plantain-00/type-coverage#readme).

Maintenance: latest release **2.30.1, published 2026-07-26**, with 2.30.0 the day before adding TypeScript 6/7 as peerDependencies — evidence of active tracking of upstream TS — [npm registry](https://registry.npmjs.org/type-coverage). 1,347 GitHub stars, repo `pushed_at` 2026-07-26, 40 open issues, MIT license — [GitHub](https://github.com/plantain-00/type-coverage). Bus factor is a real caveat: of 10 listed contributors, the author holds 567 commits vs. 4 for the next-highest — [contributors API](https://api.github.com/repos/plantain-00/type-coverage/contributors). Weekly npm downloads ~294k (calibrated against eslint ~156M/week and typescript ~260M/week, so this is a real-but-niche-tool scale, not noise) — [npm downloads API](https://api.npmjs.org/downloads/point/last-week/type-coverage).

#### typescript-strict-plugin (Allegro) — evaluated at 2.4.4

A different mechanism: turns on `strict` mode selectively via a `//@ts-strict-ignore` file-header comment (opt out) or `//@ts-strict` (opt in for excluded paths), plus a `tsc-strict` CLI for CI and an `update-strict-comments` script that auto-tags every currently-failing file as ignored to bootstrap a migration — [README](https://github.com/allegro/typescript-strict-plugin/blob/master/README.md). This is a **per-file strict-migration** tool, not a percentage/any-leakage tool — it answers "is this file strict-clean" rather than "how much of the codebase is typed." Notable risk: IDE-only feedback for ignored files means a CI run that skips `tsc-strict` won't catch new strict violations in already-ignored files — [README](https://github.com/allegro/typescript-strict-plugin/blob/master/README.md). Maintenance is stale: last commit 2024-08-13, last npm release 2.4.4 on 2024-06-07 (~2 years old as of 2026-08-14), 30 open issues, 396 stars, MIT — [GitHub repo](https://github.com/allegro/typescript-strict-plugin), [npm registry](https://registry.npmjs.org/typescript-strict-plugin).

#### betterer (phenomnomnominal) — evaluated at 5.4.0 stable / 6.0.0-alpha.1

Betterer is a **generic ratchet framework** (snapshot-and-diff any metric, not any-specific); its `@betterer/typescript` test type runs `tsc` and ratchets the raw **compiler error count** per file, which could be pointed at `noImplicitAny` but produces no percentage and needs custom wiring to become an any-leakage signal specifically. Real-world adoption risk right now: the last stable npm release is **5.4.0 from 2022-08-09**, and the only newer release is **6.0.0-alpha.1 from 2024-12-01** — over 21 months stuck in alpha as of this scan — [npm registry](https://registry.npmjs.org/@betterer/betterer). The GitHub "V6" milestone has been open since 2022-01-31 with 14 open / 0 closed issues — [milestone API](https://api.github.com/repos/phenomnomnominal/betterer/milestones). The repo itself is not dead (`pushed_at` 2026-07-11, commits as recent as July 2026 doing a Lerna→Nx tooling migration) — [commits API](https://api.github.com/repos/phenomnomnominal/betterer/commits) — but it reads as a single-maintainer project mid-stall on shipping its own next major, which is a poor time to adopt it for a new integration. MIT license — [npm registry](https://registry.npmjs.org/@betterer/betterer).

#### knip — checked, does not subsume

Knip (~12.5M weekly downloads) does unused-file/export/dependency analysis; it explicitly does not report exports/types as "unused" in the way an any-leakage ratchet would need, and has no type-coverage/any-tracking feature — confirmed via its own docs/FAQ discussion — [Knip why-use-knip](https://knip.dev/explanations/why-use-knip). Excluded from further comparison.

#### Fit to the app — assumption-flagged, with a decision rule

Strictness status is an unfilled app fact. Given the rest of the stack already assumed here (Zustand + xstate v5, zod-validated contracts, TanStack Query, oxlint) reads as a modern, deliberately-typed codebase, a **percentage-tracking ratchet that prevents regression** is the more plausible need than a **big-bang per-file strict migration** tool — the latter (typescript-strict-plugin) targets teams still climbing out of loose/legacy TypeScript, which this app does not obviously resemble.

The completeness critic flagged this assumption as disposition-driving with no assigned
verification path, and a gap-fill pass supplied one. The verification cannot run from
this repo (no app access, D-0004); it is a baseline spike for whoever has the app repo:
run `npx type-coverage --detail` (default and `--strict` modes) against the real
tsconfig. **Decision rule for the result**: if the default-mode baseline is high
(roughly ≥90–95%), the `--strict` delta is small, and uncovered `any`s are diffuse, the
percentage-ratchet disposition stands as-is. If the baseline is materially lower, the
`--strict` delta is large, or the `any`s cluster in a handful of files, the correct
first step is a per-file allowlist convention — hand-rolled `//@ts-strict-ignore`-style
markers plus a shrinking-list CI check, since typescript-strict-plugin itself is too
stale to adopt outright — applied to the worst files *before* the global ratchet turns
on; otherwise the ratchet is either un-movable or gameable by polishing already-clean
files. The strictness question also goes to the app owner as an intake item.

> **2026-08-14 update (post-draft, pre-acceptance)**: the intake item resolved —
> strictness is **very loose** (TS 5.9.3, facts/app-profile.md), so the decision rule's
> second branch applies: the per-file allowlist convention comes first, the percentage
> ratchet after. The user additionally widened the question — the codebase receives a
> high volume of agent-authored code — and directed a dedicated track,
> [0100-type-strictness](../0100-type-strictness/research-plan.md) (D-0021), which now
> owns this design. This area's direct-adopt of type-coverage stands as an input to
> 0100, not a finished wiring.

**Rubric**

**type-coverage 2.30.1** — License: strong — MIT. Maintenance health: adequate — release 8 days before access date and TS 6/7 tracking, but bus factor 1 (567 vs 4 commits among contributors). TypeScript fit: strong — built directly on the TS compiler API to count `any`-typed identifiers. Integration cost: strong — one devDependency, one npm script, `--at-least` flag is the CI gate. Output quality: strong — percentage + per-line detail, ignore-comment audit trail, unused-ignore detection. Escape hatch: strong — pure devDependency; removal touches only a CI step and inline comments.

**typescript-strict-plugin 2.4.4** — License: strong — MIT. Maintenance health: weak — no commit or release in ~2 years as of 2026-08-14. TypeScript fit: adequate — works via tsconfig `plugins` + a wrapper binary rather than the compiler API directly. Integration cost: adequate — plugin registration + separate `tsc-strict` binary + migration script, more moving parts than type-coverage. Output quality: adequate — binary per-file strict/not-strict signal, no percentage or granular any-location report. Escape hatch: adequate — ignore comments are inert without the tool, but tsconfig plugin wiring needs unwinding.

**betterer (5.4.0 stable / 6.0.0-alpha.1)** — License: strong — MIT. Maintenance health: weak — stable line frozen since 2022-08; v6 alpha stalled since 2024-12 with its GitHub milestone open since 2022 and 0 issues closed. TypeScript fit: adequate — ratchets raw `tsc` error counts, not an any-specific percentage; needs custom composition. Integration cost: weak — today's choice is an aging stable major or an unreleased alpha, both risky to build on now. Output quality: adequate — reliable "no worse than baseline" snapshot diffing, but no percentage metric. Escape hatch: adequate — results file is a sidecar artifact, but the guarantee depends on continued tool maintenance.

### 5. React Compiler adoption — future track

> **2026-08-14 update (post-draft, pre-acceptance)**: the React-version fact landed —
> **React 18.3.1** (facts/app-profile.md), not the assumed 19+. Adoption therefore
> additionally requires `react-compiler-runtime` and an explicit `target: '18'` config
> (the compiler supports 17+ via the runtime package). The proposed compiler track
> inherits this as a settled input; the disposition (future track) is unchanged.

#### What changed since 1.0.0

[`babel-plugin-react-compiler`](https://www.npmjs.com/package/babel-plugin-react-compiler) is still at **1.0.0** (published 2025-10-07, per npm registry `time` field) — no `1.0.1`/`1.1.0` stable bump in the ~10 months since. The `experimental` npm channel published near-daily through 2026-05-08 then went quiet, coinciding with a bigger event: Meta merged an **official Rust port** of the compiler into `facebook/react` in July 2026 ([PR #36173](https://github.com/react/react/pull/36173); [InfoQ summary](https://www.infoq.com/news/2026/07/meta-react-compiler-rust/)), claiming ~3x faster Babel-plugin execution and up to 50% faster end-to-end builds when wired into Turbopack. **The Rust port is not yet published to npm** — it's vendored into `oxc-project/forked-react-compiler` as crates but there is no drop-in package for this app to consume today. Companion package `eslint-plugin-react-hooks` is healthy and current: **7.1.1** latest, with canary builds published essentially daily through 2026-08-14 ([registry](https://registry.npmjs.org/eslint-plugin-react-hooks)), 95.7M downloads/week. Downloads for babel-plugin-react-compiler itself: 13.6M/week ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/babel-plugin-react-compiler)).

#### Vite rollout path (build tool unfilled — assumed Vite)

Since Vite 8 / `@vitejs/plugin-react` v6 (early 2026), the plugin **dropped its internal Babel dependency**, moving JSX transform + Fast Refresh to oxc/Rust. The documented-but-now-stale `react({ babel: { plugins: [...] } })` recipe no longer works on that combo; the current path adds `@rolldown/plugin-babel` and wraps `babel-plugin-react-compiler` via the exported `reactCompilerPreset` helper ([writeup](https://recca0120.github.io/en/2026/04/14/react-compiler-vite-v6/); [vite-plugin-react discussion #1148](https://github.com/vitejs/vite-plugin-react/discussions/1148)). This app's exact Vite/`@vitejs/plugin-react` versions are unknown, so **which recipe applies is itself an open question** — a real risk if the app is mid-range (pre-v6 plugin, Babel still bundled) vs. current. If the build tool turns out not to be Vite at all, the install path is structurally different — `babel-plugin-react-compiler` behind `babel-loader`, or the dedicated [`react-compiler-webpack`](https://github.com/SukkaW/react-compiler-webpack) loader (works alongside `babel-loader`/`swc-loader`/`esbuild-loader` in webpack and rspack configs), with rspack additionally documenting a `builtin:swc-loader` route ([Rspack: React](https://rspack.rs/guide/tech/react)) — at least two distinct non-Vite paths that would need their own comparison.

#### Incremental/directory-scoped rollout + memoization guard

Well supported and unchanged in spirit from 0040: Babel `overrides` can scope the plugin to a glob of directories; `compilationMode: 'annotation'` plus a `"use memo"` directive gives per-function opt-in; a `gating` config supports runtime feature-flagged rollout ([incremental adoption guide](https://react.dev/learn/react-compiler/incremental-adoption)). `preserve-manual-memoization` (in `eslint-plugin-react-hooks`) validates that the compiler's inferred memoization matches or exceeds any hand-written `useMemo`/`useCallback`/`React.memo`, bailing out silently on mismatch rather than erroring ([rule doc](https://react.dev/reference/eslint-plugin-react-hooks/lints/preserve-manual-memoization)).

#### Zustand / xstate interaction — the real stack-specific risk

Zustand is not on the compiler's known-incompatible list ([`DefaultModuleTypeProvider.ts`](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/HIR/DefaultModuleTypeProvider.ts) lists only `react-hook-form`, `@tanstack/react-table`, `@tanstack/react-virtual`) and its selector reads are ordinary function calls the compiler can track. **xstate v5 is a different story**: `@xstate/react`'s `useActor`/`useSelector` compare `logic.config` by reference, so machines built via `setup().createMachine()` factories still need manual `useMemo` to avoid infinite re-render loops — an **open, unresolved** upstream issue with no maintainer response as of scan date ([statelyai/xstate#5426](https://github.com/statelyai/xstate/issues/5426), opened 2025-12-09). That manual memo then has to satisfy `preserve-manual-memoization` or the component silently bails out of compilation. Given the app's xstate-heavy design, this is not a corner case.

#### Risk profile

Bailouts are the dominant failure mode, and **not all of them are linter-visible**: `eslint-plugin-react-hooks` catches `eslint-disable`d and mutating-prop cases, but many bailouts are silent — the compiler quietly emits unoptimized code with no signal anywhere in the pipeline ([reactwg discussion #24](https://github.com/reactwg/react-compiler/discussions/24)). The separate `react-compiler-healthcheck` script exists precisely to surface what ESLint misses ([npm](https://www.npmjs.com/package/react-compiler-healthcheck)); one cited case found ~600 non-compiling components in a single audit. `"use no memo"` remains the sanctioned per-function escape hatch, explicitly framed as temporary debugging, not a permanent pattern ([directive doc](https://react.dev/reference/react-compiler/directives/use-no-memo)). An 18-month retrospective is candid about the brownfield tax: "the greenfield is solved, brownfield is a project" — older state libraries and edge-case syntax (try/catch, ref reads during render) surface repeatedly and require iterative cleanup, not a one-shot pass ([retrospective](https://saschb2b.com/blog/react-compiler-year-in-review)).

#### oxc-toolchain path status

Still not first-class for this app's oxlint-primary setup, but movement exists: oxlint ships an **experimental**, not-default-on `react/react-compiler` rule that runs the Rust-ported analysis in **lint-only mode** (reports Rules-of-React violations and, optionally via `reportAllBailouts`, bailouts) — it does not perform the transform ([oxc.rs docs](https://oxc.rs/docs/guide/usage/linter/rules/react/react-compiler.html)). Rules this app would actually need for safety — `preserve-manual-memoization`, `incompatible-library` — remain ESLint-only; an open oxc issue tracking their addition has no maintainer commitment or timeline ([oxc-project/oxc#20791](https://github.com/oxc-project/oxc/issues/20791)). This slots cleanly into the already-sanctioned ESLint-in-CI lane rather than requiring new infrastructure. Separately, Rolldown/Vite **pulled** an earlier attempt to embed the Rust compiler natively after it grew the bundler binary 17% (28.7MB→33.8MB) ([socket.dev](https://socket.dev/blog/rolldown-pulls-rust-react-compiler-integration)) — a concrete signal the native-toolchain path is still being negotiated, not settled.

**Rubric**

**babel-plugin-react-compiler 1.0.0** (+ react-compiler-runtime, eslint-plugin-react-hooks 7.1.1) — License: strong — MIT, confirmed via [npm registry](https://registry.npmjs.org/babel-plugin-react-compiler). Maintenance health: adequate — stable tag frozen 10 months but companion lint package ships canary builds daily and the Rust-port PR shows active core investment; the frozen stable tag itself is a mild yellow flag. TypeScript fit: strong — pure build-time transform, no type-level surface to integrate. Integration cost: weak — Vite install recipe just changed (Babel dropped from `@vitejs/plugin-react` v6), app's exact Vite version unknown, and xstate v5 machine factories carry an open, unresolved compatibility issue. Output quality: adequate — real perf wins reported (20-50% route-compile gains cited for Rust-integrated cases) but silent, linter-invisible bailouts are a documented, unresolved gap. Escape hatch: strong — `"use no memo"` plus directory/annotation-scoped rollout gives fine-grained, reversible opt-out.

**oxlint `react/react-compiler` rule (experimental)** — License: strong — MIT, part of the oxc project already adopted in 0020. Maintenance health: adequate — actively developed but explicitly experimental and not default-on. TypeScript fit: strong — native oxc AST integration. Integration cost: strong — zero new infra, slots into the existing oxlint/ESLint-in-CI split. Output quality: weak — lint-only, no transform; misses `preserve-manual-memoization`/`incompatible-library` coverage entirely. Escape hatch: adequate — rule is opt-in and independently toggleable, but coverage gaps mean it can't be the sole safety net.

### 6. Bundle-budget enforcement in CI — size-limit

**Trigger:** Wave 2 added TanStack Query (~17 kB gz) against an unknown, still-undecided budget (intake 2026-08-14 item f). Candidates evaluated 2026-08-14.

#### size-limit (`ai/size-limit`) — v13.0.3, released 2026-07-30 — recommended

[GitHub](https://github.com/ai/size-limit) · [npm](https://www.npmjs.com/package/size-limit) · [releases](https://github.com/ai/size-limit/releases)

Config-driven CLI: an array of `{path, limit}` checks, each glob resolved against **already-built** output and measured gzip/brotli. `@size-limit/file` needs no bundler plugin at all — it just stats files on disk, which is the key answer for an unknown build tool. `@size-limit/esbuild`/`@size-limit/webpack` plugins exist if a bundle-and-measure step is wanted later. Also ships `@size-limit/time`, a headless-Chrome execution-time mode. 6.9k stars, 26 open issues, 1.29M weekly downloads, MIT, by Evil Martians (Andrey Sitnik — prolific single lead but very active cadence).

License: **strong** — MIT, no hosted-service dependency. Maintenance health: **strong** — v13.0.3 shipped two weeks before access date, weekly-scale download volume, healthy changelog cadence. TypeScript fit: **strong** — operates purely on build artifacts; no runtime/app-code coupling to Zustand/xstate/mqtt.js at all. Integration cost: **strong** — `@size-limit/file` is build-tool-agnostic (glob + gzip), the one genuinely config-light option given the unknown bundler. Output quality: **adequate** — CLI table is fine, but native PR-comment/check-run reporting relies on the third-party [`andresz1/size-limit-action`](https://github.com/andresz1/size-limit-action) (474★, latest v1.8.0 released 2026-04-06 — ~4 months stale relative to core, bus-factor-1). Escape hatch: **strong** — plain npm package + JSON config, droppable for a raw script at any time, no data lock-in.

#### bundlemon (`LironEr/bundlemon`) — v3.1.0, published 2024-10-18

[GitHub](https://github.com/LironEr/bundlemon) · [npm](https://registry.npmjs.org/bundlemon)

Glob-based file budgets (`maxSize`, `maxPercentIncrease`) plus the most polished PR-comment/dashboard UI of the group — but the default flow reports to the hosted `app.bundlemon.dev`, whose free tier prunes PR records after 30 days and branch history after 180. Self-hosting is documented but thin. 175★, MIT, effectively single-maintainer.

License: **strong** — MIT. Maintenance health: **weak** — no npm publish since 2024-10-18 (~22 months stale at access date), 175★, single maintainer. TypeScript fit: **adequate** — TS-authored, but its differentiators (dashboard, history) are tied to the hosted service. Integration cost: **adequate** — glob config is build-tool-agnostic like size-limit, but the useful reporting path assumes the hosted server. Output quality: **strong** — richest PR-comment + dashboard experience when using the hosted service. Escape hatch: **weak** — self-host option exists but under-documented; hosted default silently ages out history (30/90/180-day retention).

#### bundlewatch — v0.4.2, published 2026-04-21

[GitHub](https://github.com/bundlewatch/bundlewatch) · [npm](https://registry.npmjs.org/bundlewatch) · [site](https://bundlewatch.io/)

Community reboot of the abandoned `bundlesize`. Package.json `"bundlewatch"` field with per-file `maxSize`, PR comments via a `bundlewatch.io`-issued token (self-hostable server exists). 442★, 24 open issues, 219k weekly downloads (higher than expected — likely legacy-project inertia rather than new adoption given the release cadence below).

License: **strong** — MIT. Maintenance health: **adequate** — alive (0.4.2 four months before access date) but very slow historically (0.3.3→0.4.0 spanned ~2.5 years); positioned explicitly as a rescue project, so long-term investment is uncertain. TypeScript fit: **adequate** — plain JS/JSON config, no TS-specific behavior either direction. Integration cost: **adequate** — same build-tool-agnostic glob model as size-limit; light hosted-token dependency for PR comments. Output quality: **adequate** — comparable PR-comment/branch-comparison flow to size-limit-action. Escape hatch: **adequate** — MIT and self-hostable, but same hosted-default trade-off as bundlemon.

#### bundle-stats / RelativeCI (`relative-ci/bundle-stats`) — 4.22.2, weekly downloads 45k

[GitHub](https://github.com/relative-ci/bundle-stats) · [CLI docs](https://github.com/relative-ci/bundle-stats/tree/master/packages/cli)

The most feature-rich reporting (bundle/asset/module/package diffing, GitHub check + Slack), but the CLI **requires a webpack-schema `stats.json`** (`assets`, `chunks`, `modules` fields). Vite/Rollup/Rolldown users need the separate `rollup-plugin-webpack-stats` bridge to synthesize that shape — real plumbing, not glob-and-go, given the app's build tool is unconfirmed. 671★, 27 open issues, MIT.

License: **strong** — MIT. Maintenance health: **strong** — active repo, recent CI activity, steady downloads. TypeScript fit: **adequate** — no app-code coupling either way. Integration cost: **weak** — hard dependency on webpack-family stats output; a real integration tax if the build tool turns out not to be webpack/rspack. Output quality: **strong** — best-in-class diff/dashboard reporting among the shortlist. Escape hatch: **adequate** — standalone CLI works without the RelativeCI hosted service, but the stats-file coupling makes "just remove it" harder than size-limit's glob mode.

**rsdoctor** was checked and dropped without scoring — but note the elimination is
**conditional on the build-tool fact**: it's a webpack/rspack-only build analyzer
(`@rsdoctor/webpack-plugin` / `@rsdoctor/rspack-plugin`); Vite and esbuild are cited
only as design inspiration, not supported targets ([repo](https://github.com/web-infra-dev/rsdoctor)).
If the app turns out to be webpack/rspack-based, rsdoctor re-enters as size-limit's
leading competitor: `@rsdoctor/webpack-plugin` 1.6.2 / `@rsdoctor/rspack-plugin` 1.6.1
were both published within two weeks of the access date, with 100k+ weekly downloads and
adoption by Sentry, NocoBase, and Grafana ([npm](https://www.npmjs.com/package/@rsdoctor/rspack-plugin),
[1.0 release notes](https://rsdoctor.rs/blog/release/release-note-1_0)) — a live project,
not a fallback of convenience. bundle-stats likewise advertises webpack/rspack/vite/rolldown/rollup
support plus monorepo CI comparison and becomes directly relevant if the layout is a
monorepo ([repo](https://github.com/relative-ci/bundle-stats)). See the intake item.

#### Answers to the open questions

- **Per-entry vs total:** not either/or — size-limit/bundlewatch/bundlemon all take an array of checks, so the config should carry one budget per meaningful chunk (main entry, largest lazy chunk) plus one repo-wide glob as backstop.
- **Time-based budgets:** skip for now. Headless-Chrome execution-time mode (`@size-limit/time`) adds a real CI dependency and flakiness surface; for a single internal app (not a widely-embedded library) gzip-byte budgets already track load cost well enough. Revisit only if TanStack Query's cache machinery is later suspected of parse-time regressions.
- **PR-comment/CI reporting:** bundlemon and bundle-stats report best but both lean on a hosted or bundler-specific dependency; size-limit's reporting is adequate via a third-party action that is itself the weakest link in an otherwise strong pick.
- **Config cost, unknown build tool:** `@size-limit/file` (byte-glob against dist output) is the only path here that owes nothing to which bundler eventually gets picked.
- **Monorepo support:** size-limit is developed as a pnpm workspace itself and its config is just more array entries; no dedicated "monorepo mode" is needed for any of the four.

### 7. Anything-else sweep — three proposals

The sweep was capped at three proposals, each requiring a live leading tool and a
justification tied to this app's profile; anything weaker was dropped by the sweep
itself. All three survived the completeness critic.

#### Accessibility linting — eslint-plugin-jsx-a11y 6.10.2 (direct adopt)

oxlint ships only a growing subset of jsx-a11y rules (alt-text, heading-has-content, label-has-associated-control, no-static-element-interactions, lang, etc.) with an open upstream issue tracking the remaining parity gap ([oxc#22264](https://github.com/oxc-project/oxc/issues/22264)), so the already-sanctioned ESLint-in-CI lane (created for sonarjs cognitive-complexity in 0020) is the natural, zero-new-infrastructure place to load the rest of the [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) ruleset for this React UI. **Overlap discipline** (critic-flagged): the ESLint lane must disable the jsx-a11y rules oxlint already runs natively, mirroring the D-0020 override-restatement discipline, so the two linters never double-fire on the same violation.

License: strong — MIT. Maintenance health: adequate — live PRs into 2026 (ESLint 9 support work) and peerDependencies already claim `eslint: ^9`, but the npm artifact hasn't been republished since 6.10.2 on 2024-10-25 ([registry](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2)) despite ~44.76M weekly downloads ([downloads API](https://api.npmjs.org/downloads/point/last-week/eslint-plugin-jsx-a11y)) — a real publish-lag risk worth flagging plainly. TypeScript fit: strong — flat-config and legacy presets both work unmodified in a TS/React setup. Integration cost: strong — additive plugin+preset inside the existing ESLint-in-CI lane, no new CI job. Output quality: adequate — mature ruleset, but static analysis has a ceiling (can't catch runtime-only issues like missing aria-live announcements on MQTT-driven UI updates). Escape hatch: strong — standard per-rule/per-line ESLint disables, same mechanism already used in the lane.

#### End-to-end browser testing — Playwright 1.62.1 (future track)

0070 covers state/concurrency at the unit/model level (fast-check, xstate/graph, a real aedes-over-ws broker in spike tests) and this scan's MSW area covers in-test network mocking, but nothing drives the actually-rendered app end-to-end in a real browser. [Playwright](https://github.com/microsoft/playwright)'s [`page.routeWebSocket()`](https://playwright.dev/docs/api/class-websocketroute) can intercept/mock exactly the WSS transport mqtt.js opens (in the browser, mqtt.js uses the global `WebSocket` — the very reason MSW's Node-side interception fails does not apply here), and `page.route()` can inject reason-code REST bodies (including non-2xx) — a near-exact match to this app's two most distinctive transports. Designing the WSS/MQTT mocking layer, CI browser provisioning, and fixture tie-in to the vendored contracts is enough surface for its own track, not a same-scan adoption.

License: strong — Apache-2.0. Maintenance health: strong — Microsoft-backed, ~6-week release cadence, v1.62.1 current with a v1.63 alpha shipping 2026-07-24 ([releases](https://github.com/microsoft/playwright/releases)); ~80.1M downloads/week ([downloads API](https://api.npmjs.org/downloads/point/last-week/playwright)). TypeScript fit: strong — authored in TS, fully typed API. Integration cost: adequate — real work needed to build a `routeWebSocket()`-based MQTT mocking layer atop 0070's aedes-over-ws fixtures rather than a drop-in. Output quality: strong — full browser rendering catches CSS/interaction/aria-live regressions unit tests can't reach; [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright) 4.13.0 bolts on automated a11y assertions in the same runs. Escape hatch: strong — plain Node/TS test files, no proprietary DSL.

#### Supply-chain vulnerability auditing — OSV-Scanner 2.5.0 (direct adopt)

The dependency-architecture area governs import graphs, not CVE exposure, and this app pulls a non-trivial npm surface (mqtt.js, xstate, zustand, the orval/zod contract-pipeline chain, TanStack Query) with no track checking any of it against known vulnerabilities — a genuinely distinct category. [OSV-Scanner](https://github.com/google/osv-scanner) is one CI step reading the existing lockfile, with no server to host, so it satisfies D-0003 (OSS-only, no self-hosted-server products) outright.

License: strong — Apache-2.0. Maintenance health: strong — v2.5.0 shipped 2026-08-07, one week before this scan ([release notes](https://github.com/google/osv-scanner/releases/tag/v2.5.0)); 80+ contributors, 10,500+ stars, active osv-scalibr integration work. TypeScript fit: strong (n-a by design) — language-agnostic CLI reading the lockfile directly, no code integration. Integration cost: strong — one CI step (`osv-scanner scan --lockfile=package-lock.json`) emitting SARIF for CI annotations; no account, no hosted service. Output quality: adequate — reliably flags OSV/CVE-mapped known vulnerabilities but, like all lockfile scanners, says nothing about zero-day supply-chain issues and needs a human triage step for no-fix-available cases. Escape hatch: strong — standalone binary, no lock-in; swappable for `npm audit`/`audit-ci` without touching app code.

## Recommendation

**Shape: adopt (seven direct adoptions) + two proposed future tracks + one skip.** The
scan resolved seven areas cleanly enough to recommend without dedicated tracks: knip
6.32.2 (its two competitors are archived in its favor), dependency-cruiser 18.2.0 (the
only candidate that expresses the choke-point invariant as a standalone CI step immune
to the D-0020 oxlint-override fragility), MSW 2.15.0 on the REST leg (orval, already
owned by 0010, generates its handlers), type-coverage 2.30.1 (competitors stale or
mid-stall), size-limit 13.0.3 (the only build-tool-agnostic option), plus the sweep's
eslint-plugin-jsx-a11y 6.10.2 and OSV-Scanner 2.5.0. Two areas earn full tracks:
**proposed 0100-react-compiler-adoption** (mainstream-mature but with live stack-specific
unknowns: the Vite-8 install churn and the open xstate v5 factory-memoization issue
[statelyai/xstate#5426](https://github.com/statelyai/xstate/issues/5426)) and **proposed
0110-e2e-browser-testing** (Playwright; the `routeWebSocket()` MQTT mocking layer and
contract-fixture tie-in are a design surface, not a config). One skip: MSW on the
MQTT-over-WSS leg — wrong interception point (mqtt.js's Node transport bypasses the
global-`WebSocket` patch) and wrong abstraction level (MSW disclaims custom WebSocket
protocols); the aedes-over-ws harness the 0060 spike proved keeps that role. Minting the
proposed track numbers is the acceptance gate's call, not this report's.

> **2026-08-14 update (post-draft, pre-acceptance)**: track number 0100 has since been
> minted for the user-directed type-strictness track (D-0021), so if accepted, the
> proposed React Compiler and end-to-end tracks would mint as **0110** and **0120**.

**Lane policy, stated once** (the critic flagged an apparent tension): the program
prefers oxlint-native rules or standalone CLIs first, and extends the existing
ESLint-in-CI lane only when no oxlint-native or standalone path covers the surface.
That is why dependency-cruiser (standalone CLI) beat eslint-plugin-boundaries (would
grow the ESLint lane's AST cost for a surface a standalone tool covers), while
jsx-a11y's remainder goes *into* the ESLint lane (no standalone alternative exists, the
lane already runs, and the addition is config-only). These are the same policy, not a
contradiction.

**The shared risk is bus factor.** knip, dependency-cruiser, MSW, type-coverage, and
size-limit's PR-comment action are each effectively single-maintainer. All are currently
healthy — most released within days of the scan date — but the program should treat
each as swappable (all are devDependencies or CI steps with no app-code coupling; every
escape-hatch score above reflects this) rather than load-bearing forever. The two
archived predecessors in the dead-code area (ts-prune, depcheck) show the failure mode
is real; knip's own rise shows the ecosystem replaces such tools.

**Two facts gate final wiring, raised as intake
[2026-08-14-0090-app-facts](../../intake/2026-08-14-0090-app-facts.md)** (critic-flagged
as load-bearing, not merely scoping): (a) the **build tool** — it was elimination
evidence against rsdoctor in the bundle-budget area and selects the React Compiler
install recipe outright; a webpack/rspack answer re-opens rsdoctor and reroutes the
compiler through loader chains; (b) the **TypeScript strictness posture** — it decides
whether type-coverage's percentage ratchet or a per-file allowlist convention comes
first (decision rule in the type-coverage section).

**Constraints applied**: D-0003 (every recommended tool verified MIT/ISC/Apache-2.0; no
hosted-server dependency in any recommended path — bundlemon/bundlewatch scored down
for exactly that); D-0011 (no SonarSource packages appeared in any shortlist); D-0002
(the lane policy above operates inside the pragmatic oxlint + ESLint-in-CI mix); D-0004
(assumptions consolidated below); D-0001/D-0017 (no prototyping in this track; the
spike questions below are pre-scoped for the spike harness).

**Consolidated assumptions** (each area declared its own; the canonical list, per the
critic): build tool assumed Vite (gates React Compiler recipe; eliminated rsdoctor);
monorepo-or-single-package assumed single-or-simple-workspace (knip/type-coverage/
size-limit config shape); Node assumed ≥20 (knip engines `^20.19.0 || >=22.12.0`, MSW
`>=18`); test framework assumed vitest (intake item g, unchanged); React version
unknown (intake item i — React Compiler needs `react-compiler-runtime` below 19); TS
version ≥4.8 and strictness posture assumed modern-strict-ish (drives the ratchet
design; now an intake item); CI provider unknown (dependency-cruiser and OSV-Scanner
output-format choices); the app judged an internal product, not a redistributed library
(why `@size-limit/time` is skipped).

## What a spike would validate

Pre-scoped for the D-0017 harness; the first four are runnable from this repo's spike
lane, the last two need app-repo access:

- **knip**: with the build tool and layout facts confirmed, does `npx knip`'s auto-detected plugin set need zero manual config, or does the real entry-point layout need explicit `entry`/`project` globs? What is the false-positive rate of production mode against xstate v5 machine definitions and Zustand store modules (assign, action creators, selector re-exports can look like unused exports to static analysis)? Should default-mode run gate CI or stay advisory?
- **dependency-cruiser**: does tsconfig path-alias resolution work cleanly against the app's actual layout? Should the forbidden-dependency rule replace the oxlint `no-restricted-imports` enforcement outright or run as a redundant backstop during a transition window? Which output format fits the CI provider?
- **MSW/orval**: does adding `mock: true` to the orval config collide with the mutator-based client config the 0060 boundary-wiring spike proved (same generator entry vs. a second target)? Concrete pass/fail: does MSW's `WebSocketInterceptor` see mqtt.js traffic at all under vitest's Node environment (closing the theoretical `ws`-package gap with evidence)?
- **React Compiler** (if 0100 is minted): does the current Babel-reintegration recipe (`@rolldown/plugin-babel` + `reactCompilerPreset`, or the legacy `babel:{}` config pre-v6) apply cleanly without breaking Fast Refresh? Run `react-compiler-healthcheck` over the real component tree: what fraction bails out, and how many bailouts are xstate-factory-driven per [#5426](https://github.com/statelyai/xstate/issues/5426)? Is a `useMemo`-wrapped `setup().createMachine()` accepted by `preserve-manual-memoization` without a mismatch bailout? Two external events to track, no committed dates: the official Rust-port npm publish, and Rolldown/Vite's resolution of the native-integration binary-size tradeoff — either changes the recommended install path.
- **type-coverage** (app repo): run `npx type-coverage --detail` in default and `--strict` modes; apply the decision rule in the survey section (≥90–95% diffuse baseline → ratchet as designed; low or clustered → per-file allowlist convention first).
- **Playwright** (if 0110 is minted): design the `routeWebSocket()` MQTT mocking layer against 0070's aedes fixtures; measure CI browser-provisioning cost; prototype the contract-fixture tie-in (orval mocks + fishery factories driving `page.route()` bodies).

## Sources

Sources are linked inline per candidate throughout; all accessed 2026-08-14. Principal
project pages:

- https://github.com/webpro-nl/knip — accessed 2026-08-14
- https://github.com/sverweij/dependency-cruiser — accessed 2026-08-14
- https://github.com/mswjs/msw — accessed 2026-08-14
- https://orval.dev/docs/guides/msw/ — accessed 2026-08-14
- https://github.com/plantain-00/type-coverage — accessed 2026-08-14
- https://www.npmjs.com/package/babel-plugin-react-compiler — accessed 2026-08-14
- https://github.com/statelyai/xstate/issues/5426 — accessed 2026-08-14
- https://github.com/ai/size-limit — accessed 2026-08-14
- https://github.com/jsx-eslint/eslint-plugin-jsx-a11y — accessed 2026-08-14
- https://github.com/microsoft/playwright — accessed 2026-08-14
- https://github.com/google/osv-scanner — accessed 2026-08-14
- https://github.com/web-infra-dev/rsdoctor — accessed 2026-08-14
