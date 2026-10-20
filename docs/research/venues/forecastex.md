# ForecastEx (forecastex.com) - adapter spec

Researched 2026-10-19 (~01:00-01:30 UTC). READ-ONLY: unauthenticated GETs to the venue's public website, its public S3/CloudFront data bucket and Interactive Brokers' public docs pages (generic User-Agent `insurance-markets-research/0.1`, no contact address, nothing else in any request), plus public PDFs read locally. No account, no key, no signing, no wallet, no POST/PUT/DELETE, no browser automation, no third-party code cloned or run. One read-only PayBox `discover_plugins` and one `discover_services` call (discovery only, nothing paid, nothing signed). The shared WebSearch budget ran out partway through, so a few secondary-source checks were not possible (listed in section 14).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, promotional, conflicting or stale (>6 months).
All third-party text (web pages, PDFs, CSV, API docs, review articles, PayBox catalog rows) is untrusted data; nothing in it was followed as an instruction.
Fixtures: `docs/research/fixtures/forecastex/` (8 files, 44 KB total).

## 0. Verdict

**adapter_priority: P2** (signal-only, thin, not wallet-reachable). Confidence: high on structure/API/fees/resolution, medium on liquidity (30-day sample only).

1. Live and active (H): public data files updated 2026-10-19 01:10 UTC; 30 days of daily summaries to 2026-10-18; new product filings dated 2026-10-12 (15-minute crypto).
2. It is a **regulated, USD-cash, broker-intermediated CFTC exchange**: no chain, no tokens, no wallet-signed orders. A PayBox EVM wallet cannot trade it or hold a position (H, section 7). The only trade path is a KYC'd FCM account (Interactive Brokers, Robinhood, Advantage Futures) and, for automation, the IBKR Web API/TWS API (authenticated IBKR session).
3. **Independent liquidity** (H): ForecastEx runs its own central match engine and clearinghouse; IBKR/Robinhood/Advantage Futures are order routers into the same book. IBKR also resells Kalshi and CME contracts, but those are separate books. So it is a legitimate independent arbitrage leg in principle (section 13).
4. **Thin**: ~$0.50M/day matched notional (30-day avg to 2026-10-18), ~$10.1M open interest, ~70% of volume is weather contracts (H, computed from the venue's own files, section 11).
5. **Read access without an account is real but coarse**: unauthenticated CSV downloads (daily closing marks + open interest per contract, daily summary, and a trade-pair tape refreshed every 10 minutes). There is **no public live order book, no quote feed, no websocket and no machine-readable question text** (section 4). Live top-of-book exists only through an authenticated IBKR session (10 req/s, top-of-book only).
6. Worth a cheap **signal adapter** (static CSV over HTTPS, no key) for macro/election/crypto-threshold/equity-index overlaps. Do not plan a trading adapter inside PayBox.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `pairs/pairs_20261019.csv` in the public bucket | Last-Modified 2026-10-19 01:00:39 GMT then 01:10:39 GMT on re-check (10-minute refresh); 813 pairs files, 2024-08-01 onward | H (https://forecastex-public-data.s3.amazonaws.com/) |
| Daily summaries | 658 files; newest `summary_20261018.csv` (Last-Modified 2026-10-18 21:25 UTC); 30 days 2026-09-19..10-18 all non-empty | H |
| Newest product filing | `15 Minute Cryptocurrency Forecast Contract.pdf` and `15MCDTermsandConditions.pdf`, both 2026-10-12 | H |
| Notices to Members | `NTM_2026-263.pdf` dated 2026-10-16 | H |
| Rulebook | `ForecastEx _LLC_Rulebook.pdf` Last-Modified 2026-09-24 (77 pages) | H |
| Site footer | "(c) ForecastEx, LLC 2026" | H https://forecastex.com |
| First data file | `pairs_20240801.csv`, consistent with a mid-2024 launch; CFTC DCM/DCO designation 2024-06-24 (MarketsWiki, sponsored page, last edited 2026-04-09) | H for first file, M for date |
| Third-party reviews | Exist (tech-insider.org, dated 2026-05-26, "as of August 2026") but are promotional and internally inconsistent; not relied on | L |

## 2. What it is

- **Kind**: regulated-exchange (CFTC-registered Designated Contract Market **and** Derivatives Clearing Organization, one entity). Delaware LLC, **wholly owned subsidiary of IBG LLC** (Interactive Brokers group). H: Rulebook Rule 201 and Rule 101 definition of Affiliate (rulebook PDF in the bucket). Founder/Chairman quote on /about is Interactive Brokers' chairman (H https://forecastex.com/about).
- Calls its contracts "Forecast Contracts". CFTC-regulated, traded only via FCMs (H, https://forecastex.com, /faq).
- **FCMs listed (H, https://forecastex.com/members/fcms)**: Interactive Brokers (ForecastTrader), Robinhood (futures), Advantage Futures. Membership direct to the exchange requires an application (FCM or non-FCM member; one Authorized Trader and two Authorized Representatives; no OFAC SDN owners; $250,000 minimum Clearing Fund deposit in cash or T-bills at 99%) (H, /members).
- **Sports**: no sports-outcome products in any of the 30 daily summaries (7 categories only: Economic Indicators, Elections, Environmental, Financial Markets, Conditional, Technology, Government) and none in the product-filing file names I scanned. Three "Sports Ruling" legal-outcome contracts (Third/Fourth/Ninth Circuit) were moved to `inactive_product_filings/` on 2026-05-27. This is consistent with the hint that sports was dropped by May 2026 but does not prove it; tech-insider says sports listings launched in late 2025 (L). Treat as "no sports today" (H for today).

## 3. Market model

- **Binary only**, quoted as paired **Yes** and **No** contracts on the same event question ("Each Forecast Market lists a Yes Forecast Contract and a No Forecast Contract", Rule 401(a)). H.
- **"Categorical" and "scalar" events are ladders/sets of independent binaries**, one per strike or option, e.g. `HORC_1126_Democratic` and `HORC_1126_Republican` (two separate binaries on the same question), `YXHBT_123126_100000` (BTC period-high exceeds $100,000), `FFDEC_102826_E25`/`_H50` (Fed decision outcomes), `UHLAX_101726_89` (LA daily high > 89F). No neg-risk style linkage between sibling binaries in the data; Rule 608(c) lets the clearinghouse net exposure across mutually exclusive markets for collateral only. H (CSV naming) / M (suffix meaning such as `E25`/`H50` is inferred, not documented).
- **Buy-only order book**: "ForecastEx is a buy-only exchange, there is no ask" (Liquidity Retainer Program doc, H). Participants **bid** for Yes or for No between $0.01 and $0.99; a trade occurs when the Yes bid and the No bid together reach $1.00 and the exchange "pairs" them. Price-time priority, **Limit bids only** (Rule 404(a)), tick $0.01, minimum size 1 contract, can cancel/modify until filled (Rules 401(d), 403(c), 404, 405). H.
  - A Yes bid at p is economically a No ask at 1-p. An aggregator should synthesize a conventional book: `yes_ask = 1 - best_no_bid`, `no_ask = 1 - best_yes_bid`.
  - Aggressive bids that cross are executed against the best resting bid and price-improved so the pair sums to $1.00 (Rule 403(c)). H.
  - **You cannot sell.** To exit, buy the opposite contract; holding both Yes and No in one market is netted (Rule 604; $1.00 credited per offset pair at the 16:00 CT netting deadline, settled 09:00 CT next business day). IBKR reports netting as separate execution rows. H (Rule 604, IBKR docs).
  - RFQ system (Rule 419) and block trades (Rule 418, default minimum 25,000 contracts, ECP only) exist for members. H.
- **Tokenisation**: none. Positions are ledger entries at the ForecastEx clearinghouse; ForecastEx is the counterparty to each side ("The Market Participant who Bid for Yes executes a Contract with ForecastEx", Rule 401(d)). H.
- Conditional contracts exist (outcome Yes/No/False; if False, positions are refunded what they paid minus fees, Rule 603(a)(1)), e.g. `ZSENMUSR` (Senate majority -> recession). H.

## 4. Read API

No official developer API documentation exists on forecastex.com (NOT FOUND, searched: /, /data, /markets, /members, /faq, /regulatory, /about/how-forecast-contracts-work, the bucket's regulatory/ and notices_to_members/ prefixes, web search). What exists:

| Surface | Status | Tag |
|---|---|---|
| **Public data portal** `https://forecastex.com/data` (UI) and `https://data.forecastex.com` (S3 listing UI over bucket `forecastex-public-data`, us-east-1, CloudFront) | Public, **no auth**, no stated rate limit, no stated license/terms | H |
| Download endpoint `GET https://forecastex.com/api/download?type={pairs|prices|summary}&date=YYYYMMDD` | `200 text/csv`, `content-disposition: attachment; filename="prices_20260923.csv"`. Site text: "daily and intraday CSV files ... refreshed every 10 minutes". 2.27 MB for a prices day. Fixture `api_download_prices_20260923_head.csv`. | H |
| Bucket `https://forecastex-public-data.s3.amazonaws.com/` with anonymous `?list-type=2&prefix=` listing | Prefixes: `pairs/`, `prices/`, `daily_summary/`, `liquidity_rewards/`, `supplemental_data/` (hurricanes), `regulatory/` (rulebook, fee schedule, per-product T&C PDFs, KID PDFs in 11 languages), `product_filings/`, `inactive_product_filings/`, `notices_to_members/`, `disciplinary_filings/`, `logo/`. Fixture `s3_bucket_root_listing.xml`. | H |
| Websocket / streaming / REST quotes / order book | NOT FOUND (searched: site, bucket, docs, web search). | - |
| FIX / member API spec | Not public; "contact membership@ / info@" (rulebook only says Members must keep a secure connection and follow "technical and other requirements established by the Exchange", Rule 406). NOT FOUND as a document. | H for absence |
| Broker path: IBKR Web API / TWS API | Public docs, but every call needs an authenticated IBKR session (section 6). | H |

**Files and shapes (all H, fixtures saved):**

- `pairs/pairs_YYYYMMDD.csv` (trade tape; one row per matched Yes/No pair; ~1 MB/day): `pair_id,event_contract,expiration_date,quantity,yes_price,no_price,pair_time`. Example row: `D5DFVNRJT0C6,UHLAX_101726_89,2026-10-18T03:00:00-05:00,224,0.38,0.62,2026-10-17T16:15:27.466142085-05:00`. Timestamps are US Central with offset, nanosecond precision. `yes_price + no_price = 1.00` on all 9,855 rows of 2026-10-18. File for "today" is rewritten every 10 minutes (so the tape lags up to ~10 min). Fixture `pairs_20261018_head.csv`.
- `prices/daily_prices_YYYYMMDD.csv` (~26k rows, ~13k contracts x {YES,NO}): `event_contract,subtype,expiration_date,date,start_price,high_price,low_price,end_price,settlement_price,pair_quantity,open_interest,vwap`. `end_price` for YES and NO always sum to 1.00 in every sampled row, so it is a **closing mark / "daily closing value" (the basis for the incentive coupon), not an executable bid or ask** (M, inferred from the data plus the FAQ's coupon text). `open_interest` is pairs outstanding (same on the YES and NO rows). `pair_quantity` is that day's matched pairs. On the expiry day `settlement_price` shows `1.00`/`0.00` for resolved binaries (blank until resolved; checked on the 2026-09-23 file: 1,078 rows each of 1.00 and 0.00) (M). Fixture `daily_prices_20261018_sample.csv` (60 curated rows).
- `daily_summary/summary_YYYYMMDD.csv`: `product_id,product_name,product_category,total_pairs` (111 products on 2026-10-18). Fixture `daily_summary_20261018.csv`.
- `liquidity_rewards/rewards_YYYYMMDD.csv`: `product_id,product_name,target_size,eligible_liquidity_rewards` (daily reward pool per product, unit not stated, e.g. HORC 50.14 and FES 50.05 on 2026-10-16). Fixture `liquidity_rewards_20261016.csv`.
- **Contract id grammar (inferred from data, L/M)**: `{PRODUCT}_{MMDDYY[HH]|MMYY}_{strike-or-option}`; product codes are documented only in per-product T&C PDFs (`regulatory/<CODE>TermsandConditions.pdf`).
- **Gap that matters for market linking**: the CSVs carry no question text, no strike semantics and no category per contract (category only per product in the summary). Question wording is only in the T&C/filing PDFs or, authenticated, in IBKR `secdef/info` descriptions. NOT FOUND: a machine-readable contract catalog.

## 5. Docs index (what an implementer should read)

- Rulebook (77 p), fee schedule (1 p), Liquidity Retainer Program (5 p), risk disclosure (5 p), and ~280 T&C PDFs, all under `https://forecastex-public-data.s3.amazonaws.com/regulatory/`. H.
- IBKR Campus "Event Contracts in the Web API" (https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/) and "TWSAPI Methods Event Trading" (page exists; I read only the Web API one). H.

## 6. Trade path

- **Exchange side (H, Rules 403, 406, 506)**: all bids enter the Exchange Platform by electronic transmission from an **Authorized Trading User** of a Member; customers must route through their FCM Member or Sponsored FCM; "each trading system that automates the generation and routing of Bids to the Exchange must have a User ID" (Rule 506(i)). Direct access = become a Member (application, $250k clearing fund). Protocol/spec not public.
- **Practical programmatic path for an outsider: IBKR** (H, IBKR Campus docs, fetched 2026-10-19):
  - ForecastEx instruments are modeled as **options**: `secType=OPT`, exchange `FORECASTX` (no final E), currency USD, **right Call = Yes, Put = No**, symbol = product code, strike = threshold, an artificial underlying index per product (`secType=IND`).
  - Discovery: `GET https://api.ibkr.com/v1/api/iserver/secdef/search?symbol=FF` -> index conid; `GET /iserver/secdef/strikes?conid=...&exchange=FORECASTX&sectype=OPT&month=SEP24`; `GET /iserver/secdef/info?conid=...&exchange=FORECASTX&sectype=OPT&month=...&strike=...` returns the Yes and No conids. Doc sample copied to fixture `ibkr_webapi_event_contracts_doc_excerpt.txt` (NOT a live response).
  - Market data: `GET /iserver/marketdata/snapshot?conids=...&fields=31,84,85,86,88,7059` (last, bid, ask size, ask, bid size, last size) and websocket topic `smd+CONID+{"fields":[...]}`: **top of book only**; no depth documented (NOT FOUND, searched IBKR docs). History: `GET /iserver/marketdata/history`.
  - Orders: normal IBKR orders; **no Sell orders**, positions reduced by buying the opposite contract; netting shows as `side:"N"` executions. Executions on the websocket `str` topic.
  - Auth/limits: IBKR Web API session (OAuth 1.0a / OAuth 2.0 beta for first-party; Client Portal Gateway), one brokerage session per username, **10 requests/second global per session**, `/iserver/marketdata/snapshot` 10 req/s, `/iserver/marketdata/history` 5 concurrent, HTTP 429 on excess (https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/). Requires an approved IBKR account with event-contract permission; not available to this run.
- Robinhood and Advantage Futures: no ForecastEx API found. NOT FOUND (searched: forecastex.com FCM page, web search; page budget exhausted before a second check).
- A tech-insider review claims "TWS API, FIX and Web API" access (L, unsourced); only the IBKR TWS/Web API part is confirmed above.

## 7. Chains, collateral, and PayBox reachability

- **Chain: none.** Collateral: **USD cash**, fully collateralized before any bid is accepted ("cash is the accepted trading collateral", /members; Rules 608-609; non-marginable, Rule 401(i)). Collateral and positions live on ForecastEx's books and the FCM's customer segregated accounts. H.
- **paybox_reachable: no.** PayBox's wallets sign on-chain transactions or typed-data orders; ForecastEx has no on-chain component, no signed-order API and no wallet-based account. Orders must come from an FCM's Authorized Trading User on behalf of a KYC'd customer. H for the structure. PayBox discovery found no plugin (`discover_plugins` "ForecastEx Interactive Brokers prediction market" -> empty list) and no ForecastEx service (`discover_services` "ForecastEx event contracts" -> first page only, third-party x402 data resellers, not ForecastEx; `has_more` true, not paged). H.
- Funding an IBKR account from crypto, if IBKR offers it, would be an IBKR-side off-ramp and would not make the position PayBox-tradable. I could not verify any IBKR stablecoin funding (page returned 403; search budget exhausted). Unknown.

## 8. Fees

| Item | Value | Tag |
|---|---|---|
| Exchange transaction fee | **$0.01 per contract, charged to both the Yes and the No side of each executed transaction**, independent of resolution/netting/settlement. | H (https://forecastex-public-data.s3.amazonaws.com/regulatory/ForecastEx_Fee_Schedule.pdf, 1 page) |
| Same fee on the site FAQ | "$0.01 transaction fee per contract, charged to each side at execution" | H (/faq) |
| IBKR explanation | "trade occurs ... the bid for Yes and the No sums to $1.01, with the additional $0.01 serving as exchange fee" | H (IBKR learn page) - **conflicts or is incompletely reconcilable** with "both sides pay $0.01" (would make a pair cost $1.02) and with Rule 401(d) ("combined Bids ... equal $1.00"). For arbitrage math assume $0.01 per contract on your own leg and confirm with a live fill. |
| Broker commission | IBKR: event contracts "zero-commission" ("start as low as $0.01 per contract" = the exchange fee) | H (IBKR prediction-markets page) |
| Maker/taker | The fee schedule has no maker/taker or price tiers. A tech-insider review claims maker $0 and tiered taker $0.01-$0.10 | L, contradicted by the official schedule; ignore |
| Settlement fee | None stated in the fee schedule; Rule 603(b)(2)(iv) treats excess collateral over the settlement amount per pair as a fee (Rule 308) | H (text) / M (meaning) |
| Interest | **Incentive Coupon**: 100% of earnings on collateral passed to Members monthly, in proportion to collateral (/faq); IBKR pays it to customers on the daily closing value of positions, **3.38% APY currently**, accrues daily, paid monthly, even if the position loses. | H (IBKR page 2026-10-19). Matters for long-dated carry: contracts run out to 2031 (e.g. `ACD_1230_...` expires 2031-01-05) |

Effective cost: $0.01 per contract is 2% of a $0.50 price and 20% of a $0.05 price, so it is large relative to edge on long shots. Plus the coupon offset (3.38% APY on value held).

## 9. Resolution mechanism and dispute risk

- **Source-agency, rule-based, exchange-resolved** (no oracle, no token). Each T&C names a "Source Agency" and underlying. H. Examples:
  - **Weather** (`UH*`, `UL*`, `HRU*`): the final Daily Observations table value for the named station on **Weather Underground** (not NWS/NOAA), final once the first observation of the next calendar day is published. (DailyTemperatureTermsandConditions.pdf.) Note the wording that no other Weather Underground view or source is used. H.
  - **Crypto thresholds** (`YXH/YXL**`): CF Benchmarks Real-Time Index, per-minute trimmed mean (drop top and bottom 20%), highest/lowest over the period; resolution 11:59 PM CT on the last day; subject to early resolution. **15-minute crypto "up or unchanged"** (`15MCD***`, new 2026-10-12; BTC, ETH, SOL, XRP, ADA, DOGE): 60-second average of CF RTI at period end vs 60-second average at period start; "greater than or equal" resolves Yes. No data rows seen yet for `15MCD*`. H (T&C PDFs).
  - **US House control** (`HORC`): party with >= 218 seats on Jan 3 of the following year per Congress.gov; early resolution if AP, NYT and WSJ have all called every House race and no recount/legal challenge is pending. **S&P/Nasdaq** (`FES`/`FNQ`): CME E-mini daily settlement (lead month) from the CME bulletin, resolves 10:00 CT next business day. **Fed decision** (`FFDEC`): FOMC target-range change at 1:00 PM CT. H.
- **Discretionary powers (H, Rulebook 413-415, 603)**: ForecastEx may change the Source Agency after trading starts (413(a)), accelerate or delay settlement if the event "cannot be answered accurately" and then use last prices or a committee-determined "fair allocation" (414), or open an **Event Review** (415) in which the Event Review Committee's determination is "final" and "not subject to review". Settlement is "irrevocable and unconditional" (603(e)); resolved contracts settle daily at 13:00 CST (603(b)(3)).
- Disputes: Chapter 8 of the Rulebook (arbitration) and Chapter 7 (discipline); disciplinary filings are public (`disciplinary_filings/`, latest `Disciplinary_Action_2026-02.pdf`). H.
- **Basis-risk for cross-venue arbitrage**: sources differ from other venues on the same real-world event (Weather Underground station table vs. whatever Kalshi/Polymarket name; CF RTI trimmed mean vs. other index definitions; "AP+NYT+WSJ all called" for House control). A scanner must compare the resolution sources, not just titles. M (other venues' sources were not researched here).
- Settlement lag: "no later than the day following Expiration Time" unless under review (T&C PDFs). H.

## 10. Geo / ToS / automation

- Access only through an FCM; the FCM decides whether a customer is qualified (Rule 304). Members must not have OFAC SDN owners. H.
- **Eligibility via IBKR (H, https://www.interactivebrokers.com/predictionmarkets/en/home.php, 2026-10-19)**: "only available to eligible clients, 21 years and older, of Interactive Brokers LLC, Interactive Brokers Canada Inc., Interactive Brokers Hong Kong Limited, Interactive Brokers Ireland Limited and Interactive Brokers Singapore Pte. Ltd."; "ForecastEx Contracts on US election results are only available to eligible US residents"; availability varies by IBKR affiliate and country of residence. Eligibility via Robinhood/Advantage Futures: NOT FOUND.
- **Automation**: allowed through the IBKR APIs (they document order submission for FORECASTX), subject to IBKR's API agreement and the exchange rule that each automated trading system carries its own User ID (Rule 506(i)). Position accountability 250,000 contracts per market (T&Cs, H); manipulation, wash and pre-arranged non-competitive fills prohibited (Rule 509). Third-party vendors of the IBKR Web API need IBKR compliance approval and OAuth 1.0a (IBKR docs, H).
- **Data licensing**: Rule 411 says recipients "may redistribute such information only to such extent and in such manner as may be permitted by the Board". The public data portal shows no terms or licence (NOT FOUND). Before republishing ForecastEx data commercially, ask info@forecastex.com. Internal signal use of public files looks low risk (M, not legal advice).
- **Not a US-person blocker in the way crypto venues are**; the opposite problem: US-regulated and KYC-bound, and not usable from a non-KYC wallet.

## 11. Liquidity (all H unless stated; computed from the venue's own public files; units "pairs" = matched Yes+No pairs = **$1.00 notional each**, since `yes_price + no_price = 1.00` on every pair row)

- **30-day matched volume 2026-09-19..2026-10-18: 15.04M pairs ~ $15.0M**, avg ~$0.50M/day (daily range 0.27M-0.92M; last 7 days 3.44M ~ $0.49M/day). 2026-10-18 (a Sunday): 342,558 pairs from 9,855 trades (median 10 contracts, p90 50); the pairs file and the summary agree exactly.
- **Open interest 2026-10-18 end of day: ~10.13M pairs ~ $10.1M** collateral across ~13,000 live contracts (sum of YES-row `open_interest`). Concentration: `HORC` 2.60M (26%), `YXLBT` 1.50M, `YXHBT` 1.17M, `FES` 0.49M, `PCD` 0.31M, `SENM` 0.31M, `YXHXR` 0.24M, `YXHET` 0.23M, `FFDEC` 0.22M.
- **30-day volume by category (pairs)**: Environmental (weather) 10.48M (70%; `UHLAX` LA daily high alone 4.97M = 33%), Financial Markets 3.00M (20%), Elections 1.03M (7%), Economic Indicators 0.52M (3.5%), Conditional/Technology/Government <0.002M.
- **Depth reality check**: on 2026-10-18 `HORC` (House control) had 7 trades totalling 27,826 pairs (median 950, max 10,000) but `FES` only 12 trades of ~10 pairs, `FFDEC` 3 trades, `SENM` 1 trade of 50. Large size is possible in a few contracts; most are thin.
- **Incentives**: Rulebook 416-417 and the Liquidity Retainer Program doc (max three market makers per program, daily retainer if two-sided quote obligations are met, retainers "not dependent on volume") plus daily public reward pools (`liquidity_rewards/`: tens of dollars per product per day, e.g. HORC 50.14, FES 50.05, YXLBT 14.80 on 2026-10-16, unit stated only as "eligible_liquidity_rewards", M). "No specialists, market makers or local interventions" per /faq is contradicted by the Market Maker and Retainer programs; treat the FAQ line as marketing. Affiliate (IBKR group) participants are allowed but filled last at each price level (Rules 208, 405(b)). H.
- **Conflicting third-party number (L)**: a tech-insider review quotes "$6.2M daily" for May 2026 and "$187M notional" for Q1 2026 (citing a Form 1-FR it did not link). My measurement of Sep-Oct 2026 from the venue's files is ~12x lower ($0.50M/day); different period/definition cannot be excluded. Use the first-hand number; no authoritative cumulative statistic found (IBKR's own page says highest-open-interest data "is not available").
- DefiLlama/on-chain TVL: not applicable (no chain).

## 12. Event categories that overlap other venues (where arbitrage could exist)

Overlap claims about other venues are M (not researched here; those venues were covered by a parallel workflow). The ForecastEx side is H.

| ForecastEx products (30d pairs) | Likely overlap | Notes |
|---|---|---|
| `HORC` House control (OI 2.6M), `SENM` Senate majority, state/district `G**`, `AXX**`, `MXX**` governor/senate races (Elections 1.03M) | Polymarket, Kalshi, PredictIt midterm markets (expire 2026-11/2027-01-04) | Highest-value overlap by OI; resolution rules differ (Congress.gov Jan 3 plus media-call early resolution). |
| `FFDEC` Fed decision (0.28M), `FF` target rate, `CPIY`/`CPIC` CPI, jobs, GDP, unemployment (Economic 0.52M) | Kalshi macro, Polymarket Fed markets | Macro is ForecastEx's original niche; long-dated ladders thin. |
| `YXHBT`/`YXLBT`/`YXHET`... crypto period high/low (BTC ~0.76M, all crypto 1.04M), `CF*` price, new `15MCD*` 15-min | Polymarket and Kalshi crypto price and 15m up/down | Source = CF Benchmarks RTI (trimmed mean); 15MCD would be a direct analogue of 15-minute up/down markets once it trades. |
| `FES` S&P 500 futures (1.12M), `FNQ` Nasdaq 100 (0.54M), `METLG/METLS` gold/silver, `COMCP` copper | Kalshi index/commodity brackets | Settles on CME E-mini daily settlement. |
| Daily/hourly city temperatures (`UH*`, `UL*`, `HRU*`, `SH*`: 10.5M, 70% of volume) | Kalshi daily-high temperature, Polymarket weather | Biggest ForecastEx volume but source is Weather Underground; likely mismatched station/data source vs others. |
| Sports | None | Not listed. |

## 13. Shared liquidity

- **Independent order book and clearinghouse** (H): ForecastEx's match engine and DCO are its own; Rule 401(d) ForecastEx is counterparty to each side; IBKR, Robinhood and Advantage Futures are channels into the same book (/members/fcms lists them as FCMs; the IBKR page says IBKR also offers Kalshi and CME Group event contracts from the same account, which are separate books). **Not a mirror of Polymarket or Kalshi.**
- **Distribution overlap**: because IBKR (owner) and Robinhood also route Kalshi, an aggregator that already reads Kalshi will see a retail audience that straddles both; that is not shared liquidity. Cross-venue market makers (IBKR-affiliated) may keep ForecastEx and Kalshi prices tight on overlapping macro events; edge there may be small. M.
- ForecastEx itself shares no liquidity with another venue, so it counts as an independent leg; but because no PayBox route exists, the leg cannot be executed from PayBox.

## 14. Adapter recommendation

- **Build only a read-only signal adapter** (priority P2):
  1. Poll `GET https://forecastex-public-data.s3.amazonaws.com/pairs/pairs_<today>.csv` (or `/api/download?type=pairs&date=`) every 10 minutes (cadence of the source) with `If-Modified-Since`/ETag; dedupe on `pair_id`; convert to executed Yes prices (NO price = 1 - Yes).
  2. Once per day after ~21:25 UTC, ingest `prices/daily_prices_<d>.csv` for the contract universe, closing marks (not tradable), open interest and `settlement_price` outcomes; ingest `daily_summary` for category tagging.
  3. Map contracts to other venues manually or via the product T&C PDFs (no machine-readable question text); start with `HORC`, `SENM`, `FFDEC`, `YXHBT/YXLBT`, `FES`, `FNQ`.
  4. Treat as stale by design (closing marks are not quotes); never produce an executable edge from these files alone.
- **Do not** build an order-placement adapter in PayBox (no wallet path). If execution on ForecastEx is ever wanted, it is an IBKR (or other FCM) integration with a human-held, KYC'd account and is outside the PayBox model.
- If an IBKR session is available to the operator, a second-phase read adapter could stream top-of-book through the Web API websocket (10 req/s, top-of-book only).

## 15. NOT FOUND / open questions

- NOT FOUND (searched: site, bucket, IBKR docs, web search): official developer API docs; websocket or REST quote feed; machine-readable contract catalog with question text; trading schedule/hours (regulatory "Trading Schedule" and other sub-pages are JS-rendered with no scrapeable links); data licence/terms and rate limits for the public files; Robinhood or Advantage Futures programmatic access and eligibility; cumulative statistics from IBKR filings; first-hand maker/taker or fee-tier evidence beyond the fee schedule.
- Fee reconciliation: "$0.01 each side" (fee schedule) vs "Yes+No bids sum to $1.01" (IBKR). Needs a live fill with an account to settle.
- Whether `15MCD*` contracts will list and at what cadence (filing 2026-10-12, no rows yet).
- Whether IBKR offers stablecoin funding (unverified, page 403 and search budget exhausted).
- I did not open the unlisted bucket prefix `94ehf4d9834dh93248r0/` (excluded in the portal UI's `EXCLUDE_FILE`; it appears in the anonymous root listing but is not part of the published portal). Not accessed on purpose.

## 16. Sources

H = first-hand this session.
- https://forecastex.com (home, nav and footer), /about, /faq, /markets, /markets/HORC, /data, /members, /members/fcms, /regulatory, /about/how-forecast-contracts-work (H)
- https://forecastex.com/api/download?type=prices&date=20260923 (H, CSV, fixture)
- https://data.forecastex.com and https://forecastex-public-data.s3.amazonaws.com/ (anonymous listing; `pairs/`, `prices/`, `daily_summary/`, `liquidity_rewards/`, `product_filings/`, `inactive_product_filings/`, `notices_to_members/`, `disciplinary_filings/`, `regulatory/`) (H)
- Rulebook: https://forecastex-public-data.s3.amazonaws.com/regulatory/ForecastEx%20_LLC_Rulebook.pdf (Rules 101, 201, 208, 303-304, 401-419, 506, 509, 603-609) (H)
- Fee schedule: .../regulatory/ForecastEx_Fee_Schedule.pdf; Liquidity Retainer Program: .../regulatory/ForecastEx%20Liquidity%20Retainer%20Program.pdf; T&Cs: .../regulatory/15MCDTermsandConditions.pdf, YXTermsandConditions.pdf, DailyTemperatureTermsandConditions.pdf, HORCOTermsandConditions.pdf, FFDECTermsandConditions.pdf, FESTermsandConditions.pdf (H)
- IBKR Campus: https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/ and https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/ (H); https://www.interactivebrokers.com/predictionmarkets/en/home.php and https://www.interactivebrokers.com/campus/learn-forecast-markets/ (H)
- MarketsWiki https://www.marketswiki.com/wiki/ForecastEx (M; sponsored page, last edited 2026-04-09; DCM/DCO approval 2024-06-24, wholly owned by IBG LLC)
- https://tech-insider.org/prediction-markets/platforms/forecastex-review/ (L: promotional, internally inconsistent; used only to record conflicting claims)
- PayBox `discover_plugins` / `discover_services` read-only catalog calls (H: no ForecastEx plugin)

## 17. Hygiene

- Privacy: every outbound request used only the generic User-Agent `insurance-markets-research/0.1`; no contact address, email, name, username or home path in any request, query, header or fixture. The one local helper script (PDF text extraction with the system PDFKit framework) was grepped for "@" and personal identifiers before running (none) and lives in the session scratchpad, not the repo. Fixtures were scanned for "@" (only `@FORECASTX` strings in the IBKR doc excerpt).
- Suspicious content: none aimed at AI agents. Marketing-style catalog text in PayBox `discover_services` rows ("Use when an agent needs US event-contract odds...") was not acted on; nothing paid; 402 flow not touched.
