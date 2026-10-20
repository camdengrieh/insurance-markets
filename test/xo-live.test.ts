import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { XoClient, lifecycleOf } from "../src/xo/client.js";
import { XO_DATA_API_HOST, XoError } from "../src/xo/http.js";
import { formatMicro } from "../src/xo/units.js";
import type { MarketSummary } from "../src/xo/types.js";

// OPT-IN LIVE SMOKE TEST. Skipped unless XO_LIVE=1. Public unauthenticated GETs only, about 35
// requests in total (budget-capped at 40 per host), spaced 250 ms apart. No keys, no signing,
// no POST. Run with:  XO_LIVE=1 pnpm exec tsx --test test/xo-live.test.ts
//
// Scripted requests identify as insurance-markets-research/0.1. The plugin's own runtime
// User-Agent (insurance-markets-xo-plugin/0.2) is covered offline; whether Cloudflare accepts that exact
// string is therefore not exercised here.

const live = process.env["XO_LIVE"] === "1";
const DUMMY = "0xCAFE000000000000000000000000000000000A11";

describe("XO live smoke (public GET only)", { skip: !live }, () => {
  const client = new XoClient({ userAgent: "insurance-markets-research/0.1", maxRequestsPerHost: 40 });

  it("discovery returns only CLOB and Conviction markets and pages on hasNextPage", async (t) => {
    const first = await client.listMarkets({ take: 5, sortBy: "totalVolume", sortOrder: "DESC" });
    assert.ok(first.markets.length > 0);
    assert.equal(first.skipped.length, 0, JSON.stringify(first.skipped));
    for (const market of first.markets) {
      assert.ok(market.kind === "clob" || market.kind === "conviction", `${market.id} is ${market.kind}`);
      assert.equal(market.status, "ACTIVE");
      assert.equal(market.outcomes[0].slot, "yes");
    }
    const two = await client.listAllMarkets({ take: 50, maxPages: 2, sortBy: "totalVolume", sortOrder: "DESC" });
    assert.equal(two.pagesFetched, 2);
    assert.equal(two.exhausted, false);
    assert.ok(two.markets.length >= 90, `only ${two.markets.length} unique markets over 2 pages`);
    t.diagnostic(`discovery: ${two.markets.length} unique markets over 2 pages, ${two.skipped.length} skipped`);
    // Default-scope contrast: the unfiltered Data API default returns only the 9 legacy AMM rows.
    const raw = (await client.http.getJson(`https://${XO_DATA_API_HOST}/api/markets?statuses=ACTIVE&take=1`)) as { meta: { itemCount: number } };
    const scoped = (await client.http.getJson(`https://${XO_DATA_API_HOST}/api/markets?statuses=ACTIVE&take=1&marketType=2,4`)) as { meta: { itemCount: number } };
    t.diagnostic(`itemCount ACTIVE: default scope ${raw.meta.itemCount}, marketType=2,4 ${scoped.meta.itemCount}`);
    assert.ok(scoped.meta.itemCount > raw.meta.itemCount);
  });

  it("take above 50 is refused locally and 50 works live", async () => {
    await assert.rejects(client.listMarkets({ take: 51 }), (error: unknown) => error instanceof XoError && error.kind === "invalid_input");
    const page = await client.listMarkets({ take: 50 });
    assert.ok(page.markets.length <= 50);
  });

  it("quotes from the orderbook, not from list or detail prices", async (t) => {
    const candidates = (await client.listMarkets({ take: 12, sortBy: "totalVolume", sortOrder: "DESC" })).markets;
    let chosen: MarketSummary | undefined;
    for (const market of candidates.slice(0, 8)) {
      try {
        const quote = await client.getQuote(market.outcomes[0].tokenId);
        if (quote.bestBid !== null && quote.bestAsk !== null) {
          chosen = market;
          break;
        }
      } catch (error) {
        if (!(error instanceof XoError) || error.kind !== "not_found") throw error;
      }
    }
    assert.ok(chosen, "no two-sided book among the top markets");
    const yes = chosen.outcomes[0].tokenId;

    // The detail route reports a constant 500000 for both outcomes; confirm the trap is still live.
    const rawDetail = (await client.http.getJson(`https://${XO_DATA_API_HOST}/api/markets/contract/${chosen.conditionId}`)) as { outcomes: Array<{ currentPrice: string }> };
    assert.deepEqual(rawDetail.outcomes.map((o) => o.currentPrice), ["500000", "500000"]);
    const detail = await client.getMarketByConditionId(chosen.conditionId);
    assert.equal(detail.outcomes[0].tokenId, yes);
    assert.equal("displayPriceMicro" in detail.outcomes[0], false);
    assert.equal(lifecycleOf(detail, Date.now()) === "open" || lifecycleOf(detail, Date.now()) === "expired_unresolved", true);

    // Slot mapping against the orderbook's own Yes/No labels.
    const tokens = await client.getMarketWithTokens(chosen.conditionId);
    assert.equal(tokens.orderbook.yesTokenId, chosen.outcomes[0].tokenId);
    assert.equal(tokens.orderbook.noTokenId, chosen.outcomes[1].tokenId);

    // BUY is the best bid and SELL the best ask. Books move between calls, so allow a few samples.
    let matched = false;
    let lastSample = "";
    for (let attempt = 0; attempt < 3 && !matched; attempt += 1) {
      const quote = await client.getQuote(yes);
      const [bid, ask] = await Promise.all([client.getBestBid(yes), client.getBestAsk(yes)]);
      const after = await client.getQuote(yes);
      lastSample = `book ${formatMicro(quote.bestBid?.priceMicro ?? 0n)}/${formatMicro(quote.bestAsk?.priceMicro ?? 0n)} price BUY ${bid === null ? "-" : formatMicro(bid)} SELL ${ask === null ? "-" : formatMicro(ask)}`;
      const stable = quote.bestBid?.priceMicro === after.bestBid?.priceMicro && quote.bestAsk?.priceMicro === after.bestAsk?.priceMicro;
      if (stable && bid === (quote.bestBid?.priceMicro ?? null) && ask === (quote.bestAsk?.priceMicro ?? null)) matched = true;
    }
    t.diagnostic(`price semantics: ${lastSample}`);
    assert.ok(matched, `BUY/SELL never matched the book bid/ask: ${lastSample}`);
  });

  it("fee figures: /fee-rate and effectiveFeeConfig resolve fail-closed", async (t) => {
    const candidates = (await client.listMarkets({ take: 20, sortBy: "totalVolume", sortOrder: "DESC" })).markets;
    const market = candidates[0];
    assert.ok(market);
    const assessment = await client.getFeeAssessment(market.conditionId);
    t.diagnostic(`fee: status=${assessment.status} taker=${String(assessment.takerFeeBps)} effective=${String(assessment.effectiveConfigBps)} feeRate=${assessment.feeRateBps.join(",")}`);
    assert.ok(assessment.effectiveConfigBps !== null, assessment.note);
    if (assessment.takerFeeBps !== null) {
      assert.ok(assessment.takerFeeBps >= Math.max(assessment.effectiveConfigBps ?? 0, ...assessment.feeRateBps));
    }
  });

  it("public account endpoints answer for a dummy address with zeros; portfolio says no profile", async () => {
    const [positions, balance, claimable, portfolio] = await Promise.all([
      client.getPositions(DUMMY),
      client.getBalanceAllowance(DUMMY),
      client.getClaimable(DUMMY),
      client.getUserPortfolio(DUMMY),
    ]);
    assert.deepEqual(positions, { cashBalanceMicro: 0n, positions: [], truncated: false });
    assert.deepEqual(balance, { balanceMicro: 0n, allowanceMicro: 0n, smartAccount: null });
    assert.deepEqual(claimable, { address: DUMMY.toLowerCase(), claimable: [] });
    assert.deepEqual(portfolio, { status: "no_profile" });
  });

  it("a closed market is inactive with no liquidity, and trading state and clock decode", async (t) => {
    const closed = await client.listMarkets({ take: 1, statuses: ["CLOSED"], sortBy: "expiresAt", sortOrder: "DESC" });
    const market = closed.markets[0];
    assert.ok(market);
    assert.equal(market.status, "CLOSED");
    assert.notEqual(market.settlement.winningOutcomeIndex, null);
    const orderbook = await client.getOrderbookMarket(market.conditionId);
    assert.equal(orderbook.active, false);
    // Observed live: some closed markets answer /book with 404 and others with an empty book.
    // Both mean "no liquidity"; neither may be read as a quote.
    let outcome: string;
    try {
      const book = await client.getBook(market.outcomes[0].tokenId);
      assert.equal(book.bids.length + book.asks.length, 0);
      outcome = "empty book";
    } catch (error) {
      if (!(error instanceof XoError) || error.kind !== "not_found") throw error;
      outcome = "404 not_found";
    }
    const state = await client.getTradingState();
    const clock = await client.getServerTimeSeconds();
    t.diagnostic(`closed market /book: ${outcome}; trading state ${state.state}; server clock skew ${Math.abs(clock - Math.floor(Date.now() / 1000))}s`);
    assert.ok(state.state === "active" || state.state === "paused");
    assert.ok(Math.abs(clock - Date.now() / 1000) < 300);
  });

  it("stays inside the request budget", (t) => {
    const counts = client.http.requestCounts();
    t.diagnostic(`requests per host: ${JSON.stringify(counts)}`);
    for (const count of Object.values(counts)) assert.ok(count <= 40);
  });
});
