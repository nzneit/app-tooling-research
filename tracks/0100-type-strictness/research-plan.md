# 0100-type-strictness — research plan

**Status**: draft

## Goal

Decide how to raise TypeScript strictness from the app's **very loose** baseline
(TS 5.9.3, facts/app-profile.md) and — the distinctive requirement — how to **enforce**
it in a codebase that receives a high volume of agent-authored code (D-0021). Agentic
churn changes the threat model for every enforcement mechanism: a global metric can be
gamed by polishing already-clean files, an escape hatch (`any`, `as`, `!`,
`@ts-ignore`, `eslint-disable`) is not just a human convenience but an attack surface a
code-generating agent will reach for under pressure, and review capacity is the scarce
resource the tooling must protect. The track starts from 0090's type-coverage area
(direct-adopt of type-coverage 2.30.1, allowlist-first branch selected by the resolved
strictness fact) and widens it to the full enforcement design. The user notes the
problem generalizes across domains; this track designs the type lever and reports on
how it composes with the program's existing ratchets (0030 duplication baseline, 0020
complexity gates) rather than redesigning those.

## Key questions

1. **Migration mechanics** — from very loose to strict on TS 5.9.3: what flag staging
   works (e.g. `noImplicitAny` → `strictNullChecks` → full `strict` → beyond-strict
   flags like `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`), and what
   carries the per-file allowlist: typescript-strict-plugin (last release 2024-06 —
   re-vet or reject), a hand-rolled `@ts-strict-ignore`-style convention with a
   shrinking-list CI check, or per-directory tsconfig layering?
2. **Gaming-resistant ratchet design** — which enforcement is diff-scoped
   (changed-files-must-be-strict, per-PR type-coverage delta) versus global-metric
   (`--at-least`/`--update-if-higher`), and which combination resists the known agent
   failure modes: raising a global percentage while dumping `any` elsewhere, and
   satisfying a gate by suppressing it?
3. **Suppression gates** — what bans or budgets new `@ts-ignore`/`as any`/non-null
   assertions/`eslint-disable` insertions at review speed: typescript-eslint's
   `ban-ts-comment` + `no-unsafe-*` family + `no-unsafe-type-assertion`,
   eslint-comments-style disable auditing, type-coverage's `--report-unused-ignore`?
   Where does each run under the D-0002 lane policy (oxlint-native or standalone
   first; ESLint-in-CI lane only where nothing else covers the surface, per the 0090
   lane-policy statement and D-0020 discipline)?
4. **Type-aware lint status** — as of the survey date, does oxlint's type-aware lane
   (tsgolint) cover any of the needed rules natively, or does the `no-unsafe-*` family
   stay ESLint-only?
5. **Boundary anchoring** — how do the contract-derived types (0010's zod schemas and
   `Validated<T>`, 0060's transport-boundary choke point) serve as strictness anchors,
   and what stops agent code from widening types at exactly those seams (cast bans
   scoped by path, dependency-cruiser rules already gating the imports, type-level
   patterns)?
6. **Reviewable output** — what produces per-PR, human-scannable enforcement output
   (deltas, annotated diffs, suppression inventories) so the humans supervising agent
   contributions see regressions without reading every line?
7. **Cross-domain composition** — how do this track's gates compose with the accepted
   0030 duplication ratchet and 0020 complexity gates into one coherent
   agent-resistant quality gate — and what, if anything, should be recommended as a
   unified mechanism rather than three parallel ones?
8. **Baseline** — what do `npx type-coverage --detail` (default and `--strict`) report
   against the real repo (0090's pre-scoped spike), and which migration order does the
   clustering select?

## Candidates

- type-coverage — https://github.com/plantain-00/type-coverage — percentage metric + ratchet flags (0090 input)
- typescript-strict-plugin — https://github.com/allegro/typescript-strict-plugin — per-file strict allowlist (stale; re-vet vs hand-roll)
- typescript-eslint — https://github.com/typescript-eslint/typescript-eslint — `strict-type-checked` preset, `no-unsafe-*` family, `ban-ts-comment`, `no-unsafe-type-assertion`
- tsgolint (oxlint type-aware) — https://github.com/oxc-project/tsgolint — type-aware rules in the fast lane (status to verify)
- @eslint-community/eslint-plugin-eslint-comments — https://github.com/eslint-community/eslint-plugin-eslint-comments — gate/audit disable-comment insertions
- @tsconfig/bases (strictest) — https://github.com/tsconfig/bases — staged tsconfig presets
- ts-reset — https://github.com/mattpocock/ts-reset — safer built-in types at the margins
- betterer — https://github.com/phenomnomnominal/betterer — generic ratchet (0090 verdict: mid-stall; carried as context, not a fresh candidate)
- tsc error-baselining tools (e.g. tsc-baseline) — survey to verify what is alive and credible

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").
Track-specific note: **Escape hatch cuts both ways here** — every mechanism's escape
hatch is also the surface an agent games. Scores must weigh *auditable* escape
(inventoried, budgeted, reviewable) against *silent* escape (a comment that just turns
the rule off), not merely whether an escape exists.

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | n-a (dev-time tooling) |
| Contract-format support | n-a (boundary anchoring cites 0010/0060, not contract parsing) |
| Integration cost | high |
| Runtime overhead | n-a |
| Output quality | high (per-PR reviewability is the point — see Key question 6) |
| Escape hatch | medium (scored per the track-specific note above) |

## Facts needed

- Build tool + monorepo-or-single-package layout (intake 2026-08-14-0090-app-facts
  item a, still open — decides tsconfig layering and per-workspace config shape)
- CI provider (where gates run; output-format choices)
- Baseline `type-coverage --detail` numbers, default and `--strict` (app-repo spike,
  pre-scoped in the 0090 report)
- How agent contributions land: PR size/velocity, review process, and whether agents
  run the linters locally before pushing (shapes diff-scoped vs global gate choice)
