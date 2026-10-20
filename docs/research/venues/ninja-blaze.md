# Ninja Blaze (blaze.ninja) - venue spec

Researched 2026-10-19. Read-only. Verdict: **NOT a prediction market. skip.**

## Summary
- [H] Site title "Ninja Blaze - Blockchain online games". Self-description: "a decentralized multi-chain gaming platform powered by Injective Blockchain ... exclusive games based on smart contracts". Games: Jackpot, Double, Lootbox, Mines, Coinflip, Plinko, Runes (app links), Roshambo (docs). (https://blaze.ninja/, https://docs.blaze.ninja/llms.txt)
- [H] DefiLlama lists it as category "Prediction Market" (id 5400, chain Injective), but this is a mis-categorisation. Its adapter only reads a volume number from `https://app-mainnet.blaze.ninja/api/stats/defillama` (https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/ninjablaze).
- [H] Still live in 2026: footer "(c) 2026 Ninja Blaze"; DefiLlama shows non-zero volume on 2026-10-19 (24h 433, 30d ~8.2k, all-time ~3.19M, USD, https://api.llama.fi/overview/dexs). Low activity.

## Market model
- Casino-style games (jackpot pool where "the winner of the round takes the total sum of all stakes", chance proportional to stake; double; coinflip; mines; lootbox/NFT). House-vs-player or pooled-player games with a VRF randomizer (docs list a "Verifiable Random Function" page). [H homepage, M docs index titles - individual game pages not read]
- No event outcomes, no order book, no outcome tokens, no real-world resolution. Nothing maps to a binary/categorical market. There is nothing to arbitrage against other venues.

## Chains / collateral
- [H] Injective only (homepage; DefiLlama chains ["Injective"]). Collateral INJ and USDC (homepage "Game volume ... USDC"; DefiLlama adapter prices volume in INJ; docs token-sale page mentions INJ or USDC). Native token NBZ (token sale per docs index) [M].
- Injective is a Cosmos-SDK chain with an EVM; PayBox reachability for Injective NOT FOUND (not checked beyond scope). Base/Ethereum/BNB/Arbitrum/Polygon/Solana not used by this venue. paybox_reachable = no (no relevant chain, no relevant product).

## Read API
- No documented public API. NOT FOUND (searched: docs.blaze.ninja/llms.txt index, docs home, homepage links).
- [H] One undocumented stats endpoint exists: `GET https://app-mainnet.blaze.ninja/api/stats/defillama?startTime=<unix>&endTime=<unix>` returns `{"totalVolume":"4.2771"}` (string, INJ units per DefiLlama adapter, 200 OK, no auth). Fixture: `docs/research/fixtures/ninja-blaze/stats_defillama_sample.json`. Useless for pricing.
- DefiLlama entry saved: `docs/research/fixtures/ninja-blaze/defillama_overview_entry.json`.
- Rate limits, websocket: NOT FOUND.

## Trade path
- Frontend dApp at https://app.blaze.ninja/ with Injective smart contracts and a "Session Key" feature (docs index). No programmatic order API documented. Not applicable to market trading.

## Fees
- NOT FOUND in pages read (docs home, T&C). Game pages (jackpot.md, mines.md etc.) not read; house edge/commission likely per game [L].

## Resolution
- Game outcomes via VRF on-chain [M, docs index title only]. No event resolution / disputes.

## Geo / ToS / automation
- [H] T&C: "This Website is a website-hosted interface for smart contracts deployed on Injective blockchain"; use limited to "personal, non-commercial use"; barred residents include "UAE, Cambodia, Brunei, Saudi Arabia" and Costa Rica not served; "prohibited to manipulate your real location through a proxy". No explicit bot rule; bans actions that "violate or create the risk of disruption of the Website". (https://docs.blaze.ninja/additional/terms-and-conditions)
- A "Responsible Gaming" page exists, confirming gambling nature.

## Liquidity
- [H] DefiLlama 2026-10-19: 24h volume 433, 30d 8,219.87, all-time 3,194,359 (USD, game volume not prediction OI). Homepage static "10,000 USDC game volume" stat is a placeholder-like figure [L]. No TVL/OI.

## Event overlap / shared liquidity
- None. No sports/politics/crypto/macro event markets. Does not share liquidity with another venue.

## Adapter priority: skip
Reason: gambling game platform, no markets, no API, tiny volume, DefiLlama category is wrong.

## Sources
- https://blaze.ninja/ (homepage, 2026)
- https://docs.blaze.ninja/ and https://docs.blaze.ninja/llms.txt
- https://docs.blaze.ninja/additional/terms-and-conditions
- https://api.llama.fi/overview/dexs ; https://api.llama.fi/summary/dexs/ninja-blaze
- https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/ninjablaze/index.ts
- https://app-mainnet.blaze.ninja/api/stats/defillama

## Not found / limits
- WebSearch budget exhausted in this session; no independent third-party coverage checked.
- Individual game docs (fees, contracts, audits) not read; contract addresses not recorded.
