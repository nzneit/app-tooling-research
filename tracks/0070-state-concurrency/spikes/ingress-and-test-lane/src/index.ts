// spike-0070-ingress-and-test-lane — spike code. Findings are the durable artifact; see findings.md.
export { createStateKit, IngressConfigError } from "./kit.ts";
export { createRaceHarness, SettleNotQuiescentError } from "./harness.ts";
export { isCancellation, OptimisticConfigError } from "./optimistic.ts";
export { isWildcardPattern, matchesTopic } from "./topic.ts";
export type {
  DispatchTarget,
  FeedEvent,
  IngressError,
  IngressFeed,
  IngressInspectionEvent,
  IngressStats,
  MutationOutcome,
  OptimisticMutation,
  OptimisticMutationOptions,
  QueryClient,
  QueryKey,
  RaceHarness,
  Stamp,
  StateKit,
  StateKitConfig,
  StreamDecl,
  UseMutationResult,
  ValidatedMessage,
  Wire,
} from "./types.ts";
