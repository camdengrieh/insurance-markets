# Propheseer (propheseer.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Propheseer is NOT a venue. It is a read-only, paid-key data aggregator (REST + WebSocket) that normalizes Polymarket, Kalshi and Gemini markets and offers a cross-venue "arbitrage" endpoint. There is no trading, no order book, no liquidity of its own. For our project it is at most a convenience/signal feed that duplicates what we can pull directly from the underlying venues (and Polymarket/Kalshi are already covered by other adapters). Priority: P2 (signal-only). Strictly speaking "skip" is defensible; P2 chosen because the arbitrage feed is a cheap cross-check of our own scanner.

## Liveness

- API host up: GET https://api.propheseer.com/health returned 200 on 2026-10-19 with uptime 5,496,530 s (~63.6 days), database connected, `clobFeed.connected: true`, but only `activeMarkets: 1`, `cachedPrices: 1`, websocket connections 0. [H] fixture: fixtures/propheseer/health.json. The tiny CLOB-feed numbers suggest low usage / thin real-time coverage [M].
- Docs page carries "Copyright 2026" and an arbitrage example with `fetched_at 2026-03-08`; "API Status: Online" [H] https://propheseer.com/docs
- npm `propheseer` created 2026-02-24, only versions 0.1.0 and 1.0.0 (both 2026-02-24), nothing since [H] https://registry.npmjs.org/propheseer . SDK GitHub repo JeremyHi/propheseer-typescript-sdk: last push 2026-02-24, 0 stars, not archived [H] `gh api repos/JeremyHi/propheseer-typescript-sdk`. A small one-person project; no SDK release in ~8 months [M].
- No independent coverage found; web search returned only Propheseer's own pages plus competitors (pmxt, Predictefy, Prediction Hunt, etc.) [M].

## Kind / market model

- Kind: aggregator / data API (not a venue). [H]
- Normalized model: market has `outcomes[] {name, probability, volume24h|null}`, `status` open|closed|settled, `category` politics|sports|finance|entertainment|science|other, `resolutionDate`, `tags`, `url`, `source` in polymarket|kalshi|gemini, `sourceId` (original venue id). IDs prefixed `pm_`, `ks_`, `gm_`. [H] SDK src/types/markets.ts https://github.com/JeremyHi/propheseer-typescript-sdk
- Only a single probability per outcome; NO bid/ask, NO depth, NO order book. Orderbook, trades feed, and resolution endpoint are NOT FOUND in docs (searched: docs page full text, SDK resources dir). [H]
- Binary vs categorical: outcomes list can hold named outcomes; scalar not modelled. [M]

## Chains and collateral

None of its own. Underlying: Polymarket (Polygon USDC), Kalshi (USD, CFTC), Gemini (USD, Gemini exchange). Not described by Propheseer. [M]

## Read API

- Docs: https://propheseer.com/docs [H]. Base URL `https://api.propheseer.com/v1`. WebSocket `wss://api.propheseer.com/ws?api_key=KEY`. [H]
- Auth: `X-Api-Key` header (docs error table says "Authorization header", inconsistent; live server message says "Include header: X-Api-Key"). Keys self-serve via `POST /v1/keys` (free tier). Not performed (no key creation). [H]
- Unauthenticated probe: `/v1/markets`, `/v1/categories`, `/v1/arbitrage` all return 401 `{"error":"Missing API key. Include header: X-Api-Key: YOUR_API_KEY","code":"UNAUTHORIZED"}`. [H]
- Public, no key: `GET /health` (fixtures/propheseer/health.json) and `GET /v1/public/ticker?limit=N` (max 20) (fixtures/propheseer/public-ticker.json). Ticker sample showed `probability: 0.5` for every one of 5 items across all three sources, including a Fed-funds-2036 market and sports O/Us, which looks like default/placeholder or illiquid data; do not trust prices from it [H observed, M interpretation]. `/v1/public/ticker` is in the SDK but not in the docs page [H].
- Key endpoints (docs [H]):
  - GET /v1/markets (source, category, status, q, limit<=200, offset)
  - GET /v1/markets/:id (adds description, resolutionDate, per-outcome volume24h)
  - GET /v1/categories
  - GET /v1/arbitrage (min_spread default 0.03, category) - SDK comment says Pro plan or higher [H]; pricing page lists arbitrage detection under Pro/Business only
  - GET /v1/unusual-trades (Polymarket only, Pro+; returns wallet address, size, price, tx hash, anomaly score)
  - POST /v1/keys, GET /v1/keys/me
  - GET /v1/markets/history, /v1/markets/history/dates (SDK only; Business plan; daily snapshots, not tick data) [H]
- WebSocket: messages subscribe/unsubscribe/list_subscriptions/ping; server `market_update`, `market_resolved`, `unusual_trade`, `arbitrage_update` (every 60 s), channels `unusual_trades`, `arbitrage`. Pro+ only. Free 1 conn / 5 markets / 10 MB per month; Pro 5 / 50 / 500 MB; Business 25 / unlimited / 10 GB. [H]
- Rate limits: Free 100/day, 10/min; Pro 10,000/day, 100/min; Business 100,000/day, 1,000/min; headers `X-RateLimit-Remaining-Day`, `X-RateLimit-Remaining-Minute`. [H]
- Price discrepancy: docs say Pro $29/mo, Business $99/mo; pricing page says Pro $19.99/mo, Business "custom". [H both, conflicting]
- Freshness/latency: no refresh interval published ("Real-time Updates" only; arbitrage pushed every 60 s). Arbitrage response includes `fetched_at` and `cached`. [H]
- Arbitrage response shape (docs example, not live-verified since it needs a paid key): `{question, spread, potentialReturn:"5.3%", markets:[{source, yesPrice, url}]}`. No depth, fees or resolution-criteria comparison, so it is a naive same-question price spread; matching method undocumented. [H shape, M on quality]

## Trade path

None. Read-only data and analytics; no order placement or execution endpoints documented; pricing page mentions no execution. [H] Execution has to go to the underlying venues directly.

## PayBox reachability

Not applicable as a venue (nothing to trade). Paying for the API is a card/subscription via dashboard, no x402 or crypto payment found in docs (NOT FOUND, searched: docs, pricing). paybox_reachable = no.

## Fees

No trading fees (no trading). API subscription: see tiers above. Terms: monthly billing in advance, 14-day money-back, 30 days notice of price change. [H] https://propheseer.com/terms

## Resolution

Not applicable; it mirrors source-venue status. `market_resolved` WS event exists. Cross-venue resolution-criteria differences (the main arbitrage risk) are not surfaced. [H/M]

## Geo / ToS / automation

- Terms: prohibits scraping beyond plan limits, circumventing rate limits, and reselling or redistributing the API as your own service; temporary throttling then suspension for abuse; liability capped to 12 months of fees; "not responsible for trading decisions"; data is from third parties with no accuracy or real-time guarantee. No geo restrictions stated; min age 13. [H] https://propheseer.com/terms (summarised via WebFetch, not verbatim).
- Using it for automated polling within plan limits is allowed. Embedding its data in a product we redistribute would need care.

## Liquidity and event coverage

- No volume/OI/TVL published by Propheseer. Only per-outcome `volume24h` (nullable) in market detail. Total market count unknown (docs example shows meta.total 1234 only as a sample). NOT FOUND (searched: docs, pricing, terms).
- Categories: politics, sports, finance (crypto, stocks, fed), entertainment, science, other. Overlaps with other venues where Polymarket/Kalshi/Gemini overlap: US politics, Fed/macro, crypto price, sports.
- Liquidity is 100% shared with Polymarket, Kalshi and Gemini. It is NOT an independent arbitrage leg. Gemini is the only venue here not otherwise in our target list; it may be worth its own venue spec (separate task) since Propheseer shows it exists as `gm_` markets (e.g. `gm_NCAAF-...`).

## Fixtures

- docs/research/fixtures/propheseer/health.json (GET /health, 2026-10-19)
- docs/research/fixtures/propheseer/public-ticker.json (GET /v1/public/ticker?limit=5, 2026-10-19)
- Authenticated shapes (markets, arbitrage) not captured: key creation prohibited by ground rules.

## Suspicious content

None found. Docs contain nothing aimed at AI agents. The npm registry JSON includes a maintainer email address (third-party data; not reproduced here).

## Open questions

- How are cross-venue markets matched for `/v1/arbitrage`? Does spread account for fees or depth? (undocumented)
- Is Gemini prediction-markets API open to us (separate venue spec)?
- Whether live /v1/markets prices are real; ticker showed all-0.5 placeholders.

## Sources

- https://propheseer.com/docs [H] (fetched 2026-10-19)
- https://propheseer.com/pricing [H]
- https://propheseer.com/terms [H]
- https://api.propheseer.com/health , /v1/public/ticker , /v1/markets (401) [H]
- https://registry.npmjs.org/propheseer [H]
- https://github.com/JeremyHi/propheseer-typescript-sdk (src/types/*.ts, src/resources/*.ts) [H]
- Web search (extended) for independent coverage: only self-published pages and competitors [M]
