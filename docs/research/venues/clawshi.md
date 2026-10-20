# Clawshi (clawshi.app) - venue spec

Researched 2026-10-19. Verdict: **skip** (adapter priority). Likely effectively dead or a toy; no verified liquidity; resolution partly admin-controlled.

## Status: is it live?

- Homepage https://clawshi.app: `curl` connect timeout (20s) and WebFetch `ECONNREFUSED 72.61.209.138:443` on 2026-10-19. Also timed out on `/api/markets`, `/api/stats`, `/docs`, `/skill.md`, `/arena/api/state`. DNS still resolves to 72.61.209.138. [H, first-hand this session]
- No `api.clawshi.app` host (does not resolve). [H]
- Last GitHub activity across all `clawshiai` repos: 2026-02-12 (clawleaks). SDK last push 2026-02-08; npm `@clawshi/sdk` 0.2.0 published 2026-02-08, no later versions. [H: registry.npmjs.org/@clawshi/sdk, api.github.com/users/clawshiai/repos]
- Only a web search snippet (2026-10) says the CLAWSHI token (Base) page, as of 2026-10-12, shows $0 price, ~$41.6K on-chain market cap, 658 holders; Cryptorank: ATH 2026-02-10, -96%, 24h volume $3. [L: search-engine summary of basescan.org/cryptorank.io, not opened first-hand]
- Could not confirm any market-level activity in 2026-03..10. Conclusion: site unreachable now, project appears abandoned/dormant. [M]

## Kind and market model

- Kind: on-chain (Base) parimutuel YES/NO pools, plus an off-chain "sentiment" dashboard fed by Moltbook (AI-agent social network) posts and an AI-agent "Clawsseum" BTC arena. [H: github.com/clawshiai/clawshi-protocol README; clawshi-skill SKILL.md]
- Binary only. No order book, no AMM, no outcome tokens: stakes are recorded as per-user YES/NO balances in the `MarketFactory` contract; payout at resolution = `stake * totalPool / winningPool`, less fees. Odds move as pools change, and there is no sell/exit before resolution (README lists no unstake/sell function). [H]
- Contract ABI (Sepolia test deployment, archived) functions: `createMarket, stake, resolve, claim, getMarket, getStake, marketCount, markets, yesStakes, noStakes, owner, usdc, claimed`. [H: fixture `wayback-2026-02-05-api-contract.json`]

## Chains and collateral

- Base mainnet (8453), collateral native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, min stake 0.1 USDC. Contracts (deployed 2026-02-07): MarketFactory `0xc0DeBCEa2F1BcB268b01777ff9c8E3BB4dA85559`, ChainlinkResolver `0xDEbe4E62bEE1DA1657008480e6d91a3f1E3CCaeC`, ManualResolver `0x3602D8989920B9A9451BF9D9562Bb97BA7cEd1bb`. [H: clawshi-protocol README + deployments/base-mainnet.json, fixture `base-mainnet-deployment.json`]
- But the app's own API (archived 2026-02-05) and the skill file (2026-02-10) pointed staking at **Base Sepolia testnet** (factory `0xC0de289DcE3b3c7D8cDf8B2A1Cd0411660A591FE`, chain 84532). So mainnet use by the site is unproven. [H: fixture + SKILL.md; contradiction with "Live on Base Mainnet" README claim]
- Circle Programmable Wallets optional in SDK. [H: npm README]

## Read API

- Official docs: none beyond README/SKILL.md. No docs site found. [NOT FOUND (searched: clawshi.app/docs timed out, web search, GitHub org)]
- Documented off-chain REST (per SKILL.md, all currently unreachable): base `https://clawshi.app/api`; `GET /markets`, `GET /markets/:id`, `GET /leaderboard`, `GET /stats`, `GET /contract`, `GET /data/signals` (Bearer key, from `POST /agents/register`); arena at `https://clawshi.app/arena/api` (`/leaderboard`, `/history`, `/state`, `/mark`, SSE `/events`). [H as documentation; not live-verified]
- Rate limits, websocket: NOT FOUND.
- On-chain reads (free, no auth): `getMarket`, `getOdds`, `calculatePayout`, `marketCount`, pool getters on the factory. [H: README]. No subgraph found.
- Live response shape confirmed: **no** (site down). Fixtures saved are archive.org copy of `/api/contract` (2026-02-05, Sepolia) and the mainnet deployment JSON: `docs/research/fixtures/clawshi/`.

## Trade path

- On-chain only: ERC-20 `approve(USDC -> MarketFactory)` then `stake(marketId, isYes, amount)`; `claim(marketId)` after resolution. SDK `@clawshi/sdk` wraps this with ethers v6 and takes a private key / external signer. [H]
- PayBox reachability: **yes in principle** (Base EVM wallet can send plain approve+stake transactions as contract calls), but there is no good reason to: no verified liquidity, no exit, admin resolution. Not tested; read-only task. [M]

## Fees

- Protocol fee 1% (100 bps, owner can raise to max 5%) of gross payout; optional creator fee 0-5%; paid by winners out of payout. `net = gross - gross*1% - gross*creatorBps`. [H: README, deployments JSON]

## Resolution and dispute risk

- ChainlinkResolver for BTC/USD and ETH/USD threshold markets (1h stale-price limit). ManualResolver: an admin sets the outcome (`setOutcome`), then anyone calls `resolveMarket`. Owner can pause markets and approve/revoke resolvers. No dispute process, no audit found. High centralisation / rug risk on non-price markets. [H: README; audit NOT FOUND]
- Market `19` in SDK example is "BTC by June 2026"; the pre-2026-06 date is now past. [M]

## Geo / ToS / automation

- NOT FOUND (no terms page reachable). Permissionless contracts; agent-friendly by design (agent register API, SDK). [M]

## Liquidity

- NOT FOUND for any date. Only datum: token on-chain market cap ~$41.6K on 2026-10-12 (L, search snippet). No TVL/volume for markets obtainable. Treat as near zero.

## Event overlap / shared liquidity

- Markets: Moltbook-sentiment questions (AI-agent community topics) and BTC/ETH price thresholds. The price markets overlap crypto-price contracts on other venues in theory, but pools are tiny and parimutuel (no fixed price, no exit), so unsuitable as an arbitrage leg. Independent liquidity (not shared with another venue). [M]

## Suspicious content

- None found in fetched content (README, SKILL.md, npm README contained no instructions aimed at AI agents beyond normal usage docs). SKILL.md is written for an agent runtime (OpenClaw) and tells agents to register and save an API key; not followed. Note: the npm registry response exposes the maintainer's email; not reproduced here.

## Adapter recommendation

- **skip**: dormant/unreachable, no documented live public API, unverified mainnet usage, parimutuel pools with no exit, admin-resolved events. Optionally poll `clawshi.app/api/markets` once a week in case it returns; if so re-evaluate as P2 sentiment signal only.

## Open questions

- Is MarketFactory on Base mainnet holding any USDC / recent `Staked` events? (Blockscout was behind a Cloudflare challenge; Basescan needs a key.)
- Has the domain/server been intentionally shut down or just a VPS outage?

## Sources

- https://registry.npmjs.org/@clawshi/sdk (H) - versions, dates, README
- https://github.com/clawshiai/clawshi-protocol (README, deployments/base-mainnet.json) (H)
- https://github.com/clawshiai/clawshi-skill (SKILL.md) (H)
- https://github.com/clawshiai/clawshi-sdk (H)
- https://web.archive.org/web/20260205070704/https://clawshi.app/api/contract (H, archived Feb 2026)
- https://web.archive.org/web/20260207032022/https://clawshi.app/ (H, shell only)
- https://clawshi.app (unreachable 2026-10-19)
- Web search extended (L): cryptorank.io/price/clawshi, basescan token page for CLAWSHI, mexc.com tokenomics
- https://www.moltbook.com/post/43d45b8e-b52e-445d-9d3a-5aca51ea7fc6 (fetched; empty JS shell)
