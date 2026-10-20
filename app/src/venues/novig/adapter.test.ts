import { describe, expect, it } from "vitest";

import { DISCLOSURE_VERSION, type VenueSwitches } from "../../core/venue-policy";
import { createNovigAdapter } from "./adapter";
import { NOVIG_API_BASE } from "./constants";
import { depsOf } from "./fixtures/fake-fetch";
import { isAdapterFailure } from "./shared";

// Novig has restricted terms: no response body of the venue is committed to this repository. These tests hold only
// what needs no payload: the gate, request hygiene, the closed error set and the caps. Everything that reads a
// venue answer is covered by the opt-in live drift test (live.test.ts).

const ON: VenueSwitches = { enabled: { novig: true }, disclosureAccepted: { novig: DISCLOSURE_VERSION } };
// Test inputs for requests that must never be sent or that only provoke an error status; not venue data.
const MARKET = "market-under-test";
const TOKEN = "outcome-under-test";

function rejectedWith(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

describe("the gate (flag OFF, restricted terms)", () => {
  it("refuses every read before any request when nothing is switched on", async () => {
    const { deps, calls } = depsOf({});
    const adapter = createNovigAdapter(deps);
    for (const call of [
      () => adapter.listMarkets({}),
      () => adapter.getMarket({ venue: "novig", marketId: MARKET, native: {} }),
      () => adapter.getMarketDetail({ venue: "novig", marketId: MARKET, native: {} }),
      () => adapter.health(),
    ]) {
      const error = await rejectedWith(call());
      expect(isAdapterFailure(error)).toBe(true);
      expect(error).toMatchObject({ code: "NOT_SUPPORTED", detail: "off_restricted_off" });
    }
    const books = await adapter.getBooks([{ venue: "novig", tokenId: TOKEN, marketId: MARKET }], { deadlineMs: 5000 });
    expect(books).toEqual([{ ok: false, error: "NOT_SUPPORTED" }]);
    expect(calls).toHaveLength(0);
  });

  it("stays off when the switch is on but the disclosure was not accepted, or was accepted for an older version", async () => {
    for (const switches of [
      { enabled: { novig: true }, disclosureAccepted: {} },
      { enabled: { novig: true }, disclosureAccepted: { novig: "0" } },
      { enabled: { novig: false }, disclosureAccepted: { novig: DISCLOSURE_VERSION } },
    ] satisfies VenueSwitches[]) {
      const { deps, calls } = depsOf({});
      const error = await rejectedWith(createNovigAdapter(deps, { switches }).listMarkets({}));
      expect(error).toMatchObject({ code: "NOT_SUPPORTED" });
      expect(calls).toHaveLength(0);
    }
  });
});

describe("requests it refuses to build", () => {
  it("refuses a text search instead of filtering one page and looking complete", async () => {
    const { deps, calls } = depsOf({});
    const error = await rejectedWith(createNovigAdapter(deps, { switches: ON }).listMarkets({ text: "any text" }));
    expect(error).toMatchObject({ code: "NOT_SUPPORTED", detail: "search_not_supported" });
    expect(calls).toHaveLength(0);
  });

  it("says so when no requested status can be expressed, instead of returning an empty page", async () => {
    const { deps, calls } = depsOf({});
    const error = await rejectedWith(createNovigAdapter(deps, { switches: ON }).listMarkets({ statuses: ["pending", "disputed", "unknown"] }));
    expect(error).toMatchObject({ code: "NOT_SUPPORTED", detail: "status_not_supported" });
    expect(calls).toHaveLength(0);
  });

  it("rejects a cursor that is not one it handed out", async () => {
    const { deps, calls } = depsOf({});
    const adapter = createNovigAdapter(deps, { switches: ON });
    for (const cursor of ["x", "9:abc", "0:ab c", "0:../etc", "-1:a", "0:" + "a".repeat(201)]) {
      expect(await rejectedWith(adapter.listMarkets({ cursor }))).toMatchObject({ code: "NOT_SUPPORTED", detail: "bad_cursor" });
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses an id that could change the request, without sending one", async () => {
    const { deps, calls } = depsOf({});
    const adapter = createNovigAdapter(deps, { switches: ON });
    for (const marketId of ["../orders", "a/b", "a?x=1", "", "a b", "x".repeat(65)]) {
      expect(await rejectedWith(adapter.getMarket({ venue: "novig", marketId, native: {} }))).toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await rejectedWith(adapter.getMarket({ venue: "kalshi", marketId: MARKET, native: {} }))).toMatchObject({ code: "NOT_FOUND", detail: "wrong_venue" });
    expect(calls).toHaveLength(0);
  });

  it("answers per token: a token of another venue or with a bad id is NOT_FOUND, with no request", async () => {
    const { deps, calls } = depsOf({});
    const results = await createNovigAdapter(deps, { switches: ON }).getBooks(
      [{ venue: "xo", tokenId: TOKEN, marketId: MARKET }, { venue: "novig", tokenId: "../x", marketId: MARKET }],
      { deadlineMs: 5000 },
    );
    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual(["NOT_FOUND", "NOT_FOUND"]);
    expect(calls).toHaveLength(0);
  });
});

describe("error mapping on empty and garbage answers", () => {
  // The market read comes first; every transport outcome below is provoked on that route.
  const bookRoute = `GET ${NOVIG_API_BASE}/catalog/markets/${MARKET}`;

  it("maps transport outcomes to the closed error set per token", async () => {
    const check = async (reply: Record<string, unknown>, expected: string): Promise<void> => {
      const { deps } = depsOf({ [bookRoute]: reply });
      const results = await createNovigAdapter(deps, { switches: ON }).getBooks([{ venue: "novig", tokenId: TOKEN, marketId: MARKET }], { deadlineMs: 5000 });
      expect(results[0]).toEqual({ ok: false, error: expected });
    };
    await check({ status: 429 }, "RATE_LIMITED");
    await check({ status: 403 }, "VENUE_PAUSED");
    await check({ status: 404 }, "NOT_FOUND");
    await check({ status: 500 }, "TIMEOUT");
    await check({ reject: true }, "TIMEOUT");
    await check({ hang: true }, "TIMEOUT");
  });

  it("a 404 for a market is NOT_FOUND and an empty body is not a market", async () => {
    const missing = depsOf({ [`GET ${NOVIG_API_BASE}/catalog/markets/${MARKET}`]: { status: 404 } });
    const ref = { venue: "novig" as const, marketId: MARKET, native: {} };
    expect(await rejectedWith(createNovigAdapter(missing.deps, { switches: ON }).getMarket(ref))).toMatchObject({ code: "NOT_FOUND" });
    const empty = depsOf({ [`GET ${NOVIG_API_BASE}/catalog/markets/${MARKET}`]: { json: {} } });
    const error = await rejectedWith(createNovigAdapter(empty.deps, { switches: ON }).getMarket(ref));
    expect(isAdapterFailure(error)).toBe(true);
  });

  it("health reports not ok for an empty or garbage type list", async () => {
    const route = `GET ${NOVIG_API_BASE}/types/event-statuses`;
    for (const json of [["X"], { hello: 1 }, []] as unknown[]) {
      const { deps } = depsOf({ [route]: { json } });
      expect((await createNovigAdapter(deps, { switches: ON }).health()).ok).toBe(false);
    }
  });
});

describe("the caps", () => {
  it("claim only what is built", () => {
    const { deps } = depsOf({});
    const caps = createNovigAdapter(deps).caps;
    expect(caps).toMatchObject({ listMarkets: true, search: false, getMarket: true, getBook: true, getBooksBatch: false, getFeeSpec: true, getResolution: false, getPositionsByAddress: false, stream: false });
  });

  it("rejects a market type list with no valid word", () => {
    const { deps } = depsOf({});
    expect(() => createNovigAdapter(deps, { marketTypes: ["money", "a b"] })).toThrow(RangeError);
  });
});
