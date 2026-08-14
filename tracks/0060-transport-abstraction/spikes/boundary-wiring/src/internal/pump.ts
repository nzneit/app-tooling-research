// Bounded delivery queue + microtask drain (O1's last step, I9).
//
// The packet pump (the broker adapter's onMessage callback) only ever pushes;
// it never awaits and never runs a listener. Dispatch happens on a microtask,
// so a slow consumer surfaces as depth growth and then shedding (mqtt.js #1935)
// instead of starving keepalive.

export class DeliveryPump<T> {
  readonly capacity: number;
  #queue: T[] = [];
  #head = 0;
  #scheduled = false;
  #draining = false;
  #disposed = false;
  #shed = 0;
  #delivered = 0;
  #highWater = 0;
  readonly #onShed: (item: T) => void;
  readonly #onDeliver: (item: T) => void;

  constructor(capacity: number, onDeliver: (item: T) => void, onShed: (item: T) => void) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new Error("boundary: delivery bound must be a positive integer");
    this.capacity = capacity;
    this.#onDeliver = onDeliver;
    this.#onShed = onShed;
  }

  push(item: T): void {
    if (this.#disposed) return;
    this.#queue.push(item);
    while (this.depth > this.capacity) {
      const oldest = this.#queue[this.#head] as T;
      this.#head++;
      this.#shed++;
      this.#onShed(oldest);
    }
    if (this.depth > this.#highWater) this.#highWater = this.depth;
    this.#schedule();
  }

  get depth(): number {
    return this.#queue.length - this.#head;
  }

  get shed(): number {
    return this.#shed;
  }

  get delivered(): number {
    return this.#delivered;
  }

  get highWater(): number {
    return this.#highWater;
  }

  #schedule(): void {
    if (this.#scheduled || this.#draining || this.depth === 0) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#drain();
    });
  }

  #drain(): void {
    if (this.#disposed || this.#draining) return;
    this.#draining = true;
    try {
      // Bound the batch to what was queued when the drain started, so a
      // listener that re-enters cannot spin this loop forever.
      let budget = this.depth;
      while (budget-- > 0 && this.depth > 0) {
        const item = this.#queue[this.#head] as T;
        this.#head++;
        this.#delivered++;
        this.#onDeliver(item);
      }
      if (this.#head === this.#queue.length) {
        this.#queue = [];
        this.#head = 0;
      }
    } finally {
      this.#draining = false;
    }
    this.#schedule();
  }

  dispose(): void {
    this.#disposed = true;
    this.#queue = [];
    this.#head = 0;
  }
}
