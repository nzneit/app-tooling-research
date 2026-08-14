// CHECK 7 (report list), lint half — the layering rules that make the
// partition enforceable:
//
// "verify the layering lint (oxlint `no-restricted-imports`) rejects a
//  deliberate violation of the single-writer and no-store-copy rules in this
//  repo's oxlint version."
//
// Runs the REAL oxlint binary over the fixtures in ../lint-fixtures, and also
// settles 0010's open question: does the overrides-merge caveat (oxc#12179)
// bite in this version?

import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const spikeRoot = fileURLToPath(new URL("..", import.meta.url));
const oxlintBin = fileURLToPath(new URL("../node_modules/.bin/oxlint", import.meta.url));

const pinnedVersion: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).devDependencies.oxlint;

interface LintRun {
  exitCode: number;
  diagnostics: Array<{ message: string; code: string; help?: string }>;
}

async function lint(config: string, ...files: string[]): Promise<LintRun> {
  try {
    const { stdout } = await execFileAsync(oxlintBin, ["-c", config, "-f", "json", ...files], {
      cwd: spikeRoot,
    });
    return { exitCode: 0, diagnostics: JSON.parse(stdout).diagnostics };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return {
      exitCode: failure.code ?? -1,
      diagnostics: JSON.parse(failure.stdout ?? '{"diagnostics":[]}').diagnostics,
    };
  }
}

const restricted = (run: LintRun): string[] =>
  run.diagnostics
    .filter((d) => d.code === "eslint(no-restricted-imports)")
    .map((d) => d.message);

describe("layering lint (oxlint no-restricted-imports, D-0002)", () => {
  it("runs the pinned oxlint version", async () => {
    const { stdout } = await execFileAsync(oxlintBin, ["--version"]);
    expect(pinnedVersion).toBe("1.78.0"); // exact-pinned, per the harness spec
    expect(stdout.trim()).toBe(`Version: ${pinnedVersion}`);
  });

  it("REJECTS the deliberate violation fixture", async () => {
    const run = await lint(".oxlintrc.json", "lint-fixtures/stores/rig-store.violation.ts");
    expect(run.exitCode).toBe(1);
    const messages = restricted(run);
    expect(messages).toHaveLength(2);
    expect(messages.join("\n")).toContain("'@tanstack/react-query'"); // no-store-copy
    expect(messages.join("\n")).toContain("'../query/rig-queries.ts'"); // no-store-copy
    expect(run.diagnostics.map((d) => d.help).join("\n")).toContain("invariant 5");
  });

  it("PASSES the clean store and the exempt composition root", async () => {
    const clean = await lint(".oxlintrc.json", "lint-fixtures/stores/rig-store.clean.ts");
    expect(clean.exitCode).toBe(0);
    expect(clean.diagnostics).toStrictEqual([]);

    // The composition root imports the feed and is allowed to: its `overrides`
    // entry turns the rule off for exactly that file.
    const root = await lint(".oxlintrc.json", "lint-fixtures/composition-root.ts");
    expect(root.exitCode).toBe(0);
    expect(root.diagnostics).toStrictEqual([]);
  });

  it("rejects a non-store module reaching the transport feed (single dispatch)", async () => {
    const run = await lint(".oxlintrc.json", "lint-fixtures/features/rig-panel.violation.ts");
    expect(run.exitCode).toBe(1);
    expect(restricted(run)).toHaveLength(1);
    expect(restricted(run)[0]).toContain("'../transport/feed.ts'");
  });

  it("CONFIRMS the overrides-merge caveat: an override REPLACES the base rule options", async () => {
    // The violation fixture imports the transport feed too. The BASE rule bans
    // that pattern repo-wide and demonstrably fires on the non-store fixture
    // above — yet inside `**/stores/**`, where an override supplies its own
    // options, the base pattern is silently gone.
    const withOverride = await lint(
      ".oxlintrc.json",
      "lint-fixtures/stores/rig-store.violation.ts",
    );
    expect(restricted(withOverride).join("\n")).not.toContain("'../transport/feed.ts'");
    expect(restricted(withOverride)).toHaveLength(2); // 2, not 3 — the caveat

    // Mitigation: restate the base patterns inside every override. Same file,
    // same rule, one config change → the third violation appears.
    const mitigated = await lint(
      ".oxlintrc.mitigated.json",
      "lint-fixtures/stores/rig-store.violation.ts",
    );
    expect(mitigated.exitCode).toBe(1);
    expect(restricted(mitigated)).toHaveLength(3);
    expect(restricted(mitigated).join("\n")).toContain("'../transport/feed.ts'");
  });
});
