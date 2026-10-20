# Glimpse (glimpse.trading / glimpse.markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:30-04:45 UTC). READ-ONLY: page and doc reads, `gh api` file reads, unauthenticated GETs to the documented API host, one unauthenticated WebSocket subscribe (read feed). No account, API key, wallet, signature, POST/PUT/DELETE or PayBox money tool. `POST /trades/estimate` is documented as public and side-effect free but was NOT called (POST rule). Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, trimmed where noted, each far below 50 KB): `docs/research/fixtures/glimpse/` (section 12).

---

## 0. Bottom line

1. **Live, and active.** The next hourly BTC close was 05:00 UTC on 2026-10-19 and markets closing at 00:00-04:00 UTC the same day had already resolved. API root answers `{"message":"Glimpse Prediction Market is running ..."}`. Terms last updated 2026-09-14, SDK repo pushed 2026-09-18, terminal repo pushed 2026-10-07. Public launch was about 2026-06-24 (press page). (H)
2. **What it is:** a custodial, Bitcoin-Lightning-only, operator-run LS-LMSR automated market maker over 500 adjacent price ranges per market, for BTC, ETH, SOL and PAXG (tokenised gold) closes (hourly and daily). Not on any EVM or Solana chain. (H)
3. **Real public API, no key needed for reads**: REST at `https://main.bpmapi.io` plus an undocumented-in-the-docs public WebSocket. Trading needs an API key from a registered, email/password account. (H)
4. **Very thin.** All six batches combined show about 10.1M sats of 24h volume (about USD 8.3k) and about 22.9M sats "locked" (about USD 18.9k), most of which is operator subsidy. One hourly BTC market holds about USD 100. Buying 50 contracts (USD 4 of payout) in the modal range moves the average price from 45 to 60 sats. (H data, M arithmetic)
5. **Fees are heavy for arbitrage:** 2% on buy, 2% on sell, and (per whitepaper) 2% off the payout at redemption. (H)
6. **PayBox cannot reach it** (custodial Lightning, BTC only, no on-chain/EVM/Solana order path). Best use: **signal source** (free, full price-distribution for BTC/ETH/SOL/PAXG at every hourly and daily close), not an executable arbitrage leg. Priority **P2**.

---

## 1. Identity and liveness

| Item | Value | Tag |
|---|---|---|
| Operator | Glimpse International S.A., "a sociedad anonima incorporated in the Republic of Panama"; Panamanian law, arbitration at CeCAP Panama | H, https://www.glimpse.trading/terms-of-service/ |
| Sites | Marketing: https://www.glimpse.trading ; app: https://www.glimpse.markets/forecast ; docs: https://docs.glimpse.markets ; wiki: https://glimpse.gitbook.io/glimpse | H |
| Backers | Stillmark, Timechain, Wolf, Entrepreneurs First | H, https://www.glimpse.trading/about/ |
| Launch | Press page lists launch coverage dated 24-26 June 2026; ETH, SOL and gold added 2026-08-06 (blog) | H, https://www.glimpse.trading/press/ , https://www.glimpse.trading/blog/ |
| Regulator | None named in ToS. FAQ says "Qualified custody ... is provided by BitGo Trust Company"; swagger intro says "Admin, wallet, BitGo, and Lightning endpoints are not documented here" | H |
| Live check | `GET https://main.bpmapi.io/` 200; batches endpoint returns 6 batches; current markets end 2026-10-19 05:00 UTC onward; 4,630 resolved hourly BTC markets in the batch | H (own GETs, 2026-10-19) |
| Coming soon (homepage) | Oil, S&P 500, USD/JPY, Bitcoin difficulty | H, https://www.glimpse.trading/ |

The discovery hint said "weekly-close style contracts". What exists today is **hourly and daily closes**; the hourly series is pre-listed 168 markets (one week) ahead and the daily series about 139-141 days ahead. No weekly-close batch is listed in `/batches`. (H)

## 2. Kind and market model

* **Kind:** off-chain, custodial, operator-subsidised AMM. Not an order book (ToS 6.13: "The Platform does not operate an order book"), not parimutuel, no third-party LPs (ToS 5.9). (H)
* **Structure:** each market = one future close time of one reference asset, cut into **n equal-width price ranges** (500 for BTC/ETH/PAXG; 650 for SOL). Each range is a mutually exclusive outcome paying **100 sats** if the settlement price falls in it, else 0. Ranges: BTC hourly 25,000-125,000 step 200; BTC daily 0-500,000 step 1,000; ETH daily 0-15,000 step 30; SOL daily 0-1,300 step 2; PAXG hourly 3,000-8,000 step 10; PAXG daily 2,500-10,000 step 15. (H, `/batches`)
* **Type for the aggregator:** a **discretised scalar market** (categorical over buckets), not binary. Binary/threshold equivalents are derived: P(price >= K) = sum of w over ranges above K (see section 5 for how to get w). Multi-range "bands" can be bought in one trade (whitepaper). (H)
* **Tokenisation:** none. Positions are rows in Glimpse's internal ledger keyed by `topic_id` + `option_id`; there is no token, NFT or on-chain receipt. (H: ToS 5.7, API docs)
* **YES/NO per range:** API legs take `prediction: "yes" | "no"`. The quote payload's `no_price` equals the sum of all *other* ranges' rounded `yes_price` (exactly true for all 500 ranges in a live market I checked: `no_price == sum(yes_price) - yes_price`). So "NO on range i" behaves like buying every other range. (H data, M interpretation)
* **Mechanism:** Quantile LS-LMSR. Cost `C(q) = 100 * b(q) * ln(sum_j exp(q_j/b(q)))`, `b(q) = alpha * sum_j q_j`, `alpha = v/(n ln n)` with v = 2 (live `alpha` = 0.00064364476 for n = 500, matches 2/(500 ln 500)). Marginal price `p_i = 100*(w_i + alpha*H(w))`. Operator seeds every range with q0 contracts (80 per range now; whitepaper example 40) and the subsidy `C(q0)` caps its loss. (H: https://www.glimpse.trading/whitepaper/ ; live WS frame)

## 3. Chains, collateral, custody

* **Collateral/settlement unit:** bitcoin only, quoted in sats; API money fields are **millisats** (1 sat = 1000). Contract price scale 0-100 sats; payout 100 sats. 100 sats = about USD 0.083 at BTC USD 82.5k (Coinbase spot read 2026-10-19). (H)
* **Funding:** Lightning invoice deposit and withdrawal (ToS also mentions on-chain Bitcoin withdrawal addresses). Custodial wallet; "You do not hold the private keys"; assets in segregated/omnibus accounts; no insurance, no guarantee fund (ToS, Risk Disclosure). (H)
* **No EVM/Solana contract, token or subgraph exists.** DefiLlama-style TVL is not applicable. (H by absence: swagger/docs describe only the Glimpse ledger; NOT FOUND (searched: homepage, docs llms.txt, wiki, whitepaper, ToS, GitHub org repos) any contract address.)

## 4. Read API

Docs: https://docs.glimpse.markets (Mintlify; machine index https://docs.glimpse.markets/llms.txt). OpenAPI/Swagger 2.0 is public: `https://main.bpmapi.io/swagger/doc.json` (title "Glimpse Nmarket Public API", 25 paths). Official Python SDK `glimpse-markets` 0.2.0 (MIT, https://github.com/BIRKELAND-GLIMPSE/python-package, PyPI released 2026-09-18). (H)

**Base URL:** `https://main.bpmapi.io` (docs "Main Service"; also the SDK default). WebSocket: `wss://main.bpmapi.io/ws/nmarket-updates`. (H)

### Public (no auth) - confirmed with real GETs on 2026-10-19

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /api/v1/nmarket/batches` | the 6 live series with `batch_id`, `main_topic_title`, `topic_type`, `start/end_time_utc`, `topic_count`, `outcome_min_value`, `outcome_max_value`, `outcome_interval` | 1.5 KB; this is the authoritative series list |
| `GET /api/v1/nmarket/batches/{batch_id}/stats` | `volume_24h_millisats`, `total_volume_millisats`, `liquidity_locked_millisats`, `active_market_count` | |
| `GET /api/v1/nmarket/v2/batches/{batch_id}/active-markets?page=&page_size=` | paginated markets, outcomes slim (`option_id`, `name`, `shares`; no prices) | **`page_size=3` was ignored, server returned limit 24 (about 650 KB)**; `has_more`, `next_offset` present |
| `GET /api/v1/nmarket/v2/batches/{batch_id}/resolved-markets` | resolved markets with `resolved_option_id` | newest first, 4,630 total for hourly BTC |
| `GET /api/v1/nmarket/markets/{topic_id}/quotes` | full quote: all outcomes `yes_price`, `no_price`, `*_millisats`, `shares`, `subsidised_shares`; `liquidity_locked_millisats`, 24h and lifetime volume, `quote_mode` (`live`/`resolved`...) | about 79 KB for 500 ranges |
| `GET /api/v1/nmarket/markets/{topic_id}/stats`, `/volume` | market volume, per-option volume | |
| `GET /api/v1/nmarket/markets[?batch_id=]` | flat summaries (991 rows, about 476 KB, includes a stray test batch `d139b0a0...` "10 min Long BTC markets" not in `/batches`) | filter to `/batches` ids |
| `GET /api/v1/nmarket/ended-by-batch`, `ended-past-168h`, `resolved-past-168h` | history windows | documented, not individually called |
| `POST /api/v1/nmarket/trades/estimate` | cost, commission for a hypothetical trade | documented Public; **not called** |
| `GET /swagger/doc.json` | OpenAPI | 72 KB |

* **WebSocket** (public, no key): connect, optionally send `{"action":"subscribe","topic_id":<int|null>,"batch_id":<str|null>}`. Observed: handshake 101; **unfiltered by default** (frames for other topics, e.g. a gold market, arrive before/without a filter), then filtered frames for topic 4700. Each frame is a **full snapshot (about 45 KB)**: `type:"market_update"`, `data.{alpha, pot_size, open_interest_millisats, liquidity_locked_millisats, total_volume_millisats, volume_24h_millisats, batch_* aggregates, volume_by_option, quotes[{option_id, option_name, yes_price, no_price, shares}], timestamp}`. Frames are trade-driven (about 27 s apart on a quiet hourly market). No "resolved" event (SDK README). Not mentioned anywhere in docs.glimpse.markets, but ToS 6.23 says REST **and WebSocket** are offered. (H; SDK `streaming.py`)
* **REST and WS agree** when captured together (500/500 ranges equal prices and shares). (H)
* **Auth for private/trading calls:** header `X-API-Key: <key>` (swagger `ApiKeyAuth`, SDK, sample repo) or `Authorization: <JWT>` (`BearerAuth`). The 401 body says "Authorization header or X-API-Key is required". The docs are inconsistent: the intro says raw token with no `Bearer ` prefix, trade examples show `Bearer <token>`. Up to 5 API keys per account, created in Settings. Some pages claim "User JWT" for endpoints that are in fact public (v1 `active-markets` answered 200 with about 18 MB, do not use it). (H)
* **Rate limits:** ToS 6.26: **600 market-data requests/min and 60 order requests/min per API key**. SDK throttles everything to 60 requests/60 s. Unauthenticated limits: NOT FOUND (searched: docs, ToS, swagger). About 45 unauthenticated GETs in this session produced no 429 and no rate-limit headers. (H/M)
* **Gaps:** no historical price/candle endpoint ("Glimpse has no historical/candle data endpoint as of now", SDK README); no trade/fill tape endpoint for the public; per-market "Market Rules" text is not in the API (`description` only says "closing price in USD"). (H)

## 5. Quote semantics the adapter must get right (verified)

Using one live frame (topic 4700, 500 ranges, 2026-10-19 about 04:36 UTC):

* `yes_price` is **round(100*(w_i + alpha*H(w)))** - the LS-LMSR marginal price rounded to a whole sat. This matched all 500 ranges when I recomputed it from `shares` and `alpha`. (H data, M derivation)
* Because of rounding, the quote shows **0 for most ranges** and the displayed `yes_price` values sum to about 99-102, while the true marginal prices sum to about 148 (spread term). **Do not treat `yes_price` as a probability or as an executable cost.** Derive probabilities as `w_i = softmax(q_i / b)`, `b = alpha * sum(q)`, and executable cost as `(1 + 0.02) * (C(q + delta) - C(q))`, computing `C` locally from `shares` + `alpha` (alpha is in WS frames; otherwise `2/(n ln n)`). The Glimpse terminal README says the same ("recomputes every price locally from the outstanding shares"). `C(q)` computed locally equalled `pot_size`/`liquidity_locked_millisats` to 0.01 sat. (H data, M)
* `open_interest_millisats = pot_size - subsidy` in the frame I read (100.73M = 124.73M - 24.0M msat). (H data)
* `contracts` in trades are integers/floats of 100-sat units; minimum meaningful trade is well under USD 1.
* Quote-mode and times: `market_end_time_utc` = close time, `estimated_resolve_time` = same value; resolution arrives later (the 04:00 UTC market was already resolved by about 04:30 UTC). (H/M)

## 6. Trade path

* **Programmatic trading exists**, REST with API key. Swagger paths: `POST /api/v1/nmarket/enter-multi-topic-multi-leg` (buy legs across topics, atomic per docs), `exit-consolidated`, `exit-consolidated-multi`, `exit-multi-topic-multi-leg`, `exit-batch`; docs also list `POST /api/v1/nmarket/trades` (buy/sell, not in swagger). Body: `{"topics":[{"topic_id":N,"legs":[{"option_id":M,"contracts":K,"prediction":"yes|no"}]}]}`. Orders are **market orders against the AMM only**; no limit/stop orders (ToS 6.8, 6.24). (H)
* **No slippage field exists in the API request schema** (swagger `TradeLeg` has only `contracts`, `option_id`, `prediction`) although ToS 6.16 says a 2% default maximum slippage applies and quotes are valid 30 s. Protect yourself by calling `/trades/estimate` just before and sizing small. No idempotency key (SDK warns a network failure mid-trade is ambiguous, check `portfolio_active()` before retry). No sandbox: every key is live (SDK README). Fills are all-or-nothing (ToS 6.14). Position limit **1,000,000 sats (0.01 BTC, about USD 825) per account per market** (ToS 5.6). (H)
* **Signing scheme:** none on-chain. Auth is a static API key tied to an email/password account (session JWT lasts 24 h). Funds are moved only by Lightning invoice to/from the custodial wallet. (H)
* **PayBox reachability: no.** There is no EVM/Solana/Base transaction proposal, signed order or contract to point a PayBox wallet at. Funding needs a Lightning invoice payment into a Glimpse-held wallet; I found no PayBox plugin for Lightning or Glimpse (`discover_plugins` queries "lightning bitcoin" and "glimpse" both returned empty on 2026-10-19). Reading is fully possible without PayBox. (H/M)

## 7. Fees

| Fee | Value | Source | Tag |
|---|---|---|---|
| Buy | `(1 + 0.02) * [C(q + d) - C(q)]` | whitepaper eq. 3; ToS 9.1: "two per cent (2%) fee on each buy and on each sell of Event Contracts" | H |
| Sell back to AMM | `(1 - 0.02) * [C(q) - C(q - d)]` | same | H |
| Redemption of a winner | `(1 - 0.02) * 100 * d`, i.e. 98 sats per winning contract | whitepaper eq. 4 and terminal README ("2% commission applies on buying, selling and redemption") | H. ToS defines a contract as paying "0 sats or 100 sats", so ToS and whitepaper disagree on redemption; treat 98 as the safe number |
| Deposit / API / inactivity | none | ToS 9.3 | H |
| Withdrawal | "small withdrawal fee may apply", Lightning/on-chain network fees passed through | ToS; the Fee Schedule page was not found (NOT FOUND, searched: site nav, ToS links) | M |

Payer: the trader, deducted at execution; reported as `commission_millisats` in trade responses. Worked example from live state (BTC 4700, modal range 82,400-82,600, marginal 45 sats): buying 100 contracts costs 7,306 sats including fee (average 73 sats); selling the 100 back immediately returns 7,020 sats (round-trip loss about 287 sats, about 3.9%). Held to a win, 100 contracts pay 9,800 sats. (M, computed locally from the live snapshot)

## 8. Resolution and dispute risk

* **Mechanism:** operator-run "oracle reports the price" at the scheduled end (homepage); settlement uses "the closing price of the hourly candle that ends at its scheduled end time" (whitepaper). Daily markets close at 00:00 UTC; hourly at hh:00 UTC. The data source is **not named** in the whitepaper, ToS, FAQ or API; ToS defers to per-market "Market Rules" inside the app (not retrievable without the app; NOT FOUND via API). (H)
* **Source inference (M):** I compared 24 recently resolved hourly BTC markets with public 1h candle closes: Coinbase BTC-USD matched the resolved range in 23/24, Kraken XBTUSD 22/24, Binance BTCUSDT 15/24. So the reference is USD-spot-like, not Binance USDT, but not provably Coinbase. Gold markets settle on **PAXG** (token, "1 token = 1 troy oz"), not spot XAU/USD (market description; terminal README "Glimpse's own gold market settles on PAXG"). Basis vs spot gold or futures is real. (H/M)
* **Dispute:** only for "manifest error in, or unavailability of, the designated reference data"; request to support, one internal review within 14 days by a director/officer, then Panama arbitration; outcomes otherwise "final and binding". Glimpse may suspend or extend a market, apply a fallback, or void it and return funds. Operator is also the AMM funder and custodian, so counterparty and custody risk is concentrated. No insurance. (H)
* **Failure modes to model:** void/extension (funds locked), source mismatch at the boundary (a close within a few dollars of a range edge), stale or rounded quotes, operator halt.

## 9. Geo, ToS, automation

* **Excluded:** U.S. person, Canadian person, U.K. person; Restricted Territories (list on site, "determined at our sole discretion"); sanctioned persons. May block by IP; **VPN use to get around restrictions is prohibited** (ToS 1.3 and prohibited-conduct list). 18+. Registration with email and password; no formal KYC process described; may ask for proof of eligibility. (H)
* **Automation:** allowed *through the API* with a generated key and "API Terms" (the API Terms document itself was not found: NOT FOUND, searched ToS, docs, site nav). "using scripts ... or any data mining, robots, or similar data gathering and extraction tools, other than through the API" is prohibited. "Systematically retrieving data ... to create or compile ... a collection, compilation, database ... without written permission" is prohibited. Multiple accounts/keys to evade limits are prohibited. (H)
* **Implication:** polling the public read endpoints for live scanning looks like intended API use, but **persisting a history database from them arguably needs written permission** (the SDK ships a `MarketRecorder`, which suggests tolerance, but that is not a licence). Ask before building a stored history. Trading requires a person who is not in an excluded country and a custodial account. (M)

## 10. Liquidity (sizes in USD use BTC = USD 82,549, Coinbase spot read 2026-10-19 about 04:45 UTC)

Batch stats, fetched 2026-10-19 about 04:30 UTC (H, own GETs on `/batches/{id}/stats`):

| Series | 24h volume | "Liquidity locked" | Active markets |
|---|---|---|---|
| Hourly BTC | 6.065M sats (about USD 5.0k) | 5.408M sats (about USD 4.5k) | 168 |
| Hourly Gold (PAXG) | 3.773M sats (about USD 3.1k) | 5.586M sats (about USD 4.6k) | 168 |
| Daily BTC | 0.068M sats (about USD 56) | 3.257M sats (about USD 2.7k) | 141 |
| Daily SOL | 0.060M sats (about USD 49) | 3.463M sats (about USD 2.9k) | 141 |
| Daily ETH | 0.067M sats (about USD 55) | 2.582M sats (about USD 2.1k) | 139 |
| Daily PAXG | 0.060M sats (about USD 50) | 2.569M sats (about USD 2.1k) | 139 |
| **Total** | **10.09M sats = 0.101 BTC = about USD 8.3k/day** | **22.87M sats = 0.229 BTC = about USD 18.9k** | |

* "Locked" is mostly the operator subsidy: 24,000 sats per hourly market, 12,000 per daily market (14,839 for SOL). (H)
* Single next-close hourly BTC market (topic 4700): pot 124,729 sats (about USD 103), open interest about 100,729 sats (about USD 83), 24h volume about 86,000 sats (about USD 71). Daily markets are even quieter (daily BTC 24h volume 0.555M msat for the next close). (H)
* Depth: LS-LMSR `b` is about 40 contracts, so buying 10 contracts in the modal range averages 48 sats vs 45 marginal; 50 contracts average 60; 100 average 72; 500 average 94 (all before the 2% fee). Realistic arbitrage clip is a few USD per market, capped at USD 825 per account per market. (M, computed)
* Data quirk: `total_volume_millisats` at batch level (1.57B msat for hourly BTC) is *lower* than `volume_24h_millisats` (6.07B), so the lifetime figure appears to cover only currently active markets. Do not use it as lifetime volume. (H data, M interpretation)
* Stale-leg risk: the hourly series is pre-listed a week ahead, so far-dated hourly markets show only the subsidy seed (flat prior). Filter to markets with real volume before using as a signal.

## 11. Event coverage and arbitrage relevance

* **Categories:** crypto price only (BTC, ETH, SOL) plus gold token (PAXG). No sports, politics or macro today; oil, S&P 500, USD/JPY and BTC difficulty are "coming soon" (homepage).
* **Overlap with other venues (M, other venues not researched here):** crypto price-bracket and above/below markets on larger venues and options-implied distributions on listed crypto options. Glimpse's edge for the aggregator is the **full 500-bucket density** at every hourly and daily close, which can be integrated into threshold probabilities and compared with other venues' strikes. Settlement conventions differ (hh:00 UTC hourly candle close on an unnamed USD source), so any cross-venue pair carries basis and timing risk. PAXG is not XAU.
* **Independent liquidity:** yes. Own AMM, own operator subsidy, no shared pools, no relationship to another venue found. It is therefore an independent leg, but a tiny and expensive one (4%+ round trip, 2% on redemption, custodial BTC).
* **Signal value:** high-resolution, free, real-time distributions and a trader-forecast stream; use as a signal source for the aggregator (the user's "Quotient as a signal source" analogue), not as the place to size.

## 12. Fixtures saved

All in `docs/research/fixtures/glimpse/` (captured 2026-10-19, no auth; trimmed ones carry a `_fixture_note`):

* `nmarket_batches.json` - full `/batches` response (6 series)
* `nmarket_batch_stats_hourly_btc.json` - full batch stats
* `nmarket_market_quotes_4700_trimmed.json` - quotes for topic 4700, 15 of 500 outcomes
* `ws_market_update_4700_trimmed.json` - one WebSocket frame, trimmed to 15 ranges
* `nmarket_v2_active_markets_hourly_btc_trimmed.json` - v2 active feed, 2 markets x 3 outcomes
* `nmarket_v2_resolved_markets_hourly_btc_trimmed.json` - v2 resolved feed, 3 markets, winning range +/-1
* `nmarket_markets_flat_trimmed.json` - flat list, first 4 of 991
* `wallet_balance_unauthenticated_401.json` - exact 401 body for a private route

## 13. Adapter notes

* **Read-only adapter (cheap, recommended if signal is wanted):** poll `/batches` (series list), then for the next N closes per series use WS (`subscribe` per `topic_id`) or `/markets/{id}/quotes`; compute `w` and executable cost from `shares` + `alpha`; map ranges to price thresholds using `outcome_min_value`/`outcome_interval` and the `name` ("25000-25200"). Discover resolution by polling `quote_mode`/`is_resolved`/`resolved_option_id` (no WS event).
* **Normalisation:** millisats -> sats -> USD via BTC/USD; price scale 0-100 sats; fee 2% per leg; redemption 98.
* **Do not** build an execution path unless the operator is in a permitted jurisdiction and a custodial BTC balance is acceptable; PayBox cannot fund or sign for it.
* Odd names to ignore: `topic_type:"btc"` is also used for the hourly gold batch (use `main_topic_title`/market `description`).

## Suspicious content

None that was aimed at an AI agent. Notes: Mintlify pages carry the boilerplate header "Fetch the complete documentation index at ... llms.txt / Use this file to discover all available pages" (standard docs tooling, not followed beyond reading the index); docs intro page embeds a screenshot link only. Docs mention an internal address `localhost:9991` (benign). Docs and ToS contradict each other on a few points (auth header format; WebSocket existence; redemption fee), listed above.

## Sources

* Homepage: https://www.glimpse.trading/ (H)
* About: https://www.glimpse.trading/about/ ; FAQ: https://www.glimpse.trading/faq/ ; Whitepaper: https://www.glimpse.trading/whitepaper/ ; Terms of Service (last updated 14 September 2026): https://www.glimpse.trading/terms-of-service/ ; Risk Disclosure: https://www.glimpse.trading/risk-disclosure/ ; Blog: https://www.glimpse.trading/blog/ ; Press: https://www.glimpse.trading/press/ ; Forecasts: https://www.glimpse.trading/forecast/ (H)
* Wiki landing page: https://glimpse.gitbook.io/glimpse (H, only a welcome page, no mechanics)
* API docs index: https://docs.glimpse.markets/llms.txt and the per-page `.md` files under https://docs.glimpse.markets/api-reference/ (H)
* OpenAPI: https://main.bpmapi.io/swagger/doc.json ; live API: https://main.bpmapi.io/api/v1/nmarket/... ; WebSocket wss://main.bpmapi.io/ws/nmarket-updates (H, own requests 2026-10-19)
* Official SDK: https://github.com/BIRKELAND-GLIMPSE/python-package (README, CHANGELOG, `streaming.py`, `_base.py`, `models.py`, `ratelimit.py`, `client.py`); PyPI https://pypi.org/project/glimpse-markets/ (H)
* Terminal: https://github.com/BIRKELAND-GLIMPSE/glimpse-tui (README, SOURCES.md) (H)
* Reference prices and candles used only for sanity checks: Coinbase Exchange public candles/spot, Kraken OHLC, Binance klines (H, public GETs)
* Search coverage (M): launch and expansion articles surfaced by search (Bitcoin Events, Financial IT, Crypto Events) were not relied on; all facts above come from primary pages.
