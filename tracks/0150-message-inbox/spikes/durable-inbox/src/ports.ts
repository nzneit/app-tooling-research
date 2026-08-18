import type { EffectWrite } from "./policy.js";

// ── InboxStorePort — pre-authorized extension point 2 ───────────────────────
// The 0060 spike refused a quarantine-store port with a named trigger: "the
// IndexedDB escalation would be the second adapter — introduce the port then,
// not before." This is that port.

export interface InboxEntry {
  /** From `inboxKey`. Opaque to the adapter. */
  readonly key: string;
  readonly writes: readonly EffectWrite[];
  /** Clock-sourced. The only basis for retention pruning. */
  readonly receivedAt: number;
}

export type InboxOutcome = "applied" | "duplicate";

export type InboxCommitCause = "quota" | "closed" | "aborted" | "schema" | "unknown";

/** `commit` rejects ONLY with this. It never rejects for a duplicate. */
export class InboxCommitError extends Error {
  readonly failure: InboxCommitCause;
  constructor(failure: InboxCommitCause, options?: { cause?: unknown }) {
    super(`inbox commit failed: ${failure}`, options);
    this.name = "InboxCommitError";
    this.failure = failure;
  }
}

export interface InboxHydration {
  /** Every live write in every effect store, oldest-first. */
  readonly writes: readonly EffectWrite[];
  readonly schemaVersion: number;
  /** True when a schemaVersion mismatch dropped the effect stores on open. */
  readonly reset: boolean;
  /**
   * True when the store opened EMPTY — first run, cleared origin, or a
   * whole-origin eviction (Chromium per-bucket LRU when not persisted; Safari's
   * 7-day no-interaction wipe). A cold inbox cannot suppress the replay it is
   * about to receive, and that blindness is reported rather than read as health.
   */
  readonly cold: boolean;
  /** What the engine reflected back on `tx.durability`, not what was asked for.
   *  Observability only: no code branches on it. */
  readonly durability: "default" | "relaxed" | "strict";
  readonly identityCount: number;
}

/**
 * Adapter obligations. These ARE the interface, and every adapter is held to
 * them by one shared contract suite (test/inbox-contract.ts):
 *
 * S1 `commit` opens EXACTLY ONE readwrite transaction spanning the identity
 *    store and every store named in `entry.writes`, and awaits nothing but
 *    IndexedDB requests between opening it and its completion. The returned
 *    promise settles on complete / abort / error, never before.
 * S2 The identity record is written with `add()`, not `put()`. A key already
 *    present raises ConstraintError, which aborts the WHOLE transaction and
 *    discards the writes; the adapter maps that to `'duplicate'`. Suppression is
 *    therefore the transaction itself, not a cache consulted beside it — there
 *    is no check-then-write window, and two concurrent writers cannot both win.
 * S3 Retention pruning runs INSIDE commit transactions and inside `open`'s. It
 *    never opens a transaction of its own and can therefore never split one.
 * S4 `open` resolves only after any schema migration has completed. On a
 *    schemaVersion mismatch it drops the EFFECT stores and keeps the IDENTITY
 *    store: identities are opaque strings that no contract change can
 *    invalidate, so a deploy costs a rehydration, not a round of
 *    double-application.
 * S5 `commit` rejects only with InboxCommitError, and only for genuine store
 *    failure. It never rejects for a duplicate.
 * S6 `reset` clears the identity store AND the effect stores, and is the only
 *    escape from a corrupt store — persistence removes "reload fixes it" as a
 *    recovery permanently, so something must be able to clear it.
 *
 * `open()` deliberately does NOT return the identity key set. At ~5 msg/s over a
 * 24 h window that is ~432,000 keys, and S2 makes an in-memory pre-check
 * redundant anyway.
 */
export interface InboxStorePort {
  open(): Promise<InboxHydration>;
  commit(entry: InboxEntry): Promise<InboxOutcome>;
  reset(reason: string): Promise<void>;
  close(): Promise<void>;
}

export interface IndexedDbInboxOptions {
  readonly databaseName: string;
  /** The object stores `EffectWrite.store` may name. Created on upgrade. */
  readonly effectStores: readonly string[];
  /** Bumping this drops the effect stores and keeps the identities (S4). */
  readonly schemaVersion: number;
  /**
   * MQTT 3.1.1 has NO session expiry, so "how far back can a redelivery arrive?"
   * has no derivable answer and this must be CHOSEN. It lives here, on the
   * adapter, not on the boundary — the boundary's interface does not grow a dial
   * whose right value is an operations fact.
   */
  readonly retentionMs: number;
  /**
   * Default 'default', and that is the recommendation. On Chromium 'default'
   * already resolves to relaxed on the default bucket; on WebKit 'default' and
   * 'relaxed' are the same code path; on Firefox 'relaxed' becomes
   * PRAGMA synchronous=OFF, a corruption risk in exchange for nothing.
   */
  readonly durability?: "default" | "relaxed" | "strict";
  /**
   * Engine injection, NOT a second adapter: fake-indexeddb in the Node lane is
   * the same adapter on a substitutable engine. Passing it also avoids
   * `import 'fake-indexeddb/auto'` and its shared-global hazard across parallel
   * vitest workers.
   */
  readonly factory?: IDBFactory;
  readonly now?: () => number;
}

export interface MemoryInboxOptions {
  /** Deterministic fault injection. Called per attempt; return null to succeed. */
  readonly failCommitWith?: (key: string, attempt: number) => InboxCommitError | null;
  /** Delay injected before each commit resolves, for ack-ordering tests. */
  readonly commitLatencyMs?: (key: string) => number;
  readonly now?: () => number;
}

// ── BrokerPort — deferring the PUBACK by widening ONE return type ───────────

export interface PacketMeta {
  readonly messageId?: number;
  /** aedes 1.1.1 never sets this on redelivery; Mosquitto and ActiveMQ do.
   *  Nothing in this design reads it. */
  readonly dup: boolean;
  /** [MQTT-3.3.1-6]. The one flag the durable path reads (D5). */
  readonly retain: boolean;
  /** The DELIVERED QoS, which no declaration controls and which can change with
   *  no deploy on this side. Compared against the row's declared qos at ingress. */
  readonly qos: 0 | 1 | 2;
  /** The connection generation THIS packet arrived on. */
  readonly epoch: number;
}

export interface BrokerHandlers {
  /**
   * THE ONLY CHANGE TO THIS PORT: the return type widens from `void` to
   * `void | Promise<void>`. Every existing adapter still compiles.
   *
   * Returning `undefined` means "acknowledge now" — what every non-durable row
   * does. Returning a promise DEFERS the acknowledgement until it settles.
   * Adapter obligations, pinned by the shared contract suite:
   *
   * A1 The PUBACK is written only after the returned promise FULFILS. No
   *    timeout, no watchdog on this path.
   * A2 PUBACKs are written in the order the PUBLISHes were received
   *    ([MQTT-4.6.0-2]).
   * A3 If the promise REJECTS, no PUBACK is written and the message is left for
   *    the broker to redeliver. mqtt.js 5.15.2 swallows this silently — no error
   *    event, no diagnostic — so the layer above the port owns reporting it.
   * A4 STALE-ACK GUARD. If the link's epoch changed between delivery and
   *    settlement, or the client is disconnected, the adapter calls mqtt.js's
   *    continuation WITH AN ERROR rather than bare. Calling it bare routes the
   *    late PUBACK onto the client's outgoing queue and replays it on the NEXT
   *    connection, where packet identifiers have been reassigned — acknowledging
   *    a DIFFERENT message and losing it silently. Never simply drop the
   *    continuation: that stalls the inbound parser permanently and the keepalive
   *    detector tears the client down at 1.5x keepalive (45 s here).
   * A5 At most ONE onMessage call is in flight at a time. mqtt.js 5.15.2 gives
   *    this for free (single-slot inbound pump); the memory adapter enforces it
   *    deliberately.
   * A6 The continuation is wrapped in a call-once guard. A double call writes two
   *    PUBACKs for one messageId and throws an uncaught TypeError from mqtt.js's
   *    unguarded bare call — an uncaught exception, not an `error` event, so it
   *    bypasses all `client.on('error')` telemetry.
   *
   * A5 is why there is NO ordered ack-release queue in this design. With no
   * concurrency there is nothing to reorder: [MQTT-4.6.0-2] holds by
   * construction over ALL traffic, including the ~34 non-durable topics. The
   * smallest correct implementation of an ordering requirement turns out to be a
   * prohibition rather than a mechanism. The price — head-of-line blocking of
   * every topic behind each commit — is not optional: it is the same
   * serialization the production client already has.
   */
  onMessage(topic: string, payload: Uint8Array, meta: PacketMeta): void | Promise<void>;

  onLifecycle(e: "connect" | "reconnect" | "close" | "offline" | "error", detail?: unknown): void;
}

export interface BrokerConnectOptions {
  readonly url: string;
  readonly clientId: string;
  /**
   * 0060 fixed this to `true` under assumption A-5. The confirmed deployment
   * fact is clean:false with a persisted device-scoped clientId, so the literal
   * type widens to `boolean`. A correction to an assumption, not a 0150 design
   * element — recorded as a Deviation, not as a graft.
   */
  readonly clean: boolean;
  readonly reconnectPeriodMs: number;
  readonly keepaliveSeconds?: number;
}

export interface BrokerLink {
  subscribe(filter: string, opts: { qos: 0 | 1 }): Promise<void>;
  end(force?: boolean): Promise<void>;
  /** Increments on every CONNACK. The epoch A4 compares against meta.epoch. */
  readonly epoch: number;
  /** PUBACKs computed for a dead connection and deliberately never written.
   *  Expected > 0 after any outage under load. */
  readonly staleDiscarded: number;
  readonly connected: boolean;
}

export interface BrokerPort {
  connect(opts: BrokerConnectOptions, handlers: BrokerHandlers): BrokerLink;
}
