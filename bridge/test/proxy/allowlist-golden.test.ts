import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { READ_SERVICES } from "../../../app/headers.config.js";
import { decide, routesOf } from "../../allowlist.js";

// The read-proxy route table, pinned exactly (review finding TM-04). Every other allowlist test checks a few
// allowed and a few refused paths, so adding a signed or unlisted route (for example a Kalshi portfolio route)
// used to pass them all. This file fails on ANY change to the table, the explorer query rule or the Novig prefix
// depth. Changing the table on purpose means changing this snapshot in the same commit, where a reviewer sees it.

const GOLDEN: Readonly<Record<string, readonly string[]>> = {
  xo_data: ["GET rest /api/markets", "GET rest /api/markets/contract/:cid", "GET rest /api/markets/slug/:slug", "GET rest /api/markets/:int", "GET rest /api/users/portfolio"],
  xo_explorer: ["GET rest /api", "GET rest /api/v2/addresses/:addr", "GET rest /api/v2/addresses/:addr/token-balances", "GET rest /api/v2/addresses/:addr/token-transfers", "GET rest /api/v2/addresses/:addr/transactions", "GET rest /api/v2/tokens/:addr", "GET rest /api/v2/stats"],
  xo_rpc: ["POST jsonrpc /"],
  xo_orderbook: ["GET rest /book", "GET rest /price", "GET rest /last-trade-price", "GET rest /fee-rate", "GET rest /trading-state", "GET rest /time", "GET rest /markets/:cid", "GET rest /balance-allowance", "GET rest /positions", "GET rest /claimable"],
  polymarket_gamma: ["GET rest /public-search", "GET rest /markets/keyset", "GET rest /markets/slug/:slug", "GET rest /markets/:int", "GET rest /public-profile", "GET rest /status"],
  polymarket_clob: ["GET rest /book", "GET rest /price", "GET rest /midpoint", "GET rest /spread", "GET rest /time", "GET rest /tick-size", "GET rest /neg-risk", "GET rest /last-trade-price", "GET rest /prices-history", "GET rest /clob-markets/:cid", "GET rest /markets-by-token/:tok", "POST clob_batch /books", "POST clob_batch /prices", "POST clob_batch /midpoints", "POST clob_batch /spreads"],
  polymarket_data: ["GET rest /v2/positions", "GET rest /v2/activity", "GET rest /v2/trades", "GET rest /v2/value", "GET rest /v2/user-pnl", "GET rest /v2/tokens", "GET rest /v2/status"],
  polymarket_us: ["GET rest /v1/markets", "GET rest /v1/market/slug/:slug", "GET rest /v1/market/id/:slug", "GET rest /v1/markets/:slug/book", "GET rest /v1/markets/:slug/bbo", "GET rest /v1/markets/:slug/settlement", "GET rest /v1/events", "GET rest /v1/events/slug/:slug", "GET rest /v1/events/:slug", "GET rest /v1/search", "GET rest /v1/price-history"],
  manifold: ["GET rest /v0/search-markets", "GET rest /v0/market/:slug", "GET rest /v0/slug/:slug", "GET rest /v0/markets"],
  pascal: ["GET rest /api/v1/markets", "GET rest /api/v1/books", "GET rest /api/v1/time", "GET rest /api/v1/accounts/:b58"],
  hyperliquid_info: ["POST hyperliquid_info /info"],
  hyperliquid_rpc: ["POST jsonrpc /", "POST jsonrpc /evm"],
  defillama: ["GET rest /protocols", "GET rest /overview/dexs", "GET rest /overview/fees", "GET rest /overview/open-interest"],
  quotient: ["GET rest /api/public/performance", "GET rest /api/public/pricing", "GET rest /api/public/forecast-availability", "GET rest /api/public/forecast-targets", "GET rest /api/v1/markets", "GET rest /api/v1/markets/search", "GET rest /api/v1/markets/mispriced", "GET rest /api/v1/markets/lookup", "GET rest /api/v1/markets/:slug/intelligence", "GET rest /api/v1/markets/:slug/forecast", "GET rest /api/v1/signals", "GET rest /api/v1/signals/featured", "GET rest /api/v1/sources", "GET rest /api/v1/latest"],
  novig: ["GET rest /v3/public/**"],
  gemini: ["GET rest /v1/prediction-markets/events", "GET rest /v1/prediction-markets/events/:slug"],
  limitless: ["GET rest /markets/active", "GET rest /markets/:slug", "GET rest /markets/:slug/orderbook", "GET rest /portfolio/:addr/positions", "GET rest /portfolio/:addr/history", "GET rest /portfolio/:addr/pnl-chart"],
  kalshi: ["GET rest /trade-api/v2/exchange/status", "GET rest /trade-api/v2/markets", "GET rest /trade-api/v2/markets/orderbooks", "GET rest /trade-api/v2/markets/trades", "GET rest /trade-api/v2/markets/:slug", "GET rest /trade-api/v2/markets/:slug/orderbook", "GET rest /trade-api/v2/events", "GET rest /trade-api/v2/events/:slug", "GET rest /trade-api/v2/series", "GET rest /trade-api/v2/series/:slug", "GET rest /trade-api/v2/series/:slug/markets/:slug/candlesticks"],
  rpc_base: ["POST jsonrpc /"],
  rpc_polygon: ["POST jsonrpc /"],
  rpc_bnb: ["POST jsonrpc /"],
  // The markets API's XO relay serves the hosted page's wallet path; the daemon proxies none of it.
  markets_api: [],
};

const ADDR = `0x${"cd".repeat(20)}`;

describe("the read-proxy route table is pinned (TM-04)", () => {
  it("covers every read service and no other", () => {
    assert.deepEqual(Object.keys(GOLDEN).sort(), [...READ_SERVICES].sort());
  });

  for (const service of Object.keys(GOLDEN)) {
    it(`${service}: the routes are exactly the reviewed list`, () => {
      const actual = routesOf(service as (typeof READ_SERVICES)[number]).map((route) => `${route.method} ${route.kind} ${route.pattern}`);
      assert.deepEqual(actual, GOLDEN[service]);
    });
  }

  it("never lists a signed or account route of a venue", () => {
    for (const service of READ_SERVICES) {
      for (const route of routesOf(service)) {
        assert.doesNotMatch(route.pattern, /portfolio\/(?:balance|positions|orders|fills|settlements)|\/orders|\/user-orders|\/auth|\/wallets\/link/i, `${service} ${route.pattern}`);
      }
    }
  });
});

describe("the explorer query rule is pinned (TM-04)", () => {
  const explorer = (query: string) => decide({ service: "xo_explorer", method: "GET", path: "/api", query });

  it("allows exactly the four read modules with a plain-letter action", () => {
    for (const module of ["logs", "account", "transaction", "stats"]) {
      assert.equal(explorer(`module=${module}&action=getLogs`).ok, true, module);
    }
  });

  it("refuses every other module, proxy and contract included, even with an action that has no underscore", () => {
    for (const module of ["proxy", "contract", "block", "token", "eth", "admin", "Logs", ""]) {
      assert.equal(explorer(`module=${module}&action=getblocknumber`).ok, false, `module=${module}`);
    }
  });

  it("refuses an action that is not plain letters, and a missing module or action", () => {
    for (const query of ["module=logs&action=eth_getLogs", "module=logs&action=", "module=logs", "action=getLogs", "module=logs&action=get%20Logs", `module=logs&action=${"a".repeat(33)}`]) {
      assert.equal(explorer(query).ok, false, query);
    }
  });

  it("does not let the address route through the module rule", () => {
    assert.equal(decide({ service: "xo_explorer", method: "GET", path: `/api/v2/addresses/${ADDR}`, query: "" }).ok, true);
  });
});

describe("the Novig open prefix keeps its depth bound (TM-04)", () => {
  const novig = (segments: number) => decide({ service: "novig", method: "GET", path: `/v3/public${"/a".repeat(segments)}`, query: "" });

  it("allows one to six segments below /v3/public", () => {
    for (let depth = 1; depth <= 6; depth += 1) assert.equal(novig(depth).ok, true, `depth ${depth}`);
  });

  it("refuses the bare prefix and anything deeper than six segments", () => {
    assert.equal(novig(0).ok, false);
    for (const depth of [7, 8, 20, 60]) assert.equal(novig(depth).ok, false, `depth ${depth}`);
  });

  it("refuses a sibling prefix and a hidden or dotted segment", () => {
    for (const path of ["/v3/private/a", "/v3/publicx/a", "/v3/public/.hidden", "/v3/public/a/../b", "/v3/public/%2e%2e/a"]) {
      assert.equal(decide({ service: "novig", method: "GET", path, query: "" }).ok, false, path);
    }
  });
});
