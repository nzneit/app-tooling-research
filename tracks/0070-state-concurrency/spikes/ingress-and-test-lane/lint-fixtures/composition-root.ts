// The composition root — the ONE place allowed to import the transport feed
// (design.md invariant 2). The layering config grants it an exemption via an
// `overrides` entry; test/layering-lint.test.ts asserts the exemption works.
// Fixture for the lint check; not part of the kit.

import { rigFeed } from "./transport/feed.ts";
import { rigStore } from "./stores/rig-store.clean.ts";

export function wireUp(): () => void {
  return rigFeed.subscribe("rig/+/telemetry", (payload) => {
    rigStore.setSpeed((payload as { speed: number }).speed);
  });
}
