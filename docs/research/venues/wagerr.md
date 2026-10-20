# Wagerr (WGR) - venue spec

Researched 2026-10-19. Verdict: **skip** (likely dead / unreachable; no integrable API). Confidence medium.

## Status (still live?)
- Homepage https://www.wagerr.com/ serves a Dan.com / Efty "The premium domain name wagerr.com is for sale. Buy it now!" page (HTTP 200 only with TLS verification disabled; WebFetch fails "unable to verify the first certificate"). [H] fetched 2026-10-19.
- docs.wagerr.com does not resolve in DNS (WebFetch ENOTFOUND, curl exit 6). wagerr.gitbook.io/docs 307-redirects to the non-resolving docs.wagerr.com. [H]
- explorer.wagerr.com (homepage of the wagerr-explorer repo) and wagerr.info, betting.wagerr.com: connection fails (HTTP 000). [H]
- CoinGecko /search?query=wagerr returns empty and /coins/wagerr returns "coin not found". [H] (could be delisting or API quirk).
- GitHub org wagerr: core repo `wagerr/wagerr` last push 2021-12-09, last commit 2021-06-21. Most recent org push is Wagerr-Electrum 2024-02-29; nothing in 2025-2026. Not archived. [H via gh api]
- Yogonet 2026-07-13 describes Wagerr in the past tense ("used blockchain...", "not widely adopted"). [M] https://www.yogonet.com/international/news/2026/07/13/125292-could-sportsbooks-launch-their-own-cryptocurrencies-lessons-from-the-operators-that-already-tried
- Only residual signal: aggregator pages (Coinbase price page, DappRadar, review sites) still list WGR; a Coinbase snippet claimed a Sept 2026 ATH but is internally inconsistent. [L] Not confirmed that any sportsbook UI takes bets in 2026.
- WebSearch budget was exhausted mid-task, so no further news searches (project social channels, exchange delistings) were done.

## Market model
- Own L1 (PIVX/Dash fork, Quark PoS, 60s blocks, masternodes with 25K WGR collateral). Betting is native chain transactions (OP_RETURN-encoded) handled by wagerrd; src/betting/ has bet.cpp, bet_v2..v4, oracles.cpp, quickgames/dice. [H] https://github.com/wagerr/wagerr (README, tree)
- Sportsbook-style fixed-odds events (money line, spreads, totals, parlays), oracle-posted events and odds, bets paid from a chain-funded "betting pool" (token holders / masternodes act as the house) rather than an order book, AMM or parimutuel. Odds limited between 1x and 99x (BET_MINODDS/BET_MAXODDS). [H for odds bounds in src/betting/bet_common.h; M for rest from search snippets]
- Outcomes are not tokenised; a bet is a chain tx output, no tradable position.

## Chains and collateral
- WGR native coin only. Wrapped bridge contracts exist for BSC and Cronos (repos Wagerr-Crosschain-BSC-Contract, Wagerr-Crosschain-CRONOS-Contract, last push 2022-04). Betting itself needs native WGR on the Wagerr chain. [H repo existence; L current usability]

## Read API
- Official public: none confirmed. Candidates are dead: docs.wagerr.com (no DNS), explorer.wagerr.com (unreachable). Core RPC (wagerrd, JSON-RPC, e.g. via wagerrd-rpc npm client) exists only against a self-hosted full node. Self-hosting an unmaintained 2021 chain node was out of scope. [H wagerrd-rpc README; others NOT FOUND]
- NOT FOUND (searched: docs.wagerr.com, wagerr.gitbook.io, explorer.wagerr.com, wagerr.info, GitHub org repos): REST/websocket API, rate limits, event/odds endpoints.
- No fixtures saved: no live public API to sample (docs/research/fixtures/wagerr/ left empty).

## Trade path
- Native chain transaction signed with a WGR key (Bitcoin-style UTXO tx). No EVM signed-order or tx-proposal path. NOT FOUND any programmatic trading API besides wallet RPC (placebet-style commands in node, not verified this session). [L]

## PayBox reachability
- No. A PayBox EVM/Solana wallet cannot place Wagerr bets (separate UTXO chain, own wallet). The BSC/Cronos wrapped-WGR bridge would only move tokens, not bet. [M]

## Fees
- NOT FOUND in a primary source this session. Older review claims ~6% fee on bets with the pool paying winners and losing-bet tokens burned. [L, stale ~2020]

## Resolution
- Oracle-node results posted on chain (oracles.cpp); masternode/oracle operator trust. Dispute process NOT FOUND. [M]

## Geo / ToS / automation
- NOT FOUND (site gone). A third-party review mentions KYC-free crypto payments only. [L]

## Liquidity
- NOT FOUND current volume/OI/TVL. No reliable 2026 figure; assume negligible. [L]

## Event categories overlapping other venues
- Historically sports (soccer, NFL, NBA, MMA, esports) and some politics/entertainment. Overlap would exist with sports books but without a reachable price feed it is moot. [M]

## Liquidity sharing
- None known; independent chain pool, but irrelevant given status.

## Adapter priority
- skip: domain for sale, docs/explorer hosts unresolvable, core repo idle since 2021, no API, UTXO chain unreachable from PayBox.

## Open questions
- Is a mainnet still producing blocks / any oracle posting events? (check a block explorer or run a node; not done)
- Any third-party Wagerr explorer API still alive?

## Sources
- https://github.com/wagerr/wagerr (README, src/betting tree, commits) [H]
- https://github.com/wagerr/wagerrd-rpc [H]
- https://github.com/wagerr (org repo push dates) [H]
- https://www.wagerr.com/ (domain-for-sale page, 2026-10-19) [H]
- https://docs.wagerr.com/ (no DNS) [H]
- https://api.coingecko.com/api/v3/search?query=wagerr (empty) [H]
- https://www.yogonet.com/international/news/2026/07/13/125292-could-sportsbooks-launch-their-own-cryptocurrencies-lessons-from-the-operators-that-already-tried [M]
- Web search snippets: coinbase.com/price/wagerr, dappradar.com/dapp/wagerr, bitcoinchaser.com/review/wagerr [L]

## Suspicious content
- None found (no agent-directed instructions).
