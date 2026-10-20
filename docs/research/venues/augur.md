# Augur (augur.net): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official site, official GitHub (via `gh api`), public unauthenticated GETs to Blockscout and DefiLlama. Nothing was signed, posted or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. Where a tag says "(fetch-summarised)", the page was read through the WebFetch summariser rather than raw.

## Verdict

**adapter_priority: skip.** There is no live Augur prediction-market venue to trade or quote on 2026-10-19.

- augur.net is an informational site for a project that is mid-reboot. Its FAQ says: "Augur.net is not a trading interface." and that a new Augur-native prediction-market application "has not yet relaunched". [H, https://augur.net/faq, fetch-summarised]
- augur.net Terms of Use: the site "does not offer any services, products, or functional access to the Augur protocol". [H, https://www.augur.net/terms, fetch-summarised]
- The only liquid thing is the REP token (now `REPv2_Yes_1`, listed on Kraken as AUGUR), which is an oracle/governance token and not an outcome market. [H]
- The legacy Augur v2 contracts still exist on Ethereum and still hold some value, but there is no maintained frontend, no order-book relayer evidence and no read API. [H/M, see below]
- The next-generation market stack (Zoltar + "Augur Statoblast" + a constant-product Trading AMM, built by the Dark Florist team) is under heavy active development but is **not deployed on Ethereum mainnet** as of today. [H, see below]

**Revisit trigger (cheap, scriptable):** poll `https://eth.blockscout.com/api/v2/addresses/0xdF55bed7404D85591FE4055cbae9A3abb934FaC8` (documented mainnet Zoltar address). When `is_contract` flips to `true` the mainnet launch has started; then re-run this research. Fixture: `docs/research/fixtures/augur/blockscout-zoltar-mainnet-address-empty.json`.

## 1. Is it still live? (the "Augur" family, piece by piece)

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| augur.net website | Live, "reboot" info site; not an app | H: https://augur.net/ , /faq |
| REP token (`REPv2_Yes_1`, 0xCf6A...540D, Ethereum) | Live, tradable on Kraken, Uniswap | H: Blockscout fixture; augur.net |
| Moon Fork (first live use of Augur v2 fork mechanism) | Started 2026-04-08, escalation and migration finished, migration closed 2026-08-03 01:00 UTC; Yes universe won | H: https://augur.net/faq , https://augur.net/blog/post-fork-announcements , https://www.augur.net/learn/fork/moon-fork/ |
| Legacy Augur v2 market contracts (Ethereum) | Contracts exist; no frontend found; some residual on-chain activity (settlement) | H/M, section 2 |
| Augur Turbo / Augur Lite (Polygon, 2021) | Dead: `turbo.augur.sh` and `turbo-docs.augur.sh` return HTTP 525; `augur.sh` now serves an unrelated App Store review tool; turbo repo last pushed 2021-12-17 | H (curl, 2026-10-19), https://github.com/AugurProject/turbo |
| Augur Lituus (generalized oracle, ChainSafe implementing) | In development, no launch date; "one of the next versions of Augur's oracle", not a finished product | H: https://augur.net/blog/q2-2026-progress-report , /blog/augur-testing-past-building-future (fetch-summarised) |
| Zoltar + Statoblast + Trading AMM (Dark Florist team) | Active development, **testnet (Sepolia) only; mainnet addresses documented but empty** | H, section 4 |

The old `app.augur.net` and `v2.augur.net` hostnames do not resolve (curl exit 000, 2026-10-19). [H]

Company/people context: the Augur Foundation backs two tracks: "B2C: a new prediction market system led by Dark Florists" and "B2B: Augur Lituus, a generalized oracle". [H, https://augur.net/blog/augur-one-year-in , fetch-summarised]

## 2. Legacy Augur v2 (what still exists on chain)

- Contract addresses from the official legacy repo (`packages/augur-artifacts/src/environments/mainnet.json`, branch `dev`, repo last pushed 2023-07-23, not archived): Augur `0x23916a8F5C3846e3100e5f587FF14F3098722F5d`, genesis Universe `0x49244BD018Ca9fd1f06ecC07B9E9De773246e5AA`, ShareToken `0x9e4799ff2023819b1272eee430eadf510eDF85f0`, ZeroXTrade `0x8346F3074994FD9A813c735D629B257D93780Eed`, Cash = DAI `0x6B17...1d0F`. [H, https://github.com/AugurProject/augur]
- Market model (from contract names and config, not from running it): binary / categorical / scalar markets; outcome shares are ERC-1155 `ShareToken` ids; matching by 0x-style signed orders (`ZeroXTrade`, 0x Mesh P2P bootstrap list in config) with DAI as cash. [M]
- Activity seen via Blockscout `GET /api/v2/addresses/{addr}/transactions` (top-level txs only, internal/relayed calls are not listed so this under-counts):
  - ZeroXTrade: last top-level `trade` tx 2024-07-07. [H, fixture `blockscout-legacy-zeroxtrade-latest-txs.json`]
  - ShareToken: last txs 2026-09-30 (`claimTradingProceeds`), 2026-07-17 and 2026-07-15 (`safeTransferFrom`). So someone is still settling/moving old positions. [H, fixture `blockscout-legacy-sharetoken-latest-txs.json`]
  - Universe: last `createCategoricalMarket` 2026-03-19 (pre-fork). [H]
- Value still sitting there: DefiLlama (protocol id 152, tracks REPv2 genesis token) shows TVL about $1.77M on 2026-10-18: 735 WETH (about $1.74M) + 34.4k DAI. Composition is not explained by DefiLlama and may be escrowed bonds or abandoned collateral rather than tradable liquidity. [M/L, third-party aggregator, fixture `defillama-augur-tvl-tail.json`]
- After the fork: "Both post-fork universes exist onchain and keep running" but no statement about whether v2 markets can still be traded. [H, post-fork-announcements, fetch-summarised]. Whether parent-universe markets remain tradable is **not documented**.
- Legacy read API: the legacy subgraph (`api.thegraph.com/subgraphs/name/augurproject/augur-v2-base`, from the config) is on The Graph hosted service, which has been sunset; not probed (POST-only). [L]
- The legacy repo's environment config embeds a third-party RPC provider key in plain text. Not recorded here and not used.

Conclusion: legacy v2 is not an arbitrage leg. There is no maintained way to discover markets, see books, or place orders.

## 3. The REP token

`REPv2_Yes_1` at `0xCf6A0A7826fa124B7705d6f3c675eAD76f1e540D` (Ethereum): ERC-20, 18 decimals, symbol `REPV2_YES_1`, name "AUGUR" on Blockscout, 298 holders, total supply 6,545,879.9 REP. [H, Blockscout, fixture `blockscout-repv2-yes1-address.json`, fetched 2026-10-19]

- Blockscout shows price about $0.82, market cap about $5.3M, 24h volume about $2.8k. [M, Blockscout exchange-rate fields, source of price not stated]
- Fork result: 6,547,546.66 of 11,000,000 REP migrated (about 59.5%), Yes universe received 6,545,760.43, No received 1,786.23; migration closed 2026-08-03. [H, post-fork-announcements; the Q2 report says "about 6.4 million", minor inconsistency between augur.net pages]
- Kraken lists it as AUGUR; OKX and Bitpanda migrated customer balances. [H, Q2 2026 report, fetch-summarised]
- Not an outcome market. Not useful for the scanner except as a possible "fork risk" context signal. augur.net publishes a fork-risk monitor ("System steady - No market disputes") built from `public/data/fork-risk.json`. [H]

## 4. Zoltar + Statoblast + Trading (the new market stack)

Source: https://github.com/AugurProject/zoltar (created 2025-09-22, pushed 2026-10-18, 6 commits in the two weeks before today). Docs: https://augurproject.github.io/zoltar/docs/documentation.html . [H]

**Deployment status (the key fact):**
- `docs/mainnet-deployment-addresses.json` lists 15 deterministic mainnet addresses (chainId 1). Checked each with Blockscout `GET /api/v2/addresses/{addr}` on 2026-10-19: **only `proxyDeployer` (0x7A0D...6D12) has code; Zoltar, ZoltarQuestionData, securityPoolFactory, shareTokenFactory, escalationGameFactory, openOracle, etc. are all empty.** Etherscan page for the Zoltar address independently shows an empty EOA with 0 txs. [H, fixtures `zoltar-mainnet-deployment-manifest.json`, `blockscout-zoltar-mainnet-address-empty.json`]
- Docs describe a Sepolia deployment flow and testnet deploy script; no official statement of a mainnet launch date was found (searched: augur.net blog and FAQ, repo README, docs deployment-status page, web search). [H/NOT FOUND]
- A web-search summary claimed "the deployer rejects Ethereum mainnet"; not verified first-hand. [L]

**Design (from docs and contracts, tags H unless noted):**
- Layers: Zoltar (forkable oracle ledger), Statoblast (market layer: one `SecurityPool` per question/universe/pool config), Trading (an exchange for Statoblast shares, "one of possibly many"), OpenOracle (REP/ETH price feed). https://augurproject.github.io/zoltar/docs/explanation/system-overview.html (fetch-summarised)
- Market model: each pool is a three-outcome market: **Yes, No, Invalid**. One unit of ETH mints a complete set (1 Yes + 1 No + 1 Invalid). Winning shares redeem the pool's ETH after finalisation. Fork pages mention children for "categorical or scalar" questions, but the worked examples are binary only. (statoblast.html, fetch-summarised)
- Collateral: **ETH** (settlement), not REP; REP is the reporting/underwriting bond ("never settlement collateral"). Vault owners lock REP to underwrite minting capacity; liquidations exist. (statoblast.html, system-overview.html)
- Trading: **two-way constant-product AMM** (Uniswap-V2-like) between Yes and No shares; Invalid never enters the AMM. Contracts: `TwoWayConstantProductFactory/Pair/Router/Math`. Spot price: `conditionalYesBps = noReserve / (yesReserve + noReserve)` (conditional on a valid resolution). Per-pair `feeBps` immutable constructor param, fee taken from input: `netInput = amountIn * (10000 - feeBps) / 10000`. Events: `Swap(sender, recipient, yesForNo, exactOutput, amountIn, amountOut, feeAmount, resultingYesReserve, resultingNoReserve)`. Read: `getReserves()`, `quoteExactInput(bool yesForNo, uint256)`. Shares are ERC-1155 (pair implements `IERC1155Receiver`). Parent/child pools after a fork do not share liquidity. [H, contract source at `solidity/contracts/trading/`]
- Default feeBps value: NOT FOUND (searched: docs trading/fees pages, Pair/Math sources; it is a constructor argument chosen at pair creation).
- Indexer: `augurScan/` is a self-hosted explorer/indexer (PostgreSQL) with "bounded APIs"; no public hosted instance found. [H for repo, NOT FOUND for hosted instance]
- Immutability: "has no administrator who can pause, upgrade, roll back" a deployment (security-model.html, fetch-summarised). No audit mention found in security-model or statoblast pages (NOT FOUND, so treat as unaudited until proven otherwise). [M]

## 5. Read API

- **exists:** none official or public. Closest: on-chain only (and a self-hostable indexer, augurScan, for the future stack).
- Docs: https://augurproject.github.io/zoltar/docs/documentation.html (new stack); legacy docs `docs.augur.net` does not resolve (ENOTFOUND). [H]
- Base URLs usable today for the only live assets: Ethereum JSON-RPC (README default read backend `https://ethereum.dark.florist`, overridable) and Blockscout `https://eth.blockscout.com/api/v2/...` (third-party). [H]
- Key endpoints worth watching (not Augur-specific): Blockscout `/addresses/{addr}` (is_contract flag for launch detection), `/addresses/{addr}/transactions`, `/tokens/{REP}`.
- Auth and limits: none needed for Blockscout GETs at this volume; limits not documented. 
- WebSocket: NOT FOUND.
- Confirmed shapes (saved under `docs/research/fixtures/augur/`):
  - `blockscout-repv2-yes1-address.json` (token metadata + exchange_rate + holders)
  - `blockscout-zoltar-mainnet-address-empty.json` (launch detector)
  - `blockscout-legacy-zeroxtrade-latest-txs.json`, `blockscout-legacy-sharetoken-latest-txs.json` (legacy liveness)
  - `defillama-augur-tvl-tail.json` (DefiLlama `GET https://api.llama.fi/protocol/augur`, trimmed; third-party aggregator, not an Augur API)
  - `zoltar-mainnet-deployment-manifest.json` (official manifest, constructor args stripped)

## 6. Trade path

- Today: none for a prediction market. REP can be bought on Kraken/Uniswap (token exposure only).
- Legacy v2 (if someone revived it): 0x-style signed orders matched through `ZeroXTrade` over a P2P mesh, plus Augur wallet/GSN relay contracts. No active relayer or UI found. [M]
- Future stack: plain Ethereum mainnet transactions, no off-chain signatures: SecurityPool mint-complete-set with ETH, then `TwoWayConstantProductRouter` swaps (`swapExactInput(bool yesForNo, amountIn, minAmountOut, recipient)` on the pair). Docs include bot-operator guides and arbitrager bots in `bots/`. [H for design, nothing deployed]

## 7. PayBox reachability

**paybox_reachable: no (today).** Nothing to trade on mainnet. If Statoblast launches, an EVM wallet on Ethereum mainnet could in principle trade it purely via ordinary transaction proposals (ETH value + contract calls, no EIP-712 order signing), which would make it "yes" for PayBox. Until the contracts exist this is moot. Collateral is ETH on Ethereum L1, so gas costs matter for small clips.

## 8. Fees

- Statoblast open-interest fee (not a trading fee): charged on outstanding settlement collateral eligible for underwriting commitments, paid to REP-vault underwriters. Annualised about 9.5% at zero utilisation, falling-retention curve up to about 50.2% at 80% utilisation (the "dip point"), flat above that; accrual stops at question end (or fork). Exact per-second constants not given on the page. [H, https://augurproject.github.io/zoltar/docs/explanation/fees.html , fetch-summarised]. Implication: holding complete sets (arb inventory) is expensive; the fee is paid by the side that mints/holds open interest.
- AMM swap fee: `feeBps` per pair, from input, value not documented. [H for mechanism, NOT FOUND for value]
- Legacy v2: creator and reporting fees exist in the v2 whitepaper; not read this session. NOT FOUND (searched: augur.net site pages only).

## 9. Resolution and dispute risk

- **Statoblast (design):** after the question ends, the first REP deposit on an outcome opens the Escalation Game. An unchallenged report finalises after three days. A contested game runs until one outcome is the strict leader at the deadline; the deadline moves later as the contested amount grows. If two outcomes hit the non-decision threshold, anyone can fork the universe; fork splits into Invalid/Yes/No child universes, REP holders migrate, and a Truth Auction may be needed to recapitalise a short child. Losing reporters forfeit REP. Invalid is a possible final answer. [H, statoblast.html / system-overview.html, fetch-summarised]
- **Known risk statements in the security model:** a false local outcome can become final if better-capitalised participants do not show up in time; stalled transitions; underfunded truth auctions; value fragmenting across fork branches. [H, security-model.html, fetch-summarised]
- **Fork latency is months, not days.** The Moon Fork: fork 2026-04-08, dispute/escalation 2026-04-09 to 2026-06-06, migration 2026-06-07 to 2026-08-03/05. So any position tied to a forking market would lock capital for about 4 months. [H, augur.net blog]
- **Legacy v2 and Lituus:** same REP-staked dispute-and-fork family; Lituus is a redesign ("Bribery-Resistant Group-Strategyproof Oracle", whitepaper title) with ChainSafe implementing; not live. [H]
- Oracle-risk summary for a cross-venue scanner: resolution is slow, subjective-capable, and has an INVALID path that other venues' resolution will not mirror. Treat as high basis risk against UMA/exchange-resolved venues.

## 10. Geo, ToS, automation

- augur.net Terms: informational site; users must not be in or residents of comprehensively sanctioned regions (Cuba, North Korea, Iran, Syria, Crimea given as examples), not on US prohibited-party lists, 18+. The terms do not mention bots or scripts; they prohibit "interfer[ing]" with the site or overburdening infrastructure. [H, https://www.augur.net/terms , fetch-summarised]
- Protocol layer (Statoblast): described as immutable with no admin who can pause, so no protocol-level geo-block. Any hosted frontend by Dark Florist will carry its own terms: not seen. [M]
- Scam warning on the FAQ: anyone offering to migrate or recover REP after the deadline is a scammer. [H]

## 11. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| Live prediction-market volume / OI | none found | augur.net FAQ 2026-10-19 |
| DefiLlama "TVL" (legacy contracts) | about $1.77M (735 WETH + 34.4k DAI) | DefiLlama API, 2026-10-18 [M/L] |
| REPv2_Yes_1 market cap | about $5.3M | Blockscout, 2026-10-19 [M] |
| REPv2_Yes_1 24h volume | about $2.8k | Blockscout, 2026-10-19 [M] |
| REP holders | 298 (Yes token); 11,989 (old REPv2, mostly unmigrated) | Blockscout; Etherscan page 2026-10-19 [H/M] |
| Statoblast AMM TVL | 0 (not on mainnet) | Blockscout, 2026-10-19 [H] |

## 12. Event categories and arbitrage overlap

- Today: none. No live markets.
- Legacy v2 historically listed sports/politics/crypto; no current books.
- Future Statoblast: user-created Yes/No/Invalid questions in ETH collateral; the spec shows no category taxonomy, curated feed or recurring-market engine. Overlap with other venues would depend entirely on who creates and seeds pools. Expect thin AMM liquidity and ETH-denominated pricing (needs ETH/USD conversion in any cross-venue edge calc), plus the Invalid share (never in AMM) breaking the usual "Yes + No = 1" identity: price is conditional on valid resolution.

## 13. Shared liquidity

None. Statoblast pools are standalone constant-product pairs per SecurityPool; parent and child pools after a fork do not share liquidity. It would be an independent leg if it existed with depth.

## 14. Open questions

1. Launch plans and date for Statoblast on mainnet (no official statement found).
2. Whether any legacy v2 markets in the surviving (Yes) universe remain tradable, and whether a relayer/orderbook still runs.
3. What the WETH/DAI counted in DefiLlama's TVL actually is (escrowed bonds, orphaned collateral, creator deposits).
4. Default `feeBps` and fee policy for Trading pairs; whether Dark Florist will host a public indexer/API.
5. Audit status of Zoltar/Statoblast.
6. Whether Lituus will ship its own market protocol or stay oracle-only.

## 15. Not found (searched)

- Official REST/GraphQL/WebSocket API for markets, books or trades (searched: augur.net, /faq, /learn, /whitepapers, GitHub org, zoltar docs index).
- Any statement of live markets, volume or OI on augur.net (searched: FAQ, Q2 2026 report, blog index, Moon Fork pages).
- Audit report for Zoltar/Statoblast.
- Hosted augurScan instance.
- Default AMM fee value.
- Legacy v2 fee schedule (not read).
- Legacy docs host (`docs.augur.net`) and legacy app hosts: unreachable.

## Sources

- https://augur.net/ [H, fetch-summarised]
- https://augur.net/faq [H, fetch-summarised]
- https://augur.net/learn , https://www.augur.net/learn/fork/moon-fork/ [H, fetch-summarised]
- https://www.augur.net/terms [H, fetch-summarised]
- https://augur.net/blog (index), /blog/q2-2026-progress-report (2026-10-01), /blog/post-fork-announcements (2026-08-05), /blog/augur-testing-past-building-future (2026-07-21), /blog/augur-one-year-in (2026-04-02), /blog/the-augur-fork-is-here (2026-04-09) [H, fetch-summarised]
- https://www.augur.net/whitepapers/ [H, fetch-summarised]
- https://github.com/AugurProject/zoltar (README, ARCHITECTURE, `docs/mainnet-deployment-addresses.json`, `solidity/contracts/trading/*`, `augurScan/README.md`) [H, read raw via gh]
- https://augurproject.github.io/zoltar/docs/explanation/{system-overview,statoblast,trading,fees}.html , /docs/reference/{security-model,deployment-status}.html [H, fetch-summarised; trading.html gave no fee/curve formulas, which were taken from contract source]
- https://github.com/AugurProject/augur (legacy `environments/mainnet.json`, `matic.json`), https://github.com/AugurProject/turbo , https://github.com/AugurProject/Augur-Constant-Product-Market (2025 constant-product UI for v2 shares, last push 2025-05-27, not evaluated further) [H/M]
- https://github.com/AugurProject/augur-reboot-website (site source) [H]
- https://eth.blockscout.com/api/v2/addresses/... (GET, 2026-10-19) [H]
- https://etherscan.io/address/0xdF55bed7404D85591FE4055cbae9A3abb934FaC8 , https://etherscan.io/token/0x221657776846890989a759ba2973e427dff5c9bb [H, fetch-summarised]
- https://api.llama.fi/protocol/augur , https://defillama.com/protocol/augur [M/L, third-party aggregator]
- Web search (extended) for 2026 status: a "Prediction Markets in 2026: A Research Guide" blog (web3wagmi) reported an April 2026 fork and under-1% market share. [L, secondary, matches primary on the fork]

## Suspicious content

- None aimed at an AI agent. The repos contain `AGENTS.md` files with developer instructions for that repo's own coding agents; they were read as data and not followed.
- `augur.sh` (formerly the Augur Turbo UI domain) now serves an unrelated App Store review tool: treat any link to it from old Augur material as untrusted.
- Legacy repo config contains a third-party provider API key in plain text (not recorded, not used).
