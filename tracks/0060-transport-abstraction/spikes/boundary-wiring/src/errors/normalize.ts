// Internal seam of the errors module: the four-class constructors and the two
// normalizers. NOT re-exported from ./index.ts (design.md: no code outside the
// package may construct taxonomy values), so the permanent two-shape
// normalisation problem (0010 risk 3) has total locality inside the package.

import type {
  BoundaryError,
  ContractViolation,
  ReasonCodeError,
  TransportError,
  UnroutableError,
} from "./index.js";

export interface ErrorContext {
  readonly leg: "mqtt" | "rest";
  readonly endpointOrTopic: string;
  readonly timestamp: number;
  readonly raw: unknown;
}

export function transportError(
  ctx: ErrorContext,
  reason: TransportError["reason"],
): TransportError {
  return { class: 1, reason, ...ctx };
}

export function unroutableError(
  ctx: ErrorContext,
  cause: UnroutableError["cause"],
): UnroutableError {
  return { class: 4, cause, ...ctx };
}

export function reasonCodeError<TBody>(
  ctx: ErrorContext,
  status: number | null,
  body: TBody,
): ReasonCodeError<TBody> {
  return { class: 3, status, body, ...ctx };
}

// ── The two-shape normalisation problem ──────────────────────────

/** The subset of an Ajv `ErrorObject` this normalizer reads. */
export interface AjvErrorLike {
  readonly instancePath?: string;
  readonly schemaPath?: string;
  readonly keyword?: string;
  readonly message?: string;
  readonly params?: unknown;
}

/**
 * Shape 1: Ajv's error array (0010's compiled standalone validators park it on
 * `validate.errors`). `schemaPath` is taken from the first error, which is what
 * gives the telemetry dedupKey per-failure-site stability.
 */
export function fromAjvErrors(
  errors: readonly unknown[] | null | undefined,
  ctx: ErrorContext,
): ContractViolation {
  const list = (errors ?? []) as readonly AjvErrorLike[];
  const first = list[0];
  return {
    class: 2,
    schemaPath: first?.schemaPath ?? "#",
    issues: list.map((e) => ({
      path: e.instancePath === undefined || e.instancePath === "" ? "/" : e.instancePath,
      message: e.message ?? e.keyword ?? "invalid",
    })),
    ...ctx,
  };
}

/** The subset of a `ZodError` this normalizer reads (structural — no zod import). */
export interface ZodErrorLike {
  readonly issues: readonly {
    readonly path: readonly (string | number)[];
    readonly message: string;
    readonly code?: string;
  }[];
}

/**
 * Shape 2: Zod's issue array (the REST leg's per-status schemas). Produces the
 * identical `{path, message}` issue shape as fromAjvErrors, which is the whole
 * point of keeping both normalizers in one module.
 */
export function fromZodError(error: ZodErrorLike, ctx: ErrorContext): ContractViolation {
  const issues = error.issues ?? [];
  const firstPath = issues[0]?.path ?? [];
  return {
    class: 2,
    schemaPath: firstPath.length > 0 ? `#/${firstPath.join("/")}` : "#",
    issues: issues.map((i) => ({
      path: i.path.length > 0 ? `/${i.path.join("/")}` : "/",
      message: i.message,
    })),
    ...ctx,
  };
}

/** Telemetry dedupe key: endpointOrTopic + schemaPath (0010's rule). */
export function dedupKeyOf(error: BoundaryError): string {
  switch (error.class) {
    case 1:
      return `${error.endpointOrTopic}|c1:${error.reason}`;
    case 2:
      return `${error.endpointOrTopic}|${error.schemaPath}`;
    case 3:
      return `${error.endpointOrTopic}|c3:${String((error.body as { code?: unknown })?.code)}`;
    case 4:
      return `${error.endpointOrTopic}|c4:${error.cause}`;
  }
}
