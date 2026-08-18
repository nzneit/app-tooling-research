import { MAX_COMMIT_ATTEMPTS, type EffectWrite, type TopicParams, type Validated } from "../policy.js";
import { InboxCommitError, type InboxStorePort, type PacketMeta } from "../ports.js";
import { inboxKey } from "./inbox-key.js";
import type { InboxStatus, TransportReason } from "../status.js";

export type MutableInboxStatus = { -readonly [K in keyof InboxStatus]: InboxStatus[K] };

export interface IngressContext {
  readonly inbox: InboxStorePort;
  readonly clock: { now(): number };
  readonly status: MutableInboxStatus;
  /** Commit-latency reservoir; percentiles are computed on read. */
  readonly commitSamples: number[];
  /** Attempt counts keyed by inbox key. Bounded give-up. */
  readonly attempts: Map<string, number>;
  emit(ev: {
    channel: string;
    topic: string;
    payload: unknown;
    writes: readonly EffectWrite[] | undefined;
  }): void;
  quarantine(entry: {
    raw: unknown;
    reason: TransportReason;
    topic: string;
    channel: string;
    cause: unknown;
  }): void;
  /** Class-1 telemetry, folded by dedupKey; emitted at most once per key. */
  warnOnce(key: string, reason: TransportReason, detail: unknown): void;
}

export interface PreparedRow {
  readonly channel: string;
  readonly declaredQos: 0 | 1;
  readonly durable?: (
    payload: Validated<unknown>,
    params: TopicParams,
  ) => { readonly id: string | null; readonly writes: readonly EffectWrite[] };
}

export interface DeliveredPacket {
  readonly topic: string;
  readonly params: TopicParams;
  readonly payload: Validated<unknown>;
  readonly raw: Uint8Array;
  readonly meta: PacketMeta;
}

/**
 * Returns a promise the broker adapter awaits before acknowledging (A1), or
 * `undefined` for the immediate-ack path.
 *
 * It REJECTS in exactly two cases, and those two are the complete enumeration of
 * when this design lets the broker redeliver:
 *   1. the inbox is still hydrating; and
 *   2. a commit failed and the attempt budget is not yet spent.
 */
export function ingest(
  ctx: IngressContext,
  row: PreparedRow,
  packet: DeliveredPacket,
): void | Promise<void> {
  // Question 18, BOTH directions, on the same comparison. Runs on every row —
  // the inverse check is how the next durable candidate announces itself.
  // Reported as class 1 with a new reason, deduped and warned once per channel,
  // reusing the shape D-0018 ratified. No fifth error class is minted: that
  // would reopen a taxonomy this track cites rather than owns (0060 KQ3, D-0015).
  if (packet.meta.qos !== row.declaredQos) {
    ctx.status.qosDrift += 1;
    ctx.warnOnce(`qos:${row.channel}`, "qos-drift", {
      declared: row.declaredQos,
      delivered: packet.meta.qos,
      topic: packet.topic,
    });
    // The message still takes the durable path: writing it to the inbox still
    // buys Guarantee A, and refusing it buys nothing (D6).
  }

  if (row.durable === undefined) {
    ctx.emit({ channel: row.channel, topic: packet.topic, payload: packet.payload, writes: undefined });
    return; // immediate ack, exactly as the boundary behaves today
  }

  // D5 — [MQTT-3.3.1-6]. A retained replay is a state repair for the gap every
  // reconnect creates. Never recorded, never suppressed.
  if (packet.meta.retain) {
    const retained = row.durable(packet.payload, packet.params);
    ctx.emit({
      channel: row.channel,
      topic: packet.topic,
      payload: packet.payload,
      writes: retained.writes,
    });
    return;
  }

  // The LOAD-BEARING hydration guard. Withholding SUBSCRIBE is NOT sufficient on
  // a resumed session: the broker replays the stored outgoing queue on CONNACK,
  // before any new SUBSCRIBE, because the subscription is already in the session.
  // Rejecting here withholds the ack, so the broker keeps the message rather
  // than us applying it against an unhydrated projection.
  if (ctx.status.state === "loading") {
    return Promise.reject(new Error("inbox-loading"));
  }

  // Pure, synchronous, OUTSIDE any transaction (D1) — and the reason the
  // await-in-transaction footgun has nowhere to happen.
  const entry = row.durable(packet.payload, packet.params);
  const keyed = inboxKey(row.channel, packet.topic, entry.id);
  if (!keyed.ok) {
    // Legal and loud: applied nowhere, acknowledged, reported once per channel.
    ctx.status.identityMissing += 1;
    ctx.warnOnce(`id:${row.channel}`, "durable-identity-missing", {
      topic: packet.topic,
      rejection: keyed.rejection,
      length: keyed.length,
    });
    ctx.quarantine({
      raw: packet.raw,
      reason: "durable-identity-missing",
      topic: packet.topic,
      channel: row.channel,
      cause: keyed.rejection,
    });
    return; // ack: never applied, so nothing to redeliver for
  }

  const key = keyed.key;
  const startedAt = ctx.clock.now();
  ctx.status.pending += 1;
  ctx.status.maxInFlight = Math.max(ctx.status.maxInFlight, ctx.status.pending);

  const settle = (): void => {
    ctx.status.pending -= 1;
    ctx.commitSamples.push(ctx.clock.now() - startedAt);
  };

  return ctx.inbox.commit({ key, writes: entry.writes, receivedAt: startedAt }).then(
    (outcome) => {
      settle();
      ctx.attempts.delete(key);
      if (ctx.status.state === "unavailable") ctx.status.state = "ready";
      if (outcome === "duplicate") {
        // Effectively-once. The effect is already durable; re-applying it is
        // precisely the double-apply under test. NO delivered event at all.
        ctx.status.suppressed += 1;
        return;
      }
      ctx.status.applied += 1;
      ctx.emit({
        channel: row.channel,
        topic: packet.topic,
        payload: packet.payload,
        writes: entry.writes,
      });
    },
    (cause: unknown) => {
      settle();
      ctx.status.failed += 1;
      ctx.status.state = "unavailable";
      const n = (ctx.attempts.get(key) ?? 0) + 1;
      ctx.attempts.set(key, n);
      const failure = cause instanceof InboxCommitError ? cause.failure : "unknown";

      if (n < MAX_COMMIT_ATTEMPTS) {
        // WITHHOLD. No PUBACK; the broker redelivers. This is the "cannot lose"
        // half of the claim, and it is the only branch that withholds an ack for
        // a durable row. It does NOT wedge the pump: mqtt.js's
        // `if (err) return done && done(err)` skips the PUBACK and still
        // advances to the next packet.
        throw new Error(`inbox-commit-failed:${failure}:attempt-${n}`);
      }

      // GIVE UP, bounded. ActiveMQ Classic has no redelivery cap and no DLQ on
      // the MQTT path, so a message the inbox can never commit would be
      // redelivered forever and permanently wedge that subscription. Acknowledge
      // it, quarantine it, say so loudly, and lose exactly that one message.
      ctx.status.givenUp += 1;
      ctx.attempts.delete(key);
      ctx.quarantine({
        raw: packet.raw,
        reason: "inbox-unavailable",
        topic: packet.topic,
        channel: row.channel,
        cause,
      });
      ctx.warnOnce(`inbox:${row.channel}`, "inbox-unavailable", { failure, attempts: n });
      // resolves -> A1 acknowledges. Never wedge the connection.
    },
  );
}
