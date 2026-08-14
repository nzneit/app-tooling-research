// ENTRY POINT 2 — the test adapter of the IngressFeed seam. See design.md
// "Chosen interface" §RaceHarness.

import type { Scheduler } from "fast-check";
import type { FeedEvent, IngressFeed, RaceHarness, ValidatedMessage } from "./types.ts";

function abortErrorFrom(args: unknown[]): Error | undefined {
  for (const arg of args) {
    const signal =
      arg instanceof AbortSignal
        ? arg
        : typeof arg === "object" && arg !== null && "signal" in arg
          ? (arg as { signal?: unknown }).signal
          : undefined;
    if (signal instanceof AbortSignal && signal.aborted) {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return err;
    }
  }
  return undefined;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/** One turn of the macrotask queue, so work parked in a timer can land. */
function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drain rounds `settle()` will spend before declaring the feed non-quiescent. */
const SETTLE_ROUNDS = 64;

export class SettleNotQuiescentError extends Error {
  override readonly name = "SettleNotQuiescentError";
}

/**
 * Accepts `fc.scheduler()` for exploration or `fc.schedulerFor(ordering)` to
 * pin a found interleaving as a deterministic regression test — same harness
 * code either way.
 */
export function createRaceHarness(s: Scheduler): RaceHarness {
  const deliverers = new Set<(event: FeedEvent) => void>();

  const feed: IngressFeed = (deliver) => {
    deliverers.add(deliver);
    return () => {
      deliverers.delete(deliver);
    };
  };

  return {
    feed,

    push(...items: Array<ValidatedMessage | "gap">): void {
      for (const item of items) {
        const event: FeedEvent =
          item === "gap" ? { kind: "gap" } : { kind: "message", message: item };
        const label = item === "gap" ? "gap" : item.packetId;
        void s.schedule(Promise.resolve(event), label).then((released) => {
          // Serialized delivery: each release is its own scheduled task and
          // the pipeline it drives is synchronous, so no deliver() re-enters.
          for (const deliver of deliverers) deliver(released);
        });
      }
    },

    wrap<F extends (...a: any[]) => Promise<any>>(fn: F, label?: string): F {
      const name = label ?? fn.name ?? "wrapped";
      // fast-check derives a report label from the function name; give the
      // wrapper the caller's label so `s.report()` reads legibly.
      const named = { [name]: (...args: any[]) => fn(...args) }[name]!;
      const scheduled = s.scheduleFunction(named);
      return ((...args: any[]) => {
        // s.scheduleFunction invokes the wrapped fn eagerly and schedules only
        // its RESOLUTION, so the abort check belongs after the release — the
        // commit point of invariant 10.
        const alreadyAborted = abortErrorFrom(args);
        if (alreadyAborted !== undefined) return Promise.reject(alreadyAborted);
        return scheduled(...args).then((result: unknown) => {
          const aborted = abortErrorFrom(args);
          if (aborted !== undefined) throw aborted;
          return result;
        });
      }) as F;
    },

    async settle(): Promise<void> {
      // design.md names s.waitAll(); fast-check 4.9 deprecates it in favour of
      // waitIdle(), which also awaits tasks scheduled BY a released task (the
      // REST-resolution-pushes-a-message shape check 2 needs). Looping with a
      // microtask flush covers `.then`-scheduled pushes; the macrotask turn
      // covers work parked in a timer, which waitIdle cannot see.
      for (let round = 0; round < SETTLE_ROUNDS; round++) {
        await s.waitIdle();
        await flushMicrotasks();
        if (s.count() === 0) {
          await flushMacrotask();
          if (s.count() === 0) return;
        }
      }
      // NEVER return quiet with work outstanding: a caller that asserted here
      // would be asserting on partial state and passing vacuously.
      throw new SettleNotQuiescentError(
        `RaceHarness.settle: ${s.count()} scheduled task(s) still pending after ` +
          `${SETTLE_ROUNDS} drain rounds — the feed is not quiescent, so any ` +
          `assertion after this point would be reading partial state.`,
      );
    },
  };
}
