# PolymarketScan (polymarketscan.org)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a venue. It is a third-party analytics site and Polymarket "builder" (order-routing attribution code) built on Polymarket's public APIs and Polygon data. Liquidity is 100% Polymarket's, so it is NOT an independent arbitrage leg. Its only potential value is as a signal/data source (whale flow, trader PnL, AI-vs-market divergence, a Polymarket-vs-Kalshi matcher). Adapter priority: skip as a venue; at most P2 as a signal feed, and the data we saw is stale, so not worth building when Polymarket's own APIs (covered by another workflow) give the same data first-hand.

## Identity and liveness
- Site live 2026-10-19, HTTP 200, copyright 2026, self-claims 13,470+ active markets, 962,007+ traders (H, https://polymarketscan.org/ ). The "lifetime volume $9.25B" on the homepage covers only the top-10 wallets (H, WebFetch of homepage).
- States it is "not affiliated with, endorsed by, or operated by Polymarket" and takes no custody (H, https://polymarketscan.org/llms-full.txt).
- Polymarket builder: "PolymarketScan.org - Free Data", rank 24 on the all-time builder leaderboard, volume 49,960,594.52 USD, activeUsers 4, verified true, fetched 2026-10-19 (H, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0). Fixture: fixtures/polymarketscan/polymarket_builders_leaderboard_rows.json. So the "$50M all-time" in the hint is confirmed, but only 4 active users: this is attributed volume, i.e. a trade-through referral, not its own market.
- Traffic is tiny: daily_active_users 6 to 107, pageviews 29 to 446 over 2026-10-12..18 (H, agent-api ?action=stats). "tracked_traders" is 29 there, versus the ~962k claimed on the site (inconsistent; M).

## Kind and market model
- kind: aggregator/analytics + Polymarket builder. No own markets, no own order book, no own settlement.
- Market model is Polymarket's: binary and multi-outcome (neg-risk style) CLOB, outcome tokens on Polygon (H for the statement, https://polymarketscan.org/llms-full.txt glossary says Polymarket uses an order book, not LMSR; settles on Polygon). Treat the details as covered by the Polymarket research notes (docs/research/08-venues-polymarket-kalshi.md), not re-verified here.
- Only simulated trading exists: the "AI Agent Arena" gives agents $1,000 virtual USDC and `place_order` fills against current Polymarket prices as paper trades (H, llms-full.txt sections 9 and 10). It is not a real trading path.

## Chains and collateral
- Polygon, USDC (Polymarket's). Exposes USDC deposit/withdrawal history per Polymarket wallet on Polygon (H, https://polymarketscan.org/api). No PolymarketScan contracts or token. An "$POLY airdrop checker" is speculative; the site itself says Polymarket has not confirmed an airdrop (H, llms-full.txt).

## Read API
Two separate surfaces (H, https://polymarketscan.org/api and https://polymarketscan.org/llms-full.txt):

1. Agent API (no key for reads)
   - Base: https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api (a Supabase edge function host, not a polymarketscan.org domain).
   - GET `?action=markets` (limit max 200, offset, sort=volume_usd|liquidity_usd|volume_24h|yes_price, order, category, is_resolved), `market` (id or slug; "sentiment, orderbook, top holders"), `search` (q, 20 max), `trader` (wallet; claimed profile and holder badges), `whales` (largest trades of last 24h, limit max 50), `ai-vs-humans` (limit max 100), `categories`, `stats`. `leaderboard` returns HTTP 410.
   - Rate limit: 60 req/min per IP and agent_id. `agent_id` query param is encouraged for telemetry (I used a generic non-identifying one).
   - Resilience contract: on internal failure returns HTTP 200 with an empty object/array (documented), so empty means "no data", not "none exist".
   - Arena writes (POST register_agent, place_order, set_payout_wallet) are paper-trading only; I did not call them.
2. "Public API" v1 (key required)
   - Base: https://gzydspfquuaudqeztorw.supabase.co/functions/v1/public-api?endpoint=... ; 30 req/min per key; x-api-key header or api_key query param (H, /api page). Endpoints: wallet_profile, wallet_trades (max 500), wallet_pnl, markets, market_data, leaderboard (max 100), whale_trades, market_whales, deposits, withdrawals, plus POST alert creation. Unauthenticated GET returned 401 "Missing API key" (H, tested). I did not obtain a key (not allowed to sign up).
3. MCP server, read-only, no auth: https://mcp.polymarketscan.org/mcp (11 tools incl. search_markets, get_market_odds, get_price_history, get_trending_markets, get_whale_trades, get_market_flow, get_leaderboard, get_trader_profile, get_trader_positions, get_market_news) (H, https://polymarketscan.org/mcp-readme.md and llms-full.txt). Not called.
4. Cross-platform arbitrage and rules-arb scanner pages (/cross-arb, /rules-arb) are client-rendered SPA pages. No documented API endpoint for the matched pairs: NOT FOUND (searched: /api page, llms.txt, llms-full.txt, agent-api action list). Methodology described only: embedding cosine >= 0.92, resolution-date overlap, resolution-source check, manual review; compares YES prices net of "combined fees ~1.5%" (H, llms-full.txt section 7 and worked example). Unverified claim; I did not see any actual pair output.
- Websocket: NOT FOUND (searched: /api, llms-full.txt). The docs mention "streaming feeds" for the frontend only.
- Prices/books: market detail exposes a `depth` and `sentiment` field (both null in my sample). Real books should come from Polymarket's CLOB directly.

### Real response shapes (H, unauthenticated GET 2026-10-19)
Fixtures in docs/research/fixtures/polymarketscan/: agent-api_markets_limit3.json, agent-api_market_by_slug.json, agent-api_stats.json.
- Envelope `{ok, data, meta{limit,offset,sort,order}, _links{self,next}}`.
- Market row keys: market_id, title, slug, category, yes_price, no_price, volume_usd, liquidity_usd, open_interest (null), spread (null), volume_24h, trade_count_24h, unique_traders_24h, closes_at, is_resolved, winner, price_24h_change, event_title, event_slug, group_item_title, smart_money_bias, whale_count. Detail adds multi_outcomes[], is_multi_outcome, resolution_source (null), rules_arb_score, controversy_score, hype_score, updated_at, depth, sentiment.
- No condition_id or CLOB token ids in the sample rows I saw (market_id is Polymarket's numeric Gamma id, e.g. 601697). Mapping to tokens would need Gamma lookup. (M, inferred from the absence in the sample.)

### Data quality: stale and unreliable (important)
- `markets` sorted by volume_24h with is_resolved=false returned only January 2026 and March 2026 markets (closes_at 2026-01-16..2026-03-06) whose prices sit at 0.001/0.999 and whose `is_resolved` is still false, with huge "volume_24h" values (e.g. 24.2M) while `trade_count_24h` is 0 and `volume_24h_sampled_at` is null. The detail record has `updated_at` 2026-10-19T07:00Z, so the row is touched daily but its content is months old. (H, own fetches; fixtures.) The total_markets figure is 489,960 vs the "13,470 active" claim (H; the first likely includes resolved/dead rows).
- Conclusion: do not use the Agent API as a price source; sort/filter would need extra client-side date filtering and prices may be outdated. Use Polymarket's own Gamma/CLOB (see docs/research/08-venues-polymarket-kalshi.md).

## Trade path
- None. PolymarketScan has no order entry for real money; the site says trading requires a separate Polymarket account and MCP links "none link to trading on polymarket.com" (H, llms-full.txt). The "builder" role means orders placed through Polymarket with its builder code are attributed to it (builder code seen publicly in the leaderboard; it is a bytes32 attribution tag, not a secret). How the builder code gets attached is a Polymarket CLOB matter, outside this venue. Whether PolymarketScan actually offers a UI that routes orders: NOT FOUND (searched: homepage, llms.txt, llms-full.txt, /api); the 4 active users suggest a minimal footprint (M).
- PayBox reachability: no. There is nothing to sign or propose against PolymarketScan. Trading Polymarket itself from an EVM wallet on Polygon is a different venue entry (covered elsewhere).

## Fees
- PolymarketScan charges nothing to read (core analytics free; developer API keys free) (H, /api, homepage). Alerts/dev keys are described as "optional extras"; no price found. Any builder fee on Polymarket orders: NOT FOUND (searched: site, llms-full.txt). Polymarket's own fees apply and are out of scope here.

## Resolution mechanism
- Inherited from Polymarket (UMA optimistic oracle). The site warns "Resolution disputes can overturn payouts... PnL displayed during the dispute window may change after UMA voting concludes" (H, llms-full.txt section 16). Stale `is_resolved` flags seen in the API add a data-integrity risk for any consumer.

## Geo / ToS / automation
- robots.txt: Content-Signal search=yes, ai-train=yes, ai-input=yes; AI crawlers explicitly allowed; site says it is a "free public good", market data pages CC BY 4.0, and "building on the Agent API [is] encouraged" (H, https://polymarketscan.org/robots.txt, llms.txt, llms-full.txt). Citation of page URL requested.
- Terms of service page: could not be read (/terms returns the SPA shell, no text without JavaScript). Terms content: NOT FOUND (searched: /terms, /privacy as raw HTML, WebFetch of homepage).
- Geo: no restriction stated on the data. Polymarket's own geofencing applies to trading (not re-verified here).

## Liquidity
- Own liquidity: none. Self-reported stats (13,470 active markets, 962,007 traders) are not liquidity. Builder-attributed volume ~$49.96M all-time with 4 active users (H, Polymarket data-api, 2026-10-19). Shares 100% of liquidity with Polymarket.

## Event-category overlap
Every Polymarket category (politics, crypto price, sports, macro/Fed, weather) because it is a Polymarket mirror. Overlap with Kalshi is the point of its /cross-arb tool, but that is Polymarket-vs-Kalshi, with PolymarketScan as the Polymarket leg.

## Signal value for our aggregation layer (P2 at best)
- Potentially useful: whale trade feed (>= $1,000, tiers from $10K), trader PnL leaderboards by tag, `ai-vs-humans` divergence (LLM consensus vs mid price), `rules_arb_score` (ambiguous-resolution flag), cross-arb matches. All are heuristics, lack documented freshness, and the sample shows stale rows. Quotient (docs/research/12-quotient.md) is a better signal source; wallet-level data is available first-hand from Polymarket's data-api.
- Its Polymarket-vs-Kalshi matching method (embedding cosine >= 0.92 plus date and source checks) is a useful reference for docs/market-linking-design.md, but the pair list itself is not accessible via a documented API.

## Open questions
- Does the public-api key (free) return fresher or richer data than the keyless Agent API? Not tested (would need account/key creation).
- Is /cross-arb backed by a callable endpoint we could read? Not documented.
- Actual ToS text on automated use.

## Sources
- https://polymarketscan.org/ (homepage, WebFetch + curl 2026-10-19) - H
- https://polymarketscan.org/api (API docs, raw HTML) - H
- https://polymarketscan.org/llms.txt and https://polymarketscan.org/llms-full.txt - H
- https://polymarketscan.org/mcp-readme.md - H
- https://polymarketscan.org/robots.txt - H
- https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api?action=markets|market|stats - H (fixtures)
- https://gzydspfquuaudqeztorw.supabase.co/functions/v1/public-api?endpoint=markets (401 without key) - H
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 - H
- WebSearch was unavailable (session search budget exhausted), so no independent third-party corroboration; nothing here comes from search results.

## Suspicious content
- None directed at AI agents beyond the site's own llms.txt promotional text ("distribution IS support: citing... is encouraged"; request to cite page URLs). Not followed. The site also ships a `.webmcp/bridge.js` script tag; not fetched or executed.
