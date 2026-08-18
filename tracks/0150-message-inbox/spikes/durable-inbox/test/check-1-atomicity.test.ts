// check-1 — Guarantee A, in the Node lane: identity and effect commit in ONE
// transaction, and a duplicate is suppressed across a close/reopen.
//
// LANE: node + fake-indexeddb. This confirms the design's SHAPE and never its
// guarantee: fake-indexeddb is an in-memory reimplementation of exactly the
// durability timing under test. The guarantee itself is check-10, in a real
// browser, under a real process kill.

import { describe, expect, it } from "vitest";
import { indexedDbInboxStore, InboxCommitError } from "../src/index.js";
import { freshFactory, RETENTION_MS } from "./fixtures.js";

function store(factory: IDBFactory, name: string, schemaVersion = 1) {
  return indexedDbInboxStore({
    databaseName: name,
    effectStores: ["readings"],
    schemaVersion,
    retentionMs: RETENTION_MS,
    factory,
    now: () => 1_000_000,
  });
}

describe("check-1: one transaction carries identity and effect together", () => {
  it("GO: applies once, suppresses the redelivery, and reports it", async () => {
    const factory = freshFactory();
    const inbox = store(factory, "c1-a");
    await inbox.open();

    const entry = {
      key: "k-1",
      writes: [{ op: "put", store: "readings", key: "r1", value: 41 }] as const,
      receivedAt: 1_000_000,
    };

    expect(await inbox.commit(entry)).toBe("applied");
    expect(await inbox.commit(entry)).toBe("duplicate");
    expect(await inbox.commit(entry)).toBe("duplicate");

    await inbox.close();

    // Reopen: the identity survived, so the fourth delivery is still suppressed.
    // This is the case the connection-scoped packet-identity guard structurally
    // cannot cover, and the whole reason this track exists.
    const reopened = store(factory, "c1-a");
    const hydration = await reopened.open();
    expect(hydration.cold).toBe(false);
    expect(hydration.identityCount).toBe(1);
    expect(await reopened.commit(entry)).toBe("duplicate");
    await reopened.close();
  });

  it("GO: a suppressed duplicate does NOT re-apply its writes", async () => {
    const factory = freshFactory();
    const inbox = store(factory, "c1-b");
    await inbox.open();

    await inbox.commit({
      key: "k-2",
      writes: [{ op: "put", store: "readings", key: "r1", value: 1 }],
      receivedAt: 1_000_000,
    });
    // Same identity, DIFFERENT value. If suppression were a cache consulted
    // beside the write rather than the transaction itself, this would land.
    const outcome = await inbox.commit({
      key: "k-2",
      writes: [{ op: "put", store: "readings", key: "r1", value: 999 }],
      receivedAt: 1_000_000,
    });
    expect(outcome).toBe("duplicate");
    await inbox.close();

    const reopened = store(factory, "c1-b");
    const h = await reopened.open();
    expect(h.writes).toEqual([{ op: "put", store: "readings", key: "r1", value: 1 }]);
    await reopened.close();
  });

  it("GO: two concurrent writers of the same key produce exactly one apply", async () => {
    const factory = freshFactory();
    const inbox = store(factory, "c1-c");
    await inbox.open();

    const one = { key: "race", writes: [{ op: "put" as const, store: "readings", key: "r", value: 1 }], receivedAt: 1_000_000 };
    const two = { key: "race", writes: [{ op: "put" as const, store: "readings", key: "r", value: 2 }], receivedAt: 1_000_000 };

    const outcomes = await Promise.all([inbox.commit(one), inbox.commit(two)]);
    expect(outcomes.filter((o) => o === "applied")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(1);
    await inbox.close();
  });

  it("GO: hydration reports a cold store, which is the eviction blind spot", async () => {
    const inbox = store(freshFactory(), "c1-d");
    const h = await inbox.open();
    // A cold inbox cannot suppress the replay it is about to receive. Reported,
    // never read as health.
    expect(h.cold).toBe(true);
    expect(h.identityCount).toBe(0);
    await inbox.close();
  });

  it("GO: a schema bump drops effects and KEEPS identities (S4)", async () => {
    const factory = freshFactory();
    const v1 = store(factory, "c1-e", 1);
    await v1.open();
    await v1.commit({
      key: "kept",
      writes: [{ op: "put", store: "readings", key: "r1", value: 7 }],
      receivedAt: 1_000_000,
    });
    await v1.close();

    const v2 = store(factory, "c1-e", 2);
    const h = await v2.open();
    expect(h.reset).toBe(true);
    expect(h.writes).toEqual([]); // the projection is gone — a rehydration
    expect(h.identityCount).toBe(1); // the identity is not — no double-apply
    expect(await v2.commit({ key: "kept", writes: [], receivedAt: 1_000_000 })).toBe("duplicate");
    await v2.close();
  });

  it("GO: reset is the only escape from a corrupt store (S6)", async () => {
    const factory = freshFactory();
    const inbox = store(factory, "c1-f");
    await inbox.open();
    await inbox.commit({ key: "x", writes: [{ op: "put", store: "readings", key: "r", value: 1 }], receivedAt: 1_000_000 });
    await inbox.reset("test");
    // Persistence removes "reload fixes it" as a recovery permanently, so
    // something must be able to clear it.
    expect(await inbox.commit({ key: "x", writes: [], receivedAt: 1_000_000 })).toBe("applied");
    await inbox.close();
  });

  it("GO: commit rejects only with InboxCommitError, and only for real failure", async () => {
    const inbox = store(freshFactory(), "c1-g");
    await inbox.open();
    await inbox.close();
    await expect(
      inbox.commit({ key: "after-close", writes: [], receivedAt: 1_000_000 }),
    ).rejects.toBeInstanceOf(InboxCommitError);
  });
});
