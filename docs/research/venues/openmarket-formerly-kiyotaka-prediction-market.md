# OpenMarket (formerly Kiyotaka) - Polymarket front-end / data vendor

Researched 2026-10-19. Read-only. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Not a venue. It is a charting/analytics product (crypto, stocks, futures, options, FX, macro, "prediction markets") that shows Polymarket data and, historically, ran a Polymarket "builder" front-end. No own order book, no own contracts, no own settlement. (H)
- Liquidity is 100% Polymarket's. It is NOT an independent arbitrage leg. (H: terms and docs name only Polymarket; H: DefiLlama methodology "Builder fees received by Kiyotaka from trades on Polymarket v2")
- Adapter priority: skip as a trading/arbitrage venue. At most a P2 paid signal/analytics source (Polymarket wallet leaderboards/PnL), which duplicates what can be derived from Polymarket's own public data.

## Still live?

- Site is live 2026-10-19: https://openmarket.xyz returns 200; title "OpenMarket: the new interface to the world's markets". (H)
- Rebrand: docs release notes v1.0.1 (July 2026) moved API hosts from kiyotaka.ai to openmarket.xyz; legacy api.kiyotaka.ai remains supported, no shutdown date. (H)
- The prediction-market BUYING flow looks dormant: DefiLlama (api.llama.fi, fetched 2026-10-19) shows builder fees total 2,521 USD all time, 0 in the last 7/30 days, daily series running to 2026-10-18 with zeros at the end; "dexs" volume series totals about 3.64M USD all time (builder-routed volume, double-counted flag true) with the last non-zero data point 2026-07-06. (H for the numbers; M for the "dormant" inference.) DefiLlama page itself returned 403 to WebFetch; the JSON API worked.

## Kind and market model

- kind: broker-or-frontend / data vendor. (H)
- Market model: whatever Polymarket has: binary and NegRisk multi-outcome, CLOB, conditional-token (CTF) outcome tokens on Polygon. The analytics docs reference conditionId, NegRisk conversions, merges and splits. (H: https://openmarket.xyz/docs/rest/polymarket-analytics)
- Chains and collateral: Polygon (DefiLlama chain), collateral as Polymarket's (pUSD/USDC). OpenMarket itself holds no funds. (H for Polygon via DefiLlama; M for collateral name, not checked here)

## Read API (official, authenticated, paid tiers)

- Docs: https://openmarket.xyz/docs (quickstart, authentication, rate-limits, rest/*, ws/*; machine index at /docs/llms.txt exists, not read). (H)
- Base URL: https://api.openmarket.xyz (legacy https://api.kiyotaka.ai). WebSocket: wss://ap-sin3.ws.api.openmarket.xyz/ws (book) and /nonbook/ws, plus eu-de3 region; add ?encoding=json. (H)
- Auth: header `X-OpenMarket-Key: <key>` on every REST request. Unauthenticated test: `GET /v1/markets?exchange=POLYMARKET&pageSize=2` returned HTTP 401 "missing or invalid api key". So no free anonymous access and no response fixture could be captured. (H)
- Key endpoints:
  - `GET /v1/markets` discovery, weight 0, filters exchange=POLYMARKET, symbolFilter, pageSize/pageOffset. (H)
  - `GET /v1/points` unified time-series (candles TRADE_SIDE_AGNOSTIC_AGG, BLOCK_BOOK_SNAPSHOT_AGG for book depth); docs page lists Polymarket among exchange IDs under "Prediction Markets". (H)
  - `GET /v1/polymarket/analytics/{leaderboard,trader-profile,positions,market-summary,user-categories,platform-summary,platform-distribution}` fixed weights 40-100; wallet PnL, positions by conditionId. Not on WebSocket. (H)
  - `GET /v1/usage` quota check. (H, referenced)
- Rate limits: weight/minute Free 10, Basic 150, Standard 350, Advanced 1,500; Free also 1,000 weight/day; history depth 7d/30d/90d/1y. Rate-limits page lists plans at 99/199/599 USD per month; the /api page lists annual 990/1,990/5,990 USD. Polymarket analytics access is described as "Standard and Advanced" on one page and "Pro-tier only" on another (docs inconsistent). (H)
- Resolution data: not documented as a feature; positions/PnL include resolution_pnl. Nothing about resolution status endpoints. NOT FOUND (searched: polymarket-analytics, metadata, exchanges docs pages).
- Kalshi: NOT FOUND in the docs I read (exchanges page lists only POLYMARKET under Prediction Markets). The homepage says "Live odds on rates, elections and world events". (H)

## Trade path

- None via OpenMarket for prediction markets. Terms: "We are a software provider" (not exchange/broker/custodian); orders go from the user's device directly to Hyperliquid or a brokerage; Polymarket is "listed only as a source of prediction market data". (H: https://openmarket.xyz/terms, read via WebFetch summary)
- PayBox: no OpenMarket order path to use. An EVM wallet could trade the underlying market only through Polymarket directly (covered by the parallel Polymarket spec). paybox_reachable = no (for this venue as a leg). (M)

## Fees

- OpenMarket earns Polymarket "builder fees" on routed trades (DefiLlama methodology). Rate not found. NOT FOUND (searched: terms, docs pages fetched, DefiLlama JSON). (H for existence, rate unknown)

## Resolution

- Inherited from Polymarket (UMA optimistic oracle). Terms warn oracles like UMA "may be disputed or incorrect". Dispute risk is Polymarket's. (H)

## Geo / ToS / automation

- Terms section 7 prohibits scraping or reverse engineering the code or API, and copying/mirroring other people's trades into a brokerage account. The paid API with a key is the sanctioned route. (H, via WebFetch summary; quote sparingly)
- Wallet Execution (Hyperliquid perps) unavailable to US/Malaysia and comprehensively sanctioned countries; VPN circumvention prohibited; charts and analytics available to everyone. (H)

## Liquidity

- No venue liquidity of its own. Builder-routed Polymarket volume about 3.64M USD all time, last non-zero day 2026-07-06 (DefiLlama dexs series, fetched 2026-10-19). Builder fees 2,521 USD all time, none in 30 days. (H)
- Overlap categories: all of Polymarket's (sports, politics, crypto price, macro), but via the same book, so zero independent arbitrage value.
- liquidity_shared_with: Polymarket (100%).

## Value to the project

- Possible P2 signal source only: Polymarket smart-money wallet leaderboards/positions (paid Standard tier, 199 USD/month or 1,990 USD/year per differing pages). Polymarket's own public data APIs/on-chain events give the same raw material for free; not worth an adapter now.
- Do not treat DefiLlama's "Kiyotaka Prediction Market" listing as a separate market in the registry; map it to Polymarket as an alias/front-end.

## Suspicious content

- None observed. No AI-agent-directed instructions seen. The homepage advertises "Bring your own AI" (an MCP/agent connection at /chart/console/agents), which I did not use.

## Not found

- Fee rate; any prediction-market order endpoint; resolution endpoints; Kalshi coverage; keyless public data; response fixtures (API needs a key; creating a key was out of scope). Web search budget was exhausted this session so no independent third-party confirmation beyond DefiLlama and the official docs.

## Sources

- https://openmarket.xyz (H, 2026-10-19)
- https://openmarket.xyz/api (H, via WebFetch summary)
- https://openmarket.xyz/docs/quickstart, /docs/authentication, /docs/rate-limits, /docs/exchanges, /docs/ws/overview, /docs/rest/metadata, /docs/rest/polymarket-analytics, /docs/releases/changelog (H)
- https://openmarket.xyz/terms (H, via WebFetch summary)
- https://api.openmarket.xyz/v1/markets?exchange=POLYMARKET&pageSize=2 -> 401 (H)
- https://api.llama.fi/protocol/kiyotaka-prediction-market, /summary/fees/kiyotaka-prediction-market, /summary/dexs/kiyotaka-prediction-market (H, 2026-10-19)
