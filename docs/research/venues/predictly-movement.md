# Predictly (Movement) - venue spec

Researched 2026-10-19. Verdict: **skip**. Frontend still serves, but it is a Movement *testnet* hackathon MVP with test tokens, 3 markets, ~2 MOVE total staked, a suspended backend, and community-judge resolution. Not an arbitrage leg.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Liveness
- Frontend https://predictly-movement.vercel.app returns HTTP 200 (Next.js, landing + /app/dashboard) on 2026-10-19. [H]
- Official backend `https://backend-3ufs.onrender.com` (/api/health and /api/markets) returns HTTP 503 "This service has been suspended." on 2026-10-19. The frontend JS bundle hard-codes this host, so the app UI cannot load groups/markets/auth. [H]
- Org repos last pushed: backend 2026-04-10, contracts 2026-01-07, docs 2026-01-08. Nothing since April 2026. [H]
- Only deployment is Movement **Testnet (Bardock)**, chain_id 250; the node responds (block height ~112.3M). No mainnet address anywhere in README, docs or code. Roadmap says "Mainnet deployment Q1 2025" (never evidenced; roadmap dates are stale). [H]
- Web search was unavailable (session budget exhausted), so third-party/press confirmation of mainnet status is NOT FOUND (searched: GitHub org, README, GitBook repo, on-chain). Absence of a mainnet address in all primary sources is the evidence.

## Market model
- Binary YES/NO only. Multi-outcome is roadmap ("Phase 3"). [H]
- Parimutuel pool: `yes_pool`, `no_pool`; no tokens/shares/order book/AMM. A position is a `Vote` record (amount, prediction 1=YES 2=NO, has_claimed) keyed by voter address per market; one vote per address per market (`E_ALREADY_VOTED`). Positions are not transferable. [H] (market.move)
- Market types: STANDARD (winner takes pool) and NO_LOSS (principal back + share of `total_yield`; yield is simulated by a `mock_lending` module, not real DeFi). [H]
- Stakes bounded by per-market `min_stake`/`max_stake` (live examples: 1 MOVE both). [H]
- Payout (STANDARD): `reward = stake * (yes_pool+no_pool) / winning_pool`; losers get 0; outcome INVALID refunds stake. No fee in the contract. [H]
- Implied price from `get_percentages` = pool share in bps (5000/5000 if empty). Because payout is final-pool-dependent and one-vote-per-address, the price is not a locked-in execution price. [H]
- Markets are social/private, created inside friend groups; many are joke or personal questions ("Will sigma cat be rizz"). [H]

## Chains and collateral
- Movement Network (Move VM, Aptos-style); collateral native MOVE (`0x1::aptos_coin::AptosCoin`) on testnet = valueless faucet tokens. [H]
- Contract/admin address `0x9161980be9b78e96ddae98ceb289f6f4cda5e4af70667667ff9af8438a94e565`, module `predictly::market` (+ `predictly::mock_lending`). Public project address, not a user address. [H]
- Wallets: Nightly, Petra, Martian. [H]

## Read API
- Official REST backend (Express/Prisma, Swagger at `/api`): suspended (503). Documented endpoints (backend README): `GET /api/markets/:id`, `GET /api/groups/:groupId/markets`, `GET /api/predictions`, `GET /api/contract/info`, `GET /api/contract/markets/:marketId`, `GET /api/contract/markets/:marketId/votes/:voter`. Many require JWT (wallet-signature login). No websocket documented. Rate limiting exists (`docs/RATE_LIMITING.md`, not read). [H for docs, backend dead]
- Working read path: public Movement testnet node, unauthenticated.
  - Base: `https://testnet.movementnetwork.xyz/v1` (ledger info at root). [H]
  - `POST /v1/view` with function `<ADDR>::market::get_market_count|get_market_state|get_percentages|get_market_pools|get_market_status|get_market_outcome|get_vote|calculate_reward`, args `[admin_addr, market_id, ...]`. [H]
  - `GET /v1/accounts/<ADDR>/resources` returns full `MarketRegistry` (all markets in one SimpleMap), `MarketVault`, `VoteRegistry`. [H]
  - No discovery/search; all markets are under one admin address (the project's), `market_count` = 3. Third-party deployers of the module would be undiscoverable. [H]
- Fixtures: `docs/research/fixtures/predictly-movement/` (chain_info.json, view_get_market_count.json, view_get_market_state_{0,1,2}.json, view_get_percentages_1.json). [H]

## Trade path
- Programmatic: Move entry functions `place_vote(voter, admin_addr, market_id, prediction u8, amount u64)`, `create_market`, `resolve`, `claim_reward`. Signed by an Aptos/Ed25519 account on Movement. The backend only builds payloads (`/api/contract/build/*`, JWT required). [H]
- PayBox reachability: **no**. An EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) and Solana cannot sign Movement/Aptos transactions or hold MOVE. Not reachable via EVM transaction proposals or signed orders. (PayBox Movement support not checked; NOT FOUND, and moot because venue is testnet.) [M]

## Fees
- Contract: none. Docs (Revenue-Model.md) claim a 1-3% fee on pool at resolution plus subscription plans; contract code (market.move) contains no fee logic, so docs and code disagree. Gas on testnet; backend relay wallet pays for market initialisation. [H]

## Resolution
- Single `resolver` address per market (creator/group judge) calls `resolve(outcome ∈ YES/NO/INVALID)`. No oracle, no dispute window, no bonding. High trust/manipulation risk. [H]

## Geo / ToS / automation
- No ToS, geo-restriction or API-use policy found (NOT FOUND: searched README, docs repo, site). Wallet-auth, no KYC claimed. [H/M]

## Liquidity
- On-chain testnet snapshot 2026-10-19: 3 markets; vault balances 0 / 1 / 1 MOVE-equivalent (100,000,000 octas = 1 MOVE with 8 decimals); 2 participants max. Zero real-dollar value. [H]
- Markets 1 and 2 had `end_time` in Mar/Apr 2026 yet still status ACTIVE (unresolved) on 2026-10-19, showing resolvers do not act. [H]

## Event overlap / shared liquidity
- Category overlap with other venues: essentially none. Questions are personal/social; one placeholder market ("Bitcoin price prediction for 2026", end_time 1735689600 = 2025-01-01) is a test entry. Liquidity is independent but zero. [H]

## Adapter notes (if ever wanted)
- Read-only adapter would poll `/v1/accounts/<ADDR>/resources` resource `market::MarketRegistry`; not worth building. Revisit only if a mainnet address and non-zero TVL appear.

## Suspicious content
- None found. README/docs contain only marketing text; no instructions aimed at agents.

## Sources
- https://predictly-movement.vercel.app (fetched, HTTP 200; bundle references backend host) [H]
- https://backend-3ufs.onrender.com/api/health (HTTP 503 suspended) [H]
- https://github.com/Predictly-Labs (repos: backend, contracts, docs, .github; pushed dates via gh api) [H]
- .github/profile/README.md, backend/README.md, contracts/README.md, contracts/predictly/sources/market.move, docs/docs/Business/Revenue-Model.md, docs/docs/Deployments/Contract-Addresses.md (via gh api raw) [H]
- https://testnet.movementnetwork.xyz/v1 (ledger info, /accounts/.../modules, /resources, POST /view) [H]
- https://predictly-labs.gitbook.io/predictly-labs-docs (HTTP 200, content not separately read; repo markdown read instead) [H]
