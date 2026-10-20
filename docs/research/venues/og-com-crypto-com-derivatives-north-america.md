# OG.com / Crypto.com | Derivatives North America (NADEX Inc.) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19, 02:39-02:50 UTC. READ-ONLY: official site, docs, help centre, rulebook and terms PDFs (downloaded to the scratchpad and text-extracted with a local pure-Python script; nothing executed), keyless public GETs to documented market-data hosts, one unauthenticated WebSocket connect-and-subscribe test, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text treated as untrusted data. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. WebSearch had no budget left, so there is no search-engine corroboration; everything below comes from pages I fetched.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary source, inference, or carried from an in-repo sibling note that I did not re-fetch; **L** = weak or stale. "(wf)" = read through the WebFetch summariser, not raw text.

**Same entity as four in-repo notes.** `crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md`, `og-crypto-com-nadex.md`, `og-com-markets-og-predictions-crypto-com.md` and `og-og-com.md` describe the same legal exchange (North American Derivatives Exchange, Inc.). The registry should hold ONE entry with aliases OG.com, OG.com Markets, OG-M, CDNA, Crypto.com | Derivatives North America, Nadex, HedgeStreet. This note re-verifies the facts independently and takes its own position on priority (P1, not P0; see Verdict).

---

## Verdict

- **still_live = true (H).** Public API answers with ticks seconds old, a live Sunday-night NFL game with a running volume on og.com, a rulebook dated 2026-10-13 (section 1).
- **adapter_priority = P1: a read-only reference-price adapter, not an execution leg.** Independent CFTC-registered DCM + DCO with its own price-time central limit order book, keyless public REST with depth to 50 levels, trades, lifecycle and settlement values, and genuinely deep NFL books. Held back from P0 by four things: (1) nothing is tradable from a PayBox wallet (USD, KYC'd FCM account, HMAC key, private beta); (2) no licence text was found for the exchange's own public endpoints and the sibling data feed is "personal, non-commercial"; (3) the documented WebSocket rejects every channel; (4) outside sports the books are thin (about $105k face per 24h across all other categories). Upgrade to P0 if CDNA confirms in writing that polling `api.crypto.com/.../public/*` for an aggregator is allowed.
- **Count this book once.** Robinhood, DraftKings, Fanatics, FanDuel (CDNA portion), the Crypto.com app and others route into it (section 12).
- Confidence: medium (single-snapshot liquidity; licence and WebSocket unresolved).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Public API | `GET https://api.crypto.com/dcm/v1/public/get-tickers` returned `t`=1792377565613 ms (2026-10-19T02:39Z) for a 2026-10-25 NFL game; `get-events` answers with 2026 events (fixtures) | H |
| og.com home (fetched 02:40Z) | "DAL Cowboys @ GB Packers LIVE", GB 20, "$9,883,337 vol."; "Party To Win US Senate in 2026 ... $479,740 vol."; "Texas Senate Election Winner 2026 ... $510,590 vol." | H |
| Rulebook | "Markets RULES Dated: October 13, 2026 ... North American Derivatives Exchange, Inc. ('NADEX') operates two brands for its CFTC-regulated business OG.com Markets ('OG-M') and Crypto.com \| Derivatives North America ('CDNA')" (https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf) | H |
| Registrations | "Designated Contract Market (DCM)" and "Derivatives Clearing Organization (DCO)": the Exchange; FCM: Foris DAX FCM LLC (d/b/a OG Broker); outside the US: Foris Capital MU Limited, Mauritius FSC (https://og.com/regulatory, wf) | H |
| Hint check (The Block, 2026-09-08 22:18 EDT) | "Robinhood will take ownership stakes in both companies and send a portion of its event contracts to OG.com" (https://www.theblock.co/news/business/2026-09-08-stonex-sees-upside-robinhood-413955, wf) | H |
| Official announcement | og.com: Robinhood "designating OG.com as an infrastructure and clearing provider"; "multi-year"; Robinhood to hold equity in Crypto.com and in OG.com "after its spin-off"; the page gives OG.com a $5B standalone valuation; no go-live date, no entity named, silent on whether Robinhood orders rest in the same book (https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine, wf; URL found in og.com page source) | H |

Implication: OG.com is being spun out of Crypto.com. The exchange legal entity is unchanged today, but the "Crypto.com | Derivatives North America" brand may be renamed or re-papered; treat `OG.com` as the primary alias and re-check the docs hosts after the spin-off (M, inference).

---

## 2. Kind and market model

- **Regulated exchange, central limit order book.** "the Market's trading algorithms execute all trades by matching orders according first by price and then time priority" (rulebook, H). Fully collateralised event contracts; the rulebook classifies an Event Contract as "a Swap" (H). Not an AMM, not parimutuel.
- **Binary only for the categories that matter.** `inst_type` `BINARY_OPTION`, `price_tick_size` "0.01", `qty_tick_size` "1", `quantity_decimals` 0, `contract_size` "1", pay $1 or $0 (instrument fixture, H). Crypto/FX/index ladders, brackets, combos and perpetuals also exist (M, sibling crawl; not re-crawled). A binary-only scanner should skip anything but `BINARY_OPTION`.
- **Outcome tokenisation: none.** Each outcome is its own instrument with its own book: `NX.F.OPT.NFL-00015-261025-M.O.1.1.20270301` (Chiefs, away) and `...O.1.2...` (Seahawks, home); `NX.F.OPT.ELECT-USSNTPRTY26.O.1.1` (Democratic) and `...O.1.2` (Republican) (H). A short is the other side: holder "has the right to receive a fixed Settlement Value if, and only if, the Event Contract's Payout Criteria does NOT encompass the Expiration Value" (rulebook, H).
- **Sibling books are not linked.** Snapshot 02:40Z Senate control: Democratic bid 0.63 / ask 0.68, Republican bid 0.37 / ask 0.41 (H, fixtures). The sum of best bids is 1.00 and of best asks 1.09, so there is no intra-venue arbitrage; a scanner should still price each outcome as `min(direct ask, 1 - best bid of the complement)` when the set is exhaustive and exclusive.
- **Matching metadata** is in `event_details.metaData` (H, instrument and event fixtures): `PREDICT_CATEGORY` (Sports, Politics, Culture, Economics, Crypto, Climate), `SPORTS_GROUPING`, `LEAGUE`, `EVENT_DATE`, `HOME_PARTICIPANT`, `AWAY_PARTICIPANT`, `PARTICIPANT`, `PREDICT_CONTRACT_TYPE` ("Moneyline", "Spread", "Total Points"), `PREDICT_PERIOD_TYPE` ("Full-Game"), `PREDICT_OUTCOME_TYPE` ("Home"/"Away"), `PREDICT_VALUE` (line), `PREDICT_MARKET_ID`, `PREDICT_OUTCOME_ID`, `EXTERNAL_GAME_ID`. Event symbol pattern `NFL-00015-261025-M` (league, sequence number, yymmdd of the slate, literal suffix "M"). Note `PREDICT_CONTRACT_TYPE` is "Moneyline" on the 2026-10-26 game but a sibling note saw "Moneyline (2-Way)" on another; normalise by prefix (M).
- `expiry_timestamp_ms` on sports instruments is a generic far-future date (1803942000000 = 2027-03-01); use `EVENT_DATE`, not expiry (H).

---

## 3. Chains and collateral

- **No chain, no token.** Collateral is USD held at the exchange; "Member funds on deposit with OG are held in segregated bank accounts at BMO Harris Bank and Fifth Third Bank" (https://og.com/legal, wf, H).
- **Crypto is only a US on-ramp into USD** (Mesh FAQ https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions, wf, H): examples Coinbase, MetaMask, Phantom; ETH and BTC named; Mesh converts assets to USDC, "USDC is converted to USD" "instantly" at OG.com; "OG.com does not charge any additional fees"; "a few seconds to under 20 minutes"; New York customers "excluded and not eligible at this time"; "Standard OG.com onboarding, KYC verification, and Terms & Conditions acceptance are required". Chains: NOT FOUND (searched: that FAQ). Crypto withdrawals: not mentioned.
- Outside the US the operator is Foris Capital MU Limited and availability is "certain locations"; country list NOT FOUND (https://og.com/regulatory, wf; sibling article 15476413, M).

---

## 4. Read API

### 4a. Official keyless market-data REST (use this)

- **Docs:** https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (page title "Crypto.com GEN4 FCM US B2C API Documentation (Preview)"; linked as "APIs" from the og.com header, H). Quotes: "This is under private beta. It will be accessible once it is generally available."; "Public market-data endpoints can be explored before onboarding."; "An approved FCM account and API credentials are required for authenticated account and trading endpoints." Change log: 2026-03-21 "Initial Version", 2026-07-17 "Card Top Up API" (H).
- **Base URLs (H):** `https://api.crypto.com/fcm/v1/{method}` (documented production); UAT `https://uat-api.3ona.co/fcm/v1/{method}`. The prediction-reference page documents the same public paths under `/dcm/v1/public/...`, and both answer plain unauthenticated GET (H, fixtures). The docs say requests are POST JSON; the public methods accept GET (H).
- **`/dcm/v1` vs `/fcm/v1` differ (H):** for `get-tickers` the `/dcm/v1` response carries extra `w`/`ww` fields and `oi` null; `/fcm/v1` has `oi` "0" and no `w`/`ww`. `w`/`ww` are undocumented; on the Senate Democratic contract `w`=189,279 vs `v`=10,151, which looks like a 7-day volume (L, inference). A sibling note saw `metaData` populated only on `/dcm/v1` for events (M). Prefer `/dcm/v1` for the universe, and pin the path in the adapter.
- **Public endpoints (H, each hit live):**

| Endpoint | Key params | Observed shape |
|---|---|---|
| `public/get-events` | `limit`, `since` (ns), `cursor`, `PREDICT_CATEGORY`, `LEAGUE`, `SPORTS_GROUPING` | `result.data[]`: `symbol, series_symbols, name, description, event_date (ns), event_end_date, last_updated_time (ns), event_details{metaData,eventName}`; `result.next_cursor` |
| `public/get-instruments` | `event_symbols` (comma list), `symbols`, `limit` (<=1000), `since`, `cursor` | per instrument: `symbol, inst_type, display_name, quote_decimals, quantity_decimals, price_tick_size, qty_tick_size, tradable, expiry_timestamp_ms, underlying_symbol, contract_size, event_details{eventCode,metaData,eventName,attributes}` |
| `public/get-tickers` | `instrument_name` (REQUIRED, comma list, <=100) | `i, h, l, a, c, b (best bid), k (best ask), v, vv, oi, t (ms)`, all strings except `t`; no `instrument_name` gives `{"code":40004,"message":"instrument_name or instrument_names is required"}` |
| `public/get-book` | `instrument_name`, `depth` (<=50) | `result.data[0]={bids:[[price,qty]],asks:[...],t}`; two elements per level, strings |
| `public/get-trades` | `instrument_name`, `count` (<=150), `start_ts`, `end_ts` | `{d,t,tn,q,p,s,i,m}`; `s` lower-case "buy"/"sell"; docs: "Last 150 trades (7-day max window)" |
| `public/get-instrument-lifecycle-states` / `get-instrument-market-status` | `event_symbol`, `limit`, `since`, `cursor` | lifecycle: `state` "Closed", `previous_state` "Suspended", `lifecycle_change_reason` "SCHEDULED_CLOSE", `security_trading_status` "SETTLED"; status: `state` "CLOSED", `reason` "SCHEDULED_CHANGE" |
| `public/get-expired-settlement-price` | `instrument_name` | `{i,x,v,t}`, `v` "1.00"/"0.00"; **the `instrument_name` filter is ignored** (I asked for an NFL contract and got Aug-2026 esports/combos), so it cannot be used for a targeted settlement lookup (H, fixture) |
| `public/get-ticker-histories`, `public/get-deposit-instruments` | | documented; not probed |

- **Units (H):** `v` equals `vv` on every ticker I read (for example v=3708, vv=3708.00 at a 0.46 price), so `vv` is traded contracts times the $1 face, not premium paid. The docs call `vv` "traded volume value (in USD)". Divide by roughly price to compare with premium-based venue volumes.
- **Incremental sync (H):** `since` in nanoseconds; use the record's `last_updated_time` as the next `since`; follow `next_cursor`.
- **Gaps (H):** no open-interest feed for binaries (`oi` null or "0" on every ticker I read); no endpoint for rule text; **settled events disappear from `get-instruments`** (10 of the 11 settled 2026-10-18 NFL game events returned 0 instruments; the 11th returned 2) but remain readable through lifecycle `SETTLED`. Capture final prices before they vanish.
- **Rate limits (H, https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-common-api-reference):** public market data "100 requests per second each" per method per IP; WebSocket market data 100 requests per second; private: create/cancel order 15 per 100 ms, order detail 30 per 100 ms, get-trades and get-order-history 1 per second, all others 3 per 100 ms per key. A few hundred GETs in this session, sequential at roughly 5-10 req/s, saw no 429.

### 4b. Separately licensed feed: data-api.crypto.com

- `https://data-api.crypto.com/api/v1/predictions/events?limit=1` returned 200 with UUID ids and per-contract `yes`/`no`/`chance`/`payout_per_100` and cursor pagination; headers `x-ratelimit-limit: 100`, `x-ratelimit-day-limit: 50000` (H, fixture). The sampled event carried a stale-looking `event_date` of 2025-11-18 for a 2028 market (quirk). Licence: "Personal, non-commercial use under the EULA. No key, no registration."; "Redistribution, commercial use, or AI training requires a Market Data License Agreement (MDLA)." (https://data.crypto.com/, wf, H). Do not use for the scanner without an MDLA; use 4a.

### 4c. WebSocket

- Documented: `wss://stream.crypto.com/fcm/v1/market` with channels `book.{instrument_name}.{depth}` (10 or 50), `ticker.{instrument_name}`, `trade.{instrument_name}` (https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/reference-and-market-data, H).
- **Tested and failed (H, fixture):** the socket opens; `subscribe` for all three channel forms returned `{"code":40003,"message":"Unrecognized channel"}`. The Crypto.com Exchange API page lists "DCM (Predictions)" and "FCM (Predictions)" as REST "Coming soon", WebSocket "Coming soon", FIX "Available" (https://crypto.com/exchange-pro/en-US/api, wf, H). **Use REST polling.**

---

## 5. Trade path (documented, not exercised)

- **Programmatic orders exist only for approved FCM accounts:** `private/create-order`, `cancel-order`, etc. on the same host. Auth: JSON `{id, method, api_key, params, nonce, sig}`; `sig` = hex HMAC-SHA256, keyed by the API secret, of `method + id + api_key + parameter string + nonce` (keys sorted ascending, key+value concatenated); numbers as strings; optional read-only keys and IP allowlists (rest-common-api-reference, H). **No EIP-712, no wallet signature, no on-chain order.**
- **Gates (H):** "To use the FCM APIs, you must complete FCM onboarding through Crypto.com Exchange. This requirement also applies if you currently use OG.com or the Crypto.com Main App." Terms of Business: "you will be required to complete all conformance tests and procedures required by NADEX and to receive written confirmation from NADEX of such satisfactory completion of conformance testing before any use of the NADEX System in a live production environment." Rulebook: an "Independent Software Vendor" that "offers services that provide access to the Trading System" "must enter into an ISV Agreement with the Exchange and be approved by the Exchange"; "Customers of Intermediating Members may not submit orders directly to the Exchange"; intermediaries use FIX (SSL).
- **In-play delay (H):** "The default delay is 3 seconds" on orders after the scheduled start of head-to-head and single-event markets until the event ends (https://help.og.com/en/articles/13051762-temporary-delay, wf).

## 6. PayBox reachability: **no**

- A PayBox EVM or Solana wallet cannot place, sign or fund-by-proposal here: orders are HMAC requests from a KYC'd USD account at a US FCM; no contract, no typed-data order schema, nothing for a transaction proposal (sections 3, 5; H). A US (non-NY) human could fund the account by sending crypto through Mesh, which is funding, not trading from the wallet.
- PayBox catalog (read-only `discover_*`, 2026-10-19): `discover_plugins` "OG.com Crypto.com CDNA prediction markets" returned `{"plugins":[]}`; `discover_services` returned unrelated third-party x402 readers for Polymarket and Hyperliquid (a few thousandths of a dollar per call); nothing for OG or CDNA (H). I did not call any of them.

---

## 7. Fees

Source: https://help.og.com/en/articles/12958828-fees-limits (wf, H; the sibling note read it as raw text with the same table).

| Customer | Markets | Open | Close before expiry | Settle in the money | Settle out of the money |
|---|---|---|---|---|---|
| US (incl. New York) | most markets (Sports, Politics, ...) | taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)` | same formula | waived | no fees |
| US | Crypto, FX, Commodities, Equity indices | `$0.02` per contract | `$0.02` per contract | waived | no fees |
| Outside US | all | `$0.02` per contract | `$0.02` per contract | waived | no fees |

- "Taker fees apply to orders that fill immediately, including all market orders. Maker fees apply to resting orders that fill later." The trader pays, no gas. Worked examples (derived): P=0.50 taker $0.0175, maker $0.004375 per contract; P=0.90 taker $0.0063; P=0.10 taker $0.0063. Position limit 2,500,000 contracts per event ($1 contracts) (same page; rulebook agrees, H).
- NOT FOUND: rounding, volume tiers, maker rebates, deposit/withdrawal fees and limits, the fee-schedule PDF (https://nadex.com/pricing is linked from the regulatory page; not read). Partners (Robinhood, DraftKings, FanDuel, Fanatics) may add their own fees; the scanner needs a per-front-end profile.

---

## 8. Resolution mechanism and dispute risk

- **Centralised: exchange-determined from a named Source Agency per contract.** Sports: "The Source Agency is the final result of the Industry Event reported by AP News or as a back-up Source Agency, any U.S. national news provider as published on the Trading System." Elections: "The Source Agencies are the New York Times, the Associated Press, Bloomberg News, Reuters, Axios, Politico, The Washington Post, The Wall Street Journal, ABC News, CBS News, CNN, Fox News, MSNBC, and NBC, as determined by the Exchange." Crypto variable-payout and bracket contracts: "The Source Agency is the Exchange", priced from a licensed data feed (Lukka is named for one contract) (rulebook, H).
- **General settlement (https://help.og.com/en/articles/13051724-general-settlement, wf, H):** revisions after the event "do not affect settlement"; an event not completed "within 48 hours of its originally scheduled start time" is a Canceled Event paying the one-week VWAP of the last traded price (opening fees refunded); **ties with no tie outcome pay "$0.50 per contract" to Yes and No (fees not refunded)**; the exchange "reserves the right to adjust any settlement if it was made in error due to human or technical issues", crediting or debiting accounts; with no verifiable outcome it settles "at the CDNA Exchange's reasonable discretion". Normally settled "shortly after the event concludes".
- **Disputes:** no trader appeal process in the settlement article (NOT FOUND). Terms of Use: "binding arbitration held in Cook County, Illinois ... Commercial Arbitration Rules of the American Arbitration Association" (terms PDF, H). The rulebook has Member-Exchange arbitration chapters and Appeals Panel for disciplinary matters only (table of contents, M).
- **Arbitrage consequence (M):** exchange discretion plus 48-hour VWAP cancels and $0.50 ties differ from many Kalshi and Polymarket markets; every cross-venue pair needs a rule-matching check and a settlement-basis haircut. Settlement is fast: all Sunday 2026-10-18 early games were SETTLED by 02:40Z (H, lifecycle fixture).

---

## 9. Geo, ToS, automation

- **US:** "OG.com is currently available in all U.S. states"; "certain event contracts offered through OG.com may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s, wf, H). New York excluded from the Mesh crypto deposit route (section 3). Outside the US: "certain locations", list NOT FOUND.
- **Automation (H):** API only after conformance tests and written NADEX confirmation (Terms of Business); orders entered "manually or via automated functionality" need "adequate controls ... to prevent excessive messaging or other activity that may be deemed detrimental or disruptive to the Exchange" (rulebook); rulebook bars wash trading, front running, accommodation trading and pre-arranged trading. No rule against bots as such found. No clause on third-party or account-manager trading found in the Terms of Business PDF (searched for "account manager", "power of attorney", "third party trad"); a legacy Nadex page reportedly bars it (sibling note, M; not re-read).
- **Reading public data (open risk):** NOT FOUND any terms for `api.crypto.com/.../public/*` (searched: API docs, Terms of Business PDF for "scrap/robot/spider/crawl", rulebook for "Market Data"). The Terms of Use prohibit "Commercial use of any of the Content" of the Site (terms PDF, H) but do not name the API. The market-data page https://nadex.com/market-data (linked from the regulatory page) returns empty to WebFetch. og.com robots.txt disallows only account and auth paths (`/settings`, `/portfolio`, `/login`, `/signup`, `/auth`, ...) and explicitly allows GPTBot-type crawlers (H); it does not govern `api.crypto.com`. Treat aggregation or redistribution as unlicensed until CDNA confirms.

---

## 10. Liquidity (single snapshot; all figures are $1-face contracts traded in 24h unless stated)

| Measure | Value | Source and time | Tag |
|---|---|---|---|
| Cowboys @ Packers (live SNF), 24h across 762 instruments | **$5,837,594 face** | `get-tickers`, 2026-10-19 02:43Z | H |
| Same game, cumulative on og.com | "$9,883,337 vol." (unit not stated) | https://og.com, 02:40Z | H |
| Commanders @ 49ers (Mon night), 24h across 873 instruments | $196,310 | `get-tickers`, 02:43Z | H |
| Next week's 12 NFL games (2026-10-25/26 slate), 24h each | $172 to $4,340 per game (Patriots @ Bears Thursday 2026-10-22 ET: $13,787) | `get-tickers`, 02:43Z | H |
| Seahawks moneyline book (2026-10-26 game) | bid 0.54 x 185,593; asks 0.55 x 100,000, 0.57 x 101,001, 0.58 x 100,000 (these look like market-maker size, not organic flow) | `get-book depth=5`, 02:40Z | H |
| Non-sports, all categories, 24h | **about $104.9k face**: Politics $95.4k (140 events, 376 instruments, 275 two-sided, median spread $0.08), Culture $6.9k (median spread $0.16), Economics $1.2k, Climate $0.9k, Crypto-category $0.4k | own crawl via `get-events?PREDICT_CATEGORY=` -> `get-instruments?event_symbols=` -> `get-tickers`, 02:39-02:40Z | H |
| Biggest politics contracts 24h | Texas Senate election (outcome `O.1.2`) $20.9k; US Senate control Republican `O.1.2` $16.9k and Democratic `O.1.1` $10.2k | same crawl | H |
| Senate control Democratic book | bids 0.63 x 100, 0.62 x 11,555, 0.61 x 7,915; asks 0.68 x 8, 0.69 x 8,070, 0.70 x 3,056 | `get-book depth=5`, 02:40Z | H |
| Third-party weekly notional | "Nadex" = $230,038,044 for the week to 2026-10-12 (metric undefined; the series name does not say OG or CDNA) | https://www.theblock.co/data/decentralized-finance/prediction-markets (wf) | M |
| Open interest / TVL | **NOT FOUND** (searched: ticker `oi`, docs, The Block page; the Block lists OI for Kalshi, Polymarket, Polymarket US, Rothera only) | | H (absence) |

Caveat: games already SETTLED vanish from `get-instruments`, so a 24h ticker sum cannot recover the Sunday-slate total; the NFL figure is a lower bound for the last 24h. Sports (NFL above all) is the only deep category; trend is not measurable from one snapshot and NFL volume is seasonal (L).

---

## 11. Event categories and overlap (where arbitrage can exist)

- **Sports (the real overlap):** NFL, NCAA football, NBA, NHL, MLB, tennis (ATP/WTA), soccer (EPL, UCL, La Liga, Bundesliga, Serie A, Ligue 1, MLS, Liga MX and more), boxing, F1/INDY/NASCAR, Counter-Strike 2, chess (og.com navigation, H). Moneyline, spread (up to ~90 strikes per game), totals, props, season futures. **High overlap** with Kalshi, Polymarket, Gemini, Underdog UDX and others. Match on team names plus `EVENT_DATE`, then check `PREDICT_PERIOD_TYPE` and tie/overtime rules.
- **Politics:** US Senate control 2026, state Senate races, single House districts, 2028 President/nominee (H). **High overlap** with Kalshi and Polymarket; thin here (median spread 8c).
- **Economics (19 events, 44 instruments, e.g. "Unemployment Rate in Oct 2026"), Culture (32 events), Climate (1):** small, thin (H). Overlap with Kalshi on macro.
- **Crypto price and FX / indices / commodities:** BTC, ETH, SOL, XRP and about 15 more underlyings from 5-minute to weekly, EUR/USD, S&P 500, Nasdaq 100, Dow (og.com navigation, H). Overlaps in concept with Kalshi/Polymarket/Gemini crypto ladders, but settles on exchange-computed indices (basis risk) and the fee is a flat $0.02 per contract. Crypto-category binaries traded about $430 in 24h (H).
- **Combos / parlays** exist (M); skip in a single-leg scanner.

## 12. Liquidity sharing (independent leg?)

- **Independent of Kalshi, Polymarket, Gemini, Underdog UDX: yes.** Own DCM, DCO and matching engine (H). The same market makers may quote several venues (M).
- **Not independent of its own distributors (H unless noted):** og.com/regulatory lists "DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures" as intermediaries. The Robinhood announcement says Robinhood will "route retail event contract volume through OG.com's" exchange and clearinghouse (H), but gives no start date (so Robinhood flow may not be live yet; M). FanDuel also routes to CME (M, sibling), so only its CDNA contracts duplicate this book. Crypto.com app, Predict Pro, ROLR, PredictArena are front ends (sibling notes, M). Whether partner orders rest in the same book as direct retail and the outside-US entity is not stated (NOT FOUND); the rulebook's single Trading System suggests one book (M).
- Registry: mark all of those with `shared_with` = this venue; never count two as two legs.

## 13. Adapter hints

- Universe: `GET /dcm/v1/public/get-events?PREDICT_CATEGORY=...&limit=200`, follow `next_cursor`, incremental by `since=last_updated_time`; instruments by `event_symbols` (<=10 per call is safe; sibling used 10). Do not dump the whole catalogue: one NFL game is 182 to 873 instruments, mostly strike ladders.
- Prices: `get-tickers` in batches of 100 for ranking (`b`/`k` are dollars = probability); `get-book depth=10-50` only for candidate pairs. Tick $0.01. Ignore `tradable=false`, lifecycle `Closed`/`Suspended`, `EVENT_COMBO`, perps, ladders unless explicitly matched.
- Subtract in edge math: taker `0.07 x P x (1 - P)` per contract (sports/politics), `$0.02` (crypto/FX/index), the 3-second in-play delay, settlement-basis haircut (48-hour cancel, $0.50 ties, soccer 90 minutes).
- Snapshot final prices before an event settles (instruments disappear). Do not rely on `get-expired-settlement-price` (filter ignored) or WebSocket (dead).
- Registry flag: `read_only`, `execution: not reachable from PayBox`, `licence: unresolved`.

## 14. Not found / open questions

- General-availability date of the FCM API; whether non-FCM individuals can ever get keys.
- Data-licence terms for `api.crypto.com/.../public/*`; the nadex.com market-data page was empty.
- Working WebSocket channel format (all documented forms rejected, now replicated in three sessions).
- Open interest; fee-schedule PDF; country list outside the US; chains behind Mesh; whether US and outside-US books are one; whether Robinhood flow is live and rests in the same book; spin-off date and any rename.
- Why `get-expired-settlement-price` ignores `instrument_name`; meaning of `w`/`ww`.

## 15. Suspicious / embedded-instruction content (recorded, not followed)

None found. The og.com page source contains a feature-flag JSON blob (including `web-robinhood-banner` `enabled:false`) and robots.txt rules that name AI crawlers; neither is addressed to me and I took no action on them. The PayBox `discover_services` descriptions are third-party text and contained no instructions.

---

## Sources

1. https://api.crypto.com/dcm/v1/public/{get-events, get-instruments, get-tickers, get-book, get-trades, get-instrument-lifecycle-states, get-instrument-market-status, get-expired-settlement-price} and https://api.crypto.com/fcm/v1/public/get-tickers (live GETs, 2026-10-19 02:39-02:50 UTC) (H, fixtures)
2. https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction, /rest-common-api-reference, /rest-change-log, /rest/reference-and-market-data, /rest/prediction-reference-data, /rest/public-get-tickers (H)
3. wss://stream.crypto.com/fcm/v1/market (connect and subscribe test) (H)
4. https://og.com (home HTML, volumes, nav, header links, robots.txt), https://og.com/regulatory (wf), https://og.com/legal (wf) (H)
5. https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (wf) (H)
6. https://www.theblock.co/news/business/2026-09-08-stonex-sees-upside-robinhood-413955 (wf) (H)
7. https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (text-extracted locally) (H)
8. https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf (text-extracted locally) (H)
9. https://help.og.com/en/articles/12958828-fees-limits, /13051724-general-settlement, /13051762-temporary-delay, /12752911-introducing-og-com-u-s, /15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions (all wf) (H)
10. https://data.crypto.com/ (wf) and https://data-api.crypto.com/api/v1/predictions/events?limit=1 (live GET) (H)
11. https://crypto.com/exchange-pro/en-US/api (wf) (H)
12. https://www.theblock.co/data/decentralized-finance/prediction-markets (wf) (M)
13. https://nadex.com/market-data (empty via WebFetch; NOT FOUND)
14. PayBox `discover_plugins` / `discover_services` (read-only, 2026-10-19) (H)
15. In-repo siblings (M where relied on): `docs/research/venues/crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md`, `og-crypto-com-nadex.md`, `og-com-markets-og-predictions-crypto-com.md`, `og-og-com.md`

## Fixtures (`docs/research/fixtures/og-com-crypto-com-derivatives-north-america/`)

All under 5 KB each. Raw public responses unless noted.

- `events_politics_limit2_2026-10-19.json`, `events_nfl_limit3_2026-10-19.json`
- `instruments_nfl_moneyline_pair_2026-10-19.json` (2 of 182 instruments, re-wrapped with a `_note`)
- `tickers_nfl_moneyline_pair_2026-10-19.json`, `tickers_fcm_v1_path_same_instrument_2026-10-19.json` (shows the `/fcm/v1` vs `/dcm/v1` ticker difference), `tickers_us_senate_party_pair_2026-10-19.json`
- `book_nfl_seahawks_moneyline_depth5_2026-10-19.json`, `book_us_senate_dem_depth5_2026-10-19.json`
- `trades_nfl_seahawks_moneyline_count3_2026-10-19.json`
- `lifecycle_states_settled_nfl_event_limit3_2026-10-19.json`, `market_status_settled_nfl_event_limit2_2026-10-19.json`
- `expired_settlement_price_filter_ignored_head3_2026-10-19.json` (truncated)
- `error_get_tickers_without_instrument_name_2026-10-19.json`
- `secondary_feed_data_api_predictions_events_limit1_2026-10-19.json` (separately licensed feed; sample only)
- `liquidity_nonsports_by_category_2026-10-19.json`, `liquidity_nfl_games_2026-10-19.json` (my computations)
- `websocket_market_unrecognized_channel_2026-10-19.json` (recorded error replies)

Privacy check: scripts and fixtures were grepped for `@` and for personal identifiers before and after running; the only `@` hits are "Away @ Home" team names; every request used the generic User-Agent `insurance-markets-research/0.1`; no contact address, home path or personal identifier appears in any request, saved file or this note.
