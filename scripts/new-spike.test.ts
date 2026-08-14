// scripts/new-spike.test.ts — unit tests for the spike scaffolder.
// Run: node --test scripts/new-spike.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffold, substitute, validateSlug } from "./new-spike.ts";

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "new-spike-"));
  mkdirSync(join(root, "templates", "spike", "test"), { recursive: true });
  mkdirSync(join(root, "tracks", "0060-transport-abstraction"), { recursive: true });
  writeFileSync(join(root, "templates", "spike", "package.json"), '{"name":"__SPIKE_PACKAGE_NAME__"}');
  writeFileSync(join(root, "templates", "spike", "findings.md"), "# Findings — __SPIKE_SLUG__\n**Status**: planned\n");
  return root;
}

test("validateSlug accepts kebab, rejects others", () => {
  assert.equal(validateSlug("boundary-wiring"), true);
  assert.equal(validateSlug("Bad_Name"), false);
});

test("substitute replaces every occurrence", () => {
  assert.equal(substitute("a __X__ b __X__", { __X__: "y" }), "a y b y");
});

test("scaffold copies template with substitutions", () => {
  const root = makeRoot();
  const dest = scaffold(root, "0060-transport-abstraction", "boundary-wiring", "2026-08-14");
  assert.equal(existsSync(join(dest, "package.json")), true);
  assert.match(readFileSync(join(dest, "package.json"), "utf8"), /spike-0060-boundary-wiring/);
  assert.match(readFileSync(join(dest, "findings.md"), "utf8"), /boundary-wiring/);
});

test("scaffold refuses bad slug, existing dir, unknown track", () => {
  const root = makeRoot();
  scaffold(root, "0060-transport-abstraction", "dup", "2026-08-14");
  assert.throws(() => scaffold(root, "0060-transport-abstraction", "dup", "2026-08-14"), /already exists/);
  assert.throws(() => scaffold(root, "0060-transport-abstraction", "Bad_Name", "2026-08-14"), /kebab/);
  assert.throws(() => scaffold(root, "0099-nope", "ok-slug", "2026-08-14"), /no such track/);
});
