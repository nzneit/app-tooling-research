// The connection machine (xstate 5.32.5). The adapter owns the retry LOOP
// (mqtt.js reconnectPeriod); this machine owns the give-up POLICY: bounded
// backoff windows timed on the ClockPort, then 'degraded' with publish gating,
// re-armed only by an explicit reconnect() (O4).
//
// xstate is confined to this file: BoundaryActorRef is structural, so the v6
// migration / 0070 RxJS-fallback blast radius is one file plus two methods.

import { assign, createActor, setup } from "xstate";
import type { BoundarySnapshot, ClockPort } from "../types.js";

export type ConnectionState = BoundarySnapshot["connection"];

export type ConnectionEvent =
  | { type: "START" }
  | { type: "BROKER_CONNECT" }
  /** close | offline | error — connection failure is INFERRED, not reported. */
  | { type: "BROKER_DOWN" }
  | { type: "RECONNECT" }
  | { type: "DISPOSE" };

interface ConnectionContext {
  attempt: number;
  degradedSince: number | undefined;
}

export interface ConnectionMachineOptions {
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  clock: ClockPort;
  now: () => number;
}

export interface ConnectionActor {
  state(): ConnectionState;
  attempt(): number;
  degradedSince(): number | undefined;
  send(ev: ConnectionEvent): void;
  onTransition(listener: (state: ConnectionState) => void): () => void;
  stop(): void;
}

export function createConnectionActor(opts: ConnectionMachineOptions): ConnectionActor {
  const machine = setup({
    types: {} as { context: ConnectionContext; events: ConnectionEvent },
    delays: {
      retry: ({ context }) => opts.backoffMs(context.attempt),
    },
    guards: {
      exhausted: ({ context }) => context.attempt >= opts.maxAttempts,
    },
  }).createMachine({
    id: "connection",
    initial: "idle",
    context: { attempt: 0, degradedSince: undefined },
    on: { DISPOSE: ".ended" },
    states: {
      idle: {
        on: { START: "connecting" },
      },
      connecting: {
        entry: assign({ attempt: 0, degradedSince: undefined }),
        on: { BROKER_CONNECT: "connected", BROKER_DOWN: "reconnecting" },
      },
      connected: {
        entry: assign({ attempt: 0 }),
        on: { BROKER_DOWN: "reconnecting" },
      },
      reconnecting: {
        entry: assign({ attempt: ({ context }) => context.attempt + 1 }),
        after: {
          retry: [
            { guard: "exhausted", target: "degraded" },
            { target: "reconnecting", reenter: true },
          ],
        },
        on: { BROKER_CONNECT: "connected" },
      },
      degraded: {
        entry: assign({ degradedSince: () => opts.now() }),
        on: { RECONNECT: "connecting" },
      },
      ended: {},
    },
  });

  const actor = createActor(machine, { clock: opts.clock });
  const listeners = new Set<(s: ConnectionState) => void>();
  let current: ConnectionState = "idle";
  let stopped = false;

  actor.subscribe((snapshot) => {
    const next = snapshot.value as ConnectionState;
    if (next === current) return;
    current = next;
    for (const l of [...listeners]) l(next);
  });
  actor.start();

  return {
    state: () => current,
    attempt: () => actor.getSnapshot().context.attempt,
    degradedSince: () => actor.getSnapshot().context.degradedSince,
    send: (ev) => {
      if (stopped) return;
      actor.send(ev);
    },
    onTransition: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      actor.stop();
    },
  };
}

/** default exp, cap 30s (design.md, BoundaryConfig.mqtt.reconnect.backoffMs). */
export function defaultBackoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}
