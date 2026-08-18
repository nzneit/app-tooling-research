# 9900-process-design — report

## Summary (STE)

This track examined this repo's own research machinery: the validator, the templates, and the
process conventions. The survey priced 26 distinct controls against a ceiling that holds net
steps. We recommend two small validator changes and nothing else. We extend the link check to
`CLAUDE.md` and to `docs/`, and we strip inline code spans. We skip every external tool. We
also skip Process FMEA, the pre-mortem, and the checklist gate as ratified controls.

The most important risk is that we cut the control with the best evidence. A named gate review
falsified claims in three of five reports. Its cost lands on human review time, and this repo
has never measured that time. The package therefore satisfies the net-steps rule, but it does
not buy that control. The next step is a user ruling on seven items. The intake file
`intake/2026-08-15-9900-report-rulings.md` names them.

**As of**: 2026-08-15 (versions evaluated are listed per candidate)
**Recommendation**: build — two rung-0 `check-docs.ts` changes (extend `linkedDocs` to
`CLAUDE.md` and `docs/`, explicitly **not** `templates/`; strip inline code spans, composed
after fence stripping), plus one ratified do-not-build and one write-down of existing practice;
**skip** every external tool candidate (Vale, lychee, linkinator, markdown-link-check,
markdownlint, textlint, remark-lint, MADR / adr-tools / log4brains, plop / degit / cookiecutter)
and every method candidate as a ratified standing control

## Survey

### How this survey ran, and what it did not do

Six parallel research lanes produced 146 findings, of which 43 carried a proposed control.
Every load-bearing finding then went to an adversarial verifier; a completeness critic and a
ledger gap-fill lane ran over the aggregate. The verifiers changed the answer often enough to
matter: of the 43 proposed controls, **six named an offset that verification destroyed**, and
one finding's central factual premise was refuted outright.

Under **D-0001** nothing was run hands-on against a candidate tool. Every tool assessment below
is desk research plus measurement **against this repo's own artifacts**, which is not a
candidate tool and so is not prototyping. Where a claim was load-bearing for the recommendation
I re-measured it myself rather than accepting the lane's number; those re-measurements are
marked *(measured 2026-08-15)* and several corrected the lane.

**D-0004** is close to n-a here: this track studies the repo, not the application, so it
consumes no `facts/app-profile.md` field. It has its own version of the same problem, and the
assumptions it forced are declared in the Recommendation.

### The baseline the recommendation must beat

The spec defines a **three-step** per-track flow (plan, survey, report, with gates). Expanded
to commit granularity that runs to **eight mandatory steps**; both numbers belong here, because
the ratio of added steps to baseline depends on which you divide by, and the eight-step version
is this survey's own decomposition rather than anything the spec states.

The eight: draft the research plan; the user "go" gate; run the survey; draft the report;
prepend the STE summary; validate and commit; the user review gate and revision loop;
acceptance as a `D-####` entry plus README and frontier updates. Two conditional classes sit
alongside — an intake round when a fact is missing, a coherence pass when siblings land
together, a post-draft annotation when a fact arrives late, and the spike lane — and one
per-wave class, the whole-branch final review.

What already runs, mechanically: `node scripts/check-docs.ts` covers eight check families in
**0.60 / 0.60 / 0.66 s** over three runs, reporting 27 decisions, 14 track dirs, 8 reports,
7 intake files, 2 spikes; `node --test scripts/*.test.ts` runs 26 tests in 150 ms *(measured
2026-08-15)*. Nothing enforces either: `.git/hooks` holds only `.sample` files,
`core.hooksPath` is unset, there is no `.github/`, and `package.json` declares no scripts
*(verified 2026-08-15)*.

What already runs, editorially: per-candidate investigators, a synthesis agent, a completeness
critic, a completeness-scan agent, spike design review, cross-track coherence passes, ad-hoc adversarial
review, and the user acceptance gate. **This is a strong baseline and the recommendation must
beat it explicitly** (research plan, "Do nothing structural"). It caught corpus categories C,
D, E, F and part of A. It missed H, I and K — all three found by the user, on 2026-08-14, by
*using* the machinery rather than reviewing its output. It also missed **L**, added to the
corpus on 2026-08-15 by an agent inside this track that set a research plan's `Status` field to
`surveying` and so diverged from thirteen siblings — found by using the machinery too, but by an
agent rather than the user, which is the one encouraging data point in this paragraph.

The narrow opening that leaves: **no recurring, named pass is pointed at the machinery.** One
ad-hoc machinery audit did run, at the Wave 1 close-out, and it produced two `check-docs.ts`
fixes plus a seven-item deferred-hardening list — but it covered only the validator's matchers
and never looked at templates, conventions, or whether a template's affordances match its use.

### The denominators, because "per track" is not one number

The single most consequential number in this report is **N = 5**. Five tracks remain committed
(0100, 0110, 0120, 0130, 0140), one more is foreseeable but unminted (D-0024's TypeScript
compiler-upgrade track). Nothing commits to anything past 0140.

But there is no single N — there are six stage denominators, and only two of them are 5:

| Stage | Remaining instances | Consequence |
|---|---|---|
| Research-plan authoring | **0** — all five plans are already drafted | A `templates/research-plan.md` change propagates into nothing |
| Report authoring | 5 | The only stage where "per track" means 5 |
| Acceptance-gate **events** | ~2-3 | Four gate events have covered nine acceptances to date |
| Committed spike programmes | 0 (6 or more pre-scoped, unrun) | Spike-stage controls have no denominator yet |
| Sessions reading `CLAUDE.md` | unbounded | Does not stop at 0140 |
| Citations | ~1,190 further, on top of 1,903 written | The one denominator that grows after the program closes |

Two of these settle sub-questions by arithmetic rather than argument. The research-plan
template's blast radius is **zero**, so both the cost and the value of changing it are zero —
which disposes of the "promote emergent boilerplate into templates" proposal without needing to
argue it. And human review is paid **per gate, not per track**, so a control priced at "X
minutes per track" is really paid two or three times across the whole remaining program — while
a control that *requires* per-track review would unbatch the gates and raise cost in the least
fungible unit while looking neutral in the other two.

### Methods

Scored on **License** and **Integration cost** only; every other criterion is **n-a** for a
technique, and this report says n-a rather than inventing a score (research plan, "Candidates").

#### Process FMEA (AIAG-VDA), current revision: 1st Edition, 2nd Printing, August 2022

The 2019 harmonised handbook replaced RPN with **Action Priority** (High / Medium / Low), which
fixes the arithmetic — RPN multiplied ordinals and produced rank reversals — without changing
what must be estimated. AP is still a lookup on Severity, Occurrence and Detection.

**License: weak.** The normative text is sold, not published: $81 member / $242 non-member for
a single-user e-document, $2,080 / $3,536 corporate. What is paywalled is the *normative detail*
— the S/O/D rating tables, the Action Priority table, the forms. The seven-step skeleton
(Planning and Preparation, Structure Analysis, Function Analysis, Failure Analysis, Risk
Analysis, Optimization, Results Documentation) is published free and consistently. So the
license finding does **less** work than its prominence suggests, and the survey's stronger
framing — that free descriptions are "mutually incompatible" — is not supported.

**Rejected on evidence, independently of the license.** The corpus states its own limit: the
sample "is not enough to support numeric occurrence scoring". Severity is groundable here.
Occurrence is available only as a coarse ordinal the corpus explicitly declines to formalise.
Detection rests on a single measurement. An AP table fed two under-grounded inputs returns a
priority carrying a table's authority, which is false precision.

**The one worked instance did not run the apparatus.** The offbook artifact that produced value
is 2,832 words containing **zero** occurrences of Severity, Occurrence, Detection, RPN or Action
Priority; its findings carry stage-letter codes plus one CRITICAL label. What survives is
"enumerate the stages, label one severity, rank a shortlist, preserve the runners-up". Whether
scoring happened and was discarded cannot be determined from the artifact.

**And the comparison is confounded.** One commit, two arms differing in **both** method and
prompt, no third arm. The supported claim is that *a coverage-forcing enumeration finds a
different class of finding than an attention-driven pass* — not that FMEA specifically works.
"FMEA" here names a prompt shape.

**Integration cost: adequate as a one-off, weak as a standing control.** A machinery-directed
pass is roughly two orders of magnitude cheaper in tokens than an output-directed one
(`CLAUDE.md` at 2,422 bytes plus two templates at ~2.2 KB, against a mean accepted report of
7,410 words). But it converts directly into human adjudication — the offbook datum prices a
comparable round at a day of dialog for eight forks — and that is the unit with zero baseline
observations here.

#### Poka-yoke / mistake-proofing

**License: strong** (public method). **Integration cost: n-a as a control** — it is a filter,
not a step.

Its real contribution is a sorting rule. Shingo's axes are control-versus-warning and, more
usefully here, *when* inspection happens: source inspection, self-check, successive check,
judgment inspection. Applied to this repo: `check-docs.ts` is a **self-check with a
control-type response** (exit 1) that is simply not wired to a gate; `scripts/new-spike.ts`
already refuses on a bad slug or an existing destination. So the mechanical layer's devices do
refuse when invoked — **nothing guarantees invocation**.

The analogy breaks where it matters. Sorting the corpus honestly: mechanically preventable = B
(cross-references), F (ephemeral paths), and the `Status`-expressiveness half of J. Not
preventable by any device = A, C, D, E, G, H, I, K, L. **Three of twelve categories addressable,
eight not.** Poka-yoke is a useful filter for telling prevention from detection; it is not an
organising frame for this track.

#### Checklist practice (Gawande)

**License: unsettled — score weak on redistribution.** The operative artifact is the free
one-page "Checklist for Checklists" PDF (Gawande, Boorman of Boeing, and the Brigham and
Women's dissemination team; stamped "Last updated 1/14/10"). Its license is unstated — the site
shows only a copyright notice — so internal use as a rubric is safe while reproducing its item
list verbatim in a published report is an **open permission question**. This report therefore
paraphrases it and does not reproduce it.

**Integration cost: weak.** A five-question screen applied to every proposal is roughly 195
screening judgments across 39 distinct control entries, plus a burden-of-proof call per
rejection. Its proposer priced it in **zero** of the three mandated units; "not a detector, so
it has no false-positive rate" answers KQ3, not KQ2. And the artifact's own validation section
demands trialling with front line users and revising after repeated trials — adopting it as a
gate without doing so is precisely the failure it warns about.

Two readings must be narrowed. Its "Not adequately checked by other mechanisms?" item is a
**non-duplication screen**, not an antecedent of net-steps-hold, which has no external
precedent here. And its banner ("a checklist is NOT a teaching tool or an algorithm") is an
argument by analogy about artifact-type confusion, not a direct answer to KQ12.

**The strongest checklist evidence argues against templatizing review as an item list.** Haynes
et al. (NEJM 360(5), Jan 2009) reported mortality 1.5% to 0.8% and complications 11.0% to 7.0%;
Urbach et al. (NEJM 370(11), Mar 2014, PMID 24620866) reported 0.71% to 0.65% (OR 0.91, P=0.13)
and 3.86% to 3.82% (OR 0.97, P=0.29), concluding no significant reduction. These are **not the
same instrument** (Ontario mandated locally adapted checklists), Ontario is a **null** rather
than an opposite result, and neither paper identifies why they differ — baseline-risk headroom
(1.5% versus 0.71%), Haynes' uncontrolled before-after design, and self-reported compliance are
all unadjudicated rivals to the training-and-adaptation explanation. The literature supports
only a weak prior: **a checklist's measured effect is not a property of the instrument alone.**
The decision rests on the in-repo evidence instead — this repo's adversarial-review wins
(D-0023's rubric redefinition; the pre-D-0018 precision catches) came from a reviewer reasoning
freely against a stated standard, not from ticking items.

There is one exception worth keeping as advice rather than as a control: the **unaided template
trial**. Corpus category H was found the only way that class is ever found — a human tried to
use the template as written and asked where to answer. The trial is 1-for-1 on that class, and
its self-defeat condition is honest (an agent holding `CLAUDE.md` and sibling files will
silently supply the missing convention, and the trial passes falsely). But the surface it
protects is now small — zero remaining research-plan authorings, five report authorings — and
this report ships no template change, so there is nothing for it to gate.

#### Pre-mortem (Klein, HBR 85(9), September 2007)

**License: strong** (published method). **Integration cost: weak, and it is disqualified on
structure.** A pre-mortem manufactures a failure and rationalises backward, so it *always*
returns findings whether or not anything is wrong — its own stated limitation is that "the
analysis may be identifying threats/weaknesses that are not in fact real". Under a ceiling that
holds net steps, a step-generating machine that cannot return "nothing" is a cost amplifier.
The widely repeated "30% improvement" figure could not be verified from any free source and is
**not cited here**.

Its lifecycle position is already occupied and already paying: adversarial review of the 0100
*plan*, before any survey ran, caught a silently redefined rubric criterion and became D-0023.
That is a pre-mortem in position and a critique in method.

#### Blameless postmortem and defect taxonomy (SRE practice; ODC)

**License: strong.** **Integration cost: adequate for the vocabulary, weak for the ritual.**

The transferable half is the **trigger list**, not the ceremony: Google's SRE practice
prescribes explicit written criteria for when a postmortem is written, and prices the practice
honestly ("the postmortem process does present an inherent cost in terms of time or effort").
This repo's corpus has no trigger criteria — categories H through K were all found when a human
happened to notice.

Orthogonal Defect Classification supplies the measurement vocabulary, and the corpus is already
a rough instance: it carries what went wrong (category letters) and how it was caught (the
trigger column). ODC's own framing gives KQ4 its falsification test — trigger measures the
effectiveness of the pass that caught the defect. **The problem is not the instrument; it is N**
(see "Proving it worked" below).

One measured warning belongs here rather than in a control. LLM consolidation of a textual
memory bank **degrades utility below the no-memory baseline**, traced to the consolidation step
rather than the underlying experience, with episodic retention remaining competitive. The
paper's own prescription is to *gate* consolidation explicitly rather than fire it after every
interaction. So the intuitive fix for an unbounded lessons register — have an agent
periodically summarise it — is the one measured failure mode. Compaction is a human editorial
act at a named moment. That is a note, not a ratified prohibition.

#### Do nothing structural — the incumbent

**License: n-a. Integration cost: strong (zero).** This is the baseline enumerated above, and
it wins nearly everywhere in this report. Its specific, unbeaten instance is STE: the
authoring-time HTML comment in `templates/report.md` carrying the D-0007 rule list, plus
`checkReports` asserting only that the first H2 is exactly `## Summary (STE)` *(verified at
`scripts/check-docs.ts:201-209`)*. Eight reports, zero measured violations of the mechanically
checkable rules.

#### offbook's lifecycle model (Apache-2.0, read at `main` 2026-08-15)

**License: strong. Integration cost: low for conventions, n-a for the mechanisms that do not
transfer.**

Three things transfer and one does not. **Transfers:** the shared-source-of-truth technique
(where a semantic check looks impossible, ask whether a shared source would convert it into a
mechanical one); the warn-versus-refuse discriminator (*is the flagged state ever legitimate?*);
and "stated not papered" — name the residual instead of letting coverage look complete.
**Does not transfer:** its `built`/`tested` states, arrow-tag traceability, and requirements
registry are all anchored to an application repo with code and tests.

Two cautions. offbook is the **same author's repo**, so where it agrees with this one it
corroborates a design rather than confirming it independently — this matters for the
severity-grading and findings-triage conventions, which are not two independent observations.
And its **Working notes** section — the answer to KQ12 that this survey was pointed at — grew
from 6 entries / 1,670 bytes to 11 entries / 5,087 bytes in fourteen days, reaching **37.7%** of
a 13,483-byte auto-loaded entry point, with no entry removed in that window. That is the cost,
and it lands on the context budget.

### Tools

Every tool below is scored on the full rubric except **Browser compatibility** and
**Contract-format support**, which are **n-a for this entire track** — nothing here ships
anywhere and there is no contract surface.

#### Extend `scripts/check-docs.ts` in-house (rung 0) — the recommendation

313 lines plus 158 lines of tests, zero dependencies, 26 tests. Node v24.18.0 puts stable
global `fetch`, `AbortSignal.timeout`, native type stripping and `import.meta.main` on the
rung-0 side of the line for free.

**Two changes ship. Both are scope widenings of an existing matcher with a measured
zero-error result.**

**(1) Extend `linkedDocs` to `CLAUDE.md` and `docs/` — explicitly not `templates/`.** Today the
array is `README.md`, `DECISIONS.md`, `facts/`, `tracks/`, `intake/` *(verified at
`scripts/check-docs.ts:263-271`)*. `CLAUDE.md` is the auto-loaded entry point for every session
and every subagent, and its two markdown links — to the design-panel and codebase-design skills
— are exactly the pointers **D-0026** exists to make reachable. They are unguarded today.

Measured 2026-08-15 by replaying the validator's own matcher: current scope, 41 files, **30
relative links, 0 errors**. Proposed scope (adding `CLAUDE.md` plus the 7 files under `docs/`),
49 files, **33 relative links, 0 errors**. Green on day one.

**The `templates/` exclusion is load-bearing and must be documented as deliberate.** Adding it
produces **3 errors**, not the 1 the lane predicted: `templates/spike/README.md`'s four-level-up
spec link, and *both* of `templates/spike/findings.md`'s `../../` links, resolve only after
scaffolding into `tracks/<T>/spikes/<slug>/`. That is the instance-versus-mention problem
living inside the template system. Adding only `templates/report.md` and
`templates/research-plan.md` is safe and buys nothing — they contain zero markdown links.
`.claude/skills/` measures 0 broken but should also stay out: **D-0017** forbids editing
vendored files, so if one ever broke, the only lawful remedy would be exclusion.

**(2) Strip inline code spans in `stripFenced`'s callers — inline spans only, and composed
*after* fence stripping.** This retires the only genuine authoring tax in the corpus:
`seed-defect-corpus.md` describes markdown link syntax in English ("a bracketed label followed
by a parenthesised target") because showing it literally failed the commit (corpus B-bis). That
is a control degrading the artifact instead of being suppressed, which leaves no trace.

Measured 2026-08-15: over the current linkedDocs corpus, 30 relative links visible before and
30 after — **zero real links lost, zero errors either way**. Over the proposed scope, 33 before
and 33 after.

**A new false-positive mechanism, found in this measurement and reported by no lane.
Composition order is load-bearing.** Applying the inline-span strip *before* fence stripping
produces **13 broken-link errors** across `docs/superpowers/plans/`. The mechanism: a
three-backtick fence line matches the inline-span regex as an empty code span, the first two
backticks are removed, the line no longer matches the fence-open pattern, and the fence is
destroyed — so the file contents embedded inside those fenced blocks become live links resolved
against the wrong directory. Composed correctly (fence first, then inline), the same corpus is
clean. This is a shipping condition, not a footnote, and it is a fifth instance of the class the
corpus already names.

**The negative half ships with it:** do **not** extend the strip to 4-space-indented blocks by
regex. This repo writes list continuations at 4-space indentation, and the measured cost is
blinding `checkLinks` to a real link (`research-plan.md:103`). A faithful indented-block fix
needs a real markdown parser — rung 1, for no measured yield.

**Two further in-house checks were considered and cut**, and the reasons are consistency tests
of the same rule:

*Dangling `D-####` reference checker — ratified do-not-build.* Measured 2026-08-15: **451
`D-####` references across all tracked markdown, 27 distinct IDs, maximum D-0027, zero outside
the allocated range.** Zero true positives across the repo's entire history, and structurally
blind to the one ledger defect that did occur — D-0013's transcription error is a *content*
mismatch between a valid ID and the report it cites. Recording this as a ratified negative
result stops a future track re-deriving and re-proposing it. The generalisable lesson is the
valuable part: **run the proposed regex over the corpus and count hits before writing any
check.**

*`**From**`-path resolution check — cut, and my measurement is stronger than the lane's.* The
lane reported that every path-shaped `**From**` value resolves today (zero true positives), and
cut it on that basis. Measured 2026-08-15: 27 `**From**` fields, 17 path-shaped values, and
**one does not resolve** — D-0009's `https://github.com/nzneit/offbook (docs/specs/doc-system.md)`,
which is a path inside *another repository*, cited parenthetically. So the check ships with one
measured **false positive** and zero true positives, which is a stronger cut than the lane made.
The principled distinction against the two changes that do ship: those are scope widenings of an
existing matcher with a measured zero-error result, whereas this is a **new** matcher with a new
mention-versus-instance surface.

> **2026-08-15 correction, from the adversarial review of this draft.** An earlier version of
> this sentence also claimed the two shipped changes carry **"no new false-positive surface"**.
> That is false. Re-measured: adding `docs/` brings in **14 relative link-shaped strings that sit
> inside fenced blocks** against **1** outside, some of them `check-docs.ts`'s own deliberately
> unresolvable negative-test fixtures. The surface exists; the fence mask is what keeps it at
> zero errors. So the honest statement is that **the fence mask becomes load-bearing for almost
> all of the newly added link surface** — which also means shipped items 1 and 2 are coupled, and
> item 2's composition-order shipping condition (strip inline spans *after* fence stripping)
> exists precisely because item 1 ships. The distinction against this cut check survives, because
> the issue there is a matcher with no mask at all rather than a mask carrying more weight. If the owner wants one more validator
change, this is first on the list — but it needs its not-content mask defined first.

#### External link checking — skip at every rung

This is the survey's most-researched question and the one where three lanes reached three
incompatible answers. It is resolved in "Cross-lane contradictions" below. The measurements
converge even where the dispositions do not.

A naive unauthenticated Node-fetch sweep over 1,284 unique URLs returns **11.2% non-2xx**; with
a GitHub token and a browser User-Agent the same sweep returns **5.1%** (66 failures) in 49.9 s.
Genuine dead citations: **8**, with a ninth intermittent — `anymaniax/orval/issues/891` returned
200 twice through a live rename redirect and 404 fifteen times, which is a *flaky* citation and
a distinct failure class. Against 1,284 unique URLs that is roughly **0.6-1%**, all of it
provenance rot that changes no recommendation.

The false-positive floor is structural and irreducible in two of its four classes: 28
bot-blocked URLs across Cloudflare-challenged hosts (both `www.npmjs.com` and `dl.acm.org` emit
a `cf-mitigated` challenge header and 403 under a full browser header set); 139
`api.github.com` URLs against a **measured** 60/hour unauthenticated quota — 2.3x over,
requiring a secret and new surface for a repo that has none; one template placeholder that fires
forever; and **four citations whose 404 *is* the evidence**.

Two things settle it. **The venue is unpriced**: every wall-clock figure supporting this control
("~140 s in CI", "49.9 s", "57 s against 0.63 s") resolves to "acceptable in CI where it is
free" — and there is no `.github/` directory. Pricing execution in infrastructure that does not
exist is not a price.

> **2026-08-15 correction, from the adversarial review of this draft.** An earlier version called
> "should this repo have CI?" *an open question in this track's own plan*, and then spent that
> openness as one of two reasons settling the skip for the whole external-tool class. That
> inverts the plan, which **assigns** the question to this track in so many words — "the track
> should therefore answer, rather than assume: should this repo have CI?" — and calls it squarely
> in scope, having already resolved the enabling facts (the repo is public, so Actions is free;
> the blocker is setup effort, not cost). Converting an assigned in-scope question into an
> unknown and then spending the unknown is not a price either. **The skip survives on its own
> merits**, which are on the page and do not depend on CI's absence: the false-positive classes,
> the non-informativeness of a green run, and the four numbers the spike list still asks for. But
> the question does not lapse — it goes to the owner as **intake item `g`**, because this track
> was told to answer it and did not. **And a green run is uninformative about the thing anyone cares about**: measured
2026-08-15 across the eight accepted reports, of 1,903 URL occurrences (1,219 unique), **the
overwhelming majority point at a mutable ref and 18 occurrences (11 unique) are pinned**.

> **2026-08-15 correction, from the adversarial review of this draft.** An earlier version of
> this paragraph gave three sub-counts — 252 mutable GitHub refs, 94 `/latest` endpoints, 8
> pinned — **without printing the counting rule that produced them**, and two of the three do not
> reproduce. Re-measured independently: the pinned figure counted only `refs/tags/` and 40-hex
> SHAs, missing every `releases/tag/` citation; the reproducible counts are **18 tag-pinned
> occurrences (11 unique) and zero SHA-pinned**, against **882 GitHub-family citations**
> (`github.com` 674 + `raw.githubusercontent.com` 208) and 279 `registry.npmjs.org` citations.
> The direction is unchanged and the case is slightly stronger — roughly **2% of GitHub-family
> citations are pinned** — but the earlier numbers should not be quoted. The rule for every count
> above: all `http(s)` URLs in `tracks/*/report.md` excluding this track, trailing punctuation
> stripped; pinned means `refs/tags/`, `releases/tag/`, `/tree|blob/vN.N`, or a 40-hex SHA. This
> is a live instance of the report's own finding that an unstated counting rule is not a
> measurement, and it is why the shipped package includes the run-the-regex-and-count-first rule.

A 200 proves the path still exists and says nothing about
whether the content still supports the claim. The repo's existing counterweight is manual and
already in place: **1,172** `accessed YYYY-MM-DD` stamps.

*Rung findings recorded for the ladder, since D-0027 asks the question:* lychee (Apache-2.0,
3,835 stars, genuinely multi-maintainer, latest lychee-v0.24.2) **cannot enter below rung 2** —
there is no npm distribution, only cargo/brew/docker/Action. linkinator 8.0.3 (MIT, `node >=22`,
10 deps, ~198,800 weekly downloads) and markdown-link-check 3.15.0 (ISC, 9 deps, ~226,000
weekly) are rung-1 and were **absent from the plan's candidate list entirely**.

#### Vale 3.17.1 and prose linting — skip

**License: strong** (MIT). **Maintenance health: adequate-to-weak** — excellent release cadence
(v3.17.1 on 2026-08-05), but contributions are jdkato 1,939 against dependabot 12 and then a
cliff; the repo has also moved from `errata-ai/vale` to `vale-cli/vale`. **Rung: 1, not 2 or 3**
— `@vvago/vale` 3.17.1 tracks upstream within a day, which falsifies the plan's framing; but it
is a third-party fork whose `postinstall` downloads a platform binary over the network, so
"rung 1" here still means a binary arrives and offline-installability is lost.

**The plan's second prediction is confirmed and sharpened.** The ASD-STE100 specification (Issue
9, 2025-01-15) carries a bare all-rights-reserved copyright plus EUTM 017966390, distributed
only on request with no redistribution grant. "Not clearly redistributable" should be sharpened
to **clearly not redistributable**. A live third-party project ships the PDF and a derived
`dictionary.json` under Apache-2.0; that grant cannot convey rights its author does not hold, so
it is unsafe at any rung. The consequence is narrower than the survey first claimed: what
copyright blocks is **conformance checking against the approved word list**, not the whole rule
set.

**Skip is decided on surface area, not on constraint.** The entire STE-governed corpus is 8
report summaries, **84 sentences and 1,160 words** — 0.82% of the repo's 141,986 markdown words
— and it conforms: 7 of 8 summaries are exactly 2 paragraphs (0090's third is a post-acceptance
blockquote), every paragraph is within the 6-sentence maximum, and the longest sentence anywhere
is 22 words against a 25-word descriptive limit. Vale's genuinely unique capability is
part-of-speech tagging for the noun-cluster rule, via its `sequence` extension point; nothing
in-house has it. That capability has **zero measured violations to find**.

Two null results are worth recording. A naive rung-0 paragraph-and-sentence check pointed at
the section the validator already locates would have **failed 8 of 8 reports on its first run**,
because the template itself places the `**As of**:` / `**Recommendation**:` metadata block
*inside* the Summary section and 0090 carries an acceptance blockquote there. And the checkable
part of "one word for one meaning" is the part no dictionary would have helped with — measured
2026-08-15, this repo writes **"gap sweep" 38 times and "completeness scan" 18 times, and they denote
different things** (the Wave 1 post-hoc pass versus the Wave 2 standing in-survey agent), with
neither defined anywhere.

textlint 15.8.0 (MIT, 24 direct dependencies) inherits the same verdict with a larger footprint;
its passive-voice rule would come through `textlint-rule-write-good` 2.0.0, last published
2021-06-06.

#### markdownlint, remark-lint, remark-validate-links — skip

markdownlint is healthy (markdownlint-cli2 0.23.2, MIT, ~1.38M weekly downloads) and checks a
category this repo has **never had a defect in**: 53 active rules, the large majority
heading/list/whitespace/emphasis formatting. Corpus categories A-L contain no formatting defect
at all. One correction to the survey: MD051 does *not* duplicate `checkLinks`, because
`checkLinks` skips every `#`-prefixed target *(verified at `scripts/check-docs.ts:116`)* —
same-document fragments are the one link class the validator ignores. The right reason to skip
is that the repo currently contains **zero same-file anchor links**, so MD051 has no surface.

remark-lint 10.0.1 and remark-validate-links 13.1.0 both had **zero releases in the last twelve
months**, and the latter is a strict duplicate of `checkLinks` plus `resolveAnchor` — including
the additive back-anchor comment form remark has no concept of. Adopting it would trade 28
in-house lines for 11 npm dependencies and a capability regression.

#### MADR, adr-tools, log4brains — skip

MADR is a convention, not a tool ("MIT OR CC0-1.0"), so it is rung 0 by construction. Adopting
it would reshape all 27 `D-####` entries against a defect a template shape does not prevent:
the corpus's only ledger defect is category G, a cross-document semantic mismatch between an
entry and the report it cites, which no status field detects. `adr-tools` is 27 months quiet and
is a bash CLI (rung 3 for a Node repo) to automate creating a numbered markdown file.
`log4brains` has zero npm releases in twelve months and its web package depends on **Next.js
10.2.3 and React 17.0.1** — a framework major from 2020, years past end of life — to publish a
static ADR site this repo has no stated need for.

#### plop, degit, cookiecutter versus `new-spike.ts` — keep the incumbent

`new-spike.ts` is 58 lines with 42 lines of tests and zero dependencies: copy a 7-file template
directory, substitute four tokens, validate the slug, refuse a collision. cookiecutter is a
second language runtime (rung 3) for token substitution. degit 3.7.0 is alive and zero-dependency
— a prior that it was abandoned was wrong — and its `degit.json` *does* support `search_replace`;
it is disqualified because its source must be a **remote repository** rather than a local
template directory, and because it cannot validate the track, validate the slug, or derive the
computed package-name token. plop 4.0.5 is the only real rung-1 substitute: a 17-package
dependency tree replacing 58 tested lines, whose added value is interactive prompts and
Handlebars templating a two-argument CLI does not need.

### The twelve key questions, answered

**KQ1 — shape versus semantics.** The validator's referential coverage is about 1% of the
repo's cross-reference surface: 30 relative links checked, against 1,903 external URL
occurrences in reports alone and 451 prose `D-####` references. Mechanically decidable and worth
doing: relative-link resolution over a wider file set. Mechanically decidable and **not** worth
doing: `D-####` resolution (zero true positives in 451 references). *Looks* decidable and is
not: comparing a `D-####` entry's prose against the report it cites. That last one has a rung-0
conversion — make the report's `**Recommendation**:` line the source of truth and require the
ledger's `What` to embed it verbatim — but it is not shipped, because the field is not yet
reliably mechanical (0090's line reads `**Recommendation** (as accepted, D-0022):`, which no
current matcher would pick up) and because it constrains the ledger's expressiveness in a way
D-0013's entry deliberately used.

**KQ2 — net process cost.** Answered in the Recommendation. The ceiling holds, and it holds
because the package is small, not because of clever accounting.

**KQ3 — detector trust.** The rule that survives every lane: **no new check ships without its
not-content mask defined first, and that mask is a permanent maintenance surface.** The lanes
disagree on how many mask classes exist (two observed instances plus five predicted firings, or
four classes) — a factor-of-two disagreement about the very surface KQ3 asks to be priced, and
therefore itself unpriced. My own measurement adds a class nobody found: **mask composition
order** (above). Two cost findings sharpen this beyond the usual framing. First, a false
positive in a prose repo **silently degrades the artifact instead of being suppressed** — corpus
B-bis changed what a document was able to say, and left no trace, which is invisible to any
measurement plan built on suppression counts. Second, suppression does not need noise: a live
eval elsewhere caught an **orchestrating agent fabricating a justification and instructing a
reviewer not to flag a planted defect**, with no false positive anywhere in the loop.

**KQ4 — proving it worked.** The honest answer is the most important single finding in this
report, and it belongs in the acceptance decision. At N=5, a rate-based measurement **cannot
return a verdict**: power against a *halving* of the defect rate is 6.6-41.6% depending on
framing, and even against a *quartering* it is 27-78%; no framing clears 50% against a halving.
The verdict would also arrive at or after 0140's acceptance, the last committed track — the
answer lands when there is nothing left to apply it to. The git baseline is also destroyed:
Wave 1's per-commit history was squashed, so tracks 0010-0050 show zero `fix` commits and a
naive metric would rank Wave 1 as defect-free and Wave 3 as the worst wave — the inverse of the
truth. **Consequence: every control adopted at this gate is adopted unmeasured, and shipping one
with a measurement plan that reads as though it will report is worse than shipping it stamped
honestly.** What *can* return a verdict inside the program is a capability falsifier — plant a
defect of the target class and see whether the control fires — which has a denominator of 1. For
the two validator changes shipped here that is not a control at all; it is simply how you write
the change, as a case in the existing `node --test` harness.

**KQ5 — adversarial review as a named step.** It is not a new step: it has run at least nine
times across three waves and is written down nowhere durable. Its yield is the best evidence in
the survey — the Wave 1 gap sweep examined 49 candidates across five reports, falsified factual
claims in **3 of 5**, amended **5 of 5**, and changed the adopted set in **3 of 5** (0020 gained
Biome plus cognitive-complexity-ts, 0030's primary detector flipped to fallow, 0040's CI set
gained react-hooks-addons), adding a spike alternative in a fourth. The plan-stage review of
0100 returned 13 graded findings and produced D-0023. **Naming the lens is supported; naming the
items is not** — Braz et al. (ICSE 2022, n=150, 71% with 3+ years' experience) found that asking
reviewers to focus on security raised detection probability **eightfold**, while a tailored
checklist added nothing significant. Two caveats keep this honest: that is a *null* result for
checklists, not a demonstration they are worthless, and it was measured on humans reading code,
not agents reading prose. **Mandating it is cut** (see the Recommendation); **writing down what
already runs is shipped.**

**KQ6 — citation integrity.** Solve neither half now. The cheap half is skipped above. The hard
half — does the page support the claim — has a partial, rung-0, no-network answer in an
immutable-ref rule, which is flagged for the owner rather than shipped, because it names no
offset. On the false-confidence question the answer is **yes, and measurably**: roughly 2% of
the 882 GitHub-family citations are pinned (18 occurrences, 11 unique — see the corrected count
above), so a green link check would be a strong signal that is *non-informative* about content
stability. State the relationship as
non-informativeness, not anti-correlation.

**KQ7 — the silent-config footgun class.** Convert the *rule* half, not the registry half. The
conversion evidence is **2-of-3 to a ratified rule and 1-of-3 to rule-plus-guard**: the oxlint
`overrides` finding got both (D-0020), orval's strip-by-default got a rule without a guard
(D-0018), and the gitignore-star finding got neither. An obligation to attach a guard at
discovery would have been **unsatisfiable** for both unguarded instances — D-0018 records the
policy as not exercised by the spike, and the 0090 finding concerns an app-repo config
inaccessible under D-0004. So any such obligation must permit "guard not writable here, and
why" as a first-class answer. A resolved-config snapshot is not the cheaper general mechanism it
appears to be: ESLint's `--print-config` takes a file path and resolves per-file config, but
oxlint's takes none and its documentation never states whether `overrides` merge or replace,
while D-0020's existing drift test is a static JSON comparison that runs no tool at all. And the
denominator is zero committed spike programmes. **Defer.**

**KQ8 — cross-document consistency.** The wave gate is the right place and the pass already runs
there — twice, with two substantive yields (`7f41959`, 20 lines; `713e698`, 48 lines). What is
missing is durability: Wave 2's pass carries five lettered checks and Wave 3's four, and neither
lives anywhere but inside an execution record for a completed wave. That is corpus category I in
flight, and writing it down is what ships. On precedence: the repo **already has an operative
behaviour** — a later user-supplied fact outranks an earlier report and the report is corrected
in place, as 0090's four blockquoted post-draft annotations show and D-0022 accepted. Three
parts of the doc system have independently converged on it; only the ranking is unstated. The
control is cut because writing it into `CLAUDE.md` costs 700-1,000 bytes on a 2,422-byte
always-loaded file (a 30-40% growth) for no step offset — but if the owner wants it, the
**escalation rule is the load-bearing half**: a naive static rank licenses an agent to "fix" a
fresh fact to match a stale decision, which is net-harmful.

**KQ9 — STE enforcement.** Skip. Answered under Vale above: zero measured violations across a
1,160-word lifetime surface, one known false positive on day one, and the incumbent
authoring-time comment unbeaten in all three cost units.

**KQ10 — retroactivity.** Answered by arithmetic rather than by rule. This report ships no
template change and no authoring convention, so there is no retroactivity question to answer
today; and the research-plan template has **zero** remaining authorings, so a change to it
propagates into nothing. A standing prospective-by-default rule is therefore premature. The live
case the owner should rule on directly is real and measured: **numbered assumption handles
(`A-n`) exist in 2 of 8 reports, appear in no template, spec, ledger entry or `CLAUDE.md`, and
are already cited 56 times across six other documents.** If a rule is ever needed, ESLint's
bulk-suppressions design is the model, and its default — fail on unpruned suppressions — should
be copied rather than softened, because a stale exemption is a silent false negative.

**KQ11 — dogfooding.** Yes, and it is satisfied trivially rather than by a new gate: applying
the two validator changes to this repo by definition applies them to 9900's own files, and both
were measured against this report's own corpus before being recommended. A pre-acceptance pilot
of the *review round* was considered and cut, because the shipping package contains nothing
whose cost is unknown at acceptance. The measurement worth publishing instead is the
uncomfortable one: **9900's own research plan is 17,099 bytes against a spec that calls the plan
"Small by design", and against Wave 1 plans of 1,815-3,703 bytes** — the third largest in the
repo, behind 0140 (23,435) and 0100 (18,389). Normalised, it carries 12 key questions against
Wave 1's handful, and three plans from the same recent batch are 9.0-9.6 KB, so plan inflation
is real but not uniform. No mechanical check could have noticed; `check-docs.ts` has no length
check by design.

**KQ12 — where lessons durably live.** The register stays where it is, pointed at from
`CLAUDE.md`, with **no cap, no graduation rule and no gate-append obligation**. The proposed
byte cap has a genuinely zero false-positive rate and rides free inside the existing run — but
its purpose is to bound a Working-notes section in the entry point, and the arithmetic is
self-refuting: this survey's *own* always-loaded proposals would consume 74-122% of the headroom
under the proposed 6,000-byte cap, breaching it on the day it lands before a single lesson is
admitted. Since all twelve always-loaded controls are cut, the cap has nothing to bound. The
context arithmetic is worth stating once, because it is the clearest instance of the ceiling's
own loophole: **twelve of the survey's controls need durable text in `CLAUDE.md`; costed
together they add 2,630-4,350 bytes to a 2,422-byte file — 109% to 180% growth — every byte of
it individually ceiling-compliant because none of them is a step.** This survey alone spawned 15
subagents, each of which reads that file.

### Cross-lane contradictions, resolved

**1. The link checker, three lanes, three rungs, three verdicts.** One lane concluded "neither
build nor adopt" on measured yield; one shipped a scheduled non-gating CI sweep at rung 1 via
linkinator; one shipped an in-house rung-0 three-verdict checker claiming to retire lychee "on
merit". All three worked the same corpus and converged on a compatible true-positive count
(8-14). **Resolution: skip, and the disagreement is itself the finding.** The do-not-build
verdict rested on a binary — in-house versus lychee — that never considered linkinator or
markdown-link-check, which is **corpus category D reproduced inside 9900's own survey**: one
candidate per capability area, the exact defect D-0022 was written to stop. The rung-1 verdict
prices execution in CI that does not exist. And "retires lychee on merit" is one of the two
predictions the research plan explicitly told the survey to **test rather than assume**; no
comparison against lychee's feature set was ever made, so even the tooling offset is unearned.
Skip survives all three routes because the yield (0.6-1%, provenance rot changing no
recommendation) does not justify a new subsystem, a new binary, or a venue that must first be
built.

**2. Does corpus category B's defect class exist in the A-lists?** Adversarial verification
proved by `git log -p --follow` that **neither 0060's nor 0070's A-list has ever been
renumbered**, and that the one cited instance (`ef51766`) was a **mis-citation, not drift** —
every cited ID resolved before and after. Three lanes' cross-reference proposals — a linkable
cross-reference convention, an anchored one, and retroactivity pricing for `A-n` — rest on the
A-list half and lose that part of their evidence base, together with ~56 citations plus 28
anchors of unpriced retroactive load.

> **2026-08-15 correction, from the adversarial review of this draft.** An earlier version asked
> whether the class exists *at all*, answered no, and instructed that the corpus be corrected.
> **That over-generalised from the half that was tested.** Category B's primary claim is about
> the spike design panels' **I-lists and invariant lists**, not the A-lists, and it is
> **verifiably true**: commit `a26ea5a` inserted a new `I2` into 0060's boundary-wiring design
> and cascaded `I2`→`I3` … `I12`→`I13` in one edit, with the sibling `findings.md` citing into
> that list in prose. The corpus record stands and must not be "corrected". What survives from
> the verification is narrower and still decisive for the disposition: the A-list instance was a
> mis-citation, and — the blow that applies to **both** halves — a back-anchor comment does not
> move under renumbering, so a stale citation would keep resolving while pointing at the wrong
> item. A checker that stays green while the reference is wrong is worse than none.
Two further blows: the proposed reuse of `checkIds` is impossible, because its fixed-width regex
rejects A-10 through A-14, which both reports declare; and back-anchor comments do not move
under renumbering, so a stale citation would keep resolving while pointing at the wrong item.
**Resolution: cut all three; leave the corpus record alone.** The `A-n` convention question is real and
goes to the owner as a convention ruling, not as a checker.

**3. Is the un-enforced validator a problem worth fixing?** One lane called CI "the strongest
practical argument in this lane" because it would make existing checks enforced for the first
time; another proposed a tracked pre-commit hook via `core.hooksPath`; a third said the opposite
on the same verified facts. **Resolution: do not mechanise.** The enforcement gap is real
*(verified 2026-08-15: no non-sample hook, `core.hooksPath` unset, no `.github/`, no
`package.json` scripts)*, but the corpus records **zero observed defects in every category
`check-docs.ts` polices and no fix commit correcting anything it could have caught**, while the
convention has been observed working across 65 commits. Mechanising hardens a path with no
observed escapes, in a single-author repo whose commits stay local, and it converts every future
false positive into a blocked commit at the worst possible moment. The accurate poka-yoke
reframing is also narrower than proposed: the devices refuse when invoked; nothing guarantees
invocation.

**4. May an accepted artifact be edited retroactively?** One lane proposed retrofitting a
`**Class**:` meta line onto all 27 `DECISIONS.md` entries and ruled it "permissible, since meta
lines are additive"; two others held that editing accepted artifacts is corpus category G's
shape inflicted deliberately and at scale, and that any such backfill needs its own ledger
entry. The file in question is the append-only ledger itself, whose header states IDs are never
reused and superseded decisions are marked in place. **Resolution: the constitutional question
is the owner's, and it does not arise, because the backfill is cut.** What remains is a
one-line, additive fix to a *header* — not an edit to any entry — and it needs a membership
ruling first (below).

**5. Wave 2's review share of wall-clock.** One lane reported "68 min of review-and-fix, 46% of
the wave"; another reported "~41 min, about 28% of the 149-min wave, with a further ~27 min at
the user acceptance gate". Same commits (01:48 through 02:56 on 2026-08-14). **Resolution: the
divergence is definitional, not factual — whether the acceptance gate counts as review — and
both figures should be read as 28% agent review plus 18% user gate, or 46% combined.** Both are
commit-timestamp upper bounds at n=2 and neither is instrumentation. The downstream consequence
matters more than the number: two controls were priced with the smaller figure while the larger
one stood unreconciled.

**6. Which STE rule is the noisy one?** One lane measured per-report maximum summary sentence
lengths of 19/16/16/16/20/17/22/20 and treated sentence length and passive voice as equally
clean; another measured a **false 26-word sentence in 0040** created by standard segmentation
merging at a lowercase tool name (`oxlint`), and concluded the opposite ordering — voice is the
cheap rule, sentence length the noisy one. **Resolution: the disposition is unaffected (both say
skip), but the shared zero-yield finding is segmenter-dependent and was never tested against a
second tokenizer.** That is a residual, stated rather than papered: if anyone ever revisits
mechanical STE checking, sentence segmentation is the first thing to characterise.

**7. How many instance-versus-mention false-positive classes exist?** One lane claimed eight
instances and derived a design rule plus a corollary; its own verifier cut that to two observed
instances, one reproduced latent bug, and five predicted firings. Another independently found
four classes and classified two items differently — treating deliberately-cited 404s as an
irreducible false-positive class where the first reclassified them as true positives already
accepted by the author. **Resolution: the rule both lanes drew survives intact and is adopted as
reasoning** — no new check ships without its not-content mask defined first. **The mask's size
does not survive**: it differs by a factor of two between lanes, so the maintenance surface KQ3
asks to be priced remains unpriced, and my own measurement adds a sixth class (composition
order) that neither found. The corollary — that mention share rises with proximity to the
check's subject — remains a hypothesis on 3 of 8 unnormalised items.

### Evidence quality: seven overclaims, flagged rather than dropped

These do not change the recommendation. They change how much weight anyone should put on the
reasoning that supports it, and they are recorded because a survey that hides them is worse than
one that reports them.

1. **The dogfood-before-acceptance argument rested on one unverifiable source.** Its case was
   the W3C Candidate Recommendation stage, and its own correction admits the two cited sections
   could not be retrieved verbatim, so whether piloting is a hard prerequisite or an advancement
   consideration is **unverified**. Its two other precedents, PEP 1 and MADR, are
   self-application of a *notation*, not piloting before ratification. Cut anyway.
2. **The FMEA license finding rested on one vendor page**, and the "no free download option
   exists" sentence is the survey's summary of that page, not a quotation from it. No second
   source was consulted for the distribution terms. The finding does less work than its
   prominence implies, and the recommendation does not lean on it.
3. **The footgun register's admission test is derived from n=1** — a single observation that
   oxc's config reference is silent on `overrides` merge semantics, plus one issue-list query —
   and was then proposed as the bounding mechanism for all future entries.
4. **Every CI wall-clock figure in the survey prices infrastructure that does not exist.** The
   resolved fact is that CI is free to *add*; the setup cost is unpriced by every lane that used
   it.
5. **One rung climb was justified by a self-declared estimate.** The "140-170 new lines" figure
   is labelled by its own author as an engineering estimate rather than a measurement, and it is
   the stated reason one lane chose rung 1 over rung 0 — against D-0027's rule that climbing a
   rung requires justification.
6. **All wall-clock in this survey is commit-timestamp arithmetic over two waves (n=2,
   self-labelled upper bounds), and every token figure is an estimate at ~4 bytes/token or ~1.33
   tokens/word.** No lane measured the actual token spend of a real pass, despite this repo
   having run workflows of up to fifteen agents whose transcripts exist. Human review time has
   **zero** observations at any gate.
7. **The machinery stage sweep was proposed on evidence its own lane had already declared
   unattributable** — one commit, two arms differing in both method and prompt, no third arm, no
   scoring machinery preserved — and then claimed to be "pointed at a surface no existing pass
   points at", which is a different and unsupported claim.

## Rubric comparison

Two tables, kept visibly separate (research plan, "Candidates"). **Browser compatibility** and
**Contract-format support** are **n-a for this whole track** and are omitted from both tables
rather than scored.

### Methods — License and Integration cost only; every other criterion is n-a

| Method | License (medium) | Integration cost (high) | Maint. health / TS fit / Runtime / Output quality / Escape hatch |
|---|---|---|---|
| Process FMEA (AIAG-VDA, 2022 printing) | **weak** — normative tables paywalled ($81-$3,536); free seven-step skeleton only | **weak** — one adjudication round per invocation, landing on the unit with zero baseline observations | **n-a** (technique) |
| Poka-yoke / mistake-proofing | **strong** — public method, no artifact to license | **n-a as a control** — a filter for sorting proposals, not a step; addresses 3 of 12 corpus categories | **n-a** (technique) |
| Checklist practice (Gawande) | **weak** — one-page artifact, license unstated; verbatim reproduction is an open permission question | **weak** — ~195 screening judgments across 39 entries; priced in zero of three units by its proposer | **n-a** (technique) |
| Pre-mortem (Klein) | **strong** — published method | **weak** — cannot return "nothing"; a step generator under a net-steps ceiling; its lifecycle slot is already occupied | **n-a** (technique) |
| Blameless postmortem / ODC | **strong** — public practice | **adequate** — the trigger list and attribution column are cheap; the ritual is not, and N=5 defeats rate measurement | **n-a** (technique) |
| **Do nothing structural** | **n-a** — nothing to license | **strong — zero.** The incumbent; caught C, D, E, F and part of A; unbeaten on STE | **n-a** (technique) |
| offbook lifecycle model | **strong** — Apache-2.0, public | **adequate** — three conventions transfer; the traceability mechanisms are anchored to an app repo and do not | **n-a** (technique) |

### Tools — full rubric less the two track-wide n-a criteria

| Tool (version) | License (med) | Maint. health (high) | TS fit (low) | Integration cost (high) | Runtime (low) | Output quality (high) | Escape hatch (med) |
|---|---|---|---|---|---|---|---|
| **`check-docs.ts` in-house (rung 0)** | **strong** — Apache-2.0 adapted, attributed (D-0009) | **strong** — 26 tests, 313 lines, owned outright | **strong** — TypeScript, run by Node's native stripping | **strong** — two array entries and one regex; no new invocation | **strong** — 0.60-0.66 s measured, unchanged | **strong** — 0 errors and 0 links lost, measured on this corpus | **strong** — a code revert |
| lychee 0.24.2 | strong — Apache-2.0 | **strong** — genuinely multi-maintainer (716/205/57/26) | n-a — Rust binary | **weak** — no npm distribution, so **rung 2 minimum** | weak — ~50-140 s per run | adequate — six mitigations built in, but no per-host accept | adequate — CI YAML removal |
| linkinator 8.0.3 | strong — MIT | strong — 24 releases in 12 months, ~198.8k weekly | adequate — Node >=22, satisfied | **weak** — rung 1 into a venue that does not exist | weak — same order as lychee | adequate — detects the Cloudflare challenge 403 and skips | strong — devDependency |
| markdown-link-check 3.15.0 | strong — ISC | adequate — 4 releases in 12 months, no `engines` field | adequate | weak — same venue problem | weak | adequate — markdown-only by design | strong |
| Vale 3.17.1 (`@vvago/vale` rung 1) | strong — MIT; **but the ASD-STE100 dictionary is not redistributable** | **weak** — jdkato 1,939 vs dependabot 12, then a cliff | low — n-a in practice | **weak** — no STE style package exists; network `postinstall` breaks offline install | adequate | **weak here** — unique POS capability, zero measured violations to find | adequate — config plus StylesPath to unwind |
| textlint 15.8.0 | strong — MIT | adequate — 15 releases in 12 months | adequate — Node >=20.18 | **weak** — 24 direct dependencies for a 1,160-word surface | adequate | weak — passive rule via a package last published 2021-06-06 | strong |
| markdownlint-cli2 0.23.2 | strong — MIT | strong — ~1.38M weekly, active | strong | adequate — rung 1, config-only | strong | **weak for this repo** — 53 rules against zero formatting defects | strong |
| remark-lint 10.0.1 / remark-validate-links 13.1.0 | strong — MIT | **weak** — zero releases in 12 months | adequate | weak — 11 deps to replace 28 in-house lines | adequate | **weak** — capability regression; no back-anchor concept | strong |
| MADR 4.0.0 | strong — MIT OR CC0-1.0 | adequate — release 2024-09-17, repo active | n-a — a convention | **weak** — reshapes 27 accepted entries against a defect it does not detect | n-a | weak — status lifecycle the ledger already handles in prose | weak — retroactive by nature |
| adr-tools | adequate — GPL-3.0-or-later tool, CC BY 4.0 output | **weak** — 27 months quiet, 69 open issues | n-a — bash | **weak** — rung 3 for a Node repo | n-a | weak | adequate |
| log4brains 1.1.0 | strong — Apache-2.0 | **weak** — zero npm releases in 12 months; web package on Next.js 10.2.3 / React 17.0.1 | weak | weak — publishes a site nobody asked for | weak | weak | adequate |
| plop 4.0.5 | strong — MIT | adequate | strong | **weak** — 17 packages replacing 58 tested lines | adequate | adequate — prompts and Handlebars, unneeded here | strong |
| degit 3.7.0 | strong — MIT | strong — 27 releases in 12 months, zero deps | strong | **weak** — remote-source only; cannot validate track or slug, or derive the package-name token | strong | weak — no local-template mode | strong |
| cookiecutter 2.7.1 | strong — BSD-3-Clause | strong | n-a — Python | **weak** — rung 3, a second language runtime | adequate | adequate | weak |

## Recommendation

**Build, in-house, at rung 0 — and change less than we could.** Four items ship. Twenty-two of
roughly 26 distinct controls are cut. **The package adds no mandatory per-track step and retires
none**, so it satisfies net-steps-hold trivially rather than by offset arithmetic: 8 mandatory
steps before and 8 after against this survey's decomposition, or 3 before and 3 after against
the spec's own three-step flow. Nothing is added to `CLAUDE.md`, so the always-loaded context
cost is unchanged at 2,422 bytes.

### What ships

1. **Extend `linkedDocs` to `CLAUDE.md` and `docs/` — explicitly not `templates/`.** Two array
   entries. Measured green: 33 relative links, 0 errors across the proposed scope. The
   `templates/` exclusion **must be recorded in the code as deliberate, with its reason**, or a
   future contributor "fixes" it and breaks the build with 3 errors. `.claude/skills/` stays out
   under D-0017.
2. **Strip inline code spans in `stripFenced`'s callers — inline spans only, composed after
   fence stripping.** Measured: 30 links before and 30 after on the current corpus, 33 and 33 on
   the proposed one, zero lost. **Shipping conditions:** the strip must run *after* fence
   stripping (composing it first produces 13 false errors — see the Survey), and it must **not**
   be extended to 4-space-indented blocks by regex. Both changes land with a test case in the
   existing `node --test` harness; that is how you write the change, not a control.
3. **Ratify "do not build the dangling `D-####` reference checker" as a negative result.**
   Measured: 451 references, 27 distinct IDs, zero dangling, and structurally blind to the one
   ledger defect that occurred. Recording the refusal stops a future track re-deriving it. The
   transferable rule ships with it: **run the proposed regex over the corpus and count hits
   before writing any check.**
4. **Write down the gate-stage review passes exactly as they have run** — as a record of
   existing practice, in a sibling skill file read on demand, **explicitly not as a new
   obligation and not in `CLAUDE.md`.** This retires a measured re-derivation: Wave 2's coherence
   pass carries five lettered checks, Wave 3's four, neither written anywhere durable (corpus
   category I, in flight). **A hard bound applies: the written version may not add a single
   item, trigger, or lens the observed runs did not have.** That bound is not decoration —
   corpus category I records the exact failure it prevents, where a vendored skill mandates
   three or more design variants and two were silently used. It ships only because deleting the
   document would change nothing anyone does per track.

### What is cut, and why it matters

Of roughly 26 distinct controls after deduplication (43 proposal entries across six lanes — the
duplicates are themselves a finding: three lanes proposed one external-link checker at three
different rungs, and two proposed the same one-line `linkedDocs` edit), **22 are cut. The
dominant reason is not that they are bad ideas.** Several are good. It is that **22 of the 43
entries name no offset that survives verification.** Six named an offset that adversarial review
destroyed. Three drew on a single payment — the whole-branch review — which grep across all
tracked markdown shows has **exactly one recorded occurrence** in the repo's history (the Wave 1
close-out); one payment cannot fund three recurring controls, and retiring it would also lose
coverage, since it produced two validator code fixes a prose-consistency pass cannot generate.
One re-sold the gap-sweep fold-in, which was banked once on 2026-08-14 and then **lapsed**:
measured 2026-08-15, seven of eight reports mention a completeness scan or sweep and **0090 does not** —
and 0090 was accepted carrying the candidate-breadth defect the user caught, which became
D-0022 and minted four tracks. And the survey's only proposal claiming a **negative** step delta
was refuted, which cascaded four further entries from offset-bearing to unfunded.

For contrast: the aggregate the survey actually proposed was **+6 to +8 mandatory per-track
steps against 0 retirements** — 8 to 14-16 — reproducing exactly the failure this track's plan
opened by predicting ("five to eight mandatory authoring and review steps per track"). **Every
lane individually cleared the ceiling; the aggregate did not.**

### Trades stated, not netted out

No exchange rate between wall-clock, human review time and agent token spend has been set
(intake 2026-08-14 item b), so these are stated side by side:

- **The four shipped items are free in all three units.** Sub-perceptible wall-clock inside a
  run already measured at 0.60-0.66 s; zero recurring human review; zero agent tokens, because
  nothing is added to any auto-loaded or on-demand file that a session reads by default. Item 4
  lives in an on-demand sibling skill file, and *reduces* tokens where the pass is run, because
  the check categories are inherited instead of re-derived.
- **The mandated gate review is cheap in tokens (~45k input at a two-report gate), moderate in
  wall-clock (~18-41 min, measured as commit-gap upper bounds, n=2), and expensive in the unit
  with zero baseline observations.** Most expensive and least measured is precisely the
  combination the three-unit ruling forbids netting out.
- **The external-link sweep is near-free in tokens to run, catastrophic in wall-clock
  pre-commit (90-230x the validator), irrelevant in a CI that does not exist, and
  human-adjudicated in its findings.**
- **The immutable-ref rule is genuinely cheap per instance and genuinely expensive in
  aggregate** — one SHA resolution per citation, ~158 further GitHub-mutable citations across
  five remaining reports.
- **Anything added to an auto-loaded file costs agent tokens on every session, forever, and this
  survey alone spawned 15 subagents.** That is why all twelve always-loaded proposals are cut,
  and it is the single largest number in the cost analysis: 2,630-4,350 bytes added to a
  2,422-byte file, 109-180% growth, every byte individually ceiling-compliant because none of
  them is a step.

### Two cuts flagged for the owner's reviewed exception

The ceiling ruling requires that an exception be **reviewed** — someone other than the proposer
must agree. No reviewer other than the proposer has agreed to either of these, so they are
**flagged, not granted**.

**(a) Making the gate review mandatory.** This is the control with the best evidence in the
entire survey, and cutting it is the most uncomfortable call in this report. The escape that
justifies putting it to a reviewer is **0090**: it landed at a gate with no review pass, and the
user personally caught a candidate-breadth defect that became D-0022 and minted four tracks.
That is a real escape with a real cost. Against it: +1 to +3 steps per track, an offset that has
been paid once and cannot be paid again, and a human-review price that is **unmeasurable today**.
The honest counter belongs alongside it — naming the lens is supported by one external result
measured on humans reading code, not agents reading prose.

**(b) The immutable-ref citation rule.** The only control in the survey whose value **outlives
the program**. Measured 2026-08-15 across the eight accepted reports: 1,903 citation occurrences
(1,219 unique), of which **882 are GitHub-family** citations and only **18 occurrences (11
unique) are pinned to a tag — none to a SHA** (counting rule and correction stated in the Survey).
That is roughly 2% pinned. Those citations are the entire evidentiary basis of
eight accepted reports and keep decaying after 0140. It names no offset and its retroactivity is
unpriced. If the owner wants it, the cheap shape is regex-only, no network, warn-level, scoped
to `github.com` and `raw.githubusercontent.com` where every hit has a mechanical fix, run
diff-scoped over newly added lines so it does not fire on the ~864 unpinned GitHub-family
citations already in the corpus on day one.

### Three rulings only the owner can make

All owner-facing items in this report — the three rulings below, the two flagged cuts above, and
one definitional call — are carried as a dated intake file per the `CLAUDE.md` rule that questions
only the user can answer do not live in a report:
[intake/2026-08-15-9900-report-rulings.md](../../intake/2026-08-15-9900-report-rulings.md), six
items plus `g`, added by this draft's adversarial review. That file is the place to answer; this section is the reasoning behind items
`a` to `c`.

**(i) The ceiling ruling never defines "step", and this report's arithmetic is contingent on the
answer.** This report assumed a step is a **mandatory per-track authoring or review action**
(assumption A-1 below), which makes validator checks and always-loaded prose ceiling-*free*
while they still cost tokens and human attention. Under a broader reading — anything an author
or agent must do or read — the four shipped items stay free, but the arithmetic for roughly
eight other controls changes. **One line settles it.**

**(ii) Does a cancelled proposal count as payment?** Nine entries pay in classes the rule has no
vocabulary for: *cancelled proposal* (payment by not building something never built), *future
rate-limit* (a promise to constrain later additions), and *tooling offset* (retiring a candidate
never adopted). One lane asked for this ruling explicitly; none answered it.
**Recommendation: do not admit cancelled proposals**, because it is unfalsifiable — any control
can name a hypothetical it forecloses. Note that three separate controls each claimed to be the
budget authority for the others, which cannot all be true.

**(iii) The membership rule for `DECISIONS.md`'s "Constraints in force" header.** It lists
D-0001 through D-0007 and D-0011 and has not been edited since the initial commit, while D-0012
through D-0027 were added. Verification reframed this usefully: at that same initial commit it
**already** omitted D-0008 and D-0009, so it was never a complete enumeration. Nothing in it
became false; an enumeration presented as complete was always partial. That is a membership-rule
gap, and the fix is a one-line edit once the rule is stated — not a mechanism.

### Three defects to fix without any control

These are defects, not gaps. None needs a checker.

1. **D-0025's rationale says "ten tracks remain unstarted".** At the commit that introduced it,
   the README carried 14 track rows of which **6** were non-accepted; adding D-0024's unminted
   track gives 7. No reading of the record yields ten. This is a live corpus-category-G instance
   **inside the entry that founded this track**, and `check-docs.ts` structurally cannot see it.
2. **The "Constraints in force" header omits D-0008, D-0009, D-0020, D-0025 and D-0027** — see
   ruling (iii).
3. **"Gap sweep" (38 uses) and "completeness scan" (18 uses) denote two genuinely different things and
   neither is defined anywhere.** One sentence fixes what a glossary plus a preferred-term check
   was proposed to detect — and a blocking check would have pushed authors toward the wrong
   repair.

### Constraints applied

**D-0001** — nothing was run hands-on against a candidate tool; every measurement is against
this repo's own artifacts, and the spike questions below are pre-scoped. **D-0003** — every tool
scored is free OSS runnable locally or in CI; the ASD-STE100 dictionary fails on redistribution
and Kiro (a paid product, surfaced in the agent-era lane) fails outright. **D-0004** — this
track consumes no `facts/app-profile.md` field; its assumptions are declared below.
**D-0007** — the summary above follows the STE rules and was written last. **D-0009** — the
validator is adapted from offbook under Apache-2.0 with attribution, and the three things D-0009
declined (StrictDoc/ReqIF grammar, a requirements registry, archive strata) stay declined; this
report proposes no silent reversal. **D-0017** — the vendored codebase-design skill stays
byte-verbatim and is deliberately excluded from the link-checked set for that reason.
**D-0025** — scope is the machinery; this report does not redesign the track lifecycle, the wave
structure, or the shared rubric. Two of the flagged items (the gate review's triggers, the
`A-n` convention) touch that boundary and are therefore **flagged to the owner rather than
recommended**. **D-0026** — the two shipped validator changes exist to protect the pointers
D-0026 created. **D-0027** — both shipped changes are **rung 0**; every rung-1, rung-2 and rung-3
candidate is skipped, and no rung climb is proposed. One gap in the ladder is worth recording:
it classifies by *dependency footprint*, so a pure offline enum check and a network-fetching link
check sit on the same rung while differing enormously in operational risk. Either the ladder
gains a second axis (pure / filesystem / network / model-calling), or the report states plainly
that **rung is not a proxy for cost** — which is what this report does.

### Assumptions declared (D-0004 discipline, applied to rulings rather than app facts)

- **A-1** — ~~"Step" means a mandatory per-track authoring or review action. The ceiling ruling
  does not define it. All step arithmetic here is contingent on this; see ruling (i).~~
  **Superseded 2026-08-17 by D-0029**, which rules that a step is *a logical step in the workflow,
  or dynamic workflow, that executes a track* — an orchestration stage, not an authoring action.
  The four shipped items stay ceiling-free under the ruling, so **the recommendation is
  unaffected**, and the always-loaded-bytes analysis stands unchanged because D-0029 keeps those
  ceiling-free while requiring them to be priced anyway. What does change for future work: the
  budgeted object is now **the shape of the workflow that runs a track**, so a proposal is scored
  by whether it adds an orchestration stage rather than by whether it adds something an author
  must do. Two consequences this report did not anticipate. The gate-review control at flagged
  item (a) is squarely ceiling-governed under this reading, since a review pass *is* a stage.
  And this report's own production — six survey lanes, per-lane verification, a completeness
  critic, a gap-fill pass, a cost gate, and a synthesis stage — is itself a workflow the ceiling
  now governs.
- **A-2** — Acceptance gates stay batched at the observed rate (four events for nine
  acceptances). If gates are taken per track, the human-review denominator returns to 5 and the
  cost table must be re-read.
- **A-3** — N = 5 committed remaining tracks and 6 foreseeable. Nothing in the record commits to
  anything past 0140; D-0024's track is unminted, unnumbered, and carries no README row.
- **A-4** — Every token figure is an estimate at ~4 bytes per token or ~1.33 tokens per word. No
  instrumentation exists in this repo and no lane measured the real spend of a real pass.
- **A-5** — Every wall-clock figure is derived from commit-timestamp gaps, self-labelled upper
  bounds, at n=2. There is no timing instrumentation.
- **A-6** — Human review time has **zero** observations at any gate in this repo's history. Every
  statement about it is a bound, not a measurement.
- **A-7** — offbook is the same author's repository. Where it agrees with this repo it
  corroborates a design rather than confirming it independently; the severity-grading and
  findings-triage conventions are **not** two independent observations.
- **A-8** — The 26-distinct-control figure comes from deduplicating 43 proposal entries by hand.
  Both numbers are reported because the cut ratio depends on which is the denominator.

## What a spike would validate

Nothing in this recommendation requires a spike: the two shipped changes are settled by unit
tests in the existing harness, and D-0001's debt on them is zero. The questions below are the
debt this survey **could not** discharge from the desk, pre-scoped for the D-0017 harness. Each
names its falsifier.

- **Mask composition, as a regression fixture.** Add both the positive case (a document quoting
  markdown link syntax inside backticks must not fire) and the **inverse** case (a fenced block
  containing repo-root-relative links must stay masked when the inline strip is composed after
  fence stripping). *Falsifier:* if the inverse fixture passes with the strips composed in either
  order, the composition-order finding is wrong and the shipping condition can be dropped.
- **The unaided template trial, run once against `templates/report.md`.** Hand it to a human, or
  to an agent with `CLAUDE.md` and every sibling report withheld, and ask for the artifact with
  no conversational help. *Falsifier:* if the unaided run produces a conformant report, corpus
  category H is closed for this template and the trial retires. *Self-defeat condition to
  control for:* an agent holding context will silently supply the missing convention and the
  trial passes falsely.
- **The third-arm comparison that settles what the FMEA instance actually showed.** On one
  artifact, run an enumerated stage sweep **and** a second adversarial review under a different
  framing prompt, then compare unique-finding sets. *Falsifier:* if two differently-framed
  adversarial reviews diverge as much as the sweep did, the value was the second framing rather
  than the enumeration, and the FMEA candidate collapses into "run adversarial review twice with
  different prompts", which is cheaper.
- **The hard half of citation integrity, at n=10.** Take ten citations pinned to mutable refs,
  fetch the current content, and count how many still support the sentence citing them.
  *Falsifier:* if the number is high, the mutable-ref concern is theoretical and flagged item (b)
  should be dropped; if it is low, the immutable-ref rule is urgent and the link checker remains
  a distraction. This is the cheapest decisive experiment in the whole survey and it needs no
  tooling.
- **The link-integrity numbers, if and only if CI is ever built.** One authenticated pass over
  all unique URLs reporting four numbers rather than pass/fail: true positives after the four
  known false-positive classes are excluded; the suppression-list size needed for a clean run;
  warm-versus-cold wall-clock; and how many true positives changed a *claim* rather than only a
  path. *Falsifier:* if the fourth number is zero — as the 8-12 measured dead citations suggest —
  the control stays skipped no matter how cheap it becomes.
- **oxlint's `--print-config` semantics** (KQ7's deferred half): does it resolve `overrides`
  per-file, or dump the config file? *Falsifier:* if it does not resolve per-file, a
  resolved-config snapshot cannot assert D-0020's restatement invariant and the cheap general
  mechanism does not exist. Note this needs oxlint in the checking path — a rung climb — and
  would enshrine the bug if a snapshot were first taken while it was present.

## Sources

Repo-internal evidence (paths, line numbers and measurements are cited inline throughout; all
measured or verified 2026-08-15 at `b8c4132`): `scripts/check-docs.ts`, `scripts/new-spike.ts`,
`DECISIONS.md`, `README.md`, `CLAUDE.md`, `templates/`, the spec and plan trees under `docs/`,
`intake/2026-08-14-9900-process-scope.md`,
`tracks/9900-process-design/seed-defect-corpus.md`, and
`tracks/9900-process-design/prior-art-offbook.md`.

External sources were accessed by the survey lanes on **2026-08-15** unless noted. Two are
recorded with their live status because the status is itself evidence.

- https://github.com/nzneit/offbook — accessed 2026-08-15 (Apache-2.0; read at main)
- https://www.asd-ste100.org/ and https://www.asd-ste100.org/request.html — accessed 2026-08-15 (Issue 9, 2025-01-15; all rights reserved, EUTM 017966390)
- https://vale.sh/hub/ and https://docs.vale.sh/topics/styles — accessed 2026-08-15 (16 packages listed; none is ASD-STE100)
- https://registry.npmjs.org/@vvago/vale — accessed 2026-08-15 (3.17.1, MIT, network postinstall)
- https://api.github.com/repos/errata-ai/vale — accessed 2026-08-15 (redirects to vale-cli/vale; MIT, 5,929 stars)
- https://github.com/lycheeverse/lychee — accessed 2026-08-15 (Apache-2.0, lychee-v0.24.2, no npm distribution)
- https://registry.npmjs.org/linkinator — accessed 2026-08-15 (8.0.3, MIT, node >=22)
- https://registry.npmjs.org/markdown-link-check — accessed 2026-08-15 (3.15.0, ISC)
- https://registry.npmjs.org/markdownlint-cli2 — accessed 2026-08-15 (0.23.2, MIT)
- https://raw.githubusercontent.com/DavidAnson/markdownlint/main/doc/Rules.md — accessed 2026-08-15 (53 active rules)
- https://registry.npmjs.org/textlint — accessed 2026-08-15 (15.8.0, MIT, 24 direct deps)
- https://registry.npmjs.org/remark-lint and https://registry.npmjs.org/remark-validate-links — accessed 2026-08-15 (10.0.1 / 13.1.0; zero releases in 12 months)
- https://api.github.com/repos/adr/madr — accessed 2026-08-15 (MIT OR CC0-1.0, 4.0.0)
- https://api.github.com/repos/npryce/adr-tools — accessed 2026-08-15 (GPL-3.0-or-later; last push 2024-04-25)
- https://registry.npmjs.org/log4brains and https://registry.npmjs.org/@log4brains/web — accessed 2026-08-15 (1.1.0; Next.js 10.2.3, React 17.0.1)
- https://registry.npmjs.org/degit and https://registry.npmjs.org/plop — accessed 2026-08-15 (3.7.0 zero-dep; 4.0.5, 17-package tree)
- https://pypi.org/pypi/cookiecutter/json — accessed 2026-08-15 (2.7.1, BSD-3-Clause, Python >=3.10)
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api — accessed 2026-08-15 (60/hr unauthenticated per IP; measured live)
- https://nodejs.org/api/globals.html — accessed 2026-08-15 (global fetch stable since v21)
- https://eslint.org/docs/latest/use/suppressions — accessed 2026-08-15 (bulk-suppressions design; fail-on-unpruned default)
- https://eslint.org/docs/latest/use/command-line-interface and https://oxc.rs/docs/guide/usage/linter/cli.html — accessed 2026-08-15 (print-config semantics differ; oxlint's takes no file argument)
- https://oxc.rs/docs/guide/usage/linter/config.html — accessed 2026-08-15 (silent on whether overrides merge or replace)
- https://en.wikipedia.org/wiki/Failure_mode_and_effects_analysis and https://de.wikipedia.org/wiki/FMEA — accessed 2026-08-15 (AP replaced RPN in the 2019 harmonised handbook)
- https://www.aiag.org/training-and-resources/manuals — accessed 2026-08-15 (1st Edition, 2nd Printing, August 2022; price table). **Note:** the research plan's own candidate link, https://www.aiag.org/quality/fmea, is dead — it redirects to a 404 while the site root is 200. That is one of the eight genuinely dead citations this survey measured, and it is in this track's own plan
- https://en.wikipedia.org/wiki/Poka-yoke and https://en.wikipedia.org/wiki/Shigeo_Shingo — accessed 2026-08-15
- https://www.projectcheck.org/checklist-for-checklists.html — accessed 2026-08-15 (one-page PDF; license unstated, so not reproduced here)
- Haynes et al., "A surgical safety checklist to reduce morbidity and mortality in a global population", NEJM 360(5), January 2009 — via Europe PMC, accessed 2026-08-15
- Urbach et al., "Introduction of surgical safety checklists in Ontario, Canada", NEJM 370(11), March 2014, PMID 24620866 — via Europe PMC, accessed 2026-08-15
- Braz, Aeberhard, Calikli, Bacchelli, "Less is More: Supporting Developers in Vulnerability Detection during Code Review", ICSE 2022 — https://arxiv.org/abs/2202.04586 — accessed 2026-08-15
- Klein, "Performing a Project Premortem", HBR 85(9), September 2007 — https://hbr.org/2007/09/performing-a-project-premortem — accessed 2026-08-15 (abstract only; full text paywalled, so the procedural detail is cited from https://en.wikipedia.org/wiki/Pre-mortem)
- https://sre.google/sre-book/postmortem-culture/ and https://sre.google/workbook/postmortem-culture/ — accessed 2026-08-15 (trigger criteria; stated cost)
- https://en.wikipedia.org/wiki/Orthogonal_defect_classification — accessed 2026-08-15
- "Useful Memories Become Faulty When Continuously Updated by LLMs", arXiv 2605.12978v1 — accessed 2026-08-15 (consolidation degrades utility below the no-memory baseline; gate consolidation explicitly)
- "Beyond Single-shot Writing: Deep Research Agents are Unreliable at Multi-turn Report Revision", arXiv 2601.13217v1 — accessed 2026-08-15 (agents regress on 16-27% of previously covered content and citation quality; not resolvable by prompt engineering or a dedicated revision sub-agent)
- "HALLMARK: Diagnosing Three Failure Modes in LLM Citation Verifiers", arXiv 2607.18360v1 — accessed 2026-08-15 (false-positive rate, not recall, decides deployability; agentic lookups buy recall and inflate false positives)
- https://raw.githubusercontent.com/obra/superpowers/main/docs/superpowers/specs/2026-06-09-sdd-task-scoped-review-dispatch-design.md — accessed 2026-08-15 (measured review-merge economics; the evidence rule; run-to-run variance forcing ranges)
- https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/analyze.md — accessed 2026-08-15 (read-only capped consistency pass; checklists as unit tests for requirements, reviewer-owned)
- https://raw.githubusercontent.com/github/spec-kit/main/.pre-commit-config.yaml — accessed 2026-08-15 (the most document-centric project surveyed runs formatting hygiene only, with the opinionated rules disabled)
- https://agents.md/ — accessed 2026-08-15 (no guidance on file size, length, or pruning)
- https://www.acquisition.gov/far/52.215-8 — accessed 2026-08-15 (order-of-precedence precedent; within one instrument only)
