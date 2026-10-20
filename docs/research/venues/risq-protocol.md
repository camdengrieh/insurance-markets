# Risq Protocol - venue spec (researched 2026-10-19)

Verdict: SKIP. Not a prediction market (it is an options AMM), effectively dead (TVL about $0, website domains no longer resolve, repos untouched since 2021), no API.

Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## 1. Liveness
- DefiLlama lists it under category "Prediction Market" (miscategorised), with `deadUrl: true`, empty `url`, listed 2021-11-17. [H] https://api.llama.fi/protocol/risq-protocol
- TVL history: $85k (2021-11-18), $42 to about $1k from 2022 to 2025 (token dust), last non-zero point $47 on 2026-07-21, $0 since (latest record 2026-10-19 is 0; `currentChainTvls` shows 0.46). [H] same URL, saved trimmed in fixtures.
- Official site: DefiLlama has no URL. `risqprotocol.github.io` 301-redirects to `risq.capital`, which does not resolve in DNS; risqprotocol.com / .io / app. subdomains do not resolve. [H] curl 2026-10-19
- GitHub org `risqprotocol`: last push to any repo 2021-11-17 (`risqprotocol.github.io`); `risq-options` last commit 2021-10-08. Nothing in 2022-2026. [H] gh api
- DexScreener shows 0 pairs for the RISQ BSC token (0xC2c8...74De). [H] https://api.dexscreener.com/latest/dex/tokens/0xC2c82622a7CB7159D44CEA7e39843a495f2674De ; an older search snippet claimed a PancakeSwap RISQ/WBNB pair with about $6k 24h volume [L, stale].
- Contracts are still deployed on BSC (eth_getCode non-empty for the ETH options contract) but that says nothing about use. [H]
- No 2026 news or announcements found (WebSearch extended; newest hits are 2021-2023 Medium posts). [M]
- Conclusion: still_live = false.

## 2. Kind and market model
- On-chain call/put options DEX with a pooled-liquidity AMM ("Options Desk"). Writers deposit a single asset into a per-underlying pool and receive "writeXXX" receipt tokens; buyers pay a premium. Exercise "at any time during the holding period" (American-style). [H] https://risqprotocol.gitbook.io/risq-protocol
- Underlyings (14): WBTC, BNB, ETH, BCH, LTC, PAXG, COMP, CAKE, UNI, LINK, YFI, AMZN, GOOGL, TSLA. [H] https://risqprotocol.gitbook.io/risq-protocol/smart-contracts
- Not binary/categorical/scalar event markets. Options are not tokenised outcome shares. No event or question markets exist, so there is nothing to map to a yes/no probability except by deriving a probability from option prices (not worth it here).
- Pricing model: NOT FOUND in the GitBook (searched: GitBook home and smart-contracts page); contract source is in `risqprotocol/risq-options` (contracts/Options, Pool) but was not audited here.

## 3. Chains and collateral
- BSC primary. GitBook says Ethereum and Polygon planned; RISQ token also exists on Polygon (0x5f7F...464c) and Avalanche (0x63D3...2509), plus Polygon/AVAX options subgraph repos from Oct 2021. [H] GitBook + gh org repo list
- Collateral: underlying asset deposited by writers; buyers pay premium in the underlying (earlier search snippet said BNB) [M]. Not otherwise specified. [H that GitBook is silent]

## 4. Read API
- None official. Docs mention an "Option Subgraph" and "Pool Subgraph" (repos `risq-options-subgraph`, `options-pools-subgraph`, `polygon-*`, `avax-*`, last pushed 2021). Hosted-service endpoints are very likely retired [L]; not verified. No REST, no websocket. [H that none documented]
- docs_url: https://risqprotocol.gitbook.io/risq-protocol (GitBook: https://risqprotocol.gitbook.io/risq-protocol/smart-contracts)
- Chain-only access via BSC JSON-RPC (e.g. contract reads on the options contracts). Rate limits: NOT FOUND.

## 5. Trade path
- Direct contract calls only (buy/sell/exercise through the options contracts on BSC). No order signing, no off-chain order book. [M]
- PayBox reachability: a BSC EVM wallet could in theory send transaction proposals, but there is no reason to, since the venue has no live liquidity. paybox_reachable = partial (technically, not practically).

## 6. Fees
- 1% settlement fee going to RISQ stakers (from older Medium/search snippet) [L]; GitBook lists no fees and marks protocol-fee sharing "coming soon" [H].

## 7. Resolution
- Chainlink price feeds used for settlement pricing of underlyings (feed addresses on the GitBook smart-contracts page). No event resolution or dispute process. [H]

## 8. Geo / ToS / automation
- GitBook states no KYC; no geo or ToS text found; no automation rules found. NOT FOUND (searched: GitBook home, smart-contracts page; site is offline so ToS is unreachable).

## 9. Liquidity
- DefiLlama TVL $0 as of 2026-10-19 (last non-zero $47 on 2026-07-21; peak about $85k on 2021-11-18). Audits: 2 (solidity.finance). [H]

## 10. Event overlap and shared liquidity
- None with prediction venues. Crypto-price options could in theory be compared to crypto-price binary markets (Polymarket etc.) via implied probability, but no liquidity makes this moot. No shared liquidity with another venue.

## 11. Adapter priority
- skip: dead (TVL zero, domains gone, repos stale since 2021), not an event market, no API.

## Sources
- https://defillama.com/protocol/risq-protocol and https://api.llama.fi/protocol/risq-protocol [H]
- https://risqprotocol.gitbook.io/risq-protocol and /smart-contracts [H]
- https://github.com/risqprotocol (org repos, risq-options README and commit dates) [H]
- https://api.dexscreener.com/latest/dex/tokens/0xC2c82622a7CB7159D44CEA7e39843a495f2674De [H]
- BSC public RPC eth_getCode (bsc-dataseed.binance.org) [H]
- Web search snippets (Medium "What is Risq Protocol", CoinMarketCap, BscScan, CryptoRank, CoinCodex) [L, 2021-2023]

## Fixtures
- docs/research/fixtures/risq-protocol/defillama-protocol-trimmed.json
- docs/research/fixtures/risq-protocol/bsc-eth_getCode-note.txt

## Observations on untrusted content
- No embedded instructions found. GitBook has minor inconsistencies (rLTC address mismatch; TSLA contract link points to GOOGL source).
