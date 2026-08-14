import { afterEach, describe, expect, it } from "vitest";
import { createTransportBoundary, type TransportBoundary } from "../src/index.js";
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

describe("real broker (aedes over ws + mqtt.js)", () => {
  it("connects, subscribes and receives a real published message", async () => {
    broker = await startBroker();
    boundary = createTransportBoundary({ mqtt: { url: broker.url }, policy, rest });
    const seen: { topic: string }[] = [];
    boundary.subscribe("plant/{plantId}/telemetry", (e) => seen.push(e));
    boundary.start();

    await waitFor(() => boundary?.actor.getSnapshot().connection === "connected", {
      label: "connected",
    });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) >= 1, { label: "subscribe" });

    await broker.publish("plant/p1/telemetry", JSON.stringify({ tempC: 20, at: "t0" }), 1);
    await waitFor(() => seen.length === 1, { label: "message" });
    expect(seen[0]?.topic).toBe("plant/p1/telemetry");
  });
});
