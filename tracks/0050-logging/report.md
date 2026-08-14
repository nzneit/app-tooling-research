# 0050-logging — report

## Summary (STE)

This track examined ten open-source logging libraries and the OpenTelemetry Logs stack for the browser application. We recommend the adopt + wrap shape: adopt consola 3.4.2 as the base and wrap it with a thin facade. The facade owns the throttle rules, the redaction, the remote sinks, and the runtime configuration. Consola is small, has support from the UnJS organization, and permits level and sink changes at run time.

The most important risk is the custom facade code, because no library supplies throttling by pattern. We rejected the OpenTelemetry Logs API as the facade surface, because its browser stack is experimental today. The facade can add OpenTelemetry output later as one more sink when that stack becomes stable. Consola also had no feature release for 17 months, but the facade keeps a swap to LogTape cheap. The next step is a spike that validates the facade design, the throttle engine, and the remote sink.

**As of**: 2026-08-13 (versions evaluated are listed per candidate; amended 2026-08-13 after the wave-1 gap sweep)
**Recommendation**: adopt + wrap — consola (base) + thin project-owned facade

## Survey

### loglevel (v1.9.2)

Tiny browser-first leveled logger, MIT, zero dependencies, **1,437 B min+gzip** ([Bundlephobia](https://bundlephobia.com/package/loglevel@1.9.2)); the [README](https://github.com/pimterry/loglevel) claims the same 1.4 KB and bundles its own TypeScript types ("no need for extra @types packages"). Named loggers via `log.getLogger(name)` — each "works exactly like the root log object, but can have its level and logging methods set independently" — with a `getLoggers()` registry. Caveat: children inherit the root level only at creation ("If the root logger's level changes later, the new level will not affect other loggers that have already been created"), so a facade must fan out level changes itself. `log.setLevel(level, [persist])` persists to localStorage with cookie fallback; `methodFactory` + `log.rebuild()` is a clean single interception seam for sinks and throttling. The plugin ecosystem is thin: [loglevel-plugin-remote](https://registry.npmjs.org/loglevel-plugin-remote) (batched HTTP shipping) was last published **2018-09-28** — a design to copy, not a dependency. Maintenance is stable-mature: v1.9.2 published 2024-09-06, last master commit 2024-12-19, single maintainer with Tidelift funding ([GitHub API](https://api.github.com/repos/pimterry/loglevel)).

### debug (v4.4.3)

Namespace-pattern logger (MIT, **2,525 B min+gzip** per [Bundlephobia](https://bundlephobia.com/package/debug@4.4.3)), evaluated as **prior art only**: debug has no log levels at all — namespaces are binary on/off — so per-logger levels, a hard facade requirement, would be built entirely in the wrapper. Its lasting contribution is the selector grammar: `debug.enable('foo:*,-foo:bar')` — comma-separated selectors, `*` wildcard, `-` exclusion — plus `localStorage.debug` persistence ([README](https://github.com/debug-js/debug)). That grammar is the right UX model for the facade's throttle/sample-by-pattern config keys. Cautions: types live only in [@types/debug](https://registry.npmjs.org/@types/debug/latest), and **4.4.2 was compromised** in the September 2025 npm supply-chain attack; 4.4.3 is the clean re-release ([release notes](https://github.com/debug-js/debug/releases/tag/4.4.3)) — pin exact versions anywhere it appears transitively.

### pino (browser mode) (v10.3.1)

Pino's `browser.js` build is a console shim with hooks, not Node pino compiled for the browser ([docs/browser.md](https://github.com/pinojs/pino/blob/main/docs/browser.md)); it is small (**3,398 B min+gzip**, [Bundlephobia](https://bundlephobia.com/package/pino@10.3.1)) and superbly maintained (v10.3.1 2026-02-09, repo pushed 2026-08-13, ~42.7M downloads/week per [api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/pino)). Supported: numeric levels with a runtime setter (`logger.level`), child loggers with bindings, opt-in structured output (`browser.asObject`), and construction-time `browser.write` / `browser.transmit` sink hooks. Not supported: Node transports/destinations, serializers ("ignored by default in the browser"), and — decisive for this track — **`redact` silently does nothing in the browser** ([issue #670](https://github.com/pinojs/pino/issues/670)). Sink hooks are fixed at construction, so all runtime sink swapping would be facade-owned indirection. Pino contributes less machinery in the browser than its Node reputation suggests.

### tslog (v5.1.0)

TS-native, MIT, zero runtime dependencies, and feature-wise the best match for this track's asks: `child()`/`getSubLogger()` with per-child `minLevel`, runtime `setMinLevel()`, `attachTransport()` returning a detach function, a middleware pipeline, an off-the-shelf **`tslog/throttle`** middleware (`{ windowMs, key }`), and first-class masking (`mask.{keys, regex, paths}` with hashing censors) ([README](https://github.com/fullstack-build/tslog)). The risks are equally concentrated: the current major is a **ground-up ESM-only rewrite released 2026-07-14** — one month old at evaluation, invalidating most existing v4 documentation ([releases](https://github.com/fullstack-build/tslog/releases)); the project is effectively single-maintainer (808 commits vs 8 for the next human) with a prior ~2-year sparse stretch; and the full build is **21,142 B min+gzip** ([Bundlephobia](https://bundlephobia.com/package/tslog@5.1.0)) — the slim (~9.8 KB gz) and lite (~0.8 KB gz) entries shed exactly the differentiating features (masking, pretty errors).

### consola (v3.4.2)

UnJS-org universal logger (MIT, zero dependencies), the only org-backed candidate: 7.3k stars and **~54.8M downloads/week** ([api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/consola)). Dedicated browser build via conditional exports (`consola/browser`) at **2.45 kB min+gzip** ([bundlejs](https://bundlejs.com/?q=consola%2Fbrowser)). Sinks are reporters — a minimal `{ log(logObj) }` interface receiving the raw `{ type, tag, args, date }` record — managed at runtime with `addReporter`, `removeReporter`, and `setReporters` (a plain array replace in [src/consola.ts](https://github.com/unjs/consola/blob/main/src/consola.ts)). Levels: `createConsola({level})` at construction, `consola.level = X` at runtime; child loggers via `withTag(tag)` carry per-instance levels; `pauseLogs()`/`resumeLogs()` queue and flush. It even ships the pair's only built-in throttle primitive: identical-message dedup (`throttle`/`throttleMin` in [src/types.ts](https://raw.githubusercontent.com/unjs/consola/main/src/types.ts), flushing "(repeated X times)") — though it is undocumented internals and not pattern-scoped. Caveats: last feature release was 2025-03-18 (~17 months; since then bot churn), the browser reporter is basic console styling, and there is no redaction or structured output without a custom reporter.

### adze (v2.3.0)

Apache-2.0 universal logger with the richest built-ins of the small candidates: include/exclude `filters` by namespace/label/level, level-scoped log listeners, four output formats including JSON, a bounded log cache with re-render tools, and per-child config via `seal(cfg)` ([configuration reference](https://adzejs.com/reference/configuration.html), [global store](https://adzejs.com/reference/global-store.html)). It was set aside on maintenance and mechanics: effectively one maintainer (78 commits vs 4 for the next human; 284 stars, ~33.5k downloads/week), the v2.3.1 GitHub release of 2026-07-20 was **never published to npm** ([releases](https://github.com/adzejs/adze/releases)), the bundle is **9.28 kB min+gzip** ([bundlejs](https://bundlejs.com/?q=adze)), and re-calling `setup()` constructs a fresh `window.$adzeGlobal`, discarding registered listeners and the log cache ([src/functions/global.ts](https://github.com/adzejs/adze/blob/master/src/functions/global.ts)) — a hazard for exactly the runtime reconfiguration this track needs. No throttling/sampling primitives found.

### LogLayer (v9.4.0)

MIT logging **facade** over ~30 pluggable transports (console, pino, HTTP with batching/compression/retry, Datadog Browser Logs, Sentry, PostHog) with a fluent context/metadata API ([transports index](https://loglayer.dev/transports/)). It is not a wrap candidate so much as a pre-built version of most of this track's planned wrap layer: runtime `addTransport`/`removeTransport(id)`/`withFreshTransports` ([transport management](https://loglayer.dev/logging-api/transport-management.html)), runtime `setLevel` plus per-group levels (`setGroupLevel('database', 'debug')`, [child loggers/groups](https://loglayer.dev/logging-api/child-loggers.html)), and a fast-redact-based [redaction plugin](https://loglayer.dev/plugins/redaction.html). What it still lacks is precisely this track's residual work: no pattern-based throttling ([sampling plugin](https://loglayer.dev/plugins/sampling.html) is random-drop and "snapshotted at construction; mutating it afterward has no effect"), no config-file loader, and groups are flat tags rather than a wildcard-addressable hierarchy. Core is **7.15 kB min+gzip** ([Bundlephobia API](https://bundlephobia.com/api/size?package=loglayer@9.4.0)) before transport packages; single maintainer (Theo Gravity) at a monthly cadence, ~153k downloads/week.

### roarr (v7.21.7)

BSD-3-Clause structured logger; every message is a well-formed JSON envelope `{context, message, sequence, time, version}` — good raw material for machine-readable reports. But the browser story is DIY: core emits nothing until you implement `globalThis.ROARR.write` yourself ([README](https://github.com/gajus/roarr)), all level filtering is writer-side, and the turnkey [@roarr/browser-log-writer](https://github.com/gajus/roarr-browser-log-writer) was last pushed **2023-09-13** (~3 years stale) and adds 11 KB gz of liqe parser. There are no per-logger levels (levels are just `context.logLevel` values), no early-exit level gate — every call is JSON-serialized before the writer can drop it — and only `*Once` dedup for volume control. Core is 5.6 KB min+gzip ([Bundlephobia API](https://bundlephobia.com/api/size?package=roarr@7.21.7)); the core repo is active in 2026 but single-maintainer. The facade would carry nearly all required behavior.

### LogTape (v2.3.1)

Zero-dependency, MIT, "library-first" logging facade for browsers/Deno/Node/Bun ([repo](https://github.com/dahlia/logtape)). The strongest native fit for the track's feature list: **hierarchical categories** (`["app", "mqtt"]`) where each category sets its own `lowestLevel` and dispatch flows to prefix loggers ([categories manual](https://logtape.org/manual/categories)) — per-logger levels out of the box; sinks are plain `(record) => void` functions with non-blocking buffered modes that **drop-oldest at 2× bufferSize**, plus `fromAsyncSink()` ordered async bridging ([sinks manual](https://logtape.org/manual/sinks)); runtime reconfiguration is documented first-class: call `configure()` again with `reset: true` — Disposable sinks are disposed on reset ([config manual](https://logtape.org/manual/config)); and a dedicated [@logtape/redaction](https://logtape.org/manual/redaction) package does field-based and pattern-based redaction (built-in EMAIL/CREDIT_CARD/JWT/SSN patterns, HMAC pseudonymizer). Costs: **14.2 kB min+gzip** ([Bundlephobia API](https://bundlephobia.com/api/size?package=@logtape/logtape@2.3.1), tree-shaking should lower shipped bytes), reconfiguration is whole-config replacement rather than in-place mutation, no built-in throttling/sampling, and a bus factor of one — though a very active one (2.3.1 tagged 2026-08-12 with same-day backports to three older lines; 307k downloads/week).

### OpenTelemetry JS Logs stack (v0.221.0)

Added 2026-08-13 after the wave-1 gap sweep, as the industry-standard facade-surface alternative the original survey never weighed: [@opentelemetry/api-logs](https://registry.npmjs.org/@opentelemetry/api-logs/latest) + [@opentelemetry/sdk-logs](https://registry.npmjs.org/@opentelemetry/sdk-logs/latest) + [@opentelemetry/exporter-logs-otlp-http](https://registry.npmjs.org/@opentelemetry/exporter-logs-otlp-http/latest), all Apache-2.0 at 0.221.0 (accessed 2026-08-13). Off the shelf it supplies exactly the plumbing this track scopes as facade work: a standardized, vendor-neutral record shape emitted via `logger.emit({ severityNumber, body })` with attributes and resource, per-logger instances via `logs.getLogger(name, version)` from a global `LoggerProvider`, a `LogRecordProcessor` pipeline with `BatchLogRecordProcessor` batching/flush, and OTLP-HTTP export portable across any OTLP-speaking backend ([api-logs README](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/api-logs), [sdk-logs README](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/sdk-logs)) — this report already copies its fetch-keepalive flush decision (Key question 2). Maturity is the disqualifier today. Both packages live in opentelemetry-js's `experimental/` tree with the warning "This is an experimental package under active development. New releases may include breaking changes", and the api-logs README adds that the Logs Bridge API "is considered alpha software and there is no guarantee of stability or long-term support" until it stabilizes into `@opentelemetry/api`. The official JS status table lists Logs as **"Development"** while Traces and Metrics are Stable, and warns that "Client instrumentation for the browser is experimental and mostly unspecified" ([opentelemetry.io JS docs](https://opentelemetry.io/docs/languages/js/)); the dedicated [opentelemetry-browser](https://github.com/open-telemetry/opentelemetry-browser) repo (Apache-2.0, created 2025-09, pushed 2026-08-13 per the [GitHub API](https://api.github.com/repos/open-telemetry/opentelemetry-browser)) is so far only the "future home of the OpenTelemetry Browser SDK", shipping experimental event-based instrumentations. Weight: **sdk-logs alone is 7,119 B min+gzip** — 2.9x the entire consola browser build — with the OTLP-HTTP exporter at 4,824 B, api-logs at 838 B, and the mandatory `@opentelemetry/api` peer at 5,315 B ([Bundlephobia API](https://bundlephobia.com/api/size?package=@opentelemetry/sdk-logs@0.221.0); per-package figures overlap on shared dependencies), so even the most favorable accounting puts a working emit-to-OTLP pipeline past 10 kB min+gzip — at least 4x consola — before any custom code. And the differentiating custom code does not shrink: no throttling/sampling primitive for logs was found in the SDK docs — pattern throttling would be a custom `LogRecordProcessor` — and pattern-addressable runtime levels, config-file application, and redaction all remain facade work. The decisive design fact is OTel's own guidance: the Logs API "is not intended to be called by application developers directly. It is provided for logging library authors to build log appenders" ([api-logs README](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/api-logs)) — OTel itself expects application code to log through a logging library with OTel attached as a sink, which is precisely this report's recommended shape. Verdict: rejected as the facade surface, retained as the design target for the facade's record mapping and as a conditional future sink (see Recommendation).

### missionlog (v4.1.3)

Added 2026-08-13 after the wave-1 gap sweep, evaluated — like debug — as **prior art for the facade design**, not a base candidate. MIT, TypeScript-first, **1,075 B min+gzip** ([Bundlephobia API](https://bundlephobia.com/api/size?package=missionlog@4.1.3)), ~11.7k downloads/week ([api.npmjs.org](https://api.npmjs.org/downloads/point/last-week/missionlog)), v4.1.3 on npm ([registry](https://registry.npmjs.org/missionlog/latest)). It natively ships the two behaviors this track's facade must hand-build over consola: per-tag levels adjustable at runtime ("Configurable Log Levels – Adjust visibility for log level and tags at runtime") and a single handler seam — `log.init(config, callback)` routes every accepted record through one `(level: LogLevelStr, tag: string, message: unknown, params: unknown[])` callback ([README](https://github.com/rmartone/missionlog)). That makes it working proof that the facade's core — a tag-to-level registry plus one dispatch choke point — fits in roughly 1 kB, under half consola's browser build. It stays prior art rather than a base: a single-maintainer project (353 commits by the author vs 3 by dependabot; 34 stars; last push 2026-05-26 per the [GitHub API](https://api.github.com/repos/rmartone/missionlog)), tags are a flat namespace rather than a wildcard-addressable hierarchy, and there is no transport/batching ecosystem.

## Key questions

### 1. Which base library has the best browser story (bundle size, no Node-only APIs) and pluggable transports/sinks?

**Answer: consola**, with loglevel as the minimalist alternative and LogTape as the feature-rich alternative. Consola combines a dedicated 2.45 kB browser entry, zero dependencies, and the cleanest runtime-pluggable sink seam of the set (reporters are plain objects, swappable via `setReporters` at any time). loglevel is smaller still but its sink seam (`methodFactory` + `rebuild()`) is a method-patching hook rather than a record-stream interface. LogTape has the richest sink model (buffered, async-bridged, disposable) at ~5.8x consola's size. Pino browser mode and roarr have construction-time-only or DIY-global sink hooks respectively.

Minified+gzipped sizes, all accessed 2026-08-13:

| Candidate | min+gzip | Source |
|---|---|---|
| missionlog 4.1.3 (prior art) | 1,075 B | [Bundlephobia API](https://bundlephobia.com/api/size?package=missionlog@4.1.3) |
| loglevel 1.9.2 | 1,437 B | [Bundlephobia](https://bundlephobia.com/package/loglevel@1.9.2) |
| debug 4.4.3 | 2,525 B | [Bundlephobia](https://bundlephobia.com/package/debug@4.4.3) |
| consola 3.4.2 (`consola/browser`) | 2.45 kB | [bundlejs](https://bundlejs.com/?q=consola%2Fbrowser) |
| pino 10.3.1 (browser build) | 3,398 B | [Bundlephobia](https://bundlephobia.com/package/pino@10.3.1) |
| roarr 7.21.7 (core; +11 kB browser writer) | 5.6 kB | [Bundlephobia API](https://bundlephobia.com/api/size?package=roarr@7.21.7) |
| @opentelemetry/sdk-logs 0.221.0 (SDK only; +4.8 kB OTLP-HTTP exporter, +838 B api-logs, +5.3 kB api peer) | 7,119 B | [Bundlephobia API](https://bundlephobia.com/api/size?package=@opentelemetry/sdk-logs@0.221.0) |
| LogLayer 9.4.0 (core, before transports) | 7.15 kB | [Bundlephobia API](https://bundlephobia.com/api/size?package=loglayer@9.4.0) |
| adze 2.3.0 | 9.28 kB | [bundlejs](https://bundlejs.com/?q=adze) |
| LogTape 2.3.1 (pre-tree-shaking) | 14.2 kB | [Bundlephobia API](https://bundlephobia.com/api/size?package=@logtape/logtape@2.3.1) |
| tslog 5.1.0 (full; slim ~9.8 kB, lite ~0.8 kB) | 21,142 B | [Bundlephobia](https://bundlephobia.com/package/tslog@5.1.0) |

### 2. How do remote sinks batch, flush, and survive offline periods — and could MQTT itself serve as a log transport in this app?

**Batching**: the reference design is [loglevel-plugin-remote](https://github.com/kutuluk/loglevel-plugin-remote) — queue with capacity 500, 1000 ms send interval, exponential backoff with 10% jitter capped at 30 s — but it was last published 2018-09-28, so the facade copies the design rather than depending on the package. Datadog's [browser-sdk](https://github.com/DataDog/browser-sdk) (prior art only per D-0003; paid backend) batches and "uses `navigator.sendBeacon` if available and the data size is below the byte limit".

**Flush on unload**: use `fetch(..., {keepalive: true})` as the primary flush path — OpenTelemetry JS removed sendBeacon in favor of fetch keepalive ([experimental CHANGELOG](https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/CHANGELOG.md)) — with a `pagehide` beacon fallback for payloads under the ~64 KB sendBeacon cap ([Beaconing in Practice](https://nicj.net/beaconing-in-practice/)).

**Offline periods**: the cleanest OSS model is Sentry's [`makeBrowserOfflineTransport`](https://docs.sentry.io/platforms/javascript/best-practices/offline-caching/) — an IndexedDB queue decorator around any transport (`maxQueueSize` default 30, `flushAtStartup`). LogTape's non-blocking sinks show the consensus overflow policy: bounded buffer, drop-oldest at 2× bufferSize ([sinks manual](https://logtape.org/manual/sinks)), plus a drop counter emitted as a meta-log.

**MQTT as log transport**: viable as a **secondary sink only, never primary**. Prior art exists (Python mqtthandler; [AWS IoT device-logs-to-CloudWatch pattern](https://docs.aws.amazon.com/iot/latest/developerguide/upload-device-logs-to-cloudwatch.html)), but: mqtt.js queues outgoing publishes in memory while disconnected (`queueQoSZero` defaults to `true`), so a chatty logger during a broker outage grows an unbounded in-memory queue ([mqtt npm docs](https://www.npmjs.com/package/mqtt)); backpressure is a known weak spot ([MQTT.js #1131](https://github.com/mqttjs/MQTT.js/issues/1131) closed stale); and there is a feedback-loop hazard — the MQTT sink must never log its own publish/connection errors through itself and should auto-mute while disconnected. If used: QoS 0, `queueQoSZero: false`, and the facade's own bounded buffer decides what to keep. Whether a browser client may publish to a `logs/...` topic depends on the app's topic scheme and broker ACLs — an unfilled fact (see assumptions).

### 3. What redaction support exists for sensitive fields?

Divergent, which is itself the finding: **pino's `redact` silently does nothing in browser mode** ([issue #670](https://github.com/pinojs/pino/issues/670)); tslog has strong masking (keys/regex/JSONPath-lite paths, hashing censors — main build only, with a past mutation bug [#180](https://github.com/fullstack-build/tslog/issues/180)); LogTape ships [@logtape/redaction](https://logtape.org/manual/redaction) (`redactByField()` sink wrapper, `redactByPattern()` formatter wrapper, HMAC pseudonymizer); LogLayer has a fast-redact-based [plugin](https://loglayer.dev/plugins/redaction.html); **loglevel, consola, and debug have none**. Because bases differ this much, redaction must live in the facade as a single choke point applied before every sink (console, HTTP, MQTT), with fast-redact-style field + path + pattern rules — so a base swap can never silently drop it. The pino browser gap is the cautionary example.

### 4. What facade surface (logger factory, child loggers, level API, throttle API) keeps call sites stable if the base library is swapped later?

Call sites import only the facade module below; the base library appears solely inside the sink/dispatch implementation. This is a design sketch, not a prototype (D-0001).

```typescript
// Logger factory — hierarchical dot names, matched by debug-style patterns.
export function getLogger(name: string): Logger; // e.g. "mqtt.telemetry"

export interface Logger {
  trace(msg: string, fields?: Fields): void;
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields, err?: Error): void;
  child(subName: string, bindings?: Fields): Logger; // "mqtt" -> "mqtt.telemetry"
}

export type Fields = Record<string, unknown>;
export type Level = "trace" | "debug" | "info" | "warn" | "error" | "silent";

// Level API — per-logger, pattern-addressable, mutable at runtime.
export function setLevel(pattern: string, level: Level): void; // "mqtt.*", "*"
export function getEffectiveLevel(name: string): Level;

// Sink API — sinks are plain functions over a facade-owned record shape;
// add/remove at runtime; redaction runs once, before every sink.
export interface LogRecord {
  readonly name: string;
  readonly level: Level;
  readonly msg: string;
  readonly fields: Fields;   // post-redaction
  readonly bindings: Fields; // accumulated child bindings
  readonly time: number;
}
export type Sink = (record: LogRecord) => void;
export function addSink(id: string, sink: Sink, opts?: { minLevel?: Level }): void;
export function removeSink(id: string): boolean;

// Redaction — single choke point (fast-redact-style rules).
export interface RedactionRules { keys?: string[]; paths?: string[]; patterns?: RegExp[] }
export function setRedaction(rules: RedactionRules): void;

// Throttle rules — zap-style policy on debug-style selectors; replace at runtime.
export interface ThrottleRule {
  match: string;                 // logger pattern, e.g. "mqtt.*,-contract.*"
  belowLevel?: Level;            // only throttle chatter below this severity
  key?: "logger" | "logger+message";
  policy: { intervalMs: number; first: number; thereafter: number }; // 0 = drop rest
}
export function setThrottleRules(rules: ThrottleRule[]): void; // emits dropped-count meta-events

// Config file — declarative form of all of the above; applied at boot and on change.
export interface LoggingConfig {
  levels: Record<string, Level>;           // pattern -> level
  sinks: Record<string, SinkConfig>;       // console | http | mqtt
  throttle: ThrottleRule[];
  redaction: RedactionRules;
}
export function applyConfig(config: LoggingConfig): void;
```

The shape is a composition of proven designs: the `match` grammar is debug's selector syntax ([debug README](https://github.com/debug-js/debug)); the `policy` triple is zap's `SamplerCore` (first N per tick, then every Mth, with a sampled/dropped decision hook — [sampler.go](https://github.com/uber-go/zap/blob/master/zapcore/sampler.go), [PR #813](https://github.com/uber-go/zap/pull/813)); `belowLevel` is log4j2's [BurstFilter](https://logging.apache.org/log4j/2.x/javadoc/log4j-core/org/apache/logging/log4j/core/filter/BurstFilter.html) severity threshold (errors always pass); the `key` option is [log-rate-limit](https://pypi.org/project/log-rate-limit)'s stream concept, making throttle-by-logger and throttle-by-pattern the same mechanism. The factory-plus-single-dispatch core echoes missionlog's `log.init(config, callback)` seam — per-tag runtime levels routed through one handler in ~1 kB ([README](https://github.com/rmartone/missionlog)) — evidence the whole core is small. And the `LogRecord` deliberately stays mappable onto the OpenTelemetry log record (`name` → instrumentation scope via `logs.getLogger(name)`, `level` → `severityNumber`, `fields`/`bindings` → attributes — [api-logs README](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/api-logs)), so a future OTLP sink is a mapping, not a redesign.

**D-0006 flow**: 0010's contract-validation failures report through `getLogger("contract.mqtt")` / `getLogger("contract.rest")` as first-class structured events (fields: interface, operation, schema pointer, reason) at warn/error. The dedicated `contract.*` subtree lets throttle rules exempt them (`-contract.*` in `match`) or give them their own stream, and lets sinks route them — for example console plus remote, never dropped by chatter caps.

### 5. How is runtime reconfiguration done per candidate: change level/sink/throttle without a rebuild or reload?

Leading candidates, quoting their actual APIs:

- **consola** — level: the README lists "`createConsola({level})` — set during instance creation; `consola.level = X` — modify at runtime". Sinks: `addReporter(reporter)`, `removeReporter(reporter?)`, and `setReporters(...)`, whose implementation is a plain replace: `this.options.reporters = Array.isArray(reporters) ? reporters : [reporters]` ([src/consola.ts](https://raw.githubusercontent.com/unjs/consola/main/src/consola.ts)). Plus `pauseLogs()`/`resumeLogs()`: "Consola will enqueue all logs when paused and then sends them to the reporter when resumed." No throttle API (dedup thresholds are constructor options).
- **loglevel** — "`log.setLevel(level, [persist])`" at any time; "Where possible, the log level will be persisted. LocalStorage will be used if available, falling back to cookies if not" ([README](https://github.com/pimterry/loglevel)). Sinks change by reassigning `log.methodFactory` and calling `log.rebuild()` to re-apply level and factory to all child loggers.
- **LogTape** — from the [config manual](https://logtape.org/manual/config): "If you need to change the configuration at runtime, you can call `configure()` again with `reset: true` and the new settings," or "explicitly call `reset()` to clear the existing configuration." Sinks implementing `Disposable`/`AsyncDisposable` "will be properly disposed when resetting the configuration." Whole-config replacement — the facade diffs and rebuilds; no in-place per-logger mutation.
- **LogLayer** — sinks: "`addTransport(transports)`" ("Adds one or more transports to the existing transports"), `removeTransport(id: string): boolean`, and `withFreshTransports(transports)` ("Replaces all existing transports") ([transport management](https://loglayer.dev/logging-api/transport-management.html)). Levels: `log.setLevel(LogLevel.warn)`, `enableIndividualLevel()`/`disableIndividualLevel()`, and per-group `parentLog.setGroupLevel('database', 'debug')`. Its sampling plugin, however, is frozen at construction.

Eliminated candidates, briefly: **pino** supports runtime level ("Set this property to the desired logging level" — `logger.level`, [api.md](https://github.com/pinojs/pino/blob/main/docs/api.md)) but `browser.write`/`browser.transmit` are construction-time only. **tslog** has `log.setMinLevel("DEBUG")` and `attachTransport()` returning a detach function — genuinely runtime-mutable sinks. **debug** has `debug.enable('foo:*,-foo:bar')` / `debug.disable()` and `localStorage.debug`. **adze** is the weakest: re-calling `setup()` constructs a fresh global store, discarding listeners and cache. **roarr** reconfigures by reassigning the `globalThis.ROARR.write` global — trivially possible, but a mutable singleton the facade would have to own exclusively.

## Rubric comparison

| Criterion (weight) | consola | loglevel | LogTape | LogLayer |
|---|---|---|---|---|
| License (high) | strong — MIT, 0 deps | strong — MIT, 0 deps | strong — MIT, 0 deps | strong — MIT |
| Maintenance health (high) | strong — UnJS org, ~54.8M dl/wk; caveat: last feature release 2025-03 | adequate — single maintainer, ~yearly cadence, stable | adequate — very active (same-day backports to 3 lines) but bus factor 1 | adequate — monthly cadence, single maintainer |
| TypeScript fit (high) | strong — TS-authored, shipped d.ts | strong — bundled index.d.ts | strong — TS-native, typed JSR docs | strong — TS, ESM+CJS d.ts |
| Browser compatibility (high) | strong — dedicated `consola/browser` build | strong — browser-first, console fallback | strong — zero-dep, %c console, WritableStream | strong — browser-tagged transports incl. HTTP |
| Contract-format support (n-a) | n-a | n-a | n-a | n-a |
| Integration cost (medium) | strong — flat API maps onto the facade | strong — getLogger/methodFactory map directly | adequate — facade must translate config into configure() rebuilds | strong — ships most of the wrap layer already |
| Runtime overhead (high) | strong — 2.45 kB gz | strong — 1.44 kB gz | adequate — 14.2 kB gz pre-tree-shaking | adequate — 7.15 kB gz core + transport packages |
| Output quality (medium) | adequate — raw logObj to reporters; structure is facade work | adequate — console passthrough only | strong — structured records + redaction package | strong — structured + fast-redact plugin |
| Escape hatch (high) | strong — conventional surface, single reporter seam | strong — console-like lowest-common-denominator API | strong — library-first facade, plain-function sinks | strong mechanically, but LogLayer's API becomes the new lock-in |

Early-eliminated candidates: **debug** — no log levels at all (binary namespaces); retained as prior art for the selector grammar; 2025 supply-chain incident on 4.4.2. **pino (browser mode)** — reduced shim; redact silently no-ops in the browser (#670); sink hooks fixed at construction. **tslog** — best raw feature match (throttle middleware, masking) but a month-old ESM-only v5 rewrite, bus factor 1 with a dormancy history, and 21 kB gz full build. **adze** — weak maintenance (bus factor 1, v2.3.1 never published to npm) and `setup()` re-creation discards listeners, the opposite of runtime reconfigurability. **roarr** — stale browser writer (2023), no per-logger levels, no pre-serialization level gate.

Post-sweep additions (2026-08-13), kept out of the finalist table: **OpenTelemetry JS Logs stack** — rejected as the facade surface: JS Logs status is "Development", browser client support "experimental and mostly unspecified", the Logs Bridge API is "alpha software", the pipeline weighs at least 4x consola's browser build, and pattern throttling would still be a custom `LogRecordProcessor`; retained as the record-shape design target and a conditional future sink (see Recommendation). **missionlog** — prior art only: proves per-tag runtime levels plus a single handler seam fit in ~1 kB, but single-maintainer, flat tags, no transport ecosystem.

## Recommendation

**Adopt + wrap: consola@3.4.2 as the base, plus a thin project-owned facade** (surface sketched in Key question 4) that owns per-logger level fan-out, throttle rules, redaction, remote/MQTT sinks, and config-file application.

**Rationale.** The cross-cutting findings show that the three hard requirements — throttling/sampling by pattern, browser-safe redaction, and batched/offline-tolerant remote sinks — are facade work under *every* candidate: no library provides runtime-reconfigurable pattern throttling, redaction support is inconsistent enough (pino's silent browser no-op being the warning) that it must sit at one facade choke point, and the only off-the-shelf browser batching plugin has been unpublished since 2018. The base's job therefore shrinks to: levels, child loggers, a clean sink seam, small size, and durable maintenance. On the weighted rubric consola scores highest of the field (strong on all six high-weight criteria), is the only candidate with organizational backing rather than a bus factor of one, ships a 2.45 kB dedicated browser build, and its reporter interface hands the facade the raw log record — exactly the seam where the facade applies its own record shape, redaction, throttle rules, and sink fan-out, all mutable at runtime via documented one-liners (`consola.level = X`, `setReporters`).

**Why not LogLayer as the wrap layer.** Evaluated honestly, LogLayer *is* most of the planned wrap layer — runtime transports, runtime levels, groups, redaction — and adopting it is the credible alternative. It loses on three counts: it does not cover the two pieces this track most needs to build (pattern-addressable throttling with runtime rules — its sampling plugin is random-drop and frozen at construction — and config-file driving), so the custom-code burden barely shrinks; it substitutes its own fluent API as the thing call sites depend on, moving the escape-hatch problem rather than solving it; and it carries single-maintainer risk plus a 7.15 kB core before transport packages. Paying LogLayer's weight to still write the throttle engine and config loader is a worse trade than a 2.45 kB base plus the same custom code behind our own facade.

**Why not the OpenTelemetry Logs API as the facade surface (and when to revisit).** The gap sweep asked the right question: why should call sites depend on a project-owned facade instead of the industry-standard Logs Bridge API, which makes the record shape, batching (`BatchLogRecordProcessor`), and vendor-portable OTLP shipping off-the-shelf? Three reasons, all as of 2026-08-13. First, stability: the whole JS logs signal is pre-1.0 (0.221.0) in opentelemetry-js's experimental tree with breaking changes explicitly allowed; the Logs Bridge API is "considered alpha software" pending its move into `@opentelemetry/api`; the official JS status for Logs is "Development" while Traces and Metrics are Stable; and "Client instrumentation for the browser is experimental and mostly unspecified", with the dedicated browser SDK repo still the "future home" of that SDK ([opentelemetry.io](https://opentelemetry.io/docs/languages/js/), [api-logs README](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/api-logs), [opentelemetry-browser](https://github.com/open-telemetry/opentelemetry-browser)). Freezing every call site onto an alpha API is the exact outcome the track's high-weight escape-hatch criterion exists to prevent. Second, cost/benefit: the pipeline weighs at least 4x consola's entire browser build (Key question 1 table), yet the differentiating custom work does not shrink — pattern throttling would be a custom `LogRecordProcessor`, and pattern-addressable runtime levels, config-file driving, and redaction all remain project code either way. Third, and decisive, OTel's own docs state the Logs API "is not intended to be called by application developers directly" but exists "for logging library authors to build log appenders" — the standard's intended architecture is application code behind a logging facade with OTel attached as a sink, which is precisely the shape recommended here. **Revisit trigger**: when the Logs Bridge API stabilizes into `@opentelemetry/api` (the api-logs README's stated endgame), the JS Logs status leaves "Development", and the browser SDK ships a stable logs story, add an OTLP sink behind the facade — the facade `LogRecord` maps onto the OTel record by design (Key question 4), so call sites never move. Only if the ecosystem later consolidates on app code calling OTel Logs directly — which OTel's appender guidance argues against — should the facade surface itself be reconsidered.

**Runners-up.** LogTape is the recommendation if the team prefers more machinery out of the box — native hierarchical per-category levels, structured records, a real redaction package, drop-oldest buffered sinks — at the cost of ~5.8x the bundle (pre-tree-shaking), whole-config-replace reconfiguration, and a bus factor of one. loglevel is the recommendation under a severe bundle veto (~1.4 kB, named-logger registry built in). Because the facade owns the record shape and sink seam, either swap later leaves call sites untouched.

**Risks (honest).**

1. **The facade itself is the weakest link.** The differentiating behavior — throttle engine, batching, offline buffer, redaction — is custom code we maintain. Mitigation: every piece copies a cited, proven design (zap SamplerCore policy, loglevel-plugin-remote batching parameters, Sentry offline-transport decorator, LogTape drop-oldest overflow, missionlog's single-handler dispatch), and the spike validates them before adoption.
2. **Consola's feature cadence is dormant** — last feature release 2025-03-18; activity since is dependency-bot churn. The org backing and 54.8M weekly downloads make abandonment unlikely, but if it stalls, the escape hatch (facade-owned surface, conventional base API) makes a LogTape swap a facade-internal change.
3. **Consola's dedup throttle is undocumented internals** (`throttle`/`throttleMin` appear in types, not the README). The facade must not depend on it; it is a bonus layer under the facade's own throttle rules.
4. **No structured output or redaction in the base** — deliberate: both are facade-owned, but this means the facade must exist before any remote sink ships anything.
5. **The D-0006 path depends on 0010's error shape.** The `contract.*` logger subtree and its structured fields must be agreed with track 0010 before the facade's record shape freezes.
6. **The industry may standardize on OpenTelemetry Logs.** If the browser logs stack stabilizes, a bespoke facade could read as legacy. Mitigation: the facade `LogRecord` is deliberately OTel-mappable (Key question 4), so OTLP shipping becomes one more sink with zero call-site changes; the revisit trigger above names the exact conditions, and OTel's own appender guidance endorses the facade-plus-sink shape in the meantime.

**Constraints applied.** D-0001 (survey-only: the facade surface is a signature sketch, not a prototype; spikes pre-scoped below). D-0003 (all recommended candidates are free OSS; Datadog and Sentry client SDKs were used as prior-art patterns only, since their backends are paid). D-0006 (contract-validation failures from 0010 flow through the facade as first-class structured events on a dedicated, throttle-exempt logger subtree). D-0004 (facts/app-profile.md is unfilled; every fact used is declared below as an assumption).

**Assumptions in place of facts** (facts/app-profile.md is unfilled):

- The build tool is a modern ESM-capable bundler that resolves conditional package exports (needed for `consola/browser`; would also matter for tslog's ESM-only v5).
- Browser targets are evergreen (ES2020+); no legacy browser support is required.
- No bundle-size veto stricter than ~15 kB gzip exists for logging in total; the recommended base uses 2.45 kB, leaving facade headroom. A stricter veto would shift the pick to loglevel.
- The app holds a persistent mqtt.js-over-WSS connection, and broker ACLs *may* permit a `logs/...` publish topic — unverified; the MQTT sink stays conditional on this.
- localStorage is available (no strict privacy mode/CSP restriction), relevant to level-persistence conveniences.
- Client-side redaction is required — sensitive fields can appear in logged payloads.
- An HTTP endpoint for collecting batched browser logs exists or can be added.
- Log volume is interactive-SPA scale, with hot paths at most per-MQTT-message frequency.
- No shared logging schema with Node services is required (such a requirement would have strengthened pino's case).
- Logs are not shipped to a paid vendor backend (Datadog/Sentry), consistent with D-0003.

## What a spike would validate

- **Facade level fan-out over consola**: implement `getLogger`/`setLevel(pattern)` as a tag registry over `withTag` instances; verify per-logger levels and pattern matching behave under HMR and page reload.
- **Throttle engine**: implement the zap-style `{intervalMs, first, thereafter}` policy keyed by logger/logger+message; measure overhead at per-MQTT-message frequency and confirm dropped-count meta-events surface.
- **Remote sink**: batch + `fetch keepalive` flush with `pagehide` beacon fallback under 64 KB; IndexedDB offline buffer with drop-oldest; measure loss rate on tab close mid-batch. Compare the in-page buffer against Google's [workbox-background-sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync) 7.4.1 (MIT), whose service-worker queue stores failed requests in IndexedDB and replays them on the `sync` event "even if the user has left the application" — a durability level no in-page decorator matches — at the cost of adopting a service worker.
- **MQTT sink**: publish QoS 0 with `queueQoSZero: false` against the real broker ACLs; verify auto-mute on disconnect and confirm no feedback loop when the connection fails.
- **Escape-hatch drill**: rebind the facade's dispatch to LogTape with zero call-site changes, proving the base is swappable and the record shape holds.
- **OTel record mapping**: map the facade `LogRecord` onto the OTel log record shape (`severityNumber`, body, attributes, instrumentation scope) and confirm an OTLP sink slots in as a facade-internal addition, per the Recommendation's revisit trigger.
- **Real bundle cost**: measure shipped bytes of `consola/browser` + facade under the app's actual bundler and targets (vs the bundlejs figure).
- **Redaction overhead**: fast-redact-style field/path/pattern rules on representative payloads; confirm no caller-object mutation (the tslog #180 failure mode).
- **D-0006 event shape**: log a synthetic 0010 contract-validation failure through `contract.mqtt` end-to-end (console + remote sink, throttle-exempt).

## Sources

- https://github.com/pimterry/loglevel — accessed 2026-08-13
- https://raw.githubusercontent.com/pimterry/loglevel/master/README.md — accessed 2026-08-13
- https://registry.npmjs.org/loglevel/latest — accessed 2026-08-13
- https://registry.npmjs.org/loglevel — accessed 2026-08-13
- https://bundlephobia.com/package/loglevel@1.9.2 — accessed 2026-08-13
- https://api.github.com/repos/pimterry/loglevel — accessed 2026-08-13
- https://github.com/kutuluk/loglevel-plugin-remote — accessed 2026-08-13
- https://www.npmjs.com/package/loglevel-plugin-remote — accessed 2026-08-13
- https://registry.npmjs.org/loglevel-plugin-remote — accessed 2026-08-13
- https://github.com/debug-js/debug — accessed 2026-08-13
- https://raw.githubusercontent.com/debug-js/debug/master/README.md — accessed 2026-08-13
- https://registry.npmjs.org/debug/latest — accessed 2026-08-13
- https://bundlephobia.com/package/debug@4.4.3 — accessed 2026-08-13
- https://api.github.com/repos/debug-js/debug — accessed 2026-08-13
- https://github.com/debug-js/debug/releases/tag/4.4.3 — accessed 2026-08-13
- https://registry.npmjs.org/@types/debug/latest — accessed 2026-08-13
- https://github.com/pinojs/pino — accessed 2026-08-13
- https://github.com/pinojs/pino/blob/main/docs/browser.md — accessed 2026-08-13
- https://github.com/pinojs/pino/blob/main/docs/api.md — accessed 2026-08-13
- https://github.com/pinojs/pino/blob/main/docs/redaction.md — accessed 2026-08-13
- https://github.com/pinojs/pino/issues/670 — accessed 2026-08-13
- https://github.com/pinojs/pino/releases — accessed 2026-08-13
- https://registry.npmjs.org/pino/latest — accessed 2026-08-13
- https://bundlephobia.com/package/pino@10.3.1 — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/pino — accessed 2026-08-13
- https://github.com/fullstack-build/tslog — accessed 2026-08-13
- https://raw.githubusercontent.com/fullstack-build/tslog/master/README.md — accessed 2026-08-13
- https://github.com/fullstack-build/tslog/releases — accessed 2026-08-13
- https://github.com/fullstack-build/tslog/issues/180 — accessed 2026-08-13
- https://registry.npmjs.org/tslog — accessed 2026-08-13
- https://bundlephobia.com/package/tslog@5.1.0 — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/tslog — accessed 2026-08-13
- https://api.github.com/repos/fullstack-build/tslog — accessed 2026-08-13
- https://api.github.com/repos/fullstack-build/tslog/contributors — accessed 2026-08-13
- https://github.com/unjs/consola — accessed 2026-08-13
- https://raw.githubusercontent.com/unjs/consola/main/README.md — accessed 2026-08-13
- https://raw.githubusercontent.com/unjs/consola/main/src/types.ts — accessed 2026-08-13
- https://raw.githubusercontent.com/unjs/consola/main/src/consola.ts — accessed 2026-08-13
- https://github.com/unjs/consola/blob/main/LICENSE — accessed 2026-08-13
- https://github.com/unjs/consola/releases — accessed 2026-08-13
- https://registry.npmjs.org/consola/latest — accessed 2026-08-13
- https://bundlephobia.com/package/consola@3.4.2 — accessed 2026-08-13
- https://bundlejs.com/?q=consola%2Fbrowser — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/consola — accessed 2026-08-13
- https://github.com/adzejs/adze — accessed 2026-08-13
- https://github.com/adzejs/adze/releases — accessed 2026-08-13
- https://github.com/adzejs/adze/blob/master/src/functions/global.ts — accessed 2026-08-13
- https://github.com/adzejs/adze/blob/master/src/adze-global.ts — accessed 2026-08-13
- https://registry.npmjs.org/adze/latest — accessed 2026-08-13
- https://registry.npmjs.org/adze — accessed 2026-08-13
- https://adzejs.com/getting-started/setup.html — accessed 2026-08-13
- https://adzejs.com/getting-started/configuration.html — accessed 2026-08-13
- https://adzejs.com/reference/configuration.html — accessed 2026-08-13
- https://adzejs.com/reference/middleware.html — accessed 2026-08-13
- https://adzejs.com/reference/global-store.html — accessed 2026-08-13
- https://adzejs.com/reference/tools.html — accessed 2026-08-13
- https://adzejs.com/reference/terminators.html — accessed 2026-08-13
- https://bundlephobia.com/package/adze@2.3.0 — accessed 2026-08-13
- https://bundlejs.com/?q=adze — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/adze — accessed 2026-08-13
- https://github.com/loglayer/loglayer — accessed 2026-08-13
- https://registry.npmjs.org/loglayer/latest — accessed 2026-08-13
- https://registry.npmjs.org/loglayer — accessed 2026-08-13
- https://loglayer.dev/logging-api/transport-management.html — accessed 2026-08-13
- https://loglayer.dev/logging-api/adjusting-log-levels.html — accessed 2026-08-13
- https://loglayer.dev/logging-api/child-loggers.html — accessed 2026-08-13
- https://loglayer.dev/log-level-managers/ — accessed 2026-08-13
- https://loglayer.dev/plugins/ — accessed 2026-08-13
- https://loglayer.dev/plugins/sampling.html — accessed 2026-08-13
- https://loglayer.dev/plugins/redaction.html — accessed 2026-08-13
- https://loglayer.dev/transports/ — accessed 2026-08-13
- https://www.npmjs.com/package/@loglayer/plugin-redaction — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=loglayer@9.4.0 — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/loglayer — accessed 2026-08-13
- https://github.com/gajus/roarr — accessed 2026-08-13
- https://github.com/gajus/roarr/commits/main — accessed 2026-08-13
- https://raw.githubusercontent.com/gajus/roarr/main/LICENSE — accessed 2026-08-13
- https://registry.npmjs.org/roarr/latest — accessed 2026-08-13
- https://api.github.com/repos/gajus/roarr — accessed 2026-08-13
- https://api.github.com/repos/gajus/roarr/releases — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=roarr@7.21.7 — accessed 2026-08-13
- https://github.com/gajus/roarr-browser-log-writer — accessed 2026-08-13
- https://registry.npmjs.org/@roarr%2Fbrowser-log-writer/latest — accessed 2026-08-13
- https://api.github.com/repos/gajus/roarr-browser-log-writer — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@roarr/browser-log-writer@1.3.0 — accessed 2026-08-13
- https://github.com/dahlia/logtape — accessed 2026-08-13
- https://github.com/dahlia/logtape/tags — accessed 2026-08-13
- https://registry.npmjs.org/@logtape/logtape — accessed 2026-08-13
- https://registry.npmjs.org/@logtape/logtape/latest — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/@logtape/logtape — accessed 2026-08-13
- https://logtape.org/manual/config — accessed 2026-08-13
- https://logtape.org/manual/categories — accessed 2026-08-13
- https://logtape.org/manual/sinks — accessed 2026-08-13
- https://logtape.org/manual/redaction — accessed 2026-08-13
- https://jsr.io/@logtape/logtape/doc — accessed 2026-08-13
- https://hackers.pub/@hongminhee/2025/announcing-logtape-1-0 — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@logtape/logtape@2.3.1 — accessed 2026-08-13
- https://blog.zackhu.com/navigatorsendbeacon-vs-fetch-keepalive — accessed 2026-08-13
- https://nicj.net/beaconing-in-practice/ — accessed 2026-08-13
- https://css-tricks.com/send-an-http-request-on-page-exit/ — accessed 2026-08-13
- https://github.com/DataDog/browser-sdk — accessed 2026-08-13
- https://www.npmjs.com/package/@datadog/browser-logs — accessed 2026-08-13
- https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/CHANGELOG.md — accessed 2026-08-13
- https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/sdk-logs — accessed 2026-08-13
- https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/api-logs — accessed 2026-08-13
- https://opentelemetry.io/docs/languages/js/ — accessed 2026-08-13
- https://registry.npmjs.org/@opentelemetry/api-logs/latest — accessed 2026-08-13
- https://registry.npmjs.org/@opentelemetry/sdk-logs/latest — accessed 2026-08-13
- https://registry.npmjs.org/@opentelemetry/exporter-logs-otlp-http/latest — accessed 2026-08-13
- https://github.com/open-telemetry/opentelemetry-browser — accessed 2026-08-13
- https://api.github.com/repos/open-telemetry/opentelemetry-browser — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@opentelemetry/api-logs@0.221.0 — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@opentelemetry/sdk-logs@0.221.0 — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@opentelemetry/exporter-logs-otlp-http@0.221.0 — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=@opentelemetry/api@1.9.0 — accessed 2026-08-13
- https://docs.sentry.io/platforms/javascript/best-practices/offline-caching/ — accessed 2026-08-13
- https://pypi.org/project/mqtthandler/0.1.1 — accessed 2026-08-13
- https://pypi.org/project/mqttloghandler — accessed 2026-08-13
- https://docs.aws.amazon.com/iot/latest/developerguide/upload-device-logs-to-cloudwatch.html — accessed 2026-08-13
- https://www.npmjs.com/package/mqtt — accessed 2026-08-13
- http://www.steves-internet-guide.com/mqtt-client-message-queue-delivery/ — accessed 2026-08-13
- https://github.com/mqttjs/MQTT.js/issues/1131 — accessed 2026-08-13
- https://thingsboard.io/docs/mqtt-broker/user-guide/backpressure/ — accessed 2026-08-13
- https://docs.emqx.com/en/cloud/latest/best_practices/client_development.html — accessed 2026-08-13
- https://www.npmjs.com/package/fast-redact — accessed 2026-08-13
- https://github.com/uber-go/zap/blob/master/zapcore/sampler.go — accessed 2026-08-13
- https://pkg.go.dev/go.uber.org/zap/zapcore — accessed 2026-08-13
- https://github.com/uber-go/zap/pull/813 — accessed 2026-08-13
- https://logging.apache.org/log4j/2.x/javadoc/log4j-core/org/apache/logging/log4j/core/filter/BurstFilter.html — accessed 2026-08-13
- https://github.com/Bisnode/logback-extras — accessed 2026-08-13
- https://pypi.org/project/log-rate-limit — accessed 2026-08-13
- https://docs.rs/rate-log/latest/rate_log/ — accessed 2026-08-13
- https://github.com/rmartone/missionlog — accessed 2026-08-13
- https://raw.githubusercontent.com/rmartone/missionlog/master/README.md — accessed 2026-08-13
- https://registry.npmjs.org/missionlog/latest — accessed 2026-08-13
- https://api.github.com/repos/rmartone/missionlog — accessed 2026-08-13
- https://bundlephobia.com/api/size?package=missionlog@4.1.3 — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/missionlog — accessed 2026-08-13
- https://registry.npmjs.org/workbox-background-sync/latest — accessed 2026-08-13
- https://developer.chrome.com/docs/workbox/modules/workbox-background-sync — accessed 2026-08-13
