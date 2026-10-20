# Defifa - venue spec (2026-10-19)

Verdict: protocol alive, but it is a one-shot pot-style pick'em, not a continuous market. Adapter priority: skip (signal-only at best). Confidence: medium.

## Status

- Protocol contracts are live and maintained. H: BallKidz/defifa pushed 2026-10-18; v1.1.0 mainnet deployments published 2026-06-23 (commit "Publish Defifa 1.1.0 deployments"); npm @ballkidz/defifa 1.1.0 published 2026-06-23. Source: https://github.com/BallKidz/defifa , https://registry.npmjs.org/@ballkidz/defifa
- H: https://www.defifa.net (and defifa.net, 308 redirect) now serves a DIFFERENT product titled "metapredict": Solana, 5/15-minute "Will BTC/SOL/wPOND be up" markets with $3-$18 volumes. It is NOT the Defifa NFT-pot frontend. The discovery hint ("onchain gaming and governance experiment...") is stale or from an earlier version of the domain. WHOIS says the domain was updated 2026-08-13 (registrar NameCheap). BallKidz/defifa-interface (last push 2025-11-13) still lists defifa.net as its homepage. Fixture: docs/research/fixtures/defifa/defifa-net-homepage-2026-10-19.txt
- NOT FOUND: any currently live Defifa frontend URL (searched: homepage, repo homepage fields; WebSearch budget was exhausted so no web search was done). Discord link in the interface README: https://discord.gg/uPbqmbpQDw (not visited).
- The metapredict content on defifa.net is a separate venue (Solana up/down). Not researched; flag for the discovery workflow in case it deserves its own spec. Its domain relation to Defifa is unknown.

## Market model

- H: Each game is a Juicebox V6 project. Players pay the project during a mint window and receive ERC-721 "game piece" NFTs in tiers (one tier per team/candidate/outcome) at a uniform price. The money forms a pot (parimutuel). After the event, a scorecard (weights per tier, summing exactly to TOTAL_CASHOUT_WEIGHT) is ratified by attestation governance; holders burn winning-tier NFTs to cash out a pro-rata share of the post-fee pot. Source: README.md and CRYPTO_ECON.md in https://github.com/BallKidz/defifa
- Scorecards can be fractional (e.g. 40/20/10...), so payouts are scalar-weighted, not strictly winner-take-all. H.
- Not an order book or AMM. No tradable price; implied probability = tier mint share of the pot (CRYPTO_ECON.md section 4/5). NFTs may trade on secondary NFT markets, not documented. Mint price is fixed, so "odds" move only through pot share. H.
- Lifecycle: countdown, mint, optional refund window (burn NFT for mint price back), scoring, complete (or NO_CONTEST with refunds). H.
- Game parameters (timing, tier count, price, token, fees) are fixed at permissionless launch (`DefifaDeployer.launchGameWith`). Anyone can launch a game. H.

## Chains and collateral

- H: deployments directory in repo has mainnet artifacts for ethereum (1), base (8453), arbitrum (42161), optimism (10) plus testnets. DefifaDeployer is at the same deterministic address on all four mainnets (0x375afb2a4b1cadae99f8863f96fc1aebcbaf8bde; governor on base 0xa0cefa58fd913c1838c39b2c3d0b08eb7f5d6d53). Source: https://github.com/BallKidz/defifa/tree/main/deployments/defifa
- Collateral is per game (the `token` in game ops; native ETH in the docs example at 0.01 ETH/tier; ERC-20 possible). Fee project tokens DEFIFA and NANA are minted to the hook and distributed to players on burn. H/M.
- Not on BNB, Polygon, Solana in the repo. NOT FOUND for any other chain.

## Read API

- exists: onchain-or-subgraph-only. No official REST/WS API found.
- H: official subgraph repo https://github.com/BallKidz/defifa-subgraph-v5 (schema.graphql, per-chain yaml for mainnet, base, optimism, arbitrum-one and testnets). README documents only Studio endpoints for TESTNETS (sepolia, arbitrum-sepolia, base-sepolia, e.g. https://api.studio.thegraph.com/query/107226/defifa-sepolia/version/latest). A mainnet endpoint is not documented. GraphQL needs POST, which this research does not do, so no live shape confirmed.
- Onchain reads available: `DefifaDeployer.currentGamePhaseOf(gameId)`, pot balance view (returns pot, token, decimals), `DefifaGovernor.stateOf / quorum / attestationCountOf`, ERC-721 tier supply for implied odds. H (function names read in src).
- No game directory on chain besides JBProjects/events; games must be discovered via DefifaDeployer launch events or the subgraph. M.
- Fixtures: no API response shapes captured. Saved npm registry summary only (docs/research/fixtures/defifa/npm-registry-summary.json).

## Trade path

- Onchain only: pay the game's Juicebox terminal during MINT (hook mints the tier NFT; tier selected via payment metadata), burn/cash out via the terminal during COMPLETE or refund phases, attest to scorecards via governor. H (USER_JOURNEYS.md).
- No order placement, no cancel, no position exit except the optional refund window or secondary NFT sale. Positions are locked until scoring completes.
- PayBox reachability: partial. An EVM wallet on Ethereum/Base/Arbitrum/Optimism could in principle send a payable tx proposal to a game's Juicebox terminal, but that needs the exact terminal call encoding and the metadata for tier selection, per game. It is a raw contract call, not a signed order. Fit as an arbitrage leg: poor (no sell side, long lock, payout depends on governance).

## Fees

- H: default fee 7.5% of the pot taken at settlement: 5% Defifa project (divisor 20) plus 2.5% base protocol/NANA (divisor 40), plus optional game-creator custom splits. Paid by all players via a smaller prize pool; partly recycled as DEFIFA/NANA tokens to holders. Source: CRYPTO_ECON.md section 2.5. Gas additional. Fees are per-game parameters, so other games could differ.

## Resolution and dispute risk

- H: no oracle. Outcome is set by a scorecard submitted by anyone and attested by NFT holders (voting power per tier capped, BWA quorum at 50% of minted tiers, grace period). If no scorecard ratifies before the timeout the game can go to NO_CONTEST with refunds. Ratified weights are permanent.
- H risks (RISKS.md): scorecard capture by a coalition or concentrated delegate, quorum lockout, governor shared across all games, launcher-chosen terminal can be malicious (a game's safety depends on its launcher; check terminal against canonical JBMultiTerminal), 128-tier ceiling, immutable parameters. Dispute risk is high relative to oracle-based venues, especially in thin games.

## Geo / ToS / automation

- NOT FOUND: any ToS or geo restriction text (searched: repo docs, homepage which is now a different product). Permissionless contracts, so no API key or automation rule; the gap is a legal one for whoever operates the front end. No frontend currently confirmed.

## Liquidity

- NOT FOUND: volume/TVL (no endpoint reachable without POST to a subgraph; no mainnet subgraph URL documented; searched repo READMEs). The docs' World Cup example pot of 150 ETH is illustrative, not real (H: CRYPTO_ECON.md, "running example"). The earlier dated NFL playoff game repo (2023-03-30) suggests historical sports games existed (L).
- Treat as small/episodic and unverified.

## Event coverage and overlap

- Game-by-game, creator-chosen: the docs' example is the FIFA World Cup 2026; older repos suggest NFL playoffs (L). Overlap with other venues would be sports championship/tournament outcomes and potentially elections. But each game is a one-time pot with fixed odds mechanics and locked funds, so the implied odds can be used as a crowd probability signal and not for execution. Cross-venue matching is hard (tiers vs binary contracts, fractional scorecards, fee 7.5%).

## Shared liquidity

- Independent of other prediction venues; it is a standalone parimutuel pool per game (built on Juicebox core and the 721 hook, but that is infrastructure and not shared liquidity).

## Adapter recommendation

- skip. Reasons: the domain in the hint no longer hosts Defifa; no public read API (subgraph for mainnet undocumented); no sell side or price; locked funds; governance-based resolution; unverified and likely tiny volume. If ever wanted as a signal source: watch DefifaDeployer launch events on Base/Ethereum and read tier mint shares as implied probabilities.

## Open questions

- Where is the current Defifa frontend (if any) and is there a mainnet subgraph or API? Check the Discord or ask BallKidz.
- Are there live mainnet games right now and how large are their pots? Need onchain or subgraph read access (event query on DefifaDeployer via an RPC).
- Is the metapredict product on defifa.net related to Defifa?

## Suspicious content

- None found. The defifa.net page and repo docs contained no instructions aimed at AI agents. One note: the Defifa repo README has a "For AI agents" section; it is plain guidance (treat as game layer on Juicebox) and was not acted on.

## Sources

- https://www.defifa.net (fetched 2026-10-19, H) - serves metapredict
- https://github.com/BallKidz/defifa (README, CRYPTO_ECON.md, RISKS.md, USER_JOURNEYS.md, ADMINISTRATION.md, CHANGELOG.md, package.json, deployments/, script/Deploy.s.sol, src/) - H, read 2026-10-19
- https://registry.npmjs.org/@ballkidz/defifa - H (v1.1.0 published 2026-06-23)
- https://github.com/BallKidz/defifa-subgraph-v5 - H (README, file list)
- https://github.com/BallKidz/defifa-interface - H (README; last push 2025-11-13)
- https://github.com/BallKidz/defifa-collection-deployer - L (stale, last push 2023-07-06)
- Not used: WebSearch (session budget exhausted).
