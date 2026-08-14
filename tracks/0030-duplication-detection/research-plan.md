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

- jscpd — https://github.com/kucherenko/jscpd — token-based, many reporters, configurable thresholds
- PMD CPD — https://pmd.github.io — copy-paste detector, TS support, XML/CSV reports
- similarity-ts — https://github.com/mizchi/similarity — Rust AST-similarity for TS
- custom ts-morph AST comparison — https://github.com/dsherret/ts-morph — assessed as the "build" option

## Survey verification notes

- Verify jscpd's actual baseline/ratchet mechanism and exact option names; an earlier
  "baseline option" claim was flagged as unverified.

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
