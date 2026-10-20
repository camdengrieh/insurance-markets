# SaySo (sayso.market) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: skip. Tiny, demo-grade Sei protocol. Frontend is up (H) but the backend API host refuses connections (H), the repo has been untouched since 2026-03-18 (H), and no TVL/volume/market data is obtainable. The payout model is pool-proportional (parimutuel-like), so the LMSR price is not a clean probability for arbitrage. Only revisit if on-chain reads show real volume.

## Liveness

- Frontend: https://sayso.market returns HTTP 200 (H). It is a static Vite/React SPA on S3+CloudFront; index.html last-modified 2026-04-07 (H). Title "SaySo - Prediction Markets", tagline "Design a market. Call the outcome. Settle in seconds." (H).
- Backend: api.sayso.market resolves (A 195.201.17.207) but TCP 443 connection fails (curl error 7) on every attempt on 2026-10-19 (H). The SPA depends on this API for market lists and relayed (gasless) bets, so the product is likely non-functional or down (M).
- GitHub org sayso-market: created 2026-02-15, one repo `contracts`, last push 2026-03-18, 0 stars, no description or homepage (H: gh api).
- Web search was unavailable (session search budget exhausted), so no independent press, volume or user coverage was checked. NOT FOUND (searched: GitHub org/repo, site bundle; WebSearch blocked by budget).

## Kind and market model

- Kind: on-chain AMM (LMSR), binary YES/NO only (H: README, AMM.sol). No categorical or scalar markets.
- One `AMM` contract per market, deployed permissionlessly by `MarketFactory.createMarket(name, effectiveFrom, effectiveTo, resolutionOpen, resolutionClose, totalSeed, targetPriceBps, resolver, seedProvider)`; minimum seed 10 USDC; LMSR b = seed * 15 (H: MarketFactory.sol).
- Outcomes are NOT tokenised: YES/NO shares are internal mappings (`yesBalances`, `noBalances`) inside each AMM, not ERC-20/1155 (H: AMM.sol). Positions are non-transferable, so no secondary DEX/book.
- Price: `price()` returns YES price as 1e18 fraction via LMSR (50% default when empty) (H).
- Important for arbitrage: on resolution winners split the entire USDC pool pro rata by winning shares (`userShares * totalPoolBalance / totalWinningShares`), not $1 per share (H: AMM.sol, README). The LMSR price is therefore only an indicative quote; true payoff per share depends on final pool balance and share counts. Treat implied probability as unreliable.
- Buy API: `buyYes(maxCost)` / `buyNo(maxCost)` spend a USDC amount; `sellYes(shares)` / `sellNo(shares)` sell shares; `claim()`, `refund()`; 10-block minimum hold before selling (H).
- Some markets are "oracle markets" with a single immutable `resolver` address that calls `resolveAsOracle(outcome, proofHash)` (H: AMM.sol). Site bundle references a `/markets/commodity-prices/...` endpoint, suggesting commodity-price markets (M).

## Chains and collateral

- Sei EVM mainnet, chainId 1329 (H: deployments.json, bundle uses evm-rpc.sei-apis.com).
- Collateral: native Circle USDC on Sei, 6 decimals, `0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392` (H: deployments.json "prod"). A "demo" deployment uses an open-mint MockUSDC (H); verify which set the live site uses (unknown).
- Prod contracts (H, deployedAt 2026-03-17): MarketFactory `0x90E2F23D9CE2928B0066E6706fA05C1253B31a95`, ResolutionOracle `0x33668f501E15297057B7C1736008146D198Fbb9e`, SaySoForwarder `0x1d52636c36F002E6a188e76E407f105f0562562d`, SaySoToken `0x2006Dfe910bF22D5019d25e71D66976827C7F237`. Fixture: docs/research/fixtures/sayso/deployments.json.

## Read API

- Official docs: NOT FOUND (searched: site, repo README, org; no docs site or API reference exists).
- Undocumented app backend (derived from the minified SPA bundle, M): base `https://api.sayso.market`; GET `/config` (contract addresses, relayer address), GET `/markets`, GET `/market/{id}`, GET `/markets/commodity-prices/{x}`, GET `/transactions/{hash}`, POST `/relay/bet`, POST `/markets/{id}/deploy`, `/auth/magic`, `/auth/me`, `/faucet/request`, `/points/me`, `/twitter/*`. Auth is Magic.link login (email) tokens. Live probe: connection refused, so no response shape confirmed (H for the failure). No rate-limit or websocket info.
- Practical read path is on-chain only: `MarketFactory.getMarketCount()/getMarkets(offset,limit)` then per AMM `price()`, `getMarketInfo()`, `getMarketTiming()`, `getUserPosition()`, `calculateClaim()`, plus events `SharesPurchased`, `SharesSold`, `MarketResolved*`, `FeeCollected` for trades (H: source). Requires Sei EVM JSON-RPC (POST), not exercised here per read-only/no-POST rule. Block explorer: seitrace.com (page is client-rendered; no data retrieved).
- Fixtures saved: deployments.json, site-index.html, api-probe.txt (failed probe record).

## Trade path

- Direct on-chain: approve USDC to the AMM then call `buyYes/buyNo/sellYes/sellNo/claim` from any EVM account on Sei (H: source). Calls are gasless via ERC-2771: user signs EIP-712 ForwardRequest (domain name "SaySoForwarder", version "1", uint48 deadline) and a backend relayer submits it; USDC approval via ERC-2612 permit (H: README). The relayer is the project's own backend, which is currently unreachable (H), so gasless path is probably dead; the direct path needs SEI for gas.
- PayBox reachability: partial/no. PayBox supports Base, Ethereum, BNB, Arbitrum, Polygon, Solana per the task framing; Sei EVM (1329) is not in that list (M, not verified against PayBox contract this session; PayBox tools were not called). Even if PayBox could sign the EIP-712 request, the relayer is down. paybox_reachable: no.

## Fees

- 0.5% (FEE_BPS = 50) taken from the gross buy amount, paid by the buyer to `feeCollector` (the deployer address) (H: AMM.sol). No stated sell fee in `sellYes` code; sells pay LMSR payout without fee (H). Market creator pays only the seed. Gas is relayer-paid in the gasless path (H README).

## Resolution and dispute risk

- Two modes (H): (1) token-vote: SAYSO governance token holders stake to ResolutionOracle during the resolution window; >50% of staked weight wins; no votes or a tie means proportional refunds; losing voters are slashed. SaySoToken is owner-mintable, 1B max (README) while deployments.json demo note says 100M (inconsistency, H). (2) single-resolver oracle markets where one immutable address resolves with a proof hash.
- Risk: high. Token-vote resolution is capturable by whoever holds the token (centralised mint authority), the resolver is a single key, the contract is UNLICENSED and has no audit mentioned (NOT FOUND: audit), and admin can pause/refund (pause()/refund() exist). Admin = deployer/relayer.

## Geo / ToS / automation

- NOT FOUND (searched: site HTML, bundle, repo README): no terms, geo-blocking or automation policy. The SPA uses Magic.link email wallets, so there is no KYC visible (M). Direct contract use is permissionless.

## Liquidity

- NOT FOUND. No volume/OI/TVL source; no DefiLlama/analytics entry was checked (search blocked). Minimum seed is 10 USDC per market and demo/mock deployments exist, so expect thin pools (M). Do not rely on any figure.

## Event overlap and independence

- Categories unknown; user-created markets (permissionless) plus possible commodity-price markets (M). Overlap with other venues would only be generic crypto/commodity price questions. Liquidity is independent (own AMMs, no shared pool or order-flow routing) (H from source), so it would be a separate leg, but the pool-proportional payout and non-transferable shares make it a poor arbitrage leg.

## Open questions

- Which deployment (prod vs demo/MockUSDC) does the live frontend use, and does it have any real USDC in pools? Needs `getMarketCount()` and USDC balances via a Sei RPC read.
- Is the api.sayso.market outage permanent?
- Is Sei EVM supported by PayBox?

## Sources

- https://sayso.market (H, fetched 2026-10-19; last-modified 2026-04-07)
- https://sayso.market/assets/index-BAtyVUFm.js (H, bundle inspected for endpoints; embedded third-party keys deliberately not recorded)
- https://github.com/sayso-market and https://github.com/sayso-market/contracts: README.md, deployments.json, contracts/AMM.sol, contracts/MarketFactory.sol (H, via gh api, last commit 2026-03-18)
- https://api.sayso.market/markets and /config (H, connection failed 2026-10-19)
- https://seitrace.com/address/0x90E2F23D9CE2928B0066E6706fA05C1253B31a95 (page rendered no data; no claim relies on it)
