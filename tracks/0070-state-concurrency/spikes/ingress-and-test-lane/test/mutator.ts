// A minimal MUTATOR-SHAPED fetch wrapper plus the slice of the four-class error
// taxonomy this spike needs — both DELIBERATELY duplicated here.
//
// Isolation rule (spike-harness spec): spike code imports only from its own
// directory and its own node_modules — never from another spike. The 0060 spike
// owns the real orval mutator and `transport-boundary/errors`; this file is a
// local stand-in of the same SHAPE so the cancellation chain can be exercised
// end to end. Recorded under Deviations in findings.md.
//
// Not a test file — imported by test/cancellation.test.ts.

export type FetchLike = (
  url: string,
  init: RequestInit & { signal: AbortSignal },
) => Promise<Response>;

export interface MutatorConfig {
  url: string;
  method?: string;
  body?: unknown;
}

export interface MutatorOptions {
  signal: AbortSignal;
  fetchImpl: FetchLike;
}

/** Thrown for a non-2xx response, carrying what the normalizer needs. */
export class HttpStatusError extends Error {
  override readonly name = "HttpStatusError";
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

/**
 * The orval-mutator shape: every call takes and FORWARDS an AbortSignal into
 * `fetch`. Dropping the signal here is the silent no-op 0060's report warns
 * about — the spike's cancellation chain only works because it is forwarded.
 */
export async function mutator<T>(config: MutatorConfig, options: MutatorOptions): Promise<T> {
  const response = await options.fetchImpl(config.url, {
    method: config.method ?? "GET",
    signal: options.signal,
    ...(config.body === undefined ? {} : { body: JSON.stringify(config.body) }),
  });
  if (!response.ok) {
    throw new HttpStatusError(response.status, await response.json(), config.url);
  }
  return (await response.json()) as T;
}

// ── The four-class taxonomy slice (0060 owns the real one) ───────────

export type BoundaryError =
  | { class: 1; reason: "network" | "timeout" | "aborted"; endpointOrTopic: string; raw: unknown }
  | { class: 2; schemaPath: string; endpointOrTopic: string; raw: unknown }
  | { class: 3; status: number; body: unknown; endpointOrTopic: string; raw: unknown }
  | { class: 4; cause: "unknown-status"; endpointOrTopic: string; raw: unknown };

/** Statuses whose bodies the synthetic contract declares (0010's rule). */
const DECLARED_STATUSES = new Set([409, 422]);

/**
 * The normalizer as 0060's spike actually writes it — note that an aborted
 * fetch lands as **class 1 with `reason: 'aborted'`**, i.e. INSIDE the
 * taxonomy. 0070's rule is that the state layer must not see it as a taxonomy
 * error at all; `isCancellation()` in src/optimistic.ts is where the two meet.
 */
export function normalizeRestError(error: unknown, endpointOrTopic: string): BoundaryError {
  if (error instanceof HttpStatusError) {
    if (DECLARED_STATUSES.has(error.status)) {
      return { class: 3, status: error.status, body: error.body, endpointOrTopic, raw: error };
    }
    return { class: 4, cause: "unknown-status", endpointOrTopic, raw: error };
  }
  const name = (error as { name?: string } | null)?.name;
  if (name === "AbortError") {
    return { class: 1, reason: "aborted", endpointOrTopic, raw: error };
  }
  return { class: 1, reason: "network", endpointOrTopic, raw: error };
}

// ── The injected fetch (a test adapter of the REST-leg seam) ─────────

export interface PendingRequest {
  readonly url: string;
  aborted: boolean;
  /** Settle this request with a 2xx JSON body. */
  succeed(body: unknown): void;
  /** Settle it with a non-2xx status and a body. */
  fail(status: number, body: unknown): void;
}

export interface ControlledFetch {
  readonly fetchImpl: FetchLike;
  readonly pending: PendingRequest[];
  /** Requests that were aborted by a signal, in abort order. */
  readonly aborts: string[];
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function abortError(): Error {
  // Node's fetch rejects with a DOMException named AbortError; happy-dom and
  // undici agree on the name, which is all any consumer may key on.
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/** Every call parks until the test settles it, and honors its signal. */
export function createControlledFetch(): ControlledFetch {
  const pending: PendingRequest[] = [];
  const aborts: string[] = [];

  const fetchImpl: FetchLike = (url, init) =>
    new Promise<Response>((resolve, reject) => {
      const entry: PendingRequest = {
        url,
        aborted: false,
        succeed: (body) => resolve(jsonResponse(200, body)),
        fail: (status, body) => resolve(jsonResponse(status, body)),
      };
      pending.push(entry);

      const onAbort = (): void => {
        entry.aborted = true;
        aborts.push(url);
        reject(abortError());
      };
      if (init.signal.aborted) onAbort();
      else init.signal.addEventListener("abort", onAbort, { once: true });
    });

  return { fetchImpl, pending, aborts };
}
