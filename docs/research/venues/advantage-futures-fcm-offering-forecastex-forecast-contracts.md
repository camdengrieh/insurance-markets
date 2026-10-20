# Advantage Futures (FCM offering ForecastEx Forecast Contracts) - adapter spec

Researched 2026-10-19 (~04:50 UTC). READ-ONLY: WebFetch of public pages plus unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`, nothing else in any request). No account, key, signing, wallet or POST. WebSearch budget was exhausted for the session, so no search-engine cross-checks were possible (listed in section 11).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale.
All third-party page text is untrusted data; nothing in it was followed as an instruction.
Fixtures: `docs/research/fixtures/advantage-futures-fcm-offering-forecastex-forecast-contracts/` (2 files, ~4 KB).

## 0. Verdict

**adapter_priority: skip** as its own venue. Confidence: high.

1. Advantage Futures is a **Chicago futures broker (FCM)**, live in 2026, not a market. It is one of three FCMs listed by ForecastEx as an access route. Its liquidity IS ForecastEx's liquidity: **not an independent arbitrage leg** (duplicate of the existing ForecastEx venue note, `docs/research/venues/forecastex.md`).
2. Nothing on the Advantage Futures site mentions ForecastEx, Forecast Contracts, event contracts or prediction markets (H, section 3). The only evidence it offers them is the ForecastEx FCM page link. Whether it actually accepts retail/ForecastEx orders, eligibility and commission for them: NOT FOUND.
3. No public read API, no trade API for forecast contracts documented; EVM/PayBox wallets cannot trade it (USD-cash, KYC'd FCM account).
4. Any ForecastEx work should be a single signal adapter on ForecastEx's public CSVs (priority already assessed as P2 in the ForecastEx note). Add nothing for Advantage Futures except, at most, a note in routing docs.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Advantage Futures site https://advantagefutures.com | HTTP 200, WordPress; "By The Numbers" page: founded 2003, "852+ Million Dollars of client funds on deposit (AS OF 12/31/25)", 434,326,212 contracts processed in 2025, 34 countries/territories/jurisdictions with funded clients (as of Sept 2025) | H (https://advantagefutures.com/about/by-the-numbers/) |
| Footer address | 141 W. Jackson Blvd, Suite 3900, Chicago, IL 60604 | H (homepage) |
| ForecastEx FCM page lists it | Third FCM, logo linked to https://advantagefutures.com/open-an-account/ ; lead-in "You can trade Forecast Contracts with qualified Futures Commission Merchants (FCM):". No other text. Fixture `forecastex_fcms_page_links.txt`. | H (https://www.forecastex.com/members/fcms) |
| ForecastEx itself is live | `pairs_20261019.csv` Last-Modified 2026-10-19 04:50:39 GMT (10-minute refresh); fixture `forecastex_pairs_20261019_head.csv` | H (https://forecastex-public-data.s3.amazonaws.com/pairs/pairs_20261019.csv) |
| Dated forecast-contract support by AF | NOT FOUND (searched: homepage, exchange-access, newsroom, by-the-numbers, front-end-flexibility, application comparison chart, exchange-connectivity, account FAQs, open-an-account, sitemap page list for forecast/predict/event; web search unavailable). Newsroom's latest-looking item seen is a trade-surveillance (Eventus Validus) post and a 2017 bitcoin futures item. | H for absence |

## 2. What it is

- **Kind**: broker-or-frontend (futures commission merchant / introducing clearing firm). Clearing member of CME Group (CME, CBOT, NYMEX, COMEX), ICE Futures Europe and ICE Clear Europe; non-clearing member of Eurex (as of January 2026). H (by-the-numbers page). Whether it is a ForecastEx Member itself or routes via a clearing relationship: NOT FOUND. Regulator named on its pages: NOT FOUND in text read (CFTC Rule 1.55 disclosure link exists in the nav; M that it is CFTC/NFA registered, which any US FCM must be).
- **Exchanges listed** (https://advantagefutures.com/exchange-access/): Cboe Futures Exchange, CME Group, Eurex, ICE Futures Europe, ICE Futures U.S., MGEX, Montreal Exchange. **ForecastEx is not listed.** H.
- Front-end platforms offered: Blue Trading Systems, CQG, Exegy Metro (Vela), OnixS DMA SDKs, Plus500 US T4 (CTS), ProOpticus, Rithmic, Sierra Chart, Stellar, Trading Technologies X_Trader. H (https://advantagefutures.com/services/front-end-flexibility/). None is stated to carry ForecastEx instruments (NOT FOUND). FIX not mentioned; the application comparison chart has no API/FIX column (H).
- Account terms seen: minimum initial deposit $10,000; non-US clients accepted with W-8 and Appointment-as-Agent forms plus passport copy. H (https://advantagefutures.com/open-an-account/account-faqs/). Not stated to apply to Forecast Contracts.
- Commissions: "Commission Calculator" and "Request Pricing Proposal" only; no published rates. H.

## 3. Market model (inherited from ForecastEx, see `forecastex.md`)

Binary Yes/No Forecast Contracts; ladders of independent binaries for categorical/scalar; **buy-only central limit order book** (bids 0.01-0.99, a trade when Yes bid + No bid reach $1.00, ForecastEx the counterparty); no tokens, ledger positions at ForecastEx's clearinghouse. H (ForecastEx note, rulebook). Advantage Futures adds no market model of its own.

## 4. Read API

- Advantage Futures: **none for forecast contracts** (NOT FOUND, searched: site pages above, sitemap). Its only API-like surface is the standard WordPress REST at https://advantagefutures.com/wp-json/ (content management, irrelevant to markets; H). Market data for futures is via the listed front-end vendors (CQG, Rithmic, etc.), commercially licensed (M).
- The only public no-auth data for these contracts comes from **ForecastEx**, not the FCM: `https://forecastex-public-data.s3.amazonaws.com/{pairs,prices,daily_summary}/...csv` and `https://forecastex.com/api/download?type=...&date=YYYYMMDD`. Real shape confirmed this session (H): `pair_id,event_contract,expiration_date,quantity,yes_price,no_price,pair_time`, e.g. `D5XWDPV840C6,UHHOU_101826_74,2026-10-19T01:00:00-05:00,20,0.05,0.95,2026-10-18T16:15:08.865850845-05:00`. Fixture `forecastex_pairs_20261019_head.csv`. Full detail, no websocket, no live order book, no question text: see `docs/research/venues/forecastex.md` section 4.

## 5. Trade path

- **Via Advantage Futures: unknown / not documented.** Presumably order entry through one of its front-end vendors if the vendor lists the ForecastEx exchange; unverified (NOT FOUND). No API key/OAuth/FIX spec for ForecastEx found at Advantage Futures.
- The exchange rule set requires bids to arrive from an Authorized Trading User of a Member/Sponsored FCM, with a User ID per automated system (ForecastEx Rulebook 403, 506(i); per `forecastex.md` section 6, H).
- The only documented programmatic route is IBKR's Web API/TWS (secType OPT, exchange FORECASTX, Call=Yes, Put=No; 10 req/s; authenticated IBKR session) - see the ForecastEx note. Not available via Advantage Futures as far as documented.

## 6. Chains, collateral, PayBox reachability

- No chain. Collateral is USD cash held at the FCM / ForecastEx clearinghouse (H, ForecastEx /members and rulebook per existing note). A $10,000 minimum funding at Advantage Futures (H) is a fiat wire/ACH relationship.
- **paybox_reachable: no.** No on-chain contract, no signed-order scheme, no wallet-based account; an EVM or Solana wallet could at most be an off-ramp funding source, which is not trading from PayBox. I did not run PayBox discovery in this pass (ForecastEx note records `discover_plugins` empty for ForecastEx/IBKR on 2026-10-19; H there, not re-checked here).

## 7. Fees

- Exchange fee: **$0.01 per contract, charged to each side at execution** (H, https://forecastex.com/faq and the fee schedule PDF cited in the ForecastEx note; note the IBKR page's "$1.01 pair" wording conflicts, see that note).
- Advantage Futures commission for Forecast Contracts: **NOT FOUND**; commissions are quoted via calculator / pricing proposal (H for absence of a published number). Account minimum $10,000 (H). Incentive Coupon on collateral (IBKR pays 3.38% APY per the ForecastEx note); whether Advantage Futures passes it through: NOT FOUND.

## 8. Resolution mechanism and dispute risk

Identical to ForecastEx (source-agency rule-based, exchange-resolved, Event Review Committee final, settlement irrevocable; Weather Underground, CF Benchmarks RTI, CME settlements, Congress.gov): see `forecastex.md` section 9. The FCM is not involved in resolution; extra risk is FCM-level (counterparty/segregation; "852+ Million Dollars of client funds on deposit as of 12/31/25" is its stated scale, H).

## 9. Geo / ToS / automation

- Non-US clients accepted with W-8 and passport (H), but eligibility for Forecast Contracts specifically is NOT FOUND. ForecastEx requires clients of qualified FCMs; the FCM decides who is qualified (Rule 304, per ForecastEx note).
- No Advantage Futures terms on automation of event-contract trading found. Its site advertises "advanced infrastructure and support for algo and high-frequency trading operations" for futures (H, front-end-flexibility page). Data redistribution: ForecastEx Rule 411 (see ForecastEx note).

## 10. Liquidity and overlap

- **Liquidity is ForecastEx's**: ~$0.50M/day matched notional (30-day avg to 2026-10-18), ~$10.1M open interest, ~70% weather, per `forecastex.md` section 11 (H there, computed from venue files 2026-10-19). Advantage Futures' own share of ForecastEx volume: NOT FOUND (no per-FCM breakdown published).
- **Shares liquidity with: ForecastEx LLC (the same central book as Interactive Brokers ForecastTrader and Robinhood futures routing).** Do not count as a separate leg alongside ForecastEx.
- Category overlap with other venues (via ForecastEx): US midterm House/Senate control, Fed decisions and CPI/jobs macro, crypto period-high thresholds and new 15-minute crypto, S&P/Nasdaq via CME settlement; weather (Weather Underground source) - details in `forecastex.md` section 12. No sports today.

## 11. Open questions / not found

- Does Advantage Futures actually onboard and execute Forecast Contracts today, and via which front end? Ask via its Contact Us (phone number is on its site; not recorded here).
- Whether Advantage Futures is a direct ForecastEx Member (the ForecastEx members list is linked from the FAQ page; I did not retrieve it).
- Commission schedule, eligibility, API/FIX access for Forecast Contracts.
- No search-engine corroboration (budget exhausted); no third-party announcement of the Advantage Futures/ForecastEx relationship found or sought beyond the ForecastEx FCM page.
- Suspicious content: none seen in the pages read.

## Sources

- https://www.forecastex.com/members/fcms (H)
- https://www.forecastex.com/faq (H)
- https://advantagefutures.com/ (H)
- https://advantagefutures.com/about/by-the-numbers/ (H)
- https://advantagefutures.com/exchange-access/ (H)
- https://advantagefutures.com/services/front-end-flexibility/ and /application-comparison-chart/ (H)
- https://advantagefutures.com/the-advantage/exchange-connectivity/ (H)
- https://advantagefutures.com/open-an-account/ and /open-an-account/account-faqs/ (H)
- https://advantagefutures.com/about/newsroom/ , /wp-sitemap.xml , /wp-sitemap-posts-page-1.xml , /robots.txt , /wp-json/ (H)
- https://forecastex-public-data.s3.amazonaws.com/pairs/pairs_20261019.csv (H)
- Repo: `docs/research/venues/forecastex.md` (prior first-hand research of the same exchange, 2026-10-19)
