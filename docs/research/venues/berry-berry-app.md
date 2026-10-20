# Berry (berry.app) - venue spec

Researched 2026-10-19. Verdict: skip. Berry is a consumer broker/front-end whose prediction-market leg is Polymarket (M, third-party review). It is not an independent venue and has no public API.

## Status and kind
- Live: yes. berry.app returns 200 (title "Berry: Invest in Stocks From $1, Zero Commission"); berryinvesting.com redirects to it. H, https://berry.app/ (fetched 2026-10-19).
- iOS app listing shows v3.6.0 released "2d ago" at fetch time, v3.5.0 on Sep 21, copyright 2026, developer Berry Tech Inc. H, https://apps.apple.com/us/app/berry/id6477979345
- Prediction markets added in iOS v2.0.0 (2025-07-16). H, same App Store page.
- Kind: mobile-first retail broker/front-end. Stocks and ETFs via Alpaca Securities LLC (SIPC member). Crypto and prediction markets "offered through regulated third-party partners, not by Alpaca". H, berry.app disclosures.
- Funding: seed round from Morgan Creek, Coinbase (Coinbase Ventures, Base Ecosystem Fund), SGV and Ripio. H, berry.app. Site says funding with stablecoins or local currency (M, search snippet of berry.app).

## Underlying prediction-market venue
- Polymarket, per a third-party product page claiming a "direct partnership with Polymarket". M, https://polymark.et/product/berry (page did not mention a builder code or an API). Berry's own site does not name Polymarket in the text I extracted (NOT FOUND on berry.app).
- Therefore: markets, order books, resolution (UMA via Polymarket) and liquidity are Polymarket's. Berry is NOT an independent arbitrage leg. It is covered by the parallel Polymarket workflow.
- Which Polymarket (global vs US) Berry routes to: NOT FOUND (searched: berry.app, App Store page, polymark.et listing). The audience is global/LatAm (App Store languages EN/PT/ES, a review mentions Argentina), so likely the global/crypto side. L.

## Market model, chains, collateral
- Inherited from Polymarket (binary/categorical CTF outcome tokens on a CLOB, USDC on Polygon). M, inferred. Berry's own chain/custody model: NOT FOUND (searched: berry.app, App Store, robots.txt, /docs, /terms - the last two are 404).

## Read API
- None documented. No docs site (docs.berry.app does not resolve; berry.app/docs is 404). robots.txt has `Disallow: /api`, which implies some internal API exists, but nothing is public. H, https://berry.app/robots.txt
- No fixtures saved (nothing to sample). Use Polymarket's public Gamma/CLOB APIs for the same data.

## Trade path
- None programmatic. Retail app only (iOS/Android; AppsFlyer onelink deep link in the site header). Not reachable via PayBox transaction proposals or signed orders, because Berry holds the account (custody model NOT FOUND). To trade the same markets, use Polymarket directly.

## Fees
- Marketing says "zero commission". The App Store listing says "fees may apply". A comparison blurb says Polymarket's own fees vary by order type. The fee schedule is NOT FOUND (searched: berry.app, App Store). Spread or markup on prediction markets is unknown. M/L.

## Resolution
- Inherited from Polymarket. Dispute risk is Polymarket's, plus Berry's custodial and partner risk.

## Geo, ToS, automation
- Site says "invest in the United States from anywhere"; no country list or prediction-market restrictions published (NOT FOUND). Terms page: NOT FOUND (berry.app/terms is 404). No automation or API terms.

## Liquidity
- No venue-level volume or OI published (NOT FOUND). Berry's flow, if any, lands on Polymarket's book.

## Event overlap
- Everything overlaps Polymarket by construction. Zero independent edge.

## Adapter priority
- skip. No API, shared liquidity, custodial retail front-end.

## Open questions
- Does Berry expose any public or partner API? Is it a Polymarket builder-code integrator? Which Polymarket exchange does it route to? None of these affect the aggregator unless Berry adds its own markets.

## Sources
- H https://berry.app/ (fetched 2026-10-19)
- H https://berry.app/robots.txt
- H https://apps.apple.com/us/app/berry/id6477979345
- M https://polymark.et/product/berry (third-party directory)
- Search result listing of Google Play entry (com.anonymous.berry) seen, not read. Web search budget was exhausted before further checks.

## Suspicious content
- None observed.
