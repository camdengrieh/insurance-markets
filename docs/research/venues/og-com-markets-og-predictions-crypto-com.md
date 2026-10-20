# OG.com Markets / OG Predictions (Crypto.com | NADEX | CDNA) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (API probes between about 01:29 and 01:55 UTC on the server clock). READ-ONLY: official site and help-centre pages (WebFetch, curl), the developer docs, the 2026-10-13 rulebook and the 2026-07-21 terms PDF (downloaded as data, text extracted by a local pure-Python script, nothing executed), unauthenticated GETs to the documented public market-data endpoints, one 10-second unauthenticated WebSocket connect-and-subscribe attempt, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text was treated as untrusted data; nothing in it was followed. Every scripted request used the generic User-Agent `insurance-markets-research/0.1`. WebSearch was out of session budget, so there is no search-engine corroboration; everything comes from fetched pages.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a WebFetch summary I could not check against raw text, or my inference from first-hand data; **L** = weak or stale. "(wf)" = read through the WebFetch summariser, not raw text.

**Duplicate-discovery warning:** this venue was already researched under a different slug in `docs/research/venues/og-crypto-com-nadex.md` (fixtures in `docs/research/fixtures/og-crypto-com-nadex/`). I re-verified the load-bearing claims independently (own crawl, own fee/rule/ToS reads); where my numbers differ from that note the difference is stated. Treat the two slugs as ONE venue in the registry. Related repo notes that are front ends on the same exchange: `draftkings-predictions.md`, `fanatics-markets.md`, `fanduel-predicts.md`, `robinhood-prediction-markets*.md`, `truth-predict-truth-social-trump-media-with-crypto-com.md`, and (part of its flow) `underdog-predict-underdog-exchange-udx.md`.

Fixtures (real responses, each well under 50 KB): `docs/research/fixtures/og-com-markets-og-predictions-crypto-com/` (listed at the end).

---

## 0. Bottom line

1. **Live, regulated, central-limit-order-book exchange**, not a front end. OG.com Markets and "Crypto.com | Derivatives North America (CDNA)" are two brands of one CFTC-registered DCM + DCO, North American Derivatives Exchange, Inc. (legacy brand Nadex). Status page says "All Systems Operational"; the public API returns trades within seconds of the request (H).
2. **Good, keyless read API** (REST, 100 req/s per method per IP): events, instruments, tickers, order book to depth 50, trades, 1-minute bid/ask history, lifecycle and settlement values. Docs are labelled "Preview" / "private beta" for the account side only. **WebSocket market data is documented but did not work** (every documented channel returns `40003 Unrecognized channel`), so poll REST (H).
3. **Real liquidity, independent of Kalshi and Polymarket.** About **$7.0M of $1-face contracts traded in the trailing 24h** (my crawl, lower bound), 83% of it one NFL game; politics books show 10-50k contracts per side; NFL moneylines show 1-cent spreads with 100k-contract ladder steps. Open interest is NOT published (ticker `oi` is "0" for every binary option).
4. **Not reachable from a PayBox wallet.** Orders are HMAC-signed REST/FIX calls from a KYC'd, FCM-onboarded USD account; the order API is in private beta and the terms require written conformance sign-off before live use. There is nothing for an EVM/Solana wallet to sign. At most a US (non-NY) customer can fund the account from a self-custody wallet via Mesh, which is a human onboarding flow (H).
5. **adapter_priority = P0 as a READ / price-signal adapter** (high liquidity + good public API + independent book). Execution on this leg is a separate decision outside PayBox signing; the scanner should mark it `read_only`. Biggest data-quality risks: settlement-rule mismatches versus Polymarket/Kalshi (48-hour cancel pays a VWAP, ties pay $0.50, soccer = 90 min), the in-play 3-second order delay, and no OI.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| og.com | HTTP 200, `<title>` "OG.com - Prediction Markets & Real-Time Odds"; meta "The premier prediction market for live odds, combos, and real-time event trading". Home page shows "$7,448,655 vol." on the live NFL Cowboys @ Packers market at 01:38 UTC (https://og.com, fetched 2026-10-19) | H |
| Status page | https://status.og.com/ returned 200 with "All Systems Operational" and per-component "Operational" (fetched 2026-10-19) | H |
| API is serving fresh data | `public/get-tickers`/`get-trades` timestamps within seconds of the request; 56,692 instruments listed (own crawl) | H |
| Launch | "Crypto.com Launches OG" dated 3 February 2026 (https://og.com/company-news/cryptocom-launches-og-a-new-prediction-market-experience); also the task hint (The Block/Decrypt) | M (not re-fetched) |
| Corporate | https://og.com/about timeline: 2008 HedgeStreet -> Nadex; 2022 Crypto.com acquired Nadex; 2024 first CFTC-regulated exchange to list sports event contracts; 2026 Crypto.com launched OG.com; logos for Robinhood, DraftKings, FanDuel, Underdog, Fanatics (wf) | H/M |
| Robinhood | Announcement 2026-09-08: multi-year partnership "designates OG.com as an infrastructure and clearing provider" for Robinhood Prediction Markets; Robinhood "will route retail event contract volume" through the exchange; initial equity stakes in Crypto.com and OG.com after the spin-off; Citadel at $20B for Crypto.com, OG.com standalone $5B; "largest B2B ... partnership by transaction volume", no figures (https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine) (wf) | H (announcement) |
| Predict Pro | Crypto.com "Predict Pro" launched for US users 2026-10-15: order books with depth, market/limit/stop/post-only orders, parlays of 2-20 legs; Crypto.com Exchange provides the technology, Foris DAX, Inc. is the NFA Introducing Broker, Foris DAX FCM LLC (OG.com Broker) is the FCM, North American Derivatives Exchange, Inc. operates OG.com Markets; "contracts typically settle within one hour"; no API or fee detail in the article (https://www.cryptotimes.io/2026/10/15/crypto-com-launches-predict-pro-for-us-prediction-market-traders/) (wf) | M |
| Rulebook | "OG.com Markets RULES Dated: October 13, 2026" (https://og.com/rules -> `20261013_OG.com_Markets_Rulebook.pdf`, text extracted locally) | H |

**Verdict: still_live = true.** Regulatory identity (H, https://og.com/regulatory): "North American Derivatives Exchange, Inc. (the Exchange) is registered with the U.S. Commodity Futures Trading Commission ... as a Designated Contract Market (DCM) and Derivatives Clearing Organization (DCO)", operating "two brands ... OG.com Markets and Crypto.com | Derivatives North America (CDNA)"; "OG.com Markets is an affiliate of Foris DAX FCM LLC (d/b/a OG Broker), which is a CFTC-registered Futures Commission Merchant".

---

## 2. Kind and market model

- **Kind (H):** regulated exchange, central limit order book. Rulebook Rule 5: "the Market's trading algorithms execute all trades by matching orders according first by price and then time priority." Fully collateralised event contracts priced $0.01-$0.99 with a $1 payout, plus legacy Nadex-style variable-payout "touch bracket" contracts. Not an AMM, not parimutuel, no on-chain token.
- **Instrument counts from my full crawl (2026-10-19 ~01:40 UTC, H):** 56,692 instruments = **40,359 `BINARY_OPTION`**, **16,263 `EVENT_COMBO`** (parlays), **64 `BRACKET_OPTION`**, **6 `PERPETUAL_SWAP`**. All 40,429 non-combo instruments report `tradable: true`. (The sibling note counted 56,446 earlier the same day; the delta is new listings.)
- **Structure (H, `public/get-events`, `public/get-instruments`):** Event (`symbol` such as `NFL-00001-261022-M`, `ELECT-USSNTPRTY26`) -> Instruments, **one instrument per outcome**, each with its own order book. Instrument symbol pattern `NX.F.OPT.<EVENT>.<PERIOD>.<n>.<n>[.<expiry>]`, e.g. `NX.F.OPT.NFL-00001-261022-M.O.1.1.20270301` (Patriots) and `...O.1.2...` (Bears). Politics: `NX.F.OPT.ELECT-USSNTPRTY26.O.1.1` (Democratic) and `.1.2` (Republican).
- **Outcome tokenisation:** none. A 2-way game is two binary instruments; 3-way soccer adds a "Draw" instrument (`PREDICT_OUTCOME_TYPE` Home/Away/Draw). Longs buy Yes; selling is taking the opposite side (short = Yes seller = "No" at 1 - price). Observed complementary books: Patriots bid/ask 0.40/0.41 and Bears 0.59/0.60; Senate control Democratic 0.63/0.69 and Republican 0.37/0.41 (fixtures). Dem bid + Rep bid = 1.00 exactly, no internal arbitrage at the touch. Whether the engine links the two complementary books for matching is not documented (M).
- **Matching fields in `event_details.metaData` (H, fixtures):** `PREDICT_CATEGORY` (Sports / Politics / Culture / Economics / Crypto / Climate), `SPORTS_GROUPING`, `LEAGUE`, `EVENT_DATE`, `HOME_PARTICIPANT` / `AWAY_PARTICIPANT`, `PARTICIPANT`, `PREDICT_CONTRACT_TYPE` (Moneyline, Spread, Total Points, props), `PREDICT_PERIOD_TYPE` (Full-Game, 1st Half, ...), `PREDICT_OUTCOME_TYPE`, `EXTERNAL_GAME_ID` / `EXTERNAL_HOME_ID` / `EXTERNAL_AWAY_ID` (a third-party sports-data feed, probably the same one other venues use; unconfirmed), `PREDICT_MARKET_ID`, `PREDICT_OUTCOME_ID`. Tick $0.01 (events), whole contracts (`quantity_decimals` 0), `contract_size` "1".
- **Categorical/scalar:** no scalar markets; "how many seats"/"who wins" style markets are one binary per bucket or candidate. `expiry_timestamp_ms` on sports props is a far generic date (2027-03-01); use `EVENT_DATE` for timing (H).
- **Crypto/FX ladders:** `BINARY_OPTION` and `BRACKET_OPTION` rows with no `PREDICT_CATEGORY` (831 instruments, 37 underlyings named like `BTCUSD-INDEX@CdnaFunded`) (H).

---

## 3. Chains and collateral

- **No chain.** Collateral is **USD held at the exchange** in segregated bank accounts at BMO Harris Bank and Fifth Third Bank, "not commingled with OG operational funds" (https://og.com/legal) (M, from the sibling note's read; not re-fetched). Rulebook footnote allows USD/GBP/EUR deposits (M).
- **US crypto funding exists:** "Crypto-to-Cash Deposits Powered by Mesh": link Coinbase/MetaMask/Phantom or deposit by QR; Mesh converts assets such as ETH or BTC to USDC, OG.com "converts the USDC to USD immediately"; no OG deposit fee; "This feature is currently available for our US customers" and "New York customers are excluded" (https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions) (wf, H). Supported chains/tokens: NOT FOUND (page lists none). Withdrawal back to crypto: NOT FOUND.
- Outside the US, funding is not described on the page I read (NOT FOUND); the sibling note lists SWIFT/card routes from help-centre titles (M).

---

## 4. Read API (official, public, keyless for market data)

- **Docs:** https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (linked as "APIs" from og.com and as "API Docs" from og.com/about). Quote: "This is under private beta. It will be accessible once it is generally available." and "To use the FCM APIs, you must complete FCM onboarding through Crypto.com Exchange"; "Public market-data endpoints can be used before onboarding." (H, wf). No WebSocket or FIX pages are linked from the docs; the market-data page names channels `book.{instrument_name}.{depth}` (10 or 50), `ticker.{instrument_name}`, `trade.{instrument_name}` but gives no subscribe format (H, wf).
- **Base URLs (H):** production REST `https://api.crypto.com/fcm/v1/{method}`; UAT `https://uat-api.3ona.co/fcm/v1/{method}`; WebSocket `wss://stream.crypto.com/fcm/v1/market` (public) and `.../user` (authenticated), UAT `wss://uat-stream.3ona.co/fcm/v1/...` (Common API Reference, wf). My probes used production `fcm/v1` only.
- **Public endpoints used (all `GET`, no key, each hit live this session, fixtures saved):**

| Endpoint | Use | Observed shape (H) |
|---|---|---|
| `public/get-events` | events; params `limit`, `since`, `cursor`, `LEAGUE`, `SPORTS_GROUPING`, `PREDICT_CATEGORY` | `{id,method,code:0,result:{data:[{symbol,series_symbols,name,description,event_date(ns),event_end_date(ns|null),last_updated_time(ns),event_details:{metaData,eventName}}],next_cursor}}` |
| `public/get-instruments` | contracts; params `limit` (1000 worked), `cursor`, `since`, `event_symbols`, `PREDICT_CONTRACT_TYPE`, `inst_type` | `symbol, inst_type, display_name, base_ccy, quote_ccy, quote_decimals, quantity_decimals, price_tick_size, qty_tick_size, tradable, expiry_timestamp_ms, underlying_symbol, contract_size, event_details{eventCode,metaData,eventName,attributes{STRIKE_PRICE,OPEN_TIME,CLOSE_TIME,...}}, last_updated_time(ns), inst_id, detail_product_type, security_type, security_sub_type` |
| `public/get-tickers` | `instrument_name` **required**, comma list (I used 100 per call) | `{i,h,l,a,c,b,k,v,vv,oi,t}`: high, low, last, 24h change, best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`, open interest `oi`, ms timestamp; all strings except `t` |
| `public/get-book` | `instrument_name`, `depth` (10 used; docs say up to 50) | `result:{depth,data:[{bids:[[price,qty],...],asks:[[price,qty],...],t}],instrument_name}`; quantities are contracts, strings |
| `public/get-trades` | `instrument_name`, `count` | `{d,t,tn,q,p,s,i,m}`; `s` is lower-case "buy"/"sell" live |
| `public/get-ticker-histories` | `instrument_names`, `count` | 60-second `{i,t,b,k,a}` snapshots |
| `public/get-instrument-lifecycle-states` | `event_symbol`, `limit`, `since`, `cursor` | `state` Active/Closed, `previous_state`, `lifecycle_change_reason` (SCHEDULED_ACTIVATE/SCHEDULED_CLOSE), `security_trading_status` (OPEN_FOR_TRADING / SETTLED) |
| `public/get-instrument-market-status` | same filters | `state` (e.g. CLOSED), `reason` (e.g. SCHEDULED_CHANGE) |
| `public/get-expired-settlement-price` | `instrument_name` | `{i,x(expiry ms),v,t}`, `v` "1.00"/"0.00" for binaries; my request with a named instrument returned an unrelated Aug-2026 FX/ETH list, so the filter appears ignored (L) |

- **Incremental sync (H):** `since` is nanoseconds; follow `next_cursor`. A full instrument crawl is 57 pages of 1,000 (about 100 MB of JSON): use `event_symbols` / `LEAGUE` / `PREDICT_CATEGORY` filters and incremental `since`.
- **Gaps and quirks (H):** (1) **settled events disappear from `get-instruments`** (Bills @ Raiders `NFL-00011-261018-M`, started 20:25 UTC on 10-18, has 0 instruments listed while `get-instrument-lifecycle-states` still reports its legs as `SETTLED`); capture settlement via lifecycle states, not the instrument list. (2) **No open interest:** `oi` was populated only for the 6 perpetuals. (3) No endpoint for resolution rule text: it lives in the rulebook and help centre. (4) Combos (`EVENT_COMBO`) have a separate instrument universe; skip them for single-leg arbitrage. (5) `get-tickers` without `instrument_name` is rejected (sibling note, H there; not re-tested).
- **Auth and limits (H, Common API Reference, wf):** public market data **100 requests/second per method per IP**. Private REST: create/cancel order 15 per 100 ms each, get-order-detail 30 per 100 ms, get-trades and get-order-history 1/s, others 3 per 100 ms. WebSocket: user 150 req/s, market data 100 req/s. I made about 500 GETs at roughly 3-8 req/s and saw no 429 or block.
- **WebSocket (documented, NOT working for me):** connect to `wss://stream.crypto.com/fcm/v1/market` succeeded; `{"id":N,"method":"subscribe","params":{"channels":["book.<inst>.10"]}}`, `ticker.<inst>` and `trade.<inst>` each returned `{"code":40003,"message":"Unrecognized channel"}` for a live NFL moneyline instrument (see `ws_market_subscribe_probe_2026-10-19.txt`). Either the market stream is not yet enabled for prediction instruments or the channel names/envelope differ from the incomplete docs. The sibling note reached the same result with different instruments. Use REST polling until the docs are fixed.

---

## 5. Trade path (documented, not exercised)

- **Programmatic orders exist but only for approved FCM accounts.** Docs sidebar "Trading": place, amend, cancel limit/market/stop/stop-limit orders, open orders, order history, trade and settlement history (`private/create-order`, `cancel-order`, etc.); "Account Balance and Positions": balances, positions (H, wf). Predict Pro (2026-10-15) offers the same order types in a UI (wf). og.com/about advertises "Trade predictions over REST, WebSocket and FIX ... Coming soon to Crypto.com Exchange UI" (H, wf).
- **Auth scheme (H, Common API Reference, wf):** HMAC-SHA256 with the API secret, lowercase hex; payload = `method + id + api_key + sorted-params-string + nonce`; nonce is UTC ms and must be within 60 s (`40102 INVALID_NONCE`); WebSocket `public/auth` once per session. No EIP-712 or wallet signature anywhere.
- **Prerequisites (H):** approved FCM account and API credentials (above). The terms PDF (Direct Market Access Terms of Business) says to connect "via an API ... you will be required to complete all conformance tests and procedures required by NADEX and to receive written confirmation from NADEX of such satisfactory completion of conformance testing before any use of the NADEX System in a live production environment" (V_Final-CDNA-TOB-7.21.26.pdf, extracted locally). Rulebook Rule 5: "A Customers of Intermediating Members may not submit orders directly to the Exchange"; intermediating members submit orders "over a FIX Connection".
- **In-play delay (H, wf):** "The default delay is 3 seconds" for orders placed after an industry event has started (head-to-head from scheduled start to conclusion; season-long futures from the end of the regular season) (https://help.og.com/en/articles/13051762-temporary-delay). Whether cancels are delayed: NOT FOUND. Any live-sports leg carries this latency.
- **Third-party connectivity (M, titles only from the sibling note):** CryptoStruct (2026-10-13) and Trading Technologies (2026-08-18) integrations.

---

## 6. PayBox reachability: **no** (funding-only, US, human onboarding)

- A PayBox EVM/Solana wallet cannot place or sign orders: orders are HMAC-signed requests from a KYC'd USD account and, for large flow, FIX from an approved member. There is no transaction proposal or typed-data signature that touches this venue (H, sections 3 and 5).
- PayBox catalog (own read-only queries, 2026-10-19): `discover_plugins` query "OG.com Crypto.com prediction markets" returned `{"plugins":[],"has_more":false}`; `discover_services` query "OG.com prediction market" returned only unrelated third-party x402 data readers (Polymarket / Hyperliquid wrappers); no OG/CDNA route. I called none of them (H).
- Only imaginable bridge: storing an OG API key as a PayBox secret and signing HMACs outside PayBox, after FCM onboarding. Not a PayBox signing path (L, speculative).

---

## 7. Fees

Source: https://help.og.com/en/articles/12958828-fees-limits (dated September 15, 2026; read this session via WebFetch, table also saved in `fee_schedule_extract_2026-09-15.md`) (H/wf).

| Where you trade from | Markets | Open | Close before expiry | Settle in the money | Settle out of the money |
|---|---|---|---|---|---|
| US (incl. NY) | Most markets (Sports, Politics, etc.) | **Taker `0.07 x C x P x (1 - P)`; maker `0.0175 x C x P x (1 - P)`** (C contracts, P price in dollars) | same formula | waived | none |
| US | Crypto, FX, Commodities, Equity indices | **$0.02 per contract** | $0.02 | waived | none |
| Outside US | all markets | **$0.02 per contract** | $0.02 | waived | none |

- "Orders that fill immediately, including all market orders, are charged the taker fee. Orders that rest in the order book and are filled later are charged the maker fee." The trader pays; no gas. Worked numbers (derived): taker at P = 0.50 is 1.75 cents/contract, maker 0.44 cents; taker at P = 0.41 is 1.69 cents.
- Position limit in the help article: contract value $1, "position limit amount 2,500,000" per event. The rulebook gives per-class limits (e.g. FX event contracts 2,500 contracts per class, market makers 5,000 per strike), so check per class (H).
- NOT FOUND: volume tiers, rounding rules, market-maker rebates and the exchange fee-schedule PDF (the sibling note reports nadex.com/pricing returns 403 to scripts; I did not re-test or try to evade it). Partner front ends (Robinhood, DraftKings, FanDuel, Fanatics, Underdog) may add their own fees; take fees per front end, not per exchange.

---

## 8. Resolution mechanism and dispute risk

- **Resolved by the exchange itself** against a "Source Agency" named in each contract spec (H, rulebook chapter 12). Sports "Industry Event" contracts: "The Source Agency is the final result of the Industry Event reported by AP News or as a back-up Source Agency, any U.S. national news provider as published on the Trading System." Crypto touch-bracket contracts: "The Source Agency is the Exchange"; the BTC underlying is "the spot bitcoin cryptocurrency commodity bid/ask midpoint prices as reported by Lukka, Inc. and ICE Cryptocurrency Data aggregated by Blockstream Corporation and distributed by ICE Data Connectivity and Feeds, Inc." (a different reference than Polymarket's or Kalshi's, so basis risk on crypto ladders). I did not read every contract spec (election and CPI specs unread).
- **General settlement (H, wf, https://help.og.com/en/articles/13051724-general-settlement):** settled "shortly after the event concludes" by the CDNA Exchange from the news/data provider result; later disqualifications or revisions "do not affect settlement"; **ties with no tie outcome listed pay $0.50 to both Yes and No (opening fees not refunded)**; an event postponed/cancelled/not completed within **48 hours** of its scheduled start is a Canceled Event: matching-outcome holders receive the **one-week VWAP** of the last trade before cancellation, the others get $1 minus that, opening fees refunded; exchange "reserves the right to adjust any settlement if it was made in error due to human or technical issues" and, with no verifiable outcome, settles "at its reasonable discretion". The page describes no dispute process.
- **Sports specifics (H, wf, https://help.og.com/en/articles/13051729-sports-settlement):** soccer settles on 90 minutes plus stoppage time (extra time and penalties excluded unless stated; if a "Draw" is not listed the market becomes "To Advance"); NFL/NBA overtime counts; hockey overtime and shootouts count; MLB game moved to a new calendar day is cancelled; tennis is cancelled only after 14 days; F5 baseball ties pay $0.50; golf/F1 non-starters settle out of the money; MMA "No Contest" cancels. Rulebook adds that if the outcome is unclear the exchange "may, at its sole discretion, delay settlement" (H).
- **Dispute risk for arbitrage (M):** centralised and discretionary; no appeal path for traders is documented (member disputes go to binding AAA arbitration in Cook County, Illinois under Illinois law, per the terms of use, H). Predict Pro's marketing mentions a pre-trade "dispute window" (wf, article) but the help pages I read describe none (NOT FOUND). Every cross-venue pair needs rule matching: 48-hour VWAP cancellation, $0.50 ties and the 90-minute soccer scope will differ from some Polymarket and Kalshi markets.

---

## 9. Geo, ToS, automation

- **US:** "currently available in all U.S. states", and "certain event contracts ... may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s, wf); New York is handled separately (Mesh funding excludes NY). **Outside US:** "currently available only in certain locations due to regulatory requirements" via Foris Capital MU Limited (FSC Mauritius licence GB22200345 per the regulatory page); country list NOT FOUND (https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s, wf).
- **Terms stack (H, https://og.com/rules and /regulatory):** OG/NADEX Terms and Conditions (2026-07-21; Terms of Use, Direct Market Access Terms of Business, Privacy Policy, E-Signature Act, Risk Disclosure), Rulebook 2026-10-13, member agreements, "Activity to Avoid on CDNA" (nadex.com page; the sibling note reports 403 to scripts, which I did not re-test).
- **Automation-relevant text (H unless noted):** API use needs conformance tests and written sign-off (quoted in section 5); rulebook Rule 5 requires "adequate controls ... to prevent excessive messaging"; wash trading, pre-arranged trading, money passes are prohibited; insiders are barred from trading related contracts. The legacy Nadex "Activities to avoid" page (wf, M) says one account per person, no third-party/"account manager" trading and no third-party funding; an agent trading someone else's account is a compliance question.
- **Scraping the public API:** I searched the terms PDF for scrape / robot / automated / spider / market data / redistribut and found **no clause** (NOT FOUND; text extraction was a pure-Python approximation, so not conclusive). The developer docs explicitly invite use of public market-data endpoints before onboarding and state a 100 req/s limit. A market-data licence or redistribution term may sit on nadex.com/market-data (unreadable to the sibling note's scripts; not retried by me): NOT FOUND. https://og.com/robots.txt disallows only account paths (`/settings`, `/portfolio`, `/login`, `/signup`, `/auth`, ...) and explicitly allows GPTBot / ChatGPT-User (H); it does not govern api.crypto.com. Recommend polite polling (well under 100 req/s) and legal review before redistributing quotes.

---

## 10. Liquidity

All figures from the public API on 2026-10-19 (tickers fetched about 01:45 UTC). **Unit:** ticker `vv` equals the contract count `v` on 40,417 of 40,428 tickers, so `vv` is **$1-face notional of contracts traded in 24h**, not cash premium (cash is roughly price x `vv`). The 11 exceptions are perps/brackets with `contract_size` 100 (H, own computation; also the sibling's conclusion).

| Measure | Value | Tag |
|---|---|---|
| Rolling 24h `vv`, all non-combo instruments | **$6.99M face** (lower bound: settled games drop out of the instrument list) | H |
| ... Sports | $6.84M; one game (Cowboys @ Packers, live, 902 instruments) = $5.82M (83% of the total); next best Commanders @ 49ers $171k, NFL champion future $148k | H |
| ... excluding that one game | about $1.17M | H (derived) |
| ... by league (24h `vv`) | NFL $6.26M, CFB $221k, NBA $128k, NHL $83k, MLB $73k, Liga MX $23k, UCL $12k, ATP $7k, WTA $6k, EPL $5k | H |
| ... Politics | $72k; Culture $7k; Economics $1.3k; Climate $0.9k; Crypto-category $0.4k; no-category crypto/FX/index ladders $57k binary + $13k bracket + $1.8k perps | H |
| Cumulative volume on og.com home page | Cowboys @ Packers $7,448,655 at 01:38 UTC (was $6,367,587 about 30 minutes earlier per the sibling note); Texas Senate $497k; US Senate control $467k; LA mayor $191k (unit not stated) | H |
| Third-party weekly figure | The Block data page, row "nadex" in "Weekly Prediction Market Notional Volume in USD" = 230,038,044 with `dateModified` 2026-10-12; metric undefined, period unclear; no OG/CDNA row | M |
| Open interest / TVL | **NOT FOUND**: ticker `oi` is "0" for options; the Senate fixture shows 0 while books hold tens of thousands of contracts. No OI endpoint. | H (absence) |
| Instruments with any 24h volume | 2,304 of 40,428 | H |
| Median touch spread, instruments with two-sided quotes (18,090) | $0.06 (I believe mostly props and long-dated ladders, M; the headline moneylines I sampled are 1 cent) | H |

- **Depth examples (H, `get-book` depth 10, 2026-10-19 ~01:50 UTC):** Patriots @ Bears NFL (Thu 10-22) Patriots bid 0.40 x 18,600 / ask 0.41 x 40,846, with 21,788 at 0.39 and 100,000 at 0.38; Bears bid 0.59 x 13,095 / ask 0.60 x 18,245. US Senate control 2026 Democratic bid 0.63 x 100 (0.62 x 11,555, 0.61 x 7,915) / ask 0.69 x 8,174; Republican bid 0.37 x 50 (0.36 x 10,000) / ask 0.41 x 9,068. The size pattern (100,000 at a level, round lots) looks like market-maker ladders (M). Politics spreads are 4-6 cents wide, crypto ladders are thin (sibling note: 2-5k contracts) (M).
- Trend: not measurable from a single snapshot; volume is strongly NFL-weekend-driven (L).

---

## 11. Event coverage and overlap (where arbitrage could exist)

Counts are distinct events/underlyings in my crawl (H).

- **Sports (875 events, 38,981 non-combo instruments incl. props):** NFL (80 events listed), college football (112), NBA (109), NHL (76), MLB (19), Liga MX (31), Champions League (19), EPL (22) and other soccer, ATP/WTA tennis (119), WNBA, NASCAR, F1, esports. **Overlap with Kalshi / Polymarket (and Gemini, UDX): high** for moneyline, spread, total, player props and futures (NFL/NBA/MLB champion). Watch the rule differences in section 8.
- **Politics (133 events, 376 instruments):** US Senate control 2026, individual Senate and House races, governors, 2028 President (from the sibling note), "Maine-Texas Senate Combo". **Overlap: high** with Kalshi and Polymarket, but thin here ($72k/24h).
- **Economics (9 events):** Fed decisions, recession, jobs, etc. (sibling note M); $1.3k/24h. **Overlap: Kalshi; very thin.**
- **Crypto/FX/commodity ladders (37 underlyings with no category: BTC, ETH, XRP, SOL, ADA, DOGE, AVAX, LINK, DOT, LTC, XLM, BCH, CRO, HBAR, SHIB, SEI, ONDO, PEPE, BONK, FLOKI; EUR/USD, USD/JPY, GBP/USD, AUD/USD; S&P 500, Nasdaq 100, Russell 2000, Dow; gold, silver, crude).** Overlap with Kalshi/Polymarket crypto and index ladders; different settlement index (exchange-calculated midpoint, section 8), so basis risk.
- **Culture (14 events), Climate (1), long-dated Crypto (5):** small overlap.
- **Combos:** 16,263 `EVENT_COMBO` parlays; skip.

---

## 12. Liquidity sharing (is it an independent leg?)

- **Independent of Kalshi, Polymarket, Gemini and Underdog's UDX: yes (H for a separate exchange, DCM and DCO with its own matching engine).** The same professional market makers may quote on several exchanges (M).
- **NOT independent of its own distributors (H):** "OG.com Markets allows trading directly or through intermediaries, including DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures" (https://og.com/regulatory); Robinhood "will route retail event contract volume" to this exchange (wf); og.com/about lists Underdog among partner logos (wf); Predict Pro is the Crypto.com-branded front end on the same exchange (wf). Repo notes add: DraftKings contracts are CME or CDNA listings (`draftkings-predictions.md`), part of Underdog Predict's flow routes to CDNA, and Truth Predict is a Crypto.com-powered brand (`truth-predict-...md`; the task hint also says so, M, not re-verified by me). **Registry rule:** model these as `shared_with = ["og-com-markets"]` and do NOT count them as separate arbitrage legs; one adapter here covers them all. Whether partner orders rest in the same book as og.com retail is not stated by OG, but the regulatory page and the Robinhood release point to one exchange (M).

---

## 13. Adapter spec (for the aggregator)

- **Universe sync:** page `get-events` / `get-instruments` with `since` (ns) plus `next_cursor`; use `PREDICT_CATEGORY` / `LEAGUE` / `event_symbols` filters; skip `inst_type = EVENT_COMBO`; treat `PERPETUAL_SWAP` as out of scope. Re-poll lifecycle states for `Closed` / `SETTLED` transitions because settled events vanish from the instrument list.
- **Prices:** poll `get-tickers` in batches of 100 symbols (b/k/a/c/v). A full 40k universe is about 405 calls; restrict to instruments with recent volume or to events starting within N days for the hot loop. Fetch `get-book` (depth 10-50) only for candidate pairs. Quotes are strings; price = implied probability of that instrument's Yes; NO ask = 1 - Yes bid.
- **Normalise key:** `underlying_symbol` + `PREDICT_CONTRACT_TYPE` + `PREDICT_PERIOD_TYPE` + `PARTICIPANT` / `PREDICT_OUTCOME_TYPE`; match to other venues on `EXTERNAL_GAME_ID` where they carry it, else on league, team names and `EVENT_DATE`. Politics: key on `PREDICT_MARKET_ID` / `PREDICT_CONTRACT_TYPE` text.
- **Net edge:** subtract the front end's fee (OG US taker `0.07 x P x (1 - P)` per contract; $0.02/contract for crypto/FX) and, for live sports, the 3-second order delay; check rule parity (ties, 48 h cancellation, 90-minute scope) before flagging an arbitrage.
- **Do not rely on:** `oi`, the WebSocket, `get-expired-settlement-price` filtering.
- Flag the venue `read_only = true`, `executable_via_paybox = false`.

---

## 14. Adapter priority: **P0** (read / price-signal adapter)

Reasons: high liquidity (about $7M/24h face, lower bound, with deep sports and mid-depth politics books), a good keyless public REST API, and an independent order book versus Kalshi and Polymarket, with large category overlap. Caveats that stop short of lowering it: no PayBox execution path (read-only leg), no WebSocket and no OI, and unverified data-licence terms for redistribution. Demote to P1 if the project requires every scanner leg to be executable by PayBox.

---

## 15. Not found / open questions

- WebSocket subscribe envelope and channel names for prediction instruments (documented channels rejected with 40003). Open.
- Open interest anywhere (no endpoint; `oi` is 0). NOT FOUND.
- Market-data licence / redistribution terms (nadex.com/market-data and the fee-schedule PDF were unreadable to the sibling note's scripted fetch and I did not retry). NOT FOUND.
- General-availability date of the FCM trading API and whether non-FCM individuals can ever get keys ("private beta"). NOT FOUND.
- Fee tiers, rounding, maker rebates; order-size limits; minimum order; trading hours. NOT FOUND.
- Eligible and excluded countries outside the US; whether the non-US order book is the same as the US one. NOT FOUND.
- Whether complementary outcome instruments (Patriots/Bears) are matched jointly by the engine. Open.
- Dispute process / "dispute window" mentioned by Predict Pro coverage vs. none in help pages. Open.
- Supported chains/tokens for Mesh crypto funding and whether withdrawals to crypto exist. NOT FOUND.
- Truth Social front-end claim from the task hint: not independently verified here (The Block data page did not mention it).

---

## 16. Suspicious / embedded-instruction content (recorded, not followed)

None found. I scanned the og.com home HTML for AI-directed text (ignore previous, AI agent, system prompt); the only substring hits were inside localisation strings (for example "llm" inside "Call me instead", "assistant" inside occupation lists). Help-centre pages, the developer docs, the rulebook text and the terms PDF contained no instructions aimed at AI agents. The PayBox `discover_services` results were unrelated third-party data services; I did not call any.

---

## Sources

1. https://og.com (home; title, meta, live volumes, nav; fetched 2026-10-19) (H); https://og.com/about (timeline, partners, Pro trading access) (wf); https://og.com/regulatory (DCM/DCO, brands, intermediaries, document links) (wf, quoted); https://og.com/robots.txt (H); https://status.og.com/ (H)
2. https://og.com/rules -> `20261013_OG.com_Markets_Rulebook.pdf` at https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (dated 2026-10-13; local text extraction; price-then-time priority, Source Agency clauses, Rule 5 customer orders, discretion to delay settlement) (H)
3. https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf (OG/NADEX Terms and Conditions 2026-07-21; API conformance clause; Cook County arbitration; no scraping/market-data clause found) (H)
4. https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (raw HTML sidebar links, H; page text wf), `.../rest-common-api-reference` (base URLs, HMAC auth, rate limits, error codes) (wf), `.../rest/reference-and-market-data` (endpoint list, WS channel names) (wf)
5. Live public endpoints (GET only): https://api.crypto.com/fcm/v1/public/{get-events, get-instruments, get-tickers, get-book, get-trades, get-ticker-histories, get-instrument-lifecycle-states, get-instrument-market-status, get-expired-settlement-price} (H, fixtures); wss://stream.crypto.com/fcm/v1/market (connect + subscribe attempt, "Unrecognized channel") (H)
6. https://help.og.com/en/articles/12958828-fees-limits (fees, 2026-09-15), /13051724-general-settlement, /13051729-sports-settlement, /13051762-temporary-delay, /12752911-introducing-og-com-u-s, /15476413-introducing-og-com-outside-u-s, /15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions (all wf)
7. https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (wf)
8. https://www.cryptotimes.io/2026/10/15/crypto-com-launches-predict-pro-for-us-prediction-market-traders/ (Predict Pro; entity roles) (wf, M)
9. https://www.theblock.co/data/decentralized-finance/prediction-markets (Nadex weekly notional row; metric undefined) (wf, M)
10. In-repo notes consulted as leads and cross-checked, not copied: `docs/research/venues/og-crypto-com-nadex.md`, `draftkings-predictions.md`, `underdog-predict-underdog-exchange-udx.md` (their external claims are M here)
11. PayBox `discover_plugins` / `discover_services` (read-only, 2026-10-19) (H)

## Fixtures (`docs/research/fixtures/og-com-markets-og-predictions-crypto-com/`)

Raw public-API responses, pretty-printed only, unless noted:
- `events_politics_limit2_2026-10-19.json`, `events_nfl_limit4_2026-10-19.json`
- `instruments_us_senate_control_pair_2026-10-19.json`, `instruments_nfl_moneyline_pair_2026-10-19.json`
- `tickers_us_senate_control_pair_2026-10-19.json`, `tickers_nfl_moneyline_pair_2026-10-19.json`
- `book_us_senate_control_dem_depth10_2026-10-19.json`, `book_us_senate_control_rep_depth10_2026-10-19.json`, `book_nfl_moneyline_away_depth10_2026-10-19.json`, `book_nfl_moneyline_home_depth10_2026-10-19.json`
- `trades_us_senate_control_dem_count5_2026-10-19.json`, `ticker_histories_nfl_moneyline_count3_2026-10-19.json`
- `lifecycle_states_us_senate_control_2026-10-19.json`, `market_status_nfl_event_limit2_2026-10-19.json`
- `expired_settlement_price_head8_2026-10-19.json` (trimmed to 8 records, with a `_note`)
- `ws_market_subscribe_probe_2026-10-19.txt` (raw output of the 10-second public WebSocket attempt)
- `volume_summary_derived_2026-10-19.json` (my own computation from the full crawl: counts by type and category, 24h `vv` by category/league/event)
- `fee_schedule_extract_2026-09-15.md` (extract of the help-centre fee table, WebFetch summary)

Privacy check: scripts and fixtures were grepped for `@`, the user's name and email domain before and after running. The only `@` hits are team names ("Away @ Home") and index names (`BTCUSD-INDEX@CdnaFunded`); no personal identifier appears in any request, header, URL, search query or saved file. Scripts live in the session scratchpad, not in the repo.
