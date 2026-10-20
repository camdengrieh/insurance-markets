# Aim Predict (aimpredict.com) - venue spec

Researched 2026-10-19. Read-only. Verdict: **not a venue**. It is a data/analytics site over other venues. Priority: **P2 (signal/metadata only)**.

## Summary
- Live: yes (H). Homepage 200 on 2026-10-19; sitemap lastmod 2026-10-19; npm snap published 2026-06-25, updated 2026-07-23.
- Self-description (H): "Global Prediction Markets One-Stop Market Intelligence Platform". Event pages state "Aim Predict provides data aggregation only" and link out ("Go to Polymarket") to trade.
- Operator/team: NOT FOUND (searched: homepage, footer, npm metadata, web search; no About/Terms/Privacy page, those paths 404). npm repo URL points at a private-looking git host; not followed. Independent coverage: none found (M).

## Market model / chains / collateral
Not applicable, it has no markets of its own (H). It mirrors events from: Kalshi, Polymarket, Opinion, Predict.fun, Gemini, Limitless, Myriad, Futuur, 42.space, Hyperliquid (H, /en-us/platforms). Event pages carry numeric IDs (`/en-us/event/<id>`), options with odds %, volume, 24h change, start/end dates; resolution rules are in a "Rules / Market Info" section whose content was not captured.

## Read API
- Official public API: **none documented**. NOT FOUND (searched: homepage nav/footer, /docs, /en-us/docs, /en-us/api, llms.txt (returns the HTML app shell), robots.txt, sitemap, npm README).
- robots.txt (H) has `Disallow: /api/` for all agents, so the site's internal `/api/*` endpoints must not be scraped. I did not call any.
- Authenticated HTTP MCP + Skill (M, from i18n strings embedded in the public homepage bundle): User Center has "API Keys" ("Create API keys for HTTP MCP access"), "Use your API key as a Bearer token to query Aim Predict prediction market data through HTTP MCP", plus a downloadable agent "Skill". Requires login and key creation, which this research did not do. MCP URL, tool list, rate limits, and terms: NOT FOUND (they are behind login).
- The only other documented endpoint (H, npm README of @aim-predict/snap 0.1.1): `POST {apiBaseUrl}/api/snap/messages` with base `https://www.aimpredict.com`, polled every minute by a MetaMask Snap for wallet-push alerts (price moves, volume spikes, closing). This is a per-user alert feed, not market data, and falls under the robots `/api/` disallow.
- Web pages (HTML, Next.js) are public: /en-us/events, /en-us/platforms, /en-us/event/<id>, /en-us/ranking, /en-us/news. "Trade Dynamics" and "Top Holders" on event pages are login-gated (H). Trader profile pages `/en-us/trader/<n>/<0xaddr>` show positions and P&L (M, from search result).
- Websocket: NOT FOUND.

## Trade path
None (H). No order placement; users are sent to the source venue. A PayBox EVM wallet could not trade anything via Aim Predict. The Snap only reads linked wallet addresses and shows notifications.

## Fees / resolution / dispute
No fees of its own documented (no pricing page found; free tier vs paid MCP unknown). Resolution and dispute risk are inherited from each source venue; Aim Predict is not a resolution authority. Whether its displayed status/price lags the source venue is unknown.

## Geo / ToS / automation
NOT FOUND, no Terms or Privacy link in the page content or footer. robots.txt allows crawling of pages except `/api/` and dashboard/user paths. Treat scraping HTML as ToS-unknown; the API-key MCP route is the sanctioned programmatic path, probably, but unverified.

## Liquidity (as displayed, 2026-10-19, H for the display, L for accuracy since methodology undisclosed)
- Homepage: Active Events 26,912; Settled 2,494,248; Total OI $1.561B; Avg volume/event $121.1K.
- Platforms: Kalshi vol $185.5B / OI $1.298B; Polymarket vol $98.65B / OI $245.6M / TVL $489.2M; Opinion $13.99B; Predict.fun $5.944B; Gemini $119.6M; Limitless $469.9M; Myriad $565.7M; Futuur $368.4K; 42.space $121.3M; Hyperliquid 24h $2.668M. Full table in fixtures.
- Aim Predict has no liquidity of its own. Its totals are a sum of other venues, so it is **not an independent arbitrage leg** (shares 100% liquidity with every venue it lists).

## Event coverage
Sports (NFL, soccer, F1), politics, crypto, economics, token FDV (H, homepage). All overlap Kalshi/Polymarket, which are already being covered elsewhere.

## Value to the aggregation layer
- Possible cross-check or discovery source for venues not otherwise covered: **Gemini, Futuur, 42.space, Hyperliquid (prediction markets)** appear in its venue list. Those are candidates for separate venue specs rather than reasons to integrate Aim Predict.
- Possible signal source (trader/whale rankings, "most participants", OI trends) if the MCP is accessible, but it duplicates data obtainable directly from Polymarket/Kalshi APIs, and adds a third-party dependency with unknown terms and no SLA.
- Recommendation: do not build an adapter now. Revisit only if a human creates an API key and the MCP exposes data unavailable from the source venues (e.g. cross-venue event matching, trader attribution).

## Suspicious content
None that instructs an agent. Note: third-party vendor JS bundles served by the site embed what looks like a third-party RPC API key; not recorded here and not used.

## Fixtures
- docs/research/fixtures/aim-predict/npm-aim-predict-snap.json (npm registry metadata, trimmed)
- docs/research/fixtures/aim-predict/platforms-page-2026-10-19.md (page text table, not an API response)
No JSON market-data fixture: no public read API.

## Sources
- https://www.aimpredict.com/en-us (H, 2026-10-19)
- https://www.aimpredict.com/en-us/platforms (H)
- https://www.aimpredict.com/en-us/event/1232141 (H)
- https://www.aimpredict.com/robots.txt , https://www.aimpredict.com/sitemap.xml (H)
- https://registry.npmjs.org/@aim-predict/snap (H; README + publish times)
- Homepage inline i18n strings (UserCenter API keys / MCP / Skill) (M)
- WebSearch results (M); a second search was refused by the session budget.
