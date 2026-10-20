# EDGE by Predigy - venue spec (2026-10-19)

Verdict: **skip**. This is a B2B white-label LMSR prediction-market engine sold to licensed gaming operators (casino/sportsbook/retail), not a public venue. Authenticated API, operator-managed fiat balances, no chain, no public liquidity.

Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness
- API host https://edge-production-7b77.up.railway.app: GET /health returns 200 `{"status":"healthy","service":"EDGE by Predigy API","version":"0.1.0"}` on 2026-10-19 (H).
- Marketing/demo site https://edge-by-predigy.netlify.app returns 200 (H). It is a React SPA; the page source says it is a "flagship demo" with five "sibling demo sites" named aristocrat/evolution/hardrock/lnw/resorts-world, and the bundle contains copy such as "Resorts World Las Vegas x EDGE" and "State Regulated Prediction Markets" (H, HTML/JS comments and strings). These are demo/pitch sites; no evidence any of them is a live partner deployment (M).
- npm @predigy/edge-sdk: created 2026-03-19, 29 versions, latest 9.2.0 modified 2026-10-03 (H, registry.npmjs.org). Actively maintained.
- GitHub repo Predigy-LLC/EDGE (named in npm metadata) returns 404 via gh: private (H).

## Kind and market model
- Binary YES/NO markets only, priced by LMSR (market maker; q_yes/q_no/b_effective exposed). Market types MONEYLINE, OVER_UNDER, PLAYER_PROP, PARLAY; horse-racing module; categories are sports-centred (H, openapi.json schemas MarketResponse/LMSRState).
- "Depth" endpoint is a simulated order book derived from the LMSR curve, not a real book (H).
- Prices always sum to 1.0; board price is last-trade snapshot, fill price needs quote/depth (H).
- Outcomes are not tokenised; positions are rows in the operator's DB keyed by `X-Edge-User-Id` player id (H).
- Operators can anchor prices to sportsbook consensus odds (`/admin/odds-anchor/*`, `/admin/feeds/*`) (H, path list). So prices are derived from other books, not an independent signal.

## Chains and collateral
- None. Amounts are dollar values deducted from an operator-side player balance ("Deducts amount from your balance", amounts in whole cents, max $10M) (H). No wallet, token, contract or chain found. NOT FOUND (searched: openapi.json, npm readme, site bundle).

## Read API
- Official, authenticated. Docs: Swagger UI https://edge-production-7b77.up.railway.app/docs, spec /openapi.json (268 paths, also mirrored under /v1/) (H). The npm readme references `docs/API.md` and an "EDGE API Reference" with rate limits, which sit in the private repo (NOT FOUND publicly).
- Every business endpoint needs header `X-API-Key`; unauthenticated GET /markets returns 401 `{"detail":"Missing API key. Provide X-API-Key header."}` (H, fixture). Keys are issued per operator via `/predigy/operators`, i.e. by Predigy; no self-serve signup found (M).
- Endpoints: GET /markets (status, category, market_type, limit, offset), GET /markets/{id}, /markets/{id}/depth, /markets/{id}/history, POST /markets/{id}/quote, GET /portfolio, GET /sse/markets/{id}?api_key= (SSE price stream; websocket also exists, `/health/ws` reports connections), webhooks (/webhooks) (H).
- Resolution fields: `status`, `outcome` (YES/NO/null), `resolved_at` on market object (H).
- Rate limits: per API key and per player, figures "set per environment", not stated in public text (H that they exist; numbers NOT FOUND).
- Public unauthenticated: only /health*, /docs, /openapi.json. Real market data could not be sampled without a key (not requested).
- Fixtures: docs/research/fixtures/edge-by-predigy/{health.json, markets-unauthenticated-401.json, openapi-excerpt.json}.

## Trade path
- POST /markets/{id}/trade `{side: YES|NO, amount, max_avg_price?}`, POST /markets/{id}/sell, with `X-API-Key`, `X-Edge-User-Id` (player id, required since 2026-09-06) and optional `Idempotency-Key` (H). No signing scheme; the API key acts for the operator's players. SDK: `EdgeClient` with `withUser()`.
- Only a licensed operator holding a key and funded player balances can trade. A PayBox EVM/Solana wallet has nothing to sign or send: **not reachable** via transaction proposals or signed orders.

## Fees
- Fee is taken out of `amount`, not added. Operator base fee 0-7% (platform default 1.75%), sell fee 0-7%, plus surge fee, end-game charge near extreme prices, 3.5% stress minimum, balance-bonus and anti-manipulation surcharges; operator ceiling `max_fee_rate` up to 20% total (H, OperatorFeesUpdate schema). Very high effective cost for an arbitrage leg.

## Resolution and dispute
- Operator/admin settles manually or via feeds: `/admin/markets/{id}/settle|void`, trade-level void, `/admin/regrade-requests` (H). Centralised, operator discretion; void and regrade possible after the fact. High resolution-mismatch risk versus other venues.

## Geo / ToS / automation
- No public ToS found (site paths /terms, /robots.txt, /sitemap.xml, /llms.txt all return the SPA shell). npm license is "SEE LICENSE IN LICENSE" (H); text not read. Product is marketed as regulated, operator-licensed gaming; access is by commercial agreement (M). Anti-manipulation, cooldowns, impact budgets and restricted-player controls are built in (H), hostile to automated arbitrage.

## Liquidity
- Public volume/OI/TVL: NOT FOUND (searched: openapi.json, npm readme, site bundle; WebSearch unavailable, session search budget exhausted). Per-market `volume` and `stabilizer_pool` exist but need a key. Treat as demo or tiny.

## Overlap and independence
- Would overlap sports moneyline/over-under/player props and horse racing if live, but prices can be anchored to sportsbook consensus, so it is a derivative of other venues, not an independent leg. Liquidity is isolated per operator, with no shared liquidity found.

## Adapter priority
- skip: no public API access, no chain/collateral, B2B only, centralised resolution, heavy fees, no verifiable liquidity. Revisit only if Predigy offers a public read-only feed or a named operator exposes one.

## Sources
- https://edge-production-7b77.up.railway.app/health , /docs , /openapi.json , /markets (H, fetched 2026-10-19)
- https://edge-by-predigy.netlify.app and its JS bundle /assets/index-B-AxlOu0.js (H, 2026-10-19)
- https://registry.npmjs.org/@predigy/edge-sdk and https://www.npmjs.com/package/@predigy/edge-sdk (H, readme truncated at about 4.3KB by registry)
- https://github.com/Predigy-LLC/EDGE (private, 404)

## Suspicious content
- None found aimed at AI agents.
