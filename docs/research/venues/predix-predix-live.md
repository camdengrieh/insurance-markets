# Predix (predix.live) - venue spec

Researched 2026-10-19. Verdict: **skip**. The site is live but is a Stacks TESTNET demo with a worthless test token; no real-money liquidity, no overlap with other venues' event sets.

## Summary
- Predix runs 60-second BTC UP/DOWN rounds, parimutuel pools, on Stacks via Clarity contracts. [H]
- The product is explicitly testnet-only. The OpenAPI description says "1-minute BTC price rounds on Stacks testnet"; the ai-plugin manifest says "Testnet only"; `/api/health` reports `network=testnet market=predixv8 gateway=gatewayv7`. [H]
- Collateral is `test-usdcx` (a SIP-010 test token, "1000 USD mint per wallet"), so it has no monetary value. [H, repo README]
- Health on 2026-10-19 was `degraded`: sponsor (gas-paying) account has 0.00 STX and jackpot balance is 0.00. [H] `GET /api/agent/market` and `/api/agent/stats` returned HTTP 500 with an empty body; `/api/rounds` returned `{"rounds":[],"ok":true}` (no rounds). [H] So even the demo looks unattended.
- Repo is `LimaDevBTC/predixold` (created 2026-01-23, last push 2026-03-20; ~7 months idle). npm `@predixlive/sdk` 0.1.1 published 2026-03-19, never updated. [H]

## Kind / market model
- Kind: onchain-other (Stacks, Bitcoin L2). Binary, single repeating market (BTC up/down over 60s), parimutuel pools (totalUp / totalDown, oddsUp/oddsDown, effectivePayoutUp/Down). Outcomes are not tokenised; bets are contract-held positions per round id (round id = Unix time / 60). [H, openapi.json + README]
- Settlement price from Pyth (Hermes / Benchmarks), resolved by a Vercel cron every 60s which calls `resolve-and-distribute`; winners paid automatically. [H, README]

## Chains and collateral
Stacks testnet; contracts predixv8 (market), gatewayv7 (proxy), test-usdcx (token); 6 decimals. Mainnet is mentioned only as a config option (`NEXT_PUBLIC_STACKS_NETWORK` = testnet or mainnet). No mainnet deployment found. [H]

## Read API (official, public for market data)
- Docs: https://www.predix.live/openapi.json (OpenAPI 3.0.3), https://www.predix.live/docs/agents (HTML, not read in detail), `/.well-known/agent.json`, `/.well-known/ai-plugin.json`. [H]
- Base URL: https://www.predix.live
- Endpoints: GET `/api/agent/market` (round, pools, odds, BTC price, payout multipliers, contract incl. feeBps), GET `/api/agent/opportunities`, GET `/api/agent/positions?address=`, GET `/api/agent/history?address=`, GET `/api/agent/leaderboard`, GET `/api/agent/stats`, GET `/api/rounds`, GET `/api/health`. [H]
- Auth: market data documented as no-auth in README; API key `X-Predix-Key` (pk_live_...) obtained via POST `/api/agent/register` with a Stacks signature (not attempted). Limits per agent.json: 30 req/min free, 120 req/min verified. No websocket documented (NOT FOUND in openapi/agent.json). [H]
- Fixtures: response shapes confirmed only for health and rounds (empty); `/api/agent/market` returned 500, so the live market shape is known only from the OpenAPI schema. Saved in `docs/research/fixtures/predix-predix-live/` (openapi.json, well-known-agent.json, well-known-ai-plugin.json, api-health.json, api-rounds.json).

## Trade path
POST `/api/agent/build-tx` builds an unsigned sponsored Stacks tx (actions place-bet, approve, mint); agent signs locally with a Stacks secp256k1 key; POST `/api/sponsor` with `txHex` for gas sponsorship and broadcast. MCP (`@predix/mcp`, and `@predixlive/mcp` in the repo) and TS/Python SDKs wrap this. [H] Note naming inconsistency: npm is `@predixlive/sdk`, docs say `@predix/sdk`/`@predix/mcp` (possible package confusion; not verified on npm for `@predix/*`).

## PayBox reachability
**No.** Needs a Stacks key and Stacks transactions; an EVM/Solana PayBox wallet cannot sign them. Even if it could, collateral is a valueless test token. [M inference from the above]

## Fees
`feeBps` field exists in the contract block of `/api/agent/market` (value NOT FOUND; endpoint 500). README: 1% of fees go to a jackpot treasury; gas is sponsored by the platform. Exact fee formula NOT FOUND (searched: README, openapi.json). [H/NOT FOUND]

## Resolution and risk
Centralised cron resolver submits Pyth price on-chain, with server-side divergence check and on-chain 1% price bounds, timelocked upgrades (144 blocks), emergency pause/withdraw by deployer. No dispute mechanism. Settlement depends on the operator's sponsor account, which currently has 0 STX. [H, README + health]

## Geo / ToS / automation
Agents are explicitly welcome (agent API, robots.txt allows `/api/agent/`, disallows `/api/cron/` and `/api/sponsor`). No ToS page located (NOT FOUND; only probed /docs/agents, /history, /leaderboard). [H/NOT FOUND]

## Liquidity
Effectively none: `/api/rounds` empty, jackpot balance 0.00, test token. No volume/TVL figure found. Stats endpoint failed (500). [H, 2026-10-19]

## Event overlap / shared liquidity
Only a 60-second BTC direction market. Not comparable with the standard hourly/daily crypto-price contracts at other venues, and no real money. Independent liquidity, but zero liquidity. [M]

## Adapter priority: skip
Testnet, test token, non-EVM, near-zero activity, degraded health, stale repo.

## Suspicious content
None found. Agent-facing manifests (agent.json, ai-plugin.json) are normal metadata with no instructions aimed at the reader. The `instructions` string in the OpenAPI is only a schema field name.

## Not found
Mainnet deployment; fee value; ToS/geo restrictions; websocket; live `/api/agent/market` response; volume/TVL; third-party coverage (WebSearch budget exhausted this session, so no independent search was done).

## Sources
- https://www.predix.live (homepage, 200) [H]
- https://www.predix.live/openapi.json [H]
- https://www.predix.live/.well-known/agent.json [H]
- https://www.predix.live/.well-known/ai-plugin.json [H]
- https://www.predix.live/api/health, /api/rounds, /robots.txt [H]
- https://github.com/LimaDevBTC/predixold (README read via gh api; pushed 2026-03-20) [H]
- npm registry: @predixlive/sdk (created 2026-03-19, 0.1.1) [H]
