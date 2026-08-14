// CHECK (report list): "verify the deduped four-class telemetry event shape
// reaches a 0050 stub via BOTH the wildcard `actor.on('*')` discrete-event tap
// (Key question 1) AND the QueryCache `onError` tap."
//
// check-5 covers the wildcard tap on the MQTT leg. This is the REST half: the
// caller-owned QueryCache `onError` tap of design.md's usage sketch —
//
//   queryCache: new QueryCache({ onError: (e, q) => {
//     if (isBoundaryError(e)) telemetrySink.recordQuery(e, q.queryKey);
//   }})
//
// — wired for real in app/query-client.ts, feeding the logging stub in
// app/telemetry-sink.ts.
//
// Where the ENVELOPE comes from: the boundary constructs the BoundaryError, so
// the boundary is the only place that can fold repeats into one `TelemetryEvent`
// (dedupKey/count/firstSeen/lastSeen). The QueryCache tap contributes the one
// fact only the TanStack layer knows — the query key — and the sink pairs the
// two. See findings.md.

import { afterEach, describe, expect, it } from "vitest";
import { SimulatedClock } from "xstate";
import type { QueryClient } from "@tanstack/react-query";
import type { TelemetryEvent } from "../src/errors/index.js";
import type { FetchLike } from "../src/index.js";
import { memoryBrokerAdapter, scriptedFetchAdapter, type ScriptedRoute } from "../src/testing.js";
import { boundary, createAppBoundary, installBoundary } from "../app/transport.js";
import { createAppQueryClient } from "../app/query-client.js";
import { createTelemetrySink, type TelemetrySink } from "../app/telemetry-sink.js";
import { validPlantList } from "./fixtures.js";

let teardown: (() => Promise<void>) | null = null;

interface Rig {
  client: QueryClient;
  sink: TelemetrySink;
  clock: SimulatedClock;
}

function rig(routes: readonly ScriptedRoute[], failFetch = false): Rig {
  const scripted = scriptedFetchAdapter(routes);
  const fetch: FetchLike = failFetch
    ? () => Promise.reject(new TypeError("fetch failed"))
    : scripted;
  const clock = new SimulatedClock();
  const b = createAppBoundary({ broker: memoryBrokerAdapter(), fetch, clock });
  const uninstall = installBoundary(b);
  const sink = createTelemetrySink();
  const client = createAppQueryClient(sink, b);
  teardown = async () => {
    client.clear();
    await uninstall();
  };
  return { client, sink, clock };
}

const query = (client: QueryClient, key: string, url: string): Promise<unknown> =>
  client
    .fetchQuery({
      queryKey: [key, url],
      queryFn: ({ signal }) => boundary().fetcher({ url, method: "GET" }, { signal }),
    })
    .catch((e: unknown) => e);

function isTelemetryEvent(e: unknown): e is TelemetryEvent {
  if (typeof e !== "object" || e === null) return false;
  const ev = e as Record<string, unknown>;
  return (
    typeof ev["dedupKey"] === "string" &&
    typeof ev["count"] === "number" &&
    (ev["count"] as number) >= 1 &&
    typeof ev["firstSeen"] === "number" &&
    typeof ev["lastSeen"] === "number" &&
    typeof ev["error"] === "object"
  );
}

afterEach(async () => {
  await teardown?.();
  teardown = null;
});

describe("telemetry via the QueryCache onError tap", () => {
  it("delivers all FOUR classes to the logging stub, each with its query key", async () => {
    // Anchored patterns: `/v1/plants` is a prefix of the others.
    const { client, sink } = rig([
      // class 2 — declared 200, body fails the schema
      { method: "GET", url: /\/v1\/plants$/, status: 200, body: { plants: "nope" } },
      // class 3 — declared 409 that parses
      { method: "GET", url: /\/v1\/plants\/p1$/, status: 409, body: { code: "E_CONFLICT" } },
      // class 4 — undeclared status
      { method: "GET", url: /\/v1\/plants\/p2$/, status: 418, body: { code: "E_TEAPOT" } },
      // class 1 needs a transport failure — see the second rig below
    ]);
    await query(client, "c2", "/v1/plants");
    await query(client, "c3", "/v1/plants/p1");
    await query(client, "c4", "/v1/plants/p2");

    const seen = sink.queryErrors;
    expect(seen.map((r) => r.error.class)).toEqual([2, 3, 4]);
    expect(seen.map((r) => r.queryKey[0])).toEqual(["c2", "c3", "c4"]);

    // Class 1 needs a transport failure, so it gets its own rig (rig() installs
    // the replacement teardown).
    await teardown?.();
    const transient = rig([], true);
    await query(transient.client, "c1", "/v1/plants");
    expect(transient.sink.queryErrors.map((r) => r.error.class)).toEqual([1]);
    // retryOnlyTransient retried it, and every attempt folded into ONE envelope.
    expect(transient.sink.envelopes.filter((e) => e.error.class === 1)).toHaveLength(1);
  });

  it("carries the design's TelemetryEvent envelope, not a bare error", async () => {
    const { client, sink } = rig([
      { method: "GET", url: "/v1/plants", status: 409, body: { code: "E_CONFLICT" } },
    ]);
    await query(client, "envelope", "/v1/plants");

    const record = sink.queryErrors[0];
    expect(record?.queryKey).toEqual(["envelope", "/v1/plants"]);
    expect(isTelemetryEvent(record?.envelope)).toBe(true);
    const envelope = record?.envelope as TelemetryEvent;
    // The envelope's error IS the error the QueryCache tap saw — one object,
    // two taps, no re-wrapping.
    expect(envelope.error).toBe(record?.error);
    expect(envelope.dedupKey).toBe("GET /v1/plants|c3:E_CONFLICT");
    expect(envelope.count).toBe(1);
    expect(envelope.lastSeen).toBeGreaterThanOrEqual(envelope.firstSeen);
    expect(Object.keys(envelope).sort()).toEqual([
      "count",
      "dedupKey",
      "error",
      "firstSeen",
      "lastSeen",
    ]);
  });

  it("dedupes repeats inside the window and closes with a folded count", async () => {
    const { client, sink, clock } = rig([
      { method: "GET", url: "/v1/plants", status: 409, body: { code: "E_CONFLICT" } },
    ]);
    for (let i = 0; i < 4; i++) await query(client, `dedupe-${i}`, "/v1/plants");

    // Four query failures, four QueryCache taps …
    expect(sink.queryErrors).toHaveLength(4);
    // … but ONE leading-edge envelope on the deduped wire.
    expect(sink.envelopes).toHaveLength(1);
    expect(sink.envelopes[0]?.count).toBe(1);

    clock.increment(60_000); // the default dedupe window closes
    expect(sink.envelopes).toHaveLength(2);
    expect(sink.envelopes[1]).toMatchObject({
      dedupKey: "GET /v1/plants|c3:E_CONFLICT",
      count: 4,
    });
  });

  it("emits nothing on a successful query", async () => {
    const { client, sink } = rig([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList },
    ]);
    await expect(query(client, "ok", "/v1/plants")).resolves.toEqual(validPlantList);
    expect(sink.queryErrors).toHaveLength(0);
    expect(sink.envelopes).toHaveLength(0);
  });

  it("feeds the SAME sink from the MQTT wildcard tap — one shape, two taps", async () => {
    const broker = memoryBrokerAdapter();
    const b = createAppBoundary({
      broker,
      fetch: scriptedFetchAdapter([
        { method: "GET", url: "/v1/plants", status: 418, body: { code: "E_TEAPOT" } },
      ]),
    });
    const uninstall = installBoundary(b);
    const sink = createTelemetrySink();
    const client = createAppQueryClient(sink, b);
    teardown = async () => {
      client.clear();
      await uninstall();
    };
    b.start();
    await Promise.resolve();
    await Promise.resolve();

    // MQTT side: an unknown topic is class 4 + quarantine + telemetry.
    broker.deliver("nowhere/at/all", JSON.stringify({ x: 1 }), { messageId: 1 });
    // REST side: an undeclared status is class 4 too, through the other tap.
    await query(client, "rest-c4", "/v1/plants");

    const legs = sink.envelopes.map((e) => e.error.leg);
    expect(legs).toContain("mqtt");
    expect(legs).toContain("rest");
    expect(sink.envelopes.every(isTelemetryEvent)).toBe(true);
    // Only the REST one carries a query key: that is the tap's contribution.
    expect(sink.queryErrors.map((r) => r.error.leg)).toEqual(["rest"]);
  });
});
