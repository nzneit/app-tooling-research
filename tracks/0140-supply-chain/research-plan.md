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
4. **Provenance and signatures as a distinct control** — beyond CVE matching, what does
   verifying package provenance buy here? `npm audit signatures` verifies registry
   signatures and Sigstore-backed provenance attestations for packages that publish them,
   at no cost and with no new dependency. What fraction of this app's tree actually
   publishes provenance, and is a provenance check worth gating on, reporting on, or
   skipping?
5. **Lockfile-only versus install-time scanning** — since agent-authored changes can add
   dependencies as routine authorship, is scanning the committed lockfile in CI
   sufficient, or does the risk of a newly published malicious or typosquatted package
   justify an install-time guard or a local heuristic scanner as a second layer?
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
9. **Fit with an unknown CI provider** — which candidates' output (SARIF, plain JSON, or
   exit code only) integrates without assuming GitHub-native features, and does the answer
   change if CI turns out to be GitHub Actions specifically?

## Candidates

- OSV-Scanner — https://github.com/google/osv-scanner — matches the lockfile (and SBOMs) against the OSV.dev database with SARIF output, no account required (2.5.0, 2026-08-07, Apache-2.0)
- npm audit — https://docs.npmjs.com/cli/v10/commands/npm-audit — built into the npm CLI, checks the lockfile against the GitHub Advisory Database; no independent release cycle (npm 12.0.2, 2026-07-29)
- npm audit signatures — https://docs.npmjs.com/cli/v10/commands/npm-audit — the **provenance and signature** control, distinct from CVE matching: verifies registry signatures and Sigstore-backed provenance attestations; already bundled, zero new dependency
- audit-ci — https://github.com/IBM/audit-ci — CI wrapper turning audit output into a pass/fail exit code with severity thresholds and an allowlist (7.1.0, npm 2024-07-03; repo pushed 2025-09-17 — publish gap to weigh under maintenance health)
- better-npm-audit — https://github.com/jeemok/better-npm-audit — adds per-advisory ignore rules **with expiry dates**, directly relevant to Key question 6 (3.11.0, npm 2024-09-09; repo actively pushed 2026-07-20)
- Trivy — https://github.com/aquasecurity/trivy — general-purpose scanner covering filesystem, lockfile, image, and misconfiguration, SARIF output, fully free CLI (0.74.0, 2026-08-14, Apache-2.0)
- Grype — https://github.com/anchore/grype — vulnerability scanner for filesystems and SBOMs, usually paired with Syft (0.117.0, 2026-08-10, Apache-2.0)
- Syft — https://github.com/anchore/syft — SBOM generator (CycloneDX/SPDX) feeding Grype (1.51.0, 2026-08-10, Apache-2.0)
- lockfile-lint — https://github.com/lirantal/lockfile-lint — validates lockfile integrity and asserts every resolved package comes from an expected registry host; the cheap CI invariant candidate for Key question 3 (5.0.1, 2026-08-13, Apache-2.0)
- npq — https://github.com/lirantal/npq — install-time guard running heuristic and advisory checks (typosquatting, new or unmaintained packages, install scripts) before packages land on disk; basic use needs no API key (3.26.0, 2026-08-13, Apache-2.0)
- guarddog — https://github.com/DataDog/guarddog — local static and heuristic scanner flagging malicious or typosquatted packages entirely offline (Apache-2.0, repo pushed 2026-08-14)
- Renovate — https://github.com/renovatebot/renovate — self-hostable CLI for automated update PRs with fine-grained grouping; **AGPL-3.0, flag the copyleft** (44.30.2, 2026-08-14)
- Dependabot — https://github.com/dependabot/dependabot-core — GitHub-native update PRs and security alerts; engine is MIT and free, but only applies if the repo is hosted on GitHub

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
