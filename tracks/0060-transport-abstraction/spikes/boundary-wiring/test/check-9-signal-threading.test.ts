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

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { QueryClient } from "@tanstack/react-query";
import type { FetchLike } from "../src/index.js";
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

  // The consequence, made concrete: design.md's binding reads `opts.signal`.
  // Written that way against this generated output it compiles, generates and
  // runs — and cancellation silently does nothing.
  it("shows design.md's literal one-line binding would be a silent no-op", async () => {
    const { calls } = rig([
      { method: "GET", url: "/v1/plants", status: 200, body: validPlantList, delayMs: 30 },
    ]);
    const controller = new AbortController();
    // Exactly the object orval hands the mutator …
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
