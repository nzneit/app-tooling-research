// CHECK 1 (evidence) — the glue-line count recorded in findings.md, pinned as
// an assertion so it cannot silently drift. "Glue" = caller-authored composition
// code only: the Wire declarations + kit construction on the kit side, and the
// hand-rolled subscribe/equals/mailbox/teardown on the baseline side. Machine,
// store and component definitions are excluded from both regions.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./composition.test.ts", import.meta.url)),
  "utf8",
);

function countRegion(marker: string): number {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.includes(`glue:${marker}:start`));
  const end = lines.findIndex((l) => l.includes(`glue:${marker}:end`));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return lines
    .slice(start + 1, end)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//")).length;
}

describe("glue-line accounting (check 1)", () => {
  it("wires both directions in a bounded number of caller-authored lines", () => {
    const kit = countRegion("kit");
    const manual = countRegion("manual");
    // Numbers recorded in findings.md; update both together if the wiring moves.
    expect(kit).toBe(10);
    expect(manual).toBe(30);
    expect(manual / kit).toBeGreaterThanOrEqual(3);
  });
});
