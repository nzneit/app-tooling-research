// DELIBERATE VIOLATION FIXTURE — this file is never executed. It exists so
// test/layering-lint.test.ts can prove oxlint's `no-restricted-imports` really
// rejects the two rules D-0002 buys us:
//   1. copying query data into a store (design.md invariant 5 — banned), and
//   2. reaching the transport feed from outside the composition root
//      (design.md invariant 2 — single dispatch).

import { QueryClient } from "@tanstack/react-query"; // ← violation 1 (no-store-copy)
import { rigQueryKey } from "../query/rig-queries.ts"; // ← violation 1 (no-store-copy)
import { rigFeed } from "../transport/feed.ts"; // ← violation 2 (single-writer)

const queryClient = new QueryClient();

export const rigStore = {
  speed: 0,
  /** Exactly the move the partition bans: query data copied into store state. */
  hydrateFromCache(rigId: string): void {
    const cached = queryClient.getQueryData(rigQueryKey(rigId)) as { speed: number } | undefined;
    if (cached !== undefined) rigStore.speed = cached.speed;
  },
  /** …and a second transport-side writer behind the kit's back. */
  listen(): void {
    rigFeed.subscribe("rig/+/telemetry", (payload) => {
      rigStore.speed = (payload as { speed: number }).speed;
    });
  },
};
