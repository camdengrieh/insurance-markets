# Blinq Predictions (predictions.blinq.fi)

Researched 2026-10-19. Verdict: **skip** (app is in maintenance mode, no public API, parimutuel crypto-price rounds with no cross-venue overlap that matters).

Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Status (is it live?)

- [H] The deployed app at https://predictions.blinq.fi/ currently serves a maintenance screen. Its JS bundle (/assets/index-BfJBGsjD.js) renders: "We're under maintenance. Blinq is currently unavailable. Trading, wallets and all markets are paused while we work behind the scenes." HTTP header `last-modified: Sun, 18 Oct 2026 06:10:37 GMT` (fetched 2026-10-19), so the pause was deployed about a day before this research.
- [H] The page `<title>`/meta still say "Candle Rush & Prediction Markets ... predict short-term price movements", i.e. the hint text comes from static SEO tags, not a working UI. sitemap.xml lists only `/` and `/price-arena`.
- [H] The bundle's nav still lists Candle Rush, Price Arena, Portfolio, Rewards, Quests; "Spot Market" and "Derivatives" are flagged `soon`/`disabled` (VITE_DISABLED_FEATURES = "spot-market").
- [M] Prediction Index (https://predictionindex.xyz/ecosystem) lists Blinq as "BNB Smart Chain", status "live", outcome type "binary". This is contradicted by Blinq's own materials (Monad), so the index entry looks wrong/stale on chain, and stale on status.
- [M] Reached via search: Blinq X bio says "The Derivatives Layer for Prediction Market", beta at predictions.blinq.fi, network Monad; another snippet says the account formerly operated as "dfyn" and "now operating as @BlinqFi on Arbitrum" (unclear/unverified; x.com itself returned HTTP 402 to WebFetch, nothing paid or retried).
- [M] Is the maintenance pause temporary or permanent? NOT FOUND (searched: web search "Blinq maintenance paused", X profile blocked, no status page, no docs).

## Kind and market model

- Kind: onchain-other / consumer "mini-game" front end, not a general event-market venue.
- [H] Marketing site https://www.blinq.fi/ (bundle /assets/index-CrQl6n3L.js): "Pick a direction on BTC, ETH or SOL. The round settles against the lock price, and the winning side splits the pool." and "Closed flat. Pools return." This is a **parimutuel up/down pool** per round (open -> locked -> settled), 5-minute rounds on the marketing page.
- [M] Products per airdrop aggregator and search: Price Arena (Up/Down and Momentum on BTC/ETH/SOL; Standard mode uses real USDC, Strategy mode uses a $1,000 virtual balance) and Candle Rush (green/red candle, 5/15/30 min rounds; described as free/quest-based). Later additions claimed: equities (AAPL, TSLA, NVDA etc.), gold, silver, crude oil (L, promotional, undated). Source: https://airdrops.io/blinq/ and search snippets.
- [H] The marketing site says "We are building the margin layer for prediction markets ... The margin layer is not live." So no leveraged Polymarket/Kalshi outcome exposure exists. A search snippet claiming Blinq "layers on Polymarket and Kalshi markets" is [L] and not supported by anything first-hand (the app bundle only references Aster and Pyth).
- Outcome tokenisation: NOT FOUND (no docs, no contract addresses published; searched: site, bundles, GitHub, web search). Likely internal accounting, not tradable tokens.

## Chains and collateral

- [H/M] USDC on Monad (marketing "Settled in USDC"; airdrops.io says deposit USDC on Monad). USDC Monad address quoted by a search snippet (Coinbase page) as 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 [L, not checked on-chain]. Blinq contract addresses: NOT FOUND.
- [H] Wallet UX uses Dynamic (CSP in response headers allows app.dynamic.xyz), i.e. embedded/connected wallet via Dynamic, not a raw order-signing API.

## Read API

- Official public API: **none found**. NOT FOUND (searched: docs.blinq.fi does not resolve; blinq.fi/docs 404; no GitHub org besides router-protocol/blinq-static-assets which holds only static images; web search for docs/API/contracts/audit returned nothing).
- [H] The front end bundle contains only third-party data sources for charts: Aster futures klines (fapi.asterdex.com/fapi/v3/markPriceKlines, wss://fstream.asterdex.com/plain/stream) and Pyth (pyth.dourolabs.app/hermes, /v1/real_time). The Blinq backend URL is not present in the current (maintenance) bundle. Previous builds are not recoverable here.
- Websocket: only to Aster for price data; Blinq round/pool data feed NOT FOUND.
- Fixtures: none saved (no public read API to sample).

## Trade path

- None documented. Wallet-connect via Dynamic in a web UI; no documented order API, signing scheme, or contract ABI. [H] for "no public docs found", unknown whether a private API exists.
- PayBox reachability: **no**. Even if the Monad contracts were found, trading is currently paused, no ABI/addresses are published, and the product is a consumer game. Monad is also not among the listed PayBox chains (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...) so transaction proposals would need Monad support [M].

## Fees

- NOT FOUND (searched: site, bundles, airdrop pages, web search). Parimutuel pools typically take a rake; none stated. Payout multipliers not published.

## Resolution

- [H] Settles against a "lock price" at round end; chart price sources in the app are Aster mark-price klines and Pyth. Exact oracle used for onchain settlement, tie handling beyond "Closed flat. Pools return.", and dispute process: NOT FOUND. Risk is centralized operator/oracle risk (M).

## Geo / ToS / automation

- NOT FOUND (searched: /terms returns the SPA shell only; no readable ToS text). robots.txt allows all crawlers. No API, so no automation rules.

## Liquidity

- NOT FOUND. No volume/TVL published; no DefiLlama/Dune entry found in searches. Assume thin (L). Virtual-balance and quest modes inflate user counts, not liquidity.

## Event overlap and independence (arbitrage)

- Overlap with other venues is only conceptual: short-horizon BTC/ETH/SOL up/down, which exists on Polymarket, Kalshi, Limitless, Myriad etc. Parimutuel payoff (pool split, unknown rake, odds move until lock) is not a fixed-price leg, so classic arbitrage is impractical.
- Not sharing liquidity with Polymarket/Kalshi as far as can be determined (own pools; "margin layer" unreleased). [M]
- Quotient-style signal value: negligible (no public pool-odds feed).

## Open questions

- Why the maintenance pause (migration, wind-down, hack, rebrand)? Does a new backend/API appear after relaunch?
- Real chain: Monad (Blinq's own) vs BNB (Prediction Index) vs Arbitrum (search snippet).
- Contract addresses, fee/rake, oracle.

## Adapter priority

**skip**: product paused as of 2026-10-18/19, no API, no docs, parimutuel micro-rounds, no published liquidity. Re-check only if a relaunch announcement with a public API appears.

## Sources

- https://predictions.blinq.fi/ and its bundle https://predictions.blinq.fi/assets/index-BfJBGsjD.js (H, fetched 2026-10-19)
- https://predictions.blinq.fi/sitemap.xml, /robots.txt (H)
- https://www.blinq.fi/ and bundle https://www.blinq.fi/assets/index-CrQl6n3L.js (H)
- https://predictionindex.xyz/ecosystem (M, listing contradicts first-party)
- https://airdrops.io/blinq/ (M, undated aggregator)
- Web search results incl. https://x.com/blinqfi snippets (L); x.com fetch returned HTTP 402, not pursued
- https://github.com/router-protocol/blinq-static-assets (H, static images only, pushed 2026-10-02)
