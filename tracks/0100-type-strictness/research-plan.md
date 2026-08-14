# 0100-type-strictness — research plan

**Status**: draft — revision pending (see the note below); do not survey from this
version

> **2026-08-14 — this draft has known defects; a revision is queued on two scope calls.**
> An adversarial review found two critical and six important defects, and a subsequent
> layout-fact verification invalidated more. Recorded here so nobody surveys from a stale
> plan:
>
> - **Key question 1's "per-directory tsconfig layering" is not viable and must be
>   dropped.** Plain `tsc` searches *upward* from the invocation directory for one
>   config and never descends, so a nested `tsconfig.json` is inert for a root CI
>   typecheck — while VS Code, which walks upward from each *open file*, does honor it.
>   That is a silent editor/CI split-brain, not a layering mechanism. **Project
>   references** are the credible per-directory mechanism (they key on tsconfig, never
>   package.json, so the pseudo-monorepo layout is no obstacle), at the cost of
>   `composite: true`, forced declaration emit, and `tsc -b` build ordering.
> - **Key question 4 is stale in both directions.** oxlint's type-aware lane is stable,
>   not experimental, and covers 59 of 61 typescript-eslint type-aware rules — including
>   the entire `no-unsafe-*` family — so the question's disjunction has no true branch.
>   It is gated on TypeScript 7 compatibility (7.0.2 is GA as of 2026-07-08; the app is
>   on 5.9.3), but `oxlint-tsgolint` bundles its own typescript-go engine, so the gate
>   is **tsconfig compatibility, not a compiler-version bump** — concretely, `baseUrl`
>   was removed in TS 7 and is reported as an error. See intake item d.
> - **The threat model omits its dominant failure mode**: an agent editing the
>   *enforcement artifacts themselves* — tsconfig flags, allowlists, stored thresholds,
>   committed baselines, lint `overrides`, and in this layout the single root
>   `package.json` `scripts` block, where one edit blunts every gate at once. D-0020 is
>   this program's confirmed precedent. Also missing: declaration-site widening (moving
>   a field to `unknown` *raises* type-coverage while changing nothing), `as unknown as
>   T`, types that compile but lie, and laundering through excluded paths.
> - **Key question 8 is unanswerable here** (it asks for a measurement against the
>   inaccessible app repo, D-0004) and re-derives a branch already resolved.
> - **The rubric silently redefines "Escape hatch"** away from the spec's meaning (exit
>   cost), breaking cross-track comparability.
> - **Missing candidates**: ESLint core bulk suppressions (sidecar file plus
>   `--prune-suppressions`), Biome (already in-stack under D-0011, and the only tool
>   here that expresses per-directory differentiation without a manifest), and
>   oxlint-native `ban-ts-comment`.
>
> **2026-08-14, later — the `@appname/*` alias fact adds five verified failure modes to
> the threat model, four of which need no adversarial intent at all.** Internal imports
> are scoped-alias specifiers (facts/app-profile.md). These belong in the revised plan's
> threat model and are recorded here so they survive until it is written:
>
> 1. **The alias table is an unwatched enforcement artifact.** A boundary ban keyed to
>    a specifier (`@appname/transport/**`) is defeated by adding one new `paths` entry
>    pointing a second alias at the same directory — an edit to tsconfig, the bundler
>    alias, or the vitest alias, none of which read as policy. They read as wiring, so
>    they do not attract enforcement-grade review the way a lint config does. This is
>    the "agent edits the enforcement artifacts" class, extended to files nobody
>    classified as enforcement.
> 2. **Renaming a directory silently disables both layers at once.** oxlint specifier
>    patterns and dependency-cruiser resolved-path regexes are *both* keyed to the
>    directory name. After a rename, each matches nothing — no error, no CI failure, no
>    signal, just a ban that has quietly stopped covering the code it named. Because the
>    two layers share this one weakness, the defense-in-depth pairing fails together,
>    and an ordinary "rename for clarity" is a lower-effort way to disable enforcement
>    than any deliberate evasion.
> 3. **Editor auto-import evades specifier bans by default.** The TypeScript language
>    service picks relative-vs-alias specifiers by `importModuleSpecifierPreference`,
>    which defaults to *shortest* — so ordinary autocomplete, and any agent tooling
>    built on the same language server, will spontaneously emit `../../transport/x`
>    where convention says `@appname/transport/x`. That is exactly the string form a
>    specifier-keyed ban misses. The evasion therefore arrives organically and often,
>    with no bad actor. Pinning the setting repo-wide, or pairing every specifier ban
>    with a relative-path ban, is the candidate mitigation.
> 4. **New directories fail open.** Because oxlint `overrides` replace rather than merge
>    (the D-0020 mechanism), a directory created after the fact matches no existing
>    override glob and inherits no boundary bans. In a repo where agents create modules
>    often, the default state of new code is *unenforced*, not *denied* — the inverse of
>    what a boundary policy should do.
> 5. **Glob depth**: in gitignore-style groups `*` does not cross `/`, so
>    `@appname/transport/*` silently misses `@appname/transport/ws/backoff`. Bans need
>    `**`, and the drift test D-0020 mandates should assert it.
>
> Also settled for the revision: **the `baseUrl` migration is two problems, not one.**
> For the alias mapping itself it is a no-op — with `baseUrl: "."` the `paths` targets
> already resolve relative to that directory, so deleting the line changes nothing. The
> real hazard is `baseUrl`'s second role as a bare-specifier fallback root: today
> `import 'blah.js'` can resolve to `./src/blah.js`, and after removal it may not fail
> loudly but instead **silently retarget to a same-named real package in node_modules**
> ([TypeScript#62207](https://github.com/microsoft/TypeScript/issues/62207)). Detection
> recipe: step through TypeScript 6.0 *without* `"ignoreDeprecations": "6.0"` first —
> every fallback-dependent import then surfaces as a deprecation error, yielding an
> exhaustive list before 7.0. Note also that the bundler resolvers mirror baseUrl, so
> this breaks tsc, build, and tests together rather than in isolation.
>
> Two resolution facts still need a fixture test rather than a doc citation: whether
> oxlint's **core** (non-type-aware) import rules read tsconfig `paths` at all is
> undocumented, and tsgolint's `paths` support is a strong inference from its
> typescript-go basis, not a documented guarantee.
>
> Open scope calls for the user, which the revision waits on: (1) how far the TypeScript
> 7 question belongs in this track versus its own — the evidence now favors splitting
> it, keeping the bounded `baseUrl` migration here and treating a `typescript` 7.x bump
> as separate and ecosystem-gated; (2) whether to add a tenth, track-specific rubric
> criterion for suppression auditability, which would deviate from the spec's single
> shared rubric and want a ledger entry.

## Goal

Decide how to raise TypeScript strictness from the app's **very loose** baseline
(TS 5.9.3, facts/app-profile.md) and — the distinctive requirement — how to **enforce**
it in a codebase that receives a high volume of agent-authored code (D-0021). Agentic
churn changes the threat model for every enforcement mechanism: a global metric can be
gamed by polishing already-clean files, an escape hatch (`any`, `as`, `!`,
`@ts-ignore`, `eslint-disable`) is not just a human convenience but an attack surface a
code-generating agent will reach for under pressure, and review capacity is the scarce
resource the tooling must protect. The track starts from 0090's type-coverage area
(direct-adopt of type-coverage 2.30.1, allowlist-first branch selected by the resolved
strictness fact) and widens it to the full enforcement design. The user notes the
problem generalizes across domains; this track designs the type lever and reports on
how it composes with the program's existing ratchets (0030 duplication baseline, 0020
complexity gates) rather than redesigning those.

## Key questions

1. **Migration mechanics** — from very loose to strict on TS 5.9.3: what flag staging
   works (e.g. `noImplicitAny` → `strictNullChecks` → full `strict` → beyond-strict
   flags like `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`), and what
   carries the per-file allowlist: typescript-strict-plugin (last release 2024-06 —
   re-vet or reject), a hand-rolled `@ts-strict-ignore`-style convention with a
   shrinking-list CI check, or per-directory tsconfig layering?
2. **Gaming-resistant ratchet design** — which enforcement is diff-scoped
   (changed-files-must-be-strict, per-PR type-coverage delta) versus global-metric
   (`--at-least`/`--update-if-higher`), and which combination resists the known agent
   failure modes: raising a global percentage while dumping `any` elsewhere, and
   satisfying a gate by suppressing it?
3. **Suppression gates** — what bans or budgets new `@ts-ignore`/`as any`/non-null
   assertions/`eslint-disable` insertions at review speed: typescript-eslint's
   `ban-ts-comment` + `no-unsafe-*` family + `no-unsafe-type-assertion`,
   eslint-comments-style disable auditing, type-coverage's `--report-unused-ignore`?
   Where does each run under the D-0002 lane policy (oxlint-native or standalone
   first; ESLint-in-CI lane only where nothing else covers the surface, per the 0090
   lane-policy statement and D-0020 discipline)?
4. **Type-aware lint status** — as of the survey date, does oxlint's type-aware lane
   (tsgolint) cover any of the needed rules natively, or does the `no-unsafe-*` family
   stay ESLint-only?
5. **Boundary anchoring** — how do the contract-derived types (0010's zod schemas and
   `Validated<T>`, 0060's transport-boundary choke point) serve as strictness anchors,
   and what stops agent code from widening types at exactly those seams (cast bans
   scoped by path, dependency-cruiser rules already gating the imports, type-level
   patterns)?
6. **Reviewable output** — what produces per-PR, human-scannable enforcement output
   (deltas, annotated diffs, suppression inventories) so the humans supervising agent
   contributions see regressions without reading every line?
7. **Cross-domain composition** — how do this track's gates compose with the accepted
   0030 duplication ratchet and 0020 complexity gates into one coherent
   agent-resistant quality gate — and what, if anything, should be recommended as a
   unified mechanism rather than three parallel ones?
8. **Baseline** — what do `npx type-coverage --detail` (default and `--strict`) report
   against the real repo (0090's pre-scoped spike), and which migration order does the
   clustering select?

## Candidates

- type-coverage — https://github.com/plantain-00/type-coverage — percentage metric + ratchet flags (0090 input)
- typescript-strict-plugin — https://github.com/allegro/typescript-strict-plugin — per-file strict allowlist (stale; re-vet vs hand-roll)
- typescript-eslint — https://github.com/typescript-eslint/typescript-eslint — `strict-type-checked` preset, `no-unsafe-*` family, `ban-ts-comment`, `no-unsafe-type-assertion`
- tsgolint (oxlint type-aware) — https://github.com/oxc-project/tsgolint — type-aware rules in the fast lane (status to verify)
- @eslint-community/eslint-plugin-eslint-comments — https://github.com/eslint-community/eslint-plugin-eslint-comments — gate/audit disable-comment insertions
- @tsconfig/bases (strictest) — https://github.com/tsconfig/bases — staged tsconfig presets
- ts-reset — https://github.com/mattpocock/ts-reset — safer built-in types at the margins
- betterer — https://github.com/phenomnomnominal/betterer — generic ratchet (0090 verdict: mid-stall; carried as context, not a fresh candidate)
- tsc error-baselining tools (e.g. tsc-baseline) — survey to verify what is alive and credible

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").
Track-specific note: **Escape hatch cuts both ways here** — every mechanism's escape
hatch is also the surface an agent games. Scores must weigh *auditable* escape
(inventoried, budgeted, reviewable) against *silent* escape (a comment that just turns
the rule off), not merely whether an escape exists.

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | n-a (dev-time tooling) |
| Contract-format support | n-a (boundary anchoring cites 0010/0060, not contract parsing) |
| Integration cost | high |
| Runtime overhead | n-a |
| Output quality | high (per-PR reviewability is the point — see Key question 6) |
| Escape hatch | medium (scored per the track-specific note above) |

## Facts needed

- Build tool + monorepo-or-single-package layout (intake 2026-08-14-0090-app-facts
  item a, still open — decides tsconfig layering and per-workspace config shape)
- CI provider (where gates run; output-format choices)
- Baseline `type-coverage --detail` numbers, default and `--strict` (app-repo spike,
  pre-scoped in the 0090 report)
- How agent contributions land: PR size/velocity, review process, and whether agents
  run the linters locally before pushing (shapes diff-scoped vs global gate choice)
