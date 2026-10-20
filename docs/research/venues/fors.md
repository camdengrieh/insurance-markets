# Fors (fors.market) - adapter spec

Researched 2026-10-19. READ-ONLY: official site and docs (WebFetch, curl GET), the public web-app JS bundle read as text (never executed), unauthenticated GETs to `api.fors.market` (the host the public web app itself calls) and to `data-api.polymarket.com`. No account, no wallet, no key, no POST/PUT/DELETE, nothing signed, no browser automation. WebSearch: one extended query worked, then the session search budget ran out, so third-party coverage is thin.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (older than 6 months).
All third-party text (docs, bundle, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/fors/` (10 files, each < 14 KB).

## 0. Verdict

**adapter_priority: P2** (signal and benchmark only). As an execution or arbitrage leg: **skip**.

1. Live (H, section 1) but it is **a broker/aggregator, not a venue**. It has no markets or liquidity of its own. Every order lands on Polymarket, Kalshi (via dFlow on Solana), Opinion, Predict.fun or Limitless. Quoting Fors as a leg would double-count those venues.
2. No documented public API. The docs "API Access" page names no endpoint, host, auth scheme or limit. The roadmap says the "Partner API" opens for pilot integrations in Q3 2026 and API tiers go live in Q4 2026 (H).
3. An **undocumented** REST API (`api.fors.market`) backs the web app. Market-data routes answer without auth (H, section 4). Trading, balances, arbitrage and bridge routes need a Privy-issued JWT (401 otherwise). No Terms of Service was found, so reuse rights are unknown.
4. Trading path is a Fors-hosted flow: Privy login, Fors-provisioned per-chain "trading wallets" (Safe-style), server-side order submission. A PayBox wallet cannot place orders through it (section 6).
5. Realised flow is small: Fors-attributed Polymarket builder volume was $4.87M for 2026 to date (H) and is about $0 since 2026-09-22 (H, section 9).
6. Worth keeping as a **competitor benchmark**: its public catalog exposes a pre-computed cross-venue event match table with a written justification per match (section 8). Useful to cross-check our own linking layer. Do not make it a production dependency.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://fors.market` | 200, title "Prediction & Betting Markets Aggregator", "BETA VERSION", beta-tester signup, $1000 giveaway banner | H (https://fors.market) |
| `https://app.fors.market` | 200, Vite SPA "Fors Ultimate App"; S3 object `last-modified: Wed, 23 Sep 2026` | H (curl headers) |
| `https://api.fors.market/health` | 200 `{"status":"healthy","service":"fors-aggregator"}` on 2026-10-19 | H |
| `GET /market/events_live` | rows with `updated_at` 2026-10-19T01:48Z and 2026-10-19T01:58Z | H |
| Press release | Chainwire, dateline 2026-01-13: beta launch, smart routing "still in development" (>9 months old, so L for feature status) | M (https://www.investing.com/news/cryptocurrency-news/fors-launches-beta-to-aggregate-prediction-markets-across-solana-ecosystem-4445295) |
| MadeOnSol listing | health 100/100, last updated Oct 2026, one 5-star review dated 2026-07-30; lists "limited public track record" | M (https://madeonsol.com/tools/fors) |
| Blog | 12 posts, 2025-11 to 2026-03 (dates inferred from upload folders); nothing newer on the blog index | M (https://fors.market/blogs/) |
| GitHub | `gh search` for fors-market / forsmarkets: no repo. NOT FOUND | H |
| Company / team | Not named on site or about page. Press release dateline Be'er Sheva, Israel. | M |

Conclusion: live and being deployed to (Sep-Oct 2026), still labelled beta, tiny user base.

## 2. What it is

- **Kind**: aggregator and trading front end (market discovery, composite order book view, smart order routing, copy trading, "smart money" and insider analytics, arbitrage alerts, demo mode). Docs: "The system does not merge platforms operationally" and liquidity "remains native to each venue" (H, https://fors-aggregator.gitbook.io/fors/base-structures/aggregation-model.md).
- **Venues actually wired in** (H, live API `pagination` object and bundle): Polymarket, Kalshi, Opinion, Predict.fun, Limitless. Stated variously elsewhere:
  - docs "Integrated For Aggregation" page: Polymarket, Kalshi, Opinion (H, https://fors-aggregator.gitbook.io/fors/base-structures/integrated-for-aggregation.md)
  - about-us page: Polymarket, Limitless, Myriad, Kalshi, Predict.fun (H, https://fors.market/about-us/)
  - Myriad and Manifold appear on the marketing site or in a search summary but have **0 hits** in the app bundle and no pagination key in the API (H). Treat as not live.
- **Does not create markets** (M, press summary).
- **Arbitrage feature**: "does not execute trades automatically", it only detects and notifies (H, https://fors-aggregator.gitbook.io/fors/key-features/arbitrage.md). The bundle also has `/arbitrage/flatten` and `/admin/arbitrage/{wallet,withdraw,kalshi-credentials}` routes, which suggests an internal arbitrage account that Fors operates itself (L, route names only, behind auth, not probed).

## 3. Market model, chains, collateral

- Market model = whatever the destination venue uses. Fors normalises into "standardized outcome objects" (binary vs categorical, naming, expiry) (H, aggregation-model.md). Live schema: `type: "binary"`, `outcomes: ["Yes","No"]`, `yes_price/yes_bid/yes_ask/no_*`, multi-outcome events as a list of binary markets with `group_title` (H, fixtures `prices_markets_*`). Outcome tokenisation is the venue's own: Polymarket `order_details.yes_ticker/no_ticker` are CTF ERC-1155 token ids; Kalshi uses the market ticker (e.g. `KXPRESNOMD-28-GN`) (H, fixtures).
- Docs marketing says "built on Solana". Solana is described as "tokenization and settlement layer" for the Kalshi leg: "dFlow executes. Solana tokenizes. FORS unifies the experience." (H, https://fors.market/fors-with-solana/). So the Kalshi leg is Kalshi liquidity reached through dFlow's Solana tokenised markets (see `docs/research/venues/dflow-prediction-markets.md`).
- **Per-venue funding wallets seen in the app bundle** (M, derived from balance-field names; wallet keys `solana_USDC_balance`, `polygon_pUSD_balance`, `polygon_copy_trade_pUSD_balance`, `bnb_USDT_balance`, `base_USDC_balance`):

| Venue | Chain | Collateral shown by Fors |
|---|---|---|
| Kalshi (via dFlow) | Solana | USDC |
| Polymarket | Polygon | pUSD (Polymarket V2 collateral wrapper) |
| Predict.fun | BNB Chain | USDT |
| Limitless | Base | USDC |
| Opinion | BNB Chain (docs: "on BNB Chain") | no balance key observed for Opinion |

- Deposit UI links explorers for Solana, Ethereum, Polygon, Base, BNB, Arbitrum, Optimism, Tron and Bitcoin, and calls Across for bridging (`/bridge/quote`, `/bridge/across-status`) (M, bundle strings). Bridge/withdraw routes are auth-gated.

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official docs of an API | **NOT FOUND**. The docs "API Access" page is 3 paragraphs, no endpoints, no host, no auth, no limits (https://fors-aggregator.gitbook.io/fors/key-features/api-access.md). The site says "Full API and Webhook Support" and "Real-Time Market Triggers" (https://fors.market). Searched: gitbook llms.txt (25 pages), fors.market, about-us, blog index. | H |
| OpenAPI / Swagger | `/`, `/openapi.json`, `/docs` on api.fors.market return 403. NOT FOUND | H |
| Web-app backend (undocumented) | `https://api.fors.market`, JSON, FastAPI-style errors (`{"detail":"Not authenticated"}`), client timeout 45 s | H (bundle + curl) |
| WebSocket | `wss://ws.fors.market/ws/prices` (client constant). JSON messages: send `{"type":"subscribe","market_ids":[...]}` and `{"type":"ping"}` every 30 s; receive `connected`, `subscribed`, `subscribed_polymarket`, `subscribed_kalshi`, `price_update` (fields `market_id`, `token_id`, `yes_price`, `no_price`, `yes_bid`, `yes_ask`, `no_bid`, `no_ask`, `volume`, `platform`, `last_trade_price`), `pong`, `error`. I did not open a socket (plain GET to the path returned 404). | M (bundle only) |
| Auth | Bearer JWT from Privy login (`Authorization`, token stored in browser localStorage as `auth_token`); public read routes need none. No API key product yet. | M |
| Rate limits | NOT FOUND (no headers beyond CDN ones inspected; none documented). I made about 20 GETs in total with no throttling. | H |

Unauthenticated routes confirmed 200 on 2026-10-19 (all fixtures saved):

| Route | Returns | Fixture |
|---|---|---|
| `GET /health` | service health | `health.json` |
| `GET /market/events_live` | merged feed across the 5 venues, `data[]` of events (`id` Fors db id, `platform`, `platform_id`, `title`, `slug`, `volume`, `expiration`, `same_events[]`, `same_events_info[]`), plus a per-venue `pagination` block (page numbers for polymarket/opinion/limitless, cursor for kalshi/predictfun). Params seen in client: `polymarket_page`, `opinion_page`, `limitless_page`, `next_cursor`, `predictfun_cursor`, `limit`, `platform`, `sort_by`, `sort_order`, `category`. | `market_events_live_trimmed.json` |
| `GET /market/events/{fors_id}/aggregated_events` | `base_event`, `same_events[]`, `same_markets` (map event -> market -> list of matched market keys like `Kalshi||KXPRESNOMD-28-SAS`), `aggregation_justification`, `aggregation_id`, `market_refs[]` | `market_events_aggregated_events_trimmed.json` |
| `GET /prices/markets/{Platform}/{event_platform_id}` | event metadata (`total_volume`, `total_liquidity`, `open_interest`, tags, description, end_date) and `markets[]` with `yes/no price, bid, ask, probability`, `volume`, `volume_24h`, `liquidity`, `spread`, `condition_id`, `order_details` | `prices_markets_PolyMarket_30829_trimmed.json`, `prices_markets_Kalshi_KXPRESNOMD-28_trimmed.json` |
| `GET /market/orderbook/polymarket/{yes_token_id}` and `GET /market/orderbook?platform=&market_id=` | `bids/asks[]` as `{price, shares, total}`, `best_bid/ask`, `spread`, `hash`, `timestamp` (ms), `tick_size`, `min_order_size`, `neg_risk` | `market_orderbook_polymarket_trimmed.json`, `market_orderbook_kalshi_empty.json` |
| `GET /search/search?q=` | cross-venue search hits with `platform`, `platform_id`, `volume`, `markets_count`, `db_id` | `search_bitcoin.json` |
| `GET /market/trending`, `/market/breaking_events` | trending search terms; movers feed | `market_trending.json` |
| `GET /sports/leagues` | `{"leagues":[]}` (empty on 2026-10-19 although NFL is in season) | inline |

Auth-gated (401 on GET, not otherwise touched): `/arbitrage/{stats,snapshot,history,book/{id},verify-match/{id}}`, `/bridge/*`, `/orders/*`, `/profile/*`, `/copy-trading/*`, `/deposits/*` (fixture `auth_required_401.json`). Admin routes also exist in the client; I did not probe them.

Data-quality notes (M/L):
- Fors' Kalshi rows show `liquidity: 0` and `open_interest: 0` and an empty event-level orderbook (`KXPRESNOMD-28`), so depth must come from the Kalshi adapter directly.
- Limitless volumes look inflated or in odd units (e.g. $12.4B on the "Democratic Presidential Nominee 2028" event, $3.98B on a weekly ETH price event). Do not use Fors' `volume` field as liquidity.
- Opinion `pagination.total` is 20 with 11 pages, which is inconsistent.
- Best use of this feed is the match table, not prices.

## 5. Resolution

Fors does not resolve anything. Each leg resolves under its own venue's rules (H, Security & Trust page and Aggregation Model page). The docs say positions from different venues are **netted into one exposure** and "opposite positions offset automatically" (H, https://fors-aggregator.gitbook.io/fors/execution-mechanics/smart-order-routing.md). That is only safe if both venues resolve identically. Resolution wording, oracles and dispute paths differ per venue (Opinion docs claim AI oracles; others see their own venue notes), so dispute risk is the sum of the legs' risks plus match-error risk. Venue-level mechanics are out of scope here and belong in the Polymarket, Kalshi, Opinion, Predict.fun and Limitless notes.

## 6. Trade path and PayBox reachability

- **Documented trade path: none.** Docs say API users can "send structured trading instructions through defined endpoints" but define none (H).
- **What the web app does** (M, from bundle): `POST /orders/submit` with JSON `{platform, market/event ids, outcome, token_id, amount, price, order_action:"buy", order_type:"market", idempotency_key, timestamp, potential_return}` plus header `Idempotency-Key`; status via `GET /orders/status/{id}`; cancel-all per venue (`/orders/poly/orders/cancel-all`, `/orders/kalshi/...`, `/orders/limitless/...`); redeem via `/orders/redeem`. The browser does **not** build or sign venue orders; the Fors backend does, from per-user wallets it provisions ("Creating new trading wallet", "Setting trading approvals", `safe_deployed`, `has_legacy_safe`, `bnb_approvals_set`, `base_approvals_set`) and reports under `custody-balance` / `user-custody-wallet` route names. The user's only on-chain action in the UI is a deposit transfer (a Solana transfer to a "Kalshi wallet" address is signed in-browser).
- **Conflict with the docs**: docs and FAQ state "non-custodial", "Every trade requires wallet approval ... signs it locally" (H, https://fors-aggregator.gitbook.io/fors/trust-security-and-governance/security-and-trust.md). The client shows server-side order placement, a deposit-then-trade model and "custody" naming. Who controls the trading-wallet signing keys is NOT FOUND. Treat custody as Fors-controlled or Privy-delegated until proven otherwise (M).
- **paybox_reachable = no** for trading. A PayBox EVM wallet could send tokens to a Fors trading-wallet address (after logging in through Privy to learn it), but cannot place or cancel Fors orders: there is no signed-order interface, the only auth is a Privy session JWT, and funds would sit in Fors-provisioned wallets. Read endpoints are reachable without auth. To trade the same liquidity, use the underlying venue adapters (Polymarket on Polygon, Predict.fun/Opinion on BNB, Limitless on Base, Kalshi through dFlow or its own API).

## 7. Fees, geo, ToS

- **Fees**: "FORS does not add hidden trading fees. Underlying platforms may charge execution fees, and premium features (analytics, copy trading, API access) may require a subscription" (H, FAQ). Roadmap lists "Fee framework live: Execution-based fees, API tiers, Institutional pricing" for **Q4 2026** (H, roadmap). No amounts or formulas published anywhere. Fors is a registered Polymarket builder (section 9), so builder-code fees or rebates may apply on that leg; not verified.
- **Geo restrictions**: NOT FOUND (searched: homepage, docs llms.txt pages, FAQ, about-us, app bundle strings for terms/privacy/jurisdiction/geo/sanction/VPN: 0 hits). Underlying venue restrictions apply (Polymarket and Kalshi US/jurisdiction rules; see their notes).
- **ToS / automation rules**: NOT FOUND. No terms or privacy link on the site or in the app bundle. The app shows an account-restriction screen ("Your account access has been temporarily restricted"). Scripted use of the undocumented `api.fors.market` routes is therefore unlicensed; keep to low-rate, read-only, research-grade polling.
- Support contact is on the site; none used.

## 8. Event coverage and overlap (where arbitrage exists)

Catalog size from the live `pagination` block (H, 2026-10-19): Polymarket 21,704 events, Kalshi 10,877, Predict.fun 1,643, Limitless 510, Opinion reported as 20 (inconsistent, see section 4).

In the first 100 rows of `/market/events_live` (20 per venue), **47 had cross-venue links** (`same_events` non-empty): Polymarket 18/20, Kalshi 11/20, Predict.fun 11/20, Opinion 7/20, Limitless 0/20 (M, my count; sample is volume-ranked, not random).

| Category | Venues overlapping | Examples seen (H) |
|---|---|---|
| US politics / elections | Polymarket, Kalshi, Opinion, Limitless, Predict.fun | 2028 Democratic and Republican nominee, Presidential Election Winner 2028, 2026 Midterms balance of power, Brazil Presidential Election, California governor |
| Macro | Predict.fun, Opinion (plus Polymarket/Kalshi) | "How many Fed rate cuts in 2026?" matched across Predict.fun and Opinion |
| Crypto price | Limitless (hourly/daily/5-15 min up-or-down), Kalshi (daily/15-min BTC), Polymarket, Opinion thresholds | Limitless rows were **unmatched**; they are short-dated and mostly venue-unique |
| Crypto token-launch / FDV | Opinion, Predict.fun, Polymarket | "Opensea FDV above ___", "Will Base launch a token by", "Polymarket token" |
| Sports | Polymarket, Kalshi (Fors search trends: cowboys, packers, arsenal), Predict.fun league champions | Fors `/sports/leagues` empty today; sports module looks thin or off |
| Other | single-venue mostly | OpenAI IPO, Satoshi moves BTC, aliens |

**Matching method (competitor intel, M)**: `aggregation_justification` is free text ("Core identity matches: both markets ask who will be the 2028 Democratic Party (US) presidential nominee. Participant naming differences ... do not change the event ... | Manually extended by admin"). That reads as LLM-generated match rationale with admin overrides, applied at event level and then per sub-market (`same_markets`). `last_same_event_check` on the sampled political event was **2026-03-11**, 7 months stale, and the market refs include placeholders ("Person AB", "Person BE") that were aligned to named candidates on other venues. Resolution-window and wording differences are explicitly waved off ("Resolution window differences do not define a different identity"). That is the main risk to copy: it can create false arbitrage.

Price sample (not an arbitrage claim): Newsom-2028 yes side, Polymarket bid/ask 0.171/0.178 vs Kalshi 0.14/0.15 at about 2026-10-19 01:50Z, from the two `prices_markets_*` fixtures. Different resolution wording and fee/settlement mechanics could explain it; snapshots were not simultaneous.

## 9. Liquidity and shared liquidity

- **Own liquidity: none.** Every fill executes on a connected venue (H, userflow page: "The chosen prediction market receives the routed order").
- **Shared with**: Polymarket (CLOB), Kalshi (via dFlow), Opinion, Predict.fun, Limitless. **Not an independent arbitrage leg.** Deduplicate Fors against all five.
- **Fors-attributed Polymarket volume** (H, `https://data-api.polymarket.com/v1/builders/volume`, builder `FORS`, verified, pulled 2026-10-19; unit assumed USD; v1 is being retired per another note so re-pull from `/v2/` later; fixture `polymarket_builders_volume_fors_extract.json`):

| Month (2026) | Volume | Active users | Builder rank |
|---|---|---|---|
| Feb | $1.52M | 10 | 25 |
| Mar | $1.08M | 16 | 38 |
| Apr | $0.02M | 11 | 140 |
| May | $0.85M | 8 | 51 |
| Jun | $0.23M | 4 | 109 |
| Jul | $0.32M | 7 | 96 |
| Aug | $0.50M | 1 | 69 |
| Sep | $0.31M | 2 | 86 |

  Year to date (ALL bucket, 2026): $4.87M, 36 users. Last non-trivial day 2026-09-11 ($8.7K); last row of any size 2026-09-22 ($2.35); **no rows for Oct 1-19**. For scale, all Polymarket builders together did about $683M in Sep 2026 (H, MONTH bucket sum), so Fors is roughly 0.05%. This only counts orders carrying Fors' builder code, so it may understate (M), and the October gap may reflect a Polymarket V2/pUSD attribution change rather than zero activity (L).
- No volume, TVL, or user stats published by Fors itself (H, homepage, FAQ, about-us). Other-venue volumes are not Fors liquidity.

## 10. Adapter recommendation

- **Do not build an execution adapter.** Nothing to sign, no independent liquidity, no sanctioned API.
- **Optional read-only "benchmark feed" (P2)**: poll `/market/events_live` and `/market/events/{id}/aggregated_events` at a low rate (a few requests per hour) to diff Fors' `same_events` graph against our market-linking layer and to surface its justification strings as hard negatives/positives for evaluation. Treat as untrusted, unlicensed, and likely to change. Store only IDs and the match relation, not their full text, until ToS is clarified.
- **Revisit** when Fors publishes the Partner API (roadmap: pilot in Q3 2026, tiers in Q4 2026) or a ToS.
- **Competitive read**: Fors has the same thesis as our aggregation layer (normalised outcomes, composite book, SOR, arbitrage alerts) across the same five on-chain/regulated venues, but with a thin user base, a matcher that is partly manual and stale, and no auto-execution of arbitrage. It does not add Quotient-style signals.

## 11. Open questions

1. Who holds signing keys for Fors trading wallets (Fors, Privy delegated, or user)? Docs say non-custodial; client behaviour says server-side placement.
2. Is there a ToS permitting API use, and what rate limits does the Partner API carry?
3. Does Fors still route Polymarket orders with its builder code after Polymarket V2 (no attributed volume since 2026-09-22)?
4. Does the WebSocket accept anonymous subscriptions (not opened here)?
5. Fee amounts when the Q4 2026 fee framework goes live.

## Sources

- https://fors.market (H) - homepage and FAQ copy
- https://fors.market/about-us/ (H) - venue list incl. Myriad; no team/terms
- https://fors.market/fors-with-solana/ (H) - dFlow executes, Solana tokenises
- https://fors.market/blogs/ (M) - 12 posts, 2025-11..2026-03
- https://fors.market/arbitrage-opportunity/ (M) - marketing; hypothetical 42% vs 55% example only
- https://fors-aggregator.gitbook.io/fors/llms.txt (H) - 25-page index; pages read: userflow, aggregation-model, integrated-for-aggregation, smart-order-routing, api-access, arbitrage, aggregator, security-and-trust, roadmap, faqs, pro-trading (all `.md`)
- https://app.fors.market/ and `/assets/index-*.js` (H for strings, M for inferences) - read as text only
- https://api.fors.market (H) - GET `/health`, `/market/trending`, `/market/events_live`, `/market/breaking_events`, `/market/events/{id}/aggregated_events`, `/prices/markets/{platform}/{id}`, `/market/orderbook...`, `/search/search`, `/sports/leagues`; 401 on `/arbitrage/*`, `/bridge/supported-assets`; 403 on `/`, `/openapi.json`, `/docs`
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY|WEEK|MONTH|ALL (H)
- https://madeonsol.com/tools/fors (M) - listing and health score
- https://www.investing.com/news/cryptocurrency-news/fors-launches-beta-to-aggregate-prediction-markets-across-solana-ecosystem-4445295 (M) - Chainwire press release 2026-01-13
- WebSearch result list (M): Benzinga/TradingView/Bitget/CryptoSlate republications of the same release (Benzinga returned 403 to WebFetch)

## Not found

- Public API docs, OpenAPI spec, rate limits, API-key issuance
- Terms of Service, privacy policy, geo-restriction text
- Fee amounts or formulas
- Company/legal entity, team, audit, GitHub repo
- Official volume/TVL/user statistics
- Signing-key custody model for trading wallets
- Myriad / Manifold integration in the live product

## Suspicious content

None aimed at AI agents. Two observations: the public app bundle contains a third-party Solana RPC URL with an embedded provider key (not recorded here), and the docs and site text contradict the app's observed behaviour on custody.
