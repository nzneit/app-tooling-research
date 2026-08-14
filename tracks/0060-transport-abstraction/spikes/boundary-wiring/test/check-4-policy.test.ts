// Check 4 — policy table: mqtt-pattern matching over an AsyncAPI-channel-keyed
// synthetic topic scheme; unknown topic -> class 4 + quarantine; a reasonCode
// channel constructs class-3 ReasonCodeError on the telemetry wire while the
// typed message event still fires (I2).

import { describe, expect, it } from "vitest";
import { createTransportBoundary } from "../src/index.js";
import { isReasonCode, isUnroutable, type TelemetryEvent } from "../src/errors/index.js";
import { memoryBrokerAdapter, type MemoryBroker } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

interface Harness {
  b: ReturnType<typeof createTransportBoundary<typeof policy>>;
  memory: MemoryBroker;
  telemetry: TelemetryEvent[];
  messages: { type: string; topic: string; params: Record<string, string>; payload: unknown }[];
}

async function harness(): Promise<Harness> {
  const memory = memoryBrokerAdapter();
  const b = createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memory },
  );
  const telemetry: TelemetryEvent[] = [];
  const messages: Harness["messages"] = [];
  b.actor.on("*", (ev) => {
    if (ev.type === "telemetry") telemetry.push(ev.event);
    else messages.push({ type: ev.type, topic: ev.topic, params: { ...ev.params }, payload: ev.payload });
  });
  b.subscribe("plant/{plantId}/telemetry");
  b.subscribe("plant/{plantId}/status");
  b.start();
  await Promise.resolve();
  await Promise.resolve();
  return { b, memory, telemetry, messages };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("check 4 — policy table", () => {
  it("matches an AsyncAPI-keyed channel and extracts named wildcards", async () => {
    const { b, memory, messages } = await harness();
    memory.deliver("plant/plant-7/telemetry", JSON.stringify({ tempC: 12.5, at: "t0" }));
    await tick();

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("message.plant/{plantId}/telemetry");
    expect(messages[0]?.topic).toBe("plant/plant-7/telemetry");
    expect(messages[0]?.params).toEqual({ plantId: "plant-7" });
    expect(messages[0]?.payload).toEqual({ tempC: 12.5, at: "t0" });
    // Broker-level filter is the cleaned pattern, not the channel key.
    expect([...memory.subscriptions].sort()).toEqual(["plant/+/status", "plant/+/telemetry"]);
    await b.dispose();
  });

  it("routes an unknown topic to class 4 + quarantine, and to no wire-1 message", async () => {
    const { b, memory, telemetry, messages } = await harness();
    memory.deliver("factory/f1/alarm", JSON.stringify({ any: "thing" }));
    await tick();

    expect(messages).toHaveLength(0);
    const entries = b.quarantine.entries();
    expect(entries).toHaveLength(1);
    const err = entries[0]?.error;
    expect(isUnroutable(err)).toBe(true);
    expect(err).toMatchObject({ class: 4, cause: "unknown-topic", leg: "mqtt" });
    expect(entries[0]?.endpointOrTopic).toBe("factory/f1/alarm");
    expect(telemetry.filter((t) => t.error.class === 4)).toHaveLength(1);
    expect(b.actor.getSnapshot().depths.quarantine).toBe(1);
    await b.dispose();
  });

  it("treats an inbound packet on an outbound-only channel as unroutable", async () => {
    const { b, memory } = await harness();
    memory.deliver("plant/p1/command", JSON.stringify({ action: "start" }));
    await tick();
    expect(b.quarantine.entries()[0]?.error).toMatchObject({
      class: 4,
      cause: "unknown-topic",
    });
    await b.dispose();
  });

  it("constructs class-3 on a reasonCode channel WITHOUT suppressing message.* (I2)", async () => {
    const { b, memory, telemetry, messages } = await harness();
    memory.deliver(
      "plant/p3/status",
      JSON.stringify({ ok: false, code: "E_OVERTEMP", detail: "sensor 2" }),
    );
    await tick();

    // Discrete wire still fires, with the full validated payload.
    const status = messages.filter((m) => m.type === "message.plant/{plantId}/status");
    expect(status).toHaveLength(1);
    expect(status[0]?.payload).toEqual({ ok: false, code: "E_OVERTEMP", detail: "sensor 2" });

    // Telemetry wire additionally carries the class-3 ReasonCodeError.
    const reasons = telemetry.filter((t) => isReasonCode(t.error));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.error).toMatchObject({
      class: 3,
      status: null,
      leg: "mqtt",
      endpointOrTopic: "plant/p3/status",
      body: { code: "E_OVERTEMP", detail: "sensor 2" },
    });
    // A delivered reason-code payload is NOT a rejected payload: no quarantine.
    expect(b.quarantine.entries()).toHaveLength(0);
    await b.dispose();
  });

  it("keeps the choke-point order on a reasonCode channel: invalid payload is class 2, select never runs", async () => {
    const { b, memory, telemetry, messages } = await harness();
    memory.deliver("plant/p3/status", JSON.stringify({ ok: "no", code: 5 }));
    await tick();

    expect(messages).toHaveLength(0);
    expect(telemetry.filter((t) => t.error.class === 3)).toHaveLength(0);
    expect(telemetry.filter((t) => t.error.class === 2)).toHaveLength(1);
    expect(b.quarantine.entries()[0]?.error).toMatchObject({ class: 2 });
    await b.dispose();
  });

  it("fills the publish topic from the channel key + params", async () => {
    const { b, memory } = await harness();
    await b.publish("plant/{plantId}/command", { action: "stop" }, { plantId: "p42" });
    expect(memory.published).toHaveLength(1);
    expect(memory.published[0]?.topic).toBe("plant/p42/command");
    expect(memory.published[0]?.qos).toBe(1);
    await b.dispose();
  });

  it("throws plain Errors on programmer error, outside the taxonomy", async () => {
    const { b } = await harness();
    expect(() => b.subscribe("nope/{x}" as never)).toThrow(/unknown channel/);
    // direction: 'out' rows are typed away from subscribe and 'in' rows from
    // publish; these are the runtime backstops.
    expect(() => b.subscribe("plant/{plantId}/command" as never)).toThrow(/outbound-only/);
    await expect(
      b.publish("plant/{plantId}/telemetry" as never, { tempC: 1, at: "x" } as never),
    ).rejects.toThrow(/inbound-only/);
    await expect(
      b.publish("plant/{plantId}/command", { action: "stop" }),
    ).rejects.toThrow(/missing topic params/);
    await b.dispose();
  });

  it("rejects the factory synchronously on invalid configuration", () => {
    expect(() =>
      createTransportBoundary({ mqtt: { url: "http://nope" }, policy, rest }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      createTransportBoundary({ mqtt: { url: "ws://x" }, policy: {}, rest }),
    ).toThrow(/empty policy table/);
    expect(() =>
      createTransportBoundary({
        mqtt: { url: "ws://x", bounds: { delivery: 0 } },
        policy,
        rest,
      }),
    ).toThrow(/positive integer/);
  });

  it("validates outbound payloads against the same validator (I7)", async () => {
    const { b, memory } = await harness();
    const err = await b
      .publish("plant/{plantId}/command", { action: "explode" } as never, { plantId: "p1" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ class: 2, leg: "mqtt", endpointOrTopic: "plant/p1/command" });
    expect(memory.published).toHaveLength(0);
    await b.dispose();
  });
});
