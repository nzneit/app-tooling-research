// CHECK 7 (report list) — the invalidate-don't-set bridge.
//
// "Wire one push-covered query (`staleTime: Infinity`, MQTT event →
//  `invalidateQueries`) and confirm no path copies query data into Zustand."
//
// The dual-leg entity (`rig/1`) is REST-backed: MQTT carries identity, never
// authority. The MQTT-only entity (`alarm/1`) is the control — it DOES land in
// Zustand, through the kit's `{ store }` DispatchTarget, so the test shows the
// partition rather than merely the absence of one write.

import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createStore } from "zustand/vanilla";
import { createRaceHarness, createStateKit } from "../src/index.ts";
import type { StreamDecl, ValidatedMessage } from "../src/index.ts";

interface RigTelemetry {
  rigId: string;
  speed: number;
  version?: number;
  source: "mqtt" | "rest";
}

interface AlarmEvent {
  alarmId: string;
  level: number;
}

const rigKey = (rigId: string): readonly unknown[] => ["rig", rigId];

async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`until(${label}): condition never held`);
}

describe("invalidate-don't-set bridge", () => {
  it("keeps REST the cache's single writer: the push event only invalidates", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // The REST leg — the only thing allowed to produce cache data.
    let serverSpeed = 10;
    let restCalls = 0;
    const fetchRig = async (): Promise<RigTelemetry> => {
      restCalls++;
      return { rigId: "1", speed: serverSpeed, source: "rest" };
    };

    // Every value the cache ever holds, recorded at the cache itself.
    const cacheWrites: RigTelemetry[] = [];
    const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
      const data = event.query.state.data as RigTelemetry | undefined;
      if (event.type === "updated" && data !== undefined) cacheWrites.push(data);
    });

    // Zustand holds MQTT-only state; the control entity proves the store IS
    // reachable, so "no query data in the store" is not vacuous.
    const alarmStore = createStore<{ level: number }>(() => ({ level: 0 }));
    const storeWrites: number[] = [];

    const harness = createRaceHarness(fc.schedulerFor([1, 2]));
    const rigStream: StreamDecl<RigTelemetry> = {
      topic: "rig/+/telemetry",
      entity: (msg) => msg.payload.rigId,
      dispatch: {
        // Invalidate-don't-set: identity only. There is no affordance on this
        // arm to read or write cache DATA without a stamp (invariant 5).
        query: (msg) => rigKey(msg.payload.rigId),
        family: ["rig"],
      },
    };
    const alarmStream: StreamDecl<AlarmEvent> = {
      topic: "alarm/+/raised",
      entity: (msg) => msg.payload.alarmId,
      dispatch: {
        store: (msg) => {
          storeWrites.push(msg.payload.level);
          alarmStore.setState({ level: msg.payload.level });
        },
      },
    };

    const kit = createStateKit({
      feed: harness.feed,
      queryClient,
      streams: { rig: rigStream, alarm: alarmStream },
    });

    // A push-covered query: staleTime Infinity, so ONLY an invalidation can
    // cause a refetch.
    const observer = new QueryObserver<RigTelemetry>(queryClient, {
      queryKey: rigKey("1"),
      queryFn: fetchRig,
      staleTime: Infinity,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    await until(() => queryClient.getQueryData(rigKey("1")) !== undefined, "initial fetch");
    expect(restCalls).toBe(1);
    expect(queryClient.getQueryData(rigKey("1"))).toStrictEqual({
      rigId: "1",
      speed: 10,
      source: "rest",
    });

    // The server moves on, and MQTT announces it with a payload that WOULD be
    // tempting to write straight into the cache.
    serverSpeed = 42;
    harness.push(
      {
        topic: "rig/1/telemetry",
        packetId: "m1",
        payload: { rigId: "1", speed: 999, source: "mqtt" },
      } satisfies ValidatedMessage<RigTelemetry>,
      {
        topic: "alarm/1/raised",
        packetId: "m2",
        payload: { alarmId: "1", level: 3 },
      } satisfies ValidatedMessage<AlarmEvent>,
    );
    await harness.settle();
    await until(
      () => (queryClient.getQueryData(rigKey("1")) as RigTelemetry).speed === 42,
      "refetch after invalidation",
    );
    expect(restCalls).toBe(2);

    // 1. REST remains the single writer: the push's own payload never lands.
    expect(queryClient.getQueryData(rigKey("1"))).toStrictEqual({
      rigId: "1",
      speed: 42,
      source: "rest",
    });
    expect(cacheWrites.every((write) => write.source === "rest")).toBe(true);
    expect(cacheWrites.some((write) => write.speed === 999)).toBe(false);

    // 2. Nothing copied query data into Zustand — the store only ever saw the
    //    MQTT-only entity, written by its own exported action.
    expect(storeWrites).toStrictEqual([3]);
    expect(alarmStore.getState()).toStrictEqual({ level: 3 });

    // 3. The push cost exactly one refetch, and staleTime Infinity means a
    //    second observer mounting does NOT add another.
    const second = new QueryObserver<RigTelemetry>(queryClient, {
      queryKey: rigKey("1"),
      queryFn: fetchRig,
      staleTime: Infinity,
      retry: false,
    });
    const unsubscribeSecond = second.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(restCalls).toBe(2);

    unsubscribeSecond();
    unsubscribe();
    unsubscribeCache();
    kit.dispose();
  });

  it("bulk-invalidates the family on a reconnect gap, still without writing data", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated: unknown[] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((async (
      filters: { queryKey?: unknown } | undefined,
    ) => {
      invalidated.push(filters?.queryKey);
    }) as typeof queryClient.invalidateQueries);
    const setSpy = vi.spyOn(queryClient, "setQueryData");

    const harness = createRaceHarness(fc.schedulerFor([1, 2]));
    const kit = createStateKit({
      feed: harness.feed,
      queryClient,
      streams: {
        rig: {
          topic: "rig/+/telemetry",
          entity: (msg: ValidatedMessage<RigTelemetry>) => msg.payload.rigId,
          dispatch: { query: (msg) => rigKey(msg.payload.rigId), family: ["rig"] },
        },
      },
    });

    harness.push(
      {
        topic: "rig/1/telemetry",
        packetId: "m1",
        payload: { rigId: "1", speed: 1, source: "mqtt" },
      } satisfies ValidatedMessage<RigTelemetry>,
      "gap",
    );
    await harness.settle();

    expect(invalidated).toStrictEqual([["rig", "1"], ["rig"]]); // per-key, then family
    expect(setSpy).not.toHaveBeenCalled(); // never a data write
    expect(kit.stats.gaps).toBe(1);
    kit.dispose();
    vi.restoreAllMocks();
  });

  it("writes the cache ONLY on the stamped fast path, always after cancelQueries", async () => {
    // design.md's forward path: adding `stamp` + `write` to the same stream is
    // the whole change, and the kit then does cancelQueries -> setQueryData.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const calls: string[] = [];
    vi.spyOn(queryClient, "cancelQueries").mockImplementation((async () => {
      calls.push("cancelQueries");
    }) as typeof queryClient.cancelQueries);
    vi.spyOn(queryClient, "setQueryData").mockImplementation(((...args: unknown[]) => {
      calls.push("setQueryData");
      return QueryClient.prototype.setQueryData.apply(queryClient, args as never);
    }) as typeof queryClient.setQueryData);
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((async () => {
      calls.push("invalidateQueries");
    }) as typeof queryClient.invalidateQueries);

    const harness = createRaceHarness(fc.schedulerFor([1, 2, 3]));
    const kit = createStateKit({
      feed: harness.feed,
      queryClient,
      streams: {
        rig: {
          topic: "rig/+/telemetry",
          entity: (msg: ValidatedMessage<RigTelemetry>) => msg.payload.rigId,
          // Per-message and data-driven: `version` present -> stamped.
          stamp: (msg) => msg.payload.version,
          dispatch: {
            query: (msg) => rigKey(msg.payload.rigId),
            write: (msg) => () => msg.payload,
          },
        },
      },
    });

    harness.push(
      {
        topic: "rig/1/telemetry",
        packetId: "s1",
        payload: { rigId: "1", speed: 5, version: 1, source: "mqtt" },
      } satisfies ValidatedMessage<RigTelemetry>,
      {
        topic: "rig/1/telemetry",
        packetId: "s0",
        payload: { rigId: "1", speed: 4, version: 0, source: "mqtt" }, // stale
      } satisfies ValidatedMessage<RigTelemetry>,
      {
        topic: "rig/1/telemetry",
        packetId: "u1",
        payload: { rigId: "1", speed: 6, source: "mqtt" }, // NO stamp
      } satisfies ValidatedMessage<RigTelemetry>,
    );
    await harness.settle();

    // Stamped message: cancelQueries THEN the write. Stale stamp: nothing.
    // Unstamped message on the same stream: invalidate-don't-set, no write.
    expect(calls).toStrictEqual(["cancelQueries", "setQueryData", "invalidateQueries"]);
    expect(queryClient.getQueryData(rigKey("1"))).toStrictEqual({
      rigId: "1",
      speed: 5,
      version: 1,
      source: "mqtt",
    });
    expect(kit.stats.stale).toBe(1);
    kit.dispose();
    vi.restoreAllMocks();
  });
});
