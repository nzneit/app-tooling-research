# 2026-08-23: does the README frontier get a bound? (intake)

**Status**: open
**Owner**: the user (this is a repo-machinery ruling, not an app fact)

One ruling item, raised by the **machinery lens** of 0160's acceptance gate (D-0033's second lens,
which attacks the conventions rather than the artifacts). It gates nothing: no track waits on it, and
the answer changes only how this repo's entry point is written from here on. It is raised now because
the gate measured a number that had never been measured, and because the same session that grew the
frontier by 6,584 characters also wrote a decision (D-0042) that priced its own 55-word addition to
`CLAUDE.md` — so the discipline exists and this surface escaped it.

**Answering**: append a paragraph under the item, starting `2026-MM-DD update — `. You are not limited
to the options; a better third option is a good outcome.

## a — is the README frontier bounded, and if so how?

**Today**: `README.md` line 11 is **12,510 characters** on one line — **75% of the whole file**
(16,634 bytes) — and about forty sentences. Its history: **336** characters on 2026-08-14 (`8ca332a`),
**6,434** before this track (`bf91589`, 2026-08-18), **12,510** today. The 0160 segment alone, from
"**0160-flight-recorder is chartered (D-0040)**" to the end, is **6,584** characters — 53% of the line,
added by one track.

`CLAUDE.md:8` makes it always-loaded: *"Start by reading `README.md` — its track table and one-line
**Frontier** pointer say where the program stands and what is next."* The program design spec calls it
*"a one-line frontier pointer names the next action"*. `checkFrontier` in `scripts/check-docs.ts`
asserts only that a line matching `> **Frontier:**` exists — **existence, never a bound** — so it is the
check that gives the appearance of governing this surface while bounding nothing.

Why it is contested: **D-0029** rules that always-loaded bytes are ceiling-free but *"must still be
priced and reported… ceiling-free is not cost-free, and a report that omits that price is incomplete."*
Under that discipline the 9900 report **cut twelve proposed controls** because their always-loaded
proposals would have consumed 74–122% of the headroom, and D-0042 priced a 55-word `CLAUDE.md` bullet
in its own ledger entry. Meanwhile the frontier grew 37× unpriced. The counter-argument is real and
should be stated: the frontier has been genuinely useful at this length — it is the one place a new
session learns not just *what* is next but *why the last three findings changed the shape of it*, and
several of this program's course corrections are legible only there. Compressing it is not free.

**Options**
1. **Price it, bound it at a character cap, move the narrative into the tracks.** `checkFrontier` gains
   a cap (a rung-0 validator check: ceiling-free under D-0029, no new workflow stage). The frontier
   returns to a pointer — what is next, and where to read why — and each track's own report or a
   per-track "state of play" section carries the narrative. Cost: a real editing pass now, and every
   future session pays the discipline of choosing what belongs.
2. **Price it and leave it unbounded.** Every acceptance entry from here on states what the track added
   to the frontier, the way D-0042 stated its `CLAUDE.md` price. No validator change, no editing pass,
   and the number becomes visible in the ledger where the growth can be argued about case by case.
3. **Split the surface**: `README.md` carries a genuine one-line pointer, and a new `FRONTIER.md` carries
   today's narrative in full, linked from it and *not* always-loaded. Keeps everything that has been
   useful, and moves the recurring per-session cost off the entry point onto whoever chooses to open it.

**Recommendation**: **3**, with **2** as the fallback if you would rather not add a file. The narrative
is the part that has demonstrably worked — it is how a compacted session recovers the program's actual
state — and (1) would delete value to satisfy a rule about where bytes live rather than whether they earn
their place. (3) satisfies D-0029 exactly: the always-loaded cost drops back to a pointer, the content
survives at full length, and a reader who needs the why opens one link. (2) is honest and costs nothing
today, but it prices a number without bounding it, and on the current trend the entry point is mostly
frontier within two more tracks.

A caution about the cap in (1), measured rather than assumed: per D-0037's rule — run the proposed check
over the corpus and count hits before writing it — a character cap scores exactly **one** hit today at
any threshold between ~700 and 12,510. That is a real hit count, unlike the other four checks this gate
measured (all zero), but a threshold is a ruling, not something a checker should invent.

**Who inherits this**: `README.md`, `scripts/check-docs.ts` (only under option 1), `CLAUDE.md`'s
description of the entry point, the program-design spec's "one-line frontier pointer" language, and every
acceptance entry from here on (under options 1 and 2, which both add a pricing line).

→ Resolution: the ruling → allocates a D-#### if it changes the convention; updates README.md
