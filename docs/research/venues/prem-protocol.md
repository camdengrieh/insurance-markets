# Prem Protocol (TON) - venue spec

Researched 2026-10-19. Verdict: DEAD / abandoned hackathon-style project. adapter_priority = skip.

## Status (still live?)
- NO. Last commit to either repo is 2024-08-07; org created and last updated 2024-07-29. No site, no docs, no mainnet deployment found. [H]
- Org PremProtocol has 2 repos: prem-core (Tact contracts) and prem-ui (Telegram mini-app), 0 stars, 0 followers. [H] https://github.com/PremProtocol
- prem-core README: "Testnet Address: TBD / Mainnet Address: TBD". [H] https://github.com/PremProtocol/prem-core/blob/main/README.md
- prem-ui reads only `VITE_TESTNET_MARKET_FACTORY_CONTRACT_V0_1/V0_2` (testnet factories); no mainnet address in source. [H] src/hooks/useMarketFactoryContract.ts. (The .env files in prem-ui were deliberately NOT read.)
- Only frontend: https://premprotocol.github.io/prem-ui, which serves a default "Vite + React + TS" page (WebFetch, 2026-10-19). [H]
- premprotocol.com redirects to a GoDaddy for-sale page (domain parked, unrelated to the project). [M]
- Roadmap in prem-ui README promised Q4 2024 USDT bets, Q1 2025 jetton pre-market; none visible. [H]/[M]
- Web search budget was exhausted this session, so no news/social/Telegram-bot confirmation was possible. Absence of evidence only. [L]

## Market model
- Binary only (numOutcomes = 2, outcomeName1/2). Pool-based parimutuel with an optional LP seed: bets add to per-outcome totals; winners split totalPool pro rata (`userShare = betAmount * totalPool / winningSideBets`). Not an order book, no tradable outcome tokens; each bet is a per-user `UserBet` child contract. [H] https://github.com/PremProtocol/prem-core/blob/main/contracts/prediction_market.tact
- Payouts depend on final pool at claim, so no live price that can be quoted for an executable trade. Implied odds exist only as pool ratios.

## Chain / collateral
- TON, native TON only (USDT was roadmap only). [H]

## Read API
- Official API: none. On-chain get-methods only (`predictionMarketDetails`, `totalPool`, `totalBetForOutcome`, `resolvedOutcome`, `isResolved`) via any TON RPC. No subgraph, no REST, no websocket. [H] NOT FOUND (searched: org repos, README, UI source, github.io site).
- No fixtures saved: no live public API and no deployed mainnet contract to query.

## Trade path
- TON Connect wallet sends `PlaceBet` message to market contract. TON-only; not an EVM address. [H]
- PayBox reachable: no (TON wallet not an EVM/Solana chain). [M]

## Fees
- Protocol fee 1% of each bet (`protocolFeePercentage = 10`, divided by 1000), taken from the bet before pooling; plus TON gas (~0.04 TON PlaceBet per README table). [H]

## Resolution
- Centralised: only market `owner` or `protocolOwner` can call `ResolveMarket` after endTime. No oracle, no dispute process. Market creation was deployer-only. High resolution/rug risk. [H]

## Geo/ToS/automation
- NOT FOUND (no ToS, no site).

## Liquidity
- None observed; testnet/unreleased. NOT FOUND (searched: org, README, UI).

## Category overlap
- Generic user-created events (UI has a category list), no live markets; no arbitrage overlap.

## Liquidity sharing
- None; standalone.

## Suspicious content
- None found in repos. Note: org profile exposes a personal contact email of the developer; not recorded here. prem-ui commits .env files (not read).

## Sources
- https://github.com/PremProtocol (org via gh api, 2026-10-19) [H]
- https://github.com/PremProtocol/prem-core (README, contracts/prediction_market.tact) [H]
- https://github.com/PremProtocol/prem-ui (README, hooks, tonconnect manifest) [H]
- https://premprotocol.github.io/prem-ui [H]
- https://premprotocol.com (GoDaddy for-sale redirect) [M]
