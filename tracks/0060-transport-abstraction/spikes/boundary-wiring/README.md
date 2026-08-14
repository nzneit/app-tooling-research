# Spike: boundary-wiring

Part of `0060-transport-abstraction`. Scope: the report checks listed in [findings.md](findings.md).

Both legs of the `transport-boundary` interface described in [design.md](design.md):

- **MQTT leg** — `src/`, exercised against a real in-process broker (aedes over
  `ws` + mqtt.js): reconnect edges, the #909 offline window, the #1935 pump,
  the policy table, the quarantine ring, the two wires, and a throughput bench.
- **REST leg** — `src/` plus `app/`, exercised through orval's generated
  `client: 'react-query'` output over a synthetic OpenAPI contract: signal
  threading, the declared/undeclared status split, the taxonomy-aware retry
  predicate, the global `Register` error type, and the QueryCache telemetry tap.

## Layout

| Path | What it is |
|---|---|
| `src/` | the package: entry points 1 (`index.ts`), 2 (`errors/`), 3 (`testing.ts`) |
| `contract/plants.openapi.json` | the synthetic OpenAPI 3 contract (3 operations; 409/422 declared, 418 deliberately not) |
| `orval.config.ts` | three generation targets — react-query + axios-convention mutator, the fetch-convention twin, and per-status zod |
| `app/` | **caller-owned code, above the seam**: composition root, orval mutators, contract table, QueryClient, telemetry sink |
| `app/api/generated/` | orval output, committed on purpose (it is the spike's evidence) |
| `lint-fixtures/` | deliberate layering violations for the oxlint check; excluded from `tsconfig.json` |
| `.oxlintrc.json` | the recommended layering config — the ingress override **restates** the base patterns |
| `.oxlintrc.naive.json` | the same config without the restatement: 0010's overrides-merge caveat, reproduced |

## Run

```
npm ci && npm test          # 97 tests, 17 files
npm run typecheck           # tsc --noEmit; the Register + two-wire checks ARE typecheck
npm run generate            # regenerate the orval output (should be a no-op diff)
```

Isolated per the
[spike harness spec](../../../../docs/superpowers/specs/2026-08-14-spike-harness-design.md):
standalone package, exact-pinned deps, no imports across the spike boundary.
