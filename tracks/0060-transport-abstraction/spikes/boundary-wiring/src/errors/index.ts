// Entry point 2 — `transport-boundary/errors` (taxonomy owner).
// Imports no transport code; 0050 and 0070 depend on it freely.
//
// DELIBERATELY NOT EXPORTED here: fromZodError / fromAjvErrors and the class
// constructors. They live beside this file in ./normalize.ts (same module, an
// internal seam used by both ingresses and by this module's own tests), so no
// code outside the package can construct taxonomy values. See design.md,
// "Entry point 2" and Rationale ("Grafts taken" / minimal's locality move).

interface ErrorBase {
  readonly leg: "mqtt" | "rest";
  readonly endpointOrTopic: string;
  readonly timestamp: number;
  /** original evidence (ZodError, Ajv errors, TypeError, raw packet) — never rethrown */
  readonly raw: unknown;
}

/** class 1 — transient/transport (the only retryable class). */
export interface TransportError extends ErrorBase {
  readonly class: 1;
  readonly reason:
    | "network"
    | "timeout"
    | "aborted"
    | "connection-lost"
    | "publish-gated"
    | "queue-overflow"
    | "disposed";
}

/** class 2 — contract violation. */
export interface ContractViolation extends ErrorBase {
  readonly class: 2;
  readonly schemaPath: string;
  /** one shape over Zod and Ajv detail */
  readonly issues: readonly { path: string; message: string }[];
}

/** class 3 — a DECLARED body that PARSED. */
export interface ReasonCodeError<TBody = unknown> extends ErrorBase {
  readonly class: 3;
  /** null on the MQTT leg */
  readonly status: number | null;
  readonly body: TBody;
}

/** class 4 — unknown/unroutable. */
export interface UnroutableError extends ErrorBase {
  readonly class: 4;
  readonly cause:
    | "unknown-topic"
    | "undeclared-status"
    | "unknown-content-type"
    | "undecodable";
}

export type BoundaryError =
  | TransportError
  | ContractViolation
  | ReasonCodeError
  | UnroutableError;

/** Deduped telemetry envelope — the one 0050 shape, emitted by both taps. */
export interface TelemetryEvent {
  readonly error: BoundaryError;
  /** endpointOrTopic + schemaPath (0010's rule) */
  readonly dedupKey: string;
  /** occurrences folded within the dedupe window (>= 1) */
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

// ── Guards (the zodios isErrorFromPath idiom) ────────────────────

function isRecord(e: unknown): e is Record<string, unknown> {
  return typeof e === "object" && e !== null;
}

export function isBoundaryError(e: unknown): e is BoundaryError {
  if (!isRecord(e)) return false;
  const c = e["class"];
  if (c !== 1 && c !== 2 && c !== 3 && c !== 4) return false;
  return (
    (e["leg"] === "mqtt" || e["leg"] === "rest") &&
    typeof e["endpointOrTopic"] === "string" &&
    typeof e["timestamp"] === "number"
  );
}

export function isTransient(e: unknown): e is TransportError {
  return isBoundaryError(e) && e.class === 1;
}

export function isContractViolation(e: unknown, at?: string): e is ContractViolation {
  return isBoundaryError(e) && e.class === 2 && (at === undefined || e.endpointOrTopic === at);
}

export function isReasonCode<TBody = unknown>(
  e: unknown,
  endpointOrTopic?: string,
  status?: number,
): e is ReasonCodeError<TBody> {
  return (
    isBoundaryError(e) &&
    e.class === 3 &&
    (endpointOrTopic === undefined || e.endpointOrTopic === endpointOrTopic) &&
    (status === undefined || e.status === status)
  );
}

export function isUnroutable(e: unknown): e is UnroutableError {
  return isBoundaryError(e) && e.class === 4;
}

/**
 * TanStack-ready retry predicate: true only for class 1 (never 'aborted'), at
 * most 3 attempts. Structurally typed — no TanStack import.
 */
export function retryOnlyTransient(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  return isTransient(error) && error.reason !== "aborted";
}
