# Stratium Binary Options - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: skip** as an independent leg. Stratium is a builder-code front end (HorizonX) for Hyperliquid HIP-4 outcome markets, plus a "Hybrid" tab that shows Polymarket next to them. It has no order book, oracle or liquidity of its own (H).
- The real venue is **Hyperliquid HIP-4 (HyperCore outcome markets)**. If that is not already covered elsewhere, it deserves its own spec and is the integrable target. Stratium only adds a builder fee and a UI.
- Stratium's own routed volume is very small (see Liquidity).

## Live status (H)

- stratium.xyz is up. The Framer page says it was published 2026-08-29 and describes "A new HIP-3 based platform to trade new structured markets" (https://stratium.xyz/).
- markets.stratium.xyz loads with a "Mainnet" label and tabs for Hyperliquid, Polymarket (New, Beta), Opportunities (Live), Portfolio, Collectibles, Leaderboard and Analytics (https://markets.stratium.xyz/).
- The docs contradict each other on status. HIP-4 Markets page: "live on mainnet". FAQ and the Introduction page: binary options "ahead of mainnet deployment" and "running on testnet" (https://docs.stratium.xyz/llms-full.txt). The docs are partly stale. DefiLlama shows mainnet builder-code volume since 2026-05-26, so mainnet is the working assumption (M).
- Hyperliquid HIP-4 itself launched on mainnet 2026-05-02 (H, Stratium docs; Hyperliquid docs confirm daily BTC recurring binary).

## Kind and market model

- kind: broker-or-frontend (builder-code front end on Hyperliquid HIP-4). H.
- Binary YES/NO outcome tokens, fully collateralised in USDC, settling to `settleFraction` (1 or 0 for binary). No leverage, no liquidation. H (https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md).
- Order book (HyperCore CLOB). The YES and NO books of one outcome are merged: buy YES at p equals sell NO at 1-p. H.
- Categorical: a "question" groups outcomes where exactly one settles YES. The `priceBucket` class is a 3-bucket question. Outcomes in a question are linked by `negate` and `merge` actions. Multi-outcome markets were "not part of the initial mainnet release". H.
- Tokenisation: `encoding = 10*outcome + side`. Coin is `#<encoding>`, token name `+<encoding>`, asset ID `100_000_000 + encoding`. H (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md).
- Market types seen:
  - Hyperliquid-native recurring markets, e.g. `class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d` and `class:priceBucket|...|period:15m`. H.
  - The Stratium docs also mention "EVM custom markets" (BTC/ETH/SOL, 15-minute speed markets) on HyperEVM. NOT FOUND in any primary Hyperliquid doc (searched the HIP-4 doc and the Hyperliquid contract specs). L, treat as unverified.
- Underlyings are crypto prices only (BTC, HYPE, ETH, SOL mentioned). The Stratium site lists BTC and HYPE daily. M.

## Chains and collateral

- Hyperliquid L1 (HyperCore), USDC, in the unified Hyperliquid account shared with spot and perps. H.
- The user funds the Hyperliquid account separately (Hyperliquid's Arbitrum USDC bridge or HyperCore transfers). M, standard Hyperliquid flow, not re-verified this session.

## Read API

No Stratium API exists. NOT FOUND (searched: stratium.xyz, docs.stratium.xyz llms-full.txt, github.com/horizonx-tech). The site and docs mention no API. The horizonx-tech GitHub org holds only Aptos, Chainsight and Internet Computer repos, with nothing for Stratium. H.

The usable read API is Hyperliquid's own, which is **official-public** (H):

- docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- REST: `POST https://api.hyperliquid.xyz/info`, JSON body. Relevant `type` values: `outcomeMeta` (outcomes, questions, `sideSpecs`, `description` with `class`, `underlying`, `expiry`, `targetPrice` or `priceThresholds`, `period`), `outcomeTemplates`, plus the spot-style `l2Book`, `allMids`, `recentTrades` and `candleSnapshot` using `#<encoding>` coins. Whether `l2Book` takes `#<encoding>` was not confirmed; the doc says outcome trading "is similar to spot". M.
- WebSocket: `wss://api.hyperliquid.xyz/ws`. Subscription `outcomeMetaUpdates` emits `outcomeCreated` and `outcomeSettled`. Normal book and trade subscriptions apply. H.
- Auth: none for info and websocket reads.
- Limits (per IP): 1200 weight per minute on REST. `l2Book` and `allMids` weigh 2, most other info requests 20. Websocket: 10 connections, 1000 subscriptions, 2000 messages per minute. H (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md).
- Resolution data: `outcomeSettled` websocket events and the outcome token balances. The settlement rule is deterministic, from the `description` field.
- **Not confirmed by live call.** The info endpoint is POST-only, and the ground rules forbid POST, so no live response shape was captured. The documented `outcomeMeta` shape is saved in the fixtures. A follow-up with explicit permission to POST read-only `info` queries would settle it.
- Secondary volume data: the DefiLlama public GET `https://api.llama.fi/summary/dexs/stratium-binary-options` (H, fetched; saved as a fixture). It carries Stratium-routed volume only, not whole-venue volume.
- Builder address used by DefiLlama to attribute Stratium volume: `0xcbd0ab1f5872dba6667c23765613de93453e3320` (H, https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts). This is a public project address.

## Trade path

- There is no Stratium order API. Trading is Hyperliquid's `/exchange` endpoint with EIP-712 signed actions. This is standard Hyperliquid (M on the signing scheme, since only the exchange doc was skimmed). The wallet is either the main wallet or an approved agent (API) wallet. Outcome actions include `userOutcome` with `splitOutcome`, `mergeOutcome`, `mergeQuestion` and `negateOutcome` (H, exchange-endpoint doc).
- Builder code: fees go to the builder "on sell orders that specify their builder code" (H, HIP-4 doc). An agent can skip Stratium and trade with no builder code (zero builder fee), or with its own.
- **PayBox reachability: partial.** Hyperliquid is not an EVM transaction flow. Orders are signed messages, not on-chain proposals. Only the USDC funding leg (Arbitrum bridge deposit) is a normal EVM transaction. PayBox has an official `hyperliquid` plugin, but it is described as "Browse Hyperliquid spot markets, prices, and token metadata" and is currently disabled for this user (H, `discover_plugins`). Whether `request_wallet_sign` can produce EIP-712 typed-data signatures for Hyperliquid actions was not tested, because signing tools are off limits. Status: unknown to partial.

## Fees

- Hyperliquid: zero to open or mint. Fees apply only on close or settlement, following the standard schedule. Fee-paying volume rules and "no rebates, makers pay zero" are in https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md (H). The HIP-4 doc says "Fees are currently zero for outcome markets for initial testing" (H). The date of that doc is unknown, so the live fee state is unconfirmed.
- Stratium builder fee: 4.5 bps is documented for perps (H). For HIP-4 no rate is published in the docs (NOT FOUND, searched llms-full.txt). DefiLlama total fees for the Stratium outcome line are about $26 all-time, against $111k volume (about 2.4 bps, M). A taker pays the builder fee on top of the Hyperliquid fee.
- Model the cost as Hyperliquid close/settle fee plus an unknown builder fee (0 if routed without a builder code).

## Resolution and dispute risk

- Native recurring markets are settled by the protocol against the HyperCore mark price. The price is linearly interpolated between the mark updates around the settlement time. It resolves YES if and only if `interpolated >= targetPrice`. H (contract specs and info-endpoint docs).
- There is no human or UMA-style dispute process, so dispute risk is low. The risks are dependence on the Hyperliquid mark price (an oracle and manipulation exposure) and protocol and validator risk. Builder-deployed markets (500,000 HYPE stake, slashable) have not launched; "Permissionless HIP-4 builder deployment follows the canonical market phase" (H, Stratium docs).
- Cross-venue basis risk when pairing with Polymarket or Kalshi: the Hyperliquid mark and interpolation rule differs from the Chainlink, Pyth or CF Benchmarks sources those venues use. Pair on `expiry` and `targetPrice` only after matching the oracle source.

## Geo, ToS and automation

- Stratium's terms bar US persons and sanctioned jurisdictions, and forbid bypassing geo-restrictions with VPNs or proxies (H, https://docs.stratium.xyz/llms-full.txt, Terms of Use). Governing law is ADGM (HorizonX).
- Hyperliquid's own API is built for programmatic trading. No automation ban was found in what was read (NOT FOUND, searched: Stratium terms).
- The Stratium UI is a Framer and React front end with no documented bot access, and none is needed.

## Liquidity (DefiLlama, fetched 2026-10-19)

- Stratium-routed HIP-4 volume is **$111,233 all-time** (M, https://api.llama.fi/summary/dexs/stratium-binary-options). It started 2026-05-26 and has 54 non-zero days out of 113. The most recent non-zero day is 2026-09-07 ($132). The 24h, 7d and 30d totals are all 0. There is no TVL (`tvl` is empty).
- This volume is a fraction of Hyperliquid HIP-4 volume. Overall HIP-4 volume and open interest were NOT FOUND this session (searched: HL docs; WebSearch was unavailable because its budget was used up). Pull them from the live book via `outcomeMeta` plus `l2Book`.
- Effectively dormant as a Stratium channel, though the underlying Hyperliquid book may be live.

## Event coverage and overlap

- Only crypto price events: BTC and HYPE daily, 15-minute buckets, and possibly ETH and SOL. They overlap Polymarket's and Kalshi's BTC and ETH price-threshold markets (arbitrage candidates, subject to the oracle basis above). No sports, politics or macro. M.
- The "Hybrid" tab puts HIP-4 and Polymarket prices side by side, and "Opportunities" is probably an in-house spread view. This confirms the cross-venue use case but is not an API. The "Opportunities" tab was not examined (L).

## Shared liquidity

- **Yes, 100%.** All Stratium orders go to the Hyperliquid HIP-4 books: "you are trading on Hyperliquid's native orderbooks" (H, docs). The Polymarket tab routes to Polymarket, with "no shared collateral" (H). It is not an independent arbitrage leg. Use Hyperliquid HIP-4 as the venue.

## Suspicious content

- None found. No agent-directed instructions in the pages fetched. The Stratium docs note an inconsistency between the testnet and mainnet claims, but that is a staleness problem, not an injection.

## Open questions

1. Live `outcomeMeta` and `l2Book` response shapes for outcomes (needs one read-only POST).
2. Whether the HIP-4 fee is still zero and what builder fee Stratium actually charges on outcomes.
3. Whole-venue HIP-4 volume and OI.
4. Whether PayBox `request_wallet_sign` supports EIP-712 for Hyperliquid, and whether the Hyperliquid plugin will ever cover outcomes.
5. Whether the "EVM custom markets" and speed markets exist.

## Sources

- https://stratium.xyz/ (H, fetched 2026-10-19)
- https://markets.stratium.xyz/ (H)
- https://docs.stratium.xyz/llms-full.txt (H, whole docs export, includes HIP-4 pages, Terms and FAQ)
- https://api.llama.fi/protocol/stratium-binary-options and https://api.llama.fi/summary/dexs/stratium-binary-options and .../summary/fees/stratium-binary-options (H, GET)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (H, via gh api)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot.md (H, outcomeMeta)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md and .../trading/contract-specifications.md (H)
- PayBox `discover_plugins` query "hyperliquid" (H)
- github.com/horizonx-tech org repo listing (H)

Fixtures: docs/research/fixtures/stratium-binary-options/ contains `defillama-dexs-summary.json` and `hyperliquid-hip4-outcome-markets-doc.md`.
