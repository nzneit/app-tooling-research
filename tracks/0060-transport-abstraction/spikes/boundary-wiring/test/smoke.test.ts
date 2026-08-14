import { describe, expect, it } from "vitest";
import { createTransportBoundary } from "../src/index.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

describe("harness smoke", () => {
  it("delivers a validated message across the memory broker", async () => {
    const broker = memoryBrokerAdapter();
    const b = createTransportBoundary(
      { mqtt: { url: "ws://memory" }, policy, rest },
      { broker },
    );
    const seen: unknown[] = [];
    b.subscribe("plant/{plantId}/telemetry", (e) => seen.push(e));
    b.start();
    await new Promise((r) => setTimeout(r, 5));
    expect(b.actor.getSnapshot().connection).toBe("connected");
    expect(broker.subscriptions).toEqual(["plant/+/telemetry"]);

    broker.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 21, at: "now" }));
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toHaveLength(1);
    await b.dispose();
  });
});
