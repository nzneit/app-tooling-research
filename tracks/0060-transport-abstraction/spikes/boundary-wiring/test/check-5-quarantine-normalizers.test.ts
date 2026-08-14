// Check 5 — bounded quarantine ring + normalizers over REAL Ajv error objects,
// with deduped four-class telemetry observed through the wildcard `.on('*')`
// tap (design.md I9/I13, O5, and the "not exported" locality rule).

import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { SimulatedClock } from "xstate";
import * as boundaryEntry from "../src/index.js";
import * as errorsEntry from "../src/errors/index.js";
import * as testingEntry from "../src/testing.js";
import { createTransportBoundary } from "../src/index.js";
import { isContractViolation, type TelemetryEvent } from "../src/errors/index.js";
// The internal seam of the errors module: reachable from the package's own
// tests, unreachable from any consumer (asserted below).
import { fromAjvErrors, fromZodError, dedupKeyOf } from "../src/errors/normalize.js";
import { memoryBrokerAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("check 5 — normalizers over real Ajv error objects", () => {
  it("normalizes a real ajv@8 error array into the one issue shape", () => {
    const ajv = new Ajv.default({ allErrors: true, strict: false });
    const validate = ajv.compile({
      $id: "reading",
      type: "object",
      required: ["tempC", "at"],
      additionalProperties: false,
      properties: { tempC: { type: "number" }, at: { type: "string" } },
    });

    const ok = validate({ tempC: "hot", extra: 1 });
    expect(ok).toBe(false);
    // These are genuine Ajv ErrorObjects, not hand-written stand-ins.
    const raw = validate.errors ?? [];
    expect(raw.length).toBeGreaterThanOrEqual(3);
    expect(raw[0]).toHaveProperty("keyword");
    expect(raw[0]).toHaveProperty("schemaPath");

    const violation = fromAjvErrors(raw, {
      leg: "mqtt",
      endpointOrTopic: "plant/p1/telemetry",
      timestamp: 1234,
      raw,
    });

    expect(violation.class).toBe(2);
    expect(violation.schemaPath).toBe(raw[0]?.schemaPath);
    expect(violation.issues.length).toBe(raw.length);
    for (const issue of violation.issues) {
      expect(typeof issue.path).toBe("string");
      expect(issue.path.startsWith("/")).toBe(true);
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }
    // The missing-property error has an empty instancePath in Ajv; the
    // normalizer must not emit "" as a path.
    expect(violation.issues.some((i) => i.path === "/")).toBe(true);
    expect(violation.issues.some((i) => i.path === "/tempC")).toBe(true);
  });

  it("produces the identical issue shape from a Zod-shaped error", () => {
    const ctx = { leg: "rest" as const, endpointOrTopic: "/v1/plants", timestamp: 7, raw: null };
    const zodish = {
      issues: [
        { path: ["data", 0, "tempC"], message: "Expected number, received string", code: "invalid_type" },
        { path: [], message: "Unrecognized key", code: "unrecognized_keys" },
      ],
    };
    const violation = fromZodError(zodish, ctx);
    expect(violation.class).toBe(2);
    expect(violation.issues).toEqual([
      { path: "/data/0/tempC", message: "Expected number, received string" },
      { path: "/", message: "Unrecognized key" },
    ]);
    expect(violation.schemaPath).toBe("#/data/0/tempC");
  });

  it("keys telemetry dedupe on endpointOrTopic + schemaPath (0010's rule)", () => {
    const base = { leg: "mqtt" as const, endpointOrTopic: "plant/p1/telemetry", timestamp: 0, raw: null };
    const a = fromAjvErrors([{ schemaPath: "#/properties/tempC/type", instancePath: "/tempC", message: "x" }], base);
    const b = fromAjvErrors([{ schemaPath: "#/properties/tempC/type", instancePath: "/tempC", message: "y" }], base);
    const c = fromAjvErrors([{ schemaPath: "#/required", instancePath: "", message: "z" }], base);
    expect(dedupKeyOf(a)).toBe(dedupKeyOf(b));
    expect(dedupKeyOf(a)).not.toBe(dedupKeyOf(c));
    expect(dedupKeyOf(a)).toBe("plant/p1/telemetry|#/properties/tempC/type");
  });

  it("keeps the normalizers off every public entry point", () => {
    for (const entry of [boundaryEntry, errorsEntry, testingEntry]) {
      const names = Object.keys(entry);
      expect(names).not.toContain("fromAjvErrors");
      expect(names).not.toContain("fromZodError");
      expect(names).not.toContain("transportError");
      expect(names).not.toContain("unroutableError");
      expect(names).not.toContain("reasonCodeError");
    }
    // The taxonomy itself is still fully consumable: guards + retry predicate.
    expect(Object.keys(errorsEntry).sort()).toEqual([
      "isBoundaryError",
      "isContractViolation",
      "isReasonCode",
      "isTransient",
      "isUnroutable",
      "retryOnlyTransient",
    ]);
  });
});

describe("check 5 — quarantine ring + deduped telemetry through the interface", () => {
  async function harness(bounds?: { quarantine?: number }, dedupeWindowMs = 1000) {
    const memory = memoryBrokerAdapter();
    const clock = new SimulatedClock();
    const b = createTransportBoundary(
      {
        mqtt: { url: "ws://memory", bounds },
        policy,
        rest,
        telemetry: { dedupeWindowMs },
      },
      { broker: memory, clock },
    );
    const telemetry: TelemetryEvent[] = [];
    b.actor.on("*", (ev) => {
      if (ev.type === "telemetry") telemetry.push(ev.event);
    });
    b.subscribe("plant/{plantId}/telemetry");
    b.start();
    await Promise.resolve();
    await Promise.resolve();
    return { b, memory, clock, telemetry };
  }

  it("evicts the oldest entry at capacity", async () => {
    const { b, memory } = await harness({ quarantine: 3 });
    for (let i = 1; i <= 5; i++) {
      memory.deliver(`plant/p${i}/telemetry`, JSON.stringify({ tempC: "bad" }), { messageId: i });
    }
    await tick();

    const entries = b.quarantine.entries();
    expect(b.quarantine.capacity).toBe(3);
    expect(entries).toHaveLength(3);
    // Oldest first, oldest two evicted.
    expect(entries.map((e) => e.endpointOrTopic)).toEqual([
      "plant/p3/telemetry",
      "plant/p4/telemetry",
      "plant/p5/telemetry",
    ]);
    expect(b.actor.getSnapshot().depths.quarantine).toBe(3);
    await b.dispose();
  });

  it("carries the real Ajv error array as the class-2 evidence, through the public interface", async () => {
    const { b, memory, telemetry } = await harness();
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: "hot" }), { messageId: 1 });
    await tick();

    const entry = b.quarantine.entries()[0];
    expect(entry).toBeDefined();
    const err = entry?.error;
    expect(isContractViolation(err, "plant/p1/telemetry")).toBe(true);
    expect(err).toMatchObject({ class: 2, leg: "mqtt" });
    // `raw` is the untouched Ajv output — inspectable, never rethrown.
    const ajvErrors = (err as { raw: unknown[] }).raw;
    expect(Array.isArray(ajvErrors)).toBe(true);
    expect(ajvErrors[0]).toHaveProperty("keyword");
    expect(ajvErrors[0]).toHaveProperty("instancePath");
    // ...and the normalized issue list is derived from exactly those objects.
    const issues = (err as unknown as { issues: { path: string; message: string }[] }).issues;
    expect(issues.length).toBe(ajvErrors.length);
    expect(telemetry[0]?.error).toBe(err);
    await b.dispose();
  });

  it("folds repeats by dedupKey inside the window and emits one summary at close", async () => {
    const { b, memory, clock, telemetry } = await harness(undefined, 1000);
    for (let i = 1; i <= 5; i++) {
      memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: "hot" }), { messageId: i });
    }
    await tick();

    // Five rejects: five quarantine entries, ONE telemetry emission.
    expect(b.quarantine.entries()).toHaveLength(5);
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]?.count).toBe(1);
    expect(telemetry[0]?.dedupKey).toContain("plant/p1/telemetry");

    clock.increment(1000);
    await Promise.resolve();
    expect(telemetry).toHaveLength(2);
    expect(telemetry[1]?.count).toBe(5);
    expect(telemetry[1]?.dedupKey).toBe(telemetry[0]?.dedupKey);
    expect(telemetry[1]?.lastSeen).toBeGreaterThanOrEqual(telemetry[1]?.firstSeen ?? 0);
    await b.dispose();
  });

  it("surfaces all four classes on the one wildcard tap", async () => {
    const { b, memory, clock, telemetry } = await harness();
    // class 4 — unknown topic
    memory.deliver("nope/x", "{}", { messageId: 1 });
    // class 2 — contract violation
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: "hot" }), { messageId: 2 });
    // class 3 — reason code on a contracted status channel
    b.subscribe("plant/{plantId}/status");
    memory.deliver("plant/p1/status", JSON.stringify({ ok: false, code: "E1" }), { messageId: 3 });
    await tick();
    // class 1 — give-up into degraded
    memory.refuseReconnects();
    memory.dropConnection();
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 11; i++) {
      clock.increment(60_000);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(b.actor.getSnapshot().connection).toBe("degraded");

    const classes = new Set(telemetry.map((t) => t.error.class));
    expect([...classes].sort()).toEqual([1, 2, 3, 4]);
    for (const t of telemetry) {
      expect(t.dedupKey.length).toBeGreaterThan(0);
      expect(t.count).toBeGreaterThanOrEqual(1);
    }
    await b.dispose();
  });
});
