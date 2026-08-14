# 0010-contract-pipeline — report

## Summary (STE)

This track examined 14 tools that convert the vendored OpenAPI and AsyncAPI contracts into types, validation schemas, and factories. No single tool covers both contract formats. We recommend a composed pipeline with one primary tool for each leg. For the OpenAPI leg, we adopt orval and wrap it so error bodies get runtime validation. For the AsyncAPI leg, we build a small generator from the AsyncAPI parser, Ajv compiled validators, and Modelina types. Fishery supplies typed factories for the AsyncAPI payloads, and oasdiff plus AsyncAPI diff find contract drift in CI.

The most important risk is the glue code that we must own. Orval does not validate error bodies without the wrapper, and the AsyncAPI leg is fully custom. Key application facts are unknown, for example the peak message rate and the bundle budget. TypeBox is the spike alternative for the AsyncAPI leg because it makes types and validators from one source. The next step is a spike that wires both legs to the real contracts and measures the results.

**As of**: 2026-08-13 (versions evaluated are listed per candidate; amended 2026-08-13 after the Wave 1 candidate-gap sweep — TypeBox added)
**Recommendation**: adopt + wrap (composed pipeline, one primary per leg) — OpenAPI leg: adopt orval 8.24.0 + wrap (mutator wires non-2xx zod validation); AsyncAPI leg: build thin (@asyncapi/parser extraction → Ajv 8 standalone compiled validators + Modelina types + fishery factories); drift CI: adopt oasdiff + @asyncapi/diff; spike alternative for the AsyncAPI leg: single-artifact TypeBox route (schema2typebox → TypeBox `Static` types + `TypeCompiler.Code()` compiled validators — see the spike section)

## Survey

All facts below were verified against the live web on 2026-08-13. Per D-0001 this is desk research only; nothing was installed or run. The cross-cutting runtime-validator comparison (Zod 4 vs valibot vs ArkType vs Ajv vs typia vs TypeBox) and the drift/coverage/failure-semantics prior art are synthesized under Key questions 2, 4–7. Amended 2026-08-13: the Wave 1 candidate-gap sweep (docs/2026-08-13-wave-1-gap-sweep.md) surfaced TypeBox, which this survey had omitted; the TypeBox subsection below, Key question 2, the rubric, and the spike section carry the amendment. The OpenAPI-leg recommendation is unchanged.

### orval (v8.24.0)

MIT throughout (root repo and per-package, e.g. [@orval/zod](https://github.com/orval-labs/orval/blob/master/packages/zod/package.json)); no paid tier. Maintenance is the strongest of the OpenAPI candidates: [v8.24.0 released 2026-08-08](https://github.com/orval-labs/orval/releases) on a ~1–2-week cadence, repo pushed the day of research, 6,348 stars, org-maintained (orval-labs) with Open Collective backing.

From Swagger 2 / OpenAPI 3.0 / 3.1 specs (including JSON Schema 2020-12 `$dynamicRef`/`$dynamicAnchor` per the [output config reference](https://orval.dev/docs/reference/configuration/output/); historical 3.1 edge cases [#891](https://github.com/anymaniax/orval/issues/891), [#890](https://github.com/anymaniax/orval/issues/890)), orval emits the full three-artifact set from one config: TS models; fetch/axios/react-query clients; zod schemas targeting zod 3, 4, or [zod-mini](https://orval.dev/docs/guides/zod/); and MSW handlers plus faker response factories ([mocking guide](https://github.com/orval-labs/orval/blob/master/skills/orval/mocking-msw.md)). **No AsyncAPI support at all** — orval can only be the OpenAPI half of this track's pipeline.

The track-critical nuance, source-verified in [packages/zod/src/index.ts](https://github.com/orval-labs/orval/blob/master/packages/zod/src/index.ts) (lines 3154–3157): with `override.zod.generateEachHttpStatus: true` the zod generator iterates **every** documented status — 4xx/5xx included — emitting per-status schemas (e.g. `<op>404Response`), and the msw/faker generators likewise produce per-status mocks. However, the built-in `override.fetch.runtimeValidation` only calls `.parse()` on the *success* body; error bodies are `JSON.parse`d and typed but not zod-validated (verified in [packages/fetch/src/index.ts](https://github.com/orval-labs/orval/blob/master/packages/fetch/src/index.ts)). D-0006 is therefore not met out of the box, but the generated per-status schemas make it a thin custom layer: wire error-body `.parse()` in a `mutator` — orval's sanctioned custom-HTTP-layer escape hatch. A documented history of error-typing bugs ([#258](https://github.com/orval-labs/orval/issues/258), [#1801](https://github.com/orval-labs/orval/issues/1801), [#2749](https://github.com/orval-labs/orval/issues/2749), [#1975](https://github.com/orval-labs/orval/issues/1975)) suggests error paths get less polish than success paths. Generated artifacts are plain browser TS with zod as the only runtime dependency; the Node >=22.18 engine floor is codegen-time only.

### kubb (v4.39.3)

MIT across all [@kubb/* packages](https://registry.npmjs.org/@kubb/core). Plugin architecture: one `kubb.config.ts` fans out to [plugin-ts](https://kubb.dev/), [plugin-zod](https://v4.kubb.dev/kubb/plugins/plugin-zod) (zod 3/4/mini, `z.infer` type exports), plugin-faker, plugin-msw, and clients with optional `parser: 'zod'`. OpenAPI 2.0/3.0/3.1 including discriminator edge cases ([OAS guide](https://v4.kubb.dev/kubb/guide/oas)); **no AsyncAPI** in any stable release ([discussion #600](https://github.com/kubb-labs/kubb/discussions/600) unanswered since 2023; the v5-beta [adapter interface](https://kubb.dev/adapters) names it only as a roadmap/custom target).

Standout output quality for D-0006: the generated zod output emits a schema for every declared status including non-2xx ([getPetById400Schema/404Schema](https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/zod/src/gen/zod/getPetByIdSchema.ts)) plus an [operations map](https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/zod/src/gen/zod/operations.ts) keyed by operationId with `responses` and a separate `errors: {[status]: schema}` block — exactly the lookup structure a transport choke point needs. Caveats: body-less responses degrade to `z.any()`; no shipped interceptor performs the non-2xx validation (glue is yours); multi-2xx bug [#1223](https://github.com/kubb-labs/kubb/issues/1223) fixed only in 3.0.0.

The "low download" premise is out of date at plugin granularity ([@kubb/core 347,490 weekly](https://api.npmjs.org/downloads/point/last-week/@kubb/core); only the umbrella `kubb` package is small). Real risks are elsewhere: **bus factor of one** (stijnvanhulle, 5,095 commits; next [contributors](https://api.github.com/repos/kubb-labs/kubb/contributors) are AI/CI bots) and an in-flight v4→v5 rearchitecture (5.0.0-beta.108 published on the access date) that will churn config/plugin APIs. Named fallback for the OpenAPI leg.

### hey-api/openapi-ts (v0.99.0)

MIT on [repo](https://github.com/hey-api/hey-api) and npm; the commercial surface (hosted Hey API Platform) is strictly [optional](https://heyapi.dev/openapi-ts/integrations) — **no license change or OSS regression found**, so the D-0003 governance check passes. Sponsor-funded (Stainless, OpenCode, FastAPI et al.), millions of weekly downloads, users include Vercel/PayPal/AWS. Watch items: stable channel paused at [0.99.0 (2026-06-22)](https://github.com/hey-api/hey-api/releases) in favor of nightly `next` prereleases; effectively one primary maintainer; 0.x breaking-change cadence documented in the [migration guide](https://heyapi.dev/openapi-ts/migrating).

Plugins cover types, SDK + clients, and [Zod v3/v4/Mini](https://heyapi.dev/docs/openapi/typescript/plugins/zod/v4) and [Valibot](https://heyapi.dev/docs/openapi/typescript/plugins/valibot) validators; the [Faker plugin](https://heyapi.dev/docs/openapi/typescript/plugins/faker) is documented but flagged in progress ([#1485](https://github.com/hey-api/hey-api/issues/1485) open since Dec 2024) — mocks are not yet a dependable third artifact. The D-0006 caveat that keeps it behind orval/kubb: the Zod plugin emits "a single Zod schema... for all endpoint's responses — a union of all possible response shapes", which blurs per-status validation of a specific non-2xx reason-code body. SDK types do separate `*Errors` from `*Responses`. No AsyncAPI.

### openapi-zod-client (v1.18.3)

**Eliminated.** The author deprecated it on 2026-08-05 — the [README](https://raw.githubusercontent.com/astahmer/openapi-zod-client/main/README.md) opens with "use typed-openapi instead". Last release 2025-02-10; hard-coupled to the dormant zodios stack ([@zodios/core](https://registry.npmjs.org/@zodios/core) last shipped 2023-08-22, Zod ^3 only) plus axios; npm says ISC but the repo has **no LICENSE file** (GitHub reports license: null); OpenAPI 3.0+ only with 3.1 gaps ([#354](https://github.com/astahmer/openapi-zod-client/issues/354)). Its zodios-era design (endpoint `errors` arrays with runtime response validation) survives as prior art for Key question 7.

### typed-openapi (v3.2.1)

The designated successor: MIT (LICENSE in repo; npm metadata omits the field — packaging nit), [3.2.1 published 2026-08-04](https://registry.npmjs.org/typed-openapi), four releases Jul–Aug 2026, 0 open issues — but single-maintainer and the v3 API line is only weeks old. Headless single-file client, bring-your-own fetcher, zero runtime deps in types-only mode; `--runtime` emits Zod 3/4, Effect, Valibot, ArkType, TypeBox, or Typia schemas; `--msw`/`--msw-faker` mock handlers and factories — all three artifact kinds on the OpenAPI side. OpenAPI 3.0/3.1 (swagger-parser 12, `openapi3-ts/oas31` [library API](https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/advanced/library-api.md)); no AsyncAPI.

Error handling is well-shaped: a configured error status throws `TypedStatusError` containing the parsed, status-specific body, with configurable status ranges and a `withResponse` discriminated union that narrows per status ([errors docs](https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/clients/errors-and-responses.md)). Caveat needing a spike: the [validation docs](https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/validation/input-output.md) describe output-side validation as "successful response data" — whether non-2xx bodies get full runtime schema validation (vs typed parsing) is unconfirmed. Strong runner-up for the OpenAPI leg.

### openapi-typescript (v7.13.0)

The most-adopted generator in the category — [6.09M weekly downloads](https://api.npmjs.org/downloads/point/last-week/openapi-typescript) plus 7.29M for openapi-fetch; MIT; used by Octokit, Firebase CLI, Supabase, Netlify ([about](https://openapi-ts.dev/about)). Reference-quality, runtime-free OpenAPI 3.0/3.1 types with per-status response typing; the ~6 kB [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client types error bodies per status at compile time.

**Deliberately types-only**: runtime validation was closed "not planned" ([#1420](https://github.com/openapi-ts/openapi-typescript/issues/1420)), and there are no factories and no AsyncAPI. Types alone cannot satisfy D-0006 — a malformed partner payload passes silently. Maintenance is also in a quiet stretch: last release 2026-02-11, default-branch commits bot-only then silent since 2026-05-05 (five core maintainers mitigate). A fine *component*, but choosing it commits the track to a multi-tool assembly in which the validator and factory halves carry all the risk; the combined tools deliver the same types plus schemas from one config. Not selected.

### AsyncAPI Modelina (v5.10.1)

Apache-2.0, AsyncAPI Initiative (Linux Foundation ecosystem), 114+ contributors. Broadest input coverage of any candidate: AsyncAPI 2.0.0–3.0.0, JSON Schema draft 4/6/7, OpenAPI 3.0/3.1/Swagger 2.0, Avro, XSD ([README](https://github.com/asyncapi/modelina)). Stable channel dormant since [5.10.1 (2025-10-19)](https://registry.npmjs.org/@asyncapi/modelina); activity is on 6.0.0-next (next.17, 2026-08-01).

The decisive fact for this track: Modelina emits **typed models only** — no validator output exists for TS (JSON Schema emission was [closed not planned, #532](https://github.com/asyncapi/modelina/issues/532)), and the `TS_COMMON_PRESET` un/marshal helpers do permissive property copying with no type or required-field checking ([marshalling example](https://github.com/asyncapi/modelina/tree/master/examples/typescript-generate-marshalling)). A batch of TS-generator correctness bugs ([#2452](https://github.com/asyncapi/modelina/issues/2452)) was closed only against the v6 line. The [preset system](https://github.com/asyncapi/modelina/blob/master/docs/presets.md) is a genuine escape hatch. Role in the recommendation: the **types-only leg** of the built AsyncAPI pipeline, beside Ajv validators — not a standalone answer.

### AsyncAPI Generator (v3.4.0)

Apache-2.0; the core engine is healthy ([3.4.0 on 2026-08-05](https://registry.npmjs.org/@asyncapi/generator), ~monthly cadence, parser v3 gives the best AsyncAPI 2.x+3.x coverage in the set). But the TS template ecosystem is dead: the only TypeScript template ever shipped, [ts-nats-template](https://github.com/asyncapi-archived-repos/ts-nats-template), is archived (last release 2023, AsyncAPI-2.x-era, NATS-specific), most other language templates are archived, and the in-monorepo replacement fleet covers Java/JS/Python/Dart — [no TypeScript](https://api.github.com/repos/asyncapi/generator/contents/packages/templates/clients). No template emits runtime validation, and the [docs](https://www.asyncapi.com/docs/tools/generator/template-development) explicitly delegate model emission to Modelina. Using it would mean authoring the entire template body ourselves while the Generator contributes only file orchestration; a plain script driving `@asyncapi/parser` directly offers similar power with one less framework and no Node >=24.11 floor. Not selected — but its parser is the extraction backbone of the built leg.

### json-schema-to-zod (v2.8.1)

ISC; **archived (read-only) June 30, 2026** after a March 2026 end-of-maintenance notice ([repo](https://github.com/StefanTerdell/json-schema-to-zod)); still ~1.88M weekly downloads. Would have been the AsyncAPI→zod glue leg: JSON Schema draft 4+ → Zod 3/4 source with `z.infer` type exports. Hard limits beyond the archival: no `$ref` resolution (pre-dereference required), "factored schemas... only partially supported", and the author's own README warning that JSON Schema and Zod "do not overlap 100%" — he recommends **Ajv for runtime validation of JSON Schema**, advice this report follows. Successors surveyed: [zod-from-json-schema](https://github.com/glideapps/zod-from-json-schema) (maintained, Zod 4, but runtime conversion — no static types), [@n8n/json-schema-to-zod](https://registry.npmjs.org/@n8n/json-schema-to-zod) (Zod-3-pinned fork), and Zod's experimental [z.fromJSONSchema](https://zod.dev/json-schema) (explicitly unstable). The whole JSON-Schema→zod route is rejected for the keystone leg.

### TypeBox (v0.34.52)

Added by the 2026-08-13 amendment (Wave 1 candidate-gap sweep). MIT on both npm lines; the package split matters: [@sinclair/typebox](https://registry.npmjs.org/@sinclair/typebox/latest) is the 0.x line (0.34.52, published 2026-07-11), now maintained in the [sinclair-typebox legacy repo](https://github.com/sinclairzx81/sinclair-typebox), while the unscoped [typebox](https://registry.npmjs.org/typebox/latest) package (1.3.13) carries the rewritten 1.x line in the [main repo](https://github.com/sinclairzx81/typebox) — 6,910 stars, pushed on the access date, self-positioned as "a lightweight industry-grade alternative to Ajv". GitHub's license detection reports NOASSERTION on the main repo, but both npm lines declare MIT and the 1.x README carries the MIT text. Bus factor ~1 (sinclairzx81), tempered by the project's age (2017) and its role as an emit target for other tools in this survey (typed-openapi's `--runtime typebox`).

The capability no other candidate offers: TypeBox schemas **are** JSON Schema — "in-memory Json Schema objects that infer as TypeScript types" via `Static<T>` — so one schema source yields both artifact kinds the built AsyncAPI leg otherwise splits across Ajv (validators) and Modelina (types). The 0.x line "targets Json Schema Draft 7 and [is] compatible with any validator that supports this specification"; its TypeCompiler exposes Compile/Check/Errors plus **`Code()`**, documented as generating "assertion functions as strings... that can be written to disk as importable modules... sometimes referred to as Ahead of Time (AOT) compilation" — the same build-time, CSP-safe posture as Ajv standalone codegen ([0.x README](https://raw.githubusercontent.com/sinclairzx81/sinclair-typebox/main/readme.md)). The 1.x compiler widens dialect support to "JSON Schema Draft 3 through to 2020-12" with a published compliance table (partial in places — e.g. 77/79 on 2020-12 `$ref`), accepts native JSON Schema directly, and falls back automatically to much slower dynamic validation in JIT-restricted environments ([1.x README](https://raw.githubusercontent.com/sinclairzx81/typebox/main/readme.md)). In the same [moltar node-24 dataset](https://raw.githubusercontent.com/moltar/typescript-runtime-type-benchmarks/master/docs/results/node-24.json) this report already cites, typebox posts 76.1M assertLoose ops/s ahead-of-time and 70.4M just-in-time — ~2x Ajv's 35.7M, within a few percent of typia's 78.2M, with no compiler-transformer toolchain; the dynamic fallback drops to 2.3M.

Two gates keep it the spike alternative rather than the primary. (1) **Codegen glue**: [schema2typebox](https://github.com/xddq/schema2typebox) (MIT; [1.7.8 published 2025-10-20](https://registry.npmjs.org/schema2typebox), repo pushed the same day — ~10 months quiet at access; 81 stars, 12 open issues/PRs, single maintainer) converts JSON Schema files to TypeBox source with cross-file `$ref` resolution, but is explicitly draft-07-focused: draft-04/06/2019-09 "should 'just work'", draft-2020-12 "not expected to fully work". (2) **Dialect completeness**: Ajv executes drafts 04→2020-12 with full keyword coverage plus OpenAPI `nullable`/`discriminator` (Key question 2), while TypeBox 0.x targets draft-07 and 1.x's 2020-12 coverage is close but not complete. Role in the recommendation: **named spike alternative for the built AsyncAPI leg** — JSON Schema → schema2typebox → TypeBox schemas → `Static<T>` types + `Code()`-compiled validators, one artifact that removes Modelina (the half that scored weak) from the pipeline entirely.

### typia (v13.3.0)

MIT; hyperactive ([v13.3.0 released the day of research](https://registry.npmjs.org/typia), 3 open issues) but bus factor ~1 (samchon: 2,298 of ~2,560 human commits, across typia, the ttsc toolchain, and @ttsc/unplugin). Inverts the pipeline: validators, serializers, and `typia.random<T>()` factories are compiled **from TS types**, so contracts are not its input — it needs an upstream contracts→types generator, and OpenAPI/AsyncAPI constraints (format/pattern/min/max) survive only if that generator emits [typia.tags](https://typia.io/docs/validators/tags/) intersections, which no mainstream generator does. Without custom codegen, live validation would be structural-only — silently dropping contract constraint semantics.

Best-in-class runtime: fastest in the independent [moltar benchmarks](https://moltar.github.io/typescript-runtime-type-benchmarks/) (~78.2M assertLoose ops/s vs Ajv 35.7M, Zod 4 3.6M), AOT plain-JS output (CSP-safe), and excellent structured errors (`{path, expected, value}`). Costs: invasive build integration (stock tsc/tsx silently bypass the transform; requires [@ttsc/unplugin](https://registry.npmjs.org/@ttsc/unplugin), itself 3 months old, after [unplugin-typia was archived](https://github.com/ryoppippi/unplugin-typia) over tsgo concerns). Not selected; noted as the hot-path escalation option (via its transformer-free `typia generate` mode) if measured MQTT rates ever exceed Ajv's headroom.

### zod-fixture (v2.5.2)

MIT. **Fails the Zod-4 verification gate**: last publish 2024-03-09 and last commit 2024-07-13 both predate Zod 4 stable; the Zod-4 tracking issue [#99](https://github.com/timdeschryver/zod-fixture/issues/99) (opened by colinhacks) has no maintainer response; the lax peer range (`zod >=3.0.0`) should be read as untested, not supported. Nice design (seeded, self-contained, transformer API) but dormant single-maintainer tooling with no path forward. Eliminated.

### @anatine/zod-mock (v3.14.0)

MIT declared in package.json, but the monorepo has **no top-level LICENSE file** (GitHub reports license: null) — a compliance caveat. **Fails the Zod-4 gate on npm today**: latest 3.14.0 (2025-04-04) peers on `zod ^3.21.4`; `generateMock` returns `undefined` under Zod 4 ([#264](https://github.com/anatine/zod-plugins/issues/264)); the fix ([PR #265](https://github.com/anatine/zod-plugins/pull/265), merged 2026-05-08, 3.14.1 on main) **never reached npm** because the release action is broken ([#269](https://github.com/anatine/zod-plugins/issues/269), open since 2026-05-21). Additionally the README documents no support for ZodUnion/ZodIntersection/ZodTuple — precisely what OpenAPI `oneOf` reason-code bodies compile to — and it drags the large faker peer. Blocked; re-check for a published 3.14.1 before any future reconsideration.

### fishery (v2.4.0)

MIT; thoughtbot-backed and the healthiest factory candidate ([2.4.0 on 2025-12-08](https://registry.npmjs.org/fishery), repo pushed 2026-02-26). Typed factory_bot-style `Factory<T>` definitions with sequences, traits, transient params, and `afterBuild` hooks; single tiny dependency; Zod-version-independent. Trade-off: zero contract awareness — one hand-written factory per contracted type, with drift caught only via TS compile errors from the type leg (a tightened `pattern` that does not change the TS type goes unnoticed). Partial mitigation: run the leg's validator (Ajv `validate` / zod `.parse`) in `afterBuild` so factories that violate constraints fail tests. Selected for the AsyncAPI-leg factories; authoring cost scales with the unfilled contract-count fact.

## Key questions

**1. Can one generator cover both OpenAPI and AsyncAPI, or do we pair two?**
Pair two. No candidate generates all three artifact kinds from both formats: orval, kubb, hey-api, typed-openapi, and openapi-typescript are OpenAPI-only (each confirmed to have zero AsyncAPI support); Modelina reads both formats but emits models only (no validators, no factories); AsyncAPI Generator has no maintained TS template and emits no validation. The pipeline is therefore composed per leg: orval for OpenAPI, a thin built leg for AsyncAPI.

**2. Zod vs alternatives (valibot, ArkType, typia, Ajv, TypeBox): bundle, inference, error quality.**
All six are MIT. Measured bundle (bundlejs, 2026-08-13): zod full import 64.9 kB gz but zod/mini subsets ~4 kB; valibot 15.2 kB whole library (~1.4 kB per-schema in practice); ArkType a fixed 47.2 kB (parser + JIT ship regardless); Ajv 36.4 kB at runtime but **~0 library code with standalone precompiled validators**; typia inlines generated code; TypeBox `Code()` output is likewise precompiled plain JS whose size scales with schema count (unmeasured — a spike item). Throughput ([moltar node-24](https://moltar.github.io/typescript-runtime-type-benchmarks/), assertLoose ops/s): typia 78.2M, TypeBox 76.1M (AOT) / 70.4M (JIT), ArkType 53.3M, Ajv 35.7M, Zod 4 3.6M, valibot 1.39M, TypeBox dynamic fallback 2.3M. CSP: Ajv-standalone, typia, and TypeBox `TypeCompiler.Code()` output are compiled ahead of time and CSP-safe (TypeBox's in-process JIT instead auto-falls back to its slow dynamic mode under CSP); Zod 4 and ArkType's fast paths use `new Function` and need jitless config under strict CSP; valibot is interpreted and CSP-safe. Error quality: Zod 4 has the best human-readable rendering (`z.prettifyError`); Ajv's `keyword`/`instancePath`/`params` triple is the most machine-precise for telemetry; typia's `{path, expected, value}` is precise but developer-facing; TypeBox's TypeCompiler `Errors()` performs an exhaustive check yielding every error found. Verdict: **Zod 4 on the OpenAPI leg** (richest codegen ecosystem, best error rendering, adequate speed for REST-rate traffic, zod/mini for bundle) and **Ajv standalone on the AsyncAPI leg** — of the two candidates that natively execute the contracts' own JSON Schema (Ajv and TypeBox), Ajv has the more complete dialect coverage (drafts 04→2020-12 with full keyword support, plus OpenAPI `nullable`/`discriminator`; AsyncAPI 2.x Schema Objects are a draft-07 superset) and first-party standalone codegen, with compiled CSP-safe output and 10x Zod's throughput for the MQTT hot path. **TypeBox is the runner-up on this leg and the named spike alternative** (2026-08-13 amendment): the same native-JSON-Schema posture at ~2x Ajv's measured throughput, plus `Static<T>` types from the same schema object — held back by its draft-07-targeted 0.x dialect (1.x 2020-12 coverage is close but partial) and the single-maintainer schema2typebox codegen glue (see Survey and the spike section). typia is rejected here for contract-fidelity and toolchain reasons (see Survey); valibot loses on throughput plus a narrower ecosystem; ArkType has no contract codegen path at all.

**3. Factories from schemas or from types, and with which tool?**
From schemas where a schema leg exists; from types where it does not. OpenAPI leg: orval's faker/MSW generators produce response factories from the spec for every documented status (error-body mocks included via `generateEachHttpStatus`) — schema-derived, staying in lockstep with the contracts. AsyncAPI leg: **the Zod-4 verification note resolved negative for both flagged tools** — zod-fixture has had no Zod-4 work and no maintainer response (dormant since 2024); @anatine/zod-mock's Zod-4 fix is merged but unreleased behind a broken release pipeline. Since the AsyncAPI leg is Ajv-based (no zod schemas) and both zod-derived factory tools are blocked anyway, factories there are **type-derived via fishery**, with the compiled Ajv validator run in `afterBuild` to recover constraint coverage.

**4. Contract drift detection in CI.**
Because contracts are vendored, drift detection is a pure CI diff at the merge-base: one job triggered on changes under the contracts path. OpenAPI: [oasdiff](https://github.com/oasdiff/oasdiff) (Apache-2.0, v1.28.0 2026-08-06) — 509 change kinds, 213 classified breaking with ERR/WARN/INFO severity and a consumer-impact philosophy; it classifies **response-side** changes, so drift in non-2xx reason-code bodies is covered *if those bodies are modeled in the spec* (audit needed); official [GitHub Action](https://github.com/oasdiff/oasdiff-action). AsyncAPI: [@asyncapi/diff](https://github.com/asyncapi/diff) 0.5.0 (Apache-2.0, AsyncAPI Initiative; 3.x support since Dec 2024) is the only real option and the weak link — coarse breaking/non-breaking/unclassified classification, thin components/schemas coverage, slow cadence. Mitigations: fail CI on `unclassified`, maintain a project overrides file, and belt-and-braces diff the *extracted payload schemas* (which our built leg produces anyway). Excluded: Optic (archived 2026-01-12 post-acquisition), Atlassian openapi-diff (dormant), OpenAPITools openapi-diff (JVM dependency); pb33f/openapi-changes is a credible OpenAPI runner-up.

**5. Coverage guarantee: what makes bypassing validation hard to write?**
Three mutually reinforcing layers, all with prior art. (a) **Branded types on validated data** ("parse, don't validate", [Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)): Zod `.brand<T>()` output types on the OpenAPI leg and hand-branded Ajv type guards on the AsyncAPI leg; store/state types declared in branded terms make unvalidated ingress a compile error everywhere downstream. Caveats: forgeable by `as` (lintable, greppable); Zod 4 brand-loss edge in generic chaining ([#4715](https://github.com/colinhacks/zod/issues/4715)). (b) **Lint bans on raw transport imports** outside the 0060 choke-point directory: oxlint implements [`no-restricted-imports`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports) (≥0.15.0), fitting D-0002 with no new toolchain — ban `mqtt` and raw HTTP clients repo-wide, allow in the boundary layer via overrides; test the known overrides-merge caveats ([#12179](https://github.com/oxc-project/oxc/issues/12179)) and note global `fetch` needs `no-restricted-globals` or layer (a) to catch. (c) **Codegen structure that only exports validating accessors** (Zodios/orval prior art): the generated package exports the wrapped client and branded types, not raw passthrough — bypass then requires a deliberate cast.

**6. Hot-path cost of validating high-frequency MQTT traffic.**
Perspective first: even the slowest candidate spends ~1µs per small message; at 1,000 msg/s that is ~0.1% of one core, and `JSON.parse` itself rivals validation cost. Below ~1k msg/s any candidate passes on throughput alone — and the peak-rate fact is unfilled, so this is the report's assumption, not a measurement. The recommendation nevertheless keeps headroom by construction: Ajv standalone validators are compiled at build time (zero startup, CSP-safe, ~10x Zod 4, ~25x valibot). Mitigations if the spike measures higher rates: assert-don't-parse on hot topics (up to ~2.5x within a library); a declarative per-topic policy table keyed by AsyncAPI channel (validate-always for command/status/reason-code topics; 1-in-N or time-budgeted sampling for telemetry topics in prod, validate-always in dev/CI); validate exactly once at the 0060 choke point with per-topic validator caching; typia as the escalation ceiling (~78M ops/s) at the cost of its toolchain — with TypeBox AOT (76.1M ops/s, no transformer toolchain) as the intermediate step now recorded via the spike alternative.

**7. Failure semantics on live validation failure.**
Per-interface policy, synthesized from three postures in the prior art. Reject-and-quarantine for messages that drive state machines: never feed stores/xstate unparsed data; on failure, drop from the state-update flow and park a bounded ring of raw payload + structured error + topic/endpoint + timestamp (browser translation of the dead-letter-queue pattern — MQTT has no native DLQ). Tolerant-reader *strictness* inside the schemas (strip unknown keys rather than fail) so additive partner changes are not failures. A dev/prod strategy knob (throw/log/both) à la [orval #3110](https://github.com/orval-labs/orval/issues/3110). The failure surfaces to 0050-logging as a first-class signal using a four-class taxonomy: (1) transport error; (2) **contract violation** — schema mismatch, permanent, alert-worthy, deduped by endpoint-or-topic + schema path (Sentry's [zodErrorsIntegration](https://docs.sentry.io/platforms/javascript/configuration/integrations/zodErrors/) is shipping prior art for the event shape); (3) **contracted business error** — a non-2xx reason-code body that parses against its own schema is a *successful* parse, not a validation failure; a 409 whose body fails that schema is class (2); (4) unknown topic/endpoint. Distinguishing (2) from (3) is the key design point D-0006 exists for. Because the two legs emit different error shapes (ZodError vs Ajv error objects), the choke point must normalize both into this taxonomy — see Risks.

## Rubric comparison

Leading candidates as columns; scores strong/adequate/weak with terse evidence. Weights from the research plan. TypeBox column added 2026-08-13.

| Criterion (weight) | orval 8.24.0 | kubb 4.39.3 | hey-api 0.99.0 | typed-openapi 3.2.1 | Modelina 5.10.1 | typia 13.3.0 | TypeBox 0.34.52/1.3.13 |
|---|---|---|---|---|---|---|---|
| License (high) | strong — MIT throughout | strong — MIT all packages | strong — MIT; hosted platform optional | strong — MIT (repo LICENSE; npm field empty) | strong — Apache-2.0 | strong — MIT incl. @ttsc/unplugin | strong — MIT on both npm lines |
| Maintenance health (high) | strong — org-backed, 1–2wk cadence, pushed on access date | adequate — very active but bus factor 1 + v5 churn | strong — daily activity, sponsors; stable channel paused since Jun | strong — 4 releases Jul–Aug, 0 issues; solo, young v3 | adequate — org-backed; stable dormant ~10 mo pending v6 | adequate — daily releases; bus factor 1 across toolchain | adequate — active solo author; 0.x/1.x package split; schema2typebox glue quiet ~10 mo |
| TypeScript fit (high) | strong — per-status types + zod 3/4/mini | strong — z.infer schemas-as-truth, typed error unions | strong — typed SDK, separate *Errors types | strong — headless types-first, 7 runtime targets | adequate — rendered classes, no validator-inferred types | strong — validators compiled from the types themselves | strong — Static types inferred from the same schema object as the validator |
| Browser compatibility (high) | strong — plain TS + zod only; Node floor is codegen-time | strong — build-time only; zod/mini output | strong — plain TS + fetch client | strong — zero-dep headless client | strong — dependency-free classes | strong — AOT plain JS, CSP-safe | strong — AOT Code() output precompiled and CSP-safe; 1.x JIT auto-falls back under CSP |
| Contract-format support (high) | adequate — Swagger 2/3.0/3.1 incl. $dynamicRef; zero AsyncAPI | adequate — 2.0/3.0/3.1; zero AsyncAPI | adequate — "all OpenAPI versions"; zero AsyncAPI | adequate — 3.0/3.1; zero AsyncAPI | strong — both families (AsyncAPI 2–3, OAS, JSON Schema); models only | weak — consumes neither; tags needed to keep constraints | adequate — natively executes JSON Schema (draft-07 target; 1.x 2020-12 partial); needs schema2typebox codegen glue |
| Integration cost (medium) | adequate — one config; dual output projects + mutator wiring | adequate — one config; error-validation glue + v5 migration | adequate — cheap setup; 0.x migration treadmill | adequate — no coupling; spike needed on standalone schema reuse | adequate — easy lib; still needs validator + factory tools around it | weak — transformer toolchain; stock tsc silently bypasses | adequate — extraction script + schema2typebox; one artifact replaces the Ajv+Modelina pair |
| Runtime overhead (high) | adequate — interpreted zod; zod/mini mitigates | adequate — interpreted zod; zod/mini | adequate — zod/valibot interpreted; no compiled output | adequate — delegated to chosen runtime lib | n-a — emits no validators | strong — fastest measured (~78M ops/s), inlined code | strong — 76.1M ops/s AOT, ~2x Ajv, near typia |
| Output quality (high) | adequate — per-status zod schemas + mocks; built-in validation success-only; error-bug history | strong — per-status errors map out of the box; z.any() on body-less responses | adequate — union response schema blurs per-status; faker in progress | strong — TypedStatusError w/ status-specific body; runtime-validation depth unconfirmed | weak — unmarshal does no checking; v5 TS bugs fixed only in v6 | strong — per-field {path, expected, value} reports | adequate — types + validators from one source; exhaustive Errors diagnostics; dialect edge cases trail Ajv |
| Escape hatch (medium) | strong — mutator, transformers, per-op overrides, hooks | strong — custom generators, plugin API, hooks, v5 adapters | strong — plain TS output, exported schemas, plugin API | adequate — library API + custom fetchers; no template override | strong — layered presets + dependency manager | adequate — typia generate ejects to plain TS | adequate — 1.x compiler accepts native JSON Schema directly; hand-authored types possible |

Eliminated early or scoped out of the table: **openapi-zod-client** (author-deprecated, no LICENSE file, frozen zodios/Zod-3 stack); **openapi-typescript** (types-only by design — cannot meet D-0006 alone; component-quality strong, currently in a release lull); **AsyncAPI Generator** (no maintained TS template, no validator emission — build substrate only); **json-schema-to-zod** (archived June 2026); **zod-fixture** and **@anatine/zod-mock** (both fail the Zod-4 gate on npm today; zod-mock also lacks union support and a monorepo LICENSE file). **fishery** survives as the AsyncAPI factory leg (strong license/maintenance/TS fit; weak contract-format by design as a schema-agnostic tool) — omitted as a column because most pipeline criteria are n/a for a test-time factory library. Cross-cutting validator technologies (Zod 4, valibot, ArkType, Ajv, TypeBox) and drift tools (oasdiff, @asyncapi/diff) are compared under Key questions 2 and 4.

## Recommendation

**Shape: adopt + wrap, composed per leg.** No single tool spans both contract formats (Key question 1), so the pipeline names a primary per leg rather than forcing one tool.

**OpenAPI leg — adopt orval 8.24.0 + wrap.** One MIT, org-maintained dependency yields all three artifact kinds — types, per-status zod schemas (4xx/5xx included via `generateEachHttpStatus`, source-verified), and MSW/faker mocks per status. The wrap is a thin, sanctioned `mutator` that runs the generated per-status zod schema against non-2xx bodies, closing the D-0006 gap that orval's built-in success-only `runtimeValidation` leaves. On the high-weight criteria orval and kubb tie except that orval wins maintenance health (org + cadence vs bus-factor-one + v4→v5 churn) and kubb wins output quality (its errors-by-status operations map is generated, orval's equivalent is assembled). Since **both** need custom glue to actually validate error bodies at runtime, the maintenance edge decides it; **kubb is the named fallback** if the spike shows the orval mutator wiring is brittle.

**AsyncAPI leg — build thin.** Every off-the-shelf path fails: Modelina emits no validators, AsyncAPI Generator has no TS template, json-schema-to-zod is archived, and its own author recommends Ajv for runtime JSON Schema validation. The build is deliberately small: a script using `@asyncapi/parser` extracts and dereferences payload schemas from the vendored contracts, then (a) Ajv 8 **standalone codegen** compiles them at build time into plain, CSP-safe validator functions (native execution of the contracts' own schema language — no lossy translation; ~10x Zod throughput for the MQTT hot path), and (b) Modelina renders the matching TS types. Both artifacts derive from the same vendored contract in the same build step, which contains the two-sources-of-truth drift risk. Factories: fishery `Factory<T>` per payload type with the compiled Ajv validator asserted in `afterBuild`. The 2026-08-13 amendment records a **single-artifact spike alternative** for this leg: schema2typebox converts the same extracted schemas to TypeBox schemas, from which `Static<T>` supplies the types and `TypeCompiler.Code()` the compiled CSP-safe validators — one artifact replacing the Ajv + Modelina pair and removing the Modelina-dormancy risk. It stays an alternative, not the primary, because the schema2typebox glue is single-maintainer and ~10 months quiet; its maintenance state is the spike's stated go/no-go (see the spike section).

**Cross-cutting adoptions:** oasdiff + @asyncapi/diff for drift CI (Key question 4); the three-layer coverage guarantee — branded types, oxlint `no-restricted-imports`, validating-accessor-only exports (Key question 5, per D-0002); reject-and-quarantine failure semantics with the four-class taxonomy feeding 0050 (Key question 7).

**Constraints applied:** D-0001 (survey-only; every open verification lands in the spike section below), D-0002 (coverage lint uses oxlint, no new lint toolchain), D-0003 (every recommended tool is free OSS — MIT or Apache-2.0; Optic was excluded on archival, and hey-api's optional hosted platform was checked and found non-contaminating), D-0004 (facts/app-profile.md is unfilled; every substituted assumption is declared below), D-0006 (the keystone requirement driving the per-status error-schema analysis and the AsyncAPI validator choice), D-0007 (STE summary above).

**Risks — honest about the weakest links:**

1. **The built AsyncAPI leg is the weakest link.** The extraction + Ajv-codegen script is bespoke code this team owns forever, and Modelina — the types half — scored *weak* on output quality with its stable channel dormant pending v6. Mitigations: the script is small and sits on two org-backed, Apache-2.0 libraries (parser, Ajv); Ajv standalone output is plain committed JS that keeps working even if tooling stalls; if Modelina's types disappoint, json-schema-to-typescript is a drop-in alternative for the same extracted schemas; and the TypeBox spike alternative (2026-08-13 amendment) removes the Modelina dependency altogether by deriving types and validators from one artifact, if schema2typebox passes its go/no-go.
2. **Orval's error-path polish.** Built-in runtime validation skips error bodies, and the tracker shows a history of error-typing bugs. The mutator wrap must be spike-verified end to end; kubb (with its own bus-factor risk) is the tested fallback.
3. **Two validation technologies, two error shapes.** Zod on REST, Ajv on MQTT means the 0060 choke point must normalize ZodError and Ajv error objects into one telemetry taxonomy for 0050. This is a deliberate trade (each leg gets its best-fit tech) but it is permanent integration surface. (The TypeBox alternative would swap the Ajv error shape for TypeBox's, not remove the two-shape normalization.)
4. **@asyncapi/diff is coarse and slow-moving** — the drift gate on precisely the leg where payload-schema drift matters most. Mitigations: fail-closed on `unclassified`, plus diffing the extracted payload schemas directly.
5. **Unfilled app facts could flip calls.** A Swagger-2.0 contract, a strict CSP, a >10k msg/s MQTT rate, or a hard bundle budget would each reorder candidates (see assumptions).

**Assumptions declared in place of facts (D-0004; each is a question for the app owner in facts/app-profile.md):**

- The vendored OpenAPI contracts are 3.0 or 3.1, not Swagger 2.0 (affects oasdiff, openapi-typescript viability, and 3.1 edge-case exposure).
- The OpenAPI contracts actually model non-2xx reason-code bodies under each operation's `responses` (without this, no generator can emit per-status error schemas).
- The AsyncAPI contracts are 2.x or 3.x with default JSON-Schema-dialect payload schemas, not Avro/Protobuf `schemaFormat` (Ajv path depends on it).
- Peak MQTT message rate is moderate (assumed ≤ ~1k msg/s), making every candidate viable on throughput and sampling unnecessary; Ajv keeps ~10–25x headroom regardless.
- The bundle budget accommodates zod (or zod/mini) plus the generated Ajv validator code, whose size grows with schema count.
- The build tool is a mainstream bundler that can run dev-time codegen steps; no compiler-transformer requirement (this disadvantage was scored against typia).
- TypeScript is ≥5.x (zod 4 peer requirement; branding ergonomics).
- CSP posture is unknown; the recommendation stays CSP-safe by construction (Ajv standalone; zod would need `jitless` config under a strict CSP).
- The oxlint version in use is ≥0.15.0 (needed for `no-restricted-imports`).
- Contract/schema counts are moderate, keeping fishery hand-authoring and Ajv codegen output size tractable.
- The incumbent type-generation tool has no downstream consumers that pin its exact output shapes.

## What a spike would validate

Pre-scoped per D-0001; each item is a go/no-go check against the real vendored contracts.

- **Orval wrap (decisive for the OpenAPI leg):** configure `generateEachHttpStatus` + a custom `mutator`; confirm non-2xx bodies are zod-parsed at runtime, typed unions reach callers, and the dual output-project config (client + zod) stays maintainable. Measure the wrap's size in lines.
- **Kubb fallback comparison:** reproduce the same non-2xx validation over kubb's generated `errors` operations map; compare glue thickness and config complexity before final commitment.
- **AsyncAPI extraction pipeline:** run `@asyncapi/parser` over a real vendored contract; verify payload-schema extraction, `$ref` dereferencing, and extension-keyword handling under Ajv strict mode; select the correct Ajv draft class; confirm Modelina's types structurally match what the Ajv validators accept.
- **TypeBox single-artifact alternative (AsyncAPI leg):** run schema2typebox over the same extracted payload schemas; verify the generated TypeBox schemas yield faithful `Static<T>` types (structurally matching what the validators accept) and that `TypeCompiler.Code()` emits standalone CSP-safe validators covering the real contracts' keywords, with diagnostics comparable to Ajv's error objects. **Stated go/no-go: schema2typebox's maintenance state** (single maintainer, quiet since 2025-10-20, draft-2020-12 conversion "not expected to fully work") plus dialect parity against Ajv on the actual schemas. Pass: the leg collapses to one artifact and drops both Modelina and the Ajv codegen. Fail: the recommended Ajv + Modelina build stands.
- **Bundle measurements:** actual gz deltas for zod vs zod/mini over the real generated schema set, and the Ajv standalone output size for the real schema count (plus the TypeBox `Code()` output size if the single-artifact alternative is spiked), against whatever budget the app owner supplies.
- **Browser-side throughput:** benchmark the compiled Ajv validators and the zod schemas on representative payloads in a real browser (moltar's numbers are Node/V8), at the owner-supplied peak rate.
- **typed-openapi open question (only if orval fails):** empirically confirm whether its non-2xx bodies get full runtime schema validation or typed parsing only.
- **Drift gates:** introduce a synthetic breaking change to a reason-code body and to an MQTT payload schema; confirm oasdiff flags the former, and determine whether @asyncapi/diff catches the latter or whether the extracted-schema diff is required; verify fail-closed on `unclassified`.
- **Coverage layers:** verify oxlint `no-restricted-imports` overrides behave in this repo's oxlint version (the overrides-merge caveat); verify `.brand` survives the app's typical generic utility chains; confirm the generated package can export only validating accessors.
- **Failure semantics prototype:** implement the quarantine ring buffer and the normalized four-class telemetry event over both error shapes (ZodError, Ajv errors) to validate the 0050 signal design.
- **Factory gate re-check:** confirm whether @anatine/zod-mock 3.14.1 has shipped to npm; if so, re-evaluate schema-derived factories for any zod-covered surface before committing fishery authoring effort.

## Sources

- https://github.com/orval-labs/orval — accessed 2026-08-13
- https://github.com/orval-labs/orval/releases — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/README.md — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/skills/orval/zod-validation.md — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/skills/orval/mocking-msw.md — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/packages/zod/src/index.ts — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/packages/fetch/src/index.ts — accessed 2026-08-13
- https://github.com/orval-labs/orval/blob/master/packages/zod/package.json — accessed 2026-08-13
- https://github.com/orval-labs/orval/issues/258 — accessed 2026-08-13
- https://github.com/orval-labs/orval/issues/1801 — accessed 2026-08-13
- https://github.com/orval-labs/orval/issues/2749 — accessed 2026-08-13
- https://github.com/orval-labs/orval/issues/1975 — accessed 2026-08-13
- https://github.com/orval-labs/orval/issues/3110 — accessed 2026-08-13
- https://github.com/anymaniax/orval/issues/891 — accessed 2026-08-13
- https://github.com/anymaniax/orval/issues/890 — accessed 2026-08-13
- https://orval.dev/docs/guides/zod/ — accessed 2026-08-13
- https://orval.dev/docs/reference/configuration/output/ — accessed 2026-08-13
- https://registry.npmjs.org/orval/latest — accessed 2026-08-13
- https://api.github.com/repos/orval-labs/orval — accessed 2026-08-13
- https://api.github.com/repos/orval-labs/orval/releases?per_page=6 — accessed 2026-08-13
- https://github.com/kubb-labs/kubb — accessed 2026-08-13
- https://github.com/kubb-labs/kubb/releases — accessed 2026-08-13
- https://github.com/kubb-labs/kubb/discussions/600 — accessed 2026-08-13
- https://github.com/kubb-labs/kubb/issues/2003 — accessed 2026-08-13
- https://github.com/kubb-labs/kubb/issues/1223 — accessed 2026-08-13
- https://registry.npmjs.org/kubb/latest — accessed 2026-08-13
- https://registry.npmjs.org/@kubb/core — accessed 2026-08-13
- https://registry.npmjs.org/@kubb/plugin-zod — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/@kubb/core — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/@kubb/plugin-zod — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/@kubb/plugin-ts — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/kubb — accessed 2026-08-13
- https://api.github.com/repos/kubb-labs/kubb/contributors — accessed 2026-08-13
- https://v4.kubb.dev/kubb/plugins/plugin-zod — accessed 2026-08-13
- https://v4.kubb.dev/kubb/plugins/plugin-client — accessed 2026-08-13
- https://v4.kubb.dev/kubb/guide/oas — accessed 2026-08-13
- https://kubb.dev/adapters — accessed 2026-08-13
- https://kubb.dev/plugins/plugin-zod — accessed 2026-08-13
- https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/zod/src/gen/zod/getPetByIdSchema.ts — accessed 2026-08-13
- https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/zod/src/gen/zod/operations.ts — accessed 2026-08-13
- https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/faker/src/gen/faker/createPet.ts — accessed 2026-08-13
- https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/client/src/gen/clients/axios/petService/getPetById.ts — accessed 2026-08-13
- https://raw.githubusercontent.com/kubb-labs/kubb/v4/examples/generators/kubb.config.ts — accessed 2026-08-13
- https://github.com/hey-api/hey-api — accessed 2026-08-13
- https://github.com/hey-api/hey-api/releases — accessed 2026-08-13
- https://github.com/hey-api/hey-api/issues/1485 — accessed 2026-08-13
- https://github.com/sponsors/hey-api — accessed 2026-08-13
- https://registry.npmjs.org/@hey-api/openapi-ts — accessed 2026-08-13
- https://api.github.com/repos/hey-api/hey-api — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/plugins/zod/v4 — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/plugins/valibot — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/plugins/faker — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/plugins/sdk — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/clients/fetch — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/configuration/input — accessed 2026-08-13
- https://heyapi.dev/docs/openapi/typescript/output — accessed 2026-08-13
- https://heyapi.dev/openapi-ts/validators — accessed 2026-08-13
- https://heyapi.dev/openapi-ts/migrating — accessed 2026-08-13
- https://heyapi.dev/openapi-ts/integrations — accessed 2026-08-13
- https://github.com/astahmer/openapi-zod-client — accessed 2026-08-13
- https://github.com/astahmer/openapi-zod-client/issues/354 — accessed 2026-08-13
- https://raw.githubusercontent.com/astahmer/openapi-zod-client/main/README.md — accessed 2026-08-13
- https://registry.npmjs.org/openapi-zod-client — accessed 2026-08-13
- https://registry.npmjs.org/@zodios/core — accessed 2026-08-13
- https://github.com/astahmer/typed-openapi — accessed 2026-08-13
- https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/validation/input-output.md — accessed 2026-08-13
- https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/clients/errors-and-responses.md — accessed 2026-08-13
- https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/getting-started.md — accessed 2026-08-13
- https://github.com/astahmer/typed-openapi/blob/main/docs/src/content/docs/advanced/library-api.md — accessed 2026-08-13
- https://registry.npmjs.org/typed-openapi — accessed 2026-08-13
- https://github.com/openapi-ts/openapi-typescript — accessed 2026-08-13
- https://github.com/openapi-ts/openapi-typescript/releases — accessed 2026-08-13
- https://github.com/openapi-ts/openapi-typescript/issues/1420 — accessed 2026-08-13
- https://registry.npmjs.org/openapi-typescript/latest — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/openapi-typescript — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/openapi-fetch — accessed 2026-08-13
- https://api.github.com/repos/openapi-ts/openapi-typescript — accessed 2026-08-13
- https://api.github.com/repos/openapi-ts/openapi-typescript/releases?per_page=10 — accessed 2026-08-13
- https://api.github.com/repos/openapi-ts/openapi-typescript/commits?per_page=10 — accessed 2026-08-13
- https://api.github.com/repos/openapi-ts/openapi-typescript/commits?since=2026-05-06T00:00:00Z&per_page=20 — accessed 2026-08-13
- https://openapi-ts.dev/introduction — accessed 2026-08-13
- https://openapi-ts.dev/advanced — accessed 2026-08-13
- https://openapi-ts.dev/about — accessed 2026-08-13
- https://openapi-ts.dev/examples — accessed 2026-08-13
- https://openapi-ts.dev/node — accessed 2026-08-13
- https://openapi-ts.dev/openapi-fetch/ — accessed 2026-08-13
- https://github.com/asyncapi/modelina — accessed 2026-08-13
- https://github.com/asyncapi/modelina/releases — accessed 2026-08-13
- https://github.com/asyncapi/modelina/blob/master/docs/languages/TypeScript.md — accessed 2026-08-13
- https://github.com/asyncapi/modelina/blob/master/docs/presets.md — accessed 2026-08-13
- https://github.com/asyncapi/modelina/tree/master/examples/typescript-generate-marshalling — accessed 2026-08-13
- https://github.com/asyncapi/modelina/issues/2452 — accessed 2026-08-13
- https://github.com/asyncapi/modelina/issues/532 — accessed 2026-08-13
- https://github.com/asyncapi/modelina/issues/418 — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/modelina — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/modelina/latest — accessed 2026-08-13
- https://github.com/asyncapi/generator — accessed 2026-08-13
- https://github.com/asyncapi/parser-js — accessed 2026-08-13
- https://github.com/asyncapi-archived-repos/ts-nats-template — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/generator — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/ts-nats-template — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/nodejs-template — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/html-template — accessed 2026-08-13
- https://api.github.com/repos/asyncapi/generator/contents/packages/templates/clients — accessed 2026-08-13
- https://github.com/search?q=topic%3Aasyncapi+topic%3Agenerator+topic%3Atemplate — accessed 2026-08-13
- https://www.asyncapi.com/docs/tools/generator — accessed 2026-08-13
- https://www.asyncapi.com/docs/tools/generator/template-development — accessed 2026-08-13
- https://www.asyncapi.com/docs/tools/generator/typescript-support — accessed 2026-08-13
- https://www.asyncapi.com/docs/tools/generator/migration-nunjucks-react — accessed 2026-08-13
- https://www.asyncapi.com/docs/tools/generator/parser — accessed 2026-08-13
- https://www.asyncapi.com/docs/reference/specification/v3.0.0 — accessed 2026-08-13
- https://github.com/asyncapi/spec/blob/master/spec/asyncapi.md — accessed 2026-08-13
- https://github.com/StefanTerdell/json-schema-to-zod — accessed 2026-08-13
- https://github.com/StefanTerdell/json-schema-to-zod/tree/master/src/parsers — accessed 2026-08-13
- https://raw.githubusercontent.com/StefanTerdell/json-schema-to-zod/master/README.md — accessed 2026-08-13
- https://registry.npmjs.org/json-schema-to-zod — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/json-schema-to-zod — accessed 2026-08-13
- https://api.github.com/repos/StefanTerdell/json-schema-to-zod — accessed 2026-08-13
- https://github.com/glideapps/zod-from-json-schema — accessed 2026-08-13
- https://registry.npmjs.org/zod-from-json-schema — accessed 2026-08-13
- https://registry.npmjs.org/@n8n/json-schema-to-zod — accessed 2026-08-13
- https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/json-schema-to-zod/LICENSE — accessed 2026-08-13
- https://registry.npmjs.org/@dmitryrechkin/json-schema-to-zod — accessed 2026-08-13
- https://github.com/sinclairzx81/typebox — accessed 2026-08-13
- https://raw.githubusercontent.com/sinclairzx81/typebox/main/readme.md — accessed 2026-08-13
- https://api.github.com/repos/sinclairzx81/typebox — accessed 2026-08-13
- https://api.github.com/repos/sinclairzx81/typebox/tags?per_page=10 — accessed 2026-08-13
- https://github.com/sinclairzx81/sinclair-typebox — accessed 2026-08-13
- https://raw.githubusercontent.com/sinclairzx81/sinclair-typebox/main/readme.md — accessed 2026-08-13
- https://registry.npmjs.org/@sinclair/typebox — accessed 2026-08-13
- https://registry.npmjs.org/@sinclair/typebox/latest — accessed 2026-08-13
- https://registry.npmjs.org/typebox/latest — accessed 2026-08-13
- https://github.com/xddq/schema2typebox — accessed 2026-08-13
- https://api.github.com/repos/xddq/schema2typebox — accessed 2026-08-13
- https://registry.npmjs.org/schema2typebox — accessed 2026-08-13
- https://github.com/samchon/typia — accessed 2026-08-13
- https://github.com/samchon/typia/releases — accessed 2026-08-13
- https://github.com/samchon/ttsc — accessed 2026-08-13
- https://github.com/ryoppippi/unplugin-typia — accessed 2026-08-13
- https://registry.npmjs.org/typia — accessed 2026-08-13
- https://registry.npmjs.org/typia/latest — accessed 2026-08-13
- https://registry.npmjs.org/@ttsc/unplugin — accessed 2026-08-13
- https://api.npmjs.org/downloads/point/last-week/typia — accessed 2026-08-13
- https://api.github.com/repos/samchon/typia — accessed 2026-08-13
- https://api.github.com/repos/samchon/typia/contributors — accessed 2026-08-13
- https://www.npmjs.com/package/typia — accessed 2026-08-13
- https://typia.io/docs/ — accessed 2026-08-13
- https://typia.io/docs/setup/ — accessed 2026-08-13
- https://typia.io/docs/random/ — accessed 2026-08-13
- https://typia.io/docs/validators/validate/ — accessed 2026-08-13
- https://typia.io/docs/validators/tags/ — accessed 2026-08-13
- https://github.com/timdeschryver/zod-fixture — accessed 2026-08-13
- https://github.com/timdeschryver/zod-fixture/issues/99 — accessed 2026-08-13
- https://registry.npmjs.org/zod-fixture — accessed 2026-08-13
- https://api.github.com/repos/timdeschryver/zod-fixture — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/issues/253 — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/issues/264 — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/pull/265 — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/issues/269 — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/issues/208 — accessed 2026-08-13
- https://github.com/anatine/zod-plugins/issues/196 — accessed 2026-08-13
- https://registry.npmjs.org/@anatine%2Fzod-mock — accessed 2026-08-13
- https://raw.githubusercontent.com/anatine/zod-plugins/main/packages/zod-mock/package.json — accessed 2026-08-13
- https://raw.githubusercontent.com/anatine/zod-plugins/main/packages/zod-mock/README.md — accessed 2026-08-13
- https://api.github.com/repos/anatine/zod-plugins — accessed 2026-08-13
- https://github.com/thoughtbot/fishery — accessed 2026-08-13
- https://registry.npmjs.org/fishery — accessed 2026-08-13
- https://api.github.com/repos/thoughtbot/fishery — accessed 2026-08-13
- https://registry.npmjs.org/zod — accessed 2026-08-13
- https://registry.npmjs.org/zod/latest — accessed 2026-08-13
- https://registry.npmjs.org/valibot/latest — accessed 2026-08-13
- https://registry.npmjs.org/arktype/latest — accessed 2026-08-13
- https://registry.npmjs.org/ajv/latest — accessed 2026-08-13
- https://github.com/colinhacks/zod/releases — accessed 2026-08-13
- https://github.com/colinhacks/zod/releases/tag/v4.2.0 — accessed 2026-08-13
- https://github.com/colinhacks/zod/issues/5789 — accessed 2026-08-13
- https://github.com/colinhacks/zod/issues/4715 — accessed 2026-08-13
- https://github.com/fabian-hiller/valibot/releases — accessed 2026-08-13
- https://github.com/arktypeio/arktype/releases — accessed 2026-08-13
- https://github.com/ajv-validator/ajv/releases — accessed 2026-08-13
- https://zod.dev/v4 — accessed 2026-08-13
- https://zod.dev/json-schema — accessed 2026-08-13
- https://zod.dev/api — accessed 2026-08-13
- https://valibot.dev/guides/comparison/ — accessed 2026-08-13
- https://valibot.dev/guides/issues/ — accessed 2026-08-13
- https://arktype.io/docs/configuration — accessed 2026-08-13
- https://ajv.js.org/standalone.html — accessed 2026-08-13
- https://ajv.js.org/json-schema.html — accessed 2026-08-13
- https://ajv.js.org/api.html — accessed 2026-08-13
- https://moltar.github.io/typescript-runtime-type-benchmarks/ — accessed 2026-08-13
- https://raw.githubusercontent.com/moltar/typescript-runtime-type-benchmarks/master/docs/results/node-24.json — accessed 2026-08-13
- https://raw.githubusercontent.com/moltar/typescript-runtime-type-benchmarks/master/package.json — accessed 2026-08-13
- https://deno.bundlejs.com/?q=zod&treeshake=[{z}] — accessed 2026-08-13
- https://deno.bundlejs.com/?q=zod/mini&treeshake=[{string,object,number,boolean,array,parse,safeParse}] — accessed 2026-08-13
- https://deno.bundlejs.com/?q=valibot&treeshake=[*] — accessed 2026-08-13
- https://deno.bundlejs.com/?q=arktype — accessed 2026-08-13
- https://deno.bundlejs.com/?q=ajv&treeshake=[{default}] — accessed 2026-08-13
- https://gist.github.com/ssalbdivad/d60d876ab6486adc97e38e3f6916e93f — accessed 2026-08-13
- https://news.ycombinator.com/item?id=43665540 — accessed 2026-08-13
- https://github.com/oasdiff/oasdiff — accessed 2026-08-13
- https://github.com/oasdiff/oasdiff-action — accessed 2026-08-13
- https://api.github.com/repos/oasdiff/oasdiff/releases/latest — accessed 2026-08-13
- https://www.oasdiff.com/docs/breaking-changes — accessed 2026-08-13
- https://github.com/asyncapi/diff — accessed 2026-08-13
- https://github.com/asyncapi/diff/issues/160 — accessed 2026-08-13
- https://github.com/asyncapi/diff/issues/150 — accessed 2026-08-13
- https://github.com/asyncapi/diff/issues/207 — accessed 2026-08-13
- https://github.com/asyncapi/cli/issues/58 — accessed 2026-08-13
- https://registry.npmjs.org/@asyncapi/diff — accessed 2026-08-13
- https://github.com/opticdev/optic — accessed 2026-08-13
- https://dev.to/flarecanary/optic-is-dead-what-now-for-api-drift-detection-2kb8 — accessed 2026-08-13
- https://github.com/pb33f/openapi-changes — accessed 2026-08-13
- https://pb33f.io/openapi-changes/configuring/ — accessed 2026-08-13
- https://registry.npmjs.org/openapi-diff — accessed 2026-08-13
- https://cloudsmith.com/navigator/maven/org.openapitools.openapidiff:openapi-diff-core — accessed 2026-08-13
- https://github.com/siom79/jasyncapicmp — accessed 2026-08-13
- https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/ — accessed 2026-08-13
- https://spin.atomicobject.com/zod-brand/ — accessed 2026-08-13
- https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/20881 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/12179 — accessed 2026-08-13
- https://github.com/oxc-project/oxc/issues/19237 — accessed 2026-08-13
- https://eslint.org/docs/latest/rules/no-restricted-imports — accessed 2026-08-13
- https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports — accessed 2026-08-13
- https://www.npmjs.com/package/eslint-plugin-boundaries — accessed 2026-08-13
- https://www.zodios.org/docs/client — accessed 2026-08-13
- https://www.zodios.org/docs/client/plugins — accessed 2026-08-13
- https://docs.sentry.io/platforms/javascript/configuration/integrations/zodErrors/ — accessed 2026-08-13
- https://kestra.io/resources/infrastructure/dead-letter-queue — accessed 2026-08-13
- https://www.conduktor.io/glossary/dead-letter-queues-for-error-handling — accessed 2026-08-13
- https://andreas-loizou.medium.com/the-power-of-the-tolerant-reader-in-kafka-microservices-963419a73a6b — accessed 2026-08-13
- https://medium.com/digitalfrontiers/demystified-tolerant-reader-ca07d6bea602 — accessed 2026-08-13
- https://www.wisp.blog/blog/validating-api-response-with-zod — accessed 2026-08-13
- https://laniewski.me/blog/2023-11-19-api-response-validation-with-zod/ — accessed 2026-08-13
