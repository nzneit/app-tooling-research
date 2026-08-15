# 9900 — seed defect corpus

**Gathered**: 2026-08-14, by mining this repo's own record — the full git history, all 25
`DECISIONS.md` entries, both spikes' `findings.md` deviation lists, and the post-draft
correction annotations inside accepted reports.

This is the track's **evidence base**, not its conclusion. It exists because a process
FMEA seeded from invented failure modes is fiction, while one seeded from failures that
actually happened here is analysis. The survey's job is to decide which of these are
worth building a control for; this document's job is only to say what went wrong, how it
was caught, and whether something cheaper could have caught it sooner.

**Headline finding.** Across roughly 40 commits and 25 decisions, **every `fix(...)`
commit corrected something `scripts/check-docs.ts` structurally cannot see** — semantic
content, cross-document consistency, or the behaviour of a tool's configuration. **None**
corrected a violation of a shape invariant the validator already checks. The validator is
not failing at its job; it is succeeding at a job the repo's real defects do not live in.

## What the validator already prevents — do not re-solve

Decision-ID uniqueness and contiguity, relative-link and anchor resolution, README
index-row presence and status vocabulary, the frontier line, the report summary-first
rule, and intake/spike `Status` conformance. Zero observed defects in these categories.

## A. Silent-default and silent-merge footguns in declarative tool config

The strongest category: **twice independently confirmed**, and invisible to desk research
by construction.

| Instance | Where | How caught |
|---|---|---|
| oxlint `overrides` **replace** rather than merge base rule options, silently deleting an import ban in exactly the directory that needed it | D-0020 | Both Wave 3 spikes, independently, on the same oxlint version |
| gitignore-style `*` does not cross `/`, so `@appname/transport/*` misses `@appname/transport/ws/backoff` | 0090 report | Adversarial verification during the alias-fact analysis; self-labelled as the same class as D-0020 |
| orval's generated zod schemas strip unknown fields by default, reshaping what "validated" means | 0060 spike findings | Spike implementation; ratified only at the D-0018 gate |

**Preventable earlier?** Not by the validator, and not by survey-phase desk research —
D-0001 forbids running real tools before a spike, which is precisely why these surfaced
late. The available control is a *convention*: D-0020 already invented the pattern (a
ratified rule paired with a drift test that asserts it), but only as prose in one
decision, not as a reusable step.

## B. Numbered cross-references drift, and prose citations are unchecked

Both spikes' design panels produced numbered invariant and interface lists that turned
out incomplete or self-contradictory once implementation began, forcing cascading
renumbers (I2→I13 in one; invariant 3→11 in the other). Separately, an intake file's
citations to report assumptions (`0060's A-1`, `0070's A-4/A-5`) went stale as the
reports' own numbering moved.

**Verified mechanism**: `checkLinks` (scripts/check-docs.ts:114–116) matches only markdown
link syntax — a bracketed label followed by a parenthesised target — and skips any target
carrying a URI scheme. Prose-form cross-references — `A-1`, `I-5`, "invariant 3" — are
invisible to it, as are all external URLs. This is a genuine blind spot, and cheap to
narrow.

## B-bis. A live false positive, found while writing this document

Worth recording because it arrived unprompted and is evidence for a question the track
already asks. The first draft of this file quoted markdown link syntax literally inside
inline backticks, to describe the mechanism above. `check-docs.ts` rejected the commit:
`stripFenced` removes fenced code blocks but **not** inline backticks, so the quoted
example was parsed as a real link to a file named `target`, which does not exist.

The check was wrong and the document was right. This is a working instance of the
detector-trust problem — a check firing on legitimate content — and it appeared within
minutes of a document being written *about* that risk. It is also cheap to fix (strip
inline code spans as well as fenced blocks), which makes it a good first test of whether
the track's proposed controls are as cheap as they look. Note the asymmetry it reveals:
the validator's link check is simultaneously **too eager** on inline code and **too blind**
to prose citations and external URLs.

## C. Cross-document consistency drift, caught only at a wave gate

One report called a decision "unadjudicated" that the sibling report had already
adjudicated; a shared rationale paragraph was duplicated across two reports with drifted
claims. Caught by a manual whole-branch review at the gate — not by the per-track
completeness critic, which reasons only within its own track.

## D. Survey completeness bias — one candidate per capability area

The Wave 1 gap sweep, a dedicated post-hoc pass, **falsified factual claims in three of
five reports**: 0020's "cognitive complexity lost entirely on license fail", 0030's "no
candidate has a stored baseline", and two "not lintable" claims in 0040. Real, maintained
tools existed that the original per-candidate investigators plus completeness critic never
surfaced — because that critic checks for unanswered questions and unverified
assumptions, not for whether the search was wide enough.

This is the repo's single best piece of evidence for the value of an adversarial second
pass, and it is **live, in-repo evidence rather than a claim from the literature**. It is
also partially self-correcting already: Wave 2 folded gap-scanning in as a standing agent,
and D-0022 converted single-candidate sweep proposals into full multi-candidate tracks.

## E. Evidentiary precision slips, caught at ratification

Stale test counts carried into a report (58 against an actual 60); a benchmark quoted
without its decisive caveat (measured under parallel worker contention, roughly five times
faster in isolation); a compile-proof whose scope was overstated. All caught by adversarial
review immediately before the D-0018 acceptance — late, but caught.

## F. Durable documents citing ephemeral paths

Report `Sources` sections cited files under `.superpowers/sdd/`, a tree that is entirely
git-ignored. Because they were prose paths rather than markdown links, `checkLinks` could
not have seen them even if the tree had been tracked.

## G. Transcription error into the append-only ledger

D-0013 originally misstated a candidate as adopted when its report said otherwise; the
entry carries its own correction note. One instance, but structurally unguarded: no check
cross-validates a `D-####` entry against the report it cites, and the append-only
convention makes such errors permanent-with-annotation.

## H. The intake template has no answer affordance

Found 2026-08-14 the only way this class of defect is ever found — a human tried to use the
template as written and asked where they were supposed to answer. `intake/_TEMPLATE.md`
gives each item a `→ Resolution:` line, but that line documents the *consequence* of
resolving ("updates facts/app-profile.md and/or allocates D-####"), not a place to put an
answer. There is no answer field, so in practice every intake item so far has been answered
in conversation and back-filled by an agent as a dated update block — a convention that
exists nowhere in the template and that a reader of the file alone could not infer.

This is worth more than its size. It is the first observed defect in the class **"the
template's affordances do not match how the artifact is actually used"**, which no
validator can detect (the file is perfectly conformant) and no agent reliably notices,
because agents infer the missing convention from context instead of tripping over its
absence. The general question it raises for the survey: which templates encode a workflow
that only works because an agent silently supplies the missing step, and what happens to
those documents when a human uses them unaided?

## I. A convention that lives only in an execution record gets silently re-derived

Found 2026-08-14 when the user asked whether the "design-it-twice pattern" an agent had
just invoked was durably written down anywhere. Auditing the answer showed three layers,
only two of them durable:

1. **Durable**: `.claude/skills/codebase-design/DESIGN-IT-TWICE.md`, vendored verbatim
   under D-0017. Specifies framing the problem space, **3+** parallel agents each under a
   different design constraint, then compare. Written entirely in code-design vocabulary —
   module, seam, adapter, interface types and methods.
2. **Durable but not reusable**: `docs/superpowers/plans/2026-08-14-wave-3-spikes.md`
   Tasks 4 and 7 elaborate a concrete instantiation — four agents plus a judge, named
   constraints, named comparison axes. But a plan is an **execution record for one
   completed wave**, not a convention. Nothing marks it as the way panels are run here, and
   nothing would lead a future track to it.
3. **Not durable at all**: the shape actually used for the intake-template design — a
   *grounding phase* (audit real usage, survey comparable systems) feeding two variants and
   a judge. The grounding phase appears in neither the skill nor the plan; the skill's step
   one is to *write* a framing, not research one. Two variants were used where the skill
   mandates three or more, a deviation made silently rather than recorded as a ruling.

**Why this is its own category.** Category H was a template whose affordances did not match
its use. This is the inverse: a pattern with no template at all, whose authoritative text
covers a *different domain* (code interfaces, not documents), so every reuse quietly
reinvents the parts the text does not cover — and reinvents them differently each time.
Nothing detects the drift, because each instance looks locally reasonable and there is no
canonical version to diverge from. The agent even described its improvised shape to the
user as "the repo's own pattern", which is the failure mode in one phrase: **tacit
convention presented as established convention.**

Open question this raises for the survey, beyond the intake template: which other practices
in this repo exist only inside a plan or a transcript — adversarial review, the completeness
critic, the gap sweep, survey workflow structure — and would a future track find them? The
answer for all four is currently no.

## J. Findings scoped out of the intake-template fix, recorded so they are not lost

A design panel on the category-H defect (2026-08-14) audited all five intake files — 26
lettered items — and produced hard counts. Its judged recommendation was deliberately
narrow, so these adjacent findings were **explicitly scoped out rather than solved**. They
are recorded here because a scoped-out finding that is not written down is just a forgotten
one.

- **File-level `Status` cannot express partial completion.** The wave-2 file (3 of 12 items
  resolved) and the 0100 file (0 of 5) both read `**Status**: open` and are indistinguishable
  to a reader. A third value would be a cheap validator edit. Not done: it is a different
  defect from "no answer field", and unlike that one it has never actually been reported by a
  reader.
- **A labelled fill-in field would likely go unfilled.** Strong evidence: the existing
  `→ Resolution:` line appears in 9 real items and was left as unedited boilerplate in **9 of
  9**. Real answers are multi-paragraph and asymmetric — 0090 item a's runs about eight lines
  and is explicitly half-resolved — so a single-line `**Answer**:` slot is the wrong shape for
  content that five independent authors already proved wants paragraph form. This is a useful
  general lesson about template fields, not just this one.
- **Conventions propagate by imitation, and that works.** Five of the six back-filled answers
  independently converged on the identical unprompted shape (a new paragraph opening
  `YYYY-MM-DD update — `) across two different files, with zero instruction anywhere. The
  minimal fix is therefore to *name the convention that already emerged*, not to invent one.
  Worth weighing against category I, where imitation produced drift instead: the difference
  seems to be that intake answers sit visibly beside each other in sibling files, while design
  panels live in transcripts nobody re-reads.
- **Ephemeral handles are being cited as durable provenance.** D-0021's `From:` field reads
  "intake/2026-08-14-0090-app-facts.md **item b** resolution", citing an intake item's letter
  from another document — while the spec's intake convention calls those letter handles
  "ephemeral by design". Two parts of the doc system contradict each other. This is a
  ledger-citation-discipline question, not a template question, and belongs to 9900 proper.
- **Intake cross-references are always prose, never links.** Zero markdown link syntax across
  all five files; every `D-####` and `facts/app-profile.md` reference is free text, so
  `checkLinks` cannot see any of them. Building a checker would require first changing the
  authoring convention.
- **One file does not fit the template's shape at all.** `2026-08-13-app-profile.md` groups
  7–11 facts under a single lettered item and resolves them by inline strikethrough, unlike
  the one-question-per-letter shape every later file uses. It was left out of scope rather
  than retrofitted.

## K. The append-only answer convention goes stale when an item is answered in two passes

Found 2026-08-14, the same way as category H — the user noticed it, not a tool. Intake item
`2026-08-14-9900-process-scope.md` item b was answered in two passes: the main ruling first,
the deferred sub-question days later. The first pass's resolution paragraph contained the
sentence *"The sub-question was not answered and stays open"*. When the second answer arrived
and was appended below it, that sentence became **false**, and nothing flagged it. The file
asserted both that a question was open and, four lines later, its answer.

**Why this is its own category, and a pointed one.** The intake-template design panel
(category J) chose the append-a-dated-paragraph convention specifically because five of six
real answers had already converged on it unprompted. That reasoning was sound. But this is the
convention's **first observed failure mode**, and it is intrinsic rather than incidental:
append-only narrative paragraphs can contradict each other, because nothing rereads the
earlier ones. The more prose a resolution carries — and this program's resolutions carry a
lot, deliberately — the more surface there is to go stale.

Note what this is *not*. It is not the per-item-status gap the panel scoped out (item b's
status was never ambiguous; it was answered). It is narrower and harder: **a superseded claim
inside a durable narrative**, which no status field would have caught. The repo already has a
convention for exactly this problem one document over — `DECISIONS.md` marks superseded
entries in place rather than deleting them — and the intake convention has no equivalent.

The agent compounded it: the second answer *was* propagated correctly into the 9900 research
plan, but the stale sentence in its source document was left standing, and the answer was
never acknowledged back to the user. So the derived artifact was right while the source of
truth was self-contradictory — the inverse of the usual drift direction, and a reminder that
propagating a change is not the same as closing it out.

## L. A status field that looks authoritative and is dead

Found 2026-08-15, by trying to use it. Every `tracks/*/research-plan.md` opens with a
`**Status**` line. All fourteen say `draft` — including the eight tracks whose reports are
accepted. Nothing updates it, nothing reads it, and `check-docs.ts` does not validate it; the
`STATUSES` list the validator does enforce (`planned`, `surveying`, `report drafted`,
`accepted`, `deferred`) applies to the README track table, which is the real index.

The defect is not the staleness, it is the **false affordance**. An agent setting a plan's
status to `surveying` at the start of a survey is doing the obviously correct thing, and it
silently makes that one file diverge from thirteen siblings — which is the sibling-drift class
this track exists to study, produced *by* following the document's own apparent convention. That
happened during this track, was caught by reading the siblings, and was reverted.

Two things make this worth recording rather than just fixing. It is a **second instance of the
category-H shape** — an artifact whose affordance points somewhere the process does not go — and
category H was about a missing affordance while this one is about a misleading one, so the pair
suggests the general defect is *affordance and practice disagreeing*, in either direction. And
the cheap repair is not obvious: deleting the field, wiring it to the README, or documenting it
as document-state rather than track-state are three different answers with different costs, and
this is exactly the kind of change the report's N=0 finding applies to — the research-plan
template has **zero remaining authorings** ahead of it, so changing it propagates into nothing.

## What already works

The completeness critic caught a disposition-driving unverified assumption in 0090 and got
a decision rule and an intake item attached to it. Adversarial review of a *plan* — before
any survey ran — caught a silently redefined rubric criterion, which became D-0023. Both
are wins. The gap is that "adversarial review" has been invoked ad hoc at three different
lifecycle stages (plan, report, findings-ratification) rather than existing as a named,
repeatable step with a defined scope.

## Honest limits of this corpus

The sample is roughly 40 commits, 25 decisions, seven accepted tracks, and two spikes. That
is enough to distinguish a recurring pattern (category A, seen three times; category B,
twice) from a one-off (category G, once). It is **not** enough to support numeric
occurrence scoring, which is why the survey should treat a full quantitative FMEA with
scepticism. Categories D and E were caught by passes that already exist; counting them as
motivation for *new* controls would double-count.
