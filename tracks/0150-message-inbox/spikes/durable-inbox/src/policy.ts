// The policy-row addition — pre-authorized extension point 1.
//
// The ENTIRE 0150 change to the accepted 0060 policy row is `durable`.
// Illegality is enforced by union arms, not by a conditional constraint on the
// factory, so the factory signature does not move.

declare const ValidatedBrand: unique symbol;
export type Validated<T> = T & { readonly [ValidatedBrand]: true };
export type TopicParams = Readonly<Record<string, string>>;

export interface CompiledValidator<T> {
  (data: unknown): data is T;
  errors?: readonly unknown[] | null;
}

/** One structured-cloneable mutation of the durable projection. */
export type EffectWrite =
  | { readonly op: "put"; readonly store: string; readonly key: string; readonly value: unknown }
  | { readonly op: "delete"; readonly store: string; readonly key: string };

export interface DurableEntry {
  /**
   * Producer-supplied, per-message identity read out of the VALIDATED payload.
   * Scoped by channel + concrete topic before use (see `inboxKey`), so it need
   * only be unique within one topic.
   *
   * `null` is legal and loud, not an error: the message is quarantined,
   * acknowledged, and reported ONCE per channel. It is never applied, so it
   * cannot double-apply. Returning null is how a topic whose producer supplies
   * nothing usable says so at runtime, instead of the client inventing a content
   * hash — a content hash silently swallows two protocol-mandated
   * non-duplicates: retained replay [MQTT-3.3.1-6], and one copy per
   * overlapping filter (3.1.1 §3.3.5).
   */
  readonly id: string | null;
  /**
   * May be empty. Legal and honest, and it degrades the row to a durable
   * seen-set: duplicate application is still suppressed across reload, but there
   * is nothing for the identity to be atomic WITH. Non-empty `writes` is the
   * only shape that buys the claim in full.
   */
  readonly writes: readonly EffectWrite[];
}

/**
 * PURE and SYNCHRONOUS, by return type. `async (p) => ...` returns
 * Promise<DurableEntry> and is a compile error.
 *
 * This is the whole answer to the await-in-transaction footgun: there is no
 * caller-authored code inside the transaction to put an `await` in, because the
 * adapter opens the transaction only AFTER this function has already returned
 * plain data.
 */
export type DurableProjection<T> = (
  payload: Validated<T>,
  params: TopicParams,
) => DurableEntry;

export interface ChannelPolicyBase<T> {
  validate: CompiledValidator<T>;
  direction?: "in" | "out" | "inout";
  qos?: 0 | 1;
  sample?: number;
}

/**
 * Invariants of a durable row, none of which are configurable:
 *
 * D1 Runs only after `validate` succeeds. A malformed redelivery is a contract
 *    violation as usual, is NOT deduplicated, and is never applied — so it
 *    cannot double-apply.
 * D2 The result is committed by `InboxStorePort.commit` in ONE readwrite
 *    IndexedDB transaction spanning the identity store and every store named in
 *    `writes`. The PUBACK is written only after that transaction completes.
 *    That sentence is Guarantee A.
 * D3 `writes: []` degrades the row to a durable seen-set (see DurableEntry).
 * D4 The delivered event carries `writes`; the app applies THOSE. There is
 *    deliberately no second place to define the effect.
 * D5 A delivery with RETAIN set bypasses the inbox entirely ([MQTT-3.3.1-6]) —
 *    never recorded, never suppressed, always applied. A retained replay is the
 *    REPAIR for a reconnect gap; suppressing it is the actively harmful case.
 * D6 Guarantee B is never read by any code path. If the broker stops retaining,
 *    or the delivered QoS drops to 0, nothing here branches — `suppressed`
 *    simply stops incrementing. The design cannot become incoherent when B
 *    lapses, because it never observes B.
 */
export interface DurableChannelPolicy<T> extends ChannelPolicyBase<T> {
  readonly direction?: "in";
  readonly qos: 1;
  readonly durable: DurableProjection<T>;
}

export interface PlainChannelPolicy<T> extends ChannelPolicyBase<T> {
  /** Declaring `durable` on a non-QoS-1 or outbound row fails BOTH union arms. */
  readonly durable?: never;
}

export type ChannelPolicy<T> = DurableChannelPolicy<T> | PlainChannelPolicy<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PolicyTable = Record<string, ChannelPolicy<any>>;

export type IsDurable<R> = R extends { durable: DurableProjection<unknown> } ? true : false;

/** Module constant, not configuration. See ingest() and check-7. */
export const MAX_COMMIT_ATTEMPTS = 3;
/** An id longer than this is almost always a stringified payload. */
export const MAX_ID_LENGTH = 128;
