// app/api/mutator.ts — the caller-owned orval binding (design.md, "Caller-owned
// orval binding"). orval's `override.mutator` points at this one file; oxlint
// bans importing the generated client anywhere else (I5).
//
// ── The one correction the spike forced ──────────────────────────────────────
// design.md sketches the binding as
//
//     export const customInstance = <T>(req, opts?) => boundary.fetcher<T>(req, opts);
//
// which reads `signal` off the SECOND argument. orval 8.24.0 does not put it
// there: the generated request function threads TanStack Query's
// `context.signal` into the FIRST argument — the request-config object —
// alongside `url`/`method`/`params`/`data`:
//
//     export const listPlants = (params, options, signal) =>
//       customInstance<PlantList>({ url: `/v1/plants`, method: 'GET', params, signal }, options);
//
// The second argument is orval's `SecondParameter` (per-call request options
// supplied by the caller), not the signal. So the literal one-liner compiles,
// generates, runs — and silently drops cancellation, which is exactly the
// "silent no-op" failure the report warned about. The binding must read
// `req.signal`. See findings.md, check "Signal threading".

import type { BoundaryFetcher } from "../../src/index.js";
import { boundary } from "../transport.js";

type BoundaryRequest = Parameters<BoundaryFetcher>[0];

/** What orval actually hands the mutator: the boundary request PLUS `signal`. */
export type OrvalRequest = BoundaryRequest & { signal?: AbortSignal };

/** Per-call request options — orval's `SecondParameter<typeof customInstance>`. */
export interface MutatorOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/** Spike instrumentation: what orval handed the mutator, call by call. */
export interface MutatorCall {
  readonly url: string;
  readonly method: string;
  /** orval put the signal in the REQUEST object … */
  readonly signalOnRequest: AbortSignal | undefined;
  /** … and NOT in the options argument the design's one-liner reads. */
  readonly signalOnOptions: AbortSignal | undefined;
}
export const mutatorCalls: MutatorCall[] = [];
export function resetMutatorCalls(): void {
  mutatorCalls.length = 0;
}

export const customInstance = <T>(req: OrvalRequest, opts?: MutatorOptions): Promise<T> => {
  const { signal, ...rest } = req;
  mutatorCalls.push({
    url: req.url,
    method: req.method,
    signalOnRequest: signal,
    signalOnOptions: opts?.signal,
  });
  return boundary().fetcher<T>(
    { ...rest, headers: opts?.headers ?? rest.headers },
    { signal: signal ?? opts?.signal },
  );
};
