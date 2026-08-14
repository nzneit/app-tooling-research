// Check 2 — offline-window resubscribe + redelivery dedup (the mqtt.js #909
// scenario).
//
// Deviation, recorded in findings.md: A-5 fixes `clean: true` sessions, so a
// broker can never legally redeliver an unacked QoS-1 packet across the window
// — genuine broker-driven redelivery is unreachable by construction. The
// offline window, the reconnect and the resubscribe are all REAL (aedes stopped
// and restarted, mqtt.js reconnecting, SUBSCRIBE observed broker-side); the
// duplicate itself is injected at the adapter seam with the same
// (topic, messageId) and dup: true, which is exactly the packet a broker would
// resend. The memory-adapter test below drives the same guard through
// duplicateNext().

import { afterEach, describe, expect, it } from "vitest";
import {
  createTransportBoundary,
  mqttJsBrokerAdapter,
  type BrokerHandlers,
  type BrokerPort,
  type TransportBoundary,
} from "../src/index.js";
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

/** BrokerPort decorator that can replay the last packet verbatim, dup: true. */
function withRedelivery(inner: BrokerPort): {
  port: BrokerPort;
  redeliverLast: () => void;
} {
  let last: { topic: string; payload: Uint8Array; messageId?: number; qos: 0 | 1 | 2 } | null = null;
  let live: BrokerHandlers | null = null;
  return {
    port: {
      connect(opts, h) {
        live = h;
        return inner.connect(opts, {
          onMessage(topic, payload, meta) {
            last = { topic, payload, messageId: meta.messageId, qos: meta.qos };
            h.onMessage(topic, payload, meta);
          },
          onLifecycle: (e, detail) => h.onLifecycle(e, detail),
        });
      },
    },
    redeliverLast() {
      if (last === null || live === null) throw new Error("nothing to redeliver");
      live.onMessage(last.topic, last.payload, {
        messageId: last.messageId,
        dup: true,
        qos: last.qos,
      });
    },
  };
}

describe("check 2 — offline window (real broker)", () => {
  it("resubscribes after reconnect and dedups a redelivered packet", async () => {
    broker = await startBroker();
    const redelivery = withRedelivery(mqttJsBrokerAdapter());
    const seen: { topic: string; payload: { at: string } }[] = [];
    boundary = createTransportBoundary(
      {
        mqtt: {
          url: broker.url,
          reconnect: { periodMs: 100, maxAttempts: 40, backoffMs: () => 500 },
        },
        policy,
        rest,
      },
      { broker: redelivery.port },
    );
    boundary.subscribe("plant/{plantId}/telemetry", (e) =>
      seen.push({ topic: e.topic, payload: e.payload }),
    );
    boundary.start();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "connect",
    });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) === 1, { label: "subscribe #1" });
    expect(broker.subscribeLog[0]?.filters).toEqual(["plant/+/telemetry"]);

    await broker.publish("plant/p1/telemetry", JSON.stringify({ tempC: 1, at: "before" }), 1);
    await waitFor(() => seen.length === 1, { label: "pre-window message" });

    // ── the offline window ────────────────────────────────────────
    await broker.stop();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "reconnecting", {
      label: "offline",
    });
    await broker.restart();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      timeoutMs: 10_000,
      label: "reconnect",
    });

    // O3: interest is resubscribed across reconnects — observed broker-side.
    await waitFor(() => (broker?.subscribeLog.length ?? 0) === 2, {
      timeoutMs: 10_000,
      label: "resubscribe",
    });
    expect(broker.subscribeLog[1]?.filters).toEqual(["plant/+/telemetry"]);

    await broker.publish("plant/p1/telemetry", JSON.stringify({ tempC: 2, at: "after" }), 1);
    await waitFor(() => seen.length === 2, { timeoutMs: 10_000, label: "post-window message" });
    expect(seen[1]?.payload.at).toBe("after");

    // The #909 duplicate: same topic + messageId, dup: true.
    redelivery.redeliverLast();
    redelivery.redeliverLast();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toHaveLength(2);
    expect(boundary.quarantine.entries()).toHaveLength(0);
  }, 30_000);

  it("dedups on packet identity, not payload content", async () => {
    broker = await startBroker();
    const seen: unknown[] = [];
    boundary = createTransportBoundary({ mqtt: { url: broker.url }, policy, rest });
    boundary.subscribe("plant/{plantId}/telemetry", (e) => seen.push(e));
    boundary.start();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "connect",
    });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) >= 1, { label: "subscribe" });

    const body = JSON.stringify({ tempC: 7, at: "same" });
    await broker.publish("plant/p2/telemetry", body, 1);
    await broker.publish("plant/p2/telemetry", body, 1);
    await waitFor(() => seen.length === 2, { label: "two distinct packets" });
    expect(seen).toHaveLength(2);
  }, 20_000);
});

describe("check 2 — redelivery guard (memory adapter)", () => {
  it("passes exactly one dispatch when the adapter duplicates a QoS-1 packet", async () => {
    const memory = memoryBrokerAdapter();
    const b = createTransportBoundary(
      { mqtt: { url: "ws://memory" }, policy, rest },
      { broker: memory },
    );
    const seen: unknown[] = [];
    b.subscribe("plant/{plantId}/telemetry", (e) => seen.push(e));
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    memory.duplicateNext(3);
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 3, at: "t" }), {
      messageId: 42,
      qos: 1,
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(seen).toHaveLength(1);
    // I3: a suppressed duplicate produces no second quarantine entry either.
    expect(b.quarantine.entries()).toHaveLength(0);
    expect(b.actor.getSnapshot().depths.quarantine).toBe(0);
    await b.dispose();
  });

  it("cannot dedup QoS-0 packets (no messageId) and says so by delivering both", async () => {
    const memory = memoryBrokerAdapter();
    const b = createTransportBoundary(
      { mqtt: { url: "ws://memory" }, policy, rest },
      { broker: memory },
    );
    const seen: unknown[] = [];
    b.subscribe("plant/{plantId}/telemetry", (e) => seen.push(e));
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    memory.duplicateNext(1);
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 3, at: "t" }), { qos: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toHaveLength(2);
    await b.dispose();
  });
});
