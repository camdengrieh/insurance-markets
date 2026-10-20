# AGON Markets (agon.markets) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Skip. Testnet only (Base Sepolia, no real money), no mainnet deployment, no live public read API, website currently disabled at the host. Revisit only if a Base mainnet deployment appears.

## Is it live? (2026)

- agon.markets returns HTTP 402 on every path (/, /podcast, /robots.txt). The body is Vercel's `x-vercel-error: DEPLOYMENT_DISABLED`, i.e. the Vercel deployment is disabled (typically billing/plan). It is NOT an x402 payment challenge. [H] curl, 2026-10-19.
- api.agon.markets and docs.agon.markets: HTTP 404 `DEPLOYMENT_NOT_FOUND` (no deployment). [H] curl, 2026-10-19.
- Mainnet: "Not yet deployed". Only Base Sepolia (chain 84532, V2.2 deployment dated 2026-04-08) exists. [H] https://github.com/AGON-Markets/agon-sdk (README + src/addresses.ts)
- GitHub activity: SDK/MCP last pushed 2026-04-28; litepaper mirror and org profile 2026-06-07; org profile updated 2026-08-22. Nothing newer than ~4 months. 4 public repos, 0 stars each. [H] gh api
- The litepaper itself says: public testnet only, no live token, no legal entity, no real-money mainnet betting, geofenced (US, UK, France, Germany restricted at launch). [H] https://github.com/AGON-Markets/agon-markets.github.io (index.html, mirror of agon.markets)

## Kind and positioning (two conflicting framings)

- April 2026 org README (git history shows it was later replaced): "Universal Prediction Market Execution Layer", aggregator reading odds from Polymarket, Kalshi, Limitless, Azuro, Drift; router contract `AgonRouter.sol`; 0.20% blended routing fee; wrapped `agonYES-*` ERC-20 positions; "AI Oracle as a Service"; MCP network with per-call USDC billing. Roadmap claims (Base + Polygon at "Week 12", Solana at "Month 12"). [M] https://github.com/AGON-Markets/.github (README at 2026-04-27; superseded). Treat as marketing/roadmap, unverified; no AgonRouter in the deployed address list.
- June 2026 current framing: on-chain crypto sports betting on Base plus an "AI Agent Arena" (agents publish predictions, scored publicly; prediction-only at launch), plus "Oracl3 Services" data feeds. The commit message states the UEL framing was "superseded". [H] https://github.com/AGON-Markets/agon-markets.github.io , commit message in https://github.com/AGON-Markets/.github
- So it is a (pre-mainnet) venue, not a working cross-venue aggregator. The deployed contract list does include a `PolymarketMirror` contract (Base Sepolia) but its function is undocumented. [H] addresses list in agon-sdk/src/addresses.ts; semantics NOT FOUND.

## Market model

- Permissionless binary YES/NO sports markets; CPMM (constant-product) AMM, no order book. [H] litepaper
- Outcomes: ERC-1155 ConditionalTokens; YES token id = marketId*2, NO = marketId*2+1. [H] litepaper + SDK README
- Collateral: USDC, 6 decimals (on testnet a `MockUsdc` faucet token). Token allowlist via `TokenRegistry`. [H] SDK README
- Contracts (names only; 18 on Base Sepolia): MarketFactory, ConditionalTokens, ChainlinkResolver, OracleDAO, MarketArena (1v1), TournamentEscrow, FeeDistributor, ReputationStaking, LpStaking, ArenaRewards, AgonToken, BuybackBurn, VestingSchedule, GovernanceDAO, TimelockController, TokenRegistry, PolymarketMirror, MockUsdc. [H] agon-sdk/src/addresses.ts. Testnet addresses deliberately not copied here; read them from the SDK if ever needed.
- SDK README also mentions "CLOB/AMM hybrid exchange" for the protocol (repo `agon-protocol`, which is private/404). [M]

## Chains and collateral

Base Sepolia (84532) only, live as testnet. Base mainnet (8453) not deployed. Polygon and Solana only appear in the superseded roadmap. [H] SDK README; [M] old org README.

## Read API

- Official public HTTP API: none live. `api.agon.markets` and `docs.agon.markets` do not exist (Vercel 404). [H]
- `agon-mcp` (Python/FastAPI, MIT): self-hosted only (`uvicorn ... --port 8402`), mock data mode by default, x402 middleware is a stub ("DEVELOPMENT MODE - accepts all requests"). Implemented endpoints: `GET /v1/read/markets` (status/category filters, pagination), `GET /v1/read/markets/{id}`. Planned: quote (M5), execute (M5), oracle (M9), agents (M9), WebSocket streaming (M9). Planned pricing: read $0.001/call, execute $0.01 + gas, streaming $0.01/min, paid in USDC on Base (testnet network id base:84532 in the 402 header sample). [H] https://github.com/AGON-Markets/agon-mcp README
- `@agon_markets/sdk` (TypeScript, viem): contract client factories for on-chain reads/writes on Base Sepolia; ABIs from `@agon_markets/abis` on npm. [H] https://github.com/AGON-Markets/agon-sdk
- Subgraph / indexer: NOT FOUND (searched: org repos, SDK/MCP READMEs).
- Auth/rate limits/websocket: NOT FOUND for any hosted service.
- Fixtures: none saved. No unauthenticated JSON API exists to sample; the only responses are the Vercel 402/404 text bodies above.

## Trade path

On-chain only: an EVM wallet calls ConditionalTokens/MarketFactory on Base Sepolia (testnet, worthless). No signed-order API, no hosted execute endpoint (execute namespace is "Planned"). An agent-facing "arena" is prediction-only at launch. [H] litepaper + MCP README.

## PayBox reachability

Partial in principle, moot in practice. A PayBox EVM wallet on Base could send transaction proposals to AMM contracts once a Base mainnet deployment exists; today only Base Sepolia (testnet) is deployed and there is nothing to trade. [M] inference from the contract/SDK model. Not verified that PayBox supports Base Sepolia.

## Fees

- Aggregator framing (superseded): 0.20% blended routing fee. [M/L] old org README
- Current: FeeDistributor and fee config in MarketFactory exist; formulas/rates NOT FOUND (searched: litepaper, SDK README, MCP README). Contract source repo `agon-protocol` is not public.

## Resolution

SDK lists three resolver types: `ChainlinkResolver` (price-feed auto-resolution), `OracleDAO` (staked vote-based), and an "AI Oracle" (resolution "under 60 seconds" claimed in the old README). Dispute procedure NOT FOUND. Sports resolution with AI/DAO votes is a dispute-risk flag. [H] SDK README (resolvers); [M] old org README (AI oracle claim).

## Geo / ToS / automation

Litepaper: geofenced at launch (US, UK, France, Germany); no legal entity (Marshall Islands DAO LLC "planned"); not a solicitation. ToS page NOT FOUND (site disabled). [H] litepaper

## Liquidity

NOT FOUND. Testnet with a mock USDC faucet; no volume/TVL. Effectively zero real liquidity as of 2026-10-19.

## Event overlap and shared liquidity

Sports (World Cup 2026 mentioned in old README; "binary sports questions" in litepaper), also "crypto-native" and "FR presidential 2027" in the old README. Overlap with Polymarket/Kalshi sports is nominal only. Own AMM pools, so independent of others on paper, but the old README claims it would source liquidity from Polymarket/Kalshi/Limitless/Azuro/Drift (not independent in that case). A `PolymarketMirror` contract exists, semantics unknown. [M]

## Adapter priority

skip. Dead-ish: testnet only, site disabled at host, no hosted API, no liquidity, stale repos.
Optional signal-only use: none worth building. Re-check later: (a) agon.markets resolving again, (b) a Base mainnet entry in `agon-sdk` `addresses.ts`, (c) a public `agon-protocol` repo.

## Suspicious content / injection

None found. The 402 response is a hosting-platform page, not a payment request; no payment attempted.

## Sources

- https://github.com/AGON-Markets (org; 4 public repos) [H]
- https://github.com/AGON-Markets/.github (profile README, commit history) [H]
- https://github.com/AGON-Markets/agon-markets.github.io (litepaper mirror) [H]
- https://github.com/AGON-Markets/agon-mcp (README, repo listing) [H]
- https://github.com/AGON-Markets/agon-sdk (README, src/addresses.ts) [H]
- curl GET https://agon.markets, /podcast, /robots.txt, https://api.agon.markets, https://docs.agon.markets (2026-10-19) [H]
- Web search attempted but the shared search budget was exhausted; no third-party corroboration obtained. Not checked: X account @Agon_markets / @Agon_market (handles differ between sources), npm package listing, on-chain state of the Base Sepolia contracts.
