// In-memory inbox store. Not a second production adapter — a deterministic
// fault injector, so the withhold branch and the ack-ordering obligations can be
// driven without a storage engine in the way.

import type { EffectWrite } from "../policy.js";
import type {
  InboxEntry,
  InboxHydration,
  InboxOutcome,
  InboxStorePort,
  MemoryInboxOptions,
} from "../ports.js";

export interface MemoryInboxStore extends InboxStorePort {
  /** Test observability: the effect projection as the store holds it. */
  readonly effects: ReadonlyMap<string, unknown>;
  readonly identityCount: number;
}

export function memoryInboxStore(opts: MemoryInboxOptions = {}): MemoryInboxStore {
  const now = opts.now ?? (() => Date.now());
  const identities = new Set<string>();
  const effects = new Map<string, unknown>();
  const attempts = new Map<string, number>();
  let open = false;

  const sleep = (ms: number): Promise<void> =>
    ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

  return {
    get effects() {
      return effects;
    },
    get identityCount() {
      return identities.size;
    },

    open(): Promise<InboxHydration> {
      open = true;
      const writes: EffectWrite[] = [...effects].map(([key, value]) => {
        const [store = "", rest = ""] = [key.slice(0, key.indexOf("/")), key.slice(key.indexOf("/") + 1)];
        return { op: "put", store, key: rest, value };
      });
      return Promise.resolve({
        writes,
        schemaVersion: 1,
        reset: false,
        cold: identities.size === 0 && effects.size === 0,
        durability: "default",
        identityCount: identities.size,
      });
    },

    async commit(entry: InboxEntry): Promise<InboxOutcome> {
      if (!open) throw new Error("memory inbox not open");
      const n = (attempts.get(entry.key) ?? 0) + 1;
      attempts.set(entry.key, n);

      await sleep(opts.commitLatencyMs?.(entry.key) ?? 0);

      const failure = opts.failCommitWith?.(entry.key, n) ?? null;
      if (failure !== null) throw failure;

      // S2 in miniature: identity and effect land together, or neither does.
      if (identities.has(entry.key)) return "duplicate";
      identities.add(entry.key);
      for (const w of entry.writes) {
        const composite = `${w.store}/${w.key}`;
        if (w.op === "put") effects.set(composite, w.value);
        else effects.delete(composite);
      }
      void now();
      return "applied";
    },

    reset(_reason: string): Promise<void> {
      identities.clear();
      effects.clear();
      attempts.clear();
      return Promise.resolve();
    },

    close(): Promise<void> {
      open = false;
      return Promise.resolve();
    },
  };
}
