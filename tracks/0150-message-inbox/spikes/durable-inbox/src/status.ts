import type { EffectWrite } from "./policy.js";

export interface Percentiles {
  readonly p50: number;
  readonly p99: number;
  readonly max: number;
}

export interface InboxStatus {
  /**
   * 'absent'      no durable rows declared, or no inbox adapter supplied
   * 'loading'     open() in flight; durable deliveries are withheld
   * 'ready'       committing normally
   * 'unavailable' the last commit REJECTED; the next success returns it to ready
   */
  readonly state: "absent" | "loading" | "ready" | "unavailable";
  /** In-flight commits. Bounded at 1 by BrokerPort obligation A5. */
  readonly pending: number;
  /**
   * Peak concurrent commits ever observed. Reads 1 under stock mqtt.js 5.15.2,
   * and that IS the finding: the client self-limits to one outstanding inbound
   * message, so the broker's in-flight window (20 on Mosquitto, ~3,200 on
   * ActiveMQ) is never reached and is unobservable from here. Above 1 means a
   * swapped client.
   */
  readonly maxInFlight: number;
  readonly applied: number;
  /**
   * The dedup-hit counter. A design that never fires and a design that works are
   * indistinguishable without it.
   */
  readonly suppressed: number;
  /** Durable rows whose projection returned no usable id. */
  readonly identityMissing: number;
  readonly failed: number;
  /** Messages acknowledged and lost after MAX_COMMIT_ATTEMPTS. */
  readonly givenUp: number;
  /** Deliveries whose QoS did not match the row's declaration, either direction. */
  readonly qosDrift: number;
  /**
   * The single most useful production number: everything on the connection
   * queues behind each of these.
   */
  readonly commitMs: Percentiles;
}

/**
 * The ONE new event type. Emitted exactly once per start(), after the inbox
 * opens and BEFORE any durable channel's filter is subscribed.
 *
 * NOTE the limit, which is why ingest() also rejects while loading: on a RESUMED
 * clean:false session the backlog arrives on CONNACK regardless of whether this
 * connection issued a SUBSCRIBE, so emission order alone cannot win the race.
 */
export interface InboxHydrated {
  readonly type: "inbox.hydrated";
  /** Oldest-first. The same shape live durable messages deliver, so the app has
   *  ONE apply function and not two. */
  readonly writes: readonly EffectWrite[];
  readonly schemaVersion: number;
  /** A schema bump dropped the effect stores (identities survived, S4). */
  readonly reset: boolean;
  /** The store opened empty — first run, cleared origin, or whole-origin
   *  eviction. A cold inbox cannot suppress the replay it is about to receive. */
  readonly cold: boolean;
  readonly durability: "default" | "relaxed" | "strict";
}

/**
 * Question 18 asks whether a delivered-QoS degradation needs a fifth error
 * class. It does not, and minting one would reopen a taxonomy this track cites
 * rather than owns (0060 KQ3, D-0015). All three additions are class 1 with a
 * new reason, deduped and warned once per channel, reusing the shape D-0018
 * ratified for REST unknown-field drift.
 */
export type TransportReason =
  | "network"
  | "timeout"
  | "aborted"
  | "connection-lost"
  | "publish-gated"
  | "queue-overflow"
  | "disposed"
  /** The store rejected MAX_COMMIT_ATTEMPTS commits; the message was
   *  acknowledged anyway and is lost. */
  | "inbox-unavailable"
  /** Delivered qos !== the row's declared qos, either direction. */
  | "qos-drift"
  /** A durable projection returned no usable id; the message was not applied. */
  | "durable-identity-missing";

export interface TelemetryEmission {
  readonly type: "telemetry";
  readonly class: 1 | 2 | 3 | 4;
  readonly reason: TransportReason;
  readonly dedupKey: string;
  readonly count: number;
  readonly detail: unknown;
}

export interface MessageDelivered {
  readonly type: "message";
  readonly channel: string;
  readonly topic: string;
  readonly payload: unknown;
  /** Present only on a durable row; `undefined` elsewhere, so `applyWrites` on a
   *  plain row is a type error rather than a silent no-op (D4). */
  readonly writes: readonly EffectWrite[] | undefined;
}

export function percentiles(samples: readonly number[]): Percentiles {
  if (samples.length === 0) return { p50: 0, p99: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[idx] ?? 0;
  };
  return { p50: at(0.5), p99: at(0.99), max: sorted[sorted.length - 1] ?? 0 };
}
