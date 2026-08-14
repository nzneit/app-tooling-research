// orval 8.24.0 — the REST leg's generator config.
//
// Two targets over ONE synthetic contract (contract/plants.openapi.json):
//
//  1. `plants`    — client: 'react-query' with the design's caller-owned custom
//                   mutator (app/api/mutator.ts). This is the target the
//                   decisive signal-threading check runs against.
//  2. `plantsZod` — client: 'zod' with `generateEachHttpStatus: true`, which is
//                   what makes PER-STATUS validation real: it emits a separate
//                   schema per declared response status (200/409/422), so the
//                   declared-vs-undeclared split in the boundary's REST ingress
//                   is driven by generated artifacts rather than hand-written
//                   ones.
//
// Generated output is committed on purpose: it is the spike's evidence.

import { defineConfig } from "orval";

export default defineConfig({
  plants: {
    input: { target: "./contract/plants.openapi.json" },
    output: {
      mode: "single",
      // No `schemas:` dir on purpose: a split models directory makes orval emit
      // an extensionless barrel import (`from './model'`), which TypeScript
      // rejects under moduleResolution: nodenext (TS2834). `mode: 'single'` with
      // models inlined sidesteps it. Recorded in findings.md.
      target: "./app/api/generated/plants.ts",
      client: "react-query",
      // The mutator CALL CONVENTION follows httpClient, and design.md's
      // `BoundaryFetcher` request shape ({url, method, params, data, headers})
      // is the axios-config shape. See app/api/mutator.ts and the fetch-client
      // twin below — where `signal` arrives differs between the two.
      httpClient: "axios",
      tsconfig: "./tsconfig.json",
      override: {
        mutator: {
          path: "./app/api/mutator.ts",
          name: "customInstance",
        },
      },
    },
  },
  // The same contract through orval's OTHER mutator convention, generated only
  // so the spike can show what changes: `httpClient: 'fetch'` hands the mutator
  // (url, requestInit) instead of (config, options), and `signal` moves.
  plantsFetchClient: {
    input: { target: "./contract/plants.openapi.json" },
    output: {
      mode: "single",
      target: "./app/api/generated/plants.fetch.ts",
      client: "react-query",
      httpClient: "fetch",
      tsconfig: "./tsconfig.json",
      override: {
        mutator: {
          path: "./app/api/mutator-fetch.ts",
          name: "fetchInstance",
        },
      },
    },
  },
  plantsZod: {
    input: { target: "./contract/plants.openapi.json" },
    output: {
      mode: "single",
      target: "./app/api/generated/plants.zod.ts",
      client: "zod",
      tsconfig: "./tsconfig.json",
      override: {
        zod: {
          generateEachHttpStatus: true,
        },
      },
    },
  },
});
