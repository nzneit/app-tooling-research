# 0160-flight-recorder — capture-interface design panel record (2026-08-23)

The grounded design panel behind the report's Key question 6, preserved verbatim per the
[design-panel convention](../../.claude/skills/design-panel/SKILL.md). Method: the grounding
phase was the survey's six-lane evidence sweep (its findings fed all variants identically);
three variants were proposed in parallel under opposing constraints; one judge ruled against
a stated default — the burden of proof sat on displacing 0060's policy-row registry idiom,
with ceremony priced as a cost. No deviations from the convention's shape. The judged final
artifact lives in [report.md](report.md) Key question 6 and is not duplicated here; this file
preserves the losing material and the judgment in full.

## Verdict

Variant 1 wins, carrying the stated default inside it: its frozen bucket table IS 0060's policy-row registry compiled once at construction, so the registry idiom is not displaced but executed at maximum depth — with two surgical adoptions (V2's per-name undeclared-bucket ledger; V3's self-observed tap-death pattern expressed through the existing detach(reason), not a new member).

## Judge reasoning (verbatim)

The burden of proof says the registry idiom holds unless a competitor shows a concrete failure it cannot express — and no variant showed one, because Variant 1 never left it: `buckets: Record<string, BucketPolicy>`, validated and frozen at construction, is 0060's shape verbatim. The real contest is therefore over what each variant adds AROUND the shared registry core, and there the brief's second clause bites: ceremony must earn its place against a hazard real in THIS app's init order.

Variant 2's additions each fail that test with a concrete failure mode. (1) `record()` returning a discriminated RecordOutcome hands every tap a value to branch on; under heavy agent-authored churn that is not hypothetical — it is an invitation to grow `if (!out.accepted)` retry/log paths inside the boundary's dispatch turn and the orval fetcher's latency path, coupling app hot paths to recorder internals. V3 names the principle exactly: outcome must be health-countable, never caller-branchable; V1 and V3 agree, V2 stands alone. (2) `applyOverrides` is a second, runtime config channel that startup validation never sees — precisely the unauditable surface the loose-TS profile warns about — and the kill switch does not need it: a construction-time bit riding the app's existing startup-config channel plus a reload satisfies disable-without-redeploy (redeploy ≠ reload). (3) `config: unknown` throws away free agent-facing affordance (autocomplete, doc-comments on rows) while changing nothing about enforcement — runtime validation is the gate in every variant. (4) Per-bucket post-trigger windows treat the aftermath of one incident as a per-stream property; V1's refusal argument is correct and V2 never rebuts it.

Variant 3's central attack — "a minimal record()-only surface collapses quiet/dead/not-yet-attached into no data" — misses, because V1 is not that surface: attach() stamps attachedSince and an epoch, detach(reason) records death, lastRecordAt corroborates quiet, and the bundle embeds all of it. What remains of V3 is machinery whose hazards are unreal here or self-inflicted: the init-order cycle dissolves in all three variants by construction order (the recorder has no dependencies, so it is built first — V1 states this); FR-2's fault containment exists only because V3 made the recorder call into tap code (attach/probe/teardown) — in V1 taps subscribe themselves, so the only recorder-invoked app code is project(), already contained by I1; fail-fast construction (FR-6) is the one posture a diagnostics tool cannot afford, taking the app down at boot for an observability typo, when the thinned-config hazard it fears is already answered loudly by configErrors in health(), in every bundle header, and a one-line startup assertion. V3's genuinely good idea — a tap that can observe its own seam die reports it (wire-2 'ended', facade sink removal) — needs no new surface: the adapter calls detach(reason) itself. The synthesis adopts that as doctrine on the existing member, plus V3's evidence rule that detach never discards the ring.

Constraint walk on the final artifact: named buckets with startup config (buckets table); built-ins as privilege-free adapters (I7, proven in the worked example); serialize-at-capture with counted projection failures (I1/I2, DropCounters); count-and-bytes with UTF-8 metered once, truncate-by-copy, structured {truncated,originalSize}/{redacted,ruleId} markers, full drop accounting, static envelope enforcement (I3/I4, LossMarker); O(n) reference-copy seal with cut markers, index snapshots forbidden (I5); explicit capture plus onerror/unhandledrejection/React-boundary nets, counted cooldown suppression, configurable post-trigger window defaulting to zero; every record-shape reservation (seq, two clocks with one shared origin, direction/phase/outcome with openAtSeal for in-flight, per-payload mimeType/encoding, uniform schemaId/schemaVersion, checkpoint/oldestIsComplete/droppedBeforeWindow, redaction distinct from truncation); health with drops/bytes/attach-liveness distinguishing quiet from not-yet-attached, silent death detectable via self-observed detach or stagnant lastRecordAt; runtime validation with the fail-safe-loud ruling stated and the kill switch decided as a seam; main-thread interface (I9); observe-never-classify and no self-capture (I6); record() layering by restricted-imports (I10). All satisfied.

## Rejected elements

- V2's RecordOutcome return from record() — a discriminated accepted/reason value hands every tap recorder state to branch on; under agent churn that concretely invites `if (!out.accepted)` retry/log paths inside the boundary dispatch turn and the orval fetcher's latency path, coupling app hot paths to recorder internals. record() stays void, fire-and-forget; outcomes are health counters (V3 states the principle; the synthesis writes it into record()'s doc).
- V2's applyOverrides/RuntimeOverrides seam — a second, runtime config channel that startup validation never audits, in exactly the loose-TS/agent-churn environment the brief flags; the kill switch it exists to serve is fully served by the construction-time enabled bit riding the app's startup-config channel plus a reload (redeploy ≠ reload), and its snapshot-of-overrides mitigation only patches a hole the seam itself opened.
- V2's `createRecorder(config: unknown)` — discarding the parameter type buys no enforcement (runtime validation is the gate in every variant) and throws away free agent-facing affordance: a typed RecorderConfig with doc-comments is exactly how agent-authored rows get written correctly on the first try.
- V2's per-bucket postTrigger rows — the post-trigger window catches the aftermath of ONE incident, which is not a per-stream property; one global {ms, maxItems} default zero (V1's refusal, unrebutted).
- V2's built-in/app schema asymmetry (built-ins MUST omit schema, app rows MUST provide it) — a validator special case; the synthesis keeps V1's uniform rule: schema required on every row, built-ins shipping recorder.* ids, so the validator needs no built-in distinction.
- V2's kind: 'event' | 'checkpoint' closed union — it conflates the record-type discriminator with the ring-self-sufficiency bit; V1's open kind?: string plus a separate checkpoint?: boolean keeps app record typing free while RD-9 stays structural.
- V2's dead-row handles (invalid row → handle counting every record as 'invalid-config' drops) — equivalent in effect to V1's inert-tap-plus-configErrors but adds a fourth rejection vocabulary; one spelling of absence retained.
- V3's fail-fast construction (FR-6 throw) — a diagnostics tool that throws at boot takes the app down for an observability typo, the one trade this tool cannot make; FR-6's own stated hazard (bundles lying about coverage) is already answered loudly by configErrors in health(), in every bundle header, and the one-line startup assertion.
- V3's TapDescriptor/TapRegistration/probe() lifecycle registry — the init-order cycle it cites dissolves by construction order in every variant (the recorder has no dependencies and is built first); the silent-death hazard is covered by composition-root detach wiring plus taps self-reporting observed seam death through detach(reason); probe() is a third liveness spelling whose per-tap callbacks are more recorder-invoked app code to contain.
- V3's FR-2 fault-containment machinery — it guards a hazard V3 itself creates by having the recorder call into tap code (attach/teardown/probe); when taps subscribe themselves, the only recorder-executed app code is project() and the projection walk, which I1 already contains.
- V3's enabled: () => boolean callback — a function slot evaluated exactly once is a bit wearing a function's cost; one boolean at construction.
- V3's CaptureTicket carrying bundle: Promise<SealedBundle> — handing the caller the bundle leaks delivery into the trigger path and invites app code to await evidence assembly; V1's receipt (id + outcome) keeps delivery entirely the transport seam's concern.
- V3's flat records array sorted (bucket, seq) with a separate manifest — per-bucket blocks keep each bucket's cut/schema/liveness/self-sufficiency local to its records, and are the better OpenAPI seed; rejected as a minor but real regression in bundle legibility.
- V3's bounded pre-attach buffer in createReactErrorNet — machinery for a boot window that the construction order already closes (the recorder exists before anything mounts the boundary).
- V1's own unknownBucketRecords scalar — replaced by V2's per-name ledger (Readonly<Record<string, number>>): under loose TS the typo naming itself is the diagnostic, and a single aggregate count hides which name was wrong.
- V1's purely-passive silent-death posture — kept structurally, but its detach doc no longer treats the composition root as the only caller: V3's markDead insight (a tap that can observe wire-2 'ended' or facade sink removal reports its own death) is adopted as doctrine on the existing detach(reason), with the evidence rule that detach never discards the ring.

## Deliberately unsolved

- A source that dies with no observable teardown and no self-observable seam remains forensically detectable only (attachedSince + stagnant lastRecordAt read against corroborating buckets) — no liveness oracle exists; if the FMEA later shows a real occurrence in this app, V3's probe-at-seal is the named escalation path.
- Mid-session kill without a reload is unsupported by design; disable-without-redeploy depends on the app's startup-config channel actually existing and carrying the enabled bit — an intake fact, not a recorder feature.
- Per-record index/meta overhead sits outside the byte meter (bounded by maxCount, not metered); the header allowance in the static envelope check is a validator constant that needs a measured value from the Q15 spike.
- Whether deviceId exists for page code (intake item i) and how the armed nets chain with incumbent onerror/unhandledrejection handlers (intake item g) are user facts left open.
- Post-trigger records are identified only by seq > cut.seq — a rule bundle consumers must apply; no explicit per-record flag exists, deliberately.
- Capturing 0070 ingress-verdict traffic is left to the adapter/composition layer (multiplexing the kit's single inspect slot, or a change request to 0070) — the recorder's surface deliberately takes no position.
- The bounded per-bucket correlation open-set needs a sizing rule (its own cap and an overflow marker) that this sketch does not fix; the spike should choose it before the OpenAPI contract freezes openAtSeal semantics.

## Variant: minimal surface (winner, as amended by the judge)

### Stance

Depth over configurability: one sink, one trigger, one health read. The recorder's entire runtime surface is three entry points — `attach(bucket).record(entry, meta)`, `capture(reason)`, `health()` — and everything else the fixed constraints demand is expressed as data (a frozen config table compiled once at construction, a small per-record meta of facts) rather than as new callables. Leverage concentrates in `record()`: projection, walk-guarding, bounded serialization, redaction, UTF-8 metering, truncation-with-copy, dual-clock and sequence stamping, and eviction all happen behind that one call, invisibly. This matters doubly here because the app's TS is very loose under heavy agent churn: every additional knob is an unvalidated liability, and the fewer spellings the surface has, the more the startup validator and the bundle's own drop ledger can vouch for. Where 0060's registry pattern and 0050's runtime-mutable sink registry pull toward a wider surface, this design keeps the registry as *frozen data* (0060's compile-once half) and refuses the runtime mutability (0050's addSink half) — a mutable bucket registry would make the bundle's config snapshot a lie and hand agent-authored code a second, unauditable config channel. The proof of the surface is I7: all four built-in taps and both failure nets are plain adapters over these same three entry points, with zero privileged access.

### Artifact (verbatim)

```typescript
// flight-recorder — capture interface (signature sketch, D-0001: design, no implementation).
// Posture-independent: whether the machinery behind the seam is owned code or a wrapped
// SDK core, this surface is what the app AND the four built-in taps program against.
//
// Three runtime entry points: the record path (attach → record), capture, health.
// createFlightRecorder/dispose are composition-root lifecycle, not app-facing calls.
// Everything else in this file is a record shape, not a callable.
//
// ── Invariants (the interface's real content) ─────────────────────────────────
// I1  No throw crosses the seam outward. record(), attach(), detach(), capture() and
//     health() never throw into the caller; every internal failure — a projection
//     walk that throws in app getters/proxies/toJSON included — is a COUNTED drop.
// I2  Serialize-at-capture. When record() returns, the recorder holds no reference to
//     the caller's entry. Stored bodies own their memory: truncation COPIES, never
//     slices (a V8 SlicedString/SpiderMonkey dependent string retains its parent).
// I3  Bounded by construction. Per bucket, count ≤ maxCount and bytes ≤ maxBytes at
//     every instant; bytes are serialized UTF-8, metered once at capture. The global
//     10–50 MB envelope is enforced STATICALLY by the config validator
//     (Σ maxBytes + header allowance ≤ envelope), never by cross-bucket eviction.
// I4  The ledger reconciles. recorded = retained + evicted + oversized, and
//     projectionFailures counts entries that never became records. A bundle accounts
//     for every absence; there is no uncounted loss.
// I5  Seal = O(n) copy of immutable record references + a per-bucket cut marker
//     {seq, wallMs, monoMs}. Index snapshots are forbidden — they tear under
//     continued capture.
// I6  Observation only. The recorder subscribes to nothing, publishes nothing,
//     classifies nothing, participates in no transaction, and never reports through
//     itself. The injected transport MUST NOT route through any fetcher a tap wraps
//     (structural no-self-capture: the http tap wraps the app's orval mutator; the
//     recorder's POST rides a bare fetch behind the transport seam).
// I7  No privileged callers. The four built-in taps (mqtt, http, xstate, log) and
//     every failure net — window.onerror, unhandledrejection, the React boundary
//     adapter — use exactly this surface. If a built-in needs more, this interface
//     is wrong.
// I8  Config is fail-safe-loud. createFlightRecorder NEVER throws (a diagnostics
//     tool must not take the app down at boot — the ruled choice; fail-fast was
//     considered and refused). An invalid bucket row disables that bucket; every
//     rejection appears in health().configErrors and in every bundle header.
//     "Silent" is averted by the ledger and the one-line startup assertion
//     (health().configErrors.length === 0), not by throwing.
// I9  capture() is synchronous through the seal; bundling, compression (worker-side),
//     and delivery run behind the seam, never on the record() path. The interface is
//     main-thread only.
// I10 Layering: record() is for services and state machines, enforced by the repo's
//     restricted-imports discipline (D-0002) — no stronger rule invented here.
//     Components reach the recorder only through the error-boundary adapter.

// ── Construction (composition root, service startup) ──────────────────────────

export function createFlightRecorder(config: RecorderConfig): FlightRecorder;

export interface RecorderConfig {
  /** THE kill switch: one bit, read once at construction (the seam ruling — see
   *  report; a recorder-owned remote flag is refused). Disable-without-redeploy
   *  rides whatever channel already feeds startup config, plus a reload. Disabled:
   *  every entry point is an inert no-op and health().enabled === false. */
  enabled: boolean;

  /** RD-7 identity seeds. pageIncarnationId and per-capture bundleId are generated
   *  behind the seam; whether deviceId exists for page code is intake item i. */
  identity: { appBuild: string; deviceId?: string };

  /** The bucket table — 0060 ChannelPolicy's proven shape: declarative rows,
   *  validated and FROZEN at construction. No runtime add/remove (refused: 0050's
   *  addSink dynamism is the wrong precedent for evidence machinery — the bundle's
   *  config snapshot must stay truthful for the whole session). A bucket not
   *  declared here does not exist. */
  buckets: Record<string, BucketPolicy>;

  /** ONE rule set for the WHOLE bundle (0050's rule shape, shared as rules — the
   *  facade's choke point covers facade sinks; this one covers bucket projections
   *  AND, at seal, the three fields that bypass them: trigger error/stack, caller
   *  context, config snapshot). Redaction stamps {redacted, ruleId} markers,
   *  structurally distinct from truncation (RD-10). Per-bucket rule sets refused;
   *  path rules provide per-bucket scoping where needed. */
  redaction: RedactionRules;

  /** Trigger discipline — global; per-bucket windows refused. */
  trigger?: {
    /** Suppression window after a seal; suppressed triggers are counted. Default 30_000. */
    cooldownMs?: number;
    /** Post-trigger window before the bundle closes: first of ms / maxItems, across
     *  all buckets. Default { ms: 0 } — seal immediately. Post-window records are
     *  identified by seq > cut.seq; no extra field. */
    postTrigger?: { ms?: number; maxItems?: number };
  };

  /** Nets the recorder can arm itself — each is internally an adapter over
   *  capture() (I7). The React boundary cannot be armed from config (React 18.3.1
   *  has no root error hook) and is a separate adapter export below. Chaining with
   *  incumbent handlers: the nets call any previous handler; intake item g. */
  nets?: { windowErrors?: boolean; unhandledRejections?: boolean };

  /** The delivery seam — the posture boundary. Retry/backoff/one-at-a-time,
   *  worker-side gzip, and the wire format live behind it (owned fetch+backoff or
   *  a wrapped SDK transport; the interface cannot tell). MUST NOT route through
   *  any tapped fetcher (I6). Its errors are its own to absorb: the recorder never
   *  reports through itself. */
  transport: (bundle: SealedBundle) => void | Promise<void>;
}

export interface BucketPolicy {
  maxCount: number;
  /** Serialized-UTF-8 budget for retained bodies. Per-record index/meta overhead is
   *  outside the meter and bounded by maxCount (stated, per plan Q2). */
  maxBytes: number;
  /** Per-entry ceiling; a larger projection is truncated WITH COPY and marked
   *  {truncated, originalSize}. Default min(maxBytes / 8, 256 KiB). An entry whose
   *  truncation floor still exceeds maxBytes is dropped and counted oversized. */
  maxEntryBytes?: number;
  /** Pre-serialization narrowing/scrub — the ONLY behavior a row may carry. Runs
   *  app code and may throw: a throw is a counted projectionFailure, never an
   *  exception into the tap (I1). Omitted: the entry goes straight to the bounded
   *  serializer (cycle-safe, depth/breadth-capped, structured {elided} markers for
   *  every elision and JSON coercion — never only in-band strings). */
  project?: (entry: unknown) => unknown;
  /** RD-8 — required on EVERY row, uniformly: built-in taps ship their own ids
   *  (recorder.mqtt@1, recorder.http@1, recorder.xstate@1, recorder.log@1), so the
   *  validator needs no built-in/app distinction. */
  schema: { schemaId: string; schemaVersion: string };
}

export interface RedactionRules { keys?: string[]; paths?: string[]; patterns?: RegExp[] }

// ── The handle: three entry points ────────────────────────────────────────────

export interface FlightRecorder {
  /** Entry point 1 — the record path. Stamps attachedSince and increments the
   *  bucket's attach epoch, so a bundle distinguishes "quiet" from
   *  "not-yet-attached" and boot-window gaps are visible. One live tap per bucket:
   *  a second attach() supersedes the first (old tap marked detached
   *  'superseded', epoch++) — matching source-recreation reality. Unknown bucket
   *  name (the expected typo under loose TS): an inert tap plus a counted config
   *  error — no throw (I1/I8). Attach order breaks the plan's init cycle: the
   *  recorder has no dependencies, so it is constructed first; each tap attaches
   *  as its source constructs. */
  attach(bucket: string): RecorderTap;

  /** Entry point 2 — the ONE trigger path. Explicit app calls and every net land
   *  here identically. Synchronous through the seal (I5/I9): per bucket, copy the
   *  entry references, stamp the cut marker, snapshot DropCounters and the
   *  correlation open-set. Returns a receipt, never a promise — delivery is not
   *  the caller's concern. 'suppressed' inside cooldownMs of a seal; 'coalesced'
   *  while a post-trigger window holds a bundle open (reason appended to that
   *  bundle's header). Both are counted (health().triggers). */
  capture(reason: string, opts?: CaptureOptions): CaptureReceipt;

  /** Entry point 3 — the recorder's own state; 0070's IngressStats move: a cheap
   *  immutable snapshot that doubles as the assertion surface. The startup guard
   *  against I8 hiding a typo'd config in the fleet is one line:
   *  health().configErrors.length === 0. */
  health(): RecorderHealth;

  /** Composition-root lifecycle only (tests, HMR): disarms the nets it armed,
   *  frees rings. Not an app-facing entry point. */
  dispose(): void;
}

export interface RecorderTap {
  /** THE sink. Synchronous, fire-and-forget, never throws, never blocks (I1).
   *  Inside, in order, before return: project → bounded-serialize (walk guarded;
   *  app code may throw) → redact → meter UTF-8 → truncate-with-copy → stamp
   *  {seq, wallMs, monoMs} → evict-oldest to fit (I2/I3). meta carries only facts
   *  the tap knows; policy lives in config — nothing per-call is policy. */
  record(entry: unknown, meta?: RecordMeta): void;

  /** Marks the tap dead in health and every later bundle. The composition root
   *  wires source teardown here (boundary dispose → detach('boundary-disposed')).
   *  Honest limit: a source that dies without teardown is detectable only as
   *  attachedSince + a stagnant lastRecordAt — the bundle exposes both and the
   *  reader judges; no liveness oracle is pretended. */
  detach(reason: string): void;
}

export interface RecordMeta {
  /** Record type within the bucket (e.g. 'message' | 'telemetry' for mqtt). */
  kind?: string;
  /** RD-4. */
  direction?: 'in' | 'out';
  /** Joins multi-record exchanges (http request-record + outcome-record). The
   *  recorder keeps a bounded per-bucket open-set: phase 'open' adds the id,
   *  'settled' removes it; ids still open at seal are stamped into the bucket
   *  block — in-flight-at-seal is explicit even when either half was evicted. */
  correlationId?: string;
  /** Default 'settled' (a point event). */
  phase?: 'open' | 'settled';
  /** Terminal outcome for settled records: 'fulfilled' | 'aborted' | 'error' |
   *  app-defined (RD-4). */
  outcome?: string;
  /** RD-6 — per payload. */
  mimeType?: string;
  encoding?: 'utf-8' | 'base64' | 'json';
  /** RD-9: marks a self-sufficient starting point (the xstate tap stamps its
   *  periodic persisted-snapshot records). At seal, oldestIsComplete = no
   *  evictions yet OR the oldest retained record carries this bit. */
  checkpoint?: boolean;
}

export interface CaptureOptions {
  /** Header material. The stack is parsed behind the seam; error, stack, and
   *  context all pass the redaction rules at seal (whole-bundle ruling, plan Q13). */
  error?: unknown;
  context?: Record<string, unknown>;
}

export type CaptureReceipt =
  | { outcome: 'sealed'; bundleId: string }
  | { outcome: 'coalesced'; bundleId: string } // joined the open bundle
  | { outcome: 'suppressed' }                  // cooldown; counted
  | { outcome: 'disabled' };                   // kill switch

// ── Health (the observation block; also embedded in every bundle header) ─────

export interface RecorderHealth {
  readonly enabled: boolean;
  /** I8 residue — startup validation rejections, human-readable, stable order. */
  readonly configErrors: readonly string[];
  readonly buckets: Readonly<Record<string, BucketHealth>>;
  readonly triggers: { readonly sealed: number; readonly coalesced: number; readonly suppressed: number };
  /** attach() calls naming undeclared buckets (each also lands in configErrors once). */
  readonly unknownBucketRecords: number;
}

export interface BucketHealth {
  readonly attachedSince?: number;  // absent = never attached (≠ quiet)
  readonly detachedAt?: number;
  readonly detachReason?: string;
  readonly attachEpoch: number;     // increments per attach/supersede
  readonly lastRecordAt?: number;
  readonly seq: number;             // last stamped sequence number
  readonly count: number;
  readonly bytes: number;           // current metered total
  readonly drops: DropCounters;
}

/** The ledger (I4). All counters cumulative since construction. */
export interface DropCounters {
  readonly evicted: number;            // ring pressure (count or bytes)
  readonly truncated: number;          // stored, but cut, with markers
  readonly oversized: number;          // unstorable even at truncation floor
  readonly projectionFailures: number; // the walk or project() threw
}

// ── The sealed bundle (input to the transport seam; the OpenAPI contract's seed) ─

export interface SealedBundle {
  readonly header: BundleHeader;
  readonly buckets: Readonly<Record<string, SealedBucket>>;
}

export interface BundleHeader {
  readonly formatVersion: string;                   // RD-7
  readonly bundleId: string;
  readonly baseBundleId?: string;                   // supplements name their base
  readonly deviceId?: string;
  readonly pageIncarnationId: string;
  readonly appBuild: string;
  /** RD-2/RD-3: one shared clock domain; every record's monoMs offsets this origin. */
  readonly clockOrigin: { readonly wallMs: number; readonly monoMs: number };
  readonly sealedAt: { readonly wallMs: number; readonly monoMs: number };
  readonly trigger: {
    readonly reason: string;
    readonly coalescedReasons: readonly string[];
    readonly error?: { readonly message: string; readonly stack?: string; readonly markers?: readonly LossMarker[] };
  };
  /** Digest, not the raw config — plus the I8 residue, so a thinned config is visible. */
  readonly configDigest: string;
  readonly configErrors: readonly string[];
  /** Full health snapshot at seal: drop ledger, byte totals, tap liveness. */
  readonly health: RecorderHealth;
}

export interface SealedBucket {
  readonly schema: { readonly schemaId: string; readonly schemaVersion: string }; // RD-8
  readonly cut: { readonly seq: number; readonly wallMs: number; readonly monoMs: number }; // I5
  readonly counters: DropCounters;              // at cut
  readonly attach: { readonly attachedSince?: number; readonly detachedAt?: number; readonly detachReason?: string; readonly epoch: number };
  readonly oldestIsComplete: boolean;           // RD-9
  readonly droppedBeforeWindow: number;         // RD-9 (== counters.evicted at cut)
  readonly openAtSeal: readonly string[];       // RD-4: correlation ids in flight
  readonly records: readonly CapturedRecord[];  // seq order; seq > cut.seq ⇒ post-trigger
}

export interface CapturedRecord {
  readonly seq: number;                          // RD-1: per-bucket monotonic
  readonly wallMs: number;                       // RD-2
  readonly monoMs: number;                       // offset from header.clockOrigin
  readonly kind?: string;
  readonly direction?: 'in' | 'out';
  readonly phase?: 'open' | 'settled';
  readonly outcome?: string;
  readonly correlationId?: string;
  readonly mimeType?: string;                    // RD-6
  readonly encoding?: 'utf-8' | 'base64' | 'json';
  readonly bytes: number;                        // metered UTF-8 size of body
  readonly body: string;                         // owns its memory (I2)
  readonly markers?: readonly LossMarker[];      // structured, never only in-band
}

export type LossMarker =
  | { readonly truncated: true; readonly originalSize: number }              // RD-5
  | { readonly redacted: true; readonly ruleId: string; readonly at?: string } // RD-10
  | { readonly elided: true; readonly at: string; readonly cause: 'depth' | 'breadth' | 'coercion' };

// ── react-net.ts (separate module: the core stays React-free) ─────────────────

import type { ComponentType, ReactNode } from 'react';

/** The charter's React net. An adapter with ZERO privileged access (I7): it only
 *  calls recorder.capture('react-error-boundary', { error, context }) — React
 *  18.3.1 has no root error hook, so this is a component the app mounts, not a
 *  hook the recorder arms. The only recorder import permitted in React land (I10). */
export function createRecorderBoundary(
  recorder: FlightRecorder,
): ComponentType<{ fallback: ReactNode; children?: ReactNode }>;
```

### Worked example

```typescript
// ── Composition root, service startup ─────────────────────────────────────────
const recorder = createFlightRecorder({
  enabled: startupConfig.flightRecorder !== 'off',      // the kill-switch seam
  identity: { appBuild: BUILD_ID, deviceId: startupConfig.deviceId },
  redaction: { keys: ['password', 'token'], paths: ['payload.operator.*'] },
  trigger: { cooldownMs: 30_000, postTrigger: { ms: 0 } },  // defaults, spelled out
  buckets: {
    // The mqtt bucket is ONE declarative row — same row shape any app bucket uses.
    mqtt: {
      maxCount: 5_000,
      maxBytes: 16 * MiB,               // Σ over all rows validated ≤ envelope (I3)
      maxEntryBytes: 64 * KiB,
      schema: { schemaId: 'recorder.mqtt', schemaVersion: '1' },
      // no project(): wire-1 events are already plain validated data — the default
      // bounded serializer is the projection
    },
    http:   { maxCount: 1_000, maxBytes: 8 * MiB, schema: { schemaId: 'recorder.http', schemaVersion: '1' } },
    xstate: { maxCount: 10_000, maxBytes: 8 * MiB, project: projectInspectionEvent,
              schema: { schemaId: 'recorder.xstate', schemaVersion: '1' } },
    log:    { maxCount: 2_000, maxBytes: 2 * MiB, schema: { schemaId: 'recorder.log', schemaVersion: '1' } },
  },
  transport: postBundleToReportEndpoint,  // bare fetch + backoff; never the wrapped fetcher (I6)
});
// The one-line guard fail-safe-loud (I8) demands:
console.assert(recorder.health().configErrors.length === 0, recorder.health().configErrors);

// ── The mqtt tap: a privilege-free adapter over the same surface (I7) ─────────
// Recorder exists before the boundary (it has no dependencies), so attach-before-
// traffic is just construction order — no init cycle.
const mqttTap = recorder.attach('mqtt');                 // stamps attachedSince
const stop = boundary.actor.on('*', (ev) => {            // 0060 wire-1 wildcard tap
  if (ev.type === 'telemetry') {
    mqttTap.record(ev.event, { kind: 'telemetry' });
  } else {
    mqttTap.record(
      { channel: ev.channel, topic: ev.topic, params: ev.params, payload: ev.payload },
      { kind: 'message', direction: 'in', mimeType: 'application/json', encoding: 'json' },
    );
  }
  // record() serialized, redacted, metered, stamped, and (if needed) evicted before
  // returning; a payload whose getter throws became drops.projectionFailures — the
  // listener never sees an exception (I1) and the dispatch turn never slows.
});
onBoundaryDispose(() => { stop(); mqttTap.detach('boundary-disposed'); }); // liveness truth

// ── A trigger, sealing and bundling ───────────────────────────────────────────
// From a service or state machine (I10) — or identically from a net:
const receipt = recorder.capture('pump-controller-stuck', { error });
// receipt: { outcome: 'sealed', bundleId: 'b_01J…' }
//
// Synchronously, before capture() returned (I5/I9): each bucket's immutable record
// references were pointer-copied, cut markers {seq, wallMs, monoMs} stamped, the
// drop ledger and correlation open-set snapshotted. The SealedBundle — header with
// identity, clock origin, trigger, configDigest + configErrors, full health; per-
// bucket records with seq/two clocks/markers, oldestIsComplete, droppedBeforeWindow,
// openAtSeal — then flowed to `transport` behind the seam (worker gzip, retry, POST).
const second = recorder.capture('pump-controller-stuck', { error });
// second: { outcome: 'suppressed' } — inside cooldownMs; counted in health().triggers.
```

### Refusals

- Per-bucket redaction rule sets — one rule set covers the whole bundle (0050's ruling transplanted as shared rules): two buckets must never disagree about what may leave the device, and path-scoped rules already give per-bucket precision without a second knob.
- Per-bucket post-trigger windows and per-bucket cooldowns — the post-trigger window exists to catch the aftermath of ONE incident, which is not a per-stream property; one global {ms, maxItems} default zero.
- Per-bucket kill switches and a per-row enabled flag — a disabled bucket is an undeclared bucket; two spellings of absence is one too many, and under loose TS every extra boolean is an unvalidated liability. The kill switch is one recorder-level bit.
- A recorder-owned remote kill flag — refused in favor of the config seam: a recorder that polls its own remote-config channel is new failure machinery inside the tool meant to observe failures, and it violates observe-only (I6). Disable-without-redeploy rides the app's existing startup-config channel plus a reload.
- Runtime bucket registry mutation (addBucket/removeBucket, 0050's addSink dynamism) — the table is compiled and frozen at construction, 0060-style; a mutable registry makes the bundle's config snapshot a lie mid-session and hands agent churn an unauditable second config surface.
- A global byte budget enforced by cross-bucket runtime eviction — the plan's own enumeration shows global evict-oldest starves the quiet buckets (xstate, log) whose sparse records are oldest; the envelope is enforced statically by the validator (Σ maxBytes ≤ envelope), a config error otherwise.
- Any read/query API over ring contents (getEntries, filters, subscriptions) — the only reader is the seal; a read surface invites the app to treat the recorder as a data store and re-creates exactly the live-reference/tearing hazards serialize-at-capture and copy-seal exist to kill.
- Tap-supplied timestamps and injected clocks — capture time IS stamp time under serialize-at-capture; source-side timestamps are payload data. No deps parameter: config stays one object, and tests use fake timers plus monotonicity properties.
- Trigger threshold rules and auto-subscription to error surfaces — charter-excluded (D-0040) and restated as a refusal the interface enforces: capture(reason) is the only trigger input, and every net is an adapter over it; the recorder classifies nothing.
- fail-fast config validation — considered and refused (I8): a diagnostics tool must not take the app down at boot. The cost (an inert bucket shipping unnoticed) is repaid loudly: configErrors in health(), in every bundle header, and a one-line startup assertion.
- React exports in the core — the error boundary is a separate adapter module over capture(); the core stays React-free, and the boundary is the single recorder import permitted in component land (I10).

### Downstream impact

- The four built-in taps become plain adapter modules (attach + source-subscribe + optional project), each owning its recorder.* schemaId; multiplexing 0070's single inspect slot (if the mqtt bucket ever wants pipeline verdicts) happens in the adapter/composition layer, never in the recorder.
- The composition root gains two explicit obligations: construction order (recorder first — it has no dependencies — then taps attach as each source constructs, dissolving the plan's init-order cycle) and teardown wiring (source dispose → tap.detach), which is what makes the bundle's liveness block truthful.
- The report-endpoint OpenAPI contract is authored from SealedBundle/BundleHeader/CapturedRecord/LossMarker as sketched — these shapes become the vendored schema 0010's pipeline generates types and validators from (D-0010/D-0006).
- The entire adopt-vs-build posture decision collapses into the `transport` seam: retry/backoff/one-at-a-time, worker-side gzip, last-gasp policy, and wire format are transport-implementation concerns; switching posture touches zero call sites and zero taps.
- The restricted-imports lint config (D-0002 discipline) gains rows: services/machines may import the recorder module; components may import only the react-net adapter module.
- Question 15's spike/property list keys to the invariants by number: I3/I4 ledger reconciliation and retention-not-meter boundedness (the SlicedString hazard) as fast-check properties; I1 throw-containment verified per tap in each adapter's tests; projection cost measured against live app-shaped objects through this exact record() path.
- 0050's RedactionRules shape becomes a small shared module (rules shared, choke points separate) — a build-order note for whoever builds the facade, and the log bucket row can be declared now with no tap attached (the bundle honestly says not-yet-attached), so no 0050 dependency forms.
- The app's startup-config channel must carry the one `enabled` bit for the kill switch to mean disable-without-redeploy; if no such channel exists, that is an intake item, not a recorder feature.
- Fleet monitoring inherits the fail-safe-loud contract: because construction never throws, someone must watch configErrors (startup assertion in dev/tests; the bundle header in production) — an app obligation the report states.

## Variant: declarative registry

### Stance

Policy is data, and the table is both the interface and the audit log. Every hard problem this recorder owns — byte bounds, truncation floors, redaction, post-trigger windows, kill switch, config snapshot in the bundle (RD-7) — is policy, and policy expressed as rows can be validated at startup, snapshotted into every bundle for free, overridden at runtime through one narrow seam, and read as a single page before the recorder does anything. In an app whose type system is confessedly non-load-bearing under heavy agent churn, runtime validation of data is the only enforcement that survives: a validator can check `maxBytes: 16MB` on a row; it can never check that an injected ring object actually bounds, copies on truncate, or holds no live references — which is why the port model fails here, every port being a place agent-authored code can violate serialize-at-capture without any startup check noticing. The minimal-opaque alternative fails the same test from the other side: its knobs still exist, but scattered in code, invisible per-callsite, and unsnapshotable. This is 0060's proven ChannelPolicy idiom generalized — one deep module (ring, meter, seal, clocks, nets hidden) behind a declarative table plus one `BucketHandle` — and the four built-in taps prove the interface by being ordinary, privilege-free clients of it.

### Artifact (verbatim)

```typescript
// flight-recorder — capture interface, registry variant ("the table is the design").
// Signature sketch for the 0160 report; no implementation. House idiom: 0060's
// ChannelPolicy registry generalized — a bucket is a policy row, the table is
// validated and COMPILED ONCE at startup, and everything the recorder will do is
// readable in the table before it does anything. Posture-independent: an owned
// core or a wrapped Sentry core both sit behind `createRecorder` + `deliver`.

// ── Clocks (RD-2, RD-3) ──────────────────────────────────────────────────────

/** One shared origin for ALL buckets. The recorder stamps records itself —
 *  taps never supply timestamps. Test seam only; production default is
 *  Date.now + performance.now anchored once at construction. */
export interface ClockSource {
  wall(): number; // epoch ms
  mono(): number; // ms offset from the single shared origin
}

// ── Bucket rows ──────────────────────────────────────────────────────────────

/**
 * Budgets are serialized-UTF-8 bytes (TextEncoder semantics), metered ONCE at
 * capture on the projected body. Meter ruling (Q2): metered size = body bytes
 * + RECORD_OVERHEAD_BYTES (a documented constant, default 256) per entry, so
 * the envelope arithmetic covers the index too. Eviction is evict-oldest
 * WITHIN the bucket only — there is no cross-bucket eviction anywhere (see
 * RecorderConfig.globalMaxBytes).
 */
export interface BucketCapacity {
  maxCount: number;
  maxBytes: number;
  /** Single-entry ceiling. A projected body above it is truncated to fit —
   *  truncation always COPIES into a fresh string (never a slice view: a V8
   *  SlicedString retains its 12 MB parent) and stamps a structured
   *  {truncated, originalSize} marker (RD-5). Startup validation enforces
   *  maxEntryBytes >= 512 so the marker always fits; refusal is thereby
   *  unrepresentable in a valid table. */
  maxEntryBytes: number;
}

/** Default {ms: 0, maxItems: 0} — seal immediately (Q8). */
export interface PostTriggerWindow { ms: number; maxItems: number }

/** Id into the shared field/path rule-set module (0050's RULES, not its choke
 *  point — Q13). Rules are data; the row carries a reference, never code. */
export type RedactionRulesetId = string;

/**
 * The row's only code slots. The projection walk executes app code (getters,
 * proxies, toJSON) and MAY THROW — a throw anywhere in scrub/serialize is a
 * COUNTED drop (drops.projectionFailed), never an exception into the tap and
 * never silent. The default serializer is depth/breadth-bounded and
 * cycle-safe, and every elision or coercion it performs emits a STRUCTURED
 * marker in CapturedRecord.markers — never only an in-band string.
 */
export interface Projection {
  scrub?: (value: unknown) => unknown; // pre-serialize; may throw => counted drop
  maxDepth?: number; // default 8
  maxBreadth?: number; // default 100
  /** Full override; must return an already-bounded string. Rare. */
  serialize?: (value: unknown) => string;
}

/** One row = one bucket. Data columns + two injected code slots — exactly the
 *  0060 ChannelPolicy shape (validate was injected there; project/scrub here). */
export interface BucketPolicy {
  enabled: boolean;
  capacity: BucketCapacity;
  projection?: Projection; // default: bounded structured-marker serializer
  redaction?: RedactionRulesetId; // applied at projection time; irreversible, so marked {redacted, ruleId} (RD-10)
  /** REQUIRED for app-declared rows (RD-8); the four built-in names
   *  ('mqtt' | 'http' | 'xstate' | 'log') carry recorder-owned schema ids and
   *  must omit this — both enforced by startup validation. */
  schema?: { schemaId: string; schemaVersion: string };
  postTrigger?: PostTriggerWindow; // default zero
}

export type BucketTable = Record<string, BucketPolicy>;

// ── Trigger rows ─────────────────────────────────────────────────────────────

/** The nets are rows too: armed/disarmed is a column, not code. The recorder
 *  evaluates NOTHING (charter): no threshold rules exist in this table and
 *  none may be added — a trigger is capture(reason) or an armed net firing. */
export interface TriggerPolicy {
  /** Suppressed triggers are COUNTED (health.trigger.suppressed*), never silent. */
  cooldownMs: number;
  dedupWindowMs: number; // same-reason coalescing window
  nets: {
    onerror: { enabled: boolean };
    unhandledrejection: { enabled: boolean };
    /** React 18.3.1 has no root error hook: this row arms ACCEPTANCE of
     *  FlightRecorder.nets.reactBoundaryOnError; mounting the recorder-supplied
     *  boundary component is enumerated app work, not an armed hook. */
    reactBoundary: { enabled: boolean };
  };
}

// ── Config root ──────────────────────────────────────────────────────────────

export interface RecorderConfig {
  enabled: boolean;
  buckets: BucketTable;
  trigger: TriggerPolicy;
  /**
   * The 10–50 MB envelope, enforced as a STARTUP CONSTRAINT, not a runtime
   * policer: validation fails any table where Σ row maxBytes (+ overhead
   * headroom) > globalMaxBytes. There is no cross-bucket runtime eviction, so
   * a noisy bucket can never starve a quiet one (Q2's starvation hazard is
   * closed by construction, checkable because bounds are data).
   */
  globalMaxBytes: number;
  /**
   * THE delivery seam — one slot, because this interface is posture-
   * independent: behind it sits the owned retry queue or a wrapped Sentry
   * Transport, each with its own config. Invariants: the recorder never
   * chooses a transport, never sends through the app's wrapped HTTP machinery
   * (so the http tap structurally cannot capture the recorder's own POST),
   * and never reports its own failures through itself.
   */
  deliver: (bundle: SealedBundle) => void;
  clock?: ClockSource;
}

/**
 * ENTRY POINT. `config: unknown` is deliberate: the app's TS strictness is
 * non-load-bearing, so the parameter type promises nothing and runtime
 * validation is the enforcement. RULING — fail-safe, per row, counted:
 * an invalid row becomes a DEAD ROW (its handle accepts and counts every
 * record() as a drop, reason 'invalid-config'); the rest of the table
 * compiles; a garbage table yields a recorder with every row dead. Never
 * throws — a diagnostics feature must not take the app down — and never
 * silent: every rejection is in health().config.rejectedRows and therefore in
 * every bundle. Row-by-row validation with partial acceptance is well-defined
 * precisely BECAUSE config is rows of data — the property neither an opaque
 * surface nor a port model can offer.
 */
export function createRecorder(config: unknown): FlightRecorder;

// ── Capture input and stored records ─────────────────────────────────────────

export interface CaptureInput {
  /** Projected at capture inside record(); after record() returns, the
   *  recorder holds NO reference to this value. A string body skips the walk
   *  but not the meter or truncate-with-copy. */
  body: unknown;
  /** 'checkpoint' = a complete starting point (e.g. xstate persisted
   *  snapshot); drives ring self-sufficiency (RD-9). */
  kind: "event" | "checkpoint";
  direction?: "in" | "out"; // RD-4
  /** HTTP idiom: request-record + outcome-record joined by correlationId —
   *  pair-at-completion misses the in-flight exchange, so the two halves are
   *  two record() calls. The recorder stores both and never joins; a request
   *  whose outcome is absent at seal reads as in-flight (RD-4). */
  role?: "request" | "outcome";
  outcome?: "fulfilled" | "rejected" | "aborted" | "in-flight";
  correlationId?: string;
  mimeType?: string; // default 'application/json' (RD-6)
  /** Small index string: topic, 'GET /v1/plants/{plantId}', event type. */
  label?: string;
}

/** Immutable, serialized, self-describing — the ONLY thing rings hold. */
export interface CapturedRecord {
  readonly seq: number; // per-bucket monotonic (RD-1)
  readonly wall: number; // RD-2
  readonly mono: number; // RD-2, shared origin (RD-3)
  readonly kind: "event" | "checkpoint";
  readonly direction?: "in" | "out";
  readonly role?: "request" | "outcome";
  readonly outcome?: "fulfilled" | "rejected" | "aborted" | "in-flight";
  readonly correlationId?: string;
  readonly mimeType: string;
  readonly encoding: "utf-8" | "base64"; // RD-6
  readonly label?: string;
  readonly body: string; // owned copy — never a slice view of a larger string
  readonly bytes: number; // metered once at capture
  readonly markers?: {
    readonly truncated?: { readonly originalSize: number }; // RD-5
    readonly redacted?: readonly { readonly ruleId: string; readonly path: string }[]; // RD-10
    /** Serializer-level loss — depth/breadth elision, Map/Set/undefined
     *  coercion — as structure, never only '[Circular]' in-band. */
    readonly elided?: readonly { readonly path: string; readonly kind: "depth" | "breadth" | "coercion" }[];
  };
}

export type RecordOutcome =
  | { accepted: true; seq: number; bytes: number; truncated: boolean }
  | { accepted: false; reason: "recorder-disabled" | "bucket-disabled" | "invalid-config" | "undeclared-bucket" | "projection-failed" };

// ── The handle — the whole surface a tap gets ────────────────────────────────

/**
 * Everything a tap — built-in or app — can do. The four built-ins are plain
 * clients of this type; if any needed more, the interface would be wrong (Q4).
 * Layering: record() is for services and state machines, never React
 * components — enforced by D-0002 restricted-imports on the recorder's entry
 * path; the interface adds no stronger runtime rule.
 */
export interface BucketHandle {
  readonly name: string;
  /** NEVER throws; synchronous; cost O(projected size); stamps seq + both
   *  clocks; serialize-at-capture. Eviction to make room is success + a
   *  counted drop on the evictee, not a failure. */
  record(input: CaptureInput): RecordOutcome;
  /** Tap liveness (Q4): lets a bundle distinguish "quiet" from
   *  "not-yet-attached"; with lastRecordAt it makes silent tap death
   *  (boundary dispose/recreate, facade reconfig) detectable in health. */
  tapAttached(meta?: { tap: string }): void;
  tapDetached(reason: string): void;
}

// ── The recorder ─────────────────────────────────────────────────────────────

/** Whitelisted runtime-mutable COLUMNS — the kill switch (Q6 ruling: a
 *  runtime-config seam over the same rows; the transport that carries an
 *  override — remote flag fetch, contracted config channel — is app wiring,
 *  never the recorder's, because the recorder must not act through itself).
 *  Code slots (projection, scrub) and capacities are startup-fixed; anything
 *  else in the object is ignored-and-counted, same fail-safe posture. */
export interface RuntimeOverrides {
  enabled?: boolean; // global kill
  buckets?: Record<string, { enabled?: boolean }>;
  nets?: Partial<Record<"onerror" | "unhandledrejection" | "reactBoundary", { enabled: boolean }>>;
}

export type CaptureOutcome =
  | { fired: true; bundleId: string }
  | { fired: false; suppressed: "cooldown" | "dedup" | "disabled" }; // counted

export interface FlightRecorder {
  /** TOTAL: an undeclared name returns a dead handle that counts drops as
   *  'undeclared-bucket' (visible in health) — never a throw. Declared rows
   *  return the compiled handle. Buckets exist at startup or not at all. */
  bucket(name: string): BucketHandle;
  /**
   * Explicit trigger. Pipeline: dedup/cooldown gate (suppressions counted) →
   * SEAL: per bucket, copy the entry references — O(n) pointer copies of
   * immutable records, no index snapshot (snapshots tear under continued
   * capture) — + a per-bucket cut marker → each row's post-trigger window
   * holds its bucket open for T ms / N items → deliver(bundle). A second
   * trigger inside an open window closes it (closedBy: 'secondTrigger') and
   * is itself subject to the cooldown gate. Seal is synchronous and small;
   * compression/POST live behind deliver.
   */
  capture(reason: string, opts?: { error?: unknown }): CaptureOutcome;
  applyOverrides(overrides: RuntimeOverrides): { applied: readonly string[]; rejected: readonly { path: string; reason: string }[] };
  /** Cheap snapshot; the same block is embedded in every bundle. */
  health(): RecorderHealth;
  /** The React-boundary net's callback (see TriggerPolicy.nets). */
  readonly nets: { reactBoundaryOnError(error: unknown, componentStack?: string): void };
  dispose(): void;
}

// ── Health (the recorder observing itself — 0070's IngressStats idiom) ───────

export interface BucketHealth {
  readonly count: number;
  readonly bytes: number;
  readonly seqHighWater: number;
  readonly drops: {
    readonly evictedByCount: number;
    readonly evictedByBytes: number;
    readonly projectionFailed: number; // drops too, or the accounting lies (Q2)
  };
  readonly truncated: number;
  readonly attachedSince: number | null; // null = never attached
  readonly lastRecordAt: number | null;
  readonly detached: { at: number; reason: string } | null;
}

export interface RecorderHealth {
  readonly enabled: boolean;
  readonly buckets: Readonly<Record<string, BucketHealth>>;
  readonly trigger: { readonly fired: number; readonly suppressedByCooldown: number; readonly suppressedByDedup: number };
  readonly config: { readonly rejectedRows: readonly { path: string; reason: string }[] };
  readonly undeclared: Readonly<Record<string, number>>; // record() calls to unknown buckets
  readonly overrides: { readonly active: RuntimeOverrides };
  readonly globalBytes: number;
}

// ── The sealed bundle (capture's output; delivery's input) ───────────────────

export interface CutMarker { readonly seq: number; readonly wall: number; readonly mono: number }

export interface SealedBucket {
  readonly name: string;
  readonly schema: { readonly schemaId: string; readonly schemaVersion: string };
  readonly records: readonly CapturedRecord[]; // pointer copies — cannot tear
  readonly cut: CutMarker; // buckets sealed ms apart are honest about it
  readonly completeFromStart: boolean; // oldest retained is a checkpoint, or nothing ever evicted (RD-9)
  readonly droppedBeforeWindow: number; // RD-9
  readonly health: BucketHealth; // frozen at seal
  readonly postTrigger?: { readonly records: readonly CapturedRecord[]; readonly closedBy: "ms" | "maxItems" | "secondTrigger" };
}

export interface SealedBundle {
  readonly formatVersion: string;
  readonly identity: { readonly bundleId: string; readonly pageIncarnationId: string; readonly deviceId?: string }; // RD-7; deviceId = intake item i
  readonly reason: string;
  readonly trigger: { readonly source: "app" | "onerror" | "unhandledrejection" | "reactBoundary"; readonly at: { wall: number; mono: number }; readonly error?: CapturedRecord };
  /** The row table itself, passed through the SAME redaction rules — the
   *  config snapshot RD-7 wants is free because config is data (Q13 covers
   *  trigger stack and snapshot, not only bucket records). */
  readonly configSnapshot: unknown;
  readonly health: RecorderHealth; // quiet vs not-yet-attached vs killed: all answerable
  readonly buckets: readonly SealedBucket[];
}

// ── Built-in taps: ordinary clients, shipped beside the core ─────────────────
// Proof of the no-privileges rule: each uses only BucketHandle.

export type Detach = () => void;

/** MQTT: wire-1 `actor.on('*')` — the VALIDATED layer, passive, no broker-
 *  interest side effect. It does not take 0070's single `inspect` slot. */
export function attachMqttTap(
  handle: BucketHandle,
  boundary: { actor: { on(type: "*", cb: (ev: unknown) => void): { unsubscribe(): void } } },
): Detach;

/** HTTP: wraps the caller-owned orval mutator/fetcher. Emits a request-record
 *  at dispatch and an outcome-record at settle, joined by a correlation id.
 *  A capture failure never fails the app's request (isolation is this
 *  adapter's contract, verified per Q15). NEVER hand the wrapped fetcher to
 *  delivery machinery — that is the self-capture loop. */
export function wrapHttpFetcher<F extends (...args: never[]) => Promise<unknown>>(
  handle: BucketHandle,
  fetcher: F,
): F;

/** xstate: one `actor.system.inspect()` observer per root; projects an OWNED
 *  record shape (raw InspectionEvent is not stable across v6); pushes a
 *  kind:'checkpoint' persisted snapshot at attach and per policy so RD-9 holds. */
export function attachXstateTap(
  handle: BucketHandle,
  root: { system: { inspect(observer: (ev: unknown) => void): { unsubscribe(): void } } },
): Detach;

/** Log: an 0050 facade Sink for addSink(id, sink) — optional, no build-order
 *  dependency on the facade existing. */
export function createLogSink(handle: BucketHandle): (record: { readonly level: string; readonly name: string; readonly msg: string; readonly fields: Record<string, unknown>; readonly time: number }) => void;
```

### Worked example

```typescript
import { createRecorder, attachMqttTap } from "flight-recorder";

const KB = 1024, MB = 1024 * KB;

// ── 1. Declare: the mqtt bucket is a ROW. Everything the recorder will do to
// mqtt traffic — bound it, redact it, hold a 2s aftermath — is on this page.
const recorder = createRecorder({
  enabled: true,
  globalMaxBytes: 32 * MB, // startup constraint: Σ row maxBytes must fit — validated, not policed
  trigger: {
    cooldownMs: 30_000,
    dedupWindowMs: 5_000,
    nets: { onerror: { enabled: true }, unhandledrejection: { enabled: true }, reactBoundary: { enabled: true } },
  },
  deliver: (bundle) => deliveryQueue.enqueue(bundle), // owned queue or Sentry-Transport wrap — capture doesn't care
  buckets: {
    mqtt: {
      enabled: true,
      capacity: { maxCount: 5_000, maxBytes: 16 * MB, maxEntryBytes: 64 * KB },
      redaction: "device-reports-v1",          // shared rule-set id (0050's rules, not its choke point)
      postTrigger: { ms: 2_000, maxItems: 200 }, // hold the bucket open for the aftermath
    },
    // xstate / http / log rows elided; an app row would add schema: {schemaId, schemaVersion}
  },
} /* typed `unknown` — rows are validated at runtime; a bad row dies counted, the rest compile */);

// ── 2. Configure/attach at the composition root: recorder FIRST (it depends on
// nothing), boundary second — this ordering breaks Q4's init-order cycle, and
// tapAttached stamps the marker that lets a bundle tell quiet from unattached.
const mqttHandle = recorder.bucket("mqtt");
const detach = attachMqttTap(mqttHandle, boundary); // wire-1 actor.on('*') — validated layer

// Inside attachMqttTap — ordinary handle calls, nothing privileged:
//   handle.tapAttached({ tap: "mqtt/wire-1" });
//   boundary.actor.on("*", (ev) => {
//     handle.record({
//       kind: "event", direction: "in", label: ev.channel,        // RD-4, index
//       correlationId: ev.packetId, mimeType: "application/json", // RD-6
//       body: ev.payload, // projected + redacted + metered INSIDE record(); no live ref survives
//     }); // returns {accepted:true, seq, bytes, truncated} — or a counted drop; never throws
//   });

// ── 3. Trigger: a machine reports a poison state.
const out = recorder.capture("orders/refill stuck in 'degraded' > 60s", { error });
// -> { fired: true, bundleId: "b-7f3a…" }
//    or { fired: false, suppressed: "cooldown" } — suppression is itself counted.
//
// Seal, per bucket: O(n) pointer-copies of the immutable CapturedRecords (no
// index snapshot — snapshots tear under continued capture) + a CutMarker
// {seq, wall, mono}. The mqtt row's window holds its bucket open 2 s / 200
// items, then deliver(bundle) fires with:
//
// bundle.buckets[mqtt] = {
//   records: [...], cut: { seq: 48211, wall: 1755948632101, mono: 812345.2 },
//   completeFromStart: false, droppedBeforeWindow: 412,      // RD-9 — honest ring
//   health: { bytes: 15_872_004, drops: { evictedByBytes: 401, evictedByCount: 0,
//             projectionFailed: 3 }, truncated: 11, attachedSince: 1755948... },
//   postTrigger: { records: [...], closedBy: "ms" },
// }
// A record over 64 KB arrived truncated-with-copy carrying
// markers.truncated = { originalSize: 1_248_311 } — never an in-band string.

// ── 4. Kill switch, same vocabulary at runtime: the app's flag wiring (its
// transport, not the recorder's) flips the column; the next bundle's
// configSnapshot + health.overrides SAY the bucket was killed, so an empty
// bucket is never ambiguous.
recorder.applyOverrides({ buckets: { mqtt: { enabled: false } } });
```

### Refusals

- No runtime bucket registration (no recorder.addBucket()). Buckets exist at startup or not at all: late registration reintroduces the attach-window ambiguity Q4 exists to kill and makes the table no longer the audit surface. A bucket that might be needed is declared as a row and disabled — flipping `enabled` is the sanctioned late bind.
- No pluggable storage/ring/serializer port per bucket — the port-model variant's centerpiece. Startup validation can check `maxBytes: 16MB`; it cannot check that an injected ring bounds, copies on truncate, or holds no live references. Under loose TS and agent churn, every port is an unverifiable place to break serialize-at-capture. The ring, meter, seal, and clocks are hidden machinery — that hiding IS the module's depth.
- No cross-bucket runtime eviction. The global envelope is enforced as a startup constraint over the rows (Σ maxBytes ≤ globalMaxBytes), never as a runtime policer — closing Q2's quiet-bucket starvation hazard by construction, and checkable only because bounds are data.
- No recorder-evaluated trigger rules (no 'N failures in T seconds' rows), even though a rules table would be a natural registry extension — refused by charter (D-0040): the recorder observes and classifies nothing. Trigger rows arm nets and set cooldowns; they never express predicates.
- No per-record observer/stream-out surface (no onRecord subscribers). The recorder is a sink, not a bus; a subscription surface would re-export live-ish flow and re-open the self-interference class Q11 enumerates. Observation is health() and the bundle.
- No recorder-fetched remote kill flag. The kill switch is applyOverrides — a runtime seam over whitelisted columns; the transport carrying an override (remote flag, contracted config channel) is app wiring, because the recorder must never act through machinery it observes.
- No type-level illegal-config enforcement as the safety story (no 0060-style conditional-type gymnastics on the table). createRecorder takes `unknown` on purpose: the app profile says the type system is not load-bearing here, so the compile-time surface promises nothing and runtime row validation is the one real gate — fail-safe, per row, counted, visible in every bundle.
- No worker-origin record() bridge — the interface is main-thread by charter; whether any app code runs in workers is intake item k, not a silent assumption.
- No delivery policy in this interface (no retry/backoff/parking columns). Capture ends at deliver(bundle) — one slot — because the surface is posture-independent: an owned queue and a wrapped Sentry Transport both fit behind it, and Q10 owns everything past it.

### Downstream impact

- Composition-root ordering becomes a stated rule: recorder constructed first (it depends on nothing), handles passed into boundary/app-service construction — this is what breaks the Q4 init-order cycle between 0060's constructor-only inspect slot and the HTTP wrap needing the boundary.
- The redaction rule-set format (fast-redact-style field/path rules, addressed by RedactionRulesetId) must be extracted into a module shared with 0050's future facade — the rules are shared, the choke points are not; whoever builds the facade consumes the same ids (Q13).
- The row schema needs a runtime validator at recorder init (hand-rolled or via the 0010 pipeline); the SealedBundle shape becomes the vendored OpenAPI contract the charter requires, so the bundle's types/validators are generated like any contracted surface (D-0010, D-0006).
- Q15's property tests target row invariants directly: bytes never exceed a row's caps (tested as retention, not metered bytes — the SlicedString hazard), every eviction/truncation/projection-failure increments a counter the bundle carries, seal never tears. The FMEA re-run enumerates over the table shape.
- D-0002's restricted-imports discipline gains one rule: the recorder entry path is importable from services/machines, not components — the existing lint mechanism, no new tooling.
- The kill-switch transport needs an owner: app wiring must forward whatever remote flag or config channel exists into applyOverrides; whether such a channel exists is a user fact (intake).
- If the adopt+wrap posture wins, the wrap implements exactly this surface: rows compile to the wrapped core's scopes/buffers, deliver() is a custom Transport re-shaping to the owned contract — Sentry's envelope protocol never escapes the wrap (the escape-hatch rubric criterion).
- An outbound-MQTT bucket, if Q5 pays for it, lands as 0060's pre-authorized policy-row addition plus one more attachMqttTap variant over the new emission — no interface change on this side.
- The four built-in taps ship as adapters beside the core (taps/), each with its own throw-containment contract verified per tap (Q11/Q15); the 0070 single-inspect-slot multiplex question dissolves for the MQTT bucket because the tap uses wire-1, not the kit slot — the report must still say so explicitly.

## Variant: ports and adapters

### Stance

The tap is the unit of failure, so the tap must be the unit of design. Every top-rated hazard in this track's own FMEA lives at the source seams, not in the rings: taps attach at different init phases (0060's constructor-only `inspect` slot is the house counterexample — using it forces the recorder to exist before the boundary while the http wrap needs `boundary.fetcher` to exist first, an init cycle no config table can express); taps die silently (boundary `dispose()`/recreate leaves held Unsubscribes pointing at a dead instance while capture keeps "working" over stale rings — the next bundle ships pre-incident history with no marker); and every tap sits inside someone else's latency-disciplined path, so isolation must be a per-tap contract, not a global hope. A minimal record()-only surface hides exactly these hazards: it cannot distinguish quiet from dead or from not-yet-attached, so its bundles lie by omission — the worst property diagnostic machinery can have. A config table cannot say *when*. The design therefore splits along what each proven house shape is good at: a declarative policy table compiled once for what a bucket HOLDS (0060's ChannelPolicy discipline), and a runtime-mutable registry with explicit attach/detach/probe lifecycle for when and where sources FEED it (0050's addSink discipline), with fault containment at every port-to-tap crossing (the recorder's own I12) and attribution-of-absence stamped into every bundle. Depth in Ousterhout's sense survives: a tap author sees a two-member TapDescriptor and a one-method BucketPort; projection, redaction, truncation-by-copy, byte metering, rings, seal, dedup, and delivery are all hidden behind them.

### Artifact (verbatim)

```typescript
// flight-recorder/capture — the owned capture surface (signature sketch).
// Posture-independent: whether delivery/nets machinery behind it is owned code
// or a wrapped Sentry core, the app and all four built-in taps program against
// THIS surface. Main-thread only; bundle assembly may use a worker internally.
//
// Shape: ports and adapters. The core is a port — record sink + seal + health —
// and every source is a tap ADAPTER with an explicit lifecycle. Two proven
// house shapes, each doing the half it is good at:
//   - bucket POLICY: declarative table, compiled once at construction (0060's
//     ChannelPolicy discipline) — what a bucket holds;
//   - tap ATTACHMENT: runtime-mutable registry (0050's addSink discipline) —
//     when and where sources feed it. A table cannot express attach ordering;
//     0060's constructor-only `inspect` slot is the counterexample. Program
//     order at the composition root expresses it exactly.
//
// Depth ledger: surface a tap author touches = TapDescriptor (2 required
// members) + BucketPort.emit (1 method). Hidden behind them: projection walk +
// containment, redaction, truncation-by-copy, byte metering, per-bucket rings,
// seq/clock stamping, seal copy, post-trigger window, trigger dedup/cooldown,
// bundle assembly, delivery, health accounting.

// ── Lifecycle invariants (the design's spine) ─────────────────────────────
// FR-1 (tap-safe port) Every TapPort/BucketPort method is TOTAL: no call a tap
//      makes on the port ever throws or blocks on I/O. Projection failures,
//      truncations, unknown-bucket emits, suppressed triggers are COUNTED in
//      health — never exceptions into the tap, never silent.
// FR-2 (contained tap) Every call the port makes INTO a tap (attach, teardown,
//      probe) is fault-contained: a throw marks the registration `faulted`,
//      increments health.tapFaults, and never crosses to the app or to other
//      taps. 0060's I12 covers wire-1 listeners only; FR-2 is the recorder's
//      own I12, applied at every seam it touches.
// FR-3 (attribution of absence) attachedSince is stamped by the port when
//      attach() returns; probes run at health() and again AT seal. A bundle
//      therefore distinguishes, per bucket: quiet (attached, alive, zero
//      records) / not-yet-attached (no stamp) / dead (probe or markDead).
//      Silent tap death is detectable at the latest at seal.
// FR-4 (no self-report) Delivery goes only through the injected BundleSink,
//      which MUST NOT route through any tapped seam — in particular not the
//      orval mutator the http tap wraps. The http tap therefore cannot see
//      the recorder's own POST. The recorder never fetches config either.
// FR-5 (observe, never classify or act) Reasons and records are recorded
//      verbatim; emit() returns void so no caller can branch on recorder
//      state; the recorder never subscribes, retries, or re-attaches host
//      seams on its own initiative.
// FR-6 (fail-fast construction, fail-safe attachment) createFlightRecorder
//      validates the whole config at runtime and THROWS, listing every defect:
//      under loose TS and agent-authored churn a half-configured recorder
//      ships bundles that lie about coverage — worse for diagnostic machinery
//      than a loud boot failure at the composition root. attach() never
//      throws (FR-2): wiring runs inside init paths that must not die.

export type BucketName = string;

// ── Record shapes ─────────────────────────────────────────────────────────

/** What a tap (or app service) hands to emit(). Live value in, nothing out. */
export interface CaptureEntry {
  /** Tap-declared discriminator, recorded verbatim (FR-5) —
   *  e.g. "message.plant/{plantId}/telemetry", "http.request", "xstate.snapshot". */
  kind: string;
  /** Live value. The PORT walks it — getters, proxies, toJSON execute inside
   *  the port's containment, not the tap's. Taps must not pre-serialize. */
  body: unknown;
  direction?: "in" | "out" | "internal";
  /** Terminal outcome, or "open" for the first leg of a correlated pair. A
   *  correlation still open at seal appears in BucketManifest.openCorrelations
   *  — in-flight-at-seal says so (record-shape reservation). */
  outcome?: "ok" | "error" | "cancelled" | "open";
  /** Joins request/outcome legs. Pair-at-completion misses the in-flight
   *  exchange; two records joined by id do not. */
  correlationId?: string;
  /** Defaults "application/json" / "utf8" (per-payload reservation). */
  mimeType?: string;
  encoding?: "utf8" | "base64";
  /** Ring self-sufficiency reservation: true when this record is a complete
   *  starting point (an xstate snapshot; any self-contained event). The
   *  manifest derives completeFromStart from the oldest retained record. */
  checkpoint?: boolean;
  /** Small flat side-index for the bundle; values copied at capture. */
  index?: Readonly<Record<string, string | number | boolean>>;
}

/** The stored form: bounded, immutable, serialized at capture. Rings hold no
 *  live references; sealing is O(n) pointer copies of these. */
export interface CapturedRecord {
  readonly bucket: BucketName;
  /** Per-bucket monotonic (reservation RD: sequence numbers). */
  readonly seq: number;
  /** Two clocks, one shared origin (see BundleManifest.monoOriginWallMs).
   *  Stamped by the port at emit — taps never supply time. */
  readonly wallMs: number;
  readonly monoMs: number;
  readonly kind: string;
  readonly direction?: "in" | "out" | "internal";
  readonly outcome?: "ok" | "error" | "cancelled" | "open";
  readonly correlationId?: string;
  readonly checkpoint: boolean;
  readonly payload: {
    readonly mimeType: string;
    readonly encoding: "utf8" | "base64";
    /** The serialized projection. Truncation happens BY COPY — a retained
     *  slice pins its parent string in V8/SpiderMonkey. */
    readonly body: string;
    /** UTF-8 size, metered exactly once, here, at capture. */
    readonly bytes: number;
    /** Structured marker, never only in-band. */
    readonly truncated?: { readonly originalSize: number };
  };
  /** Distinct from truncation by construction (reservation). */
  readonly redactions: readonly { readonly ruleId: string; readonly path: string }[];
  readonly index?: Readonly<Record<string, string | number | boolean>>;
}

// ── Bucket policy: the declarative half (0060's table discipline) ─────────

export interface RedactionRule {
  ruleId: string;
  /** Key/path predicate; runs DURING the projection walk, before byte
   *  metering, so redacted bytes never count and never persist. */
  match: string | ((path: readonly PropertyKey[], key: PropertyKey) => boolean);
}

/** One row per bucket, compiled once at construction. The table says what a
 *  bucket HOLDS; it deliberately cannot say when sources attach — that is
 *  program order at the composition root (see FlightRecorder.attach). */
export interface BucketPolicy {
  /** Capacity is count AND bytes; eviction is drop-oldest within the bucket
   *  and is always counted (BucketStats.evicted). */
  maxCount: number;
  maxBytes: number;
  /** Per-record ceiling; bounds the projection walk (what makes emit() safe
   *  inside someone else's latency path). Default min(64 KiB, maxBytes / 8).
   *  Over-budget bodies are truncated by copy with {truncated, originalSize}. */
  maxRecordBytes?: number;
  redact?: readonly RedactionRule[];
  /** App-bucket payload contract, stamped on the manifest (reservation).
   *  Built-in taps ship their own fixed schema ids instead. */
  schema?: { schemaId: string; schemaVersion: string };
  /** Pre-walk normalizer for values JSON cannot walk (actor refs, cycles,
   *  Map/Set). Runs inside containment: a throw is a counted
   *  projectionFailure for that record, never an exception into the tap. */
  project?: (body: unknown) => unknown;
}

// ── The port surface a tap holds ──────────────────────────────────────────

export interface BucketPort {
  readonly bucket: BucketName;
  /**
   * The one capture call — identical for built-ins, app taps, and app
   * services (no privileged path exists; the four built-ins are the
   * acceptance test). Synchronous: serialize-at-capture is non-negotiable,
   * so the bounded projection walk runs here. TOTAL (FR-1): projection
   * throws are counted drops; over-cap bodies truncate by copy; seq and both
   * clocks are stamped by the port. Returns void (FR-5): outcome is
   * health-countable, never caller-branchable.
   * Layering: callable from services/state machines; the component-layer
   * exclusion is the repo's restricted-imports lint discipline, not a
   * mechanism here.
   */
  emit(entry: CaptureEntry): void;
}

/** Everything a tap may do. Handed to attach(); valid until teardown runs. */
export interface TapPort {
  /** Scoped to the descriptor's declared buckets. An undeclared name returns
   *  an inert BucketPort whose emits count as health.configFaults — total,
   *  counted, never thrown (FR-1). */
  bucket(name: BucketName): BucketPort;
  /** Failure-net entry: same dedup/cooldown path as capture(); suppressions
   *  are counted. TOTAL; returns void — a net cannot await or branch. */
  trigger(reason: string, opts?: { key?: string }): void;
  /** The tap observed its own seam die (wire-2 'ended', facade sink removed).
   *  Marks liveness dead in health and in every later manifest (FR-3). Does
   *  NOT detach: the ring, its records, and the death marker stay for the
   *  next bundle — evidence of when capture stopped is itself evidence. */
  markDead(reason: string): void;
}

// ── The tap adapter: the first-class citizen ──────────────────────────────

export type TapTeardown = () => void;

export type TapLiveness =
  | { state: "alive" }
  | { state: "dead"; reason: string }
  /** A tap that cannot know reports "unknown" — never a fabricated "alive". */
  | { state: "unknown" };

export interface TapDescriptor {
  /** e.g. "mqtt", "http", "net.global-error", "app.audio-pipeline". */
  readonly id: string;
  /** Buckets this tap feeds; validated against the compiled table at attach
   *  (mismatch => `faulted` registration, counted — FR-2/FR-6 split). */
  readonly buckets: readonly BucketName[];
  /** Subscribe to the host seam. Runs fault-contained (FR-2); the returned
   *  teardown is the tap's ONLY resource, and is likewise contained. */
  attach(port: TapPort): TapTeardown;
  /** Pull-based liveness: invoked synchronously at health() and at seal.
   *  Must be cheap and must not touch the seam's hot path. A probe throw
   *  marks the tap faulted and reads as {state: "unknown"} (FR-2). */
  probe?(): TapLiveness;
}

export interface TapRegistration {
  readonly id: string;
  readonly state: "attached" | "faulted" | "detached";
  /** FR-3: stamped when attach() returned; absent = never attached. */
  readonly attachedSinceMonoMs?: number;
  /** Contained (FR-2). Re-attach after a host recreation is the composition
   *  root's move: detach the stale registration, attach a fresh descriptor —
   *  the old ring contents and the death marker remain until eviction. */
  detach(): void;
}

// ── Health: the recorder's own state (0070 IngressStats discipline) ───────

export interface BucketStats {
  readonly count: number;               // records retained now
  readonly bytes: number;               // retained now (capture-metered sums)
  readonly lastSeq: number;
  readonly evicted: number;             // count- or byte-pressure drops
  readonly truncated: number;
  readonly projectionFailures: number;  // COUNTED drops, never exceptions
  readonly redacted: number;
}

export interface TapHealth {
  readonly id: string;
  readonly state: "attached" | "detached" | "faulted";
  readonly attachedSinceMonoMs?: number; // FR-3: absent = never attached
  readonly liveness: TapLiveness;        // last probe / markDead verdict
  readonly lastEmitMonoMs?: number;      // corroborates quiet vs dead
  readonly buckets: readonly BucketName[];
}

export interface RecorderHealth {
  readonly buckets: Readonly<Record<BucketName, BucketStats>>;
  readonly taps: readonly TapHealth[];
  readonly totalBytes: number;
  readonly triggersFired: number;
  readonly triggersSuppressed: number;   // dedup/cooldown suppressions
  readonly tapFaults: number;            // FR-2 containment count
  readonly configFaults: number;         // undeclared-bucket emits etc. (FR-1)
  readonly sinkFailures: number;
}

// ── Seal, bundle, delivery ────────────────────────────────────────────────

export interface BucketManifest {
  readonly stats: BucketStats;           // snapshot at seal
  readonly cutSeq: number;               // the per-bucket cut marker
  readonly postCutCount: number;         // post-trigger tail length
  /** Ring self-sufficiency: oldest retained record is a checkpoint, or the
   *  bucket has never evicted. */
  readonly completeFromStart: boolean;
  readonly droppedBeforeWindow: number;
  /** Correlations with an "open" leg and no terminal leg at seal:
   *  in-flight-at-seal says so. */
  readonly openCorrelations: readonly string[];
  readonly schema?: { schemaId: string; schemaVersion: string };
}

export interface BundleManifest {
  readonly reason: string;
  readonly reasonKey: string;
  readonly sealedWallMs: number;
  readonly sealedMonoMs: number;
  /** The one shared origin: monoMs 0 corresponds to this wall time. */
  readonly monoOriginWallMs: number;
  readonly buckets: Readonly<Record<BucketName, BucketManifest>>;
  /** FR-3 paying off: probes run AT seal, so every bundle states per tap
   *  quiet vs not-yet-attached vs dead. */
  readonly taps: readonly TapHealth[];
  /** The recorder's own state rides every bundle — assembled by the core,
   *  never routed through a tap (FR-4). */
  readonly health: RecorderHealth;
  readonly recorder: { readonly schemaId: "flight-recorder/bundle"; readonly schemaVersion: string };
}

export interface SealedBundle {
  readonly manifest: BundleManifest;
  /** Sorted (bucket, seq); plain data — safe to hand to a worker or a sink. */
  readonly records: readonly CapturedRecord[];
}

/** FR-4: MUST NOT route through any tapped seam — bare fetch/sendBeacon, never
 *  the orval mutator, never the boundary. Rejection is counted
 *  (health.sinkFailures) and never rethrown into app code; retry/queue
 *  robustness is the delivery track's problem, behind this seam. */
export type BundleSink = (bundle: SealedBundle) => Promise<void>;

export type CaptureTicket =
  | { state: "sealed"; reason: string; bundle: Promise<SealedBundle> }
  | { state: "suppressed"; reason: string }  // cooldown/dedup — counted
  | { state: "disabled"; reason: string };   // kill switch

// ── The handle ────────────────────────────────────────────────────────────

export interface FlightRecorder {
  /** Runtime-mutable tap registry (0050's addSink discipline — NOT a config
   *  row). Never throws (FR-2): a throwing attach yields a `faulted`
   *  registration, visible in health. Attach order is program order, which is
   *  what lets the mqtt tap attach before boundary.start() and the http wrap
   *  after boundary.fetcher exists — the init-order cycle dissolves. */
  attach(tap: TapDescriptor): TapRegistration;
  /** The app capture surface: the SAME BucketPort type taps hold. Services
   *  and state machines record through this; there is no other record(). */
  bucket(name: BucketName): BucketPort;
  /**
   * Explicit trigger; failure nets reach the identical path via
   * TapPort.trigger. The seal is SYNCHRONOUS: per-bucket copy-or-freeze of
   * the entry references (O(n) pointer copies of immutable records) plus a
   * cut marker — index snapshots tear under continued capture and are
   * forbidden. Probes run at seal (FR-3). Then the post-trigger window
   * collects its tail, assembly runs async (worker-eligible), and the CORE
   * hands the bundle to the sink — callers never deliver.
   */
  capture(reason: string, opts?: { key?: string }): CaptureTicket;
  /** Cheap synchronous self-observation; also embedded in every bundle. */
  health(): RecorderHealth;
  /** Detaches every tap (contained). Rings are dropped, not shipped. */
  dispose(): void;
}

export interface RecorderConfig {
  /** The declarative half: per-bucket policy, injected at service startup,
   *  compiled once. Built-ins and app buckets are the same kind of row. */
  buckets: Readonly<Record<BucketName, BucketPolicy>>;
  /**
   * Global envelope (~10-50 MB). Construction-time BUDGET invariant:
   * sum(buckets[*].maxBytes) <= maxTotalBytes, else construction throws
   * (FR-6). There is deliberately no runtime cross-bucket evictor — which
   * bucket pays is the config author's visible decision, not a pressure
   * heuristic (see Refusals).
   */
  maxTotalBytes: number;
  /** Post-trigger window; default {ms: 0, items: 0} — seal immediately. */
  postTrigger?: { ms?: number; items?: number };
  /** Trigger dedup/cooldown per reason key; default 30_000. */
  cooldownMs?: number;
  sink: BundleSink;
  /**
   * Kill switch — DECIDED: an injected seam, not a recorder-owned remote
   * flag. Evaluated ONCE at construction; false yields an inert recorder
   * with the identical interface: attach() no-ops (taps never touch host
   * seams — zero cost in latency paths), emit() no-ops, capture() returns
   * {state: "disabled"}. The app supplies the mechanism (its existing remote
   * flag store, localStorage, query param); the recorder never fetches
   * config (FR-4). Re-enable is a reload, by design.
   */
  enabled?: () => boolean;
  /** Test seam; defaults Date.now / performance.now with one shared origin. */
  clock?: { wallMs?: () => number; monoMs?: () => number };
}

/** FR-6: runtime-validates everything loose TS cannot; throws listing EVERY
 *  defective row (non-positive caps, budget overflow, duplicate rule ids,
 *  unknown fields) — one boot, all defects. */
export function createFlightRecorder(config: RecorderConfig): FlightRecorder;

export declare class RecorderConfigError extends Error {
  readonly defects: readonly string[];
}

// ── Built-ins: plain TapDescriptor factories, zero privileged access ──────
// The port-sufficiency acceptance test: if any of these needed more than
// TapPort, the interface would be wrong. Structural stand-ins throughout —
// the recorder imports neither 0060 nor xstate nor React.

export interface Wire1Source {
  on(type: "*", listener: (ev: { type: string; [k: string]: unknown }) => void): () => void;
  subscribe(listener: (snap: { connection: string }) => void): () => void;
  getSnapshot(): { connection: string };
}

/** mqtt: wire-1 '*' tap (validated inbound only; attaching has no
 *  broker-interest side effect). Wire-2 is the liveness feed: 'ended' =>
 *  markDead; probe reads getSnapshot(). Attach BEFORE boundary.start() to
 *  catch the connect-time replay burst — expressible only because attachment
 *  is program order, not a constructor slot. */
export function createMqttTap(actor: Wire1Source, opts?: { bucket?: BucketName }): TapDescriptor;

/** http: wrap of the caller-owned orval mutator. Request-record at invoke
 *  (outcome: "open") + outcome-record at settle, joined by correlationId —
 *  the pair survives a seal mid-flight. wrap() is installed at composition;
 *  probe reports "dead: wrap never installed" until then. FR-4 keeps the
 *  recorder's own POST out: delivery uses BundleSink, never this mutator. */
export function createHttpTap(opts?: { bucket?: BucketName }): {
  tap: TapDescriptor;
  wrap<F extends (...args: never[]) => Promise<unknown>>(mutator: F): F;
};

export interface InspectableActor {
  system: { inspect(observer: (ev: unknown) => void): { unsubscribe(): void } };
}

/** xstate: one actor.system.inspect() observer per root actor; snapshot
 *  events are emitted with checkpoint: true (ring self-sufficiency). */
export function createXStateTap(
  roots: readonly InspectableActor[],
  opts?: { bucket?: BucketName },
): TapDescriptor;

/** log: optional facade sink via 0050's addSink(id, sink, {minLevel}).
 *  probe asks hasSink(id) when the facade offers it, else "unknown" —
 *  facade reconfiguration that drops the sink becomes visible at seal. */
export function createLogTap(
  facade: {
    addSink(id: string, sink: (record: unknown) => void, opts?: { minLevel?: string }): void;
    removeSink?(id: string): void;
    hasSink?(id: string): boolean;
  },
  opts?: { bucket?: BucketName; minLevel?: string },
): TapDescriptor;

/** Failure nets are the SAME species — the unification the lifecycle buys:
 *  a net is a tap that emits an error record AND calls port.trigger(). They
 *  get attach ordering, attached-since, containment, and liveness for free. */
export function createGlobalErrorNet(opts?: { bucket?: BucketName }): TapDescriptor;

/** React 18.3.1 has no root error hook, so the react net ships a
 *  recorder-supplied boundary component wired to the same tap. Catches that
 *  land before attach are buffered (bounded) and flushed at attach. */
export function createReactErrorNet(opts?: { bucket?: BucketName }): {
  tap: TapDescriptor;
  ErrorBoundary: (props: { children?: unknown }) => unknown;
};
```

### Worked example

```typescript
// ── Composition root (service startup — not React) ────────────────────────
// Program order IS the attach ordering: nets first (they cover everything
// after this line), then the mqtt tap, then boundary.start() — so the
// connect-time replay burst lands in the ring instead of the pre-attach void.

const MiB = 1024 * 1024;

const recorder = createFlightRecorder({
  buckets: {
    // The declarative half: what the mqtt bucket HOLDS (0060 table shape).
    mqtt: {
      maxCount: 2_000,
      maxBytes: 8 * MiB,
      maxRecordBytes: 32 * 1024, // bounds the projection walk; over-cap => copy + {truncated, originalSize}
      redact: [{ ruleId: "auth-in-payload", match: (_path, key) => key === "token" }],
      // no schema row: the built-in tap stamps its own fixed schema id
    },
    errors: { maxCount: 200, maxBytes: 1 * MiB },
  },
  maxTotalBytes: 16 * MiB,          // FR-6 budget: must cover the sum of bucket caps, checked at boot
  postTrigger: { ms: 2_000, items: 200 },
  cooldownMs: 30_000,
  enabled: () => appFlags.flightRecorder !== "off", // kill switch: injected seam, app-owned mechanism
  sink: async ({ manifest, records }) => {
    // FR-4: bare fetch, never the orval mutator — the http tap cannot see this POST.
    await fetch("/diag/flight-recorder", { method: "POST", body: encodeBundle(manifest, records) });
  },
});

recorder.attach(createGlobalErrorNet({ bucket: "errors" }));
let mqttReg = recorder.attach(createMqttTap(boundary.actor)); // attachedSince stamped here (FR-3)
boundary.start();                                             // replay burst now captured

// ── Inside createMqttTap — proving adapter-over-port, no privileges ───────
export function createMqttTap(actor: Wire1Source, opts?: { bucket?: BucketName }): TapDescriptor {
  const name = opts?.bucket ?? "mqtt";
  return {
    id: "mqtt",
    buckets: [name],
    attach(port) {
      const b = port.bucket(name);
      const offWire1 = actor.on("*", (ev) => {
        b.emit({
          kind: ev.type,             // "message.plant/{plantId}/telemetry" | "telemetry"
          direction: "in",
          outcome: "ok",             // wire-1 emits only validated deliveries
          body: ev,                  // live object — the PORT projects it; getters run inside containment (FR-1)
          checkpoint: true,          // each validated message is a complete starting point
          index: { topic: String((ev as { topic?: unknown }).topic ?? "") },
        });
      });
      // wire-2 is the liveness feed, not a record source:
      const offWire2 = actor.subscribe((snap) => {
        if (snap.connection === "ended") port.markDead("boundary disposed"); // FR-3
      });
      return () => { offWire1(); offWire2(); };
    },
    probe: () =>
      actor.getSnapshot().connection === "ended"
        ? { state: "dead", reason: "boundary ended" }
        : { state: "alive" },
  };
}

// ── Boundary recovery flow (app code) ─────────────────────────────────────
// Re-attach is the composition root's move: the recorder made the death
// visible; it does not heal it (Refusal 1).
async function recoverBoundary() {
  mqttReg.detach();
  boundary = await recreateBoundary();
  mqttReg = recorder.attach(createMqttTap(boundary.actor)); // fresh attachedSince; the gap stays visible
  boundary.start();
}

// ── A service triggers on a stuck order ───────────────────────────────────
const ticket = recorder.capture("order-stuck-in-submitting", { key: "order-stuck" });
// The synchronous part is already done at this line: per-bucket O(n) pointer
// copy of immutable records + cut marker; probes ran at seal (FR-3).
// "suppressed" => cooldown active, counted, no bundle. Otherwise:
if (ticket.state === "sealed") {
  const bundle = await ticket.bundle; // post-trigger window (2 s / 200 items) + async assembly; sink already invoked by the core
  // What the manifest proves — the lifecycle paying off:
  //   bundle.manifest.buckets.mqtt.cutSeq            -> the seal cut
  //   bundle.manifest.buckets.mqtt.completeFromStart -> oldest retained record is a checkpoint
  //   bundle.manifest.buckets.mqtt.openCorrelations  -> [] (no half-open pairs in this bucket)
  //   bundle.manifest.taps: [
  //     { id: "net.global-error", state: "attached", attachedSinceMonoMs: 12,  liveness: { state: "alive" } },
  //     { id: "mqtt",             state: "attached", attachedSinceMonoMs: 141, liveness: { state: "alive" }, lastEmitMonoMs: 90_210 },
  //   ]
  // An EMPTY mqtt ring with liveness "dead" reads "tap died at monoMs X";
  // with attachedSince absent it reads "never attached"; with "alive" it
  // reads "genuinely quiet". Three different diagnoses from one bundle —
  // a minimal record()-only surface collapses all three into "no data".
}
```

### Refusals

- No auto re-attach or self-healing taps: the recorder observes and never acts on host seams (FR-5). Re-attach after boundary dispose/recreate is a one-line composition-root move; the recorder's job is to make the death visible (markDead, probe-at-seal), not to heal it. A recorder that re-subscribes on its own would also risk the ActiveMQ durable-subscription orphan class the plan's grounding prose forbids, and would mask real lifecycle bugs in the app's recovery flows.
- No push heartbeats or recorder-owned timers: liveness is pull-based (probe at health() and at seal) plus tap-initiated markDead. A heartbeat timer would wake the main thread on cadence, give the recorder its own liveness problem, and still could not distinguish a dead seam from a quiet one better than a probe at the moment of evidence assembly — the only moment liveness is actually consumed.
- No privileged built-ins: createMqttTap/createHttpTap/createXStateTap/createLogTap and both nets are plain TapDescriptor factories over TapPort — the charter's acceptance test made structural. There is no second internal interface for them to use.
- No return values or backpressure from emit(): callers must not branch on recorder state (observe-never-classify), and a tap sitting in someone else's latency path must never gain a reason to block or retry. All outcomes are health counters.
- No runtime bucket-policy mutation: the policy table is compiled once at construction (0060 discipline); only the tap registry is runtime-mutable (0050 discipline). A mutable policy could make the manifest disagree with the rings it describes mid-flight.
- No runtime global-envelope evictor: maxTotalBytes is a construction-time budget invariant (sum of per-bucket maxBytes must fit) enforced fail-fast, not a runtime pressure heuristic. Which bucket pays under pressure is the config author's visible decision at boot — answering the FMEA's 'which bucket pays' gap by refusing to decide it at runtime.
- No recorder-owned remote kill-switch client: the kill switch is the injected enabled() seam, evaluated once at construction (inert same-interface handle when off; re-enable is a reload). The recorder never fetches configuration — fetching through seams it taps would violate FR-4's no-self-report discipline in the other direction.
- No deferred or async projection fallback: emit() projects synchronously, always. Deferring the walk would reintroduce live references into the rings, break serialize-at-capture, and forfeit any last-gasp seal path — the bounded walk (maxRecordBytes) is the latency answer instead.

### Downstream impact

- The composition root gains an owned, documented wiring sequence: nets first, mqtt tap before boundary.start(), http wrap installed when boundary.fetcher exists, xstate tap per root actor at actor creation — this closes the FMEA's high-severity 'attach ordering unowned' entry and answers Q4's missing 'when', but it must be written down as an integration checklist in the report's tap map.
- Every app flow that disposes and recreates a tapped host (boundary recovery, facade reconfiguration) must detach/re-attach the affected tap — a small app-code obligation that should land in 9900's seed-defect corpus as a named defect class (stale-registration-after-recreate), since the recorder deliberately will not self-heal it.
- 0070's kit exposes a single inspect function slot, not a registry: under this design the recorder refuses that tap as-is, so capturing ingress verdict traffic requires 0070's kit to grow a 0050-style multi-consumer registry (or the verdict bucket is explicitly out of scope) — a change request to 0070, not a recorder workaround.
- 0050's facade should add hasSink(id) (or expose its sink registry) so the log tap's probe can report dead-after-reconfiguration instead of 'unknown' — a one-method facade addition.
- The repo's restricted-imports lint discipline extends to the recorder surface: recorder.bucket()/TapPort importable from services and state machines only, mirroring the existing record()-not-from-components rule; no new mechanism is invented.
- The bundle schema gains the taps table (TapHealth at seal) and per-bucket cutSeq/openCorrelations/completeFromStart — replay tooling and any backend ingestion must consume these fields; they are the manifest's attribution-of-absence contract, not optional metadata.
- Posture independence is realized at BundleSink: if the wrapped-Sentry posture wins delivery, the Sentry envelope encoding and transport live entirely inside the sink adapter (and nets can stay owned) — taps, buckets, seal, and health are unchanged; if owned delivery wins, the sink is a bare-fetch poster. Either way FR-4's bare-transport rule holds.
- The test lane gets the recorder's RaceHarness analogue for free: a fake TapPort plus the clock seam make every TapDescriptor unit-testable without a live host; the spike that follows the report should verify FR-2 throw containment per built-in tap and the truncation-by-copy behavior (retained-slice parent pinning) explicitly.
