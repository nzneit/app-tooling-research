# Research Repo Scaffold + Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the research-program repo (ledger, templates, validator, README index) and execute the five Wave 1 research tracks through drafted, user-reviewed reports.

**Architecture:** A docs-first repo where every research track lives in `tracks/NNNN-<slug>/` and moves `research-plan.md → report.md → spikes/`. One append-only decision ledger (`DECISIONS.md`), one facts file (`facts/app-profile.md`), and a zero-dependency TypeScript validator (`scripts/check-docs.ts`, adapted from offbook) that enforces the doc-system invariants before every commit.

**Tech Stack:** Markdown; TypeScript run directly by Node ≥ 24 (native type stripping, `node:test`); no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-tooling-research-program-design.md`

## Global Constraints

- **OSS only** (D-0003): shortlists contain only free OSS runnable locally or in CI; no paid products, no self-hosted-server products (SonarQube Server excluded; SonarJS ESLint rules in scope).
- **Survey-only depth** (D-0001): no prototyping; reports end with a "What a spike would validate" section.
- **Pragmatic lint mix** (D-0002): oxlint stays; ESLint or standalone CLIs may be recommended for CI/pre-push.
- **Two permanent ID namespaces**: `D-####` and four-digit track numbers. No new ID alphabets.
- **D-#### IDs**: four digits, contiguous from `D-0001`, never reused; supersede in place, never delete.
- **Track dirs**: `NNNN-kebab-slug`, four-digit zero-padded prefix.
- **Every `report.md` opens with `## Summary (STE)`** as its first H2 (ASD-STE100 core rules; max 2 paragraphs; content order: what was examined → recommendation + tool → main risk → next step).
- **Validator before commit**: run `node scripts/check-docs.ts` before every commit once Task 3 is done; it must print `check-docs: ok`.
- **Commit scope**: each commit is scoped to one task — a track's directory plus any ledger entry or README row it flips.
- **Runtime**: Node ≥ 24 (this machine: v24.18.0; no bun). No package installs.
- **Commit trailer**: end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **User gates**: steps marked **STOP** require the user's response before continuing.

## File Structure

```
README.md                      # Task 1 — entry point: intro, lifecycle, index table, frontier
DECISIONS.md                   # Task 1 — ledger seeded D-0001..D-0009
facts/app-profile.md           # Task 1 — fill-in checklist, initially unfilled
intake/_TEMPLATE.md            # Task 2 — dated-question template
templates/research-plan.md     # Task 2
templates/report.md            # Task 2
package.json                   # Task 3 — {"type":"module"} only, no deps
scripts/LICENSE-offbook        # Task 3 — Apache-2.0 + NOTICE from offbook
scripts/check-docs.ts          # Task 3 — validator
scripts/check-docs.test.ts     # Task 3 — node:test unit tests
tracks/0010-contract-pipeline/research-plan.md   # Task 4    → report.md Task 9
tracks/0020-complexity-metrics/research-plan.md  # Task 5    → report.md Task 10
tracks/0030-duplication-detection/research-plan.md # Task 6  → report.md Task 11
tracks/0040-hooks-linting/research-plan.md       # Task 7    → report.md Task 12
tracks/0050-logging/research-plan.md             # Task 8    → report.md Task 13
```

Wave 2 tracks (0060, 0070) and 0090 get README rows now but no directories until their work starts (the validator permits `planned`/`deferred` rows without directories).

---

### Task 1: Core docs — README, DECISIONS, app profile

**Files:**
- Create: `README.md`
- Create: `DECISIONS.md`
- Create: `facts/app-profile.md`

**Interfaces:**
- Produces: README index table format `| NNNN-slug | scope | status |` (statuses: `planned`, `surveying`, `report drafted`, `accepted`, `deferred`) and the `> **Frontier:**` line — both parsed by Task 3's validator. Ledger entry format `### D-####: title` + `**Date/What/Why/From/Affects**` fields — parsed by Task 3.

- [ ] **Step 1: Write `README.md`** with exactly this content:

````markdown
# Composable State Management Tooling — Research Program

Survey + recommendation research for extracting purpose-built tooling out of an existing
TypeScript React app (React, Zustand, xstate, mqtt.js over WSS, REST APIs with reason-code
JSON bodies, vendored AsyncAPI/OpenAPI contracts, oxlint).

**Spec:** [docs/superpowers/specs/2026-08-13-tooling-research-program-design.md](docs/superpowers/specs/2026-08-13-tooling-research-program-design.md)
· **Decisions:** [DECISIONS.md](DECISIONS.md)
· **App facts:** [facts/app-profile.md](facts/app-profile.md)

> **Frontier:** Scaffold in progress — next: templates and validator, then Wave 1 research plans (0010 first).

## How it works

Each track lives in `tracks/NNNN-<slug>/` and moves through one lifecycle:
`research-plan.md` (key questions, candidates, rubric weights) → `report.md` (source-linked
survey + recommendation: **adopt / adopt + wrap / build / skip**, opening with an
ASD-STE100-style summary) → later `spikes/`. Track statuses: `planned → surveying →
report drafted → accepted`. Acceptance is recorded as a `D-####` entry in
[DECISIONS.md](DECISIONS.md). Questions only the user can answer go through dated files in
`intake/`. Run `node scripts/check-docs.ts` before committing.

## Tracks

| Track | Scope | Status |
|---|---|---|
| 0010-contract-pipeline | Contracts → TS types + runtime validation schemas + factories/mocks; live validation of all contracted inbound messages (keystone) | planned |
| 0020-complexity-metrics | Cyclomatic + cognitive complexity analysis and reporting | planned |
| 0030-duplication-detection | Near-duplicate code detection and de-duplication reporting | planned |
| 0040-hooks-linting | React hooks anti-pattern lint coverage beyond the basics | planned |
| 0050-logging | Config- and runtime-controllable logging facade (sinks, levels, throttling) | planned |
| 0060-transport-abstraction | Unified typed MQTT+REST boundary; validation choke point (Wave 2 — blocked on 0010 acceptance) | planned |
| 0070-state-concurrency | Composable Zustand+xstate patterns; race-condition prevention (Wave 2 — blocked on 0010 acceptance) | planned |
| 0090-horizon-scan | "Anything else" discovery session | deferred |
````

- [ ] **Step 2: Write `DECISIONS.md`** with exactly this content:

````markdown
# Decisions

Append-only ledger. `D-####` IDs are contiguous from D-0001 and never reused; superseded
decisions are marked superseded in place, never deleted. Entry format: `### D-####: title`
followed by `**Date**`, `**What**`, `**Why**`, `**From**`, `**Affects**` lines.

## Constraints in force

D-0001 · D-0002 · D-0003 · D-0004 · D-0006 · D-0007

## Ledger

### D-0001: Survey-only research depth
**Date**: 2026-08-13
**What**: Research deliverables are survey + recommendation documents; no prototyping during research. Spikes come later, pre-scoped by each report's "What a spike would validate" section.
**Why**: Cheapest path to defensible adopt/build/skip calls while keeping spike space reserved.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks

### D-0002: Pragmatic lint mix
**Date**: 2026-08-13
**What**: oxlint stays as the fast default linter; recommendations may add ESLint or standalone CLIs in CI or pre-push for rules oxlint cannot cover.
**Why**: Best capability coverage at acceptable toolchain sprawl.
**From**: brainstorming session 2026-08-13
**Affects**: 0020, 0030, 0040

### D-0003: OSS-only candidates
**Date**: 2026-08-13
**What**: Shortlists contain only free OSS runnable locally or in CI; no paid products and no self-hosted-server products. SonarQube Server is excluded; the SonarJS ESLint rules stay in scope.
**Why**: Procurement is off the table for this effort.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks

### D-0004: App facts via facts/app-profile.md
**Date**: 2026-08-13
**What**: The application repo is not accessible from this repo. Reports cite facts/app-profile.md; a missing fact becomes a declared assumption in the report.
**Why**: The app cannot be shared; grounding must be explicit and auditable.
**From**: brainstorming session 2026-08-13
**Affects**: all tracks

### D-0005: Themed-wave track structure
**Date**: 2026-08-13
**What**: Seven core tracks in two waves plus deferred 0090-horizon-scan. Merged tracks: validation+codegen+factories (0010), cyclomatic+cognitive (0020), state+races (0070). Wave 2 (0060, 0070) starts only after 0010's report is accepted.
**Why**: Merged topics share one tooling surface; separate surveys would duplicate work.
**From**: brainstorming session 2026-08-13
**Affects**: program structure

### D-0006: Live validation of all contracted inbound messages
**Date**: 2026-08-13
**What**: 0010's runtime-validation output must support validating every inbound message from any contracted interface: MQTT payloads (AsyncAPI) and REST response bodies including non-2xx reason-code bodies (OpenAPI). 0060's unified boundary is the validation choke point.
**Why**: Partner breaking changes must surface as first-class errors, on error shapes as much as happy paths.
**From**: brainstorming session 2026-08-13 (user revision)
**Affects**: 0010, 0060

### D-0007: ASD-STE100-style report summaries
**Date**: 2026-08-13
**What**: Every report.md opens with a prepended "Summary (STE)" section following ASD-STE100 core writing rules; max 2 paragraphs; content order: what was examined, recommendation + tool, most important risk, next step.
**Why**: Fast, unambiguous executive read; enforceable by the validator.
**From**: brainstorming session 2026-08-13
**Affects**: all reports

### D-0008: Four-digit track prefixes
**Date**: 2026-08-13
**What**: Track directories use four-digit zero-padded prefixes (0010–9990).
**Why**: Lexicographic sort stays correct with runway for insertions.
**From**: brainstorming session 2026-08-13
**Affects**: tracks/ layout

### D-0009: Adopt offbook doc-system conventions
**Date**: 2026-08-13
**What**: Adopted from offbook: two permanent ID namespaces (D-#### + track numbers), this ledger, the slim intake convention (resolved files stay in place), the check-docs.ts validator (adapted under Apache-2.0 with attribution), and the README frontier pointer. Not adopted: StrictDoc/ReqIF grammar, separate requirements registry, archive strata.
**Why**: Proven conventions matching this repo's traceability needs; validator logic reusable nearly verbatim.
**From**: https://github.com/nzneit/offbook (docs/specs/doc-system.md)
**Affects**: repo structure, process
````

- [ ] **Step 3: Write `facts/app-profile.md`** with exactly this content:

````markdown
# App Profile

Facts about the application under study, supplied by the user (the app repo is not
accessible from here — D-0004). Reports cite this file; a missing fact becomes a declared
assumption in the report. Partial answers are fine.

**Status**: unfilled

## Stack
- React version:
- TypeScript version:
- Node version:
- Build tool (Vite / webpack / other):
- Package manager:
- Monorepo or single package:

## Contracts
- OpenAPI version(s):
- AsyncAPI version(s):
- Rough counts (contracts / operations / message types):
- Current TS type-generation tool:

## MQTT
- QoS levels used:
- Topic-scheme shape (redacted example ok):
- Rough peak message rate (msgs/sec):

## Environment
- CI provider:
- Browser targets:
- Test framework:
- Approximate app scale (LOC or file count):
- Team size:

## Vetoes
- Existing team decisions that would disqualify candidates:
````

- [ ] **Step 4: Commit**

```bash
git add README.md DECISIONS.md facts/app-profile.md
git commit -m "feat: scaffold README, decision ledger (D-0001..D-0009), app profile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Templates — research plan, report, intake

**Files:**
- Create: `templates/research-plan.md`
- Create: `templates/report.md`
- Create: `intake/_TEMPLATE.md`

**Interfaces:**
- Consumes: rubric criteria and STE rules from the spec (copied verbatim below).
- Produces: `templates/report.md` whose first H2 is `## Summary (STE)` — the shape Task 3's `checkReports` enforces. `intake/_TEMPLATE.md` with `**Status**: open` — the shape Task 3's `checkIntake` enforces.

- [ ] **Step 1: Write `templates/research-plan.md`** with exactly this content:

````markdown
# NNNN-track-slug — research plan

**Status**: draft

## Goal

One paragraph: what this track decides and why it matters.

## Key questions

1. Each question the report must answer or explicitly defer with a reason.

## Candidates

- tool-name — https://github.com/org/repo — one-line what-it-is

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | set per track |
| Contract-format support | set per track |
| Integration cost | medium |
| Runtime overhead | set per track |
| Output quality | medium |
| Escape hatch | medium |

## Facts needed

- facts/app-profile.md fields this track depends on.
````

- [ ] **Step 2: Write `templates/report.md`** with exactly this content:

````markdown
# NNNN-track-slug — report

## Summary (STE)

<!-- ASD-STE100 core rules (D-0007): active voice; simple present/past tense; max 20 words
     per instruction sentence, 25 per descriptive sentence; max 6 sentences per paragraph,
     one topic each; one word per meaning, used consistently; no noun clusters over 3 words;
     keep the articles; one instruction per sentence.
     Content order: what the track examined; the recommendation (adopt / adopt + wrap /
     build / skip) and the chosen tool, if any; the most important risk; the next step.
     Maximum 2 paragraphs. -->

Write the summary here, last, after the body below is final.

**As of**: YYYY-MM-DD (versions evaluated are listed per candidate)
**Recommendation**: adopt | adopt + wrap | build | skip — tool-name, if any

## Survey

### candidate-name (vX.Y.Z)

Findings with inline source links.

## Rubric comparison

| Criterion (weight) | candidate-a | candidate-b |
|---|---|---|
| License (high) | strong — evidence | ... |

## Recommendation

Rationale and risks. Cite the D-#### constraints applied and the facts/app-profile.md
fields used; state each assumption made where a fact was missing.

## What a spike would validate

- Pre-scoped spike question(s) for later hands-on work (D-0001).

## Sources

- https://example.com — accessed YYYY-MM-DD
````

- [ ] **Step 3: Write `intake/_TEMPLATE.md`** with exactly this content:

````markdown
# YYYY-MM-DD: topic (intake)

**Status**: open
**Owner**: who owes the answer

## a — the question

Context, options, and a recommendation if there is one.

→ Resolution: the answer → updates facts/app-profile.md and/or allocates D-####
````

- [ ] **Step 4: Commit**

```bash
git add templates/research-plan.md templates/report.md intake/_TEMPLATE.md
git commit -m "feat: add research-plan, report (STE summary), and intake templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Validator — `scripts/check-docs.ts` (TDD)

**Files:**
- Create: `package.json`
- Create: `scripts/LICENSE-offbook`
- Create: `scripts/check-docs.test.ts`
- Create: `scripts/check-docs.ts`

**Interfaces:**
- Consumes: README index rows and `> **Frontier:**` (Task 1), ledger entry format (Task 1), report/intake shapes (Task 2).
- Produces: `node scripts/check-docs.ts` exiting 0 with `check-docs: ok — …` on a valid repo, nonzero listing `✗` problems otherwise. Exported functions under test: `parseEntries(text, level)`, `checkIds(entries, prefix, width, getId)`, `slugify(heading)`, `resolveAnchor(fileText, anchor)`, `checkLinks(files, readFile)`, `parseIndexRows(readme)`, `checkIndex(rows, trackDirs)`, `checkTrackDirs(dirs)`, `checkReports(files)`, `checkIntake(files)`; type `Entry = { title: string; meta: Record<string,string>; body: string; line: number }`.

- [ ] **Step 1: Write `package.json`** (module mode only — no dependencies, no scripts needed):

```json
{
  "name": "composable-state-management-tooling",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: Write `scripts/LICENSE-offbook`** — offbook's NOTICE followed by its Apache-2.0 LICENSE, from the session clone if present, else from GitHub:

```bash
SCRATCH="/private/tmp/claude-501/-Users-nathan-projects-composable-state-management-tooling/affa735c-3755-4c57-ae0b-17c7c1b3d905/scratchpad/offbook"
if [ -f "$SCRATCH/LICENSE" ]; then
  { cat "$SCRATCH/NOTICE"; echo; cat "$SCRATCH/LICENSE"; } > scripts/LICENSE-offbook
else
  { curl -fsSL https://raw.githubusercontent.com/nzneit/offbook/main/NOTICE; echo; \
    curl -fsSL https://raw.githubusercontent.com/nzneit/offbook/main/LICENSE; } > scripts/LICENSE-offbook
fi
head -8 scripts/LICENSE-offbook   # expect the Offbook NOTICE lines, then "Apache License"
```

- [ ] **Step 3: Write the failing tests** at `scripts/check-docs.test.ts`:

```ts
// scripts/check-docs.test.ts — unit tests for the doc-system validator.
// Run: node --test scripts/check-docs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEntries, checkIds, slugify, resolveAnchor, checkLinks,
  parseIndexRows, checkIndex, checkTrackDirs, checkReports, checkIntake,
} from "./check-docs.ts";
import type { Entry } from "./check-docs.ts";

const entry = (id: string, line = 1): Entry => ({ title: `${id}: t`, meta: {}, body: "", line });
const getId = (e: Entry) => e.title.match(/^(D-\d+)/)?.[1] ?? "";

test("parseEntries reads **Field**: meta and body", () => {
  const [e] = parseEntries("### D-0001: a\n**Date**: 2026-08-13\nBody line.", 3);
  assert.equal(e.meta.DATE, "2026-08-13");
  assert.equal(e.body, "Body line.");
});

test("parseEntries isolates heading levels", () => {
  const es = parseEntries("### D-0001: a\n#### sub\n**Date**: x", 3);
  assert.deepEqual(es.map((e) => e.title), ["D-0001: a"]);
});

test("checkIds accepts contiguous four-digit ids", () => {
  assert.deepEqual(checkIds([entry("D-0001"), entry("D-0002")], "D", 4, getId), []);
});

test("checkIds rejects three-digit ids", () => {
  assert.match(checkIds([entry("D-001")], "D", 4, getId)[0], /bad D id/);
});

test("checkIds flags duplicates and gaps", () => {
  const errs = checkIds([entry("D-0001"), entry("D-0001"), entry("D-0003")], "D", 4, getId);
  assert.ok(errs.some((e) => e.includes("duplicate D-0001")));
  assert.ok(errs.some((e) => e.includes("missing D-0002")));
});

test("slugify + resolveAnchor match heading slugs and back-anchors", () => {
  assert.equal(slugify("Summary (STE)"), "summary-ste");
  assert.ok(resolveAnchor("## Summary (STE)", "summary-ste"));
  assert.ok(resolveAnchor("<!-- anchor: d-0001 -->", "d-0001"));
  assert.ok(!resolveAnchor("## Other", "summary-ste"));
});

test("checkLinks resolves relative links and fragments, skips external", () => {
  const files = [{
    path: "README.md",
    text: "[a](tracks/x.md) [b](https://x.dev) [c](missing.md) [d](tracks/x.md#nope)",
  }];
  const read = (rel: string) => (rel === "tracks/x.md" ? "## Yes" : null);
  const errs = checkLinks(files, read);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /broken link → missing\.md/);
  assert.match(errs[1], /anchor not found/);
});

test("parseIndexRows + checkIndex enforce vocabulary and dir consistency", () => {
  const readme = [
    "| Track | Scope | Status |",
    "|---|---|---|",
    "| 0010-a | x | surveying |",
    "| 0020-b | x | bogus |",
    "| 0030-c | x | planned |",
  ].join("\n");
  const rows = parseIndexRows(readme);
  assert.equal(rows.length, 3);
  const errs = checkIndex(rows, ["0010-a", "0040-d"]);
  assert.ok(errs.some((e) => e.includes('invalid status "bogus"')));
  assert.ok(!errs.some((e) => e.includes("0030-c is")));   // planned may lack a dir
  assert.ok(errs.some((e) => e.includes("tracks/0040-d/ has no row")));
});

test("checkIndex flags a non-planned row without a directory", () => {
  const errs = checkIndex([{ track: "0010-a", status: "accepted", line: 3 }], []);
  assert.ok(errs.some((e) => e.includes('"accepted" but tracks/0010-a/ does not exist')));
});

test("checkTrackDirs enforces four-digit kebab names", () => {
  assert.deepEqual(checkTrackDirs(["0010-contract-pipeline"]), []);
  assert.equal(checkTrackDirs(["010-x", "0010_bad"]).length, 2);
});

test("checkReports requires the STE summary as first H2", () => {
  assert.deepEqual(checkReports([{ path: "r", text: "# T\n\n## Summary (STE)\nok" }]), []);
  assert.equal(checkReports([{ path: "r", text: "# T\n\n## Survey" }]).length, 1);
});

test("checkIntake requires a Status field; resolved may stay in place", () => {
  assert.deepEqual(checkIntake([{ name: "2026-08-13-q.md", content: "**Status**: resolved" }]), []);
  assert.equal(checkIntake([{ name: "2026-08-13-q.md", content: "no status" }]).length, 1);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test scripts/check-docs.test.ts`
Expected: FAIL — cannot find module `./check-docs.ts`.

- [ ] **Step 5: Write `scripts/check-docs.ts`**:

```ts
#!/usr/bin/env node
// check-docs.ts — validate this repo's doc-system invariants.
// Spec: docs/superpowers/specs/2026-08-13-tooling-research-program-design.md ("Doc system").
// Adapted from Offbook's scripts/check-docs.ts — Copyright 2026 Nathan Neitman,
// https://github.com/nzneit/offbook — Apache-2.0; see scripts/LICENSE-offbook.
// Zero dependencies: node:fs + hand-parsing. Requires Node >= 24.2 (native type
// stripping + import.meta.main). Run: node scripts/check-docs.ts

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..");

export type Entry = { title: string; meta: Record<string, string>; body: string; line: number };

// Split a doc into heading blocks at exactly `level` hashes. A heading at any
// other level ends the current entry, so meta/body cannot leak across entries.
export function parseEntries(text: string, level: 3 | 4): Entry[] {
  const head = new RegExp(`^#{${level}}\\s+(.+)$`);
  const anyHead = /^#{1,6}\s+/;
  const out: Entry[] = [];
  let cur: Entry | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const h = line.match(head);
    if (h) {
      if (cur) out.push(cur);
      cur = { title: h[1].trim(), meta: {}, body: "", line: i + 1 };
      return;
    }
    if (anyHead.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) return;
    const m = line.match(/^\*\*([A-Za-z]+)\*\*:\s*(.*)$/);
    if (m) cur.meta[m[1].toUpperCase()] = m[2].trim();
    else if (line.trim()) cur.body += (cur.body ? "\n" : "") + line;
  });
  if (cur) out.push(cur);
  return out;
}

// Unique + well-formed + contiguous from -0001. Contiguity enforces "supersede
// in place, never delete", which is how IDs are guaranteed never reused.
export function checkIds(
  entries: Entry[],
  prefix: string,
  width: number,
  getId: (e: Entry) => string,
): string[] {
  const errs: string[] = [];
  const re = new RegExp(`^${prefix}-\\d{${width}}$`);
  const seen = new Set<string>();
  const nums: number[] = [];
  for (const e of entries) {
    const id = getId(e);
    if (!re.test(id)) { errs.push(`bad ${prefix} id: "${id}" (line ${e.line})`); continue; }
    if (seen.has(id)) errs.push(`duplicate ${id}`);
    seen.add(id);
    nums.push(Number(id.slice(prefix.length + 1)));
  }
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  for (let i = 0; i < uniq.length; i++)
    if (uniq[i] !== i + 1) {
      errs.push(
        `${prefix} ids not contiguous from ${prefix}-${String(1).padStart(width, "0")} ` +
        `(missing ${prefix}-${String(i + 1).padStart(width, "0")}) — supersede in place, never delete`,
      );
      break;
    }
  return errs;
}

export function slugify(heading: string): string {
  return heading.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

export function resolveAnchor(fileText: string, anchor: string): boolean {
  if (fileText.includes(`<!-- anchor: ${anchor} -->`)) return true;
  const headings = fileText.match(/^#{1,6}\s+.+$/gm) ?? [];
  return headings.some((h) => slugify(h.replace(/^#{1,6}\s+/, "")) === anchor);
}

// Every relative markdown link resolves; a #fragment must resolve to a heading
// slug or an additive <!-- anchor: ... --> back-anchor in the target file.
// readFile returns null for a missing path and "" for a directory.
export function checkLinks(
  files: { path: string; text: string }[],
  readFile: (rel: string) => string | null,
): string[] {
  const errs: string[] = [];
  for (const f of files)
    for (const m of f.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z+.-]*:/.test(target) || target.startsWith("#")) continue;
      const [rel, anchor] = target.split("#");
      if (rel === "") continue;
      const resolved = join(dirname(f.path), rel);
      const text = readFile(resolved);
      if (text == null) { errs.push(`${f.path}: broken link → ${target}`); continue; }
      if (anchor && !resolveAnchor(text, anchor))
        errs.push(`${f.path}: anchor not found → ${target}`);
    }
  return errs;
}

const STATUSES = ["planned", "surveying", "report drafted", "accepted", "deferred"];

export type IndexRow = { track: string; status: string; line: number };

// README index rows look like: `| 0010-contract-pipeline | <scope> | <status> |`.
// The status is the last cell so extra middle columns stay non-breaking.
export function parseIndexRows(readme: string): IndexRow[] {
  const out: IndexRow[] = [];
  readme.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\|\s*(\d{4}-[a-z0-9-]+)\s*\|/);
    if (!m) return;
    const cells = line.split("|").map((c) => c.trim());
    out.push({ track: m[1], status: cells[cells.length - 2] ?? "", line: i + 1 });
  });
  return out;
}

// planned/deferred rows may lack a directory (work not started); any other
// status without a directory — or a directory without a row — is an error.
export function checkIndex(rows: IndexRow[], trackDirs: string[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.track)) errs.push(`README.md:${r.line}: duplicate index row for ${r.track}`);
    seen.add(r.track);
    if (!STATUSES.includes(r.status))
      errs.push(`README.md:${r.line}: invalid status "${r.status}" (allowed: ${STATUSES.join(", ")})`);
    else if (!trackDirs.includes(r.track) && !["planned", "deferred"].includes(r.status))
      errs.push(`README.md:${r.line}: ${r.track} is "${r.status}" but tracks/${r.track}/ does not exist`);
  }
  for (const d of trackDirs)
    if (!seen.has(d)) errs.push(`tracks/${d}/ has no row in the README index`);
  return errs;
}

export function checkTrackDirs(dirs: string[]): string[] {
  return dirs
    .filter((d) => !/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d))
    .map((d) => `tracks/${d}: must match NNNN-kebab-slug (four-digit zero-padded prefix)`);
}

// Every report opens with the STE summary (D-0007): first H2 is "Summary (STE)".
export function checkReports(files: { path: string; text: string }[]): string[] {
  const errs: string[] = [];
  for (const f of files) {
    const m = f.text.match(/^##\s+(.+)$/m);
    if (!m || m[1].trim() !== "Summary (STE)")
      errs.push(`${f.path}: first H2 must be "## Summary (STE)"${m ? ` (found "${m[1].trim()}")` : ""}`);
  }
  return errs;
}

// Slim intake convention (D-0009): resolved files stay in place, so both
// statuses are valid; only a missing/invalid Status line is an error.
export function checkIntake(files: { name: string; content: string }[]): string[] {
  const errs: string[] = [];
  for (const f of files) {
    if (f.name === "_TEMPLATE.md") continue;
    if (!/^\*\*Status\*\*:\s*(open|resolved)\s*$/m.test(f.content))
      errs.push(`intake/${f.name}: missing or invalid **Status**: (open|resolved)`);
  }
  return errs;
}

function read(rel: string): string | null {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    if (statSync(p).isDirectory()) return "";
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listMarkdown(dirRel: string): { path: string; text: string }[] {
  const abs = join(ROOT, dirRel);
  if (!existsSync(abs)) return [];
  const out: { path: string; text: string }[] = [];
  for (const rel of readdirSync(abs, { recursive: true }) as string[]) {
    if (!rel.endsWith(".md")) continue;
    const p = join(dirRel, rel);
    if (statSync(join(ROOT, p)).isDirectory()) continue;
    out.push({ path: p, text: readFileSync(join(ROOT, p), "utf8") });
  }
  return out;
}

function main(): void {
  const decs = parseEntries(read("DECISIONS.md") ?? "", 3).filter((e) => /^D-\d+/.test(e.title));

  const tracksAbs = join(ROOT, "tracks");
  const trackDirs = existsSync(tracksAbs)
    ? readdirSync(tracksAbs).filter((n) => statSync(join(tracksAbs, n)).isDirectory())
    : [];

  const readme = read("README.md") ?? "";
  const linkedDocs = [
    { path: "README.md", text: readme },
    { path: "DECISIONS.md", text: read("DECISIONS.md") ?? "" },
    ...listMarkdown("facts"),
    ...listMarkdown("tracks"),
  ];
  const reports = listMarkdown("tracks").filter((f) => f.path.endsWith("report.md"));

  const intakeAbs = join(ROOT, "intake");
  const intakeFiles = existsSync(intakeAbs)
    ? readdirSync(intakeAbs)
        .filter((n) => n.endsWith(".md"))
        .map((n) => ({ name: n, content: readFileSync(join(intakeAbs, n), "utf8") }))
    : [];

  const errors = [
    ...checkIds(decs, "D", 4, (e) => e.title.match(/^(D-\d+)/)?.[1] ?? ""),
    ...checkLinks(linkedDocs, read),
    ...checkTrackDirs(trackDirs),
    ...checkIndex(parseIndexRows(readme), trackDirs),
    ...checkReports(reports),
    ...checkIntake(intakeFiles),
  ];

  if (errors.length) {
    console.error(`check-docs: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const intakeCount = intakeFiles.filter((f) => f.name !== "_TEMPLATE.md").length;
  console.log(
    `check-docs: ok — ${decs.length} decision(s), ${trackDirs.length} track dir(s), ` +
    `${reports.length} report(s), ${intakeCount} intake file(s).`,
  );
}

if (import.meta.main) main();
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test scripts/check-docs.test.ts`
Expected: PASS — all 12 tests.

- [ ] **Step 7: Run the validator against the real repo**

Run: `node scripts/check-docs.ts`
Expected: `check-docs: ok — 9 decision(s), 0 track dir(s), 0 report(s), 0 intake file(s).`
If it reports problems, fix the docs (or a genuine validator bug) before committing.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/LICENSE-offbook scripts/check-docs.ts scripts/check-docs.test.ts
git commit -m "feat: add doc-system validator adapted from offbook (Apache-2.0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Research plan — 0010-contract-pipeline

**Files:**
- Create: `tracks/0010-contract-pipeline/research-plan.md`

**Interfaces:**
- Consumes: `templates/research-plan.md` structure (Task 2).
- Produces: the key-question and candidate list Task 9's survey must cover.

- [ ] **Step 1: Write `tracks/0010-contract-pipeline/research-plan.md`** with exactly this content:

````markdown
# 0010-contract-pipeline — research plan

**Status**: draft

## Goal

Pick one pipeline from the vendored AsyncAPI/OpenAPI contracts to three artifact kinds:
TS types (replacing current generation if warranted), runtime validation schemas, and
object factories/mocks (replacing the kludgey ones). The runtime-validation output must
support live validation of every inbound message from any contracted interface (D-0006):
MQTT payloads (AsyncAPI) and REST response bodies including non-2xx reason-code bodies
(OpenAPI). Keystone track: its conclusions feed 0060 and 0070.

## Key questions

1. Can one generator cover both OpenAPI and AsyncAPI, or do we pair two?
2. Zod vs alternatives (valibot, ArkType, typia, Ajv on raw JSON Schema): bundle size,
   TS inference quality, and error-message quality when a partner breaks an interface.
3. Are factories generated from schemas or from types, and with which tool?
4. Contract drift: how do we detect in CI when a vendored contract update lands incompatibly?
5. Coverage guarantee: what mechanism (type-level design, lint rule, or codegen structure)
   makes bypassing validation hard to write, alongside the 0060 transport choke point?
6. Hot-path cost: what is the overhead of validating high-frequency MQTT traffic, and what
   are the mitigations (compiled validators like Ajv/typia vs interpreted like Zod;
   per-topic policies; validate-always vs sample-in-prod)? Compare candidates on
   validation throughput, not just DX.
7. Failure semantics: on live validation failure — reject, pass through flagged, or
   quarantine? How does the failure surface as a first-class "partner introduced a
   breaking interface" signal (wired into 0050-logging)?

## Candidates

- orval — https://github.com/orval-labs/orval — OpenAPI → client + zod + MSW mocks
- kubb — https://github.com/kubb-labs/kubb — plugin-based OpenAPI codegen (types/zod/faker)
- hey-api/openapi-ts — https://github.com/hey-api/openapi-ts — OpenAPI → TS + validator plugins
- openapi-zod-client — https://github.com/astahmer/openapi-zod-client — OpenAPI → zodios/zod
- typed-openapi — https://github.com/astahmer/typed-openapi — OpenAPI → typed client/schemas
- AsyncAPI Modelina — https://github.com/asyncapi/modelina — AsyncAPI/JSON Schema → models
- AsyncAPI Generator — https://github.com/asyncapi/generator — template-based AsyncAPI codegen
- json-schema-to-zod — https://github.com/StefanTerdell/json-schema-to-zod — JSON Schema → zod
- typia — https://github.com/samchon/typia — compile-time validators/random from TS types
- zod-fixture — https://github.com/timdeschryver/zod-fixture — fixtures from zod schemas
- @anatine/zod-mock — https://github.com/anatine/zod-plugins — mocks from zod schemas
- fishery — https://github.com/thoughtbot/fishery — typed object factories

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | high |
| Integration cost | medium |
| Runtime overhead | high |
| Output quality | high |
| Escape hatch | medium |

## Facts needed

- Contracts: OpenAPI/AsyncAPI versions, rough counts, current type-generation tool
- MQTT: rough peak message rate (for question 6)
- Stack: build tool, TypeScript version, browser targets
````

- [ ] **Step 2: Validate and commit**

```bash
node scripts/check-docs.ts   # expect: check-docs: ok — … 1 track dir(s) …
git add tracks/0010-contract-pipeline/research-plan.md
git commit -m "feat(0010): draft contract-pipeline research plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Research plan — 0020-complexity-metrics

**Files:**
- Create: `tracks/0020-complexity-metrics/research-plan.md`

**Interfaces:**
- Consumes: `templates/research-plan.md` structure (Task 2).
- Produces: the key-question and candidate list Task 10's survey must cover.

- [ ] **Step 1: Write `tracks/0020-complexity-metrics/research-plan.md`** with exactly this content:

````markdown
# 0020-complexity-metrics — research plan

**Status**: draft

## Goal

Pick tooling that reports both cyclomatic and cognitive complexity for the app's
TypeScript/React code and turns the numbers into refactor opportunities. One track for
both metrics because the same analyzers report both (D-0005). SonarQube Server is
excluded (D-0003); the OSS SonarJS ESLint rules are in scope. The lint stack is a
pragmatic mix (D-0002): oxlint stays, ESLint-in-CI or standalone CLIs are acceptable.

## Key questions

1. What complexity coverage does oxlint already ship, and at which rule maturity?
2. Where is the gap that requires ESLint-in-CI with eslint-plugin-sonarjs
   (`cognitive-complexity`) or a standalone analyzer?
3. Threshold-gating in CI vs trend reporting: which serves refactor planning better, and
   what generates a readable report (JSON, HTML, markdown)?
4. How do cyclomatic and cognitive scores diverge on real React/hooks-heavy code, and
   which metric should gate?

## Candidates

- oxlint built-in complexity-family rules — https://oxc.rs — baseline, already adopted
- ESLint core `complexity` rule — https://eslint.org/docs/latest/rules/complexity — cyclomatic
- eslint-plugin-sonarjs — https://github.com/SonarSource/SonarJS — cognitive-complexity rule
- fta-cli — https://github.com/sgb-io/fta — fast Rust TS analyzer, per-file scores
- lizard — https://github.com/terryyin/lizard — multi-language CCN CLI
- typhonjs-escomplex — https://github.com/typhonjs-node-escomplex/typhonjs-escomplex — JS complexity reports

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | n-a |
| Contract-format support | n-a |
| Integration cost | medium |
| Runtime overhead | n-a |
| Output quality | high |
| Escape hatch | low |

## Facts needed

- Stack: TypeScript version, CI provider, approximate app scale
````

- [ ] **Step 2: Validate and commit**

```bash
node scripts/check-docs.ts
git add tracks/0020-complexity-metrics/research-plan.md
git commit -m "feat(0020): draft complexity-metrics research plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Research plan — 0030-duplication-detection

**Files:**
- Create: `tracks/0030-duplication-detection/research-plan.md`

**Interfaces:**
- Consumes: `templates/research-plan.md` structure (Task 2).
- Produces: the key-question and candidate list Task 11's survey must cover.

- [ ] **Step 1: Write `tracks/0030-duplication-detection/research-plan.md`** with exactly this content:

````markdown
# 0030-duplication-detection — research plan

**Status**: draft

## Goal

Pick tooling that detects near-duplicate code and produces actionable reports for
deliberate de-duplication of poorly-thought-out reimplementations. Reporting quality
matters as much as detection: the output feeds review discussions and burn-down work.

## Key questions

1. Token-based vs AST/semantic similarity: which catches real reimplementations (renamed
   variables, reordered statements, copy-tweaked hooks) rather than only literal copies?
2. What thresholds (minimum tokens/lines, similarity percentage) avoid noise on a
   React/TypeScript codebase?
3. Can we ratchet — block new duplication in CI while burning down existing debt — and
   which tools support a stored baseline?
4. Which report formats serve the workflow: HTML dashboards, markdown summaries, PR
   comments, badges?

## Candidates

- jscpd — https://github.com/kucherenko/jscpd — token-based, many reporters, threshold + baseline options
- PMD CPD — https://pmd.github.io — copy-paste detector, TS support, XML/CSV reports
- similarity-ts — https://github.com/mizchi/similarity — Rust AST-similarity for TS
- custom ts-morph AST comparison — https://github.com/dsherret/ts-morph — assessed as the "build" option

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | n-a |
| Contract-format support | n-a |
| Integration cost | medium |
| Runtime overhead | n-a |
| Output quality | high |
| Escape hatch | low |

## Facts needed

- Stack: approximate app scale, CI provider
````

- [ ] **Step 2: Validate and commit**

```bash
node scripts/check-docs.ts
git add tracks/0030-duplication-detection/research-plan.md
git commit -m "feat(0030): draft duplication-detection research plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Research plan — 0040-hooks-linting

**Files:**
- Create: `tracks/0040-hooks-linting/research-plan.md`

**Interfaces:**
- Consumes: `templates/research-plan.md` structure (Task 2).
- Produces: the key-question and candidate list Task 12's survey must cover.

- [ ] **Step 1: Write `tracks/0040-hooks-linting/research-plan.md`** with exactly this content:

````markdown
# 0040-hooks-linting — research plan

**Status**: draft

## Goal

Establish React hooks anti-pattern lint coverage beyond the basics, under the pragmatic
lint mix (D-0002): map what oxlint's react rules already catch, and close the gap with
ESLint-in-CI plugins where coverage is materially better.

## Key questions

1. Gap analysis: which rules of eslint-plugin-react-hooks (including the
   React-Compiler-powered checks introduced in v6) does oxlint's react implementation
   mirror today, and which are missing or partial?
2. Which anti-patterns matter most for this app: effects-as-derived-state, stale
   closures, setState-in-render, unnecessary effects, missing/over-broad dependencies?
3. What does eslint-plugin-react-you-might-not-need-an-effect catch on real code, and
   what is its false-positive profile?
4. Does React Compiler adoption itself belong on the 0090 horizon scan, and what would
   it obsolete in this track?

## Candidates

- eslint-plugin-react-hooks (latest) — https://github.com/facebook/react — canonical rules + compiler-powered checks
- oxlint react / react-perf rule sets — https://oxc.rs — baseline, already adopted
- eslint-plugin-react-you-might-not-need-an-effect — https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect — unnecessary-effect detection
- eslint-plugin-react-perf — https://github.com/cvazac/eslint-plugin-react-perf — render-perf anti-patterns

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | n-a |
| Contract-format support | n-a |
| Integration cost | medium |
| Runtime overhead | n-a |
| Output quality | high |
| Escape hatch | low |

## Facts needed

- Stack: React version (compiler-powered rules need React 17+ semantics; note exact floor
  in the report), CI provider
````

- [ ] **Step 2: Validate and commit**

```bash
node scripts/check-docs.ts
git add tracks/0040-hooks-linting/research-plan.md
git commit -m "feat(0040): draft hooks-linting research plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Research plan — 0050-logging

**Files:**
- Create: `tracks/0050-logging/research-plan.md`

**Interfaces:**
- Consumes: `templates/research-plan.md` structure (Task 2).
- Produces: the key-question and candidate list Task 13's survey must cover.

- [ ] **Step 1: Write `tracks/0050-logging/research-plan.md`** with exactly this content:

````markdown
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
````

- [ ] **Step 2: Validate and commit**

```bash
node scripts/check-docs.ts
git add tracks/0050-logging/research-plan.md
git commit -m "feat(0050): draft logging research plan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: STOP — user gate.** Present the five research plans (Tasks 4–8) to the user for a lightweight skim per the spec's per-track flow. Surveys (Tasks 9–13) proceed only for approved plans; apply any requested edits first and re-run `node scripts/check-docs.ts` before continuing.

---

### Task 9: Survey + report — 0010-contract-pipeline

**Files:**
- Create: `tracks/0010-contract-pipeline/report.md`
- Modify: `README.md` (status cell of the `0010-contract-pipeline` row; `> **Frontier:**` line)
- Modify: `DECISIONS.md` (on acceptance only: append `D-0010` — or the next contiguous ID at execution time; keep IDs contiguous)

**Interfaces:**
- Consumes: `tracks/0010-contract-pipeline/research-plan.md` (Task 4) — every key question and candidate; `templates/report.md` (Task 2) — report skeleton; `facts/app-profile.md` — cite or declare assumptions (D-0004).
- Produces: an accepted recommendation that unblocks Wave 2 (0060, 0070 planning cites this report).

- [ ] **Step 1: Flip status to surveying.** In `README.md`, change the `0010-contract-pipeline` row's status cell to `surveying` and the frontier line to `> **Frontier:** Surveying 0010-contract-pipeline; Wave 2 blocked on its acceptance.` Run `node scripts/check-docs.ts`, then commit:

```bash
git add README.md
git commit -m "chore(0010): start survey

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Run the survey.** Web research (WebSearch/WebFetch; in an ultracode session, prefer a Workflow with one investigator per candidate, a cross-candidate synthesis pass, and a completeness critic). Requirements regardless of mechanism:
  - Answer every numbered key question in `tracks/0010-contract-pipeline/research-plan.md`, or defer it explicitly with a reason.
  - For each candidate: record the exact version evaluated, license, maintenance signals (latest release date, open-issue responsiveness, backing), and score all non-`n-a` rubric criteria strong/adequate/weak with one sentence of evidence and a source link.
  - Check each candidate's AsyncAPI 2.x/3.x and OpenAPI 3.0/3.1 support explicitly (contract-format criterion).
  - For question 6, find published benchmark data comparing validator throughput (e.g., Ajv/typia/Zod comparisons); cite it, do not run benchmarks (D-0001).
  - Cite `facts/app-profile.md` for every app-specific claim; if the profile is unfilled, write the assumption into the report and create `intake/2026-MM-DD-app-profile.md` (from `intake/_TEMPLATE.md`, status `open`) listing the facts the report had to assume.

- [ ] **Step 3: Draft `tracks/0010-contract-pipeline/report.md`** from `templates/report.md`: fill Survey, Rubric comparison, Recommendation (one of adopt / adopt + wrap / build / skip, with rationale, risks, cited D-#### constraints), What a spike would validate, and Sources (each with accessed date). Write the `## Summary (STE)` section last, following the template's embedded STE rules, and set the `**As of**` date.

- [ ] **Step 4: Validate, flip status, commit.** In `README.md`, set the row's status to `report drafted` and the frontier to `> **Frontier:** 0010 report awaiting user review.` Then:

```bash
node scripts/check-docs.ts   # must print check-docs: ok
git add tracks/0010-contract-pipeline/report.md README.md intake/
git commit -m "feat(0010): draft contract-pipeline survey report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: STOP — user reviews the report.** Apply requested changes and re-commit until accepted.

- [ ] **Step 6: Record acceptance.** Append the next contiguous `D-####` entry to `DECISIONS.md` recording the accepted recommendation (What: the adopt/wrap/build/skip call and tool; From: `tracks/0010-contract-pipeline/report.md`; Affects: 0010, 0060, 0070). Set the README row to `accepted` and the frontier to `> **Frontier:** Wave 1 surveys continue (0020 next); Wave 2 unblocked.` Run `node scripts/check-docs.ts`, then:

```bash
git add DECISIONS.md README.md
git commit -m "feat(0010): accept recommendation (D-00XX)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Survey + report — 0020-complexity-metrics

**Files:**
- Create: `tracks/0020-complexity-metrics/report.md`
- Modify: `README.md` (row status; frontier)
- Modify: `DECISIONS.md` (on acceptance: next contiguous `D-####`)

**Interfaces:**
- Consumes: `tracks/0020-complexity-metrics/research-plan.md` (Task 5); `templates/report.md`; `facts/app-profile.md`.
- Produces: accepted complexity-tooling recommendation.

- [ ] **Step 1: Flip status to surveying** in the `0020-complexity-metrics` README row, update the frontier line to name 0020, run `node scripts/check-docs.ts`, commit (`chore(0020): start survey` + trailer).

- [ ] **Step 2: Run the survey** to the same evidence standard as Task 9 Step 2: answer every key question in `tracks/0020-complexity-metrics/research-plan.md` or defer with a reason; per candidate record exact version, license, maintenance signals, and score all non-`n-a` rubric criteria with evidence + source links. Specifics for this track: enumerate oxlint's current complexity-related rules from its published rule list (question 1) before judging the gap (question 2); collect at least one concrete report-output sample or screenshot-equivalent description per candidate (question 3). Missing app facts → assumption in report + intake file as in Task 9.

- [ ] **Step 3: Draft `tracks/0020-complexity-metrics/report.md`** from `templates/report.md` — Survey, Rubric comparison, Recommendation with rationale/risks/cited constraints (D-0002, D-0003), What a spike would validate, Sources with accessed dates; `## Summary (STE)` written last per the template's rules.

- [ ] **Step 4: Validate, flip status to `report drafted`, update frontier, commit** (`feat(0020): draft complexity-metrics survey report` + trailer) after `node scripts/check-docs.ts` prints ok.

- [ ] **Step 5: STOP — user reviews the report.** Apply changes and re-commit until accepted.

- [ ] **Step 6: Record acceptance** — append the next contiguous `D-####` (From: `tracks/0020-complexity-metrics/report.md`; Affects: 0020), set the row to `accepted`, update the frontier, validate, commit (`feat(0020): accept recommendation (D-00XX)` + trailer).

---

### Task 11: Survey + report — 0030-duplication-detection

**Files:**
- Create: `tracks/0030-duplication-detection/report.md`
- Modify: `README.md` (row status; frontier)
- Modify: `DECISIONS.md` (on acceptance: next contiguous `D-####`)

**Interfaces:**
- Consumes: `tracks/0030-duplication-detection/research-plan.md` (Task 6); `templates/report.md`; `facts/app-profile.md`.
- Produces: accepted duplication-tooling recommendation.

- [ ] **Step 1: Flip status to surveying** in the `0030-duplication-detection` README row, update the frontier, run `node scripts/check-docs.ts`, commit (`chore(0030): start survey` + trailer).

- [ ] **Step 2: Run the survey** to the Task 9 Step 2 evidence standard against `tracks/0030-duplication-detection/research-plan.md`. Specifics for this track: for question 1, find documented or issue-tracker evidence of each tool's behavior on renamed-identifier clones (Type-2/Type-3 clone classes), not just marketing claims; for question 3, confirm baseline/ratchet support from docs or flags (e.g., jscpd thresholds and reporters), citing the exact option names. Missing app facts → assumption + intake file.

- [ ] **Step 3: Draft `tracks/0030-duplication-detection/report.md`** from `templates/report.md` — all sections, constraints cited (D-0003), `## Summary (STE)` last.

- [ ] **Step 4: Validate, flip status to `report drafted`, update frontier, commit** (`feat(0030): draft duplication-detection survey report` + trailer).

- [ ] **Step 5: STOP — user reviews the report.** Apply changes and re-commit until accepted.

- [ ] **Step 6: Record acceptance** — next contiguous `D-####` (From: `tracks/0030-duplication-detection/report.md`; Affects: 0030), row to `accepted`, frontier updated, validate, commit (`feat(0030): accept recommendation (D-00XX)` + trailer).

---

### Task 12: Survey + report — 0040-hooks-linting

**Files:**
- Create: `tracks/0040-hooks-linting/report.md`
- Modify: `README.md` (row status; frontier)
- Modify: `DECISIONS.md` (on acceptance: next contiguous `D-####`)

**Interfaces:**
- Consumes: `tracks/0040-hooks-linting/research-plan.md` (Task 7); `templates/report.md`; `facts/app-profile.md`.
- Produces: accepted hooks-linting recommendation; any React Compiler horizon-scan note feeds 0090.

- [ ] **Step 1: Flip status to surveying** in the `0040-hooks-linting` README row, update the frontier, run `node scripts/check-docs.ts`, commit (`chore(0040): start survey` + trailer).

- [ ] **Step 2: Run the survey** to the Task 9 Step 2 evidence standard against `tracks/0040-hooks-linting/research-plan.md`. Specifics for this track: build the question-1 gap analysis as an explicit rule-by-rule table (eslint-plugin-react-hooks rules vs oxlint's implemented react rules, from both projects' published rule lists, with per-rule status: mirrored / partial / missing); for question 3, check the plugin's issue tracker for false-positive reports and note recurring patterns. Missing app facts (React version especially) → assumption + intake file.

- [ ] **Step 3: Draft `tracks/0040-hooks-linting/report.md`** from `templates/report.md` — all sections, constraints cited (D-0002, D-0003), `## Summary (STE)` last. If question 4 concludes React Compiler belongs on the horizon scan, say so in the Recommendation and add it to the "What a spike would validate" or a one-line note for 0090.

- [ ] **Step 4: Validate, flip status to `report drafted`, update frontier, commit** (`feat(0040): draft hooks-linting survey report` + trailer).

- [ ] **Step 5: STOP — user reviews the report.** Apply changes and re-commit until accepted.

- [ ] **Step 6: Record acceptance** — next contiguous `D-####` (From: `tracks/0040-hooks-linting/report.md`; Affects: 0040), row to `accepted`, frontier updated, validate, commit (`feat(0040): accept recommendation (D-00XX)` + trailer).

---

### Task 13: Survey + report — 0050-logging

**Files:**
- Create: `tracks/0050-logging/report.md`
- Modify: `README.md` (row status; frontier)
- Modify: `DECISIONS.md` (on acceptance: next contiguous `D-####`)

**Interfaces:**
- Consumes: `tracks/0050-logging/research-plan.md` (Task 8); `templates/report.md`; `facts/app-profile.md`.
- Produces: accepted logging-facade recommendation; the facade surface sketch feeds 0010's failure-semantics wiring (D-0006).

- [ ] **Step 1: Flip status to surveying** in the `0050-logging` README row, update the frontier, run `node scripts/check-docs.ts`, commit (`chore(0050): start survey` + trailer).

- [ ] **Step 2: Run the survey** to the Task 9 Step 2 evidence standard against `tracks/0050-logging/research-plan.md`. Specifics for this track: for question 1, record each candidate's minified+gzipped browser bundle size from a published source (bundlephobia or the project's own docs), with the number and source in the report; for question 5, quote the exact API each candidate exposes for changing level/sinks at runtime; for question 4, sketch the facade surface (function signatures for logger factory, child loggers, setLevel, setSink, throttle rules) as a code block in the Recommendation — a design sketch is survey output, not a prototype (D-0001).

- [ ] **Step 3: Draft `tracks/0050-logging/report.md`** from `templates/report.md` — all sections, constraints cited (D-0001, D-0003), `## Summary (STE)` last.

- [ ] **Step 4: Validate, flip status to `report drafted`, update frontier, commit** (`feat(0050): draft logging survey report` + trailer).

- [ ] **Step 5: STOP — user reviews the report.** Apply changes and re-commit until accepted.

- [ ] **Step 6: Record acceptance** — next contiguous `D-####` (From: `tracks/0050-logging/report.md`; Affects: 0050, 0010), row to `accepted`, validate, commit (`feat(0050): accept recommendation (D-00XX)` + trailer). When all five Wave 1 tracks are accepted, set the frontier to `> **Frontier:** Wave 1 complete — next: draft Wave 2 research plans (0060, 0070) from 0010's accepted report.`

---

## Out of plan

Wave 2 (0060-transport-abstraction, 0070-state-concurrency) research plans and surveys: they must be drafted *from 0010's accepted report* per D-0005, so they get their own plan once 0010 is accepted. 0090-horizon-scan stays deferred until scheduled.
