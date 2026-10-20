# Tyki (tyki.app) - venue spec

Researched 2026-10-19. Read-only; unauthenticated GETs only, User-Agent insurance-markets-research/0.1.

## Verdict
Not a venue. Tyki is a free-to-play K-pop fan app (operator: Next Markets Corp.). Its "calls" are fan prediction questions priced by virtual "free tickets"/points with no monetary value. Its separate "Paper Trading" feature is simulated trading whose market data is sourced from Polymarket's public API. Adapter priority: **skip**. Possible P2 only as a very weak "fan sentiment" signal for K-pop questions, and only if a public API existed (none found).

## Liveness (H)
- https://tyki.app returns HTTP 200 on 2026-10-19 (Vercel/Next.js). Calendar page shows October 2026 with 309 calls, live "closes today" items. [H]
- Terms and Privacy "Last updated: June 19, 2026". [H]
- Wikidata Q140242364: "free prediction market simulation app for iOS", inception 2026, US, App Store id 6776554358, zero references. [H for what Wikidata says; reliability of Wikidata M]

## Kind and market model
- Kind: forecasting-nonmoney. Terms s.3: "100% mock investment/prediction simulation where betting using real cash or cryptocurrency is strictly prohibited. Virtual points ... have no actual monetary value and cannot be exchanged, transferred, or sold". [H https://tyki.app/terms]
- Calls: mostly binary Yes/No questions, some multi-outcome (e.g. "DEADLINE holds pre-save crown over ILLIT, LE SSERAFIM, aespa?"). Percentages are "the price fans set with free tickets", i.e. a fan-driven price, described as "not an official result or betting odds". Book vs AMM vs parimutuel mechanism: NOT FOUND (searched: llms.txt, terms, privacy, calls/calendar HTML). [H https://tyki.app/llms.txt]
- Paper Trading: simulated buy/sell orders on prediction markets using virtual points; fills depend on liquidity of underlying third-party data; seasons reset balances. [H terms s.4.1, 4.4, 4.5]
- Leaderboard ranks fans "by profit from their calls"; Prizes section exists (content not server-rendered; /prizes is disallowed in robots.txt). Prize mechanics NOT FOUND.

## Chains / collateral
None. No chain, token or wallet. Virtual points only. [H terms s.3]

## Read API
- No public documented API. NOT FOUND (searched: tyki.app/llms.txt, robots.txt, sitemap.xml, site footer links, tyki.app/api, docs paths). No developer docs, no GitHub org found (web search budget was exhausted, so GitHub/App Store search not done).
- Backend appears to exist at https://api.tyki.app/ and https://tyki.app/api/calls; both return HTTP 401 `{"success":false,"data":null,"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}}` to unauthenticated GET. Fixture: docs/research/fixtures/tyki/api-root-401.json. [H] This is the mobile app's private API; auth scheme unknown. Terms s.7 prohibits bots/scripts and reverse engineering, so do not probe further.
- Public data is only scrapable HTML (calls inside /calendar server-rendered, ~1.9MB); scraping would conflict with ToS s.7 and the output is non-money fan sentiment.
- WebSocket: NOT FOUND.

## Trade path
None programmatically. Points-only, iOS app (Android mentioned in Privacy policy). PayBox/EVM wallet: **no** - nothing on-chain to sign or transact.

## Fees
None (free). NOT FOUND for any rake on prizes.

## Resolution
Operator-resolved ("questions resolved" push notifications; Privacy s.5). Resolution source/dispute process NOT FOUND. Calls name sources such as Billboard/Spotify charts and member social posts.

## Geo / ToS / automation
- Prohibited: "Using automated tools, bots, or scripts to interact with the Service or community features"; reverse engineering; multiple accounts; coordinating predictions. [H terms s.7]
- Public profiles show P&L/ROI. Contact only via Instagram DM @tyki.prediction. Geo restrictions NOT FOUND. Min age 13 (privacy s.8).

## Liquidity
Zero real liquidity. No volume/OI/TVL. Fan "ticket" volume NOT FOUND.

## Overlap / shared liquidity
- Event categories: K-pop comebacks, chart positions (Billboard 200, Spotify), awards (2026 MAMA Awards, Nov 20-21), tour/stage moments. Real-money venues rarely list these; any overlap would be with Polymarket/Kalshi music-chart markets, but Tyki prices are fan-set and not tradable.
- Paper Trading data is sourced from Polymarket via public API (Privacy s.3, Terms s.4.2). Those prices are a copy of Polymarket, so NOT an independent leg. [H https://tyki.app/privacy]

## Sources
- https://tyki.app , /calls , /calendar , /leaderboard (200 on 2026-10-19) [H]
- https://tyki.app/llms.txt (saved: docs/research/fixtures/tyki/llms.txt.head) [H]
- https://tyki.app/terms , https://tyki.app/privacy (both dated June 19, 2026) [H]
- https://tyki.app/robots.txt , /sitemap.xml [H]
- https://api.tyki.app/ and https://tyki.app/api/calls (401) [H]
- https://www.wikidata.org/wiki/Q140242364 [M]

## Suspicious content
None found. llms.txt contains only descriptive text plus a guidance line asking to cite percentages as "Tyki fan predictions" (benign, not followed as an instruction; noted).
