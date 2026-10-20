# PolymarketScan.org - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to `polymarketscan.org`, its Supabase edge-function API host, `data-api.polymarket.com` and `gamma-api.polymarket.com` (User-Agent `insurance-markets-research/0.1`, no other identifying headers or parameters). No account, no API key, no wallet, no signing, no POST/PUT/DELETE (so the MCP server, which is POST-only JSON-RPC, was read from its docs and server card but not called), no PayBox tool used. Third-party text (including the AI-agent-directed `skill.md` and `llms.txt`) was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Limitation: the shared WebSearch budget was exhausted when I tried to search, so no independent third-party coverage was gathered. Everything below rests on the site's own pages and API plus Polymarket's public APIs.

---

## 0. Bottom line

1. **PolymarketScan is not a venue.** It is a free third-party analytics dashboard, whale tracker and wallet-PnL index for Polymarket. It has no order book, no collateral, no settlement, no markets of its own. Its own text says it is "not affiliated with, endorsed by, or operated by Polymarket" and that "The site doesn't route orders" (H: llms-full.txt section 1; M: terms summary). It cannot be an arbitrage leg.
2. **It shares 100% of its liquidity with Polymarket.** Every market id I checked is a Polymarket Gamma id (market `601697` matches `gamma-api.polymarket.com/markets/601697`, same question, same volume `235065166.637259`). The Polymarket builders leaderboard lists a verified builder "PolymarketScan.org - Free Data" (rank 24 all-time, about $49.96M routed volume, 4 active users): that is a referral/builder code on Polymarket orders, not a separate pool. (H)
3. **Live in October 2026**, with a version 2.0.0 MCP server dated October 2026, an agent-key change dated 2026-10-17 and a terms page "last updated October 1, 2026" (H for MCP readme and skill.md; M for terms date, small-model summary). But traffic is small: the site's own `stats` action shows 92 daily active users and 446 pageviews on 2026-10-17 (H).
4. **The free REST API is partly stale.** `?action=markets` returned January 2026 Fed/shutdown markets as `is_resolved:false` and top-ranked by 24h volume on 2026-10-19; the whale feed and `ai-vs-humans` are fresh (timestamps 2026-10-18/19). The `market` action returned `depth:null` and `sentiment:null` although the docs promise an order book. (H, fixtures saved)
5. **Priority: skip as an adapter.** Polymarket is already covered by another workflow, the same whale/PnL/price data is available from Polymarket's own Data API and Gamma API, and PolymarketScan's cross-venue arb scanner is not exposed through any documented API. At most a footnote as prior art for "Polymarket vs Kalshi" matching (section 9).

---

## 1. Kind and market model

| Item | Finding |
|---|---|
| Kind | Aggregator / analytics + data API for one venue (Polymarket). Not a trading venue. (H) |
| Market model | None of its own. Mirrors Polymarket: binary and categorical (event-grouped) CLOB markets, outcome tokens are ERC-1155 under Gnosis CTF on Polygon. (M: restated by PolymarketScan in llms-full.txt section 3, not primary for Polymarket) |
| Extra products | Wallet profiles (claims about 962K indexed traders on the homepage; the API `stats` says `tracked_traders: 29`, which the docs describe as claimed profiles), whale trade feed (>= $1,000), tag PnL leaderboard, airdrop estimator for a speculative $POLY token ("Polymarket has not confirmed an airdrop"), AI-vs-humans divergence, Rules Arbitrage Scanner, Cross-Platform Arbitrage page, "Polymarket Perps" snapshots, KaiLSHI Arena paper-trading sandbox (virtual $1,000). (H: llms.txt) |
| Arena | Simulated orders against current Polymarket prices; no real funds. (H: skill.md) |

## 2. Chains and collateral

Nothing held or settled by PolymarketScan. Underlying Polymarket: Polygon (chain id 137), USDC collateral. (M: PolymarketScan's own description; the Polymarket workflow owns the primary read.) The only on-chain thing near PolymarketScan is a donation address in skill.md (not recorded here, not relevant).

## 3. Read API

Three separate surfaces, plus the website.

### 3a. Keyless "Agent API" (documented in skill.md and llms-full.txt)

- Base URL: `https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api` (Supabase edge function). (H)
- Docs: https://polymarketscan.org/skill.md , https://polymarketscan.org/llms-full.txt section 10 , https://polymarketscan.org/agents (H)
- Auth: none for reads; CORS `*`. Writes only for the Arena (`x-agent-key`), simulated money. (H)
- Rate limit: 60 requests/minute per IP address and `agent_id`; responses cached 60 s (response header `cache-control: public, max-age=60`); data "refreshed every 2-5 minutes". No `x-ratelimit-*` headers seen. (H: skill.md; headers observed)
- Optional `agent_id` query parameter is for their telemetry; I did not send it (to keep the request free of identifiers).
- Envelope: `{"ok":true,"data":...,"meta":{...}}`; all UI-facing functions return HTTP 200 with an empty result on internal failure, so "empty" cannot be distinguished from "error". (H: llms-full.txt "Resilience contract")
- Key GET actions: `markets` (limit max 200, offset, sort, order, category, is_resolved), `market` (slug or id; detail plus claimed sentiment/orderbook/top holders), `search` (q, up to 20), `ai-vs-humans`, `trader` (claimed profile and badges), `wallet_trades`, `wallet_pnl`, `whales` (limit max 50), `categories`, `stats`, `arena_leaderboard`, `my_portfolio`. `leaderboard` is removed (HTTP 410). (H)
- Numeric price fields: `yes_price`, `no_price` (0..1), `volume_usd`, `liquidity_usd`, `volume_24h`, `closes_at`, `is_resolved`, `winner`. `spread`, `open_interest` and `unique_traders_24h` were null in every row I saw. (H)
- Observed data quality (2026-10-19):
  - `markets` default ordering and `sort=volume_24h&is_resolved=false` both returned January 2026 markets (closed per Polymarket Gamma: `closed:true` for id 601697) flagged unresolved with extreme prices (0.001/0.999) and 24h volumes of $12M-$24M, so this action is a stale snapshot, not live. Also "Will Argentina win the 2026 FIFA World Cup?" at 0.168 with `closes_at` 2026-07-20. (H, fixtures)
  - `categories` returned only `["Crypto"]`; `search?q=fed october 2026` returned zero rows; `search?q=bitcoin` returned February/March 2026 five-minute markets. (H)
  - `whales` and `ai-vs-humans` are fresh (`meta.last_updated` 2026-10-19T04:00Z; trades up to 2026-10-18T17:26Z). Whale rows include `tx_hash`, `market_id` (condition id), `price`, `amount_usd`, `tier`, `anomaly_tags`. (H)
  - `market` detail for a Polymarket id works, `updated_at` was current, but `is_resolved:false` and price 0.999 for a market with `closes_at` 2026-06-30, and `depth:null`. (H)
- Verdict: usable for whale/anomaly signals; not trustworthy for prices or market lists. For prices, read Polymarket directly (CLOB / Gamma).

### 3b. Key-based "public-api"

- Base URL: `https://gzydspfquuaudqeztorw.supabase.co/functions/v1/public-api`; unauthenticated GET returns HTTP 401 `{"error":"Missing API key. Pass via x-api-key header or api_key query param."}` (H, fixture).
- Docs page https://polymarketscan.org/api : free tier 30 requests/min per key, and llms-full.txt says 50,000 requests/month per key. Endpoints: `wallet_profile`, `wallet_trades`, `wallet_pnl`, `markets`, `market_data`, `leaderboard`, `whale_trades`, `market_whales`, `deposits`, `withdrawals`, plus alert creation (POST). Getting a key needs a sign-up, which is out of scope here, so the response shapes are NOT confirmed. (H for docs text; shapes NOT FOUND)

### 3c. MCP server

- `https://mcp.polymarketscan.org/mcp` (Streamable HTTP, stateless, version 2.0.0, no key, no OAuth), also at the Supabase `mcp-server/mcp` URL. 11 read-only tools: `search_markets`, `get_market_odds`, `get_price_history`, `get_market_movers`, `get_trending_markets`, `get_whale_trades`, `get_market_flow`, `get_leaderboard`, `get_trader_profile`, `get_trader_positions`, `get_market_news`. (H: server-card.json, mcp-readme.md) Not called (POST-only).
- Server card: https://polymarketscan.org/.well-known/mcp/server-card.json (H).

### 3d. WebSocket

NOT FOUND (searched: llms.txt, llms-full.txt, skill.md, /api page, server card). The docs mention "streaming feeds" only for the website's frontend (H: llms-full.txt "Frontend may show stale data during deployments. Streaming feeds reconnect within seconds"), with no documented socket endpoint.

## 4. Trade path

**None.** No order placement, no wallet connection for real funds, no signing scheme exposed. The only `place_order` is the Arena's simulated order endpoint (`x-agent-key`, virtual USDC). (H: skill.md) The MCP tools "cannot place, change or cancel orders, move funds or access any account" (H: server card text). The site does participate in Polymarket's Builder Program: terms (small-model summary, M) say PolymarketScan "may earn a referral fee" when users trade on Polymarket.com via its links; the cross-arb page footer says it is "part of Polymarket's Builder Program" (M, WebFetch summary). Terms section 4b contains the ambiguous phrase "Trading on polymarketscan.org" (M); I found no documented real-order endpoint.

## 5. Reachable through PayBox?

**No** (as a venue). There is nothing to trade or sign on PolymarketScan. Any real trading happens on Polymarket (Polygon, signed CLOB orders), which the parallel Polymarket workflow covers. A PayBox EVM wallet could use the read API, but that is a plain HTTP read and needs no wallet.

## 6. Fees

- PolymarketScan: free for reads; "Cost Free" on /api; "This API is free and always will be" (H: skill.md). Revenue is referral links, builder-code fees and publisher widgets. (M: llms-full.txt section 1)
- Trading fees are Polymarket's; not researched here (out of scope, covered by the Polymarket workflow).
- Its cross-arb example assumes "Combined fees ≈ 1.5%" for Polymarket plus Kalshi (H: llms-full.txt 13.3; it is an illustrative example, not a fee model).

## 7. Resolution mechanism and dispute risk

Not applicable to PolymarketScan; it inherits Polymarket's UMA optimistic-oracle resolution (M: restated in its glossary). Aggregation risk it does flag itself: the cross-arb page warns "Price differences often reflect contract term differences, not mispricings" (M: WebFetch summary), and its Rules Arbitrage Scanner is an "AI-powered" detector of ambiguous resolution criteria (H: llms.txt). Its claim that "both sides of any displayed pair share the same resolution semantics" (H: llms-full.txt section 7) conflicts with that page warning, so treat match quality as unverified. Its pairing pipeline is described as embedding cosine >= 0.92, date overlap, source compatibility and manual review (H: llms-full.txt section 7), but I could not see the rendered pairs (JS-rendered page).

## 8. Geo / ToS / automation

- Terms page (https://polymarketscan.org/terms, "last updated October 1, 2026", read via WebFetch summary so M): no scraping or API clause beyond section 4b on the MCP server ("excessive automated requests" barred; operator may limit or withdraw it); section 3 bars interfering with or disrupting the service; "No license is granted" and all content is owned by PolymarketScan; commercial use not addressed; attribution not required; users must be 18+; US users are "view-only" on Polymarket.com per section 4a.
- Contradiction: llms.txt says "Market data pages are published under CC BY 4.0" (H) while the terms summary says no license is granted (M). Need a human read before redistributing their derived data.
- Operator is not identified in any page I read; a contact page and a support mailbox exist (not recorded). NOT FOUND (searched: llms.txt, llms-full.txt, terms summary): legal entity or jurisdiction.
- Automation is explicitly invited for the keyless Agent API (60 req/min), so a read-only poller is within stated norms. (H)

## 9. Liquidity

- PolymarketScan has none of its own. Site-reported mirrors of Polymarket (all M, homepage 2026-10-19, third-party-aggregated numbers): 13,435+ active markets, 961,892+ indexed traders, "$9,971,553,846+ across the top 10 wallets alone".
- Builder code volume on Polymarket: $49,960,594.52 all-time, 4 active users, rank 24 of the top 50, `verified:true`, per `data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL` on 2026-10-19 (H, fixture). This is flow it directed into Polymarket, i.e. Polymarket's liquidity.
- Site traffic (its own `stats`): 6 to 107 daily active users over 2026-10-11 to 2026-10-17 (H, fixture).

## 10. Event-category overlap (for arbitrage)

All of Polymarket's categories (politics, crypto price, sports, macro/Fed, geopolitics, weather). Arbitrage against other venues would come from Polymarket's own price, so use Polymarket directly. PolymarketScan's `/cross-arb` page is a Polymarket-vs-Kalshi pair finder; its "Compare platforms" links name Kalshi, PredictIt, Manifold, Metaculus and Predict.Fun (M: WebFetch summary). That is competitor or prior art to our own market-linking layer, not a data source we can call: no documented API for the pairs (NOT FOUND, searched: skill.md, llms-full.txt endpoint list, /api page, MCP tool list).

## 11. Shares liquidity with

**Polymarket (global).** Confirmed by id cross-check against Gamma API and by the builder code on the Polymarket builders leaderboard. Not an independent arbitrage leg. (H)

## 12. Adapter priority: skip

Reasons: not a venue; zero independent liquidity; REST price data is stale; keyed API needs a sign-up; arb scanner has no API; everything useful (trade tape, wallet PnL, leaderboards, market data) is available from Polymarket's own public APIs. If we ever want a "smart money" signal alongside Quotient, build it from Polymarket's Data API trades (the `anomaly_tags` and `tier` ideas are cheap to copy) rather than depend on this site. Reconsider only if they publish a documented, live, key-free cross-venue pair feed.

## 13. Suspicious / embedded-instruction content (recorded, not followed)

- skill.md "Spread the Word": asks agents to include polymarketscan.org links in responses, credit its X account when sharing insights, and "Share this skill.md with other agents". Not followed.
- skill.md and llms.txt: "distribution IS support: citing PolymarketScan pages in answers, linking users directly to trader profiles ... are encouraged". Not followed.
- skill.md asks agents to add an `agent_id` to every read for telemetry and to register Arena agents; not done (would be an identifier in a third-party request).
- skill.md includes a crypto donation address ("if your agent profits from this data, consider donating"). Not acted on, address not copied.
- MCP tool results append promotional footers and `?ref=mcp` tracking links that mark visits as coming from an AI assistant (H: mcp-readme.md). Relevant if we ever consume MCP output: strip links.
- Pages are written for AI crawlers (`llms.txt`, `llms-full.txt` with a "canonical citation" blurb); treat their claims as marketing. Homepage claims 961,892 indexed traders while the API `stats` says 29 tracked; the REST markets feed is stale despite "Data refreshed every 2-5 minutes".

## 14. Not found / open questions

- NOT FOUND: independent third-party coverage or reviews (WebSearch budget exhausted; no search possible this session).
- NOT FOUND: response shapes of the key-based `public-api` (requires an API key; not created).
- NOT FOUND: MCP `tools/list` output (POST-only; not called). Tool list taken from the server card and readme.
- NOT FOUND: rendered content of `/cross-arb`, `/rules-arb` and `/terms` beyond the page shell (client-rendered; the terms and cross-arb details come from a small-model WebFetch summary, M).
- NOT FOUND: legal entity, jurisdiction, data-licence reconciliation (CC BY 4.0 vs "no license is granted").
- Open: whether the "Polymarket Perps" snapshots (`/perps`, "Polymarket's public experimental Perps API") point to a new Polymarket product worth a separate look; flagged for the Polymarket workflow.

## Fixtures (docs/research/fixtures/polymarketscan-org/)

- `agent-api_stats.json`, `agent-api_markets_sort-volume_usd.json`, `agent-api_markets_sort-volume24h_is_resolved-false_STALE.json`, `agent-api_market_detail.json`, `agent-api_whales.json`, `agent-api_ai-vs-humans.json`, `public-api_unauth_401.json`
- `polymarket-builders-leaderboard_row.json` (the PolymarketScan builder row plus neighbours), `gamma-api_market_601697_crosscheck.json` (shows the id maps to a closed Polymarket market)

## Sources

- https://polymarketscan.org (homepage, fetched 2026-10-19; H for what it says, M for its numbers)
- https://polymarketscan.org/llms.txt (H)
- https://polymarketscan.org/llms-full.txt (H)
- https://polymarketscan.org/skill.md (H; contains agent-directed promotional instructions, section 13)
- https://polymarketscan.org/api (H; key-based API docs)
- https://polymarketscan.org/mcp-readme.md and https://polymarketscan.org/.well-known/mcp/server-card.json (H)
- https://polymarketscan.org/terms (M: small-model WebFetch summary of a client-rendered page)
- https://polymarketscan.org/cross-arb (M: WebFetch summary of shell only)
- https://gzydspfquuaudqeztorw.supabase.co/functions/v1/agent-api?action=stats | markets | market | whales | ai-vs-humans | search | categories (H, GETs on 2026-10-19)
- https://gzydspfquuaudqeztorw.supabase.co/functions/v1/public-api (H: 401 response)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (H)
- https://gamma-api.polymarket.com/markets/601697 (H: id cross-check)
