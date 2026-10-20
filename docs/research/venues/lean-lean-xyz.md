# Lean (lean.xyz) - venue spec

Researched 2026-10-19. Read-only: public unauthenticated GETs only, no accounts, no wallet, no POST.
Verdict: **not a venue. A multi-venue trading terminal / front-end over Polymarket, Polymarket US, Kalshi and Hyperliquid outcome markets.** Zero independent liquidity. adapter_priority = **skip** (as an arbitrage leg). Useful only as a reference design and as a cheap pre-normalised cross-venue feed (with big ToS/stability caveats).

## Summary
- kind: aggregator + order-routing terminal (self-describes "Prediction Markets Terminal") [H: https://lean.xyz/ `<title>`]
- Live: yes. Site 200, API health healthy at 2026-10-19T07:13Z [H: https://api.lean.xyz/health]; deployed release sourceSha 2595ec6a... [H: https://api.lean.xyz/health/release]
- Same product also served from credence.markets (hostname listed in the page's prod-host config) [H: lean.xyz HTML inline script]. No independent coverage of either name found by web search [M: searched "Lean.xyz prediction markets terminal", "credence.markets prediction markets terminal"; nothing relevant].
- Venues routed (from the API order schema enum and the listing data): `kalshi`, `polymarket`, `polymarket_us`, `hyperliquid` [H: https://api.lean.xyz/openapi.json `venue` enum; https://api.lean.xyz/markets/discovery tickers prefixed `pm:`, `pmus:`, `hl:`, kalshi].

## Market model
- Mirrors upstream venues; per-venue CLOBs. Lean's normalised type enum: binary, pair, categorical, scalar; marketType: moneyline, spread, total, player_prop, prop, yes_no, above_below, range, directional, deadline [H: openapi.json `/markets` schema]. Prices normalised to cents (0-100), with `tickRule` (cent/tenth/hundredth/tapered/half_cent) [H].
- Tokenisation is the upstream venue's (Polymarket CTF conditional tokens, Kalshi contracts, Hyperliquid outcome contracts). Lean tickers: `pm:<conditionId>`, `pmus:<slug>`, `hl:<id>`, Kalshi plain ticker [H: sample fixtures].
- Lean adds its own cross-venue semantic tagging (`marketSemantics.family`, `sports-match` fixtures matching, `/events/:ticker/adjacent`) [H: openapi paths and search fixture]. This is relevant prior art for the project's market-linking layer, not a data source we can rely on.

## Chains and collateral
Not documented by Lean. Inferred from upstream: Polymarket = Polygon pUSD/USDC, Kalshi and Polymarket US = USD (fiat, KYC), Hyperliquid = HyperCore USDC [M]. Lean has a bridge/funding API (`/funding/bridge/supported-assets|deposit|withdraw/*`) and Privy-based auth (cookie `privy-token`) with embedded "trading wallets" and "signer-delegation" [H: openapi.json; lean.xyz HTML]. Supported assets list not read (needs no auth per openapi but not fetched; NOT FOUND in docs).

## Read API
- exists: **unofficial-only in practice.** There is no published documentation (https://lean.xyz/docs 404, /llms.txt 404, api.lean.xyz/docs 404; searched web, nothing). But the production backend serves its own OpenAPI document publicly: `GET https://api.lean.xyz/openapi.json` (1.4MB, title "Livermore API" v0.1.0, ~150 routes) [H]. It is the internal API of their web app, not a supported developer API.
- Base URLs: `https://api.lean.xyz` (direct; the site proxies as `/__prod-api`); `https://cdn.lean.xyz` referenced in the bundle [H].
- Unauthenticated routes confirmed working: `/health`, `/health/release`, `/markets/categories`, `/markets/discovery`, `/search/v2?q=...&limit=`. `/boot` and other account routes return 401 "Missing authorization header" [H].
- Routes that document `tickers` as a required param (not exercised): `/markets?tickers=`, `/trades?tickers=&limit=&cursor=`, `/chart/:ticker`, `/chart/batch`, `/candles/batch`, `/markets/:ticker`, `/events/:eventTicker`, `/resolution/timeline?ticker=`, `/sports/catalog/v3`, `/calendar/*` [H: openapi; M: whether they need auth]. Not tested to avoid load; likely public as they carry no security marker (the spec declares no securitySchemes at all, so absence of a marker proves nothing) [L].
- `/markets/discovery`: single snapshot of ~18,900 markets (kalshi 6578, polymarket_us 6577, polymarket 5488, hyperliquid 269) ordered by 24h volume, fields: ticker, eventTicker, title, venue, tags, categoryKeys, yes/noLabel, tickRule, yesBidCents, yesAskCents, spreadCents, priceChange24h, volume24h, tradeCount24h, openInterest, closeTsSec [H: fixture `markets-discovery-sample.json`]. Many Polymarket-US rows had null bid/ask. Bids/asks for polymarket rows appeared populated only in search results.
- WebSocket: `POST /account/ws-token` exists (auth required); WS URL/protocol NOT FOUND (searched openapi.json, index bundle).
- Auth/limits: public reads need none; orders/account need a Privy JWT. Rate limits NOT FOUND (API has a RATE_LIMITED error code and 429s on order routes). Requests send header `X-Lean-Api-Contract: sha256:...` / `X-Lean-Api-Generation` (not required for the GETs I made).
- Stability risk: contract is versioned by hash and the app-version meta changes per deploy; no stability promise.

## Trade path
`POST /orders` (LIMIT/MARKET, venue, ticker, side yes/no, action buy/sell, tif DAY/IOC/FOK/GTC/GTT, priceCents, clientOrderId uuid, tradingAccountId) plus `PATCH/DELETE /orders/:venue/:orderId`, `/orders/batch-cancel`, stop-loss and limit-chase services [H: openapi.json]. Requires Privy login (session JWT) and a per-venue account (`PUT /venue-accounts/:venue`: kind api_key or wallet) [H]. It also lists a `402` response on POST /orders, meaning unspecified (not probed) [H that code is declared; payment requirements NOT FOUND]. It is a custodial-ish/delegated-signer web terminal, not a programmatic trading API for third parties; no API-key issuance documented [M].

## PayBox reachability
**no** for Lean itself (no on-chain contracts of its own, no documented machine auth; Privy browser login). Underlying liquidity is reachable through the venues' own adapters (Polymarket on Polygon via signed orders; Hyperliquid via its API; Kalshi is fiat/API-key). Going through Lean adds nothing.

## Fees
NOT FOUND (searched lean.xyz, openapi.json, web). Lean is a registered Polymarket builder (code `0xf6924ce2...cd92d0`), rank 183 all-time, ~$553k volume, 13 active users (ALL period) [H: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=150, read 2026-10-19], implying builder-fee/attribution revenue on Polymarket flow. Their volume is tiny relative to venue totals. Fee formula/who pays: unknown.

## Resolution
Inherited from each upstream venue (UMA OO for Polymarket, Kalshi/CFTC rules, Hyperliquid HIP-4 deployer rules). Lean exposes `/resolution/timeline`, `/resolution/dvm-round`, `/resolution/voting-markets`, `/resolution/clarifications` (UMA-flavoured names) [H: openapi paths; responses not read]. Lean adds no resolution of its own.

## Geo / ToS / automation
NOT FOUND: terms page not found at /terms; no ToS link reachable in the SPA shell (searched index bundle URLs). robots.txt allows `/` but disallows app routes (/trade, /portfolio, ...) [H: https://lean.xyz/robots.txt]. Account access gated: `/account/access`, `/account/access-code`, `/waitlist` routes suggest invite/waitlist [M]. Using the unpublished internal API in production would be ToS-ambiguous; upstream venue geo rules (US users, Kalshi/Polymarket US KYC) apply.

## Liquidity
No own liquidity. Lean's listing totals (snapshot 2026-10-19 ~07:13Z, `/markets/discovery`, which sums upstream venue stats, NOT Lean volume): 24h volume polymarket_us ~$5.75M, hyperliquid ~$5.97M, kalshi ~$1.64M, polymarket ~$0.27M in the rows returned (counts of rows differ; `truncated:false`; values look partial/odd, e.g. Kalshi OI 143M in unspecified units) [H for numbers, L for interpretation]. Lean's own flow: ~$553k all-time via Polymarket builder code [H].

## Event overlap
Crypto price thresholds, sports (NFL, tennis), Fed rate decisions, economics, politics: all mirrored from venues already tracked [H: fixtures]. Because Lean shows Polymarket, Polymarket US and Kalshi side by side, its `sports-match`/semantics layer already tries to pair the same event across venues.

## Shared liquidity
**100% shared with** Polymarket (global), Polymarket US, Kalshi, Hyperliquid. Not an independent arbitrage leg.

## Adapter priority: skip
Reasons: aggregator with duplicate liquidity; no documented/supported API; auth via Privy session; ToS unknown. Possible uses: (1) spot-check feed for pre-normalised cross-venue prices and as a benchmark for our own market-linking; (2) **lead: Hyperliquid outcome (HIP-4) markets** appear here as `hl:` tickers with ~$6M 24h volume and tight books (e.g. FOMC Oct 2026 "No change" bid 87.19/ask 87.191, NFL moneylines) [H: discovery fixture]. Hyperliquid was not in the already-covered list; recommend a separate venue-spec for it (DL News/Unchained coverage of HIP-4 found in search [M]).

## Open questions
- Terms of service / API usage terms (none located).
- WebSocket endpoint and rate limits.
- Fee schedule and builder fee on Polymarket orders.
- What HTTP 402 on POST /orders means.
- Whether `/markets?tickers=` etc. are open without auth (untested).

## Sources
- https://lean.xyz/ (HTML, robots.txt) - H
- https://api.lean.xyz/openapi.json, /health, /health/release, /markets/categories, /markets/discovery, /search/v2?q=bitcoin - H (fetched 2026-10-19)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=150 - H
- Web searches (standard/extended) for Lean/credence: no independent coverage found - M
- Fixtures: docs/research/fixtures/lean-lean-xyz/{markets-discovery-sample,search-v2-bitcoin-sample,markets-categories,health-release}.json
