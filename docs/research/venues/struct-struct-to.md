# Struct (struct.to) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip.** Struct is not a venue. It is a third-party onchain data/indexing vendor whose only prediction-market product was a Polymarket data API, and Struct announced that product is shut down on 2026-09-30. It has no markets, no liquidity, no order placement and no resolution of its own. Polymarket itself is covered by another workflow, and the official Polymarket APIs (Gamma, CLOB, Data, RTDS) are what Struct's own migration guide tells users to use instead (H).

## 1. Is it live (2026)?

- Company/site: live. struct.to returns a current marketing page, and `https://api.struct.to/health` returned `{"status":"healthy"}` on 2026-10-19 (H, https://api.struct.to/health).
- Polymarket data product: announced shut down. Blog post dated 2026-09-17: "Struct is sunsetting all Polymarket APIs on September 30, 2026." Timeline: recurring billing ends 09-17; migration window 09-17 to 09-30; on 2026-09-30 23:59 UTC all Polymarket REST, WebSocket and webhook services shut down "returning HTTP 410 Gone"; prorated refunds from 2026-10-01. Reason given: "focusing full engineering capacity on general-purpose, high-throughput onchain indexing" (H, https://www.struct.to/blog/sunsetting-polymarket).
- Observed state after the shutdown date (2026-10-19, unauthenticated GET, generic UA): `GET /v1/polymarket/market?limit=1...` and `GET /v1/polymarket/events?limit=1` both returned HTTP 500 `{"success":false,"message":"Unknown error occurred please try again",...}`, not the 410 the notice promised. Whether that is a half-decommissioned backend or an unauthenticated-access quirk is NOT determined (H for the responses, see fixture; cause unknown). Either way the product is not dependable.
- The docs site (docs.struct.to) and its changelog carry no sunset notice; newest changelog entry is v0.6.5 on 2026-07-29 (H, https://docs.struct.to/changelog/backend.md). So the docs are stale relative to the blog; do not read docs presence as "still supported".

## 2. Kind and market model

- Kind: aggregator-or-data vendor (onchain indexing/API provider). Not a prediction-market venue, not an exchange (H, https://www.struct.to/ ; ToS does not describe it as an exchange or trading venue, https://www.struct.to/legal/terms-of-service).
- Market model: none of its own. It re-served Polymarket's model: binary/categorical markets keyed by `condition_id`, outcomes with `position_id` (CTF token ids), `is_neg_risk`, `uma_resolution_status` (H, https://docs.struct.to/api-reference/market/get-markets.md).
- Everything else on the site (tokens, wallets, prices across Solana/Base/BNB/Ethereum/Robinhood chain; venues listed are DEXs and launchpads: Jupiter, Aerodrome, PancakeSwap, Meteora, Moonshot, Orca, Bonk.fun, Zora, LaunchLab, Virtuals, Boop, Heaven) is token/DEX data, no prediction markets named (H, https://www.struct.to/apps). Indexing for other protocols is "a custom engagement, not self-serve" (H, https://www.struct.to/).

## 3. Chains and collateral

N/A as a venue. Struct indexes Solana, Base, BNB Chain, Ethereum, Robinhood chain (and mentions Ink, Arc, other chains on request) (H, https://www.struct.to/). Underlying Polymarket collateral (USDC on Polygon) is a Polymarket matter, covered elsewhere.

## 4. Read API

- Docs: https://docs.struct.to (Mintlify); machine index https://docs.struct.to/llms.txt (H). Docs describe itself as "The fastest API for Polymarket data." Polymarket only; Kalshi, Limitless, Opinion, Predict.fun, Myriad, Manifold have zero mentions in the 65 KB docs index (H, grep of llms.txt).
- REST base: `https://api.struct.to/v1/` (H, https://docs.struct.to/introduction/authentication.md). WebSocket: `wss://api.struct.to/ws`, alerts `wss://api.struct.to/ws/alerts` (H). Webhook spec: https://api.struct.to/webhookopenapi.json (H, title "Polymarket Webhook API"). The OpenAPI file linked from llms.txt (`docs.struct.to/api-reference/openapi.json`) is a Mintlify "Plant Store" placeholder, so there is no usable machine-readable REST spec (H).
- Key REST endpoints (all Polymarket, all now suspect): `GET /v1/polymarket/market` (filters: condition_ids, market_slugs, event_slugs, search, status, sort_by volume/liquidity, min/max_volume, categories, tags; limit max 100; `pagination_key`), market candlesticks, market metrics, market trades, oracle events (resolutions, disputes, assertions), events list/chart/metrics, position candlesticks, top traders (H, https://docs.struct.to/api-reference/market/get-markets.md and llms.txt). WebSocket rooms include trades, order-book, asset-prices, liquidity, oracle-events, markets-stream (H, llms.txt).
- Documented MarketResponse fields: condition_id, market_slug, question, status, outcomes[{name, price, position_id, outcome_index}], volume_usd, liquidity_usd, uma_resolution_status, is_neg_risk, end_time, clob_rewards, metrics by timeframe (H, same page). No live sample could be captured (see section 1), so the response shape is documentation-only, not wire-verified.
- Auth: `X-API-Key` header with `sk_live_` secret keys, or `pk_jwt_` public keys plus `Authorization: Bearer <user JWT>`; WebSocket uses `api-key`/`token` query params (H, authentication.md). Unauthenticated "public" access exists at 1 request per 15 s (HTTP 429 body: "Public API rate limit exceeded. Limit: 1 request per 15 seconds."; headers `x-ratelimit-limit: 1`, `x-ratelimit-reset: 15`) (H, observed).
- Limits/pricing as documented before shutdown: Free 5 req/s, 120/min, 5,000 credits, 1 WS connection; Hobby $49/mo 25 req/s; Startup $299/mo 125 req/s; Scale $999/mo 300 req/s; Enterprise custom (H, https://docs.struct.to/introduction/pricing.md). No longer purchasable (billing ended 2026-09-17).
- Key creation requires signing up for an account; not done here (read-only rules).

## 5. Trade path

None. Struct is data-only; no order placement, no signing scheme, no transaction proposals (H by absence: docs index lists no order/trade-placement endpoints; migration guide says authenticated CLOB routes "are for trading", meaning Polymarket's own). A PayBox EVM wallet cannot trade anything through Struct. Any trading would go through Polymarket directly (separate spec).

## 6. Fees

No venue fees. Vendor charges were subscription/credit based (see pricing above). Not applicable to arbitrage cost modelling.

## 7. Resolution mechanism and dispute risk

None of its own. For Polymarket data it surfaced UMA oracle lifecycle events (`uma_resolution_status`, oracle-events stream: resolutions, disputes, assertions) (H, llms.txt). Vendor risk is that this feed is gone.

## 8. Geo, ToS, automation

- ToS silent on bots/automation; section 7 forbids interfering with platform integrity, reverse engineering, and "sublicensing, leasing, sale, distribution, or transfer of Struct Products" for a third party's benefit; section 19 blocks IPs from Cuba, North Korea, Iran, Syria, Crimea; section 11 bars OFAC-designated parties (H, https://www.struct.to/legal/terms-of-service). Redistribution restriction means a plugin that proxies Struct data to end users would need a licence.

## 9. Liquidity

N/A. Struct has no TVL/OI/volume. Marketing claims: 10 ms median latency, 99.99% uptime, 1B+ requests/day (L, vendor self-reported, https://www.struct.to/). Its own latency benchmark claimed its confirmed trade feed about 0.5 s ahead of Polymarket RTDS over ~15,000 trades (L, vendor self-reported, https://www.struct.to/blog).

## 10. Event-category overlap and independence

- No events of its own. Everything it served was a mirror of Polymarket (sports, politics, crypto Up/Down, macro), so it can never be an independent arbitrage leg. It "shares liquidity" with Polymarket in the trivial sense that it is a view of it.
- Useful only as a historical idea: it offered precomputed trader PnL, whale alerts and oracle-dispute events for Polymarket. The same signals are derivable from Polymarket's Data API and onchain events directly.

## 11. Integration notes for the aggregator

- Do not build an adapter. If Polymarket enrichment (trader PnL, holders) is wanted later, use Polymarket's Data API and Gamma API (Struct's own migration list: Gamma for metadata/events, CLOB for books, Data API for trades/positions, RTDS `ws-live-data.polymarket.com` for the trade tape, CLOB market WS `ws-subscriptions-clob.polymarket.com/ws/market` for live book/prices) (H, sunsetting blog). These are covered by the parallel Polymarket workflow.
- Struct could be revisited only if it ships a non-Polymarket prediction-market indexer (nothing indicates this; contact page says indexing is custom per customer).

## Open questions

- Why do `/v1/polymarket/*` endpoints return 500 rather than the announced 410 on 2026-10-19? Possibly auth-less public access is broken, or the backend is partly torn down.
- Did Struct hand the Polymarket product to another vendor? Not found on its site or blog.

## NOT FOUND

- Any non-Polymarket prediction-market support (searched: docs.struct.to/llms.txt for kalshi/limitless/opinion/predict.fun/myriad/manifold; struct.to /apps, /rest-api, /blog, /contact).
- A public GitHub org/repo for Struct (struct.to site links none; no search possible, WebSearch budget exhausted this session). Blog mentions an "open-source Telegram bot" built on its SDK; not pursued.
- Any live data sample (only error envelopes), so no wire-verified response shape.
- Independent web/news coverage of the sunset (WebSearch unavailable: session search budget used up). The sunset rests on Struct's own blog only.
- Struct's X account (https://x.com/structbuild) was not read.

## Sources

- https://www.struct.to/ (H, fetched 2026-10-19)
- https://www.struct.to/blog/sunsetting-polymarket (H, dated 2026-09-17)
- https://www.struct.to/blog (H, 13 posts, all Polymarket, 2026-03-15 to 2026-09-17)
- https://www.struct.to/apps , /rest-api , /contact (H)
- https://www.struct.to/legal/terms-of-service (H)
- https://docs.struct.to/llms.txt , /introduction/authentication.md , /introduction/pricing.md , /api-reference/market/get-markets.md , /changelog/backend.md (H)
- https://api.struct.to/health , /v1/polymarket/market , /v1/polymarket/events , /webhookopenapi.json (H, unauthenticated GETs, 2026-10-19; samples in docs/research/fixtures/struct-struct-to/probe-2026-10-19.json)
