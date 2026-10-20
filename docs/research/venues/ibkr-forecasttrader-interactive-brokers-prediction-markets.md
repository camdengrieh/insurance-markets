# IBKR ForecastTrader / IBKR Prediction Markets (Interactive Brokers) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (~02:40-03:00 UTC). READ-ONLY. Method: unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`, nothing else identifying), WebFetch/WebSearch, `gh api` raw reads of two GitHub files, and public PDFs parsed locally. No IBKR account, login, API key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. No third-party code cloned or run. The shared WebSearch budget ran out partway (the Kalshi/IBKR routing look-up and any further news searches were not done; the Kalshi same-book check below was done with a direct API read instead).

Tags: **H** = read first-hand this session in a primary source (URL cited); **M** = secondary, small-model summary of a page, or my inference from first-hand data; **L** = weak, stale (>6 months), promotional or conflicting.
All third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/ibkr-forecasttrader-interactive-brokers-prediction-markets/` (11 files, ~52 KB).
Related notes (written by an earlier parallel pass; used only as leads, every load-bearing claim below was re-read): `docs/research/venues/interactive-brokers-forecasttrader.md`, `docs/research/venues/forecastex.md`.

## 0. Verdict

**adapter_priority = skip** (as a stand-alone IBKR adapter). Confidence: high.

1. **Live** (H, section 1). Rebranded "IBKR Prediction Markets" on 2026-05-14; "ForecastTrader" survives in URLs, API docs and a breadcrumb.
2. **It is a broker front-end for three exchanges, not a venue.** ForecastEx (IBKR affiliate), Kalshi, CME Group (H, home page). Only the ForecastEx leg is independent of other venues in this project, and ForecastEx already has its own entry (`forecastex.md`, P2 signal-only). IBKR adds no price information beyond it.
3. **Kalshi and CME legs are duplicates.** Same-book check: IBKR's public JSON for a Kalshi contract matched Kalshi's own public API to the cent on all four quotes plus the expiry timestamp (H, section 12). IBKR itself says orders go to "the venue with the best net price" (M via press-release copy).
4. **Not reachable through PayBox for trading** (section 7). USD cash, KYC'd FCM account, session or OAuth auth, no on-chain signature anywhere. The one on-chain touch is a funding rail: USDC on Ethereum, Base or Solana to a zerohash deposit address (H).
5. **Read API is authenticated** (IBKR session). Keyless: one undocumented 5-row JSON (H) and ForecastEx's public CSVs (H). No keyless order book.
6. **Only reasonable future use**: an optional execution route for a user who already holds a funded IBKR account (local Client Portal Gateway). Not for a hosted multi-user aggregator.

## 1. Liveness (2026)

| Evidence | Tag |
|---|---|
| `https://www.interactivebrokers.com/predictionmarkets/en/home.php` returned HTTP 200 on 2026-10-19; title "IBKR Prediction Markets", text "Trade political, climate, and economic events - on CME Group, Kalshi, and ForecastEx" | H |
| Public marketing JSON returned live quotes 2026-10-19 02:41Z and 02:46Z (fixture) | H |
| `ibkrcampus.com/campus/category/traders-insight/prediction-market/` lists posts dated Oct 2, 5, 6, 7, 8, 9, 14 and 16, 2026 | H |
| ForecastEx public files exist for every day to 2026-10-18 (fixtures) | H |
| IBKR Q2 2026 call (2026-07-21): unified platform live, "orders are routed to the venue offering the best net price" (Motley Fool transcript, small-model summary) | M |
| IBKR Q3 2026 call (held ~2026-10-15; Fool copy dated 10-16): Kalshi and CME added, "increased the overall volume"; short-duration (hourly, 15-minute) crypto/metals/energy event contracts added; IBKR "working on integrating with Polymarket"; no volumes disclosed (Fool transcript, small-model summary) | M |
| Press release, Business Wire 2026-05-14 "Interactive Brokers Expands Prediction Markets ..." via Yahoo Finance copy (labelled paid press release): Kalshi and CME contracts "being added on a rolling basis" | M |
| almanac `kachence/prediction-almanac/data/platforms/ibkr.yaml`: status live, launched 2024, routes_to ForecastEx/Kalshi/CME, `public_api: false`, no volume series (H that the file says so; its geo claims are secondary) | H/M |

## 2. Kind and structure

- **Kind**: broker front-end / smart router over CFTC-regulated event-contract exchanges. Operator Interactive Brokers LLC, "a CFTC-registered Futures Commission Merchant and a clearing member and affiliate of ForecastEx LLC" (H, `https://www.interactivebrokers.com/en/pricing/commissions-events.php`).
- **Three venues behind one account** (H, home FAQ): Kalshi, CME Group, ForecastEx. "without opening or funding separate accounts at each exchange".
- **ForecastEx is shared, not exclusive**: it is a stand-alone DCM/DCO; IB LLC is "an Affiliated Member" with "no special status, advantage, or access to systems or data compared to any other Member"; other FCMs connect too (H, forecastex.com regulatory text; the sibling `forecastex.md` lists Robinhood and Advantage Futures, M). **IB Global Investments LLC**, same parent, is an "Affiliated Customer" acting as liquidity provider with bids on both Yes and No (H, same source). Affiliate bids fill last at any price level (Rule 405(b), H).
- Almanac says "wholly owned ForecastEx" (M); the rulebook only says shared parent IBG LLC (H). Review sites say it was "spun out" in 2024 (L). Ownership is not important for the adapter.

## 3. Market model

- **Binary Yes/No, $1.00 payout**, priced $0.01-$0.99 (H, home FAQ; Rule 401(d)/(h) tick $0.01, ForecastEx).
- **Threshold ladders, not categorical markets**: one product (e.g. "US Consumer Price Index Yearly") has many strikes ("Above 3.8%"); each strike has a Yes contract and a No contract (H, API docs; marketing JSON). Rare multi-leg ones exist ("Federal Race Outcomes", strike "Senate-D, House-D", H fixture).
- **Tokenisation = IBKR conids**, modelled as options: **Call = Yes, Put = No**, one conid each. ForecastEx products hang off an artificial index conid; CME ones off the real CME index/future; Kalshi ones as `secType=OPT, exchange=KALSHI` with Kalshi's own series ticker as symbol (e.g. `KXHIGHLAX`) (H, `docs/web-api/trading/instrument-discovery/finding-event-contracts.md`, `docs/tws-api/contracts/event-contracts`).
- **Order book vs AMM**: each exchange's own central limit book; IBKR exposes top-of-book only (bid/ask/size fields). No AMM, no parimutuel.
- **ForecastEx specifics (H, Rulebook 401/403/405)**: buy-only exchange. A Yes bid and a No bid pair when they sum to $1.00; each side posts its own price as collateral; price-time priority. IBKR's "bid" on a ForecastEx Yes is derived from the best No ask (`bid_yes = 1 - ask_no` in all 5 marketing rows). Model ForecastEx as two ask-only books.
- **Selling**: ForecastEx cannot be sold, only offset by buying the opposite side with automatic netting (H, `order-submission.md`, `executions-and-netting.md`). CME "can be bought and sold" (H, same page). Kalshi-through-IBKR sell behaviour: NOT FOUND (docs cover only ForecastEx and CME). Neither short selling nor selling ForecastEx is allowed ("no short selling is permitted", H).
- Kalshi/CME contracts carry their own tick rules; use `/forecast/contract/rules` (`price_increment`) per contract (H, API ref).

## 4. Chains and collateral

- Settlement currency **USD cash** held at IBKR. ForecastEx "currently accepts only cash in U.S. dollars" for trading (H, forecastex.com/members). No chain, no token, no on-chain position.
- **Funding rail (H, `https://www.interactivebrokers.com/en/trading/stablecoin.php`)**: eligible IB LLC clients send USDC on **Ethereum, Solana or Base** to a unique zerohash address; auto-converted to USD; IBKR charges no fee; zerohash tiered 0.35% first USD 5,000, 0.20% next 15,000, 0.10% above 20,000. RLUSD and PYUSD "in the coming weeks". Limits ($10 min, $25k per transfer/day, $100k/month) are from secondary articles (L/M, January 2026 coverage). Eligibility (US-only at launch) is M.
- ForecastEx Forecast Contracts earn an "incentive coupon", "USD 3.38% APY ... paid monthly" on position value (H, home page 2026-10-19). Relevant to carry on long-dated legs.

## 5. Read API

**Official, authenticated.** Docs `https://www.interactivebrokers.com/docs/web-api/` (index `llms.txt`; append `.md` to a page), event-contract guide under `/docs/web-api/v1/endpoints/event-contracts/*`, TWS API `/docs/tws-api/contracts/event-contracts` (H).

| Item | Value | Tag |
|---|---|---|
| Base URLs | production `https://api.ibkr.com/v1/api`; Client Portal Gateway `https://localhost:5000/v1/api` (run by the account holder); sandbox `https://qa.interactivebrokers.com` | H |
| Unauthenticated | every probed path returns `401 {"error":"No valid lb criteria","statusCode":401}` (fixture) | H |
| Discovery | `GET /iserver/secdef/search?symbol=`, `/iserver/secdef/strikes?conid=&exchange=FORECASTX&sectype=OPT&month=SEP24`, `/iserver/secdef/info?conid=&exchange=&sectype=&month=&strike=` (one request per month and strike; returns the Call=Yes and Put=No conid pair); CME uses `sectype=FOP`, filter `tradingClass` starting `EC`. | H |
| Event-contract endpoints | `GET /forecast/category/tree`; `GET /forecast/contract/market?underlyingConid=&exchange=` (all contracts of one market: conid, side Y/N, expiration, strike, strike_label, underlying_conid); `GET /forecast/contract/details`; `/forecast/contract/rules` (source agency, resolution link, price_increment, times); `/forecast/contract/schedules`. Bearer-token auth. Response shapes are from docs, NOT verified live. | H docs / not live |
| Prices | `GET /iserver/marketdata/snapshot?conids=&fields=31,84,85,86,88,7059` (top of book; a pre-flight request is needed before data arrives) and `/iserver/marketdata/history` | H |
| Streaming | websocket topic `smd+<conid>+{"fields":[...]}`; 500 ms snapshot interval; streams terminate after 15 min, re-send after 10 min; subscription count limited by account Market Data Lines | H |
| Rate limits | 10 req/s per authenticated username; snapshot 10 req/s; history 10 req/s or 50/min; `/iserver/trades` and `/iserver/orders` 1 per 5 s; 429 on excess; IP "penalty box" 10 min | H |
| Trades tape / book depth / resolved outcomes | Only the account's own executions; no depth endpoint; no "settled outcome" endpoint found | NOT FOUND (searched web-api llms.txt, event-contract pages) |
| Market-data subscription fee for event contracts | NOT FOUND | - |
| Kalshi discovery in the Web API | only TWS API names `exchange=KALSHI`; Web API workflow pages cover FORECASTX and CME only | NOT FOUND |

**Keyless data that exists**
1. `GET https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing` (undocumented, called by the home page's own script, the only `tws.proxy` reference in it). Returns `{"contracts":[...]}`, 5 rows ("highest open interest" per category): `conid_yes`, `conid_no`, `exchange` (FORECASTX or KALSHI), `ask_yes`, `ask_no`, `bid_yes`, `bid_no`, `last_trade_time` (epoch seconds; it is the contract's last-trade/expiry time, not a trade time), `product_conid`, `product_exchange`, `product_name`, `strike_label`, `category_id`, `category_name`. `cache-control: no-store`, no terms. Sample: fixture `ibkr_public_marketing_contracts_20261019.json` (H). Fragile; use only as a cross-check.
2. ForecastEx public CSVs (venue's data, not IBKR's): `https://forecastex.com/api/download?type=summary|pairs|prices&date=YYYYMMDD` (H, probed for 20261018). `summary` = per-product matched pairs for the 24 h window; `pairs` = every matched pair with `yes_price`, `no_price`, `quantity`, `pair_time` (9,855 rows, ~1 MB for the day; refreshed every 10 min per site); `prices` = per contract and side `start/high/low/end/settlement_price`, `pair_quantity`, **`open_interest`**, `vwap` (26,062 rows, 2.3 MB). No bid/ask and no live book. The data page states no terms; Rulebook 411 says redistribution of exchange market data is "only to such extent ... as may be permitted by the Board" (H) - flag before redistributing.

## 6. Trade path

- **Programmatic orders exist for the account holder** (H): Web API `POST /iserver/account/{accountId}/orders` with `{"orders":[{"side":"BUY","quantity":1,"conid":...,"orderType":"MKT","listingExchange":"FORECASTEX","tif":"DAY"}]}`; TWS API; time-in-force Day/IOC/GTC (UI, M). Cancel/modify are the generic IBKR order endpoints (not re-read, M).
- **Auth, not signatures**. (a) Individuals: Client Portal Gateway, username+password+2FA entered in a browser on the machine running the gateway; session up to 24 h, times out after ~6 min without `/tickle` (call about every minute) (H, `authentication/faq.md`). (b) OAuth 1.0a for organisations and third-party vendors, with Compliance approval. (c) OAuth 2.0 only for "licensed Organizations, Financial Advisors, and IBrokers"; "OAuth 2.0 is not available to Individual account structures" (H, `oauth-2/register.md`). One live "fully open and funded" IBKR Pro account is the prerequisite (H, Getting Started).
- No wallet signature, no EIP-712, no relayer.

## 7. PayBox reachability

**paybox_reachable = no** for trading, **partial for funding only**.
- Trading: needs a KYC'd IBKR brokerage session or an IBKR-approved OAuth client; collateral is USD at an FCM. A PayBox EVM or Solana wallet cannot propose a transaction or sign an order that opens, closes or settles a position (H, sections 4 and 6).
- Funding: a PayBox wallet could in principle `request_transfer` USDC on Ethereum, Base or Solana to the user's own zerohash address shown in IBKR's Client Portal (H for the rail, M for any PayBox-side feasibility). That is a manual deposit to a custodian, with zerohash fees, per-day caps and eligibility limits, not a trading path.
- The earlier pass reported empty `discover_plugins`/`discover_services` results for "interactive brokers" (M, second-hand; not re-run here).

## 8. Fees

IBKR US direct clients (H, commissions page above, 2026-10-19; per contract, charged on each fill, no percent-of-notional formula published):

| Venue | IBKR commission | Exchange fee |
|---|---|---|
| ForecastEx | USD 0.00 | USD 0.01 |
| Kalshi | USD 0.01 | USD 0.01 |
| CME | USD 0.01 | USD 0.01 |

- ForecastEx's own FAQ: "$0.01 per contract, charged to each side at execution" (H, forecastex.com/faq). Rulebook 603(b)(2)(iv): collateral in excess of the settlement amount per Yes/No pair "shall be considered a fee due ForecastEx" (H); the rulebook does not say how often this excess arises (403(c) lets an aggressing bid be price-improved so the pair prices at $1.00), so any hidden per-pair cost is NOT quantified. In the 5 marketing rows `ask_yes + ask_no` was 1.02-1.05 (H).
- Whether IBKR's flat $0.01 + $0.01 on Kalshi replaces Kalshi's own direct fee schedule: NOT STATED (Kalshi's direct fees are in the Kalshi spec). Settlement/exercise fee: NOT FOUND. Withdrawal: not researched.
- One review site claims ForecastEx taker tiers of $0.01-$0.10 by price and a different CME charge (L; contradicts the primary pages above).
- Rates "may change ... at any time"; introduced or advised accounts may pay more (H). Spread dominates: YES spreads 0.02-0.05 in the five sample rows (H).

## 9. Resolution and dispute risk

- IBKR does not resolve; each exchange does under its own rulebook (M: Kalshi and CME rulebooks not read here).
- **ForecastEx (H, Rulebook, 77 pp.)**: Yes pays $1.00 / No $0.00 at resolution time (Rule 603), daily 13:00 CST settlement batch, "irrevocable and unconditional". **The exchange may swap the Source Agency after trading starts** (Rule 413(a)), accelerate or delay settlement and fix payouts via an Event Review Committee whose decisions are "final and not subject to review" (Rule 414), and may open an Event Review at its "sole discretion" before settlement (Rule 415). An affiliate (IB Global Investments) is a market maker on the same book. This is materially more discretionary than rules-based UMA-style or fixed-source resolution; budget for source-change and review-delay risk.
- IBKR API exposes `source_agency`, `data_and_resolution_link`, `market_rules_link`, `release_time`, `payout_time` per contract (H docs, not live).
- For cross-venue linking: compare exact source, station, rounding, timestamp and revision rule per contract, not titles (weather and CPI are the usual traps).

## 10. Geo, ToS, automation

- Eligibility varies by IBKR affiliate and residence (H, home FAQ). US election contracts only for eligible US residents (H). Ireland: "all MiFID retail clients are prohibited from trading forecast contracts" and Belgian clients are barred (H, `interactivebrokers.ie` page); the .ie and .ca pages mention no Kalshi (H, text search), so non-US affiliates look ForecastEx-only (M). Almanac adds CA/HK/SG allowed and EEA professional-only (M).
- No sports or entertainment contracts (IBKR, Q2 2026 call, M); this removes the largest overlap with Polymarket/Kalshi volume.
- 24/7 trading with periodic maintenance (H); Web API `/iserver` has a nightly reset (H, FAQ).
- Automation: own-account API use is allowed with no onboarding. Anyone offering software that touches other people's accounts is a "third-party vendor" needing Compliance approval and OAuth 1.0a only; "one brokerage session per username" across all IBKR platforms (H, Getting Started / FAQ). A hosted aggregator that trades for users is therefore impractical; a local single-user tool is fine. No IBKR text on arbitrage or on scraping the marketing JSON found (NOT FOUND).

## 11. Liquidity

| Item | Value | Source, date | Tag |
|---|---|---|---|
| ForecastEx matched pairs per day | 17-day sample 2026-09-20..10-18: mean 453,382, min 269,728, max 659,225 pairs/day (1 pair = USD 1.00 total collateral, so about USD 0.45M/day) | `forecastex.com/api/download?type=summary` (fixture `forecastex_daily_matched_pairs_sample_17days.csv`) | H |
| 2026-10-18 | 342,558 pairs; Environmental 300,789 (88%, LA daily high 122,957), Elections 30,349, Financial 7,686, Economic 3,734 | same | H |
| ForecastEx open interest | 10,128,764 pairs (about USD 10.1M collateral) across 970 product ids, 2026-10-18; top: US House Control 2.60M, Bitcoin lowest price 1.50M, Bitcoin highest price 1.17M, S&P 500 futures 0.49M, US Senate majority 0.31M | `type=prices` file, `open_interest` of YES rows summed by me (fixture `forecastex_open_interest_by_product_20261018.csv`) | H computed, M on interpretation |
| Kalshi / CME volume through IBKR | NOT FOUND. IBKR publishes none; the Q2 and Q3 2026 calls gave none. Almanac quotes "286m contract pairs in Q4 2025" from an earlier call (M, unverified) | - | - |
| Sample Kalshi book seen through IBKR | KXCPIYOY-26NOV-T3.8: 24 h volume 82.75, OI 53,107, ask size 19.97, last update 2026-10-17 (Kalshi's own fields) | Kalshi public API, 2026-10-19 | H |
| Review-site volume claims ("$187M Q1 2026", "$6.2M ADV May 2026") | conflict with the first-hand 0.27-0.66M/day above | tech-insider.org, 2026-05-26 | L |

IBKR-attributable volume cannot be separated from the underlying exchanges' totals. ForecastEx is thin (well under USD 1M/day, weather-dominated; an analyst on the Q2 call said the same, M).

## 12. Event overlap (where arbitrage could exist) and shared liquidity

- **Politics**: ForecastEx House control (`HORC`, the biggest OI), Senate majority (`SENM`), Senate/House state and district races; marketing JSON has "US Senate Majority" Dem 0.64/0.66 and "US House Control" Dem 0.89/0.91 (H). Same questions on Polymarket and Kalshi; certification and resolution-date rules differ.
- **Macro**: CPI yearly/core, Fed decision (`FFDEC`), Fed funds target rate (`FF`), unemployment, plus non-US (H summary file). Overlaps Kalshi and Polymarket macro; IBKR's Kalshi CPI contract is Kalshi's own.
- **Crypto price**: Bitcoin/XRP/ETH/SOL "highest/lowest price in period" (barrier-style, large OI), 15-minute/hourly crypto contracts (sibling note: ForecastEx 15-minute crypto filing dated 2026-10-12, M). Map carefully to Polymarket "above X at time T".
- **Weather**: daily/hourly city highs (LA, Houston, Seattle, SF, Miami, Austin...) overlap Kalshi `KXHIGH*`; the highest-volume ForecastEx category and the most mechanical to link, subject to station and rounding.
- **Commodities/equity indices**: gold, silver, copper, S&P 500 futures price (ForecastEx, CME) (H).
- **Sports**: none.
- **Shared liquidity (this is the key point)**:
  - Kalshi contracts via IBKR: **same book as Kalshi direct** (H on one contract: IBKR `bid_yes/ask_yes/bid_no/ask_no` = Kalshi `yes_bid/yes_ask/no_bid/no_ask` = 0.72/0.75/0.25/0.28 and identical expiry `2026-12-10T13:29:00Z`, sampled one second apart; fixture `ibkr_vs_kalshi_same_book_check_20261019.txt`; generalisation to all contracts is M). Not an independent leg.
  - CME contracts via IBKR: CME's own central book (M); not independent.
  - ForecastEx via IBKR: the ForecastEx book, shared with other FCMs and an IBKR-affiliated market maker (H). Independent of Polymarket and Kalshi, but IBKR is only one door.
  - Planned Polymarket integration (Q3 call, M) would make IBKR another door to a venue already in the project.

## 13. Adapter recommendation

- **No IBKR adapter.** Build/keep the **ForecastEx signal adapter** (P2, static CSV, no key: `summary`, `pairs` last-matched price, `prices` end-of-day marks and OI) per `forecastex.md`. Kalshi and CME come from their own APIs.
- Optional later milestone: "user's own IBKR account" execution route. Run the Client Portal Gateway locally, discover via `/iserver/secdef/*` and `/forecast/*`, price via `/iserver/marketdata/snapshot` (up to 10 req/s) or `smd` websocket (resubscribe every 10 min), `/tickle` about every minute, persist conids, treat ForecastEx as buy-only with netting, and respect one-session-per-username.
- Use the undocumented marketing JSON only as a cross-check; do not depend on it.
- A cross-venue edge involving ForecastEx has to price in: no selling (cost to unwind is the opposite-side ask), a possible excess-collateral fee on pairs (Rule 603, unquantified), USD 0.01-0.02/contract fees, and Rule 413-415 resolution discretion.

## 14. Differences from the earlier pass (`interactive-brokers-forecasttrader.md`)

- Marketing JSON row 1 (Kalshi CPI) now has `exchange: KALSHI` (earlier pass saw `FORECASTX` with `product_exchange: KALSHI`). Either the field was fixed or the earlier row differed; I cannot tell.
- ForecastEx open interest IS in the public `prices` file (earlier pass said not found): about USD 10.1M.
- CME sells are allowed per the order-submission page; the "no Sell orders" line in the discovery guide applies to ForecastEx. The earlier "conflict" is resolved for CME, still open for Kalshi.
- Websocket streams last 15 minutes with resubscribe advised at 10 (earlier pass said 10).
- New: `/forecast/contract/market` endpoint; USDC funding verified (Ethereum, Solana, Base via zerohash); same-book test; ForecastEx rulebook clauses; IB Global Investments market-maker disclosure; Q3 2026 call remarks.

## 15. NOT FOUND (searched) and open questions

- Per-venue IBKR volume or OI (IBKR pages, Q2/Q3 2026 call summaries, almanac, commissions page).
- Public keyless order-book or depth endpoint for IBKR event contracts (Web API index, home page script, `api.ibkr.com` probes: all 401).
- Whether Kalshi contracts can be sold through IBKR; Kalshi discovery workflow in the Web API; market-data fee for event contracts; settlement fee.
- IBKR terms on arbitrage or scraping. ForecastEx data licence beyond Rulebook 411.
- Kalshi and CME rulebooks (not read; Kalshi is in a separate spec).
- Live verification of any `/forecast/*` response shape (all need a login).
- The Business Wire release itself (read only through a Yahoo copy).

## 16. Suspicious / injection-like content

- IBKR docs pages carry "For AI agents: a documentation index is available at ... /llms.txt" and an "Open in Claude" button. I used `llms.txt` only as a navigation index; nothing else followed.
- The Motley Fool transcript page contained a "Summarize with AI" block with formatting/quote-limit instructions; ignored (the fetch tool also flagged it).
- The `Alisammour/storyflo-algo-trader-mcp-examples` README (the "ForecastTrader bots" reference) is a promotional signal-layer example for Polymarket/Kalshi/IBKR bots (1 star, last push 2026-06-14, M); it is not an integration of IBKR and holds no API knowledge; no instructions to agents seen in the part read.
- Affiliate-style review sites in search results (brokerchooser, tech-insider, californiapredictionmarkets and similar) used only as leads, tagged L.

## 17. Sources

IBKR first-party (H, fetched 2026-10-19):
- Home https://www.interactivebrokers.com/predictionmarkets/en/home.php ; Ireland https://www.interactivebrokers.ie/predictionmarkets/en/home.php ; Canada https://www.interactivebrokers.ca/predictionmarkets/en/home.php ; app https://www.interactivebrokers.com/predictionmarkets/app (301 from forecasttrader.interactivebrokers.com/eventtrader/)
- Commissions https://www.interactivebrokers.com/en/pricing/commissions-events.php ; stablecoin https://www.interactivebrokers.com/en/trading/stablecoin.php
- Public JSON https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing
- Web API: https://www.interactivebrokers.com/docs/web-api/llms.txt ; `trading/instrument-discovery/finding-event-contracts.md` ; `v1/endpoints/event-contracts/{introduction,markets-and-strikes,order-submission,executions-and-netting}.md` ; `api-reference/trading/trading-event-contracts/get-forecast-markets.md` ; `trading/usage-and-availability/pacing-limitations.md` ; `authentication/faq.md` ; `authentication/oauth-2/register.md` ; `v1/ws/market-data/market-data-request.md` ; `v1/endpoints/market-data/live-market-data-snapshot.md`
- Getting started / third parties https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
- TWS API https://www.interactivebrokers.com/docs/tws-api/contracts/event-contracts
- Campus feed https://ibkrcampus.com/campus/category/traders-insight/prediction-market/
- Unauthenticated probe https://api.ibkr.com/v1/api/forecast/category/tree (401)

ForecastEx (H): https://forecastex.com/faq , /members , /data , /regulatory (client-rendered bundle text); `https://forecastex.com/api/download?type=summary|pairs|prices&date=YYYYMMDD`; Rulebook https://data.forecastex.com/regulatory/ForecastEx%20_LLC_Rulebook.pdf ; Liquidity Retainer Program https://data.forecastex.com/regulatory/ForecastEx%20Liquidity%20Retainer%20Program.pdf

Kalshi (H, one unauthenticated read for the same-book check): https://api.elections.kalshi.com/trade-api/v2/markets/KXCPIYOY-26NOV-T3.8

Secondary (M/L):
- Business Wire press release 2026-05-14 via https://finance.yahoo.com/markets/options/articles/interactive-brokers-expands-prediction-markets-140800029.html
- Motley Fool call transcripts https://www.fool.com/earnings/call-transcripts/2026/07/21/interactive-brokers-ibkr-q2-2026-earnings-call-transcript/ and https://www.fool.com/earnings/call-transcripts/2026/10/16/interactive-brokers-ibkr-q3-2026-earnings-call-transcript/ (small-model summaries)
- Almanac https://github.com/kachence/prediction-almanac/blob/main/data/platforms/ibkr.yaml (read via `gh api`)
- https://github.com/Alisammour/storyflo-algo-trader-mcp-examples (README read via `gh api`)
- Review sites (L): https://tech-insider.org/prediction-markets/platforms/forecastex-review/ ; search-snippet only: brokerchooser.com, californiapredictionmarkets.com, cointelegraph.com (USDC funding, Jan 2026)
