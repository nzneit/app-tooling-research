// CHECK (report list): "Non-JSON ingress behavior — define and test the ingress
// behavior for every content type on both legs (the ts-rest #789 lesson) — no
// silent validation skip."
//
// The MQTT half is check-6. This is the REST half, and the thing that makes it
// worth its own file is the NON-2xx column: ts-rest #789 is precisely a
// non-success response with an unexpected content type slipping past validation.
// Every cell below is an explicit taxonomy outcome; none is a skip.
//
//                       | 2xx                        | non-2xx
//   text/html           | class 4 unknown-content-type (both)
//   no content-type     | class 4 unknown-content-type (both)
//   json, unparseable   | class 4 undecodable          (both)
//   json, empty body    | class 4 undecodable          (both)
//   application/problem+json, declared | validated normally (both)

import { afterEach, describe, expect, it } from "vitest";
import { isUnroutable } from "../src/errors/index.js";
import type { TransportBoundary } from "../src/index.js";
import { createTransportBoundary } from "../src/index.js";
import { memoryBrokerAdapter, scriptedFetchAdapter, type ScriptedRoute } from "../src/testing.js";
import { policy, rest } from "./fixtures.js";

type Boundary = TransportBoundary<typeof policy>;
let live: Boundary | null = null;

function harness(route: ScriptedRoute): Boundary {
  const b = createTransportBoundary(
    { mqtt: { url: "ws://memory" }, policy, rest },
    { broker: memoryBrokerAdapter(), fetch: scriptedFetchAdapter([route]) },
  );
  live = b;
  return b;
}

const call = (b: Boundary, url = "/v1/plants"): Promise<unknown> =>
  b.fetcher({ url, method: "GET" }).catch((e: unknown) => e);

afterEach(async () => {
  await live?.dispose();
  live = null;
});

describe("non-JSON ingress on the REST leg (I11, ts-rest #789)", () => {
  for (const status of [200, 409] as const) {
    it(`class 4 unknown-content-type: text/html on ${status}`, async () => {
      const b = harness({
        method: "GET",
        url: "/v1/plants",
        status,
        body: "<html><body>gateway</body></html>",
        contentType: "text/html",
      });
      const err = await call(b);
      expect(isUnroutable(err)).toBe(true);
      expect(err).toMatchObject({
        class: 4,
        cause: "unknown-content-type",
        leg: "rest",
        endpointOrTopic: "GET /v1/plants",
        raw: { status, contentType: "text/html" },
      });
      // Quarantined with the body kept, so the HTML error page is inspectable.
      const entries = b.quarantine.entries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.raw).toContain("gateway");
    });

    it(`class 4 unknown-content-type: NO content-type header on ${status}`, async () => {
      const b = harness({
        method: "GET",
        url: "/v1/plants",
        status,
        body: "",
        contentType: "",
      });
      const err = await call(b);
      expect(err).toMatchObject({ class: 4, cause: "unknown-content-type" });
    });

    it(`class 4 undecodable: JSON content type, unparseable body on ${status}`, async () => {
      const b = harness({
        method: "GET",
        url: "/v1/plants",
        status,
        body: "{oops",
        contentType: "application/json",
      });
      const err = await call(b);
      expect(err).toMatchObject({
        class: 4,
        cause: "undecodable",
        leg: "rest",
        endpointOrTopic: "GET /v1/plants",
      });
      expect(b.quarantine.entries()).toHaveLength(1);
    });

    it(`class 4 undecodable: JSON content type, EMPTY body on ${status}`, async () => {
      const b = harness({
        method: "GET",
        url: "/v1/plants",
        status,
        body: "",
        contentType: "application/json",
      });
      const err = await call(b);
      expect(err).toMatchObject({ class: 4, cause: "undecodable" });
    });
  }

  it("accepts the JSON family: application/problem+json on a declared 409 validates normally", async () => {
    const b = harness({
      method: "GET",
      url: "/v1/plants",
      status: 409,
      body: { code: "E_CONFLICT" },
      contentType: "application/problem+json",
    });
    const err = await call(b);
    // Not class 4: the body decoded, the 409 schema accepted it, so it is the
    // contracted reason code it claims to be.
    expect(err).toMatchObject({ class: 3, status: 409, body: { code: "E_CONFLICT" } });
    expect(b.quarantine.entries()).toHaveLength(0);
  });

  it("never silently skips: a non-JSON 2xx is a rejection, not a resolution", async () => {
    const b = harness({
      method: "GET",
      url: "/v1/plants",
      status: 200,
      body: "plants: p1, p2",
      contentType: "text/plain",
    });
    // The ts-rest #789 shape of the bug is a RESOLVED value that skipped
    // validation. Here the only way out is a throw.
    await expect(b.fetcher({ url: "/v1/plants", method: "GET" })).rejects.toMatchObject({
      class: 4,
    });
  });
});
