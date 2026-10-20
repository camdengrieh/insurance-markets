# eesee (eesee.io) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction market. Adapter priority: skip.

## Summary
- eesee is a gamified NFT/token/RWA ticketed-raffle marketplace plus an "IRO Launchpad" (the homepage title is now "eesee | Launchpad"). [H] https://eesee.io , https://docs.eesee.io/documentation/welcome-to-eesee/introduction/how-it-works
- DefiLlama files it under category "Prediction Market" (mis-categorisation); description there: "Gamified liquidity solution and marketplace for digital assets, tokens and RWAs on Blast_L2". [H] https://api.llama.fi/protocols (fixture: docs/research/fixtures/eesee/defillama-protocol-entry.json)
- The docs do not describe predicting outcomes or wagering on events. [H] how-it-works page.
- Still live (site and docs return HTTP 200, DefiLlama `deadFrom` is null, TVL updated 2026-10-19). [H] Liveness of trading activity itself not verified.

## Market model
- Ticketed pool: seller sets total price and price per ticket; buyers buy tickets; once tickets sell to the asset value, Gelato VRF picks a winner on-chain who receives the asset; seller gets proceeds. If not all tickets sell, the asset is not awarded and the collected amount is raffled among participants. [H] https://docs.eesee.io/documentation/for-buyers/winner-selection-model
- No outcomes, no order book, no AMM, no binary/categorical/scalar markets. Parimutuel-like raffle only. No outcome tokens.

## Chains and collateral
- Blast (primary; USDB contract listed), Ethereum, Polygon contracts listed; cross-chain via Axelar "AssetHub/AssetSpoke" contracts. Frontend bundle also references TON Connect. [H] https://docs.eesee.io/documentation/token/contracts ; [M] TON from frontend bundle strings.
- Collateral: tickets paid in ETH/USDB/ESE style tokens (exact list NOT FOUND in docs index; searched docs index, contracts, how-it-works, FAQ).
- Contract source said to be at gitlab.com/eesee.io/network/contracts [M, per the docs contracts page; not read].

## Read API
- Official public API: NOT FOUND (searched: docs.eesee.io sitemap, llms.txt, contracts page, FAQ, /developers).
- Frontend bundle references `https://users.eesee.io/graphql` and `https://gateway.eesee.io/` [M, string found in https://eesee.io/assets/index-*.js]. These are undocumented private frontend backends; GraphQL needs POST so not probed (read-only rule). Treat as unofficial-only.
- No websocket, rate-limit or auth docs found. api.eesee.io does not resolve.
- No fixtures saved beyond the DefiLlama listing entry (not a venue API).

## Trade path
- None relevant to arbitrage. Tickets are bought via on-chain contracts (Eesee on Blast). A PayBox EVM wallet could in principle send transactions, but there is no market to arbitrage. Reachable via PayBox: partial/no (Blast support in PayBox unconfirmed). [L]

## Fees
- Seller pays 1% per sale (0% on promo events), split 30% mining pool / 50% treasury / 20% staking pool. Creator royalty also applies. [H] https://docs.eesee.io/documentation/for-sellers/fees-and-reward-pool

## Resolution
- Gelato VRF random draw within 24 hours of sell-out. [H] winner-selection-model page. Not event-based; no dispute process. Security audit referenced (hacken.io/audits/eesee.io) [M, link from bundle].

## Geo / ToS / automation
- NOT FOUND in docs/FAQ (searched FAQ). A /terms path returned HTTP 200 but is a SPA shell; not read. Raffle/gambling-like product, likely jurisdiction restrictions. [L]

## Liquidity
- DefiLlama TVL about $44.2K (Blast only), 2026-10-19. [H] https://api.llama.fi/protocol/eesee

## Event overlap / shared liquidity
- No event categories overlap any prediction venue. Liquidity is independent but irrelevant.

## Sources
- https://eesee.io (H)
- https://docs.eesee.io (llms.txt, sitemap, how-it-works, winner-selection-model, fees-and-reward-pool, contracts, FAQ) (H)
- https://api.llama.fi/protocols and /protocol/eesee (H)
- WebSearch was unavailable (session budget exhausted), so no 2026 news was cross-checked.

## Suspicious content
- None found.
