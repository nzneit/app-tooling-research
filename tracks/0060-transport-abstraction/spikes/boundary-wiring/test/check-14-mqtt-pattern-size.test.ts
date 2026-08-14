// CHECK (report list): "decide adopt-vs-vendor for mqtt-pattern's ~100 lines."
//
// A scripted measurement rather than a claim: it reads the INSTALLED package
// and pins the numbers the recommendation rests on, so the decision can be
// re-run (and can fail) if a future version changes shape.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clean, exec, fill, matches } from "mqtt-pattern";

const modules = fileURLToPath(new URL("../node_modules/", import.meta.url));

const read = (p: string): string => readFileSync(`${modules}${p}`, "utf8");
const pkg = (name: string): Record<string, unknown> =>
  JSON.parse(read(`${name}/package.json`)) as Record<string, unknown>;

/** Non-blank, non-comment lines — "how much code would we own?". */
const codeLines = (source: string): number =>
  source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
    .length;

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    total += entry.isDirectory() ? dirBytes(full) : statSync(full).size;
  }
  return total;
}

describe("mqtt-pattern: adopt vs vendor", () => {
  it("is the version the spike pinned, MIT, with no transitive RUNTIME weight", () => {
    const meta = pkg("mqtt-pattern");
    expect(meta["version"]).toBe("2.1.1");
    expect(meta["license"]).toBe("MIT");

    // Two declared dependencies, and only one of them is real code:
    expect(Object.keys(meta["dependencies"] as object).sort()).toEqual([
      "mqtt-match",
      "ts-toolbelt",
    ]);
    // ts-toolbelt is a TYPES-only library declared as a runtime dependency —
    // ~248 KB of .d.ts (about 1 MB of disk blocks) that a bundler never emits.
    // Asserted so the number is never mistaken for shipped weight.
    expect(read("mqtt-pattern/index.d.ts")).toContain('import type { F } from "ts-toolbelt"');
    expect(read("mqtt-pattern/index.js")).not.toContain("ts-toolbelt");
    expect(dirBytes(`${modules}ts-toolbelt`)).toBeGreaterThan(200_000);
  });

  it("is ~135 lines of runtime code in total — vendorable in one sitting", () => {
    const own = codeLines(read("mqtt-pattern/index.js"));
    const dep = codeLines(read("mqtt-match/index.js"));

    expect(own).toBeLessThanOrEqual(120);
    expect(dep).toBeLessThanOrEqual(20);
    expect(own + dep).toBeLessThanOrEqual(140);

    // Source bytes, the number that matters for "could we own this?"
    const bytes =
      readFileSync(`${modules}mqtt-pattern/index.js`).byteLength +
      readFileSync(`${modules}mqtt-match/index.js`).byteLength;
    expect(bytes).toBeLessThan(4_096);
  });

  it("the boundary uses exactly four of its exports", () => {
    // The adopt-vs-vendor surface: src/internal/policy.ts imports these four.
    expect(typeof clean).toBe("function");
    expect(typeof exec).toBe("function");
    expect(typeof fill).toBe("function");
    expect(typeof matches).toBe("function");

    expect(clean("plant/+plantId/telemetry")).toBe("plant/+/telemetry");
    expect(exec("plant/+plantId/telemetry", "plant/p7/telemetry")).toEqual({ plantId: "p7" });
    expect(fill("plant/+plantId/telemetry", { plantId: "p7" })).toBe("plant/p7/telemetry");
    expect(matches("plant/+/telemetry", "plant/p7/telemetry")).toBe(true);
  });

  it("has the sharp edge the recommendation has to mention", () => {
    // `fill` stringifies a missing param to the literal "undefined" instead of
    // throwing — the reason src/internal/policy.ts checks the SUPPLIED params
    // rather than scanning the produced topic.
    expect(fill("plant/+plantId/telemetry", {} as never)).toBe("plant/undefined/telemetry");
  });
});
