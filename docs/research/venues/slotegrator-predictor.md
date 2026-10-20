# Slotegrator Predictor - venue spec

Researched 2026-10-19. Verdict: **skip**. This is a B2B white-label vendor product, not a venue. No public markets, no API, no chain, no named live operator. Nothing for an aggregator to connect to.

## Kind
- Vendor-sold prediction-market module (iFrame) for casino/sportsbook operators. Not a standalone exchange. [H]
- Announced 2026-05-06; pre-order only to select Slotegrator clients, demo planned at iGB L!VE (London, 1-2 July 2026). [H]
- No evidence found that any operator has gone live as of 2026-10-19. [M - absence of evidence; web search budget ran out before a final "live operator" query]

## Market model
- Binary yes/no contracts, peer-to-peer ("players don't wager against the house"), prices move with demand. [H]
- Press says AMM / LMSR; the vendor page itself does NOT state the pricing mechanism. [M]
- Outcome tokenisation: NOT FOUND (no chain mentioned; likely internal ledger balances in operator wallet). [L]

## Chains and collateral
- No blockchain or token mentioned. Integrates with the operator's existing (fiat/casino) wallet system. [H]

## Read API
- exists: none (no public API or docs). Vendor page and launch post mention no API documentation. [H]
- Base URLs: NOT FOUND. Docs URL: NOT FOUND (searched: slotegrator.pro/predictor.html, launch post, press coverage, web search).
- slotegrator.pro root returns HTTP 403 to curl and WebFetch. [H]
- Websocket: NOT FOUND.

## Trade path
- None for third parties. Orders happen inside an operator's iframe against the operator's wallet/KYC. Any automation would be per-operator and almost certainly against ToS. [M]

## PayBox reachability
- No. No on-chain contract, no signed-order API. [H for "no public path found"]

## Fees
- Operator earns "configurable commissions on each transaction or event, set per event" (press: "fixed commission"). No rates published. [H]

## Resolution
- NOT FOUND (not described on product page, launch post or press). Presumably operator-controlled, so dispute risk sits with each operator. [L]

## Geo / ToS / automation
- Product does not cover licensing; operators need their own event-contract licence (MyGamingLicense guide). Site footer lists API certification for Lithuania and Georgia plus IoM/SIQ certificates, not clearly tied to Predictor. [M]

## Liquidity
- Vendor claims "$2B+ monthly market volume" on the product page; unverified, no date, no named customers, and it conflicts with the absence of any live deployment. [L]

## Event overlap
- Operators can create any category (sports, politics, crypto, entertainment). Overlap with other venues is theoretical only. [H for claim, nothing live]

## Shared liquidity
- Not stated. Each operator presumably runs isolated P2P/AMM pools. Not an independent arbitrage leg either way.

## Adapter priority: skip
No public markets, API or chain. Revisit only if a specific operator launches a branded Predictor site with a public data feed.

## Fixtures
None saved (no public API).

## Suspicious content
None observed.

## Sources
- https://www.mygaminglicense.com/blog/an-operators-guide-to-the-prediction-market-boom (2026-04-24; one line: "Slotegrator opened pre-orders for Predictor") [H]
- https://slotegrator.pro/predictor.html (product page, marketing) [H]
- https://slotegrator.pro/gambling_news/we-introduce-predictor-by-slotegrator/ (launch post, 2026-05-06) [H]
- https://www.thegamblest.com/slotegrator-launches-prediction-market-engine-predictor/ (2026-05-08) [H]
- https://next.io/news/b2b-news/predictor-by-slotegrator-a-prediction-market-engine-for-igaming-brands-available-for-pre-order/ , https://eegaming.org/latest-news/2026/05/05/138562/predictor-by-slotegrator-a-prediction-market-engine-for-igaming-brands-available-for-pre-order/ , https://www.infoplay.info/en/2026-05-12/slotegrator-launches-predictor-a-prediction-markets-solution-for-casino-and-sportsbook-operators/35809/new/ , https://focusgn.com/slotegrator-bringing-prediction-market-engine-to-igb-lve (search results only, not read) [M]
- https://slotegrator.pro/ -> HTTP 403 [H]
