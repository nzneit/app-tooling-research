// Check 6 — non-JSON ingress on the MQTT leg (the ts-rest #789 lesson, I11).
// Every content shape has a defined outcome: nothing is ever silently skipped,
// nothing unparseable reaches a wire-1 listener, and the classification
// distinguishes "could not decode" (class 4) from "decoded but broke the
// contract" (class 2).

import { afterEach, describe, expect, it } from "vitest";
import { createTransportBoundary, type TransportBoundary } from "../src/index.js";
import { isUnroutable, type TelemetryEvent } from "../src/errors/index.js";
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

const tick = () => new Promise((r) => setTimeout(r, 5));

async function harness() {
  const memory = memoryBrokerAdapter();
  const b = createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memory },
  );
  const messages: unknown[] = [];
  const telemetry: TelemetryEvent[] = [];
  b.actor.on("*", (ev) => {
    if (ev.type === "telemetry") telemetry.push(ev.event);
    else messages.push(ev);
  });
  b.subscribe("plant/{plantId}/telemetry");
  b.start();
  await Promise.resolve();
  await Promise.resolve();
  return { b, memory, messages, telemetry };
}

describe("check 6 — non-JSON ingress", () => {
  const cases: { name: string; bytes: Uint8Array; cause: string }[] = [
    {
      name: "invalid UTF-8 (lone continuation bytes)",
      bytes: new Uint8Array([0xff, 0xfe, 0x80, 0x01]),
      cause: "undecodable",
    },
    {
      name: "binary payload (a protobuf-shaped blob)",
      bytes: new Uint8Array([0x08, 0x96, 0x01, 0x12, 0x04, 0xde, 0xad, 0xbe, 0xef]),
      cause: "undecodable",
    },
    {
      name: "valid UTF-8 that is not JSON",
      bytes: new TextEncoder().encode("tempC=21;at=now"),
      cause: "undecodable",
    },
    {
      name: "empty payload",
      bytes: new Uint8Array(0),
      cause: "undecodable",
    },
    {
      name: "truncated JSON",
      bytes: new TextEncoder().encode('{"tempC": 21, "at":'),
      cause: "undecodable",
    },
  ];

  for (const c of cases) {
    it(`routes ${c.name} to class 4 '${c.cause}' + quarantine, never to a wire-1 message`, async () => {
      const { b, memory, messages, telemetry } = await harness();
      memory.deliver("plant/p1/telemetry", c.bytes, { messageId: 1 });
      await tick();

      expect(messages).toHaveLength(0);
      const entries = b.quarantine.entries();
      expect(entries).toHaveLength(1);
      expect(isUnroutable(entries[0]?.error)).toBe(true);
      expect(entries[0]?.error).toMatchObject({ class: 4, cause: c.cause, leg: "mqtt" });
      expect(entries[0]?.endpointOrTopic).toBe("plant/p1/telemetry");
      // The raw bytes are kept for inspection (I13: inspection only, never replay).
      expect(entries[0]?.raw).toBeInstanceOf(Uint8Array);
      expect(telemetry).toHaveLength(1);
      expect(telemetry[0]?.error.class).toBe(4);
      await b.dispose();
    });
  }

  it("separates 'decoded but wrong' (class 2) from 'could not decode' (class 4)", async () => {
    const { b, memory, messages } = await harness();
    // Well-formed JSON scalars and arrays decode fine, then fail the contract.
    memory.deliver("plant/p1/telemetry", "42", { messageId: 1 });
    memory.deliver("plant/p1/telemetry", "null", { messageId: 2 });
    memory.deliver("plant/p1/telemetry", "[1,2,3]", { messageId: 3 });
    memory.deliver("plant/p1/telemetry", '{"tempC":"hot","at":1}', { messageId: 4 });
    await tick();

    expect(messages).toHaveLength(0);
    const classes = b.quarantine.entries().map((e) => e.error.class);
    expect(classes).toEqual([2, 2, 2, 2]);
    await b.dispose();
  });

  it("never lets a bad payload starve a good one behind it", async () => {
    const { b, memory, messages } = await harness();
    memory.deliver("plant/p1/telemetry", new Uint8Array([0xff, 0xff]), { messageId: 1 });
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 9, at: "ok" }), { messageId: 2 });
    memory.deliver("plant/p1/telemetry", "}{", { messageId: 3 });
    await tick();

    expect(messages).toHaveLength(1);
    expect(b.quarantine.entries()).toHaveLength(2);
    expect(b.actor.getSnapshot().connection).toBe("connected");
    await b.dispose();
  });
});

describe("check 6 — non-JSON over the real broker", () => {
  it("quarantines a genuinely binary MQTT payload as class 4", async () => {
    broker = await startBroker();
    boundary = createTransportBoundary({ mqtt: { url: broker.url }, policy, rest });
    const messages: unknown[] = [];
    boundary.subscribe("plant/{plantId}/telemetry", (e) => messages.push(e));
    boundary.start();
    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "connect",
    });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) >= 1, { label: "subscribe" });

    await broker.publish(
      "plant/p1/telemetry",
      new Uint8Array([0x00, 0xc3, 0x28, 0xa0, 0xa1, 0xff]),
      1,
    );
    await waitFor(() => (boundary?.quarantine.entries().length ?? 0) === 1, {
      label: "quarantined",
    });

    expect(messages).toHaveLength(0);
    expect(boundary.quarantine.entries()[0]?.error).toMatchObject({
      class: 4,
      cause: "undecodable",
      leg: "mqtt",
      endpointOrTopic: "plant/p1/telemetry",
    });
    // The client is unharmed: a following good payload still arrives.
    await broker.publish("plant/p1/telemetry", JSON.stringify({ tempC: 3, at: "after" }), 1);
    await waitFor(() => messages.length === 1, { label: "recovery message" });
    expect(boundary.actor.getSnapshot().connection).toBe("connected");
  }, 20_000);
});
