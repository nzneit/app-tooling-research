# 0100-type-strictness — research plan

**Status**: draft (revision 2, 2026-08-14 — ready for the go gate)

<!-- Revision 2 rewrote this plan against an adversarial review of revision 1 (two
critical, six important, five minor defects) and against four app facts supplied after
revision 1 was written: React 18.3.1, TypeScript 5.9.3, very loose strictness, the
pseudo-monorepo layout, and `@appname/*` alias imports. Scope is now bounded by D-0023
(the tenth rubric criterion) and D-0024 (the TypeScript 7 split). Revision 1's defect
list is in git history. -->

## Goal

Decide how to raise TypeScript strictness from the app's **very loose** baseline
(TS 5.9.3) and — the distinctive requirement — how to **enforce** it in a codebase that
receives a high volume of agent-authored code. Agentic churn changes the threat model
for every enforcement mechanism, and in a way that is not mainly adversarial: the
dominant failure modes are things that happen by default. Every mechanism this track can
recommend is a committed file in the same repo the agents write to, so a gate can be
satisfied by moving the gate; a global metric rises when a type is widened rather than
fixed; a boundary rule keyed to a directory name goes silently inert when the directory
is renamed; and a suppression is one comment. Review capacity is the scarce resource the
tooling exists to protect, so a mechanism that produces findings faster than humans can
adjudicate them has failed even when it is technically correct. This track designs the
type lever and the enforcement around it. It **composes with** the accepted ratchets in
0020 (D-0011) and 0030 (D-0012) and does not redesign them; where it conflicts with
them, it says so and routes the conflict as a proposed amendment rather than deciding
unilaterally. Per D-0024 it owns the bounded `baseUrl` migration and explicitly does not
own the app's `typescript` upgrade to 7.x.

## Key questions

1. **Migration mechanics** — from very loose to strict on TS 5.9.3, what flag staging
   works (`noImplicitAny` → `strictNullChecks` → full `strict` → and whether
   `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` are worth the tail), and what
   carries the per-file allowlist? Two of the three options from revision 1 survive:
   typescript-strict-plugin (2.4.4, last published 2024-06 — re-vet or reject) or a
   hand-rolled `@ts-strict-ignore`-style convention with a shrinking-list CI check.
   **Per-directory tsconfig layering is eliminated, not deferred**: plain `tsc` searches
   upward from the invocation directory and never descends, so a nested config is inert
   in CI while the editor honors it — a silent editor/CI split. **Project references**
   are the remaining per-directory mechanism (they key on tsconfig, never package.json,
   so the pseudo-monorepo is no obstacle); the question is whether their cost —
   `composite: true`, forced declaration emit, `tsc -b` ordering, and cross-boundary
   imports resolving through emitted `.d.ts` — is worth per-directory strictness here.
2. **Gaming-resistant ratchet design** — which enforcement is diff-scoped (changed files
   must be strict; a per-PR delta) versus global-metric (`--at-least`,
   `--update-if-higher`), and which combination survives the named failure modes? A
   single whole-repo percentage is especially weak in this layout: one clean directory
   and one swamp average into a number nobody can act on. A per-directory breakdown is
   buildable but not off-the-shelf — the CLI reports one aggregate, while
   `type-coverage-core` exposes per-file counts via `lint(project, { fileCounts: true })`
   for bucketing by directory prefix. Is that worth owning, or does diff-scoping remove
   the need for it? **2026-08-14 — scale sharpens this toward a decision.** At ~150,000 LOC
   (facts/app-profile.md) a global percentage has a **dilution problem**: one new sloppy
   agent-authored file barely moves a ratio over a 150k-line denominator, so an aggregate
   gate cannot see the very thing this track exists to catch, while a per-file list flags it
   immediately with no size-dependent dilution. The likely shape is therefore
   **type-coverage for the trend, a file list for the blocking gate** — which the survey
   should try to falsify rather than assume. Two mechanical constraints to carry:
   TypeScript's `strict` is tsconfig-global with no native per-file toggle, so "per-file
   allowlist" means a second scoped tsconfig or blanket-strict with per-file suppressions
   removed incrementally; and `type-coverage --cache` only helps if the cache survives
   between CI runs, or every commit pays a cold full-program pass on top of `tsc`'s own.
3. **The agent-authored failure modes, named and countered** — which of these does each
   candidate mechanism actually detect, and which does it score as an improvement?
   (a) **Declaration-site widening**: changing a field to `unknown`, adding an index
   signature, or reaching for `Record<string, unknown>` satisfies `no-explicit-any`,
   satisfies cast bans, and *raises* type-coverage, because `unknown` is not `any`.
   (b) **`as unknown as T`**, the standard escape from any single-step assertion ban.
   (c) **Types that compile but lie** — an invented union member, a guessed response
   shape, a non-null assertion on something nullable. Every metric here scores this
   better than `any`, and it is the failure mode most specific to generated code; the
   only real counter is runtime validation at the 0010/0060 boundary, which makes this
   partly question 7's problem. (d) **Laundering through excluded paths** — `.d.ts`,
   `*.gen.ts`, and the vendored contract directories are exactly what gates exclude.
4. **Suppression surfaces and their gates** — what bans, budgets, or inventories new
   suppressions at review speed, across the *whole* surface the adopted toolchain
   exposes: `@ts-ignore`, `@ts-expect-error` (which `ban-ts-comment` treats **more
   permissively** than `@ts-ignore` by default, via `allow-with-description` — a
   description is trivially generated), `@ts-nocheck`, `eslint-disable*`,
   `oxlint-disable*` (oxlint's native syntax, distinct from the eslint-prefixed family
   it also accepts), `biome-ignore` (which *is* 0020's accepted ratchet mechanism under
   D-0011), `type-coverage:ignore-next-line`, `as any` / `as unknown as T`, non-null
   `!`, and the file-level escapes (allowlist entries, ignore globs, baseline
   regeneration). Which audit mechanisms exist for each — oxlint's
   `reportUnusedDisableDirectives`, type-coverage's `--report-unused-ignore`, ESLint's
   `--prune-suppressions`? And where does each rule run under the three-lane policy:
   oxlint-native first, then Biome (already in CI under D-0011), then the ESLint-in-CI
   lane only where nothing else covers the surface?
5. **Type-aware lint routing, and the `baseUrl` migration** — oxlint's type-aware lane
   is stable and implements 59 of 61 typescript-eslint type-aware rules, including the
   whole `no-unsafe-*` family, and `oxlint-tsgolint` bundles its own typescript-go
   engine, so adopting it does **not** require bumping the app's `typescript` (D-0024).
   The real gate is tsconfig compatibility: `baseUrl` was removed in TS 7.0 and is
   reported as a hard error. So: what exactly does the migration cost here? For the
   `@appname/*` alias mapping itself it is a no-op, since `paths` targets already
   resolve relative to the tsconfig. The hazard is `baseUrl`'s second role as a
   bare-specifier fallback root, where removal can **silently retarget an import to a
   same-named real package** instead of failing; the detection step is a pass through
   TypeScript 6.0 without `"ignoreDeprecations": "6.0"`. Two resolution facts need a
   fixture test rather than a doc citation: whether oxlint's *core* import rules read
   tsconfig `paths` at all, and whether tsgolint honors `paths` (inferred from its
   typescript-go basis, not documented). What runs in which lane before the migration,
   and what moves after?
6. **Enforcement-artifact integrity** — which enforcement state is committed to this
   repo, who may change it, and what detects a gate being loosened rather than
   satisfied? The inventory is larger than it looks: tsconfig flags and include/exclude
   globs, the strictness allowlist, stored ratchet thresholds, 0030's committed
   baseline, 0020's inline `biome-ignore` comments, lint `overrides`, the single root
   `package.json` `scripts` block (where one edit blunts every gate at once, because
   there are no per-package scripts), and — least obviously — the **alias tables**
   (tsconfig `paths` plus its restatements for the bundler and test runner), since a new
   mapping pointing a second alias at a banned directory defeats any specifier-keyed
   rule while reading as routine wiring. Candidate answers: CODEOWNERS on the
   enforcement set, a monotonicity check asserting thresholds and flags only move one
   way, a drift test in the D-0020 mould, or removing the mutable state entirely
   (diff-scoped gates carry no baseline to edit). Two related fail-open modes to
   counter: a **renamed directory** silently voids both specifier-keyed and
   path-keyed rules with no error, and a **newly created directory** matching no
   `overrides` glob inherits no bans at all, so new code defaults to unenforced.
7. **Boundary anchoring** — settled inputs first: D-0015/D-0018 ratified the boundary
   shape and that `Validated<T>` means "at least the declared shape" under a passthrough
   plus drift-warning policy, and D-0022 adopted dependency-cruiser alongside the
   incumbent oxlint `no-restricted-imports` layering rule. The open residue is precisely
   what passthrough leaves open: an agent can widen a contract-derived type and the
   value still satisfies `Validated<T>`. What detects that — cast bans scoped by path,
   a type-level pattern that makes the generated types non-wideable, a check that
   contract-derived types are never redeclared locally?
8. **Reviewable output** — what produces per-PR, human-scannable enforcement output
   (deltas, annotated diffs, suppression inventories) so the humans supervising agent
   contributions see regressions without reading every line? This is scored as a
   high-weight criterion, not an afterthought: if the gate's output costs more review
   time than the code it guards, the gate is a net loss.
9. **Gate-failure routing** — when a gate fails on an agent-authored PR, does the
   failure return to the agent or to a human? If an agent may resolve its own gate
   failure, every suppression mechanism the track recommends is also a suppression
   *generator*, and only mechanisms with no suppression path remain viable. This is an
   intake question (2026-08-14-0100 item b), and the answer changes which candidates are
   admissible at all — so the report must state the recommendation for each branch
   rather than assuming one.
10. **Composition with the accepted ratchets** — where do this track's gates conflict
    with, duplicate, or get bypassed by 0020's Biome cognitive ratchet (D-0011) and
    0030's fallow committed baseline (D-0012)? Which conflicts must be routed as
    proposed amendments to those decisions? A unified single-gate recommendation, if the
    evidence supports one, is a **separate second output** requiring a superseding
    ledger entry naming D-0011 and D-0012 — this track does not supersede them by
    recommending around them. Related and in scope because the layout forces it: with no
    workspace graph there is no affected-package CI selection, so every gate runs
    full-repo on every commit; what does the aggregate CI cost look like, and does that
    argue for consolidation?
11. **Baseline protocol** — the measurement itself cannot run here (D-0004: the app repo
    is not accessible; D-0001: no prototyping in research). So what protocol should the
    spike run — which commands, which tsconfig, which exclusions — and what
    **pre-committed decision rule** maps each possible result to a migration order, so
    the measurement selects a design instead of restarting the design conversation? The
    starting rule, inherited from 0090: a high and diffuse baseline confirms a
    percentage ratchet; a low or clustered baseline puts a per-file allowlist first.

## Candidates

- type-coverage — https://github.com/plantain-00/type-coverage — percentage metric plus ratchet flags; `type-coverage-core` exposes per-file counts (2.30.1, 2026-07-26)
- typescript-strict-plugin — https://github.com/allegro/typescript-strict-plugin — per-file strict allowlist via `@ts-strict-ignore` (2.4.4, 2024-06-07 — stale; re-vet or reject)
- typescript-eslint — https://github.com/typescript-eslint/typescript-eslint — `strict-type-checked` preset, the `no-unsafe-*` family, `ban-ts-comment`; note `no-unsafe-type-assertion` is opt-in only (in the `all` config, **not** `strict-type-checked`) and is famously noisy
- oxlint type-aware lane (`oxlint-tsgolint`) — https://github.com/oxc-project/tsgolint — 59 of 61 type-aware rules on a bundled typescript-go engine; requires TS-7-compatible tsconfig
- oxlint native rules — https://oxc.rs/docs/guide/usage/linter/rules/typescript/ban-ts-comment.html — `ban-ts-comment` with the full directive/description option surface, plus `reportUnusedDisableDirectives`
- Biome — https://github.com/biomejs/biome — already an accepted CI dependency (D-0011); ships `suspicious/noTsIgnore`, `suspicious/noExplicitAny`, `style/noNonNullAssertion`, and expresses per-directory rules via glob `includes` in `overrides` with no manifest needed
- ESLint core bulk suppressions — https://eslint.org/docs/latest/use/suppressions — `--suppress-all`/`--suppress-rule`/`--prune-suppressions` writing a **sidecar** `eslint-suppressions.json` rather than inline comments; the auditable pole of the D-0023 criterion
- @eslint-community/eslint-plugin-eslint-comments — https://github.com/eslint-community/eslint-plugin-eslint-comments — gate and audit disable-comment insertions (4.7.2, 2026-05-26)
- @tsconfig/bases — https://github.com/tsconfig/bases — staged tsconfig presets including `strictest` (1.0.26, 2026-07-11); `@tsconfig/strictest` is the more direct single package
- TypeScript project references — https://www.typescriptlang.org/docs/handbook/project-references.html — the only viable per-directory strictness mechanism in this layout
- tsc-baseline — https://github.com/TimMikeladze/tsc-baseline — sidecar baseline of tsc errors, new-errors-only diff (1.9.0, npm 2025-01; 14★ — credibility is the open question, and ESLint bulk suppressions occupies the same slot with far stronger backing)

**Prior art carried as context, not scored:**

- betterer — https://github.com/phenomnomnominal/betterer — generic ratchet framework; 0090 found the stable line frozen since 2022-08 and v6 stalled in alpha since 2024-12. Its *shape* (snapshot-and-diff any metric) informs question 2; it is not a live adoption candidate.
- @total-typescript/ts-reset — https://github.com/mattpocock/ts-reset — ambient overrides making built-ins stricter (0.6.1, 2024-09-02, ~23 months stale). Out of scope as a candidate: it is a strictness *lever*, not an enforcement mechanism, and its headline overrides (`JSON.parse` → `unknown`, `.json()` → `unknown`) target the seam the ratified 0010/0060 validation choke point already owns.

## Rubric weights

Weights: high / medium / low / n-a. In the report, score each non-n-a criterion
strong / adequate / weak with a sentence of evidence (spec: "Shared evaluation rubric").

**This track scores a tenth, track-specific criterion — Suppression auditability — per
D-0023.** That is a deliberate, bounded deviation from the spec's single shared rubric,
applying to this track only. Critically, "Escape hatch" keeps its spec meaning here (the
cost of removing the tool later) and is scored separately; revision 1 silently conflated
the two, which broke cross-track comparability and hid the exit-cost signal on the track
most likely to recommend committed baselines and inline markers.

| Criterion | Weight |
|---|---|
| License | medium — every serious candidate here is MIT/ISC, so D-0003 makes this a gate rather than a discriminator |
| Maintenance health | high — the field includes one stale package, one stalled project, and one 14★ tool; this genuinely separates them |
| TypeScript fit | high |
| Browser compatibility | n-a — dev-time and CI tooling only, nothing ships |
| Contract-format support | n-a — boundary anchoring consumes 0010/0060 outputs; no contract parsing happens here |
| Integration cost | medium |
| Runtime overhead | low — nothing ships to the browser, but CI wall-clock is scored, because the layout forces every gate to run full-repo on every commit |
| Output quality | high — per-PR reviewability is the point (Key question 8) |
| Escape hatch | medium — spec meaning: the cost of removing the tool later |
| **Suppression auditability** (D-0023) | **high** — how visible and countable a mechanism's suppressions are: *auditable* escape is inventoried, budgeted, and reportable (a sidecar file, a shrinking allowlist, an unused-suppression report); *silent* escape is a comment that turns the rule off leaving no inventory behind |

## Facts needed

App-profile fields this track depends on. The measurement itself is not a fact anyone can
fill in; it is the spike protocol of Key question 11.

- Build tool and bundler major — intake 2026-08-14-0090-app-facts item a, still open
- CI provider — where the gates run, and which output formats are consumable
- TypeScript configuration shape: how many tsconfigs, whether `baseUrl` is present
  alongside `paths`, and where the `@appname` alias is restated — intake
  2026-08-14-0100-agentic-churn item d
- How agent-authored code lands: volume, review process, and whether agents run the
  checks locally before pushing — intake 2026-08-14-0100 item a
- Whether an agent may resolve its own failing gate — intake 2026-08-14-0100 item b
- Who owns the enforcement configuration today — intake 2026-08-14-0100 item c
- Whether per-directory strictness and directory-ownership rules are wanted — intake
  2026-08-14-0100 item e
