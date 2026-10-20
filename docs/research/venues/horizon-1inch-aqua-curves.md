# Horizon (1inch Aqua curves) - venue spec

Researched 2026-10-19. Verdict: SKIP (testnet-only hackathon project, no mainnet, no hosted public API found).

## Summary
- GitHub org `horizon-market` (created 2026-09-09, 0 followers, 1 public repo `horizon`, last push 2026-09-13, no releases, no license, no declared homepage). [H] https://api.github.com/orgs/horizon-market , https://api.github.com/repos/horizon-market/horizon
- README states: "Testnet preview. Trading runs on Ethereum Sepolia with test USDC and creation payments settle on Hedera testnet. The contracts are unaudited ... Do not use real funds." Mainnet deployment is listed "out of scope by design". [H] https://github.com/horizon-market/horizon/blob/main/README.md
- The repo's docs reference an ETHGlobal submission (docs/ETHGLOBAL_SUBMISSION.md), so this is a hackathon build. [H]
- "Still live" = repo exists and was pushed 2026-09-13; NO evidence of any hosted production app/API URL (README only gives http://127.0.0.1:3001). Web search budget was exhausted, so no independent site/press search was possible: NOT FOUND (searched: GitHub org/repo/docs only; WebSearch unavailable).

## Market model [H]
- Binary markets only (YES/NO). Each market is a contract (`BinaryMarket`), outcome tokens are `OutcomeToken` (ERC-20-like) minted against 1 USDC collateral per YES/NO pair.
- No order book: makers publish "executable pricing curves" (start price, end price, size; equal prices = limit order) evaluated on chain per fill. Quotes backed by maker's USDC via 1inch Aqua (shared balance across markets), per-market budget enforced by `OrderBudget` / `admitCurve`.
- Complementary buyers (YES at 0.60 + NO at 0.40) mint a pair in one tx. Atomic multi-curve routes via `RouteExecutor` (max 4 fills). Routes spanning different markets are out of scope.
- Markets can be grouped as "events" and optionally imported from Polymarket page (definitions only, no prices).

## Chains and collateral [H]
- Ethereum Sepolia (11155111). Collateral: Circle test USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (worthless). Creation fee paid in HBAR over Hedera testnet x402 (Blocky402 facilitator). Audit trail on Hedera HCS topic 0.0.10473191 (testnet).
- Contracts (Sepolia): MarketRegistry 0xa1151c78bf5ba0ce80b1f78626c4c0f2c7d131a1, HorizonSwapVM 0x2b7592171cc7cfaa21dd60b49c81d68cf584302d, RouteExecutor 0x657b5cf110bed745c5b3f33c77d61855abb4cfa9, OrderBudget 0x563D51c62260F484C5765712fd9716704cF266A2, Aqua 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a. Source: deployments/sepolia.json (fixture saved).

## Read API
- Self-hosted Express API (routes in `src/trading/http.ts`, `src/events/http.ts`): GET /markets, /markets/:market, /markets/:market/trades, /positions/:account, /markets/:market/budgets/:maker, /curves/:maker, /events, /events/:slug; POST /live (SSE); POST /quotes, /curves, /curves/cancellations, /redemptions. Rate limits in code: reads 240/min, quotes 60/min, writes 20/min. [H] https://github.com/horizon-market/horizon/blob/main/src/trading/http.ts
- Base URL of a hosted instance: NOT FOUND. Only local 127.0.0.1:3001 documented; `railway.json` suggests Railway but no URL published. [H for absence in README/OPERATIONS.md/EVIDENCE.md]
- Subgraph (The Graph Studio, testnet): https://api.studio.thegraph.com/query/1758973/horizon/0.3.2 . GET returns a GraphiQL HTML page (confirmed, redirect to /graphql); real queries need POST (not performed per read-only/no-POST rule). Studio endpoints are dev-rate-limited and may be retired. [H]
- No fixtures of live API JSON could be captured; saved instead: `fixtures/horizon-1inch-aqua-curves/deployments-sepolia.json` (repo deployment manifest) and `github-org.json`.

## Trade path [H]
- Trader signs one EVM transaction to `RouteExecutor` (allocator quotes via POST /quotes); makers `Aqua.ship` then `HorizonSwapVM.admitCurve`. No server-side order signing; "no user wallet key is ever sent to the server". An EVM wallet could in principle send these as transaction proposals, but only on Sepolia with test USDC, so nothing of economic value.

## PayBox reachability
- no (for real value). Sepolia testnet only; no mainnet deployment. Mechanically an EVM tx proposal would work if PayBox supported Sepolia, but pointless.

## Fees [H]
- Trading: no maker/taker/routing/protocol fee, only gas. Only fee: market-creation service fee (HBAR via Hedera x402, halved for World-verified human).

## Resolution [H]
- Single disclosed resolver address (immutable per market), submits YES/NO/INVALID once after close with on-chain evidence reference. Winning token redeems 1 USDC; INVALID pays 0.50 per token. "There is no dispute process and no timeout fallback." Market creation is also owner-gated. High centralization/dispute risk.

## Geo / ToS / automation
- NOT FOUND (no ToS/geo rules; no license declared, "all rights are reserved"). The API is designed for agents (x402 creation), but only on testnet.

## Liquidity
- Test funds only; demo evidence is e.g. an atomic two-curve route buying 2 YES with ~2 USDC (test) on Sepolia. [H] docs/EVIDENCE.md. No real volume/OI/TVL exists. No mainnet liquidity.

## Event overlap / shared liquidity
- Event definitions can be copied from Polymarket (definitions only; no prices/liquidity shared). Any category possible in theory (user-created), but no real prices. Uses 1inch Aqua as shared maker balance across Horizon markets only; no liquidity shared with another prediction venue. Not an arbitrage leg.

## Adapter priority: skip
Testnet-only, 1 repo, no mainnet, no hosted API, centralized resolver. Revisit only if a mainnet deployment or announcement appears (check the repo's deployments/ folder and README "Status").

## Suspicious content
- None found (no agent-directed instructions in repo docs read). Commit messages include Claude session links (benign).

## Sources
- https://github.com/horizon-market (org, H)
- https://github.com/horizon-market/horizon (README, docs/EVIDENCE.md, docs/ETHGLOBAL_SUBMISSION.md, docs/ROADMAP.md, deployments/sepolia.json, src/trading/http.ts) read via gh api 2026-10-19 (H)
- https://api.studio.thegraph.com/query/1758973/horizon/0.3.2 (GET -> GraphiQL page, H)
