# App Profile

Facts about the application under study, supplied by the user (the app repo is not
accessible from here — D-0004). Reports cite this file; a missing fact becomes a declared
assumption in the report. Partial answers are fine.

**Status**: partially filled (2026-08-14: React, TypeScript, strictness, repo layout, import
style, build tool, MQTT QoS + rate, CI, browser targets, scale, team size). Still unfilled:
Node version, package manager, the whole Contracts section, test framework, and vetoes.

## Stack
- React version: 18.3.1 (2026-08-14, user — React 19 not in play)
- TypeScript version: 5.9.3 (2026-08-14, user)
- TypeScript strictness: very loose (2026-08-14, user — see track 0100 for the
  enforcement design; the codebase receives a high volume of agent-authored code)
- Node version: **>= 24** (2026-08-14, user) — clears every floor in play (Vite 8, knip
  `^20.19.0 || >=22.12.0`, MSW `>=18`)
- Build tool (Vite / webpack / other): **Vite 8.0.16**, with **@vitejs/plugin-react 6.0.2**
  (2026-08-14, user). Decisive for React Compiler: plugin 6.x carries **no internal Babel**,
  so the compiler wires through `@rolldown/plugin-babel` + `reactCompilerPreset`, never the
  legacy `react({ babel: … })` option. Note 8.0.16 is below 8.2, where native
  `resolve.tsconfigPaths` left experimental — so alias resolution likely still runs through
  `vite-tsconfig-paths` today.
- Package manager: **bun, exclusively** (2026-08-14, user, clarified). Bun alone installs and
  manages dependencies; the tracked lockfile is the **text `bun.lock`** format, and **there
  is no `package-lock.json` in the repo**. Two consequences. First, tooling that requires an
  npm/yarn-shaped lockfile is eliminated on constraint, not merit — this removed five
  candidates from track 0140, including the whole `npm audit` family. Second, the text format
  is the supported one: nearly every scanner draws its line at text-versus-binary, so the
  broad candidate list survives where it would have collapsed on `bun.lockb`. Because there
  is no second lockfile, the npm/bun drift hazard does **not** apply; a CI invariant asserting
  no `package-lock.json` reappears is worth keeping as cheap prevention rather than a fix.
- Monorepo or single package: **pseudo-monorepo** (2026-08-14, user) — the codebase is
  split across separate package directories, but those directories carry **no individual
  package.json and no individual versioning**. There is one root package.json and
  everything is downstream of it: no npm/pnpm/yarn workspaces, no per-directory
  dependency lists, no independent versions. Directories express package-like intent
  without npm package boundaries. Consequence to carry into every recommendation: JS
  tooling that advertises "monorepo support" generally keys it on package.json
  workspaces and will not engage here; conversely, nothing at the package-manager level
  enforces which directory may import what, so directory boundaries are convention plus
  path-based lint rules only.
- Internal import style: **scoped-alias specifiers** (2026-08-14, user) — cross-directory
  imports are written `import … from '@appname/path/to/thing'`. `@appname` is the app's
  own scope: not a published npm package, not present in the root package.json
  dependencies, and backed by no per-directory manifest. It can only resolve through a
  tsconfig `paths` mapping plus matching alias configuration wherever else modules are
  resolved (bundler, test runner, lint import resolvers). Two consequences to carry:
  internal specifiers are syntactically indistinguishable from real external scoped
  packages, so any tool that classifies imports or checks specifiers against
  package.json may misread them; and because `paths` required `baseUrl` before TS 4.1,
  the tsconfig may still carry `baseUrl` — which TypeScript 7.0 removed and the oxlint
  type-aware lane rejects outright (intake 2026-08-14-0100 item d).

## Contracts
- OpenAPI version(s):
- AsyncAPI version(s):
- Rough counts (contracts / operations / message types):
- Current TS type-generation tool:

## MQTT
- QoS levels used: 1 and 0
- Topic-scheme shape (redacted example ok): varies a bit by use case
- Rough peak message rate (msgs/sec): ~50 per second
- Session mode: **`clean: false` with a persisted clientId** (2026-08-17, user) — a
  **persistent** session, not mqtt.js's default. This **falsifies 0060 assumption A-5 and
  0070 assumption A-6**, both of which declared `clean: true`; each accepted report now
  carries a dated in-place correction, and the 0060 spike's `design.md` hard-codes
  `readonly clean: true` as a fixed config value. Four consequences carry into every
  affected recommendation. (1) The broker **retains session state and queues QoS 1 messages
  while the client is disconnected**, redelivering them on reconnect — so cross-reload
  redelivery is real, which is what makes track 0150 live rather than a skip. (2) The
  mqtt.js duplicate-delivery history that A-5 declared out of scope
  ([#909](https://github.com/mqttjs/MQTT.js/issues/909)) is **in** scope. (3) A reconnect is
  no longer automatically a gap for QoS 1 streams, so 0070's "every reconnect is a gap" rule
  is now over-conservative there (safe, but paying invalidation round-trips it may not owe);
  it still holds for QoS 0, which is not queued. (4) `resubscribe: true` is redundant against
  a retained session and re-triggers retained-message delivery on every reconnect. **Still
  unanswered and consequential**: whether the persisted clientId is shared across tabs or is
  per-tab — see intake 2026-08-17-0150 item f. The two readings have opposite failure modes
  and one of them is a live defect independent of any inbox.
- Durable-ingest scope: **per topic, opt-in** (2026-08-18, user) — IndexedDB round trips are
  wanted only for messages on selected topics, not for all traffic. This lands as a field on
  0060's accepted per-channel `ChannelPolicy` row, which is the extension shape that track's
  spike pre-authorized ("a policy-row addition, not an interface redesign"). Two consequences
  to carry. It lowers the cost estimate — the rate that matters is the selected topics' share
  of the ~50 msg/s, not the aggregate — and it correspondingly shrinks retention and quota.
  It does **not** buy isolation: `handleMessage` is one client-wide serialized hook and 0060's
  delivery queue is shared, so a durable write blocks every other topic while it runs and a
  burst on non-durable topics can shed durable ones.
- Durable-ingest volume: **~6 of roughly 40 topics, ceiling ~5 msg/s** (2026-08-18, user) —
  against the ~50 msg/s aggregate, so the durable path is about a tenth of traffic. Three
  consequences, computed rather than assumed. (1) Five per second is a 200 ms serialized budget
  per message, so per-message acknowledgement deferral runs at roughly a **0.8% duty cycle
  nominally and 10% pessimistically**, and head-of-line blocking of the other 34 topics is a
  bounded cost rather than a blocker — batching is an optimization here, not a necessity.
  (2) Dedup-key retention is **derivable from the broker's session-expiry interval** (the
  broker never redelivers beyond it), and sizes at roughly 1.2 MB of keys per hour of expiry —
  comfortable at any plausible setting. (3) The reconnect replay burst does **not** shrink with
  this: it is sized by session expiry, so an hour offline queues ~18,000 durable-topic messages
  against 0060's delivery-queue bound of 256.
  > **2026-08-18 revision.** Consequence (2) is withdrawn and consequence (3) is materially
  > reduced; the protocol version and the broker defaults below supersede both. Retention is
  > **not** derivable (3.1.1 has no session expiry), and the replay burst is capped at the
  > broker (~1000, not 18,000) and paced by the in-flight window once acks are deferred.
- Protocol version: **MQTT 3.1.1 (protocolVersion 4)**, no session-expiry interval
  (2026-08-18, user). Keepalive **30 s**. Four consequences, spec-verified. `handleMessage` is
  the only acknowledgement seam (`customHandleAcks` is a no-op below v5, `manualAcks` does not
  exist). There are **no User Properties or Correlation Data**, so a producer-supplied
  idempotency key has to go inside the payload — a vendored-schema change, with no cheaper
  variant. There are **no Subscription Identifiers**, so copies of one publish delivered for
  two overlapping filters are indistinguishable and a content hash cannot separate them.
  And 3.1.1 has **no session-expiry concept at all** — the spec bounds session lifetime only
  from below and leaves the upper bound to "administrative policies" — so how long a persistent
  session survives is broker configuration, not protocol. Note also that **[MQTT-4.6.0-2]
  requires PUBACKs to be sent in the order the PUBLISHes were received**, which constrains any
  per-topic acknowledgement deferral to a single receipt-ordered release queue. Keepalive 30 s
  gives a 45 s server deadline (1.5×) — vast headroom against a millisecond-scale commit, but
  tight for a backgrounded browser tab, where Chromium throttles timers to ~60 s after five
  minutes hidden and WebSocket is not an exemption; whether that is causing background
  disconnect-resume cycles today is worth checking independently of this track.
- Broker product and version: **unknown — now the highest-value missing fact.** "Undefined"
  queue depth and in-flight window mean *defaults in force*, and the mainstream defaults invert
  rather than merely differ: queue depth ~1000 everywhere except AWS IoT (unpublished);
  in-flight 20 (Mosquitto, VerneMQ), 32 (EMQX), 50 (HiveMQ CE), 100 (AWS, fixed); session
  expiry never (Mosquitto, VerneMQ, HiveMQ) versus 2 h (EMQX) and 1 h (AWS); overflow drops
  **oldest** on EMQX and **newest** on the rest; and VerneMQ (20 s), NanoMQ (10 s) and AWS
  (up to 1 h) retransmit unacknowledged QoS 1 to a still-connected client while Mosquitto and
  EMQX 5 do not. Overflow is silent in every case — no protocol signal reaches the client — so
  application-level gap detection is the only way to notice. **Still unanswered**: *which* 6
  topics, whether their effects are idempotent, whether all 6 are QoS 1, payload size, and the
  broker product — intake 2026-08-17-0150 items b and h.

## Environment
- CI provider: **GitHub Actions on GitHub Enterprise Cloud**, application repo is
  **private**, with **custom on-prem (self-hosted) runners of varying sizes** (2026-08-14,
  user). Consequences: runner hardware is the organisation's own choice, so memory-hungry
  whole-repo tools are not capped by GitHub-hosted runner sizes; Enterprise *Cloud* means the
  GHES air-gap caveat on advisory-database sync does not apply; and code scanning on a
  private repo still depends on whether the enterprise licenses Code Security / Advanced
  Security, which remains unanswered.
- Scanning preference: an **offline vulnerability database fed by a periodic sync** is the
  preferred operating model, though outbound access is believed available (2026-08-14, user).
- Browser targets: Firefox version ~124 , Chromium latest - (latest - 2)
- Test framework: **vitest 4.1.9** (2026-08-14, user) — retires an assumption standing since
  Wave 2
- Approximate app scale (LOC or file count): 150,000 lOC
- Team size: ~50

## Vetoes and existing investments
- Existing team decisions that would disqualify candidates:
- **Snyk is already licensed and in use** (2026-08-14, user) — but the team reports not
  knowing how to configure or use it properly for this repository, and is "not really
  married to it". This is an existing investment rather than a veto, and it creates a live
  tension with D-0003, whose letter bars paid products while its rationale ("procurement is
  off the table") does not apply to something already bought. Ruling requested as intake
  [2026-08-14-supply-chain-gates](../intake/2026-08-14-supply-chain-gates.md) item d.
