// check-10 — THE CENTRAL CLAIM, in a real browser, under a real process kill.
//
//   "A crash between applied and recorded cannot double-apply."
//
// This is the only lane that can falsify it. fake-indexeddb is an in-memory
// reimplementation of exactly the commit timing under test, so the Node lane
// confirms the design's shape and never its guarantee (plan question 16).
//
// Method, per trial: launchPersistentContext(dir) -> start writing ->
// pgrep the PID owning that user-data-dir -> SIGKILL -> relaunch the SAME dir ->
// assert. SIGKILL rather than CDP `Browser.crash`, because that call's promise
// never settles (the browser dies before answering) and awaiting it hangs the
// suite.
//
// The negative control is the point. It runs the same trial against a
// deliberately two-transaction implementation with a widened window, and it MUST
// reproduce the split. A control that does not split is a broken test, never a
// pass.

import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, type BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB = "crash-lane";
let bundle = "";
let origin = "";
let server: Server | null = null;
const profiles: string[] = [];

beforeAll(async () => {
  // Bundle the REAL adapter into the page, so this lane exercises src/ rather
  // than a transcription of it.
  const out = await build({
    entryPoints: [new URL("./browser-entry.ts", import.meta.url).pathname],
    bundle: true,
    format: "iife",
    write: false,
    platform: "browser",
    target: "chrome120",
  });
  bundle = out.outputFiles[0]?.text ?? "";
  expect(bundle.length).toBeGreaterThan(0);

  // IndexedDB is keyed by ORIGIN, and `about:blank` / `file://` are opaque — a
  // store written under one is not readable after restart. The origin must also
  // be identical across restarts, so the port is allocated once and this server
  // outlives every browser kill (it runs in the test process, which is not the
  // thing being killed).
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>inbox</title><script>${bundle}</script>`);
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", () => resolve());
  });
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/`;
}, 120_000);

afterAll(async () => {
  for (const dir of profiles) rmSync(dir, { recursive: true, force: true });
  if (server !== null) await new Promise<void>((r) => server?.close(() => r()));
});

function newProfile(): string {
  const dir = mkdtempSync(join(tmpdir(), "inbox-crash-"));
  profiles.push(dir);
  return dir;
}

async function launch(dir: string): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(dir, { headless: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(origin, { waitUntil: "load" });
  return ctx;
}

/** Real process death: SIGKILL every process whose command line owns this profile. */
function killBrowser(dir: string): number {
  let pids: string[] = [];
  try {
    pids = execFileSync("pgrep", ["-f", `user-data-dir=${dir}`], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return 0; // pgrep exits 1 when nothing matches
  }
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  return pids.length;
}

async function crashDuring(
  dir: string,
  start: (ctx: BrowserContext) => Promise<unknown>,
  afterMs: number,
): Promise<void> {
  const ctx = await launch(dir);
  const page = ctx.pages()[0];
  if (page === undefined) throw new Error("no page");
  void start(ctx).catch(() => undefined); // the crash rejects this; expected
  await new Promise((r) => setTimeout(r, afterMs));
  const killed = killBrowser(dir);
  expect(killed).toBeGreaterThan(0); // a trial that killed nothing proves nothing
  await new Promise((r) => setTimeout(r, 300));
}

async function readAfterRestart(dir: string): Promise<{ effects: number; identities: number }> {
  const ctx = await launch(dir);
  const page = ctx.pages()[0];
  if (page === undefined) throw new Error("no page");
  const state = await page.evaluate(async (db) => window.__inbox.read(db), DB);
  await ctx.close();
  return state;
}

const DELAYS = [150, 300, 500, 800];

describe("check-10: the central claim, under real process death", () => {
  it(
    "GO: the one-transaction design NEVER leaves an effect without its identity",
    async () => {
      const results: { delay: number; effects: number; identities: number }[] = [];
      for (const delay of DELAYS) {
        const dir = newProfile();
        await crashDuring(
          dir,
          async (ctx) => {
            const page = ctx.pages()[0];
            await page?.evaluate(
              async ([db, n]) => window.__inbox.atomic(db as string, n as number, "default"),
              [DB, 3000] as const,
            );
          },
          delay,
        );
        const state = await readAfterRestart(dir);
        results.push({ delay, ...state });

        // The invariant. An effect count above the identity count means a
        // message was applied and not recorded — on redelivery it applies again.
        expect(
          state.effects,
          `delay=${String(delay)}ms left ${String(state.effects)} effects against ${String(state.identities)} identities`,
        ).toBeLessThanOrEqual(state.identities);
      }
      console.log("check-10 atomic:", JSON.stringify(results));
    },
    240_000,
  );

  it(
    "GO: the negative control DOES split — the test can detect the bug it rules out",
    async () => {
      const dir = newProfile();
      await crashDuring(
        dir,
        async (ctx) => {
          const page = ctx.pages()[0];
          await page?.evaluate(
            async ([db, n, gap]) => window.__inbox.split(db as string, n as number, gap as number),
            [DB, 50, 400] as const,
          );
        },
        600,
      );
      const state = await readAfterRestart(dir);
      console.log("check-10 control:", JSON.stringify(state));

      // A control that does not split is a broken test, not a pass. The window
      // is widened to 400 ms deliberately: at random 0-40 ms offsets the
      // verified precedent is zero splits across every trial of BOTH variants.
      expect(
        state.effects,
        "negative control did not reproduce the split — this test cannot detect the failure it claims to rule out",
      ).toBeGreaterThan(state.identities);
    },
    240_000,
  );
});
