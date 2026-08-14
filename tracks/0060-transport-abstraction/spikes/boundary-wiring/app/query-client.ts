// The TanStack Query layer — caller-owned, ABOVE the seam (I6: the package
// never imports TanStack Query; this file is app code and does).
//
// design.md, "Usage sketch": three lines of caller-facing error surface —
// the `Register` augmentation, `retry: retryOnlyTransient`, and the QueryCache
// `onError` tap.

import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
  isBoundaryError,
  retryOnlyTransient,
  type BoundaryError,
} from "../src/errors/index.js";
import type { AppBoundary } from "./transport.js";
import type { TelemetrySink } from "./telemetry-sink.js";

// ── The global error type ────────────────────────────────────────
// Registering the union is what makes `error` narrow at every call site
// without a per-call type argument. `tsc --noEmit` is the test; see
// test/check-10-taxonomy-retry-register.test.ts.

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: BoundaryError;
  }
}

export function createAppQueryClient(sink: TelemetrySink, boundary?: AppBoundary): QueryClient {
  // Wire 1 — the MQTT leg's deduped envelopes, and (see note) the REST leg's
  // too: the boundary is the only place a BoundaryError is ever constructed,
  // so it is also the only place that can fold repeats into one envelope.
  boundary?.actor.on("*", (ev) => {
    if (ev.type === "telemetry") sink.record(ev.event);
  });

  return new QueryClient({
    defaultOptions: {
      queries: {
        // Taxonomy-aware: class 1 only, never 'aborted', at most 3 attempts.
        // TanStack's default would retry a class-2 contract violation 3 times.
        retry: retryOnlyTransient,
        retryDelay: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // `error` is BoundaryError here thanks to the Register augmentation —
        // no cast, no type argument. The guard is still worth running: a
        // queryFn other than the boundary's fetcher could reject with anything.
        if (isBoundaryError(error)) sink.recordQuery(error, query.queryKey);
      },
    }),
  });
}
