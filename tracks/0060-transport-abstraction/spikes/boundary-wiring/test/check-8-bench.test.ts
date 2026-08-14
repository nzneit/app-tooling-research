// Check 8 — per-message interpretation + dispatch overhead.
//
// Deviation (recorded in findings.md): measured in Node, not a browser. The
// loop runs the REAL pipeline through the memory adapter — redelivery dedup,
// mqtt-pattern policy match, strict UTF-8 + JSON decode, the compiled ajv@8
// validator, bounded enqueue, microtask dispatch to a wire-1 listener — so the
// only thing the memory adapter removes is the socket and the MQTT codec.

import { describe, expect, it } from "vitest";
import { createTransportBoundary } from "../src/index.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

interface BenchResult {
  n: number;
  ms: number;
  perMessageUs: number;
  msgsPerSec: number;
}

async function bench(n: number, opts: { reasonCode: boolean }): Promise<BenchResult> {
  const memory = memoryBrokerAdapter();
  const b = createTransportBoundary(
    {
      mqtt: { url: "ws://memory", bounds: { delivery: n + 1000, quarantine: 10 } },
      policy,
      rest,
    },
    { broker: memory },
  );

  let sum = 0;
  b.subscribe("plant/{plantId}/telemetry", (e) => {
    sum += e.payload.tempC;
  });
  if (opts.reasonCode) b.subscribe("plant/{plantId}/status");
  b.start();
  await Promise.resolve();
  await Promise.resolve();

  const topic = opts.reasonCode ? "plant/p1/status" : "plant/p1/telemetry";
  const bytes = new TextEncoder().encode(
    opts.reasonCode
      ? JSON.stringify({ ok: false, code: "E_WARN" })
      : JSON.stringify({ tempC: 21.5, at: "2026-08-14T00:00:00Z" }),
  );

  // Warm-up: let the JIT settle so the measurement is steady-state.
  for (let i = 0; i < 2000; i++) memory.deliver(topic, bytes, { messageId: i + 1, qos: 1 });
  await drained(() => b.actor.getSnapshot().depths.delivery);

  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    memory.deliver(topic, bytes, { messageId: 100_000 + i, qos: 1 });
  }
  await drained(() => b.actor.getSnapshot().depths.delivery);
  const ms = performance.now() - t0;

  if (!opts.reasonCode) expect(sum).toBeGreaterThan(0);
  expect(b.quarantine.entries()).toHaveLength(0);
  await b.dispose();

  return { n, ms, perMessageUs: (ms * 1000) / n, msgsPerSec: n / (ms / 1000) };
}

async function drained(depth: () => number): Promise<void> {
  for (let i = 0; i < 1000 && depth() > 0; i++) await Promise.resolve();
  if (depth() > 0) throw new Error(`pump did not drain (depth ${depth()})`);
}

describe("check 8 — per-message overhead (Node)", () => {
  it("interprets and dispatches well above 1k msg/s", async () => {
    const N = 50_000;
    const plain = await bench(N, { reasonCode: false });
    const reason = await bench(N, { reasonCode: true });

    // eslint-disable-next-line no-console
    console.log(
      `[check 8] plain channel:  ${plain.n} msgs in ${plain.ms.toFixed(1)}ms = ` +
        `${Math.round(plain.msgsPerSec).toLocaleString("en-US")} msgs/sec, ` +
        `${plain.perMessageUs.toFixed(2)} us/msg`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[check 8] reasonCode channel: ${reason.n} msgs in ${reason.ms.toFixed(1)}ms = ` +
        `${Math.round(reason.msgsPerSec).toLocaleString("en-US")} msgs/sec, ` +
        `${reason.perMessageUs.toFixed(2)} us/msg`,
    );

    // A-4 assumes <= 1k msg/s. The margin is what the check is for.
    expect(plain.msgsPerSec).toBeGreaterThan(1000);
    expect(reason.msgsPerSec).toBeGreaterThan(1000);
    expect(plain.perMessageUs).toBeLessThan(1000);
  }, 60_000);

  it("stays above 1k msg/s with a wire-2 subscriber attached", async () => {
    const memory = memoryBrokerAdapter();
    const b = createTransportBoundary(
      {
        mqtt: { url: "ws://memory", bounds: { delivery: 30_000 } },
        policy,
        rest,
      },
      { broker: memory },
    );
    let notifications = 0;
    b.actor.subscribe(() => {
      notifications++;
    });
    let seen = 0;
    b.subscribe("plant/{plantId}/telemetry", () => {
      seen++;
    });
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    const N = 20_000;
    const bytes = new TextEncoder().encode(JSON.stringify({ tempC: 1, at: "t" }));
    for (let i = 0; i < 2000; i++) memory.deliver("plant/p1/telemetry", bytes, { messageId: i + 1, qos: 1 });
    await drained(() => b.actor.getSnapshot().depths.delivery);
    seen = 0;
    notifications = 0;

    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      memory.deliver("plant/p1/telemetry", bytes, { messageId: 100_000 + i, qos: 1 });
    }
    await drained(() => b.actor.getSnapshot().depths.delivery);
    const ms = performance.now() - t0;
    const msgsPerSec = N / (ms / 1000);

    // eslint-disable-next-line no-console
    console.log(
      `[check 8] with wire-2 subscriber: ${N} msgs in ${ms.toFixed(1)}ms = ` +
        `${Math.round(msgsPerSec).toLocaleString("en-US")} msgs/sec, ` +
        `${((ms * 1000) / N).toFixed(2)} us/msg, ${notifications} snapshot notifications`,
    );

    expect(seen).toBe(N);
    expect(msgsPerSec).toBeGreaterThan(1000);
    await b.dispose();
  }, 60_000);
});
