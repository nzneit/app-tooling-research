# Working in this repo

This is a **research repo**, not an application repo. It runs structured tracks that survey
OSS tooling for a separate TypeScript React application. **That application is not accessible
from here** (D-0004) — app facts come from the user and live in `facts/app-profile.md`; where
a fact is missing, a report declares the assumption it made in its place.

Start by reading `README.md` — its track table and one-line **Frontier** pointer say where the
program stands and what is next. `DECISIONS.md` is the authority for anything already decided.

## Before every commit

```
node scripts/check-docs.ts
node --test scripts/*.test.ts
```

Both must pass. Note the glob in the test command — `node --test scripts/` (directory form)
fails on Node 24.x.

## Non-negotiables

- **Never add AI attribution to a commit.** No `Co-Authored-By` trailer naming an AI, no
  "Generated with" line. This applies to your commits and to any brief you give a subagent.
- **Never edit vendored files.** `.claude/skills/codebase-design/` is vendored byte-verbatim
  under D-0017 with an MIT attribution that depends on it staying verbatim. Extend by writing a
  sibling, never by patching.
- **Decisions are append-only.** `D-####` entries in `DECISIONS.md` are contiguous from D-0001
  and never deleted or renumbered; a superseded decision is marked superseded in place. The
  validator enforces contiguity.
- **Commits stay local.** The user owns pushes to the remote.
- **Questions only the user can answer go to `intake/`**, as a dated file — not into a report
  as a silent assumption, and not left in conversation.

## Conventions worth invoking

- [design-panel](.claude/skills/design-panel/SKILL.md) — grounded design panels: parallel
  variants under opposing constraints, judged against a stated default. Use when choosing a
  shape that is expensive to change later.
- [codebase-design](.claude/skills/codebase-design/SKILL.md) — vendored deep-module vocabulary
  and the canonical design-it-twice pattern for **code interfaces**. Authoritative for those.

Track 9900-process-design owns improvements to this machinery. Several practices this program
relies on — adversarial review, the survey completeness critic, the candidate gap sweep — are
still undocumented and get re-derived from context each time; that is known debt, recorded in
`tracks/9900-process-design/seed-defect-corpus.md`.
