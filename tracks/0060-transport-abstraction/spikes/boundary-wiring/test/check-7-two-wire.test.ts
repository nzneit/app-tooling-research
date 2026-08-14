// Check 7 — the two-wire rule (I4). Discrete domain events leave via
// `actor.on`; continuous connection state leaves via `actor.subscribe`
// projection. The same ingress feeds both, and neither wire may leak the
// other's shape — asserted at runtime AND at the type level, where the
// expect-error markers at the bottom of this file are themselves the test:
// `tsc --noEmit` fails if any of them stops being an error.

import { describe, expect, it } from "vitest";
import { createTransportBoundary, type BoundarySnapshot } from "../src/index.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

async function harness() {
  const memory = memoryBrokerAdapter();
  const b = createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memory },
  );
  b.start();
  await Promise.resolve();
  await Promise.resolve();
  return { b, memory };
}

describe("check 7 — wire 1 (discrete domain events)", () => {
  it("delivers the typed message event and nothing about the connection", async () => {
    const { b, memory } = await harness();
    const events: Record<string, unknown>[] = [];
    b.subscribe("plant/{plantId}/telemetry", (e) => {
      // Type-level: the payload is narrowed to this channel's validated shape.
      const temp: number = e.payload.tempC;
      const at: string = e.payload.at;
      const channel: "plant/{plantId}/telemetry" = e.channel;
      void temp;
      void at;
      void channel;
      events.push(e as unknown as Record<string, unknown>);
    });

    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 4, at: "t0" }), { messageId: 1 });
    // A connection transition must produce nothing on this wire.
    memory.dropConnection();
    await tick();
    memory.restoreConnection();
    await tick();

    expect(events).toHaveLength(1);
    const keys = Object.keys(events[0] ?? {}).sort();
    expect(keys).toEqual(["channel", "params", "payload", "topic", "type"]);
    for (const leaked of ["connection", "attempt", "publishGated", "depths", "subscriptions"]) {
      expect(keys).not.toContain(leaked);
    }
    await b.dispose();
  });

  it("carries telemetry, but never connection state, on the wildcard tap", async () => {
    const { b, memory } = await harness();
    const seen: { type: string; keys: string[] }[] = [];
    b.actor.on("*", (ev) => {
      seen.push({ type: ev.type, keys: Object.keys(ev).sort() });
    });
    b.subscribe("plant/{plantId}/telemetry");
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 4, at: "t0" }), { messageId: 1 });
    memory.deliver("plant/p1/telemetry", "not json", { messageId: 2 });
    memory.dropConnection();
    await tick();

    // O5 gives telemetry no ordering guarantee relative to message.* events
    // (rejects classify on the pump; deliveries dispatch off it), so assert
    // membership, not sequence.
    const types = seen.map((s) => s.type);
    expect(types.filter((t) => t === "message.plant/{plantId}/telemetry")).toHaveLength(1);
    expect(types.filter((t) => t === "telemetry")).toHaveLength(2);
    for (const s of seen) {
      if (s.type === "telemetry") expect(s.keys).toEqual(["event", "type"]);
      expect(s.keys).not.toContain("connection");
    }
    await b.dispose();
  });
});

describe("check 7 — wire 2 (continuous connection presentation)", () => {
  it("projects connection state and depths, and never a message payload", async () => {
    const { b, memory } = await harness();
    const snapshots: BoundarySnapshot[] = [];
    b.actor.subscribe((s) => snapshots.push(s));
    b.subscribe("plant/{plantId}/telemetry");
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 4, at: "t0" }), { messageId: 1 });
    await tick();

    expect(snapshots.length).toBeGreaterThan(0);
    for (const s of snapshots) {
      const keys = Object.keys(s).sort();
      expect(keys).toContain("connection");
      expect(keys).toContain("depths");
      for (const leaked of ["payload", "topic", "params", "channel", "event"]) {
        expect(keys).not.toContain(leaked);
      }
      expect(JSON.stringify(s)).not.toContain("tempC");
    }
    // getSnapshot() agrees with the last notification (O6).
    expect(b.actor.getSnapshot()).toEqual(snapshots.at(-1));
    await b.dispose();
  });

  it("feeds both wires from the one ingress", async () => {
    const { b, memory } = await harness();
    const wire1: string[] = [];
    const wire2Depths: number[] = [];
    b.actor.subscribe((s) => wire2Depths.push(s.depths.delivery));
    b.subscribe("plant/{plantId}/telemetry", (e) => wire1.push(e.topic));

    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 4, at: "t0" }), { messageId: 1 });
    // Bounded enqueue is observable on wire 2 before the microtask dispatch.
    expect(b.actor.getSnapshot().depths.delivery).toBe(1);
    expect(wire1).toHaveLength(0);
    await tick();

    expect(wire1).toEqual(["plant/p1/telemetry"]);
    expect(wire2Depths).toContain(1);
    expect(wire2Depths.at(-1)).toBe(0);
    await b.dispose();
  });

  it("notifies wire 2 on change only", async () => {
    const { b, memory } = await harness();
    const snapshots: BoundarySnapshot[] = [];
    b.actor.subscribe((s) => snapshots.push(s));
    await tick();
    const before = snapshots.length;
    // Two unroutable packets on the same topic: quarantine depth changes twice.
    memory.deliver("nope/a", "{}", { messageId: 1 });
    memory.deliver("nope/a", "{}", { messageId: 2 });
    await tick();
    expect(snapshots.length).toBe(before + 2);
    expect(snapshots.at(-1)?.depths.quarantine).toBe(2);
    await b.dispose();
  });
});

// ── Type-level evidence (never executed; `tsc --noEmit` is the assertion) ────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _neverCrossTheWires(): Promise<void> {
  const b = createTransportBoundary({ mqtt: { url: "ws://memory" }, policy, rest });

  b.actor.on("message.plant/{plantId}/telemetry", (ev) => {
    const ok: number = ev.payload.tempC;
    void ok;
    // @ts-expect-error — wire 1 never carries connection state (I4)
    void ev.connection;
    // @ts-expect-error — wire 1 never carries the publish gate (I4)
    void ev.publishGated;
    // @ts-expect-error — wire 1 never carries queue depths (I4)
    void ev.depths;
  });

  b.actor.subscribe((s) => {
    const ok: BoundarySnapshot["connection"] = s.connection;
    void ok;
    // @ts-expect-error — wire 2 never carries message payloads (I4)
    void s.payload;
    // @ts-expect-error — wire 2 never carries topics (I4)
    void s.topic;
    // @ts-expect-error — wire 2 never carries topic params (I4)
    void s.params;
  });

  b.actor.on("*", (ev) => {
    // @ts-expect-error — the union must be narrowed before either shape is read
    void ev.topic;
    if (ev.type === "telemetry") void ev.event.dedupKey;
    else void ev.topic;
  });

  // @ts-expect-error — direction: 'in' rows are typed away from publish
  await b.publish("plant/{plantId}/telemetry", { tempC: 1, at: "x" });
  // @ts-expect-error — direction: 'out' rows are typed away from subscribe
  b.subscribe("plant/{plantId}/command");
  // @ts-expect-error — the payload type is checked against the channel's row
  await b.publish("plant/{plantId}/command", { action: "explode" }, { plantId: "p1" });
}
void _neverCrossTheWires;
