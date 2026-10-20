# Sharpe Platform Token (SHP): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: CoinMarketCap pages (WebFetch), official GitHub org via `gh api`, public unauthenticated GETs to Blockscout, DNS lookups. Nothing was signed, posted or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page was read through the WebFetch summariser, not raw.

## Verdict

**adapter_priority: skip.** Sharpe Platform Token is not a prediction-market venue. It is an ERC-20 token from a 2017 ICO of "Sharpe Capital", an algorithmic equity fund in London. There are no markets, no outcome tokens, no order book and no API to adapt. The project is also effectively dead: the official domain does not resolve, the GitHub org has been idle since 2021 and the token trades almost never.

- The only place it is called a prediction market is the CoinMarketCap category tag (see section 1). That tag is a token-listing label, not evidence of a venue. [M]
- The CMC `view/prediction-markets` row for SHP shows price `$--`, no market cap, no volume, and no note. [H, https://coinmarketcap.com/view/prediction-markets/ (fetch-summarised)]
- Nothing here changes the earlier lead ("likely legacy"): confirmed legacy and non-venue. The hint's "not verified" is now resolved.

## 1. What it actually is

| Fact | Value | Tag / source |
|---|---|---|
| Name / ticker | Sharpe Platform Token, SHP | H, Blockscout `GET https://eth.blockscout.com/api/v2/tokens/0xef2463099360a085f1f10b076ed72ef625497a06` |
| Chain / standard | Ethereum mainnet, ERC-20, 18 decimals | H, same |
| Contract | `0xEF2463099360a085f1f10b076Ed72Ef625497a06`, verified, created 2017-11-06 (block 4502552) | H, Blockscout address + tx endpoints |
| Total supply | 32,000,000 SHP | H, Blockscout; M, CMC page (fetch-summarised) |
| Holders / lifetime transfers | 1,897 holders, 18,353 transfers | H, Blockscout `/tokens/{addr}/counters`, 2026-10-19 |
| CMC tags | Prediction Markets, Asset Management, Crowdsourcing; page marked "preview" | H, https://coinmarketcap.com/currencies/sharpe-platform-token/ (fetch-summarised) |
| CMC last price | $0.00045992, "no change over 24h", market cap and volume not listed, circulating supply inconsistent (0 vs about 17.41M) | M/L, same page; looks like a frozen, stale quote |
| Issuer | Sharpe Capital, GitHub org `sharpe-capital`, bio "an algorithmic investment fund, specialising in US equity markets", location London, org created 2017-03-14, last updated 2021-07-14, 7 public repos, 0 followers | H, https://github.com/sharpe-capital (`gh api orgs/sharpe-capital`) |
| Token repo | `sharpe-token`: "Sharpe Capital crowdsale token", MiniMe-derived ERC-20, ICO minting rule per 1 ETH: 2,000 SHP to contributor, 1,500 to a reserve multisig, 1,000 to a founders/community multisig, 500 to a bounty multisig; vesting schedule "TBC"; last push 2017-11-18 | H, https://github.com/sharpe-capital/sharpe-token (README via `gh api`) |
| Platform contracts | `contracts-core`: `TradeLedger.sol` ("trustless trading ledger", stores equity points and positions of fund accounts), `SentimentAnalysis.sol` (owner-written reputation scores for "sentiment providers"), `AccountOwnership.sol`; Solidity ^0.4.x; last commit 2018-02-12 | H, https://github.com/sharpe-capital/contracts-core |

Interpretation: the "prediction" and "crowdsourcing" tags most plausibly come from the crowd-sourced sentiment/reputation idea (users make market-sentiment calls, the owner records correct/incorrect counts and a reputation score). That is a reputation ledger, not a market where anyone stakes collateral against an outcome. [M, inferred from the `SentimentAnalysis.sol` source; the whitepaper could not be read]

## 2. Is it still live (2026)?

- **Website: down.** `sharpe.capital`, `www.sharpe.capital` and `sharpe.capital/whitepaper.pdf` all fail to resolve: curl exit 6 ("Could not resolve host"), WebFetch `getaddrinfo ENOTFOUND`, and `dig` against both 1.1.1.1 and 8.8.8.8 returns SERVFAIL with no answers (2026-10-19). SERVFAIL rather than NXDOMAIN means the delegation or nameservers are broken, not just a missing A record. [H, fixture `dns-and-site-probe-2026-10-19.txt`]
- **Repos: abandoned.** Newest push to any Sharpe-owned repo is 2018-02 (`contracts-core`); `trade-ledger-node-sdk` is an empty repo; the org's remaining repos are unrelated forks (`XChange`, `xchange-stream`, `react-native-snap-carousel`). [H, `gh api orgs/sharpe-capital/repos`]
- **Token: barely moves.** The latest 50 transfers span 2020-01-29 to 2026-02-13. Only 2 of them are in 2026 (both 2026-02-13) and 12 are in 2025-08; three of those share one timestamp (2025-08-07 02:48:59) and one amount (568.077 SHP), which looks like a single multi-hop transaction (the others in that month were not inspected individually). Across the 50 transfers there are 18 distinct months in about 6 years, so activity is sporadic and tiny. About 18,300 older transfers are not in the sample. [H, fixture `blockscout-shp-transfers-recent-50-trimmed.json`]
- **No DEX liquidity found.** DexScreener `GET https://api.dexscreener.com/latest/dex/tokens/0xef2463099360a085f1f10b076ed72ef625497a06` returned `{"pairs":null}`. [H] Combined with the null Blockscout `exchange_rate`, `volume_24h` and `circulating_market_cap`, there is no evidence of any tradable pool. [M]
- The token itself is still "live" in the sense that the contract exists and transfers are possible. That does not make it a venue.

## 3. Adapter spec fields (all effectively N/A)

- **kind / market model:** none. Not a venue. No binary/categorical/scalar markets, no order book, AMM or parimutuel, no outcome tokenisation. [H, absence in both Sharpe contract sources and READMEs]
- **Chains / collateral:** only the SHP ERC-20 on Ethereum. No collateral model because there are no markets.
- **Read API:** `none`. No documented official API, no subgraph, no docs site (the domain is dead). The only readable surface is raw Ethereum state for the ERC-20 (balances, transfers), available from any RPC or Blockscout. That is not market data. NOT FOUND (searched: sharpe.capital and www.sharpe.capital, GitHub org repos and READMEs, CMC page links; WebSearch for "Sharpe Platform Token SHP prediction market" could not run because the session's search budget was exhausted).
- **Websocket:** NOT FOUND.
- **Trade path:** none. An EVM wallet reachable through PayBox could in principle send the ERC-20 via a plain `transfer`, but there is no market, order or position to trade. PayBox reachability is moot. [H]
- **Fees:** NOT FOUND. No fee model exists beyond Ethereum gas on token transfers.
- **Resolution / dispute risk:** none, no markets to resolve. The related `SentimentAnalysis` contract is owner-controlled (`Owned`), so any "reputation outcome" is centrally written. [H, `contracts-core` source]
- **Geo / ToS / automation:** NOT FOUND (site down, no ToS reachable).
- **Liquidity:** no meaningful number exists. FDV from the stale CMC quote would be about 32M x $0.00046 = about $14.7k, but the price is frozen and unsupported by any DEX pool. [L, CMC page, undated quote] No DEX pool found, Blockscout market data null (2026-10-19). [H]
- **Event categories overlapping other venues:** none. No events.
- **Shared liquidity:** none, not applicable.

## 4. If anything is worth tracking

Nothing for the scanner. Optional, cheap revisit trigger: `sharpe.capital` resolving again, or a new post on `github.com/sharpe-capital`. Low priority because the issuer describes itself as an equity-trading fund rather than a prediction-market operator.

## 5. Not found / gaps

- Whitepaper (`sharpe.capital/whitepaper.pdf`): unreachable; its description of the "Sharpe platform" is unread, so the interpretation in section 1 is inferred from code. (searched: the CMC-listed URL, DNS from two resolvers, the GitHub org for a copy.)
- Any other project named "Sharpe" that is a real prediction market: NOT FOUND. A GitHub repository search for `sharpe prediction market` returned only unrelated quant/ML repos that use the Sharpe ratio as a metric. Web search could not be run (budget exhausted), so a venue under a different name cannot be ruled out. [L]
- Social accounts (Twitter/X, Telegram) linked from CMC: not fetched (no browser automation; unauthenticated fetches of those sites are not useful).
- Contents of CMC's description text for SHP: the fetch returned only metadata and tags.

## 6. Suspicious / embedded instructions

None found. No page, README or API response contained instructions aimed at an agent. The CMC fetches returned ordinary listing data.

## Sources

- CoinMarketCap token page (fetch-summarised): https://coinmarketcap.com/currencies/sharpe-platform-token/
- CoinMarketCap category list (fetch-summarised): https://coinmarketcap.com/view/prediction-markets/
- GitHub org: https://github.com/sharpe-capital (org metadata and repo list via `gh api`)
- Token repo README: https://github.com/sharpe-capital/sharpe-token
- Platform contracts repo (`SentimentAnalysis.sol`, `TradeLedger.sol`): https://github.com/sharpe-capital/contracts-core
- Blockscout (Ethereum) public GETs, 2026-10-19: `https://eth.blockscout.com/api/v2/tokens/0xef2463099360a085f1f10b076ed72ef625497a06`, `.../tokens/{addr}/counters`, `.../tokens/{addr}/transfers`, `.../addresses/{addr}`, `.../transactions/0x21e9ff86...ab45`
- DexScreener public GET: `https://api.dexscreener.com/latest/dex/tokens/0xef2463099360a085f1f10b076ed72ef625497a06`
- DNS/site probes: see fixture `dns-and-site-probe-2026-10-19.txt`
- CoinGecko lookups returned HTTP 429 (rate limited), so no CoinGecko data is used.

## Fixtures (docs/research/fixtures/sharpe-platform-token/)

- `blockscout-shp-token.json`: token metadata (supply, holders, null price fields).
- `blockscout-shp-token-counters.json`: lifetime transfer and holder counts.
- `blockscout-shp-address.json`: contract flags and creation tx (address fields only).
- `blockscout-shp-transfers-recent-50-trimmed.json`: latest 50 transfers, trimmed to timestamp/type/value.
- `github-sharpe-capital-org.json`: org metadata (description, dates, repo count).
- `dns-and-site-probe-2026-10-19.txt`: record of the failed site and DNS probes.
