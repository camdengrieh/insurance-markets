# 02 - XO Market read-side APIs for plugin v0.1

Researched 2026-10-19 (local time; XO servers reported `Sun, 18 Oct 2026 17:3x-17:4x GMT`). Task: `xo-read-api`, feasibility gate item 9 plus everything v0.1 (`xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`, `xo_account`) needs.

Method: read the `xo-docs` MCP (docs.xo.market) and both OpenAPI specs first-hand, then confirmed shapes with **public unauthenticated GETs only** (no POST/PUT/DELETE, no API keys, no signing, no PayBox tools, no .env or key files, nothing cloned or executed from third parties). Every claim is tagged:

- **H** = read first-hand in a primary source this session (docs path/URL) or observed in a live GET (stated as "live").
- **M** = secondary or inferred.
- **L** = weak or stale.
- "NOT FOUND (searched: ...)" = documented absence.

`docs/plan.md` and `docs/research-notes.md` were read first; every XO claim in them was treated as an unverified lead. Verdicts on the leads that touch the read side are in section 12.

---

## 0. Findings that change the plan (read this first)

1. **No secrets are needed for v0.1.** (H, live) `GET /positions`, `GET /balance-allowance`, `GET /claimable` on the orderbook host and `GET /users/portfolio` on the Data API all return 200 with **no auth headers** for any address. The plan's "positions might need L2 HMAC" risk does not materialise: L2 HMAC is only required for orders, trades, API-key management (live: `GET /orders`, `/data/orders`, `/trades`, `/auth/api-keys` return 401 `HMAC L2 credentials required` / `L2 auth required`). Corollary (privacy): anyone's balance and positions are world-readable by address.
2. **There IS a public search endpoint**: `GET https://api-mainnet.xo.market/api/markets?search=<text>` (Data API). Case-insensitive contiguous substring match on the market **title only** (live: `BOND` and `james bond` match "James Bond" markets; `next bond` returns 0). No relevance ranking, no description/tag search.
3. **The Data API's documented defaults will silently hide the tradable markets.** (H, live)
   - `marketScope=default` returns only legacy AMM markets (type 0): 9 ACTIVE rows, **zero CLOB rows**, although the docs say "default = STANDARD (0) + CLOB (2)".
   - `marketScope=onlyClob` returns types 2 and 3 only. An **undocumented market type 4** exists (505 markets, ~167 ACTIVE) that is the user-created "Conviction" product (`effectiveFeeConfig.configName: "convictions"`, `curveModel: CONVICTION_CURVE`) and has live CLOB books. It is only returned by `marketScope=withPulse` or an explicit `marketType`.
   - Safe discovery query: `marketType=2,4` (long-form CLOB + Conviction). `type 3` (BTC 5-minute Pulse rounds, 44,060 rows) floods the catalogue and must be excluded by default.
4. **The OpenAPI schema is not the live wire format** (details in section 4). Biggest traps: outcomes use `outcomeTokenId` and `index` (spec says `tokenId`, `position`), the category field is `categoryPath` (spec: `category`), Data API prices are 6-decimal **micro units** (`"670000"` = 0.67; spec example says `"0.55"`), `take` max is **50** (spec says 1000; 51 returns 400). Parse defensively and keep recorded fixtures.
5. **"Yes/No" is a slot, not a label.** Outcome index 0 is the "Yes" token and index 1 the "No" token even when the titles are team names (live: `AURORA` is index 0 and the orderbook calls that token `Yes`; `FALCONS` is `No`). Never match on title text.
6. **Prices from different endpoints disagree and must not be mixed.** (H, live) For one thin market: Data API `currentPrice` Yes=0.002 (last trade), orderbook `GET /midpoint`=0.5 (book is bid 0.001 / ask 0.999, spread 0.998), `GET /last-trade-price`=0.002, `GET /book` `last_trade_price`="0.000". Quoting a "price" from a midpoint on a wide-spread book is wrong. `xo_market_prices` must return bid, ask, spread, depth, last trade and a thin-book flag, never a single number.
7. **`CLOSED` in the Data API means settled-with-winner in practice**, contradicting the lifecycle guide's "Closed = closed without resolution". (H, live scan of all 2,390 CLOSED type 2/4 markets: every one has `winningOutcomeId` and `resolvedAt` set.) There is **no "disputed" status anywhere** in either API (section 6).
8. **The "trading enabled" flag in `xo_account` cannot be read from XO's REST APIs.** `allowance` on `/balance-allowance` is "available cash after open-order reservations", not the ERC-20 approval to the CTF Exchange. Reading real approvals needs an `eth_call` on chain 3223, and the mainnet RPC needs a privately issued `api_key`. Explorer fallback is unverified (section 12).
9. **Cloudflare blocks the default Python-urllib User-Agent (403) on both hosts**; `node`, `undici`, `curl` and a custom UA pass. Send an explicit `User-Agent`.
10. **Fees: two sources disagree.** `GET /fee-rate` returns `{"base_fee":0}` for a Conviction token whose Data API detail says `effectiveFeeConfig.takerFeeBps: 400` (live). The Fees guide says `/fee-rate` is authoritative. Unresolved (section 11).

---

## 1. Hosts and global conventions

| Item | Value | Conf |
|---|---|---|
| Orderbook REST | `https://orderbooks.xo.market` (OpenAPI `servers[0]`, "Mainnet (XO chain id 3223)") | H |
| Orderbook WebSocket | `wss://orderbooks.xo.market`, channels `/ws/market`, `/ws/user`, `/ws` | H (host: docs intro table; paths: guides) |
| Data API REST | `https://api-mainnet.xo.market/api` (OpenAPI `servers[0]`, "Production (XO mainnet, chainId 3223)"); all paths under `/api` | H |
| Data API Socket.IO | `https://api-mainnet.xo.market/portfolio-public` (namespace `/portfolio-public`) | H |
| Chain id | 3223 | H |
| Collateral | "XO USDC" (USDC.e), 6 decimals. Live Data API `collateralToken`: symbol `USDC`, name "Bridged USDC (XO)", `decimals: 6` | H (docs + live) |
| Hosts to allowlist for a plugin | `orderbooks.xo.market`, `api-mainnet.xo.market` (market images/metadata are on `storage.googleapis.com`, not needed for reads) | M (inferred) |
| CORS | `access-control-allow-origin: *` on Data API (live) | H |
| Auth schemes | Orderbook: L1 ClobAuth (EIP-712 wallet sig, 4 headers `XO_ADDRESS`, `XO_SIGNATURE`, `XO_TIMESTAMP`, `XO_NONCE`), L2 HMAC (4 headers `XO_API_KEY`, `XO_TIMESTAMP`, `XO_PASSPHRASE`, `XO_SIGNATURE`, +-30 s skew). Data API liquidity-rewards `/me` routes: Privy Bearer JWT, which "do not accept the orderbook L1/L2 HMAC scheme". Everything else: none. | H |

Doc inconsistency (L2 header names): the authentication page says `XO_API_KEY`/`XO_PASSPHRASE`, but the OpenAPI `ApiKeyTriplet` description says the key is sent "as `POLY_API_KEY` header". Out of v0.1 scope; flag for the trading task.

---

## 2. Endpoint catalogue

Auth column: **none** (verified live unless marked "docs only"), **L1**, **L2**, **Privy**. "Live" = confirmed with a public GET this session. Fixture names are under `docs/research/fixtures/xo/`.

### 2.1 Orderbook API (`https://orderbooks.xo.market`)

Market data (all auth none):

| Method + path | Params | Response (200) | Notes | Fixture |
|---|---|---|---|---|
| GET `/` | - | `"ok"` | liveness | |
| GET `/health` | - | `{"status":"ok"}` | | orderbook-health |
| GET `/version` | - | `{git_sha, build_timestamp:int(s), version}` | `git_sha` is `"unknown"` | orderbook-version |
| GET `/time` | - | bare JSON integer, Unix **seconds** | use for skew checks | orderbook-time |
| GET `/trading-state` | - | `{"state":"active"\|"paused"}` | Documented only in the Trading-pause guide, **not in OpenAPI**; live works; `cache-control: no-store`. Global kill switch. | orderbook-trading-state |
| GET `/book` | `token_id` (required) | `{market(conditionId), asset_id, timestamp(ms string), hash, bids[], asks[], min_order_size, tick_size, neg_risk, last_trade_price}` + live extra `last_update_id` (int) | bids best-first descending, asks best-first ascending; level = `{price:string, size:string}` (size in human shares). Empty arrays when no orders. 404 `No orderbook exists for the requested token id` for unknown tokens **and for closed markets** (live). `min_order_size` returns `"0"` when no MarketInfo (seen live on every book). `last_trade_price` is `"0.000"` even when trades exist (live). | orderbook-book |
| POST `/books` | body `[{token_id}]` | array parallel to request, unknown ids give empty book shape | documented read-only batch; **not called** (POST ban) | |
| GET `/midpoint` | `token_id` | `{"mid":"0.5"}` | `"0.000"` when a side is empty. Field is `mid` | orderbook-midpoint |
| POST `/midpoints` | body `[{token_id}]` | map token_id -> string | not called | |
| GET `/price` | `token_id`, `side=BUY\|SELL` | `{"price":"0.001"}` | **`side=BUY` returns the best bid, `side=SELL` the best ask** (docs + live: BUY=0.001, SELL=0.999 on a 0.001/0.999 book). `"0.000"` if that side is empty. | orderbook-price-buy / -sell |
| POST `/prices` | body `[{token_id, side}]` | nested map | not called | |
| GET `/spread` | `token_id` | `{"spread":"0.998"}` | empty-book default is bare `"0"` | orderbook-spread |
| POST `/spreads` | body `[{token_id}]` | map | not called | |
| GET `/last-trade-price` | `token_id` | `{"price":"0.002","side":"SELL"}` | no trade yet gives `"0.5"` and `side:""` | orderbook-last-trade-price |
| GET or POST `/last-trades-prices` | JSON body `[{token_id}]` | `[{token_id, price, side}]`, tokens with no trades silently omitted | "Both GET and POST route to the same handler. GET accepts a JSON body". **Live: GET with a JSON body works** (returned both tokens). Useful because a plugin can stay GET-only. | orderbook-last-trades-prices |
| GET `/prices-history` | `token_id`, `interval` (int, window seconds), `fidelity` (int, bucket seconds) | `{"history":[{"t":int unix s,"p":"0.500"}]}` | The Rust sample passes `interval:"1h"` (string) while the schema says integer seconds: unresolved. Live `interval=86400&fidelity=3600` returned one point. | orderbook-prices-history |
| GET `/tick-size` | `token_id` | `{"minimum_tick_size":0.001}` (JSON **number**) | global 0.001 | orderbook-tick-size |
| GET `/fee-rate` | `token_id` | `{"base_fee":0}` (int bps) | see finding 10 | orderbook-fee-rate |
| GET `/neg-risk` | `token_id` | `{"neg_risk":false}` | "Always false on XO" | orderbook-neg-risk |
| GET `/live-activity/events/{condition_id}` | path | `[]` | "Currently a stub - always returns `[]`" | orderbook-live-activity |
| POST `/heartbeats`, `/v1/heartbeats` | - | 200 | SDK keep-alive shim, irrelevant | |

Markets (auth none):

| Method + path | Params | Response | Notes | Fixture |
|---|---|---|---|---|
| GET `/markets` | `limit` (default 100, max 500 per schema), `next_cursor` | `{limit, count, next_cursor, data:[{condition_id, tokens:[{token_id, outcome:"Yes"\|"No", price}], minimum_tick_size:number, neg_risk, active:bool}]}` | **Not usable for discovery**: live it holds 47,062 rows (every Pulse round ever), is ordered oldest-first, has **no titles/slugs/status**, and live `count` is the **total** (47062 with `limit=2`), not the page size as the schema says. `tokens[].price` = book midpoint, falling back to last trade, then `"0.000"`. | orderbook-markets |
| GET `/markets/{condition_id}` | path | one market object (same shape) | `active:true` only for markets live in the matching engine (live: false for PAUSED, RESOLVED, CLOSED). Unknown id gives 404 `{"error":"0x000..."}` (live), not the documented `market not found: 0x...`. | orderbook-market-by-condition |
| GET `/simplified-markets`, `/sampling-markets`, `/sampling-simplified-markets` | same | **Live: byte-identical to `/markets`** (47,062 rows, same first page) | SDK-parity shims; ignore | |

Account (auth **none**, live; the OpenAPI declares no `security` on these three):

| Method + path | Params | Response | Notes | Fixture |
|---|---|---|---|---|
| GET `/balance-allowance` | `address` (required), `asset_type`, `token_id` (both ignored on XO) | `{"balance":"0","allowance":"0","smart_account":null}` | `balance` = micro-USDC string; `allowance` = "available cash after open-order reservations" (`balance - allowance` = earmarked for resting BUYs); `smart_account` = hex **without** `0x`, null for plain EOAs | orderbook-balance-allowance-dummy-address |
| GET `/balance-allowance/update` | `address` | same | Spec says L2 HMAC and "forces a fresh chain read"; **live it answered 200 with no auth**. Do not depend on it; do not call it needlessly. | |
| GET `/positions` | `address` (required), `limit`, `next_cursor` | `{"cash_balance":"0","positions":[{token_id, balance, reserved}]}` | balances in **micro-shares** (`"50000000"` = 50 shares); free shares = `balance - reserved`; **the response schema has no `next_cursor`** although the request accepts one (cannot page). No market/outcome metadata: join `token_id` to the Data API. Described as "the caller's positions" but takes any address. | orderbook-positions-dummy-address |
| GET `/claimable` | `address` | `{"address":"0x...lowercased","claimable":[{market_id(conditionId), outcome:"Yes"\|"No", token_id, balance(micro-shares), refund_reason:"resolved_winner"\|"voided_refund"}]}` | "a discovery hint, not the on-chain gate": `redeemPositions` reverts until `payoutDenominator(conditionId) > 0` (Redeem guide). | orderbook-claimable-dummy-address |

Authenticated, **not usable in v0.1** (listed so nothing is missed): `POST/DELETE /auth/api-key` (L1/L2), `GET /auth/derive-api-key` (L1), `GET /auth/api-keys` (L2), `POST /order`, `POST /orders`, `DELETE /order|/orders|/cancel-all|/cancel-market-orders`, `GET /orders` (security `[L2, {}]`, live 401), `GET /data/orders`, `GET /data/order/{id}`, `GET /trades`, `GET /data/trades`, `GET /trades/{id}`, all L2 (live 401 on `/orders`, `/trades`, `/data/orders`). Trading is out of scope here.

WebSocket (orderbook): the docs give only one-paragraph summaries. Public market channel: "No authentication. Clients subscribe to one or more `assets_ids` (token IDs) and receive `book`, `price_change`, `last_trade_price`, and optionally `best_bid_ask`, `new_market`, `market_resolved` events." `/ws/user` needs the L2 triplet in the subscribe body. `market_status_changed` and `trading_state_changed` frame shapes are documented in the lifecycle and trading-pause guides. **The subscribe message format and frame schemas are NOT FOUND** (searched: `/api-reference/websockets/**`, rg `assets_ids|price_change|event_type`, `/openapi/**`). A request/response plugin does not need it for v0.1.

### 2.2 Data API (`https://api-mainnet.xo.market/api`)

All auth none unless noted. Live samples under fixtures `data-*`.

| Method + path | Params | Response | Notes |
|---|---|---|---|
| GET `/markets` | `page` (1-based, default 1), `take` (default 10; **live max 50**), `search`, `marketScope` (`default`\|`withClob`\|`withPulse`\|`onlyPulse`\|`onlyClobPulse`\|`onlyClob`), `marketType` (comma list 0..4, overrides scope), `statuses` (comma list), `categories`, `isFeatureMarket`, `sortBy` (`createdAt`\|`expiresAt`\|`startsAt`\|`totalVolume`\|`totalVolumeInUSD`), `sortOrder` (`ASC`\|`DESC`) | `{data:[MarketListItem], meta:{page,take,itemCount,pageCount,hasPreviousPage,hasNextPage}}` | `statuses` tokens: `PENDING,ACTIVE,PAUSED,CLOSED,RESOLVED,VOIDED` plus special `CLOSING_24H` and `EXPIRED`; "Cancelled markets are omitted." **`categories` is applied after pagination** (live: `categories=TECH&take=50` page 1 returned 0 rows while `meta.itemCount` stayed 414) so it cannot be trusted for paging; filter client-side. `search`/`statuses`/`marketType` filter correctly (itemCount changes). `statuses=EXPIRED` returns rows whose status is still `ACTIVE` but `expiresAt` is past. `marketType=2&statuses=PAUSED` returned `itemCount:1, data:[]` (count/data mismatch bug; the PAUSED rows are type 4). |
| GET `/markets/{id}` | numeric backend id | `Market` (list item + detail fields) | 404 body shape differs from the Pulse/portfolio 404s (section 8) |
| GET `/markets/slug/{slug}` | slug | `Market` | adds `rootEventSlug`, `convictionSeed` vs the by-contract lookup (live) |
| GET `/markets/contract/{contractAddress}` | 20-byte wrapper address **or** 32-byte `conditionId` | `Market` | the way to go from an orderbook `condition_id` to metadata. Works for Pulse conditionIds too (live). |
| GET `/pulse/markets` | `page`, `limit` (max 100, default 10), `status` (`ACTIVE`,`RESOLVED`,`CLOSED`; live value is lowercase `active` in the row), `marketConfigId`, `adapterConfigId`, `sortBy` (`createdAt`\|`expiresAt`\|`resolvedAt`\|`closedAt`), `sortOrder` | `{data:[PulseMarket], meta:{page,limit,total,totalPages,hasNextPage,hasPreviousPage}}` | meta shape differs from `/markets` (`limit/total/totalPages`) |
| GET `/pulse/markets/batch` | `addresses` (comma list) | array of `PulseMarket` | not exercised live |
| GET `/pulse/markets/{address}` | on-chain address per docs | `PulseMarket` | **live the CLOB Pulse rows have `marketAddress: null`**; the route accepts the `conditionId` (live 200) |
| GET `/users/portfolio` | `user` (required: wallet address `0x...` any case, or username), `page`, `take`, `marketScope`, `status` (`active`\|`closed`\|`all`\|`resolved`), `marketId`, `contractMarketId`, `marketStatus`, `search`, `sortBy` (`pnl`\|`value`\|`expiry`\|`createdAt`), `sortOrder`, `refresh` | `{data:[PortfolioMarketEntry{id,contractMarketId,contractAddress,slug,title,status,winningOutcomeId,totalStake,totalPnL,transactionCounts,positions:[{id,status,shareAmount(micro-shares),collateralAmount,entryPrice,entryValue,currentValue,pnl,pnlPercentage,hasClaimed,outcome{title,outcomeTokenId,currentPrice}}]}], meta}` | "Private profiles return an empty paginated result." Unknown user: 404 `User not found`. **Populated response not verified live** (only empty/404 results obtained without querying a real person's account). |
| Socket.IO `/portfolio-public` | emit `portfolio_subscribe {user, ...filters}`, `portfolio_refresh`, `portfolio_unsubscribe`; receive `portfolio_snapshot`, `portfolio_error` | same `data/meta` as REST | unauthenticated; "Do not poll REST on an interval while this socket is active." Not suited to a stateless plugin. |
| GET `/public/liquidity-rewards/earning-pools` | - | `{data:[{marketId, market{title,conditionId,status,prices{yes,no},outcomes,bookSnapshot,...}, cp{...}, usdc{...}, group?}], meta:{itemCount,currentEpoch,dayOpenMs,dayCloseMs,endsInMs}}` | live 15 rows, ~52-71 KB; sorted by daily pool; cached ~30 s; 30 req/10 s |
| GET `/public/liquidity-rewards/markets/{marketId}/config` | marketId = `conditionId` | `{market_id, group_id, programmes:[{currency CP\|USDC, reward_enabled, active, inactive_reason, daily_pool, max_distance_cents, single_sided_factor, two_sided_band_low/high, min_order_rest_seconds, min_order_size_shares, min_payout, ...}], active_bonus,...}` | 404 if none |
| GET `/public/liquidity-rewards/markets/{marketId}` | | lifetime paid + live CP and USDC rails | |
| GET `/public/liquidity-rewards/markets/{marketId}/epochs/{epoch}` | epoch = UTC-day index | CP market-day rollup with `top_makers` | cached ~5 min |
| GET `/public/liquidity-rewards/markets/{marketId}/epochs/{epoch}/makers` | `page` (0-based), `page_size` (<=1000) | CP-only maker list | may 409 on dual-rail days |
| GET `/public/liquidity-rewards/markets/{marketId}/epochs/{epoch}/orders` | `maker`, `page`, `page_size` | scored orders | |
| GET `/public/liquidity-rewards/markets/{marketId}/wallets/{walletAddress}` | `epoch`, `page`, `page_size` | maker on one market-day, CP + USDC | preferred for dual-rail |
| GET `/public/liquidity-rewards/wallets/{walletAddress}/epochs/{epoch}`, `/orders`, `/summary` | | wallet rollups | summary = same payload as Privy `/me/summary` |
| GET `/public/liquidity-rewards/groups`, `/groups/{groupId}` | `page` (0-based), `page_size` (<=100), `currency`, `include_zero` | Pulse reward groups | live: 1 group |
| GET `/liquidity-rewards/*` (10 routes: `earning-pools`, `leaderboard`, `leaderboard/me`, `markets/{id}/config`, `markets/{id}/me`, `me/epochs/{epoch}`, `me/group-history`, `me/orders`, `me/summary`, `groups/{id}/me`) | | | **Privy Bearer token required** (401/403). Not usable: a Privy session token is a user credential. |

Not in either spec (NOT FOUND, searched `/openapi/**`, `rg` for `events`, `holders`, `comments`, `categories`): an events/series listing endpoint, a categories listing endpoint, a market-holders or trade-history endpoint for public use, a creator filter on `/markets`, the authenticated `/users/me/portfolio` (only referenced), a Data API health endpoint.

---

## 3. Units, formats, conventions (what the plugin must normalise)

| Quantity | Format | Where | Conf |
|---|---|---|---|
| Price (orderbook) | trimmed decimal **string** `"0.5"`, `"0.534"`; book snapshot levels padded `"0.500"` (WS only) | `/midpoint /price /spread /last-trade-price /book` | H |
| Tick | 0.001 globally, ticks 1..999; `minimum_tick_size` is a JSON number | | H |
| Empty-book sentinels | `/midpoint` `"0.000"`, `/spread` `"0"`, `/last-trade-price` `"0.5"`+`side:""`, `/book.last_trade_price` `"0.000"`, `/price` `"0.000"` | do not share a default | H |
| Price (Data API) | **micro-units string** (live `"670000"` = 0.67; `"500000"` = 0.50) in `outcomes[].currentPrice`. Looks like last trade, not mid; the two outcomes need not sum to 1 (live 0.67 + 0.215). | `/markets*` | H (live); spec example `"0.55"` is wrong |
| Share size in books | human shares, decimal-string integer `"1000"` | `/book` levels | H |
| Share size in positions/claimable/portfolio | **micro-shares** (1e6 = 1 share) | `/positions /claimable /users/portfolio.shareAmount` | H |
| USDC.e | **6 decimals** (docs "XO USDC (collateral, 6 decimals)"; live `collateralToken.decimals: 6`) | `balance`, `allowance`, `cash_balance` are micro-USDC strings | H |
| Volume | `totalVolume` = collateral base units (1e6); `totalVolumeInUSD` live has **6 decimals** (`"5825977.896836"`), spec says "2-decimal precision"; `totalNotional(InUSD)` also present live | | H |
| Timestamps | `GET /time` bare int **seconds**; `BookResponse.timestamp` and WS events stringified **ms**; trade `match_time`/`last_update`, order `expiration` stringified **seconds**; `OpenOrder.created_at` bare int s; `retry_after_ms` int ms; `prices-history.t` bare int s; Data API fields ISO-8601 UTC strings; liquidity rewards `*Ms` fields are unix ms | | H |
| IDs | `condition_id` 0x+32 bytes; `token_id` decimal U256 (no 0x); `order.id` decimal string; `owner` UUIDv5; `smart_account` hex without `0x` | | H |

Pagination conventions (three different ones):

- Orderbook lists: `limit` + `next_cursor` (base64 of a numeric offset; live `Mg==` = "2"); end-of-stream sentinel is the literal `"LTE="`; `next_cursor` is never null.
- Data API markets/portfolio: `page` (1-based) + `take`; `meta.hasNextPage`.
- Data API pulse: `page` + `limit`; meta `total/totalPages`.
- Liquidity rewards: `page` 0-based + `page_size`.

---

## 4. Documented vs live (drift table)

Primary evidence: OpenAPI at `/openapi/data-api-reference/openapi.yaml` and `/openapi/api-reference/openapi.yaml` vs live GETs 2026-10-18. The docs say the Orderbook reference is "generated from the live OpenAPI spec" yet drift exists, so treat the specs as hints and pin behaviour with fixtures.

| Topic | Docs/spec | Live |
|---|---|---|
| Outcome token id key | `outcomes[].tokenId`, `position` | `outcomes[].outcomeTokenId`, `index`, plus `outcomeTokenAddress`, `currentPrice`, `volumeTraded`, `volumeTradedInUSD`, `notionalTraded` |
| Outcome title | example `"YES"` | `"Yes"`/`"No"`, or any label (`AURORA`, `UP`, `DOWN`) |
| Category | `category:[{id,name}]` | `categoryPath:[{id,name,slug}]` (top-level then sub-category) |
| List-row fields | no `description`, `rules`, `tags`, `collateralTokenId` | `rules:{}` present but empty; adds `creator{...}`, `creatorId`, `resolutionSources[]`, `resolverAddress`, `resolutionType`, `resolutionFlagCount`, `reviewStatus`, `notes`, `cpEnabled`, `cpMultiplier`, `creatorBps`, `priorityScore`, `likes`, `featuredOrder`, `createMarketBlockTimestamp`, `totalNotional*`; `visible` absent |
| Detail fields | `description`, `rules`, `tags`, `status` (incl. `CANCELLED`), `collateralTokenId` | adds `collateralToken{...}`, `effectiveFeeConfig{...}`, `resolutionEvidence`, and (slug lookup only, absent from the by-contract lookup) `convictionSeed{...}` and `rootEventSlug`; `tags: null`; `collateralTokenId` = 2 (spec example 3) |
| `take` | max 1000, default 10 | max **50**: `take=51` -> 400 `{"statusCode":400,"message":["validations.MAXIMUM_NOT_OBSERVED"],"error":"Bad Request"}` |
| `marketScope=default` | STANDARD + CLOB | STANDARD (type 0) only |
| Market `type` enum | 0 STANDARD, 1 PULSE, 2 CLOB, 3 CLOB_PULSE | also **4** (Conviction) |
| Pulse row | `marketAddress` set, `status` "ACTIVE" | `marketAddress: null`, `conditionId` present, `status: "active"` (lowercase), extra `openingPrice`, `closingPrice`, `resolutionData` |
| Orderbook `/markets` `count` | items in this page | total rows (47062) |
| Orderbook unknown-market 404 | `market not found: 0x...` | `{"error":"0x000..."}` (bare id) |
| Orderbook missing query param | JSON `{error}` | plain text `Failed to deserialize query string: missing field `token_id`` (HTTP 400) |
| `/balance-allowance/update` | L2 HMAC | 200 without auth |
| `MarketTokenObject.outcome` | schema enum `[true,false]` | `"Yes"`/`"No"` (the example is right, the enum is wrong) |
| `GET /book` | no `last_update_id` | extra `last_update_id` int |
| Rate-limit headers | Data API 100 req / 10 s | `x-ratelimit-limit: 50`, `x-ratelimit-reset: 1`; public LR route `30` / `10` (matches docs) |

---

## 5. Identity: what identifies a market, how tokens map

- **Primary key = `conditionId`** (0x + 32 bytes). H (docs: wire-conventions "The market identifier"; Data API: "CLOB orderbook routes treat this as `market_id`"). For V3 CLOB markets `contractMarketId == conditionId` (H, live).
- Data API also has a numeric backend `id` (used in `/markets/{id}`), a `slug` (e.g. `jack-barton-will-be-announced-as-the-next-james-bo-2536`; truncated title plus 4-digit suffix), and `marketContractAddress` (live: one shared address, the `XOClobMarketManager`, for all V3 markets). Numeric ids differ between the Pulse table and the market table (pulse id 46410 vs market id 50501 for the same round).
- **Token ids**: each binary market has exactly two outcome tokens (ERC-1155 position ids on Conditional Tokens `0xCcf1...3909`, which is also `outcomeTokenAddress` in live rows). Docs: "Derived from `getPositionId(conditionId, indexSet)`." and "YES is slot 0 (`0b01`), NO is slot 1 (`0b10`)" with `parentCollectionId` zero and XO USDC collateral (Redeem guide). The derivation formula itself is not spelled out (NOT FOUND: searched `getPositionId|collectionId|indexSet` across all docs). **Do not derive**: read them from `outcomes[].outcomeTokenId` (Data API) or `tokens[].token_id` (orderbook `/markets/{condition_id}`). Cross-check verified live on two markets: Data API `index 0` == orderbook `Yes` token, `index 1` == `No` token, including a market titled `AURORA`/`FALCONS`.
- Multi-choice questions are modelled as **separate binary markets** sharing a `rootEventSlug` (e.g. one market per candidate for "next James Bond"). `neg_risk` is always false (H, docs + live), so mutual exclusivity is only stated in the rules text, not enforced on-chain. No events/series endpoint exists.
- `reviewStatus` on Conviction (type 4) rows takes at least `APPROVE` and `UPDATE_REQUIRED` live (the docs never define it). A type-4 market with `reviewStatus: UPDATE_REQUIRED` was `ACTIVE` with a live book. Meaning unverified.

Market types (live counts 2026-10-18, `itemCount` from `/markets`, M for derived ACTIVE counts):

| type | Meaning | Count | Notes |
|---|---|---|---|
| 0 | STANDARD, legacy LS-LMSR AMM | 1,346 total, 9 ACTIVE | not tradable on the orderbook ("include LMSR AMM markets that are not tradable through the CLOB orderbook") |
| 1 | PULSE (old AMM pulse, e.g. "ETH 9min Pulse") | 1,876 | legacy |
| 2 | CLOB long-form | 2,391 total: 247 ACTIVE, 50 PENDING, 3 RESOLVED, ~2,075 CLOSED | |
| 3 | CLOB_PULSE (BTC 5-minute rounds) | 44,060 | 288 rounds/day |
| 4 | **Undocumented** Conviction (user-created, CLOB) | 505 total, ~167 ACTIVE, 6 PAUSED | `effectiveFeeConfig`: `CONVICTION_CURVE`, taker 400 bps, maker 0, split creator 2000 / maker 3500 / platform 4500 bps |

The `creatorShareBps: 2000` (20%) corroborates the research-notes lead that creators earn 20% of fees (H as a live data point).

---

## 6. Lifecycle states: resolved, closed, paused, disputed

Two vocabularies exist:

- Orderbook lifecycle guide (Title-case): `Pending, Active, Paused, Resolved, Voided, Closed`; "Resolved, Voided, and Closed are terminal"; Closed = "closed without resolution". New orders on non-Active: 422 `market is not active (status: Paused)`. Resting orders: retained on Paused, cancelled atomically on terminal states. H (docs).
- Data API (UPPERCASE): list `PENDING, ACTIVE, PAUSED, CLOSED, RESOLVED, VOIDED`; detail adds `CANCELLED` (cancelled markets are omitted from lists). H (spec).

Live observations (H, 2026-10-18) that decide how the plugin should classify state:

- **Settled = `winningOutcomeId != null` and `resolvedAt != null`.** A full scan of all CLOSED type 2/4 markets found 2,073 + 317 rows, every one with both fields set and none without a winner. RESOLVED is rare (3 rows) because rows move RESOLVED to CLOSED after "the resolution period"; the lifecycle and Redeem guides say payouts are reported on-chain "when the market is **closed** (after the resolution period)" and `redeemPositions` reverts until `payoutDenominator(conditionId) > 0`. My reading (M, inferred from those guides plus the live counts) is that `RESOLVED` is a **provisional window** (winner recorded, payout not yet redeemable) and `CLOSED` is final-and-claimable. The product doc's "Closed without resolution" case was not observed (0 rows). VOIDED: 0 rows live; the voided path is documented in `/claimable` (`voided_refund`, both sides refund 50% per the Redeem guide).
- **`ACTIVE` does not mean tradable.** `statuses=EXPIRED` returns rows with `status: ACTIVE` and a past `expiresAt` (12 rows). Sports markets move to `PAUSED` at expiry while waiting for resolution (6 PAUSED type-4 rows with `expiresAt` earlier that day). A tradability test must be: `status == ACTIVE` AND `now < expiresAt` AND orderbook `GET /markets/{cid}.active == true` AND a two-sided book. Closed/resolved markets 404 on `/book`.
- **`PENDING`** markets (50 live) show a 0.5/0.5 placeholder price and `startsAt` in the future.
- **Disputed / challenged: no representation.** NOT FOUND (searched all docs for `disput|challeng|bond`: only legal/ToS prose about MODRA and arbitration; Data API enums contain no such state; `statuses=DISPUTED` returns an empty list with HTTP 200). The research-notes lead of "bonded challenges" is not exposed in the API. The closest signals are `resolutionFlagCount` (undocumented int), `reviewStatus`, and the RESOLVED-but-not-CLOSED window. Plan guardrail "refuse disputed markets" can only be implemented as "refuse anything not ACTIVE and unexpired; treat RESOLVED as not claimable until CLOSED".
- Resolution metadata is attacker-controlled free text: `rules.description`, `rules.outcomeRules[].rule`, `resolutionSources[]` (URLs), `title`, `creator.bio`, `notes`. Return as labelled data fields only. `resolutionType` is `MANUAL` on every sampled row (resolver address = the creator's wallet in the sample), which matters for the "MODRA resolves" lead: not visible in these fields (M).

WebSocket-delivered lifecycle events (not usable by a stateless plugin): `market_status_changed {type, market_id, old_status, new_status, cancelled_orders}` on `/ws`; `trading_state_changed` on all channels. Global pause: `GET /trading-state`; `POST /order|/orders` return 503 `trading_paused` with `Retry-After: 60`.

---

## 7. Pulse markets

- **What**: "Pulse is XO's rolling BTC Up or Down market. Each round lasts five minutes", settled against a 60-second TWAP (Pulse product page). Current Pulse is "BTC, five minutes, continuous"; older hourly/ETH/observation-phase material is stale. H.
- On the API: market type 3 (CLOB_PULSE), outcomes `UP` (index 0) / `DOWN` (index 1). Resolution text (live): resolves "Up" if the Chainlink BTC/USD 60-second TWAP for the period is >= the price at the period start, sole source "Chainlink BTC/USD TWAP 60s Data Stream". One `conditionId` per round (288/day, 44,060 rows to date). Pulse metadata (`cycleNumber`, `openingTwap`, `closingTwap`, `winningOutcome`, `sampleCount`) lives at `/pulse/markets`.
- `GET /pulse/markets?status=active` lists the live round **and upcoming rounds** (live: 4 rows, including rounds starting 15 minutes ahead).
- Relevance to v0.1: exclude by default (`marketType=2,4`), expose only behind an explicit opt-in. A 5-minute product is poorly suited to a plugin whose writes have ~5-minute proposal expiry and PayBox approval latency.
- Liquidity rewards treat a Pulse product as one group with a single daily pool shared by all rounds (`group_id`).

---

## 8. Errors, rate limits

Error shapes (live unless noted):

| Source | Status | Body |
|---|---|---|
| Orderbook (validation) | 400 | `{"error":"invalid token_id: digit 10 is out of range for base 10"}` ; plain text for missing/deserialize errors |
| Orderbook | 401 | `{"error":"HMAC L2 credentials required"}` / `{"error":"L2 auth required"}` (and `L1 ClobAuth headers required` per spec) |
| Orderbook | 404 | `{"error":"No orderbook exists for the requested token id"}` (book/price reads), `{"error":"<bare id>"}` (market lookup) |
| Orderbook | 422 | business-rule failures, prefixes `insufficient balance`, `market is not active`, ... (docs; writes only) |
| Orderbook | 429 | `{"error":"rate limit exceeded","retry_after_ms":387}` documented for per-user **mutation** limits |
| Orderbook | 503 | `{"error":"trading_paused","message":...}` + `Retry-After: 60` (writes) |
| Data API 400 | 400 | `{"statusCode":400,"message":["validations.MAXIMUM_NOT_OBSERVED"],"error":"Bad Request"}` |
| Data API 404 (market) | 404 | `{"statusCode":404,"timestamp":...,"path":"/api/markets/99999999","resource":"Market","details":{"message":"Market not found"},"name":"ResourceNotFoundError"}` |
| Data API 404 (user) | 404 | `{"statusCode":404,"timestamp":...,"path":...,"response":{"message":"User not found","error":"Not Found","statusCode":404},"status":404,"options":{},"message":"User not found","name":"NotFoundException"}` (echoes the request path/query) |
| Data API 429 | 429 | documented only as "Too Many Requests", no body shape |
| Cloudflare | 403 | default Python-urllib UA on both hosts |

The plugin needs a single error normaliser that handles at least five shapes and plain text. Never echo raw upstream bodies to the model (the Data API 404 echoes caller-supplied query text).

Rate limits (docs, `/api-reference/rate-limits`, `/data-api-reference/rate-limits`):

| Tier | Limit | Conf |
|---|---|---|
| Orderbook public REST | **5 requests/second** | H docs; live probe: 10 concurrent `GET /time` all returned 200 and no rate-limit headers were sent, so enforcement is not visible at that volume (M) |
| Orderbook authenticated single order place+cancel | 250 req/s total; batch 25 req/s; batch cancel-all 5 req/s | H docs (writes, out of scope) |
| Orderbook WS | public 3 concurrent connections, authenticated 25; idle 60 s (send `PING`), 100 msg/s, 65 KB, 100 market subscriptions | H docs |
| Data API REST | **100 requests / 10 s**; `/public/liquidity-rewards/*` **30 / 10 s** | H docs; live headers `x-ratelimit-limit: 50`, `reset: 1` on the general routes and `30`/`10` on the LR route (the general-route headers disagree with the docs) |

Recommendation: budget <= 4 req/s per host and cache aggressively (M). The orderbook doc says "The server will reject excess traffic without backoff hints."

---

## 9. Liquidity rewards: what they add

Facts (H, product docs `/product/rewards/liquidity-rewards`, `/maker-rebates`; Data API spec; live):

- Pays makers (CP and/or USDC) for resting qualifying limit orders per UTC-day epoch (`epoch = floor(unix_ms / 86_400_000)`); no fill needed. Per-market config: max distance from reward midpoint (`max_distance_cents`), min size, min rest time, one-sided factor vs two-sided band, daily pool, `min_payout`. Score: `((D-d)/D)^2` proximity weight x size x resting time.
- Separate **maker rebate**: 35% of the taker fee returned to the maker (fee-enabled markets, T+1).
- Live (2026-10-18): 15 enrolled markets (one BTC 5-min Pulse group, 14 others: 400 CP + ~$6.67 USDC/day on the biggest long-form pools). Pools are tiny in USD terms.
- **What it adds for v0.1**: (a) a cheap, public "where is the book subsidised / actively quoted" signal; (b) each earning-pool row embeds `market.prices.{yes,no}`, outcome token ids and a `bookSnapshot` (`priceTick` 0-1000, `sizeMicro`) so one 30-req/10s call yields books for 15 markets; (c) config values (min size, max distance) that tell an agent what size/price is sensible. It is optional metadata, not required for any of the 7 tools.
- Cautions: `estimatedApr` is nonsense for tiny liquidity (live `"243333.67"` and `"36500.00"`; do not surface), ended programmes can still appear (`inactive_reason: window_elapsed`), and CP-only epoch endpoints can return 409 on dual-rail days. All `/liquidity-rewards/*` (non-public) routes need a Privy Bearer token and are out of scope. Writing/earning rewards is a trading-phase concern.

---

## 10. Mapping to planned v0.1 tools

None of the seven tools needs any credential. No secret ever has to pass through tool arguments or env vars for v0.1.

| Tool | Serving endpoint(s) | Auth | Gaps / notes |
|---|---|---|---|
| `xo_search` | Data API `GET /markets?search=<q>&marketType=2,4&statuses=ACTIVE&take=50&sortBy=totalVolume&sortOrder=DESC` | none | **Public search exists**, title-only contiguous substring; no ranking; `take<=50`; use `sortBy` for ordering; filter categories client-side (post-pagination bug); do not use `marketScope`; exclude type 3 by default. Search is on the Data API, not the orderbook. |
| `xo_get_markets` | same endpoint with `page/take/statuses/sortBy`; optional `GET /public/liquidity-rewards/earning-pools` for subsidised markets | none | `meta.hasNextPage` pagination. List rows have **no description/rules** (live `rules:{}`): need a detail call for rules. `volume` fields are not a liquidity measure. |
| `xo_get_market` | Data API `GET /markets/contract/{conditionId}` (or `/markets/slug/{slug}`, `/markets/{id}`) for metadata + rules + sources + fee config; orderbook `GET /markets/{condition_id}` for the `active` flag and book-derived outcome prices | none | Lookup by slug or numeric id also supported. `rules.description`, `outcomeRules`, `resolutionSources` are untrusted text. Fee quote: conflict between `effectiveFeeConfig` and `/fee-rate` (finding 10). |
| `xo_orderbook` | orderbook `GET /book?token_id=<yes>` and `...=<no>` (2 calls); `POST /books` batch exists but is POST | none | Book is per token. YES-ask and NO-bid are economically equivalent (docs: matching can use "economically compatible YES/NO liquidity"), so show both. `min_order_size` is unreliable (`"0"`). 404 for closed/resolved markets. Level `size` is human shares; the prior-plan unit question is settled: **book = human shares, positions = micro-shares**. |
| `xo_market_prices` | orderbook `GET /price?side=BUY|SELL` (best bid / best ask), `/spread`, `/midpoint`, `/last-trade-price`, `GET /last-trades-prices` with JSON body for both tokens, `/prices-history` | none | Return bid/ask/spread/last/mid together and a `thin_book` flag (spread > threshold or one side empty). `/midpoint` on a one-sided or 0.001/0.999 book is meaningless (live 0.5). History is sparse (live: 1 point over 24 h). `side` semantics: BUY = best bid. |
| `xo_positions` | orderbook `GET /positions?address=<smart-account>` (token ids + micro-share balances + `reserved`) joined to Data API markets for titles; `GET /claimable?address=` for redeemable ones; or Data API `GET /users/portfolio?user=<addr>` for titles, entry, PnL in one call | **none** (public by address) | Loud: this is **not** an L2/secret endpoint, so v0.1 stays "no secrets". Privacy: any address is readable. Open: which address (owner EOA vs XO smart account) these endpoints key on (section 11). `/positions` cannot be paged (no `next_cursor` in response). `/users/portfolio` returns empty for private profiles. Open orders (`GET /orders`) need L2, so **open-order visibility is NOT available in v0.1**; `reserved` is the only indication of resting sells. Populated portfolio shape unverified live. |
| `xo_account` | orderbook `GET /balance-allowance?address=` (cash balance micro-USDC, available cash, `smart_account`), `GET /positions` (`cash_balance`), `GET /trading-state` | none | **Trading-enabled flag: NOT available from REST** (allowance here is not the exchange approval); needs on-chain reads on chain 3223 (RPC key is private) or an explorer fallback. **Self-created-market flag**: no creator filter on `/markets`; compute client-side by comparing the Data API `creator.walletPublicKey`/`creatorId` with the caller's address (which address kind is unverified). Native-gas balance: not an XO API field. |

Missing / not provided by XO read APIs: open orders and trade history (L2), approval state, native-token balance, events/series listing, categories list, per-market holders, public per-market trade tape (`/live-activity` is a stub), authenticated `/users/me/*`.

---

## 11. Open questions and risks

Open questions:

1. **Which address do the public account endpoints key on?** Docs say the orderbook's `address` is "Maker address. For smart accounts, this is the smart account, not the owner EOA" (auth page) and `GET /balance-allowance` returns a `smart_account` field. Whether `address=<owner EOA>` resolves to its smart account's balance, or returns zeros/`smart_account:null`, is unverified (only a dummy address and a no-account address were queried). A PayBox EVM wallet is the owner EOA, so the plugin needs a way to learn the smart-account address (gate item 3).
2. **Is `creator.walletPublicKey` the owner EOA or the smart account?** Needed for the self-created flag.
3. **Fee truth source** (`/fee-rate` = 0 vs `effectiveFeeConfig.takerFeeBps` = 400 on a Conviction market).
4. **How the public orderbook rate limit (5 rps) is enforced**; 429 shape for public reads.
5. **`interval` value space for `/prices-history`** (integer seconds vs `"1h"` strings).
6. **Meaning of `reviewStatus`, `resolutionFlagCount`, `visible`** (undocumented; `reviewStatus: UPDATE_REQUIRED` on a live ACTIVE market).
7. Whether `CLOSED` without a winner can ever occur (docs say yes; 0 of 2,390 live rows).
8. Whether a populated `/users/portfolio` matches the OpenAPI schema (units of `entryPrice`/`currentPrice`).
9. Whether the explorer / a public RPC is usable (gate 9 fallback; section 12).

Risks:

- Schema drift between docs and live is large; the plugin parser must be defensive (accept `outcomeTokenId` or `tokenId`, `index` or `position`, price in micro or decimal) and tests must run against the fixtures.
- Discovery defaults hide most CLOB markets (finding 3); a wrong `marketScope` yields an empty-looking exchange.
- Volume/notional figures are not trustworthy as liquidity or demand: the highest-volume sampled markets (5.8M USD claimed) sit on a 0.001/0.999 book. Use book depth.
- Everything user-supplied (titles, rules, creator fields, resolution source URLs) is untrusted. Search results are attacker-influenced.
- Data is world-readable by address, so a tool that accepts an arbitrary `address` can be used to profile other people. Consider restricting `xo_positions`/`xo_account` to the PayBox-pinned wallet's own addresses.
- Cloudflare in front of both hosts: explicit UA required; unknown behaviour for PayBox's runtime fetch UA (test it in the hosted conformance check).

---

## 12. Gate 9 and read-side verdicts on plan leads

**Gate 9 (read-side fallback, Blockscout): GO for v0.1, fallback itself unverified and not needed.**

- The premise "if the Data API is restricted" is false. Both the Data API and the orderbook read endpoints are public, unauthenticated, CORS-open and sufficient for all seven v0.1 tools except the on-chain approval flag. (H, live.)
- The XO docs **do not mention the block explorer at all**: NOT FOUND (searched: `rg -il 'explorer|blockscout|graphiql|etherscan|graphql|subgraph'` over the whole docs filesystem returned nothing relevant; searched the introduction's environment table which lists only orderbook REST/WS, Data API, RPC, bundler). Because no explorer URL is documented, I made **no** explorer GET.
- Secondary lead only (M): a web search surfaced ChainList (chainlist.org/chain/3223) giving the explorer as `https://explorer-mainnet.xo.market`; no source confirmed that it is Blockscout or that `/graphiql` exists. Not called.
- The mainnet RPC `https://rpc-mainnet-2.xo.market?api_key=<API_KEY>` is documented but "The XO team issues the key privately during onboarding" (H, docs intro). There is no documented public RPC. Reading approvals, native balances or `payoutDenominator` on-chain therefore needs either that key (a plugin-wide env secret) or the unverified explorer.

Verdicts on read-relevant leads from `docs/plan.md` / `docs/research-notes.md`:

| Lead | Verdict | Evidence |
|---|---|---|
| Orderbook API + Data API are documented for integrators | CONFIRMED | docs.xo.market, both OpenAPI specs |
| "Hosts/auth unknown" | RESOLVED: hosts above; reads need no auth | section 1-2 |
| Positions may need HMAC L2 | REFUTED for positions/balance/claimable (public); TRUE for orders/trades/API keys | live 200 vs 401 |
| Collateral USDC.e, 6 decimals probable | CONFIRMED | docs intro + live `collateralToken.decimals: 6` |
| Chain 3223, Blockscout explorer | chain id CONFIRMED; "Blockscout" UNVERIFIED | docs intro; section 12 |
| LS-LMSR AMM is legacy; order-book first | CONFIRMED | type 0/1 vs 2/3/4; docs "legacy AMM" |
| Creator earns 20% of lifetime fees | CORROBORATED (as split config) | `splitSummary.creatorShareBps: 2000` live |
| `rpc-mainnet-2.xo.market` candidate RPC | CONFIRMED but key-gated | docs intro |
| Creation is UI-only / no programmatic path | NOT ASSESSED here (read side only). Note: `convictionSeed.commitment` and `reviewStatus` fields exist on read, and `GET /markets` exposes per-market creator data | |
| Invite-only signup, ToS bot policy | NOT ASSESSED here | |

---

## 13. Notes for the multi-venue aggregator (brief)

- Normalisable XO fields per market: `conditionId`, `title`, `expiresAt` (ISO), `status`, binary outcome tokens (index 0/1), book bid/ask/depth (human shares, price 0-1 with 0.001 tick), `resolutionSources[]`, `rules.description`, `rootEventSlug`, fee model (`effectiveFeeConfig`).
- For cross-venue edge/arbitrage: use best bid/ask from `GET /price` per token, not midpoints or Data API `currentPrice`; require two-sided depth; remember the YES-ask/NO-bid equivalence and the 0.001 tick. Always match markets on resolution source and exact wording, never on title alone (XO titles are creator-written; `MANUAL` resolution; sports markets use team labels, not Yes/No).
- Rate limits are low (5 rps orderbook), so aggregation must rely on the batch `GET /last-trades-prices` and on the earning-pools snapshot rather than per-token polling.

---

## 14. Verification log (public GETs only)

Pattern: `curl -sS -m 20 -A 'xo-paybox-plugin-research/0.1' "<url>"` (first few calls had no `-A`; default curl UA also worked). Sleep 1 s between calls. `<DUMMY>` = `0xCAFE000000000000000000000000000000000A11` (the docs' sample address). `<DOCS_EXAMPLE_ADDR>` = the OpenAPI `/users/portfolio` example address (not written here). `<CREATOR_USERNAME>` = an auto-generated username taken from a sampled market's creator object (not written here; it returned an empty portfolio).

Data API (`A=https://api-mainnet.xo.market/api`):

- `GET $A/markets?take=3&marketType=2&statuses=ACTIVE&sortBy=totalVolume&sortOrder=DESC` (also the original with `marketScope=onlyClob`)
- `GET $A/markets/slug/jack-barton-will-be-announced-as-the-next-james-bo-2536`
- `GET $A/markets/contract/{conditionId}` for a long-form, a Conviction and a Pulse market
- `GET $A/markets?search=bond|BOND|james%20bond|next%20bond|Jack%20Barton|rules&take=5&marketType=2(,4)`
- `GET $A/markets?take=1&marketScope=onlyClob&statuses={RESOLVED,VOIDED,CLOSED,PAUSED,PENDING,CANCELLED,EXPIRED,CLOSING_24H,DISPUTED}`; same with `marketType=2`; `marketType=0|1|3|4`
- `GET $A/markets?take={20,25,30,50,51,75,100,1001}...` (limit probe); `GET $A/markets?take=50&statuses=ACTIVE&marketScope={default,withClob,onlyClob,onlyClobPulse,withPulse,onlyPulse}`
- `GET $A/markets?take=50&page={1..49}&marketType=2,4&statuses=CLOSED&sortBy=expiresAt&sortOrder=DESC` (full scan, 0.4 s sleeps)
- `GET $A/markets?take=50&page={1,2}&marketType=2,4&statuses=ACTIVE&categories={TECH,FINANCE,tech,Space}`; `...&isFeatureMarket=true`
- `GET $A/markets/99999999` (404); `GET $A/markets/39308` (200)
- `GET $A/pulse/markets?limit=2&status=ACTIVE`; `GET $A/pulse/markets/{pulse conditionId}`
- `GET $A/users/portfolio?user=<DOCS_EXAMPLE_ADDR>&take=2&marketScope=onlyClob` (404 User not found); `...user=<DUMMY>` (404); `...user=<CREATOR_USERNAME>&take=2&marketScope=onlyClob&status=active` and `...withPulse&status=all` (200, empty)
- `GET $A/public/liquidity-rewards/earning-pools`; `.../markets/{conditionId}/config`; `.../markets/{conditionId}`; `.../groups?page_size=2`

Orderbook (`B=https://orderbooks.xo.market`; `Y`/`N` = Yes/No token ids of the sampled market; `T4` = a Conviction Yes token):

- `GET $B/`, `/health`, `/version`, `/time`, `/trading-state`
- `GET $B/markets?limit=2`; `GET $B/markets/{conditionId}` (long-form, Conviction, PAUSED, RESOLVED, CLOSED, unknown)
- `GET $B/book?token_id=$Y`; `...$T4`; `...1` (404); `...abc` (400); `GET $B/book` (400 plain text)
- `GET $B/midpoint|spread|last-trade-price|tick-size|fee-rate|neg-risk?token_id=$Y`; `GET $B/price?token_id=$Y&side=BUY|SELL`; `GET $B/fee-rate?token_id=$T4`
- `GET $B/prices-history?token_id=$T4&interval=86400&fidelity=3600`
- `curl -X GET -H 'content-type: application/json' -d '[{"token_id":"<Y>"},{"token_id":"<N>"}]' $B/last-trades-prices` (a GET carrying a JSON body, as the spec documents; no POST used)
- `GET $B/last-trade-price?token_id=$N`; `GET $B/live-activity/events/{conditionId}`; `GET $B/simplified-markets`, `/sampling-markets`
- `GET $B/positions?address=<DUMMY>`, `/balance-allowance?address=<DUMMY>`, `/claimable?address=<DUMMY>`, `/balance-allowance/update?address=<DUMMY>` (all 200, no auth); `GET $B/orders?address=<DUMMY>&limit=2`, `/data/orders?...`, `/trades?...`, `/auth/api-keys` (401); also `/positions` and `/balance-allowance` for `<DOCS_EXAMPLE_ADDR>` (200, zeros)
- Rate-limit probe: 10 concurrent `GET $B/time` -> ten 200s. UA probe: `Python-urllib/3.14` -> 403 on both hosts; `node`, `undici`, `curl/8.7.1`, custom -> 200.

Not called (rule-bound): every POST (`/books`, `/midpoints`, `/prices`, `/spreads`, `/heartbeats`), every `/auth/*` mutation, order/cancel routes, WebSocket and Socket.IO connections, any PayBox tool, any explorer or RPC host.

Fixtures written to `docs/research/fixtures/xo/` (37 files, each < 50 KB; third-party creator wallet, resolver address and creator username redacted to `0xREDACTED_THIRD_PARTY_WALLET` / `REDACTED`; liquidity-rewards pools trimmed to 3 of 15 rows): `data-markets-list`, `data-market-by-slug`, `data-market-by-contract-conviction`, `data-market-by-contract-pulse`, `data-markets-search`, `data-markets-closed-resolved`, `data-pulse-markets`, `data-liquidity-rewards-earning-pools`, `data-liquidity-rewards-market-config`, `data-error-404-market`, `data-error-404-user-portfolio`, `data-error-400-take-over-max`, and `orderbook-{time,health,version,trading-state,markets,market-by-condition,book,midpoint,spread,price-buy,price-sell,last-trade-price,last-trades-prices,tick-size,fee-rate,neg-risk,prices-history,live-activity,positions-dummy-address,balance-allowance-dummy-address,claimable-dummy-address,error-404-book-unknown-token,error-400-bad-token,error-404-market-unknown,error-401-orders}`. Each is a `.json` file. A populated positions / portfolio fixture could not be captured without querying a real person's account; none was.

---

## 15. Sources

xo-docs MCP (docs.xo.market) paths read in full or by `jq`/`rg`:

- `/openapi/api-reference/openapi.yaml` (servers, schemas, all paths, security per operation); `/openapi/data-api-reference/openapi.yaml` (servers, parameters, schemas, all paths)
- `/api-reference/introduction.mdx`, `/api-reference/authentication.mdx`, `/api-reference/rate-limits.mdx`
- `/api-reference/market-data/*.mdx` (all 21), `/api-reference/markets/*.mdx` (all 5), `/api-reference/account/*.mdx` (all 4), `/api-reference/websockets/websockets/*.mdx` (3 summaries)
- `/data-api-reference/introduction.mdx`, `/data-api-reference/rate-limits.mdx`, `/data-api-reference/liquidity-rewards.mdx`, `/data-api-reference/portfolio-websocket.mdx`, `/data-api-reference/markets/*.mdx`, `/data-api-reference/pulse-markets/*`, `/data-api-reference/portfolio/*`, `/data-api-reference/liquidity-rewards-public/list-earning-pools-public.mdx`, `.../market-programme-config-public.mdx`; the 10 authenticated LR routes and remaining public ones via the OpenAPI
- `/guides/wire-conventions.mdx`, `/guides/market-lifecycle.mdx`, `/guides/trading-pause.mdx`, `/guides/fees.mdx`, `/guides/smart-accounts.mdx`, `/guides/redeem-positions.mdx`
- `/documentation/introduction.mdx` (hosts, RPC, bundler, contracts)
- `/product/trading/find-a-market.mdx`, `/product/concepts/market-catalog.mdx`, `/product/products/pulse.mdx`, `/product/rewards/liquidity-rewards.mdx`, `/product/rewards/maker-rebates.mdx`, `/product/portfolio/how-markets-resolve.mdx`, `/product/portfolio/positions-and-pnl.mdx`, `/product/accounts/wallets.mdx`, `/product/accounts/deposit.mdx`
- Live: `https://api-mainnet.xo.market/api/...` and `https://orderbooks.xo.market/...` (section 14)
- Secondary (not fetched, search snippet only): chainlist.org/chain/3223 via web search for the explorer URL

Short verbatim quotes for load-bearing facts:

- Hosts: "The XO Data API is served on a separate host from the CLOB orderbook." (`/data-api-reference/introduction`)
- Defaults: "`default` = STANDARD (0) + CLOB (2)" (OpenAPI `/markets` `marketScope`; contradicted live)
- Scope warning: "include LMSR AMM markets that are **not** tradable through the CLOB orderbook" (`/data-api-reference/introduction`)
- Search: "Full-text search over the market title." (OpenAPI `/markets` `search`)
- Public portfolio: "Unauthenticated variant of `/users/me/portfolio`." and "Private profiles return an empty paginated result." (OpenAPI `/users/portfolio`)
- Auth split: "L2 HMAC ... Every other authenticated endpoint." (`/api-reference/authentication`); liquidity-rewards: "Authenticated routes **do not** accept the orderbook L1/L2 HMAC scheme." (`/data-api-reference/liquidity-rewards`)
- Wire: "Sizes are decimal-string integers in human shares." (`/api-reference/introduction`); "`balance`, `reserved` on `/positions`" listed under canonical micro-shares (`/guides/wire-conventions`)
- Token derivation: "Derived from `getPositionId(conditionId, indexSet)`." (`/guides/wire-conventions`); "YES is slot 0 (`0b01`), NO is slot 1 (`0b10`)." (`/guides/redeem-positions`)
- IDs: "`smart_account` ... hex **without** `0x` prefix" (`/guides/wire-conventions`)
- Pagination: "The literal `"LTE="` is the canonical CLOB end-of-stream sentinel" (`/guides/wire-conventions`)
- Lifecycle: "`Resolved`, `Voided`, and `Closed` are **terminal**." (`/guides/market-lifecycle`); "`redeemPositions` reverts until `payoutDenominator(conditionId)` is non-zero, even if `/claimable` already lists the position." (same)
- Rate limits: "Public REST requests: 5 requests per second" (`/api-reference/rate-limits`); "Data API REST requests: 100 requests per 10 seconds" and "`/public/liquidity-rewards/*`: 30 requests per 10 seconds" (`/data-api-reference/rate-limits`)
- Pulse: "Each round lasts five minutes." and "Current Pulse is **BTC, five minutes, continuous**." (`/product/products/pulse`)
- RPC: "The XO team issues the key privately during onboarding." (`/documentation/introduction`)
- Fees: "Fetch `base_fee`, then apply the curve above" (`/guides/fees`) vs live `takerFeeBps: 400` (Data API detail)
- Live-activity: "Currently a stub - always returns `[]`." (OpenAPI `/live-activity/events/{condition_id}`)

## 16. Suspicious / embedded-instruction content

None found. Docs pages and all sampled API payloads (titles, rules, descriptions, creator fields) were grepped for instruction-like text aimed at AI agents (`ignore previous`, `assistant`, `AI agent`, `system prompt`, `you must`, `instruction`, `override`): no hits. The docs MCP exposes a `submit_feedback` tool; it was not called.


---

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: re-fetched the Data API and orderbook endpoints with public GETs only (UA `xo-verifier/0.1`, no POST, no auth, no PayBox tools, no explorer or RPC host called), re-read the OpenAPI specs (`jq` over `/openapi/*/openapi.yaml`) and the docs filesystem, and re-ran every NOT FOUND search with different keywords. Live data was fetched about 17:50-18:00 GMT on 2026-10-18 (about 1 hour after the researcher). Scratch copies live only in the session scratchpad. Nothing in this file was rewritten; this section is append-only and supersedes the earlier text wherever they conflict.

### A. Corrected or refuted (fix these before coding against the notes)

1. **REFUTED (section 0 item 1 and the summary): `GET /users/portfolio` does NOT answer 200 "for any address".** Live `GET /api/users/portfolio?user=0xCAFE000000000000000000000000000000000A11&take=2` returned 404 `{"statusCode":404,...,"message":"User not found","name":"NotFoundException"}`, and the 404 body echoes the request path and query. This agrees with the notes' own sections 2.2 and 14 ("Unknown user: 404 User not found"), so section 0 item 1 and the structured summary contradict the notes. Corrected: the three **orderbook** endpoints `/positions`, `/balance-allowance`, `/claimable` return 200 with zeros for any address (live, re-confirmed). Data API `/users/portfolio` only resolves addresses or usernames that map to a registered XO user; unregistered addresses 404. The docs describe the `user` param as "wallet address or username" (`/data-api-reference/portfolio-websocket`), so a plugin must treat 404 as "no XO profile", not as an error. Confidence of the corrected statement: H.
2. **CORRECTED: book level sizes are not integers.** Section 3 says book sizes are `"1000"` (decimal-string integers) and the Orderbook intro says "decimal-string integers in human shares". Live `GET /book` on an active type-4 market returned `{"price":"0.041","size":"1271.980687"}` and `{"price":"0.350","size":"20.317466"}`: fractional human shares with up to 6 decimals. The researcher's saved fixture only holds integer sizes because it was taken from a synthetic 0.001/0.999 book. A parser must use decimal arithmetic. `/wire-conventions` itself lists human shares as `"100"`, `"1"`, `"0.5"` (decimal), so the OpenAPI wording "integer" is the wrong one. H (live).
3. **REFUTED: "VOIDED has 0 rows".** The researcher only probed VOIDED with `marketScope=onlyClob` and `marketType=2`, which exclude type 4. Live `GET /markets?statuses=VOIDED&marketType=0,1,2,3,4` returns itemCount 1: a type-4 market (id 48778, "Will Bitcoin reach $100,000 by the end of 2026?", created and updated 2026-10-13) with status VOIDED, `resolvedAt` set and **no `winningOutcomeId` key at all**. Consequences: (a) the voided path is real in the Data API, (b) a voided market carries `resolvedAt` but no winner, so "resolvedAt != null" alone does not mean "has a winner" and the plugin must test `winningOutcomeId`, (c) the statement "CLOSED = settled with winner" still holds (see B3) but VOIDED must be a separate branch. H (live).
4. **CORRECTED: "ACTIVE rows past expiresAt exist (EXPIRED token, 12 rows)" applies to Pulse (type 3) only.** The probe used `marketScope=onlyClob`, which includes type 3. Live now: `statuses=EXPIRED` with `marketScope=onlyClob` returns 11 rows, all `type 3`; with `marketType=2,4`, `marketType=4`, `marketType=2` or no scope it returns 0; and `statuses=ACTIVE&marketType=2,4&sortBy=expiresAt&sortOrder=ASC` shows 0 past-expiry rows among 412 ACTIVE. Long-form and Conviction sports markets move to PAUSED at expiry (5 type-4 PAUSED rows with `expiresAt` 16:00 observed). The tradability rule in the notes (status ACTIVE AND now < expiresAt AND book `active`) is still a sound defensive rule, but the evidence is Pulse-specific. H (live).
5. **CORRECTED: Data API `outcomes[].currentPrice` is NOT "last trade".** Compared across 8 ACTIVE type-2 markets (list rows vs orderbook): where the book is tight (spread <= 0.10) the list `currentPrice` equals the book **midpoint** (e.g. list 50000 vs mid 0.05; 785000 vs mid 0.785; 115000 vs mid 0.115; 282500 vs mid 0.2825), and where the spread is wide (0.17, 0.56) it equals the **last trade** (231000 vs ltp 0.231, mid 0.195; 390000 vs ltp 0.39). So it behaves like a display price (mid unless spread is wide, then last trade), M (pattern inferred from 8 samples). Either way it is not a tradable price. The conclusion in the notes (never quote it) stands.
6. **MISSED trap (add to the drift table): the Data API detail routes return a constant `currentPrice` of `"500000"` for both outcomes.** `/markets/contract/{conditionId}` returned 500000/500000 for all 8 markets above (and for the Conviction and Pulse samples), whereas the list row for the same market gave 50000/950000, 390000/610000, etc. The researcher's own fixtures `data-market-by-contract-conviction.json` and `data-market-by-slug.json` contain `['500000','500000']` and the notes never flag it. Since the design says `xo_get_market` should use the detail route, a naive implementation would show every market at 50 cents. H (live and fixtures).
7. **CORRECTED: fee source of truth (open question 3 / finding 10) can be narrowed.** `GET /fee-rate` returns `{"base_fee":0}` on a Conviction token (Data API takerFeeBps 400, configName `convictions`), on a long-form type-2 token (Data API `FLAT_BPS` 0/0, consistent) and **also on a Pulse token where Data API says takerFeeBps 600 and the product Fees page states "Pulse markets have a 6% taker base rate"** (`/product/trading/fees`). So `/fee-rate` under-reports on at least two market classes while Data API `effectiveFeeConfig` matches the product docs for Pulse. Working conclusion (M): quote fees from Data API `effectiveFeeConfig`, treat `/fee-rate` as unreliable, and have the trading task re-check against a real fill. Also note "conviction curve" in `/guides/fees` is simply the name of the `p*(1-p)` fee formula for all markets, not a Conviction-product-only thing.
8. **CORRECTED: "undocumented market type 4 (Conviction)".** The API enum (`type` in OpenAPI `MarketListItem`, `marketType` description) lists only 0..3, so type 4 is undocumented **in the API reference**. The Conviction **product** is documented: `/product/products/convictions` ("A Conviction is a creator-backed binary market"), `/product/products/create-a-conviction` (five-step flow, creation charge $1.00, seed order at least $10, "Creator eligibility can be gated, and submissions may be reviewed before going live") and `/product/trading/fees`. Live `effectiveFeeConfig.resolutionPath` is `["market_type:4","settlement:v5"]` with `configName: "convictions"`, which ties type 4 to the product (H as live observation). The NOT FOUND entry "definitions of ... the undocumented market type 4 in the docs" should read: product semantics found, API enum mapping not documented. Docs also say a user report "creates a review signal" (`/product/products/convictions`), which is the likeliest meaning of `resolutionFlagCount` (M, inference).
9. **CORRECTED: OpenAPI per-operation `security` is not a reliable auth oracle in either direction.** Verified with `jq`: `/positions`, `/balance-allowance`, `/claimable` carry no security (and answer 200 live, so the notes' conclusion stands), but `GET /data/orders` also has no `security` in the spec while live it returns 401 `HMAC L2 credentials required`, and `POST /order`, `POST /orders`, `DELETE /order`, `DELETE /cancel-all` etc. have no `security` either. The notes cite "OpenAPI per-operation security" as a source for "L2 only for orders/trades"; the true source is the live 401s plus the authentication page. Only `/orders GET`, `/data/order/{id}`, `/trades*`, `/auth/*` and `/balance-allowance/update` declare a scheme. Data API: the 10 `/liquidity-rewards/*` routes declare `PrivyBearer`, everything else (including `/users/portfolio`) declares none (confirmed).
10. **CORRECTED: the "Data API 429 body shape" NOT FOUND is now observed.** During a 50-page scan the Data API returned HTTP 429 `{"statusCode":429,"message":"Rate limit exceeded","error":"Too Many Requests","timestamp":"2026-10-18T17:54:39.08..."}` (3 of roughly 250 requests, at 0.4-1.1 s spacing; other agents may share this egress IP, so the trigger rate is not attributable). Header `x-ratelimit-limit: 50`, `x-ratelimit-reset: 1` was present on 200s as the notes say. H (live).
11. **CORRECTED: `/prices-history` evidence.** The notes say `interval=86400&fidelity=3600` returned "one point over 24 h". The single point returned (`t=1791815897`) is about 6.1 days older than the server time (`/time` = 1792345948), so `interval` is not behaving as a 24 h window. `interval=1h` also returned 200 with the identical point (string accepted, apparently ignored). The "interval value space" question stays open and the endpoint should not be used for windowed history until tested on a liquid market. H (live).
12. **CORRECTED (scope of the pagination bug):** the "post-pagination filter" is not limited to `categories`. Live: `marketType=2&statuses=PAUSED` gives `itemCount:1, data:[]` (notes had this); `marketType=2,4&statuses=PAUSED` gives itemCount 6 with 5 rows; and CLOSED pages of `take=50` came back with 45-49 rows on 15 of the roughly 94 non-final, non-429 page fetches across two scans. Rows are being hidden after the count (likely a visibility flag), so a client must page on `meta.hasNextPage` and must never treat a short page as the last page or `itemCount` as a row count. H (live).

### B. Independently confirmed (re-derived from the primary source or live)

1. **Hosts, chain, collateral.** OpenAPI `servers` and `/documentation/introduction` confirm both hosts and chain id 3223. Live `collateralToken`: symbol USDC, name "Bridged USDC (XO)", decimals 6, `tokenAddress` equal to the docs' XO USDC address; `outcomeTokenAddress` equal to the docs' Conditional Tokens address; `marketContractAddress` is one shared address across V3 markets. `contractMarketId == conditionId` for V3 (live, type 2 and 4). H.
2. **No-auth reads.** Live 200 with zero/empty bodies for `/positions`, `/balance-allowance`, `/claimable` (address lower-cased in the claimable body), `/balance-allowance/update` (200 without auth although the spec says L2), `/trading-state`; live 401 for `GET /orders`, `/data/orders`, `/trades` (`HMAC L2 credentials required`) and `/auth/api-keys` (`L2 auth required`). H.
3. **CLOSED always has a winner.** Two full scans with different sort orders (union of 2,393 distinct CLOSED type 2/4 rows; the list endpoint reported itemCount 2,403-2,406): all 2,393 have `winningOutcomeId` and `resolvedAt`. About 10-13 listed rows were never returned (short pages, 429s), so "all" is "all 2,393 reachable rows". Note `winningOutcomeId` is the outcome **row id** (`outcomes[].id`, e.g. 97516), not the index: map it through `outcomes`. 7 RESOLVED rows (3 type 2, 4 type 4) all have winners. H (live).
4. **Discovery defaults.** `marketScope=default&statuses=ACTIVE` returns 9 rows, all type 0. `withClob` includes only types 2 and 3, `onlyClob` types 2 and 3, `onlyClobPulse` type 3, `withPulse` includes type 4. Counts per type (all statuses): 0:1,346, 1:1,876, 2:2,391, 3:44,060, 4:505 (identical to the notes). ACTIVE per type: 0:9, 2:247, 3:4, 4:167. `marketType=2,4` is the correct filter. H.
5. **Limits and filters.** `take=51` returns 400 `validations.MAXIMUM_NOT_OBSERVED`; `take=50` is 200. `categories=TECH&take=50` page 1: 0 rows with itemCount 414, page 2: 2 rows (post-pagination filter confirmed). `statuses=DISPUTED` returns an empty 200 list; `CANCELLED` also empty. H.
6. **Search.** `search=bond` and `BOND` and `james bond` match 4 "James Bond" markets; `next bond`, `Bond james`, a slug fragment and a creator username all return 0; `PONS`/`pons` match one title. Title-only, case-insensitive, contiguous substring. The product docs say the web UI searches "by title or creator", but the API `search` param does not match creators. No creator filter exists in `/markets` params (`page take search marketScope marketType statuses categories isFeatureMarket sortBy sortOrder`). H.
7. **Yes/No slot.** Cross-checked 3 more closed markets with non-Yes/No titles (`Over 2.5`/`Under 2.5`, `1WIN`/`AURORA`, `VITALITY`/`PARIVISION`): Data API outcome index 0 equals the orderbook token labelled `Yes`, index 1 equals `No`, in all three. H (live).
8. **Orderbook price semantics.** On a live type-4 book `GET /price?side=BUY` = best bid (0.1 vs bids[0]=0.100) and `side=SELL` = best ask (0.35 vs asks[0]=0.350); `/midpoint`=0.225, `/spread`=0.25; `/book.last_trade_price` is `"0.000"` while `/last-trade-price` returns `{"price":"0.15","side":"BUY"}`. `min_order_size` is `"0"`. H.
9. **Closed-market behaviour.** For a CLOSED market `GET /book` and `/price` return 404 `No orderbook exists for the requested token id`, and `GET /markets/{condition_id}` returns 200 with `active:false` and both token prices `"0.000"`. H.
10. **Orderbook `/markets` and aliases.** `count` is the grand total (47,065 now, with `limit=2`), `next_cursor` is `Mg==`; `/simplified-markets` and `/sampling-markets` responses are byte-identical (same md5) to `/markets`. `GET /last-trades-prices` with a JSON body works (200, array of `{price, side, token_id}`). H.
11. **Cloudflare UA.** `Python-urllib/3.12` gets 403 on both hosts; default curl and a custom UA get 200. 20 concurrent `GET /book` all returned 200 (no visible enforcement of the documented 5 req/s, as the notes say). H.
12. **Error shapes.** Unknown orderbook market: 404 `{"error":"0x000...01"}` (bare id); missing `token_id`: plain text `Failed to deserialize query string: missing field `token_id`` (400); `token_id=abc`: `{"error":"invalid token_id: digit 10 is out of range for base 10"}`; Data API 404 market: `ResourceNotFoundError` shape; user 404: `NotFoundException` shape (see A1). H.
13. **Pulse.** Live `/pulse/markets?status=ACTIVE`: `marketConfigName "BTC 5 min"`, `marketAddress: null`, lowercase `status`, outcomes UP/DOWN, `GET /pulse/markets/{conditionId}` accepts the conditionId (200). H.
14. **Fees (Conviction split).** Type-4 detail: `curveModel CONVICTION_CURVE`, takerFeeBps 400, makerFeeBps 0, `splitSummary` creator 2000 / maker 3500 / platform 4500; type-2 detail: `FLAT_BPS` 0/0. Product docs: maker rebate "35% of the taker fee". H.
15. **Liquidity rewards.** `/public/liquidity-rewards/earning-pools` returned 15 rows, limit header 30/10; `estimatedApr` on the USDC rail is `243333.67` on the first row. H.
16. **Fixtures.** 37 files present (12 `data-*`, 25 `orderbook-*`). Structural key-set diff of `data-markets-list`, `data-market-by-contract-conviction` and `data-markets-closed-resolved` against fresh live responses: no keys missing either way. The `data-*` and `orderbook-*` bodies are otherwise faithful, except the `orderbook-book` fixture (synthetic-looking thin book, integer sizes only; see A2) and the detail-route price fields (A6).
17. **NOT FOUND claims re-searched with different keywords and still NOT FOUND:** (i) explorer/Blockscout/GraphQL: `rg -il "explorer|blockscout|etherscan|block scan|txhash|view on chain|graphiql|subgraph|goldsky|the graph"` over the whole docs filesystem hit only `post-a-new-order.mdx` (a `transactionsHashes` field) and `troubleshooting.mdx` ("tx hash" in a support row), no URL; (ii) disputed/challenged/bonded: `rg -il "disput|challeng|contest|appeal|escalat|bond|objection"` hits only legal pages, risk-and-eligibility ("contest whitelisting"), parlays (contests) and glossary; `statuses=DISPUTED` is an empty 200; (iii) WebSocket subscribe/frame schemas: only the one-paragraph channel summaries; (iv) `getPositionId` formula: only `wire-conventions.mdx:47` plus the redeem guide's `indexSets [1,2]`; (v) events/series/categories/holders endpoints: absent from both OpenAPI path lists (`jq` over `.paths`); (vi) `/users/me/portfolio`: absent from the Data API path list; (vii) public keyless RPC: only `rpc-mainnet-2.xo.market?api_key=<API_KEY>` is documented. H for absence in the docs.

### C. Unverifiable from public read-only access (left unverified, do not treat as facts)

1. **Whether `address=<owner EOA>` resolves to the smart account on `/balance-allowance`, `/positions`, `/claimable` (gate 3 read side).** Not testable without querying a real person's account. New M-level doc hint: the `smart_account` field is described as "User's smart-account address ... `null` for plain EOA users with no smart account" (`/api-reference/account/get-balance-&-allowance`), which only makes sense if the `address` input can be an owner EOA; but `/api-reference/authentication` says the maker address is "the smart account, not the owner EOA". Still open.
2. **Populated `/users/portfolio` and `/positions` shapes and units** (micro-shares for `/positions` rest on docs alone: `wire-conventions` and `get-positions` say "canonical 6-decimal micro-share units"; no populated live row exists in the fixtures). Tag these H-docs, not H-live.
3. **Explorer is Blockscout / has `/graphiql`.** A web search again returns ChainList listing "XO Market Explorer" at `https://explorer-mainnet.xo.market` (secondary, M) and describes the network as an EVM rollup with native currency XO; nothing confirms the explorer software. The explorer host is not an XO-documented API host, so it was not called.
4. **Whether `rpc-mainnet-2.xo.market` works without a key.** `/guides/smart-accounts` hard-codes `rpcUrl: "https://rpc-mainnet-2.xo.market"` without `api_key` in its example config, while `/documentation/introduction` says the key is required. Settling it needs a JSON-RPC POST, which is out of bounds here.
5. **Whether RESOLVED is a provisional window.** The lifecycle guide literally says "`Resolved` ... Winning outcome recorded; positions are claimable" and `/claimable` is documented to list them, but also says on-chain payout is reported when the market is closed. The notes' design rule "treat RESOLVED as not claimable until CLOSED" is an M-level inference from that tension (the notes tag it M in section 6 but present it as a rule in the summary). Live: 7 RESOLVED rows were all resolved within the last ~1.5 h, consistent with a short window but not proof.
6. **`reviewStatus` / `resolutionFlagCount` meanings, UPDATE_REQUIRED safety, whether type-4 markets are fully tradable by external accounts.** Not defined in the docs (only the "review signal" sentence above). Live fact only: the top-volume type-2 market has `resolutionFlagCount 3`, `reviewStatus APPROVE`, `resolutionType MANUAL`, resolver = creator wallet; the sampled type-4 market has `UPDATE_REQUIRED` and is ACTIVE with a live book.
7. **Public-read 429 behaviour on the orderbook host** (20 concurrent GETs all passed).

### D. Gate verdict check

- Gate 9: the researcher's `answered-go` stands. The premise ("Data API restricted") is false (public, no key, CORS open), so no explorer fallback is needed for v0.1. It is conditional on (a) a User-Agent that Cloudflare accepts, (b) the plugin runtime reaching both hosts, (c) 404 on `/users/portfolio` being handled (A1) and (d) on-chain-only facts (approval flag, native gas, `payoutDenominator`) remaining unavailable without the key-gated RPC. No status change.
- Gates 1, 3, 4: no change (partial). The gate 3 doc hint in C1 is M only.

### E. Security and hygiene check of this notes file and fixtures

- Wallet addresses in the notes: only the docs' own sample address `0xCAFE000000000000000000000000000000000A11` (dummy). Fixtures: only contract addresses published in the docs or the market metadata (Conditional Tokens, XOClobMarketManager, XO USDC) plus the same dummy; creator wallet, resolver and username are redacted (`0xREDACTED_THIRD_PARTY_WALLET`, `REDACTED`). No API keys, bearer tokens, passphrases or JWTs found (`rg` over the notes for `api_key=<value>`, `Bearer`, `eyJ`, `secret`, `passphrase`, `private key` only matched descriptive prose). No user balances. Result: clean.
- Embedded instructions: none found in the docs pages, API payloads or search results read during verification.

### F. Additional facts found while verifying (not in the original notes)

- `winningOutcomeId` is an outcome row id, not an index (B3).
- Data API list rows can be 1-5 rows short of `take` without being the last page (A12), and `itemCount` can include hidden rows.
- `collateralToken.networkId` is `1` in Data API rows (an internal id, not the chain id 3223); do not use it for chain checks.
- `GET /book` returns `last_update_id` (int) and a `hash`; the Data API detail route exposes `effectiveFeeConfig.resolutionPath` (for example `["market_type:3","settlement:v7"]`), which names the market type and settlement contract version and may be a cheaper type test than `type`.
