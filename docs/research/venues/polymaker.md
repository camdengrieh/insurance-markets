# PolyMaker (polymaker.bet) - venue spec

Checked 2026-10-19. Slug: polymaker. Verdict: NOT a venue. A third-party front-end / market-making tool that routes orders to Polymarket's CLOB under a Polymarket builder code. Liquidity is 100% Polymarket's. Adapter priority: skip.

## Summary
- Live: yes, site returns HTTP 200, last-modified 2026-10-17 (H, https://www.polymaker.bet/ headers).
- Tagline: "Professional grade market-making and analytics suite for Polymarket." (H, og:description on the homepage).
- Single-page React app (Vercel-hosted). No docs, terms, pricing, or API pages exist: /terms, /docs, /privacy, /robots.txt, /sitemap.xml all return the SPA shell (H). Page copy is client-rendered, so WebFetch saw only the title. NOT FOUND (searched: homepage, common paths, web search): company, pricing, custody model, terms of service.
- Listed on Polymarket's public builder leaderboard as "PolyMaker.bet", rank 38 of the top 50 on timePeriod=ALL, volume ~24.85M USD, activeUsers 24, verified=true (H, fetched 2026-10-19, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0). Fixture: docs/research/fixtures/polymaker/builders-leaderboard-sample.json. Rank-1 builder volume was ~2.34B, so this is a small builder.

## Market model, chains, collateral
- Same as Polymarket: binary/neg-risk categorical outcome tokens (CTF ERC-1155) on Polygon, USDC collateral, off-chain CLOB with on-chain settlement (M: from client bundle referencing "Polymarket CTF Exchange" EIP-712 domain, clob.polymarket.com, polygonscan; H that the bundle contains these strings). PolyMaker creates no markets of its own.

## Read API
- None of its own (NOT FOUND: no documented or discoverable PolyMaker API). The client bundle calls Polymarket hosts (clob.polymarket.com, relayer-v2.polymarket.com, user-pnl-api.polymarket.com) and its own same-origin routes /api/privy/sign-typed-data, /api/relayer/submit, /api/human, /api/glossary (H strings in bundle, https://www.polymaker.bet/assets/index-BXaKK0s0.js; undocumented, private, do not use).
- Market data should be read from Polymarket directly (covered by the parallel Polymarket workflow). Useful PolyMaker-adjacent public endpoint: Polymarket data-api builders leaderboard (shape in fixture): array of {rank (string), builder, builderCode (bytes32 hex), volume (float USD), activeUsers, verified, builderLogo}. Response is Cloudflare-cached, cache-control public max-age=1800. Auth: none seen. Rate limits: NOT FOUND for this endpoint.
- Polymarket CLOB supports getBuilderTrades by builder_code (H, bundle string; M that it is authenticated). Could be used to attribute flow, not needed for arbitrage.

## Trade path
- Orders are standard Polymarket CTF Exchange signed orders carrying a `builder` field (builder code) (H, bundle: order struct includes builder: n.builderCode). Gas is covered via Polymarket's relayer for builders (H, https://docs.polymarket.com/developers/builders/builder-intro as summarised by WebFetch).
- The presence of /api/privy/sign-typed-data suggests wallets may be Privy embedded wallets with server-assisted signing (M, inferred from route name only; custody unverified).
- For the aggregator: do not integrate PolyMaker. Trade Polymarket directly through its own adapter (optionally attach own builder code). PayBox reachability is therefore whatever the Polymarket adapter has (EVM wallet on Polygon signing EIP-712 orders). PolyMaker adds nothing.

## Fees
- PolyMaker's own fee: NOT FOUND (searched: homepage, bundle, web search). Polymarket protocol fees apply: taker fee = C x feeRate x p x (1-p); rates Crypto 0.07, Sports/Economics/Culture/Weather/Other 0.05, Finance/Politics/Mentions/Tech 0.04, Geopolitics 0; makers pay none and receive daily rebates of 15-25% of taker fees (H, https://docs.polymarket.com/trading/fees, fetched 2026-10-19). Builder fee/revenue-share terms: NOT FOUND in the docs fetched.

## Resolution
- Identical to Polymarket (UMA optimistic oracle based; covered by the Polymarket workflow). No PolyMaker-specific resolution.

## Geo / ToS / automation
- NOT FOUND: PolyMaker terms. Polymarket geo-restrictions apply to underlying access. Not investigated further.

## Liquidity
- Own liquidity: none. Routed volume ~24.85M USD cumulative, 24 active users (H, builders leaderboard 2026-10-19).
- Shares liquidity with Polymarket: yes, fully. NOT an independent arbitrage leg.

## Event coverage
- All Polymarket categories (sports, politics, crypto, macro); overlaps with other venues only via Polymarket itself.

## Possible signal use (P2-ish, but not worth it)
- Builder-attributed volume could mark market-maker flow, but only via Polymarket builder-trades endpoints; low value. Open question: whether a Polymarket "market-making rewards" per-market daily reward figure (seen in search snippet, e.g. $1,250/day) is useful as a liquidity-incentive signal. That comes from Polymarket's rewards data, not PolyMaker.

## Suspicious content
- None found. No AI-agent-directed instructions in the pages or bundle inspected.

## Sources
- https://www.polymaker.bet/ (H; HTML head and JS bundle)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (H)
- https://docs.polymarket.com/developers/builders/builder-intro (M; via summarising fetch)
- https://docs.polymarket.com/trading/fees (M; via summarising fetch)
- Web search (extended) for "PolyMaker polymaker.bet Polymarket market making suite": found no coverage of polymaker.bet beyond its own page; unrelated OSS bots (warproxxx/poly-maker) are a different project (M).
