# Stox (STX): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: CoinMarketCap pages (WebFetch), stox.com (curl), GitHub via `gh api`, public unauthenticated GETs to Blockscout, DexScreener and CoinGecko. Nothing was signed, posted or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page was read through the WebFetch summariser.

Limitation: the shared WebSearch budget was exhausted when this task ran, so no web search was possible and no third-party history of the project was gathered. Archive/reader services were deliberately not used. Everything below comes from direct fetches.

## Verdict

**adapter_priority: skip.** There is no live Stox prediction market on 2026-10-19. "Stox" on the CMC prediction-markets list is the legacy 2017 ERC-20 token STX, not a venue.

- CMC lists Stox (STX) in the prediction-markets view as an unranked row with no price, volume or market cap. [H, https://coinmarketcap.com/view/prediction-markets/, fetch-summarised]
- The CMC coin page is only a "preview page" with a stale price of 0.00379 USD and Ethereum contract `0x006BeA43Baa3f7A6f765F14f10A1a1b08334EF45`. [H, https://coinmarketcap.com/currencies/stox/, fetch-summarised]
- The official site listed on CMC (www.stox.com) 301s to `https://stox.com/`, which is now a bare dark page with an SVG "stox.com" wordmark: no navigation, no links, no app, no text. The listed whitepaper URLs (`/assets/stox-whitepaper.pdf` and the older `/assets/pdf/stox-whitepaper.pdf` from the repo README) both return 404. [H, curl 2026-10-19, fixture `stox-com-home-stripped.html`]
- The only project code (GitHub org `stx-technologies`, "Commologic LTD") has not been pushed since 2018-10-18. Its prediction contracts were a v0.1 alpha. [H, fixture `github-stx-technologies-meta.json`]
- The token itself still moves on chain (see section 4), but only as a plain ERC-20 being swapped. No market, order, or resolution activity exists to read.

Revisit trigger: none worth scripting. If the project relaunches, expect a new site, not stox.com's current state.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| stox.com | Live but a content-free wordmark page (HTTP 200, 14 KB, `<title>stox.com</title>`). Not a product. | H: curl, fixture `stox-com-home-stripped.html` |
| Domain | Registered since 2002-08-25, record updated 2026-09-01, expires 2028-08-25 (GoDaddy). Registrar updates do not mean the 2017 company owns it. | H: whois |
| Whitepaper | 404 on both known paths | H: curl |
| app./blog./docs./api./platform.stox.com | Do not resolve (curl code 000) | H: curl |
| GitHub `stx-technologies/stox-core` ("Stox Smart Contracts") | Not archived; last push 2018-05-28 (merge of branch `public-test-net-predictions`) | H: `gh api` |
| GitHub `stx-technologies/stox-token` | Last push 2017-08-01 | H: `gh api` |
| Other 5 repos in org | Last pushes between 2018-01-15 and 2018-10-18 (api, wallets, common, request-manager) | H: `gh api` |
| STX token (Ethereum) | Alive as an ERC-20, 18,367 holders, supply 54,993,798.1 STX | H: Blockscout, fixture `blockscout-stx-token.json` |

Unrelated "stox" domains probed so the name is not confused: stox.io (stock scanner, "Powered by Spikeet"), stox.market ("Metrics that matter" equities analytics), stox.fi (Finnish stock charts), stox.xyz (domain for sale), stoxmarkets.com and stox.network (parked redirect to /lander). None is a prediction market. [H, curl]

Name collisions to avoid in the registry: STX is also the Stacks token ticker, and CMC's tags for this page ("Bitcoin Ecosystem", "BTCfi") look like Stacks metadata bleeding onto the Stox page. [L/M, fetch-summarised]. The user's note about an "STX Ontario exchange" is a different thing.

## 2. Market model (historical design only)

From the 2018 alpha contracts in `stx-technologies/stox-core` (read via `gh api`): [H]

- Kind: parimutuel "Pool Prediction" and a "Scalar Prediction" type. README: "A Pool Prediction distributes tokens between all winners according to their proportional investment in the winning outcome. The prediction winning outcome is decided by an oracle contract."
- Outcomes are multiple (categorical); positions are not tokenised, they are balances inside a per-prediction contract, and there is no order book or AMM. Users "place" STX on an outcome and withdraw after resolution.
- Payout (`PrizeCalculationRelative`): `owner_winning_stake * total_pool / total_winning_stake`. No fee is visible in that calculation. Alternative `PrizeCalculationBreakEven` exists.
- Lifecycle: Initializing, Published, Resolved, Paused, Canceled (STX refunded).
- Migrations in the repo have the deploy calls commented out, and the README calls this "v0.1 (alpha)" with a `public-test-net-predictions` branch. Whether any prediction contract was ever deployed on Ethereum mainnet is **NOT FOUND** (searched: repo migrations, README, commit history; no Etherscan/Blockscout lookup of factory deployments was done).

## 3. Resolution

Single-operator oracle: `MultipleOutcomeOracle` has `registerPrediction`, `unRegisterPrediction` and `setOutcome`, all `ownerOnly`; the prediction contract then pulls the outcome via `resolve()`. [H, `contracts/oracles/types/MultipleOutcomeOracle.sol`] No dispute mechanism exists in the code. Moot, since nothing is live.

## 4. Chain, collateral, liquidity

- Chain: Ethereum mainnet. Collateral for the historical design: the STX token itself (`StoxSmartToken`, verified contract, 18 decimals). [H, Blockscout `GET https://eth.blockscout.com/api/v2/tokens/0x006BeA43Baa3f7A6f765F14f10A1a1b08334EF45`]
- Token activity in the last two months is swaps, not a venue. Recent transfers on 2026-08-09 through 2026-10-18 involve Uniswap v4 `PoolManager`, `AggregationRouterV6`, `MainnetSettler` and `BancorNetwork`, plus plain wallet transfers. [H, fixture `blockscout-stx-transfers-latest6.json`; the full 50-row page was read]
- DexScreener `GET /token-pairs/v1/ethereum/{STX}` returned an empty list (`[]`) on 2026-10-19, so no indexed pool with liquidity. [H, curl; DexScreener may not index every v4 pool]
- CMC said $26,650 24h volume across 6 markets on the coin page, but the prediction-markets table shows no volume, and the coin page is a stale preview. [M/L]
- CoinGecko: both `/coins/stox` and `/coins/ethereum/contract/0x006bea...` returned 404 "coin not found". [H, curl; not proof of absence, but no CoinGecko listing was found]
- Prediction-market liquidity / OI / TVL: none. **NOT FOUND**.

## 5. Read API and trade path

- Read API: **none**. No official API, subgraph or docs site exists. `exists: none`. The `stox-bc-api` repo (last pushed 2018-01-15) was not read; it is a 2018 backend, not a live service. [H for dates]
- Trade path: **none**. The 2018 design was direct contract calls from an STX-holding wallet (plus an upgradable smart-wallet/relay layer in `contracts/wallets`). No frontend or deployed contracts to call.
- PayBox reachability: **no**. An EVM wallet could in principle send ERC-20 transactions, but there is no venue to propose them against.
- Fees: **NOT FOUND**. The code shows none in the prize formula; no platform fee schedule is published. [H for the formula]

## 6. Geo / ToS / automation

**NOT FOUND**. stox.com has no terms, and nothing else is hosted. (searched: stox.com, stox.com subdomains, repo READMEs.)

## 7. Event coverage and shared liquidity

None. Not an arbitrage leg and has no shared liquidity with another venue.

## 8. Fixtures (docs/research/fixtures/stox/)

- `blockscout-stx-token.json`: token metadata from Blockscout (holders, supply, symbol).
- `blockscout-stx-transfers-latest6.json`: six most recent transfer rows, shows swap-only activity.
- `github-stx-technologies-meta.json`: repo/org push dates (all 2017 to 2018).
- `stox-com-home-stripped.html`: stox.com homepage with the SVG path data replaced by a placeholder; shows there is no content.

## Suspicious content

None. The only script on stox.com is the standard Cloudflare challenge/analytics bootstrap. No AI-directed instructions were found in any fetched page.

## Open questions

- Was any Stox prediction contract ever deployed on mainnet, and what became of the company after 2018? Not answerable without search or an indexer lookup; irrelevant for the scanner.
- Why CMC still lists STX under "Prediction Markets": likely a legacy category tag (M).

## Sources

- https://coinmarketcap.com/view/prediction-markets/ (H, fetch-summarised)
- https://coinmarketcap.com/currencies/stox/ (H, fetch-summarised)
- https://stox.com/ and https://www.stox.com/ (H, curl)
- https://github.com/stx-technologies/stox-core , https://github.com/stx-technologies/stox-token (H, `gh api`)
- https://eth.blockscout.com/api/v2/tokens/0x006BeA43Baa3f7A6f765F14f10A1a1b08334EF45 and `/transfers`, `/addresses/...` (H)
- https://api.dexscreener.com/token-pairs/v1/ethereum/0x006BeA43Baa3f7A6f765F14f10A1a1b08334EF45 (H, empty result)
- https://api.coingecko.com/api/v3/coins/ethereum/contract/0x006bea43baa3f7a6f765f14f10a1a1b08334ef45 (H, 404)
