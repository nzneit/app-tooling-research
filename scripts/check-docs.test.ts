// scripts/check-docs.test.ts — unit tests for the doc-system validator.
// Run: node --test scripts/check-docs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEntries, checkIds, slugify, resolveAnchor, checkLinks,
  parseIndexRows, checkIndex, checkTrackDirs, checkReports, checkIntake,
  stripFenced, checkFrontier,
} from "./check-docs.ts";
import type { Entry } from "./check-docs.ts";

const entry = (id: string, line = 1): Entry => ({ title: `${id}: t`, meta: {}, body: "", line });
const getId = (e: Entry) => e.title.match(/^(D-\d+)/)?.[1] ?? "";

test("parseEntries reads **Field**: meta and body", () => {
  const [e] = parseEntries("### D-0001: a\n**Date**: 2026-08-13\nBody line.", 3);
  assert.equal(e.meta.DATE, "2026-08-13");
  assert.equal(e.body, "Body line.");
});

test("parseEntries isolates heading levels", () => {
  const es = parseEntries("### D-0001: a\n#### sub\n**Date**: x", 3);
  assert.deepEqual(es.map((e) => e.title), ["D-0001: a"]);
});

test("checkIds accepts contiguous four-digit ids", () => {
  assert.deepEqual(checkIds([entry("D-0001"), entry("D-0002")], "D", 4, getId), []);
});

test("checkIds rejects three-digit ids", () => {
  assert.match(checkIds([entry("D-001")], "D", 4, getId)[0], /bad D id/);
});

test("checkIds flags duplicates and gaps", () => {
  const errs = checkIds([entry("D-0001"), entry("D-0001"), entry("D-0003")], "D", 4, getId);
  assert.ok(errs.some((e) => e.includes("duplicate D-0001")));
  assert.ok(errs.some((e) => e.includes("missing D-0002")));
});

test("slugify + resolveAnchor match heading slugs and back-anchors", () => {
  assert.equal(slugify("Summary (STE)"), "summary-ste");
  assert.ok(resolveAnchor("## Summary (STE)", "summary-ste"));
  assert.ok(resolveAnchor("<!-- anchor: d-0001 -->", "d-0001"));
  assert.ok(!resolveAnchor("## Other", "summary-ste"));
});

test("checkLinks resolves relative links and fragments, skips external", () => {
  const files = [{
    path: "README.md",
    text: "[a](tracks/x.md) [b](https://x.dev) [c](missing.md) [d](tracks/x.md#nope)",
  }];
  const read = (rel: string) => (rel === "tracks/x.md" ? "## Yes" : null);
  const errs = checkLinks(files, read);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /broken link → missing\.md/);
  assert.match(errs[1], /anchor not found/);
});

test("parseIndexRows + checkIndex enforce vocabulary and dir consistency", () => {
  const readme = [
    "| Track | Scope | Status |",
    "|---|---|---|",
    "| 0010-a | x | surveying |",
    "| 0020-b | x | bogus |",
    "| 0030-c | x | planned |",
  ].join("\n");
  const rows = parseIndexRows(readme);
  assert.equal(rows.length, 3);
  const errs = checkIndex(rows, ["0010-a", "0040-d"]);
  assert.ok(errs.some((e) => e.includes('invalid status "bogus"')));
  assert.ok(!errs.some((e) => e.includes("0030-c is")));   // planned may lack a dir
  assert.ok(errs.some((e) => e.includes("tracks/0040-d/ has no row")));
});

test("checkIndex flags a non-planned row without a directory", () => {
  const errs = checkIndex([{ track: "0010-a", status: "accepted", line: 3 }], []);
  assert.ok(errs.some((e) => e.includes('"accepted" but tracks/0010-a/ does not exist')));
});

test("checkTrackDirs enforces four-digit kebab names", () => {
  assert.deepEqual(checkTrackDirs(["0010-contract-pipeline"]), []);
  assert.equal(checkTrackDirs(["010-x", "0010_bad"]).length, 2);
});

test("checkReports requires the STE summary as first H2", () => {
  assert.deepEqual(checkReports([{ path: "r", text: "# T\n\n## Summary (STE)\nok" }]), []);
  assert.equal(checkReports([{ path: "r", text: "# T\n\n## Survey" }]).length, 1);
});

test("checkIntake requires a Status field; resolved may stay in place", () => {
  assert.deepEqual(checkIntake([{ name: "2026-08-13-q.md", content: "**Status**: resolved" }]), []);
  assert.equal(checkIntake([{ name: "2026-08-13-q.md", content: "no status" }]).length, 1);
});

test("stripFenced blanks fenced content and preserves line count", () => {
  const t = "a\n```md\n### D-0009: fake\n```\nb";
  const s = stripFenced(t);
  assert.equal(s.split("\n").length, 5);
  assert.ok(!s.includes("D-0009"));
  assert.ok(s.includes("a") && s.includes("b"));
});

test("parseEntries ignores fenced ledger examples", () => {
  const doc = "### D-0001: real\n**Date**: x\n```markdown\n### D-0001: example entry\n```";
  const es = parseEntries(doc, 3);
  assert.equal(es.length, 1);
  assert.deepEqual(checkIds(es, "D", 4, getId), []);
});

test("fenced example cannot fill a deleted-ID gap", () => {
  const doc = "### D-0001: a\n\n### D-0003: c\n```\n### D-0002: example\n```";
  const errs = checkIds(parseEntries(doc, 3), "D", 4, getId);
  assert.ok(errs.some((e) => e.includes("missing D-0002")));
});

test("checkLinks ignores links inside fences", () => {
  const files = [{ path: "t.md", text: "```\n[x](missing.md)\n```\n[y](real.md)" }];
  const read = (rel: string) => (rel === "real.md" ? "ok" : null);
  assert.deepEqual(checkLinks(files, read), []);
});

test("checkReports ignores fenced headings before the real summary", () => {
  const ok = "# T\n```\n## Nope\n```\n\n## Summary (STE)\nok";
  assert.deepEqual(checkReports([{ path: "r", text: ok }]), []);
});

test("checkFrontier requires the frontier line", () => {
  assert.deepEqual(checkFrontier("> **Frontier:** do the thing"), []);
  assert.equal(checkFrontier("no frontier here").length, 1);
});
