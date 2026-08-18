#!/usr/bin/env node
// check-docs.ts — validate this repo's doc-system invariants.
// Spec: docs/superpowers/specs/2026-08-13-tooling-research-program-design.md ("Doc system").
// Adapted from Offbook's scripts/check-docs.ts — Copyright 2026 Nathan Neitman,
// https://github.com/nzneit/offbook — Apache-2.0; see scripts/LICENSE-offbook.
// Zero dependencies: node:fs + hand-parsing. Requires Node >= 24.2 (native type
// stripping + import.meta.main). Run: node scripts/check-docs.ts

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(import.meta.dirname, "..");

export type Entry = { title: string; meta: Record<string, string>; body: string; line: number };

// Blank out fenced code blocks (``` or ~~~) while preserving line numbering,
// so fenced examples are never parsed as live entries, links, or headings.
export function stripFenced(text: string): string {
  let inFence = false;
  let marker = "";
  return text
    .split(/\r?\n/)
    .map((line) => {
      const open = line.match(/^\s*(```|~~~)/);
      if (open) {
        if (!inFence) { inFence = true; marker = open[1]; return ""; }
        if (line.trim().startsWith(marker)) inFence = false;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

// Blank out inline code spans (`x`, ``a`b``) while preserving line count, so
// markdown syntax QUOTED inside backticks is never parsed as a live link.
//
// Shipping conditions from the 9900 report (D-0037), all load-bearing:
//   1. Compose this AFTER stripFenced, never before. Running it first produces
//      13 false errors, because a fenced block's own backticks pair up across
//      the fence and unmask link syntax the fence was hiding.
//   2. Inline spans only. Do NOT extend this to 4-space-indented code blocks by
//      regex — indentation is context-sensitive (list continuation lines are
//      also indented) and a regex cannot tell them apart.
//   3. Scoped to the link scan alone (see checkLinks). It must not reach heading
//      parsing or anchor resolution: blanking a heading's backticked text would
//      change its slug and break anchors that resolve correctly today.
// An unterminated backtick run matches nothing and is left alone, which is the
// safe direction — this check exists to remove false positives, not add them.
export function stripInlineCode(text: string): string {
  return text.replace(/(`+)([\s\S]*?)\1(?!`)/g, (m) => m.replace(/[^\n]/g, " "));
}

// Split a doc into heading blocks at exactly `level` hashes. A heading at any
// other level ends the current entry, so meta/body cannot leak across entries.
export function parseEntries(text: string, level: 3 | 4): Entry[] {
  text = stripFenced(text);
  const head = new RegExp(`^#{${level}}\\s+(.+)$`);
  const anyHead = /^#{1,6}\s+/;
  const out: Entry[] = [];
  let cur: Entry | null = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const h = line.match(head);
    if (h) {
      if (cur) out.push(cur);
      cur = { title: h[1].trim(), meta: {}, body: "", line: i + 1 };
      return;
    }
    if (anyHead.test(line)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) return;
    const m = line.match(/^\*\*([A-Za-z]+)\*\*:\s*(.*)$/);
    if (m) cur.meta[m[1].toUpperCase()] = m[2].trim();
    else if (line.trim()) cur.body += (cur.body ? "\n" : "") + line;
  });
  if (cur) out.push(cur);
  return out;
}

// Unique + well-formed + contiguous from -0001. Contiguity enforces "supersede
// in place, never delete", which is how IDs are guaranteed never reused.
export function checkIds(
  entries: Entry[],
  prefix: string,
  width: number,
  getId: (e: Entry) => string,
): string[] {
  const errs: string[] = [];
  const re = new RegExp(`^${prefix}-\\d{${width}}$`);
  const seen = new Set<string>();
  const nums: number[] = [];
  for (const e of entries) {
    const id = getId(e);
    if (!re.test(id)) { errs.push(`bad ${prefix} id: "${id}" (line ${e.line})`); continue; }
    if (seen.has(id)) errs.push(`duplicate ${id}`);
    seen.add(id);
    nums.push(Number(id.slice(prefix.length + 1)));
  }
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  for (let i = 0; i < uniq.length; i++)
    if (uniq[i] !== i + 1) {
      errs.push(
        `${prefix} ids not contiguous from ${prefix}-${String(1).padStart(width, "0")} ` +
        `(missing ${prefix}-${String(i + 1).padStart(width, "0")}) — supersede in place, never delete`,
      );
      break;
    }
  return errs;
}

export function slugify(heading: string): string {
  return heading.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

export function resolveAnchor(fileText: string, anchor: string): boolean {
  if (fileText.includes(`<!-- anchor: ${anchor} -->`)) return true;
  const headings = fileText.match(/^#{1,6}\s+.+$/gm) ?? [];
  return headings.some((h) => slugify(h.replace(/^#{1,6}\s+/, "")) === anchor);
}

// Every relative markdown link resolves; a #fragment must resolve to a heading
// slug or an additive <!-- anchor: ... --> back-anchor in the target file.
// readFile returns null for a missing path and "" for a directory.
export function checkLinks(
  files: { path: string; text: string }[],
  readFile: (rel: string) => string | null,
): string[] {
  const errs: string[] = [];
  for (const f of files)
    // stripFenced first, then stripInlineCode — the order is a shipping
    // condition, not a style choice. See stripInlineCode's comment.
    for (const m of stripInlineCode(stripFenced(f.text)).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z+.-]*:/.test(target) || target.startsWith("#")) continue;
      const [rel, anchor] = target.split("#");
      if (rel === "") continue;
      const resolved = join(dirname(f.path), rel);
      const text = readFile(resolved);
      if (text == null) { errs.push(`${f.path}: broken link → ${target}`); continue; }
      if (anchor && !resolveAnchor(stripFenced(text), anchor))
        errs.push(`${f.path}: anchor not found → ${target}`);
    }
  return errs;
}

const STATUSES = ["planned", "surveying", "report drafted", "accepted", "deferred"];

export type IndexRow = { track: string; status: string; line: number };

// README index rows look like: `| 0010-contract-pipeline | <scope> | <status> |`.
// The status is the last cell so extra middle columns stay non-breaking.
export function parseIndexRows(readme: string): IndexRow[] {
  const out: IndexRow[] = [];
  stripFenced(readme).split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\|\s*(\d{4}-[a-z0-9-]+)\s*\|/);
    if (!m) return;
    const cells = line.split("|").map((c) => c.trim());
    out.push({ track: m[1], status: cells[cells.length - 2] ?? "", line: i + 1 });
  });
  return out;
}

// planned/deferred rows may lack a directory (work not started); any other
// status without a directory — or a directory without a row — is an error.
export function checkIndex(rows: IndexRow[], trackDirs: string[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.track)) errs.push(`README.md:${r.line}: duplicate index row for ${r.track}`);
    seen.add(r.track);
    if (!STATUSES.includes(r.status))
      errs.push(`README.md:${r.line}: invalid status "${r.status}" (allowed: ${STATUSES.join(", ")})`);
    else if (!trackDirs.includes(r.track) && !["planned", "deferred"].includes(r.status))
      errs.push(`README.md:${r.line}: ${r.track} is "${r.status}" but tracks/${r.track}/ does not exist`);
  }
  for (const d of trackDirs)
    if (!seen.has(d)) errs.push(`tracks/${d}/ has no row in the README index`);
  return errs;
}

export function checkTrackDirs(dirs: string[]): string[] {
  return dirs
    .filter((d) => !/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d))
    .map((d) => `tracks/${d}: must match NNNN-kebab-slug (four-digit zero-padded prefix)`);
}

// Only a track's own top-level report is policed for the STE summary —
// not spike reports or drafts (close-out item 1, 2026-08-13).
export function isTrackReport(path: string): boolean {
  return /^tracks\/[^/]+\/report\.md$/.test(path);
}

// Installed/generated trees are never doc-system content (spike harness spec).
const IGNORED_SEGMENTS = new Set(["node_modules", "dist", "coverage"]);
export function isIgnoredPath(rel: string): boolean {
  return rel.split(/[\\/]/).some((seg) => IGNORED_SEGMENTS.has(seg));
}

// Spike harness spec: every spike dir carries findings.md with a valid Status.
export type Spike = { track: string; name: string; findings: string | null };

const SPIKE_STATUSES = ["planned", "in progress", "complete"];

export function checkSpikes(spikes: Spike[]): string[] {
  const errs: string[] = [];
  for (const s of spikes) {
    const dir = `tracks/${s.track}/spikes/${s.name}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.name))
      errs.push(`${dir}: spike dir must be a kebab slug`);
    if (s.findings == null) { errs.push(`${dir}: missing findings.md`); continue; }
    const m = stripFenced(s.findings).match(/^\*\*Status\*\*:\s*(.+?)\s*$/m);
    if (!m || !SPIKE_STATUSES.includes(m[1]))
      errs.push(`${dir}/findings.md: missing or invalid **Status**: (${SPIKE_STATUSES.join(" | ")})`);
  }
  return errs;
}

// Every report opens with the STE summary (D-0007): first H2 is "Summary (STE)".
export function checkReports(files: { path: string; text: string }[]): string[] {
  const errs: string[] = [];
  for (const f of files) {
    const m = stripFenced(f.text).match(/^##\s+(.+)$/m);
    if (!m || m[1].trim() !== "Summary (STE)")
      errs.push(`${f.path}: first H2 must be "## Summary (STE)"${m ? ` (found "${m[1].trim()}")` : ""}`);
  }
  return errs;
}

// The README entry point must carry the frontier pointer (spec: "Entry point and frontier").
export function checkFrontier(readme: string): string[] {
  return /^>\s*\*\*Frontier:\*\*\s+\S/m.test(stripFenced(readme))
    ? []
    : ['README.md: missing "> **Frontier:** <next action>" line'];
}

// Slim intake convention (D-0009): resolved files stay in place, so both
// statuses are valid; only a missing/invalid Status line is an error.
export function checkIntake(files: { name: string; content: string }[]): string[] {
  const errs: string[] = [];
  for (const f of files) {
    if (f.name === "_TEMPLATE.md") continue;
    if (!/^\*\*Status\*\*:\s*(open|resolved)\s*$/m.test(stripFenced(f.content)))
      errs.push(`intake/${f.name}: missing or invalid **Status**: (open|resolved)`);
  }
  return errs;
}

function read(rel: string): string | null {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try {
    if (statSync(p).isDirectory()) return "";
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listMarkdown(dirRel: string): { path: string; text: string }[] {
  const abs = join(ROOT, dirRel);
  if (!existsSync(abs)) return [];
  const out: { path: string; text: string }[] = [];
  for (const rel of readdirSync(abs, { recursive: true }) as string[]) {
    if (isIgnoredPath(rel)) continue;
    if (!rel.endsWith(".md")) continue;
    const p = join(dirRel, rel);
    if (statSync(join(ROOT, p)).isDirectory()) continue;
    out.push({ path: p, text: readFileSync(join(ROOT, p), "utf8") });
  }
  return out;
}

function main(): void {
  const decs = parseEntries(read("DECISIONS.md") ?? "", 3).filter((e) => /^D-\d+/.test(e.title));

  const tracksAbs = join(ROOT, "tracks");
  const trackDirs = existsSync(tracksAbs)
    ? readdirSync(tracksAbs).filter((n) => statSync(join(tracksAbs, n)).isDirectory())
    : [];

  const readme = read("README.md") ?? "";
  // The link-checked set (D-0037, 9900 item 1). Two exclusions are DELIBERATE
  // and must not be "fixed" by a future contributor:
  //   templates/ — excluded on purpose. A template's relative links are written
  //     from the location the template is SCAFFOLDED INTO, not from where the
  //     template file sits, so they are correct in use and unresolvable in
  //     place. Measured 2026-08-17: including templates/ adds exactly 3 errors,
  //     all in templates/spike/ — `../../research-plan.md` and `../../report.md`
  //     in findings.md, which resolve once the spike lands under
  //     tracks/<track>/spikes/<name>/, plus one spec path in its README. The
  //     right repair is this exclusion, not rewriting the templates to satisfy
  //     a checker at the cost of being wrong for their actual readers.
  //   .claude/skills/codebase-design/ — vendored byte-verbatim under D-0017.
  //     Never checked, because a finding there could only be fixed by editing
  //     a vendored file, which the repo forbids.
  const linkedDocs = [
    { path: "README.md", text: readme },
    { path: "DECISIONS.md", text: read("DECISIONS.md") ?? "" },
    { path: "CLAUDE.md", text: read("CLAUDE.md") ?? "" },
    ...listMarkdown("facts"),
    ...listMarkdown("tracks"),
    ...listMarkdown("intake"),
    ...listMarkdown("docs"),
  ];
  const reports = listMarkdown("tracks").filter((f) => isTrackReport(f.path));

  const spikes: Spike[] = [];
  for (const t of trackDirs) {
    const spikesAbs = join(tracksAbs, t, "spikes");
    if (!existsSync(spikesAbs)) continue;
    for (const n of readdirSync(spikesAbs)) {
      if (!statSync(join(spikesAbs, n)).isDirectory()) continue;
      spikes.push({ track: t, name: n, findings: read(`tracks/${t}/spikes/${n}/findings.md`) });
    }
  }

  const intakeAbs = join(ROOT, "intake");
  const intakeFiles = existsSync(intakeAbs)
    ? readdirSync(intakeAbs)
        .filter((n) => n.endsWith(".md"))
        .map((n) => ({ name: n, content: readFileSync(join(intakeAbs, n), "utf8") }))
    : [];

  const errors = [
    ...checkIds(decs, "D", 4, (e) => e.title.match(/^(D-\d+)/)?.[1] ?? ""),
    ...checkLinks(linkedDocs, read),
    ...checkTrackDirs(trackDirs),
    ...checkIndex(parseIndexRows(readme), trackDirs),
    ...checkFrontier(readme),
    ...checkReports(reports),
    ...checkIntake(intakeFiles),
    ...checkSpikes(spikes),
  ];

  if (errors.length) {
    console.error(`check-docs: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  const intakeCount = intakeFiles.filter((f) => f.name !== "_TEMPLATE.md").length;
  console.log(
    `check-docs: ok — ${decs.length} decision(s), ${trackDirs.length} track dir(s), ` +
    `${reports.length} report(s), ${intakeCount} intake file(s), ${spikes.length} spike(s).`,
  );
}

if (import.meta.main) main();
