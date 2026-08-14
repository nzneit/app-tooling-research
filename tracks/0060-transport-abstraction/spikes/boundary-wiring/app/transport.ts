// app/transport.ts — the composition root (design.md, "Usage sketch").
//
// In a real app this file is one `export const boundary = createTransportBoundary(...)`
// and the orval mutator static-imports it. The spike needs a different scripted
// fetch table per test, so the single live handle sits behind `installBoundary`
// / `boundary()` instead of a module-level const. That is a TEST affordance, not
// a design change: the fact that orval's mutator forces a static import of the
// app's one boundary is exactly what design.md places here (in app code, one
// visible line) rather than inside the package as a hidden global slot.

import {
  createTransportBoundary,
  type BoundaryAdapters,
  type TransportBoundary,
} from "../src/index.js";
import { plantsContract } from "./contract.js";
import { appPolicy } from "./policy.js";

export type AppBoundary = TransportBoundary<typeof appPolicy>;

export function createAppBoundary(adapters?: Partial<BoundaryAdapters>): AppBoundary {
  return createTransportBoundary(
    {
      mqtt: { url: "wss://broker.example/mqtt" },
      policy: appPolicy,
      rest: { baseUrl: "https://api.example", contract: plantsContract },
    },
    adapters,
  );
}

let current: AppBoundary | null = null;

/** Installs the app's one live boundary; returns a disposer that also uninstalls. */
export function installBoundary(b: AppBoundary): () => Promise<void> {
  current = b;
  return async () => {
    if (current === b) current = null;
    await b.dispose();
  };
}

export function boundary(): AppBoundary {
  if (current === null)
    throw new Error("app/transport: no boundary installed — call installBoundary() first");
  return current;
}
