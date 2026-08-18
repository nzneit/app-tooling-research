// Bundled into the crash-lane page by esbuild, so the real-browser checks
// exercise the REAL src/ adapter rather than a copy of it.
//
// It exposes two implementations on purpose:
//   __inbox.atomic   — the design under test: identity + effect in ONE transaction
//   __inbox.split    — the NEGATIVE CONTROL: effect first, identity second, two
//                      transactions, with a deliberately widened window between.
//
// The control is not decoration. A crash test that cannot demonstrate the bug it
// claims to rule out proves nothing, and the verified precedent is exact: a first
// attempt with random 0-40 ms crash offsets returned zero splits for BOTH
// variants — a uniformly clean result that reads as a pass.

import { indexedDbInboxStore } from "../src/adapters/indexeddb-inbox.js";

const EFFECT_STORE = "readings";
const IDENTITY_STORE = "__inbox_identities";

declare global {
  interface Window {
    __inbox: {
      atomic(db: string, n: number, durability: "default" | "relaxed" | "strict"): Promise<number>;
      split(db: string, n: number, gapMs: number): Promise<number>;
      read(db: string): Promise<{ effects: number; identities: number }>;
    };
  }
}

function open(name: string, version = 1): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: "key" }).createIndex(
          "byExpiresAt",
          "expiresAt",
          { unique: false },
        );
      }
      if (!db.objectStoreNames.contains(EFFECT_STORE)) db.createObjectStore(EFFECT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

window.__inbox = {
  /** The design: one transaction per message, via the real adapter. */
  async atomic(db, n, durability) {
    const inbox = indexedDbInboxStore({
      databaseName: db,
      effectStores: [EFFECT_STORE],
      schemaVersion: 1,
      retentionMs: 3_600_000,
      durability,
    });
    await inbox.open();
    for (let i = 0; i < n; i++) {
      await inbox.commit({
        key: `msg-${String(i)}`,
        writes: [{ op: "put", store: EFFECT_STORE, key: `r${String(i)}`, value: i }],
        receivedAt: Date.now(),
      });
    }
    return n;
  },

  /**
   * NEGATIVE CONTROL — deliberately wrong. Applies the effect in transaction 1,
   * waits, then records the identity in transaction 2. A crash in the gap leaves
   * the effect durable and the identity lost, so the broker's redelivery
   * re-applies it. This is the double-apply the track exists to prevent, and this
   * function's job is to produce it on demand.
   */
  async split(db, n, gapMs) {
    const database = await open(db);
    for (let i = 0; i < n; i++) {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction([EFFECT_STORE], "readwrite");
        tx.objectStore(EFFECT_STORE).put(i, `r${String(i)}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await new Promise((r) => setTimeout(r, gapMs)); // the widened window
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction([IDENTITY_STORE], "readwrite");
        tx.objectStore(IDENTITY_STORE).put({
          key: `msg-${String(i)}`,
          receivedAt: Date.now(),
          expiresAt: Date.now() + 3_600_000,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    return n;
  },

  async read(db) {
    const database = await open(db);
    const count = (store: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = database.transaction([store]).objectStore(store).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    return { effects: await count(EFFECT_STORE), identities: await count(IDENTITY_STORE) };
  },
};
