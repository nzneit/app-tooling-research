// Deduped telemetry (O5). Leading edge + trailing summary, per dedupKey, per
// window, timed on the ClockPort so SimulatedClock walks the window in
// microseconds:
//
//   first occurrence in a window  -> emit immediately, count 1
//   repeats within the window     -> fold silently (count++, lastSeen)
//   window closes with count > 1  -> emit one summary carrying the folded count
//
// Quarantine push happens-before its telemetry emission — the caller does the
// push, then calls record().

import type { BoundaryError, TelemetryEvent } from "../errors/index.js";
import { dedupKeyOf } from "../errors/normalize.js";
import type { ClockPort } from "../types.js";

interface Window {
  error: BoundaryError;
  count: number;
  firstSeen: number;
  lastSeen: number;
  timer: unknown;
}

export class TelemetryDeduper {
  readonly #windows = new Map<string, Window>();
  readonly #windowMs: number;
  readonly #clock: ClockPort;
  readonly #emit: (e: TelemetryEvent) => void;
  #disposed = false;

  constructor(windowMs: number, clock: ClockPort, emit: (e: TelemetryEvent) => void) {
    this.#windowMs = windowMs;
    this.#clock = clock;
    this.#emit = emit;
  }

  record(error: BoundaryError): void {
    if (this.#disposed) return;
    const dedupKey = dedupKeyOf(error);
    const open = this.#windows.get(dedupKey);
    if (open !== undefined) {
      open.count++;
      open.lastSeen = error.timestamp;
      open.error = error;
      return;
    }
    const w: Window = {
      error,
      count: 1,
      firstSeen: error.timestamp,
      lastSeen: error.timestamp,
      timer: undefined,
    };
    this.#windows.set(dedupKey, w);
    w.timer = this.#clock.setTimeout(() => this.#close(dedupKey), this.#windowMs);
    this.#emit({
      error,
      dedupKey,
      count: 1,
      firstSeen: w.firstSeen,
      lastSeen: w.lastSeen,
    });
  }

  #close(dedupKey: string): void {
    const w = this.#windows.get(dedupKey);
    if (w === undefined) return;
    this.#windows.delete(dedupKey);
    if (w.count > 1 && !this.#disposed) {
      this.#emit({
        error: w.error,
        dedupKey,
        count: w.count,
        firstSeen: w.firstSeen,
        lastSeen: w.lastSeen,
      });
    }
  }

  dispose(): void {
    this.#disposed = true;
    for (const w of this.#windows.values()) {
      if (w.timer !== undefined) this.#clock.clearTimeout(w.timer);
    }
    this.#windows.clear();
  }
}
