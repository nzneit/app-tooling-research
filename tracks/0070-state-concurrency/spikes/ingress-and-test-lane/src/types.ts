// spike-0070-ingress-and-test-lane — public interface types.
// Transcribed from design.md "Chosen interface". Findings are the durable
// artifact; see findings.md.
//
// DEVIATION (recorded in findings.md): design.md imports `QueryKey` /
// `QueryClient` from @tanstack/react-query. That package is not installed for
// this task (no query DispatchTarget or optimistic mutation work here), so the
// two names are declared structurally below. Swapping in the real imports is a
// type-only change; no member of the surface moves.

/** Server-issued monotonic ordering token (design.md §Stamp, assumption A-1). */
export type Stamp = number | bigint;

/** Structural stand-in for @tanstack/react-query's QueryKey. */
export type QueryKey = readonly unknown[];

/** Structural stand-in for the slice of QueryClient the ingress touches. */
export interface QueryClientLike {
  invalidateQueries(filters: { queryKey: QueryKey; exact?: boolean }): unknown;
}

/** A message that already cleared 0010's validators below 0060's seam. */
export interface ValidatedMessage<P = unknown> {
  readonly topic: string;
  readonly packetId: string;
  readonly payload: P;
}

export type FeedEvent<P = unknown> =
  | { kind: "message"; message: ValidatedMessage<P> }
  | { kind: "gap" };

/**
 * THE SEAM (dependency category 3 — remote but owned).
 * Two adapters exist from day one: the production closure over 0060's actor.on
 * surface, and `createRaceHarness(...).feed`. Returns unsubscribe.
 */
export type IngressFeed = (deliver: (event: FeedEvent) => void) => () => void;

export type DispatchTarget<P> =
  | { machine: { send(e: object): void }; event: (msg: ValidatedMessage<P>) => object }
  | { store: (msg: ValidatedMessage<P>) => void }
  | {
      query: (msg: ValidatedMessage<P>) => QueryKey;
      family?: QueryKey;
      write?: (msg: ValidatedMessage<P>) => (current: unknown) => unknown;
    };

export interface StreamDecl<P = unknown> {
  /** MQTT wildcard string ('orders/+/updated', 'rig/#') or a predicate. */
  topic: string | ((topic: string) => boolean);
  entity: (msg: ValidatedMessage<P>) => string;
  stamp?: (msg: ValidatedMessage<P>) => Stamp | undefined;
  dispatch: DispatchTarget<P>;
  onGap?: () => void;
}

export type Wire =
  | {
      fromMachine: {
        subscribe(cb: (snap: any) => void): { unsubscribe(): void };
        getSnapshot(): any;
      };
      select: (snap: any) => any;
      into: (next: any) => void;
      equals?: (a: any, b: any) => boolean;
    }
  | {
      fromStore: {
        subscribe(sel: (s: any) => any, cb: (next: any, prev: any) => void): () => void;
      };
      select: (state: any) => any;
      event: (next: any, prev: any) => object | null;
      toMachine: { send(e: object): void };
    };

export interface IngressError extends Error {
  code: "unmatched-topic" | "dispatch-failed";
  envelope: ValidatedMessage;
  cause?: unknown;
}

export interface IngressInspectionEvent {
  stage: "dedup" | "guard" | "mask" | "dispatch" | "gap";
  stream?: string;
  entity?: string;
  verdict: "pass" | "drop" | "withheld" | "released";
  message?: ValidatedMessage;
}

export interface IngressStats {
  readonly duplicate: number;
  readonly stale: number;
  readonly masked: number;
  readonly dispatched: number;
  readonly unmatched: number;
  readonly gaps: number;
}

export interface StateKitConfig {
  feed?: IngressFeed;
  streams?: Record<string, StreamDecl<any>>;
  wires?: Wire[];
  queryClient?: QueryClientLike;
  signal?: AbortSignal;
  onError?: (error: IngressError) => void;
  inspect?: (ev: IngressInspectionEvent) => void;
  dedupCapacity?: number;
}

export interface StateKit {
  readonly signal: AbortSignal;
  readonly stats: IngressStats;
  dispose(): void;
  // NOTE: `optimisticMutation` / `useOptimisticMutation` from design.md are
  // deferred to Task 9 (see findings.md "Deviations"). The mask stage of the
  // pipeline is implemented and ordered; nothing registers holds yet.
}

export interface RaceHarness {
  /** Second adapter at the IngressFeed seam — what makes the seam real. */
  readonly feed: IngressFeed;
  push(...items: Array<ValidatedMessage | "gap">): void;
  wrap<F extends (...a: any[]) => Promise<any>>(fn: F, label?: string): F;
  settle(): Promise<void>;
}
