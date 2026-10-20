# Sports Bet (SBET) - venue spec

Researched 2026-10-19. Verdict: **skip**. Pre-mainnet, no deployed venue, no public read API, no liquidity. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Summary
- SBET is a 2021 ERC-20 (Ethereum) that now brands itself as a "decentralized sports betting protocol" (sbettoken.org, dApp sbetchain.ai). [H]
- Marketing site: "Testnet live", mainnet beta "planned Q2 2026" (now past), and a roadmap that still lists mainnet beta as "Up Next". [H] No evidence it moved to mainnet. [M]
- Protocol docs page header says "Pre-deployment"; only Sepolia deployments are named; the prediction market and AMM contracts are "code-complete but not deployed". [H]
- Not the same as SportBet.one.

## Kind and market model
- Three models in the V2 docs: signed-position binary (back/lay, long/short), parimutuel (2+ outcomes, one outcome per user per match), and an LMSR AMM prediction market (`PredictionAMMV2`, parameter `b`). [H] protocol.html
- Marketing site additionally claims a P2P CLOB with smart routing between order book and AMM; the protocol page does not describe an order book, while the contract reference lists EIP-712 signed-order functions (`fillOrder`, `matchOrders`, `cancelOrder`). [H] (docs inconsistent)
- Tokenisation: prediction-market outcome shares are ERC-1155 from `PredictionAMMV2`; signed-position and parimutuel positions not described. [H]

## Chains and collateral
- SBET token on Ethereum mainnet, contract 0x2ed2cc2c858a8a8219fd2f2d9e170285dbd02756 (deployed Jun 2021 per site). [H] CoinGecko lists it under Ethereum. [H]
- Protocol target networks: Base and Arbitrum (protocol.html), versus Ethereum + Optimism/Base (marketing site, "indexer and dApp support added Mar 2026"). Conflicting. [H]
- Only named deployment: Sepolia testnet. No mainnet protocol addresses listed anywhere read. NOT FOUND (searched: protocol.html, api.html, audit.html, docs index, sbettoken.org, sbetchain.ai HTML).
- Collateral: SBET native; other tokens appear to be supported (auto-claim fee 2% SBET vs 3.5% other tokens). Stablecoin collateral NOT FOUND.

## Read API
- Official: none public. `docs/api.html` is a Solidity contract reference, not an HTTP API. [H]
- Indexer REST/SSE is documented with a placeholder base `https://<indexer-host>/api` (no real host): `/api/orderbook...`, `/api/routing/quote`, `/api/positions/{wallet}`, `/api/events/stream` (SSE: price_update, trade, indexer_lag, alert_triggered), `/api/oracle/*`, `/api/ai/*`, `/api/auth/nonce|verify` (wallet-signed session). [H] (docs list a "10 AI endpoint" API on the home page.)
- Probe: `GET https://sbetchain.ai/api/markets` and `/api/health` return the SPA HTML fallback (not JSON), so no live public JSON API confirmed at that host. [H] No fixtures saved (nothing real to sample).
- On-chain reads only in principle (view fns `getMarket`, `getOutcomePrices`, `getOrderStatus`) but no mainnet addresses exist to read.
- Rate limits / websocket: not documented, other than the SSE stream above.

## Trade path
- Contracts accept EIP-712 signed orders and permissionless `matchOrders`; any EVM wallet could in theory sign/transact. [H] But there is no mainnet deployment, so nothing to trade. PayBox reachable: **no** (nothing live; Sepolia only).

## Fees
- Home page: 1.5-3% on bets; fee split 60% stakers / 30% treasury / 10% burn. [H] (marketing)
- LMSR: `fee = totalFeeBps * min(price, MAX_PRICE - price) * amount / (MAX_PRICE * BPS_DENOM)`. Parimutuel payout `userStake * totalAccepted / winningOutcomeStake`. Auto-claim 2% (SBET) / 3.5% (others). Match-lock bond 1,000 SBET. [H]

## Resolution
- VRF-selected panel of 13 graders, quorum 9 (VRF path currently a privileged relay); challenge windows 90s / 15m / 2h / 4h; dispute bonds 1% of match TVL clamped to $5k-$50k, doubling over 3 rounds, final appeal to a 5-of-9 arbiter Safe; AI oracle assists. [H] Admin/guardian pause roles exist (centralisation risk). Several open items listed. Dispute risk: high (unproven in production).
- Audit: Versus Security, main audit 2026-02-01..02-26, 248 findings (27 Critical), pre-mainnet round 2026-04-05; claims 225 fixed. Protocol page says "audit scheduled for Q2 2026" (inconsistent). [H]

## Geo / ToS / automation
- No terms, geo-restrictions or bot rules found in docs; marketing says non-custodial, no KYC, and promotes a "Bot API" for algorithmic bettors. NOT FOUND (searched: docs index, home, protocol, api, audit). Gambling legality is the operator's/user's issue.

## Liquidity
- Token: CoinGecko market cap $171,327 (rank ~#4953), 24h volume $6,084 (fetched 2026-10-19). [H] DexScreener API returned zero pairs for the token address on the same date. [H]
- Protocol TVL/volume/OI: none (no mainnet). NOT FOUND (searched: sources above). WebSearch was unavailable (session budget exhausted) so no third-party news confirmation was possible.

## Category overlap and shared liquidity
- Claims football, NBA, esports, MMA, F1, MLB sports markets: overlap with sports books/Polymarket/Kalshi in principle, but no live markets. Does not appear to share liquidity with another venue.

## Adapter priority: skip
- Dead for practical purposes: no mainnet, no public API, no liquidity, quasi-contradictory docs. Revisit only if mainnet addresses and a public indexer host appear.

## Suspicious content
- None found aimed at AI agents. Self-reported claims (sub-100ms, audit remediation counts) unverified.

## Sources
- https://sbettoken.org (home) [H]
- https://sbettoken.org/docs/ , /docs/protocol.html , /docs/api.html , /docs/audit.html [H]
- https://sbetchain.ai/ (SPA shell; API paths return HTML) [H]
- https://www.coingecko.com/en/coins/sports-bet [H]
- https://github.com/sbet-token (user account with 2 repos: art 2021, SBETSwap 2023; no protocol repo seen) [H]
- https://api.dexscreener.com/latest/dex/tokens/0x2ed2... (0 pairs) [H]
