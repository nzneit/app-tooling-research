import { MAX_ID_LENGTH } from "../policy.js";

export type KeyRejection = "empty" | "too-long" | "not-a-string";

export type KeyResult =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly rejection: KeyRejection; readonly length: number };

/**
 * key = <channel filter> + <concrete topic> + <producer id>, the first two
 * length-prefixed so no component can forge a boundary in the next.
 *
 * MQTT 3.1.1 supplies NO application-visible message identity: no User
 * Properties, no Subscription Identifiers, and the Packet Identifier is a
 * per-connection slot released on acknowledgement — structurally unable to
 * survive a reload, which is the exact case a clean:false session creates.
 *
 * Why the CHANNEL is in the key: one concrete topic may match two policy rows
 * with overlapping filters, and 3.1.1 §3.3.5 permits one delivered copy per
 * matching subscription. Those are legitimately different applications of the
 * same message, and each row must apply exactly once.
 *
 * Why the concrete TOPIC is in the key: a wildcard row is one policy row over
 * many entities, and a producer's id is commonly unique only per entity.
 * Including the topic can only ever SPLIT two keys, never merge two distinct
 * messages — so it can produce a false negative (apply twice) and never a false
 * positive (silently drop real work). That is the bias chosen here rather than
 * argued for later.
 *
 * There is NO content-hash fallback. A canonicalized-content key silently
 * suppresses retained replay ([MQTT-3.3.1-6], re-triggered on every resubscribe)
 * and the overlapping-filter copies above, and it needs a canonicalization
 * scheme nobody owns. A topic whose payload carries no stable per-message
 * identifier CANNOT be durable — that is a contract negotiation with the
 * producer (sibling to the D-0019 ordering stamp), not a design gap to paper
 * over.
 *
 * Returns a result rather than throwing: this runs inside the inbound pump, and
 * nothing below the boundary may throw into it. The caller quarantines and
 * acknowledges.
 */
export function inboxKey(channel: string, topic: string, id: unknown): KeyResult {
  if (typeof id !== "string") return { ok: false, rejection: "not-a-string", length: 0 };
  if (id.length === 0) return { ok: false, rejection: "empty", length: 0 };
  if (id.length > MAX_ID_LENGTH) {
    // Not a size limit for storage's sake: an id this long is almost always a
    // stringified payload being used as a content hash, which is the one key
    // shape this design refuses. Fail at the first message, loudly, in dev and
    // in prod alike.
    return { ok: false, rejection: "too-long", length: id.length };
  }
  return { ok: true, key: `${channel.length}:${channel}${topic.length}:${topic}${id}` };
}

/**
 * The two facts the key deliberately does NOT use:
 *
 *  - `packet.messageId` — per connection only. It remains 0060's
 *    within-connection redelivery guard (accepted, unchanged, still runs first)
 *    and is structurally incapable of surviving the reload this track exists
 *    for. The two dedup mechanisms are LAYERED, not merged: messageId+topic
 *    sheds same-connection repeats before validation; inboxKey sheds
 *    cross-reload repeats inside the transaction.
 *  - `packet.dup` — aedes 1.1.1 never sets it, Mosquitto and ActiveMQ do, so any
 *    behaviour keyed off DUP is broker-dependent by construction.
 */
export type DedupLayer =
  | "messageId+topic (connection-scoped, 0060)"
  | "inboxKey (durable, cross-reload)";
