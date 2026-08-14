# Spike Harness — Design

**Date:** 2026-08-14
**Status:** Accepted — user directed spikes for 0060/0070 and a reusable isolated harness (2026-08-14)
**Extends:** [2026-08-13-tooling-research-program-design.md](2026-08-13-tooling-research-program-design.md) — the program spec reserves `tracks/<track>/spikes/` for "throwaway code quarantined from the docs"; this spec defines how that quarantine actually works.

## Purpose

Accepted reports end with a "What a spike would validate" section: go/no-go checks that desk
research could not settle (D-0001). This spec defines the standing R&D harness those spikes run
in, so that spike code can install real dependencies and run real tests without ever coupling to
this docs repo, to other spikes, or to the future app packages. First users: the Wave 2 spikes
for 0060-transport-abstraction (D-0015) and 0070-state-concurrency (D-0016).

## User directives (2026-08-14)

1. Attempt spikes for 0060 and 0070.
2. Keep the work of each spike isolated.
3. Draft an isolated R&D testing harness to be used for spikes in this repo going forward.
4. Use the `codebase-design` skill (mattpocock/skills) to shape the spike code.

## Isolation model

Each spike is a **fully standalone npm package** at `tracks/<track>/spikes/<slug>/`:

- Own `package.json` (`"private": true`), own **committed** `package-lock.json`, own
  `tsconfig.json` and `vitest.config.ts`. Dependencies are installed with `--save-exact`;
  the versions a spike exercises are the versions its report surveyed, and the lockfile makes
  the run reproducible.
- **No npm workspaces.** Workspace hoisting would share one `node_modules` through the repo
  root — exactly the coupling this harness exists to prevent. Each spike runs `npm ci` (or
  `npm install`) in its own directory and owns its own `node_modules/` (git-ignored).
- **No cross-boundary imports.** Spike code imports only from its own directory and its own
  `node_modules`. Never from the repo root, another spike, or another track — even when two
  spikes need the same helper, each carries its own copy: spikes are independent experiments,
  and de-duplicating across them would let one spike's edit silently change another's result.
- The repo root `package.json` stays dependency-free and the validator stays zero-dep; the
  docs system must never need an `npm install` to run.
- Toolchain floor: Node >= 24.2 (the validator's existing floor). Spike tests run under
  vitest; TypeScript per spike.

## Harness pieces

| Piece | Path | Role |
|---|---|---|
| Root ignore rules | `.gitignore` | `node_modules/`, build/coverage output — spikes never commit installs |
| Validator spike-awareness | `scripts/check-docs.ts` | skips `node_modules`/`dist`/`coverage` when walking `tracks/`; checks every spike dir has a valid `findings.md`; counts spikes in the summary line |
| Spike template | `templates/spike/` | the files every spike starts from (package.json, tsconfig, vitest config, findings.md, README, smoke test) |
| Scaffold script | `scripts/new-spike.ts` | `node scripts/new-spike.ts <track-dir> <slug>` — copies the template into `tracks/<track-dir>/spikes/<slug>/`, substitutes the package name; zero-dep like check-docs.ts |
| Design skill | `.claude/skills/codebase-design/` | vendored from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, attribution kept) — SKILL.md, DEEPENING.md, DESIGN-IT-TWICE.md |

## Spike lifecycle and documents

Each spike directory carries three documents; the code is throwaway-grade R&D kept only so
findings stay reproducible. **Findings are the durable artifact, not the code** — spike code
never graduates into an app package by copy; the accepted report and its decisions do.

1. **`README.md`** — what this spike validates (the report checks in scope), what is out of
   scope, and how to run it (`npm ci && npm test`).
2. **`design.md`** — written before implementation, applying the vendored codebase-design
   skill: the module interfaces the spike will exercise, designed at least twice
   (DESIGN-IT-TWICE.md's parallel-variants pattern), compared on depth, locality, and seam
   placement, with the chosen design and its rationale. The spike then implements the chosen
   interfaces.
3. **`findings.md`** — the deliverable. Contract (validated by check-docs.ts):
   - `**Status**: planned | in progress | complete`
   - `**Track**:` and `**Report**:` links back to the owning track
   - a **Checks** table: one row per report check in scope — verdict `go` / `no-go` /
     `blocked`, with evidence (test name, measured number, or failure description)
   - a **Deviations** section: every place the spike environment differs from the app
     (synthetic contracts, in-process broker, Node instead of a browser, assumptions A-N
     touched)
   - a **Decision impact** section: which D-#### entries the findings support, and any
     amendment the user should consider. Spike findings never change a decision by
     themselves — amendments go through the user gate, then the ledger.

## Rules of the road

- Spikes are sanctioned only for **accepted** tracks (the report's spike section is the
  scope contract). Statuses in the README track index do not change when spikes run; spike
  state lives in each spike's `findings.md`.
- Spike dependencies must still be OSS (D-0003 spirit), but installing a dev tool inside a
  spike is not an adoption — adoption recommendations flow only through reports and D-####
  entries.
- The desk environment has no app repo and no vendored app contracts (D-0004): spikes author
  small synthetic OpenAPI/AsyncAPI contracts shaped like the app's, use an in-process MQTT
  broker over WebSocket for broker tests, and bench in Node where the report says "browser".
  Every such substitution is declared under Deviations.
- Spike code follows the vendored codebase-design skill: deep modules (small interface, the
  logic hidden behind it), seams only where something actually varies (an in-process broker
  and a future real broker are two adapters — a real seam), tests at the interface, and the
  skill's vocabulary (module / interface / seam / adapter) in `design.md`.

## First cohort — Wave 3

Two spikes, scoped by their reports' "What a spike would validate" sections:

- `tracks/0060-transport-abstraction/spikes/boundary-wiring/` — the MQTT leg (machine +
  callback actor against a real in-process broker: reconnect edges, offline-window
  resubscribe with the dedup guard, non-blocking message pump), the REST leg (orval
  generation over a synthetic OpenAPI contract: `signal` threading through the mutator,
  taxonomy-aware retry predicate, global `Register` error type), the quarantine ring +
  error normalizers, the policy table over mqtt-pattern, the two-wire surface, a
  per-message overhead bench, and the oxlint layering check.
- `tracks/0070-state-concurrency/spikes/ingress-and-test-lane/` — the composition wiring
  (machine → store → selector and store → machine, re-entrancy under synchronous fan-out),
  the single-dispatch ingress seam under an `fc.scheduler` interleaving property with
  `fc.schedulerFor` regression pinning and `@fast-check/worker` hang protection, the
  `xstate/graph` path suite, the cancellation chain (actor stop → `fromPromise` signal →
  fetch abort; `AbortSignal.any()` composition), the `useOptimisticMutation` wrapper under a
  scheduled interleaving, and the invalidate-don't-set bridge.

Checks a desk spike cannot settle (owner-supplied facts: real topic scheme, real peak rate,
real browser) run against synthetic stand-ins and are marked as such in Deviations.
