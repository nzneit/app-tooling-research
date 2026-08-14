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
- @eslint-react — https://github.com/Rel1cx/eslint-react — modern React lint plugin family covering hooks/effects anti-patterns
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

- Stack: React version (verify the actual version requirements for compiler-powered rules during the survey; do not assume a floor), CI provider
