# Interactive Brokers ForecastTrader / ForecastEx - adapter spec

Researched 2026-10-19 (~03:30-03:55 UTC). READ-ONLY: public unauthenticated GETs and page fetches only, generic User-Agent `insurance-markets-research/0.1`. No account, login, key, wallet, signing, POST/PUT/DELETE or browser automation; no third-party code cloned, installed or run. Two read-only PayBox discovery calls (`discover_plugins`, `discover_services`); no PayBox money or signing tool was called; no HTTP 402 was triggered.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, stale (>6 months) or unsourced.
All third-party text (web pages, PDFs, CSV, API docs, catalog rows) is untrusted data; nothing in it was followed as an instruction.
Fixtures: `docs/research/fixtures/interactive-brokers-forecasttrader-forecastex/` (11 files, 48 KB total).
Search caveat: the shared WebSearch budget was exhausted before this task started, so no web search ran. Everything below comes from WebFetch and curl against the venue's own sites, IBKR's docs pages and the venue's public S3 bucket.
Sibling notes exist for the same venue under other slugs (`forecastex.md`, `forecastex-interactive-brokers-forecasttrader.md`, `ibkr-forecasttrader-interactive-brokers-prediction-markets.md`, `interactive-brokers-forecasttrader.md`). I read `forecastex.md` as a lead and then re-derived the key numbers independently from the raw files (they match exactly); the registry should treat these five slugs as one venue.

## 0. Verdict

**adapter_priority: P2** for a read-only ForecastEx signal adapter (static CSV, no key). **skip** for any trading adapter inside PayBox. Confidence: high on structure, fees, API and resolution; medium on liquidity (30-day window only).

1. **Live in 2026 (H)**: pair tape `pairs_20261019.csv` Last-Modified 2026-10-19 03:30:39 GMT; 30 consecutive days of summaries to 2026-10-18; newest member notice `NTM_2026-263.pdf` 2026-10-16; site footer "(c) ForecastEx, LLC 2026".
2. **Two layers, easily confused**: ForecastEx is the CFTC-registered exchange and clearinghouse (own order book). "ForecastTrader" (now marketed as IBKR Prediction Markets) is Interactive Brokers' front end, which also routes **Kalshi and CME Group** contracts. Only the ForecastEx contracts are IBKR-affiliated liquidity; the Kalshi and CME rows are those exchanges' own books and are not independent legs (section 13).
3. **Not wallet-reachable**: USD cash, FCM-intermediated, KYC'd customer accounts, no chain, no token, no signed-order path (section 7). PayBox has no ForecastEx plugin or service (H, empty plugin result).
4. **Independent but thin**: about $0.50M/day matched notional and about $10.1M open interest, 70% of volume in daily city-temperature contracts (section 11).
5. **Read access**: keyless public CSV files (trade-pair tape refreshed every 10 minutes, daily closing marks with open interest, daily summaries). No public order book, no websocket, no machine-readable question text. Live top of book exists only through an authenticated IBKR session, plus an undocumented 5-contract marketing JSON (section 4).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Pair tape | `GET https://forecastex-public-data.s3.amazonaws.com/pairs/pairs_20261019.csv` Last-Modified Mon 19 Oct 2026 03:30:39 GMT (211,892 bytes at ~03:34Z). First data file `pairs_20240801.csv` | H |
| Daily summaries | 30 consecutive non-empty files 2026-09-19..2026-10-18; `summary_20261019.csv` correctly 404 (not yet published) | H |
| Member notices | `notices_to_members/NTM_2026-260..263.pdf` dated 2026-10-08 to 2026-10-16 | H |
| New product | `15MCDTermsandConditions.pdf` (15-minute crypto up/down) filed 2026-10-12; no `15MCD` rows in 2026-10-18 prices or the 2026-10-19 tape yet | H |
| IBKR side | `https://www.interactivebrokers.com/predictionmarkets/en/home.php` live: "Search and trade event contracts across Kalshi, ForecastEx, and CME Group from one unified platform" | H |
| Site | https://www.forecastex.com footer "(c) ForecastEx, LLC 2026" | H |
| Regulation date | CFTC DCM/DCO designation 2024-06-24 (MarketsWiki, sponsored) | M, not re-checked; S3 `pairs/` prefix created 2024-06-27 is consistent |

## 2. What it is

- **Kind**: regulated-exchange (CFTC Designated Contract Market and Derivatives Clearing Organization in one entity). Delaware LLC, "wholly owned subsidiary of IBG LLC" (Rulebook preamble); IBG LLC is "the majority owner and controlling member" (Rulebook definition 46). H.
- Contracts are called "Forecast Contracts" and trade only through FCM Members. FCMs listed at https://www.forecastex.com/members/fcms: Interactive Brokers (ForecastTrader), Robinhood (futures), Advantage Futures. H.
- IBKR describes itself as "a CFTC-registered Futures Commission Merchant and a clearing member and affiliate of ForecastEx LLC" (IBKR page footer, H).
- **Categories actually listed** (summary files): Economic Indicators, Elections, Environmental, Financial Markets, Conditional, Technology, Government. **No sports-outcome products** in the 30 daily summaries or in `product_filings/` file names; three "Sports Ruling" court-case contracts sit in `inactive_product_filings/`. H for "none today".

## 3. Market model

- **Binary only**, quoted as paired Yes and No contracts on one Event Question (Rule 401(a)). H. Settlement value $1.00 or $0.00 (T&Cs). H.
- **"Categorical" and "scalar" events are sets of independent binaries** per strike or option, for example `HORC_1126_Democratic` and `HORC_1126_Republican` (two separate binaries, not linked), `YXHBT_123126_100000`, `FES_123126_7050`. No neg-risk style linkage between siblings. H for naming, M for suffix semantics. Contract-id grammar `{PRODUCT}_{MMDDYY|MMYY...}_{strike-or-option}` is inferred (M).
- **Buy-only order book, no ask side**: "Since ForecastEx is a buy-only exchange, there is no ask" (Liquidity Retainer Program doc, H). Participants bid $0.01-$0.99 for Yes or for No; when the two bids total $1.00 the exchange pairs them and each side becomes a contract with ForecastEx itself (Rule 401(d)). Limit bids only, tick $0.01, min size 1, price-time priority (Rules 401(h), 404, 405). H.
  - Aggregator rule: synthesize `yes_ask = 1 - best_no_bid` and `no_ask = 1 - best_yes_bid`. The IBKR marketing JSON confirms this convention (e.g. House D `ask_yes 0.91` vs `bid_no 0.09`). H.
  - Collateral posted equals the bid price (Rule 401(d)): a Yes buyer at $0.20 posts $0.20. H.
  - **You cannot sell.** Exit by buying the opposite contract; IBKR nets automatically and reports `side:"N"` executions (IBKR Campus Event Contracts doc). H.
- **Tokenisation**: none. Positions are ledger entries at the ForecastEx clearinghouse. H.
- Conditional contracts exist (outcome Yes, No or False; False refunds, Rule 401(e)(1)). H.

## 4. Read API

No developer API documentation exists on forecastex.com (NOT FOUND, searched: /, /data, /markets, /faq, /about, /regulatory, /members/fcms, bucket prefixes `regulatory/` and `notices_to_members/`). What exists:

| Surface | Access | Tag |
|---|---|---|
| **ForecastEx public data files**, `GET https://forecastex.com/api/download?type={pairs\|prices\|summary}&date=YYYYMMDD` and the same objects at `https://forecastex-public-data.s3.amazonaws.com/{pairs/pairs_,prices/daily_prices_,daily_summary/summary_}YYYYMMDD.csv`. `https://data.forecastex.com` is the browse UI. | Unauthenticated, no stated rate limit, no licence or terms stated on the page. Site text: pairs "refreshed every 10 minutes", prices and summary daily. | H |
| S3 anonymous listing `?list-type=2&prefix=` | Prefixes `pairs/`, `prices/`, `daily_summary/`, `liquidity_rewards/`, `supplemental_data/`, `regulatory/` (rulebook, fee schedule, ~280 product T&C PDFs, KID PDFs in 11 languages), `product_filings/`, `inactive_product_filings/`, `notices_to_members/`, `disciplinary_filings/`. Fixture `forecastex_bucket_root_listing_20261019.xml`. | H |
| **IBKR Web API** (documented) | Base `https://api.ibkr.com/v1/api/`; authenticated only. Unauthenticated `GET /iserver/secdef/search?symbol=FF` returned **HTTP 401** (2026-10-19). | H |
| IBKR public marketing JSON (undocumented, referenced by the official page) | `GET https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing` returns 5 hand-picked contracts with `bid_yes/ask_yes/bid_no/ask_no`, conids and `exchange` (FORECASTX or KALSHI). Fixture `ibkr_public_marketing_contracts_20261019.json`. Promotional, fixed set, may change without notice. | H for shape, L for stability |
| Websocket, REST quotes, full public book, FIX spec | NOT FOUND for ForecastEx public side (searched: site, bucket, IBKR docs). IBKR offers a websocket (below). | - |

**File shapes (H, fixtures saved):**
- `pairs/pairs_YYYYMMDD.csv`: `pair_id,event_contract,expiration_date,quantity,yes_price,no_price,pair_time`. Example: `D5XWDPV840C6,UHHOU_101826_74,2026-10-19T01:00:00-05:00,20,0.05,0.95,2026-10-18T16:15:08.865850845-05:00`. One row per matched pair, nanosecond US Central timestamps. `yes_price + no_price = 1.00` on all 9,855 rows of the 2026-10-18 file. File "D" covers the trading day ending 16:15 CT on D (2026-10-18 file runs 2026-10-17T16:15:27 to 2026-10-18T16:14:58 CT). The current day's file is rewritten about every 10 minutes (Last-Modified 03:30:39 GMT), so the tape lags up to ~10 minutes. Fixture `forecastex_pairs_20261019_head30.csv`.
- `prices/daily_prices_YYYYMMDD.csv` (~2.3 MB, about 26k rows, 13,031 contracts x YES/NO): `event_contract,subtype,expiration_date,date,start_price,high_price,low_price,end_price,settlement_price,pair_quantity,open_interest,vwap`. YES and NO `end_price` sum to 1.00, so it is a **closing mark, not an executable quote** (M, inferred). `open_interest` is pairs outstanding (equal on YES and NO rows). `settlement_price` mirrors `end_price` while a contract is live and shows 1.00/0.00 once resolved, so it is **not a reliable resolution flag by itself** (checked on the 2026-09-23 file; M). Published ~21:22 GMT (Last-Modified 2026-10-18 21:22:21). Fixture `forecastex_daily_prices_20261018_sample.csv` (curated rows).
- `daily_summary/summary_YYYYMMDD.csv`: `product_id,product_name,product_category,total_pairs` (111 products on 2026-10-18). Fixture `forecastex_daily_summary_20261018.csv`.
- **Gap that matters for linking**: no question text, no strike semantics, no per-contract category; wording lives only in T&C PDFs or, authenticated, in IBKR `secdef/info` descriptions. NOT FOUND: a machine-readable contract catalog.

**IBKR Web API for ForecastEx (H, https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/; doc samples saved as `ibkr_webapi_event_contracts_doc_excerpt_NOT_LIVE.txt`, not live responses):**
- Modeled as options: `secType=OPT`, exchange `FORECASTX` (no final E), **Right Call = Yes, Put = No**, artificial `IND` underlier per product.
- Discovery: `GET /trsrv/event/category-tree`; `GET /iserver/secdef/search?symbol=FF`; `GET /iserver/secdef/strikes?conid=&exchange=FORECASTX&sectype=OPT&month=`; `GET /iserver/secdef/info?...&strike=` returns the Yes and No conids.
- Data: `GET /iserver/marketdata/snapshot?conids=..&fields=31,84,85,86,88,7059` (last, bid, ask size, ask, bid size, last size) and websocket `smd+CONID+{"fields":[...]}`: **top of book only**. History via `/iserver/marketdata/history`, **only while the instrument is trading**.
- Limits (https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/, H): 10 requests/second per authenticated username, `/iserver/marketdata/snapshot` 10 req/s, history 5 concurrent, HTTP 429 on excess, one brokerage session per username across all IBKR platforms.

## 5. Docs index (what an implementer reads)

- Rulebook (77 pp), fee schedule (1 p), Liquidity Retainer Program (5 pp), risk disclosure, T&Cs, all under `https://forecastex-public-data.s3.amazonaws.com/regulatory/`. H.
- IBKR Campus pages above. The WebFetch tool got HTTP 403 from interactivebrokers.com; plain curl with the generic UA returned 200 for the same pages. H.

## 6. Trade path

- **Exchange side (H)**: all bids enter by electronic transmission from an Authorized Trading User of a Member; "All Customer Bids must be transmitted to the Exchange by each Customer's FCM Member" (Rule 406); every bid carries a User ID (Rules 403, 506). Direct access means becoming a Member (application; see https://www.forecastex.com/members). The member protocol is not public.
- **Practical programmatic path = IBKR** (H): ordinary IBKR orders on the conids above; no Sell; opposite-side buy nets. Individuals authenticate with IBKR username and password through the Client Portal Gateway; the live account must be "fully open and funded" and of "IBKR Pro" type. Third-party vendors may only use OAuth 1.0a, need IBKR Compliance approval (stated estimate 3-6 weeks) and a Web API agreement. OAuth 2.0 is beta for first-party use. The IBKR TWS API also supports Forecast Contracts (IBKR page).
- Robinhood and Advantage Futures: no ForecastEx API found (NOT FOUND, searched: forecastex.com FCM page, IBKR docs).
- Order placement was not tested and cannot be (no account).

## 7. Chains, collateral, PayBox reachability

- **Chain: none. Collateral: USD cash**, fully collateralized before any bid (Rules 401(f), 608-609), non-marginable (Rule 401(i)). Lives at ForecastEx's clearinghouse and the FCM's segregated customer accounts. H.
- **paybox_reachable: no.** A PayBox EVM or Solana wallet (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) has nothing to sign or send: there is no contract, no typed-data order, no deposit address. Orders must come from a KYC'd FCM customer. H for the structure.
- PayBox discovery (H, 2026-10-19): `discover_plugins` "ForecastEx Interactive Brokers prediction markets" returned `{"plugins":[],"has_more":false}`. `discover_services` "ForecastEx event contracts" returned only third-party x402 data resellers (Tanod "utilpeek", agent402.tools, x402tap.com, others) for Kalshi and Polymarket data, none for ForecastEx; page 1 only, `has_more` true.
- Funding an IBKR account from crypto, if IBKR supports it, would be an IBKR-side off-ramp and would not make the position PayBox-tradable. Not verified.

## 8. Fees

| Item | Value | Tag |
|---|---|---|
| Exchange transaction fee | **$0.01 per contract, charged to both the Yes and the No side** of every executed transaction, independent of resolution, netting or settlement | H (Fee Schedule PDF; FAQ) |
| How it is charged | **On top of the bid price**: FAQ/"how it works" examples: Yes buyer at 76c who is right "nets 23c after the fee" (1.00 - 0.76 - 0.01); No buyer at 25c who is wrong loses 26c. Closing a 43c Yes by buying an 80c No costs $1.25 total including two fees | H (https://www.forecastex.com/about/how-forecast-contracts-work) |
| Tape vs fee | Every pair in the tape sums to exactly $1.00 (9,855 of 9,855 rows), so tape prices exclude the fee. Rule 403(c) separately mentions a $1.01 combined-bid threshold; its exact role was not resolved (open question) | H for tape, M for interpretation |
| Broker commission | IBKR: event contracts "zero-commission" | H (IBKR page) |
| Maker/taker tiers, settlement fee | None in the fee schedule | H (1-page schedule) |
| Interest | "Incentive Coupon" on the daily closing value of positions, **3.38% APY** at IBKR on 2026-10-19, accrues daily, paid monthly, even on losing positions; rate "subject to change". Contracts run out to 2031 so the coupon matters for carry | H (IBKR page; FAQ) |

Arbitrage maths: buying one ForecastEx contract at price p costs p + $0.01; profit if it wins is 0.99 - p. A cross-venue pair (Yes here, No elsewhere) needs `p_yes + 0.01 + q_no + other_venue_fee < 1.00` plus slippage and coupon carry. $0.01 is 2% of a 0.50 contract and 20% of a 0.05 contract.

## 9. Resolution mechanism and dispute risk

- **Source-agency, rule-based, exchange-resolved**; no oracle or token. Each T&C names a Source Agency and Underlying. H.
  - **Weather** (`UH*`, `UL*`, `HRU*`): final Daily Observations table value for the named station on **Weather Underground**, final once the next day's first observation is published; "No other data ... shall be used"; not subject to early resolution. H (DailyTemperatureTermsandConditions.pdf).
  - **Crypto period high/low** (`YXH*`, `YXL*`): CF Benchmarks Real-Time Index, per-minute trimmed mean (top and bottom 20% dropped), subject to early resolution. H (YXTermsandConditions.pdf).
  - **15-minute crypto** (`15MCD*`): average of 60 one-second CF RTI values at period end versus the 60 before the start; "greater than or equal" resolves Yes; no early resolution. H (15MCDTermsandConditions.pdf).
  - US House control, Fed decision, S&P/Nasdaq (`HORC`, `FFDEC`, `FES`, `FNQ`): T&Cs exist in the bucket; only `FFDEC` and `FES` were downloaded and not analysed here. Details in sibling note `forecastex.md` (M).
- **Discretion (H, Rulebook)**: Rule 413(a) the Exchange may change the Source Agency after first trading day; 414 may accelerate or delay settlement and use last prices or a committee "fair allocation"; 415 Event Review, committee determination "final". Resolution time is "no later than the day following Expiration Time" unless under review. Disputes go to Rulebook Chapter 8 arbitration; disciplinary filings are public.
- **Basis risk**: other venues' sources differ (Weather Underground station table vs other weather sources; CF RTI trimmed mean vs other indices; House control "AP/NYT/WSJ all called" early-resolution rules). An aggregator must compare resolution sources, not titles. M (other venues not researched here).

## 10. Geo / ToS / automation

- **Eligibility via IBKR (H, IBKR page 2026-10-19)**: "only available to eligible clients, 21 years and older, of Interactive Brokers LLC, Interactive Brokers Canada Inc., Interactive Brokers Hong Kong Limited, Interactive Brokers Ireland Limited and Interactive Brokers Singapore Pte. Ltd."; US election contracts "only available to eligible US residents"; availability varies by affiliate and country.
- **EEA**: eupersonalfinance.eu (dated 2026-08-08, M) says Forecast Contracts are available via IBKR Ireland to retail and professional EEA clients except Belgium, France, Liechtenstein, Portugal and Slovenia, with a retail cap of the lesser of 1% of NAV or USD 1.0M. This contradicts the hint that the EEA offering is professional-only; unresolved, IBKR's own country page was not located. The bucket holds PRIIPs-style Key Information Documents in 11 languages (H), consistent with retail availability.
- **Automation**: IBKR documents order submission for FORECASTX, so API trading is a supported use for the account holder. Exchange rules: unique User ID per Authorized Trading User (Rule 506(c)); position accountability 250,000 contracts per market in the T&Cs sampled (H); manipulation and wash trades prohibited (Rule 509). No ToS clause on bots specific to ForecastEx was found beyond that (NOT FOUND, searched: FAQ, rulebook).
- **Data licensing**: Rule 411 says recipients "may redistribute such information only to such extent and in such manner as may be permitted by the Board". The public data page shows no licence or terms (H for absence). Internal signal use looks low risk; ask before republishing commercially (M, not legal advice).

## 11. Liquidity (all computed by me from the venue's own files; 1 pair = $1.00 notional since yes + no = 1.00)

- **30-day matched volume 2026-09-19..2026-10-18: 15,040,257 pairs ~ $15.0M**, average $0.50M/day (daily range 0.27M-0.92M; last 7 days ~$0.49M/day). 2026-10-18: 342,558 pairs from 9,855 trades (median 10 contracts, p90 50). H. Fixture `forecastex_30d_volume_by_category_20260919_20261018.csv`.
- **Open interest, 2026-10-18 close: 10,128,764 pairs ~ $10.1M** across 13,031 contracts. Top products: `HORC` 2.60M, `YXLBT` 1.50M, `YXHBT` 1.17M, `FES` 0.49M, `PCD` 0.31M, `SENM` 0.31M. H. Fixture `forecastex_open_interest_by_product_20261018.csv`.
- **Volume by category (30d)**: Environmental (weather) 69.7%, Financial Markets 19.9%, Elections 6.9%, Economic Indicators 3.5%, Conditional/Technology/Government under 0.01%. Largest single product `UHLAX` (LA daily high) 4.97M pairs. H.
- **Depth**: size is concentrated in a few contracts (House control had 7 trades totalling 27,826 pairs on 2026-10-18); most contracts trade in tens of contracts. Quoted spreads on the 5 sample contracts are 2-3 cents. H.
- Market-maker incentives exist (Rules 416-417, Liquidity Retainer Program, max three MMs per program, daily public `liquidity_rewards/` files), which contradicts the FAQ line "no specialists, market makers" (H, both; FAQ is marketing). Affiliate (IBG group) bids fill last at each price (Rule 405(b)). H.
- **Comparison**: Kalshi `CONTROLH-2026-D` open interest 13.8M contracts vs ForecastEx `HORC` Democratic row 1.25M (Kalshi about 11x deeper); Kalshi `CONTROLS-2026-D` 3.5M vs ForecastEx `SENM` 0.31M (both H, Kalshi public API 2026-10-19; fixture `overlap_snapshot_20261019.txt`).
- Third-party volume figures (e.g. "$6.2M daily", "$187M Q1 notional" in promotional reviews) were not re-checked and are L. No authoritative cumulative statistic found. DefiLlama/TVL not applicable (no chain).

## 12. Event categories that overlap other venues (arbitrage candidates)

Overlap claims about other venues are M (those venues were covered by a parallel workflow); the ForecastEx side is H.

| ForecastEx products | Likely overlap | Note |
|---|---|---|
| `HORC` House control, `SENM` Senate, state races `AXX*`, `G*`, `M*` (Elections 1.03M pairs 30d) | Kalshi, Polymarket, PredictIt midterms (expire 2026-11 to 2027-01) | Highest-value overlap. 2026-10-19 snapshot: House D FX 0.89/0.91 vs Kalshi 0.901/0.902 (no edge); Senate D FX 0.64/0.66 vs Kalshi 0.62/0.63 (gross 1c: Kalshi YES 0.63 + FX NO 0.36 = 0.99, below fees). Resolution wording not compared. |
| `FFDEC`, `FF` Fed; `CPIY`/`CPIC` CPI; jobs, GDP, unemployment (Economic 0.52M) | Kalshi macro, Polymarket Fed | ForecastEx's original niche; long-dated ladders are thin. |
| `YXHBT`/`YXLBT`/`YXHET`... crypto period high/low (BTC OI ~2.7M), `15MCD*` 15-minute up/down | Polymarket and Kalshi crypto price and 15-minute markets | CF Benchmarks RTI trimmed-mean source differs from other venues' sources. `15MCD` not trading yet. |
| `FES` (S&P 500), `FNQ` (Nasdaq 100), gold/silver/copper | Kalshi index and commodity brackets | Settles on CME E-mini daily settlement (M, T&C not analysed here). |
| Daily city temperatures `UH*`, `UL*`, `HRU*` (70% of volume) | Kalshi daily-high temperature, Polymarket weather | Largest ForecastEx volume, but Weather Underground source likely mismatches other venues' station/data source. |
| Sports | None | Not listed. |

## 13. Shared liquidity

- **ForecastEx contracts: independent book and clearinghouse** (Rule 401(d): ForecastEx is counterparty to each side). IBKR, Robinhood and Advantage Futures are channels into the same book. Not a mirror of any other venue. H.
- **IBKR "ForecastTrader" as a whole is not independent**: its Kalshi and CME rows are those exchanges' contracts. IBKR's page says clients choose "any of the following providers: Kalshi, ForecastEx, or CME Group" (H). The IBKR marketing JSON tags rows with `exchange: KALSHI` (H). A sibling note (`ibkr-forecasttrader-interactive-brokers-prediction-markets.md`) recorded identical four-way quotes and expiry for one Kalshi contract on IBKR vs the Kalshi API; I did not repeat that exact comparison (M, single sample). An aggregator that already reads Kalshi and CME gains nothing from reading them again through IBKR.
- Because IBG owns ForecastEx and distributes Kalshi, retail flow may straddle both, and IBKR-affiliated market makers may keep overlapping prices tight (M).

## 14. Adapter recommendation

- **Build only a read-only ForecastEx signal adapter** (P2):
  1. Poll `pairs/pairs_<trading-day>.csv` every 10 minutes (the source's cadence) with `If-Modified-Since`/ETag; dedupe on `pair_id`; note the day label rolls at 16:15 CT; executed Yes price = `yes_price`, No = `1 - yes_price`.
  2. Once daily after ~21:30 GMT ingest `prices/daily_prices_<d>.csv` for the universe, closing marks (not tradable), open interest and `settlement_price`; ingest `daily_summary` for category tags.
  3. Link contracts to other venues by hand or from the T&C PDFs (no machine-readable question text). Start with `HORC`, `SENM`, `FFDEC`, `YXHBT`/`YXLBT`, `FES`, `FNQ`.
  4. Treat prices as stale by design; never emit an executable edge from these files alone.
- **Do not** build an order-placement adapter in PayBox. If execution on ForecastEx is ever wanted it is an IBKR (or other FCM) integration with a human-held KYC'd account, outside the PayBox model.
- Optional second phase if an operator holds an IBKR session: stream top of book via the Web API websocket (top of book only, 10 req/s) to get live quotes the CSVs lack.

## 15. NOT FOUND / open questions

- NOT FOUND (searched: forecastex.com pages, S3 bucket, IBKR Campus docs): official ForecastEx developer API; websocket or REST quote feed; machine-readable contract catalog with question text; trading schedule/hours (Regulatory page links are JS-rendered; Rule 402 defers to a schedule "on its website"); data licence and rate limits for the public files; Robinhood or Advantage Futures programmatic access; IBKR stablecoin funding.
- Fee reconciliation: tape pairs sum to $1.00 and the fee is added on top per the worked examples, but Rule 403(c) mentions a $1.01 combined threshold and the IBKR learn page (per sibling notes, not re-read) describes "$1.01". A live fill would settle it.
- EEA eligibility: "retail and professional" (eupersonalfinance, 2026-08) vs "professional-only" (hint); IBKR's country matrix not located.
- Whether `15MCD*` will list, and at what cadence.
- Same-book check for Kalshi rows rests on one sample contract.
- I did not open the unlisted bucket prefix `94ehf4d9834dh93248r0/` (appears in the anonymous root listing but not in the published portal); not accessed on purpose.

## 16. Sources

H = first-hand this session (all fetched 2026-10-19).
- https://www.forecastex.com (home), /markets, /data, /faq, /about, /about/how-forecast-contracts-work, /members/fcms, /regulatory (H; /regulatory sub-pages are JS-rendered)
- https://forecastex.com/api/download?type=pairs&date=20261019 (H, CSV)
- https://forecastex-public-data.s3.amazonaws.com/ (anonymous listing; `pairs/`, `prices/`, `daily_summary/`, `regulatory/`, `product_filings/`, `inactive_product_filings/`, `notices_to_members/`) (H)
- Fee schedule https://forecastex-public-data.s3.amazonaws.com/regulatory/ForecastEx_Fee_Schedule.pdf; Rulebook .../regulatory/ForecastEx%20_LLC_Rulebook.pdf (Rules 401, 403-406, 408, 411, 413-415, 506); Liquidity Retainer Program .../regulatory/ForecastEx%20Liquidity%20Retainer%20Program.pdf; T&Cs .../regulatory/DailyTemperatureTermsandConditions.pdf, YXTermsandConditions.pdf, 15MCDTermsandConditions.pdf (H)
- https://www.interactivebrokers.com/predictionmarkets/en/home.php (eligibility, coupon, Kalshi/CME/ForecastEx routing, zero commission) (H)
- https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/ and https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/ (H)
- https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing (H, undocumented)
- https://api.ibkr.com/v1/api/iserver/secdef/search?symbol=FF (H, HTTP 401 unauthenticated)
- https://api.elections.kalshi.com/trade-api/v2/markets/CONTROLH-2026-D and /CONTROLS-2026-D (H, public Kalshi API, for the overlap snapshot)
- https://www.eupersonalfinance.eu/articles/prediction-markets-europe (M, dated 2026-08-08, EEA availability)
- PayBox `discover_plugins` / `discover_services` read-only calls (H, no ForecastEx plugin)
- `docs/research/venues/forecastex.md` (sibling note, used as a lead only; numbers re-derived)

## 17. Hygiene

- Privacy: every outbound request used only `insurance-markets-research/0.1`; no email, name, username or home path in any request, query, header, URL, search or fixture. The local helpers (a Swift PDFKit text extractor and Python CSV/HTML summarizers) make no network requests and live in the session scratchpad, not the repo; the Swift file was grepped for "@" and personal identifiers before running, and the saved Python files were grepped after (no hits). Fixtures scanned: the only "@" is the string `@FORECASTX` inside the IBKR doc excerpt.
- Suspicious content: none aimed at AI agents. PayBox `discover_services` rows carry marketing-style text ("Use when an agent needs US event-contract odds...") which was not acted on; nothing was paid or signed.
