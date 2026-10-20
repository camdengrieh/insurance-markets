# OpinionKings (Opinion Kings Inc) - venue spec

Researched 2026-10-19. Verdict: adapter_priority **skip** (play-money simulation, no public API, no tradable money). At most a social-sentiment signal.

## Summary
- Live: yes. opinionkings.com returns 200, sitemap lastmod 2026-10-19, ~3,222 market URLs in sitemap-markets.xml. [H]
- It is a "play-money simulation": users get virtual credits (homepage: $10,000 start), "takes no deposits and pays out no cash". [H] https://opinionkings.com , https://opinionkings.com/simulation-disclosure/ (updated 2026-06-02)
- Not a regulated venue; operator says it is not a broker-dealer, exchange or regulated trading venue; credits cannot be redeemed or transferred. [H]
- The brief's "App Store release 19 Aug 2026" was NOT verified (about page and homepage do not mention apps; web search budget was exhausted). [L]

## Market model
- Shares pay 1.00 (100 credits) if winning, 0 if losing -> binary-style YES/NO shares. [H] https://opinionkings.com/help/markets/ and a market page https://opinionkings.com/market/OKNWNbSmuIxTJ/
- Market orders "execute at the current market price unless a limit order is placed"; limit orders rest until filled/cancelled/close; "Cash Out" sells whole position. Whether it is an order book or an AMM is NOT stated (a help page says orders "fill at once or not at all"). [H for text, mechanism unknown]
- Simulation Disclosure says prices "may be illustrative, delayed, synthetic, or simplified". Prices are therefore not reliable market data. [H]
- Categorical/scalar support: NOT FOUND (searched: help/markets, one market page). Market page did not expose outcomes/prices to the fetch tool (client-rendered).
- Categories seen in sitemap/site: politics, sports, finance, technology, commodities, companies, crypto (title only), entertainment-style (e.g. Victoria's Secret Fashion Show market). [H/M]

## Chains and collateral
None. No chain, no token, no wallet. Collateral is virtual credits. [H]

## Read API
- Exists as a private first-party backend: https://api.opinionkings.com . Root returns `{"msg":"OpinionKings API."}`, /health returns `{"status":"ok"}`. [H, fixtures api-health.json]
- Swagger UI at https://api.opinionkings.com/docs/ but the embedded OpenAPI doc is a template with `"paths": {}` and server `http://localhost:3000` -> nothing documented. [H, fixture api-docs-swagger-init-empty-paths.js]
- `GET /api/markets` returns HTTP 401 `{"success":false,"message":"Access denied. No token provided."}` -> token (user session) required. [H, fixture api-markets-unauth-401.json] Token acquisition would need account sign-up, which was out of scope (not attempted).
- Websocket: site CSP lists `wss://api.opinionkings.com`, so a websocket exists for the web app. [H] Protocol not documented.
- Public unauthenticated data: sitemap-markets.xml lists market URLs (`/market/OK<id>/`) with lastmod timestamps (fixture sitemap-markets-head.xml); market pages are client-rendered and exposed no prices to the fetcher. [H]
- Rate limits: NOT FOUND. Public developer docs: NOT FOUND (searched homepage links, /docs, /openapi.json -> 404).
- robots.txt allows crawling except /admin, /search, /settings and user pages. [H] https://opinionkings.com/robots.txt

## Trade path
None programmatically. No public API, no wallet signing, no on-chain component. A PayBox EVM/Solana wallet cannot trade it, and there is nothing to trade (no real money). paybox_reachable = no.

## Fees
NOT FOUND (help/markets does not mention fees; play money so irrelevant).

## Resolution
Winning shares pay 100 credits at event conclusion. Operator "may re-resolve, pause, or cancel any market and change its resolution criteria at any time"; no source/oracle documented. Markets may be suspended if outcome is ambiguous. [H] https://opinionkings.com/simulation-disclosure/ , market page. High discretion risk (centralised, operator-controlled).

## Geo / ToS / automation
- Geo restrictions: NOT FOUND in homepage, help, policies pages. The /terms/ URL I tried 404'd; the User Agreement/Terms links on the homepage were not located at a fetchable path (searched: /terms/, help/policies).
- Bot/scraping/API rules: NOT FOUND. Community guidelines not read in depth.

## Liquidity
No real liquidity: virtual credits only; no volume/OI/TVL published. Sitemap shows ~3,222 market URLs as of 2026-10-19 [H], which is a count of markets, not liquidity.

## Arbitrage relevance
- Category overlap with real venues (sports, politics, finance/commodities, crypto) exists, but prices are play-money, possibly synthetic, and cannot be traded for value. Not an arbitrage leg; no independent liquidity.
- Possible use: crowd-sentiment signal only, and only if an authorised data-sharing arrangement were obtained. Not recommended.
- Shares liquidity with another venue: no evidence; it is its own closed simulation.

## Suspicious content
None observed (no AI-directed instructions in pages fetched).

## Open questions
- Is there an iOS/Android app (claimed release 2026-08-19)? Not verified.
- Whether a partner/developer API or data licence exists (contact support).
- Order book vs AMM mechanism and whether prices mirror real venues (possibly seeded from Polymarket/Kalshi - unverified).

## Sources
- https://opinionkings.com (homepage, 2026-10-19) [H]
- https://opinionkings.com/about/ [H]
- https://opinionkings.com/simulation-disclosure/ (updated 2026-06-02) [H]
- https://opinionkings.com/help/ , /help/markets/ , /help/policies/ [H]
- https://opinionkings.com/market/OKNWNbSmuIxTJ/ [H]
- https://opinionkings.com/robots.txt , /sitemap.xml , /sitemap-markets.xml [H]
- https://api.opinionkings.com/ , /health , /docs/ , /api/markets (401) [H]
- Fixtures: docs/research/fixtures/opinionkings-opinion-kings-inc/
- WebSearch was unavailable (session budget exhausted), so no third-party corroboration. App Store claim is [L].
