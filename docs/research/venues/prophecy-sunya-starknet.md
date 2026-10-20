# Prophecy Sunya (Starknet) - venue spec

Researched 2026-10-19. Verdict: **skip** (abandoned hackathon-style prototype, no live deployment, no market model, no API).

## Liveness
- GitHub org Prophecy-Sunya created 2025-05-31, 1 public repo (ProphecySunya), 0 stars, 0 forks, 0 followers, org unverified. [H] https://api.github.com/orgs/Prophecy-Sunya
- Last push 2025-06-02 (about 4.5 months before today; no activity since). Branches: main, frontend-dev. No releases. [H] https://github.com/Prophecy-Sunya/ProphecySunya
- Homepage field points to https://prophecy-sunya.vercel.app; unauthenticated GET on / and /markets returns HTTP 404 (Vercel NOT_FOUND) on 2026-10-19. [H]
- Web search (extended) for "Prophecy Sunya" Starknet prediction market returned only unrelated STRK price-prediction pages. No site, docs, social, audit or press found. [M]
- Conclusion: not live. [H for 404 and inactivity; M for "dead", since a private deployment cannot be ruled out]

## What the repo is
- README describes: users create predictions, "AI oracles" verify outcomes, NFTs minted for verified predictions, governance, cross-chain bridge, gas tank. Cairo contracts (prediction, nft, oracle, governance, bridge, gas_tank) plus a Next.js frontend. [H] repo README (frontend-dev branch)
- contracts/prediction/src/prediction_contract.cairo (152 lines): create_prediction, verify_prediction, get_prediction, get_user_predictions. verify_prediction only asserts `oracle_signature != 0` with a "TODO: Implement oracle validation" comment. No stake, price, order book, AMM, collateral, payout or fee logic found in the grep of the file. [H]
- It is a "prediction registry" (a user posts a claim, e.g. "Ethereum will reach $10,000 by end of 2025"), not a two-sided trading market. Frontend uses app/mockdata.ts with hard-coded sample predictions. [H]
- DEPLOYMENT.md covers only a local Starknet Devnet docker-compose flow (localhost:5050). No Sepolia or mainnet addresses found in the repo. [H]

## Template fields
- Kind: onchain-other (Starknet, Cairo). Market model: none implemented (no binary/categorical/scalar tokenisation, no price discovery).
- Chains/collateral: Starknet only, intended. No collateral token defined. Not on any EVM chain.
- Read API: none. NOT FOUND (searched: org, repo, README, DEPLOYMENT.md, homepage, web). Only raw contract ABIs (frontend-ps/abi/*.json) with no deployed addresses.
- Trade path: none (no deployed contracts). Not reachable from a PayBox EVM wallet: Starknet account model, Cairo, different signing; no evidence PayBox supports Starknet. [M]
- Fees: NOT FOUND. Resolution: designed "AI oracle", unimplemented stub. Dispute risk: n/a.
- Geo/ToS/automation: NOT FOUND (no ToS).
- Liquidity: none observed. NOT FOUND (searched: web, repo; no TVL/volume anywhere). Date checked 2026-10-19.
- Category overlap: only sample crypto-price claims in mock data; no real markets.
- Shared liquidity: none.

## Priority
skip. Reason: repo inactive since 2025-06-02, site 404, no deployments, no trading mechanism, no API. Re-check only if the org reappears.

## Suspicious content
None found in the files read. Note: org profile exposes a third-party personal email; deliberately not recorded here.

## Sources
- https://github.com/Prophecy-Sunya (org API: https://api.github.com/orgs/Prophecy-Sunya) [H]
- https://github.com/Prophecy-Sunya/ProphecySunya (README, DEPLOYMENT.md, contracts/prediction, frontend-ps/app/mockdata.ts, read via gh api) [H]
- https://prophecy-sunya.vercel.app (404 on 2026-10-19) [H]
- WebSearch extended, query "Prophecy Sunya Starknet prediction market" (no relevant results) [M]
