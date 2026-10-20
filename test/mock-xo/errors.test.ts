import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fixture } from "../fixtures/xo/load.js";
import { compareToFixtures } from "./drift.js";
import { badTokenIdText, dataApiErrors, orderbookErrors, rpcError, rpcResult } from "./errors.js";

describe("error bodies equal the recordings where one exists", () => {
  it("orderbook: the bodies recorded live are reproduced exactly", () => {
    assert.deepEqual(orderbookErrors.badTokenId("abc").json, fixture("orderbook-error-400-bad-token.json"));
    assert.deepEqual(orderbookErrors.noBook().json, fixture("orderbook-error-404-book-unknown-token.json"));
    assert.deepEqual(orderbookErrors.l2Required().json, fixture("orderbook-error-401-orders.json"));
    assert.deepEqual(orderbookErrors.unknownMarket(`0x${"00".repeat(32)}`).json, fixture("orderbook-error-404-market-unknown.json"));
    assert.deepEqual([orderbookErrors.badTokenId("abc").status, orderbookErrors.noBook().status, orderbookErrors.l2Required().status, orderbookErrors.unknownMarket("x").status], [400, 404, 401, 404]);
  });

  it("Data API: the NestJS bodies have the recorded shape, and the 400 is exact", () => {
    const stamp = "2026-10-19T00:00:00.000Z";
    assert.deepEqual(dataApiErrors.takeOverMax().json, fixture("data-error-400-take-over-max.json"));
    assert.deepEqual(compareToFixtures(dataApiErrors.marketNotFound("/api/markets/1", stamp).json, ["data-error-404-market.json"], { strictKinds: true }), []);
    assert.deepEqual(compareToFixtures(dataApiErrors.userNotFound("/api/users/portfolio?user=0x1", stamp).json, ["data-error-404-user-portfolio.json"], { strictKinds: true }), []);
    assert.deepEqual([dataApiErrors.takeOverMax().status, dataApiErrors.marketNotFound("/", stamp).status, dataApiErrors.userNotFound("/", stamp).status, dataApiErrors.rateLimited(stamp, 1).status], [400, 404, 404, 429]);
  });
});

describe("error bodies from the docs", () => {
  it("422 business rules carry the documented text", () => {
    assert.deepEqual(orderbookErrors.marketNotActive("Pending"), { status: 422, json: { error: "market is not active (status: Pending)" } });
    assert.equal(orderbookErrors.insufficientBalance().status, 422);
    assert.deepEqual(orderbookErrors.insufficientBalance().json, { error: "insufficient balance" });
    assert.deepEqual(orderbookErrors.insufficientPosition().json, { error: "insufficient position" });
    assert.deepEqual(orderbookErrors.sizeBelowMinimum("5000000", "1000").json, { error: "size below minimum: min 5000000, got 1000" });
    assert.deepEqual(orderbookErrors.notionalBelowMinimum("10000", "500").json, { error: "notional below minimum: min 10000, got 500" });
  });

  it("400 invalid tick and duplicate order, 429 with retry_after_ms, 503 trading_paused with Retry-After 60", () => {
    assert.deepEqual(orderbookErrors.invalidTick(), { status: 400, json: { error: "invalid price tick" } });
    assert.equal(orderbookErrors.duplicateOrder().status, 400);
    assert.match((orderbookErrors.duplicateOrder().json as { error: string }).error, /^duplicate order/);
    const limited = orderbookErrors.rateLimited(387);
    assert.deepEqual(limited.json, { error: "rate limit exceeded", retry_after_ms: 387 });
    assert.equal(limited.headers?.["retry-after"], "1");
    assert.equal(orderbookErrors.rateLimited(61_000).headers?.["retry-after"], "61");
    assert.equal(orderbookErrors.tradingPaused().status, 503);
    assert.equal(orderbookErrors.tradingPaused().headers?.["retry-after"], "60");
  });

  it("the not-built body names the TODO and the thing", () => {
    const reply = orderbookErrors.notBuilt("POST /order");
    assert.equal(reply.status, 501);
    assert.match((reply.json as { error: string }).error, /POST \/order is not built yet \(TODO-for-mock-write\)/);
  });
});

describe("the token id parser's complaints", () => {
  it("reads a letter as a base-36 digit, as the recording does for 'abc'", () => {
    assert.equal(badTokenIdText("abc"), "invalid token_id: digit 10 is out of range for base 10");
    assert.equal(badTokenIdText("12z"), "invalid token_id: digit 35 is out of range for base 10");
    assert.equal(badTokenIdText(""), "invalid token_id: cannot parse integer from empty string");
    assert.equal(badTokenIdText("1 2"), "invalid token_id: invalid digit found in string");
    assert.equal(badTokenIdText("-5"), "invalid token_id: invalid digit found in string");
  });
});

describe("JSON-RPC envelopes", () => {
  it("builds a result and an error, keeping the id", () => {
    assert.deepEqual(rpcResult(7, "0x1"), { jsonrpc: "2.0", id: 7, result: "0x1" });
    assert.deepEqual(rpcError("a", -32601, "Method not found"), { jsonrpc: "2.0", id: "a", error: { code: -32601, message: "Method not found" } });
    assert.deepEqual(rpcError(null, 3, "execution reverted", "0xdead"), { jsonrpc: "2.0", id: null, error: { code: 3, message: "execution reverted", data: "0xdead" } });
  });
});
