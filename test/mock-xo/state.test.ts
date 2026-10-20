import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMockClock } from "./clock.js";
import { buildMarket, conditionIdFor, decimalFromTicks, defaultBook, tokenIdFor } from "./catalog.js";
import { accountKey, MockState } from "./state.js";

describe("the catalogue and the state", () => {
  it("makes the same ids from the same seed on every run, and different ids from different seeds", () => {
    assert.equal(conditionIdFor("x"), conditionIdFor("x"));
    assert.notEqual(conditionIdFor("x"), conditionIdFor("y"));
    assert.notEqual(tokenIdFor(conditionIdFor("x"), 0), tokenIdFor(conditionIdFor("x"), 1));
    assert.match(conditionIdFor("x"), /^0x[0-9a-f]{64}$/);
    assert.match(tokenIdFor(conditionIdFor("x"), 0), /^[1-9][0-9]+$/);
  });

  it("reset returns a state with the same markets, the same ids and nothing else", () => {
    const state = new MockState(createMockClock());
    state.seedDefaultMarkets();
    const before = state.markets.map((m) => [m.id, m.conditionId, m.yesTokenId, m.slug]);
    state.addMarket({ seed: "extra" });
    state.forceRegistered("0xCAFE000000000000000000000000000000000A11");
    state.markL1Created("0xCAFE000000000000000000000000000000000A11");
    state.setBalance("0xCAFE000000000000000000000000000000000A11", { balanceMicro: 5n });
    state.setPortfolio("0xCAFE000000000000000000000000000000000A11", [{}]);
    state.tradingState = "paused";
    state.reset();
    assert.deepEqual(state.markets.map((m) => [m.id, m.conditionId, m.yesTokenId, m.slug]), before);
    assert.equal(state.forcedRegistered.size + state.l1Created.size, 0);
    assert.equal(state.peekAccount("0xCAFE000000000000000000000000000000000A11"), undefined);
    assert.equal(state.portfolio("0xCAFE000000000000000000000000000000000A11"), undefined);
    assert.equal(state.tradingState, "active");
    assert.equal(state.books.size, state.markets.filter((m) => !["CLOSED", "RESOLVED", "VOIDED", "VOIDED_CLOSED", "CANCELLED"].includes(m.status)).length * 2);
  });

  it("refuses a duplicate seed, an unknown market and a bad spread", () => {
    const state = new MockState(createMockClock());
    state.addMarket({ seed: "a" });
    assert.throws(() => state.addMarket({ seed: "a" }), /already in the catalogue/);
    assert.throws(() => state.setStatus(`0x${"11".repeat(32)}`, "PAUSED"), /unknown market/);
    assert.throws(() => state.setBook("1", { bids: [] }), /no book/);
    assert.throws(() => buildMarket({ seed: "z", midTicks: 10 }, 1, 0), RangeError);
    assert.throws(() => buildMarket({ seed: "z", midTicks: 971 }, 1, 0), RangeError);
  });

  it("accepts an address with or without 0x in any case, and nothing else", () => {
    assert.equal(accountKey("0xCAFE000000000000000000000000000000000A11"), "cafe000000000000000000000000000000000a11");
    assert.equal(accountKey("CAFE000000000000000000000000000000000A11"), "cafe000000000000000000000000000000000a11");
    for (const bad of ["", "0x", "0x12", `0x${"g".repeat(40)}`, `0x${"1".repeat(41)}`]) assert.throws(() => accountKey(bad), RangeError, bad);
  });

  it("moves a market to closed: its books go, its status and active flag change", () => {
    const state = new MockState(createMockClock());
    const market = state.addMarket({ seed: "m" });
    assert.equal(state.books.has(market.yesTokenId), true);
    state.setStatus(market.conditionId, "PAUSED");
    assert.equal(market.orderbookActive, false);
    assert.equal(state.books.has(market.yesTokenId), true, "a paused market keeps its books");
    state.setStatus(market.conditionId, "RESOLVED");
    assert.equal(state.books.has(market.yesTokenId), false);
  });

  it("prints ticks as three decimals, trimmed for the market endpoint", () => {
    assert.equal(decimalFromTicks(5), "0.005");
    assert.equal(decimalFromTicks(495), "0.495");
    assert.equal(decimalFromTicks(500), "0.500");
    assert.equal(decimalFromTicks(500, true), "0.5");
    assert.equal(decimalFromTicks(300, true), "0.3");
    assert.equal(decimalFromTicks(999), "0.999");
  });

  it("builds a default book three levels a side and drops a level that would leave the grid", () => {
    const middle = defaultBook(500, 1);
    assert.deepEqual(middle.bids.map((l) => l.price), ["0.495", "0.490", "0.480"]);
    assert.deepEqual(middle.asks.map((l) => l.price), ["0.505", "0.510", "0.520"]);
    const edge = defaultBook(985, 2);
    assert.deepEqual(edge.asks.map((l) => l.price), ["0.990", "0.995"]);
    assert.equal(edge.bids.length, 3);
    const low = defaultBook(30, 3);
    assert.deepEqual(low.bids.map((l) => l.price), ["0.025", "0.020", "0.010"]);
  });
});
