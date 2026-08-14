import { describe, expect, it } from "vitest";

describe("harness smoke", () => {
  it("runs TypeScript under vitest", () => {
    const n: number = 2 + 2;
    expect(n).toBe(4);
  });
});
