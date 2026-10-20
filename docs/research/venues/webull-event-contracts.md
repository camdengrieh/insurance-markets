# Webull event contracts - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official docs and site pages (WebFetch, raw `.md` docs from developer.webull.com), `gh api` reads of Webull's public SDK/skills/MCP repos, a handful of unauthenticated GETs to Webull API hosts (all refused without credentials) and one to Kalshi's public API. No account, key, wallet, signature, sandbox application, POST/PUT/DELETE or browser automation. No PayBox tool was called. All third-party text was treated as untrusted data. The shared WebSearch budget ran out mid-session, so the fee, routing and volume checks that needed search were done by fetching known URLs only (gaps are listed in "Not found").

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

---

## 0. Verdict

**adapter_priority = skip** (as a venue adapter). Confidence: high on the verdict, medium on exact fees and volume.

1. **Live (2026-10-19).** The consumer page, the developer docs and the SDK repos are current (docs repos pushed 2026-10-17). Event contracts launched in the app Q3 2025 and were expanded to sports on 2026-01-27 (H).
2. **Not an independent leg.** Webull is an FCM front end (Webull Futures LLC). Every event symbol in the docs is a Kalshi ticker (`KXRATECUTCOUNT-26DEC31-T3`), the docs themselves say the event is "the basic unit that members should interact with on Kalshi", and the doc example market (`Will the Fed cut rates 3 times?`, yes condition `Exactly 3 cuts`) is word-for-word Kalshi's market `KXRATECUTCOUNT-26DEC31-T3` (title and `yes_sub_title`) (H, section 12, fixture). Prices and depth are Kalshi's. Treat Webull as a second *execution route* to Kalshi liquidity, not a second price.
3. **No public read API.** The official OpenAPI has rich event-contract endpoints (categories, series, events, markets, snapshots, depth, ticks, bars, MQTT stream, gRPC order stream) but every call needs a Webull brokerage account, an approved app key, HMAC-SHA1 signing and (if 2FA) a token approved by hand in the Webull app (H). Unauthenticated calls return 401 (H, fixture). Kalshi's own public API is open and strictly better for reads.
4. **Not reachable from a PayBox wallet.** USD in a KYC'd US futures account; no chain, no token, no on-chain signature (section 6).
5. **What is worth keeping:** (a) Webull symbols are Kalshi tickers, so any Webull-to-Kalshi map is the identity; (b) if the product ever wants users to execute Kalshi legs from their Webull accounts, the **Connect API (OAuth 2.0, supports event contracts)** is the sanctioned path for a third-party platform (section 5); (c) Webull's trading hours for some contract types are narrower than Kalshi's, which matters for stale-quote logic if anyone ever consumes Webull quotes (section 2).

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| https://www.webull.com/prediction-markets serves "Turn your predictions into trades": categories Sports, Crypto, Financials, Economics, Culture, Climate, Science & Tech; separate Events account; "24/7 market access"; Webull Futures LLC named as the CFTC-registered FCM | 2026-10-19 | H |
| https://developer.webull.com/apis/docs/trade-api/event-contract.md (Trading API event-contract guide) and 10 event reference pages served | 2026-10-19 | H |
| `webull-inc/webull-openapi-python-sdk` pushed 2026-10-17T07:57Z; `webull-openapi-skills` 2026-10-17T08:05Z; `webull-openapi-mcp` 2026-10-17T08:04Z (all Apache-2.0); SDK has event market-data, event streaming and event order samples | 2026-10-17 | H (gh api) |
| Press release "Webull Introduces $0 Commission Trading on Pro Football Big Game Prediction Markets": sports, economic and crypto event contracts; "Since the rollout in Q3 2025 ... significant quarter-over-quarter growth" (no figures) | 2026-01-27 | H |
| Original launch: "Webull Connects to Kalshi to Offer Investors Innovative Prediction Markets"; planned to become a clearing member | 2025-02-12 | H (stale as a status, fine as history) |
| Webull Institutional launch lists "U.S. Futures and Prediction Markets" among offerings | 2026-07-07 | H |
| Q1 2026 (2026-05-21) and Q2 2026 (2026-08-19) results releases carry a forward-looking risk factor on "event contracts or prediction market products in the United States"; no PM metrics | 2026-08-19 | H |
| Third-party reviews dated 2026-06-24 (Finder), 2026-10-15 (next.io) describe it as operating; a 2026-05 review (PredictionMarketsWorld) said economics/financial only (conflicts with Webull's own 2026-01-27 sports release) | 2026-05..10 | M |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** broker/frontend (FCM). "Futures and cleared swaps trading is offered by Webull Futures LLC, a CFTC registered Futures Commission Merchant" (https://www.webull.com/disclosures). Event contracts sit in a separate "Events" cash account (SDK skill: "Account: Events Cash account"), "not protected by SIPC" (H, prediction-markets page). Webull's own pages never name Kalshi on the pages I could read; the press releases (2025-02-12, 2026-01-27) and the developer docs do (section 12).
- **Hierarchy (H, docs):** Category -> Series -> Event -> Market. Market = one binary outcome with yes/no positions. Categories in the API docs: Economics, Financials, Politics, Entertainment, Science & Technology, Climate and Weather, Transportation, Crypto, Sports (the consumer page lists 7 and omits Politics; whether Politics is actually enabled for the account is untested, M).
- **Model:** binary only. Payout $1 yes / $0 no, no leverage, no PDT rules. `event_outcome: yes|no` on the order; buying "No" is the opposite exposure (H). Kalshi scalar-style markets, if any are exposed, would appear as binary strike markets; not verified.
- **Venue type:** central limit order book of the underlying exchange; **not an AMM, not parimutuel, no tokens**. The depth endpoint returns `yes_bids, yes_asks, no_bids, no_asks` (H, OpenAPI); the SDK docstring says it returns yes bids and no bids only, "no asks" (H, SDK) - the same bid-only ladder shape Kalshi publishes. The two Webull sources disagree; confirm with a live call.
- **Prices/sizes:** decimal-dollar strings (`"0.13"`) in the OpenAPI examples; the SDK docstrings say "Price unit is based on usd_cent" - contradictory, resolve with a live response (H for both quotes, which conflict). Range $0.01 to $0.99, sub-cent ($0.0001) on some markets; quantity may be fractional down to 0.01 contract (H, Broker API guide).
- **Trading hours (ET, H, Trading API guide):** Crypto Mon-Fri 08:00-18:00; Index Mon-Fri 08:00-16:00; Economic Mon-Fri 08:00-23:00; Sports (cleared swaps) 24/7 excl. maintenance. "Webull may adjust the trading hours for specific Contracts without notification" (Broker API guide). These are narrower than Kalshi's exchange hours for some series, so a Webull quote can be unavailable while Kalshi trades (M, inference).
- **Tradability flags:** per market `status` (e.g. `LISTING`) and `tradable_status`: `OC` tradable, `CO` liquidate-only, `NT` non-tradable (H). A market can exist in the catalogue and still be untradable on Webull.

---

## 3. Chains and collateral

None. Collateral is **USD cash** held at Webull Futures LLC (Events cash account); funding and withdrawal run through ordinary brokerage rails (a review site cites wire and debit-card withdrawal fees, M). No blockchain, token or wallet is involved anywhere in the event-contract product (H: docs show account ids, USD prices, no chain fields).

---

## 4. Read API (official, authenticated only)

| Item | Finding | Tag |
|---|---|---|
| Existence | **official-authenticated**: Webull OpenAPI, US region, "Trading API" + "Market Data API" (+ Broker API and Connect API for partners) | H |
| Docs | https://developer.webull.com/apis/docs/ ; raw markdown index https://developer.webull.com/apis/llms.txt ; every page has a `.md` twin (e.g. `.../trade-api/event-contract.md`) | H |
| Hosts (prod) | HTTP trading + market data (server-to-server): `https://api.webull.com`; trading events gRPC: `events-api.webull.com`; market-data MQTT stream: `data-api.webull.com`; client-to-server data `global.webullsolutions.com`, `quotes-stream.webullsolutions.com` | H (https://developer.webull.com/apis/docs/sdk/) |
| Hosts (sandbox) | `https://api.sandbox.webull.com`, `events-api.sandbox.webull.com`, `data-api.sandbox.webull.com` | H |
| Version header | Every request needs `x-version: v3`; without it `api.webull.com` answered 404 `Route Not Found`, with it 401 | H (probe, fixture) |
| Auth headers | `x-app-key`, `x-timestamp` (UTC `YYYY-MM-DDThh:mm:ssZ`), `x-signature`, `x-signature-algorithm` (`HMAC-SHA1`), `x-signature-version` (`1.0`), `x-signature-nonce`, `x-version`; optional `x-access-token` when 2FA is on. App secret is only used to sign, never sent | H (authentication/overview) |
| Access gate | App key needs an existing Webull brokerage account plus an OpenAPI application reviewed in "1-2 business days"; a separate sandbox application is auto-approved. The Trading API is "a direct trading interface designated for natural persons"; institutions go through an admin-authorised mode | H (authentication/IndividualApplicationAPI) |
| 2FA token | If enabled, the SDK creates a token and **you approve it in the Webull app within 5 minutes**; token goes `INVALID` after 15 days with no API calls. Sandbox tokens need no 2FA | H (authentication/token) |
| Catalogue endpoints (GET) | `/trading/instruments/event-contracts/categories/list`; `/series/list` (`category`, `symbols`, `pagination_key`); `/events/list` (`series_symbol` required, `symbols`, `status`); `/markets/list` (`series_symbol`, `event_symbol`, `symbols` max 100, `expiration_date_after`, `pagination_key`). Older `/openapi/instrument/event/...` paths are deprecated | H (docs + SDK) |
| Market data (GET) | `/market-data/event-contracts/snapshots/list` (`symbols` max 100, `category=US_EVENT`), `/depths/list` (`symbol`, `depth` default 10), `/ticks/list` (`symbol`, `count` max 1200), `/bars/list` (`symbols`, `timespan`, `count` max 1200, `start_time`/`end_time` ms) | H |
| Catalogue fields | market: `instrument_id, symbol, name, yes_condition, series_*, event_*, last_trading_date, status, tradable_status, can_close_early, expected_exp_date, latest_exp_date, payout_date, fractionable, price_ranges[{start,end,step}]`; event: `symbol, name, status, short_name, strike_date, strike_period, mutually_exclusive` | H (docs examples, fixture `webull-docs_event-endpoints...json`; not live) |
| Snapshot fields | `price, volume, last_trade_time, open_interest, yes_bid/ask(+_size), no_bid/ask(+_size)` (strings except `last_trade_time` int ms) | H (docs examples) |
| Tick fields | `time, yes_price, no_price, volume, side (taker yes/no), trade_id` | H |
| Resolution data | **No result/outcome field** in the market catalogue; settlement shows as status change and position payout. Resolution values must come from Kalshi's `result`/`expiration_value` | H (absence in the schema), M (inference) |
| Streaming | MQTT over WebSocket/TCP: SDK `DataStreamingClient.subscribe(symbols, "US_EVENT", [QUOTE, SNAPSHOT, TICK])`; subscriptions are not restored after reconnect. Order/position push is gRPC `EventService.Subscribe` (`subscribeType` 1024 order, 1028 position) | H (SDK sample/proto, market-data FAQ) |
| Rate limits (prod) | Event-contract instruments 60/60s and quotes 60/60s under the "Display Solution"; **300/60s for Event market data under "Non-Display"**; trading instruments 60/60s; place/replace/cancel 600/60s; preview 150/10s; order query and balance/positions 2/2s; token create 10/10s. HTTP 429 on excess, "temporary IP-level blocking" on repeat. Sandbox is 30/60s everywhere | H (https://developer.webull.com/apis/docs/rate-limits) |
| Market-data entitlements | "Crypto and event contracts: None" extra subscription needed; sandbox data is 15-minute delayed only for products that need one | H (market-data-api/overview) |
| SDKs | Python 3.8-3.14 and Java 8+ (official); other languages by raw REST/MQTT/gRPC | H |

**Live response shapes could not be confirmed**: there is no unauthenticated endpoint. What I did confirm (fixture `unauthenticated-probes_2026-10-19.json`): sandbox returns 401 `{"error_code":"MISSING_APP_KEY","message":"Header x-app-key is missing."}`; prod returns 401 once `x-version: v3` is sent, 404 otherwise. I did not use any sandbox or test credentials, because getting them requires a Webull login and application.

Unresolved doc ambiguity: the market-data docs distinguish a "Display Solution" (broker-oriented `broker-market-data-api` pages, 60/60s) from a "Non-Display Solution" (300/60s); the page that says which one a retail API-key holder is on was not found. Plan on 60/60s x 100 symbols per snapshot call (about 6,000 markets/min) and use MQTT for anything hotter.

---

## 5. Trade path (programmatic, but only for a Webull account holder)

- **Endpoints (POST, H, SDK `webull/trade/request/v3`):** `/trading/orders/preview`, `/trading/orders/place`, `/trading/orders/replace`, `/trading/orders/cancel`; GET `/trading/orders/get` (`account_id`, `client_order_id`), order history/open orders, `/trading/accounts/list`, balance, positions. Preview returns `estimated_cost` and `estimated_transaction_fee` ("including exchange, clearing, and commission fees").
- **Order body (H):** `{account_id, new_orders:[{combo_type:"NORMAL", client_order_id, instrument_type:"EVENT", market:"US", symbol, order_type:"LIMIT", entrust_type:"QTY"|"AMOUNT", side, quantity, limit_price, time_in_force, event_outcome:"yes"|"no", event_trade_mode?}]}`.
- **Order types:** LIMIT only. "Market-style" = `event_trade_mode: TRADE_IN_AMOUNT | TRADE_IN_CONTRACT` (best available price, `limit_price` ignored). Amount orders: BUY + FOK only. TIF `DAY, GTC, IOC, GTD, FOK` per the live guide; the Broker API guide and the Webull skill code still say "limit/day only" (stale or narrower for partners) (H, conflicting). Algo orders (TWAP/VWAP/POV) are stock-only. Max order $50,000 and 500,000 contracts in the Broker API guide; the Trading API says limits vary by account, agreement and instrument (H).
- **Signing:** HMAC-SHA1 over the request with the app secret, server-side; no wallet signature of any kind (H).
- **Prerequisites that block unattended onboarding:** Webull Events account opened in the app, agreements signed (sports needs an extra agreement), API application reviewed by Webull, app-approved 2FA token (H).
- **Third-party route:** the **Connect API** lets a platform such as TradingView or SnapTrade have users authorise it by OAuth 2.0 and then trade "US stocks, options, futures, crypto, and event contracts, subject to the permissions granted" (hosts `us-oauth-open-api.webull.com` prod, `oauth-open-api.sandbox.webull.com` sandbox; application form on webull.com) (H, connect-api/about-connect-api). The **Broker API** lets an FDIB embed event contracts in its own product (H, broker-api/event-contract-guidance).
- **Agent tooling published by Webull (H):** `webull-openapi-skills` (CLI/skill with `place_event_order`, `replace_event_order`) and `webull-openapi-mcp` (event market data and order tools). The skill requires explicit user confirmation for order-mutating actions.

---

## 6. PayBox reachability

**No.** Webull event contracts are USD positions in a KYC'd US futures account. A PayBox wallet (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) has nothing to sign: there is no transaction proposal, EIP-712 order, token approval or on-chain deposit address for this product, and the only credential is an HMAC key pair tied to a personal brokerage login plus an app-approved token (H for the API model, M for the PayBox conclusion). A server holding the user's Webull app key/secret could call the API, but that is a brokerage-credential integration outside PayBox's wallet-signing model, and the Trading API is documented for natural persons (H); use Connect (OAuth) if this is ever pursued. PayBox was not queried.

---

## 7. Fees

| Component | Finding | Tag |
|---|---|---|
| Webull commission | **$0.02 per contract** in one comparison (Finder, "Updated Jun 24, 2026": "A flat $0.02 per contract", about $4 on 200 contracts at $0.50). Webull's own pricing page and prediction-markets page carry **no event-contract fee line** (pricing page: NOT FOUND, only stock/option/index-option fees) | M for $0.02; H for the absence on Webull's pages |
| Promotions | "$0 commission (exchange fees apply)" on Big Game contracts (2026-01-27). The developer docs only say "see the pricing page" | H |
| Exchange fee | Charged on top of commission ("exchange fees apply"). Kalshi's own fee: series `KXRATECUTCOUNT` has `fee_type: quadratic_with_maker_fees`, `fee_multiplier: 1` (H, Kalshi API). Coefficient taker `0.07 x C x P x (1-P)`, rounded up, maker `0.0175 x ...` where applicable - from third-party guides, not the Kalshi PDF (M, per sibling note `docs/research/08-venues-polymarket-kalshi.md`) | H / M |
| Who pays | The customer pays commission + exchange (+ clearing) fee; the API's `estimated_transaction_fee` (preview) and order-detail `commission{actual,receivable}` and `fees[]` expose the actual numbers | H |
| Withdrawal/funding | Wire out $25, debit-card out 1.75% (next.io review, 2026-10-15) | M |

Net: for a taker the all-in cost is Kalshi's fee schedule plus about $0.02 per contract (if the Finder figure holds), so Webull is never cheaper than Kalshi direct except during promotions. Use `/trading/orders/preview` as the source of truth, not the formula.

---

## 8. Resolution and dispute risk

- Resolution is **Kalshi's**: "The Exchange determines the outcome based on the contract's pre-defined, authoritative source (e.g., government agency announcement, exchange data)" and settlement is automatic at $1.00 / $0.00 with proceeds credited to the available balance (H, Broker API guide). The Kalshi series record names the settlement source (here the Federal Reserve) and a `settlement_timer_seconds` of 500 for the sampled market (H, Kalshi API).
- **Extra Webull-layer risks (H/M):** trading is halted "at the pre-defined stop_trading_time" and new orders and modifications are refused during settlement; Webull can change hours without notice; `tradable_status` may be `CO`/`NT` while the same Kalshi market is open; sports contracts need an additional agreement. An FCM can also impose account-level restrictions and position limits ("allowed position actions and maximum order size vary by account, agreement, and instrument").
- Dispute risk is Kalshi's risk (rule-text edge cases, "determined early" clauses); Webull adds no independent oracle. Do not treat a Webull and a Polymarket pair as the same contract without comparing the Kalshi rule text (see `08-venues-polymarket-kalshi.md`, point 7).

---

## 9. Geo, ToS, automation

- **US only.** The OpenAPI "Supported Markets" table lists Event Contracts for the United States only; orders use `market: "US"`, quote category `US_EVENT` ("currently only US_EVENT is supported") (H). Other-region Webull entities (HK, JP, SG, UK, EU, ...) have API hosts but no event-contract product in the docs (M, absence).
- **States:** the consumer FAQ item "What states have Event Contract restrictions?" has no answer text on the page (H). Finder says access "mirrors Kalshi" and notes sports contracts face legal challenges in NV, NJ, MD, MT and AZ (M, dated 2026-06-24). Webull's quarterly releases warn of changing regulatory interpretation or enforcement for event contracts (H).
- **Automation is allowed.** The official FAQ lists "Automated trading strategies (e.g., algorithmic or quantitative trading)" as a use case (H, developer.webull.com/apis/docs/faq.md). Registering an app key requires ticking an agreement ("I have read and accept the agreement"), whose text I did not retrieve (NOT FOUND). The Trading API is for "natural persons"; multi-user or resale use belongs under Connect or Broker (H).
- **Data redistribution:** not addressed for event data; the market-data page talks about display vs non-display usage for exchange data and says event contracts need no extra subscription (H). Republishing Webull quotes in a product is untested territory (NOT FOUND).

---

## 10. Liquidity

- **Webull-specific volume/OI: NOT FOUND.** Q1 and Q2 2026 results releases give company-wide metrics only (Q2: customer assets $28.5B, DARTs 1.6M) and "no prediction-market metrics" (H, 2026-05-21 and 2026-08-19). The 2026-01-27 release claims "significant quarter-over-quarter growth" with no number (H).
- **Underlying depth (shared with Kalshi), 2026-10-19 (H, Kalshi public API):** `KXRATECUTCOUNT-26DEC31-T3` volume 694,837.61 contracts, open interest 371,017.68 contracts, 24h volume 130.47, yes bid/ask $0.0020/$0.0030 with 148.30 / 77.58 contracts at the top. That is the book a Webull order would meet. Kalshi's platform-wide size is covered in the Kalshi venue spec (lifetime volume past 100B USD in June 2026 is reported as M in the DFlow note) and is not repeated here.
- **Order caps (H, Broker API guide):** $50,000 and 500,000 contracts per order.
- Webull's snapshot `volume`/`open_interest` are documented as contract counts for the market; whether they are Webull-only or exchange-wide is not stated (docs example: volume 32, OI 14,240, which looks exchange-wide for a thin market; M).

---

## 11. Event coverage and arbitrage overlap

Because the catalogue is Kalshi's (or a subset), overlap is the same as Kalshi's with every other venue, and it adds no new legs:

| Category (Webull API) | Overlaps (through Kalshi) | Notes |
|---|---|---|
| Economics (Fed rate decisions and cut counts, CPI, unemployment, GDP) | Polymarket, Limitless, Predict.fun, Opinion, XO | Launch focus per press coverage (M); the docs' own examples are mostly `KX...` economics tickers (H) |
| Financials / Index (S&P, Nasdaq hourly ladders) | Polymarket price ladders, crypto/FX venues | Index hours 08:00-16:00 ET (H) |
| Crypto (BTC/ETH price ladders) | Polymarket, Limitless, Hyperliquid outcomes | Webull hours 08:00-18:00 ET Mon-Fri (H); Kalshi crypto trades more hours (M) |
| Sports | Polymarket, Sx.bet, ProphetX, Underdog etc. | 24/7, extra agreement required (H); sports availability was disputed by older reviews but Webull's 2026-01-27 release and its own page list sports (H) |
| Politics | Polymarket, Manifold, PredictIt | In the API category list; absent on the consumer page and said to be app-only by next.io; untested (M) |
| Culture, Climate/Weather, Science & Tech, Transportation | Few overlaps | Mostly Kalshi-only |

For the aggregator: every Webull symbol maps 1:1 to a Kalshi ticker; do not count Webull as an extra price for a Kalshi market.

---

## 12. Shares liquidity with

**Kalshi (effectively 100%, H for the identity of the exchange and tickers, M for "no Webull-internal matching").**

- Webull's press release: "Webull Connects to Kalshi" - events provided by Kalshi, Webull "plans to become a clearing member" (H, 2025-02-12); Jan 2026 release names Kalshi as "a CFTC-regulated prediction market exchange" (H).
- Developer docs: "An event is a collection of markets and the basic unit that members should interact with on Kalshi" (H, Broker API guide; the wording reads like Kalshi's own glossary, M); all example symbols are Kalshi tickers (`KXRATECUTCOUNT`, `KXCPI-26JAN-T0.3`, `KXNHLGAME-26JAN21ANACOL-ANA`, `KXNBAGAME-...`) (H, SDK samples).
- Identity check, 2026-10-19 (H): Webull docs example market `KXRATECUTCOUNT-25DEC31-T3` is named "Will the Fed cut rates 3 times?" with `yes_condition` "Exactly 3 cuts"; Kalshi's public API returns for `KXRATECUTCOUNT-26DEC31-T3` the title "Will the Fed cut rates 3 times?" and `yes_sub_title` "Exactly 3 cuts", rules "If the Fed cuts 3 times starting Jan 1, 2026 and before 2027, then the market resolves to Yes" (fixture `kalshi-public-api_market_KXRATECUTCOUNT-26DEC31-T3.json`). Different year edition, same template.
- Not independently proven here: that Webull orders rest in Kalshi's central book (rather than being internalised) - I could not take a live Webull quote to compare with Kalshi's top of book, as the Robinhood note did for that venue. Industry structure (FCM routing to a DCM) and the doc wording make it near-certain (M).
- Open: Robinhood routes to several exchanges (Kalshi, ForecastEx, Rothera, CDNA). Webull's schema has **no `exchange` field** on markets, so whether Webull also lists non-Kalshi contracts cannot be told from the docs; every symbol I saw is `KX...` (M).

---

## 13. If an adapter were ever built (notes for the orchestrator)

- Do not add Webull to the price graph. Map `symbol` straight to the Kalshi ticker and drop it.
- Only conceivable job: an **execution venue plugin** ("send this Kalshi leg through the user's Webull account") via Connect API OAuth, with `/trading/orders/preview` for fee-aware sizing. It cannot be done from a PayBox wallet and needs per-user KYC, an Events account and a partner application.
- Hours: if Webull quotes are ever read, gate on `tradable_status == "OC"` and the per-category hour table; outside hours, Kalshi may still quote.
- Quirks to code defensively against: strings for all numerics; `price` unit contradiction (dollars vs cents) between OpenAPI and SDK docstrings; `depth` asks present in OpenAPI but "no asks" in the SDK docstring; `events/list` example for `series_symbol` is a category name (`ECONOMICS`) while the SDK sample passes a series symbol (`KXRATECUTCOUNT`); the docs' markets example gives `price_ranges.step` 0.01 while Kalshi uses 0.001 on that market.

---

## 14. Not found

- Webull-specific event-contract volume, open interest, user counts or revenue (searched: Q1 and Q2 2026 results releases, Jan 2026 release, Yahoo and 24/7 Wall St. summaries; the web search budget was exhausted before a targeted search could be run).
- Webull's fee schedule line for event contracts (searched: webull.com/pricing, webull.com/prediction-markets, webull.com/disclosures, webull.com/fcm-disclosures, developer docs). Only the third-party $0.02 figure exists.
- The OpenAPI agreement text and any clause on automated or multi-account use, or on redistributing quotes.
- A statement from Webull itself that orders are routed to Kalshi's order book (Webull's own pages and FCM disclosures do not name Kalshi; the press releases and developer docs do).
- Live (non-example) response payloads for any event endpoint, the real catalogue size, and whether Politics is enabled.
- Webull's list of restricted states; the answer text of the FAQ item.
- Webull-side position limits per account/contract.
- Whether Webull ever lists non-Kalshi exchange contracts.
- Any Webull event-contract regulatory action or suspension in 2026 (the earlier Robinhood CFTC episode is in the Robinhood note, not here).

---

## 15. Suspicious content

- None found. The Webull docs publish `llms.txt`, an MCP server and "Agent Skills" aimed at AI assistants; the skill's `SKILL.md` instructs an AI to obtain user confirmation before order-mutating calls and to prepend a disclaimer to output. These are the vendor's own tool instructions; they were read as data and not acted on. A web-search summary claimed the US sandbox needs "no application ... shared test credentials"; the docs I read directly say a Webull login and an auto-approved sandbox application are required, so that claim was discarded.

---

## 16. Sources

Primary (H):
- https://www.webull.com/prediction-markets (2026-10-19) - categories, Events account, Webull Futures LLC, no SIPC
- https://www.webull.com/disclosures and https://www.webull.com/fcm-disclosures - FCM identity; no Kalshi mention
- https://www.webull.com/pricing - no event-contract fee line
- https://developer.webull.com/apis/docs/ , /apis/llms.txt , /apis/docs/sdk/ (hosts), /apis/docs/rate-limits , /apis/docs/faq.md , /apis/docs/about-open-api.md
- https://developer.webull.com/apis/docs/trade-api/event-contract.md (copy in fixtures) ; /trade-api/overview ; /trade-api/faq.md
- https://developer.webull.com/apis/docs/reference/event-categories-list.md, event-series-list.md, event-events-list.md, event-market-list.md, event-snapshot.md, event-depth.md, event-tick.md, event-bars.md, common-order-preview.md, common-order-place.md, order-detail.md, account-list.md
- https://developer.webull.com/apis/docs/authentication/overview , /authentication/token.md , /authentication/IndividualApplicationAPI.md
- https://developer.webull.com/apis/docs/market-data-api/overview/ and /market-data-api/faq.md
- https://developer.webull.com/apis/docs/connect-api/about-connect-api.md and https://developer.webull.com/apis/docs/broker-api/event-contract-guidance.md
- https://github.com/webull-inc/webull-openapi-python-sdk (via gh api: `webull/core/data/endpoints.json`, `webull/data/request/get_event_*.py`, `webull/trade/request/v3/*.py`, `webull/trade/events/events.proto`, `samples/data/data_client_event.py`, `samples/data/data_streaming_client_event.py`, `samples/trade/trade_client_v3_event.py`)
- https://github.com/webull-inc/webull-openapi-skills (`SKILL.md`, `webull_skill/trading/event_order.py`, `references/llms_us.md`, `DISCLAIMER.md`) and https://github.com/webull-inc/webull-openapi-mcp (file list only)
- https://www.prnewswire.com/news-releases/webull-connects-to-kalshi-to-offer-investors-innovative-prediction-markets-302373541.html (2025-02-12)
- https://www.prnewswire.com/news-releases/webull-introduces-0-commission-trading-on-pro-football-big-game-prediction-markets-302670228.html (2026-01-27)
- https://www.prnewswire.com/news-releases/webull-reports-second-quarter-2026-financial-results-302855581.html (2026-08-19) and .../webull-reports-first-quarter-2026-financial-results-302779540.html (2026-05-21)
- https://www.prnewswire.com/news-releases/webull-launches-institutional-platform-for-brokers-hedge-funds-advisors-fintechs-and-financial-institutions-302818682.html (2026-07-07)
- https://www.prnewswire.com/news/webull-corporation/ (release list)
- https://api.elections.kalshi.com/trade-api/v2/markets/KXRATECUTCOUNT-26DEC31-T3 and /series/KXRATECUTCOUNT (2026-10-19)
- Unauthenticated probes of api.webull.com, api.sandbox.webull.com, events-api.webull.com, data-api.webull.com (2026-10-19)

Secondary (M):
- https://predscope.com/guide/prediction-markets-q1-2026-report (lists Webull as a fiat platform, CFTC-regulated since 2025; no volume, no Kalshi mention)
- https://www.finder.com/investments/event-contracts-prediction-markets (updated 2026-06-24; $0.02/contract, mirrors Kalshi states)
- https://next.io/prediction-markets/webull/ (updated 2026-10-15; sports and politics app-only)
- https://predictionmarketsworld.com/en-us/operators/webull/ (May 2026; economics/financials only; conflicts with Webull's own release)
- https://finance.yahoo.com/news/webull-bull-big-game-push-060755476.html and https://247wallst.com/investing/2026/08/04/prediction-where-will-webull-stock-be-in-5-years/ (no figures)
- Sibling notes in this repo: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/robinhood-prediction-markets.md`, `docs/research/venues/dflow-prediction-markets.md`

---

## 17. Fixtures

`docs/research/fixtures/webull-event-contracts/`:
- `unauthenticated-probes_2026-10-19.json` - 401/404 results from Webull hosts (CDN and request-id headers stripped)
- `kalshi-public-api_market_KXRATECUTCOUNT-26DEC31-T3.json` - Kalshi's live record for the ticker used in Webull's docs (identity and depth proof)
- `webull-docs_event-endpoints.fields-from-openapi-docs.json` - field lists for the event catalogue, quote, tick, bar and order endpoints, extracted from the official OpenAPI pages (doc examples, not live responses)
- `webull-docs_trade-api_event-contract.md` - copy of the official event-contract trading guide
