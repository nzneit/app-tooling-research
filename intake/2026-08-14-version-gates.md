# 2026-08-14: version and visibility gates (intake)

**Status**: open
**Owner**: app owner

The facts supplied on 2026-08-14 unblocked a great deal, and in doing so sharpened what
remains into a small set of specific version questions. Each of these now gates a concrete
fork in a drafted track plan — none is a general "nice to know". They are collected here so
they can be answered in one pass.

## a — Vite major and `@vitejs/plugin-react` major

Which Vite major does the app run, and which major of `@vitejs/plugin-react`?

This is the sharpest remaining question in the program, because the React Compiler install
path forks on it and the fork is binary. **`@vitejs/plugin-react` 6.0.0+ requires Vite 8.0.0+
and carries no internal Babel**, so the compiler must be wired through `@rolldown/plugin-babel`
with the `reactCompilerPreset` helper. **Plugin 5.x and earlier bundles Babel** (its peer range
spans Vite 4.2 through 7.x) and uses the legacy `react({ babel: { plugins: [...] } })` option.
Timeline for orientation: Vite 8 released 2026-03-12 (now 8.2.1), Vite 7 mid-2025, Vite 6
late 2024 — majors land roughly every 7–12 months, so a mid-life app could plausibly be on any
of the three.

Two smaller things ride along on the same answer. Native `resolve.tsconfigPaths` exists only
from Vite 8 and only left experimental in 8.2 — so on **any Vite ≤7 the `vite-tsconfig-paths`
plugin is still required** to resolve the `@appname/*` aliases (it works fine without
`baseUrl`). And vitest 4.x's peer range spans Vite 6, 7, and 8, so the vitest assumption is
safe once the major is known.

→ Resolution: the answer → updates facts/app-profile.md (Stack) and selects 0110's install
path outright
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.

## b — Node version

Which Node version does the app build and test on?

It has become a second gate on item a rather than a standalone curiosity: Vite tightened its
engines between 6 and 7 to `^20.19.0 || >=22.12.0`, dropping Node 18 — so a Node 18 app cannot
be on Vite 7 or 8, which in turn settles the React Compiler path. It also decides knip
compatibility (engines `^20.19.0 || >=22.12.0`) and MSW's floor (`>=18`).

→ Resolution: the answer → updates facts/app-profile.md (Stack) and constrains item a
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.

## c — is the application's repository public or private?

Note this asks about the **application's** repository, not this research repo (which is
public).

It gates a reporting path several 0140 candidates were credited for. **GitHub code scanning —
the destination that makes SARIF output valuable — is free on public repositories but requires
the paid Code Security / Advanced Security add-on on private ones.** Under D-0003 that makes
SARIF upload unusable on a private repo, and OSV-Scanner, Trivy, and dependency-cruiser would
fall back to exit codes, job summaries, and PR comments — all free and all adequate, but a
materially different evaluation. The same gate catches `dependency-review-action`, which is
easy to mistake for a free Dependabot feature and is not.

It also sets the CI runner size, which matters more than usual now: standard runners are
4-core/16 GB for public repos and **2-core/8 GB for private** — relevant to the knip and
type-aware-lint memory risk at 150k LOC.

Good news that does **not** depend on this answer: Dependabot alerts, security updates, and
version updates are documented as included on every plan for every repository, public or
private, and sit outside Advanced Security entirely.

→ Resolution: the answer → updates facts/app-profile.md (Environment) and settles 0140's
reporting-path evaluation
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.

## d — package manager, and test framework

Which package manager (npm, pnpm, or yarn) and which lockfile format? And is the test
framework in fact vitest?

Lower stakes than the above but still load-bearing in places: the package manager decides
which of 0140's audit-based candidates apply at all, and the test framework has been an
assumption since Wave 2 (it is now a strong inference from Vite, but still an inference).

→ Resolution: the answer → updates facts/app-profile.md (Stack, Environment) and retires two
long-standing assumptions
Answer here: when this item is resolved, append a new paragraph below it, starting
`YYYY-MM-DD update — `.
