# 0050-logging — research plan

**Status**: draft

## Goal

Pick the base for a logging facade that supports config-file and runtime control of
sinks/locations, per-logger levels, and throttling/sampling by pattern or by logger.
Expected recommendation shape is adopt + wrap: a base library plus a thin facade owning
the throttling and runtime-reconfiguration story, since pattern-based throttling is rare
off the shelf. Validation failures from 0010 will report through this facade (D-0006).

## Key questions

1. Which base library has the best browser story (bundle size, no Node-only APIs) and
   pluggable transports/sinks?
2. How do remote sinks batch, flush, and survive offline periods — and could MQTT itself
   serve as a log transport in this app?
3. What redaction support exists for sensitive fields?
4. What facade surface (logger factory, child loggers, level API, throttle API) keeps
   call sites stable if the base library is swapped later?
5. How is runtime reconfiguration done per candidate: change level/sink/throttle without
   a rebuild or reload?

## Candidates

- loglevel — https://github.com/pimterry/loglevel — tiny browser-first levels + plugin ecosystem
- pino (browser mode) — https://github.com/pinojs/pino — fast structured logging, browser build
- tslog — https://github.com/fullstack-build/tslog — TS-native, works browser + Node
- consola — https://github.com/unjs/consola — reporters model, browser support
- adze — https://github.com/adzejs/adze — configurable universal logging
- LogLayer — https://github.com/loglayer/loglayer — facade over transports (itself a wrap candidate)
- roarr — https://github.com/gajus/roarr — structured, env-controlled, browser support
- debug — https://github.com/debug-js/debug — pattern-enabled namespaces (prior art for throttle-by-pattern)
- LogTape — https://github.com/dahlia/logtape — zero-dependency, browser-first logging facade with sinks/filters

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | n-a |
| Integration cost | medium |
| Runtime overhead | high |
| Output quality | medium |
| Escape hatch | high |

## Facts needed

- Stack: build tool, browser targets, bundle-size sensitivity (add to Vetoes if any)
- MQTT: topic-scheme shape (for the MQTT-as-transport question)
