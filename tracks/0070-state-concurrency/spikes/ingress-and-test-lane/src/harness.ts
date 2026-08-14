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
      // microtask flush covers `.then`-scheduled pushes either way.
      for (let round = 0; round < 64; round++) {
        await s.waitIdle();
        await flushMicrotasks();
        if (s.count() === 0) return;
      }
    },
  };
}
