import { IDBFactory } from "fake-indexeddb";
import type {
  CompiledValidator,
  DurableChannelPolicy,
  EffectWrite,
  PacketMeta,
  PolicyTable,
  Validated,
} from "../src/index.js";

export interface Reading {
  id: string;
  seq: number;
  value: number;
}

export const isReading: CompiledValidator<Reading> = (data): data is Reading =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as Reading).id === "string" &&
  typeof (data as Reading).value === "number";

/**
 * The accumulating effect — an append. This is the shape that actually needs an
 * inbox: a replacing effect is already safe under redelivery.
 */
export const appendReading: DurableChannelPolicy<Reading>["durable"] = (payload) => {
  const p = payload as Reading;
  return {
    id: p.id,
    writes: [{ op: "put", store: "readings", key: `${p.id}`, value: p.value }],
  };
};

export const DURABLE_POLICIES: PolicyTable = {
  "plant/+/telemetry": {
    validate: isReading,
    direction: "in",
    qos: 1,
    durable: appendReading,
  } satisfies DurableChannelPolicy<Reading>,
  "plant/+/status": { validate: isReading, direction: "in", qos: 0 },
};

export function meta(over: Partial<PacketMeta> = {}): PacketMeta {
  return { dup: false, retain: false, qos: 1, epoch: 1, messageId: 1, ...over };
}

export function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function reading(id: string, value = 1, seq = 0): Uint8Array {
  return bytes({ id, value, seq } satisfies Reading);
}

export function validated<T>(v: T): Validated<T> {
  return v as Validated<T>;
}

/** A fresh in-memory IndexedDB engine per test — no shared global, so parallel
 *  vitest workers cannot collide. */
export function freshFactory(): IDBFactory {
  return new IDBFactory();
}

export function writesOf(list: readonly EffectWrite[]): string[] {
  return list.map((w) => `${w.op}:${w.store}/${w.key}`);
}

export const RETENTION_MS = 60_000;
