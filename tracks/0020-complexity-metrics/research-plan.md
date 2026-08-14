# 0020-complexity-metrics — research plan

**Status**: draft

## Goal

Pick tooling that reports both cyclomatic and cognitive complexity for the app's
TypeScript/React code and turns the numbers into refactor opportunities. One track for
both metrics because the same analyzers report both (D-0005). SonarQube Server is
excluded (D-0003); the OSS SonarJS ESLint rules are in scope (refined by D-0011: post-v2.0.4
releases are SSALv1, excluded). The lint stack is a
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

## Survey verification notes

- Verify typhonjs-escomplex's maintenance status (flagged, unverified: no releases since
  2018) before scoring; a dead tool scores accordingly on maintenance health.

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
