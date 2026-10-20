# Implicit Markets (implicitmarkets.com) - venue spec

Researched 2026-10-19. Verdict: SKIP. Service is suspended by its owner; no verifiable API, chain or liquidity.

## Liveness [H]
- `curl https://www.implicitmarkets.com/` on 2026-10-19 returned HTTP 503 with body "Service Suspended - This service has been suspended by its owner." and header `x-render-routing: suspend-by-user` (Render.com hosting, behind Cloudflare). This is an owner-initiated suspension, not a transient outage. [H]
- Same 503 for /developers, /docs, /api, /api/markets, /llms.txt, /demo.svg and a market page `/m/0d8986d4-...`. `implicitmarkets.com` 301-redirects to www. DNS still resolves (Cloudflare). [H]
- Verdict: not live as of 2026-10-19.

## What it was [M]
- Show HN, 2026-04-01 ("Show HN: Let your local agents trade on internal prediction markets", 3 points, HN item 47602413), by user "catpower". Read via the HN Algolia API. [H that the post says this; M for what the product was]
- Pitch in the post: an MCP server that connects a local agent to a prediction market for internal company forecasting (project status, A/B outcomes, migration timelines), "information aggregation meets AI reasoning over private context". Sandbox with "some public markets"; API key available with no email or login at /developers. Mentions trading "against other AIs (and humans)". [H]
- Earlier HN submission 2026-03-19 of a public market page: "Who will win the 2026 John Bates Clark Medal?" (1 point). [H]
- Indicates a sandbox/toy play-money-style internal-forecasting product with an MCP interface. Whether it used real money, an AMM, an order book or any chain: NOT FOUND (searched: HN post text, site probes; WebSearch budget exhausted this session so no wider search was done).

## Spec fields
- Kind / market model: NOT FOUND. Likely internal LMSR or play-money market (M/L, inferred from "internal prediction markets" wording only; unverified).
- Chains and collateral: NOT FOUND. No evidence of any chain or token. Likely none (off-chain, no wallet needed: API key with no login). [L]
- Read API: could not be verified. Docs were at /developers (referenced by HN post), now 503. Interface is an MCP server plus an API key. No base URLs, endpoints, auth format or rate limits confirmed. No fixtures saved (nothing to fetch).
- Trade path: MCP/API-key trading per HN post [M]. No on-chain or signed-order path found. A PayBox EVM wallet cannot be used: no chain/collateral evidence, and no wallet auth.
- Fees, resolution, geo/ToS, liquidity: NOT FOUND. Liquidity is effectively zero (3-point HN post, suspended service).
- Event overlap with other venues: only the public markets (e.g. academic awards) seen; internal-company markets are private by design and have no cross-venue counterpart. No arbitrage value.
- Shared liquidity: none known; independent but irrelevant.

## Suspicious content
None observed (no site content could be read).

## Sources
- https://www.implicitmarkets.com/ - 503 "Service Suspended" 2026-10-19 [H]
- https://news.ycombinator.com/item?id=47602413 via https://hn.algolia.com/api/v1/items/47602413 - Show HN text [H]
- https://hn.algolia.com/api/v1/search?query=implicitmarkets&tags=story - two submissions [H]
- Not reached: https://www.implicitmarkets.com/developers, /demo.svg, /m/0d8986d4-68c0-4393-95b3-3f7f3de05533 (all 503)

## Re-check trigger
If the site returns, re-check /developers for the MCP/API docs; revisit only if it adds real-money liquidity on a public API. Until then skip.
