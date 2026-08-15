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
- Node version:
- Build tool (Vite / webpack / other): vite
- Package manager:
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

## Environment
- CI provider: GitHub Actions
- Browser targets: Firefox version ~124 , Chromium latest - (latest - 2)
- Test framework:
- Approximate app scale (LOC or file count): 150,000 lOC
- Team size: ~50

## Vetoes
- Existing team decisions that would disqualify candidates:
