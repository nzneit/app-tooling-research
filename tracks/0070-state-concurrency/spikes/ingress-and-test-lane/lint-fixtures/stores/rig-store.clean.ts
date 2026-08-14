// The SAME store, written the way the partition requires: MQTT-only state,
// written by one exported action that only the kit's DispatchTarget calls, and
// no knowledge of the QueryCache or the transport feed whatsoever.
// Fixture for test/layering-lint.test.ts; not part of the kit.

export interface RigState {
  speed: number;
}

export const rigStore: RigState & { setSpeed(speed: number): void } = {
  speed: 0,
  /** The kit's `{ store }` DispatchTarget is this action's only caller. */
  setSpeed(speed: number): void {
    rigStore.speed = speed;
  },
};
