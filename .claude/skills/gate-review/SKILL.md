---
name: gate-review
description: The review pass that runs at an acceptance gate — two lenses, falsification and machinery, over the artifacts being accepted. Read this when running a gate, not when authoring a track. It is a record of how the pass has actually run, not a new obligation.
---

# Gate review

A record of a pass this repo already runs, written down because it was being re-derived from
scratch each time and drifted between waves (seed-corpus category I). Ratified by **D-0033**;
its machinery lens is shaped by **D-0036**.

**This adds no per-track step.** It runs at **acceptance gates**, which are batched — four gate
events have covered nine acceptances. It does not run once per track. If deleting this file
would change what anyone does per track, the file has overstepped and should be cut back.

## The bound this document is under

D-0033 ships this **only** as a record of observed practice. It may not add a single item,
trigger, or lens that the observed runs did not have. That bound exists because the failure it
guards against already happened here: a vendored skill mandating three or more design variants
was reused with two, silently, because nobody checked the written version against the practice.

So the derivation is shown rather than asserted. Nine lettered checks have actually run:

- **Wave 2**, over two sibling reports: (a) both name the same ownership boundary for a shared
  dependency; (b) exactly one report claims ownership of a shared module and the other cites it;
  (c) one report's interface recommendation is the idiom the other's patterns consume; (d) no
  candidate is scored contradictorily across the two — same version, same licence, compatible
  maintenance verdicts; (e) both reports declare their D-0004 assumptions.
- **Wave 3**, over two spike findings: (a) the two findings' shared claims agree; (b) every
  in-scope report check has a row; (c) Deviations are complete and honest; (d) Decision-impact
  sections propose amendments, never assert them.

Wave 2's (a), (b) and (c) and Wave 3's (a) are four instances of one check. Merging them is the
only liberty taken here, and it removes items rather than adding them: **nine observed checks
become six written ones.**

## Lens 1 — falsification

Attack the claims in the artifacts under acceptance. Its warrant is measured: the Wave 1 sweep
falsified factual claims in three of five reports and changed the adopted set in three of five
tracks; the 2026-08-15 review of the 9900 draft returned six blockers against an artifact that
had already passed per-lane verification and a completeness critic.

1. **Seam ownership.** For every thing two artifacts share, exactly one owns it and the others
   cite it rather than restating it. Restatement is where siblings drift.
2. **No contradictory scoring.** A candidate appearing in two artifacts carries the same version,
   the same licence, and compatible maintenance verdicts.
3. **Assumptions declared.** Every artifact declares its D-0004 assumptions rather than burying
   them in prose.
4. **Coverage.** Every in-scope item has a row. Nothing is silently omitted; a dropped item is
   dropped visibly, with its reason.
5. **Deviations complete and honest.** What was not done, or was done differently, is stated.
6. **Propose, never assert.** An artifact may propose an amendment to an accepted decision. It
   may not assert one — that is the gate's call, not the artifact's.

## Lens 2 — machinery

Attack the validator, the templates, and the conventions themselves, not the artifacts. It exists
because retiring the wave close-out pass would otherwise lose coverage: that pass produced two
`check-docs.ts` fixes a claims-only review cannot generate.

Its shape is **coverage-forcing enumeration** (D-0036), which is Process FMEA's mechanism without
its apparatus:

- **Enumerate** the stages of the thing under review.
- **Ask what fails at each stage** — not what is wrong now, but what this stage lets through.
- **Rank a shortlist** by severity.
- **Preserve the runners-up verbatim**, with a one-line reason each. Do not discard them. This is
  also the repair for seed-corpus category J, where findings scoped out of a decision were lost.

**Do not score.** Severity/Occurrence/Detection ratings, the Action Priority lookup, and RPN are
refused under D-0036: Occurrence has no numeric base here and Detection rests on a single
measurement, so a computed priority would carry a table's authority on two ungrounded inputs.
One severity label on a shortlist is the supported level of precision.

## What the practice has shown about running it

Recorded because it was measured here, not because it is general wisdom.

- **Framing diversity beats reviewer count.** In the 2026-08-15 review, the five most consequential
  findings were each found by exactly *one* of five differently-framed lenses, while the finding
  that four lenses converged on was a grep-able off-by-one. Convergence tracked how cheap a defect
  was to detect, not how much it mattered.
- **Put findings to a refuter before they count.** That same review raised 48 findings and 7 were
  killed as false positives. A gate that cries wolf is worse than no gate.
- **Re-measure load-bearing numbers rather than accepting them.** Both the report under review and
  its reviewer produced citation counts that did not reproduce; the defect was an unstated counting
  rule, not a wrong figure. Print the rule beside the number.
- **Run the regex over the corpus and count hits before writing any check.** The dangling-`D-####`
  checker was refused on exactly this: 451 references, 27 IDs, zero dangling.
