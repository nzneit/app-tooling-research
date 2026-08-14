// The 0050 logging stub — caller-owned, above the seam.
//
// It receives the SAME deduped `TelemetryEvent` envelope from both taps:
//   * MQTT leg  — `boundary.actor.on('*', ...)`, the wildcard discrete-event tap
//   * REST leg  — the caller's QueryCache `onError` tap, which adds the one
//                 fact only the TanStack layer knows: the query key.
//
// The envelope itself (dedupKey / count / firstSeen / lastSeen) is constructed
// below the seam, because deduping is a property of the taxonomy, not of the
// sink — see findings.md, "Telemetry via QueryCache".

import type { BoundaryError, TelemetryEvent } from "../src/errors/index.js";

export interface QueryErrorRecord {
  readonly error: BoundaryError;
  readonly queryKey: readonly unknown[];
  /** the deduped envelope the boundary emitted for this same error */
  readonly envelope: TelemetryEvent | undefined;
}

export interface TelemetrySink {
  /** wire-1 tap: every deduped envelope, both legs. */
  record(event: TelemetryEvent): void;
  /** QueryCache onError tap: a REST-leg error, tagged with its query key. */
  recordQuery(error: BoundaryError, queryKey: readonly unknown[]): void;
  readonly envelopes: readonly TelemetryEvent[];
  readonly queryErrors: readonly QueryErrorRecord[];
  reset(): void;
}

export function createTelemetrySink(): TelemetrySink {
  const envelopes: TelemetryEvent[] = [];
  const queryErrors: QueryErrorRecord[] = [];
  /** identity map error -> envelope, so the QueryCache tap can pair the two. */
  const byError = new Map<BoundaryError, TelemetryEvent>();

  return {
    record(event) {
      envelopes.push(event);
      byError.set(event.error, event);
    },
    recordQuery(error, queryKey) {
      queryErrors.push({ error, queryKey, envelope: byError.get(error) });
    },
    get envelopes() {
      return envelopes;
    },
    get queryErrors() {
      return queryErrors;
    },
    reset() {
      envelopes.length = 0;
      queryErrors.length = 0;
      byError.clear();
    },
  };
}
