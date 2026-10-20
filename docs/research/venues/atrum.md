# Atrum (atrum.fun) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Pre-launch / testnet-only privacy-focused parimutuel market. NOT live with real money in any source I could find. Main site returns HTTP 503 DEPLOYMENT_PAUSED. No public read API. Priority: skip (re-check if mainnet ships).

## Liveness (H)
- https://atrum.fun/ and https://www.atrum.fun/ -> HTTP 503 "DEPLOYMENT_PAUSED" (Vercel-style pause), checked 2026-10-19. api.atrum.fun does not resolve. /api/atrum/markets on atrum.fun also 503. (H, curl)
- Docs site https://docs.atrum.fun/ is up (Mintlify). Docs say: "Monad testnet. A mainnet launch is being prepared." (H, WebFetch of docs index)
- GitHub org atrummarkets created 2026-07-28; last pushes: atrum-core 2026-08-21, atrum-starknet 2026-08-27 (H, gh api). Nothing newer than ~7 weeks old.
- A search snippet claims the site said "invite-only at launch, 22 initiates" (M; search summary of the site, unverified; site now paused). No audits, press or independent coverage found (M).
- Org is 2 people per site copy (M). Org email/identity not recorded here.

## Kind and market model (H)
- Kind: onchain, privacy-preserving parimutuel (V1). Binary YES/NO only. Outcomes are NOT tokenised as tradable ERC20/1155 in V1: positions are private "notes" (Poseidon commitments in a depth-20 Merkle tree) inside a ShieldedPool; bets are exponential-ElGamal ciphertexts summed homomorphically. Source: https://docs.atrum.fun/concepts/overview.md, /reference/contracts.md
- Pool totals are hidden until settlement; only coarse "attested" mid-market odds are published and the docs say these are unverified and no payout reads them (H, contracts.md). So there is no reliable live price: nothing like an order book or tradeable quote.
- V2 (design/probe only, "Atrum V2 sealed orders", conditional-token style YES/NO, batch clearing at uniform price) is described in docs and atrum-core V2_* files; not deployed as a market (M, docs v2-sealed-orders.md + repo). atrum-starknet: sealed-bid batch auction on Starknet Sepolia using STRK20, STRK collateral, 3 demo markets (H, DEPLOYMENTS.md; README says "Nothing on mainnet, nothing here holds real value").

## Chains and collateral (H)
- Monad testnet chain id 10143. Collateral is a mock 6-decimal USDC with permissionless mint (H, atrum-markets README + TESTNET_REPORT). Monad mainnet is chain 143; no mainnet deployment found (NOT FOUND: searched docs, repos, DEPLOYMENTS).
- Starknet Sepolia: factory 0x007159d8... (public in repo), STRK collateral. Testnet.
- Testnet pool (atrum-markets markets.json, 2026-08): pool 0xeC41Dd05...4ad8f, collateral 0xF7DE25a5...43E0 (public testnet addresses, from repo).

## Read API
- exists: none (public). The frontend repo atrum-markets has Next.js routes (GET /api/atrum/markets, /api/atrum/markets/[id], /api/atrum/config, /api/atrum/status) returning chain-derived snapshots, but the host is paused, and the same app proves/relays on the server ("treat this as custodial", README). Not a documented public API. (H: repo source; 503 confirmed)
- Docs: https://docs.atrum.fun/llms.txt (conceptual only, no REST/WS reference). NOT FOUND: OpenAPI, websocket, rate limits, subgraph.
- On-chain read: market outcome/clock via Vault (Unresolved/Yes/No/Void, bettingCloseTime, resolutionStartTime); ShieldedPool cannot enumerate markets (only marketVault[id]); registry kept in markets.json; Monad public RPC caps eth_getLogs at 100 blocks (H, README). Final totals only after settlement.
- Fixture: docs/research/fixtures/atrum/markets-registry-sample.json is a trimmed copy of the repo's markets.json (NOT an HTTP API response; no live endpoint was reachable). Registry had 17 markets in the repo snapshot (7 Crypto, 10 "Monad"), IDs around 40-59, all short-dated BTC/ETH price thresholds or Monad-themed demo questions (H, repo file).

## Trade path
- Programmatic: deposit (user wallet signs ERC20 approve + deposit; amount public, must be power of ten up to 1e9 raw units), then betEncrypted / redeemPrivate / withdraw require Groth16 (BN254, circom) proofs generated client-side with note secrets (~1s in browser per docs) and are submitted by a relayer/sequencer (H, contracts.md, README). No signed-order API, no EIP-712 orders. An arbitrage bot would have to run the circuits (29.7MB artefacts) and depend on the operator's relayer/sequencer; current frontend does proving server-side.
- PayBox reachable: no (for now). Only Monad testnet (and Starknet Sepolia) deployments; no Monad mainnet; mock collateral. If mainnet ships, plain deposit/approve txs are EVM transaction proposals, but bets need ZK proofs plus a relayer, so a PayBox transaction proposal alone is insufficient. Whether PayBox supports Monad is not checked here.

## Fees (NOT FOUND)
Searched docs pages (llms.txt index, overview, architecture, contracts, performance, resolution), atrum-core README/HANDOFF, atrum-markets README. No protocol fee formula. Costs documented are gas only (deposit 1,378,641 gas; bet 1,165,715; redeem 1,137,382 on Monad testnet) and relayer pays gas for bet/redeem/withdraw (H). Starknet build: pool fee 2 STRK per private operation (H, DEPLOYMENTS.md, testnet).

## Resolution (H)
Oracle-computed, permissionless: market commits hash of (Pyth price feed, threshold, direction, exact target timestamp, max lag). Anyone submits signed Pyth update; first update at/after target time wins. Only price-threshold questions are supported (docs: cannot settle "will party Y win"). If unresolved past a deadline, anyone may void and all stakes refund 1:1. Final totals are published by a committee key with a Chaum-Pedersen decryption proof; the committee decryption key is held server-side (README) so settlement trusts the operator/committee for liveness (H). Dispute risk: low for oracle logic, but trust in committee/sequencer/relayer and unaudited ZK circuits; trusted setup uses Hermez ptau only (ceremony.sh exists; docs list ceremony/audit as blocking for mainnet, M from HANDOFF).
Starknet build: creator is the resolver of their own markets with a refund-after-window fallback (H).

## Geo / ToS / automation (NOT FOUND)
No ToS or geoblock page found (searched docs index, repos). Site claimed invite-only at launch (M). Privacy design intentionally defeats address-level analytics.

## Liquidity
No real liquidity: testnet mock USDC, faucet-minted. Repo has bet-storm scripts for load tests (H, file list). No volume/TVL figure exists for real funds. (date 2026-10-19)

## Event overlap and independence
Overlap would be crypto price thresholds (BTC/ETH) only, via Pyth, plus Monad-themed demo questions. No sports/politics/macro. Independent pool (parimutuel in own shielded pool), but parimutuel pricing with hidden totals gives no tradeable quote, so it cannot serve as an arbitrage leg. Possible use: none now; at best a post-settlement parimutuel payout ratio signal if mainnet appears.

## Open questions
- Does a mainnet (Monad chain 143) deployment with real USDC ever launch?
- Is there a documented relayer/sequencer HTTP API for third-party bots?
- Protocol fee rate.

## Suspicious content
None found. Repo files include HANDOFF/plan docs mentioning AI-assistant co-authors; no instructions aimed at agents seen. A temporary working directory held unrelated files from another venue (Cyphers/Solana docs) that I ignored.

## Sources
- https://docs.atrum.fun/ and https://docs.atrum.fun/llms.txt (H)
- https://docs.atrum.fun/concepts/overview.md, /concepts/resolution.md, /reference/contracts.md, /guides/lifecycle.md (H)
- https://github.com/atrummarkets (org, repos atrum-core, atrum-markets, atrum-starknet, atrum-docs) read via gh api (H)
- https://atrum.fun/ (HTTP 503 DEPLOYMENT_PAUSED, 2026-10-19) (H)
- WebSearch result summary of https://www.atrum.fun/ (M)
