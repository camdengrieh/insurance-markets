# Predictions.io (predictions.io) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## Verdict
Adapter priority: P2 (signal-only). Not a venue: no market, no liquidity, no trade path. It is a re-aggregator of Polymarket, Kalshi and Manifold, so it is never an independent arbitrage leg. Its one distinctive asset is a human-validated cross-venue question-match set, offered through a key-gated REST API issued by hand. Terms forbid automated access/API use without written consent.

## Status and kind
- Live: yes. Homepage returns HTTP 200 on 2026-10-19; sitemap lastmod 2026-10-19; page text "Updated October 19, 2026" [H, https://predictions.io/ , https://predictions.io/sitemap.xml].
- Kind: aggregator / analytics. Footer: it does not "operate a trading venue, accept funds, or execute trades" [H, https://predictions.io/ ].
- Press release (Chainwire, 2026-08-28) calls it "an independent aggregator of prediction markets"; no legal entity named; business model not stated; headline claim (8.5-pt gap on identically worded midterm markets) is the company's own and unverified [H, chainwire URL].
- Coverage: Polymarket (2,917 open markets, $6.4B volume), Kalshi (4,804, $2.1B), total 7,721 open markets across 23 "lobbies" on 2026-10-19 [H, homepage]. Manifold is ingested but flagged play money and excluded from dollar totals [H, /developers]. (Task hint said 7,697; the figure moves daily.)

## Market model, chains, collateral
Not applicable (no own markets). Normalised schema: market -> outcomes -> price as probability 0-1; volume in USD; Manifold mana kept but flagged [H, /developers]. Underlying venues: Polymarket (Polygon USDC CLOB), Kalshi (CFTC-regulated, USD) [H, /developers FAQ text].

## Read API
- Exists: official, authenticated, by-hand key issuance. "There is no self-serve signup and no unauthenticated access." Keys by emailing support@predictions.io (vendor address) with use case and expected volume [H, https://predictions.io/developers].
- Base URL: https://predictions.io/api/v1 ; docs: https://predictions.io/developers (single page, no OpenAPI found; NOT FOUND at /docs, /api (404)).
- Auth: header `X-API-Key: <key>`; the live 401 message also accepts `Authorization: Bearer pk_...` [H, fixture api-v1-lobbies-unauth-401.json].
- Rate limit: default 100 req/min per key; headers X-RateLimit-Limit/Remaining/Reset, Retry-After on 429; ETag + If-None-Match supported [H, /developers].
- Endpoints (all GET, read-only) [H, /developers]:
  - /lobbies (60s cache), /lobbies/:id, /lobbies/:id/summary (AI-written)
  - /events/:id (event + markets + outcomes + prices + volume; 30s cache)
  - /events/:id/matches (validated same-question matches on other venues; 120s cache) - the valuable one. Shape: matched_event_id, matched_event_title, matched_platform, similarity (0-1), confidence (0-100).
  - /markets/:id (30s), /markets/:id/price-history?range=1d|7d|30d|90d|all&fidelity=<minutes> (points {t unix s, p 0-1})
  - /currency/usd-rates
- Envelope: `{ok, data, meta:{request_id,timestamp,cached,cache_age_s}}`; errors `{ok:false,error:{code,message}}` with codes BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR, SERVICE_UNAVAILABLE [H].
- No documented list/search endpoint for events or markets (only lobbies, then ids), no order books, no trades/whale endpoint, no websocket, no resolution endpoint. NOT FOUND (searched: /developers page, llms.txt, /docs, /api).
- /mcp: robots.txt disallows /mcp; unauthenticated GET returns 405 "This endpoint speaks MCP over POST only" with a hint pointing to docs/MCP.md. So an MCP server exists but is not documented publicly; not probed further (POST not allowed under ground rules) [H, curl 2026-10-19]. Also robots disallows /api/ and /console/ for crawlers (a console exists) [H].
- Real response shape confirmed: only the unauthenticated 401 (fixtures). Success shapes are taken from the vendor's worked examples (saved as developers-page-text.txt), tagged M for fidelity since no key was used.
- Public website data (HTML, not API): /compare/polymarket-vs-kalshi lists 1,197 validated Polymarket-Kalshi matches (2026-10-19); of 230 close matches price-checked only 62 had both prices synced within 60 min; average gap 2c, 10% of gaps >=5c; examples Tiger Woods PGA 16c vs 1c, Anduril US stake 23c vs 30c, Mamdani min wage 14c vs 8c [H]. Prices are Kalshi last trade and Polymarket displayed price; "gaps are before fees and spreads... not executable"; no bid/ask/depth collected [H].

## Trade path
None. Not a venue; no deposits; PayBox/EVM wallet has nothing to sign here [H]. paybox_reachable: no.

## Fees
No fees on the site (free; free account for bookmarks/following traders) [H]. API pricing not published; "limit that fits" per key, pricing NOT FOUND. The fee calculator reproduces venue fees: Kalshi taker 0.07 x P x (1-P) per contract rounded up; Polymarket taker rates vary by category; makers pay nothing by default (read from venue schedules 2026-09-21) [H, compare page].

## Resolution
Not applicable; follows the underlying venues. Key risk for arbitrage: matching is at question level, not rulebook level, so sources, definitions and deadlines can differ across paired contracts [H, compare page]. Match pipeline: embedding similarity -> LLM check -> human validation; only validated pairs served [H, /developers].

## Geo / ToS / automation
Terms (https://predictions.io/terms): "Automated access, scraping, bots, or API usage for any purpose requires the Platform's prior express written consent" (4.4). Using data to inform own financial decisions is permitted; no redistribution or resale of raw or derived data as a standalone product (4.2/4.3) [H]. Age 18+. robots.txt allows major AI crawlers on public pages but disallows /api/, /console/, /mcp, /search [H]. Implication: any automated adapter needs a keyed agreement; scraping the HTML is a ToS breach.

## Liquidity
None of its own. Mirrors Polymarket ($6.4B cumulative volume, 2,917 open) and Kalshi ($2.1B, 4,804 open) as shown 2026-10-19 [H, homepage]. Liquidity shared with Polymarket, Kalshi, Manifold: 100% - not an independent leg.

## Event overlap
Lobbies: US politics, 2028 election, Trump, Elon Musk, Iran/Middle East, economics, global markets, business, crypto, weather, tech-AI, entertainment, science; sports (soccer, NFL, NHL, NBA, CS2, F1, Premier League, FIFA World Cup) [H]. All of this is the Polymarket/Kalshi overlap, which is where arbitrage exists, but we can query those venues directly.

## Why still P2
Value to us = the validated Polymarket<->Kalshi (<->Manifold) match table as a signal/seed for our own market-linking, plus price history. Constraints: key by hand, ToS consent needed, no list endpoint, no depth, 30-120s caching, prices not executable. Our own linking (docs/market-linking-design.md) can replicate it from the venues' public APIs; treat Predictions.io as a cross-check/competitor reference (alongside Prediction Hunt, Oddpool), not a data dependency. Possible action: email for a key and written consent if we want the human-validated match set.

## Sources
- https://predictions.io/ (H, 2026-10-19)
- https://predictions.io/developers (H)
- https://predictions.io/terms (H)
- https://predictions.io/compare/polymarket-vs-kalshi (H)
- https://predictions.io/robots.txt, /sitemap.xml, /llms.txt (H)
- https://predictions.io/api/v1/lobbies unauthenticated 401, https://predictions.io/mcp unauthenticated 405 (H)
- https://chainwire.org/2026/08/28/same-election-question-two-different-odds-predictions-io-launches-free-cross-venue-comparison-tools/ (H)
- Fixtures: docs/research/fixtures/predictions-io/ (api-v1-lobbies-unauth-401.json + headers, developers-page-text.txt, llms-head.txt)

## Open questions
- Success-response fidelity and exact field names (no key). Whether keys are free or priced. Whether the MCP server is public. Who operates it (no entity named). Whether ToS consent is granted for trading-adjacent use.
