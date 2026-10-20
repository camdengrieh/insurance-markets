# PolyNode (polynode.dev) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

PolyNode is NOT a prediction market. It is a paid third-party data/execution API layered on Polymarket (Polygon). It has no markets, no liquidity, no resolution of its own. Every market, book and price it serves is Polymarket's. It is not an independent arbitrage leg. adapter_priority = skip as a venue. Optional later use: a faster/richer Polymarket data feed (pre-chain settlements, wallet P&L, orderbook WS), only if the existing Polymarket adapter proves too slow or lacks wallet analytics.

## Live status (H)
- Site and docs live. Site build stamp `release=...-20261013T055934`; docs changelog newest entry 2026-10-11 (Polymarket Protocol V2 markets); weekly archives back to March 2026. https://polynode.dev/ , https://docs.polynode.dev/changelog.md (H)
- `GET https://api.polynode.dev/healthz` -> 200 `ok`; `/readyz` -> `{"node":true,"redis":true,"status":"ready"}` (H, fetched 2026-10-19).

## Kind and market model (H)
- Kind: data API + trading SDK/relay for Polymarket. Homepage title: "The Fastest Real-time Polymarket Data API". (H, https://polynode.dev/)
- Market model is Polymarket's: binary and neg-risk multi-outcome CLOB, outcome tokens are ERC-1155 token ids (70+ digit strings), condition ids `0x...`. Docs order book examples show Yes/No tokens with tick 0.01, min size 5. (H, https://docs.polynode.dev/api-reference/orderbook/order-book.md)
- Also covers "Polymarket perpetual futures" (BTC, ETH, SOL, gold, S&P etc., up to 20x, hourly funding; 11 instruments live mid-July 2026) as read-only data under `/v3/perps`. That is a Polymarket product, not PolyNode's. (H, https://docs.polynode.dev/perps/overview.md)
- Also Polymarket "combos" data and Polymarket Protocol V2 (ExchangeV3, PositionManager; test markets since 2026-10-05, new markets from about 2026-11-02, tentative per Polymarket). (H, https://docs.polynode.dev/changelog.md)

## Chains and collateral (H)
- Polygon only. Collateral is PolyUSD/pUSD (Polymarket V2 collateral since April 2026). (H, https://docs.polynode.dev/sdks/trading.md)

## Read API
- Official, authenticated (API key `pn_live_...`), paid for most data. Docs: https://docs.polynode.dev (OpenAPI-based, llms.txt index at https://docs.polynode.dev/llms.txt). (H)
- Base URLs: REST `https://api.polynode.dev`; event WS `wss://polynode.dev/ws` (API overview page) or `wss://ws.polynode.dev/ws?key=` (intro/auth pages); orderbook WS `wss://polynode.dev/orderbook/ws` or `wss://ob.polynode.dev/ws?key=`. The docs are inconsistent between the two hostnames. (H, https://docs.polynode.dev/api-reference/overview.md, /introduction.md)
- Key endpoints (H, from llms.txt index and pages read):
  - Markets: `GET /v3/markets/search?q=&limit<=300`, by-condition, by-slug, `/v1/markets`, market catalog, candles, token price, resolutions.
  - Books: `GET /v1/orderbook/{token_id|condition_id|slug}` (Polymarket CLOB `/book` compatible plus `metadata`), midpoint, spread; WS orderbook snapshots/deltas for all active markets.
  - Trades/positions: `/v3` trades by wallet/market/builder, positions, wallet P&L, leaderboards, fees, rewards/rebates; WS `settlements` (pending ~2-5 s before Polygon confirmation), `trades`, `oracle` (UMA events), `price_feed`, `block`.
  - Resolution: `data/markets/resolutions`, `data/global/resolutions`, WS Oracle event (UMA init/propose/dispute/resolve).
  - Webhooks, Polygon JSON-RPC proxy (`rpc/`), Chainlink/crypto feeds, sports markets endpoint.
- Auth: `x-api-key`, `Authorization: Bearer`, or `?key=`. `POST /v1/keys` mints a free key (1 per IP per day). Not done here (no account/key creation allowed). (H, https://docs.polynode.dev/authentication.md)
- Rate limits (H, https://docs.polynode.dev/guides/rate-limits.md): Free: no V3 REST data (402), 1 WS connection, 1 h/day WS session, 100k req/month; Starter $50/mo: 1,000 req/min, 10 WS; Growth $200/mo: 2,000 req/min, 50 WS; Enterprise $750/mo: 4,000 req/min, unlimited WS. Monthly usage enforcement "not active yet".
- Unauthenticated GETs: only `/healthz` and `/readyz` work. `/v1/markets` and `/v3/perps/tickers` return 401 JSON `{"error": ...}`. No real data response shapes could be confirmed first-hand without a key. Doc example shapes (not live fetches) saved as fixture. (H)

## Trade path (H)
- Not a venue, but its SDK (`polynode-sdk` TS 0.15.0, `polynode` Python 0.15.x, Rust 0.18.0) wraps Polymarket CLOB trading: `ensureReady(privateKey)`, `order({tokenId, side, price, size, type, postOnly})`, cancel, split/merge/redeem. Orders are signed by the user's wallet (EIP-712; deposit wallets use ERC-7739 wrapped signatures, sig type 3; Safe is type 2) and posted to Polymarket CLOB; PolyNode runs a "cosigner"/relayer service at `trade.polynode.dev`. Optional `user_owned` mode gives zero builder attribution. (H, https://docs.polynode.dev/sdks/trading.md, /sdks/user-owned-execution.md)
- Anything an adapter needs for Polymarket order signing is in the Polymarket spec, not here.

## PayBox reachability
- paybox_reachable: partial. As a data source it is an HTTP API with an API key, so no wallet is needed for reads (the key is a secret; PayBox `request_secret`-style handling would apply). Trading is Polymarket-on-Polygon with EIP-712 signed orders, which belongs to the Polymarket adapter; PayBox signed-order support on Polygon is not assessed here. (M)

## Fees (H)
- Data subscription: $0 / $50 / $200 / $750 per month (above).
- Trading via SDK: Polymarket protocol fee (taker, set by Polymarket) and Polymarket builder rev share are separate. Optional PolyNode platform fee `feeBps` for integrators, escrowed on chain (FeeEscrow), refunded on cancel, self-refund after 72 h; `feeBps: 0` disables it. NOT FOUND (searched: fee-escrow.md, trading.md): a default PolyNode fee on end users. (H, https://docs.polynode.dev/guides/fee-escrow.md)

## Resolution mechanism
- Inherited from Polymarket: UMA Optimistic Oracle, with dispute events exposed on the Oracle WS event; Protocol V2 reports payouts as `payouts_ppm`. PolyNode adds no resolution layer, so dispute risk equals Polymarket's. (H, event list in llms.txt; M for risk characterization)

## Geo / ToS / automation
- NOT FOUND (searched: polynode.dev/terms and /pricing return the SPA shell (2.4 KB), docs llms.txt, best-practices, authentication). Programmatic access is the product. Polymarket's own geo restrictions apply to trading. (M)

## Liquidity
- None of its own. NOT FOUND (searched: homepage, docs, llms.txt) for any PolyNode volume/TVL. All liquidity is Polymarket's (see the Polymarket spec). The `/v3/markets/search` rows carry `volume_all_time` for Polymarket markets. (H)

## Event coverage / overlap
- Everything Polymarket lists (politics, sports, crypto price, macro, culture). Overlaps other venues only because Polymarket does. PolyNode adds no new events. Crypto price feeds (BTC, ETH, SOL, BNB, XRP, DOGE, HYPE; Chainlink-sourced, M) and a sports markets endpoint are documented.

## Liquidity shared with
- Polymarket (100%). Not an independent arbitrage leg.

## Why it might still matter
- Pre-chain settlement stream (2-5 s ahead of Polygon confirmation) and full-market orderbook WS in one connection may give lower-latency Polymarket state for lead-lag and arb detection than polling Polymarket's CLOB. Paid ($50+/mo) and a third-party dependency. Vendor claims, latency claims are unverified by me (L/M).

## Suspicious content
- None found. Docs include a contact email for Enterprise (third party) and normal marketing copy. No instructions aimed at AI agents beyond the standard Mintlify "fetch llms.txt" banner.

## Sources
- https://polynode.dev/ (H, SPA; metadata only)
- https://docs.polynode.dev/llms.txt (H)
- https://docs.polynode.dev/introduction.md, /authentication.md, /api-reference/overview.md, /guides/rate-limits.md (H)
- https://docs.polynode.dev/api-reference/orderbook/order-book.md, /data/markets/search.md (H)
- https://docs.polynode.dev/sdks/trading.md, /sdks/user-owned-execution.md, /guides/fee-escrow.md, /guides/deposit-wallets.md, /guides/polymarket-protocol-v2.md (H)
- https://docs.polynode.dev/perps/overview.md, /changelog.md, /changelog-august-10-16-2026.md (H)
- https://api.polynode.dev/healthz, /readyz, /v1/markets (401), /v3/perps/tickers (401) fetched 2026-10-19 (H)
- WebSearch was unavailable (session budget exhausted); no independent third-party corroboration obtained. Discovery hint from predictionindex.xyz is consistent (M).

## Fixtures
- docs/research/fixtures/polynode/readyz.json, v1-markets-unauth-401.json, v3-perps-tickers-unauth-401.json, docs-example-orderbook-by-token.md (docs example, not a live response)
