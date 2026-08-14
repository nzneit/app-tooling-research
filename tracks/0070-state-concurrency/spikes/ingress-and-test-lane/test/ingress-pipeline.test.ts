// CHECK 2 (supporting) — the fixed pipeline order dedup -> guard -> mask ->
// dispatch, and the invariants that make the single-dispatch ingress a real
// entry point rather than a pass-through: design.md invariants 1, 3, 4, 6, 8,
// 11 plus the composition-root error modes.

import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createActor, createMachine } from "xstate";
import {
  createRaceHarness,
  createStateKit,
  IngressConfigError,
  SettleNotQuiescentError,
} from "../src/index.ts";
import type {
  IngressError,
  IngressInspectionEvent,
  StreamDecl,
  ValidatedMessage,
  Wire,
} from "../src/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

interface Reading {
  rigId: string;
  value: number;
}

function reading(packetId: string, topic: string, rigId: string, value: number) {
  return { topic, packetId, payload: { rigId, value } } satisfies ValidatedMessage<Reading>;
}

/** Drives the harness with a fixed, feasible ordering — no fc search. */
function pinned(ordering: number[]) {
  return createRaceHarness(fc.schedulerFor(ordering));
}

describe("ingress pipeline invariants", () => {
  it("fails at the composition root, not at message time (error modes)", () => {
    const stream: StreamDecl<Reading> = {
      topic: "rig/+/reading",
      entity: (m) => m.payload.rigId,
      dispatch: { store: () => {} },
    };
    expect(() => createStateKit({ streams: { rig: stream } })).toThrow(IngressConfigError);

    const queryStream: StreamDecl<Reading> = {
      topic: "rig/+/reading",
      entity: (m) => m.payload.rigId,
      dispatch: { query: (m) => ["rig", m.payload.rigId] },
    };
    const harness = pinned([]);
    expect(() => createStateKit({ feed: harness.feed, streams: { rig: queryStream } })).toThrow(
      IngressConfigError,
    );
  });

  it("runs dedup -> guard -> mask -> dispatch in order, once per message", async () => {
    const stages: string[] = [];
    const harness = pinned([1]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: () => {} },
        },
      },
      inspect: (ev: IngressInspectionEvent) => stages.push(`${ev.stage}:${ev.verdict}`),
    });

    harness.push(reading("p1", "rig/1/reading", "1", 10));
    await harness.settle();

    expect(stages).toStrictEqual(["dedup:pass", "guard:pass", "mask:pass", "dispatch:pass"]);
    expect(kit.stats.dispatched).toBe(1);
    kit.dispose();
  });

  it("drops duplicates by packetId and counts unmatched topics", async () => {
    const errors: string[] = [];
    const harness = pinned([1, 2, 3]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: () => {} },
        },
      },
      onError: (e) => errors.push(e.code),
    });

    harness.push(
      reading("p1", "rig/1/reading", "1", 10),
      reading("p1", "rig/1/reading", "1", 11), // same packetId
      reading("p2", "boat/1/reading", "1", 12), // no stream matches
    );
    await harness.settle();

    expect(kit.stats.dispatched).toBe(1);
    expect(kit.stats.duplicate).toBe(1);
    expect(kit.stats.unmatched).toBe(1);
    expect(errors).toStrictEqual(["unmatched-topic"]);
    kit.dispose();
  });

  it("keys the unstamped guard by concrete topic on a wildcard stream (invariant 4)", async () => {
    // Same entity delivered on two concrete topics of one wildcard stream while
    // unstamped: a declaration error, dropped and counted under `stale`.
    const drops: IngressInspectionEvent[] = [];
    const harness = pinned([1, 2]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: () => "shared-entity", // deliberately spans both topics
          dispatch: { store: () => {} },
        },
      },
      inspect: (ev) => {
        if (ev.verdict === "drop") drops.push(ev);
      },
    });

    harness.push(
      reading("p1", "rig/1/reading", "1", 10),
      reading("p2", "rig/2/reading", "2", 20),
    );
    await harness.settle();

    expect(kit.stats.dispatched).toBe(1);
    expect(kit.stats.stale).toBe(1);
    expect(drops.map((d) => d.stage)).toStrictEqual(["guard"]);
    kit.dispose();
  });

  it("withholds the latest masked item and releases it through guard -> dispatch (invariant 6)", async () => {
    const dispatched: number[] = [];
    const harness = pinned([1, 2]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          stamp: (m: ValidatedMessage<Reading>) => m.payload.value,
          dispatch: { store: (m) => dispatched.push(m.payload.value) },
        },
      },
    });

    const release = kit.__maskHold("rig", "1");
    harness.push(
      reading("p1", "rig/1/reading", "1", 10),
      reading("p2", "rig/1/reading", "1", 20),
    );
    await harness.settle();

    expect(dispatched).toStrictEqual([]);
    expect(kit.stats.masked).toBe(2);
    expect(kit.stats.dispatched).toBe(0);

    release();
    // Withhold-LATEST, not drop: only the newest item is released.
    expect(dispatched).toStrictEqual([20]);
    expect(kit.stats.dispatched).toBe(1);
    kit.dispose();
  });

  it("bumps epochs, notifies machine targets and calls onGap on a gap (invariant 8)", async () => {
    const events: string[] = [];
    const machine = createMachine({ id: "rig", initial: "idle", states: { idle: {} } });
    const actor = createActor(machine).start();
    let gapCalls = 0;

    const harness = pinned([1, 2]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: {
            machine: { send: (e) => events.push((e as { type: string }).type) },
            event: (m) => ({ type: "rig.reading", value: m.payload.value }),
          },
          onGap: () => {
            gapCalls++;
          },
        },
      },
    });

    harness.push(reading("p1", "rig/1/reading", "1", 10), "gap");
    await harness.settle();

    expect(events).toStrictEqual(["rig.reading", "ingress.gap"]);
    expect(gapCalls).toBe(1);
    expect(kit.stats.gaps).toBe(1);
    kit.dispose();
    actor.stop();
  });

  it("ignores feed deliveries after dispose and aborts kit.signal (invariant 11)", async () => {
    const dispatched: number[] = [];
    const harness = pinned([1]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: (m) => dispatched.push(m.payload.value) },
        },
      },
    });

    expect(kit.signal.aborted).toBe(false);
    kit.dispose();
    expect(kit.signal.aborted).toBe(true);
    kit.dispose(); // idempotent

    harness.push(reading("p1", "rig/1/reading", "1", 10));
    await harness.settle();
    expect(dispatched).toStrictEqual([]);
  });

  it("rejects a scheduler-wrapped REST call whose signal aborted before it settled (invariant 10)", async () => {
    const harness = pinned([1, 2]);
    const controller = new AbortController();
    const fetchThing = harness.wrap(
      async (_ctx: { signal: AbortSignal }) => "payload",
      "GET /thing",
    );

    // Outcomes are captured (handlers attached) before settle() so the
    // rejection is never momentarily unhandled across settle's macrotask turn.
    const cancelled = fetchThing({ signal: controller.signal }).then(
      () => "resolved",
      (e: Error) => e.name,
    );
    const kept = fetchThing({ signal: new AbortController().signal }).then(
      (v: string) => v,
      () => "rejected",
    );
    controller.abort(); // aborted while the call is still parked in the scheduler
    await harness.settle();

    expect(await cancelled).toBe("AbortError");
    expect(await kept).toBe("payload");
  });

  it("routes a throwing dispatch to onError and keeps the stream alive", async () => {
    const seen: number[] = [];
    const errors: string[] = [];
    const harness = pinned([1, 2]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: {
            store: (m) => {
              if (m.payload.value === 10) throw new Error("poison");
              seen.push(m.payload.value);
            },
          },
        },
      },
      onError: (e) => errors.push(e.code),
    });

    harness.push(
      reading("p1", "rig/1/reading", "1", 10),
      reading("p2", "rig/2/reading", "2", 20),
    );
    await harness.settle();

    expect(errors).toStrictEqual(["dispatch-failed"]);
    expect(seen).toStrictEqual([20]);
    expect(kit.stats.dispatched).toBe(1);
    kit.dispose();
  });
});

// ── Review-round hardening (task-8 review findings 1, 3, 4, 6, 8, 9, 10) ──

describe("ingress hardening", () => {
  it("refuses a query target that declares `write`, at the composition root", () => {
    const harness = pinned([]);
    const withWrite: StreamDecl<Reading> = {
      topic: "rig/+/reading",
      entity: (m) => m.payload.rigId,
      dispatch: {
        query: (m) => ["rig", m.payload.rigId],
        write: (m) => () => m.payload.value,
      },
    };
    expect(() =>
      createStateKit({
        feed: harness.feed,
        streams: { rig: withWrite },
        queryClient: { invalidateQueries: () => {} },
      }),
    ).toThrow(/dispatch\.write/);

    // …and the same declaration WITHOUT `write` constructs fine.
    expect(() =>
      createStateKit({
        feed: pinned([]).feed,
        streams: {
          rig: { ...withWrite, dispatch: { query: (m) => ["rig", m.payload.rigId] } },
        },
        queryClient: { invalidateQueries: () => {} },
      }),
    ).not.toThrow();
  });

  it("dev-warns and continues when no onError is supplied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = pinned([1, 2]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: () => {} },
        },
      },
      // no onError — design.md's documented default is "dev-warn and continue"
    });

    harness.push(
      reading("p1", "boat/1/reading", "1", 10), // unmatched-topic
      reading("p2", "rig/2/reading", "2", 20), // still delivered afterwards
    );
    await harness.settle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("unmatched-topic");
    expect(kit.stats.unmatched).toBe(1);
    expect(kit.stats.dispatched).toBe(1); // continued
    kit.dispose();
  });

  it("marks a wire fan-out failure with a null envelope, unlike a dispatch failure", async () => {
    const errors: IngressError[] = [];
    const actor = createActor(
      createMachine({
        id: "rig",
        initial: "idle",
        states: { idle: { on: { GO: "busy" } }, busy: {} },
      }),
    ).start();

    const wires: Wire[] = [
      {
        fromMachine: actor,
        select: (snap) => snap.value,
        into: () => {
          throw new Error("wire exploded");
        },
      },
    ];

    const harness = pinned([1]);
    const kit = createStateKit({
      feed: harness.feed,
      wires,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: {
            store: () => {
              throw new Error("dispatch exploded");
            },
          },
        },
      },
      onError: (e) => errors.push(e),
    });

    harness.push(reading("p1", "rig/1/reading", "1", 10));
    await harness.settle();
    actor.send({ type: "GO" }); // projection changes -> the throwing wire runs

    const wireFailures = errors.filter((e) => e.envelope === null);
    const messageFailures = errors.filter((e) => e.envelope !== null);

    expect(wireFailures).toHaveLength(1);
    expect(wireFailures[0]!.message).toContain("wire fan-out");
    expect(messageFailures).toHaveLength(1);
    expect(messageFailures[0]!.envelope!.packetId).toBe("p1");
    expect(messageFailures[0]!.message).toContain("rig/1/reading");
    kit.dispose();
  });

  it("evicts least-RECENTLY-used packet ids, not merely the oldest inserted", async () => {
    const dispatched: string[] = [];
    const harness = pinned([1, 2, 3, 4, 5, 6]);
    const kit = createStateKit({
      feed: harness.feed,
      dedupCapacity: 2,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: (m) => dispatched.push(m.packetId) },
        },
      },
    });

    // A, B fill the registry; the repeat of A refreshes A's recency, so adding
    // C must evict B. Under plain FIFO it would evict A instead.
    harness.push(
      reading("A", "rig/1/reading", "1", 1),
      reading("B", "rig/2/reading", "2", 2),
      reading("A", "rig/1/reading", "1", 3), // duplicate -> refreshes A
      reading("C", "rig/3/reading", "3", 4), // evicts the least recent (B)
      reading("A", "rig/1/reading", "1", 5), // still remembered -> duplicate
      reading("B", "rig/2/reading", "2", 6), // was evicted -> passes again
    );
    await harness.settle();

    expect(dispatched).toStrictEqual(["A", "B", "C", "B"]);
    expect(kit.stats.duplicate).toBe(2); // both repeats of A
    kit.dispose();
  });

  it("builds inspection events lazily and extracts entity once per message", async () => {
    let entityCalls = 0;
    const entity = (m: ValidatedMessage<Reading>) => {
      entityCalls++;
      return m.payload.rigId;
    };

    const withoutTap = createStateKit({
      feed: pinned([1]).feed,
      streams: { rig: { topic: "rig/+/reading", entity, dispatch: { store: () => {} } } },
    });
    void withoutTap;

    // Re-run the same message with and without an inspect tap.
    const runOnce = async (inspect?: (ev: IngressInspectionEvent) => void) => {
      entityCalls = 0;
      const harness = pinned([1]);
      const kit = createStateKit({
        feed: harness.feed,
        streams: { rig: { topic: "rig/+/reading", entity, dispatch: { store: () => {} } } },
        ...(inspect ? { inspect } : {}),
      });
      harness.push(reading("p1", "rig/1/reading", "1", 10));
      await harness.settle();
      kit.dispose();
      return entityCalls;
    };

    const events: IngressInspectionEvent[] = [];
    expect(await runOnce()).toBe(1); // no tap: still exactly one extraction
    expect(await runOnce((ev) => events.push(ev))).toBe(1); // tap: no extra calls
    expect(events.map((e) => e.stage)).toStrictEqual(["dedup", "guard", "mask", "dispatch"]);
  });

  it("detaches its boundary-signal listener on dispose", () => {
    const controller = new AbortController();
    const removed: string[] = [];
    const added: string[] = [];
    const realAdd = controller.signal.addEventListener.bind(controller.signal);
    const realRemove = controller.signal.removeEventListener.bind(controller.signal);
    controller.signal.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.push(type);
      return (realAdd as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof controller.signal.addEventListener;
    controller.signal.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.push(type);
      return (realRemove as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof controller.signal.removeEventListener;

    const kit = createStateKit({ signal: controller.signal });
    expect(added).toStrictEqual(["abort"]);
    expect(removed).toStrictEqual([]);

    kit.dispose();
    expect(removed).toStrictEqual(["abort"]);

    // The boundary signal outlives the kit; aborting it now is inert.
    controller.abort();
    expect(kit.signal.aborted).toBe(true); // from dispose, not from this abort
  });
});

describe("RaceHarness.settle quiescence", () => {
  it("throws rather than returning quietly while scheduled tasks remain", async () => {
    const harness = createRaceHarness(fc.schedulerFor([...Array(200)].map((_, i) => i + 1)));
    let alive = true;
    let n = 0;

    // A producer parked in the macrotask queue: it schedules one new delivery
    // per turn, so the feed never becomes quiescent. Before this fix settle()
    // returned silently and a caller would have asserted on partial state.
    const produce = () => {
      if (!alive) return;
      harness.push(reading(`p${++n}`, "rig/1/reading", "1", n));
      setTimeout(produce, 0);
    };
    setTimeout(produce, 0);

    try {
      await expect(harness.settle()).rejects.toThrow(SettleNotQuiescentError);
    } finally {
      alive = false;
    }
  }, 30_000);

  it("still returns normally once the feed goes quiet", async () => {
    const dispatched: number[] = [];
    const harness = pinned([1]);
    const kit = createStateKit({
      feed: harness.feed,
      streams: {
        rig: {
          topic: "rig/+/reading",
          entity: (m: ValidatedMessage<Reading>) => m.payload.rigId,
          dispatch: { store: (m) => dispatched.push(m.payload.value) },
        },
      },
    });
    harness.push(reading("p1", "rig/1/reading", "1", 10));
    await expect(harness.settle()).resolves.toBeUndefined();
    expect(dispatched).toStrictEqual([10]);
    kit.dispose();
  });
});
