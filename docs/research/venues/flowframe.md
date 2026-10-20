# FlowFrame (flowframe.xyz) - venue spec

Researched 2026-10-19. Read-only; no account, no API key, no signing. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

NOT A VENUE. FlowFrame is a free/paid analytics and media site layered on Polymarket and Kalshi. It has no market, no order book, no token, no trade path, and no independent liquidity. adapter_priority: P2 (signal-only, optional). Our own aggregation layer should read Polymarket and Kalshi directly; FlowFrame adds only derived signals (whale trades, smart-money skew, bond ratings) behind a key-gated, tightly rate-limited API.

## Liveness

- Site up on 2026-10-19: homepage, /dashboard, /api, /api-docs, /v1/openapi.json all return HTTP 200 (H, https://flowframe.xyz/, https://flowframe.xyz/v1/openapi.json).
- Blog posts reference 2026 events (US Open golf, Open Championship, 2026 midterms), so content is current (H, https://flowframe.xyz/).
- Company: founded 2025 per its llms.txt; two named people (a founder/engineer and a political analyst) (H, https://flowframe.xyz/about, https://flowframe.xyz/llms.txt). No funding, volume or user-count figures found. The JSON-LD "4.8 rating / 150 ratings" on the page is self-asserted marketing (L).

## Kind and market model

- Kind: aggregator / analytics / research media (H, https://flowframe.xyz/llms.txt: "prediction market media and analytics platform").
- Covers Polymarket and Kalshi only; Hyperliquid perp prices and sportsbook odds appear as paid cross-reference data (H, openapi.json).
- Market model, tokenisation, chains, collateral: NOT APPLICABLE (no markets of its own). Underlying venues: Polymarket (CLOB, ERC-1155 conditional tokens on Polygon, USDC) and Kalshi (CFTC-regulated central limit order book, USD) - M, described by FlowFrame, not verified here (those venues are covered by a separate workflow).
- Products (H, https://flowframe.xyz/ and sitemap): bond ratings AAA-C, whale activity feed, trader leaderboard, smart-money skew, Mentions Hub (speech-transcript keyword search), arbitrage scanner (Polymarket vs Kalshi), Kelly calculator, paper trading, hot list / fragile markets (orderbook imbalance), midterms hub, newsletter, blog, "insider finder", embed, institutional page.
- Bond rating methodology: described only as "AAA to C" quality scores combining liquidity, volume, probability (H, llms.txt). Formula NOT FOUND (searched: /about, /llms.txt, homepage).

## Read API (FlowFrame's own)

- exists: official-authenticated (bearer key required for all /v1/* except the OpenAPI spec).
- Base URL: https://flowframe.xyz/v1 (H, openapi.json servers).
- Docs: https://flowframe.xyz/api-docs ; spec (public, unauthenticated): https://flowframe.xyz/v1/openapi.json ("FlowFrame API (beta)", version 1.0.0-beta) (H).
- Auth: `Authorization: Bearer flowframe_live_<32 chars>`; keys generated in the account UI at /account/api-keys (not attempted). Unauthenticated GET /v1/movers/polymarket returns HTTP 401 `{"error":"unauthorized"}` (H, verified 2026-10-19; fixture unauth-401.json).
- Rate limits, per key, fixed 1-hour window (H, openapi.json description): Free 20 req/hour; FlowFrame Pro $19/mo 100/hour; API Starter $29/mo 600/hour; Institutional 60,000/hour. Headers: RateLimit-Limit/-Remaining/-Reset, Retry-After on 429.
- Free-tier terms: responses carry `meta.brand.attribution`; "Free-tier keys MUST display the attribution label in any UI built on top of this API" (H, openapi.json).
- Paid-only endpoints (403 on free keys): price-history, snapshot-history, cross-venue (Polymarket x Hyperliquid), signals/breakout, signals/spread-widening, sportsbook/events, sportsbook/odds (H).
- An MCP server also exists ("via REST or the FlowFrame MCP server"); URL NOT FOUND in the spec (searched: openapi.json, /api, /api-docs head).
- Websocket: NOT FOUND (searched: openapi.json, robots, llms.txt). RSS at /feed.xml (M, from robots.txt).
- Key endpoints (H, openapi.json paths):
  - GET /v1/movers/polymarket (window 1h/4h/12h/24h; conditionId, currentPrice 0-1, deltaPct, volume24h, liquidity)
  - GET /v1/movers/kalshi (ticker, YES price in cents, previousPrice since 00:00 UTC, openInterest, closeTime)
  - GET /v1/markets/kalshi (cached top-500 event slice, 30-minute cache; yesBid/yesAsk/noBid/noAsk 0-1; spec states prices are "cached normalized catalogue values, not live or executable quotes")
  - GET /v1/markets/kalshi/trending ; GET /v1/markets/search (Polymarket name -> conditionId)
  - GET /v1/trades/recent (trades by FlowFrame's tracked top-trader Polymarket wallets: wallet, conditionId, side, price, size, usdcSize, transactionHash)
  - GET /v1/smart-money/skew and /{conditionId}; GET /v1/political-smart-money/*; GET /v1/football-sharps/*; GET /v1/mentions/*; GET /v1/pulse; GET /v1/blog; POST /v1/calculators/kelly (stateless)
  - Paid: /v1/markets/{conditionId}/price-history, /snapshot-history, /v1/cross-venue/{conditionId}, /v1/signals/*
- There is NO arbitrage endpoint in the public API. The /arbitrage web page showed "no arbitrage opportunities currently detected" with no fields or methodology when fetched (H, https://flowframe.xyz/arbitrage); how markets are matched is NOT FOUND.
- Response-shape evidence: only the schema from the OpenAPI spec (fixture openapi-v1-trimmed.json). No real data responses could be fetched without a key, so no live samples exist (not creating a key, per ground rules).

## Trade path

none. FlowFrame does not execute or route orders. Its Kelly calculator and paper trading are sizing/simulation tools (H, https://flowframe.xyz/). PayBox reachability: no (nothing to trade); the underlying venues are evaluated in their own specs.

## Fees

- To users: llms.txt says "All tools are free to use" (H). API tiers: free / $19 Pro / $29 API Starter / Institutional price NOT FOUND (H for first three, openapi.json).
- No trading fees; none charged on trades. Whether FlowFrame has referral/builder codes on outbound Polymarket/Kalshi links: NOT FOUND.

## Resolution mechanism

Not applicable; inherits Polymarket (UMA-based, per other spec) and Kalshi (exchange-determined). FlowFrame does not resolve anything. Risk: its "arbitrage" view cannot be trusted to account for differing resolution criteria between venues (M, inferred; matching method unpublished).

## Geo / ToS / automation

- /terms and /privacy are routed in the SPA bundle, but the pages returned the generic app shell with no readable text via curl (M); ToS text NOT FOUND (searched: /terms, /privacy, /about, bundle route list). Only an explicit API-side rule found: free-tier attribution requirement (above).
- robots.txt allows crawling of the whole site for general and AI crawlers; disallows /admin, /api/admin (H, robots.txt). It does not grant API scraping rights; use the keyed API.
- Geo restrictions: none stated for the analytics; the underlying venues have their own (Polymarket US/other geoblocks, Kalshi US-regulated) - M.

## Liquidity

- No TVL/OI/volume of its own. Web traffic and revenue: NOT FOUND (searched: homepage, about, llms.txt). Directory evidence: predictionindex.xyz/ecosystem was supposed to list it, but the fetched page was truncated before the F entries, so the discovery hint is unconfirmed on that page (L).
- Shares liquidity entirely with Polymarket and Kalshi. It is NOT an independent arbitrage leg.

## Event coverage and overlap

Politics (midterms, speeches), geopolitics, macro/Fed (Powell, Warsh mentions), sports (NFL, golf, UFC), and crypto (BTC/ETH/SOL/HYPE via Hyperliquid cross-venue). All of it is just Polymarket and Kalshi coverage re-presented; useful as a cross-check of someone else's market matching (e.g. their Polymarket vs Kalshi "23-point gap" Iran-deal blog post is a market-pair example - H title only, https://flowframe.xyz/).

## Integration notes for our aggregation layer

1. Do not build a venue adapter. Treat FlowFrame as an optional signal source (whale trades, smart-money skew, Kalshi/Polymarket movers, bond rating) alongside Quotient.
2. Free tier (20 req/hour) is only enough for one poll of a few endpoints per hour; the useful signal endpoints (breakout, spread-widening, snapshot-history, cross-venue) need Pro/API Starter ($19-29/mo). Spend would need explicit human approval; creating a key is a manual user action.
3. Prices from /v1/markets/kalshi are 30-minute cached, not executable: never use them for arbitrage math.
4. Free-tier attribution obligation applies to any UI built on responses.
5. Smart-money wallet addresses are public Polymarket proxy wallets (derived from public chain data); fine to ingest as features, but they are third-party-curated cohorts (selection method unpublished).

## Sources

- https://flowframe.xyz/ (H, 2026-10-19)
- https://flowframe.xyz/about (H)
- https://flowframe.xyz/arbitrage (H)
- https://flowframe.xyz/llms.txt (H)
- https://flowframe.xyz/robots.txt (H)
- https://flowframe.xyz/sitemap.xml (H)
- https://flowframe.xyz/api and https://flowframe.xyz/api-docs (page meta only; SPA-rendered) (H for meta)
- https://flowframe.xyz/v1/openapi.json (H; unauthenticated)
- https://predictionindex.xyz/ecosystem (truncated in fetch; entry not seen) (L)
- Fixtures: docs/research/fixtures/flowframe/openapi-v1-trimmed.json, docs/research/fixtures/flowframe/unauth-401.json
- Not run: WebSearch (session search budget exhausted), so no third-party corroboration of company, traffic or reviews.

## Not found

- Terms of Service text; arbitrage matching method; bond rating formula; MCP server URL; websocket; Institutional price; traffic/usage figures; any third-party coverage.

## Suspicious content

None. Standard SEO/AEO crawler text only; no instructions aimed at AI agents. (llms.txt lists a public contact address of the site operator; deliberately not reproduced.)
