# Wave 3 — Spike Harness + 0060/0070 Spikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standing isolated R&D spike harness, then run the two Wave 2 spikes (0060 `boundary-wiring`, 0070 `ingress-and-test-lane`) through it to go/no-go verdicts recorded in each spike's `findings.md`.

**Architecture:** Harness first (ignore rules → validator spike-awareness → vendored design skill → template + scaffold), then per spike: a controller-run design-it-twice interface panel producing `design.md`, followed by implementation tasks that build and test against the chosen interfaces. Tasks 4 and 7 are controller-run workflows (mirroring Wave 2's survey workflows); all other tasks are subagent-dispatched. The wave ends at a user gate presenting findings.

**Tech Stack:** Node >= 24.2, TypeScript + vitest per spike (standalone exact-pinned packages), zero-dep repo-root scripts (node:fs + node:test), aedes in-process MQTT broker over ws for 0060, fast-check scheduler lane for 0070.

**Spec:** docs/superpowers/specs/2026-08-14-spike-harness-design.md (this plan argues from it; the program spec docs/superpowers/specs/2026-08-13-tooling-research-program-design.md remains binding above both).

## Global Constraints

- **No AI attribution in any commit message** — no `Co-Authored-By`, no "Generated with" lines. Applies to every implementer; carry it in every brief.
- Before **every** commit: `node scripts/check-docs.ts` passes AND `node --test scripts/` passes (runs check-docs.test.ts + new-spike.test.ts once Task 3 lands).
- **Spike isolation (spec):** each spike is a standalone npm package — own exact-pinned `package.json` + committed `package-lock.json`; no npm workspaces; no imports from repo root, other spikes, or other tracks (duplicate helpers instead); `node_modules/` never committed; repo root `package.json` stays dependency-free.
- **Version pins:** report-surveyed packages install at their surveyed versions — mqtt@5.15.2, xstate@5.32.5, mqtt-pattern@2.1.1, @tanstack/react-query@5.101.4, zustand@5.0.15, fast-check@4.9.0, @fast-check/worker@0.6.0, orval@8.24.0. Everything else installs `--save-exact` at current latest; resolved versions land in the lockfile and, for load-bearing tools, in findings.md.
- **OSS-only** spike dependencies (D-0003 spirit; installing a dev tool in a spike is not an adoption).
- **Design before implementation:** each spike's `design.md` (Tasks 4/7) is the interface authority for its implementation tasks; spike code uses the vendored codebase-design skill's vocabulary and principles (deep modules; a seam only where two adapters exist; tests at the interface).
- **Findings honesty:** a failing check is recorded as `no-go` (or `blocked`) with evidence — never softened, never retried into silence. A no-go is a valid spike outcome.
- Commits stay **local**; the user owns pushes to the GitHub remote.

---

### Task 1: Root ignore rules + validator spike-awareness

**Files:**
- Create: `.gitignore`
- Modify: `scripts/check-docs.ts` (add `isIgnoredPath`, `checkSpikes`; wire into `listMarkdown` and `main`)
- Test: `scripts/check-docs.test.ts` (3 new tests → 22 total)

**Interfaces:**
- Consumes: existing exports of check-docs.ts (`stripFenced`).
- Produces: `isIgnoredPath(rel: string): boolean`, `checkSpikes(spikes: Spike[]): string[]`, `type Spike = { track: string; name: string; findings: string | null }` — Task 3's scaffolded spikes and Tasks 5–9's installs depend on these guards being in place first.

- [ ] **Step 1: Create `.gitignore`** at repo root:

```gitignore
# Spike installs and generated output (spike harness spec, 2026-08-14)
node_modules/
dist/
coverage/
*.tsbuildinfo
```

- [ ] **Step 2: Write the failing tests** — append to `scripts/check-docs.test.ts` (import `isIgnoredPath`, `checkSpikes` from `./check-docs.ts`):

```typescript
test("isIgnoredPath skips installed and generated trees", () => {
  assert.equal(isIgnoredPath("0060-x/spikes/s/node_modules/pkg/README.md"), true);
  assert.equal(isIgnoredPath("0060-x/spikes/s/dist/out.md"), true);
  assert.equal(isIgnoredPath("0060-x/spikes/s/findings.md"), false);
});

test("checkSpikes accepts a valid spike", () => {
  assert.deepEqual(
    checkSpikes([{ track: "0060-x", name: "boundary-wiring", findings: "**Status**: planned" }]),
    [],
  );
});

test("checkSpikes rejects bad slug, missing findings, bad status", () => {
  const errs = checkSpikes([
    { track: "0060-x", name: "Bad_Name", findings: "**Status**: planned" },
    { track: "0060-x", name: "no-findings", findings: null },
    { track: "0060-x", name: "bad-status", findings: "**Status**: done" },
  ]);
  assert.equal(errs.length, 3);
});
```

- [ ] **Step 3: Run tests to verify the 3 new ones fail** — `node --test scripts/check-docs.test.ts` → 3 failures ("isIgnoredPath is not a function" or equivalent).

- [ ] **Step 4: Implement** in `scripts/check-docs.ts`. After `isTrackReport`:

```typescript
// Installed/generated trees are never doc-system content (spike harness spec).
const IGNORED_SEGMENTS = new Set(["node_modules", "dist", "coverage"]);
export function isIgnoredPath(rel: string): boolean {
  return rel.split(/[\\/]/).some((seg) => IGNORED_SEGMENTS.has(seg));
}

// Spike harness spec: every spike dir carries findings.md with a valid Status.
export type Spike = { track: string; name: string; findings: string | null };

const SPIKE_STATUSES = ["planned", "in progress", "complete"];

export function checkSpikes(spikes: Spike[]): string[] {
  const errs: string[] = [];
  for (const s of spikes) {
    const dir = `tracks/${s.track}/spikes/${s.name}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.name))
      errs.push(`${dir}: spike dir must be a kebab slug`);
    if (s.findings == null) { errs.push(`${dir}: missing findings.md`); continue; }
    const m = stripFenced(s.findings).match(/^\*\*Status\*\*:\s*(.+?)\s*$/m);
    if (!m || !SPIKE_STATUSES.includes(m[1]))
      errs.push(`${dir}/findings.md: missing or invalid **Status**: (${SPIKE_STATUSES.join(" | ")})`);
  }
  return errs;
}
```

In `listMarkdown`, add as the first line of the loop body: `if (isIgnoredPath(rel)) continue;`

In `main()`, after the `trackDirs` block, collect spikes and wire the check + summary:

```typescript
  const spikes: Spike[] = [];
  for (const t of trackDirs) {
    const spikesAbs = join(tracksAbs, t, "spikes");
    if (!existsSync(spikesAbs)) continue;
    for (const n of readdirSync(spikesAbs)) {
      if (!statSync(join(spikesAbs, n)).isDirectory()) continue;
      spikes.push({ track: t, name: n, findings: read(`tracks/${t}/spikes/${n}/findings.md`) });
    }
  }
```

Add `...checkSpikes(spikes),` to the `errors` array, and extend the ok line to end with `` `${reports.length} report(s), ${intakeCount} intake file(s), ${spikes.length} spike(s).` ``

- [ ] **Step 5: Run tests to verify all pass** — `node --test scripts/check-docs.test.ts` → 22 pass; `node scripts/check-docs.ts` → ok line now ends `, 0 spike(s).`

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/check-docs.ts scripts/check-docs.test.ts
git commit -m "feat(harness): ignore rules and validator spike-awareness"
```

---

### Task 2: Vendor the codebase-design skill + D-0017 + README

**Files:**
- Create: `.claude/skills/codebase-design/SKILL.md`, `.claude/skills/codebase-design/DEEPENING.md`, `.claude/skills/codebase-design/DESIGN-IT-TWICE.md` — byte-verbatim copies of the three files staged at `$CLAUDE_JOB_DIR/tmp/` (`codebase-design-SKILL.md` → `SKILL.md`, `DEEPENING.md`, `DESIGN-IT-TWICE.md`); the dispatching controller supplies the absolute staging paths in the brief.
- Create: `.claude/skills/codebase-design/ATTRIBUTION.md`
- Modify: `DECISIONS.md` (append D-0017), `README.md` (How-it-works paragraph + frontier)

**Interfaces:**
- Consumes: staged upstream files; DECISIONS.md next free ID is D-0017.
- Produces: the vendored skill path `.claude/skills/codebase-design/` that Tasks 4/7 briefs and the harness spec's table point at.

- [ ] **Step 1: Copy the three skill files verbatim** into `.claude/skills/codebase-design/` under their canonical names. No edits, no added headers — attribution lives in the sibling file.

- [ ] **Step 2: Write `ATTRIBUTION.md`:**

```markdown
# Attribution

The files SKILL.md, DEEPENING.md, and DESIGN-IT-TWICE.md in this directory are vendored
verbatim from https://github.com/mattpocock/skills
(skills/engineering/codebase-design/, commit 8b78b531ab965735c5dc74f6f7a219e1e37326df,
fetched 2026-08-14), under the MIT License:

> MIT License
>
> Copyright (c) 2026 Matt Pocock
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Adopted per D-0017; governs spike design per
[the spike harness spec](../../../docs/superpowers/specs/2026-08-14-spike-harness-design.md).
```

- [ ] **Step 3: Append D-0017 to `DECISIONS.md`:**

```markdown
### D-0017: Adopt the isolated spike harness and vendor the codebase-design skill
**Date**: 2026-08-14
**What**: Spikes run as fully standalone npm packages under `tracks/<track>/spikes/<slug>/` — own exact-pinned package.json + committed lockfile, no npm workspaces, no imports across the spike boundary, node_modules git-ignored; scaffolded by `scripts/new-spike.ts` from `templates/spike/`; findings.md is the durable deliverable (validated by check-docs.ts). The codebase-design skill (SKILL.md, DEEPENING.md, DESIGN-IT-TWICE.md) is vendored verbatim from mattpocock/skills at `.claude/skills/codebase-design/` (MIT, commit 8b78b53) and governs spike design: deep modules, real seams only, and design-it-twice interface panels recorded in each spike's design.md.
**Why**: User directive (2026-08-14): attempt 0060/0070 spikes, keep each spike's work isolated, and establish a reusable R&D harness for future track spikes.
**From**: docs/superpowers/specs/2026-08-14-spike-harness-design.md
**Affects**: repo structure, process, 0060, 0070, and every future spike
```

- [ ] **Step 4: README** — in "How it works", append this paragraph after the existing one:

```markdown
Accepted tracks may run **spikes**: standalone, exact-pinned npm packages under
`tracks/<track>/spikes/<slug>/`, scaffolded by `node scripts/new-spike.ts <track-dir> <slug>`
and isolated per the [spike harness spec](docs/superpowers/specs/2026-08-14-spike-harness-design.md).
Each spike designs its interfaces first (`design.md`, per the vendored
[codebase-design skill](.claude/skills/codebase-design/SKILL.md)) and records go/no-go results
in `findings.md` — the durable artifact.
```

Replace the frontier line with:

```markdown
> **Frontier:** Wave 3 in progress — spike harness + 0060/0070 spikes (D-0017).
```

- [ ] **Step 5: Validate and commit** — `node scripts/check-docs.ts` (17 decisions) and `node --test scripts/`, then:

```bash
git add .claude DECISIONS.md README.md
git commit -m "feat(harness): vendor codebase-design skill; record D-0017"
```

---

### Task 3: Spike template + scaffold script + scaffold both spikes

**Files:**
- Create: `templates/spike/package.json`, `templates/spike/tsconfig.json`, `templates/spike/vitest.config.ts`, `templates/spike/src/index.ts`, `templates/spike/test/smoke.test.ts`, `templates/spike/findings.md`, `templates/spike/README.md`
- Create: `scripts/new-spike.ts`
- Test: `scripts/new-spike.test.ts`
- Create (by running the script): `tracks/0060-transport-abstraction/spikes/boundary-wiring/`, `tracks/0070-state-concurrency/spikes/ingress-and-test-lane/` (+ their lockfiles after toolchain install)

**Interfaces:**
- Consumes: Task 1's validator guards (ignored paths, `checkSpikes`).
- Produces: `scaffold(root, trackDir, slug, date): string`, `substitute(text, map)`, `validateSlug(slug)`; the two scaffolded spike dirs Tasks 4–9 work in.

- [ ] **Step 1: Template files.** `templates/spike/package.json`:

```json
{
  "name": "__SPIKE_PACKAGE_NAME__",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`templates/spike/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["es2023", "dom"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`templates/spike/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node",
  },
});
```

`templates/spike/src/index.ts`:

```typescript
// __SPIKE_PACKAGE_NAME__ — spike code. Findings are the durable artifact; see findings.md.
export {};
```

`templates/spike/test/smoke.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("harness smoke", () => {
  it("runs TypeScript under vitest", () => {
    const n: number = 2 + 2;
    expect(n).toBe(4);
  });
});
```

`templates/spike/findings.md`:

```markdown
# Findings — __SPIKE_SLUG__

**Status**: planned
**Track**: [__TRACK_DIR__](../../research-plan.md)
**Report**: [report.md](../../report.md)
**Date started**: __DATE__

## Checks

| Report check | Verdict | Evidence |
|---|---|---|
| _pending_ | — | — |

## Deviations

_None recorded yet._

## Decision impact

_None recorded yet._
```

`templates/spike/README.md`:

```markdown
# Spike: __SPIKE_SLUG__

Part of `__TRACK_DIR__`. Scope: the report checks listed in [findings.md](findings.md).

## Run

npm ci && npm test

Isolated per the
[spike harness spec](../../../../docs/superpowers/specs/2026-08-14-spike-harness-design.md):
standalone package, exact-pinned deps, no imports across the spike boundary.
```

- [ ] **Step 2: Write the failing tests** at `scripts/new-spike.test.ts`:

```typescript
// scripts/new-spike.test.ts — unit tests for the spike scaffolder.
// Run: node --test scripts/new-spike.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffold, substitute, validateSlug } from "./new-spike.ts";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "new-spike-"));
  mkdirSync(join(root, "templates", "spike", "test"), { recursive: true });
  mkdirSync(join(root, "tracks", "0060-transport-abstraction"), { recursive: true });
  writeFileSync(join(root, "templates", "spike", "package.json"), '{"name":"__SPIKE_PACKAGE_NAME__"}');
  writeFileSync(join(root, "templates", "spike", "findings.md"), "# Findings — __SPIKE_SLUG__\n**Status**: planned\n");
  return root;
}

test("validateSlug accepts kebab, rejects others", () => {
  assert.equal(validateSlug("boundary-wiring"), true);
  assert.equal(validateSlug("Bad_Name"), false);
});

test("substitute replaces every occurrence", () => {
  assert.equal(substitute("a __X__ b __X__", { __X__: "y" }), "a y b y");
});

test("scaffold copies template with substitutions", () => {
  const root = makeRoot();
  const dest = scaffold(root, "0060-transport-abstraction", "boundary-wiring", "2026-08-14");
  assert.equal(existsSync(join(dest, "package.json")), true);
  assert.match(readFileSync(join(dest, "package.json"), "utf8"), /spike-0060-boundary-wiring/);
  assert.match(readFileSync(join(dest, "findings.md"), "utf8"), /boundary-wiring/);
});

test("scaffold refuses bad slug, existing dir, unknown track", () => {
  const root = makeRoot();
  scaffold(root, "0060-transport-abstraction", "dup", "2026-08-14");
  assert.throws(() => scaffold(root, "0060-transport-abstraction", "dup", "2026-08-14"), /already exists/);
  assert.throws(() => scaffold(root, "0060-transport-abstraction", "Bad_Name", "2026-08-14"), /kebab/);
  assert.throws(() => scaffold(root, "0099-nope", "ok-slug", "2026-08-14"), /no such track/);
});
```

- [ ] **Step 3: Run to verify failure** — `node --test scripts/new-spike.test.ts` → fails (module not found).

- [ ] **Step 4: Implement `scripts/new-spike.ts`:**

```typescript
#!/usr/bin/env node
// new-spike.ts — scaffold an isolated spike package from templates/spike/.
// Spec: docs/superpowers/specs/2026-08-14-spike-harness-design.md.
// Zero dependencies: node:fs. Requires Node >= 24.2. Run:
//   node scripts/new-spike.ts <track-dir> <spike-slug>
// e.g. node scripts/new-spike.ts 0060-transport-abstraction boundary-wiring

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function substitute(text: string, map: Record<string, string>): string {
  return Object.entries(map).reduce((t, [k, v]) => t.replaceAll(k, v), text);
}

export function scaffold(root: string, trackDir: string, slug: string, date: string): string {
  const template = join(root, "templates", "spike");
  const trackAbs = join(root, "tracks", trackDir);
  const dest = join(trackAbs, "spikes", slug);
  if (!existsSync(template)) throw new Error("missing template: templates/spike");
  if (!existsSync(trackAbs)) throw new Error(`no such track: tracks/${trackDir}`);
  if (!validateSlug(slug)) throw new Error(`spike slug must be kebab-case: "${slug}"`);
  if (existsSync(dest)) throw new Error(`already exists: tracks/${trackDir}/spikes/${slug}`);
  cpSync(template, dest, { recursive: true });
  const map: Record<string, string> = {
    __SPIKE_PACKAGE_NAME__: `spike-${trackDir.slice(0, 4)}-${slug}`,
    __SPIKE_SLUG__: slug,
    __TRACK_DIR__: trackDir,
    __DATE__: date,
  };
  for (const rel of readdirSync(dest, { recursive: true }) as string[]) {
    const p = join(dest, rel);
    if (statSync(p).isDirectory()) continue;
    writeFileSync(p, substitute(readFileSync(p, "utf8"), map));
  }
  return dest;
}

if (import.meta.main) {
  const [trackDir, slug] = process.argv.slice(2);
  if (!trackDir || !slug) {
    console.error("usage: node scripts/new-spike.ts <track-dir> <spike-slug>");
    process.exit(2);
  }
  try {
    const dest = scaffold(ROOT, trackDir, slug, new Date().toISOString().slice(0, 10));
    console.log(`new-spike: created ${dest}`);
    console.log("next: cd there; npm i -D --save-exact <deps>; npm test");
  } catch (e) {
    console.error(`new-spike: ${(e as Error).message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run tests to verify all pass** — `node --test scripts/` → 26 pass (22 + 4).

- [ ] **Step 6: Scaffold both spikes for real:**

```bash
node scripts/new-spike.ts 0060-transport-abstraction boundary-wiring
node scripts/new-spike.ts 0070-state-concurrency ingress-and-test-lane
```

- [ ] **Step 7: Install the toolchain in each spike and run the smoke test** (proves isolation end to end; lockfiles are born here):

```bash
cd tracks/0060-transport-abstraction/spikes/boundary-wiring && npm i -D --save-exact typescript vitest @types/node && npm test && npm run typecheck
cd tracks/0070-state-concurrency/spikes/ingress-and-test-lane && npm i -D --save-exact typescript vitest @types/node && npm test && npm run typecheck
```

- [ ] **Step 8: Validate and commit** — `node scripts/check-docs.ts` must report `2 spike(s)`; `git status` must show no `node_modules` paths (the .gitignore proof):

```bash
git add templates/spike scripts/new-spike.ts scripts/new-spike.test.ts tracks/0060-transport-abstraction/spikes tracks/0070-state-concurrency/spikes
git commit -m "feat(harness): spike template + new-spike scaffolder; scaffold 0060/0070 spikes"
```

---

### Task 4: 0060 interface design panel (controller-run workflow) → design.md

**Files:**
- Create: `tracks/0060-transport-abstraction/spikes/boundary-wiring/design.md`

**Interfaces:**
- Consumes: `tracks/0060-transport-abstraction/report.md` (fixed constraints), `.claude/skills/codebase-design/` (vocabulary + DESIGN-IT-TWICE process), the scaffolded spike dir.
- Produces: `design.md` — the interface authority Tasks 5–6 implement against.

- [ ] **Step 1: Controller writes the panel brief** (a file in the SDD workspace, not pasted into context) containing the fixed constraints the panel may NOT redesign: validation choke point below cache/retry/dedup (D-0006); one ingress per protocol; the two-wire rule (discrete domain events via typed `actor.on`/`emit`, continuous state via `actor.subscribe` selector projection); TanStack Query lives outside the boundary; four-class error taxonomy owned by `transport-boundary/errors`; policy table keyed by AsyncAPI channel via mqtt-pattern; bounded quarantine ring; reconnect give-up → `degraded` state with publish gating. What varies (the panel's freedom): the boundary package's public surface — subscribe/publish/query entry points, configuration shape, error/telemetry taps, teardown.

- [ ] **Step 2: Run the design-it-twice workflow** — 4 design agents in parallel, each reading the report, the skill files, and the brief, each under a different constraint per DESIGN-IT-TWICE.md (minimize interface / maximize flexibility / optimize the common caller / ports-and-adapters for the broker seam), each returning: interface (types + invariants + ordering + error modes), usage example, what hides behind the seam, dependency categories per DEEPENING.md, trade-offs. Then 1 judge agent compares on depth, locality, and seam placement and returns the full `design.md` content: problem space → the four candidate interfaces (compressed) → comparison → chosen interface in full TypeScript → rationale.

- [ ] **Step 3: Controller writes `design.md`, validates, commits:**

```bash
git add tracks/0060-transport-abstraction/spikes/boundary-wiring/design.md
git commit -m "feat(0060): boundary-wiring interface design (design-it-twice panel)"
```

- [ ] **Step 4: Reviewer gate** — one reviewer checks design.md against the report's fixed constraints (the Step 1 list) and the skill's seam discipline (no single-adapter seams beyond broker-vs-test-broker). Fix findings before Task 5.

---

### Task 5: 0060 spike — MQTT leg against a real broker + bench

**Files (all inside `tracks/0060-transport-abstraction/spikes/boundary-wiring/`):**
- Modify: `package.json` / lockfile (deps below), `src/index.ts` (exports), `findings.md` (Status → `in progress`; check rows)
- Create: `src/` modules per design.md (connection machine, message pump, dedup guard, policy table, quarantine ring, normalizers, two-wire surface)
- Create: `test/` suites per the checks below; a local aedes-over-ws test broker helper in `test/`

**Interfaces:**
- Consumes: design.md's chosen interface (authoritative names and types).
- Produces: the boundary modules Task 6 attaches the REST leg and telemetry checks to.

- [ ] **Step 1: Install deps** (exact pins): `npm i --save-exact mqtt@5.15.2 xstate@5.32.5 mqtt-pattern@2.1.1` and `npm i -D --save-exact aedes ws @types/ws ajv` (ajv pinned to its latest 8.x — 0010's leg).

- [ ] **Step 2: Implement per design.md and test each report check** (each check = at least one test; suggested spread — the implementer may reorganize files, not scope):
  - *Reconnect edges*: connection machine over a real aedes broker — kill the server socket; assert `reconnecting` → recovery, forced repeated failure → bounded give-up → `degraded` with publish gating.
  - *Offline-window resubscribe + dedup* (the mqtt.js #909 scenario): deliver the same message twice across a simulated offline window; assert exactly one dispatch passes the dedup guard, and resubscribe happens after reconnect.
  - *Non-blocking pump* (the #1935 scenario): flood N messages with a slow validator; assert the bounded queue never blocks the packet pump (queue length capped, overflow counted + quarantined, client stays connected).
  - *Policy table*: mqtt-pattern matching over a synthetic topic scheme keyed like AsyncAPI channels; unknown topic → class 4 + quarantine.
  - *Quarantine ring + normalizers*: bounded ring; normalizers over real Ajv error objects; deduped four-class telemetry event observable via the wildcard discrete-event tap (`actor.on('*')` or design.md's equivalent).
  - *Non-JSON ingress*: binary/malformed payloads on the MQTT leg → defined behavior, no silent skip.
  - *Two-wire surface*: one test subscribing the discrete-event wire, one projecting continuous state via `actor.subscribe` — assert the same ingress feeds both and neither wire leaks the other's shape.
  - *Bench*: measure per-message interpretation + dispatch overhead at ≥1k msg/s in Node (`node --test` or vitest bench); record the number in findings.md (Deviation: Node, not a browser).

- [ ] **Step 3: `npm test` + `npm run typecheck` green; update findings.md rows** (verdict + evidence per check; Status: `in progress`).

- [ ] **Step 4: Validate repo (`node scripts/check-docs.ts`, `node --test scripts/`) and commit:**

```bash
git add tracks/0060-transport-abstraction/spikes/boundary-wiring
git commit -m "feat(0060): spike MQTT leg — broker tests, pump, policy table, quarantine"
```

---

### Task 6: 0060 spike — REST leg, layering lint, findings complete

**Files (same spike dir):**
- Create: a small synthetic OpenAPI 3 document (2–3 operations with reason-code JSON error bodies), orval config, the custom mutator, generated client output dir, `src/` retry-predicate + `Register` typing, `.oxlintrc.json` + fixture files for the layering check
- Modify: `findings.md` (all checks resolved; Status → `complete`), `README.md` (scope + run notes)

**Interfaces:**
- Consumes: Task 5's boundary modules; design.md.
- Produces: the completed 0060 findings the Task 10 gate presents.

- [ ] **Step 1: Install deps**: `npm i --save-exact @tanstack/react-query@5.101.4` and `npm i -D --save-exact orval@8.24.0 oxlint zod` (zod at the major orval 8.24.0 supports — record the resolved version in findings.md).

- [ ] **Step 2: Checks** (each a test or a scripted assertion):
  - *Signal threading (decisive)*: orval `client: 'react-query'` over the synthetic contract with the custom mutator; invoke the generated query via QueryClient; cancel; assert the mutator received and forwarded `signal` and the underlying fetch aborted (inject fetch at the mutator's seam). Fail → record `no-go` + the hand-written-wrapper consequence from the report.
  - *Taxonomy-aware retry + `Register`*: retry predicate retries class 1 (transient) only — assert a class-2 contract violation is NOT retried; register the `BoundaryError` union as TanStack's global `Register` error type and assert it narrows at a call site (`typecheck` is the test).
  - *Non-JSON ingress, REST leg*: non-JSON body on 2xx and non-2xx → defined taxonomy outcome, no silent skip (the ts-rest #789 lesson).
  - *Telemetry via QueryCache*: the four-class telemetry event reaches a logging stub through the QueryCache `onError` tap (complementing Task 5's actor.on tap).
  - *Layering lint*: `.oxlintrc.json` with `no-restricted-imports` overrides — ingress modules may import `mqtt`, a fixture violation file elsewhere may not; run oxlint via `execFile` in a test; assert exit code + rule id fire on the fixture (0010's overrides-merge caveat is the thing under test).
  - *mqtt-pattern adopt-vs-vendor*: count its installed size/lines; record the recommendation in findings.md.

- [ ] **Step 3: Complete `findings.md`** — every in-scope report check has a row (verdict go/no-go/blocked + evidence); Deviations list synthetic contract, in-process broker, Node bench, and any assumption A-N touched; Decision impact states what D-0015 gains/loses. Status → `complete`.

- [ ] **Step 4: Validate and commit:**

```bash
git add tracks/0060-transport-abstraction/spikes/boundary-wiring
git commit -m "feat(0060): spike REST leg + layering lint; findings complete"
```

---

### Task 7: 0070 interface design panel (controller-run workflow) → design.md

Same shape as Task 4, for `tracks/0070-state-concurrency/spikes/ingress-and-test-lane/design.md`.

- [ ] **Step 1: Brief** — fixed constraints: single-dispatch ingress (dedup → guard → mask → dispatch, one entry point); per-(topic, entity) monotonic guards, stamp-ready but stamp-absent (A-1); invalidate-don't-set for dual-leg entities (`staleTime: Infinity`, MQTT event → invalidate; copying query data into Zustand is banned); `AbortController`/`AbortSignal` as the only cancellation primitive; machine→store wire is `actor.subscribe` selector projection, store→machine is `subscribeWithSelector` `(next, prev)` → `actor.send`; structured concurrency (async work as child actors). Freedom: the ingress kit's exact signature, the composition helpers' surface, `useOptimisticMutation`'s signature, test-lane helper shapes.
- [ ] **Step 2: Run the 4-agent + judge design-it-twice workflow** (constraints as in Task 4 Step 2).
- [ ] **Step 3: Write design.md, validate, commit** — `git commit -m "feat(0070): ingress-and-test-lane interface design (design-it-twice panel)"`.
- [ ] **Step 4: Reviewer gate** against the fixed-constraint list + seam discipline.

---

### Task 8: 0070 spike — composition wiring + ingress seam + scheduler test lane

**Files (all inside `tracks/0070-state-concurrency/spikes/ingress-and-test-lane/`):**
- Modify: `package.json`/lockfile, `findings.md` (Status → `in progress`; rows)
- Create: `src/` per design.md (composition helpers, ingress kit, monotonic guard), `test/` suites below

**Interfaces:**
- Consumes: design.md's chosen interfaces.
- Produces: the ingress kit + composition modules Task 9's query-bridge and cancellation checks build on.

- [ ] **Step 1: Install deps** (exact pins): `npm i --save-exact xstate@5.32.5 zustand@5.0.15` and `npm i -D --save-exact fast-check@4.9.0 @fast-check/worker@0.6.0 react react-dom @testing-library/react happy-dom` (react at latest exact; record the resolved React major in findings — A-2 touchpoint).

- [ ] **Step 2: Checks:**
  - *Composition wiring end to end*: machine → vanilla store → React (`actor.subscribe` → `setState` → `useSelector`) and store → machine (`subscribeWithSelector` `(next, prev)` → `actor.send`); count the glue lines (record the number); assert no feedback loop / re-entrancy blow-up under synchronous listener fan-out (a listener that writes back must not loop — assert bounded dispatch count).
  - *Schedulable ingress seam (decisive)*: the single-dispatch ingress under an `fc.scheduler` property racing scheduled synthetic MQTT messages against a scheduled REST resolution — assert the stale write is rejected by the monotonic guard; on a found counterexample assert replay works from `{seed, path}`.
  - *Regression pinning*: convert one found/constructed interleaving into an `fc.schedulerFor` deterministic test; wire one property through `@fast-check/worker` and assert a deliberately hung property is killed without taking the runner down (worker property in its own file per the library's model).

- [ ] **Step 3: `npm test` + `typecheck` green; findings rows updated.**

- [ ] **Step 4: Validate and commit:**

```bash
git add tracks/0070-state-concurrency/spikes/ingress-and-test-lane
git commit -m "feat(0070): spike composition wiring + ingress seam + scheduler lane"
```

---

### Task 9: 0070 spike — path suite, cancellation chain, optimistic unit, bridge; findings complete

**Files (same spike dir):**
- Create: `src`/`test` additions per the checks; a local minimal mutator-shaped fetch wrapper (deliberately duplicated here, NOT imported from the 0060 spike — isolation rule)
- Modify: `findings.md` (Status → `complete`), `README.md`

**Interfaces:**
- Consumes: Task 8's modules; design.md.
- Produces: the completed 0070 findings the Task 10 gate presents.

- [ ] **Step 1: Install deps**: `npm i --save-exact @tanstack/react-query@5.101.4`.

- [ ] **Step 2: Checks:**
  - *`xstate/graph` path suite*: generate a shortest-paths suite (with `filterEvents`) from a small production-shaped machine; run every path as a test; confirm the import comes from core xstate at 5.32.5 (the ≥5.20.0 claim); record abstract-model-vs-production-machine reuse verdict and whether xstate-audition-style helpers would be worth vendoring.
  - *Cancellation chain*: actor stop → `fromPromise` `signal` → the local mutator-shaped wrapper → fetch abort (inject fetch); `AbortError` normalized as a cancellation outcome, not a taxonomy class; `AbortSignal.any()` composition — a boundary-owned signal aborts all in-flight work on simulated connection loss.
  - *Optimistic-update unit*: implement `useOptimisticMutation` per design.md (`cancelQueries` + snapshot + rollback + `isMutating() === 1` gate); subject it to an `fc.scheduler` property interleaving two mutations and a refetch (the maintainer-documented residual race is the acceptance test).
  - *Invalidate-don't-set bridge*: one push-covered query (`staleTime: Infinity`); synthetic MQTT event → `invalidateQueries`; assert REST remains the cache's single writer and nothing copies query data into Zustand; add the oxlint `no-restricted-imports` check rejecting a fixture that violates single-writer/no-store-copy (`npm i -D --save-exact oxlint`).

- [ ] **Step 3: Complete `findings.md`** (all rows, Deviations incl. vitest-as-test-framework vs A-9 and the React version used, Decision impact vs D-0016 and the ordering-stamp intake item). Status → `complete`.

- [ ] **Step 4: Validate and commit:**

```bash
git add tracks/0070-state-concurrency/spikes/ingress-and-test-lane
git commit -m "feat(0070): spike path suite, cancellation, optimistic unit, bridge; findings complete"
```

---

### Task 10: Wave close — coherence, frontier, present findings (user gate)

**Files:**
- Modify (if findings conflict): the two `findings.md` files
- Modify: `README.md` (frontier)

**Interfaces:**
- Consumes: both completed findings.md files; the reports; D-0015/D-0016/D-0017.
- Produces: the Wave 3 findings presentation; any D-#### amendment proposals (user's call — never applied unilaterally).

- [ ] **Step 1: Cross-spike coherence review** (one reviewer): (a) the two findings' shared claims agree (signal threading result cited by 0070's cancellation chain vs verified in 0060; the two oxlint layering checks tell one story); (b) every in-scope report check has a row; (c) Deviations are complete and honest; (d) Decision-impact sections propose, never assert, amendments. Fix findings in place; validate; commit `fix(wave-3): align spike findings` (only if fixes were needed).

- [ ] **Step 2: Frontier:**

```markdown
> **Frontier:** Wave 3 spikes complete (0060 boundary-wiring, 0070 ingress-and-test-lane) — next: user review of findings and any D-#### amendments.
```

Validate; commit `feat(wave-3): record spike findings frontier`.

- [ ] **Step 3: Present to the user (gate — stop here):** both spikes' verdict tables, every no-go/blocked with evidence, deviations, proposed decision impacts, and the reminder that commits are local.
