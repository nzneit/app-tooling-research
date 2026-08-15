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
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.

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
`YYYY-MM-DD update — `.

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
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.
