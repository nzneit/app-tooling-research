// Bounded quarantine ring (I9, I13). Inspection only; never replay.

import type { BoundaryError } from "../errors/index.js";
import type { QuarantineEntry } from "../types.js";

export class QuarantineRing {
  readonly capacity: number;
  #buf: QuarantineEntry[] = [];
  /** total pushes ever, including evicted ones — evidence for the pump check. */
  #total = 0;
  #evicted = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new Error("boundary: quarantine bound must be a positive integer");
    this.capacity = capacity;
  }

  push(raw: unknown, error: BoundaryError): QuarantineEntry {
    const entry: QuarantineEntry = {
      raw,
      error,
      endpointOrTopic: error.endpointOrTopic,
      timestamp: error.timestamp,
    };
    this.#buf.push(entry);
    this.#total++;
    while (this.#buf.length > this.capacity) {
      this.#buf.shift();
      this.#evicted++;
    }
    return entry;
  }

  /** Oldest first. */
  entries(): readonly QuarantineEntry[] {
    return this.#buf.slice();
  }

  get size(): number {
    return this.#buf.length;
  }

  get total(): number {
    return this.#total;
  }

  get evicted(): number {
    return this.#evicted;
  }

  clear(): void {
    this.#buf = [];
  }
}
