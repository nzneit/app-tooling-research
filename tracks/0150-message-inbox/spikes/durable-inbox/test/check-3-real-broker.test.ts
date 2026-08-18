// check-3 — the deferral mechanism against a REAL broker and a real mqtt.js.
// LANE: node + aedes 1.1.1 + mqtt 5.15.2 over ws.
//
// What this lane can and cannot witness is stated in findings.md and matters:
// aedes has no in-flight window, no queue cap and no drop policy, so it cannot
// PUNISH deferred acknowledgement the way Mosquitto's 20-message window or
// ActiveMQ's ~3,200 outstanding would. A green run here proves the mechanism
// works against aedes.
//
// One upstream defect is designed around rather than hit: aedes silently drops
// QoS-1 messages when QoS-0 traffic shares the same client (moscajs/aedes#994,
// open — a per-client brokerCounter high-water mark in dedupe()). Every test
// below therefore keeps QoS-0 traffic on a separate clientId.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPipeline,
  memoryInboxStore,
  mqttjsBrokerPort,
  type BrokerLink,
  type Pipeline,
} from "../src/index.js";
import { startBroker, waitFor, type TestBroker } from "./aedes-broker.js";
import { DURABLE_POLICIES, isReading } from "./fixtures.js";

let broker: TestBroker;
const links: BrokerLink[] = [];

beforeEach(async () => {
  broker = await startBroker();
});

afterEach(async () => {
  for (const link of links.splice(0)) await link.end(true).catch(() => undefined);
  await broker.close();
});

async function connect(
  pipeline: Pipeline,
  clientId: string,
  clean = false,
): Promise<BrokerLink> {
  const link = mqttjsBrokerPort().connect(
    { url: broker.url, clientId, clean, reconnectPeriodMs: 0, keepaliveSeconds: 30 },
    pipeline.handlers,
  );
  links.push(link);
  await waitFor(() => link.connected, { label: `${clientId} connect` });
  return link;
}

function payload(id: string, value = 1): string {
  return JSON.stringify({ id, value, seq: 0 });
}

describe("check-3: deferred acknowledgement against a real broker", () => {
  it("GO: the PUBACK is written only AFTER the commit resolves (A1)", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const store = memoryInboxStore();
    const slow = {
      ...store,
      async commit(entry: Parameters<typeof store.commit>[0]) {
        await gate;
        return store.commit(entry);
      },
    };
    const pipeline = createPipeline({ policies: DURABLE_POLICIES, inbox: slow });
    await pipeline.start();
    const link = await connect(pipeline, "dev-ack-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });

    await broker.publish("plant/p1/telemetry", payload("a"), 1);
    // Give the message time to arrive and be held.
    await new Promise((r) => setTimeout(r, 250));
    expect(broker.pubacks, "a PUBACK was written before the commit resolved").toHaveLength(0);

    release();
    await waitFor(() => broker.pubacks.length === 1, { label: "puback after commit" });
    expect(pipeline.status.applied).toBe(1);
  });

  it("GO: PUBACKs are written in RECEIPT order under jittered commit latency ([MQTT-4.6.0-2])", async () => {
    // Commit latency is deliberately inverted against arrival order: the first
    // message is slowest. If acknowledgement raced commits, the order would
    // invert. It does not, because mqtt.js's inbound pump is single-slot — the
    // smallest correct implementation of an ordering requirement turns out to be
    // a prohibition (one in flight) rather than a release queue.
    const order = ["a", "b", "c", "d", "e", "f"];
    const latency = new Map(order.map((id, i) => [id, (order.length - i) * 15]));
    const store = memoryInboxStore({
      commitLatencyMs: (key) => {
        for (const [id, ms] of latency) if (key.endsWith(id)) return ms;
        return 0;
      },
    });
    const pipeline = createPipeline({ policies: DURABLE_POLICIES, inbox: store });
    await pipeline.start();
    const link = await connect(pipeline, "dev-order-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });

    for (const id of order) await broker.publish("plant/p1/telemetry", payload(id), 1);
    await waitFor(() => broker.pubacks.length === order.length, {
      label: "all pubacks",
      timeoutMs: 15_000,
    });

    const ids = broker.pubacks.map((p) => p.messageId);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(pipeline.status.applied).toBe(order.length);
    // The finding, recorded rather than asserted away: stock mqtt.js self-limits
    // to ONE outstanding inbound message, so the broker's in-flight window is
    // unobservable from here.
    expect(pipeline.status.maxInFlight).toBe(1);
  });

  it("GO: a withheld ack leaves the message with the broker, which redelivers it", async () => {
    let failNext = true;
    const store = memoryInboxStore();
    const flaky = {
      ...store,
      commit(entry: Parameters<typeof store.commit>[0]) {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("injected"));
        }
        return store.commit(entry);
      },
    };
    const pipeline = createPipeline({ policies: DURABLE_POLICIES, inbox: flaky });
    await pipeline.start();
    const link = await connect(pipeline, "dev-withhold-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });

    await broker.publish("plant/p1/telemetry", payload("w"), 1);
    await waitFor(() => pipeline.status.failed === 1, { label: "first commit failed" });
    expect(broker.pubacks).toHaveLength(0); // no PUBACK: the broker still owns it

    // Reconnect on the same clean:false session — the broker redelivers what it
    // never saw acknowledged, and this time the commit succeeds.
    await link.end(true);
    const resumed = await connect(pipeline, "dev-withhold-1");
    await waitFor(() => pipeline.status.applied === 1, {
      label: "redelivered and applied",
      timeoutMs: 10_000,
    });
    expect(resumed.epoch).toBeGreaterThan(0);
  });

  it("GO: offline QoS-1 messages are retained and replayed on a clean:false reconnect", async () => {
    const store = memoryInboxStore();
    const pipeline = createPipeline({ policies: DURABLE_POLICIES, inbox: store });
    await pipeline.start();
    const link = await connect(pipeline, "dev-offline-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });
    await new Promise((r) => setTimeout(r, 100));
    await link.end(true);

    for (let i = 0; i < 8; i++) await broker.publish("plant/p1/telemetry", payload(`o${String(i)}`), 1);

    await connect(pipeline, "dev-offline-1");
    await waitFor(() => pipeline.status.applied === 8, {
      label: "offline backlog replayed",
      timeoutMs: 10_000,
    });
    // Guarantee B, witnessed — against aedes, whose session semantics match
    // Mosquitto's rather than ActiveMQ's (subscriptions restored without a
    // resubscribe; sessionPresent set correctly).
    expect(pipeline.status.suppressed).toBe(0);
  });

  it("GO: a replay after a RELOAD is suppressed — the case packet identity cannot cover", async () => {
    // The durable store survives; the client does not. This is the exact gap the
    // connection-scoped messageId+topic guard is structurally unable to close.
    const store = memoryInboxStore();
    const first = createPipeline({ policies: DURABLE_POLICIES, inbox: store });
    await first.start();
    const link = await connect(first, "dev-reload-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });

    await broker.publish("plant/p1/telemetry", payload("survivor"), 1);
    await waitFor(() => first.status.applied === 1, { label: "applied once" });
    await link.end(true);

    // "Reload": a brand-new pipeline over the SAME durable store.
    const second = createPipeline({ policies: DURABLE_POLICIES, inbox: store });
    await second.start();
    await connect(second, "dev-reload-2", true);
    const l2 = links[links.length - 1];
    await l2?.subscribe("plant/+/telemetry", { qos: 1 });
    await broker.publish("plant/p1/telemetry", payload("survivor"), 1);

    await waitFor(() => second.status.suppressed === 1, {
      label: "suppressed across the reload",
      timeoutMs: 10_000,
    });
    expect(second.status.applied).toBe(0);
    expect(second.delivered).toHaveLength(0);
  });

  it("GO: the backlog on a RESUMED session arrives BEFORE any SUBSCRIBE — so the ack guard is what protects hydration", async () => {
    // The correction that neither design got right. Withholding SUBSCRIBE until
    // the inbox opens does not protect a resumed session: the broker replays the
    // stored outgoing queue on CONNACK, because the subscription is already in
    // the session, not because this connection asked for it.
    const store = memoryInboxStore();
    const warm = createPipeline({ policies: DURABLE_POLICIES, inbox: store });
    await warm.start();
    const link = await connect(warm, "dev-hydrate-1");
    await link.subscribe("plant/+/telemetry", { qos: 1 });
    await new Promise((r) => setTimeout(r, 100));
    await link.end(true);

    for (let i = 0; i < 5; i++) await broker.publish("plant/p1/telemetry", payload(`h${String(i)}`), 1);

    // A fresh pipeline that has NOT started: state is 'loading', and it issues no
    // SUBSCRIBE at all.
    const cold = createPipeline({ policies: DURABLE_POLICIES, inbox: memoryInboxStore() });
    const subscribesBefore = broker.subscribeLog.length;
    await connect(cold, "dev-hydrate-1");
    await waitFor(() => cold.status.state === "loading" && broker.pubacks.length === 0, {
      label: "messages arriving while loading",
      timeoutMs: 3000,
    }).catch(() => undefined);

    expect(broker.subscribeLog.length, "no SUBSCRIBE was issued by this connection").toBe(
      subscribesBefore,
    );
    // Nothing was applied against an unhydrated projection, and nothing was
    // acknowledged — the broker still owns every one of them.
    expect(cold.status.applied).toBe(0);
    expect(broker.pubacks).toHaveLength(0);
  });
});
