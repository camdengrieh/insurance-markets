# Webull prediction markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Sources: official Webull consumer pages, help-center pages, developer docs (raw `.md` twins), `gh api` reads of Webull's public SDK repos, press releases, a handful of unauthenticated GETs to Webull API hosts (all refused without credentials), and unauthenticated GETs to Kalshi's public API. No account, key, wallet, signature, sandbox application, POST/PUT/DELETE or browser automation. No PayBox tool was called. All third-party text was treated as untrusted data. The shared WebSearch budget ran out mid-session (three of my searches ran), so a few checks were done by fetching known URLs only (see "Not found").

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, search-result summary, or my inference from first-hand data; **L** = weak or stale.

Relation to existing notes: `docs/research/venues/webull-event-contracts.md` (written earlier today) covers the same product under another slug. This note re-verified its main claims independently and adds three things it listed as gaps: (1) Webull's own fee statement, (2) Webull's own state-restriction text, (3) first-hand proof that Webull's displayed prices and volumes are Kalshi's. Where the two notes disagree, this note says so. Treat the two as one venue; do not count it twice in the registry.

---

## 0. Verdict

**adapter_priority = skip** as an independent venue adapter. Confidence: high on the verdict, medium on fee mechanics, low on Webull-only volume (not published).

1. **Live (H, 2026-10-19).** Consumer page, help center and developer docs are current; SDK repos pushed 2026-10-17. Product launched Q3 2025, sports added by 2026-01-27 (Webull release).
2. **Not an independent leg (H).** The Webull page's own embedded payload uses Kalshi tickers as Webull market symbols (`KXBTCMINY-27JAN01-55000.00`), the three BTC strike markets it shows quote exactly the same yes/no asks as Kalshi's public API, and its event volume (5,771,049) equals the sum of Kalshi's per-market volume (5,771,050.75) to within 2 contracts (fixture `webull-vs-kalshi_identity-check_2026-10-19.json`). Webull's help center names Kalshi in the fee FAQ and its press releases name Kalshi as the partner exchange. This is a distribution front end for Kalshi's order book.
3. **No public read API (H).** Rich event-contract endpoints exist but every call needs a Webull brokerage account, an approved app key and HMAC-SHA1 signing. Unauthenticated calls return 401 (fixture). Kalshi's public API gives the same data without keys.
4. **Not reachable from a PayBox wallet (H for the API model, M for the conclusion).** USD in a KYC'd US futures-commission-merchant account. No chain, token, on-chain signature or deposit address.
5. **Worth keeping:** (a) Webull symbol == Kalshi ticker, so any Webull-to-Kalshi map is the identity; (b) Webull publishes Kalshi-derived restrictions and fees that matter if a user executes Kalshi legs through a Webull account; (c) the Connect API (OAuth 2.0, event contracts in scope) is the sanctioned route for a third-party platform to trade on a user's Webull account.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| https://www.webull.com/prediction-markets serves "Turn Your Predictions into Trades", categories Sports, Crypto, Financials, Economics, Culture, Climate, Science & Tech, a "$20 Voucher" promo and a live "hot events" list (KXNFLGAME, KXBTCMINY, KXNASDAQ100U) with in-play NFL prices | 2026-10-19 | H |
| Help center pages 11052 / 11053 / 11174 / 11176 (event contracts: trading, fees, eligibility, opt-out) served; undated | 2026-10-19 | H (currency of text L) |
| Developer docs `.../trade-api/event-contract.md` and event reference pages served; `webull-inc/webull-openapi-python-sdk` pushed 2026-10-17T07:57Z, `-skills` 2026-10-17T08:05Z, `-mcp` 2026-10-17T08:04Z (Apache-2.0) | 2026-10-17 | H (gh api) |
| Press release, "NEW YORK, Jan. 27, 2026": Webull "offers sports prediction markets through its partnership with Kalshi, a CFTC-regulated prediction market exchange"; "$0 commission (exchange fees apply)"; rollout Q3 2025; "significant quarter-over-quarter growth" (no numbers) https://www.prnewswire.com/news-releases/webull-introduces-0-commission-trading-on-pro-football-big-game-prediction-markets-302670228.html | 2026-01-27 | H |
| Original launch headline "Webull Partners With Kalshi to Offer Event-Contract Wagers" (Bloomberg, search-result title only) and PR Newswire "Webull Connects to Kalshi ..." | 2025-02-12 | M (history, not status) |
| Lawsuit by Baltimore filed 2026-08-13 names "Webull Corporation, Webull Financial" among defendants in the Kalshi complaint (crypto.news, article dated 2026-08-14) | 2026-08-14 | M (secondary, one source) |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** broker/frontend. "Webull Futures LLC is a CFTC-registered FCM and NFA member. Event contract accounts are not protected by SIPC." (https://www.webull.com/prediction-markets, embedded FAQ). The account is an "Event Contract account" that "must first have either an Individual Cash or Individual Margin account" (https://www.webull.com/help/faq/11176-Event-Contract-Eligibility-Restrictions-and-Opt-Out) and is funded from the linked brokerage account (help 11052).
- **Model (H):** binary yes/no only. Settles $1 if the event occurs, $0 if not. Hierarchy Category > Series > Event > Market; the market (one yes/no outcome) is the traded unit (developer docs). Nine API categories: economics, financials, politics, entertainment, science and technology, climate and weather, transportation, crypto, sports; sports "may require an additional agreement". The consumer page lists seven (no Politics).
- **Venue type:** order book of the underlying exchange (Kalshi), shown to the user as a depth-of-market ladder (help 11053). Not an AMM, not parimutuel, no tokens. Orders are limit orders only; "Quick Order" and API `TRADE_IN_AMOUNT`/`TRADE_IN_CONTRACT` modes are best-available-price variants (H, dev docs). "Sell-to-open orders are not supported" (H, help 11053): you can only sell what you hold. Buying "No" is the way to short.
- **Prices:** decimal-dollar strings in the OpenAPI examples (`"0.13"`); both yes and no asks are shown (`yes_ask = 1 - no_bid`, confirmed by the docs example: yes ask 0.13, no bid 0.87) (H).
- **Trading hours - Webull's two sources conflict (H, both):** developer docs say Crypto Mon-Fri 08:00-18:00 ET, Index 08:00-16:00, Economic Mon-Fri 08:00-23:00, Sports 24/7 excluding maintenance (https://developer.webull.com/apis/docs/trade-api/event-contract.md); the consumer FAQ says Index 8-4 and "Cryptocurrency, Economic and Sports ... 24hrs a day, 7 days a week", "subject to maintenance windows". "Webull may adjust the trading hours for specific Contracts without notification" (broker-api guide). Per-market `tradable_status` (`OC` / `CO` liquidate-only / `NT`) is the only reliable gate.

---

## 3. Chains and collateral

None. Collateral is **USD cash** in the Webull account; contracts are "fully funded at purchase" (help 11052), payouts are "swept back into your linked brokerage account" (H). No wallet, chain, token or on-chain transaction anywhere in the product.

---

## 4. Read API (official, authenticated only)

| Item | Finding | Tag |
|---|---|---|
| Existence | **official-authenticated**: Webull OpenAPI (US region) with Trading API and Market Data API; Broker API and Connect API for partners | H |
| Docs | https://developer.webull.com/apis/docs/ ; index https://developer.webull.com/apis/llms.txt (every page has a `.md` twin) | H |
| Hosts (prod) | HTTP `https://api.webull.com`; trading-event gRPC `events-api.webull.com`; market-data MQTT `data-api.webull.com`. Sandbox: `api.sandbox.webull.com`, `events-api.sandbox.webull.com`, `data-api.sandbox.webull.com`. The SDK also lists non-US region hosts (hk, jp, sg, uk, eu ...) but the docs show event contracts for US only | H (SDK `endpoints.json`, docs) |
| Catalogue (GET) | `/trading/instruments/event-contracts/categories/list`, `/series/list`, `/events/list`, `/markets/list` (`series_symbol`, `event_symbol`, `symbols` max 100, `expiration_date_after`, `pagination_key`) | H |
| Market data (GET) | `/market-data/event-contracts/snapshots/list` (`symbols` max 100, `category=US_EVENT`), `/depths/list`, `/ticks/list`, `/bars/list`. Partner "Display Solution" extras: sports filter, milestones, tags, live data, game stats | H (reference pages, llms.txt) |
| Snapshot shape | `instrument_id, symbol, name, price, volume, last_trade_time, open_interest, yes_bid, yes_bid_size, yes_ask, yes_ask_size, no_bid, no_bid_size, no_ask, no_ask_size` (all strings except `last_trade_time` ms int). Docs: open_interest = "Number of contracts bought ... disconsidering netting" | H (docs example; fixture `webull-docs_event-snapshot_and_market-list.shapes.json`) |
| Market shape | `instrument_id, symbol, name, yes_condition, series_id/symbol/name, event_symbol/name, last_trading_date, status, tradable_status, can_close_early, expected_exp_date, latest_exp_date, payout_date, fractionable, price_ranges` | H (docs example) |
| Resolution data | No result/outcome field in the market schema; settlement is visible only as status change and payout. Use Kalshi's `result`/`expiration_value` | H (absence in schema), M (inference) |
| Auth headers | `x-app-key`, `x-timestamp` (UTC ISO8601), `x-signature` (HMAC-SHA1, app secret used only to sign), `x-signature-algorithm`, `x-signature-version: 1.0`, `x-signature-nonce`, `x-version: v3`; optional `x-access-token` if 2FA | H (reference pages; the 404 without `x-version: v3` is from the sibling note, not retested) |
| Access gate | Existing Webull account + API application, "1 to 2 working days"; sandbox auto-approved "within a few minutes"; Trading API is "a direct trading interface designated for natural persons"; ticking "I have read and accept the agreement". 2FA token must be approved in the Webull app (sibling note, H there; not re-read) | H / M |
| Rate limits (prod) | Event instruments 60/60s and quotes 60/60s (Display); **snapshot/depth/bars/tick 300/60s (Non-Display)**; place and cancel 600/60s; order history/open orders/order detail 2/2s; sandbox 30/60s. HTTP 429, "temporary IP-level blocking" on repeat. Which tier a retail key falls under is not stated (https://developer.webull.com/apis/docs/rate-limits.md) | H |
| Streaming | MQTT over WebSocket/TCP for quotes/snapshots/ticks; gRPC for order and position events (SDK sample/proto; sibling note) | H / M |
| Fees for API | "no extra charges for API access. Trading fees match the Webull App, and market data subscriptions are bought separately" (https://developer.webull.com/apis/docs/faq.md) | H |
| Unofficial surface | The consumer page server-renders a JSON payload (series, events, markets, yes/no asks, event/series volume) to anonymous visitors. It is a front-end payload, not a documented API; I used it only once, to compare with Kalshi. Not recommended as a data source: Kalshi's public API is the same data, documented and open | H (observed), M (advice) |

**Live response shapes of the official API could not be confirmed** - there is no unauthenticated endpoint. Confirmed 2026-10-19 (fixture `unauthenticated-probes_2026-10-19.json`): prod and sandbox both return HTTP 401 `{"error_code":"MISSING_APP_KEY","message":"Header x-app-key is missing."}` for catalogue and snapshot paths.

---

## 5. Trade path (programmatic, only for a Webull account holder)

- **Endpoints (H, SDK/docs):** POST `/trading/orders/preview`, `/place`, `/replace`, `/cancel`; GET order detail/history/open orders, account list, balance, positions. Order body has `instrument_type:"EVENT"`, `market:"US"`, `symbol` (Kalshi ticker), `order_type:"LIMIT"`, `side`, `quantity`, `limit_price`, `time_in_force`, `event_outcome:"yes"|"no"`, optional `event_trade_mode`.
- **TIF:** `DAY, GTC, IOC, GTD, FOK` depending on mode (trade-api guide, H); the broker-api guide still says "limit orders with a 'day' time-in-force are supported" (H, conflicting, likely stale or partner-specific). Max order $50,000 / 500,000 contracts in the broker guide (H).
- **Signing (H):** HMAC-SHA1 with an app secret; no wallet signature.
- **Webull advertises this use:** "execute event contracts programmatically using our OpenAPI" (consumer page, H).
- **Third-party route (H):** **Connect API** - OAuth 2.0 for "third-party platforms (e.g., TradingView or SnapTrade)" to trade "Stocks, options, futures, crypto, and event contracts, subject to the permissions granted"; prod host `us-oauth-open-api.webull.com`, 90 requests/min per user; apply with company name and redirect URL (https://developer.webull.com/apis/docs/connect-api/about-connect-api.md, H).
- **Blockers to unattended onboarding:** Webull account + Event Contract account, agreements (sports extra), API application review, app-approved 2FA token.

---

## 6. PayBox reachability

**No (H for the API model, M for the conclusion).** There is nothing for a PayBox wallet on Base, Ethereum, BNB, Arbitrum, Polygon or Solana to sign or fund: collateral is USD at a US FCM, the credential is an HMAC key pair bound to a personal brokerage login, and the Trading API is documented for natural persons. A server holding a user's Webull key could call it, but that is a brokerage-credential integration outside PayBox's wallet model. Kalshi, the liquidity behind it, is likewise not wallet-reachable (covered in the Kalshi spec). PayBox was not queried.

---

## 7. Fees

| Component | Finding | Tag |
|---|---|---|
| Webull's own statement | "Webull charges a commission of $0.01 per contract" plus "the exchange charges an exchange fee of $0.01 per contract" = **$0.02/contract, charged on both opening and closing trades** (example: 100 contracts = $2.00 to open, $2.00 to close). "Neither Webull or Kalshi charge a settlement fee", so holding to settlement avoids the closing fee. https://www.webull.com/help/faq/11174-Event-Contract-Fees (undated) | H |
| Consumer FAQ | "$0.02/contract fees are included in the price you paid" (max-gain answer) | H |
| Promotions | "$0 commission (exchange fees apply)" on Big Game contracts, 2026-01-27; "$20 voucher" promo on the page today | H |
| Third-party | PredictionMarketsWorld (May 2026): "$0.02 per contract", described as covering platform and exchange fees combined | M (conflicts with Webull's split: still $0.02 total) |
| Kalshi's own schedule | Series `KXNFLGAME` has `fee_type: quadratic_with_maker_fees`, `fee_multiplier: 1` (Kalshi API, H). A flat $0.01 exchange fee therefore looks like a simplification of, or a different arrangement from, Kalshi's price-dependent formula; which is applied to Webull flow is not documented | H (series data) / M (inference) |
| Funding | Review sites cite ACH free, wire $8 in / $25 out (Dimers via search summary); PredictionMarketsWorld: ACH 1-3 days | M / L |
| Who pays | Customer pays commission + exchange fee; `/trading/orders/preview` returns `estimated_transaction_fee` ("including exchange, clearing, and commission fees" per sibling note) | H / M |

Net: an all-in taker/maker cost on Webull is at least Kalshi's cost, plus up to $0.01/contract commission. Webull is never cheaper than Kalshi direct except in promotions. Use the preview endpoint as the source of truth, not a formula.

---

## 8. Resolution and dispute risk

- Resolution is **Kalshi's**: "The Exchange determines the outcome based on the contract's pre-defined, authoritative source ... the contract settles automatically ... settles all open positions at $1.00 (Yes) or $0.00 (No) ... proceeds are immediately credited to the client's available balance" (https://developer.webull.com/apis/docs/broker-api/event-contract-guidance.md, H). Kalshi names a settlement source per series (e.g. NFL: "the Governing League", https://www.nfl.com/) (Kalshi API, H).
- **Webull-layer risks (H):** trading halts when an event "enters its official counting or announcement phase"; no new orders or modifications during settlement; hours changeable without notice; account-level restrictions and a permanent self-exclusion mechanism (help 11176); legal exposure below.
- No independent oracle; dispute risk is Kalshi's (rule-text edge cases, early determination). Do not treat a Webull/Kalshi contract and a Polymarket contract as the same event without comparing rule text.

---

## 9. Geo, ToS, automation

- **US only (H):** docs list event contracts for the US market only (`market:"US"`, category `US_EVENT` "currently only US_EVENT is supported").
- **State restrictions (H, Webull's own text, undated):** "Currently, sports-related Event Contracts are not available to customers located in Nevada, Maryland, Connecticut, or Michigan. Event Contract availability may be subject to additional geographic restrictions ... Restrictions and product availability are subject to change." (consumer page FAQ; help 11176 says "residents of"). Michigan appears to be a recent addition in the wider market (a search summary says Robinhood blocked new Michigan sports contracts from 2026-09-09; M).
- **Legal exposure (M):** Baltimore sued Kalshi (complaint filed 2026-08-13) and also names "Webull Corporation, Webull Financial" and others; alleges unlicensed sports betting via sports contracts and "combos" (crypto.news, 2026-08-14). Missouri cease-and-desist letters (Sept 2026) went to Kalshi, Polymarket, Robinhood and Underdog; Webull is not mentioned in The Block's 2026-10-18 article (H for the absence). Webull's own filings mention regulatory risk for event contracts (sibling note).
- **Automation (H):** the OpenAPI FAQ lists "Automated trading strategies (e.g., algorithmic or quantitative trading)" as a use case, and the product page markets programmatic event-contract execution. The Trading API is for natural persons; multi-user/resale belongs under Connect or Broker (H). The text of the OpenAPI agreement and any data-redistribution rule were not retrieved (NOT FOUND).

---

## 10. Liquidity

- **Webull-only volume / OI / users: NOT FOUND.** Webull's releases give no event-contract metrics ("significant quarter-over-quarter growth", 2026-01-27, H).
- **The book Webull orders meet is Kalshi's (H, 2026-10-19):** page "hot events" carry exchange-wide figures - series `KXNFLGAME` `seriesVolume` 7,882,412,548 (contracts; rank key `seriesActive.volume`), event `KXNFLGAME-26OCT18DALGB` `eventVolume` 26,767,301 vs Kalshi's current sum 30,172,474.85 (game in progress at render; Webull value is an older cache), event `KXBTCMINY-27JAN01` 5,771,049 vs Kalshi 5,771,050.75. Kalshi shows `KXRATECUTCOUNT-26DEC31-T3` at 694,837.61 contracts and 371,017.68 OI (sibling fixture, same day).
- Platform context (M, search summary, not opened): DeFiRate reports Kalshi at $73.3B notional contracts over Sep 12 - Oct 11, 2026, about 76% of prediction-market volume; Kalshi sets daily records near $3.9B (Crypto Briefing, Oct 10-11). Treat as Kalshi's figures, not Webull's.
- Order caps: $50,000 and 500,000 contracts per order (broker guide, H).

---

## 11. Event coverage and arbitrage overlap

Overlap equals Kalshi's. It adds no new price.

| Webull category | Overlaps (via Kalshi) | Notes |
|---|---|---|
| Sports (NFL moneylines etc.) | Polymarket, sportsbooks, Sx.bet, ProphetX | Largest by volume on the page (series volume 7.9B contracts); blocked in NV/MD/CT/MI for Webull users |
| Economics (Fed cuts, CPI, jobs) | Polymarket, Limitless, Predict.fun, Opinion, XO | Webull docs examples are mostly these |
| Financials / Index (Nasdaq, S&P hourly ladders) | Polymarket price ladders, options/futures | Hourly `KXNASDAQ100U` markets; 08:00-16:00 ET window |
| Crypto (BTC price/low ladders) | Polymarket, Limitless, Hyperliquid outcomes | Shown on page (`KXBTCMINY`) |
| Politics | Polymarket, Manifold, PredictIt | In API category list, not on consumer page; availability untested |
| Culture, Climate, Science & Tech, Transportation | Few | Kalshi-only |

---

## 12. Shares liquidity with

**Kalshi (effectively 100%).**

- H: Webull's press release, "through its partnership with Kalshi" (2026-01-27); help-center fee FAQ names Kalshi as the exchange side of the fee; developer broker guide uses Kalshi's wording ("the basic unit that members should interact with on Kalshi").
- H: Webull market symbols are Kalshi tickers; Webull's displayed asks match Kalshi's asks exactly on three BTC strike markets; Webull's event volume matches Kalshi's market-volume sum to within 2 contracts (fixture). A Webull-only volume could not be this close to Kalshi's total.
- Not shown: that individual Webull orders rest in Kalshi's central book rather than being internalised (no live order was placed, by design). With an FCM routing to a DCM and quote-for-quote identical displays, this is near-certain (M).
- Internal codes on Webull's page: tickers carry `exchangeCode "DE"` / `disExchangeCode "WBDE"` and markets `exchangeId 230`, `securityType 15`. Webull has its own exchange code for the product; the meaning of "DE" is not documented (NOT FOUND).
- Webull's schema has no `exchange` field on markets, and every symbol seen is `KX...`. Whether it ever lists non-Kalshi contracts is not shown (NOT FOUND). A search for Underdog, CDNA, ForecastEx or Polymarket US ties to Webull returned none (M).

---

## 13. If an adapter were ever built

- Do not add Webull to the price graph; map `symbol` straight to the Kalshi ticker and drop it.
- Only conceivable job: an execution-route plugin ("send this Kalshi leg through the user's Webull account") via Connect OAuth, sized with `/trading/orders/preview`. Not doable from a PayBox wallet; needs per-user KYC, an Event Contract account and a Webull partner application.
- If Webull quotes are ever read: gate on `tradable_status == "OC"`; treat both hour tables (docs vs consumer FAQ) as unreliable; expect state-based sports blocks.
- Defensive coding: numerics are strings; `price` unit in SDK docstrings (cents) vs OpenAPI examples (dollars) per sibling note; Webull's market `price_ranges.step` example is 0.01 whereas Kalshi's market for the same template uses 0.001 (sibling note); depth asks present in OpenAPI vs "no asks" in SDK docstring (sibling note, not re-checked).

---

## 14. Not found

- Webull-only event-contract volume, OI, user counts or revenue (searched: Webull release of 2026-01-27, search results for Webull volume; search budget ran out before follow-ups).
- Any live (non-example) response from a Webull event endpoint; real catalogue size; whether Politics is enabled.
- The OpenAPI agreement text, any clause on redistributing quotes or multi-account use.
- A Webull statement that orders are routed into Kalshi's central book (Webull's consumer page, FCM disclosure and trade-api guide do not name Kalshi; the press releases, fee FAQ and broker guide do).
- Webull per-account position limits; Webull's own date stamps on help pages (all undated).
- Meaning of `exchangeCode "DE"` / `WBDE` / `exchangeId 230`.
- Confirmation from Webull of Michigan/other state changes beyond the four named.
- Webull's `/pricing` page event-contract line (not re-checked; the help-center fee page supplies the number).
- Any Webull-specific CFTC/state enforcement action beyond the Baltimore suit (searched: Missouri article; no mention of Webull).

---

## 15. Suspicious content

- None found. Fetched Webull consumer pages, help pages, developer docs, the Baltimore article, the Missouri article and the press release contained no text addressed to AI agents (the Webull site advertises "Agentic AI", "Webull OpenAPI", `llms.txt`, an MCP server and Agent Skills as products; these were read as data and not acted on). The OpenAPI reference lists a vendor support contact; not reproduced here.

---

## 16. Sources

Primary (H):
- https://www.webull.com/prediction-markets (page text and embedded FAQ strings, 2026-10-19)
- https://www.webull.com/help/faq/11174-Event-Contract-Fees ; /11176-Event-Contract-Eligibility-Restrictions-and-Opt-Out ; /11052-All-About-Event-Contracts ; /11053-Trading-Event-Contracts (undated)
- https://developer.webull.com/apis/docs/trade-api/event-contract.md ; /broker-api/event-contract-guidance.md ; /rate-limits.md ; /faq.md ; /authentication/IndividualApplicationAPI.md ; /connect-api/about-connect-api.md ; /reference/event-snapshot.md ; /reference/event-market-list.md ; /reference/event-depth.md ; /reference/event-events-list.md ; /reference/event-series-list.md ; https://developer.webull.com/apis/llms.txt
- https://github.com/webull-inc/webull-openapi-python-sdk (pushed 2026-10-17; `webull/core/data/endpoints.json`), https://github.com/webull-inc/webull-openapi-skills , https://github.com/webull-inc/webull-openapi-mcp (repo metadata only)
- https://www.prnewswire.com/news-releases/webull-introduces-0-commission-trading-on-pro-football-big-game-prediction-markets-302670228.html (2026-01-27)
- https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXBTCMINY-27JAN01 , /markets?event_ticker=KXNFLGAME-26OCT18DALGB , /series/KXNFLGAME , /markets/KXRATECUTCOUNT-26DEC31-T3 (2026-10-19)
- Unauthenticated probes of api.webull.com and api.sandbox.webull.com (2026-10-19)
- https://www.theblock.co/news/regulation/2026-10-18-crypto-com-novig-sue-missouri-over-sports-event-contracts-kalshi-polymarket-robinhood-hold-off-418866 (Webull not mentioned)

Secondary (M):
- https://crypto.news/kalshi-polymarket-sued-by-baltimore-over-sports-event-contracts/ (2026-08-14; Webull named in Kalshi complaint)
- https://predictionmarketsworld.com/en-us/how-to-trade-on-webull/ (updated May 2026; "route through Kalshi's DCM", $0.02, economics-focused, sports "may not be available")
- Search-result titles/summaries (pages not opened): Bloomberg 2025-02-12 partnership headline; DeFiRate Kalshi 30-day volume; Crypto Briefing daily volume records; Dimers Webull fees
- Sibling notes: `docs/research/venues/webull-event-contracts.md`, `docs/research/08-venues-polymarket-kalshi.md`

---

## 17. Fixtures

`docs/research/fixtures/webull-prediction-markets/`:
- `unauthenticated-probes_2026-10-19.json` - 401 results from Webull prod/sandbox
- `webull-page-ssr_hot-event-list_2026-10-19.json` - extract of the consumer-page payload (symbols, asks, series/event volume, internal exchange codes)
- `webull-vs-kalshi_identity-check_2026-10-19.json` - side-by-side asks and volumes, Webull page vs Kalshi API
- `kalshi-public-api_markets_event-KXBTCMINY-27JAN01.json` - Kalshi's live record for the event used in the identity check
- `webull-docs_event-snapshot_and_market-list.shapes.json` - field names and doc-example values (not live) from the official OpenAPI pages
- `webull-help-center_fee-hours-states-extracts_2026-10-19.json` - short extracts of Webull's own fee, hours and state text
