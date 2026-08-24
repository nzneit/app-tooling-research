# YYYY-MM-DD: topic (intake)

**Status**: open
**Owner**: who owes the answer — split it if different items have different owners

<!-- ─────────────────────────────────────────────────────────────────────────────
HOW TO USE THIS TEMPLATE (delete this block when you instantiate it)

An intake file is a form someone else fills in. It is not a place to think out loud.
Every rule below exists because a real file broke it and cost an answer.

ONE ITEM = ONE ANSWERABLE QUESTION.
  An item that asks two things in prose gets one answer. This is not a hypothesis:
  in intake/2026-08-22-0160-recorder-facts.md, item c asked four things and NUMBERED
  them, and got four answers; items a, e and i each asked two things in a sentence,
  and each came back answering the first half only. If an item has parts, number the
  parts. If it has more than about three, it is two items.
  The failure mode is worse than a missing answer: an under-answered item reads as
  closed, and its unanswered half becomes a silent assumption in a report.

TWO KINDS OF ITEM, TWO SHAPES.
  A FACT item asks for something only the app team knows — a size, a version, a rate,
  what already exists. There are no options to offer. What it MUST carry instead is
  the assumption the work will proceed on if it goes unanswered (D-0004), so the cost
  of skipping it is visible at the moment of skipping.
  A RULING item asks for a choice. It carries what is true today, numbered options,
  and a recommendation. Offering a choice without a recommendation is not neutrality;
  it is handing back the analysis the asker was supposed to do.

STATE WHAT IS TRUE TODAY, WITH A CITATION.
  Options argued from memory are hypothetical. Pin the current behaviour to a file
  and a line, or to the decision that ruled it. This is what makes an option list
  honest, and it is usually where the asker discovers the question is wrong.

NAME WHO INHERITS THE ANSWER.
  Which tracks, reports, decisions and assumptions move when this is answered? An
  answer with an unenumerated blast radius gets ratified without being chosen.

PRE-DECLARE THE ACCEPTABLE NON-ANSWERS.
  "I don't know" and "nobody has measured" are answers, and useful ones — they
  convert a hidden assumption into a declared one. Say so in the item, or the owner
  will leave it blank instead. (0160 item l did this and got a clean, usable answer.)

DO NOT BUNDLE A BOUNDARY BEHIND AN ARROW.
  If an item's resolution quietly accepts several boundaries at once, it is not a
  form anyone can answer, and it is the shape in which a boundary gets accepted
  without being chosen. Split it, and give each part its own options.

WHEN THE ANSWERS ARRIVE — the part that is easy to get wrong:
  1. Re-read each item's question CLAUSE BY CLAUSE against the answer. Every clause
     that went unanswered stays open and is named. Do not infer the rest: a described
     mechanism is not a ruled policy, an available identifier is not a permitted one,
     a defined format is not a runtime guarantee. All three of those are real
     examples from one round of answers.
  2. An answer OUTSIDE the options is a first-class outcome, not a rejection of the
     form. Both this repo (2026-08-15 item a — "neither reading this item offered")
     and its sibling repo have had one, and in both cases specifying the new option
     surfaced a defect that neither the original design nor the offered alternatives
     contained. Specify it before recording it.
  3. Record a DELEGATED answer as delegated. If the owner says "no preference" and
     the agent decides, the entry says so and names the evidence it decided on.
  4. Update the header note: what resolved, what was allocated, what came back
     PARTIAL, and what is still open.
───────────────────────────────────────────────────────────────────────────── -->

One paragraph: what this file is for, which work it gates, and what proceeds anyway
under declared assumptions if it is not answered. Name the items that block something
and the items that merely improve it — an owner triages a form, and a form that reads
as uniformly urgent gets answered uniformly late.

**Answering**: append a paragraph under an item, starting `YYYY-MM-DD update — `.
Partial answers are fine and so is "I don't know" — both are recorded as answers. You
are not limited to the options; a better third option is a good outcome. If an earlier
paragraph in this file is now wrong, mark it superseded in place rather than leaving it
to contradict the new one, the way [DECISIONS.md](../DECISIONS.md) handles a superseded
entry.

## a — a fact only the app team has, phrased as a question

Why the work needs it: which figure, design, or verdict is computed from it, and how
the answer changes the outcome. One or two sentences — an item nobody can see the
consequence of is an item nobody prioritises.

**If unanswered, the work assumes**: the assumption a report will declare in its place
under D-0004, with its consequence if wrong. State the assumption you would actually
make, not a placeholder — this line is what lets the owner decide the item is not worth
their time, which is a legitimate outcome.

→ Resolution: updates facts/app-profile.md (which section) and/or allocates D-####

## b — a choice someone must make, phrased as a question

**Today**: what is true right now, cited — `path/to/file.md:120-134`, or the D-####
that ruled it. If the answer would change existing behaviour, this is the line that
says what behaviour.

Why it is contested: the tension in one or two sentences. If there is no tension, it
is a fact item, not a ruling.

**Options**
1. **Short name** — what it means, and its consequence.
2. **Short name** — what it means, and its consequence.
3. **Short name** — what it means, and its consequence.

**Recommendation**: 2 — why it wins, and why each of the others loses. A recommendation
that only argues for its own choice makes the alternatives look unexamined.

**Who inherits this**: the tracks, reports, decisions and assumptions that move when
this is answered — including anything already accepted that would need marking
superseded.

→ Resolution: the ruling → allocates D-#### / updates facts/app-profile.md
