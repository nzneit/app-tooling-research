// check-4 — plan question 17: making `durable` + `qos: 0` UNREPRESENTABLE rather
// than merely discouraged, and plan question 15: the await-in-transaction
// footgun made structurally unwritable rather than lint-policed.
//
// LANE: the type system. `npx tsc --noEmit` IS the assertion — every expect-error
// directive below fails the build if it stops being an error, and tsc reports an
// unused directive (TS2578) if one stops firing.
//
// ONE DIAGNOSTIC-QUALITY FINDING, measured rather than predicted, and a real
// cost of choosing union arms over a conditional constraint on the factory.
// The error an illegal row produces is:
//
//   TS2322: Type '{ validate: ...; qos: 0; durable: DurableProjection<Reading> }'
//   is not assignable to type 'ChannelPolicy<Reading>'.
//     Types of property 'durable' are incompatible.
//       Type 'DurableProjection<Reading>' is not assignable to type 'undefined'.
//
// It is correct and it is nearly unreadable. It names `undefined` — from the
// `durable?: never` arm the row fell through to — rather than the rule the
// engineer broke, which is "a durable row must declare qos: 1". It also reports
// at the DECLARATION, not at the offending property, so the reader is pointed at
// the variable rather than the mistake. Under ~50 engineers on very loose
// TypeScript with high agentic churn, that is a genuine cost. It is the price of
// not moving the accepted factory signature to police a policy-row addition,
// which would be self-defeating. Recorded in findings.md, Deviations.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { inboxKey, MAX_ID_LENGTH, type ChannelPolicy, type DurableChannelPolicy } from "../src/index.js";
import { appendReading, isReading, type Reading } from "./fixtures.js";

function _illegalRowsDoNotCompile(): void {
  // LEGAL: the one shape a durable row may take.
  const ok: DurableChannelPolicy<Reading> = {
    validate: isReading,
    direction: "in",
    qos: 1,
    durable: appendReading,
  };
  void ok;

  // A durable row at qos 0 has neither a redelivery to deduplicate nor an
  // acknowledgement to defer, and the broker does not queue it across a
  // disconnection. It fails BOTH union arms.
  // @ts-expect-error durable rows must declare qos: 1
  const qosZero: ChannelPolicy<Reading> = {
    validate: isReading,
    qos: 0,
    durable: appendReading,
  };
  void qosZero;

  // An outbound row has no inbound delivery to make effectively-once at all.
  // @ts-expect-error durable rows are inbound only
  const outbound: ChannelPolicy<Reading> = {
    validate: isReading,
    direction: "out",
    qos: 1,
    durable: appendReading,
  };
  void outbound;

  // A row with no qos at all defaults to 0 and is likewise not durable.
  // @ts-expect-error a durable row must declare qos: 1 explicitly
  const noQos: ChannelPolicy<Reading> = {
    validate: isReading,
    durable: appendReading,
  };
  void noQos;

  // THE FOOTGUN, made unwritable. An async projection returns
  // Promise<DurableEntry>, which is not a DurableEntry — so there is no
  // caller-authored code inside the transaction to put an `await` in. This is
  // the whole reason the design does not need a lint rule to police it.
  const asyncProjection: DurableChannelPolicy<Reading> = {
    validate: isReading,
    direction: "in",
    qos: 1,
    // @ts-expect-error a durable projection is pure and synchronous by return type
    durable: async (p) => ({ id: p.id, writes: [] }),
  };
  void asyncProjection;
}
void _illegalRowsDoNotCompile;

describe("check-4: illegal rows are unrepresentable, not merely discouraged", () => {
  it("GO: tsc --noEmit passes with every @ts-expect-error live", () => {
    // If any directive above stopped being an error, tsc reports TS2578
    // ("Unused '@ts-expect-error' directive") and this exits non-zero. The
    // compile IS the assertion.
    const out = execFileSync("npx", ["tsc", "--noEmit"], { encoding: "utf8", stdio: "pipe" });
    expect(out).not.toMatch(/TS2578/);
  }, 180_000);

  it("GO: the key is composed of channel + concrete topic + producer id, length-prefixed", () => {
    const a = inboxKey("plant/+/telemetry", "plant/p1/telemetry", "m1");
    expect(a).toEqual({ ok: true, key: "17:plant/+/telemetry18:plant/p1/telemetrym1" });

    // Length prefixes exist so no component can forge a boundary in the next.
    // Without them, ("ab","c") and ("a","bc") would collide.
    const x = inboxKey("ab", "c", "id");
    const y = inboxKey("a", "bc", "id");
    expect(x.ok && y.ok && x.key === y.key).toBe(false);
  });

  it("GO: a missing, empty, or over-long id is refused with a named rejection", () => {
    expect(inboxKey("c", "t", undefined)).toMatchObject({ ok: false, rejection: "not-a-string" });
    expect(inboxKey("c", "t", 42)).toMatchObject({ ok: false, rejection: "not-a-string" });
    expect(inboxKey("c", "t", "")).toMatchObject({ ok: false, rejection: "empty" });
    expect(inboxKey("c", "t", "x".repeat(MAX_ID_LENGTH + 1))).toMatchObject({
      ok: false,
      rejection: "too-long",
    });
    expect(inboxKey("c", "t", "x".repeat(MAX_ID_LENGTH))).toMatchObject({ ok: true });
  });

  it("GO: inboxKey returns a result and never throws into the inbound pump", () => {
    // Nothing below the boundary may throw into the packet pump. Every rejection
    // path returns a value the caller quarantines and acknowledges.
    for (const bad of [undefined, null, 0, {}, [], Symbol("s"), () => 0]) {
      expect(() => inboxKey("c", "t", bad)).not.toThrow();
    }
  });
});
