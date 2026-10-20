# Leverate prediction markets platform (venue spec)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary/trade-press source; M = secondary/inferred; L = weak/stale.

## Verdict
Not a venue. It is a B2B white-label software product sold to FX/CFD brokers (kind: vendor platform). No public market list, no public API, no chain, no documented independent liquidity. Each broker deployment would be a private, closed, off-chain book. Nothing for an aggregator to adapter against. adapter_priority: skip.

## Still live?
- Product page https://leverate.com/prediction-markets-white-label/ returns HTTP 200 on 2026-10-19 (H, curl).
- Finance Magnates 2026-02-24: "officially launched"; unveiled at iFX EXPO Dubai (Feb 10-12 2026) (H).
- Finance Magnates 2026-04-14: hybrid AMM engine (LMSR pricing + CLOB execution) added (H). Article does not confirm any specific live market or named broker client (H).
- No named broker customer, no consumer-facing branded deployment found (searched: WebSearch extended x3, FM, TradeInformer, FXNewsGroup, Leverate blog). Product live as software for sale: yes. Any public market running on it: NOT FOUND.

## Market model (H for vendor claims, all unverified marketing)
- Yes/No (binary) trading, "Buy Yes/No with a single tap"; categories sports, crypto, politics, finance, entertainment; operator-created markets plus templates (elections, economics, weather) (H, product page).
- Engine: hybrid AMM = LMSR pricing + central limit order book; limit and market orders, depth ladder, bid/ask spread (H, FM 2026-04-14 and product page). Vendor-stated self-balancing: fair value recomputed after each trade, price grid rebalances, large-trade protection layer, automatic capital limits (H as vendor claim).
- Outcome tokenisation: NOT FOUND (searched: product page, FM x3, Leverate blog). Presumably internal ledger positions, not tokens (M, inferred from "no external oracles", MT4/MT5 integration, no chain mention).

## Chains and collateral
NOT FOUND (searched: product page, FM articles, Leverate guide). No blockchain mentioned anywhere. Leverate states it does not hold client funds; broker handles funds (H, Leverate guide). Likely fiat/broker-account balances (M).

## Read API
- exists: none (no public API). Leverate guide says only that "API connectivity is available with dedicated technical support and typical go-live timelines of two to four weeks" for MT4/MT5 or proprietary broker platforms (H). That is a B2B integration for the broker, not a market-data feed. No docs, endpoints, auth or rate limits published.
- Probed: developers.leverate.com (no DNS), docs.leverate.com (TLS reset), api.leverate.com (timeout); GitHub repo search "leverate prediction" returned nothing. NOT FOUND (searched: those hosts, gh search, WebSearch for docs/github).
- Websocket: NOT FOUND.
- Fixtures: none saved (no public API to sample).

## Trade path
None programmatically for third parties. Trading happens inside a broker's branded front end under that broker's KYC/account. No wallet, signing or order API documented.

## PayBox reachability
no. No on-chain contracts or signed-order scheme; accounts are broker KYC accounts. A PayBox EVM/Solana wallet cannot trade it via transaction proposals or signed orders.

## Fees
Operator-configurable "fee structure and rules", spreads, transaction fees, market creation fees (H, product page). Formula NOT FOUND. Leverate claims brokers earn 15-25% additional revenue (vendor claim, unverified). Pricing of the SaaS itself undisclosed.

## Resolution
Admin-dashboard resolution by the broker/operator; "no reliance on external oracles"; "brokers maintain full control over outcomes" (H, product page + guide). Dispute risk: high and centralised: operator is counterparty/market maker and resolver, no independent dispute process documented. Regulatory classification (e.g. binary-options concerns in Europe) is left to brokers (H, FM).

## Geo / ToS / automation
Leverate is a technology provider, not a broker; legality depends on the markets and jurisdictions the broker serves (H, product page). Automation rules for end users are set per broker; none published. Not applicable to a public scanner.

## Liquidity
No volume, OI or TVL for the product anywhere (NOT FOUND). The "$702M+ daily volume" on the page is industry-wide prediction market volume, not Leverate's (H, product page). "450+ clients / 19 years" refers to Leverate's broker-tech business overall (H). Treat as zero known liquidity.

## Event overlap and shared liquidity
Categories (sports, politics, crypto, finance) would nominally overlap Polymarket/Kalshi, but each broker instance is an isolated book with operator-set prices (LMSR-driven) and no public access, so no usable arbitrage leg. Shared liquidity with another venue: none stated; no Polymarket/Kalshi liquidity linkage mentioned (a related FM piece names Kalshi/Polymarket only as competitors/context).

## Competitive context (M)
Similar broker white-label products: Devexperts (DXtrade/DXmatch, Nov 2025), Match-Trader. Same conclusion applies: B2B software, not venues.

## Adapter recommendation
skip. Revisit only if a named broker launches a public, API-exposed market on Leverate and publishes a feed. Signal-only use would need that broker's own API.

## Suspicious content
None observed in fetched pages (no instructions aimed at AI agents).

## Sources
- https://leverate.com/prediction-markets-white-label/ (H)
- https://www.financemagnates.com/forex/technology/leverate-opens-prediction-markets-platform-to-brokers-as-sector-volumes-hit-records/ (H, 2026-02-24)
- https://www.financemagnates.com/forex/leverate-bundles-automated-market-maker-with-order-matching-for-white-label-prediction-markets/ (H, 2026-04-14)
- https://leverate.com/blog/article/market-prediction-software-guide-for-brokers-2026/ (H)
- WebSearch result listings: tradeinformer.com, fxnewsgroup.com, tradingview.com FM syndications (M, snippets only)
