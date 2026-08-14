// Wire 1 — the typed discrete-event emitter behind BoundaryActorRef.on.
// Semantics match xstate's emit/on surface (including the '*' tap) but listener
// throws are contained here (I12: a throwing listener never skips siblings and
// never re-enters the broker callback) and reported to `inspect` instead of
// being rethrown on a macrotask.

type AnyListener = (ev: never) => void;

export class WireOne<Ev extends { type: string }> {
  #byType = new Map<string, Set<AnyListener>>();
  #wildcard = new Set<AnyListener>();
  readonly #onListenerError: (err: unknown, ev: Ev) => void;

  constructor(onListenerError: (err: unknown, ev: Ev) => void) {
    this.#onListenerError = onListenerError;
  }

  on(type: string, listener: AnyListener): () => void {
    const set = type === "*" ? this.#wildcard : this.#bucket(type);
    set.add(listener);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      set.delete(listener);
      if (type !== "*" && set.size === 0) this.#byType.delete(type);
    };
  }

  emit(ev: Ev): void {
    const exact = this.#byType.get(ev.type);
    if (exact === undefined && this.#wildcard.size === 0) return;
    // Snapshot: a listener may add or remove listeners during dispatch.
    const all = [...(exact ?? []), ...this.#wildcard];
    for (const listener of all) {
      try {
        (listener as (e: Ev) => void)(ev);
      } catch (err) {
        this.#onListenerError(err, ev);
      }
    }
  }

  clear(): void {
    this.#byType.clear();
    this.#wildcard.clear();
  }

  #bucket(type: string): Set<AnyListener> {
    let set = this.#byType.get(type);
    if (set === undefined) {
      set = new Set();
      this.#byType.set(type, set);
    }
    return set;
  }
}
