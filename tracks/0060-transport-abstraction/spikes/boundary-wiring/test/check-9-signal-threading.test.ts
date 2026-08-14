// CHECK (report list, DECISIVE for the REST seam):
//
//   "configure orval's `client: 'react-query'` output over 0010's config and
//    confirm the generated hooks pass `context.signal` through the custom
//    mutator into fetch. Fail: cancellation is a silent no-op and the seam
//    design needs a hand-written wrapper layer."
//
// Everything here runs the REAL generated client (app/api/generated/plants.ts,
// orval 8.24.0, `client: 'react-query'`, `httpClient: 'axios'`, custom mutator
// app/api/mutator.ts) through a REAL QueryClient. No React: orval emits
// query-options builders, so `queryClient.fetchQuery(getListPlantsQueryOptions())`
// exercises the same queryFn a `useQuery` hook would, signal and all.
//
// fetch is injected at the boundary's FetchLike port, so "the underlying fetch
// aborted" is observed on the actual AbortSignal the transport received.
//
// Two failure modes are pinned at the bottom of this file, in order:
//   1. design.md's literal binding does not COMPILE against orval's call site
//      (TS2353, excess property 'signal') — `_designLiteralBindingDoesNotEvenCompile`
//   2. the real hazard is one step later: widen the request type to get past
//      that error, keep design.md's `fetcher(req, opts)` body, and the signal is
//      dropped silently at runtime — the "post-widening hazard" test.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { QueryClient } from "@tanstack/react-query";
import type { BoundaryFetcher, FetchLike } from "../src/index.js";
import {
  memoryBrokerAdapter,
  scriptedFetchAdapter,
  type ScriptedRoute,
} from "../src/testing.js";
import { boundary, createAppBoundary, installBoundary } from "../app/transport.js";
import { createAppQueryClient } from "../app/query-client.js";
import { createTelemetrySink } from "../app/telemetry-sink.js";
import { mutatorCalls, resetMutatorCalls } from "../app/api/mutator.js";
import {
  getGetPlantQueryOptions,
  getListPlantsQueryOptions,
  listPlants,
} from "../app/api/generated/plants.js";
import { validPlantList } from "./fixtures.js";

interface FetchRecord {
  url: string;
  signal: AbortSignal;
}

/** Wraps the scripted adapter so the signal the TRANSPORT saw is inspectable. */
function recordingFetch(routes: readonly ScriptedRoute[]): {
  fetch: FetchLike;
  calls: FetchRecord[];
} {
  const inner = scriptedFetchAdapter(routes);
  const calls: FetchRecord[] = [];
  const fetch: FetchLike = (input, init) => {
    calls.push({ url: String(input), signal: init.signal });
    return inner(input, init);
  };
  return { fetch, calls };
}

let teardown: (() => Promise<void>) | null = null;

function rig(routes: readonly ScriptedRoute[]): { calls: FetchRecord[]; client: QueryClient } {
  resetMutatorCalls();
  const { fetch, calls } = recordingFetch(routes);
  const b = createAppBoundary({ broker: memoryBrokerAdapter(), fetch });
  const uninstall = installBoundary(b);
  const client = createAppQueryClient(createTelemetrySink(), b);
  teardown = async () => {
    client.clear();
    await uninstall();
  };
  return { calls, client };
}

afterEach(async () => {
  await teardown?.();
  teardown = null;
});

/** Generated source, whitespace-normalised — orval's formatting is not the subject. */
const generated = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../app/api/generated/${name}`, import.meta.url)), "utf8")
    .replace(/\s+/g, " ");

describe("signal threading through orval's generated react-query client", () => {
  it("GO: cancelling the query aborts the underlying fetch", async () => {
    const { calls, client } = rig([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList, delayMs: 5_000 },
    ]);
    const options = getListPlantsQueryOptions();
    const pending = client.fetchQuery(options).catch((e: unknown) => e);

    // The request is genuinely in flight before we cancel.
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const transportSignal = calls[0]?.signal;
    expect(transportSignal).toBeInstanceOf(AbortSignal);
    expect(transportSignal?.aborted).toBe(false);

    await client.cancelQueries({ queryKey: options.queryKey });
    await pending;

    // THE assertion: TanStack's context.signal reached the transport, and the
    // cancellation is real rather than a bookkeeping no-op.
    expect(transportSignal?.aborted).toBe(true);
  });

  it("hands the mutator the signal in the REQUEST object, not the options argument", async () => {
    const { calls, client } = rig([
      {
        method: "GET",
        url: "/v1/plants/p1",
        status: 200,
        body: { id: "p1", name: "One", tempC: 3 },
      },
    ]);
    await client.fetchQuery(getGetPlantQueryOptions("p1"));

    expect(mutatorCalls).toHaveLength(1);
    const call = mutatorCalls[0];
    expect(call?.url).toBe("/v1/plants/p1");
    // orval put it here …
    expect(call?.signalOnRequest).toBeInstanceOf(AbortSignal);
    // … and NOT here, which is where design.md's one-line binding reads it.
    expect(call?.signalOnOptions).toBeUndefined();
    // The transport receives a DERIVED signal, not the caller's: the boundary
    // owns its own AbortController so the caller's abort and `rest.timeoutMs`
    // compose into one. Linkage (not identity) is what the GO test asserts.
    expect(calls[0]?.signal).not.toBe(call?.signalOnRequest);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves the validated body end to end through the generated client", async () => {
    const { client } = rig([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList },
    ]);
    await expect(client.fetchQuery(getListPlantsQueryOptions())).resolves.toEqual(validPlantList);
    // The generated request function works standalone too (no QueryClient).
    await expect(listPlants()).resolves.toEqual(validPlantList);
  });

  // THE HAZARD, one step past the type error.
  //
  // design.md's literal binding does not build against this generated output at
  // all — see `_designLiteralBindingDoesNotEvenCompile` below (TS2353). The
  // danger is what a developer does next: hit the excess-property error, widen
  // the request parameter so it builds, and forward `opts` exactly as design.md
  // writes it. From that moment the signal is dropped, silently and at runtime,
  // with nothing left to complain. This test IS that post-widening state:
  // `orvalRequest` is a pre-built variable, so no excess-property check fires —
  // which is precisely what widening the type achieves.
  it("post-widening hazard: once the request type is widened, the signal is dropped", async () => {
    const { calls } = rig([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList, delayMs: 30 },
    ]);
    const controller = new AbortController();
    // Exactly the object orval hands the mutator, held in a variable so the
    // excess-property check does not fire — i.e. the widened world.
    const orvalRequest = { url: "/v1/plants", method: "GET" as const, signal: controller.signal };
    // … forwarded the way design.md writes it: `fetcher(req, opts)`, opts undefined.
    const pending = boundary()
      .fetcher(orvalRequest, undefined)
      .catch((e: unknown) => e);

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort();
    const settled = await pending;

    expect(controller.signal.aborted).toBe(true);
    expect(calls[0]?.signal.aborted).toBe(false); // the abort never reached the transport
    expect(settled).toEqual(validPlantList); // and the request completed regardless
  });

  it("threads the signal under orval's OTHER mutator convention too, into a different argument", () => {
    const axios = generated("plants.ts");
    const fetchClient = generated("plants.fetch.ts");

    // httpClient: 'axios' — signal rides INSIDE the request-config object.
    expect(axios).toContain("params, signal }, options)");
    expect(axios).toContain("({ signal }) => listPlants(params, requestOptions, signal)");

    // httpClient: 'fetch' — signal rides on the RequestInit, i.e. argument two.
    expect(fetchClient).toContain(
      "({ signal }) => listPlants(params, { signal, ...requestOptions })",
    );
    expect(fetchClient).toContain("fetchInstance<listPlantsResponse>(getListPlantsUrl(params)");

    // …and this convention types a declared 409 as a RESOLVED envelope, which is
    // the opposite of BoundaryFetcher's contract (rejects only BoundaryError).
    expect(fetchClient).toContain("data: Conflict status: 409");
  });
});

// ── Compile-level evidence: design.md's binding does not even build ──────────
//
// `tsc --noEmit` IS this assertion. design.md sketches
//
//     export const customInstance = <T>(req, opts?) => boundary.fetcher<T>(req, opts);
//
// whose request parameter is `Parameters<BoundaryFetcher>[0]` — a type with no
// `signal`. orval's generated call site passes a FRESH object literal carrying
// `signal`, so TypeScript's excess-property check rejects it outright:
//
//     TS2353: Object literal may only specify known properties, and 'signal'
//     does not exist in type '{ url: string; method: ...; params?: ...; }'.
//
// That type error is the cheap guard, and it is the honest version of this
// spike's earlier claim (the binding does NOT silently run — it fails to
// build). The expensive failure is what comes after: widen the parameter to get
// past this error and the signal is dropped at runtime instead, which is what
// the "post-widening hazard" test above demonstrates. The @ts-expect-error
// below fails the build if TypeScript ever stops catching the first step.

type BoundaryRequest = Parameters<BoundaryFetcher>[0];

/** design.md's binding, verbatim in its typing: no `signal` on the request. */
declare function designLiteralInstance<T>(
  req: BoundaryRequest,
  opts?: { signal?: AbortSignal },
): Promise<T>;

export function _designLiteralBindingDoesNotEvenCompile(sig: AbortSignal): void {
  void designLiteralInstance<unknown>(
    {
      url: "/v1/plants",
      method: "GET",
      // @ts-expect-error TS2353 — 'signal' does not exist in the request type,
      // so orval's generated call site does not type-check against design.md's
      // binding as written.
      signal: sig,
    },
    undefined,
  );
}
