// The SAME caller-owned binding under orval's other mutator convention
// (`output.httpClient: 'fetch'`). Generated code calls it as
//
//     fetchInstance<T>(getListPlantsUrl(params), { ...options, method: 'GET' })
//
// i.e. (url, RequestInit) — so the boundary request has to be reassembled from
// two arguments and `signal` arrives on the RequestInit, not on a config object.
// Kept beside app/api/mutator.ts as evidence for findings.md: orval threads
// `signal` under both conventions, but into a different argument, so a binding
// written for one convention silently drops cancellation under the other.
//
// This convention is NOT the one the design uses, for a second and larger
// reason: `httpClient: 'fetch'` types every generated operation as a
// status-discriminated ENVELOPE —
//
//     type listPlantsResponse =
//       ({data: PlantList; status: 200} | {data: Conflict; status: 409}
//        | {data: ValidationProblem; status: 422}) & {headers: Headers}
//
// — i.e. a declared 409 is a RESOLVED value, not a rejection. design.md's
// `BoundaryFetcher` contract is the opposite ("resolves only validated,
// branded payloads; rejects only BoundaryError"), and the whole class-3 story
// depends on the rejection: TanStack Query only sees an error if the queryFn
// rejects. Under this convention class 3 would never reach the error path.
// So this binding resolves the BODY (what the boundary gives it), which the
// generated type does not describe — asserted, not glossed over, in
// test/check-9-signal-threading.test.ts.

import type { BoundaryFetcher } from "../../src/index.js";
import { boundary } from "../transport.js";

type BoundaryRequest = Parameters<BoundaryFetcher>[0];

export interface FetchMutatorCall {
  readonly url: string;
  readonly method: string;
  readonly signalOnInit: AbortSignal | undefined;
}
export const fetchMutatorCalls: FetchMutatorCall[] = [];
export function resetFetchMutatorCalls(): void {
  fetchMutatorCalls.length = 0;
}

export const fetchInstance = <T>(url: string, init: RequestInit): Promise<T> => {
  const method = (init.method ?? "GET") as BoundaryRequest["method"];
  const signal = init.signal ?? undefined;
  fetchMutatorCalls.push({ url, method, signalOnInit: signal });
  return boundary().fetcher<T>(
    {
      url,
      method,
      data: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      headers: init.headers,
    },
    { signal },
  );
};
