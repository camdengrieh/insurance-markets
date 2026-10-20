# Meridian Edge (meridianedge.io) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Kind: paid analytics / consensus-data API (a data vendor), NOT a trading venue. [H, SDK README]
- Status: DEAD OR DOWN as of 2026-10-19. `https://meridianedge.io/` and `/api` return Cloudflare HTTP 522 (origin unreachable); `robots.txt`, `llms.txt`, `openapi.json` time out; `api.meridianedge.io` returns NXDOMAIN. [H, curl 2026-10-19]
- Adapter priority: skip. No venue, no liquidity, API unreachable, tiny/unproven vendor, we would be buying a second-hand view of venues we can read directly.

## What it is

- Operator: "VeraTenet LLC" (npm author field); npm maintainer account `meridianedge`. [H, https://registry.npmjs.org/meridian-edge]
- Product: REST API returning "volume-weighted consensus probability for each active event, aggregated from all available platforms", cross-platform spread, "opportunity" scores, settlement verification, sports/weather summaries. [H, SDK README on npm]
- Platforms aggregated: NOT FOUND (searched: SDK README, src/index.d.ts, npm metadata; `platform_breakdown` is an untyped `Record<string, any>`; the site that would list them is down). Names of venues are not documented in anything reachable.
- Marketing claim (from the MCP repo description only): "27,000+ markets, 100M+ data points, 14-second updates". [L, vendor self-claim in GitHub repo description of tmbot12/meridian-edge-mcp, unverified]
- Subscription plans via Stripe checkout: starter, pro, allaccess; monthly/annual (SDK `subscribe()`). Prices NOT FOUND (site down). [H for plan names, SDK README]

## Market model, chains, collateral, resolution, fees

- Not applicable: it lists events/markets from other venues; it has no order book, AMM, tokenisation, chain or collateral of its own. [H, nature of the API]
- Resolution: provides "settlement verification" (`/settlements/verify/{eventId}` returns `{outcome, source, verified_at}` per README example) - a derived record, not a resolution mechanism. [M]
- Fees: none for trading (no trading). Subscription fees only, amounts NOT FOUND.

## Read API (official, authenticated, paid)

- Docs URL: https://meridianedge.io/api (HTTP 522 today; not readable). [H]
- Base URL (from SDK default): `https://api.meridianedge.io/api/v1` - NXDOMAIN on 2026-10-19. [H]
- Auth: header `X-API-Key: me_...` (SDK src/index.js line 57). `GET /status` documented as no-auth. [H, GitHub tmbot12/meridian-edge-sdk-node]
- Endpoints (from SDK src/index.js): `GET /status`, `/markets` (sport, limit<=200, offset), `/markets/{eventId}`, `/opportunities` (min_score, limit), `/indicators`, `/sports/{sport}` (date), `/settlements`, `/settlements/verify/{eventId}`, `/settlements/sports/{sport}`, `/weather/summary`, `/performance` (days), `/consensus` (sport, min_platforms, min_spread, limit), `/consensus/{eventKey}`, plus a subscribe/checkout call. [H]
- Consensus item fields (index.d.ts): `event_key`, `consensus_prob`, `spread?`, `n_platforms?`, `platform_breakdown?`. [H]
- Rate limits: NOT FOUND. SDK retries on 429 honouring Retry-After (3 attempts). Websocket: NOT FOUND (14-second polling-style updates claimed by vendor only).
- Response shapes could not be confirmed; no fixtures saved (API host does not resolve, web host 522).

## Trade path / PayBox

- Trade path: none. [H]
- PayBox reachable: no. There is nothing to trade. The only payment is a Stripe card checkout for a subscription (not a crypto/x402 flow; no 402 observed). [M]

## Geo / ToS / automation

- NOT FOUND (site down; no ToS readable). README disclaimer: "For informational purposes only. Not investment advice... as-is". [H]

## Liquidity and overlap

- Liquidity: none of its own (data vendor). Underlying volume figures are vendor claims only (see above). [L]
- Event categories claimed: sports (NBA, MLS... explicitly), weather, election/alt-data keywords on npm. These overlap Kalshi/Polymarket by construction - but it is a derivative view of them, so not an independent arbitrage leg.
- Shares liquidity with: all venues it aggregates (not independent).

## Signal-source value for our project

- Our own aggregation layer reads the venues directly; Meridian's consensus adds nothing we cannot compute, is unauditable (methodology NOT FOUND), and the service appears offline. Not worth a P2 slot unless it returns and publishes methodology plus free tier.

## Footprint / credibility red flags (M)

- npm `meridian-edge`: created 2026-03-30, two versions published 15 minutes apart, 7 downloads in the last month (2026-09-17 to 2026-10-16). [H, api.npmjs.org]
- SDK repo moved from org `veratenet` (now 404) to personal account `tmbot12` (account created 2026-03-08, 0 stars; repo last pushed 2026-03-30). That account also hosts forks of `awesome-mcp-servers`, `public-apis`, and `Awesome-Prediction-Market-Tools` - promotion-style repos. [H, gh api]
- The `tmbot12/meridian-edge-mcp` repo README is a verbatim copy of the official MCP registry README with a "Get it on MCP Marketplace" badge inserted, not product documentation. [H]
- Python SDK and MCP server links in the README point to `veratenet/*` repos that return 404. [H]

## Suspicious content

- No instructions aimed at AI agents were found. Noted only: MCP repo README is a repurposed copy of the MCP registry README (promotion/SEO pattern).

## Open questions

- Is the outage temporary (Cloudflare 522 means DNS is alive but origin down; `api.` subdomain has no record at all)? Recheck in a few weeks if wanted.
- Which venues feed the consensus; methodology; pricing.
- Web search budget was exhausted this session, so no independent third-party coverage/reviews were checked.

## Sources

- https://registry.npmjs.org/meridian-edge (metadata, README, timestamps) [H]
- https://api.npmjs.org/downloads/point/last-month/meridian-edge [H]
- https://github.com/tmbot12/meridian-edge-sdk-node (src/index.js, src/index.d.ts, examples/agent-example.js, commits) [H]
- https://github.com/tmbot12/meridian-edge-mcp (description, README, commits) [H]
- https://meridianedge.io/ and /api, https://api.meridianedge.io/api/v1/status - curl and WebFetch 2026-10-19: 522 / NXDOMAIN [H]
