# Jackson Protocol (jackson.io) - venue spec

Researched 2026-10-19. Verdict: **skip**. Not a prediction market. It is a Sui on-chain casino (Dice, Plinko, Baccarat) backed by a house liquidity pool (JacksonLP). DefiLlama's "Prediction Market" category is a mis-label.

## Liveness
- Site and docs respond 200 (app.jackson.io, docs.jackson.io) on 2026-10-19 [H, curl]. app.jackson.io/earn itself returned 403 to WebFetch (bot protection), so the app UI was not read [H].
- Docs T&C "Last Updated: January 2, 2026"; JacksonLP Q1 2026 round (Jan 1 - Mar 31 2026) and a Q2 2026 rollover are described; docs mention "the launch of our football products" [H, docs]. Whether the football product is still running in Oct 2026 was not confirmed (NOT FOUND, searched: docs.jackson.io llms.txt pages, T&C; web search budget exhausted).
- DefiLlama TVL is about $1.2k (2026-10-19) vs a $51k peak in Jul 2025 [H, api.llama.fi]. Effectively near-dead on TVL.

## Kind and market model
- Operator "Jackson.io Limited" (BVI), Anjouan iGaming licence; "decentralized matchmaking platform" where players bet against a unified house pool (JacksonLP) [H, T&C s1.1, platform-design].
- Games: Dice, Plinko, Baccarat; third-party "sports event prediction data services" are planned/integrated via APIs and backed by the same pool [H, products-and-services]. No binary/categorical/scalar contracts, no order book, no AMM of outcome tokens, no outcome tokens at all. Bets are balance debits in a game-balance contract; RNG via VRF/Pyth/server-side provably fair [H, T&C s8].
- Players deposit into an on-chain game-balance contract, bet inside it, withdraw on-chain [H, playing-games].
- JacksonLP is a quarterly auction-issued staking certificate NFT priced in $JACKSON, not a tradeable market position [H, jackson-lp].

## Chains and collateral
Sui only. Assets: SUI, USDC, WBTC, WETH (Sui-bridged), some games accept JacksonLP tokens [H, products-and-services]. Vault object on Sui: DefiLlama adapter reads reserves of a vault object (id in adapter source) [H, github DefiLlama-Adapters projects/Jackson/index.js].

## Read API
NOT FOUND. No developer/API docs in the docs index (llms.txt lists 20 pages: about, playing games, JacksonLP, chat, litepaper, platform design/mechanics, audit, referral, terms, FAQ) [H]. api.jackson.io does not resolve [H]. T&C s11.3 mentions "an official API for developers" only as a hypothetical exception [H]. Only on-chain Sui objects/events exist (not investigated further; no value for aggregation).
Third-party: DefiLlama `https://api.llama.fi/protocols` and `/protocol/jackson-protocol` give TVL only. Fixtures: `docs/research/fixtures/jackson-protocol/defillama-protocols-entry.json`, `defillama-protocol.json`.

## Trade path
Sui wallet transactions (deposit/withdraw), bets then off-contract-gas inside the platform. No documented programmatic order API. Not meaningful for an arbitrage leg anyway.

## PayBox reachability
No. Sui-only; an EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot act. Solana is also not Sui. [M, inferred from chain]. Also geo-blocks the US and many others.

## Fees
3% "Fairness Fee" on game interactions (platform revenue); LP staking fee 0% (dynamic), unstaking fee 0.1% [H, platform-design; T&C s7]. House edge per game not documented in pages read.

## Resolution
Game outcomes settled by contract using RNG; not event-based. For third-party sports services, resolution is by the provider (NOT FOUND detail) [M].

## Geo / ToS / automation
Prohibited jurisdictions include United States, United Kingdom, Australia, France, Germany, Netherlands, Spain, Italy, Switzerland, China and more; VPN circumvention banned (T&C s3.2, s11.2). Bots/scripts prohibited unless permitted in writing (s11.3) [H, https://docs.jackson.io/policies-and-support/terms-and-conditions.md]. Automating LP stake/unstake also prohibited.

## Liquidity
DefiLlama TVL $1,232 on 2026-10-19; peak $51,430 on 2025-07-28 [H]. Homepage claims 470M "trading volume", 20K accounts (marketing, undated, unverified) [L, jackson.io homepage]. Liquidity independent (own pool), but irrelevant.

## Event overlap
Possibly football/sports "prediction" products only; no politics/crypto/macro. Odds are house-set against a pool, not market prices; a signal value is dubious.

## Priority
skip: not a prediction market, no API, Sui-only, US-blocked, bot-banned, tiny TVL.

## Open questions
- Does a live football product exist now, and does it expose odds? (app UI blocked to WebFetch; no browser automation allowed.)

## Suspicious content
None found.

## Sources
- https://api.llama.fi/protocols and https://api.llama.fi/protocol/jackson-protocol [H]
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/Jackson/index.js [H]
- https://jackson.io [H]; https://docs.jackson.io/llms.txt [H]
- https://docs.jackson.io/getting-started/playing-games.md, /platform-mechanics/products-and-services.md, /platform-mechanics/platform-design.md, /platform-mechanics/jackson-lp.md, /policies-and-support/terms-and-conditions.md [H]
