# Hunch terminal (Sureshot-Labs / hunch.trade) - venue spec

Researched 2026-10-19 (live API probes about 03:00-03:10 UTC). Read-only: unauthenticated GETs, GitHub file reads and page reads only. Nothing was signed, paid, posted or registered. Generic User-Agent `insurance-markets-research/0.1` on every scripted request.

Confidence tags: **H** read first-hand in a primary source this session (raw API JSON or raw repo file; URL given), **M** secondary, inferred, or read through a page summariser (WebFetch), **L** weak or stale. "NOT FOUND (searched: ...)" means I looked and it is not documented.

**Name collision.** This is NOT PlayHunch (`playhunch.xyz`, parimutuel agent game, see `docs/research/venues/hunch-playhunch.md`). This product is `app.hunch.trade` / `www.hunch.trade`, operated by "Hunch Labs" (M, journal About page), code in `Sureshot-Labs/hunch-monorepo`. pmxt's `hunch` adapter (docs/research/venues/pmxt.md) targets one of the two; I did not check which.

## 0. Verdict

- **Still live (H):** yes. `GET https://api.hunch.trade/health` returns `{"ok":true,"db":"ready"}`; feed quotes carry timestamps from the same minute; repo `pushed_at` 2026-10-18T20:12:14Z, latest merge 2026-10-16.
- **Not an independent arbitrage leg (H):** Hunch is a front end and router over Polymarket and Limitless. Its `/orderbook/:tokenId` is a proxy of the Polymarket CLOB (route group named "Polymarket Market-Data Proxy" in `docs/api-rate-limits-and-geofence.md`). It has no book, pool or oracle of its own. Using it as a leg double-counts Polymarket and Limitless.
- **Kalshi is not live on Hunch right now (H):** `/meta/venues` policy says `kalshi: lifecycle "exit-only", indexerMode "maintenance"` (can reduce, cancel, redeem; cannot increase exposure; `discovery:false`). `GET /feed?venue=kalshi` returns `count:0`. Hyperliquid is `unreleased`. The repo README ("Polymarket, Kalshi, PredictBase and others") and the marketing page ("Polymarket, Kalshi, Limitless, Hyperliquid, Opinion, Melee", M) overstate the live set. PredictBase, Opinion and Melee are not in the code's venue enum (`HUNCH_VENUES = polymarket, limitless, kalshi, hyperliquid`).
- **Possible signal source only:** public `/clusters` is an AI-matched cross-venue candidate list with bundle-cost fields, but today it only spans Polymarket x Limitless (8 clusters at probe time).
- **adapter_priority: skip.** Duplicate liquidity, no third-party trade API, no ToS, unlicensed repo, undocumented private API. Optional: poll `/clusters` as a cross-check for our own matcher (hours of work, low value).

## 1. Kind and market model

- **Kind (H):** non-custodial-ish trading terminal + indexer + AI analysis layer (README: "unified prediction market terminal"). Backend is Fastify + Postgres + Redis; workers `indexer-polymarket`, `indexer-kalshi`, `indexer-dflow`, `indexer-limitless`, `market-matcher`, `ai-worker`. Source: https://github.com/Sureshot-Labs/hunch-monorepo (apps/ list).
- **Market model (H):** inherited from the venue. Hunch's unified record has `marketType: "binary"` with `tokens.yes` / `tokens.no` and `outcomes:["Yes","No"]`; events group markets. Polymarket = CLOB over ERC-1155 outcome tokens (decimal token ids). Limitless markets in the feed show `tradeType:"clob"` with token ids prefixed `limitless:`; the Limitless route group also has `/amm/*` and `/orders/amm*` so AMM markets exist (H, route list). No scalar markets seen.
- **Unified ids (H):** `polymarket:<id>`, `limitless:<id>` for events/markets; `/markets/:marketId` and `/events/:eventId` accept the venue-prefixed form.

## 2. Chains and collateral (what the trades settle on, not Hunch's own)

- **Polymarket leg:** Polygon (137). Collateral **pUSD** `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (legacy USDC.e `0x2791...4174`), CLOB V2. Hunch deployed its own `PolymarketFundingRouter` on Polygon at `0x0fEF62E1CD0600C132070855A45443852940EE72` (H, `packages/contracts/deployments/polymarket-funding-router.polygon.json`). A Hunch doc dated 2026-10-05 says "No production trading GO" for the Polymarket V2/ExchangeV3 work (M, may be superseded; `docs/polymarket-protocol-v2-migration.md`).
- **Limitless leg:** `LIMITLESS_API_BASE` default `https://api.limitless.exchange` (H, `apps/api/src/env.ts`). Chain Base / USDC is M (Limitless is covered by the parallel workflow; not re-verified here).
- **Kalshi leg (exit-only):** Solana via DFlow, USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (H, env.ts), DFlow prediction API `https://prediction-markets-api.dflow.net`.
- **Funding:** Across and deBridge bridge clients plus a "relay" funding layer exist in the repo (H, services/ file names); Hunch converts a user's deposit to the venue's collateral. Details not needed for our adapter.
- **Custody (M):** users get Privy-based accounts (`POST /auth/privy`) and "embedded" wallets whose orders are signed through `/trade/<venue>/embedded/sign-order` endpoints (H, route names). Whether keys are user-held, Privy-held or delegated to Hunch's server is NOT FOUND in public docs (privacy page and risk page do not say). The Telegram bot can trade on stored policies (`/telegram/bot-trading/*`, H route names).

## 3. Read API

- **Official/public?** Public unauthenticated reads exist, but **no published API docs for them.** NOT FOUND (searched: `docs.hunch.trade` NXDOMAIN, `www.hunch.trade/docs` 404, `llms.txt` 404, `api.hunch.trade/openapi.json` and `/docs` 404, site nav). The repo's `API_DOCUMENTATION.md` is **stale**: its base URL `https://api.hunch.trading` does not resolve, examples are dated 2024, and it lists `GET /metrics` (404 live). Treat the code and live responses as truth. Kind: **undocumented private API that happens to be public**. Classification: `unofficial-only` in schema terms (closest to "official-public but undocumented").
- **Base URL (H, live):** `https://api.hunch.trade`. Same API is proxied by the web app at `https://app.hunch.trade/api/hunch/...` (H, `/api/hunch/clusters` returned 200).
- **Auth/limits (H, `docs/api-rate-limits-and-geofence.md` in repo; no rate-limit headers were returned by live calls):** global 600 req/min/IP (HTTP 429 `rate_limit_exceeded`); `/markets/:id` and `/events/:id` 100/min; candlesticks 60/min; `/price-history` 50/min; `/orderbook/:tokenId` 100/min; `/orderbook/batch` 50/min; `/price/:tokenId` 200/min; SSE `/prices/stream` 30 connects/min and 50 active connections per IP. Orderbook responses carry `cache-control: public, max-age=5, stale-while-revalidate=10` (H).
- **Key endpoints (all confirmed 200 unauthenticated unless noted):**
  - `GET /feed?limit&offset&venue=polymarket|limitless|kalshi&category&sort=totalvol|liquidity&min_volume24hr&filter=newest|endingsoon` events with nested markets, `top{yesBid,yesAsk,noBid,noAsk}`, `volumeTotal`, `liquidity`, `openInterest`, `tokens`, `conditionId`. A limit=3 page is ~200KB (descriptions + full market lists), so use small limits. `venue` accepts only those 3 values (400 otherwise).
  - `GET /events/:eventId`, `GET /markets/:marketId`, `GET /markets/by-token`, `GET /markets/:marketId/{alternatives,similar,candlesticks}`, `GET /events/:eventId/{alternatives,series,similar,candlesticks}`.
  - `GET /orderbook/:tokenId`, `POST /orderbook/batch`, `GET /price/:tokenId?side=`, `POST /price/batch`, `GET /midpoint/:tokenId`, `POST /spreads`, `GET /price-history` (Polymarket market-data proxy; POSTs are read-only batch lookups but I did not call them, per the no-POST rule).
  - `GET /trades?marketId|eventId|tokenIds=` (400 if none given), `GET /holders`, `GET /signals`, `GET /events/:id/signals`, `GET /markets/:id/signals` (LLM-written "signals", 88KB on a plain call).
  - `GET /clusters?limit=` cross-venue candidate clusters (below). `GET /matching/config` -> `{"lazyEnabled":true,"clusterSource":"hunch_matcher","agentClusterSource":"hunch_matcher"}`.
  - `GET /meta/venues` (lifecycle policy, section 0), `GET /meta/categories`.
  - `GET /prices/stream?token_id=a,b,c` Server-Sent Events (route exists in code; I did not hold a stream open). No websocket found.
  - Authenticated (Bearer Hunch JWT): `/auth/*`, `/orders*`, `/positions`, `/fees/policy`, `/trade/*`, `/executions`, `/feed/favorites`, `/feed/for-you`, watchlist, notifications, funding.
- **Resolution data:** the feed carries `resolvedOutcome` / `resolvedOutcomePct` and `status` per market (H field names, null on active markets I saw). Not an independent resolution source.
- **Fixtures** (`docs/research/fixtures/hunch-terminal-sureshot-labs/`, all fetched 2026-10-19): `api_health.json`, `api_meta_venues.json`, `api_meta_categories.json`, `api_matching_config.json`, `api_feed_polymarket_limit1_trimmed.json`, `api_feed_limitless_limit1.json`, `api_clusters_trimmed.json`, `api_orderbook_polymarket.json`, `api_market_alternatives_polymarket.json`, `api_trades_polymarket.json`. `/trade/policies` was probed but not saved (it echoes the caller's country).

### The `/clusters` payload (the only Hunch-original data)

H, live sample in `api_clusters_trimmed.json`. Defaults returned: `minVenueCount 2, minSpread 0.03, minQualityScore 0.6, minAnalysisConfidence 0.6, maxOutlierRatio 0.4`. Each item has `label`, `venueCounts`, `priceSpread`, `minLiquidity`, `totalLiquidity`, `volume24h`, `qualityScore`, `matchDiagnostics{family,matchTierCounts{structuredExact,lexicalExact,marketEmbedding},...}`, an LLM `analysis{summary,confidence,model}` and an `execution` object: `bestYesOffer{venue,marketId,ask}`, `bestNoOffer{...}`, `bundleCost`, `grossEdge`, `verification{status,netEdge,totalFees}`.
Example from the sample (China invade Taiwan by end of 2026): best YES ask 0.021 on Polymarket + best NO ask 0.985 on Limitless -> `bundleCost 1.006`, `grossEdge -0.006`, `verification.status "not_candidate"`. So the one live example is **not** an arbitrage after ask-side pricing, which matches the repo's own caveat that headline spreads are "not directly executable arbitrage because rules, dates, or outcome definitions differ" (`docs/agg-market-arbitrage-comparison.md`, 2026-05-11, H). Only Polymarket and Limitless appear at probe time (8 clusters, every one spanning exactly those two venues). The `analysis.summary` text is LLM output: treat as untrusted data.

Aside (H, repo docs 2026-05-11): Hunch's own arbitrage page switched to **AGG Market** (`api.agg.market`, venues kalshi, polymarket, limitless, opinion, predict, probable, myriad, hyperliquid) as its default source, with `?source=hunch` as the fallback. That is a separate aggregator worth its own spec if not already covered.

## 4. Trade path

- **Documented third-party trade API: none (H).** Orders flow: Privy access token -> `POST /auth/privy` -> Hunch JWT (`Authorization: Bearer`) -> venue-specific endpoints under `/trade/polymarket` (`/quote`, `/order`, `/order-hash`, `/embedded/sign-order[/prepare]`, `/embedded/sign-fee-auth`, `/orders/sync`), `/trade/limitless` (`/clob/quote`, `/amm/quote`, `/order`, `/orders/amm`, `/auth/login`), `/trade/kalshi` and `/trade/dflow` (`/quote`, `/swap`, `/submit`). Source: route files `apps/api/src/routes/*-private.ts` (H). Auth endpoints are IP-limited to 20-30/min. The only API-key scheme in the repo (`hsa_v1.<id>.<secret>` service principals) is for the admin CMS, not trading (H, `docs/hunch-content-api-for-ai.md`).
- **Polymarket order signing (H):** EIP-712 order signed by the user's wallet, plus (legacy) a FeeAuth EIP-712 for the Hunch fee collector, or (current default policy) a Polymarket **builder code** attached to the order (`builderCode`, `collectionMode: builder | fee_auth | none`).
- **Reachable by a PayBox EVM wallet? No, not through Hunch (assessed M).** There is no key-based or signature-only API for external agents, and the embedded-wallet signing endpoints are tied to Privy accounts. A PayBox wallet that wanted these markets would trade the underlying venues directly (Polymarket on Polygon, Limitless on Base) with their own APIs/signed orders, which the parallel workflow covers. Whether the web app accepts an external-wallet login (the guide says login is "by email, Telegram, or a wallet", M) does not change this: it would be browser-session trading, not an agent API.

## 5. Fees

- **Who sets what (H, code):** `GET /fees/policy` (authenticated) returns per-venue `feeBps`, `collectionMode`, builder rates. Constants: Polymarket builder fee capped at taker 100 bps / maker 50 bps by the program (`MAX_TAKER_BUILDER_FEE_BPS=100`, `MAX_MAKER_BUILDER_FEE_BPS=50`); legacy `HUNCH_FEE_BPS_POLYMARKET` default 0; Limitless uses a **venue fee share** (`collectionMode "venue_share"`, effective extra fee to the user 0, Hunch takes a share of Limitless's fee); Kalshi via DFlow uses `feeBps`/`feeScale` from a fee policy (env default 0). The live production values are NOT FOUND (searched: `/fees/policy` requires auth; marketing and journal pages quote none).
- **Marketing (M):** homepage lists no trading fees, advertises "up to 55%" fee cashback and "up to 25%" referral bonus but the tier table reads "up to 0%"; journal first-trade guide (published 2026-08-19, flow checked 2026-08-15) says the confirmation screen shows "Hunch fee" and "venue fee" separately without amounts.
- **For our arbitrage maths:** use the venue's own fee schedule plus a Hunch builder fee of 0-100 bps taker only if we ever route through Hunch. We would not.

## 6. Resolution and dispute risk

Hunch does not resolve anything. Each market resolves under its venue's rules (risk page, last reviewed 2026-08-14: "venues use different resolution sources and dispute mechanisms", M). So resolution risk = Polymarket's (UMA-style optimistic oracle, parallel workflow) and Limitless's. Added Hunch-specific risk: its cross-venue matching is an LLM/embedding pipeline and can pair markets with different deadlines or rules (see the Taiwan 2026 vs 2027 example, H), so never trust a Hunch cluster as an equivalence proof.

## 7. Geo, ToS, automation

- **ToS: NOT FOUND (searched: `www.hunch.trade/terms`, `app.hunch.trade/terms` both 404; sitemap lists only the journal; privacy page exists at `app.hunch.trade/privacy` but names no legal entity, no terms, no bot/API rules).** No rule for or against scraping the public reads. robots.txt (www) allows all except `/journal/preview` and `/api/content/`.
- **Geofence in code (H):** applies to Kalshi/DFlow trading only (`DFLOW_GEO_BLOCK_ENABLED` default false; unknown-country default "block" when enabled); "not a general read-API country block". Live `/trade/policies` answered `tradingAllowed:true` for Kalshi from the probing IP. Journal: "legal eligibility can differ by jurisdiction and account", "identity checks" may apply (M). Underlying venue geo rules (Polymarket, Limitless) still apply.
- **Risk of relying on it:** repo is **unlicensed** (`license: null`), 4 stars, 3 contributors, no releases (H); API is private-by-design and can change without notice.

## 8. Liquidity

- **Hunch-routed volume/TVL/OI: NOT FOUND** (searched: homepage, journal, repo docs, DefiLlama protocols list (9.3MB, no "hunch" entry) and fees overview (none), 2026-10-19; web search budget was exhausted so no press/Dune check). Only 4 GitHub stars and a young product (repo created 2025-09-14).
- **Underlying market depth visible through the feed (H, 2026-10-19):** top event "Democratic Presidential Nominee 2028": eventVolume about $1.295B, eventLiquidity about $75.9M, openInterest about $8.7M (Polymarket numbers, not Hunch's). `/meta/categories` (generated 2026-10-18T14:27Z): 73,360 active events, Polymarket about 25.9k, Limitless about 47.4k.
- **Shared liquidity (H):** 100% shared with Polymarket (and Limitless). Not independent.

## 9. Event coverage overlap (arbitrage-relevant)

Counts of active events per category on 2026-10-18 (H, `api_meta_categories.json`): crypto 28,041 (Limitless 22,557 / Polymarket 5,484); sports 25,440 (16,001 / 9,439); other 14,913; politics 2,905 (Polymarket 2,636 / Limitless 269); economics 960 (575 / 385); weather 384; entertainment 336; technology 326; mentions 51; health 4. Overlap exists only where both Polymarket and Limitless list a market (crypto price, sports, a few politics/economics), and that overlap is a Polymarket x Limitless arbitrage the parallel workflow's adapters already expose natively. No venue unique to Hunch.

## 10. Open questions

- Live Hunch fee rates (needs an authenticated `/fees/policy`, which we will not call).
- Whether an external wallet can log in and trade without Privy.
- Whether Kalshi is returning to `active` (watch `GET /meta/venues`).
- Whether PredictBase, Opinion, Melee, Hyperliquid are planned (marketing says some are supported; code says not).
- Which of Hunch or PlayHunch pmxt's `hunch` adapter targets.
- A separate spec for AGG Market (`api.agg.market`), which Hunch now uses as its cross-venue matching source.

## Sources

- https://github.com/Sureshot-Labs/hunch-monorepo (repo metadata, README, `API_DOCUMENTATION.md`, `docs/api-rate-limits-and-geofence.md`, `docs/agg-market-api.md`, `docs/agg-market-arbitrage-comparison.md`, `docs/polymarket-protocol-v2-migration.md`, `docs/hunch-content-api-for-ai.md`, `packages/shared/src/venue-lifecycle.ts`, `packages/contracts/README.md` and `deployments/polymarket-funding-router.polygon.json`, `apps/api/src/{env.ts,routes/*.ts,services/polymarket-builder-fees.ts}`), read via `gh api` on 2026-10-19 (H).
- https://api.hunch.trade/health, /feed, /meta/venues, /meta/categories, /clusters, /matching/config, /orderbook/:tokenId, /markets/:id/alternatives, /trades, /signals (live GETs, 2026-10-19, H).
- https://app.hunch.trade/api/hunch/clusters (proxy, H); https://app.hunch.trade/privacy (M, summarised).
- https://www.hunch.trade/ , /journal/how-to-make-first-trade-hunch (published 2026-08-19), /journal/risk-disclosure (reviewed 2026-08-14), /journal/about (reviewed 2026-08-14), /robots.txt, /sitemap.xml (M for summarised pages, H for robots/sitemap).
- https://api.llama.fi/protocols and /overview/fees (no Hunch entry, 2026-10-19).
- Prior repo notes: docs/research/14-platform-of-platforms.md (section 6.1 listed Hunch as IGNORE, M), docs/research/venues/pmxt.md, docs/research/venues/hunch-playhunch.md.
