# Raven (prediction-market market maker) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
Not a venue. Raven is a proprietary HFT market maker / liquidity provider that quotes on more than 10 prediction-market venues. It has no public API, no market data, no order flow an aggregator can integrate. adapter_priority = skip. Value to the project is as (a) a market-intelligence lead on which venues are well-quoted, and (b) a hint that cross-venue price gaps are being arbitraged by professionals on Kalshi/Polymarket/Limitless/Gemini/Predict.fun/Backpack.

## Still live?
Yes (H). Company site https://raven-trading.com/ (redirect from ravendao.net, the URL listed on Hack VC's portfolio page) loads; newsroom has an announcement dated 2026-10-03. casino.org dated the funding report 2026-09-29/30, the company post is dated 2026-10-03 (date mismatch in sources, unresolved; the casino.org piece being earlier than the company post is odd, treat exact dates as M).

## Kind and market model
- Kind: proprietary trading firm / market maker (H, raven-trading.com). "next generation algorithmic high-frequency trading firm that is focused on long-lasting partnerships".
- No market model of its own; it quotes binary outcomes on third-party venues (H, /prediction-markets: "quotes binary outcomes across hundreds of concurrent markets"). Quotes both CeFi and DeFi venues (on-chain order books, RFQ, AMMs).
- Founded 2023; entered prediction markets Q2 2025; first venue-launch partnerships live Q4 2025 (H, company blog).
- People: CEO Petar Kostov, CTO Yuriy Myronovych, both ex-Wintermute (H, company blog). Offices/hiring: Milan and Sofia (H).
- Funding: strategic round from Coinbase Ventures and CMCC Global at US$90M pre-money, size undisclosed; 2024 seed US$2.7M led by Hack VC with Wintermute Ventures (H company blog; M casino.org for seed amount).

## Venues it quotes on (H, raven-trading.com/prediction-markets and /prediction-market-launches)
- Exclusive anchor market maker for launches: Gemini Predictions, Predict.fun, Backpack Predictions.
- One of several MMs on: Kalshi, Polymarket, Limitless, "and others". Company blog: "more than 10 prediction-market venues".
- /venue-coverage names no prediction-market venues (only CeFi/DeFi crypto venues like Binance, Hyperliquid...), so the venue list above comes from the two prediction pages.
- Implication: Gemini Predictions and Backpack Predictions are candidate venues not on the already-covered list; worth a separate spec if not already queued. Predict.fun, Kalshi, Polymarket, Limitless are covered by the parallel workflow.

## Chains and collateral
NOT FOUND (searched: raven-trading.com home, /prediction-markets, /prediction-market-launches, /venue-coverage, /newsroom, company blog). No wallet addresses or on-chain identity published (H, newsroom page check).

## Read API
exists = none. No docs, no API mentioned (H: /docs and /api return 404; home, newsroom list no API). No GitHub org found for "raven-trading" (gh search returned 404). No public subgraph or contract. Raven's quotes can only be observed indirectly as resting orders on the venues it quotes, with no identity attribution.
- Base URLs: none. Docs URL: none (company site https://raven-trading.com/ only).

## Trade path
None. Raven does not accept orders from third parties. Nothing to place via PayBox. Its venues are individually reachable (Polymarket/Limitless/Predict.fun on EVM chains, Kalshi off-chain) but that belongs to those venue specs. paybox_reachable = no.

## Fees
Not applicable. Raven publishes no fee schedule (NOT FOUND, searched: site pages above). Raven's economics are spread capture and launch-partnership terms ("defined depth, spread, and uptime commitments" - H, /prediction-market-launches); venue maker rebates/incentives are NOT FOUND.

## Resolution mechanism
Not applicable: resolution is per underlying venue. Raven says it coordinates oracle and settlement integration with launching venues (H).

## Geo / ToS / automation
NOT FOUND (no ToS applicable to a non-service). Raven says it trades around the clock across US, APAC and EEA (H, company blog). Site has no terms for data use; privacy policy only (ravendao.net/legal-page/privacy-policy, not read).

## Liquidity
Raven publishes no volume, OI or inventory figures (H: "Raven publishes no volume or contract figures of its own"). Disclosed: more than 3,000 contracts quoted, hundreds of concurrent markets (H, company blog, 2026-10-03). Sector context from Raven's blog: about US$30B cleared in April 2026, over US$50B in one month around the World Cup, vs about US$44B for all of 2025 (M, company's own claim, unsourced).

## Category overlap (arbitrage relevance)
Politics/elections, sports (Kalshi reports ~90% of its volume is sports - M, cited on Raven's FAQ), economics (rates, inflation, jobs), crypto prices/protocol milestones, entertainment, weather, commodities, breaking news (H). Heavy overlap across Kalshi/Polymarket/Limitless/Predict.fun/Gemini/Backpack. Because one pro MM quotes many venues simultaneously, cross-venue gaps in sports/crypto/macro are likely narrow and short-lived; expect tight edge, speed-sensitive.

## Shared liquidity
Raven is an inventory/liquidity source across many venues, not a venue. Not an independent leg. On Gemini Predictions, Predict.fun and Backpack as exclusive anchor MM, a large share of book depth may be Raven's, so those books are correlated with Kalshi/Polymarket quotes from the same quoter (M, inference).

## Suggested use for the aggregator
- Do not build an adapter. Optionally track a "known pro MM present" flag per venue (from this page, M).
- Possible signal: a venue launched with Raven exclusive anchor liquidity has artificially thin competing quotes early on; reasonable to haircut apparent depth.
- Re-check for a Raven public data product or API in 3-6 months.

## Suspicious content
None found. Site footer contains a hex string decoding to "im a teapot" (Easter egg, not an instruction). No agent-targeted instructions seen.

## Not found
Chains/collateral; any API/docs; fee schedule; ToS; wallet addresses; volume/OI; venue list beyond the 6 named; Raven GitHub org; independent confirmation of the funding date; /partnership page content (fetch returned only the word "Partnership").

## Sources
- https://www.casino.org/news/coinbase-cmcc-invest-in-prediction-market-liquidity-provider-raven-at-90m-valuation/ (H, read 2026-10-19; reports 2026-09-29, updated 09-30)
- https://raven-trading.com/ (H)
- https://raven-trading.com/prediction-markets (H)
- https://raven-trading.com/prediction-market-launches (H)
- https://raven-trading.com/venue-coverage (H)
- https://raven-trading.com/newsroom (H)
- https://raven-trading.com/blog/raven-raises-strategic-funding-from-cmcc-global-and-coinbase-ventures-for-prediction-markets (H)
- https://hack.vc/portfolio/ravendao-3b3a3 (H; "Raven DAO provides liquidity across DeFi protocols, blockchains and centralized exchanges")
- https://www.gemini.com/es/cryptopedia/the-role-of-market-makers-in-prediction-markets (H; does not mention Raven)
- Limitation: the WebSearch budget was exhausted for this session, so no independent third-party search corroboration was done; page contents were summarised by WebFetch's small model, not read verbatim (treat quotes as M-H).
