# OG (Crypto.com) Predictions - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (live probes about 03:30-03:45 UTC). READ-ONLY. Sources: OG.com and OG help-centre pages (WebFetch and raw HTML), the Crypto.com FCM API docs, the 2026-10-13 rulebook and the July 2026 market-data EULA (PDFs downloaded to a scratch dir and extracted as text), about 500 unauthenticated GETs to the documented public market-data host (1 to 3 per second, no throttling seen), two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment, WebSocket connection or browser automation. No PayBox money or signing tool was called. All third-party text was treated as untrusted data; no text aimed at AI agents was found. Scripted requests used exactly the User-Agent `insurance-markets-research/0.1`; my scripts were grepped for "@" and personal names before running (clean); fixtures were scanned for e-mail-like strings and home paths (clean). The shared WebSearch budget was exhausted before my first search, so there is no news-search coverage beyond fetching OG's own pages and one FOX Sports article.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summariser output, or my inference from first-hand data; **L** = weak, sponsored or stale (older than 6 months counts as possibly stale).

Duplicate-coverage warning for the orchestrator: this repo already holds several notes on the same exchange under other discovery names (`og-og-com.md`, `og-crypto-com-nadex.md`, `og-com-crypto-com-derivatives-north-america.md`, `og-com-markets-og-predictions-crypto-com.md`, `crypto-com-derivatives-north-america-cdna-and-og-og-com.md`, `crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md`, plus `crypto-com-predict-pro.md` for the Predict Pro front end). I read one of them (`crypto-com-derivatives-north-america-cdna-and-og-og-com.md`) as a lead and re-verified its key facts myself below. They describe one venue and should become one adapter.

---

## 0. Verdict

- **Still live (H):** yes. Order books and tickers on `api.crypto.com` were updating within seconds of each call (ticker timestamps about 03:40 UTC on 2026-10-19); `status.og.com` shows "All Systems Operational" with no incidents from Oct 5 to Oct 19, 2026; the OG fee article is dated 2026-09-15; the rulebook is dated 2026-10-13.
- **One exchange, many names (H).** "OG (Crypto.com) Predictions" = OG.com Markets = Crypto.com | Derivatives North America (CDNA) = Nadex: brands of one CFTC DCM+DCO, North American Derivatives Exchange, Inc. (NADEX). It is not a blockchain venue.
- **Independence for arbitrage:** independent of Kalshi and Polymarket (separate exchange, book, clearing). **Not independent of its own distributors**: Robinhood (since Sept 2026), DraftKings, FanDuel, Fanatics, Wedbush and partly Underdog route flow into the same exchange. Treat OG.com + CDNA + Crypto.com app/Predict Pro + the OG-routed part of those distributors as ONE leg.
- **Read side is excellent:** free, keyless, documented REST with full books, trades, tickers, 1-minute bid/ask history and lifecycle feeds. Open interest is not available (`oi` = "0" on all 39,681 binary-option tickers I pulled).
- **Trade side is gated and not on-chain:** orders need an approved FCM account (docs say "private beta"), HMAC-signed REST/WebSocket or FIX, USD collateral. A PayBox EVM/Solana wallet cannot place or sign orders.
- **adapter_priority = P1.** Strong keyless price leg for sports (very deep on marquee NFL games), thin politics/macro/crypto, gated execution, unclear commercial data licence on the API host.

Correction to the discovery hint: FOX Sports (Oct 7, 2026) says the exchange is "Crypto.com Derivatives North America" and the app is available in "All states except New York and Arizona, with sports contracts restricted in several states"; it does not mention Underdog at all. The Underdog link is real but partial: Underdog's own page says contracts come from "UDX, Kalshi, and Crypto.com | Derivatives North America" (H, below), and Underdog now runs its own exchange UDX (per sibling notes, M). The NY exclusion conflicts with OG's own help centre (section 8).

---

## 1. Is it still live? Entity map (2026)

| Fact | Evidence | Tag |
|---|---|---|
| NADEX "operates two brands for its CFTC-regulated business: OG.com Markets and Crypto.com | Derivatives North America (CDNA)"; registered as DCM and DCO; Foris DAX FCM LLC d/b/a OG Broker is a CFTC-registered FCM and affiliate | https://og.com/regulatory | H |
| Trading "directly or through intermediaries, including DraftKings Predictions, Fanatics Markets, FanDuel Predicts ... OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures". Underdog is NOT in that list. | https://og.com/regulatory | H |
| Rulebook dated October 13, 2026; same NADEX/OG-M/CDNA cover text | rulebook PDF (Sources 4) | H |
| 2026-09-08 press release: OG.com designated "infrastructure and clearing provider" for Robinhood Prediction Markets; Robinhood "will route retail event contract volume through OG.com's underlying CFTC regulated derivatives exchange and clearinghouse architecture"; "largest B2B prediction markets partnership in terms of transaction volumes"; Citadel Securities investment in Crypto.com at $20B incl. "a standalone $5 billion valuation of OG.com through its strategic spin-off"; "OG.com operates as an independent company"; phased rollout to eligible US customers "starting on September 8, 2026" | https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (raw HTML, dated "8 September 2026") | H |
| OG about page: Kris Marszalek is "Founder & CEO of OG.com" and "Co-founder & CEO of Crypto.com"; "Robinhood, DraftKings, FanDuel, and many others route through OG's licensed core exchange" (Underdog and Fanatics only as logos); "Trade predictions over REST, WebSocket and FIX"; "Coming soon to Crypto.com Exchange UI" | https://og.com/about | H |
| OG's own site wording of Crypto.com ties: "Crypto.com launches OG.com, built on over two decades of regulated infrastructure"; Crypto.com acquired Nadex in 2022 | https://og.com/about | H |
| Underdog Predict: "Event contracts are offered by one or more designated contract markets (DCMs) including UDX, Kalshi, and Crypto.com | Derivatives North America" | https://www.underdogsports.com/predict/ | H |
| Non-US retail entity: Foris Capital MU Limited (Mauritius FSC licence GB22200345) | og.com footer text in the Robinhood release page; https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s (not re-read by me) | H (footer) |
| Launch of the OG consumer app (Feb 2026, "powered and offered by" CDNA) | Crypto.com press release, read by a sibling note only | M, 8+ months old, possibly stale |

Verdict: **still_live = true.** Counterparty note: OG's own text describes both "spin-off ... independent company" (Sept 2026) and "Founder & CEO of OG.com" who is also Crypto.com's CEO, so corporate separation is partial; irrelevant to price data but relevant to who the counterparty/clearing entity is (NADEX, same legal entity for exchange and clearing).

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated centralised exchange (DCM+DCO), USD cash-settled event contracts, retail front ends plus FCM/IB intermediaries. Rulebook: "The Type of Contract is an Event Contract, which is a Swap". No blockchain component.
- **Book (H):** central limit order book. Fixture `get-instruments_*`: `price_tick_size` "0.01", `quantity_decimals` 0, `contract_size` "1" ($1 payout; rulebook "Centi" templates are $1 with 2,500,000 position limit). Order types LIMIT / MARKET / STOP / STOP_LIMIT; time-in-force GOOD_TILL_CANCEL / IMMEDIATE_OR_CANCEL / FILL_OR_KILL / GOOD_TILL_DATE (https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/trading, WebFetch of the page, H).
- **Outcome tokenisation (H, fixtures):** none. Each outcome is its own instrument (`inst_type` `BINARY_OPTION`). Example: a two-way NFL moneyline is two instruments `NX.F.OPT.NFL-00001-261019-M.O.1.1.20270301` (Commanders, 0.21/0.22) and `...O.1.2...` (49ers, 0.78/0.79). Multi-outcome events (Fed decision: 5 instruments; Senate control: 2) are sets of single-outcome binaries sharing `underlying_symbol`. There is no separate "No" instrument; to bet against, trade the complementary outcome. Categorical = set of binaries; no scalar markets seen (brackets exist, see below).
- **Instrument mix in the full listing (H, my crawl 2026-10-19):** 56,747 instruments: 39,682 `BINARY_OPTION`, 16,995 `EVENT_COMBO` (parlays), 64 `BRACKET_OPTION`, 6 `PERPETUAL_SWAP`. The scanner should ignore all but `BINARY_OPTION`.
- **Identifiers (H):** event `NFL-00001-261019-M`, `ELECT-USSNTPRTY26`, `EC-00032-26`; instrument `NX.F.OPT.{event_symbol}.O.{period}.{strike_index}[.{YYYYMMDD}]`. Short-dated crypto/FX ladders use `NX.F.OPT.BTC.I.50.7.20261019` (period code `I` intraday, `W` weekly) with no `PREDICT_*` metadata; they carry `attributes.STRIKE_PRICE`, `STRIKE_OPERATOR` (">"), `CLOSE_TIME`, and `underlying_symbol` like `BTCUSD-INDEX@CdnaFunded` (an exchange symbol, not an e-mail).
- **Matching metadata (H):** on event/instrument rows `event_details.metaData`: `LEAGUE`, `EVENT_DATE` (ISO), `HOME_PARTICIPANT`, `AWAY_PARTICIPANT`, `PARTICIPANT`, `PREDICT_CATEGORY` (Sports, Politics, Culture, Economics, Crypto, Climate), `PREDICT_CONTRACT_TYPE`, `PREDICT_PERIOD_TYPE`, `PREDICT_OUTCOME_TYPE`; `attributes.STRIKE_PRICE`, `STRIKE_OPERATOR`, `OPEN_TIME`, `CLOSE_TIME` (see fixtures). The Commanders @ 49ers event alone has 873 instruments (moneyline, spreads, totals, player props).
- **Time-field trap (H):** `expiry_timestamp_ms` on sports/politics instruments is a placeholder (NFL game of 2026-10-19 shows expiry `...20270301`). Use `metaData.EVENT_DATE` (ISO) or `attributes.CLOSE_TIME` for timing. Event timestamps are nanoseconds, instrument `expiry_timestamp_ms` is milliseconds.

---

## 3. Chains and collateral

- **No chain, no token (H).** Collateral is USD held at the exchange/FCM in an "OG USD Wallet". OG help centre Wallet collection (11 articles) lists: Plaid-linked bank, ACH, wire, PayPal, debit card/Apple Pay/Google Pay (US outside NY), Venmo deposits; USD withdrawals via ACH and RTP (https://help.og.com/en/collections/16221821-wallet, titles only).
- **Crypto is a deposit-only on-ramp (H, https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions):** link an external account "(such as Coinbase, MetaMask, or Phantom)" via Mesh; Mesh converts ETH/BTC etc. to USDC; "Once the deposit reaches us, we instantly convert the USDC to cash (USD)"; no OG fee, standard network fees apply; "a few seconds to under 20 minutes"; "currently available for our US customers" and "New York customers are excluded"; KYC/onboarding first. Supported chains and tokens: NOT FOUND (searched: that article, Wallet collection titles). Crypto withdrawals: NOT FOUND (no title in the Wallet collection mentions one; withdrawals listed are USD only).
- No ERC-20/SPL position tokens, no on-chain settlement. Positions are exchange account balances.

---

## 4. Read API

- **Exists: official, public, keyless for market data (H).** Docs: "Crypto.com GEN4 FCM US B2C API Documentation (Preview)", https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction , linked as "APIs" from og.com. The page says "This is under private beta", "Public market-data endpoints can be explored before onboarding", "To access retail account and trading APIs, you must have an approved FCM account" and "All API endpoints use POST requests". Same page has no terms/licence text.
- **Base URLs (H, https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-common-api-reference):** REST prod `https://api.crypto.com/fcm/v1/{method}` (e.g. `/public/get-tickers`); WebSocket market `wss://stream.crypto.com/fcm/v1/market`, user `wss://stream.crypto.com/fcm/v1/user`. Also answers (H, my GET): `https://api.crypto.com/dcm/v1/public/get-events` returns the same envelope but a different first row/last_updated_time than `fcm/v1`, so do not assume it is an identical view; use the documented `fcm/v1`.
- **Doc/behaviour mismatch (H):** docs say POST for everything; every public method I called works as GET with query parameters (HTTP 200, `application/json`, behind Cloudflare, no geo-block from a non-US egress IP).
- **Envelope (H):** `{id, method, code, result}`; `code` 0 = success; error example in fixture: HTTP 400 `{"code":40004,"message":"instrument_name or instrument_names is required"}`. All numbers are strings.
- **Public endpoints I called (all GET, 2026-10-19, H):**

| Endpoint | Confirmed behaviour |
|---|---|
| `/public/get-events` | `limit`, `since` (0 = from start, oldest first), `cursor`/`next_cursor`, filters `PREDICT_CATEGORY` (Economics returned 19 events, Crypto 5), `LEAGUE` (NFL returned 100+, paged). Rows: `symbol`, `name`, `event_date` (ns), `series_symbols`, `event_details.metaData`. Without `since`, ordering is newest-updated first and (for Politics) metaData was populated. Some rows (e.g. `COMBOS`, old FIFA events) have empty metaData. |
| `/public/get-instruments` | `limit` (1000 worked; 57 pages for the whole listing), `event_symbols` (comma list), `symbols`, `cursor`. Rows carry `symbol`, `inst_type`, `display_name`, `tradable`, tick sizes, `underlying_symbol`, `expiry_timestamp_ms`, `event_details`. Instrument identifier field is `symbol` (tickers use `i`). |
| `/public/get-tickers` | `instrument_name` **required**, comma list up to 100 (my crawl used 100 per call); missing -> HTTP 400 40004. Fields `i,h,l,a,c,b,k,v,vv,oi,t`: best bid `b`, best ask `k` (null when that side is empty), 24h contracts `v` (`vv` equals `v` in all rows I checked), `oi`, ms timestamp `t`. |
| `/public/get-book` | `instrument_name`, `depth` (5 tested). `result.data[0].bids/asks` as `[price, qty]` string pairs plus `t` (ms). |
| `/public/get-trades` | `instrument_name`, `count` (3 tested). Fields `d,t,tn,q,p,s,i,m`; `s` is lowercase `buy`/`sell`. |
| `/public/get-ticker-histories` | `instrument_names`; returned 1,000 rows of 1-minute `{i,t,b,k,a}` (bid, ask, average) spanning about 16.7 hours for the Senate-control leg. Useful for lead-lag studies. |
| `/public/get-instrument-lifecycle-states`, `/public/get-instrument-market-status` | cursor-paged feeds filterable by `event_symbol`; lifecycle rows show `state` (e.g. Deleted), `lifecycle_change_reason` (SCHEDULED_DELETE), `security_trading_status` (SETTLED); market-status rows show OPEN/CLOSED and reason. |

- **Not usable (H):** `oi` is "0" on every one of the 39,681 binary-option tickers (no OI endpoint). `get-expired-settlement-price` is documented but I did not test it; a sibling note reports it ignores filters and returns old FX rows (M). The documented settlement endpoint therefore may not give event-contract resolution values; I did not confirm.
- **Rate limits (H, common reference):** public REST 100 requests/second per method per IP; WebSocket market data 100/s. Private: create/cancel 15 per 100 ms per key; `private/get-trades` and `get-order-history` 1/s; other private methods 3 per 100 ms. HTTP 429 code 42901.
- **WebSocket (M/L, not connected):** market channels exist for order book, ticker and trades (docs navigation lists `book~{instrument_name}`, `ticker~{instrument_name}`, `trade~{instrument_name}`; a sibling note recorded `book.{instrument_name}.{depth}`). I could not read the channel pages, so the exact name format, depth values and auth requirement are NOT FOUND (searched: introduction page, market-data page nav). Plan on REST polling at 100 per second until confirmed.
- **Second feed, avoid for the aggregator (H):** `data-api.crypto.com` / `data.crypto.com` is governed by a market-data EULA that bars bots, commercial use and AI processing (section 8). I did not call it.
- **Fixtures** (section 11) hold raw responses for events, instruments, tickers, books, trades, ticker histories, lifecycle, market status and the 400 error.

---

## 5. Trade path and PayBox reachability

- **Programmatic trading exists but is gated (H docs):** private `create-order`, `amend-order`, `cancel-order`, `cancel-all-orders`, `close-position`, `get-open-orders`, `get-order-detail`, `get-order-history`, `get-trades`, `get-transactions` (trading docs page). Auth: API key + secret, **HMAC-SHA256** (hex `sig`) over `method + id + api_key + sorted(param key+value concatenated) + nonce`, nonce = unix ms within 60 s (error 40102); WebSocket `public/auth` once per session (common reference, H). Docs call this "private beta" and require an approved FCM account and API credentials.
- **Intermediated model (H, rulebook text):** "A Customers of Intermediating Members may not submit orders directly to the Exchange and all such orders must be submitted by that Customer's Intermediating Member"; intermediating members submit "by electronic transmission over a FIX Connection by Internet (SSL only)". Direct members sending messages "whether manually or via automated functionality, must ensure adequate controls are in place to prevent excessive messaging". OG's about page advertises "REST, WebSocket and FIX".
- **PayBox reachability: NO for trading (H by absence).** No on-chain order, no EIP-712 or Solana-signed order, no transaction proposal, no contract. A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet cannot place, sign or cancel orders. At most it can be the human owner's own source of crypto for the Mesh crypto-to-cash deposit into the owner's own KYC'd US account (funding, not trading, and not an agent action). `discover_plugins("OG.com Crypto.com prediction markets")` returned an empty list; `discover_services` page 1 returned only third-party Hyperliquid/Polymarket odds resellers (no OG route; pages beyond the first not read).
- **Practical execution path:** a human opens an OG / OG Broker account and completes FCM API onboarding, the bot keeps the HMAC key in a secret store behind a relay; or route through a distributor that permits API trading (not researched).
- **In-play delay (H, https://help.og.com/en/articles/13051762-temporary-delay):** "any order placed after an Industry Event has started" is delayed; "The default delay is 3 seconds". The article does not say whether cancels are delayed. This blunts live-sports latency arbitrage.

---

## 6. Fees

From https://help.og.com/en/articles/12958828-fees-limits (article date September 15, 2026, H). C = contracts, P = price in dollars.

| | US customers (incl. New York), most markets (sports, politics etc.) | US customers, Crypto / FX / Commodities / Equity indices | Outside the US, all markets |
|---|---|---|---|
| Open, taker | `0.07 x C x P x (1 - P)` | `$0.02` per contract | `$0.02` per contract |
| Open, maker | `0.0175 x C x P x (1 - P)` | `$0.02` per contract | `$0.02` per contract |
| Close before expiry | same formula as opening | `$0.02` per contract | `$0.02` per contract |
| Settles in the money | Waived | Waived | Waived |
| Settles out of the money | No fees | No fees | No fees |

- Orders that fill immediately, including all market orders, pay taker; resting orders that fill later pay maker. Position limit 2,500,000 contracts per event for $1 contracts.
- The summariser noted the page's column layout is ambiguous; I read the formulas as the "most markets" column and the flat `$0.02` as the Crypto/FX/Commodities/Indices column, consistent with the sibling reading (M on the column mapping).
- Worked examples (my arithmetic): taker at P = 0.22 is 1.20 cents/contract; maker 0.30 cents; at P = 0.50 taker is 1.75 cents (3.5% of price); at P = 0.68 taker is 1.52 cents. For a hold-to-expiry arb leg the cost is the entry fee only if the ITM/OTM rows are settlement-time fees (they read that way); for a leg you may close early add the exit fee. Confirm with a live fill (M).
- **NOT FOUND** (searched: fees article, help centre titles, API docs): rounding rules, volume tiers, market-maker rebates, exchange-level fee schedule for direct/FCM participants. Distributors charge their own fees.

---

## 7. Resolution mechanism and dispute risk

- **Resolver (H, https://help.og.com/en/articles/13051724-general-settlement):** settlement is "based on the result issued by the relevant news or market data provider once the event concludes"; later "disqualifications, revisions, or amendments" by that provider "do not affect settlement". "The CDNA Exchange reserves the right to adjust any settlement if it was made in error due to human or technical issues" (balances debited or credited); with no official verifiable outcome it settles "at the CDNA Exchange's reasonable discretion". The page has no dispute or appeal language. Member-to-member disputes go to binding arbitration in Cook County, Illinois under National Futures Association member arbitration rules (rulebook section "Arbitration of Member-Member Disputes", H); the rulebook also has sections for Exchange-Member and Clearing Member-Customer disputes that I did not read, so the retail appeal route is NOT FOUND.
- **Cancelled events are not binary (H, same article):** "postponed, canceled, or otherwise not completed within 48 hours of its originally scheduled start time" is a Canceled Event. Winning-side holders receive the VWAP "calculated over the one-week period immediately preceding the determination", the other side gets $1 minus that, and opening trade fees are refunded. A draw with no tie outcome listed pays $0.50 to each side with no fee refund. Material rule changes after listing can also trigger cancellation. This is basis risk for any cross-venue pair.
- **Politics (H, rulebook "Election Outcome Event Contract"):** Source Agencies are a named list (New York Times, Associated Press, Bloomberg, Reuters, Axios, Politico, Washington Post, Wall Street Journal, ABC, CBS, CNN, Fox, MSNBC, NBC) "as determined by the Exchange"; expiration time 10:00 AM ET; settlement no later than the day after expiration; if the source does not announce, settlement is delayed until it does.
- **Crypto ladders (H, rulebook):** underlying is the bid/ask midpoint as reported by Lukka, Inc.; "The Source Agency is the Exchange" (CRO template shown; the same Lukka wording recurs for other coins). Expect print-timing differences versus Kalshi/Polymarket crypto ladders.
- **Counterparty:** exchange and clearinghouse are the same legal entity (NADEX); no external oracle, no on-chain dispute window. Sports-specific rules (overtime included, soccer 90 minutes plus stoppage, tennis retirement) are in https://help.og.com/en/articles/13051729-sports-settlement (read by a sibling; not re-read by me, M).

---

## 8. Geo, ToS and automation

- **Availability:** "available across the U.S." but "certain event contracts offered through OG.com may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s, H). Outside the US via Foris Capital MU Limited, "only available in select jurisdictions" (https://help.og.com/en/articles/13428988-why-can-t-i-access-og-com, H). FOX Sports (Oct 7, 2026) says all states except New York and Arizona, sports not offered in Illinois, Massachusetts, Maryland, Michigan, New Jersey, Nevada or Ohio, 18+ (L/M: editorial article, calls the app "OG Predictive"). **Conflict:** OG's own help centre has a "Funding (U.S. New York)" collection and its fee article says "US customers (including New York)", so New York appears to be served in some form; the Mesh deposit route excludes New York. Treat the NY/AZ claim as unverified.
- **KYC:** required (H, Mesh FAQ: "standard onboarding, KYC"). Account-sharing/third-party management rules: NOT FOUND in the pages I read (searched: help centre titles, rulebook automation text). An agent trading its owner's own account under that owner's API key is a compliance question for the owner.
- **Automation (H, short quotes):** rulebook: members sending messages "whether manually or via automated functionality, must ensure adequate controls are in place to prevent excessive messaging or other activity that may be deemed detrimental or disruptive to the Exchange". Rulebook prohibits wash trading and "abusive or disruptive" practices (read by a sibling; M). Cross-venue arbitrage itself is not prohibited by anything I read.
- **Data licence (H, important for an aggregator):** the Market Data End User License Agreement (Foris DAX, Inc., "an approved market data agent for the North American Derivatives Exchange Inc.", Last Modified July 2026, https://data.crypto.com/static/eula.pdf?v=eula_v3) governs "market-related data we make available to you through our website located at https://dstg-data.3ona.co/". It grants access "solely for your internal business operations in the United States" and forbids redistribution, use "for any commercial purpose", use of the data "as or in prompts for or inputs to any AI Technology", and access "through any automated means, including bots, scrapers, or similar technologies, except as expressly" authorised. I found **no licence or terms attached to `api.crypto.com/fcm/v1/public`** (NOT FOUND; searched: API introduction, common reference, trading and prediction-reference pages, EULA scope). Because the EULA names the exchange as the data owner, a commercial scanner or any redistribution should get written clearance first.

---

## 9. Liquidity (all dated)

Source for the table: my own full crawl of `get-instruments` (57 pages) and `get-tickers` (397 batches), tickers timestamped about 03:40 UTC on 2026-10-19; summary in fixture `derived_full-crawl-summary_2026-10-19.json`. Volume is the ticker `v` field summed (contracts; $1 face each, so face notional, not premium). The 24h window includes the full Sunday NFL slate, so it is a peak-day figure (H for the arithmetic, M as a typical-day estimate).

| Metric | Value | Tag |
|---|---|---|
| All binary options, 24h face contracts | 7,791,283 across 39,681 instruments (a sibling run measured about 6.25M at ~02:10 UTC the same day, consistent) | H |
| Sports | 7,599,910 contracts (1,876 instruments traded, 16,869 with a two-sided quote); NFL alone 7,021,859; then CFB 252,710, NBA 130,961, MLB 81,271, WTA 64,885 | H |
| Politics | 92,305 contracts (167 traded of 376) | H |
| Short-dated crypto ladders | 89,317 contracts (71 traded of 634); FX/index/commodity ladders 90 contracts | H |
| Culture / Economics / Climate / long-dated Crypto | 7,181 / 1,253 / 797 / 430 contracts | H |
| Open interest / TVL | NOT FOUND: `oi` = "0" on all 39,681 tickers | H absence |
| Monday Night Football moneyline (Commanders @ 49ers) 49ers leg | bid 0.78 x 160,679, 0.77 x 224,318; ask 0.79 x 834,027, 0.80 x 600,000, 0.81 x 606,001 | H, 03:3x UTC |
| US Senate control 2026, Democratic leg | bid 0.63 x 100, 0.62 x 11,555, 0.61 x 7,915; ask 0.68 x 23, 0.69 x 8,047, 0.70 x 3,056; 24h 9,852 contracts; 5 cent touch spread | H |
| Fed decision Oct 2026, "unchanged" leg | bid 0.86 x 5,000, 0.85 x 6,000; ask 0.89 x 9,963; 93 contracts in 24h; ladder legs partly one-sided | H |
| BTC 4-hour ladder (>82,400) | bid 0.59 x 200, 0.58 x 4,100; ask 0.64 x 2,100; 6,014 contracts in 24h; 5 cent spread | H |

Reading: real, deep sports liquidity on marquee games (market-maker quotes of hundreds of thousands of contracts per level), thin politics (few thousand to tens of thousands of dollars of depth, 4-5 cent spreads), near-empty macro and long-dated crypto. Outside peak NFL days the venue is far smaller (excluding NFL the 24h total above is about 0.77M contracts). No trend data. Third-party volume hubs I tried do not list this venue.

---

## 10. Event overlap and shared liquidity

- **Overlap with other venues (H on OG's side):**
  - Sports: NFL (moneyline, spread, totals, player props per game), college football, NBA, MLB, NHL, tennis, soccer leagues (EPL, UCL, MLS and others). Overlaps Kalshi, Polymarket US, UDX and sportsbooks-as-signal. Largest and deepest category.
  - Politics: US Senate/House control 2026, individual Senate races (e.g. Texas), governors, 2028 presidential winner and nominees, Senate seat counts. Overlaps Kalshi and Polymarket.
  - Macro: Fed decisions (Oct/Dec 2026, Jan 2027), ECB rates, jobs, unemployment, inflation, US recession 2026 (44 binary options, very thin). Overlaps Kalshi. Expired events (e.g. "Fed Decision in Sep 2026") remain in the events list; check lifecycle before treating as live.
  - Crypto price: short-dated ladders for BTC, ETH, XRP, SOL, ADA, DOGE and others (5-minute to weekly per OG nav) plus long-dated BTC/ETH items. Overlaps Kalshi and Polymarket crypto ladders; thin at the strikes far from spot.
  - Culture: Spotify, Emmys, Oscars, TIME Person of the Year. Small.
- **Shared liquidity (H for structure, M for book identity):** the exchange is a single venue that trades "directly or through intermediaries" (DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, Wedbush Futures; og.com/regulatory), and intermediating members submit customer orders to the exchange (rulebook). OG's pages do not say whether distributor orders rest in the same book as OG.com retail (NOT FOUND), but the structure indicates one exchange order book. Some distributors are multi-venue, so only the OG-routed part is shared. Underdog Predict also routes some contracts to CDNA but runs its own UDX; those UDX markets are a separate exchange.
- **Scanner rule:** one `shared_with` group "NADEX/CDNA/OG": OG.com, Crypto.com app and Predict Pro, and OG-routed contracts inside DraftKings, FanDuel, Fanatics, Wedbush, Robinhood and Underdog. Never count two members of this group as independent arbitrage legs. OG vs Kalshi, OG vs Polymarket (global or US), OG vs UDX are independent pairs (price independence is weaker if the same market makers quote everywhere, M).

---

## 11. Adapter notes and fixtures

1. **Discover:** page `get-events?since=0&limit=100&cursor=...` (optionally `PREDICT_CATEGORY` / `LEAGUE` filters) for metadata, then `get-instruments?event_symbols=<symbol>&limit=1000`; keep `inst_type == BINARY_OPTION`; ignore combos, brackets, perps. A full instrument listing is about 57 pages / 100 MB; prefer per-event pulls.
2. **Price:** `get-tickers` in batches of 100 instrument names (bid `b`, ask `k`, 24h `v`); `get-book` (depth 5-10) only for candidate pairs; null `b` or `k` means that side is empty. Prices are dollar probabilities. Use ticker `t` (ms) for staleness; many long-dated legs have stale or empty quotes.
3. **State:** poll the lifecycle and market-status feeds with `since` for halts and closes. Treat empty ticker data or a `get-book` error as settled or delisted. Do not rely on `tradable` alone.
4. **Match keys:** sports by `LEAGUE` + `EVENT_DATE` + `HOME_PARTICIPANT`/`AWAY_PARTICIPANT` + `PREDICT_CONTRACT_TYPE` + `PREDICT_PERIOD_TYPE` + `PARTICIPANT`; politics/macro by event `symbol` + `PARTICIPANT` + display name; crypto ladders by parsed `STRIKE_PRICE`, `STRIKE_OPERATOR` and `CLOSE_TIME`.
5. **Cost model:** subtract section 6 fees (taker up to 1.75 cents per contract at P = 0.50); add distributor fees if executing through one; add the 3-second in-play delay for live games.
6. **Rules diff before pairing:** soccer 90-minute basis, overtime inclusion, cancellation pays one-week VWAP, $0.50 draws, Lukka-sourced crypto midpoint, media-outlet list for elections, exchange discretion to adjust settlements.
7. **Do not use:** `expiry_timestamp_ms` as event time, `oi`, `tradable` as lifecycle, or `data-api.crypto.com`.

Fixtures saved in `docs/research/fixtures/og-crypto-com-predictions/` (all raw unauthenticated responses from 2026-10-19 unless marked; total about 96 KB, each file under 10 KB; scanned, no personal data):
`get-events_limit3_since0_2026-10-19.json`, `get-events_predict-category-economics_2026-10-19.json`, `get-events_predict-category-politics_no-since_limit2_2026-10-19.json`, `get-instruments_fed-oct-2026_2026-10-19.json`, `get-tickers_fed-oct-2026_2026-10-19.json`, `get-book_fed-oct-2026-unchanged_depth5_2026-10-19.json`, `get-trades_fed-oct-2026-unchanged_count3_2026-10-19.json`, `get-instruments_nfl-mnf-moneyline_2026-10-19.json` (filtered by me to the two full-game moneyline rows out of 873), `get-tickers_nfl-mnf-moneyline_2026-10-19.json`, `get-book_nfl-mnf-49ers_depth5_2026-10-19.json`, `get-instruments_btc-4h-ladder_2026-10-19.json`, `get-tickers_btc-4h-ladder_2026-10-19.json`, `get-book_btc-4h-ladder_depth5_2026-10-19.json`, `get-tickers_senate-control-dem_2026-10-19.json`, `get-book_senate-control-dem_depth5_2026-10-19.json`, `get-ticker-histories_senate-control-dem_first5rows_2026-10-19.json` (truncated by me to 5 of 1,000 rows), `get-instrument-lifecycle-states_settled-nfl-event_limit3_2026-10-19.json`, `get-instrument-market-status_settled-nfl-event_limit3_2026-10-19.json`, `error_get-tickers_no-filter_2026-10-19.json`, `derived_full-crawl-summary_2026-10-19.json` (computed by me from the full crawl).

---

## 12. NOT FOUND and open questions

- Any licence or terms attached to `api.crypto.com/fcm/v1/public` (searched: API introduction, common reference, trading and prediction-reference pages; the EULA found governs a different website).
- Open interest and any OG-published aggregate volume/OI statistic (searched: tickers, og.com about; the company-news page text was truncated when fetched, so no dated volume claim could be read).
- Final settlement value for event contracts via API (I did not test `get-expired-settlement-price`; lifecycle `SETTLED` status exists but not the value).
- WebSocket market channel names, payload and auth (searched: documentation navigation only; page bodies not retrievable).
- Whether distributor orders rest in the same book as OG.com retail orders.
- Mesh-supported chains/tokens; any crypto withdrawal route.
- Exact fee timing (entry vs settlement) and an exchange-level fee schedule.
- Which US states actually block OG.com or its sports contracts (OG pages do not list them; FOX Sports list is L).
- FCM API onboarding steps and timelines ("private beta"); FIX specification (not public).
- Date-stamped news after 2026-09-15 (WebSearch budget exhausted): outages, volume trends, Robinhood rollout progress.

Suspicious content: none found. No page or API response contained text addressed to AI agents. The EULA's ban on feeding data to "AI Technology" is a licence term, not an instruction to this agent; I did not call the feed it governs.

---

## Sources

1. https://og.com/regulatory ; https://og.com/about ; https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (raw HTML, dated 2026-09-08) ; https://status.og.com/ (all fetched 2026-10-19) (H)
2. API docs, read via WebFetch (H for what the pages state): https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction ; https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-common-api-reference ; https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/trading ; https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/prediction-reference-data ; https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/websocket-introduction (introduction only)
3. Live endpoints, unauthenticated GET, 2026-10-19 (H, fixtures): https://api.crypto.com/fcm/v1/public/{get-events, get-instruments, get-tickers, get-book, get-trades, get-ticker-histories, get-instrument-lifecycle-states, get-instrument-market-status} ; https://api.crypto.com/dcm/v1/public/get-events
4. Rulebook, dated 2026-10-13 (H, text extracted from PDF): https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf
5. Market Data EULA, July 2026 (H, text extracted from PDF): https://data.crypto.com/static/eula.pdf?v=eula_v3
6. OG help centre (H): https://help.og.com/en/articles/12958828-fees-limits (2026-09-15) ; .../13051724-general-settlement ; .../13051762-temporary-delay ; .../12752911-introducing-og-com-u-s ; .../13428988-why-can-t-i-access-og-com ; .../15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions ; collection titles at https://help.og.com/en/collections/16221821-wallet , .../17111483-funding , .../16473775-onboarding
7. https://www.underdogsports.com/predict/ (WebFetch, H for the quoted sentence)
8. https://www.foxsports.com/stories/betting/websites-like-kalshi (WebFetch, published Oct. 7, 2026; L/M, editorial listicle)
9. PayBox read-only `discover_plugins` and `discover_services` (no OG route)
10. Leads only, not primary: sibling note `docs/research/venues/crypto-com-derivatives-north-america-cdna-and-og-og-com.md` (Feb 2026 launch release, sports settlement rules, prohibited-practices text, UDX/Underdog context from `underdog-predict-underdog-exchange-udx.md`)
