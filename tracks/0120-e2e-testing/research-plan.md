# 0120-e2e-testing — research plan

**Status**: draft

## Goal

Decide whether — and how — to add a browser-based end-to-end testing layer on top of the
lanes this program already owns, so any pick composes with rather than duplicates them:
0070 covers state and concurrency at the unit and model level (fast-check, `xstate/graph`),
the 0060 spike proved a real in-process aedes-over-ws MQTT broker harness, and 0090
adopted MSW for REST mocking. The track's **required output is three decisions**: choose
an e2e runner or explicitly decline to add one; decide per flow whether the MQTT-over-WSS
transport is driven by browser-level route interception, by a real broker the browser
dials, or by a hybrid; and decide how REST reason-code responses (2xx and non-2xx alike)
are injected so fixtures stay derived from the vendored contracts and the orval/fishery
outputs **track 0010 owns** rather than forking a second fixture format. CI operations
policy — trigger cadence, sharding, retry and quarantine rules — is scoped as a
**lighter follow-on**, not part of the single recommendation, so the track can converge.
Two standing constraints shape everything: the pseudo-monorepo has no affected-package
test selection, so the suite always runs whole; and agent-authored code is the dominant
source of new specs, and therefore of sprawl and flake.

## Key questions

1. **Marginal value** — what does real-browser e2e catch that 0070's model tests and
   0060's in-process broker harness cannot (a real WSS/TLS upgrade handshake, the
   browser's native `WebSocket`, real Zustand/xstate-driven DOM updates under reconnect
   and backoff)? Name where the marginal value is thin enough that a proposed spec should
   be redirected back into the 0060/0070 lanes instead of accepted here.
2. **Transport strategy** — for each MQTT-driven flow, is the WSS transport driven by
   browser-level route interception (Playwright's `page.routeWebSocket()` or an
   equivalent), by a real broker extending 0060's aedes harness that the browser dials in
   CI, or by a hybrid? What decides which flow gets which treatment, rather than picking
   one mode for the whole suite?
3. **Alias resolution** — does the candidate runner's spec bundler resolve this repo's
   `@appname/...` tsconfig-paths imports without assuming package.json workspaces, or does
   it need the same alias shim the unit lane carries? Does that shim exist, or is it new
   work this track must scope?
4. **Reason-code REST fixtures** — does route-level REST mocking consume fixtures
   generated from the same contracts and factories **0010** produces (orval-typed
   responses, fishery factories), or does it require a second e2e-only fixture format that
   can silently drift from the contract?
5. **Reporting without a known CI provider** — the CI provider is undetermined. Does the
   chosen runner's reporting (HTML reports, trace viewers, JUnit XML, provider-specific
   annotations) work without assuming GitHub Actions, and what changes if CI turns out to
   be something else?
6. **Suite size** — given 0060 and 0070 already own broker-protocol and state-transition
   correctness, how many e2e specs are actually justified, and which flows does this track
   name as the ones that genuinely must be e2e (connect/reconnect/backoff over WSS, live
   reason-code error surfacing in the UI, cross-tab or session state)?
7. **Sprawl and flake resistance** — given the volume of agent-authored specs and no
   changed-file selection, what stops agents from duplicating specs or silencing flakes
   with loosened assertions, blanket retries, or skips instead of fixing the cause? This
   question stays in scope even though the fuller CI operations policy is a follow-on.
8. **Escape hatch** — if the chosen runner's assumptions about alias resolution, WSS
   interception, or sharding stop holding, how much of the fixture and helper layer is
   runner-specific versus portable to another runner or back down into 0060/0070?

**Explicitly out of scope**: whether and where axe-core accessibility assertions run.
Track **0130** owns that decision. This track reports each runner's axe-binding
availability as an input fact for 0130 and does not evaluate axe tooling itself.

## Candidates

- Playwright — https://playwright.dev — Apache-2.0, Microsoft-backed, multi-engine (Chromium/Firefox/WebKit); `page.routeWebSocket()` natively intercepts the WSS transport the browser's global `WebSocket` opens, and `page.route()` injects REST bodies including non-2xx (1.62.1, 2026-07-30)
- Cypress — https://github.com/cypress-io/cypress — MIT, the most widely adopted runner; `cy.intercept()` is HTTP-only, the `websocket` resourceType filter is deprecated, and there is no documented native WebSocket interception — so mocking MQTT would need a community plugin or a real broker (15.20.1, 2026-08-10)
- WebdriverIO — https://webdriver.io — MIT, WebDriver/BiDi based; `browser.mock()` covers HTTP only today, with full WebSocket support documented as blocked on BiDi primitives landing (9.30.1, 2026-08-03)
- Puppeteer — https://github.com/puppeteer/puppeteer — Apache-2.0, Google-maintained CDP automation; request interception is HTTP-only with no high-level WebSocket route API, so WSS interception means hand-rolling raw CDP `Network.webSocketFrame*` events (25.7.0, 2026-08-13)
- @vitest/browser — https://vitest.dev/guide/browser — MIT, vitest's real-browser mode via a Playwright or WebdriverIO provider; a middle path that stays inside the existing vitest config instead of adopting a second framework (4.1.10, 2026-07-06)
- **Extend the existing vitest + aedes harness, add no browser runner** — https://github.com/moscajs/aedes — not a new tool: keep 0060's in-process real-broker harness and 0090's MSW mocks under jsdom/happy-dom. Cheapest and least flaky, but never exercises a real browser WebSocket stack, a real WSS handshake, or real rendering. The recommendation must beat this baseline explicitly (vitest 4.1.10; aedes 1.1.1, 2026-06-30)

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

| Criterion | Weight |
|---|---|
| License | low — every shortlisted runner is Apache-2.0 or MIT; confirm per release, but not a discriminator |
| Maintenance health | high — this is a multi-year dependency carrying the program's costliest test layer; backer stability and cadence matter more here than in lighter lanes |
| TypeScript fit | low — loose strictness lowers the bar for nominal TS support; the real risk is alias resolution, scored under Integration cost |
| Browser compatibility | high — the WSS transport and xstate-driven DOM updates can differ across Chromium, Firefox, and WebKit; this is the literal subject of the layer |
| Contract-format support | n-a — this track consumes 0010's generated fixtures and adds no contract parsing of its own |
| Integration cost | high — alias-only resolution with no workspaces, an unconfirmed build tool, and composing cleanly with 0060's harness make setup the central risk |
| Runtime overhead | high — browser e2e is the most expensive CI layer, and this repo has no affected-package selection to shrink it; suite sizing gates feasibility |
| Output quality | medium — traces, video, and screenshots speed triage of the flakiest layer, but are secondary to whether WSS interception and reason-code injection work at all |
| Escape hatch | medium — spec meaning, the cost of switching later: selectors, fixtures, and CI config migrate, mitigated by keeping fixtures contract-derived rather than runner-specific |

## Facts needed

- Confirm the test framework is vitest, and whether it already resolves tsconfig `paths` via a plugin an e2e runner's bundler could reuse
- Build tool — decides whether a runner can boot a dev server through its built-in `webServer`/`devServer` config or needs a custom launch script
- CI provider, runner type, and parallel worker budget — sizes sharding for a suite with no affected-package selection
- ~~Which browsers are actually supported in production~~ — **resolved: Firefox ~124 and
  Chromium latest to latest-minus-2. No Safari, no WebKit** (facts/app-profile.md). This
  removes a differentiator rather than adding a requirement: Playwright's WebKit project and
  WebdriverIO's Safari-driving advantage both fall out of the decision entirely, so the
  runner choice turns on WSS interception, alias resolution, and CI cost instead. Firefox
  ~124 is an older floor and worth confirming as a genuine support target rather than a
  stale entry
- Whether any environment runs the app against a real MQTT broker over WSS with TLS that CI could reach, versus only the in-process aedes harness
- How 0010's factories and 0090's MSW handlers are packaged (importable fixtures versus test-local definitions) — decides whether e2e reuses them directly or needs an adapter
