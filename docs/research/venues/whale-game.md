# Whale Game - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Not a prediction market at all. It is a "last depositor wins the pot" game-theory contract on Ethereum mainnet (DefiLlama mis-categorised it as "Prediction Market"). There are no markets, outcomes, prices or resolution. The game contract's last deposit was 2024-02-08 and its last claim 2024-02-09 (about 20 months ago); it now holds 0 ETH. The only value left is about 3.8 ETH (about $9.4k) in the WHALE token's fee-backing contract, redeemable pro-rata by token holders (51 holders). No overlap with any event category.

## Is it live?

- Game contract `WhaleGame` 0xF1baf16Db25405856f5379246Beba2B694e1449D (verified source, solc 0.8.19, UNLICENSED). 276 txs total. Latest txs: `deposit` 2024-02-08 (0.0533 ETH), `claim` 2024-02-09. Nothing after that. Current ETH balance 0. H - https://eth.blockscout.com/api/v2/addresses/0xF1baf16Db25405856f5379246Beba2B694e1449D (+ /transactions, /counters; fixtures saved)
- Token contract `WhaleToken` 0x0F5F3E11302a91f806D5589Ec6081494B63BA05a (the address DefiLlama lists; created by the game contract). 64 txs; the latest are `redeem` calls on 2024-06-09. Balance 3.8469 ETH at block 26220658, 51 holders, total supply about 4.89M WHALE. H - https://eth.blockscout.com/api/v2/addresses/0x0F5F3E11302a91f806D5589Ec6081494B63BA05a
- DefiLlama entry: id 3278, category "Prediction Market", listed 2023-07-24, `deadUrl: true`, `wrongLiquidity: true`, empty url, Twitter `TheWhaleGame`. TVL 10,569 USD on 2026-10-19 (ETH sitting in the token contract; static since 2024). H - https://api.llama.fi/protocol/whale-game (fixture saved)
- Website: none found (DefiLlama url empty and flagged dead). X account https://x.com/TheWhaleGame: WebFetch returned HTTP 402 with no body, so no payment requirements were recorded and I stopped. NOT FOUND (searched: DefiLlama metadata, WebFetch x.com). WebSearch was unavailable (session budget exhausted), so no web-search confirmation either way.
- Conclusion: dormant since early-to-mid 2024. H for on-chain dates, M for "abandoned" (nobody has called the contract since).

## Kind and market model

- kind: **not-a-market** (on-chain game / ponzi-style increasing pot). H - source of WhaleGame.sol
- Mechanic: anyone calls `deposit(string graffiti)` paying exactly `depositCost` ETH. Cost starts at 0.05 ETH and rises 3.3% per deposit. The depositor becomes `claimer` and the claim timer resets to now + 1 day. If nobody deposits for 1 day, the claimer calls `claim()` and receives the pot (via a per-round `RewardsVesting` contract). The round then resets. Constraints: same address must wait 12h between deposits, 15s global buffer, current claimer cannot re-deposit. H
- Each deposit mints 100,000 x `tokenMultiplier` WHALE to the depositor (multiplier decays 15% per round down to 0.1). 50% of each deposit goes to the WhaleToken contract as backing. `redeem(amount)` returns `balance * amount / totalSupply` ETH once redemptions unlock (after round 11). H
- No outcomes, no tokenised positions, no order book, no AMM, no price. Nothing to quote.

## Chains and collateral

- Ethereum mainnet only; collateral native ETH. H

## Read API

- exists: **onchain-or-subgraph-only** (no operator API). Only generic chain explorers / RPC. H
- Public view functions on the game: `round`, `depositCost`, `claimer`, `claimTime`, `lastDepositTimestamp`, `tokenMultiplier`, `graffiti`, `vestingContractForRound(uint256)`, `whaleToken`. Events: `Deposited(user, amount)`, `Claim(round, amount, user, vestingContract)`. H
- Explorer API used for this research (no auth, GET): `https://eth.blockscout.com/api/v2/addresses/{addr}`, `/transactions`, `/counters`, `/smart-contracts/{addr}`. Works as shown; fixtures saved. H
- Rate limits / websocket: NOT FOUND (not documented for this venue; Blockscout limits not checked).
- Docs URL: none. DefiLlama adapter for TVL: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/whalegame/index.js H

## Trade path

- None for market purposes. The only on-chain actions are `deposit` (payable, exact amount), `claim`, `redeem`. A PayBox EVM wallet could technically call them via a transaction proposal on Ethereum mainnet, but there is no edge, no arbitrage leg and it is a zero-sum-ish last-man-standing game. paybox_reachable: no (nothing to integrate). M

## Fees

- 50% of every deposit goes to the WHALE token backing contract (`FEE_RATE = 50`); the rest accrues to the pot. Winner takes the pot. No operator fee seen in the source; deployer 0x2598985cb0E1FcF2e943344c8315B3548fF047a6 holds no privileged function in the verified code (no owner role visible). H

## Resolution and dispute risk

- Fully deterministic on-chain timer; no oracle, no dispute. Risks are game-theoretic (reaching a final-depositor race, griefing, MEV on the last deposit). H

## Geo / ToS / automation

- NOT FOUND (no site or ToS located; X page inaccessible). A permissionless contract imposes no automation rules.

## Liquidity

- Game pot: 0 ETH on 2026-10-19 (Blockscout coin_balance 0). H
- Token backing: 3.8469 ETH (about $9.35k at the Blockscout exchange rate 2431.33) on 2026-10-19; DefiLlama TVL 10,569 USD. H
- Peak DefiLlama TVL about 35k USD in Aug 2023. H
- Volume: effectively zero since 2024-06.

## Event overlap and shared liquidity

- None. No sports, politics, crypto-price or macro markets. Shares liquidity with no other venue. It is not an arbitrage leg and not even a signal source.

## Open questions

- Whether the operator intends to restart a new game (new deployment); would show as a new contract from the deployer address or a TheWhaleGame post. Not checked (X inaccessible, no web search).

## Fixtures

- docs/research/fixtures/whale-game/blockscout-game-address.sample.json
- docs/research/fixtures/whale-game/blockscout-game-transactions.sample.json
- docs/research/fixtures/whale-game/defillama-protocol.sample.json

## Sources

- https://api.llama.fi/protocols and https://api.llama.fi/protocol/whale-game (H)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/whalegame/index.js (H)
- https://eth.blockscout.com/api/v2/addresses/0xF1baf16Db25405856f5379246Beba2B694e1449D (+ /transactions, /counters, /smart-contracts, /logs) (H)
- https://eth.blockscout.com/api/v2/addresses/0x0F5F3E11302a91f806D5589Ec6081494B63BA05a (+ /transactions, /smart-contracts) (H)
- https://x.com/TheWhaleGame - HTTP 402, not readable
