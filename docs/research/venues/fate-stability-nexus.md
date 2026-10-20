# Fate Protocol (Stability Nexus) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. The product is not a prediction market in the event-contract sense. It is a perpetual bull/bear pool on a price feed, live only on Sepolia testnet as of the current frontend (one pool ever created, zero trades), with mainnet wiring removed in September 2026. No official read API. Nothing to arbitrage against.

## What it is (H)

- "Decentralized, perpetual prediction market that operates continuously without expiration. It replaces traditional order books with a dual-vault system - users buy and sell bullCoins and bearCoins." Source: README, https://github.com/StabilityNexus/Fate-EVM-Frontend
- Homepage http://evm.fate.stability.nexus/ is a static Next.js export (`output: "export"`, no API routes, no server data path). Source: AGENTS.md in the frontend repo. (H)
- Kind: onchain-amm, more precisely a leveraged long/short pool on an oracle price. Each pool has a base token, a Chainlink-style price feed oracle, a `leverage` parameter, `bullCoin` and `bearCoin` ERC20s, and an accumulator vault. `rebalance` shifts reserves between bull and bear reserves when the oracle price moves (events `Rebalanced`, `RebalanceSkipped`; `wasTransferToBull`, `priceChangePercent`). (H, ABI at src/utils/abi/PredictionPool.ts)
- Market model: NOT binary, NOT categorical, NOT scalar with a resolution date. No expiry, no resolution event, no payout of 1. Outcomes tokenised as two fungible ERC20s per pool (bull/bear) whose value floats with vault reserves. Closer to a perp/power-perp or Djed-style reserve system than an event contract. (H for structure, M for characterisation as perp)
- Pool creation is permissionless via the factory (`createPool`, `createPoolWithAdapter`); the factory accepts any oracle and the frontend filters (ALLOWED/DENIED oracle lists, currently empty = show all). (H, src/utils/oracleAllowlist.ts)

## Still live? (H)

- Repo last pushed 2026-10-19T01:09Z; active commits 2026-10-14 to 2026-10-19 (native-currency trading, "Point the frontend at the October deployment"). Source: `gh api repos/StabilityNexus/Fate-EVM-Frontend/commits`.
- Homepage returns 200 and describes perpetual prediction pools (WebFetch, 2026-10-19). "Explore Pools" shows no listed pools in the fetched static content.
- The live-ness is development-grade only: the current `src/utils/addresses.ts` contains exactly one chain, Sepolia (11155111), factory `0x5882604e18a295bbc904316e0ca872463b48f9ed`, "Deployed 2026-10-14". `chainConfig.ts` supports only Sepolia. (H)
- Commit "Remove the Ethereum Classic wiring (#143)" on 2026-09-19, and Dec 2025 commit removing Ethereum Mainnet, Polygon, BSC and Base support. The README still claims Ethereum, Base, BNB, ETC, Polygon support, with Base/BNB/Ethereum/Polygon factory addresses all `0x000...0` "Pending". The README is stale versus the code. (H)
- Prior ETC mainnet factory `0x6eb2eec7bcc4096e35d7bc467e411a505c7db202` (2025): Blockscout shows zero logs, so no pool was ever created there. Fixture: fixtures/fate-stability-nexus/etc-old-factory-logs-empty.json (H, https://etc.blockscout.com/api/v2/addresses/0x6eb2eec7bcc4096e35d7bc467e411a505c7db202/logs).
- Sepolia factory logs: exactly one `PoolCreated` event (2026-10-16), pool `0xeF44DF2E2CCD36c62c947eCC4376fB0a952e22e2`; pool address has 0 transactions and 0 token transfers per Blockscout counters. Fixtures: sepolia-factory-logs.json, sepolia-pool-counters.json. (H, https://eth-sepolia.blockscout.com/api/v2/addresses/...). Note: pool address counters count txs *to* the pool address; the pool's creator and initial deposit exist but no trading activity visible. Treat as "no real activity" (M).
- Other Stability Nexus Fate repos: Fate-Sui-Frontend (pushed 2026-08-17), Fate-Solana / Fate-Solana-WebUI / Fate-LandingPage (last pushed 2026-02-11). Not investigated further. (H for dates)

## Chains and collateral

- Chains with a deployment in code: Sepolia testnet only (H). Planned/claimed in README: Ethereum, Base, BNB Chain, Ethereum Classic, Polygon (stale/aspirational, L).
- Collateral: any ERC20 `baseToken` chosen at pool creation; Sepolia WETH9 is wired for native-currency trading through a helper contract (`NativeHelpers`). Token lists exist for Ethereum, Base, BSC, Polygon, Sepolia, Milkomeda in src/data/tokens (these are UI lists, not deployments). (H)
- Price feeds offered on Sepolia: ETH/USD, BTC/USD, AUD/USD (Chainlink). (H, src/utils/supportedChainFeed.ts)

## Read API

- exists: **onchain-or-subgraph-only**. No REST API, no subgraph, no websocket. AGENTS.md: "no server components fetching data and no API routes. Every contract read and write happens in the browser." The frontend discovers pools by scanning logs (`scanLogs.ts`) and caches in IndexedDB. (H)
- Docs: no Fate page in https://docs.stability.nexus/llms.txt (index lists only Djed, Gluon, channels, papers). NOT FOUND (searched: docs.stability.nexus/llms.txt, homepage, README, repo tree).
- Onchain reads (if it ever mattered): factory `getPoolCount`, `getAllPools`, `poolsByCreator`, event `PoolCreated(pool, bullCoin, bearCoin, creator, oracle)`; pool `getPoolStats`, `getPoolCounters`, `getCurrentPrice`, `bullReserves`, `bearReserves`, `cumulativeVolume`, `cumulativeFees`, `leverage`, fee getters. (H, ABI in repo; hand-maintained, not generated.)
- Third-party explorer GETs (Blockscout v2) work unauthenticated for Sepolia and ETC. (H)

## Trade path

- Programmatic only by direct contract calls (buy/sell bull or bear coin through coin contracts and pool `beginTrade`/`endTrade`; permit helper `permit.ts` and native helper added 2026-10-19). No order signing, no order book, no relayer. (M, function names from ABI; exact buy/sell entry points not read)
- PayBox reachability: **no** for practical purposes. An EVM wallet could in principle send transaction proposals on Sepolia, but Sepolia is a testnet with valueless assets and PayBox targets mainnets (Base, Ethereum, BNB, Arbitrum, Polygon, Solana). No mainnet deployment exists. (M)

## Fees (H, structure only)

- Pool constructor/factory params: `mintFee`, `burnFee`, `creatorFee`, `treasuryFee` with `DENOMINATOR = 100000` (AGENTS.md). Fees are chosen per pool by the creator; "fixed fees on transactions automatically balance vault reserves" (README). Exact formulas NOT FOUND (searched: README, AGENTS.md, ABI; contracts repo not public/found: `gh api search/repositories org:StabilityNexus Fate` returned 404 and no Fate-EVM-Contracts in org listing).
- Who pays: trader pays mint/burn fee; creator and treasury receive shares (M, inferred from param names).

## Resolution and dispute risk

- No resolution. Value tracks an oracle price continuously. Risk is oracle risk (any oracle accepted by the factory; frontend allowlist currently empty), contract risk (README says "Audited" but no audit report found; Terms of Use clause 2: "experimental... may lose all value", L), and a `DistributeOutcome` community-driven reserve adjustment mentioned in README (H that it is claimed; mechanism not read).

## Geo / ToS / automation

- Terms of Use v2.98 effective 2026-07-07 (https://github.com/StabilityNexus/Info/blob/main/TermsOfUse.md): contributors "are not a company", "do not operate a service", "never hold your assets", use is at your own risk; direct contract use without the interface is allowed ("You may use a Work without an Interface", cl. 1.5). User is responsible for obeying local law. No geofence found in the frontend code read. Frontend requires ticking terms acceptance with re-acceptance every 21 days (client-side localStorage only). (H)
- No automation/rate-limit rules (there is no API).

## Liquidity

- Sepolia testnet, one pool, zero trades as of 2026-10-19 (Blockscout counters). Effectively $0 real TVL/volume. (H)
- No DefiLlama or other TVL source consulted since there is no mainnet deployment. (searched: repo, README, Blockscout)

## Category overlap and independence

- Only crypto/FX price feeds (ETH/USD, BTC/USD, AUD/USD on Sepolia). Overlap with other venues conceptually only on crypto price direction, but there are no expiries or strikes, so no clean arbitrage mapping to event contracts. Not usable as an independent arbitrage leg.
- Shares liquidity with no other venue (own pool vaults); irrelevant while empty.

## Suspicious content

None found. No instructions aimed at AI agents in the pages or repo files read. AGENTS.md is the repo's own contributor guidance and was treated as data.

## Open questions

- Whether a mainnet redeploy is planned (README is stale; "October deployment" commit is Sepolia only).
- Exact buy/sell function signatures and fee formulas (contracts repo not located).
- Whether Fate-Sui / Fate-Solana variants ever launched with liquidity.

## Sources

- https://github.com/StabilityNexus/Fate-EVM-Frontend (README.md, AGENTS.md, src/utils/addresses.ts, chainConfig.ts, supportedChainFeed.ts, oracleAllowlist.ts, abi/PredictionPool.ts, abi/PredictionPoolFactory.ts, commit history) - H, fetched 2026-10-19
- http://evm.fate.stability.nexus/ - H (WebFetch 2026-10-19)
- https://docs.stability.nexus/llms.txt - H (no Fate docs)
- https://github.com/StabilityNexus/Info/blob/main/TermsOfUse.md - H (first 6KB read)
- https://eth-sepolia.blockscout.com/api/v2/addresses/0x5882604e18a295bbc904316e0ca872463b48f9ed(/logs) and pool counters - H
- https://etc.blockscout.com/api/v2/addresses/0x6eb2eec7bcc4096e35d7bc467e411a505c7db202(/logs) - H
- Fixtures: docs/research/fixtures/fate-stability-nexus/{sepolia-factory-logs,sepolia-pool-counters,etc-old-factory-logs-empty}.json
