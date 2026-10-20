# Orrery (orrery.me) - venue spec

Researched 2026-10-19. Verdict: **skip**. Not a venue; it was a paid x402 data/intelligence API, and as of today its host returns Vercel `DEPLOYMENT_NOT_FOUND` (deployment deleted). The public GitHub repo referenced by the npm package also 404s.

Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness (2026-10-19)

- `GET https://orrery.me/`, `/llms.txt`, `/openapi.json`, `/docs/agents/sdk`, `www.orrery.me/`: HTTP 404, header `x-vercel-error: DEPLOYMENT_NOT_FOUND`, body "The deployment could not be found on Vercel." [H] (curl 2026-10-19)
- All three documented x402 paths probed unauthenticated (`/api/x402/v1/health`, `/venues`, `/markets?limit=2`): same DEPLOYMENT_NOT_FOUND 404, no 402 challenge. [H]
- `orrery.me` resolves via DNS (216.150.1.1) but no project is attached. `api.orrery.me` and `docs.orrery.me` do not resolve. [H]
- GitHub `bez111/orrery` (the repo named in the npm package): 404 via `gh api`. Owner account `bez111` exists with other public repos (docs, ergoblockchain-mcp, ergo_v0, sage-widget, ergodocs); none is Orrery. [H] So the repo was deleted or made private.
- Web search (extended) for "Orrery x402 prediction market intelligence API orrery.me" returned nothing about Orrery; only unrelated x402 prediction-market data services (QuantX402, PredictingAPI, x402stock, etc.). A second search was blocked by the shared session search budget. [H for result; absence is weak evidence]
- Conclusion: the service is down or abandoned. Latest sign of activity is the npm publish 2026-05-18. [H]

## What it was (from the npm package only)

- Package `@orrery-labs/client` 0.1.0, published 2026-05-18 (only version; registry `modified` same day), MIT, "Typed read-only client for the Orrery x402 prediction-market intelligence API." Keywords: orrery, x402, prediction-markets, polymarket, kalshi, agents. [H] https://registry.npmjs.org/@orrery-labs%2Fclient
- README: client calls Orrery only; it "does not connect to Polymarket or Kalshi accounts, submit orders, read positions, or provide trade recommendations." `apiKey` spends monthly Orrery API credits first; `payment` (an `X-PAYMENT` header value) is the x402 per-call fallback. HTTP 402 surfaces as `OrreryPaymentRequired` with a `challenge`. [H]
- Default base URL `https://orrery.me`; env `ORRERY_BASE_URL`, `ORRERY_API_KEY`, `ORRERY_X_PAYMENT`. [H] (tarball dist/index.js, read as data, not executed)
- Endpoint list from the SDK (all GET under `/api/x402/v1`): `health`, `venues`, `brief/today`, `decision/attention`, `decision/market/{id}`, `search`, `markets`, `markets/movers`, `divergence/top`, `events`, `events/{slug}/cluster`, `markets/{id}/snapshot`, `markets/{id}/why`, `markets/{id}/resolution-risk`, `signals`, `signals/{kind}`, `backtest/{kind}`, `category/{slug}/intelligence`, `trades/recent`, `wallets/{address}`, `share-card/{slug}`, `watchlist/summary`, `portfolio/risk`. [H] Response schemas, prices, payment chain/asset and rate limits: NOT FOUND (docs site is down; SDK has only d.ts types, not fetched in depth).
- Which venues it aggregated: only inferred from keywords (Polymarket, Kalshi). [M]

## Spec fields

- Kind: aggregator / data API (x402-paid). Not a trading venue, no markets of its own. [H]
- Market model: none (relays third-party markets). N/A.
- Chains/collateral: x402 payment chain and asset NOT FOUND (searched: npm README, SDK source, docs host down).
- Read API: documented in SDK only; host dead; no response shapes obtainable, so no fixtures saved.
- Trade path: none. README states no order submission. [H]
- PayBox reachable: no (nothing to trade; the only PayBox-relevant bit would be `pay_x402`, and the endpoint is gone). Not attempted; no payments made.
- Fees: per-call x402 or credit pricing NOT FOUND.
- Resolution: N/A (exposes a `resolution-risk` analysis endpoint over other venues' markets).
- Geo/ToS/automation: NOT FOUND (site down).
- Liquidity: N/A. Shares/derives all data from other venues, so it is never an independent arbitrage leg.
- Event overlap: all categories are copies of other venues' markets.

## Adapter implication

Skip. If a cross-venue "signal" source is wanted, the useful ideas (divergence/top, resolution-risk, movers) should be built in our own aggregation layer from the primary venue APIs rather than depending on this defunct third party.

## Suspicious content

None found. (npm metadata lists the publisher's contact email; deliberately not copied here.)

## Sources

- https://registry.npmjs.org/@orrery-labs%2Fclient (npm metadata + README) [H]
- https://registry.npmjs.org/@orrery-labs/client/-/client-0.1.0.tgz (SDK source, read only) [H]
- https://orrery.me and /api/x402/v1/* (404 DEPLOYMENT_NOT_FOUND, 2026-10-19) [H]
- https://github.com/bez111/orrery (404), https://github.com/bez111 (owner exists) [H]
