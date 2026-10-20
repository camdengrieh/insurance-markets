# MidasAI (midasai.trade) - venue spec

Researched 2026-10-19. Verdict: NOT a venue. A closed-source, $10,000 lifetime-licence trading bot that trades on Polymarket and Kalshi. Adapter priority: **skip**.

## Summary
- [H] Site is live (HTTP 200 on 2026-10-19; robots.txt "Last updated: 2026-04-18"; footer "(c) 2026"). Wikidata Q138945830 describes it as "Automated trading infrastructure for Polymarket & Kalshi prediction markets", inception 2025.
- [H] It is a commercial software product: "one-time $10,000 USD lifetime licence", runs locally, "works with any funded Polymarket and Kalshi account" (llms.txt, homepage).
- [H] It has no markets, no order book, no AMM, no settlement, no token, no contracts of its own. All liquidity is Polymarket (Polygon) and Kalshi (CFTC-regulated). It is therefore NOT an independent arbitrage leg and not a data source.
- [H] No public API or docs. https://midasai.trade/api and /docs return a generic "This Page Does Not Exist" page. robots.txt disallows /api/. No GitHub repo found.
- [M] Performance claims ($812K+ profit, 46,118 trades since Oct 2025, "Wintermute Research confirmed", wallet case studies) are self-published and unverified. I found no independent review or audit. Treat as marketing.

## Kind and market model
- kind: bot-vendor (software licence). Not exchange, aggregator or data API. The discovery tag "aggregator-or-data" is wrong.
- Market model: N/A. It trades Polymarket short-duration BTC/ETH/SOL Up/Down markets (5-15 min) and Kalshi event/weather markets [H, llms.txt].

## Chains and collateral
- Own: none. Via Polymarket: Polygon, USDC. Via Kalshi: USD (off-chain, API keys) [H, homepage FAQ].

## Read API
- exists: none.
- news.midasai.trade ("News Market") is a separate news-feed aggregator page (Polymarket, Kalshi, CoinDesk, etc.; refreshes every 5 min) [H]. Its only visible API call is a CoinGecko price call. It is not a market-data source.
- Best-effort rate limits/websocket: NOT FOUND (searched: homepage, llms.txt, robots.txt, /api, /docs, news subdomain, web search).

## Trade path
- None as a venue. The product is a local desktop bot that uses the user's own Polymarket wallet key and Kalshi API keys [H, FAQ: "private key never leaves your device"]. It is not callable from PayBox; no transaction proposals or signed orders for MidasAI exist. Any trading would go through the underlying Polymarket/Kalshi adapters (covered elsewhere).
- Buying a licence ($10,000 via Stripe/PayPal/BTC/ETH/USDC/wire) is out of scope and was not attempted.

## Fees
- Licence $10,000 one-off, "no revenue share" [H]. No venue fees of its own; underlying venue fees apply.

## Resolution
- N/A; inherited from Polymarket (UMA optimistic oracle) and Kalshi (CFTC-regulated, exchange-resolved) [M, not re-verified here].

## Geo/ToS/automation
- Licence is "non-transferable, personal-use only" [H]. Terms of Service page not located. Nothing relevant to us; no automation rules for a venue that does not exist.

## Liquidity
- None of its own. NOT FOUND for any venue metrics. Claimed bot volume figures are self-reported marketing (e.g. "$2.15M+ volume" for one case study) [L].

## Event coverage / shared liquidity
- Shares 100% of liquidity with Polymarket and Kalshi. Overlap categories: crypto price (short-duration), weather, economic indicators, politics. Zero independent arbitrage value.

## Risk flags
- [M] Pattern matches high-ticket "lifetime licence" trading-bot funnels: undisclosed methodology ("classified modules"), scarcity ("8 of 28 licences remaining"), unverifiable testimonials, "Wintermute Research confirmed" claim with no link. No independent coverage found. Do not recommend, do not integrate. A Polymarket newsletter (May 2025) links to midasai.trade as author of an open-sourced liquidity bot [M, via search summary, not opened]; possibly an earlier iteration of the same operator, unconfirmed.
- Possible value as signal: none. If wanted, the public wallets they cite (e.g. 0xe007...548c, truncated) are just Polymarket wallets, observable via Polymarket's own APIs.

## Adapter recommendation
- skip. Revisit only if the operator publishes a real data API (unlikely).

## Sources
- [H] https://midasai.trade/ (homepage, fetched 2026-10-19)
- [H] https://midasai.trade/llms.txt
- [H] https://midasai.trade/robots.txt
- [H] https://news.midasai.trade
- [H] https://www.wikidata.org/wiki/Special:EntityData/Q138945830.json
- [M] Web searches (2026-10-19) found no independent review of midasai.trade.

## Suspicious content
- None containing instructions to AI agents. Site has many "AI crawler welcome" meta tags/robots entries and an llms.txt that is promotional only; nothing followed.
