# 9900-process-design — research plan

**Status**: draft

## Goal

Decide how to improve this repo's own research machinery — `templates/`, `scripts/`, and
the conventions governing them — so future tracks are cheaper to run and likelier to be
right. The track opens from a finding that is already established rather than hypothesised
(see [seed-defect-corpus.md](seed-defect-corpus.md)): **`check-docs.ts` enforces document
shape, every real defect in this repo's history lived in semantic content, and no observed
`fix` commit corrected anything the validator could have caught.** The validator is not
failing; it is succeeding at a job the defects do not live in. So the track's real question
is what a zero-dependency validator and a set of templates can credibly do about semantic
and cross-document correctness, and what must instead be handled by a named process step or
accepted as residual risk.

The second question is harder and matters more, because it is where meta-work usually goes
wrong. Four independent research strands seeded this track and **every one of them proposed
adding steps; none proposed removing any**. Stacked naively they would add on the order of
five to eight mandatory authoring and review steps per track, against a defect record of a
handful of corrections across fourteen tracks. A recommendation that ignores this is not an
improvement, it is ceremony. This track therefore treats **net process cost as a
first-class output**: every proposed control is priced, and the recommendation must state
the net change in per-track steps — including what it retires, merges, or time-boxes to
offset what it adds. A recommendation of "change less than we could" is a legitimate
outcome, as is "skip".

Scope is the machinery (D-0025). The track may not redesign the track lifecycle, the wave
structure, or the shared rubric; those are a separate and larger track.

## Key questions

1. **Shape versus semantics** — what can a zero-dependency validator credibly check about
   semantic content, and what can it never check? Concretely: prose cross-references
   (`A-1`, `I-5`, "invariant 3") that drift when numbering moves; citations pointing into
   git-ignored trees; a `D-####` entry that contradicts the report it cites. Which of these
   are mechanically decidable, and which only look decidable?
2. **Net process cost** — the target is set: **net steps hold** (intake item b, 2026-08-14).
   Additions are allowed only where offset, and an exception needs a compelling *and
   reviewed* justification — reviewed meaning someone other than the proposer agrees, not
   merely a confident rationale. So what does each proposed control cost per track, and what
   must be retired, merged, or time-boxed to pay for it? This question has veto power over
   the others: a control that cannot be priced does not ship, and a control with no offset
   named does not ship either. One sub-question the ruling left open and the survey should
   resurface with concrete examples rather than guess: **which cost actually matters** —
   wall-clock, human review time, or agent token spend. They trade against each other, and a
   check that runs in milliseconds while producing findings a human must adjudicate is cheap
   in one and expensive in another.
3. **Detector trust and false positives** — for each proposed check, what is its
   false-positive profile, and what happens when it cries wolf? A noisy validator gets
   disabled or routinely overridden, which is worse than no validator — and in a repo where
   agents run the checks, a noisy check is a suppression invitation. How is this assessed
   before adoption rather than after? The corpus already contains a live instance
   (category B-bis): the existing link check fired on markdown syntax quoted inside inline
   backticks, because `stripFenced` handles fenced blocks but not inline code — the check
   was wrong and the document was right. The same check is simultaneously too blind to
   prose citations and external URLs, which is the shape of the whole problem in miniature.
4. **Proving it worked** — how would the repo know a recommendation helped? A baseline
   exists in the corpus (corrections per track, gap-sweep findings per track, defects caught
   at gate versus after acceptance). What is the measurement plan over the next N tracks,
   and what result would falsify a control's value?
5. **Adversarial review as a named step** — three strands converged here independently, on
   the same evidence: the Wave 1 gap sweep falsified factual claims in three of five
   reports. Should adversarial review be templatized as a named step with defined scope,
   and at which lifecycle stages (plan, report, findings) — or does its value come precisely
   from being unscripted? What does it cost, and what does it displace?
6. **Citation integrity** — reports are citation-dense by design (D-0007), and
   `checkLinks` skips every external URL (verified: scripts/check-docs.ts:116). This splits
   into a cheap solved problem (does the link resolve) and a research-grade one (does the
   page support the claim). Which half is worth solving, and does solving the cheap half
   create a false sense of the hard half being covered?
7. **The silent-config footgun class** — the corpus's strongest recurring category, twice
   independently confirmed, and invisible to survey-phase research by construction because
   D-0001 forbids running real tools before a spike. D-0020 already invented the control
   (a ratified rule paired with a drift test asserting it). Should that become a named,
   reusable convention plus a registry future tracks consult and append to — and is a
   registry a living document or an abandoned one after two entries?
8. **Cross-document consistency** — sibling-report drift was caught only by a manual
   whole-branch pass at a wave gate, because per-track critics reason only within their own
   track. Is a cross-track consistency step worth naming, or is the wave gate already the
   right and sufficient place for it?
9. **STE enforcement** — the spec claims the summary rule is validator-enforceable, but only
   the heading's presence is checked. Sentence length and voice are mechanically checkable;
   "one word for one meaning" largely is not, and the ASD-STE100 dictionary is not clearly
   redistributable. Is partial mechanical enforcement worth it, or does it produce the worst
   outcome — a check that passes while the prose still is not STE?
10. **Retroactivity** — do new templates and rules apply to the fourteen existing tracks, to
    new tracks only, or through a one-time backfill? And what governs the scope of future
    template changes, so this question is answered once rather than per change?
11. **Dogfooding** — should this track's own plan and report be the first artifacts held to
    its recommendations, and does that pilot happen before or after the recommendation is
    accepted?

## Candidates

Candidates divide into **methods** (scored on License and Integration cost only — the
others are n-a for a technique) and **tools** (full rubric). The report must keep the two
classes visibly separate rather than scoring them on one table.

**Methods:**

- Process FMEA (AIAG-VDA) — https://www.aiag.org/quality/fmea — function → failure mode → effect → cause → controls; note its Action Priority tables replaced the criticised RPN. Seeded from the corpus, not invented
- Poka-yoke / mistake-proofing — prevent-versus-detect framing, which maps directly onto what the validator is and is not
- Checklist practice (Gawande) — read-do versus do-confirm, item-count discipline, killer items
- Pre-mortem (Klein) — applied to a plan before its survey runs
- Blameless postmortem and defect taxonomy (SRE practice) — the corpus is already a rough instance of this
- **Do nothing structural** — keep the machinery as-is and rely on the passes that already exist. The corpus shows categories D and E were caught by existing passes; the recommendation must beat this baseline explicitly

**Tools:**

- Extend `scripts/check-docs.ts` in-house — the incumbent and the build option; zero new dependency, and every corpus-derived check proposed so far is expressible here
- Vale — https://vale.sh — prose linter with metric and consistency rule types; no OSS ASD-STE100 style package exists, so any adoption is adopt-and-wrap around a hand-written style
- lychee — https://github.com/lycheeverse/lychee — external link checker, the cheap half of question 6
- markdownlint / textlint / remark-lint — https://github.com/DavidAnson/markdownlint — markdown and AST-level checks
- MADR and ADR tooling (adr-tools, log4brains) — https://adr.github.io — decision-record conventions, including supersession and status lifecycles the ledger currently handles by prose
- Scaffolding tools (plop, degit, cookiecutter) versus the hand-rolled `new-spike.ts`

**Gating constraint on every tool candidate — resolved, and it changes the question.**
D-0027 rules that the dependency envelope is a **four-rung ladder, strict by default**:
rung 0 an in-house `check-docs.ts` extension on Node's standard library; rung 1 an npm
dependency, for things that do not make sense to roll ourselves; rung 2 a binary in CI but
not pre-commit, where we truly cannot live without the tooling; rung 3 a binary every
contributor installs, only where in-house replication is impractical *and* rung 2's CI cost
would be too great. Climbing a rung requires justification.

So no tool is eliminated on constraint, and none is admitted by default. The survey question
for each tool candidate becomes: **can this be replicated in-house at acceptable fidelity,
and if not, which is the lowest rung that works?** Two predictions the survey should test
rather than assume: external link checking looks like a strong rung-0 candidate, since
Node's built-in `fetch` makes a link-resolution check a small addition to the existing
validator, which would retire lychee on merit; and Vale is the case the ladder was written
for, since sentence length and voice are mechanically checkable in-house while "one word for
one meaning" plausibly is not, and the ASD-STE100 dictionary's redistributability is itself
unsettled.

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").
Methods are scored on License and Integration cost only; the remaining criteria are n-a for
a technique, and the report says so rather than inventing scores.

| Criterion | Weight |
|---|---|
| License | medium — gates tool candidates (and the ASD-STE100 dictionary's redistributability is a live question), but is not a discriminator among methods |
| Maintenance health | high — for tools only; an unmaintained checker in a pre-commit path is a silent failure |
| TypeScript fit | low — the validator is TypeScript, but most candidates are language-agnostic binaries or conventions |
| Browser compatibility | n-a — nothing here ships anywhere |
| Contract-format support | n-a — no contract surface in this track |
| Integration cost | high — the dependency-envelope constraint and the per-track authoring burden both land here; this is the crux |
| Runtime overhead | low — pre-commit and CI wall-clock only, but it is scored, because every check runs on every commit and the repo has no affected-file selection |
| Output quality | high — precision and the false-positive profile decide whether a check is trusted or disabled (Key question 3) |
| Escape hatch | medium — spec meaning, the cost of removing a control later: a validator check is a code revert, while a template change propagates into every document authored under it |

## Facts needed

This track studies the repo itself, so it depends on no `facts/app-profile.md` fields. Its
inputs are internal, and the two rulings it needed are now in hand
([intake 2026-08-14-9900-process-scope](../../intake/2026-08-14-9900-process-scope.md),
resolved 2026-08-14):

- **Resolved** — the dependency envelope is a four-rung ladder, strict by default (D-0027)
- **Resolved** — the budget is **net steps hold**, exceptions need a reviewed justification
- **Still open, non-blocking** — which cost unit the budget is really denominated in
  (wall-clock, human review time, or agent tokens); the survey resurfaces this with examples
- **Still open** — whether CI exists for this repo today, or whether `check-docs.ts` runs
  only pre-commit. This now matters more than it did: D-0027's rungs 2 and 3 differ precisely
  on where a tool runs, so a repo with no CI collapses the ladder to rungs 0, 1, and 3
- The seed corpus in [seed-defect-corpus.md](seed-defect-corpus.md), already gathered
