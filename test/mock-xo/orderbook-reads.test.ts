import assert from "node:assert/strict";
import { describe } from "node:test";

import { ANVIL_ACCOUNT_0_ACCOUNT, ANVIL_ACCOUNT_0_OWNER } from "../../src/xo/chain/constants.js";
import { getJson, useMock } from "./testing.js";
import { MOCK_EPOCH_SECONDS } from "./clock.js";
import { L2_HEADERS, UNBUILT_ROUTES } from "./orderbook.js";
import type { MockXo } from "./server.js";

const A = "0xCAFE000000000000000000000000000000000A11";
const A_LOWER = "cafe000000000000000000000000000000000a11";

function market(mock: MockXo, seed: string) {
  const found = mock.state.markets.find((entry) => entry.seed === seed);
  assert.ok(found !== undefined, seed);
  return found;
}

describe("orderbook reads: time, tick size and health", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /time is a bare integer of seconds from the mock clock, and follows it", async (mock) => {
    const first = await getJson(mock, "orderbook", "/time");
    assert.equal(first.status, 200);
    assert.equal(first.text, String(mock.clock.nowSeconds()));
    assert.equal(typeof first.body, "number");
    assert.equal(first.headers.get("content-type"), "application/json");
    mock.clock.advance(7);
    assert.equal((await getJson(mock, "orderbook", "/time")).body, mock.clock.nowSeconds());
    assert.ok((mock.clock.nowSeconds() as number) > MOCK_EPOCH_SECONDS);
  });

  harness.it("GET /tick-size is the global 0.001 as a JSON number, for any well-formed token", async (mock) => {
    const known = await getJson(mock, "orderbook", `/tick-size?token_id=${market(mock, "clob-active-a").yesTokenId}`);
    assert.deepEqual(known.body, { minimum_tick_size: 0.001 });
    assert.deepEqual((await getJson(mock, "orderbook", "/tick-size?token_id=5")).body, { minimum_tick_size: 0.001 });
    assert.equal((await getJson(mock, "orderbook", "/tick-size")).status, 400);
    assert.equal((await getJson(mock, "orderbook", "/tick-size?token_id=zz")).status, 400);
  });

  harness.it("GET /health, /version and /trading-state answer their recorded bodies; trading state can be paused", async (mock) => {
    assert.deepEqual((await getJson(mock, "orderbook", "/health")).body, { status: "ok" });
    assert.deepEqual(Object.keys((await getJson(mock, "orderbook", "/version")).body as object), ["build_timestamp", "git_sha", "version"]);
    assert.deepEqual((await getJson(mock, "orderbook", "/trading-state")).body, { state: "active" });
    mock.state.tradingState = "paused";
    assert.deepEqual((await getJson(mock, "orderbook", "/trading-state")).body, { state: "paused" });
    mock.state.tradingState = "active";
  });
});

describe("orderbook reads: the book", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /book returns a two-sided book with decimal sizes, sorted, stamped with the mock clock", async (mock) => {
    const m = market(mock, "clob-active-a");
    const { status, body } = await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`);
    assert.equal(status, 200);
    const book = body as Record<string, unknown> & { bids: { price: string; size: string }[]; asks: { price: string; size: string }[] };
    assert.deepEqual(Object.keys(book), ["market", "asset_id", "timestamp", "hash", "bids", "asks", "min_order_size", "tick_size", "neg_risk", "last_trade_price", "last_update_id"]);
    assert.equal(book["market"], m.conditionId);
    assert.equal(book["asset_id"], m.yesTokenId);
    assert.equal(book["timestamp"], String(mock.clock.nowMs()));
    assert.match(book["hash"] as string, /^[0-9a-f]{64}$/);
    assert.deepEqual(book.bids.map((level) => level.price), ["0.495", "0.490", "0.480"]);
    assert.deepEqual(book.asks.map((level) => level.price), ["0.505", "0.510", "0.520"]);
    assert.equal(book["min_order_size"], "0");
    assert.equal(book["tick_size"], "0.001");
    assert.equal(book["neg_risk"], false);
    assert.equal(book["last_trade_price"], "0.000");
    for (const level of [...book.bids, ...book.asks]) assert.equal(typeof level.size, "string");
  });

  harness.it("sorts what it is given, keeps fractional sizes as text, and moves the hash and the update id when the book changes", async (mock) => {
    const m = market(mock, "clob-active-b");
    const before = (await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`)).body as { hash: string; last_update_id: number };
    mock.state.setBook(m.yesTokenId, {
      bids: [
        { price: "0.041", size: "1271.980687" },
        { price: "0.100", size: "50" },
        { price: "0.010", size: "1000" },
      ],
      asks: [
        { price: "0.300", size: "10.5" },
        { price: "0.250", size: "7" },
      ],
      lastTrade: { price: "0.250", side: "BUY" },
    });
    const after = (await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`)).body as { bids: { price: string; size: string }[]; asks: { price: string }[]; hash: string; last_update_id: number; last_trade_price: string };
    assert.deepEqual(after.bids.map((level) => level.price), ["0.100", "0.041", "0.010"]);
    assert.deepEqual(after.asks.map((level) => level.price), ["0.250", "0.300"]);
    assert.equal(after.bids[1]?.size, "1271.980687");
    assert.equal(after.last_trade_price, "0.250");
    assert.notEqual(after.hash, before.hash);
    assert.ok(after.last_update_id > before.last_update_id);
    const again = (await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`)).body as { hash: string };
    assert.equal(again.hash, after.hash, "reading does not change the hash");
  });

  harness.it("shows a non-zero min_order_size when the book has one", async (mock) => {
    const m = market(mock, "clob-active-a");
    mock.state.setBook(m.noTokenId, { minOrderSize: "5" });
    assert.equal(((await getJson(mock, "orderbook", `/book?token_id=${m.noTokenId}`)).body as { min_order_size: string }).min_order_size, "5");
    mock.state.setBook(m.noTokenId, { minOrderSize: "0" });
  });

  harness.it("has a book for each token of an open or paused market, and none for a closed, resolved or voided one", async (mock) => {
    for (const seed of ["clob-active-a", "conviction-paused"]) {
      for (const token of [market(mock, seed).yesTokenId, market(mock, seed).noTokenId]) {
        assert.equal((await getJson(mock, "orderbook", `/book?token_id=${token}`)).status, 200, seed);
      }
    }
    for (const seed of ["clob-closed", "conviction-resolved", "conviction-voided", "clob-voided-closed"]) {
      const { status, body } = await getJson(mock, "orderbook", `/book?token_id=${market(mock, seed).yesTokenId}`);
      assert.equal(status, 404, seed);
      assert.deepEqual(body, { error: "No orderbook exists for the requested token id" });
    }
  });

  harness.it("closing a market removes its books", async (mock) => {
    const m = mock.state.addMarket({ seed: "closes-later", title: "Closes later" });
    assert.equal((await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`)).status, 200);
    mock.state.setStatus(m.conditionId, "CLOSED");
    assert.equal((await getJson(mock, "orderbook", `/book?token_id=${m.yesTokenId}`)).status, 404);
    assert.equal(((await getJson(mock, "orderbook", `/markets/${m.conditionId}`)).body as { active: boolean }).active, false);
  });

  harness.it("answers a malformed token id with the 400 bodies the service gave", async (mock) => {
    assert.deepEqual((await getJson(mock, "orderbook", "/book?token_id=abc")).body, { error: "invalid token_id: digit 10 is out of range for base 10" });
    assert.equal((await getJson(mock, "orderbook", "/book?token_id=abc")).status, 400);
    const missing = await getJson(mock, "orderbook", "/book");
    assert.equal(missing.status, 400);
    assert.equal(missing.text, "Failed to deserialize query string: missing field `token_id`");
    assert.match(missing.headers.get("content-type") ?? "", /^text\/plain/);
    const empty = await getJson(mock, "orderbook", "/book?token_id=");
    assert.equal(empty.status, 400);
    assert.equal((empty.body as { error: string }).error, "invalid token_id: cannot parse integer from empty string");
    const huge = await getJson(mock, "orderbook", `/book?token_id=${"9".repeat(80)}`);
    assert.equal(huge.status, 400);
    assert.match((huge.body as { error: string }).error, /too large/);
    assert.equal((await getJson(mock, "orderbook", "/book?token_id=-1")).status, 400);
    assert.equal((await getJson(mock, "orderbook", "/book?token_id=1.5")).status, 400);
  });

  harness.it("answers an unknown but well-formed token with 404", async (mock) => {
    const { status, body } = await getJson(mock, "orderbook", "/book?token_id=123456789");
    assert.equal(status, 404);
    assert.deepEqual(body, { error: "No orderbook exists for the requested token id" });
  });
});

describe("orderbook reads: prices and last trade", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /price?side=BUY is the best bid and SELL the best ask; an empty side is 0.000", async (mock) => {
    const m = market(mock, "clob-active-a");
    assert.deepEqual((await getJson(mock, "orderbook", `/price?token_id=${m.yesTokenId}&side=BUY`)).body, { price: "0.495" });
    assert.deepEqual((await getJson(mock, "orderbook", `/price?token_id=${m.yesTokenId}&side=SELL`)).body, { price: "0.505" });
    const empty = mock.state.addMarket({ seed: "no-liquidity", title: "No liquidity" });
    mock.state.setBook(empty.yesTokenId, { bids: [], asks: [] });
    assert.deepEqual((await getJson(mock, "orderbook", `/price?token_id=${empty.yesTokenId}&side=BUY`)).body, { price: "0.000" });
    assert.deepEqual((await getJson(mock, "orderbook", `/price?token_id=${empty.yesTokenId}&side=SELL`)).body, { price: "0.000" });
  });

  harness.it("rejects a missing or unknown side and a token with no book", async (mock) => {
    const token = market(mock, "clob-active-a").yesTokenId;
    assert.equal((await getJson(mock, "orderbook", `/price?token_id=${token}`)).status, 400);
    assert.equal((await getJson(mock, "orderbook", `/price?token_id=${token}&side=buy`)).status, 400);
    assert.equal((await getJson(mock, "orderbook", "/price?token_id=77&side=BUY")).status, 404);
  });

  harness.it("GET /last-trade-price answers 0.5 with an empty side until something trades", async (mock) => {
    const m = market(mock, "clob-active-b");
    assert.deepEqual((await getJson(mock, "orderbook", `/last-trade-price?token_id=${m.noTokenId}`)).body, { price: "0.5", side: "" });
    mock.state.setBook(m.noTokenId, { lastTrade: { price: "0.394", side: "SELL" } });
    assert.deepEqual((await getJson(mock, "orderbook", `/last-trade-price?token_id=${m.noTokenId}`)).body, { price: "0.394", side: "SELL" });
  });

  harness.it("GET /fee-rate is 0 for every token, whatever the Data API says the taker fee is", async (mock) => {
    const m = market(mock, "clob-active-b");
    assert.equal(m.takerFeeBps, 400);
    assert.deepEqual((await getJson(mock, "orderbook", `/fee-rate?token_id=${m.yesTokenId}`)).body, { base_fee: 0 });
    assert.equal(((await getJson(mock, "dataApi", `/api/markets/contract/${m.conditionId}`)).body as { effectiveFeeConfig: { takerFeeBps: number } }).effectiveFeeConfig.takerFeeBps, 400);
  });

  harness.it("GET /neg-risk is false for a known token and 404 for an unknown one", async (mock) => {
    assert.deepEqual((await getJson(mock, "orderbook", `/neg-risk?token_id=${market(mock, "clob-active-a").yesTokenId}`)).body, { neg_risk: false });
    assert.equal((await getJson(mock, "orderbook", "/neg-risk?token_id=9")).status, 404);
  });
});

describe("orderbook reads: markets", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /markets/{cid} lists the Yes and No tokens with their mid and the tick, and the active flag", async (mock) => {
    const m = market(mock, "clob-active-b");
    const { status, body } = await getJson(mock, "orderbook", `/markets/${m.conditionId}`);
    assert.equal(status, 200);
    assert.deepEqual(body, {
      condition_id: m.conditionId,
      tokens: [
        { token_id: m.yesTokenId, outcome: "Yes", price: "0.3" },
        { token_id: m.noTokenId, outcome: "No", price: "0.7" },
      ],
      minimum_tick_size: 0.001,
      neg_risk: false,
      active: true,
    });
    assert.equal(((await getJson(mock, "orderbook", `/markets/${market(mock, "conviction-paused").conditionId}`)).body as { active: boolean }).active, false);
    assert.equal(((await getJson(mock, "orderbook", `/markets/${market(mock, "clob-closed").conditionId}`)).body as { active: boolean }).active, false);
  });

  harness.it("answers an unknown market with a 404 whose body is the requested id", async (mock) => {
    const id = `0x${"00".repeat(31)}01`;
    const { status, body } = await getJson(mock, "orderbook", `/markets/${id}`);
    assert.equal(status, 404);
    assert.deepEqual(body, { error: id });
    const malformed = await getJson(mock, "orderbook", "/markets/nonsense");
    assert.equal(malformed.status, 404);
    assert.deepEqual(malformed.body, { error: "nonsense" });
  });

  harness.it("the Data API outcome tokens equal the orderbook Yes and No tokens for every market in the catalogue", async (mock) => {
    for (const m of mock.state.markets) {
      const detail = (await getJson(mock, "dataApi", `/api/markets/contract/${m.conditionId}`)).body as { outcomes: { index: number; outcomeTokenId: string }[] };
      const orderbook = (await getJson(mock, "orderbook", `/markets/${m.conditionId}`)).body as { tokens: { outcome: string; token_id: string }[] };
      assert.equal(detail.outcomes.find((o) => o.index === 0)?.outcomeTokenId, orderbook.tokens.find((t) => t.outcome === "Yes")?.token_id, m.seed);
      assert.equal(detail.outcomes.find((o) => o.index === 1)?.outcomeTokenId, orderbook.tokens.find((t) => t.outcome === "No")?.token_id, m.seed);
    }
  });

  harness.it("gives distinct ids to every market, token and condition, the same on every run", async (mock) => {
    const conditions = mock.state.markets.map((m) => m.conditionId);
    const tokens = mock.state.markets.flatMap((m) => [m.yesTokenId, m.noTokenId]);
    assert.equal(new Set(conditions).size, conditions.length);
    assert.equal(new Set(tokens).size, tokens.length);
    for (const id of conditions) assert.match(id, /^0x[0-9a-f]{64}$/);
    for (const token of tokens) assert.match(token, /^[1-9][0-9]{50,77}$/);
    // Fixed ids: the first catalogue market is the same on every run and every machine.
    assert.equal(market(mock, "clob-active-a").conditionId, "0x489fe09f40a0ac45c2791dbb6877cee357635a0384f15082bcd99fd4eb9a35e6");
  });
});

describe("orderbook reads: accounts", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /balance-allowance: an unregistered address has smart_account null and zero balances", async (mock) => {
    assert.deepEqual((await getJson(mock, "orderbook", `/balance-allowance?address=${A}`)).body, { balance: "0", allowance: "0", smart_account: null });
  });

  harness.it("a registered account is reported as the queried address, lower-case, without 0x, whatever case it was asked in", async (mock) => {
    mock.state.forceRegistered(A);
    mock.state.setBalance(A, { balanceMicro: 25_000_000n, allowanceMicro: 18_500_000n });
    for (const query of [A, A_LOWER.replace(/^/, "0x"), `0x${A_LOWER.toUpperCase()}`]) {
      const { body } = await getJson(mock, "orderbook", `/balance-allowance?address=${query}`);
      assert.deepEqual(body, { balance: "25000000", allowance: "18500000", smart_account: A_LOWER });
    }
  });

  harness.it("an owner address is never mapped to its account: only the account itself is registered", async (mock) => {
    // The public Anvil account 0 and its counterfactual Kernel account.
    const owner: string = ANVIL_ACCOUNT_0_OWNER;
    const account: string = ANVIL_ACCOUNT_0_ACCOUNT;
    mock.state.forceRegistered(account);
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${owner}`)).body as { smart_account: unknown }).smart_account, null);
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${account}`)).body as { smart_account: unknown }).smart_account, account.slice(2).toLowerCase());
  });

  harness.it("rejects a missing or malformed address with 400", async (mock) => {
    for (const path of ["/balance-allowance", "/positions", "/claimable"]) {
      assert.equal((await getJson(mock, "orderbook", path)).status, 400, path);
      assert.equal((await getJson(mock, "orderbook", `${path}?address=0x123`)).status, 400, path);
      assert.equal((await getJson(mock, "orderbook", `${path}?address=${"cafe".repeat(10)}`)).status, 400, path);
    }
  });

  harness.it("GET /positions lists micro-share balances and reservations; GET /claimable lowercases the address", async (mock) => {
    const m = market(mock, "clob-closed");
    mock.state.setBalance(A, { cashBalanceMicro: 12_500_000n });
    mock.state.setPositions(A, [{ tokenId: m.yesTokenId, balanceMicro: 50_000_000n, reservedMicro: 10_000_000n }]);
    mock.state.setClaimable(A, [{ conditionId: m.conditionId, outcome: "Yes", tokenId: m.yesTokenId, balanceMicro: 40_000_000n, refundReason: "resolved_winner" }]);
    assert.deepEqual((await getJson(mock, "orderbook", `/positions?address=${A}`)).body, {
      cash_balance: "12500000",
      positions: [{ token_id: m.yesTokenId, balance: "50000000", reserved: "10000000" }],
    });
    assert.deepEqual((await getJson(mock, "orderbook", `/claimable?address=${A}`)).body, {
      address: `0x${A_LOWER}`,
      claimable: [{ market_id: m.conditionId, outcome: "Yes", token_id: m.yesTokenId, balance: "40000000", refund_reason: "resolved_winner" }],
    });
    assert.throws(() => mock.state.setPositions(A, [{ tokenId: m.yesTokenId, balanceMicro: 1n, reservedMicro: 2n }]), RangeError);
    mock.state.setPositions(A, []);
    mock.state.setClaimable(A, []);
    mock.state.setBalance(A, { cashBalanceMicro: 0n });
  });
});

describe("orderbook reads: errors and the private surface", () => {
  const harness = useMock({ chains: false });

  harness.it("GET /orders without L2 headers is the recorded 401", async (mock) => {
    const { status, body } = await getJson(mock, "orderbook", "/orders");
    assert.equal(status, 401);
    assert.deepEqual(body, { error: "HMAC L2 credentials required" });
  });

  harness.it("with all four L2 headers but an unknown key the same route is 401 invalid API key; with only some it is the recorded 401", async (mock) => {
    const full = Object.fromEntries(L2_HEADERS.map((name) => [name, "x"]));
    const unknown = await getJson(mock, "orderbook", "/orders", { headers: full });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, { error: "invalid API key" });
    const partial = await getJson(mock, "orderbook", "/orders", { headers: { xo_api_key: "x" } });
    assert.equal(partial.status, 401);
    assert.deepEqual(partial.body, { error: "HMAC L2 credentials required" });
  });

  harness.it("POLY_* headers are not read: they are the recorded 401, as live", async (mock) => {
    const poly = await getJson(mock, "orderbook", "/orders", { headers: { poly_api_key: "x", poly_timestamp: "1", poly_passphrase: "x", poly_signature: "x" } });
    assert.equal(poly.status, 401);
    assert.deepEqual(poly.body, { error: "HMAC L2 credentials required" });
  });

  harness.it("the only write route still not built answers 501 with the TODO label, and accepts nothing by accident", async (mock) => {
    assert.deepEqual(UNBUILT_ROUTES, [["POST", "/orders"]]);
    for (const [method, path] of UNBUILT_ROUTES) {
      const response = await getJson(mock, "orderbook", path, { method, headers: { "content-type": "application/json" }, body: "{}" });
      assert.equal(response.status, 501, `${method} ${path}`);
      assert.match((response.body as { error: string }).error, /TODO-for-mock-write/, `${method} ${path}`);
    }
  });

  harness.it("a route that does not exist is 404, not 501", async (mock) => {
    assert.equal((await getJson(mock, "orderbook", "/no-such-route")).status, 404);
    assert.equal((await getJson(mock, "orderbook", "/markets")).status, 404);
  });

  harness.it("429 carries retry_after_ms in the body and Retry-After in whole seconds", async (mock) => {
    mock.injectFault("429-retry-after", { retryAfterMs: 1500, listeners: ["orderbook"] });
    const { status, body, headers } = await getJson(mock, "orderbook", "/time");
    assert.equal(status, 429);
    assert.deepEqual(body, { error: "rate limit exceeded", retry_after_ms: 1500 });
    assert.equal(headers.get("retry-after"), "2");
    assert.equal((await getJson(mock, "dataApi", "/api/markets?take=1")).status, 200, "the other listeners are not affected");
  });

  harness.it("an optional limiter answers 429 past the limit and lifts when the clock moves past the window", async (mock) => {
    mock.setRateLimit("orderbook", { limit: 3, windowMs: 1000 });
    try {
      for (let i = 0; i < 3; i += 1) assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
      const limited = await getJson(mock, "orderbook", "/time");
      assert.equal(limited.status, 429);
      assert.equal((limited.body as { retry_after_ms: number }).retry_after_ms, 1000);
      assert.equal(mock.limiter.limited, 1);
      mock.clock.advanceMs(1001);
      assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
      assert.equal((await getJson(mock, "dataApi", "/api/markets?take=1")).status, 200, "limits are per listener");
    } finally {
      mock.setRateLimit("orderbook", null);
    }
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
  });
});
