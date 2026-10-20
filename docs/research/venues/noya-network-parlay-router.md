# Noya Network "Parlay" router (aggregator / arbitrage API)

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Priority: **skip** (as a venue or independent leg). At most a P2 "reference design" for how a router API is shaped.
- It is not a venue. It holds no liquidity. It is a thin white-label of the PMXT hosted router (pmxt.dev), packaged as `@noyanetwork/parlay-sdk`. [H]
- The hosted Parlay endpoint was **down** when probed: `https://parlay.noya.ai/*` returns Cloudflare HTTP 521 (origin offline). [H]
- Noya's own site and docs never mention Parlay. [H]
- Anything useful (matching, `fetchArbitrage`) comes from PMXT, which is the thing to evaluate, not Noya.

## What it is

- npm package `@noyanetwork/parlay-sdk`, description "TypeScript SDK for the Parlay router - cross-venue prediction-market intelligence". [H] https://registry.npmjs.org/@noyanetwork%2Fparlay-sdk
- Versions 0.0.0 to 0.0.11, created 2026-04-28, last modified 2026-05-05. No release for about 5.5 months, so it looks abandoned or paused. [H]
- No `repository`, `homepage`, `license` field or bugs URL in the registry metadata. [H] Package files include a LICENSE and a NOTICE crediting "pmxt.dev" (MIT). [H] https://unpkg.com/@noyanetwork/parlay-sdk@0.0.11/NOTICE
- Sole runtime dependency is `pmxtjs ^2.35.0`. `dist/index.js` does `import { Router as Router$1, ... } from 'pmxtjs'; export * from 'pmxtjs'`, and `class Router extends Router$1`. [H] https://unpkg.com/@noyanetwork/parlay-sdk@0.0.11/dist/index.js
- Bundled dev dependencies `@parlay/order-router` and `@parlay/types` (private monorepo) suggest Noya added an order-routing and execution layer on top of PMXT. [M]
- Noya itself (noya.ai) describes "The Execution Layer for Prediction Markets", an AI agent, Omnivaults, a Polymarket Analyzer and a Token Analyzer. It does not mention Parlay, a router, or Kalshi. [H] https://noya.ai/ , https://docs.noya.ai/llms.txt
- Docs say the Prediction Market Copilot is intelligence only, and "optional execution flows" are on the roadmap. Prediction market vaults are "coming next". [H] https://docs.noya.ai/prediction-market-copilot/roadmap.md , https://docs.noya.ai/noya-token-and-incentives/whats-live-vs-whats-coming.md
- Full-text docs contain zero hits for "parlay" (llms.txt index and the pages above). [H]

## Is it still live (2026)?

- `parlay.noya.ai/`, `/router`, `/router/v0/markets`, `/router/health`, `/docs`: all HTTP 521 on 2026-10-19 (Cloudflare reports origin web server down). DNS resolves to Cloudflare IPs. [H] See `docs/research/fixtures/noya-network-parlay-router/probe-2026-10-19.txt`
- noya.ai, app.noya.ai, docs.noya.ai: HTTP 200. The company is alive, the Parlay router is not. [H]
- Upstream `api.pmxt.dev/health` returns 200, but its `priceWatcher` shows `connected:false`, `staleSince 2026-10-18T07:31Z` and 503 reconnect attempts, so even PMXT's live-price feed looked degraded that day. [H]
- A verified Polymarket builder named "Noya Network" was suggested by the hint. It is not in the top 250 builders by all-time volume on `data-api.polymarket.com/v1/builders/leaderboard` (queried offsets 0-200, limit 50), consistent with tiny volume. [H, absence only; name could differ]

## Read API

- Exists: **official-authenticated** (and currently unreachable). No public docs found. [H]
- Default base URL baked into the SDK: `https://parlay.noya.ai/router`. Overridable with `PARLAY_BASE_URL` or `PMXT_BASE_URL`. [H]
- Auth: `Authorization: Bearer <PARLAY_API_KEY>` (falls back to `PMXT_API_KEY`). No way to get a Parlay key was found (no signup page or docs). [H, from SDK d.ts `RouterOptions.apiKey` comment]
- Docs URL: NOT FOUND (searched: docs.noya.ai llms.txt, noya.ai, parlay.noya.ai/docs (521), npm README, registry metadata).
- Rate limits: NOT FOUND.
- Websocket: NOT FOUND for Parlay. The SDK only wraps REST calls.
- Endpoints visible in the SDK source (Parlay-specific, all under `/v0`): [H]
  - `POST /v0/orders/route` (plan or execute, `dryRun` option, `Idempotency-Key` header; HTTP 422 is returned for planner rejections)
  - `GET /v0/orders/{routeId}`
  - `POST /v0/orders/{routeId}/cancel`
  - `PATCH`/update of legs at `/v0/orders/{routeId}/legs/{legId}` (method not verified)
  - `POST /v0/matches/{matchId}/verdict` (human verdict on LLM-generated match: agree, disagree, uncertain; feeds an active-learning threshold)
  - `GET /v0/markets/slug/{exchange}/{slug}`
  - `GET /v0/wallet/polymarket/discover?address=` (used by the Polymarket client)
- Inherited from the PMXT Router class (pmxtjs 2.54.0, `pmxt/router.ts`): `fetchMarkets`, `fetchEvents`, `fetchMarketMatches`, `fetchEventMatches`, `fetchMatchedMarketClusters` (`GET /v0/matched-market-clusters`), `fetchMatchedEventClusters` (`/v0/matched-event-clusters`), `compareMarketPrices`, `fetchHedges`, `fetchArbitrage({minSpread, category, limit, relations})`, consolidated `fetchOrderBook`, and `POST /v0/sql`. [H] https://unpkg.com/pmxtjs@2.54.0/pmxt/router.ts
- `fetchArbitrage` returns items of the form `{marketA, marketB, spread, buyVenue, sellVenue, buyPrice, sellPrice, relation, confidence}`; relation defaults to `identity`. [H, from source]
- Real response samples: NOT obtainable. Parlay is 521; the PMXT equivalent returns `401 {"error":"missing api key"}` on `api.pmxt.dev/v0/matched-market-clusters` and `/api/router/fetchArbitrage`. Saved the SDK request/response types instead (`parlay-sdk-0.0.11-order-route-types.d.ts.txt`). [H]

## Market model, chains, collateral

- Not applicable: no markets of its own. Market model is whatever the underlying venues use (binary and categorical order books on Polymarket/Kalshi/Limitless/Probable). [H]
- Venue classes exported by the SDK: Polymarket, PolymarketUS, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi, Opinion, Metaculus, Smarkets. Order execution signers exist only for Polymarket, Kalshi, Limitless, Probable. [H]
- Chains and collateral are those of each routed venue (Polygon/USDC for Polymarket, Base for Limitless, BNB for Probable, USD for Kalshi). [M]

## Trade path

- Smart order router: `routeOrder({intent:{marketId, outcomeId, side, size, maxSlippage}, options:{venues, dryRun, deadlineMs, restUnfilled}})` splits an order across venues. [H]
- Three execution modes: `server` (credentials are sent in the request body and the server executes), `client` (server plans, SDK signs and places orders locally with supplied signers), `auto`. [H]
- Server mode means handing venue credentials to a third party. Do not use. Client mode keeps keys local but still sends the plan and leg state to the router (`RemoteStateStore`). [H]
- PayBox reachability: **partial/no**. An EVM wallet could in principle sign the venue-native orders (Polymarket EIP-712, Limitless, Probable), but the router requires a Parlay key we cannot obtain and the host is down. A PayBox plugin would be better off talking to each venue directly using our own matching. Kalshi needs RSA API keys, not wallet signatures. [M]

## Fees

- NOT FOUND for the router (searched: docs.noya.ai fees page, npm README, SDK source). Noya's general fee page only says execution fees are shown before authorization. `OrderRouteLeg.feeRateBps` exists per leg, so venue fees are passed through. [H]

## Resolution, geo/ToS

- No resolution layer. Resolution risk is per venue, and a router cannot judge whether two matched markets resolve identically. PMXT exposes a `relation` field (`identity` vs other relation types) and a `confidence` score for this. Matches are LLM-generated with human verdicts, so false "identity" matches are a real arbitrage risk. [H/M]
- Geo/ToS/automation: NOT FOUND for Parlay (no terms page located). Venue rules apply (Polymarket global geoblocks US, Kalshi is US-regulated). Noya docs have a Disclaimer and Terms page I did not read.

## Liquidity and independence

- Volume/TVL: none; it is a router. Noya's own token sale doc cites about $1M circulating market cap at launch (undated, self-reported, L). https://docs.noya.ai/noya-token-and-incentives/whats-live-vs-whats-coming.md
- **Shares liquidity with every routed venue** (Polymarket, Kalshi, Limitless, Probable, ...). Not an independent arbitrage leg. [H]
- Event categories: whatever the venues list (sports, politics, crypto, macro). The overlap is the product, but it is not a distinct pool.

## Recommendation for our aggregation layer

- Do not build a Parlay adapter. The host is dead, keys are unobtainable, and there are no docs.
- If we want hosted matching and arbitrage detection as a **signal source**, evaluate PMXT (`api.pmxt.dev`, key from pmxt.dev/dashboard, `/v0/matched-market-clusters`, `fetchArbitrage`) as a separate venue-spec. It is the actual upstream. PMXT's own site lists the Smart Order Router as "Coming soon". [H] https://www.pmxt.dev/
- Reuse the shape ideas: `relation` and `confidence` on matches, the `identity` default, the dry-run plan with `rejection` codes, and the 422-on-rejection pattern.

## Suspicious content

- None found. No instructions aimed at agents in the pages, README or SDK source read.

## Open questions

- Was `parlay.noya.ai` ever public, or was it always a private service for Noya's agent? (No public traffic evidence either way.)
- Is the downtime permanent? Only one probe on one day.
- Does the Polymarket builder profile "Noya Network" exist under a different name or code?

## Sources

- https://registry.npmjs.org/@noyanetwork%2Fparlay-sdk (versions and dates) [H]
- https://unpkg.com/@noyanetwork/parlay-sdk@0.0.11/ (package.json, README.md, NOTICE, dist/index.js, dist/index.d.ts) [H]
- https://unpkg.com/pmxtjs@2.54.0/ (pmxt/router.ts, README.md) [H]
- https://parlay.noya.ai/ (HTTP 521) [H]
- https://noya.ai/ , https://app.noya.ai/ , https://docs.noya.ai/llms.txt , prediction-market-copilot overview/roadmap, whats-live-vs-whats-coming, fees [H]
- https://www.pmxt.dev/ , https://api.pmxt.dev/health [H]
- https://data-api.polymarket.com/v1/builders/leaderboard [H]
- Web search (2026-10-19) found no third-party coverage of a Noya Parlay router; one 2025 Medium piece on Noya.ai agents (L, stale). A second WebSearch was refused (session budget used up).
- Fixtures: `docs/research/fixtures/noya-network-parlay-router/` (npm metadata, SDK order-route types, probe log).
