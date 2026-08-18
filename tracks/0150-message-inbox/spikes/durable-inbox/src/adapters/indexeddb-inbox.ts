// The IndexedDB adapter. Guarantee A lives in `commit`, in one transaction.
//
// Built on raw IndexedDB deliberately: the survey still owns the
// idb-vs-Dexie-vs-raw verdict, and raw is the one that makes obligations S1-S6
// verifiable without a wrapper's own liveness model in the way. NOT verified
// here: that `idb` and Dexie can carry the same contract. The groundwork reports
// working two-store implementations of all three, so the choice is believed not
// to be load-bearing — but this spike did not run that comparison, and the
// survey should not treat "raw" as a conclusion it reached.

import type { EffectWrite } from "../policy.js";
import {
  InboxCommitError,
  type InboxCommitCause,
  type InboxEntry,
  type InboxHydration,
  type InboxOutcome,
  type InboxStorePort,
  type IndexedDbInboxOptions,
} from "../ports.js";

const IDENTITY_STORE = "__inbox_identities";
const EXPIRES_INDEX = "byExpiresAt";

interface IdentityRecord {
  readonly key: string;
  readonly receivedAt: number;
  readonly expiresAt: number;
}

function causeOf(err: unknown): InboxCommitCause {
  const name = (err as { name?: string } | null)?.name;
  if (name === "QuotaExceededError") return "quota";
  if (name === "InvalidStateError") return "closed";
  if (name === "AbortError") return "aborted";
  if (name === "VersionError") return "schema";
  return "unknown";
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function indexedDbInboxStore(opts: IndexedDbInboxOptions): InboxStorePort {
  const factory: IDBFactory = opts.factory ?? globalThis.indexedDB;
  const now = opts.now ?? (() => Date.now());
  const durability = opts.durability ?? "default";
  let db: IDBDatabase | null = null;
  let reflectedDurability: "default" | "relaxed" | "strict" = durability;

  const txOptions = { durability } as IDBTransactionOptions;

  function open(): Promise<InboxHydration> {
    return new Promise<InboxHydration>((resolve, reject) => {
      const req = factory.open(opts.databaseName, opts.schemaVersion);
      let reset = false;

      req.onupgradeneeded = (event) => {
        const database = req.result;
        const hadIdentities = database.objectStoreNames.contains(IDENTITY_STORE);

        // S4: identities are opaque strings that no contract change can
        // invalidate, so they SURVIVE a schema bump. Effect stores are a
        // projection of messages and are dropped, costing a rehydration rather
        // than a round of double-application.
        if (!hadIdentities) {
          const store = database.createObjectStore(IDENTITY_STORE, { keyPath: "key" });
          store.createIndex(EXPIRES_INDEX, "expiresAt", { unique: false });
        }
        if ((event.oldVersion ?? 0) > 0) {
          for (const name of opts.effectStores) {
            if (database.objectStoreNames.contains(name)) {
              database.deleteObjectStore(name);
              reset = true;
            }
          }
        }
        for (const name of opts.effectStores) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
        }
      };

      req.onerror = () => reject(new InboxCommitError(causeOf(req.error), { cause: req.error }));
      req.onsuccess = () => {
        db = req.result;
        db.onversionchange = () => {
          db?.close();
          db = null;
        };
        void hydrate(reset).then(resolve, reject);
      };
    });
  }

  async function hydrate(reset: boolean): Promise<InboxHydration> {
    const database = must();
    const stores = [IDENTITY_STORE, ...opts.effectStores];
    const tx = database.transaction(stores, "readwrite", txOptions);
    reflectedDurability = (tx.durability as typeof reflectedDurability | undefined) ?? durability;

    // S3: the prune runs inside a transaction the adapter already has open, and
    // never opens one of its own — so it can never split a commit.
    prune(tx, now());

    const identityCount = await request(tx.objectStore(IDENTITY_STORE).count());
    const writes: EffectWrite[] = [];
    for (const name of opts.effectStores) {
      const store = tx.objectStore(name);
      const keys = await request(store.getAllKeys());
      const values = await request(store.getAll());
      keys.forEach((key, i) => {
        writes.push({ op: "put", store: name, key: String(key), value: values[i] });
      });
    }
    await done(tx);
    return {
      writes,
      schemaVersion: opts.schemaVersion,
      reset,
      cold: identityCount === 0 && writes.length === 0,
      durability: reflectedDurability,
      identityCount,
    };
  }

  function must(): IDBDatabase {
    if (db === null) throw new InboxCommitError("closed");
    return db;
  }

  function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * S3. Fire-and-forget cursor walk inside the caller's transaction — it never
   * opens one of its own, so it can never split a commit.
   *
   * Deliberately no `IDBKeyRange`: that is a global, and this adapter takes its
   * engine by injection precisely so the Node lane needs no
   * `fake-indexeddb/auto` and its shared-global hazard across parallel workers.
   * The index is ordered by expiresAt, so walking forward and stopping at the
   * first unexpired record is equivalent to an upper-bound range.
   */
  function prune(tx: IDBTransaction, at: number): void {
    const index = tx.objectStore(IDENTITY_STORE).index(EXPIRES_INDEX);
    const cursorReq = index.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor === null) return;
      const record = cursor.value as IdentityRecord;
      if (record.expiresAt > at) return; // ordered index: nothing later expires sooner
      cursor.delete();
      cursor.continue();
    };
  }

  return {
    open,

    /**
     * S1 + S2. ONE transaction spanning the identity store and every store named
     * in `writes`. The identity goes in with `add()`, so a key already present
     * raises ConstraintError, which aborts the WHOLE transaction and discards
     * the writes — suppression IS the transaction, not a cache consulted beside
     * it. There is no check-then-write window and two concurrent writers cannot
     * both win.
     *
     * Nothing between opening the transaction and its completion awaits anything
     * but IndexedDB itself, which is what keeps the transaction alive across the
     * auto-commit boundary.
     */
    commit(entry: InboxEntry): Promise<InboxOutcome> {
      let database: IDBDatabase;
      try {
        database = must();
      } catch (err) {
        return Promise.reject(err);
      }

      const touched = new Set<string>([IDENTITY_STORE]);
      for (const w of entry.writes) touched.add(w.store);

      return new Promise<InboxOutcome>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = database.transaction([...touched], "readwrite", txOptions);
        } catch (err) {
          reject(new InboxCommitError(causeOf(err), { cause: err }));
          return;
        }

        let duplicate = false;

        tx.oncomplete = () => resolve("applied");
        tx.onabort = () => {
          if (duplicate) resolve("duplicate");
          else reject(new InboxCommitError(causeOf(tx.error), { cause: tx.error }));
        };

        const identity = tx.objectStore(IDENTITY_STORE);
        const record: IdentityRecord = {
          key: entry.key,
          receivedAt: entry.receivedAt,
          expiresAt: entry.receivedAt + opts.retentionMs,
        };
        const addReq = identity.add(record);
        addReq.onerror = (event) => {
          if (addReq.error?.name === "ConstraintError") {
            duplicate = true;
            // Let the abort run: it is what discards the writes below.
            event.preventDefault();
            tx.abort();
          }
        };

        for (const w of entry.writes) {
          const store = tx.objectStore(w.store);
          if (w.op === "put") store.put(w.value, w.key);
          else store.delete(w.key);
        }

        prune(tx, entry.receivedAt);
      });
    },

    async reset(_reason: string): Promise<void> {
      const database = must();
      const tx = database.transaction([IDENTITY_STORE, ...opts.effectStores], "readwrite", txOptions);
      tx.objectStore(IDENTITY_STORE).clear();
      for (const name of opts.effectStores) tx.objectStore(name).clear();
      await done(tx);
    },

    close(): Promise<void> {
      db?.close();
      db = null;
      return Promise.resolve();
    },
  };
}
