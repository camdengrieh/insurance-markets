# Market Motion (marketmotion.xyz / motiontrade.xyz)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Kind: aggregator-or-data (entity-graph intelligence layer plus a trading front-end). NOT a market venue. [H]
- adapter_priority: **P2** (signal-only). It has no markets, orderbook or resolution of its own. It re-presents Polymarket, Kalshi and Hyperliquid, which are covered elsewhere. Its value is entity-to-market links and its own alert feed.
- Reliability concern: on 2026-10-19 most data endpoints returned HTTP 500 and the cross-venue and mispricing endpoints returned nothing usable (see Live probes). [H]

## Is it live (2026)?

- Site marketmotion.xyz returns 200, Vercel-served, last-modified 2026-10-19 03:29 UTC. It is a React SPA (Privy auth, wallet UI). [H] https://marketmotion.xyz/
- Meta description: "The intelligence layer for prediction markets". [H]
- app.marketmotion.xyz returns 200. [H]
- Docs host motiontrade.mintlify.app returns 200. motiontrade.xyz redirects (307) to www.motiontrade.xyz, so the product also trades as "Motion Trade". [H]
- The backend is degraded (see Live probes). The front-end is deployed and being updated, but the API data layer was not healthy at test time. [H]

## Kind and market model

- Does not issue markets. No tokenisation of its own. Outcome objects (`outcomeId`, `tokenId`) are pass-throughs of Polymarket/Kalshi identifiers or its own canonical "outcome" nodes that group the same real-world question across venues. [M, from llms.txt response shapes]
- Venues covered per llms.txt: Polymarket, Kalshi, Hyperliquid (Hyperliquid = perps/spot/stocks, not prediction markets; `/markets/search` venue filter lists `all|polymarket|hyperliquid`, `/markets/predictions` lists `polymarket|kalshi|all`). [H] https://marketmotion.xyz/llms.txt (fixture: llms.txt)
- Own data model: entities (person, team, org, place, league, asset), about 17,000+ entities and 18,400+ relationship edges (vendor claim, not verified because the stats endpoint was down). [M]
- Alert types: injury, crowding_spike, crowding_rotation, weather, copy_trade, arbitrage, rumor, political_change, finance_change. [H]

## Chains and collateral

- Market Motion holds none itself. The front-end bundle shows Privy embedded wallets (Privy RPC endpoints for Ethereum, Base, Arbitrum, BSC, Berachain, etc. are just Privy's generic chain list, not evidence of trading on those chains). [H, bundle inspection] https://marketmotion.xyz/assets/index-D2C6Ukks.js
- The bundle calls `/api/polymarket/*` (session, order, orders, positions, redeem, bridge/quote|deposit|withdraw) and `/api/wallet/{deposit,withdraw,withdrawable}`, and shows balance fields `polymarket.usdc|safeBalance|eoaBalance` and `hyperliquid.usd`. So collateral is Polymarket collateral (Polygon USDC family) plus Hyperliquid USD. [M, bundle inspection, not documented]
- Kalshi: no trade routes seen in the bundle (no kalshi.com or elections API hosts, no `/api/kalshi/*`). Kalshi is data-only. [M]

## Read API

- exists: official-public (unauthenticated tier) with optional API key. [H]
- Base URL: `https://api.marketmotion.xyz/api` [H]
- Docs: https://motiontrade.mintlify.app/api/introduction (the page rendered but gave little detail via fetch) and machine-readable https://marketmotion.xyz/llms.txt (full endpoint list; saved as fixture). [H]
- Auth: `X-API-Key: mt_live_...`. Optional on public endpoints, required for `/api/b2b/*`. Keys come from the developer portal (account sign-up required; not done here). [H]
- Rate limits: 30/min with no key, 300/min developer, 1,000/min pro, enterprise custom (llms.txt). `/api/developer/info` says unauthenticated 30/min, test 100/min, live 300/min, enterprise custom, so the docs are not consistent with each other. Rate-limit headers are documented (`X-RateLimit-*`); none were returned on the responses I saw. [H]
- Tiers: Free; Developer $49/mo; Pro $199/mo; Enterprise custom. `/api/billing/status` reported `monetizationEnabled: true` on 2026-10-19. Per llms.txt, B2B endpoints need Developer or higher and webhooks and gap analysis need Pro. [H]
- Response envelope: `{success:true,data:...}` or `{success:false,error}`, but several documented endpoints use bare top-level keys (e.g. `mispricings`, `items`, `markets`), so shapes are inconsistent. [H]
- Websocket: none documented. Real-time is `GET /api/alerts/stream` (Server-Sent Events) and HMAC-SHA256-signed webhooks (Pro). [H]
- SDKs: `@motiontrade/sdk` and `motiontrade-sdk` listed as "planned". [H] (fixture developer-info.json)

Key endpoints (all GET unless noted):

| Purpose | Endpoint |
|---|---|
| Cross-venue arbitrage (primary) | `/graph/mispricings?minSpread=0.05&category=&limit=&actionableOnly=` ; `/graph/mispricings/top` ; `/graph/mispricings/check/:outcomeId` ; `/graph/mispricings/stats` |
| Matched markets | `/markets/cross-venue?limit<=50` ; `/markets/entity-connected?minSpread=` ; `POST /markets/cross-venue/match` (state-changing, not called) |
| Per-outcome prices | `/graph/outcome/:id/prices`, `/graph/cross-venue/:outcomeId`, `/graph/outcome/:id/history?hours=` |
| Prediction market browse | `/markets/predictions?venue=polymarket|kalshi|all&sort=volume|liquidity|...&limit&offset` returns `{id,venue,question,category,volume,liquidity,yesPrice,noPrice,outcomes[{name,price,tokenId}],endDate}` |
| Search | `/markets/search?q=&venue=` |
| Market detail | `/markets/:venue/:marketId` |
| Entities and graph | `/entities`, `/entities/:slug/full`, `/entities/by-market/:marketId`, `/graph/entity/:id/neighborhood|markets|events|timeline` |
| Alerts | `/alerts/recent` (public), `/alerts/stream` (SSE), `/alerts/inbox` (auth), `/alerts/outcomes/stats` |
| B2B (key) | `/b2b/suggestions`, `/b2b/suggestions/trending`, `/b2b/people`, `/b2b/people/:slug/markets`, `/b2b/gaps` (Pro), `/b2b/webhooks` |
| Meta | `/developer/info`, `/developer/endpoints`, `/billing/status` |

Not provided: order books or depth, individual trades, or resolution status. Only price, volume, liquidity and endDate per market are documented. NOT FOUND (searched: llms.txt, developer/endpoints listing, bundle route strings).

## Live probes (unauthenticated GET, 2026-10-19, UA `insurance-markets-research/0.1`)

Fixtures in docs/research/fixtures/market-motion/.

- `/developer/info` 200: valid JSON (fixture developer-info.json). [H]
- `/developer/endpoints` 200: lists 6 market, 5 entity, 5 graph, 3 taxonomy, 6 b2b endpoints (fixture developer-endpoints.json). [H]
- `/billing/status` 200: `{"success":true,"data":{"monetizationEnabled":true,"tier":"free",...}}`. [H]
- `/graph/mispricings?minSpread=0.03&limit=5` 200 but empty: `{"success":true,"mispricings":[],"count":0,"summary":{"totalFound":0,...}}`. No arbitrage rows to sample. [H]
- `/markets/cross-venue`, `/markets/predictions`, `/markets/search`, `/markets/curated`, `/entities`, `/alerts/recent`, `/taxonomy/stats`: **HTTP 500** ("Failed to fetch ..."). [H]
- `/graph/stats` and `/graph/mispricings/stats`: HTTP 500 with a Prisma error saying the Postgres (Supabase) database server is unreachable. The raw error leaked the DB host name (redacted in the fixture). [H]
- Conclusion: the data store behind the API was down at test time. I could NOT confirm any real market, entity or spread response shape. The shapes above come from vendor docs only (tag M). Re-probe before building.

## Trade path

- Programmatic order placement through an official API: **none documented**. `/api/developer/info` lists a `trade` permission described as "Execute trades (requires KYC)", but no order endpoint appears in llms.txt or in `/developer/endpoints`. [H for the permission text; NOT FOUND for any documented order API]
- The web app does place orders via a backend (`POST /api/polymarket/order`, `/api/orders`, `/api/markets/order`, session init/refresh). These are authenticated by the user's Privy session and use Privy-managed (embedded/server) wallets and Polymarket sessions. Not documented, not for third parties. [M, bundle inspection only; no request was made]
- Implication: do not route orders via Market Motion. If an agent trades the underlying legs it should use the Polymarket or Kalshi adapters directly. PayBox EVM wallet reachability: Market Motion has no contracts or signed-order scheme to target. paybox_reachable = no (as a trading venue). The underlying Polymarket leg is reachable by other means (covered in the Polymarket workflow). Not applicable here.

## Fees

- Subscription: $49/mo and $199/mo API tiers (see above). [H]
- Trading fee or builder fee on routed orders: NOT FOUND (searched: llms.txt, bundle strings for "builder"/fee fields, /pricing is SPA-rendered and unreadable without JS). Underlying venue fees apply.

## Resolution and dispute

- None of its own. Resolution is whatever Polymarket (UMA), Kalshi or Hyperliquid does. Cross-venue "same market" matching by Market Motion (a similarity-based `POST /markets/cross-venue/match` with `matchType`) is a heuristic. The two venues can have different resolution rules, sources and cutoffs, so a flagged "arbitrage" can be a false pair. [M, inferred from the described matcher]

## Geo, ToS, automation

- Terms page https://marketmotion.xyz/terms returns the SPA shell only, so the text is NOT readable without JS. NOT FOUND (searched: /terms, bundle strings "Terms of Service", "jurisdiction"). [H for the SPA behaviour]
- API access without a key is explicitly permitted at 30 req/min (llms.txt). Automation of the read API is by design; the `trade` permission requires KYC. [H]
- Geo: NOT FOUND. Underlying venue geo restrictions will apply to any routed trading.
- Third-party content check: llms.txt contains endpoint documentation only; no instructions aimed at agents were found beyond "AI workflows" examples, which I did not follow.

## Liquidity

- No liquidity of its own. Aggregate volume or TVL for Market Motion: NOT FOUND (searched: site, llms.txt; stats endpoints were down). User-count or trading-volume figures: none published. Vendor claims of "17,000+ entities / 18,400+ edges" are unverified. [L]

## Event categories and overlap

- Categories: politics (incl. 104 international subcategories), sports (NFL, NBA, MLB, NHL, NCAA, soccer), finance/macro (fed, earnings), crypto, culture, science, technology. [H, llms.txt]
- Overlap with other venues is total, because every market is a Polymarket or Kalshi market. Its arbitrage logic targets Polymarket vs Kalshi, which this project can compute itself from the two venue adapters.

## Liquidity shared with

- Polymarket (order routing via the app's `/api/polymarket/*`), Kalshi (data only), Hyperliquid (perps/spot, separate book but not a prediction-market leg). **Not an independent arbitrage leg.** [M]

## Why P2

- Useful only as an optional signal source: entity-to-market links (`/entities/by-market/:marketId`), alerts (injury, political change, arbitrage) via SSE or webhooks, and its mispricing feed as a cross-check. Free tier is 30 req/min.
- Reasons not higher: no independent liquidity, no documented trade API, backend unstable on the test date, undocumented/inconsistent response envelopes, paid tier needed for B2B/webhooks, and the arbitrage detector duplicates what the venue adapters give directly.
- If used: poll `/graph/mispricings` and `/alerts/recent` at low rate, treat as untrusted hints, and verify with the venue adapters before acting.

## Open questions

- Real response shapes for markets/cross-venue/mispricings (API was down). Re-probe later.
- Terms of service text and any geo restrictions (SPA, not fetched).
- Trading fee/builder-fee on routed Polymarket orders, and whether a third-party order API exists behind the `trade` permission.
- Whether the Hyperliquid and "Motion Trade" branding are the same company/product as marketmotion.xyz (two domains, same docs; M).
- Which GitHub org, if any: the bundle links `github.com/marketmotion/feedback/issues`, but `gh api repos/marketmotion/feedback` returned 404. L.

## Sources

- https://marketmotion.xyz/ (HTML head, manifest) [H]
- https://marketmotion.xyz/llms.txt (fixture llms.txt, 28 KB) [H]
- https://marketmotion.xyz/assets/index-D2C6Ukks.js (front-end bundle, read as text, not executed) [H for what strings exist; M for what they imply]
- https://api.marketmotion.xyz/api/developer/info, /developer/endpoints, /billing/status, /graph/mispricings (200); /markets/cross-venue, /markets/predictions, /graph/stats and others (500) [H]
- https://motiontrade.mintlify.app/api/introduction and /llms.txt [H]
- https://predictionindex.xyz/ecosystem (discovery lead only; not re-read) [L]
- WebSearch was unavailable (session budget exhausted), so no third-party coverage, funding, or user-count info was gathered.
