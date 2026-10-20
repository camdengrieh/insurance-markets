# Polynance (polynance.ag)

Researched 2026-10-19. Read-only. Verdict: **skip**. Polynance was a thin aggregation/DeFi layer (an API over Polymarket, Limitless and TrueMarket, plus a lending/index-token idea built on Polymarket tokens), not a venue with its own order flow. Its official domain is now NXDOMAIN. Anything it showed is a re-surface of other venues' liquidity, so it can never be an independent arbitrage leg.

Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness

- H: `polynance.ag` does not resolve. The .ag ccTLD authoritative server (a0.cctld.afilias-nst.info) answers NXDOMAIN for `polynance.ag`; Google and Cloudflare resolvers return nothing for `polynance.ag`, `www.polynance.ag`, and `api.polynance.ag`. The domain has been dropped or expired, not just blocked from this host. (Commands: `dig polynance.ag @a0.cctld.afilias-nst.info`, `curl https://api.polynance.ag/`.)
- H: `polynance.com` resolves to a hosting-panel default page ("FASTPANEL", `noindex`), and `polynance.xyz` drops the TLS connection. Neither is shown to be related to the project.
- M: The prediction-market ecosystem directory https://predictionindex.xyz/ecosystem still lists a row "Polynance | Polygon | protocol/infra | live", linking https://polynance.ag/ and https://twitter.com/POLYNANCE_X. Logo asset timestamp is Aug 2025. The directory entry is stale relative to the DNS fact above.
- H: Related GitHub activity is old for the aggregator itself. `delphiresearch/polynance-ts-client` (SDK) last pushed 2025-05-17; `delphiresearch/Polynance-Building` 2025-05-08; `JinTanba/Polynance_mcp` 2025-04-09. The lending follow-on repos `JinTanba/polyaave-dev` (2025-06-17) and `JinTanba/polyaave-contract-dev` (2026-02-16) are in development, with demo apps on vercel.app (not checked live). A third-party repo `Smidelis/polynance` ("polymarket up/down bot", 2026-02-14) is unrelated or a name collision (L).
- NOT FOUND: any announcement of shutdown, rename or pivot (searched: GitHub repo search; X profile fetch returned HTTP 402 Payment Required, so not read and not paid; WebSearch unavailable because the shared session search budget was exhausted).

## Kind and market model

- H: Not a market venue. README of `delphiresearch/polynance-ts-client`: "an aggregation layer designed for prediction markets ... unified interface for interacting with multiple prediction market platforms". Supported providers in the SDK type: `'polymarket' | 'limitless' | 'truemarket'` (src/core/types.ts).
- H: `delphiresearch/Polynance-Building` README: "Polynance recognizes this opportunity and is building several modules on Polymarket ... funnel more capital and betting activity into Polymarket". Planned modules: ERC-20 index tokens wrapping Polymarket CTF (ERC-1155) tokens, PT/YT tranches, Aave-backed lending, payments.
- H: `JinTanba/polyaave-dev` README describes "PolynanceLend", a single-market lending pool: LPs supply stablecoins (deposited to Aave v3), borrowers pledge a YES/NO outcome ERC-20 as collateral, a curator-set oracle and maturity trigger resolve.
- So: no own order book or AMM for event trading, no own outcome tokens (uses Polymarket CTF tokens and Limitless/TrueMarket positions).

## Chains and collateral

- M: Polygon (PI directory), consistent with H evidence that the SDK uses `@polymarket/clob-client` on `Chain.POLYGON`, Polymarket collateral (USDC) and the CTF contract. Lending design uses Aave v3 (chain not stated in what was read).

## Read API (previously existed, now unreachable)

- exists: unofficial-only / defunct. No docs site found (NOT FOUND: docs URL; searched predictionindex page, GitHub READMEs).
- H (from SDK source, `src/core/client.ts`): default base URL `https://api.polynance.ag` (REST and SSE). Endpoints seen: `GET /v1/events/{id}`, `GET /v1/markets/{id}`, `GET /v1/ongoing-events`, `GET /v1/events/{id}/comments`, `GET /v1/markets/{id}/orderbook`, `GET /v1/markets/{id}/orderbook/filledevents`, `GET /v1/trader/{addr}`, `GET /v1/trader/{addr}/positions`, `GET /v1/agg/sluglist`, `GET /v1/agg`, `GET /v1/agg/market`, `GET /v1/agg/retrieve` (cross-venue market matching), SSE `/sse/fillevent?protocol=&id=`. Auth and rate limits: NOT FOUND.
- No response shapes could be confirmed: host does not resolve, so no fixtures saved. Cross-venue matching idea (`/v1/agg/retrieve`, `MarketMatchResult`) is a design reference only.
- Websocket: SSE only (see above); moot while host is down.

## Trade path

- H: SDK `buildOrder` supports only `provider === "polymarket"` ("Now Only Polymarket is supported"); it derives Polymarket CLOB API creds from a wallet and signs Polymarket orders client-side. It also posts to `/v1/proposePrice`, `/v1/verifyPrice` (purpose not documented). Effectively a Polymarket order passthrough, so trading here = trading on Polymarket (covered by another workflow).
- PayBox reachability: **no** as a separate venue (nothing to trade; domain/API dead). Polymarket itself is out of scope here.

## Fees, resolution, geo/ToS

- Fees: NOT FOUND (no fee docs; lending spread/`reserveFactor` exist only in dev contract design, M).
- Resolution: inherited from the underlying venue (Polymarket uses UMA; not researched here). PolynanceLend uses a curator-set oracle (H, README), which would add centralisation risk if it shipped.
- Geo/ToS/automation: NOT FOUND (no ToS reachable; site down).

## Liquidity and overlap

- NOT FOUND: any volume/OI/TVL figure. The PI directory page has a Total Volume column but no figure for Polynance was extracted (not confirmed).
- Shares liquidity with: Polymarket, Limitless, TrueMarket (H, SDK). Not independent. Event overlap is by construction 100% with those venues, so there is no incremental arbitrage leg.

## Adapter recommendation

skip. Dead domain, no API, wraps other venues. If cross-venue matching is wanted, build it from the underlying venues' APIs directly. The only reusable idea is the `/v1/agg/retrieve` market-matching concept, already covered by the market-linking design.

## Suspicious content

None seen in the pages and files read. (X profile fetch returned 402; nothing parsed.)

## Sources

- https://predictionindex.xyz/ecosystem (M, directory row)
- https://github.com/delphiresearch/polynance-ts-client (README, src/core/client.ts, src/core/types.ts) (H)
- https://github.com/delphiresearch/Polynance-Building (README) (H)
- https://github.com/JinTanba/polyaave-dev (README) (H)
- https://github.com/JinTanba/Polynance_mcp (repo metadata only) (H)
- DNS checks on polynance.ag / api.polynance.ag via the .ag authoritative server and public resolvers, 2026-10-19 (H)
- https://x.com/POLYNANCE_X (HTTP 402, not read)
