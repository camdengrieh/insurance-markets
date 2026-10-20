# Trading Technologies (TT) prediction-market connectivity - venue spec

Researched 2026-10-19. Read-only: public WebFetch of TT / PR Newswire pages only. No account, key, signing or non-GET. Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale. WebSearch was unavailable (session search budget exhausted), so discovery relied on direct page fetches.

## Verdict

- **Company is live (H); the prediction-market feature is announced, not shown live (H/M).** Trading Technologies (TT) is an active institutional EMS/OMS vendor with press releases through 2026-10-01 (H, https://www.prnewswire.com/news/trading-technologies/).
- **Not a venue.** TT is a broker-grade front-end / execution-management platform that will route orders to Kalshi and OG.com (Crypto.com / North American Derivatives Exchange). It has no markets, order book, outcome tokens or liquidity of its own. It is **never an independent arbitrage leg** (every leg is Kalshi or OG.com liquidity). (H, releases below)
- **No public API, no public data, no retail path.** The TT APIs are licensed institutional products (.NET SDK, C++ Core SDK, FIX order routing, FIX market data, REST API for administration only). No prediction-market API docs exist in the public TT library. (H, https://tradingtechnologies.com/trading/apis/)
- **Adapter priority: skip.** Reason: duplicate liquidity (Kalshi and OG.com are the real venues; Kalshi is covered by another workflow, OG.com has its own notes), a gated commercial API, and no wallet/crypto path. Value to the project is as a **market-structure signal** (institutional adoption), not as an adapter.

## What was announced (all H unless noted)

| Date | Item | Source |
|---|---|---|
| 2026-06-17 | "Trading Technologies to Enter Prediction Markets with Support for Trade Execution on Kalshi". Kalshi first of "several"/"many" US-regulated prediction markets. Kalshi trading **expected live Q3 2026**. Clients get TT execution and algo tools. Connectivity protocol (FIX/API), fees and eligibility not stated. | https://www.prnewswire.com/news-releases/trading-technologies-to-enter-prediction-markets-with-support-for-trade-execution-on-kalshi-302802611.html ; https://www.tradingtechnologies.com/news-releases/trading-technologies-to-enter-prediction-markets-with-support-for-trade-execution-on-kalshi/ |
| 2026-08-18 | "Trading Technologies to Expand Prediction Markets and Crypto Derivatives Access with Support for OG.com and Crypto.com". OG.com connectivity **scheduled live Q4 2026**; TT to support Crypto.com margin-based crypto futures at launch (no date). Protocol not stated. OG.com = North American Derivatives Exchange, Inc. (CFTC DCM + DCO), reachable directly or via IBs/FCMs. | https://tradingtechnologies.com/news-releases/trading-technologies-to-expand-prediction-markets-and-crypto-derivatives-access-with-support-for-og-com-and-crypto-com/ |
| 2026-08-20 | TT blog "Prediction Markets Move Into the Institutional Stack" (Alun Green). Still describes Kalshi as "plan to connect" and OG.com as "will support"; more venues "in the near future". Directs interested clients to the contact page. | https://www.tradingtechnologies.com/trading/prediction-markets/ (page content is that blog post) |

- **Go-live status as of 2026-10-19: NOT FOUND.** Q3 ended 2026-09-30. TT's 2026 release list through 2026-10-01 (25 items on page 1) contains no "Kalshi is live" release (H, PR Newswire list). TT news page shows no such release either (H, https://www.tradingtechnologies.com/news-releases/). The TT Help Library index has no Kalshi, prediction-market or OG entries in the ~226k characters read (H, https://library.tradingtechnologies.com), and a guessed Kalshi overview URL returned 404. Treat Kalshi as "announced, go-live unconfirmed, possibly slipped". The hint "beta" comes from a Kairos tool list (M, not re-verified).
- Note: the 2026-08-18 release did not appear in the PR Newswire company listing I fetched, so it was probably distributed via TT's own site rather than PR Newswire (M); the hint's "PR Newswire 2026-08-18" attribution is unverified. The 06-17 release is confirmed on PR Newswire.

## Market model, chains, collateral

- Underlying contracts are binary yes/no event contracts on Kalshi and OG.com (H, 08-20 blog describes yes/no event contracts). Order book on each exchange (central limit book, CFTC DCM). No tokenisation, no chain, no on-chain collateral. Collateral is USD cash/margin held at a clearing member/FCM (M; OG.com reachable "through intermediaries such as Introducing Brokers and Futures Commission Merchants", H).
- TT itself supplies execution tools: algos, autospreader, charting, spread trading, clearing/margin optimisation (H, releases). No contract format is published in TT docs: NOT FOUND (searched: TT library index, TT APIs page, releases).

## Read API

- **exists: none for prediction markets (public).** TT's APIs are customer-licensed: TT .NET SDK (market data and trading), TT Core SDK (C++, colocated Linux), FIX Order Routing, FIX Market Data, FIX Drop Copy, TT REST API (**administration/risk only**, per the page), FIX Price Gateway, FIX Order Gateway. "All APIs provide normalized interfaces for interacting with all TT-connected exchanges." (H, https://tradingtechnologies.com/trading/apis/)
- Docs: https://library.tradingtechnologies.com/apis.html and https://library.tradingtechnologies.com/tt-fix/ (listed by the APIs page; the FIX gateway message pages such as New Order Single (D), Cancel/Replace (G), Execution Report (8) are indexed, H). Not fetched in depth because they are generic and carry no prediction-market content.
- WebSocket: not mentioned (H). Auth: not documented publicly; accounts are provisioned via TT licensing/billing portal (client.tradingtechnologies.com) (H, mention only). Rate limits: NOT FOUND.
- Market data for the underlying venues should be taken directly from Kalshi / OG.com, not via TT.
- No fixtures saved: no public unauthenticated read endpoint exists to sample.

## Trade path and PayBox

- Trade path: FIX order routing or SDK into a TT-hosted account; orders go to Kalshi / OG.com via TT's exchange gateway. Requires a TT licence and a clearing relationship (M, inferred from APIs page and releases; terms NOT FOUND).
- **PayBox reachable: no.** No EVM/Solana transaction, no signed-order scheme, no stablecoin collateral. An EVM wallet cannot trade this; fiat/FCM onboarding is required. Any exposure to Kalshi/OG.com should be via their own adapters, not TT.

## Fees, resolution, rules

- Fees: not stated in any release (H, 06-17 release). TT licence/commission schedule not public: NOT FOUND. Underlying exchange fees apply per Kalshi / OG.com.
- Resolution/dispute: determined by the underlying exchange (Kalshi, OG.com); TT adds no resolution layer (M). See the Kalshi and OG.com notes.
- Geo/ToS/automation: eligibility not stated; positioned at "institutional clients" (H, release language about TT clients; M for exclusivity). TT site terms: Illinois law, AAA arbitration, site content may not be redistributed; sample code licensed for testing only, not commercial use; nothing on API automation (H, https://tradingtechnologies.com/terms/). API-specific licence terms are in client agreements: NOT FOUND.

## Liquidity and overlap

- Own liquidity: none; no volume/OI/TVL (n/a).
- Liquidity shared with: **Kalshi** (first venue) and **OG.com / Crypto.com Derivatives North America** (second venue, Q4 2026). TT order flow lands in those books, so it is fully duplicate liquidity.
- Event overlap: whatever Kalshi/OG.com list (sports, politics, crypto price, macro, economics, climate, culture), which overlaps Polymarket, Limitless and others. That overlap is where arbitrage lives, but it is reached via the underlying venues' own adapters.

## Why it still matters (signal-only)

- Institutional adoption: a major EMS vendor wiring Kalshi (Q3) and OG.com (Q4) suggests more institutional/algo flow and tighter US-venue books over time. Monitor TT releases for a "live" announcement and for additional venues (they say "several"/"many" to come). No code to write.

## Open questions

- Did Kalshi go live on TT in Q3 2026, and via FIX or native exchange API?
- Is OG.com still on track for Q4 2026?
- Which further venues (Cboe, ElectronX, MIAX, GFO-X, Rothera were present at TT's Exchange Spotlight events; connection to TT not stated) will follow?

## Not found

- Kalshi / OG.com go-live confirmation on TT; TT prediction-market API docs; fees; eligibility; rate limits; any public unauthenticated endpoint. Searched: TT home, news-releases, PR Newswire company feed and search, prediction-markets blog, APIs page, Help Library index, terms. WebSearch was unavailable (budget).

## Suspicious content

- None observed in fetched pages (no embedded instructions).

## Sources

- https://www.prnewswire.com/news/trading-technologies/ (release list, H)
- https://www.prnewswire.com/news-releases/trading-technologies-to-enter-prediction-markets-with-support-for-trade-execution-on-kalshi-302802611.html (H)
- https://www.tradingtechnologies.com/news-releases/trading-technologies-to-enter-prediction-markets-with-support-for-trade-execution-on-kalshi/ (H)
- https://tradingtechnologies.com/news-releases/trading-technologies-to-expand-prediction-markets-and-crypto-derivatives-access-with-support-for-og-com-and-crypto-com/ (H)
- https://www.tradingtechnologies.com/trading/prediction-markets/ (blog 2026-08-20, H)
- https://tradingtechnologies.com/trading/apis/ (H)
- https://library.tradingtechnologies.com (H)
- https://tradingtechnologies.com/terms/ (H)
- https://www.tradingtechnologies.com/news-releases/ (H)
- Repo cross-references: docs/research/venues/og-crypto-com-nadex.md, og-com-markets-og-predictions-crypto-com.md, kairos.md (M)
