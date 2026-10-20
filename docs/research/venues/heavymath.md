# Heavymath (johnqh/heavymath_contracts) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: skip. This is a pre-launch, testnet-only prediction market codebase by a small team (Sudobility Inc.). No mainnet deployment, no live site, no public API, no volume. Re-check in a few months only if a mainnet DEPLOYED entry appears.

## Is it live?

- NOT live as a product (H). `DEPLOYED.json` on main lists only `sepolia`, `arbitrumSepolia` and a local `hardhat` network. The Arbitrum Sepolia stake token is a "MockUSDC (mUSDC, owner-mintable)". No mainnet entry. Source: https://github.com/johnqh/heavymath_contracts/blob/main/DEPLOYED.json (fixture: docs/research/fixtures/heavymath/DEPLOYED.json).
- The UI package's `contracts.ts` has the zero address for predictionMarket/dealerNFT/oracleResolver on mainnet, Polygon, Arbitrum and Optimism (H). Source: https://github.com/johnqh/heavymath_ui (src/config/contracts.ts). Default chain is Sepolia (H, src/config/chains.ts).
- Code is under active development (H): repo `pushed_at` 2026-10-16, npm latest 0.1.77 published 2026-09-26, package created 2025-12-26 (npm registry, fixture npm-meta.json). npm downloads 587 in the month to 2026-10-16 (H, https://api.npmjs.org/downloads/point/last-month/@sudobility/heavymath_contracts), i.e. negligible.
- The repo is `johnqh/heavymath_contracts` (H). The discovery link `heavymath/heavymath_contracts` returns 404 (H); `heavymath` GitHub org does not exist (H). npm `homepage`/`bugs` still point at the 404 org path.
- Domains: heavymath.xyz, heavymath.app, heavymath.io, www.heavymath.io, api.heavymath.io do not resolve (H, curl). heavymath.com timed out (not investigated). Web search (extended) found no site, news, audit or launch announcement; only the GitHub repo and npm/jsDelivr listings (M).

## Kind and market model

- kind: onchain-other. Parimutuel-like "percentage-prediction" pool market (H, README + CLAUDE.md in the repo).
- Users stake USDC at an integer percentage point 0-100 (a conviction/odds position, not a share purchase). Predictions can be updated or withdrawn before the deadline.
- After the deadline anyone calls `lockMarket`: an O(101) scan computes two "split boundaries" (the "dual-boundary" split) with capital-adequacy constraints; stakes between the boundaries are refunded, boundary stakes are trimmed. Then the market is resolved to a binary outcome (positive / negative). Positive: predictors at or above the positive boundary win; negative: at or below the negative boundary win. Winners share the pool pro rata to their stake. (H, CLAUDE.md "Core Algorithm").
- Outcomes are NOT tokenised: positions are rows in contract storage (`predictions[marketId][address]`), not ERC-20/1155. No order book, no AMM, no tradeable share price. There is no way to exit after the deadline and no secondary market.
- Implication: there is no price. The implied probability is the stake-weighted percentage distribution, and the final payout depends on the lock split, so a Yes/No quote comparable to other venues cannot be derived ahead of lock without simulating the algorithm (`calculate.ts` reference implementation exists in the repo, H).
- Market creation is permissioned: a "Dealer" must hold a DealerNFT (ERC721 license, minted by paying `mintPrice` in the stake token; category/subcategory permissions) (H).

## Chains and collateral

- Solidity 0.8.24, three UUPS-upgradeable contracts: PredictionMarket, DealerNFT, OracleResolver (H). Owner can upgrade the proxies and set fees, pause, and set test mode (`setTestMode` bypasses time checks) (H).
- Deployed: Ethereum Sepolia (2026-04-21) and Arbitrum Sepolia (2026-05-15) only (H). Hardhat config contains mainnet/Polygon/Optimism/Arbitrum/Base network entries, but those are just config, not deployments (H). Solana support: package keywords say Solana, but `src/solana/index.ts` is an empty shell and the Anchor program dir does not exist (H, CLAUDE.md "NOT IMPLEMENTED - no programs/ dir").
- Collateral: single ERC-20 `stakeToken` (USDC intended, 6 decimals; test deployments use mock USDC) (H).

## Read API

- exists: onchain-or-subgraph-only (effectively none public).
- On-chain views on PredictionMarket: `markets`, `predictions`, `percentageTotals`, `marketPools`, `calculateMarketSplit`, `isWinner`, `calculatePayout`, `getRefundAmount`, `getLockRefundAmount`, `marketCounter` (H, CLAUDE.md). Only testnet proxies exist (addresses in fixture).
- A separate backend indexer (`@sudobility/heavymath_indexer`, Ponder-style, client default `http://localhost:42069`) exists with REST + SSE hooks (`useActiveMarkets`, `useMarketPredictions`, `useMarketStats`, `useHealth`, SSE `useAllMarketUpdates`) (H, https://github.com/johnqh/heavymath_indexer_client README). The indexer repo itself is not in the `johnqh` repo list I could see, and no public hosted URL is documented (NOT FOUND: searched repo READMEs, CLAUDE.md, ui config, DNS for heavymath.{io,app,xyz} and api.heavymath.io).
- Official docs site: NOT FOUND. Docs are in-repo markdown (README, CLAUDE.md, docs/CALCULATIONS.md, docs/CHAINLINK.md, docs/IMPROVEMENTS.md).
- No fixtures of API responses: nothing public to GET. Saved instead: DEPLOYED.json and npm-meta.json under docs/research/fixtures/heavymath/.
- Rate limits / websocket: NOT FOUND (indexer SSE only, undeployed).

## Trade path

- Programmatic only via direct contract calls: `placePrediction(marketId, percentage, amount)` after ERC-20 approve; `updatePrediction`, `withdrawPrediction`, `claimWinnings`, `claimRefund`, `claimLockRefund`. TypeScript SDK `EVMPredictionClient` (viem) wraps these (H, README).
- No signed-order/off-chain order flow; standard EOA transaction signing.
- paybox_reachable: partial in principle, no in practice. A PayBox EVM wallet could propose `approve` + `placePrediction` as plain contract-call transactions on Sepolia/Arbitrum Sepolia, but there is no mainnet deployment and testnet collateral has no value. Nothing to trade.

## Fees

- `winnerFeeBps` default 100 (1%), max 1000 (10%), owner-settable; applied to the distributable pool after refunds/trimming; `dealerSharePercent` default 50 (dealer vs platform split of that fee). Winners receive `(own stake / total winning stakes) * (distributablePool - fee)`. Paid by winners out of the pool (H, CLAUDE.md "Fee calculation"). Gas on the chain also applies. Deposits are free; no withdrawal fee documented.

## Resolution and dispute risk

- Multiple paths (H): dealer manual `resolveMarket` (non-oracle markets), `resolveMarketByResolver` (owner-set resolver address), `resolveMarketWithOracle` (OracleResolver: Manual / PriceFeed / CustomData; values normalised `(v-min)*100/(max-min)`), and async Chainlink request which fetches `{apiBaseUrl}{chainId}-{marketId}/resolve` (docs example host api.heavymath.io, which does not resolve) and reads a 0/1 `result` (H, docs/CHAINLINK.md). If unresolved 24h after lock grace, anyone can `abandonMarket` for full refunds.
- Dispute risk: HIGH. Dealer or operator centrally resolves; no dispute window or bonded challenge process documented; owner-upgradeable proxies; owner can set resolver and test mode.
- Min market duration 24h (`MIN_DURATION`) (H).

## Geo / ToS / automation

- NOT FOUND: no ToS, geo-block or automation policy (no site). Code licence is BUSL-1.1 (Licensor Sudobility Inc., Additional Use Grant: None, Change Date 2029-11-13 to GPL-3.0+) (H, repo LICENSE.md): production use of the licensed code, including forks/derivative deployments, needs a commercial licence. Reading deployed contracts/using the venue is separate from licensing, but do not vendor its code into the adapter.

## Liquidity

- None measurable. Testnet only; no mainnet TVL/volume/OI. (H as of 2026-10-19: DEPLOYED.json lacks mainnet.) No DefiLlama or similar listing found (M, web search).

## Event overlap and arbitrage relevance

- UI mentions sports data (10 sport codes, "UpcomingGamesWidget") and Chainlink price-feed oracle type, so intended categories are sports and crypto price (H, heavymath_ui CLAUDE.md; M for intent). No live markets, so no overlap exists today.
- Mechanism makes cross-venue arbitrage impractical even if live: no tradeable price, no exit before deadline, payout depends on the lock split, resolution by dealer.
- Shared liquidity with another venue: none (independent, but empty).

## Integration notes (if it ever launches)

- Adapter would be on-chain-only (viem log scan of market/prediction events, `calculateMarketSplit` view) unless a hosted indexer API appears. Treat as a signal source at most. Watch: `DEPLOYED.json` mainnet key, a resolving domain, npm releases (`npm view @sudobility/heavymath_contracts time`).

## Open questions

- Whether a hosted indexer or a private beta exists elsewhere (nothing public found).
- Whether `heavymath_app` (frontend web app, referenced in READMEs) is public; the repo is not visible under johnqh (searched `gh api users/johnqh/repos` filter "heavymath": contracts, indexer_client, lib, types, ui only).

## Suspicious content

- None observed. (The repo's CLAUDE.md contains instructions aimed at its own coding agent about git policy; ignored, not relevant.)

## Sources

- https://github.com/johnqh/heavymath_contracts (README.md, CLAUDE.md, DEPLOYED.json, LICENSE.md, docs/CHAINLINK.md, hardhat.config.cts, .env.example key names only) - H
- https://github.com/johnqh/heavymath_ui (CLAUDE.md, src/config/contracts.ts, src/config/chains.ts) - H
- https://github.com/johnqh/heavymath_indexer_client (README.md) - H
- https://registry.npmjs.org/@sudobility/heavymath_contracts and https://www.npmjs.com/package/@sudobility/heavymath_contracts - H
- https://api.npmjs.org/downloads/point/last-month/@sudobility/heavymath_contracts - H
- WebSearch extended: "Heavymath prediction market dual-boundary market splits", "heavymath prediction market app mainnet launch" - no independent coverage (M)
- DNS/HTTP probes of heavymath.{xyz,app,io,com}, api/www.heavymath.io - H (unresolvable except .com timeout)

Fixtures: docs/research/fixtures/heavymath/DEPLOYED.json, docs/research/fixtures/heavymath/npm-meta.json
