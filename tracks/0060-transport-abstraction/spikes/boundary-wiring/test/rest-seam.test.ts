// The REST leg's seam behaviour: `fetcher` threads AbortSignal, rejects only
// BoundaryError, and never resolves anything it did not decode AND validate.
//
// The declared/undeclared split itself (class 3 vs class 4 vs class 2) lives in
// check-10; what this file pins is the seam contract around it.

import { describe, expect, it } from "vitest";
import { createTransportBoundary } from "../src/index.js";
import {
  isBoundaryError,
  isReasonCode,
  isTransient,
  retryOnlyTransient,
} from "../src/errors/index.js";
import { memoryBrokerAdapter, scriptedFetchAdapter } from "../src/testing.js";
import { policy, rest, validPlantList } from "./fixtures.js";

function harness(routes: Parameters<typeof scriptedFetchAdapter>[0]) {
  return createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memoryBrokerAdapter(), fetch: scriptedFetchAdapter(routes) },
  );
}

describe("REST seam", () => {
  // A declared 200 whose body parses against its generated per-status schema
  // resolves, branded (I1). Nothing that did not parse ever gets here.
  it("resolves a declared 2xx body that parses, as Validated<T>", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList },
    ]);
    await expect(b.fetcher({ url: "/v1/plants", method: "GET" })).resolves.toEqual(validPlantList);
    await b.dispose();
  });

  it("rejects a DECLARED non-2xx body that parses as class 3, carrying the status", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 409, body: { code: "E_CONFLICT" } },
    ]);
    const err = await b.fetcher({ url: "/v1/plants", method: "GET" }).catch((e: unknown) => e);
    expect(isReasonCode(err)).toBe(true);
    expect(err).toMatchObject({ class: 3, status: 409, leg: "rest", body: { code: "E_CONFLICT" } });
    expect(retryOnlyTransient(0, err)).toBe(false);
    await b.dispose();
  });

  // Non-JSON and undecodable bodies: the full matrix, 2xx AND non-2xx, is
  // check-11 (the ts-rest #789 lesson on this leg).

  it("threads AbortSignal into the adapter, so cancellation is real", async () => {
    const b = harness([
      { method: "GET", url: "/v1/slow", status: 200, body: {}, delayMs: 5000 },
    ]);
    const controller = new AbortController();
    const pending = b.fetcher({ url: "/v1/slow", method: "GET" }, { signal: controller.signal });
    controller.abort();
    const err = await pending.catch((e: unknown) => e);
    expect(isTransient(err)).toBe(true);
    expect(err).toMatchObject({ class: 1, reason: "aborted" });
    // Aborts are never retried (design.md, retryOnlyTransient).
    expect(retryOnlyTransient(0, err)).toBe(false);
    await b.dispose();
  });

  it("rejects class-1 'disposed' after dispose (I10)", async () => {
    const b = harness([{ method: "GET", url: "/v1/plants", status: 200, body: {} }]);
    await b.dispose();
    const err = await b.fetcher({ url: "/v1/plants", method: "GET" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ class: 1, reason: "disposed", leg: "rest" });
    expect(isBoundaryError(err)).toBe(true);
  });

  it("retries only class 1, and at most three times", () => {
    const transient = { class: 1, reason: "network", leg: "rest", endpointOrTopic: "/x", timestamp: 0, raw: null };
    const contract = { class: 2, leg: "rest", endpointOrTopic: "/x", timestamp: 0, raw: null, schemaPath: "#", issues: [] };
    expect(retryOnlyTransient(0, transient)).toBe(true);
    expect(retryOnlyTransient(2, transient)).toBe(true);
    expect(retryOnlyTransient(3, transient)).toBe(false);
    expect(retryOnlyTransient(0, contract)).toBe(false);
    expect(retryOnlyTransient(0, new Error("raw"))).toBe(false);
  });
});

describe("lifecycle (I10)", () => {
  it("is idempotent and silences both wires after dispose", async () => {
    const memory = memoryBrokerAdapter();
    const b = createTransportBoundary(
      { mqtt: { url: "ws://memory" }, policy, rest },
      { broker: memory },
    );
    const events: unknown[] = [];
    const snapshots: unknown[] = [];
    b.actor.on("*", (e) => events.push(e));
    b.actor.subscribe((s) => snapshots.push(s));
    b.subscribe("plant/{plantId}/telemetry");
    b.start();
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    await b.dispose();
    await b.dispose();
    expect(b.actor.getSnapshot().connection).toBe("ended");
    expect(b.actor.getSnapshot().publishGated).toBe(true);
    expect(memory.ended).toBe(true);
    // Wire 2 saw the terminal 'ended' snapshot before being released.
    expect((snapshots.at(-1) as { connection: string }).connection).toBe("ended");

    const before = events.length;
    const snapshotsBefore = snapshots.length;
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 1, at: "t" }), { messageId: 1 });
    await new Promise((r) => setTimeout(r, 5));
    // I10: BOTH wires go silent, not just wire 1.
    expect(events).toHaveLength(before);
    expect(snapshots).toHaveLength(snapshotsBefore);

    const err = await b
      .publish("plant/{plantId}/command", { action: "stop" }, { plantId: "p1" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ class: 1, reason: "disposed" });
  });

  it("isolates a throwing wire-1 listener from its siblings (I12)", async () => {
    const memory = memoryBrokerAdapter();
    const inspected: unknown[] = [];
    const b = createTransportBoundary(
      {
        mqtt: { url: "ws://memory" },
        policy,
        rest,
        inspect: (e) => inspected.push(e),
      },
      { broker: memory },
    );
    const sibling: string[] = [];
    b.subscribe("plant/{plantId}/telemetry", () => {
      throw new Error("listener exploded");
    });
    b.subscribe("plant/{plantId}/telemetry", (e) => sibling.push(e.topic));
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 1, at: "t" }), { messageId: 1 });
    await new Promise((r) => setTimeout(r, 5));

    expect(sibling).toEqual(["plant/p1/telemetry"]);
    expect(
      inspected.some((e) => (e as { type?: string }).type === "listener-error"),
    ).toBe(true);
    expect(b.actor.getSnapshot().connection).toBe("connected");
    await b.dispose();
  });

  it("refcounts interest exactly: N subscribes need N releases (O3)", async () => {
    const memory = memoryBrokerAdapter();
    const b = createTransportBoundary(
      { mqtt: { url: "ws://memory" }, policy, rest },
      { broker: memory },
    );
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    const a = b.subscribe("plant/{plantId}/telemetry");
    const c = b.subscribe("plant/{plantId}/telemetry");
    expect(memory.subscriptions).toEqual(["plant/+/telemetry"]);
    expect(memory.subscribeLog).toHaveLength(1);
    expect(b.actor.getSnapshot().subscriptions).toEqual(["plant/+/telemetry"]);

    a();
    a(); // releasing twice must not double-decrement
    expect(memory.subscriptions).toEqual(["plant/+/telemetry"]);
    c();
    expect(memory.subscriptions).toEqual([]);
    expect(b.actor.getSnapshot().subscriptions).toEqual([]);
    await b.dispose();
  });
});
