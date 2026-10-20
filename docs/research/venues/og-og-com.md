# OG (OG.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (data timestamps from the API: about 02:00-02:10 UTC). READ-ONLY: official site pages, help centre, rulebook and terms PDFs, API docs, unauthenticated GETs to the documented public market-data host, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment, WebSocket connection or browser automation. Third-party text was treated as untrusted data and nothing in it was followed. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (URL given), **M** = secondary or inferred, **L** = weak or stale (older than 6 months counts as possibly stale).

## 0. Verdict

- **Still live (H):** yes. Public order books, tickers and trades were updating on 2026-10-19; the home page lists live NFL markets; the help-centre fee article is dated 15 Sept 2026; Robinhood rollout of OG-backed contracts began 8 Sept 2026.
- **It is not a separate book from CDNA.** OG.com, Crypto.com | Derivatives North America (CDNA) and Nadex are brand names of one CFTC-registered exchange, North American Derivatives Exchange, Inc. (H, section 1). Treat OG = CDNA = Nadex as **one adapter**. It is also the matching engine behind several distributors (DraftKings, FanDuel, Fanatics, Robinhood, OG Broker, Wedbush; H, section 11), so OG is **not independent of its own distributors**, but it **is** independent of Kalshi and Polymarket.
- **Best use:** a no-auth, deep-book **price/signal leg** for sports, plus thinner politics, crypto-ladder and macro prices. Programmatic trading exists but is gated (FCM onboarding, KYC, private beta) and is not reachable by a wallet signature.
- **adapter_priority: P1.** Excellent free read API and real sports liquidity on busy days, but trading is gated, non-sports liquidity is thin, and open interest is not published.

## 1. Identity, operator, regulatory status

| Fact | Evidence | Tag |
|---|---|---|
| Rulebook: "North American Derivatives Exchange, Inc. ("NADEX") d/b/a OG.com Markets ("OG-M") and Crypto.com / Derivatives North America ("CDNA") (collectively ... the "Exchange")". Rulebook dated 2026-10-13 | https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf | H |
| NADEX "operates two brands for its CFTC-regulated business: CDNA and OG.com" | Direct Market Access Terms of Business, https://assets.ctfassets.net/8c2uto3zas3h/3XigCl6h5OSR0A2fuGy3hw/b1e831b3d931c670841d65a753deb73a/2026-06-NADEX-Direct-Market-Access-Terms-of-Business.pdf | H |
| NADEX is a CFTC-registered DCM and DCO; OG.com Markets is an affiliate of Foris DAX FCM LLC (d/b/a OG Broker), a CFTC-registered FCM | https://og.com/regulatory | H |
| Retail/international entity: Foris Capital MU Limited (Mauritius FSC licence GB22200345) "is connected to a CFTC-registered FCM, which in turn is connected to NADEX" and does business as OG.com | https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s ; https://og.com/rules (footer) | H |
| Spin-off: Citadel Securities invested in Crypto.com at a $20B valuation "which includes a standalone $5 billion valuation of OG.com through its strategic spin-off"; Robinhood takes equity in both | https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine | H |
| OG launched Feb 2026 as a standalone app (Cointelegraph, 2026-02-04). That article names Nick Lundgren as CEO and says OG is available only in the United States for now | https://cointelegraph.com/news/crypto-com-launches-new-prediction-market-platform-after-40x-growth | M (8+ months old; stale) |
| CEO: OG's own about page and the Robinhood release name Kris Marszalek "Founder & CEO of OG.com" (also Crypto.com CEO). This conflicts with the Feb 2026 CEO claim above; prefer OG's own pages | https://og.com/about ; the Robinhood release above | H (own pages), conflict flagged |

The task hint said "sources conflict on CDNA vs Nadex": resolved. They are the same legal entity (NADEX), trading as CDNA inside the Crypto.com app and as OG Markets on og.com.

## 2. Kind and market model

- **Kind:** CFTC-regulated centralised exchange (DCM + DCO), fiat-settled in USD, with retail front ends (og.com, apps) and B2B intermediaries. No blockchain component. (H)
- **Contract type:** event contracts, "Industry Event" sports and entertainment contracts, economic, election and crypto-price contracts. Rulebook classes them as swaps. Listed instrument types in the public API: `BINARY_OPTION` ($1 payout, 0.01 tick), `EVENT_COMBO` (parlays up to 20 legs, tick 0.001, sports only, no limit orders), `BRACKET_OPTION` (variable-payout "touch bracket", not a plain binary), `PERPETUAL_SWAP` (6 crypto perps, not prediction markets). (H: instruments crawl 2026-10-19; https://help.og.com/en/articles/13376265-combo)
- **Book:** central limit order book, prices $0.01-$0.99, whole contracts, limit (GTC) and "Quick" IOC orders for retail; API order types LIMIT / MARKET / STOP / STOP_LIMIT with GTC / IOC / FOK / GTD. (H: https://help.og.com/en/articles/13051655-order-types ; API doc private/create-order)
- **Outcome tokenisation:** no tokens. Each outcome is its own instrument that you buy (Yes) or sell (close). A two-way moneyline has two instruments (e.g. Cowboys and Packers) whose prices sum to about $1. A multi-outcome event (Fed decision, 2028 nominee) is a family of single-outcome instruments sharing `underlying_symbol`; there is no separate "No" instrument, selling Yes is the No side. Whether the engine matches complementary instruments jointly was not tested (open question). (H for structure from fixtures)
- **Categorical vs binary:** all tradable contracts are binary; categorical events are sets of binaries. No scalar markets besides the variable-payout bracket class. (H)
- **Identifiers:** `symbol` = `NX.F.OPT.{event_symbol}.O.{period_index}.{strike_index}[.{YYYYMMDD}]`, `underlying_symbol` = event (for example `NFL-00012-261018-M`, `ELECT-USSNTPRTY26`, `EC-00032-26`). Matching metadata is in `event_details.metaData`: `PREDICT_CATEGORY`, `SPORTS_GROUPING`, `LEAGUE`, `EVENT_DATE`, `HOME_PARTICIPANT`, `AWAY_PARTICIPANT`, `PARTICIPANT`, `PREDICT_CONTRACT_TYPE`, `PREDICT_PERIOD_TYPE`, `PREDICT_OUTCOME_TYPE`, `PREDICT_MARKET_ID`, `PREDICT_OUTCOME_ID`, `EXTERNAL_GAME_ID`. (H: fixtures)
- **Time-field trap (H):** `expiry_timestamp_ms` on sports instruments is a far-future placeholder (an NFL game on 2026-10-18 shows 1803942000000, about March 2027). Use `metaData.EVENT_DATE` for the event time.
- **Universe snapshot (H, my crawl 2026-10-19 02:00 UTC, see `derived_universe_summary_2026-10-19.json`):** 57,171 instruments = 40,235 binary options + 16,866 combos + 64 bracket + 6 perps. Binary options by event count: Sports 875 events (38,857 instruments), Politics 133, Culture 14, Economics 9, Crypto (long-dated) 5, Climate 1, plus 31 crypto/FX/index/commodity price ladders with no category. 17,951 binary instruments had a two-sided quote; only 2,276 traded in the last 24h.

## 3. Chains and collateral

- **No chain.** Collateral and settlement are **USD cash** held at the exchange/FCM. "Member funds on deposit with OG are held in segregated bank accounts at BMO Harris Bank and Fifth Third Bank" (https://og.com/legal) (H).
- **Funding routes (H):** ACH, wire, SWIFT, debit card, Apple/Google Pay, PayPal, Venmo, and **"Crypto-to-Cash" via Mesh** (link Coinbase/MetaMask/Phantom or scan a QR; non-USDC assets converted to USDC, then "instantly" converted to USD; no OG fee; "currently available for our US customers", New York excluded) (https://help.og.com/en/articles/15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions). Which chains/tokens Mesh accepts: NOT FOUND (searched help article; the page does not list them). Withdrawal back to crypto: NOT FOUND (withdrawals documented to the member's own bank account).
- **Conflict (H both):** the legacy Nadex "activities to avoid" page says "Nadex does not accept any funding in cryptocurrencies" and "third-party funding" is prohibited (https://www.nadex.com/rules/activities-to-avoid-on-nadex), while OG's newer help centre documents Mesh. Treat the help centre as current, but the account holder must fund from their own accounts.

## 4. Read API

- **Exists:** official, public, no key, for market data. Docs titled "Crypto.com GEN4 FCM US B2C API Documentation (Preview)", linked as **"APIs"** from og.com. (H)
- **Docs:** https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (market data: `/docs/api/rest/reference-and-market-data`, `/docs/api/rest/prediction-reference-data`). Docs note: "This is under private beta"; "Public market-data endpoints can be explored before onboarding." Change log: 2026-03-21 initial version, 2026-07-17 "Card Top Up API". (H)
- **Base URLs (H, Common API Reference):** REST production `https://api.crypto.com/fcm/v1/{method}`, UAT `https://uat-api.3ona.co/fcm/v1/{method}`; WebSocket market data `wss://stream.crypto.com/fcm/v1/market`, user `wss://stream.crypto.com/fcm/v1/user` (UAT hosts `uat-stream.3ona.co`). **Note:** the introduction says "all endpoints use POST", but every public method is documented and works as **GET with query parameters** (confirmed live). Private methods are POST.
- **Public endpoints (all GET, live-confirmed unless noted):**

| Endpoint | Notes (H) |
|---|---|
| `/public/get-events` | `limit` (default 100), `since` (ms), `cursor`, filters `SPORTS_GROUPING`, `LEAGUE`, `PREDICT_CATEGORY`, `PREDICT_EVENT_TYPE`, `event_date`, `event_end_date`. **Without `since` the events came back with empty `metaData` and `event_date: null`**; the instruments carry the real metadata. Ordered by recent update. |
| `/public/get-instruments` | `limit` (max 1000), `since` (ns, `0` = from start, ascending), `cursor` from `next_cursor`, filters `inst_type`, `event_symbols` (<=10), `symbols` (<=10), `PREDICT_CONTRACT_TYPE`, `is_combo`. Full crawl = 58 pages of 1000. |
| `/public/get-tickers` | `instrument_name` **required**, comma list, max 100. A call with no filter returns `400 {"code":40004,"message":"instrument_name or instrument_names is required"}` although the doc says "all or particular". Fields `i,h,l,a,c,b,k,v,vv,oi,t`; best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`, ms timestamp `t`. |
| `/public/get-book` | `instrument_name`, `depth` (<=50). Returns `bids`/`asks` as **two-element `[price, quantity]`** arrays (the doc says three with NumOrders; observed two) plus `t` (ms). |
| `/public/get-trades` | `instrument_name`, `count` (<=150), `start_ts`/`end_ts` (ns recommended), 7-day window. Sides came back **lowercase** (`buy`/`sell`) although the doc lists uppercase. Fields `d,t,tn,q,p,s,i,m`. |
| `/public/get-instrument-lifecycle-states`, `/public/get-instrument-market-status` | cursor-paged state-change feeds (Draft/Active/Suspended/Closed; OPEN/CLOSED) with `event_symbol` filter. Use for open/halt detection. |
| `/public/get-expired-settlement-price`, `/public/get-ticker-histories` | documented; **not tested** by me (no expired symbol available because settled instruments disappear from `get-instruments`). Resolution outcome retrieval is therefore not confirmed (see section 8). |

- **Conventions (H):** all numbers are strings; instrument/event `last_updated_time` is nanoseconds, ticker `t` and trade `t` are milliseconds; response envelope `{id, method, code, result}` with `code` 0 = success.
- **WebSocket (H doc, untested by me):** public market channels `book.{instrument_name}.{depth}` (10 or 50 levels), `ticker.{instrument_name}`, `trade.{instrument_name}`. Use for the watched set only.
- **Rate limits (H doc):** public data 100 requests/second per method per IP. Private: create/cancel 15 per 100 ms per key, order detail 30 per 100 ms, `get-trades` and `get-order-history` 1/s, others 3 per 100 ms. WebSocket: user 150/s, market 100/s. I made about 460 GETs at roughly 5-10 req/s without throttling. The host sits behind Cloudflare; no geo-block was observed from the research host.
- **Open interest: NOT FOUND (searched: get-tickers `oi`, docs).** `oi` is `"0"` for every binary and bracket option; only the 6 perps populate it. No public OI endpoint exists. (H absence)
- **FIX:** OG's about page advertises "REST, WebSocket and FIX" for "pro trading access" (H). FIX document pack: NOT FOUND (not public).

## 5. Fixtures (all raw public-API responses unless marked)

Saved under `docs/research/fixtures/og-og-com/` (each well under 50 KB):
`get-events_limit3.json`, `get-instruments_nfl-moneyline.json`, `get-instruments_senate-control.json`, `get-tickers_nfl-moneyline.json`, `get-tickers_senate-control.json`, `get-book_nfl-moneyline_depth10.json`, `get-book_senate-democratic_depth5.json`, `get-trades_nfl-moneyline_count5.json`, `get-instrument-lifecycle-states_limit3.json`, `get-instrument-market-status_limit3.json`, and `derived_universe_summary_2026-10-19.json` (my own computation from the crawl, not an API response).
A sibling note (`og-crypto-com-nadex.md`) holds a larger fixture set for the same exchange.

## 6. Trade path

- **Programmatic trading exists:** private REST/WebSocket methods `private/create-order` (LIMIT/MARKET/STOP/STOP_LIMIT; GTC/IOC/FOK/GTD; `client_oid` <=36 chars; asynchronous, confirmed on the `user.order` WebSocket subscription), `amend-order`, `cancel-order`, `cancel-all-orders`, `close-position`, `get-open-orders`, `get-order-detail`, `get-order-history`, `get-trades`, `get-transactions`, `get-positions`. (H: https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest/trading)
- **Auth:** API key + secret, **HMAC-SHA256** over `method + id + api_key + sorted(param key+value) + nonce`, hex digest sent as `sig`; optional read-only keys and IP allow-lists. (H: Common API Reference)
- **Gating (H):** "To access retail account and trading APIs, you must have an approved FCM account ... complete FCM onboarding through Crypto.com Exchange. This requirement also applies if you currently use OG.com or the Crypto.com Main App." The docs are "private beta". The terms also require, for API connections, passing exchange conformance tests and receiving written confirmation before live use (DMA Terms of Business / retail T&C bundle https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf).
- **Wallet / PayBox reachability: no for trading.** There is no on-chain order, no EIP-712 or Solana signature scheme, no transaction proposal. A PayBox EVM wallet could at most **fund** the human account owner's KYC'd US account through the Mesh crypto-to-cash route (US only, non-NY) and nothing else. An agent could place orders only with a separately issued HMAC key held in a secret store behind a relay. PayBox `discover_plugins` ("Crypto.com OG prediction markets") returned no plugin and `discover_services` returned only third-party odds-data services (first page, none for OG). The read adapter needs no PayBox at all.
- **In-play delay (H):** every order placed after an event has started is held for a **3-second "Temporary Delay"** (default; exchange may change it) until the event concludes; for season-long futures it starts at end of the regular season. This weakens latency arbitrage on live sports. (https://help.og.com/en/articles/13051762-temporary-delay)

## 7. Fees

- **US customers, most markets (sports, politics, economics, culture):** taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)` (C = contracts, P = price in dollars). Orders that fill immediately, including all market/Quick orders, pay taker; resting orders pay maker. Same formula to close a position before expiry. **Waived** if the position settles in the money; no fee when it settles out of the money. Worked numbers: at P = 0.50 the taker fee is 1.75 c per contract (3.5% of price) and the maker fee 0.44 c; at P = 0.10 the taker fee is 0.63 c. (H: https://help.og.com/en/articles/12958828-fees-limits, dated 15 Sept 2026)
- **Crypto, FX, commodities, equity-index ladders:** flat $0.02 per contract to open and to close; settlement waived. **Customers outside the US: flat $0.02 per contract on all markets.** (H)
- **Position limit:** 2,500,000 contracts per event for $1 contracts. (H)
- **Not found:** rounding rules, volume tiers, market-maker rebates and the exchange-level fee schedule for FCM/DMA participants (the Nadex pricing page and fee-schedule PDF returned 403 to scripted fetch). Distributor front ends (DraftKings, FanDuel, Robinhood and others) may charge their own fees; take fees per front end. (NOT FOUND, searched: help centre, nadex.com/pricing, og.com/trading-operations)
- Another repo note quotes a CDNA/DKEx fee-by-price-band from a secondary source; it does not match OG's own formula above. Prefer OG's published formula for OG.com retail. (M)

## 8. Resolution and dispute risk

- **Resolver:** the exchange itself, from "the result issued by the relevant news or market data provider". After-the-fact "disqualifications, revisions, or amendments" by the provider "do not affect settlement". (H: https://help.og.com/en/articles/13051724-general-settlement)
- **Self-correction power (H):** "The CDNA Exchange reserves the right to adjust any settlement if it was made in error", with customer balances credited or debited accordingly; if no verifiable outcome exists, settlement is at the exchange's "reasonable discretion". No trader appeal path is described (NOT FOUND). Member disputes go to arbitration under rulebook chapter 10; the rulebook's liability clause sends any non-arbitrable dispute to Cook County, Illinois under Illinois law.
- **Cancelled events are not binary (H):** postponed, cancelled or incomplete beyond 48 hours (tennis 14 days) is a "Canceled Event"; holders on the specified outcome receive the one-week VWAP of the last-traded price, the other side receives $1 minus that, and open-trade fees are refunded. A draw with no tie outcome listed pays $0.50 to each side with no fee refund. Material rule changes after listing can also trigger cancellation. This differs from Kalshi/Polymarket handling and is **basis risk for any cross-venue pair**.
- **Sport-specific rules (H: https://help.og.com/en/articles/13051729-sports-settlement):** overtime counts in American football, basketball, hockey (shootout winner gets +1 goal for totals) and baseball extra innings; soccer is 90 minutes plus stoppage only unless stated; tennis retirement or disqualification settles for the advancing player; F5 baseball ties pay $0.50.
- **Politics (H, rulebook "Election Outcome Event Contract"):** Source Agencies are a list of media outlets "as determined by the Exchange"; expiry 10:00 AM ET the day after; settlement no later than the next day.
- **Crypto price ladders (H, rulebook "Crypto Price Contracts"):** underlying is bid/ask midpoint prices reported by Lukka, Inc.; the **Source Agency is the Exchange itself**. Self-referential source, so timestamp and print differences against Kalshi/Polymarket crypto ladders are possible.
- Resolved outcome via API: the settled instruments disappear from `get-instruments`; `get-expired-settlement-price` is documented but untested, so reliable resolution polling is an open item.

## 9. Geography, ToS, automation

- **Availability (H, help centre):** US customers in all states "however, certain event contracts ... may be unavailable in certain U.S. states" (https://help.og.com/en/articles/12752911-introducing-og-com-u-s). **Also offered outside the US** through Foris Capital MU Limited ("currently available only in certain locations due to regulatory requirements"; separate "Outside U.S." onboarding with government ID and selfie; flat $0.02 fee) (https://help.og.com/en/articles/15476413-introducing-og-com-outside-u-s). So the task hint "US only" is stale (Cointelegraph, Feb 2026). A third-party sponsored page lists NY and AZ as blocked (https://next.io/prediction-markets/og/, L: sponsored, undated). Nevada-style sports restrictions: not verified.
- **KYC required** for every account. **One account per person, "All accounts are self-directed", "No third-party management is permitted", funding only from the member's own bank account** (https://www.nadex.com/rules/activities-to-avoid-on-nadex, H, legacy Nadex page). An agent operating the account owner's own account with the owner's own key is a different thing from third-party management, but the line is a compliance question for the owner (M).
- **Automation (H, short quotes):** API use requires conformance testing and written exchange confirmation before live production use; the exchange may "suspend, condition or revoke" access; excessive messaging controls are required for automated order flow (rulebook, reported by a sibling note, M). Insiders (including source-agency staff) are barred from trading related contracts. No ToS clause about reading the public market-data endpoints was found (NOT FOUND, searched: API docs, T&C PDF, DMA terms, og.com/robots.txt). `og.com/robots.txt` disallows only account pages and explicitly allows AI crawlers; it does not govern `api.crypto.com`.
- **Account performance:** "accounts are never limited or restricted based on trading performance" (https://help.og.com/en/articles/15261541-og-com-vs-sportsbooks-the-differences) (H, marketing claim).

## 10. Liquidity (all with date)

| Metric | Value | Source | Tag |
|---|---|---|---|
| 24h face notional, all binary options | about $6.25M (`vv` summed over 40,235 instruments) at 2026-10-19 ~02:10 UTC, an NFL Sunday evening, so a high day for sports | my crawl of `get-tickers` | H (point-in-time) |
| Premium-paid proxy (sum of `v` x last price) | about $4.2M in the same 24h | my computation | M |
| By category, 24h face notional | Sports about $6.10M; Politics about $72k; crypto ladders about $71k; Culture about $7k; Economics about $1.3k; Climate about $0.9k | my crawl | H |
| Top single market | Cowboys @ Packers moneyline (Cowboys leg) 892,638 contracts in 24h; book at 02:10 UTC held about 40k bid and 308k ask at the touch within a 0.16/0.17 spread, and 10 levels of depth up to 0.26 | fixtures `get-tickers_nfl-moneyline.json`, `get-book_nfl-moneyline_depth10.json` | H |
| Politics example | US Senate control 2026, Democratic leg: bid 0.63 (100), 0.62 (11,555), 0.61 (7,915); ask 0.68 (13), 0.69 (8,125); 5 c touch spread; 24h volume 10,138 contracts | fixtures `get-book_senate-democratic_depth5.json`, `get-tickers_senate-control.json` | H |
| Median touch spread, instruments with over 1,000 contracts traded | 2 c | my crawl | H |
| Open interest / TVL | NOT FOUND (`oi` is 0 for all options; no OI endpoint) | docs and tickers | H (absence) |
| Cumulative volume shown on og.com | the home page shows per-event cumulative volume (unit not stated) | https://og.com | M |
| Third-party weekly notional (The Block hub, week to 2026-10-12, about $230M for `nadex`) | cited in a sibling note; I did not re-open it; metric undefined | sibling note | L |

Interpretation: sports liquidity is real but concentrated in marquee NFL, college football, NBA, big soccer games; politics and macro are thin (a few thousand to tens of thousands of dollars of depth); crypto ladders have many strikes and little volume. Trend is not measurable from a single snapshot.

## 11. Overlap and shared liquidity

- **Event categories that overlap other venues (H on OG side, listings from the crawl):**
  - Sports: NFL (4,881 listed instruments), college football (6,805), NBA, NHL, MLB, major soccer leagues (EPL, UCL, UEL, MLS, La Liga, Serie A, Bundesliga, Ligue 1, Liga MX, Brasileirao), ATP/WTA tennis, F1. Overlaps Kalshi, Polymarket US and sportsbooks-as-signal.
  - Politics: US Senate and House control 2026, state Senate and governor races, 2028 presidential and nominee markets. Overlaps Kalshi and Polymarket.
  - Crypto price: BTC, ETH, XRP, SOL and others, 5-minute to weekly ladders (display names like "BITCOIN >82397.39 (10:10PM)"; parse threshold and expiry from `display_name`). Overlaps Kalshi and Polymarket short-dated crypto.
  - Macro: Fed decision (Oct and Dec 2026), ECB, US recession 2026. Overlaps Kalshi and Polymarket.
  - Culture: Oscars, Spotify top artist, TIME Person of the Year, Dancing With The Stars. Smaller overlap.
- **Shared liquidity (H):** "OG.com Markets allows trading directly or through intermediaries, including DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, LLC, Wedbush Futures" (https://og.com/regulatory). Robinhood "will route retail event contract volume through OG.com's underlying ... derivatives exchange" (Robinhood release above). FanDuel markets are described in OG's press as coming through OG Prediction Markets (OG company-news; headline seen in the page link list, body not read: M). OG's help centre does not say whether partner orders rest in the same book as OG.com retail (NOT FOUND); the regulatory page and Robinhood release indicate a single exchange venue (M). **Scanner rule: one `shared_with` group for OG.com, CDNA/Nadex, and the exchange-backed contracts on DraftKings, FanDuel, Fanatics, Robinhood, Underdog and Wedbush; never count two of them as independent legs.**

## 12. Adapter notes (read side)

1. Discover: page `get-instruments?since=<last_ns>&limit=1000` plus `cursor`; filter `inst_type=BINARY_OPTION`; drop `EVENT_COMBO`, `BRACKET_OPTION`, `PERPETUAL_SWAP`.
2. Price: `get-tickers` in batches of 100 (about 400 calls for the full universe, under a minute at modest rates), then `get-book` (depth 5-10) only for candidates and WebSocket for the active set.
3. State: poll `get-instrument-market-status` and `get-instrument-lifecycle-states` with `since` to detect halts, suspensions and the 3-second in-play delay window.
4. Match key: sports by `LEAGUE` + `EVENT_DATE` + `HOME_PARTICIPANT`/`AWAY_PARTICIPANT` (or `EXTERNAL_GAME_ID`) + `PREDICT_CONTRACT_TYPE` + `PREDICT_PERIOD_TYPE` + `PARTICIPANT`; politics by `underlying_symbol` plus `PARTICIPANT`; crypto by parsed threshold and expiry time.
5. Treat every price as a dollar probability; fee-adjust with the section 7 formula; do not use `expiry_timestamp_ms` for event time; do not use `oi`.
6. Rules diff before any pairing: soccer 90-minute-only, overtime inclusion, cancellation-pays-VWAP, $0.50 draws, exchange-as-source for crypto.

## 13. Not found / open questions

- Open interest and a public settled-outcome feed (`get-expired-settlement-price` untested). (searched: tickers, docs)
- Fee schedule PDF, tiers, maker rebates (nadex.com/pricing returned 403). (searched: help centre, site pages)
- Whether partner (Robinhood, DraftKings, FanDuel) orders rest in the same book as retail OG.com; whether complementary outcome instruments are matched jointly.
- Mesh chain and token support; crypto withdrawals.
- The Sportico report of CDNA executive departures (cited in a web search result) could not be read: the page redirects to a pay-per-crawl gateway, which I did not follow. Counterparty and key-person risk at CDNA is therefore M at best. Only one extended web search ran before the session search budget was exhausted.
- The CEO conflict (Lundgren vs Marszalek) and the "US only" claim rest on a Feb 2026 article; OG's own pages are newer and are used here.

## Sources

1. https://og.com (home, live markets, nav; fetched 2026-10-19) (H)
2. https://og.com/about , https://og.com/regulatory , https://og.com/legal , https://og.com/rules , https://og.com/markets-products , https://og.com/robots.txt , https://og.com/sitemap.xml (H)
3. https://og.com/company-news/robinhood-selects-ogcom-as-infrastructure-partner-for-prediction-markets-platform-holding-equity-stake-in-exchange-engine (H)
4. Rulebook 2026-10-13: https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (H; read from a text extraction of this same PDF, file size matched)
5. Terms bundle: https://assets.ctfassets.net/8c2uto3zas3h/2OdscIu6d6dCMMm4lvj2au/fbc9a8ea85ee3b46335c9390ef34e5c9/V_Final-CDNA-TOB-7.21.26.pdf and DMA terms https://assets.ctfassets.net/8c2uto3zas3h/3XigCl6h5OSR0A2fuGy3hw/b1e831b3d931c670841d65a753deb73a/2026-06-NADEX-Direct-Market-Access-Terms-of-Business.pdf (H)
6. API docs: https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction , `.../rest-common-api-reference` , `.../rest/reference-and-market-data` , `.../rest/prediction-reference-data` , `.../rest/public-get-{events,instruments,tickers,book,trades,expired-settlement-price,instrument-lifecycle-states,instrument-market-status}` , `.../rest/private-create-order` , `.../rest-change-log` (H)
7. Live endpoints (unauthenticated GET, 2026-10-19): https://api.crypto.com/fcm/v1/public/{get-events,get-instruments,get-tickers,get-book,get-trades,get-instrument-lifecycle-states,get-instrument-market-status} (H, fixtures)
8. Help centre: https://help.og.com/en/articles/{12958828-fees-limits, 13051647-market-availability, 13051655-order-types, 13051724-general-settlement, 13051729-sports-settlement, 13051762-temporary-delay, 13051766-trading-hours-u-s, 13376265-combo, 14057582-market-liquidity, 15261541-og-com-vs-sportsbooks-the-differences, 15300474-crypto-to-cash-deposits-powered-by-mesh-frequently-asked-questions, 15434046-onboarding-and-verification-outside-u-s, 15476413-introducing-og-com-outside-u-s, 12752911-introducing-og-com-u-s, 13428988-why-can-t-i-access-og-com} (H)
9. https://www.nadex.com/rules/activities-to-avoid-on-nadex (H via WebFetch; scripted fetch returns 403; legacy Nadex content)
10. https://cointelegraph.com/news/crypto-com-launches-new-prediction-market-platform-after-40x-growth (M, 2026-02-04, stale) ; https://next.io/prediction-markets/og/ (L, sponsored) ; web-search result list (Sportico, KuCoin news flash, TradingView) used only as leads (M/L)
11. PayBox read-only `discover_plugins` / `discover_services` (no OG route found)
12. Sibling repo note for cross-check, not a primary source: `docs/research/venues/og-crypto-com-nadex.md` (same exchange; The Block weekly figure and rulebook Rule 5 excerpt taken from it only as M/L)
