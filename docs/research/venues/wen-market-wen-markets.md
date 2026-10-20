# Wen.market / Wen Markets - venue spec (2026-10-19)

Verdict: **skip**. Wen Markets is an ERC20 memecoin launchpad on Polygon, not a prediction market. It has no markets, outcomes, resolution or event categories, so there is nothing to arbitrage. The "Wen.market" entry on the Polymarket builder leaderboard is an order-routing front end that sends Polymarket orders under a builder code; it does not hold liquidity of its own.

## What it is
- `https://wen.markets` serves a Vite/React SPA. Its own meta description reads: "Wen Markets is a token launchpad bulletin board where anyone can create and bootstrap ERC20 token liquidity, and post comments for discussion, inspired by 4chan and the Internet culture." Twitter handle `@wenmarkets`. [H] https://wen.markets (fixture `wen-markets-index.html`)
- `wen.market` (singular, no "s") has no A record (`curl: Could not resolve host`; `dig` returns NOERROR with no answer). `www.wen.market` 301-redirects to it, so it is dead. Only `wen.markets` resolves. [H] local DNS and curl, 2026-10-19
- The JS bundle (`/assets/index-DygVSelo.js`, 815 KB) calls `api-a.wen.markets` and `api-b.wen.markets` (paths `/discover/*`, `/swaps`, `/price-ticks`, `/posts`, `/login`, `/asset`, `/socials`). **Both hostnames return NXDOMAIN on 2026-10-19**, so the backend that feeds the UI is gone and the live site can no longer load token data. [H] dig, curl. The bundle also references Polygon RPC, Polygonscan, DexScreener and DefiLlama swap. No mention of Polymarket or "prediction" was found in the bundle (grep on `polymarket` and `prediction` returned nothing). [H]
- Terms of Use text inside the bundle is boilerplate with ICC arbitration. Nothing about automation was extracted; I did not read it in full. [M]

## Is it still live?
- Frontend: partially. The static SPA is served, but its API hosts do not resolve. [H]
- On-chain: the ledger contract `0x5574d1e44eFcc5530409fbE1568f335DaF83951c` (Polygon, address from the DefiLlama adapter, also present in the site bundle) still has code. `getStats()` returned on 2026-10-19 (block 95,793,158): totalVolume 1,061,737.8 POL, totalLiquidityBootstrapped 162,371.2 POL, tokensCreated 320, tokensGraduated 9, totalTrades 10,252 (fixture `ledger-getStats-polygon.json`). [H] via `polygon-bor-rpc.publicnode.com`
- Activity: `eth_getLogs` on that address found **0 logs** in six 10,000-block windows sampled at 0, 100k, 300k and 1M blocks back (about 23 days at roughly 2 s per block; older windows need an archive token). The windows are a sample, not a full scan, but together with the dead API this indicates the launchpad is dormant. [M]
- DefiLlama adapter `fees/wen-markets.ts` (start 2024-05-28) computes fees as 1% of trading volume plus 7% of liquidity bootstrapped, from the ledger `getStats()`. [H] https://raw.githubusercontent.com/DefiLlama/dimension-adapters/master/fees/wen-markets.ts

## Polymarket builder "Wen.market"
- Polymarket public builder leaderboard (`https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100`): rank 105, builder "Wen.market", verified true, all-time volume 3,067,777 USD, activeUsers 40 (fixture `polymarket-builder-leaderboard-wen-row.json`). It did not appear in the top 50 for DAY, WEEK or MONTH (top 50 only; inconclusive for recent activity). [H] 2026-10-19
- I found nothing linking the builder code to the wen.markets launchpad. The builder name matches the discarded domain `wen.market`, so it is most likely a separate Polymarket front end, but the link is unverified. [L]
- A builder code only tags Polymarket orders for fee sharing. It confirms Polymarket liquidity; it does not create a new venue. Cover it under the Polymarket adapter.

## Spec fields
- Kind / market model: token launchpad (bonding or bootstrapped liquidity, graduation to a DEX, the adapter's "tokens graduated"). No binary, categorical or scalar markets; no outcome tokens. [M] inferred from site copy and ledger fields
- Chains and collateral: Polygon; native POL (the adapter books volume with `addGasToken`). [H] adapter
- Read API: none official. `api-a/b.wen.markets` were undocumented and are NXDOMAIN. On-chain only: ledger `getStats()` aggregate counters. No docs URL found. NOT FOUND (searched: wen.markets site and bundle, DefiLlama adapter; a WebSearch was attempted but the shared search budget was exhausted, so no external web search was done).
- Trade path: none relevant. A PayBox Polygon wallet could swap the launched ERC20s on a DEX, but those tokens have no event semantics.
- Fees: 1% of trade volume and 7% of liquidity bootstrapped (inferred by DefiLlama's adapter, not read from the contract or docs). [M]
- Resolution / dispute: not applicable.
- Geo / ToS / automation: not assessed beyond the ICC-arbitration boilerplate; moot given the verdict.
- Liquidity: cumulative ledger volume 1.06M POL, 10,252 trades (2026-10-19, on-chain). Polymarket builder volume 3.07M USD all-time (leaderboard, 2026-10-19). Neither is TVL or OI.
- Event overlap with other venues: none.
- Shared liquidity: the builder route shares Polymarket's book, so it is not an independent leg. The launchpad has no overlap.

## Open questions
- Is the "Wen.market" Polymarket builder operated by the wen.markets team? Check the builder profile page and the X account `@wenmarkets`.
- Is the ledger truly idle? An archive RPC scan of ledger events would settle it.

## Sources
- https://wen.markets and https://wen.markets/assets/index-DygVSelo.js [H]
- https://raw.githubusercontent.com/DefiLlama/dimension-adapters/master/fees/wen-markets.ts [H]
- https://data-api.polymarket.com/v1/builders/leaderboard (public GET) [H]
- https://polygon-bor-rpc.publicnode.com (eth_call, eth_getLogs, eth_getCode) [H]
- Fixtures: `docs/research/fixtures/wen-market-wen-markets/`
