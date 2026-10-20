# Apex Prediction Markets (Apex Fintech Solutions) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch (returns small-model summaries of pages, so quotes are as returned), WebSearch, and a few unauthenticated GETs to Apex hosts (all blocked or 404). No account, key, wallet, signature, POST/PUT/DELETE, payment, or browser automation. No PayBox tool called. Third-party text treated as untrusted data; nothing in it tried to instruct an agent.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or inference; **L** = weak/stale.

Fixture: `docs/research/fixtures/apex-prediction-markets-apex-fintech-solutions/probe-results-2026-10-19.txt` (probe results; there is no public read API to sample).

---

## 0. Verdict

**adapter_priority = skip.** Confidence: high.

1. **Live, but as B2B plumbing, not a venue.** Apex Clearing Corporation (CFTC-registered FCM) clears Kalshi event contracts for broker clients over AscendOS APIs. tastytrade went live 2026-07-27 (H). The product is real.
2. **Not an independent leg.** Kalshi "supplies the regulated marketplace and event contract offerings" and is the only venue so far (H). Prices and depth are Kalshi's. Apex is an execution/clearing route to Kalshi liquidity, same pattern as Webull/Robinhood/Alpaca. Adding it would double count Kalshi.
3. **No public read API.** Apex developer docs are gated behind a request-access + Okta flow (H). No event-contract endpoints, base URLs, auth scheme or rate limits are published (NOT FOUND). Kalshi's own public API is the correct read source (covered by the parallel Kalshi workflow).
4. **Not reachable from a PayBox wallet.** USD in a KYC'd brokerage account, no chain, no token, no signed order (section 6).
5. **Watch value only:** Apex says it will add other exchanges "if there is enough demand" (H, Finance Magnates). If a second, independent exchange is added, revisit. Otherwise nothing actionable.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| Apex press release: "Apex Prediction Markets", turnkey, no own FCM needed, via existing AscendOS APIs, exchange-agnostic, unnamed exchanges; "will launch in Q2 2026". Page "Last Updated" 2026-09-22. https://apexfintechsolutions.com/press-releases/unlocking-the-future-of-trading-apex-fintech-solutions-announces-seamless-turnkey-prediction-markets-integration/ | 2026-02-03 | H |
| Apex + Kalshi release: API-based offering to show Kalshi event contracts; tastytrade first live; Kalshi first venue, more to be added; Apex Clearing Corporation is the FCM. https://apexfintechsolutions.com/press-releases/apex-fintech-solutions-and-kalshi-power-new-era-of-prediction-markets-access/ | 2026-08-13 (updated 08-17) | H |
| Finance Magnates: same launch; "Kalshi is the first venue"; others if demand. https://www.financemagnates.com/fintech/apex-turns-kalshi-into-an-add-on-for-broker-platforms/ | 2026-08-13 | H (as reported) |
| tastytrade launch press release: prediction markets live 2026-07-27, "first brokerage on Apex's FCM infrastructure", offered via Apex Clearing Corporation; exchange not named on the page. https://tastytrade.com/newsroom/press-releases/tastytrade-launches-prediction-markets-for-active-traders/ | 2026-07-27 (upd. 08-13) | H |
| tastytrade product page lists contract catalog, "offered through Apex", separate futures/event accounts at Apex Clearing; Kalshi only in image alt text. https://tastytrade.com/prediction-markets/ | read 2026-10-19 | H |
| Wealth Management: Apex expects wealth firms and RIAs to onboard; RIAs offering this would need to register as an introducing broker with NFA/CFTC. https://www.wealthmanagement.com/advisor-support-platforms/apex-fintech-launches-prediction-markets-platform | 2026-08-13 | M |

Gap: only tastytrade is confirmed live. Apex clients like Webull, eToro US, Stash and Ally are named as general Apex clients, not confirmed users of this product (H, FM article; the Coinlaw summary says the same). Webull's own Kalshi event contracts predate this and are a separate arrangement (M).

**still_live = true** (as a broker/FCM service; not as an independent market).

---

## 2. Kind and market model

- **Kind (H):** broker-or-frontend / FCM clearing service. Roles: Apex = FCM operations, clearing, segregated custody, money movement, statements, account management; Kalshi = regulated marketplace and contracts; the firm (e.g. tastytrade) = client UX.
- **Market model (M):** inherits Kalshi: binary YES/NO event contracts, $1 payout (tastytrade page, H: "A YES contract pays $1.00 if the outcome occurs"), central limit order book at Kalshi. No tokenisation: positions are cleared futures-style contracts in a segregated account.
- Apex says the platform is "exchange-agnostic" (H, Feb release), but only Kalshi is live.
- tastytrade catalog (H): commodities (WTI, Brent, nat gas, gold, silver, copper), crypto (BTC, ETH, SOL, XRP, DOGE), US and international macro (CPI, PCE, NFP, FOMC, GDP, ECB/BoE/BoJ), financials (S&P, Nasdaq, Dow, Russell, 2y/10y yields, VIX, DXY), hourly to yearly timeframes. **No sports** at tastytrade (M, tradeinformer/FM). Apex's own releases list sports, politics, weather, culture, so category coverage is per-broker.

## 3. Chains and collateral

None on-chain. USD cash in a brokerage/FCM account at Apex. Event-contract accounts are segregated from securities and are **not SIPC protected** (H, tastytrade page). Payouts credited to investor accounts on resolution (H).

## 4. Read API

`exists = none` (public). Gated official docs only.

- Developer Portal: https://apexfintechsolutions.com/developers/developer-portal/ . Access by request, then Okta invite; mentions OpenAPI specs, endpoint references, auth guides, sandbox -> UAT, SDKs (Java, Python, TypeScript, Go per search summary, M), Postman collection (M) (H for gating). The portal page itself mentions "event contracts" only in legal disclosures (H). An Events API (webhooks for system events) is listed; no market-data streaming is mentioned (H).
- Docs host `developer.apexclearing.com` (ReadMe): 302 to an Auth0 login wall for docs and reference; no public openapi.json (H, fixture). `api.apexclearing.com` -> 404; other guessed hosts do not resolve (H, fixture).
- Per press: AscendOS APIs support "order management, market data and position tracking" (H, Apex Kalshi release). Specific endpoints, base URLs, auth scheme, rate limits, websocket: **NOT FOUND** (searched: Apex releases, developer-portal pages, devex page, docs host, web search).
- Even if obtained, this is a per-firm, KYC/contract-gated API for brokers, not something a third-party aggregator can call.

**For the aggregator: read Kalshi directly.**

## 5. Trade path

Programmatic ordering exists only for onboarded Apex client firms via AscendOS order-management APIs (M; press). For retail on tastytrade: enable Event Contracts in Trading Preferences, trade in the Predict screen on web/mobile (H); whether event contracts are exposed in tastytrade's public API/MCP is NOT FOUND (page does not say). Not usable by an agent without a brokerage relationship.

## 6. PayBox / EVM wallet reachability

**no.** No chain, token, contract address, or signed-order scheme. A PayBox EVM/Solana wallet cannot place, sign or propose transactions for this. The only bridge is fiat: wire/ACH to a brokerage account, outside PayBox's scope. paybox_reachable = no.

## 7. Fees

Not stated in any Apex source (NOT FOUND, searched: both Apex releases, tastytrade release and product page). tastytrade page says contracts are priced "not including fees" and links a separate commissions document (H, not read). A CryptoSlate review claims $0 commission with $1,000/order and $3,000/day new-position caps since July 2026 (L: single secondary, unconfirmed). Underlying Kalshi exchange fees apply (roughly 1-2 cents/contract per secondary sources, formula-based; defer to the Kalshi spec). Weighted fee at tastytrade: unknown.

## 8. Resolution

Delegated to Kalshi (the DCM). Apex credits cash payouts when contracts resolve (H). Dispute risk is Kalshi's; Apex adds regulatory-action risk: disclosures warn of trading halts, mandatory liquidations or position cancellations with little notice (H). Brokers may layer their own limits.

## 9. Geo / ToS / automation

Product is for qualifying firms; end-client eligibility is set by each broker (US-oriented, brokerage KYC). Neither Apex nor tastytrade pages state automation rules for event contracts (NOT FOUND). Developer portal access is request-gated. Treat automated scraping of broker UIs as out of scope.

## 10. Liquidity

NOT FOUND: no volume/OI figure for the Apex-routed flow in any source (FM: "Not stated"). It is a slice of Kalshi's book; use Kalshi's own volume/OI for sizing. Apex claims infrastructure for "close to 200 firms" (H, FM), but that is its clearing client base, not event-contract volume.

## 11. Overlap and shared liquidity

- **Shares liquidity with Kalshi: yes, 100%.** Not an independent arbitrage leg.
- Overlap with other venues is therefore Kalshi's: macro (CPI, Fed, jobs), crypto price, equity index/commodity thresholds, plus sports/politics/culture where the broker offers them. Cross-broker arbitrage (tastytrade vs Webull vs Robinhood) is not possible because they all route into one Kalshi book.

## 12. Aggregator integration notes

- Do not build a venue adapter. At most keep a registry row: `kind=broker-route`, `underlying=kalshi`, `independent_liquidity=false`.
- Dedupe rule: treat any Apex/tastytrade/Webull/Alpaca quote as a Kalshi quote.
- Re-check trigger: Apex announces a second exchange or a public data product.

## 13. Open questions

- Which exchange(s) beyond Kalshi, and when.
- Whether any firm besides tastytrade has gone live on Apex's service.
- AscendOS event-contract endpoint shapes (gated).
- tastytrade per-contract fees (commission document not read).

## Sources

- https://apexfintechsolutions.com/press-releases/unlocking-the-future-of-trading-apex-fintech-solutions-announces-seamless-turnkey-prediction-markets-integration/ (H)
- https://apexfintechsolutions.com/press-releases/apex-fintech-solutions-and-kalshi-power-new-era-of-prediction-markets-access/ (H)
- https://apexfintechsolutions.com/developers/developer-portal/ and /devex-and-sandbox/ (H)
- https://www.financemagnates.com/fintech/apex-turns-kalshi-into-an-add-on-for-broker-platforms/ (H as reported)
- https://tastytrade.com/newsroom/press-releases/tastytrade-launches-prediction-markets-for-active-traders/ (H)
- https://tastytrade.com/prediction-markets/ (H)
- https://www.wealthmanagement.com/advisor-support-platforms/apex-fintech-launches-prediction-markets-platform (M)
- https://thepaypers.com/fintech/news/apex-fintech-solutions-and-kalshi-launch-prediction-markets-api , https://coinlaw.io/apex-kalshi-prediction-markets-api-brokerages/ (M, search snippets)
- https://tradeinformer.com/broker-news/tastytrade-launches-prediction-markets-without-sports-contracts (M, search snippet)
- https://cryptoslate.com/brokers/tastytrade-review/ (L, search snippet)
- Probe results: `docs/research/fixtures/apex-prediction-markets-apex-fintech-solutions/probe-results-2026-10-19.txt` (H)
