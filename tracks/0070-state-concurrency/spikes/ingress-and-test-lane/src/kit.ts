// ENTRY POINT 1 — createStateKit. See design.md "Chosen interface" +
// invariants 1-11. Spike code; findings.md is the durable artifact.

import { compileMatcher } from "./topic.ts";
import type {
  FeedEvent,
  IngressError,
  IngressInspectionEvent,
  StateKit,
  StateKitConfig,
  StreamDecl,
  ValidatedMessage,
  Wire,
} from "./types.ts";

export class IngressConfigError extends Error {
  override readonly name = "IngressConfigError";
}

/**
 * SPIKE-ONLY internal seam — NOT part of design.md's Chosen interface.
 * design.md registers pending-write mask holds from `kit.optimisticMutation`,
 * which lands in Task 9. Until then the mask stage of the pipeline would be
 * unreachable (and therefore untestable) from the public surface, so the spike
 * exposes the registration under a `__` name. Recorded in findings.md.
 */
export interface SpikeInternals {
  /** Registers a pending-write hold for (stream, entity). Returns the release. */
  __maskHold(stream: string, entity: string): () => void;
}

const SEP = "\u0000";
/** Stand-in envelope for failures with no message of their own (wire fan-out). */
const EMPTY_ENVELOPE: ValidatedMessage = { topic: "", packetId: "", payload: undefined };

interface StreamEntry {
  readonly id: string;
  readonly decl: StreamDecl<any>;
  readonly match: (topic: string) => boolean;
  readonly wildcard: boolean;
  readonly seenQueryKeys: Map<string, readonly unknown[]>;
}

/** A guard decision: dropped, or passed with a deferred commit (invariant 6 —
 *  a masked message must NOT advance the high-water mark, or its later release
 *  would adjudicate as stale against itself). */
type GuardDecision = { ok: false } | { ok: true; commit: () => void };

interface Withheld {
  readonly msg: ValidatedMessage;
  readonly entry: StreamEntry;
  readonly epoch: number;
}

function makeIngressError(
  code: IngressError["code"],
  envelope: ValidatedMessage,
  cause?: unknown,
): IngressError {
  const err = new Error(`ingress: ${code} (${envelope.topic})`) as IngressError;
  err.code = code;
  err.envelope = envelope;
  if (cause !== undefined) err.cause = cause;
  return err;
}

export function createStateKit(config: StateKitConfig): StateKit & SpikeInternals {
  const streams = config.streams ?? {};
  const streamIds = Object.keys(streams);

  // ── Error modes: fail at the composition root, not at message time ──
  if (streamIds.length > 0 && config.feed === undefined) {
    throw new IngressConfigError("streams declared without a feed");
  }
  for (const id of streamIds) {
    const decl = streams[id]!;
    if ("query" in decl.dispatch && config.queryClient === undefined) {
      throw new IngressConfigError(`stream '${id}' has a query target but no queryClient`);
    }
  }

  const entries: StreamEntry[] = streamIds.map((id) => {
    const decl = streams[id]!;
    const { match, wildcard } = compileMatcher(decl.topic);
    return { id, decl, match, wildcard, seenQueryKeys: new Map() };
  });

  const counters = {
    duplicate: 0,
    stale: 0,
    masked: 0,
    dispatched: 0,
    unmatched: 0,
    gaps: 0,
  };

  const onError = config.onError ?? (() => {});
  const inspect = config.inspect;
  const emit = (ev: IngressInspectionEvent): void => {
    if (inspect !== undefined) inspect(ev);
  };

  // ── Registries ──────────────────────────────────────────────────────
  const dedupCapacity = config.dedupCapacity ?? 1024;
  const seenPackets = new Map<string, true>(); // insertion-ordered LRU
  const stampHighWater = new Map<string, number | bigint>();
  const epochOf = new Map<string, number>();
  const entityTopic = new Map<string, string>(); // invariant 4 declaration check
  const maskHolds = new Map<string, number>();
  const withheld = new Map<string, Withheld>();
  let globalEpoch = 0;

  // ── Invariant 9: one run-to-completion mailbox shared by ingress
  //    dispatch and wire fan-out. A send that would re-enter is queued. ──
  const mailbox: Array<() => void> = [];
  let draining = false;
  function runToCompletion(task: () => void): void {
    mailbox.push(task);
    if (draining) return;
    draining = true;
    try {
      while (mailbox.length > 0) {
        const next = mailbox.shift()!;
        try {
          next();
        } catch (cause) {
          // A throwing wire callback must not strand the rest of the mailbox.
          onError(makeIngressError("dispatch-failed", EMPTY_ENVELOPE, cause));
        }
      }
    } finally {
      draining = false;
    }
  }

  // ── Pipeline stages ─────────────────────────────────────────────────

  function remember(packetId: string): void {
    seenPackets.set(packetId, true);
    while (seenPackets.size > dedupCapacity) {
      const oldest = seenPackets.keys().next();
      if (oldest.done === true) break;
      seenPackets.delete(oldest.value);
    }
  }

  /** Invariants 3 + 4. Mode is per-message and data-driven. */
  function guard(entry: StreamEntry, msg: ValidatedMessage, epoch: number): GuardDecision {
    const entity = entry.decl.entity(msg);
    const stamp = entry.decl.stamp?.(msg);

    if (stamp !== undefined) {
      // Stamped: key is (stream, entity); strictly-greater wins regardless of
      // the concrete topic. Regressions AND equals are dropped.
      const key = entry.id + SEP + entity;
      const high = stampHighWater.get(key);
      if (high !== undefined && !(stamp > high)) return { ok: false };
      return { ok: true, commit: () => stampHighWater.set(key, stamp) };
    }

    // Unstamped (A-1): epoch rules only.
    if (entry.wildcard) {
      const entityKey = entry.id + SEP + entity;
      const known = entityTopic.get(entityKey);
      if (known !== undefined && known !== msg.topic) {
        // Declaration error (invariant 4): the guard cannot place this message
        // in the entity's ordered sequence. Drop + count under `stale`.
        return { ok: false };
      }
      const key = entry.id + SEP + msg.topic + SEP + entity;
      const seenEpoch = epochOf.get(key);
      if (seenEpoch !== undefined && seenEpoch > epoch) return { ok: false };
      return {
        ok: true,
        commit: () => {
          entityTopic.set(entityKey, msg.topic);
          epochOf.set(key, epoch);
        },
      };
    }

    const key = entry.id + SEP + entity;
    const seenEpoch = epochOf.get(key);
    if (seenEpoch !== undefined && seenEpoch > epoch) return { ok: false };
    return { ok: true, commit: () => epochOf.set(key, epoch) };
  }

  function dispatch(entry: StreamEntry, msg: ValidatedMessage): void {
    const target = entry.decl.dispatch;
    try {
      if ("machine" in target) {
        target.machine.send(target.event(msg));
      } else if ("store" in target) {
        target.store(msg);
      } else {
        const queryKey = target.query(msg);
        entry.seenQueryKeys.set(JSON.stringify(queryKey), queryKey);
        // Invariant 5: unstamped query targets only ever invalidate.
        config.queryClient!.invalidateQueries({ queryKey });
      }
    } catch (cause) {
      onError(makeIngressError("dispatch-failed", msg, cause));
      return;
    }
    counters.dispatched++;
    emit({
      stage: "dispatch",
      stream: entry.id,
      entity: entry.decl.entity(msg),
      verdict: "pass",
      message: msg,
    });
  }

  /** guard → mask → dispatch. Entered directly (skipping dedup, which the
   *  message already cleared) on the mask-release path — invariant 6. */
  function admit(entry: StreamEntry, msg: ValidatedMessage, epoch: number): void {
    const entity = entry.decl.entity(msg);
    const decision = guard(entry, msg, epoch);
    if (decision.ok === false) {
      counters.stale++;
      emit({ stage: "guard", stream: entry.id, entity, verdict: "drop", message: msg });
      return;
    }
    emit({ stage: "guard", stream: entry.id, entity, verdict: "pass", message: msg });

    const maskKey = entry.id + SEP + entity; // invariant 6: never topic-split
    if ((maskHolds.get(maskKey) ?? 0) > 0) {
      withheld.set(maskKey, { msg, entry, epoch });
      counters.masked++;
      emit({ stage: "mask", stream: entry.id, entity, verdict: "withheld", message: msg });
      return;
    }
    emit({ stage: "mask", stream: entry.id, entity, verdict: "pass", message: msg });

    decision.commit();
    dispatch(entry, msg);
  }

  function pipeline(msg: ValidatedMessage): void {
    const entry = entries.find((e) => e.match(msg.topic));
    if (entry === undefined) {
      counters.unmatched++;
      onError(makeIngressError("unmatched-topic", msg));
      return;
    }

    if (seenPackets.has(msg.packetId)) {
      counters.duplicate++;
      emit({ stage: "dedup", stream: entry.id, verdict: "drop", message: msg });
      return;
    }
    remember(msg.packetId);
    emit({ stage: "dedup", stream: entry.id, verdict: "pass", message: msg });

    admit(entry, msg, globalEpoch);
  }

  /** Invariant 8. */
  function handleGap(): void {
    globalEpoch++;
    counters.gaps++;
    emit({ stage: "gap", verdict: "pass" });
    for (const entry of entries) {
      const target = entry.decl.dispatch;
      try {
        if ("machine" in target) {
          target.machine.send({ type: "ingress.gap" });
        } else if ("query" in target) {
          if (target.family !== undefined) {
            config.queryClient!.invalidateQueries({ queryKey: target.family });
          } else {
            for (const queryKey of entry.seenQueryKeys.values()) {
              config.queryClient!.invalidateQueries({ queryKey });
            }
          }
        }
        entry.decl.onGap?.();
      } catch (cause) {
        onError(makeIngressError("dispatch-failed", EMPTY_ENVELOPE, cause));
      }
    }
  }

  // ── Mask registry (invariant 6). Holds are registered by the kit-bound
  //    optimistic unit, which lands in Task 9; the stage is live now. ──
  function hold(stream: string, entity: string): () => void {
    const key = stream + SEP + entity;
    maskHolds.set(key, (maskHolds.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (maskHolds.get(key) ?? 1) - 1;
      if (remaining > 0) {
        maskHolds.set(key, remaining);
        return;
      }
      maskHolds.delete(key);
      const item = withheld.get(key);
      if (item === undefined) return;
      withheld.delete(key);
      emit({
        stage: "mask",
        stream: item.entry.id,
        entity,
        verdict: "released",
        message: item.msg,
      });
      runToCompletion(() => admit(item.entry, item.msg, item.epoch));
    };
  }

  // ── Wires (invariant 9) ─────────────────────────────────────────────
  const machineWireTeardowns: Array<() => void> = [];
  const storeWireTeardowns: Array<() => void> = [];

  for (const wire of config.wires ?? []) {
    if ("fromMachine" in wire) {
      const equals = wire.equals ?? Object.is;
      let previous = wire.select(wire.fromMachine.getSnapshot());
      const sub = wire.fromMachine.subscribe((snap) => {
        const next = wire.select(snap);
        if (equals(next, previous)) return; // the echo/feedback guard
        previous = next;
        runToCompletion(() => wire.into(next));
      });
      machineWireTeardowns.push(() => sub.unsubscribe());
    } else {
      const unsub = wire.fromStore.subscribe(wire.select, (next, prev) => {
        const event = wire.event(next, prev);
        if (event === null) return; // the meaningful-transition filter
        runToCompletion(() => wire.toMachine.send(event));
      });
      storeWireTeardowns.push(unsub);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────
  const controller = new AbortController();
  let disposed = false;

  let unsubscribeFeed: (() => void) | undefined;
  if (config.feed !== undefined) {
    unsubscribeFeed = config.feed((event: FeedEvent) => {
      if (disposed) return; // invariant 11: post-dispose delivery is ignored
      if (event.kind === "gap") {
        runToCompletion(handleGap);
        return;
      }
      runToCompletion(() => pipeline(event.message));
    });
  }

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    // Invariant 11 teardown order.
    unsubscribeFeed?.();
    for (const t of storeWireTeardowns) t();
    for (const t of machineWireTeardowns) t();
    controller.abort();
    seenPackets.clear();
    stampHighWater.clear();
    epochOf.clear();
    entityTopic.clear();
    maskHolds.clear();
    withheld.clear();
  };

  if (config.signal !== undefined) {
    if (config.signal.aborted) dispose();
    else config.signal.addEventListener("abort", dispose, { once: true });
  }

  return {
    signal: controller.signal,
    get stats() {
      return { ...counters };
    },
    dispose,
    __maskHold: hold,
  };
}
