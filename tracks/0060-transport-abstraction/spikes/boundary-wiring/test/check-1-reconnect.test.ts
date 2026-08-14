// Check 1 — reconnect edges.
// The recovery and give-up paths run against the REAL aedes-over-ws broker with
// mqtt.js; a third test walks the same give-up policy deterministically on the
// memory adapter + xstate SimulatedClock (design.md, O4 / the ClockPort graft).

import { afterEach, describe, expect, it } from "vitest";
import { SimulatedClock } from "xstate";
import { createTransportBoundary, type TransportBoundary } from "../src/index.js";
import { isTransient, type BoundaryError } from "../src/errors/index.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";
import { startBroker, waitFor, type TestBroker } from "./aedes-broker.js";

let broker: TestBroker | null = null;
let boundary: TransportBoundary<typeof policy> | null = null;

afterEach(async () => {
  await boundary?.dispose();
  boundary = null;
  await broker?.close();
  broker = null;
});

/** SimulatedClock fires each flush once, so one increment per backoff window. */
async function advance(clock: SimulatedClock, ms: number, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    clock.increment(ms);
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe("check 1 — reconnect edges (real broker)", () => {
  it("goes reconnecting when the server socket dies and recovers on restart", async () => {
    broker = await startBroker();
    const states: string[] = [];
    boundary = createTransportBoundary({
      mqtt: {
        url: broker.url,
        reconnect: { periodMs: 100, maxAttempts: 40, backoffMs: () => 500 },
      },
      policy,
      rest,
    });
    boundary.actor.subscribe((s) => {
      if (states.at(-1) !== s.connection) states.push(s.connection);
    });
    boundary.subscribe("plant/{plantId}/telemetry");
    boundary.start();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "initial connect",
    });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) >= 1, { label: "initial subscribe" });

    // Kill the listener and every live socket.
    await broker.stop();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "reconnecting", {
      label: "reconnecting",
    });
    expect(boundary.actor.getSnapshot().attempt).toBeGreaterThanOrEqual(1);

    await broker.restart();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      timeoutMs: 10_000,
      label: "recovery",
    });
    const snap = boundary.actor.getSnapshot();
    expect(snap.attempt).toBe(0);
    expect(snap.publishGated).toBe(false);
    expect(states).toContain("reconnecting");
    expect(states.at(-1)).toBe("connected");
  }, 20_000);

  it("gives up after bounded retries into degraded, gates publish, and re-arms on reconnect()", async () => {
    broker = await startBroker();
    const telemetry: BoundaryError[] = [];
    boundary = createTransportBoundary({
      mqtt: {
        url: broker.url,
        reconnect: { periodMs: 80, maxAttempts: 3, backoffMs: () => 150 },
      },
      policy,
      rest,
      telemetry: { dedupeWindowMs: 5 },
    });
    boundary.actor.on("*", (ev) => {
      if (ev.type === "telemetry") telemetry.push(ev.event.error);
    });
    boundary.start();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "initial connect",
    });

    await broker.stop();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "degraded", {
      timeoutMs: 10_000,
      label: "degraded",
    });

    const snap = boundary.actor.getSnapshot();
    expect(snap.connection).toBe("degraded");
    expect(snap.publishGated).toBe(true);
    expect(snap.attempt).toBe(3);
    expect(snap.degradedSince).toBeTypeOf("number");
    expect(telemetry.some((e) => isTransient(e) && e.reason === "connection-lost")).toBe(true);

    // Publish while degraded -> immediate class-1 'publish-gated' rejection (O4).
    const err = await boundary
      .publish("plant/{plantId}/command", { action: "start" }, { plantId: "p1" })
      .then(() => null)
      .catch((e: unknown) => e as BoundaryError);
    expect(err).not.toBeNull();
    expect(isTransient(err)).toBe(true);
    expect((err as { reason: string }).reason).toBe("publish-gated");

    // Give-up ended the adapter's retry loop: bringing the broker back does not
    // silently recover. Only an explicit reconnect() re-arms.
    await broker.restart();
    await new Promise((r) => setTimeout(r, 600));
    expect(boundary.actor.getSnapshot().connection).toBe("degraded");

    boundary.reconnect();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      timeoutMs: 10_000,
      label: "re-armed",
    });
    expect(boundary.actor.getSnapshot().publishGated).toBe(false);
  }, 30_000);
});

describe("check 1 — give-up policy (deterministic, SimulatedClock)", () => {
  it("counts exactly maxAttempts backoff windows before degrading", async () => {
    const memory = memoryBrokerAdapter();
    const clock = new SimulatedClock();
    const b = createTransportBoundary(
      {
        mqtt: { url: "ws://memory", reconnect: { maxAttempts: 5, backoffMs: () => 1000 } },
        policy,
        rest,
      },
      { broker: memory, clock },
    );
    b.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.actor.getSnapshot().connection).toBe("connected");

    memory.refuseReconnects();
    memory.dropConnection();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.actor.getSnapshot().connection).toBe("reconnecting");
    expect(b.actor.getSnapshot().attempt).toBe(1);

    await advance(clock, 1000, 4);
    expect(b.actor.getSnapshot().connection).toBe("reconnecting");
    expect(b.actor.getSnapshot().attempt).toBe(5);

    await advance(clock, 1000, 1);
    const snap = b.actor.getSnapshot();
    expect(snap.connection).toBe("degraded");
    expect(snap.publishGated).toBe(true);
    expect(snap.attempt).toBe(5);
    await b.dispose();
    expect(b.actor.getSnapshot().connection).toBe("ended");
  });

  it("queues publishes while reconnecting and flushes them on recovery", async () => {
    const memory = memoryBrokerAdapter();
    const clock = new SimulatedClock();
    const b = createTransportBoundary(
      {
        mqtt: {
          url: "ws://memory",
          reconnect: { maxAttempts: 5, backoffMs: () => 1000 },
          bounds: { publish: 4 },
        },
        policy,
        rest,
      },
      { broker: memory, clock },
    );
    b.start();
    await Promise.resolve();
    await Promise.resolve();
    memory.refuseReconnects();
    memory.dropConnection();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.actor.getSnapshot().connection).toBe("reconnecting");

    const pending = b.publish("plant/{plantId}/command", { action: "stop" }, { plantId: "p9" });
    expect(b.actor.getSnapshot().depths.publish).toBe(1);
    expect(b.actor.getSnapshot().publishGated).toBe(false);

    memory.allowReconnects();
    memory.restoreConnection();
    await pending;
    expect(memory.published.map((p) => p.topic)).toEqual(["plant/p9/command"]);
    expect(b.actor.getSnapshot().depths.publish).toBe(0);
    await b.dispose();
  });
});
