# Random Reward (DefiLlama id 5014) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction market. Skip.

## Summary
- DefiLlama lists "Random Reward" under category "Prediction Market". Its own description is: "Random Rewarder accepts incoming ETH transfers, signing up any address who sends a sufficient amount of ETH for a random reward at the end of a period." That is a raffle/lottery contract, not an event market. [H, api.llama.fi/protocol/random-reward]
- No URL (`url: ""`), `deadUrl: true`, no twitter, no audits, no token, no contract address in the DefiLlama record. [H]
- Listed 2024-08-19 (listedAt 1724075073); TVL has been about USD 2-65 (peak 65, last 33 on 2026-10-19) across 793 daily points. Effectively a hobby/test contract. [H, fixture]
- No markets, outcomes, prices, order book, resolution or event data exist. Nothing to arbitrage against other venues.

## Market model
Not applicable. No binary/categorical/scalar markets. Participants send ETH to a contract and one is drawn at random at period end (per DefiLlama description). Randomness source unknown. [M]

## Chains and collateral
Ethereum mainnet, native ETH. [H, DefiLlama chains field]

## Read API
NOT FOUND. No official site, docs or API. DefiLlama methodology: "Total ETH held in the Random Reward contract, available for distribution." Only on-chain reads of the (unidentified) contract would work.
- Contract address: NOT FOUND (searched: DefiLlama protocol record has `address: null`; DefiLlama-Adapters repo paths projects/RandomReward/index.js and projects/RandomReward.js return 404 via gh; web search unavailable, session search budget exhausted).

## Trade path
Technically an EVM wallet could send ETH to the contract, but with no address, docs, audit or site this is not a trade path and carries rug/loss risk. PayBox reachable: no (no integration surface; and nothing to trade).

## Fees, resolution, geo/ToS
NOT FOUND (no site/docs). Resolution is a random draw, not event resolution; no dispute process known.

## Liquidity and overlap
- TVL USD 33.19 on 2026-10-19 per DefiLlama. [H] Lifetime peak USD 65.
- Event-category overlap: none. Shares liquidity with no other venue.

## Still live?
Contract may still hold ETH (TVL non-zero today, but DefiLlama's value could be a stale constant; the series is flat 32-37 for long stretches). `deadUrl: true`. Treat as abandoned. [M]

## Fixtures
- docs/research/fixtures/random-reward/defillama-protocol-summary.json (summary of api.llama.fi/protocol/random-reward; full response not stored)

## Sources
- https://api.llama.fi/protocols (record id 5014) [H, fetched 2026-10-19]
- https://api.llama.fi/protocol/random-reward [H, fetched 2026-10-19]
- https://github.com/DefiLlama/DefiLlama-Adapters (adapter path not located, 404) [attempted]

## Suspicious content
None found. No instructions embedded in fetched data.

## Open questions
- Contract address (would be in DefiLlama-Adapters adapter file; path not located). Not worth pursuing for this project.
