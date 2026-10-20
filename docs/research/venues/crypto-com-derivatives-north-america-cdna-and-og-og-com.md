# Crypto.com | Derivatives North America (CDNA) and OG (OG.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (live probes about 03:05-03:15 UTC). READ-ONLY: official OG.com pages, OG help centre (raw HTML), Crypto.com exchange API docs, the 2026-10-13 rulebook, the CDNA/NADEX terms PDFs and the market-data EULA (PDFs downloaded to a scratch dir and read as text), unauthenticated GETs to the documented public market-data host (about 60 requests, 1 to 3 per second, no throttling), two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment, WebSocket connection or browser automation. No PayBox money or signing tool was called. All third-party text was treated as untrusted data; nothing in it tried to instruct an agent. Scripted requests used exactly the User-Agent `insurance-markets-research/0.1`; the scripts were grepped for "@" and personal names before running. The shared WebSearch budget was exhausted before my first search, so news coverage rests on fetched primary pages only (gaps in section 12).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summariser output, or my inference from first-hand data; **L** = weak, sponsored or stale (older than 6 months counts as possibly stale).

Duplicate-coverage warning for the orchestrator: this repo already holds five notes on the same exchange under other discovery names (`og-og-com.md`, `og-crypto-com-nadex.md`, `og-com-crypto-com-derivatives-north-america.md`, `og-com-markets-og-predictions-crypto-com.md`, `crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md`) plus `crypto-com-predict-pro.md` for the Predict Pro front end. I used them only as leads and re-verified everything below myself. They are one venue and one adapter.

---

## 0. Verdict

- **Still live (H):** yes. Order books, tickers and trades on `api.crypto.com` were updating minutes before each call; a Sunday-night NFL game was trading 1.8M contracts in 24h; the OG help-centre fee article is dated 2026-09-15; the rulebook is dated 2026-10-13.
- **One exchange, many names (H).** OG.com Markets, Crypto.com | Derivatives North America (CDNA) and Nadex are brands of one CFTC-registered DCM+DCO, North American Derivatives Exchange, Inc. (NADEX). The hint's conflict ("OG is now independent" vs "CDNA routes DraftKings/FanDuel/Fanatics/Underdog") resolves as: OG.com the company was spun out of Crypto.com in 2026 and calls itself "an independent trading platform" (own press release), but the exchange underneath is the same NADEX/CDNA engine that the distributors route into.
- **Independence for arbitrage:** independent of Kalshi and Polymarket; **not** independent of its own distributors. Treat OG.com + CDNA + Crypto.com App + Predict Pro + the OG-routed part of DraftKings, FanDuel, Fanatics, Underdog, Robinhood and Wedbush as ONE leg.
- **Read side is excellent:** free, keyless, documented REST (100 req/s per IP per method) with full books, trades, tickers and lifecycle feeds; WebSocket documented. Open interest is not usable (`oi` is "0" on every option I sampled).
- **Trade side is gated:** retail/pro API needs an approved FCM account and is "private beta"; HMAC-signed REST/WebSocket/FIX; USD collateral; no on-chain order path. Not reachable from a PayBox wallet.
- **adapter_priority = P1.** Reason: strong no-auth sports price leg with real depth on busy days, independent of Kalshi/Polymarket, but non-sports liquidity is thin, OI is unpublished, trading is FCM-gated and a data licence question remains for commercial use.

---

## 1. Is it still live? Entity map (2026)

| Fact | Evidence | Tag |
|---|---|---|
| NADEX "operates two brands for its CFTC-regulated business: CDNA and OG.com"; DCM and DCO; Foris DAX FCM LLC d/b/a OG Broker is a CFTC-registered FCM and OG.com Markets affiliate | https://og.com/regulatory (fetched 2026-10-19) | H |
| Rulebook cover: "North American Derivatives Exchange, Inc. ... d/b/a OG.com Markets ... and Crypto.com / Derivatives North America" (OG-M / CDNA); dated 2026-10-13, 389 pages | https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf | H |
| Press release 2026-02-03: OG consumer app launched, "powered and offered by" CDNA, "a CFTC-registered exchange and clearinghouse and an affiliate of Crypto.com"; US first, global "in the near future" | https://crypto.com/us/company-news/cryptocom-launches-og-a-new-prediction-market-experience (WebFetch summary) | M (summariser; 8+ months old, possibly stale) |
| OG-Robinhood release: Robinhood "will route retail event contract volume through OG.com's underlying CFTC regulated derivatives exchange and clearinghouse architecture"; Citadel Securities invested in Crypto.com at $20B incl. "a standalone $5 billion valuation of OG.com through its strategic spin-off"; "OG.com operates as an independent company"; Robinhood rollout of OG-backed contracts "starting on September 8, 2026". Release page is undated in the HTML text I extracted. | https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (raw HTML) | H |
| OG about page: CEO Kris Marszalek ("Founder and CEO", also Crypto.com CEO); partners "Robinhood, DraftKings, FanDuel, Underdog, and Fanatics ... route through OG's licensed core exchange"; pro access "REST, WebSocket, and FIX" | https://og.com/about (WebFetch summary) | M |
| Conflict: the Feb 2026 release names a different OG CEO (Nick Lundgren, via Cointelegraph/sibling notes). Prefer OG's own newer pages. | - | L |
| Non-US retail entity: Foris Capital MU Limited (Mauritius FSC licence GB22200345), "connected to a CFTC-registered FCM, which in turn is connected to NADEX", does business as OG.com | https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s ; og.com footer | H |
| Predict Pro (Crypto.com Exchange front end, launched 2026-10-15) is a broker door to the same book | sibling `crypto-com-predict-pro.md` (press release read there); next.io (sponsored) says "US users must first become a CDNA member" | M / L |
| Third-party tracker lists DraftKings as routing to Railbird, CDNA and CME, FanDuel to CME and Crypto.com, Fanatics and Underdog to CDNA. It says Robinhood's FCM routes to Kalshi, ForecastEx and Rothera "not CDNA", which contradicts OG's own Robinhood release; the tracker header says "current as of May 2026" and is stale on that point. | https://mickbransfield.com/cftc-regulated-pms/ (WebFetch summary) | L |

Verdict: **still_live = true.** Counterparty note (M/L): a Sportico report of CDNA executive departures was cited in a sibling note and could not be read (paywalled); I did not verify key-person risk.

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated centralised exchange (DCM+DCO), USD cash-settled, retail front ends plus FCM/IB intermediaries. No blockchain component. Rulebook classes the contracts as swaps ("The Type of Contract is an Event Contract, which is a Swap").
- **Book (H):** central limit order book, tick $0.01 (`price_tick_size` "0.01"), whole contracts (`quantity_decimals` 0), $1 payout. API order types LIMIT / MARKET / STOP / STOP_LIMIT; time-in-force GTC / IOC / FOK / GTD (https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/trading, WebFetch summary, M).
- **Outcome tokenisation (H, fixtures):** none. Each outcome is its own instrument (`inst_type` `BINARY_OPTION`). A two-way moneyline is two instruments (`...O.1.1...` and `...O.1.2...`), e.g. Commanders 0.21/0.22 and 49ers 0.78/0.79 (bids sum 0.99, asks sum 1.01). Multi-outcome events (Fed decision, Senate control, 2028 winner) are families of single-outcome binaries sharing `underlying_symbol`; there is no separate "No" instrument. Categorical = set of binaries; no scalar markets seen.
- **Other instrument types in the same API (M, sibling crawl):** `EVENT_COMBO` (parlays, up to 20 legs per OG help centre and Crypto.com release), `BRACKET_OPTION`, `PERPETUAL_SWAP`. The scanner should ignore all but `BINARY_OPTION`.
- **Identifiers (H):** instrument `NX.F.OPT.{event_symbol}.O.{period}.{strike_index}[.{YYYYMMDD}]`; event `NFL-00001-261019-M`, `ELECT-USSNTPRTY26`, `EC-00032-26`. Matching metadata lives in `event_details.metaData`: `LEAGUE`, `EVENT_DATE`, `HOME_PARTICIPANT`, `AWAY_PARTICIPANT`, `PARTICIPANT`, `EXTERNAL_GAME_ID`, `PREDICT_CATEGORY`, `PREDICT_CONTRACT_TYPE` (Moneyline, Spread, Total Points, Total Receptions...), `PREDICT_PERIOD_TYPE` (Full-Game, 1st Half, 4th Quarter...), `PREDICT_OUTCOME_TYPE` (Home/Away/Over/Yes...). Per-game catalogue is large: the Commanders @ 49ers event alone listed 873 instruments (moneyline 2, spreads 90+, totals 94+, player props the rest).
- **Time-field trap (H):** `expiry_timestamp_ms` on sports instruments is a placeholder (about March 2027 for an October 2026 game). Use `metaData.EVENT_DATE` (ISO string) for event time.
- **Public `tradable` flag is not reliable for lifecycle (H):** use lifecycle/market-status feeds (section 4).

---

## 3. Chains and collateral

- **No chain, no token (H).** Collateral and settlement are USD held at the exchange/FCM: "Member funds on deposit with OG are held in segregated bank accounts at BMO Harris Bank and Fifth Third Bank" (https://og.com/legal, WebFetch summary, M).
- **Funding routes (H, https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions):** a "Crypto-to-Cash" deposit via Mesh: link an external wallet or exchange "(such as Coinbase, MetaMask, or Phantom)" or scan a QR; non-USDC assets are converted to USDC by Mesh, then "we instantly convert the USDC to cash (USD)"; no OG fee; "currently available for our US customers", New York excluded; standard KYC required first. Which chains and tokens Mesh accepts: NOT FOUND (searched: that article). Crypto withdrawals: NOT FOUND in the articles I read.
- **Funding rule (M, from legacy Nadex terms quoted in a sibling note, not re-read by me):** funding must come from the member's own accounts; third-party funding is prohibited.

---

## 4. Read API

- **Exists: official, public, keyless for market data (H).** Docs "Crypto.com GEN4 FCM US B2C API Documentation (Preview)", linked as "APIs" from og.com: https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction. It states "This is under private beta", that public market-data endpoints "can be explored before onboarding", and that retail account/trading APIs need an approved FCM account (WebFetch summary, M).
- **Base URLs (H, https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-common-api-reference):** REST prod `https://api.crypto.com/fcm/v1/{method}`, UAT `https://uat-api.3ona.co/fcm/v1/{method}`; WebSocket market `wss://stream.crypto.com/fcm/v1/market`, user `wss://stream.crypto.com/fcm/v1/user` (UAT `uat-stream.3ona.co`). **Also works (H, my GET):** `https://api.crypto.com/dcm/v1/public/get-events` returns the same payload shape (the prediction-reference-data doc page uses `/dcm/v1/`).
- **Doc/behaviour mismatch (H):** the introduction says all endpoints use POST; every public method I called works as GET with query parameters. Private methods are POST.
- **Public endpoints (GET, confirmed live 2026-10-19 unless noted):**

| Endpoint | What I confirmed (H) |
|---|---|
| `/public/get-events` | `limit`, `since` (0 = from start), `cursor`/`next_cursor`, filters `LEAGUE`, `PREDICT_CATEGORY` (also seen in sibling notes: `SPORTS_GROUPING`). Without `since` the event rows come back with empty `metaData` and `event_date: null`; with `since=0` they are populated (`event_date` is nanoseconds). `PREDICT_CATEGORY=Economics` returned 19 events, Crypto 5, Culture 32, Politics 100+ (paged). |
| `/public/get-instruments` | `limit` (up to 1000), `event_symbols` (comma list), `symbols`, `since`, `cursor`. **`PREDICT_CATEGORY` is ignored here** (returned the same unfiltered list for Politics/Economics/Crypto). Full instrument rows carry tick sizes, `tradable`, `underlying_symbol` and the `metaData` above. |
| `/public/get-tickers` | `instrument_name` **required** (comma list, up to 100); no filter returns HTTP 400 `{"code":40004,"message":"instrument_name or instrument_names is required"}`. Fields `i,h,l,a,c,b,k,v,vv,oi,t`: best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`, `oi`, ms timestamp `t`. All numbers are strings. |
| `/public/get-book` | `instrument_name`, `depth` (doc: up to 50). Returns `bids`/`asks` as two-element `[price, qty]` string arrays plus `t` (ms). |
| `/public/get-trades` | `instrument_name`, `count` (doc: last 150, 7-day window). Fields `d,t,tn,q,p,s,i,m`; side `s` came back lowercase `buy`/`sell`. Settled instruments still return trades. |
| `/public/get-instrument-lifecycle-states`, `/public/get-instrument-market-status` | cursor-paged state-change feeds; lifecycle rows show `state` Active/Closed, `lifecycle_change_reason` (e.g. SCHEDULED_CLOSE), `security_trading_status` (e.g. SETTLED, OPEN_FOR_TRADING); market-status rows show OPEN/CLOSED and reason. Filter `event_symbol`. |
| `/public/get-expired-settlement-price` | **Ignores filters**; returned old FX-ladder rows (`NX.F.OPT.GBP-USD...20260814`), not event contracts. Resolution value for event contracts is therefore not available here (see below). |
| `/public/get-ticker-histories` | documented; my call without the required parameter returned 400 `instrument_names is required`; not otherwise tested. |

- **Resolution observability (H):** after an event settles, its instruments vanish from `get-instruments` and `get-tickers` (empty `data`) and `get-book` returns `{"code":40004,"message":"Invalid instrument"}`, but `get-trades` still serves the last trades (final prints at 0.01 for a losing leg) and `get-instrument-lifecycle-states` keeps rows with `security_trading_status: SETTLED`. There is no documented field carrying the final settlement value for sports/politics; infer from the last trade/lifecycle, or from the OG site. This is the main read-side gap for a resolution tracker.
- **Open interest: effectively NOT FOUND.** Docs say the ticker 24h summary includes open interest; every binary-option ticker I read had `"oi":"0"` (sports, Senate, Fed, 2028 winner, BTC). No OI endpoint exists. (H absence in a sample, not a full crawl.)
- **Rate limits (H, common reference):** public REST 100 requests/second per method per IP; WebSocket market 100/s, user 150/s. Private: create/cancel 15 per 100 ms per key; `get-trades` and `get-order-history` 1/s; others 3 per 100 ms. Envelope `{id, method, code, result}`, `code` 0 = success. Host is behind Cloudflare; no geo-block from the research host.
- **WebSocket (H doc, not connected by me):** public channels `book.{instrument_name}.{depth}` (10 or 50 levels), `ticker.{instrument_name}`, `trade.{instrument_name}`.
- **Second feed, do not use for the aggregator (H):** `https://data-api.crypto.com/api/v1/predictions/events` (keyless, 100/min and 50,000/day per IP, top-of-book only). It sends `Link: .../eula.pdf?v=eula_v3; rel="terms-of-service"`, and that EULA bars automated access, commercial use and AI processing (section 8). I fetched one event to confirm it responds and saved no sample.
- **Fixtures** (section 11) hold real responses for events, instruments, tickers, book, trades, lifecycle, market-status, the 400 error and the settled-instrument behaviour.

---

## 5. Trade path and PayBox reachability

- **Programmatic trading exists but is gated (H docs / M summaries):** private REST/WebSocket `private/create-order` (LIMIT/MARKET/STOP/STOP_LIMIT; GTC/IOC/FOK/GTD), `amend-order`, `cancel-order`, `cancel-all-orders`, `close-position`, `get-open-orders`, `get-order-detail`, `get-order-history`, `get-trades`, `get-transactions` (https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/trading). Auth: API key + secret, **HMAC-SHA256** over `method + id + api_key + sorted(param key+value) + nonce` (nonce = unix ms, within 60 s), hex `sig` (common API reference, H). WebSocket `public/auth` once per session.
- **Who may use it:** "To access retail account and trading APIs, you must have an approved FCM account ... complete FCM onboarding through Crypto.com Exchange", including for existing OG.com users; docs are "private beta" (introduction page, M via summariser). Rulebook: "A Customer of Intermediating Members may not submit orders directly to the Exchange and all such orders must be submitted by that Customer's Intermediating Member"; intermediating members submit "over a FIX Connection by Internet (SSL only)" (rulebook, H, text extracted from the PDF). NADEX Terms of Business: an API connection requires passing "all conformance tests and procedures ... and to receive written confirmation from NADEX ... before any use ... in a live production environment" (H).
- **PayBox reachability: NO for trading (H by absence).** No on-chain order, no EIP-712 or Solana signature scheme, no transaction proposal, no contract address. A PayBox EVM wallet cannot place, sign or cancel orders. At most it is a source of crypto for the human owner's own KYC'd US account via the Mesh crypto-to-cash route (US only, not NY, owner's own accounts), which is funding, not trading. `discover_plugins("OG.com Crypto.com prediction markets")` returned an empty list; `discover_services("OG.com prediction markets odds")` page 1 returned only third-party Polymarket/Kalshi/Hyperliquid odds resellers (page 2 not read).
- **Practical path for execution:** a human opens an OG.com / OG Broker (Foris DAX FCM) account, completes FCM API onboarding, and the bot holds the HMAC key in a secret store behind a relay. Alternatively route that leg through a distributor that allows API trading (not researched here).
- **In-play delay (H, https://help.og.com/en/articles/13051762-temporary-delay):** any order placed after an Industry Event has started is held for a "Temporary Delay"; default 3 seconds unless the exchange sets another duration. This blunts latency arbitrage on live sports. Pre-game and futures-style books are unaffected.

---

## 6. Fees

From https://help.og.com/en/articles/12958828-fees-limits (dated 2026-09-15, raw HTML read, H):

| | US customers (incl. New York), most markets (sports, politics, etc.) | US customers, Crypto / FX / Commodities / Equity indices | Outside the US |
|---|---|---|---|
| Open | Taker `0.07 x C x P x (1 - P)`; Maker `0.0175 x C x P x (1 - P)` | `$0.02` per contract | `$0.02` per contract, all markets |
| Close before expiry | same formula as opening | `$0.02` per contract | `$0.02` per contract |
| Settles in the money | "Waived" | "Waived" | "Waived" |
| Settles out of the money | "No fees" | "No fees" | "No fees" |

- C = contracts, P = price in dollars. Orders that fill immediately, including all market orders, pay taker; resting orders that fill later pay maker. Position limit 2,500,000 contracts per event for $1 contracts.
- Worked examples (my arithmetic): taker at P = 0.22 is 1.20 c/contract (maker 0.30 c); at P = 0.50 it is 1.75 c (3.5% of price); at P = 0.68 it is 1.52 c.
- **Ambiguity (M):** the table's ITM/OTM rows read as settlement-time fees. The entry fee is paid when the order fills: cancelled events refund "trade fees paid to open the positions", and the OG intro article says a wrong prediction loses "what you paid, plus fees". For a hold-to-expiry arb leg, model cost = entry fee only; for a leg you may close early, add the exit fee. Confirm with a live fill before trusting.
- **NOT FOUND:** rounding rules, volume tiers, market-maker rebates, exchange-level fee schedule for FCM/DMA participants (searched: help centre, API docs, rulebook text). Distributors (DraftKings, FanDuel, Robinhood, Fanatics, Underdog) may charge their own fees; fees are per front end.

---

## 7. Resolution mechanism and dispute risk

- **Resolver (H, https://help.og.com/en/articles/13051724-general-settlement):** the exchange settles "based on the result issued by the relevant news or market data provider once the event concludes"; later "disqualifications, revisions, or amendments" by the provider "do not affect settlement". "The CDNA Exchange reserves the right to adjust any settlement if it was made in error due to human or technical issues", with balances debited or credited; if no verifiable outcome exists, settlement is at the exchange's "reasonable discretion". No trader appeal path is described on that page ("contact support"). Member-level disputes go to binding arbitration under rulebook Rule 10 (Cook County, Illinois; H, rulebook text).
- **Cancelled events are not binary (H):** postponed, cancelled or not completed within 48 hours of the scheduled start (tennis: 14 days) is a Canceled Event; holders on the specified outcome receive the one-week VWAP of the last-traded price, the other side receives $1 minus that, and open-trade fees are refunded. A draw with no tie outcome listed pays $0.50 to each side, with no fee refund. Material rule changes after listing can also trigger cancellation (Rule 7.1). This is basis risk for any cross-venue pair.
- **Sport rules (H, https://help.og.com/en/articles/13051729-sports-settlement):** overtime included in American football, basketball, hockey (shootout winner +1 goal for totals) and baseball extra innings; soccer is 90 minutes plus stoppage unless stated; tennis retirement/disqualification settles for the advancing player; baseball F5 ties pay $0.50; motorsport settles on the governing body's official classification.
- **Politics (H, rulebook "Election Outcome Event Contract"):** Source Agencies are a named list of media outlets (NYT, AP, Bloomberg, Reuters, Axios, Politico, WaPo, WSJ, ABC, CBS, CNN, Fox, MSNBC, NBC) "as determined by the Exchange"; expiration time 10:00 AM ET; settlement no later than the day after expiration; delayed if the source does not publish (contingency clause). Which outlet decides a contested race is at the Exchange's discretion.
- **Crypto price ladders (H, rulebook "Crypto Price Contracts"):** underlying is the bid/ask midpoint reported by Lukka, Inc.; "The Source Agency is the Exchange"; min tick 0.01; settlement $1. Expect timestamp/print differences versus Kalshi/Polymarket crypto ladders.
- **Counterparty:** exchange and clearinghouse are the same legal entity (NADEX) and it settles its own contracts; no external oracle or on-chain dispute window.

---

## 8. Geo, ToS and automation

- **Availability (H):** US customers in all states, but "certain event contracts ... may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s). Outside the US through Foris Capital MU Limited, "currently available only in certain locations" (https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s). A sponsored next.io page lists NY and AZ as blocked and sports unavailable in IL, MA, MD, MI, NJ, NV, OH (L, sponsored); OG's own help centre has New York portfolio/fee articles, so treat the NY claim as unverified. The "US only" claim in the Feb 2026 release is stale.
- **KYC and account rules:** KYC required (H). One-account/self-directed/no-third-party-management language comes from the legacy Nadex "activities to avoid" page quoted in sibling notes (M, not re-read; scripted fetches of nadex.com return 403). An agent trading the owner's own account with the owner's own key is a compliance question for the owner, not a technical block.
- **Automation (H, short quotes):**
  - Rulebook: members sending messages "whether manually or via automated functionality, must ensure adequate controls are in place to prevent excessive messaging or other activity that may be deemed detrimental or disruptive to the Exchange".
  - Terms of Business: conformance testing and written confirmation before any live API use (above); the DMA terms say NADEX "in its sole discretion may suspend, condition or revoke your access".
  - Rulebook Rule on prohibited practices bars "wash trading, pre-arranged trading ... and any other trading practices that the Exchange deems to be abusive or disruptive"; contracts bar Source Agency employees and persons with material non-public information or direct influence over the outcome.
- **Data licence (H, important for an aggregator):** the Market Data EULA (Foris DAX, Inc., "approved market data agent for the North American Derivatives Exchange", last modified July 2026, https://data.crypto.com/static/eula.pdf?v=eula_v3) licenses data "solely for your internal business operations in the United States" and forbids redistribution, derivative products, "any commercial purpose" without written consent, using the data "as or in prompts for or inputs to any AI Technology", and access "through any automated means, including bots, scrapers" except via separately authorised API access. It governs the data.crypto.com / data-api feed. I found **no licence text attached to `api.crypto.com/fcm/v1/public`**, whose docs say public endpoints "can be explored before onboarding" (NOT FOUND: any ToS for the FCM public market-data host; searched: API docs pages, T&C PDF, DMA terms, rulebook, og.com/legal). Before shipping a commercial scanner or any redistribution, get written clearance or a market-data licence (MDLA). `og.com/robots.txt` disallows only account pages and explicitly lists AI crawlers as allowed; it does not govern the API host.
- **Insider/market-abuse note:** cross-venue arbitrage itself is not prohibited by anything I read; spoofing-style or wash behaviour is.

---

## 9. Liquidity (all dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Sunday Night Football moneyline (Cowboys @ Packers), 24h volume | 1,835,140 contracts across both legs (about $1.8M face), prices 0.05/0.06 and 0.94/0.95 (game near decided) | `get-tickers`, 2026-10-19 ~03:13 UTC, fixture `derived_nfl_moneyline_slate_2026-10-19.json` | H (point-in-time, peak-day) |
| Monday Night Football moneyline (Commanders @ 49ers, kickoff 2026-10-20 00:15 UTC) | 24h volume 33,330 + 9,496 contracts; book: bid 0.21 x 309,115, 0.20 x 105,000; ask 0.22 x 646,891, 0.23 x 732,326, then 500k-600k per level to 0.31 (ask side) | `get-tickers`/`get-book`, ~03:09 UTC, fixtures | H |
| Other 11 Sunday NFL games (kickoffs 13:30-20:25 UTC on 2026-10-18) | tickers and books already gone (settled) when I looked; their trades remain readable for 7 days | `get-tickers` empty, `get-book` "Invalid instrument" | H |
| US Senate control 2026, Democratic leg | bid 0.63 x 100, 0.62 x 11,555, 0.61 x 7,915; ask 0.68 x 19, 0.69 x 8,047, 0.70 x 3,056; 24h 10,199 contracts. Republican leg bid 0.37 / ask 0.41, 16,912 contracts. 5 c touch spread | `get-book`/`get-tickers`, ~03:13 UTC, fixtures | H |
| US House control 2026 | 2,527 contracts in 24h, R 0.09/0.13, D 0.89/0.92 | my snapshot fixture, ~03:14 UTC | H |
| Fed decision Oct 2026 / Dec 2026 | 165 / 202 contracts in 24h across all five outcomes; unchanged leg 0.86/0.89 for October | snapshot fixture | H |
| US recession by end 2026 | 692 contracts, Yes 0.05/0.12 | snapshot fixture | H |
| 2028 presidential winner (24 candidates) | 5,189 contracts in 24h total; best leg JD Vance 0.19/0.25 | snapshot fixture | H |
| Bitcoin all-time-high by 31 Dec 2026 | 62 contracts, 0.01/0.07 | snapshot fixture | H |
| Whole-venue 24h face notional, all binary options | about $6.25M, mostly sports (Politics about $72k, crypto ladders about $71k, Economics about $1.3k) at ~02:10 UTC on 2026-10-19 | sibling crawl in `og-og-com.md`; I did not re-crawl all 40k tickers (about 400 calls) | M (consistent with my sample points) |
| Universe size | 57,171 instruments incl. 40,235 binary options; 17,951 with a two-sided quote; 2,276 traded in the prior 24h | same sibling crawl, 2026-10-19 | M |
| Open interest / TVL | NOT FOUND (`oi` = "0" on sampled options; no OI endpoint) | tickers | H absence |

Reading: real, deep sports liquidity on marquee games (market-maker-sized quotes of hundreds of thousands of contracts per level), thin politics (a few thousand to tens of thousands of dollars of depth), near-empty macro and long-dated crypto. Trend not measurable from one snapshot. Third-party weekly-volume pages I tried (The Block data hub) do not list this venue.

---

## 10. Event overlap and shared liquidity

- **Categories overlapping other venues (H on OG's side, from `get-events`/`get-instruments`):**
  - Sports (largest): NFL (moneyline/spread/totals/player props per game), college football, tennis (`TENNIS-009x-261019-M` events live), plus NBA/NHL/MLB/soccer/F1 per OG help articles and sibling crawls. Overlaps Kalshi, Polymarket US and sportsbooks-as-signal.
  - Politics: US Senate and House control 2026, individual Senate races (NC, ME, TX, GA, OH, MI, NE, IA, AK, AL), governors, 2028 presidential winner, party and VP nominees. Overlaps Kalshi and Polymarket.
  - Macro: Fed decision (Sep/Oct/Dec 2026, Jan 2027), ECB rate decisions, jobs added, unemployment, inflation, US recession 2026. Overlaps Kalshi (and Polymarket Fed markets). Note some listed events (for example "Fed Decision in Sep 2026", "Jobs Added in Jul 2026") appear in the event list; check lifecycle state before treating them as live.
  - Crypto price: long-dated (BTC/ETH all-time-high, BTC end-of-2026, "above $200k") in `get-events`; short-dated price ladders exist per sibling crawl (M) with different instrument naming. Overlaps Kalshi and Polymarket.
  - Culture: Spotify, Emmys, Oscars 2027 Best Picture, TIME Person of the Year, Dancing With The Stars. Small overlap.
- **Shared liquidity (H):** "OG.com Markets allows trading directly or through intermediaries" and lists DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC and Wedbush Futures (https://og.com/regulatory). The Robinhood release says retail event-contract volume goes through OG.com's exchange and clearinghouse. OG's help centre does not say whether distributor orders rest in the same book as OG.com retail (NOT FOUND); the regulatory page and releases indicate a single exchange. Some distributors are multi-venue (DraftKings and FanDuel also route to CME and others, per the L tracker), so the shared part is only the OG-routed flow.
- **Scanner rule:** one `shared_with` group "NADEX/CDNA/OG": OG.com, Crypto.com App and Predict Pro, and exchange-backed contracts on DraftKings, FanDuel, Fanatics, Underdog, Robinhood and Wedbush. Never count two members of this group as independent arbitrage legs. OG vs Kalshi, OG vs Polymarket (global or US) are independent pairs.

---

## 11. Adapter notes and fixtures

1. **Discover:** page `get-events?since=0&limit=...&cursor=...` for event metadata, then `get-instruments?event_symbols=<up to 10>&limit=1000`; keep `inst_type == BINARY_OPTION`; ignore combos, brackets and perps.
2. **Price:** `get-tickers` in batches of 100 instrument names (bid `b`, ask `k`, 24h `v`); `get-book` (depth 5-10) only for candidate pairs; WebSocket `book.*`/`ticker.*` for the active set. Prices are dollar probabilities.
3. **State:** poll `get-instrument-lifecycle-states` and `get-instrument-market-status` with `since` for halts and closes; treat an empty ticker or `Invalid instrument` as settled or delisted. Do not rely on `tradable`.
4. **Match keys:** sports by `LEAGUE` + `EVENT_DATE` + `HOME_PARTICIPANT`/`AWAY_PARTICIPANT` (or `EXTERNAL_GAME_ID`) + `PREDICT_CONTRACT_TYPE` + `PREDICT_PERIOD_TYPE` + `PARTICIPANT`; politics/macro by `underlying_symbol` + `PARTICIPANT` + display name; crypto by parsed threshold and expiry.
5. **Cost model:** subtract section 6 fees; add distributor fees if executing through one; add the 3-second in-play delay for live games.
6. **Rules diff before pairing:** soccer 90-minute-only, overtime inclusion, cancellation pays VWAP, $0.50 draws, Lukka/exchange-sourced crypto prints, media-outlet source list for elections.
7. **Do not use:** `expiry_timestamp_ms` as event time, `oi`, `get-expired-settlement-price` for events, or the `data-api.crypto.com` feed.

Fixtures saved in `docs/research/fixtures/crypto-com-derivatives-north-america-cdna-and-og-og-com/` (all raw responses unless marked derived; each under 5 KB, 72 KB total; no personal data; scanned for e-mail-like strings and user paths, none):
`get-events_limit3_no-since_2026-10-19.json`, `get-instruments_nfl-moneyline-pair_2026-10-19.json`, `get-instruments_senate-control_2026-10-19.json`, `get-tickers_nfl-moneyline-pair_2026-10-19.json`, `get-tickers_senate-control_2026-10-19.json`, `get-book_nfl-moneyline_depth10_2026-10-19.json`, `get-book_senate-democratic_depth10_2026-10-19.json`, `get-trades_nfl-moneyline_count5_2026-10-19.json`, `get-trades_settled-instrument-still-served_count2_2026-10-19.json`, `get-instrument-lifecycle-states_settled-nfl-event_limit3_2026-10-19.json`, `get-instrument-market-status_settled-nfl-event_limit3_2026-10-19.json`, `get-expired-settlement-price_limit3_2026-10-19.json`, `error_get-tickers_no-filter_2026-10-19.json`, `error_get-book_settled-instrument_2026-10-19.json`, plus two derived files computed by me from the API (`derived_nfl_moneyline_slate_2026-10-19.json`, `derived_nonsports_snapshot_2026-10-19.json`).

---

## 12. NOT FOUND and open questions

- Any licence or terms attached to `api.crypto.com/fcm/v1/public` (searched: API docs, T&C, DMA terms, rulebook, og.com/legal). The EULA I found governs a different host.
- Open interest, any aggregate volume/OI statistic from OG itself, and a verified long-run volume trend (searched: tickers, docs, og.com about/news; third-party hubs did not list the venue).
- Final settlement value for event contracts via API (searched: `get-expired-settlement-price`, lifecycle, market-status, trades).
- Whether distributor orders (DraftKings, FanDuel, Robinhood...) rest in the same book as OG.com retail; whether complementary outcome instruments are matched jointly.
- Mesh-supported chains/tokens and any crypto withdrawal route (searched: Mesh FAQ).
- Exact fee timing (entry vs settlement) and exchange-level fee schedule; the nadex.com pricing pages returned 403 to scripted fetches.
- Date of the OG-Robinhood release and any post-2026-09 volume or outage news: WebSearch budget was exhausted, so no news search ran beyond fetching OG's own pages. CDNA executive-departure report not read.
- FCM API onboarding steps and timelines (private beta); FIX specification (not public).
- Not tested by me: WebSocket channels, `get-ticker-histories` with valid parameters, short-dated crypto ladder instruments.

Suspicious content: none found. The help pages contain Cloudflare e-mail obfuscation placeholders in a font licence line (harmless). No text addressed to AI agents was seen in any fetched page; `robots.txt` merely allows AI crawlers.

---

## Sources

1. https://og.com (home), https://og.com/regulatory, https://og.com/legal, https://og.com/about, https://og.com/company-news, https://og.com/rules, https://og.com/robots.txt (fetched 2026-10-19) (H/M as marked)
2. https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (raw HTML) (H)
3. https://crypto.com/us/company-news/cryptocom-launches-og-a-new-prediction-market-experience (WebFetch summary, 2026-02-03 release) (M, stale)
4. Rulebook 2026-10-13 (H, text extracted with PDFKit): https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf
5. NADEX Terms of Business bundle (H): https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf ; DMA terms (H): https://assets.ctfassets.net/8c2uto3zas3h/3XigCl6h5OSR0A2fuGy3hw/b1e831b3d931c670841d65a753deb73a/2026-06-NADEX-Direct-Market-Access-Terms-of-Business.pdf
6. Market Data EULA, July 2026 (H): https://data.crypto.com/static/eula.pdf?v=eula_v3
7. API docs (WebFetch summaries, M; shapes confirmed live): https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction , `.../rest-common-api-reference` , `.../rest/reference-and-market-data` , `.../rest/prediction-reference-data` , `.../rest/trading`
8. Live endpoints, unauthenticated GET, 2026-10-19 (H, fixtures): https://api.crypto.com/fcm/v1/public/{get-events, get-instruments, get-tickers, get-book, get-trades, get-instrument-lifecycle-states, get-instrument-market-status, get-expired-settlement-price, get-ticker-histories} ; https://api.crypto.com/dcm/v1/public/get-events ; https://data-api.crypto.com/api/v1/predictions/events (one call, not saved)
9. OG help centre (raw HTML, H): https://help.og.com/en/articles/{12958828-fees-limits, 13051724-general-settlement, 13051729-sports-settlement, 13051762-temporary-delay, 12752911-introducing-og-com-u-s, 15476413-introducing-og-com-outside-u-s, 15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions}
10. https://next.io/prediction-markets/og/ (WebFetch summary; sponsored) (L) ; https://mickbransfield.com/cftc-regulated-pms/ (WebFetch summary; header "current as of May 2026") (L) ; https://www.theblock.co/data/prediction-markets-and-betting (no relevant data) 
11. PayBox read-only `discover_plugins` and `discover_services` (no OG route)
12. Leads only, not primary: sibling notes in `docs/research/venues/` (`og-og-com.md`, `og-crypto-com-nadex.md`, `crypto-com-predict-pro.md` and the three others named above)
