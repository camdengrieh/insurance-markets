# PredictStack (Stacks) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
Verdict: adapter_priority = skip. A live-but-toy STX parimutuel testbed: 2 resolved markets, 0 active, ~0.06 STX total pool, 0.1 STX max bet.

## Summary
- PredictStack is a binary YES/NO parimutuel market on Stacks (Bitcoin L2), collateral native STX, with a small Render-hosted Node-style backend and a Clarity contract `predictstacksv2` (source header says "PredictStack V7"). [H]
- The npm SDK `predictstack-sdk` (0.1.0 2026-05-19, 0.1.2 2026-05-27) is the only "official" artefact; the GitHub repo `predictstack/sdk` returns 404 (also org 404). [H]
- The backend is reachable and returns JSON, but has had no active market since 2026-05-16; only 2 resolved markets and stats showing 5 users. Not a real liquidity venue. [H]

## Still live?
- Backend responds 2026-10-19 (HTTP 200 on /api/markets, /api/platform/stats, /api/config). [H]
- /api/markets?status=active returns `{"markets":[]}`. The two markets ever created are dated 2026-05-14 and 2026-05-16 and are resolved. [H]
- Verdict: infrastructure up, product dormant/toy. The Render hostname root `/` timed out once at 30s (free-tier cold start likely) [M]; WebFetch of the root returned 404 [H].

## Kind and market model
- Binary YES/NO only. Parimutuel pools (`yes-pool`, `no-pool`), no order book, no AMM curve, no tokenised outcome shares: a position is a map entry `{yes-amount, no-amount, total-wagered, claimed}` per (user, market). Positions are NOT transferable tokens. [H] (contract source via Hiro API)
- Implied "odds" = pool share in bps: `price = side_pool / total_pool` (50% when empty). Price moves with each bet; final payout is not locked at bet time (pari-mutuel), only a slippage guard exists (`place-bet-with-slippage`, `max-price-bps`). [H]
- Payout: `stake + stake * losing_pool / winning_pool`. No trading out before resolution (no sell function in the public list). [H]

## Chains and collateral
- Stacks mainnet, native STX (micro-STX). Contract principal `SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y.predictstacksv2` (from /api/config). [H]
- Bet limits in contract defaults: min 20,000 uSTX (0.02 STX), max 100,000 uSTX (0.1 STX) per bet; admin-adjustable (`set-min-bet-amount`, `set-max-bet-amount`). [H]

## Read API
- Official? The SDK README calls the backend `https://predictstack.onrender.com`; no OpenAPI/docs site found. Classification: official-public (undocumented beyond SDK README), unauthenticated, CORS `*`. [H]
- Base URL: `https://predictstack.onrender.com`. Docs: npm readme https://registry.npmjs.org/predictstack-sdk (README). [H]
- Endpoints confirmed with unauthenticated GET:
  - `GET /api/markets` -> `{"markets":[{id,question,description,category,imageUrl,resolveTimeIso,resolveBlock,createdAt,updatedAt,createdBy,contractMarketId,contractTxId,resolutionTxId,marketRef,chain:{...},status,winningOutcome,yesPoolMicro,noPoolMicro,totalBets}]}`; `?status=active` filter works. [H]
  - `GET /api/platform/stats` -> `{"totalMarkets":0,"totalVolumeMicro":0,"totalFeesCollectedMicro":0,"totalUsers":5,"activeMarkets":0}` (note totalMarkets=0 contradicts 2 listed markets: stats unreliable). [H]
  - `GET /api/config` -> `{"network":"mainnet","contractAddress":"SP30...GP7Z3Y","contractName":"predictstacksv2","platformFeeMicro":10000}`. SDK says `client.platform.getConfig()`, but `/api/platform/config` is 404, so SDK paths differ from live routes in places. [H]
  - `GET /api/markets/2/odds` -> `{"yes":0,"no":0}` (resolved market). [H]
  - SDK-documented but not individually probed: markets get/getById/getByRef/getQuotes/getNextId, users dashboard/position/markets, leaderboard (`/api/platform/leaderboard` 404). [M]
- On-chain read-only functions (Hiro API verified source): get-market, get-market-pools, get-market-odds, quote-price, quote-shares, calculate-potential-payout, get-user-position, get-platform-stats, etc. [H] Source: https://api.hiro.so/v2/contracts/source/SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y/predictstacksv2
- Websocket: NOT FOUND (searched: SDK README, npm metadata). Rate limits: NOT FOUND (no headers; Cloudflare/Render in front; SDK defaults timeout 30s, 3 retries).

## Trade path
- SDK: `bets.createIntent({userAddress, contractMarketId, amountMicro, outcome})` returns `contractCall {contractAddress, contractName, functionName, args, postConditionAmountMicro}`; user signs a Stacks transaction in Leather/Xverse; then `bets.confirm({betId, txId})`. Claims: call `claim-winnings` / `claim-refund` on-chain, then `claims.confirm`. [M] (SDK README only; POST endpoints not exercised)
- Signing scheme: Stacks (secp256k1, Stacks tx format, STX post-conditions). Not EVM. Contract is a plain public Clarity function (`place-bet`, `place-bet-with-slippage`), so any Stacks key can call it directly without the backend. [H]

## PayBox reachability
- paybox_reachable = no. A PayBox EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot sign Stacks transactions or hold STX. Solana is also not Stacks. Not verified whether PayBox supports Stacks at all: NOT FOUND (not checked; irrelevant given size).

## Fees
- Fixed 10,000 uSTX (0.01 STX) per bet, taken on top of the stake and forwarded immediately to treasury; no fee on winnings. At the 0.02 STX min bet this is up to 50% of stake; at 0.1 STX max it is 10%. [H] (contract: `platform-fee-amount u10000`, `execute-bet`)
- Plus Stacks network tx fee. Admin can change fee (`set-platform-fee`). [H]

## Resolution and dispute risk
- Single `platform-oracle` principal (initially deployer) calls `resolve-market(market-id, winning-outcome)` after the resolve block height; admin can `cancel-market` (refund) and `pause-platform`. No dispute window, no decentralised oracle, markets are created by users or admin via `create-market`. Fully centralised, trust-the-operator. [H]
- Resolve date is a Stacks block height (Stacks blocks ~10 min post-Nakamoto faster; 2026 value not verified) [L].

## Geo / ToS / automation
- NOT FOUND (searched: SDK README, npm metadata, site root 404; WebSearch budget exhausted so no web search was possible). No ToS or geo-block observed. API is open with CORS `*`.

## Liquidity
- Total ever wagered across both markets: 60,000 uSTX = 0.06 STX (sum of yes/no pools in /api/markets, 2026-10-19). [H] Backend reports totalVolumeMicro 0 (inconsistent). 5 users. Max bet cap 0.1 STX makes meaningful size impossible. [H]

## Event coverage / overlap
- Only category seen: "Crypto", and the question is a Stacks block-time coin flip ("Will the next Stacks block be mined within 3 minutes?"), which has no counterpart on any other venue. No overlap with sports/politics/macro. [H]
- Shares liquidity with another venue: no (independent but trivial).

## Adapter notes (if ever wanted)
- Poll `/api/markets?status=active`, price = pool share, implement as signal-only. Zero value today. Revisit only if `activeMarkets` becomes nonzero and bet caps rise.

## Security / suspicious content
- None found. npm package `predictstack-sdk@0.1.2` declares a self-dependency on `predictstack-sdk@^0.1.0` (odd packaging; README names `@predictstack/sdk` scope which differs from the published unscoped name). Possible name confusion; do not install. [H]

## Not found
- Official website/docs/landing page (root URL 404 via WebFetch), GitHub repo (404), ToS, geo policy, rate limits, websocket, audits, TVL, social links.

## Sources
- https://registry.npmjs.org/predictstack-sdk (package metadata, README, publish times) [H]
- https://predictstack.onrender.com/api/markets , /api/platform/stats , /api/config , /api/markets/2/odds (GET 2026-10-19) [H]
- https://api.hiro.so/v2/contracts/source/SP30VGN68PSGVWGNMD0HH2WQMM5T486EK3YGP7Z3Y/predictstacksv2 (Clarity source, 2026-10-19) [H]
- https://github.com/predictstack/sdk (404 via gh api) [H]
- Fixtures: docs/research/fixtures/predictstack/api-markets.json, api-platform-stats.json, api-config.json
