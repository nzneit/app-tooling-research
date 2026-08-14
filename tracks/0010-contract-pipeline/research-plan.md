# 0010-contract-pipeline — research plan

**Status**: draft

## Goal

Pick one pipeline from the vendored AsyncAPI/OpenAPI contracts to three artifact kinds:
TS types (replacing current generation if warranted), runtime validation schemas, and
object factories/mocks (replacing the kludgey ones). The runtime-validation output must
support live validation of every inbound message from any contracted interface (D-0006):
MQTT payloads (AsyncAPI) and REST response bodies including non-2xx reason-code bodies
(OpenAPI). Keystone track: its conclusions feed 0060 and 0070.

## Key questions

1. Can one generator cover both OpenAPI and AsyncAPI, or do we pair two?
2. Zod vs alternatives (valibot, ArkType, typia, Ajv on raw JSON Schema): bundle size,
   TS inference quality, and error-message quality when a partner breaks an interface.
3. Are factories generated from schemas or from types, and with which tool?
4. Contract drift: how do we detect in CI when a vendored contract update lands incompatibly?
5. Coverage guarantee: what mechanism (type-level design, lint rule, or codegen structure)
   makes bypassing validation hard to write, alongside the 0060 transport choke point?
6. Hot-path cost: what is the overhead of validating high-frequency MQTT traffic, and what
   are the mitigations (compiled validators like Ajv/typia vs interpreted like Zod;
   per-topic policies; validate-always vs sample-in-prod)? Compare candidates on
   validation throughput, not just DX.
7. Failure semantics: on live validation failure — reject, pass through flagged, or
   quarantine? How does the failure surface as a first-class "partner introduced a
   breaking interface" signal (wired into 0050-logging)?

## Candidates

- orval — https://github.com/orval-labs/orval — OpenAPI → client + zod + MSW mocks
- kubb — https://github.com/kubb-labs/kubb — plugin-based OpenAPI codegen (types/zod/faker)
- hey-api/openapi-ts — https://github.com/hey-api/openapi-ts — OpenAPI → TS + validator plugins
- openapi-zod-client — https://github.com/astahmer/openapi-zod-client — OpenAPI → zodios/zod
- typed-openapi — https://github.com/astahmer/typed-openapi — OpenAPI → typed client/schemas
- openapi-typescript — https://github.com/openapi-ts/openapi-typescript — most-adopted OpenAPI → TS type generator (types only; pairs with a validator generator)
- AsyncAPI Modelina — https://github.com/asyncapi/modelina — AsyncAPI/JSON Schema → models
- AsyncAPI Generator — https://github.com/asyncapi/generator — template-based AsyncAPI codegen
- json-schema-to-zod — https://github.com/StefanTerdell/json-schema-to-zod — JSON Schema → zod
- typia — https://github.com/samchon/typia — compile-time validators/random from TS types
- zod-fixture — https://github.com/timdeschryver/zod-fixture — fixtures from zod schemas
- @anatine/zod-mock — https://github.com/anatine/zod-plugins — mocks from zod schemas
- fishery — https://github.com/thoughtbot/fishery — typed object factories

## Survey verification notes

- Verify Zod 4 compatibility of zod-fixture and @anatine/zod-mock before scoring; both
  were flagged (unverified) as Zod-3-era.

## Rubric weights

| Criterion | Weight |
|---|---|
| License | high |
| Maintenance health | high |
| TypeScript fit | high |
| Browser compatibility | high |
| Contract-format support | high |
| Integration cost | medium |
| Runtime overhead | high |
| Output quality | high |
| Escape hatch | medium |

## Facts needed

- Contracts: OpenAPI/AsyncAPI versions, rough counts, current type-generation tool
- MQTT: rough peak message rate (for question 6)
- Stack: build tool, TypeScript version, browser targets
