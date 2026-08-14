// The REST leg's seam surface only — enough for Task 6 to attach orval's
// mutator, the per-status zod schemas and the QueryCache telemetry tap to.
// Per-status zod validation and the declared-status table are Task 6's work;
// what is asserted here is that `fetcher` threads AbortSignal, rejects only
// BoundaryError, and never resolves anything it did not decode.

import { describe, expect, it } from "vitest";
import { createTransportBoundary } from "../src/index.js";
import {
  isBoundaryError,
  isReasonCode,
  isTransient,
  isUnroutable,
  retryOnlyTransient,
} from "../src/errors/index.js";
import { memoryBrokerAdapter, scriptedFetchAdapter } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

function harness(routes: Parameters<typeof scriptedFetchAdapter>[0]) {
  return createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memoryBrokerAdapter(), fetch: scriptedFetchAdapter(routes) },
  );
}

describe("REST seam (surface for Task 6)", () => {
  it("resolves a validated 2xx JSON body", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 200, body: { plants: ["p1"] } },
    ]);
    await expect(b.fetcher({ url: "/v1/plants", method: "GET" })).resolves.toEqual({
      plants: ["p1"],
    });
    await b.dispose();
  });

  it("rejects a declared non-2xx JSON body as class 3, carrying the status", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 409, body: { code: "E_CONFLICT" } },
    ]);
    const err = await b.fetcher({ url: "/v1/plants", method: "GET" }).catch((e: unknown) => e);
    expect(isReasonCode(err)).toBe(true);
    expect(err).toMatchObject({ class: 3, status: 409, leg: "rest", body: { code: "E_CONFLICT" } });
    expect(retryOnlyTransient(0, err)).toBe(false);
    await b.dispose();
  });

  it("rejects an unknown content type as class 4, never a silent skip (I11)", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 200, body: "<html/>", contentType: "text/html" },
    ]);
    const err = await b.fetcher({ url: "/v1/plants", method: "GET" }).catch((e: unknown) => e);
    expect(isUnroutable(err)).toBe(true);
    expect(err).toMatchObject({ class: 4, cause: "unknown-content-type", leg: "rest" });
    expect(b.quarantine.entries()).toHaveLength(1);
    await b.dispose();
  });

  it("rejects an undecodable JSON body as class 4", async () => {
    const b = harness([
      { method: "GET", url: "/v1/plants", status: 200, body: "{oops", contentType: "application/json" },
    ]);
    const err = await b.fetcher({ url: "/v1/plants", method: "GET" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ class: 4, cause: "undecodable", leg: "rest" });
    await b.dispose();
  });

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
    b.actor.on("*", (e) => events.push(e));
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

    const before = events.length;
    memory.deliver("plant/p1/telemetry", JSON.stringify({ tempC: 1, at: "t" }), { messageId: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(events).toHaveLength(before);

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
