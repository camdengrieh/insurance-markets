# Vatix Protocol - venue spec (checked 2026-10-19)

Verdict: **skip**. Pre-launch open-source project on Stellar/Soroban; no mainnet deployment, no public API host, no liquidity, not reachable from an EVM/PayBox wallet.

## Status / liveness
- GitHub org created 2026-01-15, 6 public repos. vatix-contract and vatix-backend pushed 2026-10-17/18 (actively developed, many contributors, 160 forks, 102/106 open issues). [H]
- Only web presence found: landing page https://vatix-landing.vercel.app, title only ("The First Open-Source Prediction Market on Stellar"); README says it has an email waitlist, "Main Website: coming soon". [H]
- vatix-docs README (last push 2026-01-15) says "Early Stage", Discord/Telegram/Twitter "coming soon". [H, possibly stale]
- deployments/testnet.json in vatix-contract has **empty contractId and wasmHash for all four contracts**; README says empty = "not yet configured". No mainnet registry file in the tree. [H]
- Not found: any mainnet contract ID, app URL, API base URL, announced launch date, volume/TVL. WebSearch was unavailable (session budget exhausted), so no third-party coverage was checked. [searched: GitHub org/repos/tree, landing page]

## Kind and market model
- kind: onchain-other (Stellar Soroban). Binary YES/NO markets only (Phase 1); multi-outcome and conditional markets are roadmap items. [H: vatix-contract README, vatix-docs roadmap]
- Hybrid design: off-chain CLOB matching engine in the backend API ("Owns the CLOB matching engine" - docs/architecture.md), with on-chain collateral deposit, positions, settlement. Orders carry marketId, side BUY/SELL, outcome YES/NO, price (0-1 decimal), quantity. [H]
- Outcome tokens: SAC-compatible fungible vYES/vNO, 7 decimals (contracts/outcome-token); optional module wired via admin. Positions are also tracked as yes_shares/no_shares in the Market contract. [H]
- Collateral: one token per deployment, enforced on-chain (ADR-002, "USDC" in the text; token chosen at first initialize_market). [H]

## Read API
- exists: official-authenticated / self-host only (no public host found). Backend is a Fastify service under `/v1` (Postgres + Redis), intended to be self-run via docker compose. [H]
- Routes seen in repo (src/api/routes): markets, orders, positions, fills, wallet, resolutions, auth, health/ready, admin. Examples: GET /v1/orders/user/:address, GET /v1/wallets/:wallet/positions, GET /v1/wallets/:wallet/fills/stream (SSE), POST /v1/auth/challenge, POST /v1/orders. [H: docs/orders-route.md, architecture.md, FILLS_SSE_STREAM.md]
- Rate limits (self-hosted defaults): 100 req/60s global, 20 req/60s heavy reads. [H: docs/rate-limiting.md]
- No hosted base URL, so no unauthenticated GET to confirm a response shape; **no fixtures saved**. Order-list response shape is documented in docs/orders-route.md (example only, not a live response).
- On-chain alternative: Soroban events (market_created, trade_executed, position_updated, market_resolved) documented in docs/events-reference.md; would need a deployed contract ID. [H]

## Trade path
- POST /v1/orders with headers x-timestamp (ms), x-nonce (from POST /v1/auth/challenge, 120 s TTL), x-signature = base64 Ed25519 signature over canonical alphabetical-key JSON of the order, signed by the Stellar G... wallet key. [H: docs/orders-route.md]
- Freighter integration guide exists for the web app. Deposits/withdrawals are Soroban contract calls. [H]
- Nothing to trade against today (no mainnet).

## PayBox reachability
- **no**. Chain is Stellar (Ed25519 keys, Soroban transactions). EVM chains (Base, Ethereum, BNB, Arbitrum, Polygon) and Solana are not Stellar. Signing would need a Stellar key and USDC on Stellar; no PayBox Stellar support was verified here. [M: inferred from the task's chain list, not checked against PayBox]

## Fees
- Fee is computed in withdraw_unused_collateral and routed to a Treasury contract when a fee rate is set; README lists "Fee distribution" as Planned, so rate is NOT FOUND / undecided. [H/M]
- Stellar network fees are minimal (project claim). [L]

## Resolution
- Oracle-signed outcome (Ed25519) submitted to Market.resolve_market; optional Resolution contract adds propose / challenge / finalize with a challenge window. Admin can cancel markets (ACTIVE -> CANCELLED). Centralised oracle and admin keys: high resolution and rug risk at this stage. [H: README, docs/market-lifecycle.md]

## Geo / ToS / automation
- NOT FOUND (no ToS, no hosted service). MIT license on repos. [H]

## Liquidity and overlap
- Liquidity: none observable (no deployed contracts, no volume or TVL). Date: 2026-10-19.
- Category overlap: unknown; markets are user-created with free-text question. Independent of other venues (own CLOB), but empty.

## Adapter priority: skip
- Revisit only if a mainnet contract ID and a hosted /v1 API appear. Watch https://github.com/Vatix-Protocol/vatix-contract/blob/dev/deployments/ (a mainnet.json) and the landing page.

## Suspicious content
- None with instructions aimed at AI. Note: vatix-contract has many `COMPLETE_ISSUE_*`, `ISSUE_*_SUMMARY.md` files, suggesting issue-bounty or AI-assisted contribution volume; commit counts overstate maturity. [M]

## Sources
- https://github.com/Vatix-Protocol (org, created 2026-01-15) [H]
- https://github.com/Vatix-Protocol/vatix-contract (README, deployments/README.md, deployments/testnet.json, docs/adr-002-protocol-wide-collateral.md, docs/cross-contract-call-graph.md) [H]
- https://github.com/Vatix-Protocol/vatix-backend (README, docs/architecture.md, orders-route.md, rate-limiting.md, market-lifecycle.md, FILLS_SSE_STREAM.md, deployment-runbook.md) [H]
- https://github.com/Vatix-Protocol/vatix-docs (README, 2026-01-15) [H, stale]
- https://github.com/Vatix-Protocol/vatix-landing and https://vatix-landing.vercel.app [H]
