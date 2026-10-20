# Whisper (Whisper-pm) - venue spec

Researched 2026-10-19. Verdict: **skip**. Not a venue; a 2026 hackathon (ETHGlobal Cannes) privacy front-end over Polymarket, testnet only, last commit 2026-04-05.

## Summary
- Whisper is "Private Prediction Markets": an AI-curated feed of Polymarket markets, with bets routed through an Unlink ZK privacy pool, burner wallets and Circle CCTP into Polymarket CTF contracts. [H] https://github.com/Whisper-pm/.github/blob/main/profile/README.md
- It runs on testnets only (Base Sepolia for Unlink, Polygon Amoy for a Polymarket CTF testnet deployment). [H] same README ("All modules tested with real USDC on Base Sepolia and Polygon Amoy"; whisper-app README).
- It has no markets, order book, or liquidity of its own. Market data comes from Polymarket Gamma/CLOB APIs. [H] whisper-app README stack table ("Markets | Polymarket (Gamma API)").
- It is not an independent arbitrage leg: any real liquidity is Polymarket's. Polymarket is covered by another workflow.

## Liveness
- GitHub org created 2026-04-03, last org update 2026-04-04; 5 public repos, 3 followers, no website set, `blog` null. [H] `gh api orgs/Whisper-pm`
- Repos: whisper-app (last push 2026-04-05T06:42Z, 0 stars, no homepage), whisper-unlink, clear-signing, clear-signing-erc7730-registry (fork), .github. All pushed 2026-04-04/05. [H] `gh api orgs/Whisper-pm/repos`
- Latest whisper-app commit 2026-04-05: "fix: poll Ledger connection status - shield works with both Ledger and Rabby". Nothing after. [H] gh api repos/Whisper-pm/whisper-app/commits
- No evidence of a mainnet deployment, token, or hosted site. whisper.pm did not complete a TLS handshake (curl error 35) - [M] only, I guessed the domain; it is not linked from the org. WebSearch was unavailable (session budget exhausted), so no third-party confirmation of liveness was obtained.
- The README says "Built for ETHGlobal Cannes ... Targeting Unlink, Ledger, and World prizes". [H] profile README. Treat as an abandoned or finished hackathon demo (6+ months stale as of today). 

## Market model
- Binary (YES/NO) Polymarket CTF markets via Gnosis Conditional Tokens (`prepareCondition`, `splitPosition`, redeem). Outcomes are ERC-1155 CTF positions. On the demo it creates its own test conditions on the Amoy CTF; it does not list its own native markets. [H] whisper-app README flow + profile README ("Polymarket: create market, split, resolve, redeem on Amoy CTF").
- Order book vs AMM: none of its own. Mainnet-oriented descriptors in the clear-signing repo target Polymarket CTF Exchange and NegRisk Exchange EIP-712 orders. [H] clear-signing README.

## Chains and collateral
- Base Sepolia (Unlink pool), Polygon Amoy (CTF testnet), USDC testnet via CCTP V2. [H] README. No mainnet addresses documented. NOT FOUND (searched: org README, whisper-app README, whisper-unlink README).

## Read API
- exists: none (no public product API). The whisper-app Next.js routes are app-internal and no deployment is known: GET /api/markets, /api/portfolio, /api/agents; POST /api/bet/execute, /api/agents/trade, etc. [H] whisper-app README. No base URL, so no GETs possible and no fixtures saved.
- Docs URL: https://github.com/Whisper-pm/whisper-app (README only).
- Auth, rate limits, websocket: NOT FOUND (searched: all READMEs).
- The underlying data would come from Polymarket's own APIs, which the aggregator should use directly.

## Trade path
- Programmatic: README claims an "Agent API" where external AI agents bet via x402 micropayments, restricted to World AgentBook-verified agents. [H] profile README. The agent endpoints are `/api/agents/register` and `/api/agents/trade`. No hosted instance, so unusable. Payment requirements not captured (no live endpoint, no 402 observed).
- For PayBox: an EVM wallet could in principle transact on Polymarket (Polygon) directly. Whisper adds nothing, and its testnet-only flow is not reachable for real funds.

## Fees
- NOT FOUND for Whisper itself (searched: READMEs). The clear-signing example shows Polymarket order "Fee Rate (bps) 100" - [L] an example value in a display mockup, not documentation.

## Resolution
- Inherited from Polymarket (UMA oracle) if ever on mainnet - [M] not stated in Whisper docs. On the testnet demo the creator resolves its own test condition. Dispute risk: n/a.

## Geo / ToS / automation
- NOT FOUND (searched: org profile, repo READMEs; no site, no ToS). Polymarket's own geo restrictions would apply to anything routed to it.

## Liquidity
- None of its own. NOT FOUND for any volume/TVL (searched: READMEs; no site). Testnet tokens only.

## Event categories overlapping other venues
- Everything it shows is a mirror of Polymarket (sports, politics, crypto price, macro). Zero independent liquidity; cannot be an arbitrage leg.

## Shares liquidity with
- Polymarket (100%, by design).

## Suspicious content
- None found in the READMEs read. (I did not read `.env.local`, which is committed in the whisper-app repo tree; per ground rules it was not opened. Its presence suggests possible leaked secrets, but that is unverified.) 
- Org profile exposes a personal contact email via the GitHub API; deliberately not recorded here.

## Adapter priority
**skip** - hackathon demo, testnet-only, no API, no liquidity, duplicates Polymarket. Possible minor value: its Ledger ERC-7730 descriptors for Polymarket CTF Exchange / NegRisk orders and Permit2 could be a reference for human-readable signing in PayBox. [M]

## Sources
- https://github.com/Whisper-pm (org API: https://api.github.com/orgs/Whisper-pm) - H
- https://github.com/Whisper-pm/.github/blob/main/profile/README.md - H
- https://github.com/Whisper-pm/whisper-app (README, commits) - H
- https://github.com/Whisper-pm/whisper-unlink (README identical to whisper-app) - H
- https://github.com/Whisper-pm/clear-signing (README) - H
