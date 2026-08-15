# 2026-08-14: supply-chain gating facts (intake)

**Status**: open
**Owner**: app owner

Answering the version gates surfaced three follow-on questions, each of which decides part
of track 0140's evaluation rather than merely informing it. All three are lookups rather
than judgements — someone with repo or enterprise access can settle them in minutes.

## a — which bun lockfile format is committed: `bun.lock` or `bun.lockb`?

This is the single gating fact for the whole track. Bun has two formats and nearly every
tool draws its support line at exactly that boundary: the **binary `bun.lockb`** (Bun's
default before 1.2) is unreadable to essentially every scanner, while the **text/JSONC
`bun.lock`** (opt-in from Bun 1.1.39, default from 1.2 onward) is broadly supported.

On **text**, the live candidate list is OSV-Scanner, Trivy, Grype+Syft, Renovate, guarddog,
and Dependabot-for-freshness. On **binary**, that list collapses to Renovate, knip, and
guarddog — and the track's recommendation becomes substantially about migrating the lockfile
format before anything else. Bun converts with `bun install --save-text-lockfile`, so this
may be a cheap fix rather than a constraint, but the answer changes what the track is even
about.

→ Resolution: the answer → updates facts/app-profile.md (Stack) and either confirms or
collapses 0140's candidate list

2026-08-14 update — **resolved, on the favourable branch**: the tracked lockfile is the
**text `bun.lock`**, bun alone installs and manages dependencies, and there is **no
`package-lock.json` in the repo** (facts/app-profile.md). So the candidate list survives
intact — OSV-Scanner, Trivy, Grype+Syft, Renovate, guarddog, and Dependabot-for-freshness all
remain live — and no lockfile-format migration is needed before the track can proceed. It
also **retires the npm/bun drift hazard** that Key question 6 was written for: with no second
lockfile there is nothing to go stale, and no npm-shaped scanner can report green against a
tree bun never installed. That question is re-aimed at prevention rather than remediation.

## b — does the enterprise already license Code Security / Advanced Security for this repo?

Earlier framing treated code scanning as "paid, therefore excluded". That was imprecise:
D-0003 bars recommending a **purchase**, not using a capability the organisation already
owns. So this is an entitlement lookup, not a procurement question, and it is cheap to
settle two ways: the repository's **Settings → Advanced Security** toggle is greyed out only
when no license is available, and Enterprise billing carries an Advanced Security usage page.

If it is licensed, SARIF upload to code scanning is available and the alerts UI (dismissal
workflow, cross-run deduplication) comes with it. If not, OSV-Scanner, Trivy, and
dependency-cruiser all degrade gracefully to exit codes, `$GITHUB_STEP_SUMMARY` job
summaries, workflow-command annotations, and PR comments — free on every plan, and adequate.

A smaller related question rides along: **GitHub Enterprise Cloud or Enterprise Server?**
It does not change the code-scanning answer, but a GHES instance needs GitHub Connect
(outbound access to github.com) to sync the advisory database, so an air-gapped GHES would
break Dependabot alerts independently of everything else.

→ Resolution: the answer → updates facts/app-profile.md (Environment) and settles 0140's
reporting path
Answer here: when this item is resolved, append a new paragraph below it, starting
2026-08-14 update — SNYK is already licensed and used, but we really don't know how to configure
or use it properly for the repository and into SNYK's systems (I am not really married to it). 
GitHub Enterprise Cloud is what is used.

## c — can the on-prem runners reach the public advisory databases?

Do the self-hosted runners permit outbound HTTPS to `osv.dev` and equivalent vulnerability
databases, or is that segment restricted, proxied, or air-gapped?

Every lockfile scanner in the candidate list defaults to querying a public advisory API.
OSV-Scanner has a documented offline mode fed by a periodic database sync from a connected
machine, so a restricted network is a setup dependency rather than a blocker — but it
changes the operational shape of any recommendation. It also deserves an explicit answer
because the failure mode is quiet: a scanner that cannot reach its database may report zero
findings rather than an error, which reads exactly like a clean bill of health.

→ Resolution: the answer → decides whether 0140 recommends online scanning or an
offline-database sync job

2026-08-14 update — **resolved, as a preference rather than a constraint**: outbound access
is assumed available, but an **offline database fed by a periodic sync is the preferred
model**, and Trivy is believed to support it. So this is a design preference the
recommendation should satisfy, not a restriction it must work around — which raises the
weight of each candidate's offline story and of one specific hazard: a stale synced database
and a clean repository produce identical output, so database-freshness assertion becomes part
of the recommendation rather than an operational detail.

## d — does an already-licensed commercial tool fall under D-0003? (a ruling, not a lookup)

**This is a constraint-interpretation question and only the repo owner can settle it.** It
was created by the answer to item b: the organisation **already licenses and uses Snyk**.

D-0003 says shortlists contain "only free OSS runnable locally or in CI; no paid products",
and its stated **Why** is: *"Procurement is off the table for this effort."* Snyk is already
procured, so the *rationale* does not bar it while the *letter* does. The same tension
applies to GitHub Advanced Security if the enterprise turns out to hold it. This is the same
shape as D-0027's dependency ladder: a constraint whose boundary was never tested until a
real case arrived.

Three possible rulings. (i) **Letter holds** — D-0003 means what it says, 0140 shortlists
only OSS, and Snyk is out of scope for evaluation even though it is paid for; the track may
note it exists but may not recommend it. (ii) **Rationale holds** — already-licensed tools
are in scope precisely because no procurement is required, so 0140 must evaluate Snyk
alongside the OSS candidates and may recommend "configure what you already own". (iii)
**Asymmetric** — an already-licensed tool may be evaluated and recommended, but may not be
the *only* recommendation: the track must also name an OSS path, so the program never
becomes dependent on a licence it does not control.

Worth knowing while deciding: you said you are "not really married to it", and the reported
difficulty configuring Snyk for this repository may have a concrete cause rather than a
skills one — the repo is bun-only, and bun lockfile support is exactly where most scanners
draw their line. That is under verification. If Snyk cannot parse `bun.lock`, ruling (i) and
(ii) converge on the same practical answer.

→ Resolution: the ruling → allocates a `D-####` refining D-0003's boundary, and sets whether
0140 evaluates Snyk at all
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.
