// Shared fixture for the ingress race: one MQTT-only entity owned by a Zustand
// slice over a wildcard topic, hydrated by a scheduled REST call whose
// resolution enters state through the SAME single-dispatch ingress.
// Not a test file — imported by ingress-race.test.ts and replay-and-pinning.test.ts.

import type { Scheduler } from "fast-check";
import { createStore } from "zustand/vanilla";
import { createRaceHarness, createStateKit } from "../src/index.ts";
import type { IngressStats, StreamDecl, ValidatedMessage } from "../src/index.ts";

export interface Telemetry {
  rigId: string;
  version: number;
  speed: number;
}

export function telemetry(packetId: string, payload: Telemetry): ValidatedMessage<Telemetry> {
  return { topic: `rig/${payload.rigId}/telemetry`, packetId, payload };
}

export function rigStream(
  writes: number[],
  store: { setState: (p: { version: number; speed: number }) => void },
  stamped: boolean,
): StreamDecl<Telemetry> {
  return {
    topic: "rig/+/telemetry",
    entity: (msg) => msg.payload.rigId,
    ...(stamped ? { stamp: (msg: ValidatedMessage<Telemetry>) => msg.payload.version } : {}),
    dispatch: {
      store: (msg) => {
        writes.push(msg.payload.version);
        store.setState({ version: msg.payload.version, speed: msg.payload.speed });
      },
    },
  };
}

export interface RaceOutcome {
  /** Versions actually written to the store, in dispatch order. */
  writes: number[];
  stats: IngressStats;
  finalVersion: number;
  /** Scheduler task ids in release order — the interleaving, as data. */
  order: number[];
}

/**
 * A REST hydrate carrying the OLDEST server state (version 1) racing two newer
 * MQTT pushes (versions 2 and 3). Task ids under fc's scheduler:
 *   1 = `GET /rig/1` (scheduleFunction, created on call)
 *   2 = MQTT v2 delivery, 3 = MQTT v3 delivery
 *   4 = the REST resolution's own ingress delivery (scheduled by task 1)
 */
export async function runRace(s: Scheduler, stamped: boolean): Promise<RaceOutcome> {
  const writes: number[] = [];
  const store = createStore<{ version: number; speed: number }>(() => ({ version: 0, speed: 0 }));
  const harness = createRaceHarness(s);
  const kit = createStateKit({
    feed: harness.feed,
    streams: { rig: rigStream(writes, store, stamped) },
  });

  const fetchRig = harness.wrap(
    async (): Promise<Telemetry> => ({ rigId: "1", version: 1, speed: 5 }),
    "GET /rig/1",
  );
  void fetchRig().then((snapshot) => harness.push(telemetry("rest:1", snapshot)));

  harness.push(
    telemetry("m1", { rigId: "1", version: 2, speed: 20 }),
    telemetry("m2", { rigId: "1", version: 3, speed: 30 }),
  );

  await harness.settle();

  const stats = kit.stats;
  const order = s
    .report()
    .filter((r) => r.status !== "pending")
    .map((r) => r.taskId);
  kit.dispose();

  return { writes, stats, finalVersion: store.getState().version, order };
}
