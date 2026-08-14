// spike-0070-ingress-and-test-lane — spike code. Findings are the durable artifact; see findings.md.
export { createStateKit, IngressConfigError, type SpikeInternals } from "./kit.ts";
export { createRaceHarness, SettleNotQuiescentError } from "./harness.ts";
export { isWildcardPattern, matchesTopic } from "./topic.ts";
export type {
  DispatchTarget,
  FeedEvent,
  IngressError,
  IngressFeed,
  IngressInspectionEvent,
  IngressStats,
  QueryClientLike,
  QueryKey,
  RaceHarness,
  Stamp,
  StateKit,
  StateKitConfig,
  StreamDecl,
  ValidatedMessage,
  Wire,
} from "./types.ts";
