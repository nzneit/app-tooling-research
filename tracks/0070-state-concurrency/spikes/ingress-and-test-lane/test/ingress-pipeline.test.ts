// CHECK 2 (supporting) — the fixed pipeline order dedup -> guard -> mask ->
// dispatch, and the invariants that make the single-dispatch ingress a real
// entry point rather than a pass-through: design.md invariants 1, 3, 4, 6, 8,
// 11 plus the composition-root error modes.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createActor, createMachine } from "xstate";
import { createRaceHarness, createStateKit, IngressConfigError } from "../src/index.ts";
import type { IngressInspectionEvent, StreamDecl, ValidatedMessage } from "../src/index.ts";

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

    const cancelled = fetchThing({ signal: controller.signal });
    const kept = fetchThing({ signal: new AbortController().signal });
    controller.abort(); // aborted while the call is still parked in the scheduler
    await harness.settle();

    await expect(cancelled).rejects.toThrow("The operation was aborted");
    await expect(kept).resolves.toBe("payload");
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
