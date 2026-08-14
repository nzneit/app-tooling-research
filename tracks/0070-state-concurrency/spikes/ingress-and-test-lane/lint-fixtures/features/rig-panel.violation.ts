// A NON-store module reaching the transport feed directly: the base rule (no
// `overrides` entry applies to this path) must reject it. Its role in the
// experiment is to prove the base pattern works — so that when the same import
// goes UNFLAGGED inside `lint-fixtures/stores/`, the difference is the
// overrides-merge caveat and nothing else.
// Fixture for test/layering-lint.test.ts; not part of the kit.

import { rigFeed } from "../transport/feed.ts"; // ← violation (single dispatch)

export function subscribeDirectly(): () => void {
  return rigFeed.subscribe("rig/+/telemetry", () => {});
}
