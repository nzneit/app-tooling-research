// @vitest-environment happy-dom
//
// CHECK 1 — composition wiring end to end.
//   machine -> vanilla store -> React (actor.subscribe -> setState -> useSelector)
//   store -> machine (subscribeWithSelector (next, prev) -> actor.send)
// declared through design.md's `Wire` arms, plus the bounded-dispatch
// (no-feedback-loop) assertion under synchronous fan-out.
//
// The `glue:*` markers delimit caller-authored wiring code; test/glue-count.test.ts
// counts them and pins the numbers recorded in findings.md.

import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { assign, createActor, createMachine } from "xstate";
import { useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { createStateKit } from "../src/index.ts";
import type { Wire } from "../src/index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => cleanup());

interface RigState {
  speed: number;
  setSpeed: (speed: number) => void;
}

type RigEvent = { type: "THROTTLE"; value: number } | { type: "STORE_SPEED"; value: number };

/** `clamp` models a machine that rewrites what the store pushed at it — the
 *  write-back listener that must converge instead of live-locking. */
function makeMachine(clamp: (n: number) => number) {
  return createMachine({
    types: {} as { context: { speed: number }; events: RigEvent },
    id: "rig",
    initial: "running",
    context: { speed: 0 },
    states: { running: {} },
    on: {
      THROTTLE: { actions: assign({ speed: ({ event }) => event.value }) },
      STORE_SPEED: { actions: assign({ speed: ({ event }) => clamp(event.value) }) },
    },
  });
}

function makeStore() {
  return createStore<RigState>()(
    subscribeWithSelector((set) => ({ speed: 0, setSpeed: (speed) => set({ speed }) })),
  );
}

describe("composition wiring (check 1)", () => {
  it("carries machine -> store -> React and store -> machine through Wire declarations", () => {
    const actor = createActor(makeMachine((n) => n)).start();
    const store = makeStore();

    // glue:kit:start
    const wires: Wire[] = [
      { fromMachine: actor, select: (snap) => snap.context.speed, into: store.getState().setSpeed },
      {
        fromStore: store,
        select: (state: RigState) => state.speed,
        event: (next, prev) => (next === prev ? null : { type: "STORE_SPEED", value: next }),
        toMachine: actor,
      },
    ];
    const kit = createStateKit({ wires });
    // glue:kit:end

    function SpeedReadout() {
      const speed = useStore(store, (s) => s.speed);
      return createElement("output", { "data-testid": "speed" }, String(speed));
    }

    render(createElement(SpeedReadout));
    expect(screen.getByTestId("speed").textContent).toBe("0");

    // machine -> store -> React: actor.subscribe -> setState -> useSelector.
    act(() => {
      actor.send({ type: "THROTTLE", value: 42 });
    });
    expect(store.getState().speed).toBe(42);
    expect(screen.getByTestId("speed").textContent).toBe("42");

    // store -> machine: subscribeWithSelector (next, prev) -> actor.send.
    act(() => {
      store.getState().setSpeed(7);
    });
    expect(actor.getSnapshot().context.speed).toBe(7);
    expect(screen.getByTestId("speed").textContent).toBe("7");

    kit.dispose();
    // After teardown the wires are cut: the store no longer follows the machine.
    actor.send({ type: "THROTTLE", value: 99 });
    expect(store.getState().speed).toBe(7);
    actor.stop();
  });

  it("converges a write-back listener at a bounded dispatch count, with no re-entrancy", () => {
    // The machine clamps whatever the store sends back, so the store->machine
    // wire genuinely changes machine state, which the machine->store wire then
    // pushes back at the store: a real feedback cycle, not a trivial echo.
    const actor = createActor(makeMachine((n) => Math.min(n, 10))).start();
    const store = makeStore();

    let storeWrites = 0;
    let machineSends = 0;
    let insideWire = false;
    let maxNesting = 0;

    const wires: Wire[] = [
      {
        fromMachine: actor,
        select: (snap) => snap.context.speed,
        into: (speed: number) => {
          maxNesting = Math.max(maxNesting, insideWire ? 2 : 1);
          insideWire = true;
          storeWrites++;
          store.getState().setSpeed(speed);
          insideWire = false;
        },
      },
      {
        fromStore: store,
        select: (state: RigState) => state.speed,
        event: (next, prev) => (next === prev ? null : { type: "STORE_SPEED", value: next }),
        toMachine: {
          send: (event) => {
            machineSends++;
            actor.send(event as RigEvent);
          },
        },
      },
    ];
    const kit = createStateKit({ wires });

    actor.send({ type: "THROTTLE", value: 42 });

    // 42 -> store 42 -> machine clamps to 10 -> store 10 -> machine clamps to
    // 10 (identical projection, short-circuited). Bounded, and it terminates.
    expect(storeWrites).toBe(2);
    expect(machineSends).toBe(2);
    expect(store.getState().speed).toBe(10);
    expect(actor.getSnapshot().context.speed).toBe(10);
    // Invariant 9: fan-out is queued run-to-completion, never re-entered.
    expect(maxNesting).toBe(1);

    kit.dispose();
    actor.stop();
  });

  it("costs more glue when hand-rolled without the kit (baseline)", () => {
    // Same two wires, same clamping machine, same convergence guarantees — but
    // the caller now owns the equals short-circuit, the run-to-completion
    // mailbox (invariant 9) and the teardown ordering (invariant 11) by hand.
    const actor = createActor(makeMachine((n) => Math.min(n, 10))).start();
    const store = makeStore();

    // glue:manual:start
    const mailbox: Array<() => void> = [];
    let draining = false;
    const runToCompletion = (task: () => void) => {
      mailbox.push(task);
      if (draining) return;
      draining = true;
      try {
        while (mailbox.length > 0) mailbox.shift()!();
      } finally {
        draining = false;
      }
    };
    let projected = actor.getSnapshot().context.speed;
    const machineSub = actor.subscribe((snap) => {
      const next = snap.context.speed;
      if (Object.is(next, projected)) return;
      projected = next;
      runToCompletion(() => store.getState().setSpeed(next));
    });
    const storeUnsub = store.subscribe(
      (state) => state.speed,
      (next, prev) => {
        if (next === prev) return;
        runToCompletion(() => actor.send({ type: "STORE_SPEED", value: next }));
      },
    );
    const teardown = () => {
      storeUnsub();
      machineSub.unsubscribe();
    };
    // glue:manual:end

    actor.send({ type: "THROTTLE", value: 42 });

    expect(store.getState().speed).toBe(10);
    expect(actor.getSnapshot().context.speed).toBe(10);

    teardown();
    actor.send({ type: "THROTTLE", value: 99 });
    expect(store.getState().speed).toBe(10);
    actor.stop();
  });
});
