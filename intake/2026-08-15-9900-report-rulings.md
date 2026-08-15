# 2026-08-15: 9900 report rulings (intake)

**Status**: open
**Owner**: user (repo owner — these are rulings about this repo and its ceiling, not app facts)

Track 9900's survey is complete and its report is drafted
([report.md](../tracks/9900-process-design/report.md)). Seven items need the repo owner before
that report can be accepted. Three are rulings the report's own arithmetic depends on. Two are
**flagged cuts** — controls the cost gate cut, which the ceiling rule says may only be excepted
with a *reviewed* justification, and the gate is the proposer so it may not grant its own
exception. One is a definitional call, and one (`g`) is an in-scope question the report was assigned and did
not answer, found by the adversarial review of the draft.

Nothing here blocks the four items the report ships; those are free under every reading below.

## a — what counts as a "step" under net steps hold?

The ceiling ruling (intake 2026-08-14 item b) set **net steps hold** but never defined *step*.
The report assumed a step is a **mandatory per-track authoring or review action** (its assumption
A-1), which makes a validator check and a line of always-loaded prose ceiling-**free**, since
neither is an action an author takes — while both still cost agent tokens and human attention.

Under a broader reading — anything an author or agent must **do or read** — the four shipped
items stay free, but the arithmetic for roughly eight cut controls changes, and every future
proposal to add a line to `CLAUDE.md` becomes ceiling-governed rather than merely priced.

The narrow reading is what makes the ceiling cheap to apply, and it is the one the report used.
The broad reading is more honest about where cost actually lands: the report measured that the
survey's always-loaded proposals would have grown `CLAUDE.md` by 109-180%, paid on every session
of every track by every subagent, forever — while every one of those bytes was individually
ceiling-compliant, because none of them is a step.

Recommendation: **the narrow reading, plus a standing rule that always-loaded bytes are priced
and reported even though they are not steps.** That keeps the ceiling mechanical without letting
the largest recurring cost in the program pass unexamined.

→ Resolution: the ruling → allocates a `D-####` defining the ceiling's unit, and either
confirms or re-opens the report's step arithmetic
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## b — does a cancelled proposal count as payment?

Nine of the survey's 43 proposed controls paid their offset in a class the ceiling rule has no
vocabulary for: **cancelled proposal** (paying by not building something that was never built),
**future rate-limit** (a promise to constrain later additions), and **tooling offset** (retiring
a candidate that was never adopted). One lane asked for this ruling explicitly; none answered it.

The report's recommendation is to **not** admit cancelled proposals, on the grounds that it is
unfalsifiable — any control can name a hypothetical it forecloses, so admitting the class makes
the ceiling unenforceable. The related observation is that three separate controls each claimed
to be the budget authority for the others, which cannot all be true.

Note this is not purely academic: the survey's only proposal claiming a *negative* step delta was
refuted in verification, which cascaded four further proposals from offset-bearing to unfunded.
Payment classes are doing real work in this ceiling.

→ Resolution: the ruling → allocates a `D-####` naming which payment classes the ceiling accepts
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## c — the membership rule for `DECISIONS.md`'s "Constraints in force" header

The header lists D-0001 through D-0007 and D-0011, and has not been edited since the initial
commit, while D-0012 through D-0027 have been added. Verification reframed this usefully: at that
same initial commit it **already** omitted D-0008 and D-0009. So nothing in it became false over
time — an enumeration presented as complete was always partial.

That makes this a missing membership rule rather than staleness. Candidate rules: (i) every
standing constraint that binds future work, which would add D-0008, D-0009, D-0020, D-0025 and
D-0027 today; (ii) only program-wide constraints, excluding track-scoped ones; (iii) drop the
header's implication of completeness and label it a reading order rather than an enumeration.

Once the rule is stated the fix is a one-line edit, not a mechanism. The report explicitly
declined to build a checker for this.

→ Resolution: the rule → a one-line edit to the header, recorded in the 9900 acceptance decision
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## d — reviewed exception? Making the gate review mandatory (flagged cut)

**This is the control with the best evidence in the entire survey, and the report cut it.** The
Wave 1 gap sweep falsified factual claims in three of five reports and changed the adopted set in
three of five tracks. The escape that justifies putting it to a reviewer is **0090**: it reached
a gate with no review pass, and the user personally caught a candidate-breadth defect that became
D-0022 and minted four tracks.

Against it: +1 to +3 mandatory steps per track; the only offset available has been paid once (the
whole-branch review has exactly one recorded occurrence in the repo's history) and cannot fund a
recurring control; and its cost lands on **human review time, which this repo has zero
observations of at any gate**. The honest counter also belongs on the record — the external
result supporting "naming the lens helps" was measured on humans reading code, not agents
reading prose.

The ceiling rule says an exception needs a compelling **and reviewed** justification, where
reviewed means someone other than the proposer agrees. The cost gate is the proposer here, so it
flagged rather than granted. This item is that review.

If it is granted, the cheapest honest shape is to name the pass and its triggers without
mandating a per-track instance — the pass runs at gates, and gates are batched at roughly two to
three remaining events, not five.

→ Resolution: grant or refuse the exception → recorded in the 9900 acceptance decision; if
granted, the control ships with its trigger and its offset named
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## e — reviewed exception? The immutable-ref citation rule (flagged cut)

The only control in the survey whose value **outlives the program**. Measured 2026-08-15 across
the eight accepted reports: **1,903 citation occurrences (1,219 unique)**, of which **882 are
GitHub-family** (`github.com` 674 plus `raw.githubusercontent.com` 208) and only **18 occurrences
(11 unique) are pinned to a tag — none to a SHA**. That is roughly **2% pinned**. Those citations
are the entire evidentiary basis of the accepted reports, and they keep decaying after 0140
closes.

(Counting rule, stated because the first version of these figures was not reproducible: all
`http(s)` URLs in `tracks/*/report.md` excluding 9900, trailing punctuation stripped; pinned means
`refs/tags/`, `releases/tag/`, `/tree|blob/vN.N`, or a 40-hex SHA. The draft's original
sub-counts — 252 mutable / 94 `/latest` / 8 pinned — were produced by an unstated rule, and the
adversarial review of the report caught it. The direction is unchanged and the case is slightly
stronger.)

It was cut because it names no offset and its retroactivity is unpriced — not because it is
wrong. Cheap per instance, expensive in aggregate.

If granted, the report names the cheap shape: regex-only, no network, **warn** level, scoped to
`github.com` and `raw.githubusercontent.com` where every hit has a mechanical fix, and run
diff-scoped over newly added lines so it does not fire on the ~864 unpinned GitHub-family
citations already in the corpus on the day it lands.

Worth pairing with the decision: the report pre-scoped a **cheap decisive experiment** that would
settle whether this matters — take ten citations pinned to mutable refs, fetch the current
content, and count how many still support the sentence citing them. It needs no tooling. If the
number is high the concern is theoretical and this item should be refused; if it is low the rule
is urgent. Running that first is a legitimate answer to this item.

→ Resolution: grant, refuse, or defer behind the n=10 experiment → recorded in the 9900
acceptance decision
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## f — "gap sweep" versus "gap scan": which is which?

The two terms appear 38 and 18 times respectively across the corpus, denote two genuinely
different things, and neither is defined anywhere. The report's position is that one sentence
fixes this and that a blocking preferred-term check would have been actively harmful, since it
would have pushed authors toward collapsing two real concepts into one word.

From observed usage the distinction appears to be: a **gap sweep** is the cross-cutting
adversarial pass over a wave's finished reports that hunts for falsified claims, while a **gap
scan** is the within-track completeness check asking which candidates a survey never considered.
That reading is inferred from use, not stated anywhere, so it needs the owner's confirmation
rather than an agent's guess.

→ Resolution: confirm or correct the two definitions → one sentence added wherever the
acceptance decision places it
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.

## g — should this repo have CI?

**Added 2026-08-15 by the adversarial review of the drafted report, which found this question had
lapsed.** The 9900 research plan assigns it to the track in so many words — "the track should
therefore answer, rather than assume: **should this repo have CI?**" — and calls it squarely in
scope, because it decides what D-0027's dependency ladder can actually offer. The report did not
answer it; worse, it treated the question as an open unknown and spent that openness as one of
two reasons settling the skip for the entire external-tool class. The skip stands on its other
reasons, but the question does not get to disappear.

The enabling facts are already resolved and are not in dispute: this repo is **public**, so
GitHub Actions costs nothing here; there is no `.github/` directory today, so `check-docs.ts`
runs pre-commit only and nothing enforces it (no hooks installed, `core.hooksPath` unset, no
`package.json` scripts). The blocker is **setup effort, not cost or infrastructure**.

What turns on it: D-0027's **rung 2** — "a binary in CI but never pre-commit" — is unavailable
today and free to make available. Without CI, the ladder is effectively three rungs and any tool
that is too slow for pre-commit is dead on arrival. With CI, rung 2 becomes real, and the report's
own wall-clock objection to external link checking ("catastrophic pre-commit, irrelevant in a CI
that does not exist") changes shape.

Note the interaction with the ceiling, since it is not a free win: CI moves cost from contributor
wall-clock to pipeline time, which is a reallocation across the three cost units the budget ruling
says all matter — not an elimination. It also adds a place where a check can be silently disabled.

Three shapes: (i) **no CI** — keep the pre-commit-only posture, and rung 2 stays notional;
(ii) **CI running the existing gate only** (`check-docs.ts` plus the tests), which makes the
checks actually enforced rather than merely available, and is the smallest version;
(iii) **CI as a venue for tools too slow for pre-commit**, which is what would revive the
external-link and prose-linting candidates.

Recommendation: **(ii)**. It is the version whose value does not depend on adopting any tool the
report just skipped, and it closes a real gap — the repo's own gate is currently unenforced.

→ Resolution: the ruling → allocates a `D-####` on this repo's CI posture, and settles whether
D-0027's rung 2 is a real option for future tracks
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `. If an earlier paragraph is now wrong — it said something stayed
open that has since been answered — mark it superseded in place rather than leaving it to
contradict the new one, the way `DECISIONS.md` handles a superseded entry.
