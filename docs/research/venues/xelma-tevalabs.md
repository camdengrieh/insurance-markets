# Xelma (TevaLabs) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Xelma is an actively developed (many contributor PRs) but **testnet-only, virtual-token ("vXLM") demo/game** on Stellar Soroban. There is no real-money collateral deployed, no mainnet contract ID, no public API host, a single-asset (XLM price) question set, and a single trusted oracle. Nothing to arbitrage against, nothing to hedge with.

## Is it live?

- Repo TevaLabs/Xelma-Blockchain: created 2025-12-12, last push 2026-09-29, MIT, not archived, 6 stars, 116 forks, 81 open issues. H - `gh api repos/TevaLabs/Xelma-Blockchain`
- Sibling repos active: Xelma-Backend (push 2026-09-30), Xelma-Frontend (push 2026-10-01, homepage https://xelma-frontend.vercel.app). H - `gh api orgs/TevaLabs/repos`
- Frontend at https://xelma-frontend.vercel.app returns 200 (Vite SPA, title "Xelma - Stellar Prediction Market"; og:url points to https://xelma.io/ which does NOT resolve in DNS). `/api/health` and `/api/rounds/active` on the Vercel host return 404 (the SPA does not serve the API). H - unauthenticated GET, 2026-10-19
- README status: "Production-ready for testnet. External audit recommended before mainnet deployment." Networks: "Testnet (development) / Mainnet (future)". Roadmap lines "Deploy to Stellar testnet", "Mainnet deployment" are unchecked. H - README.md
- Frontend `.env.example` default `VITE_STELLAR_NETWORK=TESTNET`, with Friendbot (testnet faucet) CTA. Backend `.env.example`: `SOROBAN_NETWORK=testnet`, `SOROBAN_CONTRACT_ID=` blank. H - Xelma-Frontend / Xelma-Backend repos
- npm `@tevalabs/xelma-bindings` has one version, 1.0.0, published 2026-02-19 (stale vs repo, which keeps changing). H - registry.npmjs.org
- No contract ID, mainnet or testnet, is published in the repo docs I read. NOT FOUND (searched: README, PROTOCOL_SPEC.md, DEPLOYMENT_RUNBOOK.md, backend/frontend .env.example, bindings). No official website/domain found (xelma.io does not resolve); WebSearch extended returned only the GitHub repo. NOT FOUND.

## Kind and market model

- kind: onchain-other (Stellar / Soroban). H
- Round-based **parimutuel**, not an order book or AMM. Admin creates one active round at a time (start price, mode, duration in ledgers); users stake once per round. H - PROTOCOL_SPEC.md
  - Mode 0 Up/Down (binary): winners get stake plus a proportional share of the losing pool; unchanged price refunds everyone. Optional admin-enabled early cash-out (UpDown only) with penalty bps. H
  - Mode 1 Precision ("Legends"): closest price guess wins the whole pot (ties split; remainder to lowest-address winner); commit-reveal (SHA-256 hash + salt). Scalar-ish exact-price game. H (the backend README separately describes LEGENDS as range-based; docs disagree, M)
- No outcome tokens; positions are contract storage keyed by (round_id, address). H
- Question set is a single, fixed question family: "will XLM/USD be up or down after N ledgers (~5 s each)". H

## Chains and collateral

- Stellar Soroban only. Collateral is **virtual vXLM** (1000 minted free per new user; 1 vXLM = 10_000_000 stroops internal units). H - README, PROTOCOL_SPEC.md
- `collateral.rs` has a `CollateralMode::RealToken` (SAC token) option, so a real-token mode is coded but no deployment using it was found. H (code) / NOT FOUND (deployment)
- Not an EVM chain; no Base/Ethereum/BNB/Arbitrum/Polygon/Solana presence.

## Read API

- exists: **unofficial-only / self-host** (no hosted public API found). The backend repo defines a REST + Socket.IO API, but no production base URL is published; docs are an in-repo README plus Swagger at `/api-docs` on a self-hosted instance. H (repo) / NOT FOUND (hosted endpoint).
- Docs: https://github.com/TevaLabs/Xelma-Backend/blob/main/README.md ; protocol spec https://github.com/TevaLabs/Xelma-Blockchain/blob/main/PROTOCOL_SPEC.md ; event schema docs/EVENT_SCHEMA.md in the contract repo. H
- Backend endpoints (as documented, not exercised because no host): `GET /api/rounds/active`, `GET /api/rounds/:id`, `GET /api/predictions/round/:roundId`, `GET /api/price`, `GET /api/leaderboard`, `GET /api/health`; writes need JWT from wallet-signed challenge (`POST /api/auth/challenge`, `/connect`). H (README)
- On-chain read: Soroban RPC `https://soroban-testnet.stellar.org` (public, testnet), simulate calls against the contract; needs a contract ID that is not published. M
- Rate limits / websocket: Socket.IO for live prices and rounds, express rate limiter (values not documented). H/NOT FOUND
- Fixtures: none saved. The only reachable host (Vercel frontend) serves HTML only; no public JSON endpoint to sample. NOT FOUND (public unauthenticated JSON).

## Trade path

- Via the backend: wallet-signed challenge -> JWT -> `POST /api/predictions/submit` or `/api/bets/*` (a `BET_STUB_MODE` exists, so bets may not hit chain). H (README)
- Direct: Soroban contract call `place_bet(user, amount, side)` signed by a Stellar (ed25519) account via Freighter or SDK. H (bindings spec)
- PayBox reachability: **no**. Stellar accounts are not EVM wallets and a Base/Ethereum/BNB/Arbitrum/Polygon/Solana key cannot sign Soroban auth entries. And the stakes are play money anyway. paybox_reachable = no. M/H

## Fees

- Optional protocol fee `ProtocolFeeBps` (disabled when unset), with a fee-incidence model FeeOnPot (default) or FeeOnWinnings; timelocked config change; hard cap enforced in contract (cap value not read). Early-cash-out penalty goes to the fee treasury. Network fee ~0.00001 XLM claimed. H - PROTOCOL_SPEC.md, contracts/src/types.rs, config.rs

## Resolution mechanism and dispute risk

- Single trusted oracle signer submits an `OraclePayload` (price, timestamp, round_id, nonce, contract_addr, network_id); contract checks binding/freshness/replay but "does not currently prove oracle correctness on-chain". Backend oracle polls CoinGecko every 10 s (CoinCap fallback). An `oracle_committee.rs` module exists (multi-feed quorum) but is not shown as deployed. Admin can pause, cancel (refund) and override deviation guards. No dispute process. H - PROTOCOL_SPEC.md, Backend README

## Geo / ToS / automation

- No ToS, geo restriction or automation policy found. README claims "no KYC", and roadmap says "Expand to real money markets (with proper licensing)". NOT FOUND (searched: README, GOVERNANCE.md, SUPPORT.md, site).

## Liquidity

- Zero real liquidity: virtual tokens only, testnet. No volume/OI/TVL published anywhere. NOT FOUND. Date of check 2026-10-19.

## Event overlap with other venues

- Only XLM/USD short-horizon up/down (a few minutes). Other venues have crypto price markets, but nothing meaningful on XLM at this horizon, and a play-money leg cannot be hedged. No arbitrage overlap.
- Liquidity shared with another venue: no (nothing real to share).

## Adapter priority

skip. Revisit only if a mainnet contract ID with `CollateralMode::RealToken` and a hosted read API appear (watch the Xelma-Backend/Frontend repos, the frontend `VITE_STELLAR_NETWORK`, and the deploy runbook's mainnet checklist). As a signal source it has no value either (XLM-only, game-driven flow).

## Suspicious content

None found. Repo contains ordinary dev material (`.claude/` dir and `PR_510.md` in the contract repo, not read).

## Sources

- https://github.com/TevaLabs/Xelma-Blockchain (README.md, PROTOCOL_SPEC.md, docs/DEPLOYMENT_RUNBOOK.md, contracts/src/{collateral,config,types}.rs, bindings/) - H
- https://github.com/TevaLabs/Xelma-Backend (README.md, .env.example, render.yaml) - H
- https://github.com/TevaLabs/Xelma-Frontend (README.md, .env.example) - H
- https://xelma-frontend.vercel.app/ (200 HTML; /api/* 404) - H
- https://registry.npmjs.org/@tevalabs/xelma-bindings - H
- WebSearch (extended) "Xelma Stellar Soroban XLM price prediction market TevaLabs": only the GitHub repo was relevant - M
