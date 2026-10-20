# Crypto.com | Derivatives North America (CDNA) / North American Derivatives Exchange, Inc. (ex-Nadex, ex-HedgeStreet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (API probes about 02:00-02:10 UTC). READ-ONLY: official sites, developer docs, help centre, rulebook and terms PDFs (downloaded to the scratchpad and text-extracted by a local pure-Python script; nothing executed), keyless public GETs to documented market-data hosts, one unauthenticated WebSocket connect-and-subscribe test, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text was treated as untrusted data. Generic User-Agent `insurance-markets-research/0.1` on every scripted request.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, my inference, or carried from an in-repo note that I did not re-verify; **L** = weak or stale. "(wf)" = read through the WebFetch summariser rather than as raw text. WebSearch had no budget left for this task, so there is no search-engine corroboration; everything comes from fetched pages.

**This is the same exchange as two earlier in-repo notes**: `docs/research/venues/og-crypto-com-nadex.md` and `docs/research/venues/og-com-markets-og-predictions-crypto-com.md` ("OG.com Markets" is the new retail brand of the same legal entity). This note re-verifies the key facts independently, adds the points listed in "What is new here", and should be merged into the same registry entry (aliases: CDNA, OG.com Markets, Nadex, NADEX, HedgeStreet). Fixtures: `docs/research/fixtures/crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet/` (listed at the end).

---

## Verdict

- **still_live = true.** Live API ticks within seconds of my request, a live Sunday-night NFL game on og.com, and a rulebook dated 2026-10-13 (section 1).
- **adapter_priority = P0, as a READ / price adapter (`read_only`).** It is a CFTC-registered DCM + DCO with its own central limit order book (independent of Kalshi, Polymarket, Gemini, Underdog UDX), a keyless public REST market-data API with depth to 50 levels, trades, lifecycle and settlement values, and deep sports books (one NFL game: 24h $4.74M face across 786 contracts; live moneyline touch 170-290k contracts per side). Politics, economics and crypto are thin.
- **Not executable from PayBox.** Orders need a KYC'd USD account at a US FCM, a HMAC API key, and written conformance sign-off; the trading API is "private beta". Nothing to put in a transaction proposal or typed-data signature (sections 5, 6).
- **Two blockers to check before production use**: (1) no data-licence text was found for the exchange's own `api.crypto.com/.../public/*` endpoints, while the sibling `data-api.crypto.com` feed is licensed "personal, non-commercial" with an MDLA required for "trading operations" and aggregation (section 4c, 9); (2) the WebSocket market channels rejected every documented channel name (section 4d). Use REST polling.
- **All CDNA front ends are duplicates of this book** (Fanatics Markets, DraftKings Predictions, FanDuel Predicts (CDNA portion), Robinhood, ROLR, PredictArena, Crypto.com App / Predict Pro, Underdog (partial)). Count the book once.
- Confidence: medium (single-snapshot liquidity; licence terms and WebSocket unresolved).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Public API answers now | `GET https://api.crypto.com/fcm/v1/public/get-tickers` returned `t` = 1792375267223 ms = 2026-10-19T02:01:07Z for a Senate-control contract; book timestamp 02:01:02Z; `get-events` newest `last_updated_time` 2026-10-18T19:45Z (fixtures) | H |
| Live trading on og.com | og.com home (fetched ~02:07 UTC): "DAL Cowboys @ GB Packers LIVE Half ... GB Packers 17 ... $8,396,544 vol. +22 more markets"; Senate 2026 "$467,869 vol."; Texas Senate "$497,720 vol." (https://og.com) | H |
| Crypto.com consumer product | https://crypto.com/us/prediction: "Predict anything, trade everything. 2,000+ trends ... Now available in the U.S."; disclaimer "Prediction is an event contract that is a derivatives product offered by Crypto.com \| Derivatives North America (CDNA), a CFTC-regulated exchange" | H |
| Rulebook currency | "Markets RULES Dated: October 13, 2026 ... North American Derivatives Exchange, Inc. ('NADEX') operates two brands for its CFTC-regulated business OG.com Markets ('OG-M') and Crypto.com \| Derivatives North America ('CDNA')" (https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf) | H |
| Terms currency | Retail Terms and Conditions file `V_Final-CDNA-TOB-7.21.26.pdf` (July 2026); intro: "NADEX OPERATES TWO BRANDS FOR ITS CFTC-REGULATED BUSINESS: OG.COM ... AND CRYPTO.COM \| DERIVATIVES NORTH AMERICA" | H |
| Regulatory identity | "North American Derivatives Exchange, Inc. ... registered with the CFTC as a Designated Contract Market (DCM) and Derivatives Clearing Organization (DCO)"; affiliate FCM "Foris DAX FCM LLC (d/b/a OG Broker)" (https://og.com/regulatory, wf) | H |
| Corporate history | Nadex history (HedgeStreet then Nadex, acquired by Crypto.com) and the "OG.com" rebrand are documented in `og-crypto-com-nadex.md` (H there, https://og.com/about); the data-API site footer reads "(c) 2026 Crypto.com Derivatives North America" | M (history), H (footer) |

Hint check: the discovery hint's claim "own CFTC DCM+DCO with its own book" is confirmed (H). "Fanatics Markets disclosure" is confirmed: "Contracts are offered by Fanatics Markets through Crypto.com | Derivatives North America." (https://fanaticsmarkets.com/, wf). The hint's list of "PredictArena, ROLR, OG, Underdog" as white-label front ends comes from a third-party blog (https://mickbransfield.com/cftc-regulated-pms/, wf, M); that page says "Fourteen front-ends route through it", names Fanatics, Underdog, DraftKings, FanDuel (CME 51% / FanDuel 49% JV that routes to CME and Crypto.com), PredictArena (IB registered Sep 2026), ROLR and Robinhood, and carries no CDNA volume figure. Its own date line ("Current as of May 2026") conflicts with entries dated October 2026, so treat it as an index of leads only. Note: the exchange's own regulatory page does **not** list Underdog (H), only "DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures".

---

## 2. Kind and market model

- **Kind:** regulated exchange, **central limit order book**, "matching orders according first by price and then time priority" (rulebook, Priority of Orders) (H). Fully collateralised event contracts: price tick $0.01 on events, payout $1 per contract, `quantity_decimals` 0 (instrument fields, H). Not an AMM, not parimutuel, no on-chain tokens.
- **Binary, no scalar.** `inst_type` seen: `BINARY_OPTION` (all 617 non-sports instruments I crawled, H); the earlier crawl also found `EVENT_COMBO` parlays, `BRACKET_OPTION` and 6 `PERPETUAL_SWAP` (M, `og-crypto-com-nadex.md`; not re-crawled). Multi-outcome questions ("which party", "Senate seats", "NFL champion") are one binary per outcome, each with its own book.
- **Outcome tokenisation:** none. A two-way market is two instruments (e.g. `NX.F.OPT.ELECT-USSNTPRTY26.O.1.1` Democratic and `...O.1.2` Republican; `NX.F.OPT.NFL-00012-261018-M.O.1.1.20270301` Cowboys and `...O.1.2...` Packers). A short position is the "No" side (rulebook: a short "has the right to receive a fixed Settlement Value if, and only if, the Event Contract's Payout Criteria does NOT encompass the Expiration Value") (H).
- **The sibling books are not linked.** In one snapshot: Democratic bid 0.63 / ask 0.69, Republican bid 0.37 / ask 0.40. The complement-synthetic Democratic ask via selling Republican is 1 - 0.37 = 0.63 (versus 0.69 direct) and the synthetic bid via buying Republican is 1 - 0.40 = 0.60 (versus 0.63 direct) (H, fixtures `tickers_us_senate_party_pair`, `book_us_senate_dem_depth10`). A scanner must evaluate each outcome as `min(direct ask, 1 - best bid of the complementary instrument)` where the outcome set is exhaustive and exclusive.
- **Hierarchy (docs, H):** Event (`symbol`, `underlying_symbol`; e.g. `NFL-00012-261018-M`, `ELECT-USSNTPRTY26`) -> Instrument. Matching metadata sits in `event_details.metaData`: `PREDICT_CATEGORY` (Sports, Politics, Culture, Economics, Crypto, Climate), `SPORTS_GROUPING`, `LEAGUE`, `EVENT_DATE` (ISO), `HOME_PARTICIPANT` / `AWAY_PARTICIPANT` / `PARTICIPANT`, `PREDICT_CONTRACT_TYPE` ("Moneyline (2-Way)", "Spread", "Total Points", "Party to control the US Senate in 2026"), `PREDICT_PERIOD_TYPE` ("Full Game", "1st Half", "90 Minutes and Stoppage Time"), `PREDICT_OUTCOME_TYPE` (Home / Away / Draw), `PREDICT_MARKET_ID`, `PREDICT_OUTCOME_ID` (https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/prediction-reference-data and fixtures). `expiry_timestamp_ms` on sports props is a generic far-future date, so use `EVENT_DATE` (M, observed in the earlier crawl; the NFL fixture shows `...20270301`).
- **Other classes (M, earlier crawl):** crypto / FX / index "ladder" and bracket contracts on exchange-computed indices (e.g. `BTCUSD-INDEX@CdnaFunded`), and crypto perpetuals (margin). Skip in a prediction arbitrage scanner.

---

## 3. Chains and collateral

- **No chain.** Collateral is USD held at the exchange; "segregated bank accounts at BMO Harris Bank and Fifth Third Bank" (https://og.com/legal, quoted in `og-crypto-com-nadex.md`; M here). Deposit currencies in the Terms/rulebook: USD (plus GBP/EUR in the rulebook footnote, M).
- **Crypto funding exists, but only as a US on-ramp to USD:** the Crypto.com App page says "Fund your trades in seconds with cash or by converting crypto" (https://crypto.com/us/prediction, H). OG's Mesh article: link Coinbase / MetaMask / Phantom or scan a QR; assets such as ETH or BTC are converted to USDC by Mesh, then "OG.com converts the USDC to USD" "instantly"; no OG fee, network fees apply; "available to US customers, but New York customers are excluded"; KYC and Terms acceptance first; chains not named; no withdrawal-to-crypto information (https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions, wf, H for what it states). Chains and tokens: NOT FOUND (searched: that FAQ).
- Outside the US the article lists only "currently available only in certain locations due to regulatory requirements"; no country list (https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s, wf). Operating entity there: Foris Capital MU Limited (wf).

---

## 4. Read API

### 4a. Official keyless market-data REST (the one to use)

- **Docs:** https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction ("Crypto.com FCM (Futures Commission Merchant) API"). Quotes: "NOTE: This is under private beta. It will be accessible once it is generally available." and "Public market-data endpoints can be explored before onboarding." Change log: 2026-03-21 "Initial Version", 2026-07-17 "Card Top Up API" (H). The intro says "All API endpoints use POST requests"; the public endpoints nevertheless answer plain GET (H, below) and the public pages document `GET /public/...`.
- **Base URLs (H):** production `https://api.crypto.com/fcm/v1/{method}` (Common API Reference); the prediction-reference docs write the same public paths as `GET /dcm/v1/public/get-events?since=0`, and `https://api.crypto.com/dcm/v1/public/get-events` also answers (H, fixture `events_dcm_v1_path_limit1`; the `/dcm/v1` response carried populated `metaData`, the `/fcm/v1` one often an empty `metaData`, so prefer `/dcm/v1` for metadata until the paths are clarified). UAT: `https://uat-api.3ona.co/fcm/v1/{method}` (documented, H; not re-probed).
- **Public endpoints (GET, no key; each hit live this session, H):**

| Endpoint | Key params | Observed shape |
|---|---|---|
| `public/get-events` | `limit`, `since` (ns), `cursor`, `PREDICT_CATEGORY`, `LEAGUE`, `SPORTS_GROUPING`, `event_date` | `{id,method,code,result:{data:[{symbol,series_symbols,name,description,event_date(ns),event_end_date,last_updated_time(ns),event_details:{metaData,eventName}}],next_cursor}}` |
| `public/get-instruments` | `event_symbols` (<=10), `symbols`, `inst_type`, `limit` (<=1000), `since`, `cursor` | per contract: `symbol, inst_type, display_name, base_ccy, quote_ccy, quote_decimals, quantity_decimals, price_tick_size, qty_tick_size, tradable, expiry_timestamp_ms, underlying_symbol, contract_size, event_details{eventCode,metaData,eventName,attributes{OPEN_TIME,CLOSE_TIME,...}}, last_updated_time, inst_id, detail_product_type, security_type, security_sub_type` |
| `public/get-tickers` | `instrument_name` (REQUIRED, comma list, <=100) | `{i,h,l,a,c,b,k,v,vv,oi,t}` all strings except `t` (ms): high, low, last, 24h change, best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`, open interest `oi`, timestamp |
| `public/get-book` | `instrument_name`, `depth` (<=50) | `result.data[0] = {bids:[[price,qty],...], asks:[...], t}`; the docs promise three elements per level, live levels had two |
| `public/get-trades` | `instrument_name`, `count` (<=150), `start_ts`, `end_ts` | `{d,t,tn,q,p,s,i,m}`; `s` is lower-case "buy"/"sell" |
| `public/get-ticker-histories` | `instrument_names`, `start_ts`, `end_ts`, `count` | 60-second bid/ask/last snapshots (documented; M, probed in the sibling note) |
| `public/get-instrument-lifecycle-states`, `public/get-instrument-market-status` | `event_symbol`, `since`, `cursor`, `limit` | lifecycle: `state` Active/Suspended/Closed, `previous_state`, `lifecycle_change_reason` ("SCHEDULED_CLOSE"), `security_trading_status` ("SETTLED"); market status: `state` "CLOSED", `reason` "SCHEDULED_CHANGE" |
| `public/get-expired-settlement-price` | `instrument_name` | `{i,x,v,t}` with `v` "1.00"/"0.00" for binaries; **my filter was ignored** and an unrelated list of Aug-2026 FX/ETH ladders came back (L, fixture) |
| `public/get-deposit-instruments` | none | collateral currencies (docs only, not probed) |

- **Incremental sync (H):** `since` is nanoseconds; use the record's `last_updated_time` as the next `since`; follow `next_cursor`; `since=0` ascends from the start (docs prediction-reference-data, which also warns to fetch lifecycle/market status per `event_symbol` in parallel).
- **Gaps and quirks (H):** `oi` is "0" for every binary option I read (only perpetuals carry open interest per the sibling note, M) so there is **no open-interest feed**; `get-tickers` with no `instrument_name` returns `400 {"code":40004,"message":"instrument_name or instrument_names is required"}`; there is no endpoint for the rule text (it lives in the rulebook and help centre); settled markets leave `get-instruments` but stay visible through lifecycle `SETTLED` (H for lifecycle, M for the disappearance).
- **Rate limits (H, Common API Reference):** public market data "All 100 requests per second each" per method per IP; private: create/cancel order 15 per 100 ms, order detail 30 per 100 ms, get-trades and get-order-history 1 per second, everything else 3 per 100 ms per key. My roughly 70 GETs at about 7 req/s or less saw no 429.

### 4b. Authenticated trading REST / FIX

Same host; HMAC-SHA256 signed; see section 5.

### 4c. Second, separately licensed feed: Crypto.com Predictions market-data API

- `https://data-api.crypto.com/api/v1/predictions/{events, events/search, events/{id}, events/{id}/contracts, contracts/{symbol}/price}` (docs https://data.crypto.com/docs, H). Keyless: "Anonymous access is rate limited per IP address at 100 requests/minute and 50,000 requests/day" (quickstart, H). Fixture `secondary_feed_data_api_predictions_events_limit1` shows UUID event ids, per-contract `yes` / `no` / `chance` / `payout_per_100`, and `pagination.next_cursor` (H). Top-of-book only: no depth, trades or volume in the sample (M, sibling note `crypto-com-predict-pro.md`).
- **Licence (H, https://data.crypto.com/ landing page and /apply):** keyless access is "Personal, non-commercial use under the EULA"; "Redistribution, commercial use, or AI training requires a Market Data License Agreement (MDLA)"; /apply: you need an MDLA if you "redistribute the data ... use it commercially (products, trading operations, paid services) ... train models on it". The EULA text itself (clauses against compilation, AI use, bots) is quoted in the sibling note (M here). The Crypto.com Exchange API page lists "Prediction Markets data ... REST API · Available WebSocket · Coming soon" and points to this same data product (https://crypto.com/exchange-pro/en-US/api, H).
- **Implication:** use 4a for the scanner; do not use 4c without an MDLA.

### 4d. WebSocket

- Documented: `wss://stream.crypto.com/fcm/v1/market` (and `.../user` authenticated; UAT `wss://uat-stream.3ona.co/fcm/v1/...`), channels `book.{instrument_name}.{depth}` (10 or 50), `ticker.{instrument_name}`, `trade.{instrument_name}`, 100 requests/second (H, docs).
- **Tested and failed (H, fixture `websocket_market_unrecognized_channel`):** the socket connects; `{"id":N,"method":"subscribe","params":{"channels":["ticker.NX.F.OPT.ELECT-USSNTPRTY26.O.1.1"]},"nonce":...}` and the book and trade variants all returned `{"code":40003,"message":"Unrecognized channel"}`. Same result as the sibling note's earlier attempt. The Exchange API marketing page says "DCM (Predictions)" and "FCM (Predictions)" have REST "Coming soon", WebSocket "Coming soon", FIX "Available" (H), which is consistent with a market-data stream that is not enabled for prediction instruments yet. **Use REST polling.**

---

## 5. Trade path (documented, not exercised)

- **Programmatic orders exist, but only for approved FCM accounts.** `private/create-order`, `amend-order`, `cancel-order`, `cancel-all-orders`, `close-position`, order and trade history, balances, positions (docs sidebar and intro, H). Order types limit / market / stop / stop-limit.
- **Auth:** JSON `{id, method, api_key, params, nonce, sig}`; `sig` = hex HMAC-SHA256 of `method + id + api_key + parameter string + nonce` with the API secret; nonce must be within 60 seconds; all numbers are strings; optional read-only keys and IP allowlists (Common API Reference, H). **No EIP-712, no wallet signature.**
- **Prerequisites (H):** "To use the FCM APIs, you must complete FCM onboarding through Crypto.com Exchange. This requirement also applies if you currently use OG.com or the Crypto.com Main App." The Terms of Business: "In order to connect to the NADEX System via an API ... you will be required to complete all conformance tests and procedures required by NADEX and to receive written confirmation from NADEX of such satisfactory completion of conformance testing before any use of the NADEX System in a live production environment." The rulebook defines an "Independent Software Vendor (ISV)" and requires an ISV Agreement and exchange approval "In order to provide access to the Trading System", and says Customers of Intermediating Members "may not submit orders directly to the Exchange" (H, rulebook; the last point means retail users of Robinhood, DraftKings etc. cannot route directly). A third-party platform that places orders for other people would sit in ISV territory (M, my reading).
- **FIX** is the institutional route ("FIX Available" for both DCM and FCM predictions on the Exchange API page, H); the FIX document pack is not public (NOT FOUND).
- **In-play delay (H):** "a short hold period applied to any order placed after an Industry Event has started ... The default delay is 3 seconds" (https://help.og.com/en/articles/13051762-temporary-delay). Any live-sports leg carries a 3-second latency penalty; it starts at the scheduled start and ends when the event concludes.

---

## 6. PayBox reachability: **no (funding route only, US, off-chain)**

- A PayBox EVM or Solana wallet cannot place or sign orders: orders are HMAC-signed requests from a KYC'd, FCM-onboarded USD account; there is no on-chain contract, no signed-order schema and nothing to put in a transaction proposal (H, sections 3 and 5).
- PayBox catalog (own read-only `discover_*` calls, 2026-10-19): `discover_plugins` query "Crypto.com CDNA OG prediction markets" returned `{"plugins":[]}`; `discover_services` query "Crypto.com Derivatives North America CDNA OG.com prediction market" returned unrelated third-party x402 data services (Polymarket and Hyperliquid readers priced at a few thousandths of a dollar); nothing for CDNA or OG (H). I did not call any of them.
- A US (non-NY) person can fund the account by sending crypto through Mesh (section 3); that is funding, not trading from the wallet.

---

## 7. Fees

Source: https://help.og.com/en/articles/12958828-fees-limits (read as raw text this session, H).

| Where you trade from | Markets | Open | Close before expiry | Settle in the money | Settle out of the money |
|---|---|---|---|---|---|
| US customers (including New York) | "Most markets (incl. Sports, Politics, etc.)" | Taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)` (C = contracts, P = price in dollars) | same formula | waived | no fees |
| US | Crypto, FX, Commodities, Equity indices | `$0.02` per contract | `$0.02` per contract | waived | no fees |
| Outside US | all markets | `$0.02` per contract | `$0.02` per contract | waived | no fees |

- "Orders that fill immediately, including all market orders, are charged the taker fee. Orders that rest in the order book and are filled later are charged the maker fee." At P = 0.50 the taker fee is $0.0175 per contract and the maker fee $0.004375 (derived, H). The trader pays; no gas.
- Position limit: "$1 contract: 2,500,000 per event" in the help centre; the rulebook says "Unless otherwise specified in the Contract specifications ... the Position Limit for fully collateralized products on the Exchange is 2,500,000 Contracts", with class-specific lower limits (H).
- NOT FOUND: rounding rules, volume tiers, market-maker rebates and the fee-schedule PDF (nadex.com/pricing returned empty to WebFetch; the pricing URL is linked from og.com/regulatory). Front ends (Robinhood, DraftKings, FanDuel, Fanatics, Underdog, Crypto.com App) may charge their own fees on top; the scanner needs a per-front-end fee profile. A secondary figure of $0.01-$0.03 per price band in `draftkings-predictions.md` does not match OG's own formula (M, unresolved).

---

## 8. Resolution mechanism and dispute risk

- **Exchange-determined against a named Source Agency in each contract specification** (rulebook Chapter 12, H). Sports "Industry Event" contracts: "The Source Agency is the final result of the Industry Event reported by AP News or as a back-up Source Agency, any U.S. national news provider as published on the Trading System." Election contracts: Source Agencies "are the New York Times, the Associated Press, Bloomberg News, Reuters, Axios, Politico, The Washington Post, The Wall Street Journal, ABC News, CBS News, CNN, Fox News, MSNBC, and NBC, as determined by the Exchange." Crypto/FX ladders settle on exchange-calculated indices (index methodology NOT FOUND: not read).
- **Settlement value** $1 for fully collateralised event contracts (help centre, H).
- **General settlement (raw help text, https://help.og.com/en/articles/13051724-general-settlement, H):** "Any disqualifications, revisions, or amendments made by the news or market data provider ... after the event concludes do not affect settlement." A **Canceled Event** (postponed, canceled or not completed within 48 hours of the scheduled start; other cases under Rule 7.1 such as a material format change) pays the specified-outcome side the one-week VWAP before cancellation and the other side $1 minus that, with open fees refunded. **Ties with no tie outcome listed pay $0.50 to both Yes and No, fees not refunded.** The exchange "reserves the right to adjust any settlement if it was made in error", with account balances increased or decreased, and if no verifiable outcome exists settles "at the CDNA Exchange's reasonable discretion".
- **Sport-specific (https://help.og.com/en/articles/13051729-sports-settlement, H):** overtime counts in American football, basketball and hockey; soccer is 90 minutes plus stoppage time unless stated (extra time and penalties excluded); tennis is cancelled only after 14 days; baseball postponed to a new calendar day is cancelled; F5 baseball ties pay $0.50; motorsport settles on the governing body's official classification.
- **Disputes:** no trader appeal process found (NOT FOUND). Terms of Use: "binding arbitration held in Cook County, Illinois ... pursuant to the Commercial Arbitration Rules of the American Arbitration Association"; Terms of Business: arbitration "as set forth in the NADEX Rules" (H, terms PDF).
- **Arbitrage consequence (M):** centralised, discretionary, news-agency based. The 48-hour VWAP cancel rule, $0.50 ties and soccer 90-minute scope differ from many Polymarket and Kalshi markets, so every cross-venue pair needs rule matching and a settlement-basis haircut. Prompt for sports (lifecycle `SETTLED` seen for NFL-00001 at 16:59Z, hours after kick-off, H).

---

## 9. Geo, ToS, automation

- **US:** "currently available in all U.S. states, however, certain event contracts offered through OG.com may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s, wf, H). New York has separate funding and portfolio articles. **Outside US:** "only in certain locations"; country list NOT FOUND.
- **Automation (H, terms/rulebook):** API use only after conformance tests and written NADEX confirmation (Terms of Business); orders submitted "manually or via automated functionality" need controls "to prevent excessive messaging or other activity that may be deemed detrimental or disruptive to the Exchange" (rulebook rule on Trading Members); the exchange can suspend or condition access. No rule against bots as such was found in the sections I read; wash trading, spoofing and insider trading are covered in the rulebook, and the legacy Nadex "Activities to avoid" page reportedly bars third-party / account-manager trading and non-own-bank funding, which matters for an agent trading someone else's account (sibling notes, M; that page returns 403 to scripts and was not re-read).
- **Reading public data:** no terms were found for `api.crypto.com/.../public/*` (NOT FOUND; searched: API docs, Terms and Conditions PDF text for "market data" / "API", rulebook). Site Terms of Use prohibit "Commercial use of any of the Content" of the website (terms PDF, H) but do not name the API. The Market Data page https://nadex.com/market-data (linked from og.com/regulatory) returned empty to WebFetch. Treat redistribution and commercial use as unlicensed until CDNA confirms; the MDLA process for the sibling data-api is at https://data.crypto.com/apply (H).
- og.com robots.txt disallows account paths only (sibling note, M); it does not govern api.crypto.com.

---

## 10. Liquidity (all `vv` figures are "$1-face contracts traded in 24h", not premium; single snapshot)

| Measure | Value | Source and date | Tag |
|---|---|---|---|
| Cowboys @ Packers (live SNF), 24h across 786 instruments | **$4.74M face** (moneyline Cowboys 681,104 + Packers 473,509 contracts; spread $0.64M, totals $0.50M, TD props $0.79M) | `get-tickers`, 2026-10-19 ~02:04 UTC | H |
| Same game, cumulative `vol.` on og.com | $8,396,544 (unit not stated; exceeds the 24h sum, so includes earlier days) | https://og.com, ~02:07 UTC | H |
| Live moneyline book (Packers) | bid 0.89 x 172,227 / ask 0.90 x 287,668; five levels hold 399,578 bid and 1,040,168 ask contracts | `get-book depth=5`, 02:04 UTC | H |
| Non-sports, all categories, 24h | **$81.5k face**: Politics $71.8k (376 instruments, 274 with two-sided quotes, median spread $0.08), Culture $7.1k (median spread $0.16), Economics $1.3k, Climate $0.9k, Crypto-category $0.4k | own crawl via `get-events?PREDICT_CATEGORY=` -> `get-instruments?event_symbols=` -> `get-tickers`, 02:00-02:10 UTC | H |
| Biggest politics markets 24h | US Senate control $15.5k, Texas Senate $12.8k, ELECT-00010-26 $6.7k, 2028 President $5.3k | same crawl | H |
| Senate control Democratic book | bid 0.63 x 100 / 11,555 / 7,915, ask 0.69 x 8,144 / 3,056 / 1,200 | `get-book depth=10`, 02:01 UTC | H |
| Third-party weekly figure | `nadex` series "Weekly Prediction Market Notional Volume in USD" = 230,038,044 for the week to 2026-10-12 (about $33M/day; metric undefined, and about 5x the sibling note's single-day figure) | https://www.theblock.co/data/decentralized-finance/prediction-markets (wf) | M |
| Open interest / TVL | **NOT FOUND**: `oi` is "0" on every binary option; the Block has OI only for Kalshi, Polymarket, Polymarket US, Rothera (searched: ticker field, docs, Block page) | | H (absence) |
| Sports, crypto ladders and FX not totalled this session | see `og-crypto-com-nadex.md` section 10 (24h $6.13M lower bound on 2026-10-19 ~01:10 UTC, crypto ladders about $47k) | M here | M |

Reading: sports (especially NFL) is the only deep part; politics books are tens of thousands of contracts at the touch with 3-8 cent spreads; crypto ladders and economics are thin. Trend not measurable from a single snapshot; NFL Sunday volume is highly seasonal (L).

---

## 11. Event categories and overlap with other venues (where arbitrage could exist)

- **Sports (largest):** NFL, college football, NBA, NHL, MLB, tennis, soccer (EPL, UCL, MLS, Liga MX and more per og.com navigation, H), F1, NASCAR, CS2, boxing, chess. Moneyline, spread, total and player props. **Overlap: high** with Kalshi, Polymarket, Gemini, Underdog UDX, DraftKings and FanDuel's own CME contracts. Match on team names plus `EVENT_DATE`; check period (`PREDICT_PERIOD_TYPE`) and the soccer and tie rules.
- **Politics:** US Senate control 2026, Texas Senate, other Senate and governor races, single House-district races (e.g. "CA-01 House Election Winner 2026"), 2028 President and nominees, international leaders (H, own crawl: 140 Politics events, most of them one House district each). **Overlap: high** with Kalshi and Polymarket; thin here.
- **Economics:** Fed decisions, recession, jobs (19 events, 44 instruments, H). Overlap with Kalshi; very thin.
- **Crypto and macro ladders:** BTC, ETH, SOL, XRP and about 30 more underlyings from 5-minute to weekly, FX pairs, S&P 500, Nasdaq 100, Dow, Russell 2000, gold, crude, silver (og.com navigation, H). Overlap with Kalshi / Polymarket / Gemini crypto ladders but a different settlement index (basis risk) and thin books.
- **Culture / Climate:** 32 and 1 events (H); small overlap.
- Combos / parlays exist (RFQ for combos per the Fanatics disclosure: "transmits a RFQ to liquidity providers", H) and should be skipped by a single-leg scanner.

---

## 12. Liquidity sharing (independent leg?)

- **Independent of Kalshi, Polymarket, Gemini, Underdog UDX: yes** (own DCM + DCO and matching engine, H). The same professional market makers may quote on several exchanges (M).
- **Not independent of its own distributors (H):** og.com/regulatory lists "DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures" as intermediaries; Fanatics' footer states its contracts are offered "through Crypto.com | Derivatives North America". Crypto.com App, Predict Pro, ROLR and PredictArena are CDNA front ends (sibling notes, M). Underdog routes part of its flow to CDNA (blog, M; not on the exchange's list). FanDuel Predicts also routes to CME (M, blog), so only its CDNA contracts duplicate this book. Whether partner orders rest in the same book as direct retail and as the outside-US OG.com entity is not stated (NOT FOUND); the rulebook's single Trading System suggests one book (M).
- Registry: set `shared_with` on all of those to this venue; do not count two of them as two legs.

---

## 13. Adapter hints

- Universe: `GET /dcm/v1/public/get-events?since=0` then incremental `since = last_updated_time`; for categories use `PREDICT_CATEGORY`; instruments by `event_symbols` in batches of 10. Avoid full dumps (sports props push the catalogue past 55k instruments, M).
- Prices: `get-tickers` in batches of 100 for ranking, then `get-book depth 10-50` only for candidate pairs; `b` / `k` are strings in dollars = probability of that instrument's outcome; quote tick $0.01.
- Always compute the complement-synthetic price across sibling instruments (section 2); the engine does not.
- Skip `EVENT_COMBO`, perps, crypto ladders unless explicitly matched; skip instruments whose lifecycle is `Closed`/`Suspended`.
- Edge must subtract fees (`0.07 x P x (1 - P)` taker for sports and politics; `$0.02` per contract for crypto/FX/index ladders; front-end markup unknown), the 3-second in-play delay, and the settlement-rule basis (48-hour cancel / ties pay 0.50 / soccer 90 minutes).
- Mark the venue `read_only` in the platform registry; execution requires an FCM account the user holds off PayBox.

---

## 14. What is new here versus the earlier in-repo notes

- Independently re-verified: live API and shapes, docs pages, fee table, settlement rules, delay rule, API conformance clause and arbitration text from the 2026-07 terms PDF, rulebook date and source-agency text.
- New: (1) Crypto.com Exchange API page shows "DCM (Predictions)" and "FCM (Predictions)" REST/WebSocket "Coming soon", FIX "Available" (H); (2) `/dcm/v1` vs `/fcm/v1` response difference (metadata populated on `/dcm/v1`); (3) the ISV Agreement requirement in the rulebook; (4) a fresh bounded liquidity snapshot (live NFL game depth, non-sports total $81.5k/24h); (5) the sibling-book synthetic-price observation; (6) the data-api rate limits (100/min, 50,000/day) and MDLA wording; (7) `og.com/regulatory` does not list Underdog as an intermediary.

## 15. Not found / open questions

- General-availability date of the FCM trading API and whether non-FCM individuals can ever obtain keys.
- Data-licence terms for `api.crypto.com/.../public/*` (redistribution, commercial use, bots); the nadex.com market-data page was empty.
- Correct WebSocket subscribe format or enablement for prediction instruments (all documented channels returned 40003).
- Open interest; fee-schedule PDF (rounding, tiers, maker rebates); country list outside the US; whether the US and outside-US OG.com books are the same; whether partner flow rests in the same book; index methodology for crypto/FX ladders.
- Why `get-expired-settlement-price` ignores `instrument_name`; why `The Block` weekly notional is about 5x the sibling note's single-day total.
- Whether Underdog's flow reaches CDNA (the exchange's intermediary list omits it).

## 16. Suspicious / embedded-instruction content (recorded, not followed)

None found. I scanned the fetched crypto.com prediction page for AI-directed phrases ("ignore previous", "system prompt", "you are an AI"); the only "AI Agent" strings are navigation links to a Crypto.com "AI Agent SDK". The og.com home page contains a player name matching a common given name in JSON; irrelevant. The `data.crypto.com` EULA clauses about AI use are licence terms for that data product, not instructions to me, and I did not use that feed beyond one sample GET.

---

## Sources

1. https://api.crypto.com/fcm/v1/public/{get-events, get-instruments, get-tickers, get-book, get-trades, get-instrument-lifecycle-states, get-instrument-market-status, get-expired-settlement-price} and https://api.crypto.com/dcm/v1/public/get-events (live GETs, 2026-10-19 02:00-02:10 UTC) (H, fixtures)
2. https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction, /rest-common-api-reference, /rest-change-log, /rest/reference-and-market-data, /rest/prediction-reference-data, /rest/public-get-tickers, /rest/public-get-deposit-instruments, /rest/instrument-status-updates (raw HTML text, H)
3. wss://stream.crypto.com/fcm/v1/market (connect and subscribe test, "Unrecognized channel") (H)
4. https://og.com (home, live volumes), https://og.com/regulatory (wf) (H)
5. https://crypto.com/us/prediction (raw and wf) and https://crypto.com/exchange-pro/en-US/api (raw: "Predictions" coverage table, sample `GET /api/v1/predictions/events`) (H)
6. https://data.crypto.com/, /apply, /quickstart, /docs and https://data-api.crypto.com/api/v1/predictions/events?limit=1 (H)
7. https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (text-extracted locally, H)
8. https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf (text-extracted locally, H)
9. https://help.og.com/en/articles/12958828-fees-limits, /13051724-general-settlement, /13051729-sports-settlement, /13051762-temporary-delay (raw text, H); /12752911-introducing-og-com-u-s, /15476413-introducing-og-com-outside-u-s, /15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions (wf, H for what is stated)
10. https://fanaticsmarkets.com/ (wf: "Contracts are offered by Fanatics Markets through Crypto.com | Derivatives North America.") (H)
11. https://www.theblock.co/data/decentralized-finance/prediction-markets (wf, M)
12. https://mickbransfield.com/cftc-regulated-pms/ (wf, M; third-party index, internally inconsistent date)
13. https://nadex.com/market-data (empty via WebFetch; NOT FOUND)
14. PayBox `discover_plugins` / `discover_services` (read-only, 2026-10-19) (H)
15. In-repo cross-references (M here): `docs/research/venues/og-crypto-com-nadex.md`, `og-com-markets-og-predictions-crypto-com.md`, `crypto-com-predict-pro.md`, `rolr-high-roller-technologies.md`, `predictarena.md`, `fanatics-markets.md`, `fanduel-predicts.md`, `draftkings-predictions.md`, `underdog-predict-underdog-exchange-udx.md`

## Fixtures (`docs/research/fixtures/crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet/`)

All raw public responses unless marked; each file is under 5 KB.

- `events_limit3_no_since_2026-10-19.json`, `events_dcm_v1_path_limit1_2026-10-19.json` (note populated metadata on the `/dcm/v1` path)
- `instruments_us_senate_party_pair_2026-10-19.json`, `instruments_nfl_moneyline_pair_2026-10-19.json` (subset of a 786-instrument response, re-wrapped, with a `_note`)
- `tickers_us_senate_party_pair_2026-10-19.json`, `tickers_nfl_moneyline_pair_live_2026-10-19.json`
- `book_us_senate_dem_depth10_2026-10-19.json`, `book_nfl_packers_moneyline_depth5_live_2026-10-19.json`
- `trades_us_senate_dem_count5_2026-10-19.json`
- `lifecycle_states_nfl_event_limit3_2026-10-19.json`, `market_status_nfl_event_limit3_2026-10-19.json`
- `expired_settlement_price_filter_ignored_head3_2026-10-19.json` (truncated to 3 rows)
- `error_get_tickers_without_instrument_name_2026-10-19.json`
- `secondary_feed_data_api_predictions_events_limit1_2026-10-19.json` (the separately licensed feed; sample only)
- `liquidity_snapshot_derived_2026-10-19.json` (my computation), `websocket_market_unrecognized_channel_2026-10-19.json` (recorded error messages)

Privacy check: scripts and fixtures were grepped for `@` and for the user's name and email before and after running; the only `@` hits are "Away @ Home" team names; every request used the generic User-Agent `insurance-markets-research/0.1`; no contact address, home path or personal identifier appears in any request, saved file or this note.
