# MEXC Prediction Markets (prediction.mexc.com) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public web pages, MEXC's public API docs and GitHub repos (via `gh api` raw reads), unauthenticated GETs to `prediction.mexc.com` (the public, logged-out web app's own data endpoints), `api.mexc.com` / `contract.mexc.com` ping and exchangeInfo, and Polymarket's public Gamma API for price comparison. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool, WebSocket session or browser automation. No third-party code run; the web app's JS bundles were downloaded and grepped as text only. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying. The web search budget ran out partway (shared limit), so the "VibeOdds" and "MEXC API" angles rely on fetched pages, not on further searching.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/mexc-prediction-markets/` (14 files, largest 48.6 KB). Third-party text is untrusted data; nothing in it was followed.

## 0. Verdict

- **Live, real volume, but not integrable and not an independent price source.** adapter_priority: **skip** (revisit triggers in section 12).
- Operator-run central limit order book inside the MEXC exchange stack (binary YES/NO shares, USDT, off-chain ledger). The UI disclaimer says "This service is provided by VibeOdds Solutions" (H), so MEXC appears to white-label a third-party provider; who the counterparty or market maker is is NOT documented.
- **Official API: none.** MEXC's Spot v3 and Futures API docs and change logs (through 2026-09-11) contain no prediction endpoints (H). The only machine-readable access is the web app's own undocumented JSON endpoints, which work unauthenticated for reads and use session-cookie auth for orders (H for reads; trading endpoints seen in JS only). MEXC's own article says "API trading is not supported" for its separate fixed-payout Event Futures product (H) and says nothing about an API for Prediction Markets.
- **Prices for the long-dated "Other" and sports-futures markets are a quote-follower of Polymarket.** In 12 same-question checks (7 long-dated "Other" markets, 5 sports-futures outcomes), MEXC's Yes mid equals Polymarket's `outcomePrices` mid to the 4th decimal in 9 and is within 0.3c in the other 3; MEXC just quotes a wider spread around it (H, fixture `mexc_vs_polymarket_quotes_2026-10-19.json`). So these markets add no independent information and no arbitrage against Polymarket by construction. The 5/15-minute BTC/ETH Up/Down rounds are NOT mirrored (own composite index; 1-8c gaps vs Polymarket in two same-window snapshots).
- Not reachable through PayBox in any trade-capable way (CEX custody, no on-chain order or token), banned for US/UK/Canada/Singapore and others, and ToS bars bots/crawlers without authorization.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| Public beta launched 2026-03-16 (MEXC announcement; Finance Magnates same day; CryptoBriefing 2026-03-16). One CryptoRank piece says 2025-03-21; contradicted by all others, ignore. | H | https://www.mexc.com/announcements/article/introducing-mexc-prediction-market-beta-17827791534246 ; https://www.financemagnates.com/cryptocurrency/exchange/mexc-brings-zero-fee-trading-to-prediction-markets/ |
| `https://prediction.mexc.com/prediction-markets` returns 307 -> `/prediction-markets/up-down`, HTTP 200, on 2026-10-19 | H | fixture-less (curl headers) |
| Public events endpoint on 2026-10-19 03:13Z: 4 active Up/Down rounds, 18 active "Other" events, 28 active sports events, 2 active Worlds 2026 events | H | fixtures `events_*_active_*.json` |
| 384 settled Up/Down rounds between 2026-10-18 15:00Z and 2026-10-19 03:10Z, plus 4 active | H | fixture `events_updown_all_status0_trimmed_2026-10-19.json` (trimmed from 41 KB) |
| MEXC announcement 2026-09-29 (Netherlands wind-down) lists "Prediction Markets: services unavailable" and "Event Futures: new orders unavailable" as separate products | H | https://www.mexc.com/announcements/article/mexc-to-wind-down-services-for-users-in-the-netherlands-17827791538881 |
| MEXC learn articles dated 2026-09-21 and 2026-10-14 describe the product as current and in "public beta" | H | sources 6-8 |

Naming trap: MEXC has two separate products. **Prediction Markets** (order book, Yes/No shares, `prediction.mexc.com`) includes the Up/Down 5m/15m rounds. **Event Futures / "Binary Event Futures"** (`/futures/prediction-futures`) is a fixed-payout "pick higher/lower, payout rate locked at order time, cannot close early, max 10 open positions, daily loss limit 10,000 USDT, API trading not supported" product (H, MEXC learn article 2026-10-14). Do not conflate them. The hint's "5/15-min BTC Up/Down added July 2026" is MEXC's own claim (H as a claim, date not independently confirmed); the Up/Down rounds I saw are order-book markets (they have bid/ask and `/depth`).

## 2. Market model

- **Binary Yes/No shares**, $1 per winning share, $0 otherwise (H, FAQ). Early exit by selling any time before settlement; "Cash Out" market-sell exists (H). Bonus-funded positions cannot be sold early and have a profit cap (H, UI strings).
- **Order book, not AMM/parimutuel.** Order types: limit (Good Till Canceled) and market (H, FAQ and UI strings). Market orders can be auto-cancelled ("Your market order has been canceled. Please use a limit order or try again.") (H, UI strings).
- **Each outcome has its own `symbolId`** (32-hex) and its own `/depth` book. The Yes and No books overlap but are not exact mirrors: in the sample market a Yes ask 0.051 x 178.01 shows up as a No bid 0.948 x 178.01 (sum 0.999, one tick off), and some levels exist on one side only (H, fixtures `depth_aliens_*`). An adapter must read both symbols, never derive No as 1 - Yes.
- **Multi-outcome events** (F1 champion, Ballon d'Or, 2028 election) are a set of Yes/No markets, one per candidate, grouped by `gn`; no merge/split or neg-risk mechanics documented (H for the shape, NOT FOUND for any conversion).
- **Sports match events** carry several market types: `moneyline` (regulation time, with a draw outcome), `spreads`, `totals`, `both_teams_to_score`, `soccer_exact_score`, `soccer_team_to_advance`; event classes `ct` 1 = sport, 2 = general, 3 = short cycle (H, client JS and fixture `events_sports_active_trimmed`). Combo ("parlay") order endpoints exist in JS (`order/place/byCombo`) (M, names only).
- **Up/Down rounds** (`ct` 3): assets BTC and ETH only today (UI SEO text also names SOL and DOGE, not listed) (H). Windows 5 min and 15 min on UTC boundaries; event name carries the "target" (start) price, e.g. `BTC 5min · $82,544.01 target`; fields `bsp` (start price) and `skp` (settle price). In the last ~12 h, every window's start price equals the previous window's settle price (380/380 consecutive window pairs: 47+47 for 15m, 143+143 for 5m BTC/ETH, i.e. consecutive index snapshots) (H).
- Tick 0.001 (`pmn: 3`), quantity decimals 2 (`qmn: 2`) (H, event detail). Order size per event detail: general events 5..20,000 shares, 5-min Up/Down 1..2,000 shares; MEXC's own tutorial says 1..10,000 shares per order and max net position 10,000 shares per outcome (H for both; they disagree, so read `omins`/`omaxs` per event). Further limits `rrms` 200,000 / `rums` 100,000 (10,000 for Up/Down) / `rtms` 500,000 have unknown meaning (L).

## 3. Chains and collateral

- **Collateral: USDT, off-chain.** Users move USDT from Spot to a separate "Prediction" wallet by internal transfer; no wallet, bridge or on-chain token (H, MEXC article and tutorial). Positions are ledger entries.
- **No documented API route to fund it.** The official Universal Transfer endpoint lists account types SPOT, FUTURES, OTC only (M: read through a page summariser, https://www.mexc.com/api-docs/spot-v3/wallet-endpoints/user-universal-transfer). The web app moves funds via `/api/platform/asset/transfer` (seen in JS).
- Deposits to the MEXC account itself (on-chain, many chains) were not researched; irrelevant because the venue is custodial.

## 4. Read API

- **Official: none.** Checked: Spot v3 docs introduction and change log (2022-02-11 to 2026-09-11), Futures update log, `https://www.mexc.com/mexc-api` page, and the `mexcdevelop` GitHub org (`apidocs`, `mexc-api-demo`, `mexc-api-postman`, `websocket-proto`; file trees searched, no prediction/event files; `websocket-proto` updated 2026-09-09 has public spot protobufs only) (H). Official Spot REST is `https://api.mexc.com` with HMAC-SHA256 `X-MEXC-APIKEY`, limits 300 weight/10 s per IP and 500 weight/10 s per UID (H, https://www.mexc.com/api-docs/spot-v3/introduction), but it does not cover prediction.
- **Unofficial public reads (the web app's own endpoints), unauthenticated, HTTP 200 JSON, envelope `{data, code, msg, timestamp}`** (H, fixtures). Base `https://prediction.mexc.com/api/platform/predict/market/web`. `www.mexc.com` itself returns Akamai "Access Denied" 403 to scripts; `prediction.mexc.com` did not. Rate limits: NOT FOUND; I made about 30 GETs at low rate and saw no 429.
  - `GET /event/type/tree` (1.1 KB): category tree with counts (Up/Down 5 Min and 15 Min; Sports -> Soccer, Basketball, Tennis, Hockey, Baseball, Cricket, Esports, Boxing/UFC, NFL, Other; Worlds; Other -> Global, Crypto, Finance, Economy, Tech, Culture, Iran, Commodities, Art). `toe`/`tce` look like ongoing/total event counts (L).
  - `GET /event/v2/events?level1TypeId=&level2TypeId=&level3TypeId=&status=` : events with outcomes inline (`ers[]`: `si` symbolId, `rn` name, `rf` 1 = Yes/Up and 2 = No/Down, `bp` best bid, `ap` best ask, `cf` result flag). `status` 0 = all, 1 = active, 2 = ended per client JS; `status=0` on level1 702 returned active (`s` 2) and settled (`s` 6) rounds spanning ~12 h (388 events, 41 KB). Events list is not paginated (sports active = 56 KB).
  - `GET /event/v2/detail?eventId=` : fee rates and limits (`mfr`, `tfr`, `sfr`, `mtr`, `omins`, `omaxs`, `rrms`, `rums`, `rtms`), plus start/settle price for Up/Down.
  - `GET /event/v2/results?eventId=` : outcome rows with `cf` result flag.
  - `GET /depth?symbolId=` : 15 levels per side, `{p, q}` strings, `version`.
  - `GET /batch/bookTicker?symbolIds=a,b` and `GET /batch/ticker?symbolIds=a,b` (ticker fields `c h l o` price, `a`/`ua` 24h amount, `q` 24h quantity, `r8`/`tzr` change).
  - Also seen in JS, not called: `/kline/query/web/price/histories`, `/event/rule/introduce?ruleId=`, `/event/teams`, `/event/index/price/range`, `/maintenance/status?scope=`, `/event/types`.
- **WebSocket (not connected):** `wss://prediction.mexc.com/predict/ws?platform=web`; public channels `predict@public.miniTickers.pb@UTC+8` and `predict@public.depth.scale.pb@<symbolId>@<scale>@30` (protobuf); private channels need a `wsToken` from a login session (H from JS, M that it works unauthenticated).
- Result semantics verified on data: `cf` is an event-level flag, 1 = Up won and 2 = Down won; rule "Up wins if settle price >= start price" held in 384/384 settled rounds, 0 violations, 0 exact ties (H, computed from `bsp`/`skp`; 194 Up, 190 Down).
- Stability: these endpoints are an internal UI contract (names like `symbolsV2`, `v2/events` imply versioning churn) and can change or be blocked at any time (M).

## 5. Trade path

- **No official programmatic trading.** The web app places orders with session-cookie auth via `POST /api/platform/predict/order/place/limit|market`, `.../orderCenter/web/order/place/limit|market|byCombo|byCoupon`, cancel via `.../order/cancel` (names H from JS, never called). No API key scope for prediction is documented; Spot API keys are for Spot (H).
- Using the cookie endpoints from a bot would mean scripting a logged-in session behind Akamai bot protection against ToS 17(f) (see section 9). Not recommended and not attempted.

## 6. PayBox reachability

**No.** There is no on-chain market, token, order signature or contract to propose a transaction to. The most PayBox could do is a plain USDT transfer to a user's own MEXC deposit address, which needs a MEXC account (custodial, KYC-optional, geo-restricted) and still leaves orders un-automatable. Not an adapter path.

## 7. Fees

- **Marketing:** "zero trading fees and zero settlement fees", a limited-time launch offer, no end date; "check the trading page for the current rate" (H, MEXC announcement and learn articles; the 2026-10-14 article says "The promotion may have ended").
- **What the data shows:** every market config carries `mfr` 0 (maker), `sfr` 0 (settlement) and **`tfr` 0.015 for general and sports events, 0.025 for Up/Down rounds** (H, fixtures; field names confirmed by the client mapping `takerFeeRate: T.tfr`, `settleFeeRate: T.sfr`). The order panel shows maker/taker rates when logged in (`FeeInfo`, H from JS). So either the zero-fee promotion is applied as an override at order time or the beta waiver has lapsed; I cannot tell without an account. Also the UI has `prediction_market_fee` and `prediction_market_settlement_fee` labels (H).
- **Fee base/formula (percent of notional vs of shares vs p(1-p)): NOT FOUND (searched: FAQ, tutorial, announcement, learn articles, JS strings).** For arbitrage math assume taker 1.5% (2.5% Up/Down) until proven otherwise.
- Bonus/coupon system: "Prediction Bonus" used for market orders only, capped profit, positions held to settlement (H, UI strings).

## 8. Resolution mechanism and dispute risk

- **Centralised, no oracle, no challenge window.** "MEXC settles each market once the outcome is confirmed, with no on-chain oracle challenge window" (H, MEXC article 2026-10-14). FAQ: settled "based on credible data sources"; each event's resolution criteria and settlement rules sit on its detail page (rule text endpoint `/event/rule/introduce`, not fetched because the `ruleId` is not in the public detail payload) (H/NOT FOUND).
- **Up/Down:** "Settlement prices are based on a composite index. See Market Rules for details on price sources and calculations." (H, UI string). Index composition and sampling window: NOT FOUND. Polymarket's equivalent rounds settle on Chainlink data, so a cross-venue Up/Down pair carries basis risk by design.
- **Abnormal outcomes are settled pro-rata, not refunded at cost:** reasons listed in the UI are ambiguous conditions, canceled, draw (no Yes/No winner), exceptional circumstances, force majeure, stopped early, void. Separately "Principal Refund... Due to risk control, only the principal will be refunded" (H, UI strings). The FAQ says a cancelled market is voided and refunded at purchase price, which does not match "pro-rata" (H, internal inconsistency). Pro-rata formula: NOT FOUND.
- Dispute risk for a cross-venue pair: high. MEXC has sole discretion (ToS 14, 13(h)) and may void or pro-rata where UMA/Kalshi resolve cleanly, and the reverse.

## 9. Geo, ToS, automation

- **Prohibited jurisdictions (ToS clause 1, "non-exclusive and subject to change"):** North Korea, Cuba, Sudan, Iran, Mainland China, Singapore, Malaysia, United States, United Kingdom, Hong Kong, Kazakhstan, Russian-controlled regions of Ukraine, Canada, sanctioned territories, FATF high-risk jurisdictions (H, https://www.mexc.com/terms). Prediction Markets also "unavailable in certain countries and regions for compliance reasons" (H, announcement), shows "not available in your country or region" and a US-specific block (H, UI strings), and is switched off in the Netherlands (H, 2026-09-29). MEXC's own article says it is not MiCA-authorised and cites a 2025-09 Dutch AFM warning (H as MEXC's statement, source cited there).
- **KYC:** not mandatory for the feature; unverified users may be restricted in some regions (H).
- **Automation:** ToS 17(f)(i) bans "deep linking, web crawlers, bots, spiders or other automatic devices" to access or copy content without authorization; 17(f)(vi) bans software that interferes with normal operation; 17(c) bans manipulation (wash trading, spoofing, layering); 19(i) lists "Gambling activities" among prohibited businesses without saying whether event contracts count (H, quote sparingly). There is an "API Services" product but no prediction terms, so no authorization for bots on this product exists in the documents I could read (H/NOT FOUND). My own unauthenticated GETs of the public data endpoints were low-volume reads of what a logged-out visitor's browser loads; a production poller would sit in the 17(f)(i) grey zone.
- Operator terms (VibeOdds Terms of Use and Risk Disclosure) could not be read: `https://www.vibeodds.io` returned a CloudFront geo-block 403 from this environment (not circumvented). Blocked.

## 10. Liquidity (all dated 2026-10-19 unless stated)

- **MEXC publishes no prediction volume or OI/TVL** (H, MEXC article 2026-10-14: monthly volume "Not published"). Press: no figures at launch (H, Finance Magnates 2026-03-16).
- **Event `v` field** (USDT per context; likely sums both outcome symbols, so possibly ~2x double-counted, M: market 52 `v` 29,370 equals the two symbol tickers' 24h `a` 14,685.8 + 14,684.2). Treat as an upper bound.
  - Up/Down, 384 settled rounds 2026-10-18 15:00Z to 2026-10-19 03:10Z: sum `v` 7.98M (ETH 15m 3.94M over 48 rounds, BTC 5m 2.45M over 144, ETH 5m 0.94M over 144, BTC 15m 0.65M over 48). Median per round: ETH 5m 6.6k, BTC 5m 11.3k, BTC 15m 13.8k, ETH 15m 23.3k; max 500k (one ETH 15m round). Extrapolates to about 16M per day (upper bound).
  - "Other" (18 active events): sum `v` 165k, largest 29.4k (aliens), 19.7k (Greenland), 19.0k (Jesus), 18.6k (Cuba). Lifetime cumulative.
  - Sports (28 active events): sum `v` 3.11M, dominated by F1 Drivers' Champion 1.04M, Ballon d'Or 2026 1.01M, F1 Constructors' 0.41M; soccer matches 50-59k each; most others under 10k. Same markets on Polymarket: F1 Drivers' Champion 204M, Ballon d'Or 53M (H, Gamma API), i.e. MEXC is about 0.5-2% of Polymarket on shared markets.
- **Book depth is thin and ladder-like:** market 52 Yes side, 15 levels per side holds about 4.5k asks / 5.7k bids shares, worth roughly 266 / 190 USDT; No side about 4.2k / 3.5k USDT (H, fixtures). Quantities of 400-500 shares at consecutive ticks look like an algorithmic market maker (M).
- **Shares liquidity with another venue? Pricing, yes; inventory, unknown.** The "Other" and sports-futures books are centred on Polymarket's mid (9 of 12 exact, 3 within 0.3c; see §0), which indicates a maker that hedges on or follows Polymarket (M). That makes them a derivative of Polymarket, not an independent leg. Up/Down rounds price off MEXC's own index and are independent of Polymarket's Chainlink-based rounds (2 snapshots: BTC 5m Up mid 0.43 vs Polymarket 0.505; BTC 15m 0.4655 vs 0.475, taken 43 s after the window opened; too few to call an edge).

## 11. Event overlap (where arbitrage could exist)

- Overlap with other venues: sports (soccer EPL/La Liga/Serie A/Ligue 1/Bundesliga/UCL, NBA, NFL, ATP/WTA, MLB, UFC, esports LoL/Dota/Valorant/CS2, F1), politics and geopolitics (2028 election, Iran, Cuba, Greenland), crypto price ladders (ETH/SOL "what price will X hit in 2026", BTC all-time-high), macro (Fed decision in October, US recession, Clarity Act), plus a handful of culture/novelty markets. Titles are the same strings as Polymarket's (H, e.g. "Will Jesus Christ return before 2027?").
- Because the long-dated books copy Polymarket's mid, a MEXC-vs-Polymarket "arb" there is just MEXC's spread (1-2.5c round trip) minus fees, i.e. negative. Possible stale-quote lag after a Polymarket move is untested (no tick history) and unexploitable without an automatable, non-custodial route.
- Crypto Up/Down 5m/15m has a genuine independent price, but the pair is basis-risky (different oracles) and MEXC cannot be traded programmatically.

## 12. Adapter priority

**skip.** No official API, no automatable trade path, custodial CEX with ToS against bots, geo-fenced (US/UK/CA/SG), centralised discretionary resolution, thin books, and the markets that overlap Polymarket are derived from it. A read-only signal adapter would add nothing beyond Polymarket for the long-dated markets and rests on an undocumented endpoint for Up/Down.

Revisit if: (1) MEXC publishes prediction endpoints in its API docs/change log with key-based trading; (2) an Up/Down lead-lag study (tick data, both venues) shows persistent lag worth more than the 2.5% taker fee; (3) the fee base and the Up/Down index composition get documented. Cheap optional probe if ever wanted: poll `GET /event/v2/events?level1TypeId=702&status=1` plus `/batch/bookTicker`, as a monitor only.

## 13. NOT FOUND / open questions

- Fee base/formula and whether the zero-fee promo is actually in force (searched: announcement, FAQ, tutorial, 5 learn articles, JS strings).
- Counterparty/market-maker identity and relation to VibeOdds Solutions (searched: UI strings, JS; vibeodds.io blocked by geo-block).
- Resolution rule text per event and the Up/Down composite index definition (the `/event/rule/introduce?ruleId=` call needs an id not present in public payloads).
- Pro-rata settlement formula; time from end to payout ("within a short period of time").
- Rate limits for the web endpoints; WebSocket behaviour logged-out.
- Meaning of `mtr`, `rrms`, `rums`, `rtms`, `omc`, `toe`, `tce`, `bm`, `tit`, `pds`.
- Any official MEXC API for prediction (searched: Spot v3 docs, Futures docs, change logs, mexc-api page, 4 GitHub repos).
- Early probes of guessed paths (`www.mexc.com/prediction`, `/api/prediction/market/list`, `futures.mexc.com/api/v1/prediction/list`, `api.mexc.com/api/v3/prediction/markets`) returned 403/404; I stopped guessing after that and used only paths found in the web app's own JS.

## 14. Sources (all read 2026-10-19)

1. MEXC, "Introducing MEXC Prediction Market Beta", 2026-03-16: https://www.mexc.com/announcements/article/introducing-mexc-prediction-market-beta-17827791534246 (H)
2. MEXC support, Prediction Markets FAQ: https://www.mexc.com/support/article/prediction-markets-faq-337306347514028032 (H)
3. MEXC learn, Prediction Market Tutorial: https://www.mexc.com/learn/article/17827791534120 (H)
4. MEXC learn, "What is MEXC Prediction Markets - a beginner's guide", 2026-09-21: https://www.mexc.com/learn/article/what-is-mexc-prediction-markets-a-beginners-guide/1 (H)
5. MEXC announcement, Netherlands wind-down, 2026-09-29: https://www.mexc.com/announcements/article/mexc-to-wind-down-services-for-users-in-the-netherlands-17827791538881 (H)
6. MEXC learn, "Best Prediction Market Platforms 2026", 2026-10-14 (fee/data verified 2026-10-08; MEXC-authored, promotional): https://www.mexc.com/learn/article/best-prediction-market-platforms-2026-crypto-vs-fiat-compared/1 (H as MEXC's claims)
7. MEXC learn, "Prediction Markets vs Futures...", 2026-10-14 (verified 2026-08-20): https://www.mexc.com/learn/article/prediction-markets-vs-futures-is-funding-eating-97-of-your-event-trade-/1 (H as MEXC's claims)
8. MEXC learn, "How to hedge with prediction markets before the next Fed decision", 2026-10-14 (verified 2026-08-19): https://www.mexc.com/learn/article/how-to-hedge-with-prediction-markets-before-the-next-fed-decision-hits-your-portfolio/1 (H as MEXC's claims; says the event catalog is smaller than Kalshi's or Polymarket's)
9. MEXC User Agreement: https://www.mexc.com/terms (H)
10. Finance Magnates, 2026-03-16: https://www.financemagnates.com/cryptocurrency/exchange/mexc-brings-zero-fee-trading-to-prediction-markets/ (M); CryptoBriefing 2026-03-16: https://cryptobriefing.com/mexc-launches-prediction-market/ (M); Yahoo/CCN mirror: https://finance.yahoo.com/news/mexc-launches-prediction-markets-polymarket-124823235.html (M)
11. MEXC API docs: https://www.mexc.com/api-docs/spot-v3/introduction , https://www.mexc.com/api-docs/spot-v3/change-log , https://www.mexc.com/api-docs/futures/update-log , https://www.mexc.com/mexc-api , https://www.mexc.com/api-docs/spot-v3/wallet-endpoints/user-universal-transfer (H/M, read via WebFetch; anonymous curl gets 403)
12. GitHub: https://github.com/mexcdevelop (`apidocs`, `mexc-api-demo`, `mexc-api-postman`, `websocket-proto`; trees read with `gh api`) (H)
13. Live data and client JS: https://prediction.mexc.com/prediction-markets/up-down and `https://prediction.mexc.com/api/platform/predict/market/web/...` endpoints listed in §4; static bundles under https://static.mocortech.com/production/mxc-web-premarket-v4/61/_next/static/chunks/ (read as text) (H)
14. Polymarket Gamma API (comparison only): https://gamma-api.polymarket.com/public-search and `/events?slug=` for the markets in the comparison fixture (H)

## 15. Fixtures

`docs/research/fixtures/mexc-prediction-markets/`: `event_type_tree`, `events_updown_active`, `events_updown_all_status0_trimmed`, `events_other_active`, `events_worlds_active`, `events_sports_active_trimmed`, `event_detail_general_52`, `event_detail_btc5min`, `depth_aliens_yes`, `depth_aliens_no`, `bookTicker_aliens`, `ticker_aliens`, `ui_strings_prediction_subset` (all `_2026-10-19.json`), and `mexc_vs_polymarket_quotes_2026-10-19.json` (my measured comparison, values copied from tool output).
