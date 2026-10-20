# Crypto.com Predict Pro - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (probes ran about 01:15-01:40 UTC). READ-ONLY: official Crypto.com pages and press release, the Crypto.com help centre, the Exchange API marketing page and its public JS bundles (downloaded as text, never executed), the public Predictions market-data site and its keyless REST API (about 35 unauthenticated GETs in total across the data host, docs and API), five unauthenticated GETs to the already-documented OG/CDNA FCM public market-data host, two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. Third-party text was treated as untrusted data; nothing in it was followed. WebSearch ran once (the shared session search budget was then exhausted), so secondary-press corroboration is thin; the primary sources below carry the claims.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/crypto-com-predict-pro/` (listed at the end).

Companion note: `docs/research/venues/og-crypto-com-nadex.md` is the full spec of the exchange underneath (OG.com Markets / CDNA / Nadex). This note only adds what is specific to Predict Pro and to the separate Crypto.com Predictions data API, and does not repeat the exchange's liquidity survey.

---

## 0. Bottom line

1. **Predict Pro is a broker front end, not a venue.** It is Crypto.com Exchange's pro interface to the CFTC-regulated order book of OG.com Markets (a brand of North American Derivatives Exchange, Inc., doing business as Crypto.com | Derivatives North America, CDNA). It is "offered by" Foris DAX, Inc. as an NFA Introducing Broker, connected to Foris DAX FCM LLC (d/b/a OG.com Broker) as clearing FCM (H, https://crypto.com/en/company-news/cryptocom-launches-predict-pro-the-exchange-grade-way-to-trade-real-world-events, read through the WebFetch summariser).
2. **No independent liquidity.** Same exchange, same matching engine, same contracts as OG.com, the Crypto.com App prediction product, and the other CDNA distributors. An arbitrage scanner must count it once, as the OG/CDNA leg.
3. **Two read feeds exist for these contracts; neither is a Predict Pro API.**
   - The exchange's own keyless public FCM market-data REST (`api.crypto.com/fcm/v1/public/*`: events, instruments, tickers, depth up to 50, trades, history). Documented in the companion note. This is the better feed.
   - A **new** keyless "Crypto.com Predictions" market-data REST at `https://data-api.crypto.com/api/v1/predictions/*` (found this session; not in the companion note). It is top-of-book only (no depth, no volume, no trades) and its EULA forbids exactly what an aggregator does (section 5).
4. **Trading is not reachable from a PayBox wallet** (USD account, KYC, FCM onboarding, HMAC-signed REST/FIX that is still "private beta" or "coming soon").
5. **adapter_priority = skip** for Predict Pro as its own adapter (duplicate liquidity). Fold it into the OG/CDNA adapter as one "execution front end" tag; do not build a second price feed from it.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Crypto.com press release "Crypto.com Launches Predict Pro: The Exchange-Grade Way to Trade Real-World Events", issued by Crypto.com Exchange, dated October 15, 2026 | live product announcement; spokesperson named is the Managing Director of Crypto.com Exchange | H (wf) |
| Help centre collection "Predict Pro Trading", 7 articles (Overview, Getting Started, Markets and Order Types, Opening and Closing a Position, Payouts and Settlement, Combos, Trading Hours/Fees/History), https://help.crypto.com/en/collections/19761087-predict-pro-trading | HTTP 200, present-tense instructions ("Go to Predict Pro on the Crypto.com Exchange and follow the on-screen instructions") | H |
| Exchange web-app bundle deployment stamp `VITE_DEPLOYED_TIME` 2026-10-16T02:47:27Z, with FCM API / stream hosts and prediction components (`ActivatePredictionsButton`, `usePredictionOnboardingStatus`, `contractDetailApi`) | the app was redeployed the day after launch | H (static read) |
| Press echoes (The Defiant, KuCoin flash, Crypto Economy, Cryptotimes, others) dated 2026-10-15 | consistent launch date | M |
| Underlying public data | `api.crypto.com/fcm/v1/public/get-tickers` last-trade timestamps within hours of my request; Predictions API returns `status: active` events with match dates up to 2026-10-25 | H |

**Verdict: still_live = true, launched 2026-10-15, four days old at research time.** No fee/volume/usage statistics exist yet.

Discovery-hint check: the hint says Predict Pro "possibly shares liquidity with OG.com Markets (NADEX / CDNA)". Confirmed: OG.com Markets, NADEX and CDNA are one entity (see companion note section 1). The hint's "[H] exposes OG.com Markets order book" is confirmed by the press release wording "Access to the CFTC-regulated order book". Discrepancy: one outlet (KuCoin flash) says combos are 2 to 6 legs; Crypto.com's own release and help centre say 2 to 20 (H). Treat the 2-6 figure as a press error (L).

---

## 2. Kind and market model

- **Kind:** broker / front end (introducing broker plus FCM) on a regulated exchange. Crypto.com's own help text: "Predict Pro event contracts offered by North American Derivatives Exchange, Inc. (Nadex), a CFTC-regulated exchange doing business as Crypto.com | Derivatives North America (CDNA)" (H, help Overview).
- **Market model:** central limit order book, fully collateralised binary event contracts priced $0 to $1, $1.00 payout, Yes/No (H, help "Markets and Order Types", "Payouts"). Not AMM, not parimutuel, no tokens.
- **Outcome representation (H, help "Opening and Closing a Position"):** "Every market has one underlying instrument: Yes. A No position is a short Yes position", and the No price is `1.00 - Yes price`. Note this differs from the exchange's public feed, which lists a separate instrument per outcome (companion note section 2); in a two-way game both outcome instruments exist there. Buy always opens/increases/flips; Sell only reduces an existing position.
- **Contract types listed (H, help):** Moneyline, Spread, Total (Over/Under), Player Prop, Range, Leagues (season-long / tournament). Categories: Sports, Crypto, Commodities, Forex, Indices, Economics, Politics, Culture, Climate.
- **Combos (H, help "Combos"):** 2 to 20 legs, sports markets only, same-game combos "for select leagues", live legs "where available"; a "firm 30-second quote is automatically generated as you build your Combo"; any losing leg loses the whole combo; combos can only be closed at market. These correspond to the `EVENT_COMBO` instruments (15.9k) in the exchange feed (companion note). Skip them in a single-leg scanner.
- **Scalar markets:** none (ranges are bucketed binaries).
- **Tick / min size:** shown per contract in the UI Info panel; not published in the help centre (NOT FOUND; the exchange feed gives `price_tick_size` 0.01, `quantity_decimals` 0, companion note).

## 3. Chains and collateral

- **No chain.** Collateral is USD in the user's **Derivatives account** at the FCM (H, help "Getting Started"). "Predictions, futures, and perpetuals share one Derivatives balance." Deposits and withdrawals go through the **Spot** account: transfer USD Spot -> Derivatives to trade, back to Spot to withdraw. Sub-accounts are supported (master account).
- Crypto can reach the Spot account (Crypto.com Exchange deposit addresses) and be sold for USD before transfer; specific chains/tokens for that step: NOT FOUND in the Predict Pro articles (searched all 7). Positions "do not require collateral and are fully funded" (H, help).

---

## 4. Read API

**Predict Pro itself has no documented API.** NOT FOUND (searched: the 7 help articles, the press release, crypto.com/en/prediction, crypto.com/en/prediction/partners). The relevant APIs are the exchange's.

### 4a. Exchange API marketing page (H, https://crypto.com/exchange-pro/en-US/api, fetched 2026-10-19)

Coverage table on that page: **DCM (Predictions): REST "Coming soon", WebSocket "Coming soon", FIX "Available". FCM (Predictions): REST "Coming soon", WebSocket "Coming soon", FIX "Available".** "Built for institutions, market makers and data partners." Predictions market data: "REST API Available, WebSocket Coming soon", pointing to https://data.crypto.com/. FIX is by contacting a FIX API mailbox listed on the page; no self-serve onboarding.

### 4b. Exchange FCM API (documented in companion note section 4; re-checked here)

- Docs "Crypto.com GEN4 FCM US B2C API Documentation (Preview)", https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction. Still says "This is under private beta" and that FCM onboarding "through Crypto.com Exchange" is required "even if you currently use OG.com or the Crypto.com Main App". Change log unchanged since 2026-07-17 (Card Top Up API) (H, re-read 2026-10-19). So the docs were not updated for Predict Pro's launch.
- Public keyless market data, 100 req/s: `https://api.crypto.com/fcm/v1/public/{get-events,get-instruments,get-tickers,get-book,get-trades,get-ticker-histories,...}`. I re-confirmed `get-tickers` and `get-book` return live data (fixtures `og_*`). Details, quirks (`since` in nanoseconds, no open interest, `oi` = 0) are in the companion note.
- **What the Predict Pro web app itself calls (M, static read of the public bundle `browserClient-*.js`, constants only):** REST `https://web-api.crypto.com/fcm`, user BFF `https://exchange-fe-us.crypto.com` (+ private WebSocket `/v1/private/websocket/user`), market stream `wss://web-stream.crypto.com/fcm/v1/market`. The subscribe message in the app code uses `channels` plus `book_subscription_type` ("SNAPSHOT_AND_UPDATE") and `book_update_frequency` (500), with channel names `book.<instrument>.<depth>`, `ticker.<instrument>`, `trade.<instrument>`. This may explain why the documented `stream.crypto.com` subscribe failed in the companion note (it lacked the `book_*` fields or used the wrong host), but I did NOT probe any websocket this session (undocumented hosts), so it is unverified. Treat `web-api.crypto.com` as an internal front-end host: do not build on it.

### 4c. NEW: Crypto.com Predictions market-data API (keyless REST)

- Site https://data.crypto.com/ ("Home - Market Data API"; "Crypto.com Predictions ... Real-time pricing, contracts, and settlement data across sports, politics, and finance - via REST API"), docs https://data-api.crypto.com/docs, **OpenAPI 3.1 at https://data-api.crypto.com/openapi.json** (saved), copyright "Crypto.com Derivatives North America". Operator named in the EULA: Foris DAX, Inc., "an approved market data agent for the North American Derivatives Exchange Inc." (H).
- **Base URL:** `https://data-api.crypto.com/api/v1/predictions` (H). Sandbox keys exist ("free sandbox key", company email required). Production keys via an MDLA application.
- **Endpoints (5, GET, H from OpenAPI + live):**

| Endpoint | Notes (all H unless marked) |
|---|---|
| `/events` | filters `kind` (e.g. NFL, NBA, ELECT; free-form), `type` (match/future/league), `status`, `featured`, `trending`, `format` (head_to_head, multi_winner, spread, total, prop, recurring), `limit` (default 20, **max 50**), `cursor` (opaque base64 offset) or deprecated `offset`. Each event embeds its `contracts` array. |
| `/events/search` | `q` required, plus `date`, `date_from/to`, `time_window`, `team`, `sort_by`; returns events without contracts plus `relevance_score` and a `metadata` block (`disambiguation_needed`, `suggestion`). |
| `/events/{id}` | one event with all contracts; `sort_contracts_by=chance_desc\|chance_asc`, `top=N`. |
| `/events/{id}/contracts` | contracts only. |
| `/contracts/{symbol}/price` | documented to return `{bid, ask, mid, probability, spread, status, updated_at}`. **Returned 404 `PREDICTION_NOT_FOUND` (code 200001) for every symbol I tried**, including symbols returned by `/events` (5 attempts: two symbol forms from `/events`, one exchange-style symbol, the contract UUID, and the docs' own `BTC-YES` example). Either broken at launch, or it needs a symbol form not documented. Do not depend on it. |

- **Contract shape (H, live):** `{id, symbol, title, status, yes, no, chance, payout_per_100, team{...}, market_type{name,title,period}, individual_profile?}`; event: `{id, title, kind, type, event_date, status, contracts_count, metadata{venue,time_confirmed,trending,featured}, market_format?, contracts[]}`. Prices are strings in dollars.
- **Price semantics (H, verified against the exchange book for 3 contracts, fixture `cross_check_...`):** `yes` equals the exchange's **best ask** of that outcome instrument; `no` equals **1 - best bid**; `chance` equals `yes` (the ask), not a mid. Example: DET Lions -1.5 shows yes 0.99 / no 0.70 / chance 99.00, while the book is bid 0.30 x 312 / ask 0.99 x 315. A scanner using `chance` as a probability would be badly biased on wide books. This feed carries **no sizes, no volume, no open interest, no trades**.
- **Symbol mapping to the exchange feed (M, inferred from 3 rows):** Predictions `NFL-00012-261025-M-SPDN1P5DetroitL-O1162_270301-2300_1_PM.NPO` <-> exchange `NX.F.OPT.NFL-00012-261025-M.O.1.162.20270301`; politics `ELECT-USPRESPRTY28-Republican-O12_...` <-> `NX.F.OPT.ELECT-USPRESPRTY28.O.1.2` (drops the expiry). Not documented.
- **Coverage sample (H, my crawl of the first 8 pages = 379 events / 5,729 nested contracts; page 8 still had `has_more: true`, so this is a sample; fixture `predictions_events_sample_summary`):** kinds ELECT 132, NFL 45, CFB 39, CUL 14, EC 9, NHL 9, NBA 7, MLB 6, about 20 crypto tickers at 5-6 events each, EURUSD/USDJPY/GBPUSD/AUDUSD 3 each, one each for indices/metals/crude, UCL, tennis, NASCAR; 371 `league` (futures) vs 8 `match` events (the match events carry 46-998 contracts each; the Cowboys @ Packers game has 975). All `active`. Some placeholder dates (e.g. 2028 presidency event dated 2025-11-18): use contract symbols and the exchange feed for real expiry.
- **Auth and limits (H, OpenAPI + live headers):** keyless; anonymous 100 requests/min and 50,000/day per IP; headers `X-RateLimit-Limit`, `-Remaining`, `-Day-Limit`, `-Day-Remaining`; 429 with `Retry-After`; optional `x-api-key` (tiers Standard 100/min, Premium 500/min 250k/day, Enterprise 2,000/min 1M/day). CORS `*`. Responses carry `Link: <.../eula.pdf?v=eula_v3>; rel="terms-of-service"`. I made about 35 requests to data.crypto.com / data-api.crypto.com in total (about 25 to the API itself, at roughly 1 per second); no 429.
- **WebSocket:** none for Predictions ("Coming soon", H).
- **Pagination note (H):** the first two `/events` pages returned 39 and 40 rows at `limit=50`, so row-count is not a reliable end-of-list signal; use `has_more` / `next_cursor`.

---

## 5. Terms of the data feeds (read this before building on 4c)

Market Data End User License Agreement (Foris DAX, Inc.; "Last Modified: July 2026"; PDF `https://data.crypto.com/static/eula.pdf?v=eula_v3`, 5 pages, read as extracted text) (H):

- Access is "solely for your internal business operations in the United States". You may not "distribute", "copy, modify, or create derivative works", "publish, enhance, or display any compilation or directory based upon information derived from the Market Data", use it "for any commercial purpose", or "use the Market Data to develop, train, validate, update, improve, or modify any AI Technology, use the Market Data as or in prompts for or inputs to any AI Technology, or otherwise process the Market Data through or using AI Technology". Automated access (bots, scrapers) is barred "except as expressly permitted through any API access separately authorized by Company".
- The landing page and quickstart say keyless access is for "personal, non-commercial use", and `/apply` says you need a Market Data License (MDLA) if you "redistribute the data (internally beyond your entity, or externally)", "use it commercially (products, trading operations, paid services)" or "train models on it". The `/reporting` page adds: "No derived data is permitted without special approval ... any transformation, aggregation, or repackaging", monthly usage reports, audit rights.
- Company may suspend or terminate "for any reason with or without notice"; Illinois law. The EULA names the website `dstg-data.3ona.co` (a staging-style hostname) rather than data.crypto.com (H, minor inconsistency).
- **Consequence:** an aggregation / arbitrage scanner is "aggregation" and "trading operations" and, if driven by an AI agent, hits the AI clause. It needs an MDLA, or it should use a different source. The exchange's own `api.crypto.com/fcm/v1/public/*` market-data terms were not found (companion note: NOT FOUND), so that route is not proven clean either; ask CDNA before production use. My research GETs were low-volume reads of documented endpoints to confirm shapes; saved fixtures are small samples kept in this repo for schema reference only.

---

## 6. Trade path (documented, not exercised)

- **Via Predict Pro UI:** manual only: "Go to Predict Pro ... follow the on-screen instructions to activate your account. You will need to provide additional personal information for regulatory purposes" (H, help Getting Started). Order form: Buy/Sell, Yes/No, USD or contract count; Market and Limit; Post-Only (H, help).
- **Programmatic:** the FCM API (`POST private/create-order`, HMAC-SHA256 `sig`, `api_key`, nonce; no wallet signature) or FIX, only for approved FCM accounts, under "private beta" docs and a conformance sign-off (companion note section 5, H there). The Exchange API page lists FIX "Available" and REST/WebSocket "Coming soon" for FCM (Predictions) (H). Opening a Predict Pro account is the front door to that FCM onboarding (M inference from "FCM onboarding through Crypto.com Exchange"). No docs say Predict Pro users automatically get API keys: NOT FOUND.
- **Order types conflict (flag):** the press release lists "Market, Limit, Stop Market, Stop Limit, and Post-Only"; the help centre says "Predict Pro supports two order types: Market and Limit" with Post-Only described separately, and links "Take Profit Orders" / "Stop Loss Orders" articles (H both). Whether stops are native exchange orders or UI-side triggers is NOT FOUND.
- **Limits:** position limit 1,000,000 contracts per event across all contracts of that event (H, help). The OG help centre states 2,500,000 for $1 contracts (companion note); different front ends, different caps, or documentation drift (flag). Order-size / rate limits for trading: see companion note (FCM: 15 requests / 100 ms for create-order).
- **In-play delay:** the OG help centre documents a default 3-second hold for orders after an event starts (companion note, H there); not stated in the Predict Pro articles (NOT FOUND).

## 7. PayBox reachability: **no**

- A PayBox EVM/Solana wallet cannot place orders: there is no on-chain contract, EIP-712 order, or transaction proposal; orders are HMAC-signed requests (or FIX) from a KYC'd FCM account (H, sections 3 and 6).
- **Funding-only (M):** a PayBox `request_transfer` of crypto to a Crypto.com Exchange Spot deposit address followed by manual sell-for-USD and Spot -> Derivatives transfer is conceivable, but is custodial funding, US-only, and not PayBox signing a trade. Not tested; irrelevant for execution.
- Own read-only PayBox catalog checks, 2026-10-19: `discover_plugins` "Crypto.com Predict Pro prediction markets" returned zero plugins; `discover_services` "Crypto.com Predict Pro OG.com prediction market" returned only unrelated third-party x402 data services (Polymarket / Hyperliquid readers). No Predict Pro / OG / CDNA route (H). I did not call any service.

---

## 8. Fees

Source: https://help.crypto.com/en/articles/17213456-trading-hours-fees-and-transaction-history (read as raw text, H):

| Fee | Formula |
|---|---|
| Taker | 7% x contracts x price x (1 - price) |
| Maker | 1.75% x contracts x price x (1 - price) |

- Examples (derived): at P = 0.50 taker 1.75 cents per contract, maker 0.44 cents; at P = 0.10 taker 0.63 cents; at P = 0.95 taker 0.33 cents. The user pays; no separate gas. "Your fee is shown on the order form before you confirm."
- Same formula as the OG.com US sports/politics fee (companion note section 7; I re-read https://help.og.com/en/articles/12958828-fees-limits this session, H). **No Crypto.com / Foris DAX broker markup is mentioned** (NOT FOUND either way; M that there is none).
- **Conflicts (flag):** (1) Predict Pro says "A fee is charged when you open a position and again at settlement or when you close early. Fees are not refunded unless the event is canceled", but the OG fee table says an in-the-money settlement fee is "Waived" and out-of-the-money has "No fees". (2) Predict Pro applies the percentage formula to all categories as written, while OG charges `$0.02 per contract` on crypto, FX, commodities and indices for US customers. Use the exchange's own schedule for the cost model, and confirm the settlement-fee point from a real fill.
- Funding costs: Spot -> Derivatives transfers are not described as fee-bearing (NOT FOUND). Combo fees: "Apply" on win and loss, "Refunded on the canceled leg" (H, help Combos); amounts NOT FOUND.

## 9. Resolution mechanism and dispute risk

- **Settled by the exchange (CDNA)** "based on the official result from the relevant data provider"; "Revisions, disqualifications, or amendments issued after the event concludes do not affect settlement"; CDNA "may correct" errors "by debiting or crediting your balance" (H, help Payouts and Settlement). Each contract shows its "resolution source, settlement timeline, and dispute window" before trading (H, press release); the dispute process itself is NOT FOUND.
- **Timing conflict (flag):** the press release says "typically settle automatically within one hour"; the help centre says "typically within 24 hours". 
- **Edge-case rules (H, help):** cancelled or not completed within 48 hours of scheduled start: Yes holders get the volume-weighted average price over the prior week, No holders get $1 minus that, fees refunded; ties with no tie outcome: both sides $0.50, fees not refunded; contracts can expire early (e.g. team eliminated), paying nothing. In combos a cancelled leg settles at its one-week VWAP and a tied leg at 1/n.
- **Dispute risk for arbitrage (M):** centralised, discretionary, news-agency based. Every cross-venue pair needs rule matching: the 48-hour VWAP cancel rule, the $0.50 tie rule, soccer 90-minute scope and different crypto settlement indices (`...@CdnaFunded`) all differ from Polymarket / Kalshi in places (see companion note section 8). Member disputes go to binding arbitration in Cook County, Illinois (companion note, H there).

## 10. Geo, ToS, automation

- **Predict Pro: US only, and only with an FCM account** ("only available to U.S. users with a Futures Commission Merchant (FCM) account at this time") (H, help Overview). Eligibility also requires "Account verification and onboarding through the Introducing Broker and OG.com's FCM" (H, release). State-level exclusions: NOT FOUND in Predict Pro articles; the OG help centre says some contracts are unavailable in some states and New York is handled separately (companion note, H there).
- Crypto.com's general prediction page says availability "depends on jurisdiction and is accessed through the Crypto.com App" and is "currently available only in the United States" (H, https://crypto.com/en/prediction, wf).
- Entities: Foris DAX, Inc. (NFA Introducing Broker), Foris DAX FCM LLC d/b/a OG.com Broker (FCM), North American Derivatives Exchange, Inc. (DCM and DCO) (H, release disclosures; https://og.com/regulatory). NFA numbers: NOT FOUND (https://crypto.com/en/licenses lists licence types without entity names).
- **Automation:** Predict Pro's help centre has no automation clause (NOT FOUND). The Exchange API page positions prediction APIs for "institutions, market makers and data partners", with FIX only. The FCM docs require conformance tests and written sign-off before live use (companion note, H there). Data feed 4c: see section 5. The FCM and Exchange terms for Foris DAX FCM LLC accounts were not read: NOT FOUND.

## 11. Liquidity

- **Predict Pro volume / OI / TVL: NOT FOUND.** Launched 4 days ago; the release, help centre, and press give no figures. Searched: release, 7 help articles, exchange API page, data.crypto.com home. No separate Predict Pro tape exists, because fills occur on the shared exchange.
- Exchange-level figures (not re-measured; from the companion note, H there, single snapshot 2026-10-19 ~01:10 UTC): rolling 24h about **$6.13M face** across listed binary/bracket/perp instruments (lower bound; one NFL game $4.97M), The Block weekly "nadex" notional about $230M for the week to 2026-10-12 (metric undefined, M), open interest not published. In this session the Predictions API listed the live Cowboys @ Packers game with 975 contracts and a Packers @ Lions game 6 days out with wide books (bid 0.30 / ask 0.99 on a -1.5 spread), so deep-tail quotes are thin. Depth figures for politics/sports/crypto markets are in the companion note section 10.
- Predictions API carries no volume field (H, schema), so liquidity ranking from 4c is impossible; use the exchange tickers' `vv`.

## 12. Event overlap (where arbitrage could exist)

From the Predictions-API sample (H) and the Predict Pro help centre (H): US politics (ELECT: Senate, House, governors, 2028 President: 132 of 379 sampled events), NFL / college football / NBA / NHL / MLB / UCL / Liga MX / tennis / NASCAR (futures and per-game spreads, totals, props), Fed and macro (EC: 9), crypto price ladders for about 20 tokens, FX pairs, indices, gold/silver/crude, culture (CUL: 14). **Overlap with Kalshi, Polymarket, Gemini, Underdog UDX is high for sports, politics, Fed and crypto ladders.** Combos (sports only) have no equivalent elsewhere and are not arbitrageable single legs.

## 13. Liquidity sharing: **NOT independent**

- Shares its book with **OG.com Markets / CDNA / Nadex** (the same exchange) (H: release disclosures; help "offered by Nadex dba CDNA"; verified price identity of the Predictions feed vs the exchange book for 3 contracts; Predict Pro's own screen prices were not observed, M that they equal the exchange book).
- Also shared with every CDNA distributor: the Crypto.com App prediction product, OG.com Broker, DraftKings Predictions, Fanatics Markets, FanDuel Predicts, Robinhood Derivatives, LLC, Wedbush Futures ("OG.com Markets allows trading directly or through intermediaries, including ..." H, https://og.com/regulatory, re-read this session); Underdog flow partly routed to CDNA (M, other repo note). Crypto.com's partner page names Underdog Fantasy and Fanatics as prediction partners (H, https://crypto.com/en/prediction/partners).
- **liquidity_shared_with: OG.com Markets (North American Derivatives Exchange, Inc., CDNA/Nadex)** and its other distributors.

---

## 14. Adapter priority: **skip** (as a separate adapter)

Rationale: duplicate liquidity (no independent price), no documented Predict Pro API, trade path locked behind FCM onboarding, data-feed EULA that prohibits aggregation/AI use without an MDLA, and the better read feed already belongs to the OG/CDNA adapter (P0 read adapter in the companion note). Value Predict Pro adds: (a) it is the retail onboarding door to FCM API access; (b) a fee formula source for the cost model (taker `0.07 x P x (1-P)`); (c) a combos product that the scanner should ignore.

Hints for the OG/CDNA adapter owner:
- Tag venue key `cdna` with `front_ends: [predict_pro, og_com, crypto_com_app, robinhood, draftkings, fanatics, fanduel, underdog]` so cross-venue pairing never counts the same book twice.
- If you decide to use 4c anyway: respect 100 req/min, take `yes` as ask and `1 - no` as bid (never `chance` as mid), and get the MDLA first.
- Do not model "Predict Pro" as having its own prices.

## 15. Not found / open questions

- Predict Pro's own volume, OI, depth, user counts. NOT FOUND.
- Whether stop orders are native or UI-side; the 3-second in-play hold for Predict Pro; per-order size limits. NOT FOUND / open.
- Whether the settlement fee is charged (Predict Pro help) or waived (OG fee table). Open (conflict).
- Settlement timing (1 hour per release vs 24 hours per help centre). Open (conflict).
- How the "dispute window" works; the Foris DAX FCM customer agreement and any API clause. NOT FOUND.
- Whether `/contracts/{symbol}/price` ever works, and which symbol form it wants. Open (404 on 5 tries).
- Whether the exchange public FCM market-data endpoints carry a redistribution/licence restriction like 4c. NOT FOUND (companion note).
- WebSocket subscribe envelope (app code suggests `book_subscription_type` / `book_update_frequency` fields; not probed). Open.
- State-level availability and New York status for Predict Pro. NOT FOUND.
- Whether Predict Pro users can create FCM API keys, and when REST/WebSocket for FCM (Predictions) leave "Coming soon". NOT FOUND.

## 16. Suspicious / embedded-instruction content

None found. I grepped the help articles, data.crypto.com pages, the Exchange API page, the OpenAPI JSON, the EULA text and the OG instrument list for AI-directed instructions (ignore previous, "you are an AI", system prompt, "AI agents should/must") with no hits. The EULA's clause barring AI processing of the data is a licence restriction, not an instruction aimed at me, and is reported in section 5 as a constraint. The Exchange web bundle contains third-party API keys and a public key in its build config; I did not copy any of them into notes or fixtures. PayBox `discover_services` descriptions were treated as untrusted data and not acted on.

---

## Sources

1. https://www.cryptotimes.io/2026/10/15/crypto-com-launches-predict-pro-for-us-prediction-market-traders/ (discovery evidence; WebFetch summary) (M, wf)
2. https://crypto.com/en/company-news/cryptocom-launches-predict-pro-the-exchange-grade-way-to-trade-real-world-events (official release, 2026-10-15; WebFetch summary, not verbatim) (H, wf)
3. https://crypto-economy.com/crypto-com-launches-predict-pro-for-institutional-grade-event-trading/ (pointed me to #2) (M); https://www.kucoin.com/news/flash/crypto-com-launches-predict-pro-for-u-s-users-offering-regulated-prediction-markets (2-to-6 combo claim, contradicted by #2) (L); https://thedefiant.io/news/markets/crypto-com-launches-predict-pro-with-order-books-and-sports-combos (M); one WebSearch result list, 2026-10-19
4. https://help.crypto.com/en/collections/19761087-predict-pro-trading and articles /17213297-overview, /17213424-getting-started, /17213434-markets-and-order-types, /17213441-opening-and-closing-a-position, /17213445-payouts-and-settlement, /17213448-combos, /17213456-trading-hours-fees-and-transaction-history (raw text) (H)
5. https://crypto.com/exchange-pro/en-US/api (Exchange API page with the coverage table) and its JS bundles under https://crypto.com/exchange-pro/assets/ (host constants only) (H)
6. https://crypto.com/en/prediction and https://crypto.com/en/prediction/partners; https://crypto.com/en/licenses; https://crypto.com/exchange-pro/en-US/document/fees-limits (no prediction fees there) (H, wf)
7. https://data.crypto.com/ , /docs, /quickstart, /sandbox, /reporting, /apply, /static/eula.pdf?v=eula_v3 (H); https://data-api.crypto.com/docs and https://data-api.crypto.com/openapi.json (H)
8. Live GETs under https://data-api.crypto.com/api/v1/predictions/ (events, events/search, events/{id}, events/{id}/contracts, contracts/{symbol}/price) (H, fixtures)
9. https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction and /rest-change-log; https://exchange-developer.crypto.com/exchange/v1/docs/api/rest-introduction (H)
10. Live GETs under https://api.crypto.com/fcm/v1/public/ (get-instruments, get-tickers, get-book) for cross-checking (H, fixtures)
11. https://og.com/regulatory (intermediaries list; re-read) (H, wf); https://help.og.com/en/articles/12958828-fees-limits (re-read raw text) (H)
12. Companion in-repo note `docs/research/venues/og-crypto-com-nadex.md` for exchange-level facts not re-derived here (H there, M here)
13. PayBox `discover_plugins` and `discover_services` read-only queries, 2026-10-19 (H)

## Fixtures (`docs/research/fixtures/crypto-com-predict-pro/`)

Raw responses saved byte-for-byte unless noted: `predictions_events_limit2_2026-10-19.json`, `predictions_events_kind_NFL_limit2_2026-10-19.json`, `predictions_event_contracts_17ac9e72_2026-10-19.json`, `predictions_events_search_Packers_limit3_2026-10-19.json`, `predictions_event_GB_DET_top6_2026-10-19.json`, `predictions_contract_price_404_PREDICTION_NOT_FOUND_2026-10-19.json`, `predictions_openapi_2026-10-19.json` (28 KB), `og_tickers_ELECT_USPRESPRTY28_2026-10-19.json`, `og_book_ELECT_USPRESPRTY28_O12_depth5_2026-10-19.json`, `og_ticker_NFL00012_O1162_2026-10-19.json`, `og_book_NFL00012_O1162_depth5_2026-10-19.json`.
Derived or trimmed: `predictions_events_response_headers_2026-10-19.txt` (rate-limit and terms headers only; Set-Cookie lines removed), `predictions_events_sample_summary_2026-10-19.json` (my counts over 8 pages), `cross_check_predictions_vs_og_book_2026-10-19.json` (my comparison), `help_predict_pro_trading_collection_2026-10-19.txt` (7 help articles, tags stripped), `exchange_api_page_coverage_excerpt_2026-10-19.txt` (text excerpt with the coverage table), `app_bundle_host_constants_excerpt_2026-10-19.txt` (URL constants only, no keys).

Privacy check: the scripts and fixtures were grepped for `@`, the user's name, email and home path before and after; the only `@` hits are team names ("Away @ Home") and none are personal identifiers. No identifier appears in any request, header or URL.
