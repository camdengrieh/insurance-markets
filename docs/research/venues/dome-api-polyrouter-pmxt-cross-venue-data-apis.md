# Dome API / PolyRouter / PMXT (cross-venue data APIs) - spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:40-03:50 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts. No account, API key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed. The sample API key printed in PolyRouter's docs was NOT used.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/dome-api-polyrouter-pmxt-cross-venue-data-apis/` (section 12).

Related earlier note: `docs/research/10-aggregation-landscape.md` (sections 1.1, 1.4, 1.6). This note re-verifies those claims and adds the hosted-trading, escrow, health and reachability evidence.

---

## 0. Bottom line

1. **These are three different things, and only one is alive.**
   - **Dome API: DEAD.** Acquired by Polymarket (announced 2026-02-19). Docs banner: "all Dome APIs will reach end of life on April 28th, 2026". `api.domeapi.io/v1/*` returns HTTP 503 today (H, section 2). **skip.**
   - **PolyRouter: DOWN, effectively abandoned.** Every endpoint of `api-v2.polyrouter.io` (including `/health`) returns HTTP 502 "Application failed to respond" (Railway edge), probed about 10 times (`/`, `/health`, `/platforms`, `/markets`) over roughly 6 minutes. A third-party project independently recorded "PolyRouter.io no longer works (user, 2026-10-09)". Last changelog entry 2026-01-06; its MCP repo was last pushed 2026-01-11. **skip.**
   - **PMXT: LIVE, the only usable one.** Open-source (MIT) "ccxt for prediction markets" plus a hosted API (`api.pmxt.dev`) with a cross-venue **Router** (catalog search, embedding+LLM market matching with relation types, side-by-side price comparison) and a hosted trading path. It speaks 15 venues (16 wire keys, incl. a Kalshi demo env), 7 of them ingested into the hosted catalog. `api.pmxt.dev/health` returns 200 and `/v0/*` returns 401 without a key (H).
2. **None of the three is an independent arbitrage leg.** They are access layers over the same Polymarket/Kalshi/Limitless/Opinion/Myriad books. They have no liquidity of their own. For the arbitrage engine they are at best a **candidate generator for cross-venue market linking** (PMXT Router) and a cheap way to read many venues through one schema.
3. **PMXT warning signs found today (all H, probed 2026-10-19):**
   - `https://trade.pmxt.dev` (the hosted *trading* host) never completes a TCP connect (timed out 3 times, 10-25 s; DNS `65.109.107.152`). Cause unknown (down, firewalled or IP-filtered). Reads host `api.pmxt.dev` is fine.
   - `api.pmxt.dev/health` reports `priceWatcher.connected=false, staleSince=2026-10-18T07:31:15Z, reconnectAttempts=422->423` while `status:"ok"`. So the live-price feed behind the catalog has been disconnected about 20 hours; treat Router prices as possibly stale.
   - Hosted escrow contracts are **unaudited** (docs: "Unaudited as of 2026-06-09"), operator is an immutable EOA.
   - Last release `v2.54.0` is 2026-07-17/18 (3 months old); `main` last commit 2026-07-18.
   - ToS (last updated 2026-02-12) prohibits automated access, "revenue-generating endeavor" and building a "competitive product" from the data (section 7). That collides with an aggregation product.
4. **adapter_priority = P2** (signal / candidate-generation only). Do not depend on PMXT at runtime; use it as an optional external HTTP candidate source for market matching, or as a design reference (relation taxonomy). Dome and PolyRouter: skip.

---

## 1. Is it still live? (2026)

| Product | Evidence | Verdict | Tag |
|---|---|---|---|
| Dome (`domeapi.io`) | Home page: "Big news! We're joining Polymarket". Docs index: "Dome has been acquired by Polymarket ... all Dome APIs will reach end of life on April 28th, 2026. ... we recommend using the new APIs from Polymarket" (https://docs.domeapi.io/index.md). Announcement 2026-02-19 says dedicated support until 2026-03-31 and "do our best to keep the lights on" after (https://domeapi.io/blog/dome-joins-polymarket, read via page summary, M). `GET https://api.domeapi.io/v1/polymarket/markets`, `/v1/kalshi/markets`, `/health` -> **HTTP 503** (Cloudflare edge) on 2026-10-19. | **Dead** | H (banner, 503), M (blog) |
| PolyRouter (`polyrouter.io`) | Marketing site and docs still serve (site 200, "Open Beta ... free and open to everyone"; footer "Part of Context Markets"). API: `GET https://api-v2.polyrouter.io/{health,platforms,markets,/}` -> **502** with header `server: railway-hikari`, body `{"status":"error","code":502,"message":"Application failed to respond"}` on every one of about 10 probes over 6 min. Changelog newest entry v2.0.0 2026-01-06. Third-party issue (Ithaca-Labs/Paras #52, 2026-10-08): "PolyRouter.io no longer works (user, 2026-10-09)" and plan to remove the adapter. No vendor status notice found. | **Down, treat as dead** | H (502s), M (third party) |
| PMXT (`pmxt.dev`, repo `pmxt-dev/pmxt`) | Repo (moved from `qoery-com/pmxt`, which now 404s): created 2026-01-08, 2,170 stars, MIT, not archived, `main` last commit 2026-07-18, releases through `v2.54.0f` 2026-07-18, other branches pushed to 2026-09-30. npm `pmxtjs` 6,935 downloads in the 30 days to 2026-10-16; PyPI `pmxt` 2.54.0. `api.pmxt.dev/health` 200; `/v0/markets` 401 `{"error":"missing api key"}`. | **Live (reads)**; hosted trading host unreachable from here | H |

Docs link rot: PMXT `llms.txt` links to `/docs/api-reference/buildOrderHosted` etc. that return "Page Not Found" (the pages moved under `/docs/api-reference/trading/...`). Cosmetic, but a sign docs lag the code (H).

---

## 2. Kind and market model

- **Kind:** aggregator / data API (reads) plus, for PMXT only, a hosted order-routing layer. No own order book, no own markets, no own tokens.
- **Unified schema (PMXT, H, https://pmxt.dev/docs/concepts/unified-schema):** `Event -> Market -> Outcome`. Outcome `price` in [0,1]. Fields: `marketId, eventId, title, slug, description, url, category, tags, volume, volume24h, liquidity, resolutionDate, tickSize, status, contractAddress, outcomes[]`; outcome `outcomeId, label, price, priceChange24h, metadata`. Hosted catalog rows carry PMXT-minted **catalog UUIDs**; venue clients carry venue-native ids. Docs: "Do not assume every marketId / outcomeId is a UUID". Reverse-resolution needs `venue + venue_outcome_id` (H, https://pmxt.dev/docs/concepts/hosted-trading).
- **Binary / categorical / scalar:** PMXT schema is outcome-list based (binary = Yes/No, categorical = N outcomes); no scalar type documented (NOT FOUND, searched unified-schema + llms-full). PolyRouter OpenAPI: `market_type` enum `binary | categorical | scalar` (H, `docs.polyrouter.io/openapi.json`).
- **Order book vs AMM vs parimutuel:** inherited from each venue. PMXT covers CLOBs (Polymarket, Kalshi, Limitless, Opinion, Smarkets, Probable, Hyperliquid), AMM-ish venues (Myriad has both), and others (Baozi, Rain, Hunch, SuiBets, Gemini Titan, Metaculus is forecasting only). In `core/COMPLIANCE.md` (15 venue columns) `fetchOrderBook` is "Y" for 14, `fetchTrades` for 10 and `fetchOHLCV` for 10 (H, counted from the table rows I read).
- **Outcome tokenisation:** none of its own. Polymarket outcome = CTF ERC-1155 `clobTokenId`; Kalshi = ticker; Opinion = BSC outcome token; Limitless = Base token. PMXT's catalog UUID is only an index key.
- **Cross-venue matching (the useful part, H, https://pmxt.dev/docs/router/matching):** "Matching uses embedding-based similarity and LLM-verified relation classification". Relations: `identity, subset, superset, overlap, disjoint` (docs list five; the earlier repo note found a sixth, `complement`, in code, M). Each cluster has `clusterId, canonicalTitle, category, relations[], confidence (0..1), volume24h, markets[]` and optional `rawMatches[]` (pairwise edges with `relation` and `confidence`). Query params include `relation(s), minConfidence, venues, excludeVenues, minVenues, withOrderbook, includeRawMatches, updatedSince, sort(volume|confidence), limit(50), offset`. `compareMarketPrices` returns best bid/ask per identity-matched venue. Precision/recall of the matcher: NOT FOUND (no published evaluation). The docs example is saved as a fixture (docs example, not a live response).

---

## 3. Chains and collateral

- **Data layer:** none. Reads are off-chain HTTPS/WebSocket.
- **PMXT hosted trading (H, https://pmxt.dev/docs/concepts/hosted-trading):** all USDC is held in a Polygon (chainId 137) `PreFundedEscrow` (a.k.a. HomeEscrow) `0x3ad326f78b1390b9a5dc5f00e7f62f8632de23e2`; collateral token named in docs as USDC.e `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`. Opinion outcome tokens sit in a BSC (56) `VenueEscrow` `0x6a273643d84edbb603b808d8a724fb963c7a298a`; Limitless tokens in a Base escrow (address not shown on the page I read). Operator (immutable EOA, controlled by PMXT) `0x84194eae9c63C1e3A769976bb762506d3443156d`; settlement oracle `0x8aD93c0D15bC655b460dD700B1E25C86D1a728EE`. These are public contract addresses from the docs, not user data.
- **Possible staleness (M):** the repo's own venue note (`docs/research/08-venues-polymarket-kalshi.md`) records that Polymarket CLOB V2 went live 2026-04-28 with **pUSD** collateral. The PMXT docs I read still describe USDC.e escrow and I found no "pUSD" or "CLOB V2" in the PMXT docs or changelog (NOT FOUND, searched `llms-full.txt`, `changelog.md`), although the core repo has a `polymarket-v2-spec` test and pUSD references in `core/src/exchanges/polymarket/index.ts` (code search, M). Whether *hosted* Polymarket writes work after V2 is unverified.
- **Self-hosted writes** use venue-native collateral: Kalshi (USD, RSA key), Hunch (Base, x402), etc.

---

## 4. Read API

### 4.1 PMXT (the only live one)

- Docs: https://pmxt.dev/docs (index https://pmxt.dev/docs/llms.txt, full text https://pmxt.dev/docs/llms-full.txt, ~220 KB). OSS: https://github.com/pmxt-dev/pmxt.
- Hosts (H, https://pmxt.dev/docs/authentication): `https://api.pmxt.dev` (reads, Router, MCP, venue pass-through) and `https://trade.pmxt.dev` (hosted writes and hosted account state). Same key on both.
- Auth: `Authorization: Bearer pmxt_live_...` (canonical) or `X-Api-Key`. Key from `pmxt.dev/dashboard` ("works immediately"). Not obtained (no signup).
- Key endpoints (H, docs):
  - Router, GET, catalog-backed (~10 ms p95 claimed, "never falls through to a live venue call"): `/v0/markets`, `/v0/events` (params `query, limit<=500, offset, closed, category, exchange`), `/v0/matched-market-clusters` (curl example in docs), `/v0/matched-event-clusters` (path inferred from operationId `getV0Matched-event-clusters`, M); SDK helpers `compareMarketPrices`, `fetchRelatedMarkets`.
  - Venue pass-through, POST: `/api/{venue}/{method}` (e.g. `/api/polymarket/fetchMarkets`, `fetchOrderBook`, `fetchOrderBooks`, `fetchTrades`, `fetchOHLCV`, `getExecutionPrice`).
  - `POST /v0/sql` read-only ClickHouse query (docs page exists; schema NOT READ).
  - WebSocket: `wss://api.pmxt.dev/ws?apiKey=...`, JSON frames `{id, action:"subscribe", exchange, method:"watchOrderBook", args:[outcomeId, depth]}`, events `{event:"data", source, data:{bids:[{price,size}], asks:[...], timestamp}}`. Methods `watchOrderBook(s)`, `watchAllOrderBooks`, `watchTrades`.
  - Feeds (Binance/Chainlink tickers, oracle rounds) listed in llms.txt: `feedFetchTicker`, `feedFetchOracleRound` (oracle history is useful for crypto-price market resolution checks).
- Limits (H, https://pmxt.dev/docs/rate-limits and /pricing): Free $0, 25,000 credits/month, **60 req/min**, 5 WS streams; Starter $29.99, 250,000, 300/min, 20 WS; Pro $99.99, 1,000,000, 1,000/min, 100 WS; Enterprise custom. 1 REST call = 1 credit, 1 WS message = 0.1 credit; health checks free. Limits are per key across both hosts. 429 body `{"error":"rate_limit_exceeded","plan","limit","used","window"}`. "All plans are for personal use only."
- What I confirmed with real calls (unauthenticated): `GET /health` 200 JSON; `GET /v0/markets?limit=1` and `/v0/matched-market-clusters`, `/api/polymarket/fetchMarkets` -> 401 `{"error":"missing api key"}`. **No keyed response shape was observed**; the Router shapes in the fixtures are docs examples, labelled as such.
- Freshness: catalog ingestion is "polling" for all 7 catalog venues (Polymarket, Kalshi, Opinion, Limitless, Smarkets, Probable, Myriad) (H, concepts/venues). Live price watcher disconnected since 2026-10-18T07:31Z (section 0). For arbitrage, always re-read the executable book from the venue or via `fetchOrderBook`.
- Self-host alternative (MIT): `pip install pmxt-core` / `npm install pmxt-core`; SDK spawns a local Node sidecar; no key, no rate cap beyond venues'. Heavy (Node sidecar) for a single-file PayBox plugin, per the earlier repo note.

### 4.2 PolyRouter (down)

- Docs https://docs.polyrouter.io (index `/llms.txt`, OpenAPI `/openapi.json` v2.0.0, 124 KB). Base `https://api-v2.polyrouter.io`. Auth `X-API-Key` header. Limit stated in docs: "All users have 100 requests per minute" (a stale per-tier table in the older `/openapi/markets.json` lists Free 100/min 10k/month, Starter 500, Pro 2,000, and a Supabase "Bearer token" requirement; superseded by v2, H).
- Endpoints (H, OpenAPI): `/health, /, /markets, /markets/{id}, /markets/{id}/orderbook (polymarket|kalshi|limitless|manifold), /events, /series, /platforms, /search, /trades, /historical-orderbook, /list-games, /games/{id}, /list-awards, /list-futures, /league-info, /profile/info, /profile/trades, /price-history`. Cursor pagination, `limit` max 25 in docs (changelog says 250 for `/markets` since v0.4.0). No WebSocket documented.
- Venues claimed: Polymarket, Kalshi, Manifold, Limitless, ProphetX, Novig, SX.bet (7). Sports odds with standardised game ids `{Away}v{Home}{YYYYMMDD}@{LEAGUE}` (NFL/NBA/NHL/MLB). Market object carries `fee_rate, trading_fee, resolution_criteria, resolution_source, open_interest, liquidity` (schema fixture).
- Current state: **502 on all endpoints**, so no response shape could be confirmed. Schemas saved from the OpenAPI as a doc-derived fixture.

### 4.3 Dome (dead)

- Base URL was `https://api.domeapi.io/v1` (H, docs OpenAPI `servers`); endpoints were Polymarket markets/events/trades/orderbook history/candles/positions/wallet PnL, Kalshi markets/trades/orderbook history, **matching markets (sports)**, Binance/Chainlink prices, WebSockets and an "Order Router" for Polymarket (H, docs `llms.txt`, saved as fixture). Now 503. Not usable.

---

## 5. Trade path (programmatic)

- **Dome / PolyRouter: none usable.** Dome's Order Router (Polymarket server-side execution) is dead with the API. PolyRouter: "Trading support: not mentioned" on its site and docs (H); its MCP README says "Optionally trade on Kalshi and Polymarket" using the caller's own Kalshi RSA key / Polymarket private key in `.env` (H), i.e. no PolyRouter-side execution.
- **PMXT hosted (H, https://pmxt.dev/docs/concepts/hosted-trading, /guides/signing, /guides/escrow-lifecycle):** hosted writes for **Polymarket, Opinion, Limitless only**. Flow: `POST trade.pmxt.dev/v0/trade/build-order` (target = catalog `outcome_id` or `venue` + `venue_outcome_id`; side/amount/price) -> server returns **unsigned EIP-712 typed data** plus `built_order_id` -> client signs locally -> `POST /v0/trade/submit-order {built_order_id, signature}` -> PMXT's operator submits to the venue (and pays gas) -> order id, fill status, avg price, tx hash. Cancel: `POST /v0/orders/cancel/build` then `POST /v0/orders/cancel` (signature). Account state: `/v0/user/{address}/...`, `/v0/orders/open?address=...`. Raw JSON bodies of build/submit are **not shown** on the docs pages (SDK calls only): NOT FOUND (searched `llms-full.txt` build/submit sections).
  - Signing: EIP-712 on the Polygon `PreFundedEscrow` domain. Polymarket buy/sell = `OrderParams`; Opinion BUY = `CrossChainOrderParams`; Opinion SELL = **two** payloads (`CrossChainSellPayParams` chain 137 + `CrossChainSellPullParams` chain 56); Limitless = ERC-7683 order on the Polygon domain. The SDK accepts a custom signer with one method `signTypedData(typedData) -> hex`.
  - Funding: `client.escrow.approve_tx / deposit_tx / withdraw_tx` return **unsigned EVM txs** (`{to,data,value,chainId:137,gas,...}`); the wallet signs and broadcasts them. Withdrawal is a two-step timelock (request, claim after about 1 hour).
  - The SDK validates the server's typed data against the requested economics before signing (changelog: `_validate_polymarket_buy_economics`, `_validate_worst_price`). A custom integration must replicate that, because the server chooses salt, expiry, token ids and `max_cost_usdc`.
- **PMXT self-hosted:** venue-native writes (Polymarket CLOB, Kalshi RSA, Limitless EIP-712, etc.) from a local sidecar; "never proxied through PMXT".
- **Router order routing:** "Order routing is coming. Today the Router is read-only." (H, router/overview).

### Reachable through PayBox? -> **partial**

- **Reads:** a plugin can call `api.pmxt.dev` if the host is on the plugin's network allowlist and the bearer key is held as a PayBox secret (M; PayBox has no x402 path here because PMXT uses API keys, not x402). Feasible but adds a paid-tier/ToS dependency (section 7).
- **Writes via hosted PMXT (M, design):** it fits the repo's established "prepare -> `request_wallet_sign` -> submit" pattern (`docs/research/06-paybox-platform.md` gate 8): plugin/agent calls `build-order`, agent calls `request_wallet_sign` with intent `typedData` (EIP-712, chainId 137), plugin calls `submit-order`. Funding: `approve_tx` and `deposit_tx` are ordinary Polygon EVM transactions (one transaction per PayBox proposal, so two proposals), and Polygon is in PayBox's `discover_tokens` chain catalog (per repo note 06, 2026-10-19; I did not call PayBox, so M here). Blockers: (a) `trade.pmxt.dev` did not accept TCP connections from here; (b) escrow is unaudited with an operator-trust gap on the cross-chain legs; (c) `request_wallet_sign` cannot evaluate spend policy (repo note 06) and the server picks the payload, so a prompt-injected market title could steer signing; (d) raw wire format undocumented. And all it buys is Polymarket/Opinion/Limitless, which direct adapters already cover with fewer trust assumptions. **Do not route PayBox keys through the PMXT SDK `private_key` parameter.**
- Other PMXT venues are read-only in hosted mode; their writes need self-hosted raw credentials (not PayBox-compatible).

---

## 6. Fees

- **PMXT subscription (H):** Free / $29.99 / $99.99 per month (section 4.1).
- **PMXT trading/commission fee:** NOT FOUND (searched `llms-full.txt` and the ToS for fee, commission, builder fee, markup). The docs only say trade `price` is "net of venue fees" and the operator pays submission gas. Whether PMXT adds a spread or a builder-code fee on hosted fills is undocumented.
- **Venue fees pass through** (Polymarket/Opinion/Limitless/Kalshi); see each venue's note. User-paid costs: Polygon gas for escrow approve/deposit/withdraw (EOA wallet pays POL), the ~1 h withdrawal timelock (capital lock-up), cross-chain legs' hidden costs (unknown).
- **PolyRouter:** free in beta (H), no paid schedule (NOT FOUND). **Dome:** was free/paid tiers; subscriptions cancelled 2026-02-19 (M, blog).

---

## 7. Geo, ToS, automation

PMXT Terms of Service, "Last updated: February 12, 2026" (H, https://pmxt.dev/terms; quoted sparingly):
- Representations: "You will not access the Services through automated or non-human means, whether through a bot, script or otherwise" (self-contradictory for an API product, so ambiguous).
- API license: "Access and ingest the API Data via our authorized endpoints solely for your internal business purposes or personal trading analysis."
- Prohibited: using the Services "for any revenue-generating endeavor or commercial enterprise" and "to access, store, or copy data for the purpose of building a competitive product or service, or to benchmark the Services against a competing product"; also "Use a buying agent or purchasing agent to make purchases on the Services". Pricing page: "All plans are for personal use only."
- Jurisdictions: none named; Section 1 only says the Services are not for use where unlawful. Governing law: United States / California courts. No escrow-specific terms (trading disclaimers live in the Security docs: "not responsible for ... smart-contract bugs in the unaudited PreFundedEscrow").
- Consequence for us: a product that stores and re-serves matched-market data is arguably a "competitive product"; get written permission, or use the MIT self-hosted code path and call the venues directly. Hosted trading by an agent may also hit the "buying agent" clause.
- Venue-level geo rules (Polymarket geoblock, Kalshi US-only, etc.) still apply to the venue; whether PMXT's server-side submission changes the geoblock outcome is NOT FOUND and untested.
- PolyRouter terms/privacy pages: `/terms`, `/tos`, `/privacy`, `/support` return 404 (NOT FOUND). Dome: moot.

---

## 8. Resolution mechanism and dispute risk

- The aggregators do not resolve anything; resolution is the underlying venue's (UMA on Polymarket, Kalshi's own rulebook, etc.).
- **Matching risk is the real dispute risk.** `identity` from an LLM-verified matcher is not proof of identical resolution: source, timestamp, tie-break and void rules can differ (e.g. "BTC > $100k at Dec 31 24:00 UTC on Binance" vs "Coinbase close"). Treat `identity` as a candidate, then verify `resolution_criteria` per leg and keep a curated registry (consistent with `docs/research/10-aggregation-landscape.md`).
- **PMXT escrow/settlement risk (H, hosted-trading page):** non-upgradeable, non-pausable, no owner, unilateral withdrawal always possible; but unaudited; cross-chain Limitless v1 "carries a delivery-performance trust point on the operator"; Opinion SELL has an "operator-trusted gap" (pay failed, pull succeeded); Opinion BUY trusts an honest settlement oracle.

---

## 9. Liquidity (with dates and sources)

- None of the three holds liquidity; PMXT's `volume`/`liquidity` fields are copied from venues.
- Adoption proxies (H, 2026-10-19): PMXT 2,170 GitHub stars; npm `pmxtjs` 6,935 downloads for 2026-09-17..2026-10-16; hosted price-watcher `lookupSize` 7,850 tracked outcomes (M, from `/health`). PolyRouter: no usage data; docs say "Join thousands of developers" (marketing, L). Dome: $500k YC + $4.7M seed, acquired (M, The Block summary).
- Market-volume numbers must come from the underlying venues' notes, not from here.

---

## 10. Event coverage and arbitrage relevance

- **Overlap exists only because the underlying venues overlap.** PMXT's catalog covers Polymarket, Kalshi, Opinion, Limitless, Smarkets, Probable, Myriad; clusters sorted by volume are dominated by crypto price, politics, macro (Fed), sports and awards (docs example titles: BTC > $100k, Fed cuts, Satoshi moves BTC, Democrats win, NBA futures).
- PolyRouter's differentiator was **sports books** (ProphetX, Novig, SX.bet) vs Polymarket/Kalshi for NFL/NBA/NHL/MLB moneylines, spreads, totals, awards, futures. Dead, so use venue-native Novig/SX.bet notes instead.
- Dome's differentiator was the sports matching endpoint (Polymarket slug <-> Kalshi event ticker). Dead.
- Smarkets (exchange, UK) and Metaculus (forecasting) appear only in PMXT; Metaculus has no money trading and is a pure signal.

**Shares liquidity with:** every underlying venue (100%). PMXT hosted fills land on the Polymarket CLOB, Opinion CLOB and Limitless CLOB. **Not an independent arbitrage leg.**

---

## 11. Integration recommendation (adapter_priority = P2)

1. **Do not build adapters for Dome (dead) or PolyRouter (down).** If PolyRouter recovers, re-check; even then its value is sports odds for books we can read directly.
2. **PMXT Router as optional signal source:** a thin HTTP client for `GET /v0/matched-market-clusters?relation=identity&minVenues=2&minConfidence=0.8` and `/v0/markets`, free tier (60/min, 25k credits/month) as a *candidate generator* for the market-linking registry; always verify resolution text and re-read executable books from the venues. Cache results; budget at most about 20k calls/month. Requires a human to create the key (not done here) and a ToS decision (section 7).
3. **Do not use PMXT hosted trading** from PayBox (unreachable host, unaudited escrow, redundant with direct venue adapters). Do not depend on the SDK at runtime (Node sidecar).
4. **Use as design reference:** the relation taxonomy (`identity/subset/superset/overlap/disjoint`), cluster response shape, `withOrderbook` filter and execution-price helpers.
5. Re-check `api.pmxt.dev/health` `priceWatcher` and `trade.pmxt.dev` reachability before relying on any hosted feature.

---

## 12. Fixtures saved (`docs/research/fixtures/dome-api-polyrouter-pmxt-cross-venue-data-apis/`)

| File | What it is | Live? |
|---|---|---|
| `pmxt_api_health_unauth_2026-10-19.txt` | `GET api.pmxt.dev/health` headers + body (shows `priceWatcher.connected:false`) | live |
| `pmxt_api_v0_markets_no_key_401_2026-10-19.txt` | `GET api.pmxt.dev/v0/markets?limit=1` without key -> 401 | live |
| `pmxt_trade_host_connect_timeout_2026-10-19.txt` | DNS + curl timeouts for `trade.pmxt.dev` | live |
| `pmxt_docs_llms_txt_2026-10-19.txt` | PMXT docs index (endpoint inventory) | doc |
| `pmxt_router_matched_cluster_docs_example.json` | cluster shape from router/matching docs | **docs example, not live** |
| `pmxt_router_markets_docs_example.json` | `/v0/markets` shape from router/search docs | **docs example, not live** |
| `polyrouter_api_v2_health_502_2026-10-19.txt` | `GET api-v2.polyrouter.io/health` -> 502 | live |
| `polyrouter_openapi_v2_schemas_trimmed.json` | Market, Orderbook, Trade, Pagination schemas from OpenAPI v2.0.0 | doc-derived (no live data) |
| `dome_api_v1_markets_503_2026-10-19.txt` | `GET api.domeapi.io/v1/polymarket/markets` -> 503 | live |
| `dome_docs_llms_txt_2026-10-19.txt` | Dome docs index incl. matching, websockets, Order Router | doc |

No keyed API response could be captured (no key was created). Privacy scan of fixtures: no email, name, path, or credential strings (the only `@` hits are `@polymarket/clob-client`, `{@link}` in PMXT docs text).

---

## Sources

- Dome: https://domeapi.io (home), https://docs.domeapi.io/index.md and https://docs.domeapi.io/llms.txt (H, 2026-10-19); https://domeapi.io/blog/dome-joins-polymarket (M, summary); https://www.theblock.co/post/390546/polymarket-buys-fresh-prediction-market-api-startup-dome-marking-second-official-acquisition (M); search summaries of crypto.news, pulse2, cryptonomist (L); GitHub `kurushdubash/dome-api-docs` commit 2026-05-07 "Add acquisition notice and EOL date to index" and `kurushdubash/dome-sdk-ts` last push 2026-02-03 (H, `gh api`).
- PolyRouter: https://www.polyrouter.io (H), https://docs.polyrouter.io/index.md, `/llms.txt`, `/api-reference/introduction.md`, `/api-reference/changelog.md`, `/api-reference/pagination.md`, `/openapi.json`, `/openapi/markets.json` (H); `fieldviolence/polyrouter-mcp` README + repo metadata (H, `gh api`); https://github.com/Ithaca-Labs/Paras/issues/52 (M, third-party outage report); web search summaries (L).
- PMXT: https://github.com/pmxt-dev/pmxt (`readme.md`, `changelog.md`, `ROADMAP.md`, `core/COMPLIANCE.md`, `core/src/exchanges/polymarket/*`, repo metadata, releases) (H, `gh api`); https://pmxt.dev/docs/llms.txt, `/llms-full.txt`, `/authentication`, `/rate-limits`, `/concepts/venues`, `/concepts/hosted-trading`, `/concepts/unified-schema`, `/guides/escrow-lifecycle`, `/guides/signing`, `/security`, `/trading-quickstart`, `/router/{overview,matching,prices,search}`, `/api-reference/websocket` (all `.md` renderings, H); https://pmxt.dev/pricing (H via page summary); https://pmxt.dev/terms (H, text extracted); https://pmxt.dev/dome-api-alternative (M, summary); npm API `pmxtjs` downloads, PyPI `pmxt` metadata (H).
- Repo context: `docs/research/10-aggregation-landscape.md`, `docs/research/06-paybox-platform.md`, `docs/research/08-venues-polymarket-kalshi.md`.
- Live unauthenticated probes 2026-10-19: `api.pmxt.dev`, `trade.pmxt.dev`, `api-v2.polyrouter.io`, `api.domeapi.io`.

## NOT FOUND (searched)

- PMXT keyed response shapes (no key created); raw JSON bodies of `/v0/trade/build-order` and `submit-order` (searched `llms-full.txt`, trading-quickstart, signing, hosted-trading).
- PMXT hosted trading/commission/builder fee (searched `llms-full.txt`, ToS, pricing).
- PMXT matcher accuracy or evaluation (searched router docs, readme, repo docs).
- Whether PMXT hosted Polymarket writes support pUSD / CLOB V2 (searched docs, changelog; core has V2 test, M).
- PMXT geo/jurisdiction restrictions on hosted trading (searched ToS, security, hosted-trading).
- Cause of `trade.pmxt.dev` connect timeouts; PMXT status page (none found).
- PolyRouter terms of service, status page, vendor outage notice, trading API, WebSocket; relationship to `context.markets` beyond the footer text "Part of Context Markets" (the context.markets page returned only a title to my fetch).
- Dome: any post-2026-05 status update; whether the 2026-04-28 EOL was formally executed (only the 503 is observed).
- Scalar market support in PMXT's unified schema.

## Open questions

1. Is `trade.pmxt.dev` down or IP-filtered? A retry from a different network and a keyed call (human-created key) would tell.
2. Does PMXT's free-tier ToS allow a derived market-linking registry? Ask the vendor for written permission or self-host.
3. Is the stale `priceWatcher` (since 2026-10-18T07:31Z) affecting Router prices, or only live streaming?
4. Will PMXT's Polymarket adapter survive Polymarket's retirement of Data API v1 on 2026-10-24 (the adapter's generated spec is dated 2026-06-11 and targets `data-api.polymarket.com` v1.0.0; M, from repo note 08 and `api-data.ts`)?
5. Was Dome formally shut down or merely unsupported (blog said "keep the lights on"; docs say EOL 2026-04-28; endpoint is 503)?

## Suspicious content (recorded, not followed)

- PolyRouter docs and its legacy OpenAPI spec (`/openapi/markets.json`) embed a live-looking API key string and a Supabase project URL plus an anon-role JWT in example `curl` commands. Not copied, not used. (Also a hygiene red flag for the vendor.)
- PMXT ToS page includes a personal contact email address of the operator; not copied. The PMXT changelog contains the developer's local filesystem paths and a partial test-wallet address; not copied.
- Mintlify docs (Dome, PolyRouter, PMXT) carry a "Documentation Index: Fetch the complete documentation index at /llms.txt" banner aimed at AI agents. Benign boilerplate; I read those index files only because they are the docs sitemap for this task.
- PMXT README markets an "MCP-native" server (`npx -y @pmxt/mcp`) and a `dome-to-pmxt` codemod run via `npx`. Not installed or executed.
- No prompt-injection style instructions to the agent were found in the fetched pages.

## Privacy check

All scripted requests used `User-Agent: insurance-markets-research/0.1` and carried no email, name, username, home path or contact parameter. No search query or URL contained personal identifiers. Fixtures and this note were grepped for `@`, the user's name and key-like strings; the only hits were `@polymarket/clob-client` and `{@link}` in vendor docs text.
