// spike-0060-boundary-wiring — spike code. Findings are the durable artifact;
// see findings.md. Interface authority: design.md, "Chosen interface".
//
// Entry point 1 — `transport-boundary`: factory, handle, ports, production
// adapters. `./errors/index.ts` is entry point 2, `./testing.ts` entry point 3.

export { createTransportBoundary } from "./internal/boundary.js";
export { mqttJsBrokerAdapter } from "./adapters/mqttjs.js";
export { globalFetchAdapter, systemClock } from "./adapters/system.js";

export type {
  BoundaryActorRef,
  BoundaryAdapters,
  BoundaryConfig,
  BoundaryEmitted,
  BoundaryFetcher,
  BoundarySnapshot,
  BrokerConnectOptions,
  BrokerHandlers,
  BrokerLink,
  BrokerPort,
  ChannelPolicy,
  ClockPort,
  CompiledValidator,
  FetchLike,
  InboundChannel,
  MessageEvent,
  OutboundChannel,
  PayloadOf,
  PolicyTable,
  QuarantineEntry,
  TelemetryEmission,
  TopicParams,
  TransportBoundary,
  Unsubscribe,
  Validated,
} from "./types.js";
