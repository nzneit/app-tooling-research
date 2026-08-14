// Check 3 — non-blocking pump (the mqtt.js #1935 scenario).
// A deliberately slow validator plus a deliberately slow listener; the bounded
// delivery queue caps, overflow is counted + quarantined as class-1
// 'queue-overflow', and the client stays connected throughout (O1, I9).

import { afterEach, describe, expect, it } from "vitest";
import { SimulatedClock } from "xstate";
import {
  createTransportBoundary,
  type ChannelPolicy,
  type CompiledValidator,
  type TransportBoundary,
} from "../src/index.js";
import type { TelemetryEvent } from "../src/errors/index.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { validateTelemetry, rest, type PlantTelemetry } from "./fixtures.js";
import { startBroker, waitFor, type TestBroker } from "./aedes-broker.js";

let broker: TestBroker | null = null;
let boundary: TransportBoundary<never> | null = null;

afterEach(async () => {
  await boundary?.dispose();
  boundary = null;
  await broker?.close();
  broker = null;
});

function burnMicros(us: number): void {
  const end = performance.now() + us / 1000;
  while (performance.now() < end) {
    /* deliberately blocking */
  }
}

/** The real compiled Ajv validator, with a synchronous cost bolted on. */
function slowValidator(us: number): CompiledValidator<PlantTelemetry> {
  const fn = ((data: unknown): data is PlantTelemetry => {
    burnMicros(us);
    const ok = validateTelemetry(data);
    (fn as { errors?: readonly unknown[] | null }).errors = validateTelemetry.errors;
    return ok;
  }) as CompiledValidator<PlantTelemetry>;
  return fn;
}

describe("check 3 — bounded pump under flood (memory adapter, deterministic)", () => {
  it("caps the delivery queue, quarantines overflow, and dispatches nothing on the pump", async () => {
    const memory = memoryBrokerAdapter();
    const clock = new SimulatedClock();
    const slowPolicy = {
      "plant/{plantId}/telemetry": {
        validate: slowValidator(30),
        qos: 1,
      } satisfies ChannelPolicy<PlantTelemetry>,
    };
    const b = createTransportBoundary(
      {
        mqtt: {
          url: "ws://memory",
          bounds: { delivery: 16, quarantine: 1000 },
        },
        policy: slowPolicy,
        rest,
        telemetry: { dedupeWindowMs: 1000 },
      },
      { broker: memory, clock },
    );

    let delivered = 0;
    b.subscribe("plant/{plantId}/telemetry", () => {
      delivered++;
      burnMicros(50);
    });
    const telemetry: TelemetryEvent[] = [];
    b.actor.on("*", (ev) => {
      if (ev.type === "telemetry") telemetry.push(ev.event);
    });
    b.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.actor.getSnapshot().connection).toBe("connected");

    const N = 200;
    const bytes = new TextEncoder().encode(JSON.stringify({ tempC: 1, at: "t" }));
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      memory.deliver("plant/p1/telemetry", bytes, { messageId: i + 1, qos: 1 });
    }
    const pumpMs = performance.now() - t0;

    // The pump never dispatched: every listener call is off the packet pump.
    expect(delivered).toBe(0);
    const mid = b.actor.getSnapshot();
    expect(mid.depths.delivery).toBe(16);
    expect(mid.connection).toBe("connected");
    expect(memory.connected).toBe(true);

    await new Promise((r) => setTimeout(r, 100));

    const after = b.actor.getSnapshot();
    expect(delivered).toBe(16);
    expect(after.depths.delivery).toBe(0);
    expect(after.connection).toBe("connected");

    const overflow = b.quarantine
      .entries()
      .filter((e) => e.error.class === 1 && e.error.reason === "queue-overflow");
    expect(overflow).toHaveLength(N - 16);
    // Nothing is silently lost: delivered + shed accounts for every packet.
    expect(delivered + overflow.length).toBe(N);

    // Deduped telemetry: one leading-edge emission for the whole burst...
    const overflowEvents = telemetry.filter(
      (t) => t.error.class === 1 && t.error.reason === "queue-overflow",
    );
    expect(overflowEvents).toHaveLength(1);
    expect(overflowEvents[0]?.count).toBe(1);
    // ...and one folded summary when the window closes (O5).
    clock.increment(1000);
    await Promise.resolve();
    const folded = telemetry.filter(
      (t) => t.error.class === 1 && t.error.reason === "queue-overflow",
    );
    expect(folded).toHaveLength(2);
    expect(folded[1]?.count).toBe(N - 16);

    // eslint-disable-next-line no-console
    console.log(
      `[check 3] ${N} packets through a 30us validator: pump ${pumpMs.toFixed(1)}ms ` +
        `(${((pumpMs * 1000) / N).toFixed(1)}us/packet), delivered ${delivered}, shed ${overflow.length}`,
    );
    await b.dispose();
  });
});

describe("check 3 — flood over the real broker", () => {
  it("keeps the mqtt.js client connected while a slow consumer sheds", async () => {
    broker = await startBroker();
    const slowPolicy = {
      "plant/{plantId}/telemetry": {
        validate: slowValidator(20),
        qos: 1,
      } satisfies ChannelPolicy<PlantTelemetry>,
    };
    const b = createTransportBoundary({
      mqtt: {
        url: broker.url,
        bounds: { delivery: 8, quarantine: 2000 },
        reconnect: { periodMs: 200, maxAttempts: 40, backoffMs: () => 2000 },
      },
      policy: slowPolicy,
      rest,
    });
    boundary = b as unknown as TransportBoundary<never>;

    let delivered = 0;
    let peakDepth = 0;
    const states = new Set<string>();
    b.actor.subscribe((s) => {
      states.add(s.connection);
      if (s.depths.delivery > peakDepth) peakDepth = s.depths.delivery;
    });
    b.subscribe("plant/{plantId}/telemetry", () => {
      delivered++;
      burnMicros(300);
    });
    b.start();
    await waitFor(() => b.actor.getSnapshot().connection === "connected", { label: "connect" });
    await waitFor(() => (broker?.subscribeLog.length ?? 0) >= 1, { label: "subscribe" });

    const N = 300;
    const body = JSON.stringify({ tempC: 5, at: "flood" });
    // Fire the whole burst without awaiting each ack, so packets coalesce into
    // single TCP reads and several land inside one turn of the packet pump.
    await Promise.all(
      Array.from({ length: N }, () => broker?.publish("plant/p1/telemetry", body, 1)),
    );

    const shedCount = () =>
      b.quarantine.entries().filter((e) => e.error.class === 1 && e.error.reason === "queue-overflow")
        .length;
    await waitFor(() => delivered + shedCount() >= N, {
      timeoutMs: 20_000,
      label: "all packets accounted for",
    });

    expect(delivered + shedCount()).toBe(N);
    // The queue absorbed real bursts rather than dispatching on the pump.
    expect(peakDepth).toBeGreaterThan(1);
    expect(b.actor.getSnapshot().connection).toBe("connected");
    expect(states.has("reconnecting")).toBe(false);
    expect(states.has("degraded")).toBe(false);

    // eslint-disable-next-line no-console
    console.log(
      `[check 3/real] ${N} broker packets: delivered ${delivered}, shed ${shedCount()}, ` +
        `peak delivery depth ${peakDepth}/8, connection ${b.actor.getSnapshot().connection}`,
    );
  }, 40_000);
});
