# Whales Market Prediction (Whales Prediction)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale. Fixtures: none (no public API found).

## Verdict

adapter_priority: **skip**. Whales Prediction is a trading-terminal aggregator on top of Polymarket and Kalshi, not a venue with its own order book or liquidity. It is a duplicate of venues covered elsewhere (Polymarket, Kalshi). It has no documented API. Its prediction app returned HTTP 503 on every probe today. The "Explorer" page is a UI over other venues' markets.

## What it is

- Whales Market (whales.market) is mainly a pre-TGE token OTC / pre-market platform. Whales Prediction is a second product. (H, https://docs.whales.market/about-whales-market.md)
- Docs describe it as "a prediction market trading aggregator" that "aggregates liquidity and opportunities from multiple prediction markets", naming "leading prediction markets like Polymarket and Kalshi". (H, same URL)
- The launch blog (27 Jan 2026) calls it "the first high-performance trading terminal aggregator built on top of primary prediction market platforms like Polymarket and Kalshi". Features: Explorer (browse/filter thousands of markets by category, volume), Reefboard (up to 8 markets on one screen, pitched at cross-venue arbitrage), Trading Terminal (charts, order book, trade feed, Market and Limit orders), Portfolio (PnL, win rate, tracking other wallets). (H, https://whales.market/blog/introducing-whales-prediction-the-professional-trading-hub-for-prediction-markets/)
- Marketing claims execution improves "1-3% per trade"; no methodology given. (H as a claim, unverified)

## Liveness (2026)

- Blog 27 Jan 2026: "currently in its Private Beta Phase", public launch "scheduled for the end of February 2026". (H, blog URL above)
- Blog index lists later posts through at least 17 Mar 2026 (Whales Market CLI, which is for pre-market tokens, not prediction). Latest prediction-related blog post seen is 10 Mar 2026 (uses Polymarket odds). No post confirming the public launch happened. (H for listing; absence is M)
- Docs link `https://docs.whales.market/whales-prediction` from the blog returns "Page Not Found" (HTTP 200 with a not-found body); the docs llms.txt index has no prediction pages. (H, fetched 2026-10-19)
- `https://whales.market/prediction`, `/prediction/en`, `/prediction/en/explorer`, `/prediction/explorer`, `/prediction/en/markets` all returned HTTP 503 (nginx) on 2026-10-19; the main site `https://whales.market` returns 200. (H) So the product is not confirmed live; it may be down, gated, or retired. Status: **unconfirmed / probably not publicly usable**. still_live recorded as false for that reason (could not confirm).
- WebSearch budget ran out during research, so I could not look for a public-launch announcement or a shutdown notice beyond the blog. Social handle from blog: x.com/whalespredict (not fetched).

## Market model / chains / collateral

- Market model: inherited from the underlying venues (Polymarket CLOB binary/categorical; Kalshi CLOB). Whales does not tokenise outcomes itself. (M, inferred from "aggregator built on top of" wording)
- Chains and collateral: NOT FOUND (searched: blog, docs about page, llms.txt, llms-full.txt grep for predict/polymarket/kalshi). Pre-market product uses multiple EVM chains and LayerZero cross-chain settlement (H, docs index), but that is not shown to apply to prediction.
- How orders are routed to Polymarket/Kalshi (builder codes, own proxy wallets, custody): NOT FOUND. The blog says "all assets stay under the owner's total control" (H as claim), which suggests user-wallet signing on the underlying venue (M).

## Read API

- Official public API for Whales Prediction: NOT FOUND (searched: docs llms.txt and llms-full.txt, blog, about page). Docs have no API section for prediction.
- `https://api.whales.market` exists: `/` returns 404 JSON `{"message":"Cannot GET /",...}` (NestJS style), `/health` returns 200 `{"status":200}`, `/docs` returns 401, `/openapi.json` and `/v1/health` 404. (H) Whales Market CLI blog (17 Mar 2026) suggests an API for pre-market tokens; I did not probe further or confirm any prediction endpoints. Not documented, so treat as unofficial-only/unknown.
- Better source for an aggregator: go to Polymarket and Kalshi directly.

## Trade path / PayBox

- Programmatic order placement through Whales: none documented. NOT FOUND.
- Via PayBox: not reachable through Whales (no API, app 503). The underlying liquidity is reachable directly through the Polymarket (EVM, Polygon, signed orders) and Kalshi adapters covered elsewhere. paybox_reachable = no.

## Fees

NOT FOUND for prediction. Blog gives no fee schedule. Pre-market fees and a $WHALES staking discount exist (H, docs index) but are not shown to apply to prediction. Underlying venue fees would apply (M).

## Resolution

Inherited from underlying venues (Polymarket UMA / Kalshi). Whales does not resolve. (M)

## Geo / ToS / automation

NOT FOUND. No prediction terms page located. Underlying Polymarket/Kalshi geo rules likely apply (M).

## Liquidity

NOT FOUND for Whales itself. No volume/OI/TVL published for prediction as of 2026-10-19. Any liquidity is Polymarket/Kalshi liquidity shared with those venues, so it is NOT an independent arbitrage leg.

## Event coverage

Categories shown in Explorer copy: Crypto, Politics (H, blog), the same as Polymarket/Kalshi markets. Blog posts use Polymarket odds for token FDV/airdrop-timing markets.

## Sources

- https://docs.whales.market/about-whales-market.md (H)
- https://docs.whales.market/llms.txt and https://docs.whales.market/llms-full.txt (H, no prediction pages)
- https://docs.whales.market/whales-prediction (H, page not found)
- https://whales.market/blog/introducing-whales-prediction-the-professional-trading-hub-for-prediction-markets/ (H)
- https://whales.market/blog/ (H, listing)
- https://whales.market/prediction/en/explorer (H, HTTP 503 on 2026-10-19)
- https://api.whales.market/health (H, 200)
- https://predictionindex.xyz/ecosystem (fetch truncated; Whales entry not visible)

## Open questions

- Did the public launch happen (end Feb 2026), and is the 503 an outage, a geo/Cloudflare block, or a shutdown?
- Does the app route orders via Polymarket builder codes or custody user funds?
