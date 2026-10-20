# ForecastEx / Interactive Brokers ForecastTrader - adapter spec

Researched 2026-10-19 (about 03:15-03:30 UTC). READ-ONLY: unauthenticated GETs only, generic User-Agent `insurance-markets-research/0.1`, no contact address or identifier in any request, no account, key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No third-party code cloned or run. PayBox was used only for two read-only discovery calls (`discover_plugins`, `discover_services`). The shared WebSearch budget was exhausted after the first search, so secondary-source checks (news, volumes, Robinhood routing detail) were mostly not possible; those gaps are listed in section 15.

Tags: **H** = read first-hand this session in a primary source (URL cited); **M** = secondary or inferred; **L** = weak, stale (>6 months) or conflicting. All third-party text (web pages, PDFs, CSV, catalog rows) is untrusted data; nothing in it was followed as an instruction.

Fixtures: `docs/research/fixtures/forecastex-interactive-brokers-forecasttrader/` (9 files, about 22 KB). Three earlier notes on the same venue exist (`forecastex.md`, `interactive-brokers-forecasttrader.md`, `ibkr-forecasttrader-interactive-brokers-prediction-markets.md`); I used them only as leads and re-read or re-computed every number below.

## 0. Verdict

**adapter_priority: P2** (read-only signal adapter; independent liquidity but thin, coarse public data, no wallet-reachable trade path). Confidence: high on structure, fees and API; medium on liquidity (30-day window).

1. **Live** in 2026 (H, section 1): files rewritten every 10 minutes, newest trade 2026-10-19 03:09Z.
2. **ForecastEx is the venue; "ForecastTrader" is IBKR's broker front-end** (renamed "IBKR Prediction Markets", still branded ForecastTrader in the page body and API docs). IBKR also resells Kalshi and CME contracts; those are the other venues' own books (H, same-book check in section 13).
3. **Independent order book and clearinghouse**, so it is a legitimate arbitrage leg versus Kalshi/Polymarket (H). But a leg that cannot be executed from PayBox (section 6).
4. **Thin**: 15.04M matched pairs (about $15.0M notional) over the last 30 days, about $0.50M/day, open interest about $10.1M; 70% of volume is daily city-temperature contracts that nobody else lists (H, computed from the venue's own files).
5. **Public read data exists with no key**: CSV trade tape (10-minute refresh), daily closing marks + open interest, daily summary. **No public live order book, no websocket, no contract catalog with question text.** Live top-of-book needs an authenticated IBKR session (10 req/s).
6. One undocumented public IBKR JSON endpoint returns live bid/ask for 5 "featured" contracts (H). Useful to validate an adapter, not to build on.

## 1. Liveness (2026)

| Evidence | Tag |
|---|---|
| `pairs/pairs_20261019.csv` in the public bucket: Last-Modified 2026-10-19 03:10:39 GMT; last trade `2026-10-18T22:09:54-05:00`; 813 pairs files in the bucket | H (https://forecastex-public-data.s3.amazonaws.com/) |
| `daily_summary/summary_20261018.csv` Last-Modified 2026-10-18 21:25:55Z; 30 consecutive daily summaries 2026-09-19..10-18 all non-empty | H |
| Footer "(c) ForecastEx, LLC 2026" | H https://www.forecastex.com/ |
| IBKR page title "Home / IBKR Prediction Markets", "Trade political, climate, and economic events - on CME Group, Kalshi, and ForecastEx"; old host `forecasttrader.interactivebrokers.com/en/home.php` now 301s to `/predictionmarkets/en/home.php` | H (curl 2026-10-19) |
| Rulebook Last-Modified 2026-09-24; Fee Schedule 2026-05-07; Liquidity Retainer Program 2026-09-24 | H |
| Products filed recently: `Candidate Withdrawal` (2026-08-18), `Fed Upper Range` (2026-08-12); 15-minute crypto filing 2026-10-12 per the earlier note (not re-checked), zero `15MCD*` rows in the 2026-10-18/19 files | H/M |
| Third-party FinFeedAPI lists a ForecastEx feed (2026-08-28 blog), per an existing note in this repo | M |

## 2. Kind and ownership

- **regulated-exchange**: CFTC-registered Designated Contract Market and Derivatives Clearing Organization, single entity; Delaware LLC (H, Rulebook p.1 definitions, governance section; IBKR footer text "ForecastEx is a CFTC-registered Designated Contract Market and Derivatives Clearing Organization").
- **Ownership text is internally inconsistent**: "wholly owned subsidiary of IBG LLC" (governance section) versus "IBG LLC the majority owner and controlling member" (definition 46). IBG/Interactive Brokers Group (Nasdaq: IBKR) controls it either way (H, https://forecastex-public-data.s3.amazonaws.com/regulatory/ForecastEx%20_LLC_Rulebook.pdf).
- **Access is only through an FCM** ("You can trade Forecast Contracts with qualified Futures Commission Merchants"): Interactive Brokers, Robinhood, Advantage Futures (H, https://www.forecastex.com/members/fcms). Direct membership: apply via membership email, $250,000 minimum Clearing Fund in USD cash or T-bills at 99%, one Authorized Trader and two Authorized Representatives (H, https://www.forecastex.com/members).
- IBKR is a **broker with an affiliate relationship**: "Interactive Brokers LLC is a CFTC-registered Futures Commission Merchant and a clearing member and affiliate of ForecastEx LLC" (H, IBKR commissions page). IBKR's own page: orders across "Kalshi, ForecastEx, and CME Group from one unified platform" (H).

## 3. Market model

- **Binary only**: each Forecast Market lists a Yes and a No contract on one Event Question (Rule 401(a), H). Bids $0.01-$0.99, tick $0.01, minimum 1 contract, **Limit bids only** (Rules 401(d), 404(a), H).
- **"Buy-only" paired book (not a normal CLOB)**: a trade executes when the Yes bid and No bid combine to $1.00; both sides then hold a contract with ForecastEx as counterparty (Rule 401(d), H). "ForecastEx is a buy-only exchange, there is no ask" (Liquidity Retainer Program, H). An aggregator should synthesize `yes_ask = 1 - best_no_bid`, `no_ask = 1 - best_yes_bid`. Verified on live data: IBKR JSON shows `ask_yes + bid_no = 1.00` on all 4 ForecastEx rows (H, fixture `ibkr_public_marketing_contracts_20261019.json`).
- **No selling**: positions are reduced by buying the opposite side; IBKR shows this as a Bot execution plus two Netting executions (side "N") (H, IBKR Web API doc). Rulebook Rule 604 nets offsetting positions at the 16:00 CST deadline, settled 09:00 CST next business day (H).
- **Categorical/scalar markets are ladders or sibling binaries**, e.g. `HORC_1126_Democratic` and `HORC_1126_Republican` are two independent binaries (H: their YES closes were 0.89 and 0.09 on 2026-10-18, summing to 0.98, so sibling prices are not linked); `FES_123126_6550` (S&P 500 threshold), `YXHBT_...` (BTC period-high threshold), `FFDEC_102826_E0` (Fed decision outcome), `UHLAX_101926_79` (LA daily high above 79 F). Contract id grammar `{PRODUCT}_{MMDDYY[HH]|MMYY}_{strike|option}` is inferred from the data (M).
- **Conditional contracts** exist (outcome Yes/No/False; if False, price paid minus fees is refunded) (Rule 401(e)(1), 603(a)(1), H).
- **No tokenisation**: positions are ledger entries at ForecastEx's clearinghouse. In IBKR's API they are modelled as options on an artificial index: `secType=OPT`, exchange `FORECASTX`, right Call = Yes, Put = No (H).
- **Session**: the file for trade-date D contains pairs from D-1 16:15 CT to D 16:14:58 CT, with trades in all 24 hours and on Saturday/Sunday (H, computed from `pairs_20261018.csv`: 9,855 trades from 2026-10-17T16:15:27 to 2026-10-18T16:14:58 CT). Treat as 24/7. No official trading schedule found (Rule 402 says it is posted on the website; NOT FOUND, section 15).

## 4. Read API

**There is no official developer API for ForecastEx.** Searched: forecastex.com `/`, `/data`, `/faq`, `/members`, `/markets`, `/members/fcms`; the bucket's `regulatory/`; `/robots.txt`, `/sitemap.xml`, `/api`, `/api/markets` (all 404); IBKR Campus docs. The membership page says nothing on FIX/API (H).

| Surface | Detail | Tag |
|---|---|---|
| **Public data portal** `https://www.forecastex.com/data`, browse UI `https://data.forecastex.com` | "daily and intraday CSV files for event contracts"; only Pairs states a refresh ("refreshed every 10 minutes"); no terms or licence shown | H (WebFetch of /data) |
| **Download endpoint** `GET https://www.forecastex.com/api/download?type={pairs|prices|summary}&date=YYYYMMDD` | `200 text/csv`, `content-disposition: attachment; filename="pairs_20261018.csv"`; body is **byte-identical** to the S3 object (cmp verified); no params returns `400 application/json`. No key, no stated rate limit | H |
| **Public S3 bucket** `https://forecastex-public-data.s3.amazonaws.com/` (us-east-1) with anonymous `?list-type=2&prefix=` listing | Prefixes: `pairs/`, `prices/`, `daily_summary/`, `liquidity_rewards/`, `supplemental_data/`, `regulatory/` (rulebook, fee schedule, per-product T&C PDFs), `product_filings/`, `inactive_product_filings/`, `notices_to_members/`, `disciplinary_filings/`, `logo/`. An extra unlisted-in-portal prefix exists in the root listing; I did not open it | H (fixture `forecastex_bucket_root_listing_20261019.xml`) |
| WebSocket / REST quotes / order book / contract catalog | NOT FOUND (searched: site, bucket, IBKR docs) | - |
| FIX / member API | Not public ("Members must ... comply with all technical and other requirements established by the Exchange", Rule 406) | H for absence |
| **IBKR Web API / TWS API** (authenticated, see section 6) | live top-of-book, history, orders | H |
| **IBKR public marketing JSON** `GET https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing` | Unauthenticated, undocumented, used by IBKR's home page. 5 featured contracts (4 ForecastEx, 1 Kalshi at the time), fields `conid_yes, conid_no, exchange, bid_yes, ask_yes, bid_no, ask_no, last_trade_time, product_name, strike_label, category_name`. `last_trade_time` is the contract's last trading time, not the last trade (1796909340 = 2026-12-10T13:29Z equals the Kalshi `close_time`; 1799096400 = 2027-01-04T21:00Z equals the HORC expiry) | H (fixture) |

**File shapes (all H, fixtures saved):**

- `pairs/pairs_YYYYMMDD.csv` (trade tape, one row per matched pair, about 1 MB/day): `pair_id,event_contract,expiration_date,quantity,yes_price,no_price,pair_time`. Example: `D5XWDPV840C6,UHHOU_101826_74,2026-10-19T01:00:00-05:00,20,0.05,0.95,2026-10-18T16:15:08.865850845-05:00`. `yes_price + no_price = 1.00` on every row; US Central timestamps with offset; today's file rewritten every 10 minutes (1,938 lines at 03:19Z, last trade 10 minutes old). Fixture `forecastex_pairs_20261018_head30.csv`.
- `prices/daily_prices_YYYYMMDD.csv` (about 26k rows, 13,031 contracts x {YES, NO}, 2.3 MB): `event_contract,subtype,expiration_date,date,start_price,high_price,low_price,end_price,settlement_price,pair_quantity,open_interest,vwap`. `end_price` YES+NO = 1.00: it is a closing **mark**, not a bid or ask. `settlement_price` equals the daily mark for live contracts (HORC 0.89) and is **1.00 / 0.00 on the expiry day for resolved contracts** (`UHLAX_101726_89` YES 0.00, NO 1.00; open interest 0 after settlement); 1,595 YES rows carry 0.00/1.00 in the 2026-10-18 file. Fixture `forecastex_daily_prices_20261018_sample.csv`.
- `daily_summary/summary_YYYYMMDD.csv`: `product_id,product_name,product_category,total_pairs` (111 products on 2026-10-18; categories Economic Indicators, Elections, Environmental, Financial Markets, Conditional, Technology, Government). Fixture `forecastex_daily_summary_20261018.csv`.
- **Gap for market linking**: no question text, strike semantics or per-contract category in the CSVs; wording is only in T&C/filing PDFs or authenticated IBKR `secdef/info`. NOT FOUND: a machine-readable contract catalog.

## 5. Docs an implementer needs

- Rulebook (77 pages), Fee Schedule (1 page), Liquidity Retainer Program (5 pages), per-product T&C PDFs: `https://forecastex-public-data.s3.amazonaws.com/regulatory/` (H).
- IBKR: https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/ (event-contract discovery, market data, netting) and https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/ (auth, rate limits) (H, fetched with curl; WebFetch gets 403 from this host).

## 6. Trade path and PayBox reachability

- **Exchange side**: all bids enter via an Authorized Trading User of a Member; customers must go through their FCM; automated systems "must have a User ID" (Rules 403(a), 406, 506(i), H). Protocol not public.
- **Practical programmatic path = IBKR Web API / TWS API** (H, event-contracts doc):
  - Discovery: `GET https://api.ibkr.com/v1/api/iserver/secdef/search?symbol=FF`, then `/iserver/secdef/strikes?conid=...&exchange=FORECASTX&sectype=OPT&month=SEP24`, then `/iserver/secdef/info?...&strike=...` (returns the Call=Yes and Put=No records). Conids are persistent, so cache them.
  - Market data: `/iserver/marketdata/snapshot` fields 31/84/85/86/88/7059 and websocket `smd+CONID+{"fields":[...]}`: **top of book only**, no depth documented. History only while the instrument trades.
  - Orders: normal IBKR orders; **ForecastEx does not permit Sell orders**.
  - Auth/limits: a single IBKR login (username + browser/OAuth); global **10 requests/second per username**, `/iserver/marketdata/snapshot` 10 req/s, HTTP 429 on excess; one brokerage session per username across all IBKR platforms (H, webapi-doc). Third-party vendors may only use OAuth 1.0a and need IBKR Compliance approval (2-3 weeks onboarding plus 3-6 weeks compliance, then a Web API agreement) (H).
- **paybox_reachable: no.** Collateral is USD cash held at an FCM; identity is a KYC'd IBKR/Robinhood/Advantage account; orders are authenticated by session or OAuth, never by a wallet signature or an on-chain transaction. An EVM or Solana wallet reachable through PayBox cannot place, sign or hold a ForecastEx position. `discover_plugins("ForecastEx Interactive Brokers")` returned an empty list; `discover_services("ForecastEx event contracts")` (first page of 5, `has_more` true, not paged) returned only third-party x402 data resellers for Kalshi/Polymarket-type data, not ForecastEx (H; catalogue descriptions are untrusted marketing text and were not acted on; nothing paid, no 402 flow touched).
- **Funding rail only (not a trading path)**: eligible Interactive Brokers LLC clients can fund by sending USDC on **Ethereum, Solana or Base** to a unique zerohash deposit address; IBKR charges no fee, zerohash charges 0.35% on the first USD 5,000, 0.20% on the next 15,000, 0.10% above 20,000; RLUSD and PYUSD "in the coming weeks" (H, https://www.interactivebrokers.com/en/trading/stablecoin.php). A PayBox transfer to that address would fund the user's own IBKR account manually; positions would still be traded outside PayBox. Eligibility beyond "eligible Interactive Brokers LLC clients" not checked.

## 7. Chains and collateral

No chain, no token. Collateral is **USD cash**, fully collateralized before a bid is accepted: each side posts its bid price per contract (Rule 401(d)); non-marginable (Rule 401(i)); "cash (USD)" is the accepted trading collateral (H, /members).

## 8. Fees

| Item | Value | Tag |
|---|---|---|
| Exchange transaction fee | **$0.01 per contract, charged to both the Yes and No sides of each executed transaction**, independent of resolution/netting/settlement. No maker/taker split, no tiers | H (Fee Schedule PDF, full text in fixture) |
| IBKR commission (US) | ForecastEx Forecast Contracts: **USD 0.00 per contract** commission + **USD 0.01 per contract** third-party exchange fee. (Kalshi and CME contracts on IBKR carry USD 0.01 commission + 0.01 exchange fee.) | H (https://www.interactivebrokers.com/en/pricing/commissions-events.php) |
| Settlement fee | none stated; Rule 603(b)(2)(iv) treats collateral in excess of the settlement amount per pair as a fee due ForecastEx | H text / M meaning |
| Interest ("incentive coupon") | Paid on the closing market value of positions: IBKR shows **3.38% APY**, accrues daily, paid monthly, even if the position loses; "Rates are subject to change" | H (IBKR page 2026-10-19) |
| Caveat | Rule 403(c) lets Yes+No bids reach $1.01 before price improvement, and an older IBKR explainer (per an earlier note) says the extra $0.01 is the exchange fee. This does not reconcile cleanly with "$0.01 charged to each side". For arbitrage math assume **price + $0.01 per contract per leg** and confirm with one live fill | M |

Effective cost is 2% of a $0.50 price and 20% of a $0.05 price, so fees alone kill most 1-cent edges. The coupon (about 3.38% APY on value held) partly offsets carry on long-dated legs (contracts run to 2031).

## 9. Resolution and dispute risk

- **Rule-based, exchange-resolved; no oracle, no token.** Each product's T&C names a Source Agency and Underlying (H). Examples: daily temperature resolves "based solely on the final daily" **Weather Underground** values for the named station, final once the next day's first observation is published, and no other weather source is used (DailyTemperatureTermsandConditions.pdf, H); S&P/Nasdaq threshold contracts use the CME E-mini daily settlement; crypto highs/lows use CF Benchmarks Real-Time Index; House control uses Congress.gov with an early-resolution clause tied to AP/NYT/WSJ calls (earlier note, M, not re-read).
- **Discretion is wide** (H, Rules 413-415, 603): ForecastEx may designate a new Source Agency after trading starts (413(a)); accelerate or delay settlement if the question "cannot be answered accurately" and then pay by last price or a committee "fair allocation" (414); or open an Event Review whose Committee determination is "final" and "not subject to review" (415). "Settlement is irrevocable and unconditional" (603(e)). Settlement runs daily at 13:00 CST for resolved contracts; netted pairs settle 09:00 CST next business day.
- Disputes: Rulebook arbitration and discipline chapters; public disciplinary filings under `disciplinary_filings/` (listed, not read).
- **Basis risk across venues is the main arb hazard**: source agencies and early-resolution rules differ from Kalshi/Polymarket wording for the same headline question. A scanner must compare resolution text, not titles (M for the other venues' wording, which I did not read).

## 10. Geo, ToS, automation

- **Eligibility via IBKR** (H, https://www.interactivebrokers.com/predictionmarkets/en/home.php): "only available to eligible clients, 21 years and older, of Interactive Brokers LLC, Interactive Brokers Canada Inc., Interactive Brokers Hong Kong Limited, Interactive Brokers Ireland Limited and Interactive Brokers Singapore Pte. Ltd."; election contracts "only available to eligible US residents"; availability varies by affiliate and country. Robinhood and Advantage Futures eligibility: NOT FOUND (searched: forecastex.com FCM page, robinhood.com/us/en/about/futures/ which does not mention ForecastEx).
- The FCM decides whether a customer is qualified (Rule 304, H). Members may not have OFAC SDN owners (/members, H).
- **Automation**: documented and allowed through the IBKR APIs (they publish order flow for FORECASTX), subject to IBKR's API terms and the exchange rule that each automated system carries a User ID (506(i)). Manipulation, wash-type "non-competitive" and pre-arranged fills are prohibited (Rule 509, H).
- **Data licence**: Rule 411(a) lets recipients of exchange information "redistribute such information only to such extent and in such manner as may be permitted by the Board". The public data page shows no licence or terms (H). Internal signal use looks low risk; republishing needs permission (M, not legal advice).
- Not blocked by US-person rules in the way crypto venues are, but KYC-bound and unusable from an anonymous wallet.

## 11. Liquidity (all H, computed by me from the venue's own files; 1 matched pair = $1.00 notional because `yes_price + no_price = 1.00`)

- **30-day matched volume, 2026-09-19..2026-10-18: 15,040,257 pairs (about $15.0M)**; average 501k/day (daily min 270k, max 915k); last 7 days average 491k/day. 2026-10-18 (Sunday): 342,558 pairs from 9,855 trades (median 10 contracts, p90 50, max 10,000).
- **Open interest, 2026-10-18 close: 10,128,764 pairs (about $10.1M)** over 13,031 contracts. Top products: `HORC` House control 2.60M, `YXLBT` BTC period-low 1.50M, `YXHBT` BTC period-high 1.17M, `FES` S&P 500 0.49M, `PCD` 0.31M, `SENM` Senate majority 0.31M, `YXHXR` 0.24M, `YXHET` 0.23M, `FFDEC` Fed decision 0.22M.
- **30-day volume by category**: Environmental (weather) 10.48M (70%; LA daily high alone 4.97M), Financial Markets 3.00M (20%), Elections 1.03M (7%), Economic Indicators 0.52M (3.5%), Conditional/Technology/Government under 0.002M.
- **Top-of-book depth** (IBKR JSON, 2026-10-19 03:21Z): House D bid 0.89 / ask 0.91; Senate D 0.64 / 0.66; typical spread 2 cents (versus Kalshi 1 cent on the same House market). Size at the touch is not exposed publicly.
- **Market makers/incentives**: Rules 416-417 and a Liquidity Retainer Program (max three market makers per program, two-sided quote obligations); the FAQ line "There are no specialists, market makers" conflicts with these and is marketing (H). Affiliates (IBKR group) may quote but fill last at each price level (Rule 405(b), H).
- Third-party volume claims (for example a review quoting about $6.2M/day for May 2026) are L and about 12x my measurement; I could not reconcile them. Use the first-hand numbers.

## 12. Event categories that overlap other venues (where arbitrage can exist)

ForecastEx side H; the other venue's side is M except where a snapshot was taken.

| ForecastEx products (30d pairs) | Overlap | Notes |
|---|---|---|
| `HORC` House control, `SENM` Senate majority, state Senate/governor/House races (Elections 1.03M) | Kalshi (`CONTROLH-2026-D`, `CONTROLS-2026-D`), Polymarket, PredictIt | Snapshot 2026-10-19: House D ForecastEx 0.89/0.91 vs Kalshi 0.901/0.902 (no edge); Senate D ForecastEx 0.64/0.66 vs Kalshi 0.62/0.63 (gross 1 cent buying Kalshi Yes + ForecastEx No = 0.99, below the $0.01 ForecastEx fee plus Kalshi's fee, so no net edge). Resolution wording differs (H for ForecastEx rule, wording of other venues not compared). Fixture `overlap_snapshot_20261019.txt`. |
| `FFDEC` Fed decision, `FF` target rate, `CPIY`/`CPIC`, jobs, GDP, unemployment (Economic 0.52M) | Kalshi macro, Polymarket Fed markets | ForecastEx's original niche; long-dated ladders thin. |
| `YXHBT`/`YXLBT`/`YXHET`... crypto period high/low (BTC high+low 0.73M, all YX*/CF* crypto about 1.04M, computed) | Kalshi and Polymarket crypto threshold markets | CF Benchmarks RTI trimmed-mean source differs from other venues' spot references. |
| `FES` S&P 500 (1.12M), `FNQ` Nasdaq 100 (0.54M), metals, copper | Kalshi index/commodity brackets | Settles on CME E-mini daily settlement. |
| City daily/hourly temperature (`UH*`, `UL*`, `HRU*`; about 10.5M, 70% of volume) | Kalshi daily-high temperature (Kalshi also lists weather) | Largest volume but resolves on Weather Underground, which is likely a different data source than Kalshi's; heavy basis risk. |
| Sports | None found | No sports category in any of the 30 daily summaries (H); three "Sports Ruling" legal-outcome filings were moved to `inactive_product_filings/` on 2026-05-27 (H). |

## 13. Shared liquidity

- **ForecastEx itself is independent**: its own match engine and clearinghouse; ForecastEx is the counterparty to each side (Rule 401(d)); IBKR, Robinhood and Advantage Futures are order routers into the same book (H). It does not mirror Kalshi or Polymarket.
- **IBKR/ForecastTrader is NOT independent of its other two venues**: for KXCPIYOY-26NOV-T3.8, IBKR's public JSON (bid_yes 0.68, ask_yes 0.73, bid_no 0.27, ask_no 0.32) matched Kalshi's own public API to the cent (H, fixture `overlap_snapshot_20261019.txt`). So treat IBKR as ForecastEx + a relay of Kalshi + CME; never count IBKR Kalshi quotes as a second Kalshi source.
- Robinhood and IBKR flow into the same ForecastEx book; only one ForecastEx leg exists in an aggregator, however many brokers sit in front of it (H for rulebook structure; Robinhood's exact routing for ForecastEx contracts: M, from earlier notes in this repo).

## 14. Adapter recommendation

- **Signal-only adapter (P2), no key needed**:
  1. Poll `https://forecastex-public-data.s3.amazonaws.com/pairs/pairs_<trade-date>.csv` every 10 minutes (HEAD + Last-Modified/ETag first), dedupe on `pair_id`. Trade date rolls at 16:15 CT; use the previous day's file around the rollover. Emit last-trade Yes price (No = 1 - Yes).
  2. Once per day after about 21:25Z ingest `daily_prices_<date>.csv` (open interest, closing marks, final 1.00/0.00 on expiry) and `summary_<date>.csv` (category per product).
  3. Contract mapping to other venues must be curated by hand from T&C PDFs (no catalog); start with `HORC`, `SENM`, `FFDEC`, `YXHBT/YXLBT`, `FES`, `FNQ`.
  4. Mark all of it stale-by-design: last trades up to 10 minutes old, closing marks are not quotes. Never emit an executable edge from these files alone.
- Optional read upgrade for an operator who already holds an IBKR account: top-of-book via the Web API websocket (10 req/s cap). Not suitable for a hosted multi-user service (OAuth 1.0a third-party approval needed).
- **Do not** build a PayBox order-placement adapter: no wallet path.

## 15. NOT FOUND and open questions

- NOT FOUND (searched: forecastex.com pages, bucket, IBKR docs/pages): official API docs; websocket or REST quote feed; machine-readable contract catalog with question text; trading schedule (Rule 402 says it is on the website); data terms/rate limits for the public files; Robinhood/Advantage Futures programmatic access and eligibility; cumulative volume statistics in IBKR/ForecastEx filings (IBKR's own page says highest-open-interest data "is not available").
- Not done because the search budget ran out: news search for October 2026 changes, Q3 2026 IBKR earnings remarks on prediction-market volume, Robinhood routing confirmation, IBKR stablecoin eligibility limits.
- Fee reconciliation (Fee Schedule "$0.01 each side" versus the $1.01 language) needs a live fill.
- Whether `15MCD*` (15-minute crypto) contracts will trade and with what depth: filing dated 2026-10-12, no rows yet.
- Contract-level size at the touch (only prices appear in the public JSON).
- I did not open the unlisted bucket prefix visible in the root listing, on purpose.

## 16. Sources

H = read first-hand this session.
- https://www.forecastex.com/ , /data , /faq , /members , /members/fcms , /markets (H; WebFetch and curl, 2026-10-19)
- https://www.forecastex.com/api/download?type=pairs&date=20261018 and `type=summary` (H; CSV, headers in fixture)
- https://forecastex-public-data.s3.amazonaws.com/ (anonymous listings and files: `pairs/`, `prices/`, `daily_summary/`, `product_filings/`, `inactive_product_filings/`, `notices_to_members/`) (H)
- https://forecastex-public-data.s3.amazonaws.com/regulatory/ForecastEx%20_LLC_Rulebook.pdf ; .../ForecastEx_Fee_Schedule.pdf ; .../ForecastEx%20Liquidity%20Retainer%20Program.pdf ; .../DailyTemperatureTermsandConditions.pdf (H; text extracted locally with PDFKit)
- https://www.interactivebrokers.com/predictionmarkets/en/home.php (H, curl) ; https://www.interactivebrokers.com/en/pricing/commissions-events.php (H) ; https://www.interactivebrokers.com/en/trading/stablecoin.php (H)
- https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/ and .../webapi-doc/ (H)
- https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing (H; undocumented public JSON)
- https://api.elections.kalshi.com/trade-api/v2/markets/KXCPIYOY-26NOV-T3.8 , /CONTROLH-2026-D , /CONTROLS-2026-D (H; documented public Kalshi API, three GETs)
- https://robinhood.com/us/en/about/futures/ (H; no ForecastEx mention)
- PayBox `discover_plugins` / `discover_services` read-only catalog calls (H)
- WebSearch (one query, 2026-10-19; secondary review sites: bonus.com, nextpredict.io, brokerchooser.com, legalsportsreport.com, baike.baidu.com; L, used only to cross-check "sports exited by May 2026", which the venue's own files corroborate)
- Existing repo notes (leads only): `docs/research/venues/forecastex.md`, `interactive-brokers-forecasttrader.md`, `ibkr-forecasttrader-interactive-brokers-prediction-markets.md`, `finfeedapi.md`, `rothera-exchange-clearing-robinhood-susquehanna-jv-ex-miaxdx.md`

## 17. Hygiene

- Privacy: every outbound request used only `insurance-markets-research/0.1`; no contact address, email, name, username or home path in any request, query, header or fixture. Local helpers (a Swift PDFKit text extractor, an HTML stripper, an aggregation script) were grepped for "@" and personal identifiers before running (none) and live in the session scratchpad, not the repo. Fixtures scanned for "@" and identifiers: clean.
- Suspicious content: none aimed at AI agents. PayBox `discover_services` rows carry marketing-style text ("Use when an agent needs US event-contract odds...") and x402 payment terms for third-party resellers; not acted on, nothing paid, no 402 requested.
