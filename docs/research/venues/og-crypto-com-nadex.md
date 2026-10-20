# OG.com / Crypto.com Derivatives North America (CDNA) / Nadex - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (server clock of the API probes: about 01:08-01:25 UTC). READ-ONLY: official docs and site pages (curl, WebFetch), unauthenticated GETs to the documented public market-data endpoints, one 12-second unauthenticated WebSocket connect-and-subscribe attempt, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text was treated as untrusted data; nothing in it was followed. Generic User-Agent `insurance-markets-research/0.1` on every scripted request.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale. "(wf)" = the page was read through the WebFetch summariser, not as raw text. WebSearch was out of budget for this task, so there is no search-engine corroboration; everything below comes from fetched pages.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/og-crypto-com-nadex/` (listed at the end).

---

## Verdict

- **Adapter priority: P0 (as a read / price adapter).** It is live, regulated, about an order of magnitude deeper at the touch than Gemini's books in comparable politics and sports markets (per the Gemini note), has its own central limit order book (an independent leg versus Kalshi, Polymarket, Gemini, Underdog UDX), and exposes a **keyless public REST market-data API** (events, instruments, tickers, depth up to 50 levels, trades, ticker history, lifecycle and settlement values). Overlap with Kalshi / Polymarket is large: NFL / college / NBA / NHL / soccer moneylines, spreads and totals; US Senate / House / 2028 politics; Fed decisions; crypto price ladders.
- **Cautions that stop short of lowering it:** (1) the developer docs are labelled "Preview" and "private beta"; (2) **trading is not possible from a PayBox wallet** (USD account, KYC, FCM onboarding, HMAC API key, written conformance sign-off before live use); (3) market-data licence terms for redistribution were not readable (NOT FOUND); (4) settlement rules differ from Polymarket / Kalshi in ways that matter for arbitrage (48-hour cancel rule paying VWAP, ties at $0.50, exchange discretion).
- **Best use now:** a read adapter feeding the scanner and Quotient-style signals (normalise to implied probability, rank by `vv`, check lifecycle). Execution on this leg is a separate, manual or custodial-API-key decision outside PayBox signing.
- Confidence in the overall verdict: medium. Liquidity numbers are a single-snapshot lower bound (see section 10).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| og.com title/meta | "OG.com - Prediction Markets & Real-Time Odds" / "The premier prediction market for live odds, combos, and real-time event trading" (https://og.com, fetched 2026-10-19; HTTP 200, Cloudflare) | H |
| Live prices and volume on the home page | NFL "DAL Cowboys @ GB Packers LIVE 2ND" with "$6,367,587 vol." and "+22 more markets" at fetch time (https://og.com) | H |
| Public API serves live data | `public/get-tickers` last-trade timestamps within seconds of the request; 56,446 instruments listed, 40,485 tickers returned (own crawl, section 10) | H |
| Corporate timeline | "2008 Originally HedgeStreet ... later became Nadex and was acquired by Crypto.com. 2024 ... first CFTC-regulated exchange to list sports event contracts. 2026 Crypto.com launches OG.com". The same page says Crypto.com acquired Nadex in 2022 (https://og.com/about) | H |
| Launch | "Crypto.com Launches 'OG'" announcement dated 3 February 2026 (https://og.com/company-news/cryptocom-launches-og-a-new-prediction-market-experience) (wf) | H |
| Spin-off and valuation | Robinhood announcement 8 September 2026: Robinhood designates OG.com an "infrastructure and clearing provider"; Citadel Securities' investment in Crypto.com at a $20B valuation includes a "standalone $5 billion valuation for OG.com through the spin-off" (https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine) (wf). The task hint's "$5B" and "Robinhood from 2026-09-08" are the announcement date and valuation, not a go-live date: the page gives no go-live date | H (announcement), NOT FOUND (go-live date) |
| Rulebook currency | `20261013_OG.com_Markets_Rulebook.pdf`, "Dated: October 13, 2026" (https://og.com/rules) | H |
| Status page | https://status.og.com/ is linked from every page (not fetched) | M |
| Nadex brand | nadex.com still resolves and is linked from og.com for Notices, Market Data and Fee Schedule; the legal entity "North American Derivatives Exchange, Inc. (NADEX)" is named in the 2026 rulebook. nadex.com returns HTTP 403 to scripted curl (bot protection); I did not try to evade it and used WebFetch instead | H |

**Verdict: still_live = true.** "Nadex", "CDNA" (Crypto.com | Derivatives North America) and "OG.com Markets" are three names for one CFTC-registered exchange and clearinghouse: "North American Derivatives Exchange, Inc. ... registered with the CFTC as a Designated Contract Market (DCM) and Derivatives Clearing Organization (DCO) and operates two brands ... OG.com Markets and Crypto.com | Derivatives North America (CDNA)" (https://og.com/regulatory; also rulebook intro) (H). OG.com Markets is an affiliate of **Foris DAX FCM LLC (d/b/a OG Broker)**, a CFTC-registered FCM; the only clearing member listed is Foris DAX FCM (https://og.com/clearing-members) (H).

---

## 2. Kind and market model

- **Kind:** regulated exchange, **central limit order book**, price-time priority (rulebook chapter 5, "Priority of Orders": orders are matched "first by price and then time priority") (H). Fully collateralised binary event contracts (priced $0.01-$0.99, $1 payout) plus a few other classes. Not an AMM, not parimutuel, no on-chain tokens.
- **Instrument model (H, `public/get-instruments` and docs):** Event (`symbol` like `NFL-00012-261018-M`) -> Instruments (tradable contracts), one instrument per outcome. An "Event" groups instruments by `underlying_symbol`; metadata sits in `event_details.metaData`. Counts from my full crawl (2026-10-19 ~01:10 UTC, H): 56,446 instruments = **40,461 `BINARY_OPTION`**, **15,915 `EVENT_COMBO`** (parlays), **64 `BRACKET_OPTION`** (Nadex-style range contracts, `contract_size` 100), **6 `PERPETUAL_SWAP`** (BTC, ETH, SOL, HYPE, ZEC, SEI USD perps; margin).
- **Outcome tokenisation:** none. A 2-way game is two binary instruments (e.g. "Cowboys to win" `...O.1.1...` and "Packers to win" `...O.1.2...`), each with its own book; 3-way soccer and period markets add a "Draw" instrument (`PREDICT_CONTRACT_TYPE` "Moneyline (3-Way)"). In the sample, the two books were complementary to the cent (Cowboys bid 0.28 / ask 0.29, Packers bid 0.71 / ask 0.72), but whether the engine links them is not documented (M). Longs buy Yes; a short position "has the right to receive a fixed Settlement Value if, and only if, the ... Payout Criteria does NOT encompass the Expiration Value" (rulebook definition of Event Contract) (H), so selling = buying "No" at 1 - price.
- **Symbols:** `NX.F.OPT.<EVENT>.<PERIOD>.<n>.<n>[.<expiry>]`, e.g. `NX.F.OPT.NFL-00012-261018-M.O.1.2.20270301`; politics `NX.F.OPT.ELECT-USSNTPRTY26.O.1.1`; crypto ladder `NX.F.OPT.BCH.W.1.1.20261024`; bracket `NX.VS.BKT.SHIB.W.1.2.20261024` (H, fixtures). `expiry_timestamp_ms` on sports props is a generic far date (2027-03-01), not the event time; use `event_details.metaData.EVENT_DATE` (H).
- **Contract fields that matter for matching (H, fixtures):** `PREDICT_CATEGORY` (Sports / Politics / Culture / Economics / Crypto / Climate), `SPORTS_GROUPING`, `LEAGUE`, `EVENT_DATE`, `HOME_PARTICIPANT` / `AWAY_PARTICIPANT`, `PARTICIPANT`, `PREDICT_CONTRACT_TYPE` (Moneyline, Spread, Total Points, player props, "Race to N points"), `PREDICT_PERIOD_TYPE` (Full-Game, 1st Half, 90 Minutes and Stoppage Time), `PREDICT_OUTCOME_TYPE` (Home / Away / Draw), `EXTERNAL_GAME_ID` (a third-party feed id), `PREDICT_MARKET_ID`, `PREDICT_OUTCOME_ID`. Price tick $0.01 (events) or $0.001 (combos), `quantity_decimals` 0 (whole contracts).
- **Categories not "binary":** no scalar markets; brackets are range/touch products on crypto and FX; "how many Senate seats" style markets are modelled as one binary per bucket.

---

## 3. Chains and collateral

- **No chain.** Collateral is **USD** held at the exchange, "in segregated bank accounts at BMO Harris Bank and Fifth Third Bank and ... not commingled with OG operational funds" (https://og.com/legal) (H). Rulebook footnote: deposits may be "U.S. dollars, British Pounds or Euro" (rulebook membership chapter, footnote 3) (H). Outside-US customers use a USD wallet funded by SWIFT or card (help.og.com "Outside U.S." wallet collection: Set Up USD Wallet, USD Deposit via SWIFT, Debit Card / Apple Pay / Google Pay, USD Withdrawals via SWIFT) (H, article titles).
- **Crypto funding exists, US only:** "Crypto-to-Cash Deposits Powered by Mesh": link Coinbase / MetaMask / Phantom or send by QR; non-USDC assets are converted to USDC, then "converted to USD right away"; no OG fee, network fees apply; "US customers only. New York customers are excluded" (https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions) (wf, H). Supported chains and tokens: NOT FOUND (page does not list them). Withdrawal back to crypto: NOT FOUND.
- **Conflict:** the legacy Nadex "Activities to avoid" page says "Third-party funding and cryptocurrency funding are not accepted" (https://www.nadex.com/rules/activities-to-avoid-on-nadex) (wf). The newer OG help centre documents the Mesh crypto route. Treat the OG help centre as current and the Nadex page as legacy (M).

---

## 4. Read API (official, public, keyless for market data)

- **Docs:** https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (Docusaurus site titled "Crypto.com GEN4 FCM US B2C API Documentation (Preview)"; linked as "APIs" from og.com) (H). Statement: "NOTE: This is under private beta. It will be accessible once it is generally available ... Public market-data endpoints can be explored before onboarding." Change log: 2026-03-21 "Initial Version", 2026-07-17 "Card Top Up API"; "No breaking change schedule at the moment" (H). A "FIX Document Pack > Prediction Market Appendix" is referenced for full metadata (NOT FOUND; not public).
- **Base URLs (H):**
  - Production REST: `https://api.crypto.com/fcm/v1/{method}` (documented). The same paths also answer under `https://api.crypto.com/dcm/v1/` (used in the docs' prose; the data differ in ordering/recency, probably the exchange-level feed; M).
  - UAT sandbox REST: `https://uat-api.3ona.co/fcm/v1/{method}`; unauthenticated GETs work and return UAT data (H, probed once).
  - WebSocket: `wss://stream.crypto.com/fcm/v1/market` (market data) and `wss://stream.crypto.com/fcm/v1/user` (user, authenticated); UAT `wss://uat-stream.3ona.co/fcm/v1/...` (documented; H).
- **Public endpoints (all `GET`, no key; H, each hit live):**

| Endpoint | Use | Observed shape |
|---|---|---|
| `public/get-events` | events; params `limit` (def 100), `since`, `cursor`, `LEAGUE`, `SPORTS_GROUPING`, `PREDICT_CATEGORY`, `PREDICT_EVENT_TYPE`, `event_date`, `event_end_date` | `{id,method,code,result:{data:[{symbol,series_symbols,name,event_date(ns),last_updated_time(ns),event_details:{metaData,eventName}}],next_cursor}}` |
| `public/get-instruments` | contracts; params `limit` (def 500, max 1000), `since` (ns), `cursor`, `inst_type`, `event_symbols` (<=10), `symbols` (<=10), `is_combo`, `PREDICT_CONTRACT_TYPE` | per instrument: `symbol, inst_type, display_name, base_ccy, quote_ccy, quote_decimals, quantity_decimals, price_tick_size, qty_tick_size, tradable, expiry_timestamp_ms, underlying_symbol, contract_size, event_details{eventCode,metaData,eventName,attributes}, last_updated_time, inst_id, detail_product_type, security_type, security_sub_type` |
| `public/get-tickers` | `instrument_name` **required**, comma list, max 100 | `{i,h,l,a,c,b,k,v,vv,oi,t}`: high, low, last, 24h change, best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`, open interest `oi`, ms timestamp. Prices are strings |
| `public/get-book` | `instrument_name`, `depth` (<=50) | `data:[{bids:[[price,qty],...],asks:[...],t}]` (the doc says `[price,qty,num_orders]`; live responses had only two elements) |
| `public/get-trades` | `instrument_name`, `count` (<=150), `start_ts`, `end_ts` (7-day max window) | `{d,t,tn,q,p,s,i,m}` with `s` lower-case "buy"/"sell" live (the doc says upper-case) |
| `public/get-ticker-histories` | `instrument_names` (<=20), `start_ts`, `end_ts`, `count` | 60-second `{i,t,b,k,a}` bid/ask/last snapshots |
| `public/get-instrument-lifecycle-states` / `-market-status` | per-event state changes (`since`, `cursor`, `event_symbol`) | `state` Active/Suspended/Closed, `security_trading_status` e.g. `SETTLED`, `reason` e.g. `SCHEDULED_CLOSE` |
| `public/get-expired-settlement-price` | `instrument_name` required | `{i,x(expiry ms),v,t}`; `v` "1.00" or "0.00" for binaries. Returned an unrelated list of FX/ETH Aug-2026 instruments for my query (the filter appeared ignored; L) |

- **Pagination / incremental sync (H, doc + tested):** `since` is **nanoseconds** (the get-events page says milliseconds, which is wrong: passing an ms value returned every record). Use `last_updated_time` as the next `since`; follow `next_cursor`. With **no** `since`, results come newest-first; with `since=0` ascending. A full instrument crawl is 57 pages of 1,000 (about 100 MB) - use `event_symbols` or `LEAGUE` filters and incremental `since` rather than full dumps.
- **Gaps and quirks (H):** (1) events returned without `since` often have empty `metaData` (the instruments carry the metadata); (2) `get-tickers` with no `instrument_name` returns `400 {"code":40004,"message":"instrument_name or instrument_names is required"}` although the doc says "all or particular"; (3) `oi` was "0" for every binary and bracket option and populated only for the 6 perpetuals, so **there is no usable open-interest feed**; (4) settled events vanish from `get-instruments` (section 10); (5) no endpoint for the resolution *rule text*: that lives in the rulebook / help centre.
- **Auth and limits (H, Common API Reference):** public market data: "100 requests per second" per method per IP. Authenticated: `private/create-order`, `cancel-order`, `cancel-all-orders` 15 requests / 100 ms each; `get-order-detail` 30 / 100 ms; `get-trades` and `get-order-history` 1 / s; everything else 3 / 100 ms. WebSocket: user API 150 req/s, market data 100 req/s. I made about 500 GETs at roughly 3-8 req/s with no 429.
- **WebSocket (documented, NOT verified):** docs list `book.{instrument}.{depth}` (10 or 50), `ticker.{instrument}`, `trade.{instrument}`. My connect to `wss://stream.crypto.com/fcm/v1/market` succeeded and a `subscribe` with `{"id":1,"method":"subscribe","params":{"channels":[...]}}` returned `{"code":40003,"message":"Unrecognized channel"}` for a prediction instrument and for `BTC-USD-PERP`. So either the subscribe envelope or the channel naming differs from the (incomplete) doc, or the market stream needs enablement. Use REST polling until verified.

---

## 5. Trade path (documented, not exercised)

- **Programmatic orders exist, but only for approved FCM accounts.** `POST private/create-order` (also `amend-order`, `cancel-order`, `cancel-all-orders`, `close-position`, `get-open-orders`, `get-order-detail`, `get-order-history`, `get-trades`, `get-transactions`, `user-balance`, `get-positions`) (H, sidebar and trading page). Order types LIMIT / MARKET / STOP / STOP_LIMIT; TIF GOOD_TILL_CANCEL / IMMEDIATE_OR_CANCEL / FILL_OR_KILL / GOOD_TILL_DATE; `client_oid` up to 36 chars; creation is asynchronous and confirmed via the authenticated WebSocket `user.order` / `user.trade` channels (H).
- **Auth:** JSON body `{id, method, api_key, params, nonce, sig}`; `sig` = hex HMAC-SHA256 over `method + id + api_key + sorted-params-string + nonce` with the API secret; nonce within 60 s; all numbers as strings; optional read-only keys and IP allowlists (H, Common API Reference). No EIP-712, no wallet signature.
- **Prerequisites (H):** "To use the FCM APIs, you must complete FCM onboarding through Crypto.com Exchange. This requirement also applies if you currently use OG.com or the Crypto.com Main App." The docs are "private beta"; og.com/about shows "Pro trading access: Trade predictions over REST, WebSocket and FIX ... API Docs ... Coming soon to Crypto.com Exchange UI". Under the retail terms, API users must "complete all conformance tests and procedures required by NADEX and ... receive written confirmation ... before any use of the NADEX System in a live production environment" (Direct Market Access Terms of Business, section 5, inside the 2026-07-21 Terms and Conditions PDF) (H).
- **FIX / third-party routes (titles only, M):** announcements "CryptoStruct to Offer Connectivity to CFTC-Regulated Prediction Markets Through New Integration with OG.com Markets" (2026-10-13; normalized APIs for algorithmic traders) and "Trading Technologies ... Support for OG.com and Crypto.com" (2026-08-18). The rulebook says customers of intermediating members "may not submit orders directly to the Exchange" and orders go via the intermediating member over a FIX connection (Rule 5.x) (H).
- **In-play delay (H):** "a short hold period applied to any order placed after an Industry Event has started ... default delay is 3 seconds" (https://help.og.com/en/articles/13051762-temporary-delay). Any live-sports leg here has a 3-second latency penalty.

---

## 6. PayBox reachability: **no (funding only, US residents, off-chain)**

- A PayBox EVM wallet cannot place or sign orders here: orders are HMAC-signed requests from a KYC'd, FCM-onboarded USD account. There is nothing to put in a transaction proposal or typed-data signature (H, sections 3 and 5).
- **Funding-only path (M):** a US (non-NY) customer could fund via Mesh by sending USDC from a self-custody wallet; chain list unpublished. Whether PayBox could be the sending wallet is untested and irrelevant to trading.
- PayBox catalog check (own read-only calls, 2026-10-19): `discover_plugins` query "OG.com Crypto.com prediction markets" returned no plugins; `discover_services` query "OG.com Crypto.com CDNA prediction market" returned unrelated third-party data services (Polymarket / Hyperliquid readers); no OG / CDNA route (H).
- Speculative and unverified: storing the OG API key and secret as a PayBox "secret" credential and signing HMACs outside PayBox. Not a PayBox signing path and would still need the FCM onboarding above (L).

---

## 7. Fees

Source: https://help.og.com/en/articles/12958828-fees-limits (dated September 15, 2026; read as raw text, H).

| Where you trade from | Markets | Open | Close before expiry | Settle in the money | Settle out of the money |
|---|---|---|---|---|---|
| US (incl. NY) | "Most markets (incl. Sports, Politics, etc.)" | **Taker `0.07 x C x P x (1 - P)`; maker `0.0175 x C x P x (1 - P)`** (C = contracts, P = price in dollars) | same formula | waived | none |
| US | Crypto, FX, Commodities, Equity indices | **$0.02 per contract** | $0.02 per contract | waived | none |
| Outside US | all markets | **$0.02 per contract** | $0.02 per contract | waived | none |

- "Orders that fill immediately, including all market orders, are charged the taker fee. Orders that rest in the order book and are filled later are charged the maker fee." Taker fee at P = 0.50 is 1.75 cents per contract; maker 0.44 cents (derived, H). The fee is the trader's; no separate gas.
- Rounding rules, volume tiers, market-maker rebates and the exchange fee schedule PDF (filename seen: `2026-08_NADEX_Fee_Schedule.pdf`, via WebFetch of https://nadex.com/pricing) were **not read**: NOT FOUND (searched: nadex.com/pricing returns 403 to scripts; help centre fee article).
- The legacy Nadex pricing page lists event contracts at "$0.02 trading fee per contract" and knock-outs at "$1 ... per contract" (wf, L: legacy $100-contract schedule, not the OG US formula).
- **Conflict (flag):** `docs/research/venues/draftkings-predictions.md` quotes a CDNA / DKEx fee by price band ($0.01 / $0.02 / $0.03) from a secondary source (M). It does not match OG's own formula above; partner front ends (Robinhood, DraftKings, FanDuel, Fanatics, Underdog) can charge their own fees on top. The scanner should take fees per front end.
- Position limit: "$1 contract: 2,500,000" per event (help article); the rulebook gives per-class limits, e.g. 2,500 contracts (market makers 250,000) on the Industry Event contract spec and 250,000 (market makers 2,500,000) on the election spec; these differ from the help-centre 2,500,000, so check per class (H, rulebook chapter 12). Order-size limits: NOT FOUND.

---

## 8. Resolution mechanism and dispute risk

- **Resolved by the exchange itself** against a named "Source Agency" in each contract specification (H, rulebook chapter 12): sports Industry Event contracts use "the final result of the Industry Event reported by AP News or as a back-up Source Agency, any U.S. national news provider"; election contracts use a list (NYT, AP, Bloomberg, Reuters, Axios, Politico, Washington Post, WSJ, ABC, CBS, CNN, Fox, MSNBC, NBC "as determined by the Exchange"), expiration 10:00 AM ET one day after. Crypto / FX ladders settle on exchange-calculated indices (`underlying_symbol` like `BTCUSD-INDEX@CdnaFunded`); the index methodology was not read: NOT FOUND (rulebook "Index Value" sections not reviewed).
- **Settlement value:** $1 per in-the-money fully-collateralised contract (help centre); legacy margined classes in the rulebook use $100 (H).
- **Help-centre rules (raw text, H):** "Any disqualifications, revisions, or amendments made by the news or market data provider ... after the event concludes do not affect settlement." **Cancelled event** if "postponed, canceled, or otherwise not completed within 48 hours of its originally scheduled start": buyers of the specified outcome get the **one-week VWAP** before cancellation, the other side gets $1 minus that, and open-trade fees are refunded. **Ties with no tie outcome listed pay $0.50 to both Yes and No** (fees not refunded). Tennis is cancelled only after 14 days; MLB postponed to another day = cancelled; soccer settles on 90 minutes plus stoppage time (extra time and penalties do not count unless stated); overtime counts in NFL / NBA / NHL; F5 baseball ties resolve $0.50 (https://help.og.com/en/articles/13051729-sports-settlement). "If the Source Agency does not actually announce the outcome ... the Settlement Date ... will be delayed until the Underlying outcome is released" (rulebook contingencies).
- **Post-settlement corrections:** "The CDNA Exchange reserves the right to adjust any settlement if it was made in error ... Customer account balances may be increased or decreased"; if no verifiable outcome, "settled at the CDNA Exchange's reasonable discretion" (H). No appeal process for traders is described (NOT FOUND); member disputes go to **binding arbitration in Cook County, Illinois, under Illinois law** (terms of use, DMA terms) (H).
- **Dispute risk for arbitrage (M):** centralised, discretionary, news-agency based; the 48-hour VWAP cancel rule, tie handling and soccer 90-minute scope will differ from some Polymarket / Kalshi markets, so every cross-venue pair needs rule matching. Settlement is prompt for sports (lifecycle `SETTLED` seen within minutes of game end).

---

## 9. Geo, ToS, automation

- **US:** "available in all U.S. states, but certain event contracts may be unavailable in some states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s) (wf, H); New York is handled separately (separate portfolio and funding articles; NY launch announced 2026-06-13). **Outside US:** operated through Foris Capital MU Limited (Mauritius FSC licence GB22200345, footer), "currently available only in certain locations"; eligible and excluded countries: NOT FOUND (https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s) (wf). Fees and funding differ outside the US (section 7).
- **Terms stack:** OG Retail Terms and Conditions (2026-07-21; Terms of Use, Direct Market Access Terms of Business, Privacy Policy, E-Signature Act, Risk Disclosure), Trading Member, Market Maker, Clearing Member, Entity Connection, Executing Broker and Direct Market Access Terms of Business (2026-06 / 2026-07), Rulebook 2026-10-13, "Activities to avoid" (all linked from https://og.com/rules) (H).
- **Automation-relevant text (H, short quotes):** API access needs conformance tests and written sign-off before live use; "NADEX in its sole discretion may suspend, condition or revoke your access ... for any reason"; "any Member submitting orders ... manually or via automated functionality, must ensure adequate controls are in place to prevent excessive messaging" (rulebook Rule 5); wash trading, spoofing, pre-arranged trading, "money passes" and front-running are prohibited; industry participants and insiders are barred from trading the related event contracts. One account per person and no third-party or "account manager" trading, funds only from the member's own bank account (https://www.nadex.com/rules/activities-to-avoid-on-nadex) (wf) - this makes an agent trading someone else's account a compliance question (M).
- **Scraping the public API:** no ToS clause about the public market-data endpoints was found in the docs I read (NOT FOUND). The nadex.com "Market Data" page, which may carry data licence terms, returned empty content via WebFetch and 403 to curl (NOT FOUND). The docs state a 100 req/s per IP public limit. og.com robots.txt disallows only account paths (`/settings`, `/portfolio`, `/login`, ...) and explicitly allows GPTBot / ChatGPT-User (H); it does not govern api.crypto.com.

---

## 10. Liquidity

All figures from the public API on 2026-10-19 unless stated. **Unit:** ticker `vv` equals the contract count `v` on 40,476 of 40,485 tickers, i.e. **$1-face notional of contracts traded**, not cash premium (cash is about price x `vv`). The nine exceptions are perps and bracket options with `contract_size` 100 (H, own computation).

| Measure | Value | Tag |
|---|---|---|
| Rolling 24h `vv`, all listed binary / bracket / perp instruments | **$6.13M face** (lower bound; see below) | H |
| ... of which Sports | $6.00M; one game (Cowboys @ Packers, Sunday night, 914 instruments) = $4.97M, Commanders @ 49ers $165k, NFL champion future $148k | H |
| ... Politics | $72k (US Senate control $15.7k, Texas Senate $12.9k, Senate seats $6.6k, 2028 President $5.5k) | H |
| ... Crypto / FX / index ladders (no category) | $47k (BTC intraday $18.6k, BTC weekly bracket $10.5k, BTC daily $6.1k, ETH intraday $5.1k) | H |
| ... Culture / Economics / Crypto category / Climate | $7.0k / $1.3k / $0.4k / $0.9k | H |
| Cumulative volume shown on og.com (home page, ~01:08 UTC) | Cowboys @ Packers $6,367,587; Texas Senate $497,098; US Senate control $467,537; LA mayor $191,313; DWTS winner $187,595 (unit not stated, likely face USD) | H |
| Third-party weekly figure | The Block data hub, "Weekly Prediction Market Notional Volume in USD": `nadex` 230,038,044 (week to 2026-10-12; metric undefined) (wf) | M |
| Front-end flow | Underdog Predict routed $612.5M over 30 days to Kalshi and CDNA combined (other repo note, M); Robinhood "largest B2B ... partnership for OG.com by transaction volume", no figure (wf) | M |
| Open interest / TVL | **NOT FOUND** (ticker `oi` is 0 for all options; only perps populated, total 106; no public OI endpoint; searched docs and endpoints) | H (absence) |

- **Lower-bound caveat:** `get-instruments` drops settled events (the early Sunday NFL slate was already gone: `NFL-00001-261018-M` had 2 instruments left), so the 24h total misses every settled game. The Block's $230M/week implies about $33M/day, roughly 5x my snapshot; I could not reconcile them (metric undefined).
- **Depth (H, `get-book` depth 50, same snapshot; contracts per side across all visible levels; mostly round-lot market-maker style ladders):**

| Market | Best bid / ask | Contracts bid / ask |
|---|---|---|
| US Senate control 2026, Democratic | 0.63 / 0.69 | 19.6k / 12.5k |
| Texas Senate 2026, Republican | 0.39 / 0.42 | 45.7k / 32.8k |
| 2028 President, Vance | 0.19 / 0.25 | 11.8k / 11.1k |
| Fed Oct 2026 unchanged | 0.86 / 0.89 | 11.0k / 31.0k |
| US recession by end 2026, Yes | 0.05 / 0.12 | 11.0k / 9.0k |
| CFB Ole Miss @ Texas, Ole Miss | 0.41 / 0.43 | 32.2k / 32.6k |
| NBA 76ers @ Knicks, 76ers | 0.37 / 0.38 | 27.3k / 21.6k |
| UCL PSG v Barcelona, Over 4.5 | 0.43 / 0.44 | 15.5k / 13.0k |
| NFL Packers ML (live, depth 5 only) | 0.71 / 0.72 | 473.6k / 970.1k |
| BTC weekly >82000 | 0.53 / 0.59 | 2.7k / 2.7k |
| BTC intraday >81200 | 0.98 / 0.99 | 4.5k / 2.0k |

  Politics and sports books are roughly an order of magnitude deeper than Gemini's (about $1k at the touch in a similar House-control market, per `gemini-predictions.md`) but spreads in politics and crypto ladders are 4-8 cents. Crypto ladders are thin (2-5k contracts).
- Trend: not measurable (single snapshot). Volume is strongly NFL-weekend-driven (L).

---

## 11. Event coverage and overlap (where arbitrage could exist)

Counts are distinct events / underlyings in the crawl (H).

- **Sports (876 events, 39k binary instruments incl. props):** NFL (SNF game alone 914 instruments), college football (6.8k instruments), NBA, NHL, MLB, ATP / WTA, soccer (EPL, Champions League, Europa, Conference, MLS, Liga MX, La Liga, Bundesliga, Serie A, Ligue 1, Brazil, Argentina, EFL), F1, NASCAR, CS2, boxing, sailing, chess. **Overlap with Kalshi / Polymarket / Gemini / Underdog UDX: high** (moneyline, spread, total, player props, futures such as NFL / MLB / NBA champion). Watch differences: soccer is 90 minutes only, ties pay $0.50, 48-hour cancel.
- **Politics (133 events, 376 instruments):** US Senate control 2026, individual Senate races (Texas, Georgia, Maine, Michigan, Ohio, Colorado), governors, House control, "Congress balance of power", 2028 President and nominees. **Overlap: high** with Kalshi and Polymarket (thin on OG: $72k/24h).
- **Economics (9 events):** Fed Oct / Dec 2026 and Jan 2027 decisions, ECB Oct / Dec, US recession by end 2026, jobs added, unemployment rate. **Overlap: Kalshi (Fed, jobs) and Gemini; very thin ($1.3k/24h).**
- **Crypto and macro price ladders (about 31 underlyings):** BTC and ETH (5-minute to weekly per og.com nav), SOL, XRP, ADA, DOGE, AVAX, LINK, DOT, LTC, XLM, BCH, CRO, HBAR, SHIB, ONDO, SEI, PEPE, BONK, FLOKI, EUR/USD, USD/JPY, GBP/USD, AUD/USD, S&P 500 (U500), Nasdaq 100 (U100), Russell 2000 (US2000), Dow (WS30), gold, silver, crude. **Overlap with Kalshi / Polymarket / Gemini crypto ladders.** Different settlement index (`CdnaFunded`) than Polymarket's Chainlink or Kalshi's CF Benchmarks: basis risk.
- **Culture (14 events) / Climate (1) / "Crypto" long-dated (5):** Dancing With The Stars, Oscars, Spotify top artist, next Bond; BTC end-2026 price, BTC ATH. Small overlap.
- **Combos:** 15.9k `EVENT_COMBO` parlay instruments (legs listed in `event_details.metaData.COMBO_LIST`); skip in a single-leg arbitrage scanner.

---

## 12. Liquidity sharing (is it an independent leg?)

- **Independent of Kalshi, Polymarket, Gemini, Underdog UDX: yes (H for separate exchange).** OG / CDNA is its own DCM and DCO with its own matching engine. The same professional market makers may quote on several exchanges (M); the rulebook gives market makers a position limit 100x retail on some classes (H).
- **Not independent of its own distributors (H unless noted):** "OG.com Markets allows trading directly or through intermediaries, including DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures" (https://og.com/regulatory); Robinhood "will send retail event contract volume through OG.com's CFTC-regulated derivatives exchange" (wf); FanDuel's new sports and entertainment contracts "come through OG Prediction Markets" (wf); Underdog Predict routes some flow to CDNA (other repo note, M); River Markets lists "Crypto.com (CDNA)" as an exchange (other repo note, H there). An adapter for DraftKings, Fanatics, FanDuel, Robinhood or Underdog's CDNA contracts would duplicate this one: treat them as the same book (`shared_with`).
- OG's help centre does not say whether partner orders rest in the same book as OG.com retail (NOT FOUND); the regulatory page and the Robinhood announcement indicate a single exchange venue (M).

---

## 13. Adapter priority: **P0** (read adapter)

Rationale: highest-liquidity regulated US event-contract exchange reachable without a key, with a documented keyless REST API, depth and trades, independent of the Kalshi / Polymarket legs, and heavy event overlap. Drawbacks: no PayBox trade path, preview docs, unverified market-data licence, thin non-sports categories.

Adapter hints:
- Poll `get-events`/`get-instruments` with `since` (ns) for universe changes; refresh `get-tickers` in batches of 100 for ranking; fetch `get-book` (depth 10-50) only for candidate pairs; read `get-instrument-lifecycle-states` per event to drop closed or settled instruments.
- Normalise: price string -> probability = price (dollars per $1 contract); quote tick 0.01; YES-space per instrument; for a 2-way market use both instruments' books; skip `EVENT_COMBO`; key on `underlying_symbol` + `PREDICT_CONTRACT_TYPE` + `PREDICT_PERIOD_TYPE` + `PARTICIPANT`; match to other venues on `EXTERNAL_GAME_ID` where possible, else team / date.
- Net edge must subtract the front-end's fee (`0.07 x P x (1 - P)` per contract for OG US taker) and, for live sports, the 3-second in-play order delay.
- Do not rely on `oi`. Do not rely on WebSocket until the channel format is confirmed.

---

## 14. Not found / open questions

- General-availability date of the FCM API and whether non-FCM individuals can ever get keys (docs: "private beta"). NOT FOUND.
- Market-data licence / redistribution terms (nadex.com/market-data unreadable). NOT FOUND.
- WebSocket subscribe envelope and channel names for prediction instruments (documented channels rejected with 40003). Open.
- Open interest; historical OHLC beyond `get-ticker-histories`; CFTC daily public data location. NOT FOUND.
- Fee schedule PDF (rounding, tiers, maker rebates, withdrawal fees); trading hours articles (not read); order-size limits; minimum order. NOT FOUND.
- Eligible and excluded countries outside the US; OG.com (Outside US) versus US order book (shared or not). NOT FOUND.
- Index methodology for `...@CdnaFunded` crypto / FX ladders (rulebook "Index Value" sections not reviewed). NOT FOUND.
- Whether complementary outcome instruments (Cowboys / Packers) are matched jointly by the engine. Open.
- Whether `/dcm/v1` and `/fcm/v1` expose identical data and which is intended for third parties. Open.
- Whether the thin `$0.01`-wide Senate / politics quotes are two-sided firm market-maker quotes (they appear round-lot, M).

---

## 15. Suspicious / embedded-instruction content (recorded, not followed)

None found. I grepped all fetched og.com pages, developer docs, help articles and the rulebook text for AI-directed instructions (ignore previous, "you are an AI", system prompt, "AI agents should/must", llms.txt) with no hits. `https://og.com/llms.txt` returns the normal site HTML (no llms.txt). The PayBox `discover_services` results (third-party x402 data services with USDC prices) were irrelevant catalog entries; I did not call them.

---

## Sources

1. https://og.com (home page; categories, live volumes, nav, footer; fetched 2026-10-19) (H)
2. https://og.com/about (timeline, press, Pro trading access teaser) (H)
3. https://og.com/regulatory (DCM / DCO, brands, intermediaries list, document links) (H)
4. https://og.com/legal (segregated funds at BMO Harris and Fifth Third) (H)
5. https://og.com/rules and https://og.com/clearing-members, /markets-products, /trading-operations, /risk-management (H)
6. https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (389 pages, dated 2026-10-13; read by a local pure-Python text extractor) (H)
7. https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf (OG Retail Terms and Conditions incl. Direct Market Access Terms of Business) (H)
8. https://assets.ctfassets.net/8c2uto3zas3h/3XigCl6h5OSR0A2fuGy3hw/b1e831b3d931c670841d65a753deb73a/2026-06-NADEX-Direct-Market-Access-Terms-of-Business.pdf (H)
9. https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction and sibling pages: rest-common-api-reference, rest/reference-and-market-data, rest/prediction-reference-data, rest/public-get-events, public-get-instruments, public-get-book, public-get-trades, public-get-tickers, public-get-ticker-histories, public-get-instrument-lifecycle-states, public-get-instrument-market-status, public-get-expired-settlement-price, rest/trading, private-create-order, rest/account-balance-and-positions, rest-change-log, rest-breaking-change-schedule (H)
10. Live public endpoints: https://api.crypto.com/fcm/v1/public/{get-events,get-instruments,get-tickers,get-book,get-trades,get-ticker-histories,get-instrument-lifecycle-states,get-instrument-market-status,get-expired-settlement-price}; https://api.crypto.com/dcm/v1/public/get-events; https://uat-api.3ona.co/fcm/v1/public/get-events (H, fixtures)
11. wss://stream.crypto.com/fcm/v1/market (connect and subscribe attempt, "Unrecognized channel") (H)
12. https://help.og.com/en/articles/12958828-fees-limits (H, raw text); /13051729-sports-settlement, /13051762-temporary-delay, /15261273-market-types, /13051655-order-types, /13051724-general-settlement (H, raw text)
13. https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions, /12752911-introducing-og-com-u-s, /15476413-introducing-og-com-outside-u-s, /13051647-market-availability, /14057582-market-liquidity; collections .../collections/{16473779-trading, 17111483-funding, 16221821-wallet, 19658400-wallet, 18171303-overview} (wf, H for what is stated)
14. https://og.com/company-news/{robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine, cryptostruct-to-offer-connectivity-to-cftc-regulated-prediction-markets-through-new-integration-with-ogcom-markets, cryptocom-launches-og-a-new-prediction-market-experience, fanduel-predicts-to-expand-event-contract-offering-through-partnership-with-cryptocom-and-og-prediction-markets} (wf)
15. https://nadex.com/pricing and https://www.nadex.com/rules/activities-to-avoid-on-nadex (wf; legacy Nadex content, scripted fetch returns 403)
16. https://www.theblock.co/data/decentralized-finance/prediction-markets (wf; Nadex weekly notional volume, metric undefined) (M)
17. Repo notes cross-referenced (not re-derived): `docs/research/venues/gemini-predictions.md`, `draftkings-predictions.md`, `underdog-predict-underdog-exchange-udx.md`, `docs/research/14-platform-of-platforms.md`, `docs/research/08-venues-polymarket-kalshi.md` (H for being in-repo; their external claims are M here)
18. PayBox `discover_plugins` / `discover_services` queries, 2026-10-19 (read-only) (H)

## Fixtures (`docs/research/fixtures/og-crypto-com-nadex/`)

All are raw public-API responses saved with only pretty-printing, except `instruments_nfl_moneyline_pair`, `instruments_crypto_ladder_bracket_perp_samples` and `instrument_event_combo_sample` (subsets cut from my full crawl and re-wrapped in the response envelope, with a `_note`) and `volume_summary_derived` (my own computation).

- `events_list_limit2_2026-10-19.json`, `events_nfl_futures_since0_limit2_2026-10-19.json`
- `instruments_binary_option_politics_since0_limit2_2026-10-19.json`, `instruments_nfl_moneyline_pair_2026-10-19.json`, `instruments_crypto_ladder_bracket_perp_samples_2026-10-19.json`, `instrument_event_combo_sample_2026-10-19.json`
- `tickers_nfl_moneyline_pair_2026-10-19.json`, `tickers_us_senate_control_2026-10-19.json`
- `book_nfl_moneyline_depth5_2026-10-19.json`, `book_us_senate_control_dem_depth10_2026-10-19.json`
- `trades_nfl_moneyline_count5_2026-10-19.json`, `ticker_histories_nfl_moneyline_count5_2026-10-19.json`
- `lifecycle_states_nfl_event_limit3_2026-10-19.json`, `market_status_nfl_event_limit3_2026-10-19.json`, `expired_settlement_price_head8_2026-10-19.json`
- `error_get_tickers_without_instrument_name_2026-10-19.json`
- `volume_summary_derived_2026-10-19.json` (counts, 24h `vv` by category, top events, depth survey, unit and lower-bound caveats)

Privacy check: scripts and fixtures were grepped for `@` and for the user's name before and after running; the only `@` hits are team names ("Away @ Home") and index names (`BTCUSD-INDEX@CdnaFunded`); no personal identifier appears in any request, header, URL or saved file.
