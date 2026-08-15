# 9900 prior art — offbook's documentation and implementation lifecycle

**Status**: survey input, gathered 2026-08-15. Not a recommendation. Every entry below is
an observation about another repo; what transfers is the survey's call.

**Source**: [nzneit/offbook](https://github.com/nzneit/offbook), Apache-2.0, public, read at
`main` on 2026-08-15. Same author as this repo.

## Why a second pass over the same repo

D-0009 already adopted five conventions from offbook, and it read exactly one file to do it:
`docs/specs/doc-system.md`. That file describes the **document system** — namespaces, ledger,
intake, validator. It says almost nothing about the **lifecycle** those documents move through,
because the lifecycle was not yet built when it was written (offbook was pre-build at the time;
it now reports 43 requirements, all `tested`).

The lifecycle is visible elsewhere: in `AGENTS.md`, in the archived intake rounds, and in what
the checker grew into. That material is unexamined here, and it is the half that bears on
9900's questions.

D-0009 also explicitly **declined** three things: StrictDoc/ReqIF grammar, a separate
requirements registry, and archive strata. Two of those look different under 9900's questions
than they did under D-0009's. Revisiting either is a new decision, not a silent reversal — the
survey must treat D-0009 as standing until a `D-####` says otherwise.

## The transfer boundary, stated first

Offbook is an application repo: it has `src/`, tests, a CLI, and CI. This is a research repo
with no code under study and no build. Several of offbook's strongest mechanisms are anchored
to that difference and **do not transfer as-is**:

- Its `built`/`tested` lifecycle states are validated against implementation and test traces.
  There is no implementation here to trace to. The nearest analog is a recommendation tracing
  to the spike that tested it, and most tracks have no spike.
- Its arrow-tag traceability (`[utest->R-###]` comments swept out of `*.test.ts`) presupposes
  a test corpus about the subject matter. This repo's tests cover the validator, not the
  research.
- Its requirements registry enumerates what must be built. This program produces
  recommendations, not requirements, and D-0009 already declined the registry once.

What does transfer is the **discipline underneath** those mechanisms, which is repeatedly
stated in offbook's own words: *derive status from a trace, never hand-assert it.* Whether
this repo has anything worth tracing is a real question the survey should answer, not assume.

## Findings, by the key question they bear on

### KQ1 — shape versus semantics

Offbook's checker faces the identical wall and gets past it once, in a way worth studying.
The problem: the bundled agent skill's prose names CLI verbs, and a verb removed from dispatch
leaves the skill's text silently false. Semantic, and unreachable by a shape check.

The move (from the 2026-08-07 intake round, fork e): create **one exported source of truth
that all consumers derive from** — a leaf module exporting every valid invocation form — then
assert coherence in both directions by test, and have the checker scan the skill's text and
match against the same array. The semantic invariant becomes a shape invariant by introducing
the shared source, not by making the checker smarter.

That is a general technique and it is the strongest single idea in this prior art: **where a
semantic check looks impossible, ask whether a shared source of truth would convert it into a
mechanical one.** It is also not free — it required a new module and a coherence test, which
is exactly the kind of cost Key question 2 exists to price.

Offbook also draws the line explicitly rather than overclaiming. The same fork closes with a
stated residual: verb *forms* only; flag names and argument semantics stay unchecked. The
phrase used elsewhere in the same file is **"stated not papered"** — name the residual instead
of letting coverage look complete.

### KQ2 — net process cost

One structural device is directly relevant. A review round's items are split into **forks**
(a–g, each owing a decision) and a **mechanical sweep** (h, no fork — fold into the amendment
commit). Judgment work and clerical work are separated at intake, so the expensive path is
walked only by items that need it.

Note also what offbook's ceremony actually cost: the 2026-08-07 round ran two independent
reviews over a single commit and produced eight forks that took a day to resolve in dialog.
That is heavy. It was applied to a specific surface at a specific moment, not to every commit —
which is itself the datum. The survey should read this as evidence about *when* heavy review
is worth it, not as a standing process to copy.

### KQ3 — detector trust and false positives

Three usable instances.

1. **A self-referential detector bug, same class as ours.** `REQUIREMENTS.md` carries an
   inline warning that a worked example must not be pasted into the file, because the checker
   parses the heading-plus-UID shape and would count the example as a real requirement. This
   is the same failure this repo hit when a link check fired on markdown syntax quoted inside
   inline backticks. Two corpora, same root cause: **a checker cannot distinguish an instance
   from a mention.** That is a second instance rather than a second observer (same author —
   see the correction above), but the two checks were written years and languages apart for
   different purposes, so the recurrence is still evidence that the failure is structural
   rather than a one-off slip.
2. **An explicit severity rule.** Two of the 2026-08-07 resolutions reason directly about
   warn versus refuse, and reach *opposite* conclusions on stated grounds. Refuse, for a
   command that silently returned demo data: "a marker protects only consumers who check it,
   refusal eliminates the class." Warn, for an install landing somewhere unusual: "both states
   can be intentional; the warning converts silent defeat into informed choice." The
   discriminator is whether the flagged state is ever legitimate — a usable test for whether a
   proposed check should block or advise.
3. **A doctor check that is deliberately never fatal** (skill staleness: absent passes,
   identical passes, different warns). Chosen because the failure is real but the action is
   the user's.

### KQ5 — adversarial review as a named step

The strongest evidence in this prior art, and it is *external* evidence — a different repo,
independently reaching this program's founding conclusion.

A single commit was put through two independent agent reviews on the same day: an adversarial
design review returning 16 findings **graded by severity** (1 blocker-class, 5 major, 8 minor,
2 nit), and a process FMEA covering stages A–I across both onboarding paths, returning 5
ranked top gaps with one CRITICAL. The round's own summary sentence:

> Nothing is checker-detectable (`check-docs` exits 0); everything below is design-level.

That is 9900's opening premise, stated in another repo, about a different corpus, before this
track existed.

**Corrected 2026-08-15, by the survey this file seeded.** An earlier version of this paragraph
called that a **twice-observed independent** confirmation. It is not, and the overclaim was
this file's. Offbook is the **same author's** repo, so a convention appearing in both
corroborates a design rather than confirming it independently — a shared author can carry a
shared blind spot into both corpora, which is exactly what independence is supposed to rule
out. The observation is still worth having: it is a second corpus, of a different kind, at a
different stage. It is not a second observer.

Note also that the two reviews were **differently framed** (adversarial critique versus
structured FMEA) rather than two runs of the same lens, and their outputs did not fully
overlap — the FMEA's CRITICAL was a scenario the adversarial review did not surface.

### KQ5 / KQ8 — what happens to findings that are not adopted

Fork g closes with an explicit **"Runners-up recorded, not allocated"** list: six findings
kept verbatim in the file, each with a one-line reason, none allocated to a requirement. They
survive because the intake file is archived intact rather than deleted.

This is a direct answer to corpus category J (panel findings scoped out and lost). The
convention costs one paragraph and preserves the work.

### KQ8 — cross-document consistency

Offbook uses a **stated precedence order** rather than case-by-case judgment: contracts beat
design docs, which beat guides, which beat the bundled skill; each derived layer is labelled
derived in the doc map, and the rule is written as an instruction — on conflict, *fix the other
doc*. A conflict becomes a lookup instead of an argument.

It also names a recurring failure this repo has hit: the **incomplete sweep** — a term renamed
or a list extended in one doc and not its siblings. Offbook lists it as a standing review angle
and the 2026-08-07 sweep contains three instances found by looking for it deliberately.

This repo has no stated precedence order. `DECISIONS.md` is called the authority for what is
decided, but nothing ranks a report against a plan against `facts/app-profile.md` when they
disagree.

### KQ12 — where lessons durably live

**Offbook has already solved this, and the answer is not a register — it is the entry point.**

`AGENTS.md` (with `CLAUDE.md` a symlink to it) carries a **Working notes** section: a running
list of hard-won operational lessons, each stated as a rule with its evidence. They are
specific and expensive-looking — a lint config whose migration silently deleted the rule set
so the gate passed on broken code; a "safe" autofix that broke a byte-exact transcription
test; a compiler that ships without its language-server module so the editor and the gate
disagree; a test that inherited `process.cwd()` and leaked onto pinned ports, dated to the day
it happened and pinned by a named test.

Four properties worth extracting:

- It lives in the **auto-loaded entry point**, so it is read by every agent every session —
  not in a file someone must think to open.
- Entries are **rules, not narratives**: what to do, then why, then the incident.
- Several name the **test that now pins the lesson**, so the note and the mechanical guard
  point at each other.
- It is **unbounded and unsorted**. It has grown long, and nothing prunes it. That is the
  visible cost, and it lands squarely on the context budget — which is the reason this repo's
  `CLAUDE.md` was kept deliberately tight.

The open question this poses for KQ12 is therefore sharper than "where do lessons live": it is
**what stops a lessons register from growing without bound in a file that every session pays
for.** Offbook does not answer that. Neither does this repo.

## Already adopted, already declined

Adopted under D-0009: two permanent ID namespaces, the append-only ledger, the slim intake
convention, `check-docs.ts` (adapted, Apache-2.0 with attribution), the README frontier
pointer.

Declined under D-0009, and worth re-reading only if the survey has a reason: StrictDoc/ReqIF
grammar (an enterprise exit path this repo has no use for); a separate requirements registry
(no requirements here); **archive strata** — the one worth a second look, because offbook moves
a resolved intake file to `docs/archive/intake/` while this repo leaves it in place, and the
2026-08-14 staleness defect (corpus category K) happened in a file that stayed in place.
Whether archiving would have prevented it is not obvious and should not be assumed: the
contradiction was *inside* the file, and moving it does not resolve an internal contradiction.

## What offbook does not have

Stated so the survey does not read this document as uniformly favourable.

- **No answer affordance in its intake template** — the same defect as corpus category H,
  which this repo has already fixed. Offbook's template ends at the `→ Resolution:` line with
  no instruction on where an answer goes. This repo's template is now ahead of the prior art
  on this point, and the fix should not be reverted to match.
- **No stated rule for superseded resolution text**, which is corpus category K. Its archived
  rounds avoid the problem by resolving in one pass and stamping the header with a close-out
  summary naming every artifact touched — a different solution to the same problem, and
  arguably a better one: the header states the terminal state, so an internal contradiction
  is visible at the top of the file rather than buried.
- **No prose or citation checking at all.** Its checker validates IDs, anchors, traces, and
  intake shape. Vale, external link checking, and STE enforcement (Key questions 6 and 9)
  have no prior art here and remain unaddressed.
