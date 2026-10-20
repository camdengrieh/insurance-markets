# Entropyfi (ERP, "lossless prediction games"): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official GitHub org (via `gh api`), public unauthenticated GETs to DefiLlama, CoinGecko and the project's own domains, WebFetch of the homepage. Nothing was signed, posted, paid or executed. The shared WebSearch budget was exhausted when this task started, so no search-engine confirmation of shutdown news or social-media status was possible (see "NOT FOUND").

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

## Verdict

**adapter_priority: skip.** Entropyfi is effectively dead (abandoned since early 2022) and is not an outcome/probability market anyway.

- Official domain `entropyfi.com` has been taken over by an Indonesian gambling SEO page (cloned Mothercare Indonesia storefront, title "ASUPANTOTO: Link Situs Slot Gacor & Toto Togel Online ..."). No product, app, docs, GitHub, Twitter or audit links. [H, curl 2026-10-19 + WebFetch; fixture `docs/research/fixtures/entropyfi/entropyfi-com-homepage-evidence.txt`]
- DefiLlama flags the protocol `deadUrl: true`, `url: ""`. [H, https://api.llama.fi/protocol/entropyfi, fixture `defillama-protocol-entropyfi.trimmed.json`]
- Residual TVL is dust: **$5,243.79** on Polygon (all one token, `AMDAI`, Aave v2 interest-bearing DAI), plus $986.67 of staked ERP-USDC Quickswap LP ("pool2"), as of 2026-10-19. Peak was **$448,421 on 2021-12-13**. TVL has been flat to within about $5 since 2025-07-07 (last change over 3%), i.e. no deposits, withdrawals or visible interest. [H, DefiLlama]
- Last commit anywhere in the official GitHub org is 2021-12-29 (14 repos, 0 followers, org last updated 2021-08-07). [H, `gh api`]
- The product is a no-loss "yield lottery" (long/short on an asset price, winner takes the pooled Aave interest). Payoff is interest only, so it produces no tradable probability and cannot be a leg of a cross-venue arbitrage. [H, contract source]

Nothing to revisit unless the team ships a new version; if wanted, a one-line liveness probe is: `GET https://api.llama.fi/protocol/entropyfi` and check that `currentChainTvls.Polygon` moves materially from ~5.24k.

## 1. Kind and market model

| Item | Finding | Tag |
|---|---|---|
| Kind | "Lossless" (no-loss) prediction game / yield-amplifier, not a conventional prediction market | H |
| Model | Per-pool, two-sided game: users deposit a stablecoin into a LONG side or SHORT side of a pair (BTC, TSLA, OHM against a stable). Principal is supplied to Aave v2 while the pool is Locked. At round end the Chainlink price is compared with the start price: `endPrice >= initialPrice` means LONG wins (ties go to LONG), else SHORT wins. The whole round's Aave interest (minus fee) accrues to the winning side. Losers do not lose principal. | H (`LosslessV2Pool.sol`) |
| Outcome tokenisation | Three ERC-20s per pool created by the factory: long token (`lg...`), short token (`st...`), sponsor token (`sp...`). Redemption value per token = `valuePerLongToken / 10000` (or short), adjusting only by interest won. `swap()` moves between long and short without withdrawing (Accepting state only). Sponsors deposit principal that earns yield for the winner and can withdraw any time; they never play a side. | H |
| Order book / AMM / parimutuel | None of the three in the usual sense. Closest is a parimutuel-style yield pot. There is no price discovery and no secondary market for the position tokens (only mint/burn against the pool). | H |
| Round structure | States `FirstGame, Accepting, Locked, Terminated`. Accepting (bidding) then Locked (gaming) then back to Accepting. Durations are constructor arguments; code comments hint at 1 day bidding / 6 day game but deployed values are NOT FOUND. First depositor of a round sets `initialPrice`. | H code / durations NOT FOUND |
| Pools deployed (Polygon, 2021) | Entropy "V1" factory `0xeff87121ab94457789495918eef5a5904eb04419`; 9 pools: {BTC, TSLA, OHM} x {USDT, USDC, DAI}. DAI pools: BTC-DAI `0xe5545b8009E6CfaeBb9C2A14d3D0a674d87edF1B`, TSLA-DAI `0x3eab615FB407f47D1C4A3340D131917Bc8a49da0`, OHM-DAI `0x047e3D496ce636c05DBc6A877749Ed98193D090e` (the residual TVL is all `AMDAI`, so it sits in one or more of these). | H, https://github.com/entropyfi/entropy-contract-list |
| Underlying events | Only price-direction rounds on BTC, TSLA, OHM (2021 list). No sports, politics, macro or event markets. | H |
| Naming inconsistency | The repo `entropy-1.0-core` is titled "V2 Core Protocol" and contains `LosslessV2*` contracts; the contract list calls the deployed set "Entropy V1". DefiLlama's adapter ABI (`allPools`, `aToken`, `poolTokensInfo`, `status`) matches this source, so repo source is probably the deployed code, but I did not compare bytecode. | M |

## 2. Chains and collateral

- Chain: Polygon PoS only for the games. ERP governance token also exists on Ethereum (`0x0a0e3bfD5a8cE610E735D4469Bc1b3b130402267`) and Polygon (`0x28accA4ed2F6186c3D93e20e29e6e6a9Af656341`). [H, entropy-contract-list / entropy-open-governance READMEs]
- Collateral (principal tokens, Polygon): USDT `0xc2132d05...8e8f`, USDC `0x2791bca1...4174` (bridged USDC.e), DAI `0x8f3cf7ad...a063`. [H]
- Yield source: Aave v2 on Polygon (pool address from `ILendingPoolAddressesProvider`). Aave v2 Polygon still exists (DefiLlama aave-v2 Polygon TVL $17.0M on 2026-10-19), but whether its reserves are frozen or have near-zero supply APY is not verified here. [H TVL / L on reserve status]
- Keepers: pools implement Chainlink Keeper `checkUpkeep/performUpkeep`; `startGame()` and `endGame()` are also public and callable by anyone after the timers. Whether any keeper is still funded is NOT FOUND. [H code]

## 3. Read API

`read_api.exists = onchain-or-subgraph-only`, and in practice **none that is maintained**.

- No official REST/WebSocket API. No docs site (see section 7). No subgraph URL found in the org's repos. [H code, NOT FOUND subgraph]
- On-chain reads (would work against a Polygon RPC; I did not issue JSON-RPC POSTs under the read-only/no-POST rule): factory `allPoolsLength()`, `allPools(i)`, `feeTo()`, `feePercent()`; pool `status()` (returns `isShortLastRoundWinner, isFirstUser, isFirstRound, gameRound, durationOfGame, durationOfBidding, lastUpdateTimestamp, initialPrice, endPrice, currState`), `valuePerLongToken()`, `valuePerShortToken()`, `poolTokensInfo()`, `userLongPrincipalBalance(addr)`, `userShortPrincipalBalance(addr)`, `aToken()`. Events: `Deposit`, `Withdraw`, `SponsorDeposit`, `SponsorWithdraw`, `AnnounceWinner(bool,int256 initial,int256 end)`, `UpdateTokenValue`. [H, `LosslessV2Pool.sol`, `LosslessV2Factory.sol`]
- Only machine-readable aggregate: DefiLlama `GET https://api.llama.fi/protocol/entropyfi` (TVL history 2021-11-04 to today, 1811 daily points). Trimmed sample saved. [H]
- Blockscout on Polygon (`polygon.blockscout.com`) answered HTTP 403 (Cloudflare challenge) to a plain GET, Routescan returned "chain not supported", so no explorer-side activity check was possible. [H]
- Auth / rate limits / websocket: not applicable.

## 4. Trade path

On-chain only; plain contract calls from any EVM wallet on Polygon: ERC-20 `approve(pool, amount)` then `pool.deposit(shortPrincipal, longPrincipal)` (Accepting state only), `withdraw(bool isAToken, shortTokenAmount, longTokenAmount)` (any state), `swap(bool fromLongToShort, amount)`, `sponsorDeposit(amount)`, `sponsorWithdraw(amount)`. No signed-order or off-chain matching scheme exists. [H, contract source]

PayBox reachability: **partial**. A PayBox EVM wallet that supports Polygon could in principle propose these calls as ordinary transactions, but (a) I did not check PayBox's Polygon support (no PayBox tools were called), (b) the pools appear abandoned so there is nothing worth trading, and (c) the product cannot express a price or probability to arbitrage. Not recommended.

## 5. Fees

- Protocol fee: `fee = totalInterest * feePercent / 10000` taken at `endGame()` from the round's interest before it is credited to the winning side; paid to `feeTo`. Set by the DAO (`setFeePercent`, `setFeeTo`, must be < 100%). Fee is on yield only, never on principal. Current `feePercent` and `feeTo` values: NOT FOUND (needs an `eth_call`). [H code]
- The factory `feeTo` can also claim Aave reward tokens via `claimAAVE`. [H code]
- Trading/deposit/withdraw fee: none in the pool code. Gas on Polygon only. [H code]

## 6. Resolution mechanism and risk

- Resolution is automatic and oracle-only: Chainlink `AggregatorV3Interface.latestRoundData()` read at round start (first depositor / `startGame`) and at `endGame()`. `_getPrice()` ignores `roundID`, `updatedAt` and `answeredInRound`, so there is no staleness check. No dispute window, no human resolver. [H code]
- Risks: stale-feed or feed-deprecation risk (the 2021 Chainlink feeds for TSLA/OHM may no longer be maintained, NOT FOUND); keeper liveness (if no one calls `endGame`, pool stays Locked and funds stay in Aave, though `withdraw` works in any state); Aave v2 Polygon deprecation risk; first-depositor can set the reference price; ties resolve to LONG; DAO key (`terminatePool`, fee settings). The `lock` modifier and `onlyAfter` guards look standard. No audit found. [H code / NOT FOUND audits; DefiLlama `audits: "0"`]
- Inference (M): since all TVL is `AMDAI` (aTokens), at least one DAI pool is in the Locked state with funds supplied to Aave, and has stayed that way with essentially no interest accrual since mid-2025.

## 7. Geo / ToS / automation

NOT FOUND. The official docs link chain is broken: `https://entropyfi.gitbook.io/` redirects (HTTP 307) to `https://docs.entropyfi.com/`, which returns 404. [H, curl] The main domain now serves unrelated gambling spam, so any "terms" there are not Entropyfi's. Being a pure smart-contract protocol, automation is permissionless at the contract level; no geo-blocking was observed because there is no working frontend. `app.entropyfi.com` does not resolve. [H, curl]

## 8. Liquidity

| Metric | Value | Source / date |
|---|---|---|
| TVL (Polygon, aToken balance in pools) | $5,243.79 (5,241.66 AMDAI) | DefiLlama, 2026-10-19 [H] |
| Pool2 (ERP-USDC Quickswap LP staked) | $986.67 | DefiLlama, 2026-10-19 [H] |
| Peak TVL | $448,421 | DefiLlama, 2021-12-13 [H] |
| TVL mid-2022 / late-2022 | about $134k (2022-08-01) / $4.7k (2022-10-30) | DefiLlama [H] |
| Last TVL move over 3% | 2025-07-07 (about $7.5k down to $5.2k) | DefiLlama [H] |
| Volume / open interest | NOT FOUND (no source) | |
| ERP token price | CoinGecko `GET /api/v3/coins/entropyfi` returns 404; DefiLlama coins price API returns empty for the Polygon ERP address | [H, 2026-10-19] |
| DefiLlama listing date | 2021-12-20 (`listedAt`) | [H] |

## 9. Event overlap and shared liquidity

- Overlap with other venues: only conceptually "BTC up/down over N days", but payoff is yield-only, no price, no depth, and nothing live. No sports/politics/macro. Not usable for arbitrage. [H]
- Shared liquidity: none with another prediction venue. It borrows yield from Aave v2 only. [H]

## 10. Priority

**skip.** Dead product, hijacked website, $5k dust TVL, no read API, no price/probability to compare, no fees or limits you could model beyond a DAO-set share of interest. If the aggregator ever wants a long-tail "no-loss lottery" signal source, Entropyfi is not it.

## NOT FOUND (searched)

- Official site/app/docs: searched `entropyfi.com`, `www.`, `app.`, `docs.entropyfi.com`, `entropyfi.gitbook.io`; only the hijacked homepage responds.
- Twitter/X (`@entropyfi` per DefiLlama), Discord, Medium, shutdown/sunset announcement: not reachable; WebSearch budget exhausted this session.
- Audit report, ToS, geo restrictions, current `feePercent`/`feeTo`, deployed round durations, pool states, subgraph: searched the org's 14 repos (`entropy-1.0-core`, `entropy-contract-list`, `entropy-open-governance`, `governance`, `entropy-resource`, rest are forks) and DefiLlama metadata.
- Volume and open interest: no source.

## Sources

- DefiLlama protocol API (TVL, `deadUrl`, `listedAt`, methodology): https://api.llama.fi/protocol/entropyfi (page https://defillama.com/protocol/entropyfi returned 403 to WebFetch) [H]
- DefiLlama adapter source: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/entropyfi/index.js [H]
- DefiLlama Aave v2 TVL (Polygon): https://api.llama.fi/protocol/aave-v2 [H]
- Entropy core contracts: https://github.com/entropyfi/entropy-1.0-core (`core/LosslessV2Pool.sol`, `core/LosslessV2Factory.sol`, commit "Entropy v 1.0" 2021-11-20) [H]
- Contract list (Polygon addresses, pools, tokens): https://github.com/entropyfi/entropy-contract-list (last commit 2021-12-06) [H]
- Governance token notes: https://github.com/entropyfi/entropy-open-governance (last commit 2021-11-30) [H]
- GitHub org metadata: https://github.com/entropyfi (via `gh api users/entropyfi`, `orgs/entropyfi/repos`) [H]
- Homepage evidence: https://www.entropyfi.com (curl + WebFetch, 2026-10-19; domain whois via GoDaddy: created 2021-06-11, updated 2025-10-23, expires 2027-06-11) [H/M]
- CoinGecko (404): https://api.coingecko.com/api/v3/coins/entropyfi [H]
- Fixtures: `docs/research/fixtures/entropyfi/defillama-protocol-entropyfi.trimmed.json`, `docs/research/fixtures/entropyfi/entropyfi-com-homepage-evidence.txt`

## Suspicious content

- `https://www.entropyfi.com` is a hijacked/spam site (Indonesian online-gambling SEO on a cloned Mothercare template, 36 links to `rank1.entropyfi.com`). It contains no text aimed at AI agents. Do not visit `rank1.entropyfi.com` or follow its links, and do not treat that domain as official. Recommend the platform registry mark `entropyfi.com` as compromised/untrusted.
