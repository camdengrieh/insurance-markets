# Bantah Prediction Markets (onchain.bantah.fun) - venue spec

Researched 2026-10-19. Read-only. Verdict: **skip**.

## Summary
- Bantah is a peer-to-peer "challenge" (bet-with-a-friend) app, not a prediction-market exchange. No order book, AMM or outcome tokens. [H: tech doc, sections 1-2, 9]
- The only published onchain contract is a stake-custody/event-logging escrow on **testnets**. [H]
- All Bantah hostnames fail TLS handshake (live check 2026-10-19). Could not confirm the site is live. [H]
- The only publicly confirmed deployment URL (Railway) returns "Application not found". [H]

## Liveness
- onchain.bantah.fun, bantah.fun, www.bantah.fun: `curl` and WebFetch both fail with `tlsv1 alert internal error`; `curl -k` also fails (000). DNS: onchain.bantah.fun, bantah.fun, bota.bantah.fun all resolve to the same IP (2.57.91.92). [H, own probes 2026-10-19]
- https://onchain-web-production.up.railway.app (the "production" onchain endpoint named in the tech doc) returns HTTP 404 `{"status":"error","code":404,"message":"Application not found"}` on `/`, `/api/onchain/config`, `/api/challenges`. The Railway app is gone/unlinked. [H]
- GitHub org BantahMarkets: created 2026-03-27, 2 public repos, description "Agentic prediction market protocol", 0 stars. `bantah-onchain` last push 2026-03-10; `BOTA-Battle-Of-The-Agents-` last push 2026-06-19 (homepage https://bota.bantah.fun/, unreachable). [H, GitHub API]
- WebSearch (extended) for the project name returned nothing about Bantah. No press, TVL or volume data. [H for "not found"]

## Market model
- User-created P2P challenges: direct (named opponent), open (first taker), admin-created, partner/community. Two sides (challengerSide / challengedSide), stake each side, proof upload + voting, then settlement. Binary only. [H: docs/BANTAH_TECHNICAL_DOCUMENTATION.md, v1.0 dated 2026-02-21]
- No price discovery: stakes are matched 1:1; no quotes, no books, no outcome tokens. [H]
- BOTA repo (2026-06) is an AI-agent battle game with "packs" and credits (CHANGELOG), i.e. gamification, not markets. [H]

## Chains and collateral
- Configured chains are all testnets: Base Sepolia 84532, BSC Testnet 97, Arbitrum Sepolia 421614, Celo Sepolia 11142220, Unichain Sepolia 1301. Tokens ETH, USDC, USDT (testnet). No mainnet deployment documented. [H: tech doc section 11]
- Offchain variant uses NGN fiat via Paystack. [H]
- Escrow contract `contracts/BantahEscrow.sol` (126 lines): `lockStakeNative`, `lockStakeToken`/`depositToken`, `settle*` that only emit an event (`ChallengeSettledSignal`), owner-only `withdrawNative`/`withdrawToken`. It does not compute or pay out winners; payouts are owner-discretion. Custodial in effect. [H, read source]

## Read API
- Exists: none public/documented. Backend Express API (`/api/challenges/*`, `/api/events/*`, `/api/onchain/config`, `/api/onchain/status`, `/api/challenges/:id/onchain/settle`) is app-internal; writes need Privy auth. No docs site, no OpenAPI, no WebSocket documented (Pusher used internally). [H: tech doc section 12]
- NOT FOUND (searched: GitHub repos, tech doc, web search, live hosts): public base URL, rate limits, subgraph, book/price/trade endpoints.
- No fixtures saved: no reachable API.

## Trade path
- None for programmatic use. Flow is Privy-authenticated web UI; user sends escrow tx, backend verifies tx hash. Resolution is app-mediated (vote/proof). [H]
- PayBox reachability: no. Even if a mainnet existed, it would be a plain deposit into an owner-controlled escrow with no verifiable settlement.

## Fees
- NOT FOUND in docs for challenge stakes (partner program mentions "fees" without formulas). [searched tech doc]

## Resolution and dispute risk
- Proof upload and user voting, with admin control; settlement signal is an event emitted by any caller (`settle` has no access control). Very high operator/dispute risk. [H]

## Geo / ToS / automation
- NOT FOUND (no ToS reachable; site down).

## Liquidity
- NOT FOUND. Testnet only; no volume/TVL published. [H for absence, 2026-10-19]

## Overlap and shared liquidity
- Challenges are free-form social bets (sports/crypto/etc. possible), but with no price, no book, and no resolution oracle, they cannot form an arbitrage leg. Does not share liquidity with any other venue.

## Adapter priority: skip
Dead/unreachable site, testnet-only, P2P matching with no market data, no API, custodial escrow.

## Sources
- [H] https://github.com/BantahMarkets (org API, 2026-10-19)
- [H] https://github.com/BantahMarkets/bantah-onchain (docs/BANTAH_TECHNICAL_DOCUMENTATION.md, contracts/BantahEscrow.sol)
- [H] https://github.com/BantahMarkets/BOTA-Battle-Of-The-Agents- (CHANGELOG.md)
- [H] Live probes 2026-10-19: onchain.bantah.fun, bantah.fun, bota.bantah.fun (TLS failure); onchain-web-production.up.railway.app (404)
- [H] WebSearch extended "Bantah onchain prediction market agentic protocol bantah.fun": no relevant results

## Suspicious content
None observed.
