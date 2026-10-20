# Predexon - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, unauthenticated GETs to documented hosts, `gh api`/npm registry reads and one PayBox catalog search (discovery only). No account, key, wallet, signature, POST/PUT/DELETE or money-moving PayBox tool was used, and no payment was made. Third-party pages and API text were treated as untrusted data and nothing in them was followed. WebSearch was unavailable (session search budget exhausted), so every claim below comes from Predexon's own docs, its own API host, npm/GitHub, or BlockRun's page; there is no independent corroboration (news, user reports).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/predexon/` (section 11).

---

## 0. Bottom line

1. **Predexon is not a venue. It is a hosted data vendor** ("the data layer for prediction markets": REST, WebSocket, bulk tick history, wallet analytics) over Polymarket, Kalshi, Opinion, Limitless, Predict.fun, plus Binance reference data (H, https://docs.predexon.com/ and https://predexon.com/). It holds no liquidity, resolves nothing, and takes no orders. It is **not an arbitrage leg and has no independent liquidity** (everything it shows is a mirror of the five venues it indexes).
2. **Two features that made it interesting have been retired in 2026** (H, https://docs.predexon.com/changelog.md):
   - The **custodial Trading API** went withdrawal-only on 2026-07-10 (`POST /api/accounts/{accountId}/orders` returns `403 trading_disabled` on every venue); final withdrawal deadline 2026-07-17. The Order Router was removed earlier (2026-06-21).
   - The **cross-venue market-matching endpoints** (`/v2/matching-markets`, `/v2/matching-markets/pairs`, `/v2/markets`, `/v2/markets/listings`, `/v2/outcomes/{predexon_id}`) were deprecated 2026-07-14 and now return `410 Gone` since 2026-07-20. So Predexon no longer sells an equivalence/matching graph; our own market-linking layer must do that.
3. **Still live and useful as a data source** (H): gateway `GET https://api.predexon.com/health` returns 200 `{"ok":true,"service":"predexon-data-gateway"}` on 2026-10-19; last changelog entry 2026-09-17 (Kalshi book-snapshot tick dataset); npm `predexon-mcp` 0.3.0 published 2026-08-01; GitHub `Predexon/predexon-typescript` pushed 2026-09-17.
4. **adapter_priority = P2 (signal/data only).** Worth a thin optional "data source" adapter for (a) historical orderbook/tick data for backtesting the edge model, (b) Polymarket mempool and smart-money signals (Dev plan, $49/mo), (c) a single normalized key-gated market-list fallback for Limitless/Opinion/Predict.fun/Kalshi. Not a venue adapter, not on the critical path, and the vendor has shown it will remove features with a few days' notice (Terms allow suspension "at any time, with or without cause").

---

## 1. Is it still live? (2026)

| Thing | Evidence | Verdict | Tag |
|---|---|---|---|
| API gateway | `GET https://api.predexon.com/health` -> 200 `{"ok":true,"service":"predexon-data-gateway"}`; every other path -> 401 `{"error":"missing_api_key",...}` (2026-10-19) | live | H |
| Marketing site | `https://predexon.com/` 200. `https://www.predexon.com/` fails TLS: `curl: (60) SSL certificate problem: certificate has expired` (confirmed 2026-10-19) | live; use apex host only | H |
| Docs | `https://docs.predexon.com/` 200 (Mintlify); `llms.txt`, OpenAPI v1/v2 and AsyncAPI served | live | H |
| Dashboard | `https://dashboard.predexon.com/` answers 307 (login redirect) | live | H |
| WebSocket host | `https://wss.predexon.com/` answers 401 (nginx) | live | H |
| Release cadence | Changelog entries on 2026-02-04, 03-15, 03-28, 04-19, 05-20, 06-21, 07-10, 07-14, 07-20, 09-17 | actively maintained | H |
| Packages | npm `predexon-mcp` latest 0.3.0 (2026-08-01, MIT); GitHub org `Predexon` created 2025-12-01 with 2 public repos (`documentation` pushed 2026-01-16, `predexon-typescript` pushed 2026-09-17, both MIT, 0 stars) | small, young vendor | H |
| Usage claims | "Over 1B API calls served", "Over 1,000 developers", "backed by Alliance", users named: TradeFox, Ratio, Preddy, Olympus, Chance, Ares, Predictefy, Parity | vendor marketing, unverified | M |

NOT FOUND (searched: predexon.com home, docs landing, status page link): a public status page. The home page links none.

---

## 2. Kind and market model

- **Kind: aggregator-or-data.** Hosted REST + WebSocket + Parquet data vendor. After 2026-07 it is read-only (no order routing, no custody).
- **What it normalizes (H, OpenAPI v2 schemas, fixture `openapi-v2-excerpt.json`):**
  - Binary and categorical markets as `outcomes[]` arrays. Every outcome carries a Predexon-assigned `predexon_id` (added 2026-04-07 to all venue list endpoints; H changelog), plus the venue-native handle (`token_id`, `condition_id`, Kalshi `ticker`, `market_slug`).
  - **Kalshi:** scalar/range structure via `strike_type`, `floor_strike`, `cap_strike`, `custom_strike`; `rules_primary/secondary`; `series`, `event`; prices in cents (0-100) on the list endpoint with per-outcome `bid`/`ask`; `volume`, `open_interest`, `dollar_volume`, `dollar_open_interest`.
  - **Limitless:** `trade_type` of `amm` or `clob` (so both AMM and order-book markets), `liquidity_usd`, `total_volume_usd`, `open_interest_usd` (null for CLOB since 2026-05-07), `collateral {address,symbol,decimals}`, `market_address`, `exchange_address`, `payout_numerators`, `resolution_tx`.
  - **Opinion:** `chain_id`, `quote_token`, `condition_id`, `question_id`, categorical parents excluded (outcomes listed as tradeable markets grouped by `event_id`); outcome `price` currently null per the endpoint description ("future: from WebSocket/orderbook").
  - **Predict.fun:** `market_variant` (DEFAULT, CRYPTO_UP_DOWN, SPORTS_TEAM_MATCH, ...), `best_bid/best_ask`, `bid_depth/ask_depth`, `is_neg_risk`, `is_yield_bearing`.
- **Orderbook model:** historical snapshots only (not a live book endpoint). Limitless, Opinion and Predict.fun return the **YES side only**; the NO book must be derived by flipping bids/asks and mapping price to `1 - price` (H, Limitless orderbook doc/OpenAPI). Kalshi legacy endpoint rounds to whole cents; the new sub-cent endpoint (2026-07-15) is exact and the legacy one "will be deprecated soon".
- **Tokenisation:** Predexon issues no tokens; it only echoes venue-native token ids.

## 3. Chains and collateral

Predexon itself has none. Facts visible through its API (venue details belong to the other venue notes):

- Polymarket on Polygon; Predexon documents Polymarket V2 with **pUSD** collateral (WebSocket `collateral` channel for pUSD wrap/unwrap, V2 migration deployed 2026-04-19) (H, https://docs.predexon.com/websocket/overview.md).
- Opinion exposes `chain_id` and `quote_token` fields; Limitless exposes a `collateral` object; Predict.fun exposes `is_yield_bearing`. Predexon docs do not name the chains for these three (NOT FOUND in Predexon docs, searched: OpenAPI, concepts pages; see the per-venue notes).
- Kalshi is off-chain, USD.
- **Paying Predexon (x402 route):** USDC on **Base** (eip155:8453), see section 5.

---

## 4. Read API

- **exists:** `official-authenticated` (plus pay-per-call via a reseller, section 5).
- **Docs:** https://docs.predexon.com/ (index https://docs.predexon.com/llms.txt; OpenAPI https://docs.predexon.com/openapi-v2.json; AsyncAPI https://docs.predexon.com/websocket/asyncapi.json) (H).
- **Base URLs:** REST `https://api.predexon.com`; WebSocket `wss://wss.predexon.com/v1/<API_KEY>` (the key is part of the URL path, so it ends up in proxy/access logs) (H).
- **Auth:** header `x-api-key: <key>`; key from a free sign-up at dashboard.predexon.com (H, https://docs.predexon.com/authentication.md). Unauthenticated requests get 401 `{"error":"missing_api_key","message":"API key required","requestId":"..."}` on every path except `/health` (H, fixture `unauthenticated-401.json`). **I did not create a key, so I could not capture a real 200 response; response shapes below come from the OpenAPI schema, not from a live sample.**
- **Rate limits (H, https://docs.predexon.com/rate-limits.md):**

| Plan | Price | Rate | Premium requests / month | Overage | WebSocket |
|---|---|---|---|---|---|
| Free | $0 | 1 req/s | 1,000 (hard) | none | no access |
| Dev | $49/mo | 20 req/s | 1,000,000 | $5 per 100K | 10 subs x 10 items |
| Pro | $249/mo | 100 req/s | 5,000,000 | $2.50 per 100K | 100 x 500, 2 wildcards per channel |
| Enterprise | $499+/mo | custom | unlimited | n/a | custom, dedicated node |

  Free and unlimited on all plans: all `/v2/{venue}/markets` and `/v2/{venue}/orderbooks` endpoints (and "historical data"). Gated to Dev+: smart-money/analytics, `/v2/binance/*`, WebSocket (Free gets 403). 429 on overrun; no rate-limit headers documented. WebSocket: ping every 30 s, pong within 60 s, idle-with-no-subscriptions closes after 2 min, events dropped at 1 MB buffer, connection killed at 4 MB.
- **Key endpoints for an arbitrage scanner** (H, https://docs.predexon.com/api-reference/endpoints.md and OpenAPI v2):

| Need | Endpoint | Notes |
|---|---|---|
| Markets, Polymarket | `GET /v2/polymarket/markets/keyset` | cursor `pagination_key`; filters status, price range, OI, volume, tags, `end_after/before`, `token_id`, `condition_id`, `predexon_id`; rolling volume/OI refreshed hourly |
| Markets, Kalshi | `GET /v2/kalshi/markets` | `ticker`, `event_ticker`, `series_ticker` filters |
| Markets, Limitless / Opinion / Predict.fun | `GET /v2/limitless/markets`, `/v2/opinion/markets`, `/v2/predictfun/markets` | see section 2 |
| Prices | `GET /v2/polymarket/market-price/{token_id}`, `/candlesticks/{condition_id}`, `/candlesticks/token/{token_id}` | Polymarket only; other venues get list-endpoint prices |
| Book history | `GET /v2/{polymarket,kalshi,limitless,opinion,predictfun}/orderbooks`, `GET /v2/kalshi/orderbooks-subcent` | ms timestamps; `limit` 1-200 (Kalshi legacy 2000) |
| Trades | `GET /v2/polymarket/trades`, `GET /v2/kalshi/trades` | no trades endpoint for Limitless/Opinion/Predict.fun |
| Resolution (Polymarket) | `GET /v2/polymarket/uma/markets`, `/uma/market/{condition_id}` | UMA oracle state + event timeline |
| Resolution (others) | fields on list endpoints: Kalshi `result`, `settlement_time`; Limitless/Predict.fun `winning_outcome`, `payout_numerators`, `resolution_tx`; Opinion `resolved_time`, `result_token_id` | |
| Tick history | `GET /v2/data/ticks` (download, signed Parquet URLs), `GET /v2/data/ticks/query` | the `/query` endpoint is labelled "gated private preview" in OpenAPI |
| Crypto reference | `GET /v2/binance/ticks/{symbol}`, `/candles/{symbol}` | Dev+ |

  Coverage start dates for book history (H, each endpoint page): Polymarket 2026-01-01, Kalshi 2026-01-07 (sub-cent 2026-01-08), Limitless 2026-03-07, Opinion 2026-03-10, Predict.fun 2026-03-11. Tick data: Kalshi deltas from 2026-03-05, Kalshi full snapshots from 2026-09-18.
- **Freshness (important for arbitrage):** only **Polymarket** has a real-time stream. The home page table shows Real-time = yes for Polymarket and Chainlink Data Streams only; Kalshi, Opinion, Limitless, Predict.fun are REST-only. Docs describe the order-book endpoints as "historical snapshots" and the Kalshi tick page says tick data is finalized T-1 at about 06:00 UTC (404 `not_final` for today). **I found no statement of how stale the newest REST snapshot is** (NOT FOUND, searched: how-it-works, orderbook endpoint pages, data-signals overview). For live cross-venue pricing, poll each venue's own API; use Predexon for history.
- **WebSocket** (H, https://docs.predexon.com/websocket/overview.md): Dev+; channels `orders` (fills, incl. pending/mempool 3-5 s early), `activity`, `lifecycle`, `orderbook` (L2, ms timestamps), `oracle` (UMA proposals/disputes), `collateral`, `crypto` (Chainlink). All Polymarket-only except crypto. Subscribe message: `{action:"subscribe", platform:"polymarket", version:1, type:"orders", filters:{...}}`. The "up to 5 seconds ahead of Polymarket RTDS" figure is a vendor claim (M).
- **MCP server:** `npx predexon-mcp` with `PREDEXON_API_KEY` env; typed tools over the Data API (H, https://docs.predexon.com/mcp-server.md). Docs-search MCP card at `docs.predexon.com/.well-known/mcp/server-card.json`, auth none (H).
- **Doc inconsistencies spotted (H):** the "first call" example uses `/v2/polymarket/markets` but OpenAPI/endpoints page only have `/markets/keyset`; the endpoints page says "58 Endpoints" but lists 56; OpenAPI v2 has no `/v2/data/ticks/quote` although the credits page requires it for downloads over $100; the cross-venue text search `GET /v2/markets/search` is said to be "not affected" by the July sunsets but is absent from OpenAPI and the docs page for it now redirects to the Polymarket-only search (`/api-reference/discovery/search`). Treat `/v2/markets/search` as unsupported until proven (BlockRun still advertises `markets/search`).

---

## 5. Pay-per-call (x402) and the PayBox angle

- Predexon docs: "The Data API can also be accessed via x402... Pay per request, no signup or subscription required... Facilitator: Blockrun marketplace" (H, https://docs.predexon.com/authentication.md).
- BlockRun page (H, https://blockrun.ai/marketplace/predexon): flat **$0.0085 per call, any endpoint, USDC on Base**, "0% BlockRun margin", base URL `https://blockrun.ai/api/v1/pm/`, 46 endpoints in 9 categories.
- Live check 2026-10-19 (H, unauthenticated GET, no payment made, fixture `blockrun-x402-402-kalshi-markets.json`): `GET https://blockrun.ai/api/v1/pm/kalshi/markets?limit=1` -> **HTTP 402**, x402Version 2, scheme `exact`, network `eip155:8453`, amount `8500` (6-decimals USDC = $0.0085), asset `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (native USDC on Base), `maxTimeoutSeconds` 300, requirements also in `payment-required` / `www-authenticate: X402` headers. I stopped there.
- **PayBox reachability:** an EVM wallet on Base with USDC could in principle pay these calls with `pay_x402` (M; I did not call it). PayBox's own x402 catalog search for "predexon prediction market data" on Base returned eight unrelated third-party Polymarket/Hyperliquid data resellers and neither Predexon nor BlockRun (H, `discover_services`, 2026-10-19), so it is reachable by URL, not by catalog entry. That is a data purchase, **not a trading path**.
- Cost sanity: at $0.0085 per call, 1 req/s sustained is about $734/day, so x402 only makes sense for sparse lookups. The Free tier gives unlimited market lists and book history for $0 at 1 req/s.

## 6. Trade path

**None.** Predexon's Trading API (custodial, order placement with per-account endpoints, Hyperliquid HIP-4 added 2026-05-05) was wound down: trading disabled 2026-07-10, withdrawal deadline 2026-07-17 (H, changelog). Docs now position the product as read-only data ("then act on them wherever you execute" in the active-trader guide, H llms.txt). BlockRun's page also says "data-only, not for placing trades". Execution on the underlying venues belongs to their own adapters.

## 7. Fees

- **Trading fees: none** (no trading). Venue fees are in the venue notes.
- **Data costs (H):** plans above; overage $5 per 100K (Dev) or $2.50 per 100K (Pro).
- **Bulk tick history** (H, https://docs.predexon.com/data-signals/ticks/data-credits.md): prepaid credits; Polymarket ticks **$40/GiB**; Kalshi ticks **$80/GiB**; Kalshi book snapshots **$80/GiB** (no minimum); Opinion ticks **$80/GiB**; **$5 minimum** per download except Kalshi snapshots; $50 free credits once per organization when a payment method is added; top-ups $5-$10,000 with 10% bonus at $500+; downloads over $100 need a free `quote_id` (quote valid about 30 min); charged when signed URLs are issued; identical request within 24 h is free; typical full Polymarket day about 13 GiB (about $520). Kalshi tick page says signed URLs expire about 1 hour out.
- Pro plan "3-day free trial" (H, predexon.com). The `pricing` page did not render the pay-per-call or FAQ answers in my fetch (NOT FOUND, searched: https://predexon.com/pricing).

## 8. Resolution mechanism and dispute risk

Predexon resolves nothing. It republishes each venue's state: Polymarket via UMA (proposal/dispute/settle/reset events exposed in `/uma` endpoints and the `oracle` WebSocket channel), Kalshi via exchange determination (`determination_time`, `settlement_time`, `result`), and Limitless/Opinion/Predict.fun via on-chain `payout_numerators`/`resolution_tx` fields. Risk specific to using Predexon: it is a third-party copy that can lag or have gaps ("a gap is permanent": Kalshi orderbook outage 2026-03-12 08:00 to 03-14 18:10 UTC, H changelog), and its `result`/`winning_outcome` should not be the settlement authority for an arbitrage leg; read the venue.

## 9. Geo, ToS, automation

- **Terms** (H, https://predexon.com/terms; page says "Last updated: January 2025", so **older than 6 months: possibly stale** and it predates the products above): prohibits "Resell or redistribute the Services without authorization", reverse engineering, exceeding rate limits, unauthorized access; data is "for informational purposes only" and not financial advice; "AS IS", no accuracy/timeliness guarantee, no SLA; Predexon may terminate or suspend "at any time, with or without cause, with or without notice". Automation/bots, commercial use and arbitrage use are not addressed. No geographic restrictions stated. Redistribution matters if we ever expose Predexon-derived data to users of the plugin: get written permission or keep it internal.
- Getting a key needs a human dashboard sign-up with a payment method for tick credits; not done (read-only rules). x402 avoids sign-up.
- The venue-side geo rules (Polymarket, Kalshi, etc.) still apply to anyone trading on the signals; see those notes.

## 10. Liquidity and event overlap

- **Liquidity: N/A** (no order book of its own). Vendor usage claims only: "1B+ API calls", "1,000+ developers" (home page, 2026-10-19, M). No volume/OI/TVL figures for Predexon exist because it is not a venue. `GET /metrics/live` exists in OpenAPI but needs a key (not read).
- **Shares liquidity with:** all five venues it mirrors (Polymarket, Kalshi, Opinion, Limitless, Predict.fun) plus Binance reference prices and Chainlink Data Streams crypto ticks. It is **not an independent arbitrage leg**.
- **Category overlap it can expose** (venue properties, M from Predexon schemas): Polymarket `crypto-updown` for BTC, ETH, SOL, XRP, HYPE, DOGE, BNB; Predict.fun `CRYPTO_UP_DOWN` and `SPORTS_TEAM_MATCH` variants; Kalshi series such as `KXBTC15M`; sports (World Cup live channels ended with the tournament, 2026-07-20); politics and macro via Polymarket tags/categories. The Binance and Chainlink crypto feeds are useful as the "fair value" reference for crypto up/down arbitrage.

## 11. Fixtures (saved under `docs/research/fixtures/predexon/`)

| File | What | Source |
|---|---|---|
| `health.json` | live `GET /health` response | https://api.predexon.com/health (H) |
| `unauthenticated-401.json` | live 401 body for a keyless call | https://api.predexon.com/v2/kalshi/markets?limit=1 (H) |
| `blockrun-x402-402-kalshi-markets.json` | live x402 payment requirements (no payment made) | https://blockrun.ai/api/v1/pm/kalshi/markets?limit=1 (H) |
| `openapi-v2-excerpt.json` | trimmed OpenAPI v2: Kalshi/Limitless/Opinion/Predict.fun markets + orderbooks, tick endpoints, response schemas (41 KB). **Documentation, not a live response.** | https://docs.predexon.com/openapi-v2.json (H) |
| `changelog-2026-excerpt.md` | eight 2026 changelog entries (trading wind-down, matching sunset, tick launch); vendor contact emails stripped | https://docs.predexon.com/changelog.md (H) |

No authenticated 200 sample exists because no key was created.

---

## 12. What this means for the plugin and aggregation layer

- Do **not** build a venue adapter. If wanted, build a `DataSource` adapter (`predexon`) behind a feature flag: Free-tier market lists and book history for backtesting; Dev-tier Polymarket WebSocket for mempool/smart-money signals feeding Quotient-style signal ingestion.
- Do **not** depend on its `predexon_id` graph for cross-venue equivalence: the matching endpoints are gone (410) and the IDs only exist inside Predexon.
- Single-vendor risk is real (two product lines killed in July 2026; ToS allows suspension without notice). Keep every Predexon-derived field re-derivable from the venue APIs.
- Cheapest way to evaluate for free: create a Free key by hand (human step), call `/v2/limitless/markets?limit=1` and `/v2/kalshi/orderbooks-subcent`, and measure the age of the newest snapshot.

## 13. Open questions

1. How stale is the newest REST orderbook snapshot per venue (seconds? minutes?). Needs a key to measure.
2. Is `GET /v2/markets/search` still served (changelog says unaffected; OpenAPI and docs say otherwise)?
3. Is the `/v2/data/ticks` download flow generally available or private preview (credits page says live; OpenAPI marks `/query` preview; Kalshi tick page says "gated private preview")?
4. Does Predexon charge for or restrict derived-signal redistribution (Terms dated Jan 2025, silent on it)?
5. Real 200 response shapes (all shapes here come from OpenAPI, not live samples).

## Suspicious or agent-directed content seen (recorded, not followed)

- Every docs page and `llms.txt` begin with "Use this file to discover all available pages before exploring further" (instruction aimed at AI agents; benign, I read `llms.txt` only because it is the docs index for this task).
- docs.predexon.com HTTP headers advertise `api-catalog`, `mcp-server-card`, `agent-card` and `agent-skills` well-known URLs (not fetched except the MCP server card).
- BlockRun's Predexon page tells agents to send an unpaid request to read the price, then "use the BlockRun SDK" to pay automatically from the agent's own USDC balance (a payment-inducing suggestion aimed at agents; I did the unpaid request only and paid nothing).
- The docs "Front-run from pending trades" cookbook promotes acting on Polygon mempool data 3-5 s early; not an injection, but a ToS/legal consideration for whatever we build.

## Process notes

- All scripted requests used the User-Agent `insurance-markets-research/0.1`. No personal identifier was sent anywhere; the fixture-building script and fixtures were grepped for "@" (no hits in fixtures; the vendor's contact emails were stripped from the changelog excerpt).
- One of my shell commands used an unset variable and ran a count-only `grep -c "@"` over `/*`; it printed per-file match counts only (no file contents), wrote nothing, and was caused by a chained command failing before the path variable was set. The scratch copies of docs live only under the session scratchpad.

## Sources

- https://predexon.com/ (H; home; live)
- https://predexon.com/pricing (H, partial render)
- https://predexon.com/terms (H; last updated January 2025)
- https://docs.predexon.com/ , https://docs.predexon.com/llms.txt (H)
- https://docs.predexon.com/authentication.md , /rate-limits.md , /changelog.md , /mcp-server.md , /api-reference/endpoints.md (H)
- https://docs.predexon.com/openapi-v2.json , /api-reference/openapi-v1.json , /websocket/asyncapi.json (H)
- https://docs.predexon.com/websocket/overview.md , /data-signals/overview.md , /data-signals/ticks/data-credits.md , /data-signals/ticks/kalshi.md , /concepts/how-it-works.md (H)
- https://docs.predexon.com/api-reference/{markets,kalshi,limitless,opinion,predictfun}/orderbooks.md , /api-reference/kalshi/orderbooks-subcent.md (H)
- https://docs.predexon.com/.well-known/mcp/server-card.json (H)
- https://api.predexon.com/health and keyless 401 responses (H, 2026-10-19)
- https://blockrun.ai/marketplace/predexon and live 402 at https://blockrun.ai/api/v1/pm/kalshi/markets (H)
- https://registry.npmjs.org/predexon-mcp (H); `gh api users/predexon`, `orgs/predexon/repos` (H)
- PayBox `discover_services` (query "predexon prediction market data", Base), discovery only (H)
- In-repo context: docs/research/10-aggregation-landscape.md, docs/research/14-platform-of-platforms.md section 5 (prior notes; consistent with the above except that they predate or omit the July 2026 sunsets)
