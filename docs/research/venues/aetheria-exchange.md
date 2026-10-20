# Aetheria Exchange - venue spec (researched 2026-10-19)

Verdict: live but effectively a hackathon demo. Adapter priority: **skip** (signal-only at best).
Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Summary
- Live on X Layer mainnet (chain 196) since 2026-08-20; one tiny Solidity contract (`OutcomeMarket`), native-OKB parimutuel YES/NO pools, owner-only resolution. [H]
- Cumulative stake across all 234 markets ever created is about 1.06 OKB (about 0.047 OKB in the 5 still-"open" markets). Essentially zero liquidity. [H, live /api/markets 2026-10-19]
- Markets are mostly venue-authored (PULSE/RWA metric thresholds on OKB, X Layer, RWA TVL), not overlapping other venues. 166 of 234 markets were cancelled with empty pools. [H]
- Last repo commit 2026-08-25; site and API still respond 2026-10-19 and the drafter is still creating daily markets (latest id 233 ends 2026-10-19). [H]

## Kind and market model
- Parimutuel, binary YES/NO only. Two pools per market (`yesPool`, `noPool`); no order book, no AMM, no share tokens. Positions are mapping entries (`yesStakeOf`, `noStakeOf`), not ERC-20/1155, and cannot be sold or transferred. Implied probability = pool ratio. Payout ratio is set by pools at close, not at entry. [H: contracts/OutcomeMarket.sol, docs parimutuel.md]
- `createMarket(title, endTime, category)` is permissionless (free-text title, no oracle binding). [H]
- Categories seen on-chain: PULSE 178, RWA 47, SPORTS 5, CRYPTO 2, MACRO 1, EQUITY 1. [H, /api/markets 2026-10-19]

## Chains and collateral
- X Layer mainnet chain 196, contract `0xA82EDb5e111c31C63E06EF0007f2fa1a9e7EB30d`, deploy block 68469454. Same address on X Layer testnet 1952 (legacy). [H: docs contracts-api.md, README]
- Collateral is native OKB (msg.value), 18 decimals. No stablecoin. [H]
- RPC in the app config: https://rpc.xlayer.tech (public RPC caps eth_getLogs to 100 blocks). Multicall3 available at the canonical address. [H: frontend/src/lib/chains.ts, docs]

## Read API
- Official-ish public HTTP: `GET https://www.aetheria.exchange/api/markets` (apex 308-redirects to www). `?chainId=196|1952` optional. No auth. Returns `{chainId, venue, markets:[{id,title,category,endTime,status,outcome,yesPoolOkb,noPoolOkb,yesPct}]}`. status: 0 Open, 1 Resolved, 2 Cancelled. [H, confirmed with live GET 200, 54.6KB]
- Caveats: the route does one RPC read per market on every request and took about 85 s (one earlier call timed out at 40 s) with 234 markets, so it is unusable for polling. Pools are returned in OKB, no USD value. `yesPct` is integer percent. [H]
- Better path for an adapter: read the contract directly via RPC (`marketCount()`, `getMarket(id)`, Multicall3) or events (`MarketCreated`, `SharesBought`, `MarketResolved`, `MarketCancelled`, `PayoutClaimed`). Full event history needs an indexer (none; roadmap). I did not issue JSON-RPC calls (POST) this session. [M]
- Other routes (`/api/ai/odds`, `/api/ai/intent`, `/api/agent-log`, `/api/memory`, `/api/dex/swap`) are POST or AI/ops feeds, not market data. `/api/agent-log` GET has a `?since=` cursor. Not exercised. [H docs; not tested]
- Rate limits: NOT FOUND (searched: docs contracts-api.md, README, repo route sources). Docs: https://www.aetheria.exchange/docs . Websocket: NOT FOUND.
- Fixture: docs/research/fixtures/aetheria-exchange/api-markets-sample.json (truncated sample).

## Trade path
- On-chain only; no order API. EVM tx: `buyShares(marketId, bool isYes)` payable with OKB value; `claimPayout(marketId)` after settlement; `forceCancelStale(marketId)` by anyone 7 days after close if unsettled. [H]
- No signed-order scheme, no off-chain book. A wallet transacts directly. [H]
- Optional "hedge" leg is a separate OKX DEX aggregator swap built by `/api/dex/swap` (server HMAC-signs the OKX request) and signed by the user; irrelevant to the market itself. [H README, docs okx-execution]

## PayBox reachability
- **no** (as of this session). Requires an EVM wallet funded with native OKB on X Layer (chain 196). Not verified that PayBox supports X Layer; its listed chains in the task are Base, Ethereum, BNB, Arbitrum, Polygon, Solana. If PayBox ever supports arbitrary EVM chains, a plain contract-call proposal to `buyShares` would suffice, but there is no way to exit a position before settlement. [M: PayBox X Layer support not checked]

## Fees
- 2% (`FEE_BPS=200`) of the **losing pool** only, taken at resolution and sent to `feeRecipient`. Payout = stake + stake * (losePool - 2% losePool) / winPool. No fee on entry, none on refunds. Gas in OKB. [H: contract source]

## Resolution and dispute risk
- `resolveMarket(id, outcome)` is `onlyOwner`, no on-chain oracle, no dispute window. A bot ("resolver", hourly cron) auto-settles only venue-authored PULSE/RWA/EQUITY markets from CoinGecko, DefiLlama, Yahoo Finance, refusing readings within 1% of threshold; everything else (including SPORTS, MACRO, CRYPTO) goes to a manual owner queue. [H: docs resolution.md, trust-model.md]
- Owner can cancel any open market (full refunds); anyone can force-cancel after 7 days. A malicious/slow owner can settle falsely or stall for 7 days. Docs state code is unaudited and "hackathon-stage". [H]
- Observed: 166/234 markets cancelled (mostly empty). Some past-sport markets resolved. [H]

## Geo / ToS / automation
- No ToS, geo-restriction or API usage policy found on the site, docs or repo (searched: homepage, docs content files, README). README only has a risk disclaimer ("Unaudited software handling real funds"). Repo has no license (GitHub license field null). NOT FOUND otherwise. [H]

## Liquidity
- Total ever staked across all markets about 1.063 OKB (sum of yes+no pools, 234 markets, read 2026-10-19). Open markets hold about 0.047 OKB. Typical market has 0.004/0.016 OKB pools (market-maker seeding). Top market pools about 0.02 OKB. [H]
- Market-maker agent seeds both sides itself, so volume is mostly venue self-trading. [H docs]
- No TVL/volume claims on the site homepage. The "1/4 AGENTS ONLINE" status on the homepage suggests partial ops. [H]

## Event overlap (arbitrage relevance)
- Sports: 5 EPL fixtures from August 2026 only (stale). Macro/crypto: 3 one-off markets ("Fed cuts rates at the September FOMC", "BTC trades above $150K before Dec 31, 2026", "OKB sets a new all-time high in 2026"). Equity: 1 TSLA close market. Overlap exists in principle but all are zero or dust liquidity and the platform is not a viable arb leg. [H]
- Daily PULSE/RWA metric markets (OKB volume, X Layer TVL, RWA TVL) are unique to this venue; possible weak signal only.

## Shared liquidity
- None. Independent contract, but the only liquidity is the venue's own market-maker bot. [H]

## Priority
- skip. Reasons: dust liquidity (about 1 OKB lifetime), parimutuel with no exit and unpriced entry (price changes until close), owner-key resolution, no ToS, slow API, non-supported chain for PayBox, hackathon repo with no commits since 2026-08-25. If ever added, treat as signal-only P2 via direct contract reads.

## Suspicious content
- None found. No instructions aimed at AI agents in the homepage, docs or README. (The repo contains CLAUDE.md, claude_execution.md and master_plan.md, build notes for the author's own agent; not followed or read in detail.) [H]

## Sources
- https://aetheria.exchange/ (homepage, via WebFetch, 2026-10-19) [H]
- https://www.aetheria.exchange/api/markets (live GET, 2026-10-19) [H]
- https://www.aetheria.exchange/receipts (fetched, page did not render listing) [L]
- https://github.com/mrnetwork0001/AetheriaExchange : README.md, contracts/contracts/OutcomeMarket.sol, frontend/docs-content/{contracts-api,parimutuel,resolution,trust-model}.md, frontend/src/app/api/markets/route.ts, frontend/src/lib/chains.ts; repo created 2026-08-11, last push 2026-08-25 (via gh api) [H]
- Not checked: X Layer explorer for on-chain balance/txs, PayBox X Layer support, JSON-RPC (POST) reads.
