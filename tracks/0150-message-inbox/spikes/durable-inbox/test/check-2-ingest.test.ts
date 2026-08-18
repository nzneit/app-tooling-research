// check-2 — the ingest rules, driven through the memory adapter so every branch
// is reachable deterministically. LANE: node, no storage engine, no broker.
//
// Covers plan questions 13 (dedup-hit counter and the bias), 17 (what a durable
// row means on a wildcard and under overlapping filters), 18 (delivered-QoS
// drift, both directions), and D5 (retained replay must NOT be suppressed).

import { describe, expect, it } from "vitest";
import {
  createPipeline,
  InboxCommitError,
  memoryInboxStore,
  MAX_COMMIT_ATTEMPTS,
  type PolicyTable,
} from "../src/index.js";
import { appendReading, DURABLE_POLICIES, isReading, meta, reading } from "./fixtures.js";

function rig(policies: PolicyTable = DURABLE_POLICIES, store = memoryInboxStore()) {
  const pipeline = createPipeline({ policies, inbox: store, now: () => 1_000 });
  return { pipeline, store };
}

describe("check-2: ingest rules", () => {
  it("GO: applies once and suppresses the redelivery, counting the suppression", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    const p = reading("m1", 5);
    for (let i = 0; i < 3; i++) {
      await pipeline.handlers.onMessage("plant/p1/telemetry", p, meta());
    }
    expect(pipeline.status.applied).toBe(1);
    // Question 13: without this counter a design that never fires and a design
    // that works are indistinguishable.
    expect(pipeline.status.suppressed).toBe(2);
    expect(pipeline.delivered).toHaveLength(1);
  });

  it("GO: the same producer id on two concrete topics is TWO messages, not one", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    // A wildcard row is one policy row over many entities, and a producer's id is
    // commonly unique only per entity. Including the concrete topic can only
    // ever SPLIT keys — a false negative (apply twice), never a false positive
    // (silently drop real work). That bias is chosen deliberately.
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("dup-id"), meta());
    await pipeline.handlers.onMessage("plant/p2/telemetry", reading("dup-id"), meta());
    expect(pipeline.status.applied).toBe(2);
    expect(pipeline.status.suppressed).toBe(0);
  });

  it("GO: two overlapping filters on ONE concrete topic each apply exactly once", async () => {
    // 3.1.1 §3.3.5 permits one delivered copy per matching subscription. Those
    // are legitimately different applications and each row must apply once — so
    // the channel filter is part of the key.
    const policies: PolicyTable = {
      "plant/+/telemetry": { validate: isReading, direction: "in", qos: 1, durable: appendReading },
      "plant/p1/telemetry": { validate: isReading, direction: "in", qos: 1, durable: appendReading },
    };
    const store = memoryInboxStore();
    const a = createPipeline({ policies: { "plant/+/telemetry": policies["plant/+/telemetry"]! }, inbox: store });
    const b = createPipeline({ policies: { "plant/p1/telemetry": policies["plant/p1/telemetry"]! }, inbox: store });
    await a.start();
    await b.start();
    await a.handlers.onMessage("plant/p1/telemetry", reading("same"), meta());
    await b.handlers.onMessage("plant/p1/telemetry", reading("same"), meta());
    expect(a.status.applied).toBe(1);
    expect(b.status.applied).toBe(1);
    expect(a.status.suppressed + b.status.suppressed).toBe(0);
  });

  it("GO: a RETAINED delivery bypasses the inbox entirely (D5, [MQTT-3.3.1-6])", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    // A retained replay is the REPAIR for the gap every reconnect creates.
    // Suppressing it is the actively harmful case, so it is never recorded and
    // never suppressed — it applies on every resubscribe, by design.
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("r1"), meta({ retain: true }));
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("r1"), meta({ retain: true }));
    expect(pipeline.delivered).toHaveLength(2);
    expect(pipeline.status.suppressed).toBe(0);
    expect(pipeline.status.applied).toBe(0); // never entered the inbox at all
  });

  it("GO: delivered-QoS drift is reported once per channel and the message still applies (Q18)", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    // The silent lapse: a producer migrates off MQTT, or the broker's mapping
    // demotes the topic. Nothing breaks — subscriptions succeed, messages
    // arrive, only offline retention stops.
    for (let i = 0; i < 5; i++) {
      await pipeline.handlers.onMessage("plant/p1/telemetry", reading(`q${String(i)}`), meta({ qos: 0 }));
    }
    expect(pipeline.status.qosDrift).toBe(5);
    // Writing it to the inbox still buys Guarantee A; refusing it buys nothing.
    expect(pipeline.status.applied).toBe(5);
    // D-0018's fold-and-warn-once shape: at 5 msg/s a lapsed topic would
    // otherwise trip this on every message.
    const drift = pipeline.telemetry.filter((t) => t.reason === "qos-drift");
    expect(drift).toHaveLength(1);
    expect(drift[0]?.class).toBe(1); // no fifth error class is minted
  });

  it("GO: the INVERSE drift is caught too — that is how a candidate announces itself", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    await pipeline.handlers.onMessage("plant/p1/status", reading("s1"), meta({ qos: 1 }));
    expect(pipeline.status.qosDrift).toBe(1);
    expect(pipeline.telemetry.some((t) => t.reason === "qos-drift")).toBe(true);
  });

  it("GO: a projection with no usable id is legal and LOUD — never applied, acknowledged", async () => {
    const policies: PolicyTable = {
      "plant/+/telemetry": {
        validate: isReading,
        direction: "in",
        qos: 1,
        durable: () => ({ id: null, writes: [] }),
      },
    };
    const { pipeline } = rig(policies);
    await pipeline.start();
    const ack = pipeline.handlers.onMessage("plant/p1/telemetry", reading("x"), meta());
    // Acknowledged: it was never applied, so there is nothing to redeliver for.
    expect(ack).toBeUndefined();
    expect(pipeline.status.identityMissing).toBe(1);
    expect(pipeline.status.applied).toBe(0);
    expect(pipeline.quarantine[0]?.reason).toBe("durable-identity-missing");
  });

  it("GO: an over-long id is refused — that is a content hash wearing a disguise", async () => {
    const policies: PolicyTable = {
      "plant/+/telemetry": {
        validate: isReading,
        direction: "in",
        qos: 1,
        durable: (p) => ({ id: JSON.stringify(p).repeat(20), writes: [] }),
      },
    };
    const { pipeline } = rig(policies);
    await pipeline.start();
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("x"), meta());
    // A content hash silently swallows retained replay and overlapping-filter
    // copies. Fail at the first message, loudly, in dev and prod alike.
    expect(pipeline.telemetry.some((t) => t.detail && (t.detail as { rejection?: string }).rejection === "too-long")).toBe(true);
    expect(pipeline.status.applied).toBe(0);
  });

  it("GO: a malformed redelivery is never deduplicated and never applied (D1)", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    await pipeline.handlers.onMessage("plant/p1/telemetry", new TextEncoder().encode("{not json"), meta());
    expect(pipeline.status.applied).toBe(0);
    expect(pipeline.status.suppressed).toBe(0);
    expect(pipeline.quarantine).toHaveLength(1);
  });

  it("GO: while LOADING, a durable delivery is withheld so the broker keeps it", async () => {
    const { pipeline } = rig();
    // Deliberately not started. Withholding SUBSCRIBE is NOT sufficient on a
    // resumed session — the broker replays the stored queue on CONNACK, before
    // any new SUBSCRIBE, because the subscription is already in the session.
    const result = pipeline.handlers.onMessage("plant/p1/telemetry", reading("early"), meta());
    await expect(result).rejects.toThrow("inbox-loading");
    expect(pipeline.status.applied).toBe(0);
  });

  it("GO: a transient commit failure WITHHOLDS the ack, then applies on retry", async () => {
    let attempts = 0;
    const store = memoryInboxStore({
      failCommitWith: (_key, attempt) => {
        attempts = attempt;
        return attempt < 3 ? new InboxCommitError("quota") : null;
      },
    });
    const { pipeline } = rig(DURABLE_POLICIES, store);
    await pipeline.start();

    // Attempts 1 and 2 reject -> no PUBACK -> the broker redelivers. This is the
    // "cannot lose" half of the claim, and the only branch that withholds.
    await expect(pipeline.handlers.onMessage("plant/p1/telemetry", reading("t"), meta())).rejects.toThrow(
      /inbox-commit-failed:quota:attempt-1/,
    );
    await expect(pipeline.handlers.onMessage("plant/p1/telemetry", reading("t"), meta())).rejects.toThrow(
      /attempt-2/,
    );
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("t"), meta());

    expect(attempts).toBe(3);
    expect(pipeline.status.applied).toBe(1);
    expect(pipeline.status.givenUp).toBe(0);
    expect(pipeline.status.state).toBe("ready"); // recovered
  });

  it("GO: a POISON message gives up after MAX_COMMIT_ATTEMPTS and never wedges", async () => {
    const store = memoryInboxStore({ failCommitWith: () => new InboxCommitError("schema") });
    const { pipeline } = rig(DURABLE_POLICIES, store);
    await pipeline.start();

    for (let i = 1; i < MAX_COMMIT_ATTEMPTS; i++) {
      await expect(
        pipeline.handlers.onMessage("plant/p1/telemetry", reading("poison"), meta()),
      ).rejects.toThrow();
    }
    // ActiveMQ Classic has no redelivery cap and no DLQ on the MQTT path, so a
    // message the inbox can never commit would be redelivered forever and
    // permanently wedge that subscription. Acknowledge, quarantine, say so, and
    // lose exactly that one message.
    const final = pipeline.handlers.onMessage("plant/p1/telemetry", reading("poison"), meta());
    await expect(final).resolves.toBeUndefined();
    expect(pipeline.status.givenUp).toBe(1);
    expect(pipeline.quarantine.some((q) => q.reason === "inbox-unavailable")).toBe(true);

    // The connection is not wedged: non-durable traffic still flows.
    await pipeline.handlers.onMessage("plant/p1/status", reading("ok"), meta({ qos: 0 }));
    expect(pipeline.delivered.some((d) => d.channel === "plant/+/status")).toBe(true);
  });

  it("GO: a plain row carries `writes: undefined`, so there is one place to define the effect (D4)", async () => {
    const { pipeline } = rig();
    await pipeline.start();
    await pipeline.handlers.onMessage("plant/p1/status", reading("s"), meta({ qos: 0 }));
    await pipeline.handlers.onMessage("plant/p1/telemetry", reading("t"), meta());
    const plain = pipeline.delivered.find((d) => d.channel === "plant/+/status");
    const durable = pipeline.delivered.find((d) => d.channel === "plant/+/telemetry");
    expect(plain?.writes).toBeUndefined();
    expect(durable?.writes).toEqual([{ op: "put", store: "readings", key: "t", value: 1 }]);
  });
});
