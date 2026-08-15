# 0140-supply-chain — research plan

**Status**: draft

## Goal

Decide which OSS tool or combination the app uses to detect dependency and supply-chain
risk, and how that detection is enforced in CI, given two app-specific complications. The
pseudo-monorepo has a **single root package.json and one lockfile** for every source
directory, so there is no natural per-area blast-radius attribution when a scanner reports
a hit. And internal imports use an **`@appname` scope that is not a real npm scope**,
which is a live dependency-confusion exposure if a real package ever claims that name. The
track must land on a concrete gating policy — what severity blocks CI versus what only
reports, how no-fix-available and transitive-only findings are handled without training
engineers to suppress the gate on sight, and whether escape hatches carry expiry — and
must decide how scanning composes with automated update tooling so neither silently
assumes the other did the job. It must also resist its own framing trap: **supply-chain
risk is not synonymous with CVE matching.** Known-vulnerability scanning, package
provenance and signature verification, and install-time malicious-package heuristics are
three distinct controls, and a recommendation covering only the first must say so plainly
rather than implying coverage it does not have. The high volume of agent-authored commits
sharpens all of this, because dependencies can be added with only as much scrutiny as CI
provides.

## Key questions

1. **Signal-to-noise for a browser bundle** — mqtt.js, the contract tooling, and their
   transitive dependencies will surface CVEs that live in server-only code paths the
   browser bundle never executes. Which candidates distinguish "reachable in this app"
   from "present in the lockfile" well enough to gate on, without accreting a large
   permanent allowlist?
2. **No per-area attribution** — with one lockfile for the whole pseudo-monorepo, how does
   a finding get traced back to which `@appname/*` area actually pulls in the vulnerable
   transitive dependency, so it reads as actionable rather than "somewhere in the tree"?
3. **Dependency confusion on the `@appname` scope** — is `@appname` registered or
   squattable on the public registry today, and can a cheap CI invariant (a registry
   query, an `.npmrc` scope pin, or a lockfile registry-resolution assertion) guarantee on
   every run that `@appname/*` never resolves to a real installed package instead of the
   tsconfig alias? This also has a review-legibility dimension: an `@appname/...` import is
   visually identical to a real scoped package in a diff, so the invariant is what makes
   "this scope is never real" checkable rather than remembered.
4. **Provenance and signatures, now that the obvious tool is gone** — the control is still
   distinct from CVE matching and still worth having, but `npm audit signatures` is
   eliminated (it verifies npm's own install provenance, meaningless against a bun-managed
   tree). So: does **bun** offer any equivalent integrity or provenance verification of its
   own, does Sigstore attestation verification exist as a standalone OSS path, or is
   provenance simply **unavailable** in this stack today? "Unavailable, and here is what
   that leaves uncovered" is an acceptable and useful answer — silently dropping the control
   because its tool vanished is not.
5. **Lockfile-only versus install-time scanning** — since agent-authored changes can add
   dependencies as routine authorship, is scanning the committed lockfile in CI
   sufficient, or does the risk of a newly published malicious or typosquatted package
   justify an install-time guard or a local heuristic scanner as a second layer?
6. **Keeping the single-lockfile property, now that it holds** — the drift hazard this
   question was written for is **retired**: bun alone manages dependencies, the text
   `bun.lock` is the only tracked lockfile, and no `package-lock.json` exists
   (facts/app-profile.md). So there is no second lockfile to go stale and no npm-shaped
   scanner can report green against a tree bun never installed. What remains is preserving
   that property: a stray `npm install` by a person or an agent would generate a
   `package-lock.json` and silently recreate exactly the failure mode — a lockfile that looks
   authoritative, is scannable by the tools people reach for reflexively, and describes a
   tree nothing actually installed. Is a CI invariant asserting no `package-lock.json` (and
   no `yarn.lock`/`pnpm-lock.yaml`) worth its one line? It is prevention rather than
   remediation now, which makes it cheap — the same ratified-rule-plus-drift-test shape as
   D-0020, applied before the defect exists rather than after.
7. **Offline database with periodic sync — a stated preference, so design for it** — outbound
   access is believed available, but the preferred model is an **offline vulnerability
   database fed by a periodic sync** (facts/app-profile.md). So candidates are scored on their
   offline story, not merely their online behaviour: how the database is obtained and
   refreshed, its size, whether all ecosystems are covered offline, and how a sync from a
   connected machine into an internal store would actually be wired. Attached hazard, and the
   reason this is a key question rather than a deployment note: **a stale database and a clean
   repository produce identical output.** Does each candidate warn when its database is old,
   and can CI assert database freshness as a hard gate? Pair this with the parse-verification
   assertion from the candidates section — together they are the difference between "the scan
   passed" and "the scan actually happened against current data".
8. **The tool already paid for** — the organisation **already licenses and uses Snyk**, while
   reporting that it cannot configure it properly for this repository and is not committed to
   keeping it. Whether this track may evaluate it at all is a D-0003 boundary ruling, requested
   as intake [2026-08-14-supply-chain-gates](../../intake/2026-08-14-supply-chain-gates.md)
   item d. Assuming evaluation is permitted, the question is not merely "is Snyk good" but
   **"is the right answer to configure what you own, or to replace it"** — a materially better
   question than the one this track started with, and one whose answer may be forced by
   mechanics rather than preference: the repo is bun-only, and if Snyk cannot parse `bun.lock`
   then the reported configuration difficulty has a concrete cause and the choice makes itself.
   Whatever the ruling, the track should name an OSS path regardless, so the program does not
   become dependent on a licence it does not control.
6. **No-fix and transitive-only findings** — what disposition applies to advisories with
   no available fix or that are transitive-only: block, warn with expiry, or report only?
   Who re-triages when a fix later ships, so the gate does not simply get suppressed?
7. **Gate severity, and whose severity score** — does CI hard-block on critical and high
   (using OSV's rating, npm's, or the original advisory's, which can disagree), or report
   into a dashboard instead, given oxlint, the ESLint lane, and Biome already compete for
   the same CI budget?
8. **Composition with update tooling** — with no workspaces and one root manifest, do
   Dependabot's or Renovate's update PRs and grouping rules work correctly against this
   layout? Does merging an update PR count as remediation on its own, or must the scanner
   re-run and confirm?
9. **Reporting path under GitHub Actions — and a confirmed paid-tier trap.** CI is
   **GitHub Actions** (facts/app-profile.md), which settles part of this and sharpens the
   rest. **Code scanning, the destination that makes SARIF valuable, is free on public
   repositories and requires the paid Code Security / Advanced Security add-on on private
   ones**, so on a private app repo the SARIF advantage credited to OSV-Scanner, Trivy, and
   dependency-cruiser is **unusable under D-0003**. Repo visibility is asked as intake
   [2026-08-14-version-gates](../../intake/2026-08-14-version-gates.md) item c. The same gate
   catches `dependency-review-action`, which is easy to mistake for a free Dependabot feature
   and is not. So: which candidates degrade gracefully to the reporting primitives that are
   free on every plan — exit codes, `$GITHUB_STEP_SUMMARY` job summaries, `::error`/`::warning`
   workflow-command annotations, and PR comments via the default `GITHUB_TOKEN` — and does any
   candidate's value collapse without the alerts UI (dismissal workflow, cross-run
   deduplication)? **Retired by this same research**: Dependabot alerts, security updates, and
   version updates are documented as included on every plan for every repository and sit
   outside Advanced Security, so Dependabot does not share the paywall.

## Candidates

**2026-08-14 — the bun lockfile eliminated five candidates before the survey started, and
the format question then resolved favourably.** Bun alone manages dependencies here, and the
tracked lockfile is the **text `bun.lock`** with no `package-lock.json` present
(facts/app-profile.md). Bun has two formats and every tool draws its support line at exactly
that boundary — the binary `bun.lockb` is unreadable to essentially everything, the text
format is widely supported — so this repo sits on the workable side and **no lockfile
migration is needed before the track can proceed**. The five eliminations below still stand:
they fail on requiring an npm- or yarn-shaped lockfile, which no bun format satisfies.

**A standing hazard for every surviving candidate.** A scanner that cannot parse the lockfile
tends to report **zero findings rather than an error**, which is indistinguishable from a
clean repository. This is documented, not hypothetical — Grype v0.110.0 did exactly that on a
bun.lock. So minimum-version pinning, and a positive assertion that the scanner actually read
the file (a parsed-package count, not merely a zero exit code), are part of any
recommendation this track makes rather than an operational afterthought.

**Live candidates:**

- OSV-Scanner — https://github.com/google/osv-scanner — lockfile and SBOM matching against OSV.dev, SARIF output, no account (2.5.0, 2026-08-07, Apache-2.0). **bun.lock supported since v2.0.0 (Mar 2025)**. Has a documented offline mode, which matters given on-prem runners
- Trivy — https://github.com/aquasecurity/trivy — filesystem, lockfile, image and misconfiguration scanning (0.74.0, 2026-08-14, Apache-2.0). **bun.lock supported since v0.63.0 (May 2025)**, though parser bugs persisted into 2026 — verify against a real lockfile
- Grype + Syft — https://github.com/anchore/grype · https://github.com/anchore/syft — scanner plus SBOM generator. **bun.lock support only landed 2026-06-09** (Syft PR #4625). **Carries a silent-failure hazard: Grype v0.110.0 returned zero vulnerabilities with no error on a bun.lock** — a false negative, not a crash. Pin recent versions and verify the count is real
- Renovate — https://github.com/renovatebot/renovate — automated update PRs; **mature bun manager since 2024 and handles both lockfile formats** by delegating to the bun CLI rather than parsing bytes. Its position strengthens considerably given Dependabot's gap below. **AGPL-3.0 — flag the copyleft** (44.30.2, 2026-08-14)
- Dependabot — https://github.com/dependabot/dependabot-core — **status materially corrected**: bun **version updates** are GA (since April 2025, text lockfile only), but **security updates are marked Not Supported for bun**, and Bun is absent entirely from GitHub's Dependency Graph ecosystem table — so **no Dependabot alerts fire for a bun manifest**. It delivers dependency freshness, not vulnerability coverage. It cannot be this track's security answer
- guarddog — https://github.com/DataDog/guarddog — local heuristic scanner for malicious and typosquatted packages, entirely offline. **Unaffected by the lockfile question** — it scans named packages, never a lockfile (Apache-2.0)
- npq — https://github.com/lirantal/npq — install-time guard. **Bun support is undocumented**; documented passthrough covers yarn and pnpm only. Verify before relying on it (3.26.0, 2026-08-13)

**Eliminated by the bun lockfile fact — recorded so the survey does not re-derive them:**

- **npm audit** and **npm audit signatures** — both hard-require a package-lock or shrinkwrap; `--no-package-lock` resolves fresh from the registry, ignoring what bun actually installed. `audit signatures` verifies npm's own install provenance, which is meaningless against a bun-managed tree. This also removes the provenance control Key question 4 was built around, so that question is re-aimed below
- **audit-ci** — confirmed broken on bun (issue #344); its own documented workaround is exporting to a Yarn v1 lockfile and auditing that
- **better-npm-audit** — wraps `npm audit`, inherits the same requirement; also ~2 years since its last publish
- **lockfile-lint** — `--type` accepts only `npm` or `yarn`; it does not even support pnpm

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

| Criterion | Weight |
|---|---|
| License | high — Renovate is AGPL-3.0 and worth flagging even for self-hosted CLI use; D-0003 bars hosted-account and server products, so licence and distribution model gate candidates before anything else |
| Maintenance health | high — a stale vulnerability database or unmaintained scanner produces silent false negatives, which is worse than no scanner; two candidates show npm publish gaps of 12–23 months despite live repos |
| TypeScript fit | n-a — these read lockfiles and manifests, never TypeScript source |
| Browser compatibility | n-a — they run in CI and never ship; whether a flagged CVE reaches the browser build is scored under Output quality instead |
| Contract-format support | n-a — orthogonal to advisory scanning |
| Integration cost | high — one root manifest, unknown package manager, and unknown CI provider make wiring cost vary a lot between candidates |
| Runtime overhead | medium — not shipped-code overhead, but CI time matters because database downloads and scan duration contend with the existing lint budget |
| Output quality | high — false-positive rate and reachability precision decide whether the gate stays trusted or gets trained into reflexive suppression |
| Escape hatch | medium — spec meaning, the cost of removing the tool later: most candidates are a single CI step with no code coupling, so exit cost is genuinely low. The separate question of whether *findings* can be permanently silenced is Key question 6, scored under Output quality |

## Facts needed

- CI provider — **resolved: GitHub Actions** (facts/app-profile.md), so Dependabot is eligible in principle
- **The app repository's visibility — public or private.** This is load-bearing and is *not*
  answered by knowing the CI provider. GitHub code scanning, the destination that makes SARIF
  output valuable, is free on public repositories but gated behind paid GitHub Advanced
  Security on private ones. Several candidates here were credited for SARIF output; if the app
  repo is private and unlicensed for GHAS, that advantage is unusable under D-0003 and those
  tools fall back to exit codes, job summaries, and PR comments. The same question affects
  which Dependabot features are free. (Note: the *research* repo is public; the app repo's
  visibility is a separate and currently unknown fact.)
- Package manager and lockfile format (npm, pnpm, or yarn) — decides which audit-based candidates apply
- Whether `@appname` is an unregistered scope or already owned by the team — needed before the dependency-confusion invariant can be written
- Whether Dependabot or Renovate runs today — greenfield versus must-integrate
- Whether any internal or proxied registry is in place — changes the dependency-confusion mitigation entirely
- CI budget and runner type — every scanner pulls a vulnerability database per run unless cached
- Whether an SBOM is a required deliverable elsewhere — tips Syft plus Grype over OSV-Scanner alone
