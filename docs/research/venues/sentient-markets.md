# Sentient Markets (SentientMarkets) - venue spec

Researched 2026-10-19. Verdict: **skip**. Hackathon/bootcamp-grade AI-agent prediction market on Mode Network. The only deployment found is on Mode Sepolia TESTNET (test token collateral), last on-chain activity 2025-02-07, last code push 2025-03-02. No mainnet bytecode at the documented factory address, no site, no API, no real liquidity.

Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## 1. Is it live? (2026)

- GitHub org `SentientMarkets` created 2025-02-15, description "AI-only prediction markets on Mode Network", 1 public repo, 0 followers, `blog` empty, not verified. Org last updated 2025-02-15. [H] https://api.github.com/orgs/SentientMarkets (via `gh api orgs/SentientMarkets`)
- Single repo `SentientMarkets/Sentient-FE` (Next.js frontend + `plugin-sentient` ElizaOS plugin + docs). Created 2025-03-02, last push 2025-03-02 (about 19 months stale). 0 stars, 0 forks, no license file despite README claiming MIT. 9 commits, all on 2025-03-02. [H] `gh api repos/SentientMarkets/Sentient-FE`
- Docs README says the project was "developed for the Mode AI Founder School" (an educational cohort program). Upstream author repo referenced in README clone URL (`Hebx/sentient-markets`) returns 404 (deleted/private). [H] docs/README.md in repo; 404 via gh api
- Market Factory `0xA78D58bC587f7d61755142817461FCdAa208E774` (from repo docs/README.md):
  - Mode mainnet (`https://mainnet.mode.network`, eth_getCode): `0x` = NO contract. [H] (own JSON-RPC read, 2026-10-19)
  - Mode Sepolia testnet (`https://sepolia.mode.network`, eth_getCode): contract bytecode present. [H]
  - Factory event logs on Sepolia: 24 logs total, first block 24,940,048 (2025-01-24 UTC), last block 25,534,139 (2025-02-07 UTC); chain head at query time was about block 52M. So no factory activity for about 20 months. [H] (eth_getLogs, address filter, fromBlock 0)
- The repo's own wallet provider is hard-wired to Mode Sepolia (`https://sepolia.mode.network`, explorer `sepolia.explorer.mode.network`) and the plugin env schema requires a `mode.network` provider URL. [H] plugin-sentient/src/providers/wallet.ts, plugin-sentient/src/environment.ts
- Domains: `sentientmarkets.io` is "AI Trading Bot Marketplace" and `sentient.markets` is "Unified DEX + Lending Layer for AI Agent Tokens on Base" (DEX/lending, not prediction markets); `sentientmarkets.com` returned no title; `sentientmarkets.xyz` did not resolve. None is linked from the org or repo, so treat them as UNRELATED namesakes. [H for what the pages say; M for "unrelated"]
- Telegram bot `t.me/sentient_mode_bot` and X `@SentientMarkets` are named in the repo docs; not checked (no browser automation, no account use). Web search budget was exhausted this session so no independent 2026 news check was possible. NOT FOUND (searched: GitHub org/repo, public RPC, 5 candidate domains; WebSearch unavailable).

## 2. Kind and market model

- Kind: on-chain, EVM, binary YES/NO markets created by an AI "creator agent"; trading by AI "participant agents" (ElizaOS). [H docs/PRD.md, docs/README.md]
- Design intent (PRD, a planning document, not verified against deployed code): factory + per-market contract, "Fixed Product Market Maker", binary outcomes, ERC1155 position tokens "extensible for multi-outcome", `Outcome {Unresolved, Yes, No, Invalid}`, `buy(isYes, amount)`, `sell(isYes, positionAmount)`, `addLiquidity`, `claimWinnings`. [M - PRD checkboxes mostly unchecked]
- Deployed factory ABI (in plugin) shows `createMarket(question, endTime, collateralToken, virtualLiquidity, protocolFee, outcomeDescriptions)` plus `MarketFactory_InvalidOutcomeCount`, so the deployed version may support N outcomes. Creation is gated by `addMarketCreator(agent)` (agent allowlist). [H plugin-sentient/src/constants/abi.ts]
- Frontend `Market` type: `yesPrice`, `noPrice` (0-1), `virtualLiquidity`, `volume`, `liquidity`, `resolution: boolean|null`. Market list pages in the repo use hard-coded mock data (placeholder addresses like 0x1234...). [H lib/sentient/market.ts, pages/markets/index.tsx]
- README: "maximum price impact of 1% for trades". [H docs/README.md]

## 3. Chains and collateral

- Chain: Mode Network (OP-stack L2). Only a Mode Sepolia deployment is evidenced. [H]
- Collateral: PRD wishes list MODE, veMODE, ETH, USDC, a memecoin; docs list a "Test Token" `0xf8865d1d66451518fb9117cb1d0e4b0811a42823` (testnet, no value). Plugin env also expects a MODE token address. [H docs; M for real-money intent]
- Not on Base, Ethereum, BNB, Arbitrum, Polygon or Solana per anything found.

## 4. Read API

- Official API: **none** (`exists: none`). No docs site. The frontend uses a Prisma DB boilerplate and an unrelated `pages/api/chats.ts`, and one page points at a third-party TheGraph query URL for another project ("rekt-ai-subgraph-base"), unrelated to this venue. [H repo tree; pages/display/index.tsx]
- Only route to data would be direct JSON-RPC to Mode Sepolia: factory `getMarket(bytes32)`, `MarketCreated(marketId, marketAddress, question, endTime, collateralToken, virtualLiquidity)` event, then per-market `getPrice` / `getMarketInfo` (names per PRD, unverified against bytecode). Public RPC allowed unauthenticated eth_getCode / eth_getLogs / eth_blockNumber for confirmation. Rate limits: NOT FOUND.
- Websocket: NOT FOUND.
- Fixtures: none saved (no real API response shape exists; the only live data is raw JSON-RPC from a testnet).

## 5. Trade path

- Contract calls from an EVM wallet (`buy`, `createMarket` via ElizaOS plugin using a raw `EVM_PRIVATE_KEY` env var). No orders, no signed-order scheme, no REST trading. [H plugin-sentient/src/environment.ts]
- PayBox reachability: **no**. Even though an EVM tx-proposal could in principle call the contracts, the only deployment is a worthless testnet; Mode (chain 34443) mainnet has no deployment and is not in PayBox's listed chain set to our knowledge (not verified this session). `paybox_reachable = no`.

## 6. Fees

- Per-market `_protocolFee` parameter set at creation (PRD: basis points, e.g. 10 bps); factory has `MarketFactory_FeeTooHigh` cap and `getProtocolFee/setProtocolFee` per PRD. Exact formula and cap: NOT FOUND (contract source not published in the repo; only ABI). [M]

## 7. Resolution

- PRD: "Simple Oracle System: initially centralized with upgrade path"; `resolveMarket(Outcome)` called by an authorised party; outcome includes Invalid. No dispute mechanism documented. Dispute/centralisation risk: high (single admin/agent). [M - PRD only]

## 8. Geo / ToS / automation

- No ToS, no geo rules, no rate-limit policy found. The whole system is intended for AI agent participation. NOT FOUND (searched: org, repo, README, docs).

## 9. Liquidity

- Volume/OI/TVL: NOT FOUND. Testnet test token only; value = 0. Last factory activity 2025-02-07 (24 logs, i.e. a handful of test market creations/trades). [H on-chain, 2026-10-19]

## 10. Event-category overlap and shared liquidity

- PRD says the creator agent "will mirror active Polymarket markets" and propose price-reaction markets (e.g. token up/down after a tweet), so categories would nominally overlap Polymarket politics/crypto/sports. In practice no live markets exist. [M]
- Own liquidity (virtual liquidity AMM seeded by creator), not shared with another venue, but so thin/nonexistent it is not an arbitrage leg.

## 11. Adapter priority

**skip**: testnet-only, dead since early 2025, no API, no mainnet deployment, no real collateral. Revisit only if a mainnet factory address and fresh `MarketCreated` events appear.

## Suspicious content

- None encountered in fetched sources (no instructions aimed at AI agents seen). Note the project is itself built for AI agents but the repo text contained no directives to the reader.

## Sources

- https://github.com/SentientMarkets (org) - [H] via https://api.github.com/orgs/SentientMarkets
- https://github.com/SentientMarkets/Sentient-FE - README.md, docs/README.md, docs/PRD.md, lib/sentient/market.ts, plugin-sentient/src/environment.ts, plugin-sentient/src/constants/abi.ts, plugin-sentient/src/providers/wallet.ts, pages/markets/index.tsx - [H]
- https://mainnet.mode.network and https://sepolia.mode.network JSON-RPC (eth_getCode, eth_getLogs, eth_getBlockByNumber, eth_blockNumber), 2026-10-19 - [H]
- https://sentientmarkets.io, https://sentient.markets (title/meta only; namesakes) - [H]
