// CHECK (report list): "Coverage layers in this repo — verify oxlint
// `no-restricted-imports` overrides allow the two ingress modules and ban
// `mqtt`/raw-client imports everywhere else (0010's overrides-merge caveat)."
//
// Runs the REAL oxlint binary via execFile over lint-fixtures/, against two
// committed configs:
//
//   .oxlintrc.json        the recommended config — the ingress override
//                         RESTATES the base `patterns` block
//   .oxlintrc.naive.json  the same config written the obvious way, without the
//                         restatement — i.e. the caveat, reproduced
//
// D-0002 holds: both layering rules are expressible with `no-restricted-imports`
// alone, no new lint toolchain.

import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const spikeRoot = fileURLToPath(new URL("..", import.meta.url));
const oxlintBin = fileURLToPath(new URL("../node_modules/.bin/oxlint", import.meta.url));

const pinnedVersion: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    devDependencies: Record<string, string>;
  }
).devDependencies["oxlint"] as string;

interface Diagnostic {
  message: string;
  code: string;
  help?: string;
}
interface LintRun {
  exitCode: number;
  diagnostics: Diagnostic[];
}

async function lint(config: string, ...files: string[]): Promise<LintRun> {
  try {
    const { stdout } = await execFileAsync(oxlintBin, ["-c", config, "-f", "json", ...files], {
      cwd: spikeRoot,
    });
    return { exitCode: 0, diagnostics: (JSON.parse(stdout) as LintRun).diagnostics };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return {
      exitCode: failure.code ?? -1,
      diagnostics: (JSON.parse(failure.stdout ?? '{"diagnostics":[]}') as LintRun).diagnostics,
    };
  }
}

const restricted = (run: LintRun): string[] =>
  run.diagnostics
    .filter((d) => d.code === "eslint(no-restricted-imports)")
    .map((d) => d.message);

const INGRESS = "lint-fixtures/ingress/mqtt-ingress.ts";
const INGRESS_BAD = "lint-fixtures/ingress/mqtt-ingress.violation.ts";
const FEATURE = "lint-fixtures/features/plant-panel.clean.ts";
const FEATURE_BAD = "lint-fixtures/features/plant-panel.violation.ts";

describe("layering lint (oxlint no-restricted-imports, D-0002 / I5)", () => {
  it("runs the pinned oxlint version", async () => {
    const { stdout } = await execFileAsync(oxlintBin, ["--version"]);
    expect(pinnedVersion).toBe("1.78.0"); // exact-pinned, per the harness spec
    expect(stdout.trim()).toBe(`Version: ${pinnedVersion}`);
  });

  it("ALLOWS `mqtt` in the ingress module — and only there", async () => {
    const ingress = await lint(".oxlintrc.json", INGRESS);
    expect(ingress.exitCode).toBe(0);
    expect(ingress.diagnostics).toStrictEqual([]);

    const feature = await lint(".oxlintrc.json", FEATURE_BAD);
    expect(feature.exitCode).toBe(1);
    expect(restricted(feature)).toContain("'mqtt' import is restricted from being used.");
    expect(feature.diagnostics.map((d) => d.help).join("\n")).toContain("one ingress per protocol");
  });

  it("BANS the raw generated client outside the mutator, ingress included", async () => {
    const feature = await lint(".oxlintrc.json", FEATURE_BAD);
    expect(restricted(feature)).toHaveLength(2);
    expect(restricted(feature).join("\n")).toContain("'../../app/api/generated/plants.js'");

    // The load-bearing half: the allowance for `mqtt` must not take the
    // generated-client ban down with it.
    const ingress = await lint(".oxlintrc.json", INGRESS_BAD);
    expect(ingress.exitCode).toBe(1);
    const messages = restricted(ingress);
    expect(messages).toHaveLength(2);
    expect(messages.join("\n")).toContain("'../../app/api/generated/plants.js'");
    expect(messages.join("\n")).toContain("'../features/plant-panel.clean.js'");
    // `mqtt` is NOT among them: the override granted it, as designed.
    expect(messages.join("\n")).not.toContain("'mqtt' import is restricted");
  });

  it("PASSES clean feature code (no false positives)", async () => {
    const run = await lint(".oxlintrc.json", FEATURE, INGRESS);
    expect(run.exitCode).toBe(0);
    expect(run.diagnostics).toStrictEqual([]);
  });

  it("CONFIRMS 0010's caveat: an override REPLACES the base rule options", async () => {
    // Same fixture, same rule, same oxlint — the only difference is that the
    // naive config's override does not restate the base `patterns` block.
    const mitigated = restricted(await lint(".oxlintrc.json", INGRESS_BAD));
    const naive = restricted(await lint(".oxlintrc.naive.json", INGRESS_BAD));

    expect(mitigated).toHaveLength(2);
    expect(naive).toHaveLength(1); // the generated-client ban silently vanished

    expect(mitigated.join("\n")).toContain("'../../app/api/generated/plants.js'");
    expect(naive.join("\n")).not.toContain("'../../app/api/generated/plants.js'");

    // Outside the override both configs are identical, which is what makes this
    // a FALSE NEGATIVE rather than a visible misconfiguration: the rule looks
    // configured and still fires everywhere else.
    const featureMitigated = restricted(await lint(".oxlintrc.json", FEATURE_BAD));
    const featureNaive = restricted(await lint(".oxlintrc.naive.json", FEATURE_BAD));
    expect(featureNaive).toStrictEqual(featureMitigated);
    expect(featureNaive).toHaveLength(2);
  });

  it("keeps the mitigation honest: the restatement is verbatim", () => {
    const config = JSON.parse(
      readFileSync(new URL("../.oxlintrc.json", import.meta.url), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    ) as {
      rules: Record<string, [string, { patterns: { group: string[]; message: string }[] }]>;
      overrides: {
        files: string[];
        rules: Record<string, [string, { patterns: { group: string[]; message: string }[] }]>;
      }[];
    };
    const base = config.rules["no-restricted-imports"]?.[1].patterns ?? [];
    const override =
      config.overrides[0]?.rules["no-restricted-imports"]?.[1].patterns ?? [];

    // Every base pattern must appear, unchanged, inside the override — this is
    // the assertion that catches the drift the caveat makes invisible.
    for (const pattern of base) {
      expect(override).toContainEqual(pattern);
    }
    expect(override.length).toBeGreaterThan(base.length); // plus the ingress-specific one
  });
});
