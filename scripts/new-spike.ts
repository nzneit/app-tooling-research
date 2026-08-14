#!/usr/bin/env node
// new-spike.ts — scaffold an isolated spike package from templates/spike/.
// Spec: docs/superpowers/specs/2026-08-14-spike-harness-design.md.
// Zero dependencies: node:fs. Requires Node >= 24.2. Run:
//   node scripts/new-spike.ts <track-dir> <spike-slug>
// e.g. node scripts/new-spike.ts 0060-transport-abstraction boundary-wiring

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function substitute(text: string, map: Record<string, string>): string {
  return Object.entries(map).reduce((t, [k, v]) => t.replaceAll(k, v), text);
}

export function scaffold(root: string, trackDir: string, slug: string, date: string): string {
  const template = join(root, "templates", "spike");
  const trackAbs = join(root, "tracks", trackDir);
  const dest = join(trackAbs, "spikes", slug);
  if (!existsSync(template)) throw new Error("missing template: templates/spike");
  if (!existsSync(trackAbs)) throw new Error(`no such track: tracks/${trackDir}`);
  if (!validateSlug(slug)) throw new Error(`spike slug must be kebab-case: "${slug}"`);
  if (existsSync(dest)) throw new Error(`already exists: tracks/${trackDir}/spikes/${slug}`);
  cpSync(template, dest, { recursive: true });
  const map: Record<string, string> = {
    __SPIKE_PACKAGE_NAME__: `spike-${trackDir.slice(0, 4)}-${slug}`,
    __SPIKE_SLUG__: slug,
    __TRACK_DIR__: trackDir,
    __DATE__: date,
  };
  for (const rel of readdirSync(dest, { recursive: true }) as string[]) {
    const p = join(dest, rel);
    if (statSync(p).isDirectory()) continue;
    writeFileSync(p, substitute(readFileSync(p, "utf8"), map));
  }
  return dest;
}

if (import.meta.main) {
  const [trackDir, slug] = process.argv.slice(2);
  if (!trackDir || !slug) {
    console.error("usage: node scripts/new-spike.ts <track-dir> <spike-slug>");
    process.exit(2);
  }
  try {
    const dest = scaffold(ROOT, trackDir, slug, new Date().toISOString().slice(0, 10));
    console.log(`new-spike: created ${dest}`);
    console.log("next: cd there; npm i -D --save-exact <deps>; npm test");
  } catch (e) {
    console.error(`new-spike: ${(e as Error).message}`);
    process.exit(1);
  }
}
