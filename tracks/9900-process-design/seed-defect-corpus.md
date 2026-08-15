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
