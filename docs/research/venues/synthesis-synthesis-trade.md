# Synthesis (synthesis.trade) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Synthesis is NOT a venue. It is a wallet-as-a-service and unified data/trading API layered on top of Polymarket (Polygon) and Kalshi (via DFlow on Solana). It has no markets, order book, or liquidity of its own. Every price and book it serves is a mirror of Polymarket or Kalshi. It is therefore not an independent arbitrage leg. Adapter priority: P2 (signal-only / optional data convenience). Its one distinctive piece is a cross-venue "similar pairs" matcher, which can seed market linking.

## 1. Still live? (H)
- https://synthesis.trade returns HTTP 200 (Next.js, Cloudflare) on 2026-10-19. Page is JS-rendered; no venue list in static HTML.
- Public API answered live data on 2026-10-19 with `updated_at` timestamps within the hour (e.g. 2026-10-19T05:17Z). H.
- npm `@predictions/sdk` 1.0.0 published 2026-03-24 (only version; ~7 months old, possibly stale but API behind it is current). H: https://registry.npmjs.org/@predictions/sdk
- Docs at https://api.synthesis.trade/docs (Mintlify), OpenAPI at https://api.synthesis.trade/docs/openapi.json (226 KB, 100+ paths). H.
- GitHub repos named in the npm metadata (ryne-labs/sdk) and README (synthesis-trade/cli) return 404 via `gh api` (private or removed). Source code not auditable. H (404).

## 2. Kind and market model (H)
- kind: aggregator + custodial/managed-wallet trading API (white-label "headless accounts" for builders).
- Venues: only `polymarket` and `kalshi` (OpenAPI description: "Unified prediction market API for Polymarket and Kalshi"; `venue` filter `polymarket|kalshi|all`). The "Limitless" mention in awesome lists is NOT FOUND in docs/OpenAPI (searched: llms.txt, openapi.json).
- Market model is inherited: binary Yes/No CLOB markets, grouped into events (Polymarket neg-risk events for categorical, Kalshi series/event/market). No scalar, AMM or parimutuel.
- Outcome tokenisation: Polymarket = numeric ERC-1155 `left_token_id`/`right_token_id` per outcome plus `condition_id`/`question_id`. Kalshi = `market_id` string (e.g. KXPRESNOMD-28-SFAI) with DFlow SPL `yesMint`/`noMint` per collateral mint (USDC, CASH) on Solana.

## 3. Chains and collateral (H)
- Wallet object spans Polygon and Solana only (docs: "Each wallet supports multiple chains: Polygon and Solana").
- Polygon: USDC.e (mint/merge doc says "Split USDC.e into Polymarket outcome shares"); also swap inside wallet (USDC to USDT example in SDK readme, M).
- Solana: USDC / CASH via DFlow; Kalshi trading requires DFlow KYC (endpoints `/wallet/sol/{id}/kyc`).
- Deposit address chains: `EVM`, `SOL`, `TRON` ("deposit addresses + bridging" is a Free-tier feature).
- Wallets are created and held by Synthesis (server-side keys; `export` endpoint returns an encrypted secret). Custodial / managed. M-H.

## 4. Read API (H)
- Existence: official, public, unauthenticated for market data. No key needed for `/markets`, `/polymarket/*`, `/kalshi/*`, `/news`. Verified by unauthenticated GET on 2026-10-19.
- Base URL: https://synthesis.trade/api/v1 (docs host: https://api.synthesis.trade/docs). Response envelope `{"success":true,"response":...}`. CORS `access-control-allow-origin: *`.
- Docs: https://api.synthesis.trade/docs/llms.txt, https://api.synthesis.trade/docs/openapi.json
- Key endpoints (all `security: []` in OpenAPI = public):
  - `GET /markets` (venue, sort, order, limit, offset, live, price/date/label filters) - unified event+markets across venues
  - `GET /markets/search/{query}`, `GET /markets/related/{slug}`
  - `GET /markets/similar`, `GET /markets/similar-pairs?limit&min_similarity` - cross-venue pairs from a similarity index
  - `POST /markets/prices` (body: JSON array of Polymarket token IDs and/or Kalshi market IDs, max 1000) 
  - `POST /markets/orderbooks` (same IDs, auto-detects venue); `GET /markets/orderbooks/historical` (Developer tier+)
  - `POST /markets/sparklines`
  - `GET /polymarket/markets`, `/polymarket/market/slug/{slug}`, `/market/token/{token_id}`, `/market/{condition_id}/trades`, `/market/{token_id}/statistics`, `/market/{token_id}/price-history`
  - `GET /polymarket/uma`, `/uma/market/{condition_id}`, `/uma/question/{id}`, `/uma/thread/{condition_id}` - UMA oracle request state and discussion thread (useful for resolution-risk signal)
  - `GET /kalshi/markets`, `/kalshi/market/{id}`, `/trades`, `/holders`, `/statistics`, `/candlesticks`, `/leaderboard`
  - `GET /news`, `/news/market/{id}`, sports data (paid tiers per pricing page)
- WebSocket (H, docs): `wss://synthesis.trade/api/v1/orderbook/ws` (5,000 markets/connection, snapshot then deltas), `/trades/ws` (1,000 markets), `/balance/ws` (500 wallets, authenticated), `/uma/ws`, `/data/ws` (holders; paid). Server pings every 30 s. Subscribe msg: `{"type":"subscribe","venue":"polymarket","markets":[...]}`. Not exercised live (no WS client used).
- Auth / limits: none for market data. Rate limits: NOT FOUND (searched: llms.txt, pricing page, OpenAPI for "rate limit"/429; no rate-limit headers seen; 8 rapid GETs all returned 200). Pricing page says "custom rate limits" only for Enterprise. Treat as undocumented; assume modest.
- Shapes confirmed (fixtures in docs/research/fixtures/synthesis-synthesis-trade/):
  - Polymarket market: `left_price`/`right_price` strings, `left_token_id`/`right_token_id`, `condition_id`, `liquidity`, `volume`, `volume24hr`, `neg_risk`, `fees` (bool), `rewards`, `ends_at`.
  - Kalshi market: `market_id`, `kalshi_id` (UUID), `left_price`/`right_price`, `open_interest`, `liquidity`, `dflow{mint -> {yesMint,noMint,marketLedger}}`. Note Kalshi `right_price` can be "1.00" for a 0.01 Yes (last-trade/ask artefact), so do not treat left+right as a consistent complement. M (observed).
  - Orderbook: Polymarket `{bids:{price:size}, asks:{...}, best_bid, best_ask, hash}`; Kalshi `{yes:{bids,asks}, no:{bids,asks}, sequence}` (maps keyed by price string).
  - Similar pairs: `{source:{venue:kalshi,...}, target:{venue:polymarket,...}, similarity?}` - sample matched Kalshi "Who will Trump pardon? - Eric Adams" to a Polymarket "pardon before 2027" market whose resolution window differs (Jan 21 2029 vs Dec 31 2026). That is a false-equivalence trap: similarity score is not resolution-equivalence. M (observed in fixture).

## 5. Trade path (H from docs/OpenAPI; nothing executed)
- Programmatic trading exists via Synthesis-managed wallets, not via user-signed orders:
  - Create account under a project (`POST /project/account`, header `X-PROJECT-API-KEY`), then session (`Authorization: Bearer`) or account API key (`X-API-KEY`), then `GET/POST /wallet` creates Polygon+Solana wallets automatically.
  - Polymarket: `POST /wallet/pol/{wallet_id}/order/quote` and `/order` (token_id, side BUY/SELL, type MARKET|LIMIT|STOPLOSS, amount, units USDC|SHARES, price, time_in_force FOK|FAK|GTC|GTD, expiration); `PUT/DELETE /order/{id}`, `DELETE /orders` (cancel all); mint/merge/redeem/withdraw/swap; copytrade configs.
  - Kalshi: `POST /wallet/sol/{wallet_id}/order/quote` and `/order` (optional `slippage` bps), redeem, withdraw; DFlow KYC required.
- The server signs on the user's behalf using Synthesis-held keys. There is no documented flow for submitting an externally signed order or proposing a transaction from a user's own wallet.
- PayBox reachability: **partial**. A PayBox EVM wallet could (a) send USDC/USDC.e on Polygon to a Synthesis-generated deposit address (plain transfer proposal) and (b) call Synthesis REST with an API key to place orders, then withdraw back with `/withdraw` to a PayBox address. That is custodial exposure to Synthesis, adds a 3rd-party trust hop, and Kalshi legs need a Solana wallet plus KYC. For Polymarket the direct CLOB with a PayBox-held key is strictly better (no intermediary); for Kalshi use DFlow directly. So Synthesis adds no reach PayBox lacks.

## 6. Fees (partially documented)
- Pricing (H, https://api.synthesis.trade/docs/guides/pricing.md): Free $0 (5 accounts, 20 wallets), Developer $99/mo (250 accounts), Business $299/mo (1,000 accounts; "Charge fees" and "Builder codes" enabled), Enterprise custom. Gas "Covered" on all tiers.
- Per-trade fee charged by Synthesis itself: NOT FOUND (searched: pricing page, OpenAPI for "fee"/"builder", getting-started). Business tier lets a project charge its own fees to end users and use builder codes, so fees on a given integration depend on that integrator. Underlying venue fees (Polymarket `fees:true` flag on market, Kalshi fees) still apply.
- Market data is free.

## 7. Resolution and dispute risk (H/M)
- Resolution is entirely the underlying venue's: Polymarket via UMA optimistic oracle (Synthesis exposes UMA request/thread endpoints), Kalshi via its own rulebook/determination. Synthesis has no resolution layer of its own.
- Added risk: custodial wallet and intermediary failure; redemption goes through Synthesis (`redeem`, optional auto-redeem on paid tiers).

## 8. Geo / ToS / automation (partial)
- Terms page https://synthesis.trade/terms returns 200 but is JS-rendered (no text in static HTML; WebFetch was unavailable this session due to a usage limit). Jurisdiction, automation and fee clauses: NOT FOUND (searched: /terms, /privacy static HTML, OpenAPI, docs). Inherits Polymarket (US restricted for the global venue) and Kalshi (US KYC via DFlow) constraints, M.
- Automation is explicitly supported for the paid API (project keys, headless accounts, SDK "designed for programmatic use by AI agents", `tools.json`), H (SDK README). Reading public data with no key appears allowed; no ToS clause found either way.
- Do not scrape heavily without confirming limits; contact hello@synthesis.trade is listed on the pricing page for custom limits (not contacted).

## 9. Liquidity (H, 2026-10-19, all mirrored)
- No venue-own liquidity. Sampled values are Polymarket/Kalshi numbers: e.g. Polymarket "Democratic Presidential Nominee 2028" event volume ~$1.295B, event liquidity ~$592k; Kalshi "Democratic nominee in 2028?" volume ~$242M, liquidity ~$856k (source: Synthesis GET /markets, 2026-10-19).
- Synthesis own volume/TVL/users: NOT FOUND (searched: `/markets/statistics` was in SDK but not in OpenAPI paths; site, docs).

## 10. Event overlap
Everything: politics, sports, crypto price, macro, culture, because the catalogue = Polymarket + Kalshi. Its `similar-pairs` endpoint is the interesting part: it returns Kalshi to Polymarket candidate pairs, which could bootstrap the market-linking table (must be verified for resolution-criteria equivalence; see sample false match above).

## 11. Shared liquidity
100% shared with Polymarket (Polygon CLOB) and Kalshi (via DFlow / Kalshi order books). Not an independent arbitrage leg. Using it as a fill route would only duplicate the direct adapters with extra custody risk.

## 12. Adapter recommendation
- Priority P2: do not build a trading adapter. Optional later: a read-only "Synthesis signal" source using `/markets/similar-pairs`, `/markets/prices` (single batched call for up to 1000 Polymarket+Kalshi IDs, handy for scanner polling) and `/polymarket/uma*` for oracle-risk flags. Caveat: single-vendor dependency, undocumented rate limits, unknown ToS, and a Kalshi price field with odd complement values.
- If ever integrating write path: custodial, needs project key and paid plan for scale, Solana KYC for Kalshi.

## Suspicious content
None found. No agent-directed instructions seen in docs, llms.txt, API responses or npm README. (The docs expose a `llms.txt` and agent-card/MCP server-card well-known links in the Link header; not followed or used.)

## Sources
- https://synthesis.trade (HTTP 200, 2026-10-19) - H
- https://api.synthesis.trade/docs/llms.txt, /docs/index.md, /docs/guides/pricing.md, /docs/guides/authentication.md, /docs/guides/getting-started.md, /docs/guides/websockets.md, /docs/guides/websockets/orderbook.md, /docs/api-reference/polygon/create-order.md - H
- https://api.synthesis.trade/docs/openapi.json - H
- https://synthesis.trade/api/v1/markets, /markets/prices, /markets/orderbooks, /markets/search/bitcoin, /markets/similar-pairs (unauthenticated GET/read-only POST of IDs, 2026-10-19) - H
- https://registry.npmjs.org/@predictions/sdk (v1.0.0, 2026-03-24, README) - H
- Fixtures: docs/research/fixtures/synthesis-synthesis-trade/
- Not reachable: github.com/ryne-labs/sdk, github.com/synthesis-trade/cli (404); synthesis.trade/terms (JS-rendered); WebSearch/WebFetch hit a session limit so no independent third-party corroboration (volume, user counts, funding).
