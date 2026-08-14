# 2026-08-13: app-profile facts assumed by Wave 1 surveys (intake)

**Status**: open
**Owner**: app owner

Wave 1 survey reports were drafted against an unfilled facts/app-profile.md; each report
declares its assumptions inline. This file collects the assumed facts as questions, one
section per track, so they can be answered in one pass. Resolving: fill in
facts/app-profile.md and flip this Status to resolved.

## a — facts assumed by 0020-complexity-metrics

- What TypeScript version does the app use? (No longer load-bearing for 0020: the accepted composition — oxlint, Biome, fta-cli, optional cognitive-complexity-ts — parses TS/TSX natively or bundles its own compiler, so no tool couples to the app's TypeScript version; the report's earlier sonarjs-driven >=5.0/<6.1.0 range is obsolete after D-0011's exclusion.)
- Which CI provider runs the pipeline? (The report assumed GitHub Actions and picked Biome's `github` reporter for PR annotations; on GitLab the recommendation shifts to `--reporter=gitlab`, which feeds the Code Quality widget and improves the trend story.)
- Is the repository private, and does the plan include paid GitHub Code Security / GHAS? (The report assumed private without Code Security, so SARIF code scanning — including Biome's `sarif` reporter — was treated as unavailable and the free `github`-reporter annotation path was chosen instead.)
- What is the approximate app scale — number of source files, components, and the size of the largest files? (The report assumed a mid-sized codebase, low thousands of files at most, making the one-time Biome `--suppress` seeding diff and fta-cli's per-file ranking tractable.)
- What does the current .oxlintrc.json enable — are any complexity-family rules already turned on? (The report assumed none, since all nine complexity-family rules are off by default.)
- Where does complexity currently concentrate — spread across many files or concentrated in a few large components? (The report assumed spread; heavy concentration in a few files would weaken fta-cli's per-file granularity as a planning tool.)
- ~~SSALv1 legal position~~ — resolved by D-0011 (2026-08-13): post-v2.0.4 sonarjs releases are excluded as non-OSS; no legal review needed.

## b — facts assumed by 0030-duplication-detection

- Which CI provider does the application use? (The report assumes GitHub Actions; the official jscpd Action, the SARIF route, and the diff-scoped PR-annotation action are all GitHub-only.)
- Is the application repository hosted on GitHub, and is GitHub Code Scanning available to it (public repo, or a GitHub Advanced Security license)? (The SARIF-based clone-level ratchet depends on this.)
- What is the approximate scale of the codebase (source file count, kLoC), and is it a multi-workspace monorepo? (The report assumes a small-to-mid TypeScript monorepo of roughly hundreds to low thousands of source files; this drives threshold starting points and similarity-ts runtime expectations.)
- What share of the code lives in `.tsx` files versus `.ts`? (The report assumes a meaningful `.tsx` share — this is the fact that eliminates PMD CPD.)
- Do the vendored AsyncAPI/OpenAPI contracts and all generated code live in dedicated directories that glob patterns can cleanly exclude from scans?
- Can CI runners download and execute a prebuilt Rust binary from GitHub Releases? (similarity-ts has no npm package; the report assumes yes.)
- Does CI run on runner images without constraints that would block a static binary or npx invocation (e.g., locked-down container images)? (The report assumes a standard Node-capable environment; note the JVM absence is what penalizes PMD CPD.)
- What is the current measured duplication percentage of the codebase? (Unknown; the initial jscpd `threshold` value must be set from a first measurement run during the spike.)

## c — facts assumed by 0010-contract-pipeline

- What OpenAPI version(s) do the vendored REST contracts use — Swagger 2.0, 3.0.x, or 3.1.x? (Report assumed 3.0/3.1; a Swagger 2.0 contract would change the oasdiff drift gate and disqualify some candidates.)
- Do the vendored OpenAPI contracts actually model the non-2xx reason-code bodies under each operation's `responses` (4xx/5xx with schemas)? (Report assumed yes; without this, no generator can emit per-status error schemas and D-0006 needs a contract fix first.)
- What AsyncAPI version(s) do the vendored contracts use — 2.x or 3.x — and what `schemaFormat` do the message payloads declare (default JSON Schema dialect vs Avro/Protobuf/RAML)? (Report assumed 2.x/3.x with JSON-Schema-dialect payloads, which the Ajv leg depends on.)
- Roughly how many operations, messages, and schemas do the contracts contain? (Report assumed moderate counts; this drives fishery hand-authoring cost and the size of generated Ajv validator code.)
- What is the peak inbound MQTT message rate, and what are typical payload sizes? (Report assumed ≤ ~1k msg/s, at which every validator candidate passes on throughput and prod sampling is unnecessary.)
- Is there a JS bundle-size budget for the app, and what is it? (Report assumed zod/zod-mini plus generated Ajv validator code fits; no budget number was available to score against.)
- Does the app ship a strict Content-Security-Policy (no unsafe-eval)? (Report assumed the posture is unknown and chose CSP-safe paths — Ajv standalone compiled validators; zod would need jitless config under a strict CSP.)
- What build tool/bundler does the app use (Vite, webpack, other), and can it run dev-time codegen steps? (Report assumed a mainstream bundler with codegen support and scored typia's compiler-transformer requirement as a liability accordingly.)
- What TypeScript version is the app on? (Report assumed ≥5.x for zod 4 peer requirements and branded-type ergonomics.)
- What oxlint version is in use? (Report assumed ≥0.15.0, needed for the `no-restricted-imports` coverage-guarantee lint layer.)
- What tool currently generates the app's types, and does any downstream code pin its exact output shapes? (Report assumed the incumbent is replaceable without a consumer-migration project.)
- What are the app's browser targets? (Report assumed evergreen browsers; all recommended runtime artifacts are plain TS/JS but no target matrix was available to verify against.)

## d — facts assumed by 0040-hooks-linting

- What React version does the app use? (Verified during the survey: this does not gate the lint recommendation — eslint-plugin-react-hooks 7.1.1 declares no React peerDependency — but it decides whether the `useEffectEvent` fix (stable since React 19.2) is available and whether React Compiler adoption (React 17+) is feasible on the 0090 horizon scan.)
- Does the repo currently install ESLint, and at which major version? (The report assumed no existing ESLint lane and a fresh ESLint 9 flat-config CI step; eslint-plugin-react-hooks supports eslint ^3–^10 and react-you-might-not-need-an-effect needs >= 8.40.0.)
- What Node version do the CI runners use? (Assumed >= 18, the eslint-plugin-react-hooks floor; >= 20 would also keep the skipped @eslint-react family available for later.)
- What TypeScript version does the app use? (Assumed 5.x; only material if @eslint-react's type-aware rules are revisited.)
- What does the current .oxlintrc.json enable — are the react or react-perf plugins, or any of their rules, already turned on? (Assumed neither plugin is enabled today, so the oxlint change is additive config.)
- Which CI provider runs lint, and can it run npm-installed CLIs? (Assumed yes; the recommendation adds an ESLint step to CI per D-0002.)
- Do components subscribe to Zustand/xstate stores or mqtt.js by hand inside useEffect, or through the libraries' hooks? (Assumed library hooks; hand-subscription would make no-external-store-subscription one of the highest-value rules and raise the priority of a shared useMqttTopic-style hook.)
- Which data-fetching approach does the app use (React Query, plain fetch-in-effect, other)? (React-Query-style options objects are a known false-positive class for react-you-might-not-need-an-effect's no-event-handler rule.)
- How many existing exhaustive-deps suppression comments (eslint-disable / oxlint-disable) exist in the codebase? (Assumed few; a large count changes the rollout from enforce-now to audit-first.)
- Is React Compiler adoption on the roadmap, and which build tool (Vite / webpack / Babel / other) does the app use? (Assumed not adopted today; adoption would obsolete the react-perf rule family entirely and belongs on the 0090 horizon scan.)
- Does a shared MQTT subscription hook already exist in the app? (Assumed unknown; the top-ranked anti-pattern — subscribe/unsubscribe asymmetry — is not lintable and must be owned by such a convention.)

## e — facts assumed by 0050-logging

- What build tool and bundler does the app use (Vite, webpack, esbuild, other), and does it resolve conditional package exports and ESM-only packages? (The report assumed a modern ESM-capable bundler.)
- What browser targets must be supported? (The report assumed evergreen browsers, ES2020+.)
- Is there a bundle-size veto for logging, and if so what is the budget in gzipped kilobytes? (The report assumed anything up to ~15 kB gzip total is acceptable; a stricter veto shifts the base pick from consola to loglevel.)
- Does the app hold a persistent mqtt.js-over-WSS connection, what is the topic scheme, and do broker ACLs permit a browser client to publish to a `logs/...` topic? (The report assumed the connection exists and treated the MQTT sink as conditional on the ACL answer.)
- Is localStorage available to the app, or do privacy mode/CSP policies block it? (The report assumed available; it affects log-level persistence conveniences in loglevel, consola, tslog, and debug.)
- Which fields in state or message payloads are sensitive and require client-side redaction before logs leave the browser? (The report assumed client-side redaction is required.)
- Does an HTTP endpoint for collecting batched browser logs exist, or can one be added? (The report assumed yes.)
- What is the expected log volume — in particular, are there hot paths logging per MQTT message or faster? (The report assumed interactive-SPA scale with at most per-message frequency.)
- Do Node/server services share a logging schema the browser should match? (The report assumed no; a shared schema would strengthen pino's case.)
- Are browser logs shipped to any third-party vendor backend today, such as Datadog or Sentry? (The report assumed no, consistent with the OSS-only constraint D-0003.)
