# Talos (Kalshi access) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, web searches, `gh api` org listing, a handful of unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signing, POST/PUT/DELETE, browser automation or PayBox tool. Third-party text treated as untrusted data; none of the pages read contained instructions aimed at AI.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak or stale.

---

## 0. Bottom line

1. **Talos is not a venue.** It is an institutional OEMS/execution-software vendor (SaaS) that connects clients to venues. Kalshi access is a routing/execution layer on top of Kalshi's own order book. It holds no markets, no liquidity and no collateral of its own. (H)
2. **Liquidity is 100% shared with Kalshi.** It cannot be an independent arbitrage leg; anything fillable through Talos is fillable on Kalshi directly. (H, press release)
3. **No public API and no public docs.** Developer docs are behind Auth0 login (`docs.talostrading.com` redirects to `talostrading.auth0.com`), access is by sales contract only, "select institutional clients" (market makers / hedge funds). The planned "harmonized prediction-market data feed" is announced, not live, and would be a paid Talos Data product. (H)
4. **Closed to us:** no self-serve onboarding, no pricing disclosed, no EVM/PayBox path (Talos is a FIX/REST/WS gateway to centralized exchanges). (H/M)
5. **adapter_priority = skip.** Value to this project is as a market-structure signal (institutional share of Kalshi flow, planned unified feed), not as an adapter. Integrate Kalshi directly (covered by a parallel workflow).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Talos press release dated 2026-07-22 "Talos Brings Prediction Markets Onto Institutional Trading Infrastructure" (https://www.talos.com/insights/talos-brings-prediction-markets-onto-institutional-trading-infrastructure) | Kalshi event contracts and crypto perpetuals offered to select institutional clients through the existing Talos interface | H |
| Finance Magnates, 2026-07-22 (https://www.financemagnates.com/institutional-forex/market-makers-gain-kalshi-access-through-existing-talos-trading-workflows/) | Same announcement; adds broker distribution "later this year", unified data feed, prediction-market/perp spreads in a later phase | H |
| Talos product page https://www.talos.com/our-solutions/prediction-markets (HTTP 200 on 2026-10-19) | Describes Kalshi and Polymarket coverage (execution + data); broker distribution still phrased as future | H |
| Talos `llms.txt` (https://www.talos.com/llms.txt) | Lists "Prediction Markets: institutional access to event contracts on venues including Kalshi and Polymarket ... plus harmonized Kalshi and Polymarket market data through Talos Data" | H |
| Talos GitHub org `talostrading` | Only `sonic` (Go network library, pushed 2026-09-09), `samples`, `.github`; no prediction-market SDK | H |
| Other Talos 2026 news: Arqitech partnership 2026-10-13, Nasdaq tokenised collateral (Mar 2026) | Company is active; neither is prediction-market related | M |

**still_live = true** for the company and the Kalshi integration announcement. Caveat: the press release states no explicit go-live date and says access is for "select" clients (H); the product page uses future tense for broker distribution, RFQ blocks and the data feed.

Discrepancy to note: the press release does not mention Polymarket (H) while the product page and llms.txt say Polymarket is covered for execution and data. No source describes Polymarket trading live through Talos (M, search found nothing). The task hint "small Polymarket builder code" is **NOT FOUND** (searched: Talos Polymarket builder code, Talos Polymarket integration 2026, the Talos analysis page, product page); only generic Polymarket builder-code docs came back.

---

## 2. Kind and market model

- **kind:** aggregator-or-data / execution-infrastructure vendor (institutional OEMS, RFQ network, data product). Not an exchange.
- **Market model:** none of its own. Underlying Kalshi: dollar-collateralised binary event contracts on a CFTC-regulated DCM (central limit order book), plus Kalshi crypto perpetuals. Talos adds algos (Iceberg, Pegged, Sniper, TWAP, POV), block RFQ and multi-leg ticket entry on top. (H, press release + product page)
- **Tokenisation:** none. Kalshi contracts are exchange-ledger positions; Polymarket (if routed) is on-chain outcome tokens. (H, product page)

## 3. Chains and collateral

Talos itself: none; "does not hold client assets" (H, llms.txt). Kalshi collateral: USD (H, product page: "dollar-collateralized"). Polymarket side: crypto-collateralised (H, product page; chain details NOT FOUND on Talos pages, see the Polymarket venue note). Talos FAQ says DeFi access is via Uniswap Labs Trading APIs for spot token swaps (H, https://www.talos.com/faqs), unrelated to prediction markets.

## 4. Read API

- **exists: none public.** Talos advertises FIX, REST and WebSocket (H, https://www.talos.com/faqs, "extensive websocket and REST APIs ... FIX connectivity is also available"), but documentation is gated: https://docs.talostrading.com/ redirects to an Auth0 login (HTTP 400 login page on unauthenticated GET, H). FAQ: "Talos will provide your team with full API documentation" after onboarding (H). A third-party catalog (apis.io, scored 2026-10-17) records "Developer documentation is gated behind client authentication" and 0 APIs profiled (M).
- **Base URLs, endpoints, auth scheme, rate limits, websocket channels:** NOT FOUND (searched: talos.com, docs.talostrading.com, docs.talos.com, developers.talos.com, api.talos.com (TLS handshake error), GitHub org talostrading, apis.io, web search).
- **Planned data feed:** "Talos Data" harmonized schema for events, trades, order books, open interest and implied probabilities (Kalshi, Polymarket), "delivered through the existing crypto market data API" (H, press release + product page). Not documented, status planned. Talos Data is the former Coin Metrics (acquired 2025, H llms.txt). Coin Metrics public docs (https://docs.coinmetrics.io/llms.txt) contain no prediction-market datasets (grep for predict/kalshi/polymarket only hits "predicted funding rates"), and the unauthenticated community API rejects `exchange=kalshi` ("Value 'kalshi' is not supported"; fixture below). (H)
- **Fixtures** (`docs/research/fixtures/talos-kalshi-access/`): `talos-llms-txt-prediction-lines.txt` (Talos's own stated scope), `coinmetrics-community-api-kalshi-not-supported.json` (105 B, shows the public Coin Metrics API has no Kalshi). No market-data samples exist to save.

## 5. Trade path

- Programmatic: yes for onboarded clients (FAQ: "by utilizing the available APIs, you can programmatically submit orders to Talos", H) via FIX/REST/WebSocket to Talos, which routes to Kalshi. Auth/signing scheme for the Talos API: NOT FOUND (gated). Kalshi itself is reached through the client's own Talos-managed Kalshi account/entitlements (M: product page says "same order management system, order tickets, and entitlements model as digital assets").
- RFQ blocks: "Agreed trades print as blocks on the underlying exchange" (H, product page). Talos gives no pre-negotiated liquidity-provider arrangements; clients negotiate bilaterally (H, press release/FAQ footer).
- **PayBox reachable: no.** There is no on-chain contract, EVM transaction proposal or signed-order scheme to target; it is a centralized SaaS gateway under a commercial contract, and eligibility is institutional. Direct Kalshi/Polymarket adapters are the right path.

## 6. Fees

Talos pricing: not disclosed (H, product page "Pricing: not disclosed"; "Request a demo"). Kalshi exchange fees: see the Kalshi venue note (not researched here). Whether Talos charges per-ticket/SaaS/volume fees: NOT FOUND. No fee formula available.

## 7. Resolution mechanism and dispute risk

Inherited entirely from Kalshi (CFTC-regulated DCM rulebook; see the Kalshi note). Talos adds no resolution layer. Separate observation from Talos Quant Research (2026-07-31, H, https://www.talos.com/insights/prediction-markets-are-going-institutional---execution-should-too): a pattern "consistent with potential settlement-related manipulation" in Polymarket 5-minute BTC contracts, no mechanics or magnitudes given on the page. Relevant to our matcher as a warning that very short-dated crypto contracts have settlement-window risk. (M for our use)

## 8. Geo, ToS, automation

- Eligibility: select institutional clients, specifically market makers and hedge funds using Talos (H, Finance Magnates + press release). Product page targets asset managers, ETF issuers, hedge funds, prop firms, banks, broker-dealers, etc. and notes TradFi mandates must permit CFTC-regulated products (H).
- "Services and venues may not be available in all jurisdictions"; UK communications limited to FSMA Article 49 high-net-worth entities; regulated affiliates need separate onboarding (H, footer text).
- Algorithmic use is the product's purpose; no consumer ToS applies. Not an option for an individual/agent wallet. Contact is via demo request form; no self-serve.

## 9. Liquidity

- Talos itself: no volume/OI/TVL (it is a router). No published count of Talos prediction-market clients or flow. NOT FOUND.
- Context (company-reported, M): Talos analysis says institutions are about 40% of Kalshi volume (citing Trade Ideas, 2026-04-29) and institutional trading grew 800% in H1 2026 (citing Kalshi); combined Kalshi + Polymarket US monthly volume rose from under $5B to about $44.8B, no date range given (H that Talos says so; M on accuracy). A secondary search summary put Kalshi at about 59% of prediction-market volume in Q2 2026 vs about 30% Polymarket (L, unverified search snippet).
- Simulated execution study (Talos Quant, Kalshi: England-Argentina WC semi, Spain-Argentina final, BTC daily strike; 100,000-contract buys): algos generally beat instant sweep, no numeric slippage on the page; dashboard https://www.talos.com/dashboards/prediction-markets-quant-execution not read (H for the claim, simulated).

## 10. Event-category overlap and independence

Same contracts as Kalshi: sports, politics, crypto price, macro, entertainment. Because Talos routes into Kalshi's book, **liquidity_shared_with = Kalshi** (and Polymarket where routed). Not an independent arbitrage leg. Useful only as a (future) multi-venue normalized feed and as evidence that institutional execution is moving into this market.

## 11. Open questions

- Will the Talos Data prediction-market feed be offered to non-clients, and at what price/licence terms? (planned, "later this year" for distribution; feed timing not stated)
- Is Polymarket execution actually live in Talos or data-only?
- What auth scheme and rate limits does the gated API use? (Only worth answering if we become a Talos client.)

## Sources

- https://www.financemagnates.com/institutional-forex/market-makers-gain-kalshi-access-through-existing-talos-trading-workflows/ (H, 2026-07-22)
- https://www.talos.com/insights/talos-brings-prediction-markets-onto-institutional-trading-infrastructure (H, press release 2026-07-22)
- https://www.talos.com/our-solutions/prediction-markets (H)
- https://www.talos.com/insights/prediction-markets-are-going-institutional---execution-should-too (H)
- https://www.talos.com/llms.txt (H)
- https://www.talos.com/faqs (H)
- https://www.talos.com/ (H; no prediction-market mention on home page)
- https://docs.talostrading.com/ (H; Auth0 login wall)
- https://apis.io/providers/talos/ (M, third-party catalog, scored 2026-10-17)
- https://docs.coinmetrics.io/llms.txt and https://community-api.coinmetrics.io/v4/catalog/markets (H, no Kalshi)
- gh api orgs/talostrading/repos (H)
- WebSearch results (extended) for Talos + Kalshi/Polymarket (M/L; Cryptobriefing, FinanceFeeds, Crypto Economy, etc. not individually read)
