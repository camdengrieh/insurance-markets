# Liquidity House (liquidity.house) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

**Not a prediction market. adapter_priority = skip.** Liquidity House is a B2B "bankroll liquidity as a service" facility for licensed online casino operators. Liquidity providers put USDC into a single vault contract on Etherlink; casino operators draw on it for a fixed share of gross gaming revenue. There are no markets, outcomes, order books, prices, resolution or events to scan. The DefiLlama "Prediction Market" category and "GambleFi" tag are misclassifications for our purposes (H, see Sources 1, 2, 5).

## Still live? (H)

- Yes, as a company and on-chain. The site returns HTTP 200 on 2026-10-19 and carries "(c) 2026 Liquidity House Malta Limited" (Sources 1, 3). It is hiring a Head of Operations in Malta (Source 3).
- The Etherlink vault contract is receiving transactions every few seconds on 2026-10-19 (about 50 txs in the 3 minutes before the check; almost all selector 0x9fec19e0 = `credit(uint256,address)`, a few 0x0a9c1890 = `debit(address,uint256,address)`; selectors computed with `cast sig`, so the function mapping is H, the reading of it as casino settlement is M) (Source 6).
- DefiLlama TVL is about 1.24M USD on 2026-10-19, 1.57M peak on 2026-05-04 (Source 2).

## Kind and market model

- Kind: onchain-other. Casino bankroll / LP vault infrastructure (H, Sources 1, 4).
- Market model: none. No binary, categorical or scalar markets, no order book, no AMM, no parimutuel pools, no outcome tokens. The site names no blockchain, docs, contracts or API; the only on-site hint of on-chain activity is "an independently verifiable ledger" (H, Source 1).
- The contract (named `Bankroll`, solc 0.8.19, verified on Blockscout 2025-01-26) exposes: LP functions (`depositFunds`, `withdrawalStageOne/Two`, `getLpStake`, `getLpValue`, `previewMint`, `previewRedeem`, `sharesOf`, `totalSupply`, `lpWhitelist`, `setInvestorWhitelist`), operator settlement functions callable by a bankroll manager role (`credit(amount, operator)`, `debit(player, amount, operator)`, `creditAndDebit(...)`), risk caps (`maxRiskPercentage`, `escrowThreshold`) and GGR accounting (`ggrOf`, `nullGgrOf`). No function mentions a market, outcome, order or resolution (H, Source 4, fixture `bankroll-abi-functions.json`).
- LP side is permissioned: `lpWhitelist`, `setPublic(lpIs)`, minimum LP size, minimum deposit time, staged withdrawals with a delay and window. Whether the public flag is currently on is NOT FOUND (not queried; would need an `eth_call`).

## Chains and collateral

- Chain: Etherlink (Tezos-based EVM L2). USDC (6 decimals, Etherlink token 0x796Ea11Fa2dD751eD01b53C372fFDB4AAa8f00F9) is the collateral and TVL asset (H, Sources 2, 5).
- Bankroll contract (EIP-1167 minimal proxy): 0x0c532e1e916219007f244e2d8Ef46f8530Ec75DE. Implementation: 0x241206d7bF6aAaE8CdB7491D6CF99d8E8E8aAA3D. Both are public addresses from the explorer and the DefiLlama adapter (H, Sources 4, 5). The proxy also holds a small amount of a token called LYZI (about 744 units, no price); purpose unknown (M).
- Chain id for Etherlink mainnet was not verified this session (NOT FOUND in the sources read; do not assume).

## Read API

- Official API: **none**. NOT FOUND (searched: liquidity.house home, /careers, /brand; hosts docs.liquidity.house and api.liquidity.house do not resolve; liquidityhouse.io answered HTTP 405 to a HEAD request and was not examined further; GitHub org liquidityhouse has only two untouched forks of DefiLlama repos, last pushed Feb-Mar 2025; liquidity.house/robots.txt returns a 404 page; no docs link on any page read; sitemap not checked) (H).
- Only public data surface: the Etherlink Blockscout REST API (third-party explorer, not a Liquidity House API) and raw RPC reads of the vault. Useful for TVL monitoring only. Confirmed shapes saved in `docs/research/fixtures/liquidity-house/`:
  - `GET https://explorer.etherlink.com/api/v2/addresses/{vault}` returns contract metadata, proxy implementation, verification status (H, fixture `etherlink-blockscout-bankroll-address.json`).
  - `GET https://explorer.etherlink.com/api/v2/addresses/{vault}/token-balances` returned USDC balance 1,242,580.666519 on 2026-10-19 (H, not saved as a fixture).
  - `GET https://explorer.etherlink.com/api/v2/addresses/{vault}/transactions` for recent activity (H, not saved).
  - `GET https://api.llama.fi/protocol/liquidity-house` returns TVL history (611 daily points since 2025-02-17) (H, fixture `defillama-protocol-trimmed.json`).
- DefiLlama fees and volume endpoints return 400 "not found" for this slug, so there is no published volume or fee series (H).
- No websocket, no rate-limit documentation. Blockscout and DefiLlama limits were not investigated (NOT FOUND).

## Trade path

- Programmatic order placement: **none**. There is nothing to bet on.
- The only "trade" is LP deposit/withdraw into the vault (`depositFunds`, `withdrawalStageOne/Two`), which is an investment in casino-operator revenue risk, not a prediction-market position. Settlement functions are restricted to a `BANKROLL_MANAGER` role (H, Source 4).

## PayBox reachability

- **no.** Nothing to quote or trade, and Etherlink is not in the PayBox chain list given for this project (Base, Ethereum, BNB, Arbitrum, Polygon, Solana, ...). Whether PayBox supports Etherlink at all was not checked (NOT FOUND). Even if it did, the LP side is whitelist-gated and counterparty risk is a casino operator's player results, not an event (M).

## Fees

- Operator pays "a fixed percentage of gross gaming revenue" to the facility; providers earn a return on capital (H, Source 1). The percentage and the LP/protocol split are NOT FOUND (not published; contract has `GGR`, `ggrOf`, `DENOMINATOR` but no read was performed).

## Resolution mechanism and dispute risk

- Not applicable: no events. Counterparty and operational risk instead: the bankroll manager role controls `credit`/`debit`; withdrawals are staged and delayed; the audit field on DefiLlama is "0" (no audits listed) (H, Sources 2, 4).

## Geo, ToS and automation

- The company says it serves "licensed operators across regulated markets" and is registered in Malta (H, Source 1). No ToS, API terms or automation policy found (NOT FOUND). Irrelevant for the aggregator.

## Liquidity (with dates)

- TVL about 1,241,320 USD (USDC in vault) on 2026-10-19; peak 1,574,187 USD on 2026-05-04; about 0.2M in Mar-Jul 2025, rising to about 0.9M by Oct 2025 and about 1.2M since Mar 2026 (H, Source 2, fixture).
- Blockscout shows about 42.9M lifetime transactions and 42.9M token transfers for the vault address as of 2026-10-19 (M: counters endpoint, unusually high, taken at face value from the explorer).
- This is casino bankroll capital, not prediction-market liquidity.

## Event-category overlap

- None. No sports, politics, crypto-price or macro markets. Casino game rounds are not tradeable events and cannot be linked to other venues.

## Shared liquidity

- Not applicable. It shares nothing with another prediction venue. It is not an arbitrage leg.

## Adapter priority: skip

Reasons: no markets, no API, no resolution, no trade path, permissioned LP side, off-category. Only possible use is a "GambleFi capital" macro signal (vault TVL as an on-chain indicator), which is not worth an adapter. If someone wants it, one `eth_call` or the Blockscout endpoint above is enough.

## Open questions

- Which casino operators draw on the vault, and whether "Lyzi" (LYZI token held by the vault) is one (not investigated; irrelevant to the aggregator).
- Whether the LP side is currently public (`lpIs`).

## Suspicious content

None found. The site, brand and careers pages contain no text addressed to AI agents (H).

## Sources

1. https://liquidity.house (home; fetched with WebFetch and curl 2026-10-19) - H
2. https://api.llama.fi/protocol/liquidity-house (DefiLlama protocol API, curl 2026-10-19); human page https://defillama.com/protocol/liquidity-house returned HTTP 403 to WebFetch - H for API values
3. https://liquidity.house/careers and https://liquidity.house/brand (curl 2026-10-19) - H
4. https://explorer.etherlink.com/api/v2/smart-contracts/0x241206d7bF6aAaE8CdB7491D6CF99d8E8E8aAA3D and .../addresses/0x0c532e1e916219007f244e2d8Ef46f8530Ec75DE (+ /counters, /transactions, /token-balances), curl 2026-10-19 - H
5. DefiLlama adapter source, read with gh from the project's fork: liquidityhouse/DefiLlama-Adapters, branch `liquidityhouse`, projects/liquidity-house/index.js (commit e8384a23, 2025-02-16; the file is not in DefiLlama/DefiLlama-Adapters main under that path today, so it may have moved) - H for the file, L for current upstream state
6. https://github.com/liquidityhouse (org page and `gh api users/liquidityhouse`: 2 repos, both forks, created 2024-04-19) - H
7. Note: WebSearch budget was exhausted for this session, so no independent news or press search was possible. Nothing outside the sources above is claimed.

## Fixtures

- docs/research/fixtures/liquidity-house/defillama-protocol-trimmed.json
- docs/research/fixtures/liquidity-house/etherlink-blockscout-bankroll-address.json
- docs/research/fixtures/liquidity-house/bankroll-abi-functions.json
