// CHECK (report list): the REST leg's declared/undeclared split, the
// taxonomy-aware retry predicate, and the global `Register` error type.
//
//   "confirm the taxonomy-aware retry predicate (retry class 1 only) and the
//    global `Register` error type compile and narrow at call sites"
//
// design.md, Error modes — `fetcher` rejects only BoundaryError:
//   class 2  any body, 2xx included, FAILING its declared schema
//   class 3  a DECLARED non-2xx body that PARSES against its per-status schema
//   class 4  UNDECLARED status (and unknown content type — see check-11)
//
// The schemas are orval's generated per-status zod output; the declared-status
// table is app/contract.ts. Nothing here is hand-written except the bodies.

import { afterEach, describe, expect, it } from "vitest";
import type { QueryCache, QueryClient } from "@tanstack/react-query";
import type { BoundaryError, TransportError } from "../src/errors/index.js";
import {
  isContractViolation,
  isReasonCode,
  isTransient,
  isUnroutable,
} from "../src/errors/index.js";
import type { FetchLike } from "../src/index.js";
import {
  memoryBrokerAdapter,
  scriptedFetchAdapter,
  type ScriptedRoute,
} from "../src/testing.js";
import { boundary, createAppBoundary, installBoundary } from "../app/transport.js";
import { createAppQueryClient } from "../app/query-client.js";
import { createTelemetrySink, type TelemetrySink } from "../app/telemetry-sink.js";

let teardown: (() => Promise<void>) | null = null;

function rig(fetch: FetchLike): { client: QueryClient; sink: TelemetrySink } {
  const b = createAppBoundary({ broker: memoryBrokerAdapter(), fetch });
  const uninstall = installBoundary(b);
  const sink = createTelemetrySink();
  const client = createAppQueryClient(sink, b);
  teardown = async () => {
    client.clear();
    await uninstall();
  };
  return { client, sink };
}

function scripted(routes: readonly ScriptedRoute[]): { client: QueryClient; sink: TelemetrySink } {
  return rig(scriptedFetchAdapter(routes));
}

const get = (url: string): Promise<unknown> =>
  boundary()
    .fetcher({ url, method: "GET" })
    .catch((e: unknown) => e);

afterEach(async () => {
  await teardown?.();
  teardown = null;
});

describe("declared vs undeclared (the class-3 / class-4 split)", () => {
  it("class 3: a DECLARED 409 whose body parses against the 409 schema", async () => {
    scripted([
      {
        method: "GET",
        url: "/v1/plants",
        status: 409,
        body: { code: "E_CONFLICT", detail: "already running" },
      },
    ]);
    const err = await get("/v1/plants");
    expect(isReasonCode(err)).toBe(true);
    expect(err).toMatchObject({
      class: 3,
      status: 409,
      leg: "rest",
      endpointOrTopic: "GET /v1/plants",
      body: { code: "E_CONFLICT", detail: "already running" },
    });
    // A contracted reason code is a valid body, not a rejected payload: it is
    // telemetry-only, exactly like class 3 on the MQTT leg (I2/I3).
    expect(boundary().quarantine.entries()).toHaveLength(0);
  });

  it("class 3: the 422 body validates against the 422 schema, not the 409 one", async () => {
    scripted([
      {
        method: "GET",
        url: "/v1/plants",
        status: 422,
        body: { code: "E_INVALID", fields: ["limit"] },
      },
    ]);
    const err = await get("/v1/plants");
    expect(isReasonCode(err, "GET /v1/plants", 422)).toBe(true);
    expect(err).toMatchObject({ class: 3, status: 422, body: { fields: ["limit"] } });
    // What the per-status lookup buys, stated accurately: the 422 body reaches
    // the caller WITH `fields`. The same body under the 409 schema would NOT be
    // a contract violation — orval's generated zod objects strip unknown keys,
    // so it would parse as class 3 with `fields` silently removed. Per-status
    // schemas are therefore what preserves the body, not what rejects the
    // mismatch. See findings.md, "orval's generated zod schemas STRIP unknown
    // response fields".
  });

  it("class 2: a DECLARED status whose body FAILS its per-status schema", async () => {
    scripted([
      { method: "GET", url: "/v1/plants", status: 409, body: { detail: "no code here" } },
    ]);
    const err = await get("/v1/plants");
    expect(isContractViolation(err, "GET /v1/plants")).toBe(true);
    expect(err).toMatchObject({ class: 2, leg: "rest" });
    // Real zod issues, normalised into the one issue shape shared with Ajv.
    const violation = err as { schemaPath: string; issues: { path: string; message: string }[] };
    expect(violation.schemaPath).toBe("#/code");
    expect(violation.issues[0]?.path).toBe("/code");
    expect(violation.issues[0]?.message.length).toBeGreaterThan(0);
    expect(boundary().quarantine.entries()).toHaveLength(1);
  });

  it("class 2: a 2xx body failing its schema is a contract violation, never a resolution", async () => {
    scripted([
      { method: "GET", url: "/v1/plants", status: 200, body: { plants: "not-an-array" } },
    ]);
    const err = await get("/v1/plants");
    expect(isContractViolation(err)).toBe(true);
    expect(boundary().quarantine.entries()).toHaveLength(1);
  });

  it("class 4 undeclared-status: a status the contract never declared (418)", async () => {
    scripted([
      { method: "GET", url: "/v1/plants", status: 418, body: { code: "E_TEAPOT" } },
    ]);
    const err = await get("/v1/plants");
    expect(isUnroutable(err)).toBe(true);
    expect(err).toMatchObject({
      class: 4,
      cause: "undeclared-status",
      leg: "rest",
      endpointOrTopic: "GET /v1/plants",
    });
    // The evidence says what WAS declared, so the diagnosis is one read.
    expect((err as { raw: { status: number; declared: number[] } }).raw).toEqual({
      status: 418,
      declared: [200, 409, 422],
    });
    expect(boundary().quarantine.entries()).toHaveLength(1);
  });

  it("class 4 undeclared-status: an UNDECLARED path, even on a 200", async () => {
    scripted([{ method: "GET", url: "/v1/unknown", status: 200, body: { anything: true } }]);
    const err = await get("/v1/unknown");
    expect(err).toMatchObject({
      class: 4,
      cause: "undeclared-status",
      endpointOrTopic: "GET /v1/unknown",
    });
    // I1: with no declared schema nothing can be validated, so nothing crosses —
    // a 2xx is not a loophole.
    expect((err as { raw: { declared: number[] } }).raw.declared).toEqual([]);
  });

  // ── Disclosure, asserted: what per-status validation does to unknown fields ──
  //
  // orval emits `zod.object({...})`, and a zod object STRIPS unknown keys by
  // default. So the boundary does not merely validate the body — it rewrites
  // it, and a field the server adds in a backward-compatible release never
  // reaches the caller. Whether that is the wanted behaviour is a decision for
  // the gate (strip vs passthrough); what is not acceptable is it being
  // undocumented, so it is pinned here. See findings.md, Deviations.

  it("STRIPS unknown fields from a validated 2xx body (zod object default)", async () => {
    scripted([
      {
        method: "GET",
        url: "/v1/plants",
        status: 200,
        body: {
          plants: [{ id: "p1", name: "One", tempC: 1 }],
          total: 1,
          serverAddedField: "backward-compatible addition",
        },
      },
    ]);
    const ok = (await boundary().fetcher({ url: "/v1/plants", method: "GET" })) as object;
    expect("serverAddedField" in ok).toBe(false);
    expect(ok).toEqual({ plants: [{ id: "p1", name: "One", tempC: 1 }], total: 1 });
  });

  it("STRIPS unknown fields from a class-3 body too", async () => {
    scripted([
      {
        method: "GET",
        url: "/v1/plants",
        status: 409,
        body: { code: "E_CONFLICT", traceId: "abc-123" },
      },
    ]);
    const err = (await get("/v1/plants")) as { body: object; raw: object };
    expect(err).toMatchObject({ class: 3, status: 409 });
    // The reason code survives; the correlation id the server sent does not.
    expect(err.body).toEqual({ code: "E_CONFLICT" });
    expect("traceId" in err.body).toBe(false);
    // It is still recoverable from the evidence — `raw` is the pre-parse body.
    expect(err.raw).toEqual({ code: "E_CONFLICT", traceId: "abc-123" });
  });

  it("matches path parameters against the contract's template", async () => {
    scripted([
      {
        method: "GET",
        url: "/v1/plants/p-42",
        status: 409,
        body: { code: "E_LOCKED" },
      },
    ]);
    const err = await get("/v1/plants/p-42");
    // The endpoint identity is the TEMPLATE, so telemetry dedupKeys do not
    // fragment one per plant id.
    expect(err).toMatchObject({
      class: 3,
      status: 409,
      endpointOrTopic: "GET /v1/plants/{plantId}",
    });
  });
});

describe("taxonomy-aware retry through TanStack Query", () => {
  /** Counts transport attempts, so "was it retried?" is a number, not a mood. */
  function counting(routes: readonly ScriptedRoute[] | "network-failure"): {
    client: QueryClient;
    attempts: () => number;
  } {
    let attempts = 0;
    const inner =
      routes === "network-failure"
        ? null
        : scriptedFetchAdapter(routes as readonly ScriptedRoute[]);
    const fetch: FetchLike = (input, init) => {
      attempts++;
      if (inner === null) return Promise.reject(new TypeError("fetch failed"));
      return inner(input, init);
    };
    const { client } = rig(fetch);
    return { client, attempts: () => attempts };
  }

  const query = (client: QueryClient, key: string, url: string): Promise<unknown> =>
    client
      .fetchQuery({
        queryKey: [key],
        queryFn: ({ signal }) => boundary().fetcher({ url, method: "GET" }, { signal }),
      })
      .catch((e: unknown) => e);

  it("RETRIES class 1 (transient), three times and no more", async () => {
    const { client, attempts } = counting("network-failure");
    const err = await query(client, "c1", "/v1/plants");
    expect(isTransient(err)).toBe(true);
    expect(err).toMatchObject({ class: 1, reason: "network" });
    expect(attempts()).toBe(4); // the original + retryOnlyTransient's 3
  });

  it("does NOT retry a class-2 contract violation (TanStack's default would)", async () => {
    const { client, attempts } = counting([
      { method: "GET", url: "/v1/plants", status: 200, body: { plants: "nope" } },
    ]);
    const err = await query(client, "c2", "/v1/plants");
    expect(isContractViolation(err)).toBe(true);
    expect(attempts()).toBe(1);
  });

  it("does NOT retry a class-3 reason code", async () => {
    const { client, attempts } = counting([
      { method: "GET", url: "/v1/plants", status: 409, body: { code: "E_CONFLICT" } },
    ]);
    const err = await query(client, "c3", "/v1/plants");
    expect(isReasonCode(err)).toBe(true);
    expect(attempts()).toBe(1);
  });

  it("does NOT retry a class-4 undeclared status", async () => {
    const { client, attempts } = counting([
      { method: "GET", url: "/v1/plants", status: 418, body: { code: "E_TEAPOT" } },
    ]);
    const err = await query(client, "c4", "/v1/plants");
    expect(isUnroutable(err)).toBe(true);
    expect(attempts()).toBe(1);
  });
});

// ── Register: `tsc --noEmit` IS the test ─────────────────────────
//
// The @ts-expect-error lines below fail the build if they ever stop being
// errors — i.e. if the augmentation stops applying or the union stops
// narrowing. Nothing here runs.

declare const _client: QueryClient;
declare const _cache: QueryCache;

export function _registerNarrowsAtCallSites(): void {
  const state = _client.getQueryState(["plants"]);
  if (state?.error != null) {
    // Register took effect: the default error type IS the boundary union.
    const asUnion: BoundaryError = state.error;

    if (asUnion.class === 1) {
      const reason: TransportError["reason"] = asUnion.reason;
      void reason;
      // @ts-expect-error class 1 carries no `status` — the union narrowed
      void asUnion.status;
    }

    if (asUnion.class === 3) {
      const status: number | null = asUnion.status;
      void status;
      // @ts-expect-error class 3 carries no `reason`
      void asUnion.reason;
    }

    // @ts-expect-error `class` is 1 | 2 | 3 | 4; there is no class 5
    if (asUnion.class === 5) void 0;
  }

  // The QueryCache tap gets the same narrowing, with no type argument.
  _cache.config.onError?.(
    // @ts-expect-error a bare Error is not a BoundaryError — the tap is typed
    new Error("not a boundary error"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    null as any,
  );
}
