---
name: design-panel
description: Run a grounded design panel — parallel variants under opposing constraints, judged against a stated default. Use when choosing a shape that will be hard to change later: a module interface, a document template, a process convention, a schema. Not for decisions with an obvious answer.
---

# Design Panel

Your first idea is unlikely to be the best, and a single agent asked to "design X" will
produce one idea wearing a confident voice. A panel produces genuinely different designs by
forcing each proposal to serve a *different master*, then makes the choice explicit rather
than averaging them.

This generalises Ousterhout's design-it-twice from code interfaces to any artifact whose
shape is expensive to change. For **code interfaces specifically**, the vendored
[codebase-design skill](../codebase-design/DESIGN-IT-TWICE.md) is authoritative — it carries
the deep-module vocabulary (module, seam, adapter, leverage) and the four canonical interface
constraints. Use it for those, and use this for everything else: templates, conventions,
schemas, validator rules, workflow shapes. Those files are vendored verbatim under D-0017 and
**must not be edited**; this skill is a sibling, not a patch.

## When not to use it

A panel costs several agents and a round of latency. Skip it when the answer is already
determined by a constraint, when the artifact is cheap to change later, or when the real
problem is that nobody has gathered the evidence yet — in that case do the grounding and stop,
because a panel over an empty evidence base produces three confident guesses.

## The three phases

### 1. Ground (parallel, before any proposal)

Do not let variants invent the problem. Establish it first, in parallel:

- **Audit actual usage.** How is the thing used *today*, with counts and citations, not
  impressions. What shapes actually occur? Where has it already failed? This is the phase most
  often skipped and most often decisive — it is what separates a design from a preference.
- **Survey comparable systems.** How have others solved this, and what did they learn? Name
  which mechanisms depend on tooling this project will not adopt.

Both outputs feed every variant **identically**, so the variants differ by stance and not by
information. Ask the audit for findings that cite an observed instance, and say explicitly that
speculative wishes are out of scope — otherwise it returns a wish list.

### 2. Propose (parallel, opposing constraints)

Spawn 2–4 variants. The constraints must be **opposing, not merely different** — each variant
should be able to argue the others are wrong. Two well-opposed variants beat four overlapping
ones; scale up only when the space genuinely has more than two poles.

Every variant returns:

1. Its **stance** in a few sentences — the principle it is serving.
2. The **complete artifact**, ready to use. Not a sketch, not a description of one. A proposal
   you cannot adopt verbatim is not finished.
3. A **worked example** of the artifact in use.
4. **What it refuses** — the things it deliberately does not include, and why. This is the
   highest-signal field: a variant that refuses nothing has no stance, and you will see that
   immediately.
5. Downstream impact: what else must change if this wins.

### 3. Judge (one agent, with a stated default)

Give the judge an explicit **default and burden of proof**, or it will split the difference and
produce a design nobody argued for. Say which way it should lean and what would have to be true
to overcome that. Require it to name specifically which rejected elements it rejected and why —
a judge that only praises the winner has not judged.

The judge may synthesise a third option, but the synthesis must inherit a stance rather than
average two.

Deliver: verdict, reasoning, the final artifact verbatim, downstream changes, and
**what it deliberately leaves unsolved** — so open problems are recorded rather than forgotten.

## Rules that make it work

- **Record deviations.** If you use fewer variants than a pattern mandates, or add a phase,
  say so as a ruling with a reason. Silent adaptation is how a convention drifts into folklore;
  this repo has already recorded one instance (9900 corpus, category I).
- **The panel's output must land in a durable file**, not only in a conversation. For spikes
  that file is the spike's `design.md`. For anything else, name the file before running the
  panel.
- **Structure the outputs.** Ask for the artifact as a discrete field so it can be written to
  disk unedited, rather than fished out of prose.
- **Ceremony is a cost.** Panels bias toward elaborate answers, because a variant proposing
  "change almost nothing" feels like a wasted agent. Counter it in the judge's default when the
  artifact governs recurring work.

## Related practices in this repo

Three sibling practices are currently undocumented and get re-derived from context each time —
adversarial review, the completeness critic on survey workflows, and the candidate gap sweep.
Track 9900-process-design owns the question of whether they get the same treatment. Until they
do, treat their absence as known debt rather than evidence they are unimportant.
