# o1.exchange (o1 Terminal) venue spec

Researched 2026-10-19. Read-only; no accounts, keys or signing. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
- adapter_priority: skip (as a trading leg). Optional P2 signal-only: none useful.
- Reason: o1 is a non-custodial trading front-end/router. Its prediction-market product is a routing layer to Kalshi (already covered separately), so it is NOT an independent liquidity leg. It has no public prediction-market read API, excludes US users, and its ToS bars bots/data mining of the Services. [H/M, see below]

## Liveness
- Site https://o1.exchange live 2026-10-19; docs sitemap lastmod 2026-10-17; articles page lists posts to 2026-10-05. [H] https://o1.exchange , https://docs.o1.exchange/sitemap.xml
- Operator named in disclosure: MoonX Foundation (Cayman). Seed $4.8M (Coinbase Ventures, a16z, AllianceDAO, others) per own disclosure dated 2026-06-02. [H] https://docs.o1.exchange/token/disclosure

## Kind and market model
- Kind: trading terminal / DEX aggregator front-end (spot on-chain, perps routed to Hyperliquid via builder code, prediction markets routed to Kalshi). [H] whitepaper https://docs.o1.exchange/token/whitepaper ("spot, perpetual futures (via Hyperliquid), prediction markets (via Kalshi)"); fees page https://docs.o1.exchange/getting-started/fees
- The current o1.exchange landing page (fetched 2026-10-19) lists Terminal, Swap, Launchpad, Stake, Analytics and does NOT mention perps or prediction markets. [H] https://o1.exchange . Docs and Phemex (updated 2026-08-30) do. [M] https://phemex.com/academy/o1-exchange-perps-prediction-markets-no-custody . Conflicting signals: the prediction-market product may be limited, geo-gated, or de-emphasised.
- Market model for prediction markets: whatever Kalshi offers (binary/categorical, central order book). o1 owns no market, order book, AMM or outcome token. Phemex: "o1 hands prediction market orders to Kalshi" and o1 controls none of Kalshi's downtime/delistings/fees. [M]
- NOT FOUND (searched: docs llms.txt, fees, trading, wallets, whitepaper, disclosure, ToS, site): chain, collateral or settlement mechanics for the prediction-market product; how Kalshi fills are executed from a self-custodial wallet (e.g. via a tokenised-Kalshi route) is undocumented.

## Chains and collateral
- Spot: Base (primary), Solana, BNB Chain. Trading API networkIds: 8453 Base, 56 BSC, 1399811149 Solana. [H] https://docs.o1.exchange/api/trading
- $O token: ERC-20 on Base, 1B fixed supply. [H] disclosure
- Prediction-market collateral/chain: NOT FOUND.

## Read API
- Official docs: https://docs.o1.exchange/api/introduction (index https://docs.o1.exchange/llms.txt). [H]
- Surfaces [H]:
  - o1 Alpha Token API, base https://api.o1.exchange, no auth: GET /api/v1/alpha-tokens?networkId={id} returns a bare JSON array of up to 1000 contract addresses ranked by "o1 Alpha" (spot tokens only, no metadata).
  - Trading API, base https://api.o1.exchange, bearer token: POST /api/v2/order, POST /api/v2/order/complete. Spot token trades only (fields: networkId, signerAddress, tokenAddress, uiAmount, direction, slippageBps, mevProtection, quoteTokenAddress, poolAddress). Key is generated at https://o1.exchange/api-trading (account required; not created).
  - Launchpad Public API, base https://api.launch.o1.exchange/v1, x-api-key; token launch data (Uniswap v4 launchpad), irrelevant to prediction markets.
- No endpoint for prediction markets, prices, books, trades or resolution is documented. NOT FOUND (searched: llms.txt, api/*, sitemap). Probes of /api/v1/markets and /api/v1/prediction-markets returned 404 "No matching routes found". [H]
- Rate limits: Cloudflare edge limits, quota unspecified, handle 429 + Retry-After. Cache-Control public max-age=60, s-maxage=300. CORS *. [H]
- Websocket: NOT FOUND.
- Fixtures: docs/research/fixtures/o1-exchange/alpha-tokens-8453.json (real response, 3 addresses, 2026-10-19), alpha-tokens-1399811149.json (`[]` for Solana). Response confirmed as documented bare array.
- For prediction-market data the correct source is Kalshi itself (separate spec), not o1.

## Trade path
- Spot: Trading API returns unsigned EVM transactions plus a Permit2 EIP-712 payload; client signs typed data and the tx, then POSTs the signed tx to /order/complete (o1 submits with MEV protection). Needs a Bearer API key tied to an account. [H] https://docs.o1.exchange/api/trading
- Prediction markets: none documented via API. UI-only (as far as found).
- Docs example expects a raw private key (`signTransaction`), a pattern incompatible with PayBox, which does not expose raw keys.

## PayBox reachability
- paybox_reachable: no (for prediction markets); partial for spot.
- Spot on Base/BSC: unsigned tx + Permit2 typed data could in principle be signed via PayBox request_wallet_sign / transaction proposals, but the flow needs an o1 API key and the "signed tx" return format; and spot memecoin trading is out of project scope. [M]
- Prediction markets: no documented programmatic path at all. Going to Kalshi directly (or Kalshi-on-Solana routes) is the better path.

## Fees
- Spot: base 1.00%, cashback tiers 0.20% to 0.40% (effective 0.60% to 0.80%). [H] https://docs.o1.exchange/getting-started/fees
- Prediction markets: Fee = round_up(0.07 x C x P x (1-P)), C = shares, P = price 0..1; max 1.75% of C at P=0.5; tier cashback applies to the fee. [H] same page. Note this formula is identical in form to Kalshi's published taker-fee formula (M, inferred from memory; not re-verified this session), suggesting o1 passes through Kalshi's fee; whether o1 adds its own on top is not stated. Phemex says o1 charges a routing fee, no figure. [M]
- Perps: Hyperliquid builder fee 0.010%. [H]
- $O holding/staking gives fee discounts. [H] disclosure

## Resolution and dispute risk
- Delegated entirely to Kalshi (CFTC-regulated DCM rules). o1 adds counterparty/availability risk (third-party routing, delistings). [M]

## Geo / ToS / automation
- ToS: Services not offered to US residents/citizens/persons located in the US; VPN circumvention prohibited; "bots, crawlers, or data mining tools" prohibited for accessing/searching the Services; unreasonable load prohibited. [H] https://o1.exchange/legal/terms
- Whitepaper/disclosure: prediction-market routing "may not be available in specific jurisdictions including the United States". [H] https://docs.o1.exchange/token/whitepaper
- ToS does not mention prediction markets or Kalshi. [H]
- Official API exists for spot, so API use is sanctioned there, but not for prediction markets.

## Liquidity
- Self-reported: $180M+ spot volume, 3M+ txs, 400k+ signups (disclosure 2026-06-02); whitepaper says $220M+ spot volume. Spot only, company-reported, unaudited. [H as claim, L as fact] Dune dashboard linked from https://docs.o1.exchange/community/metrics (not read).
- DefiLlama listing (discovery source) not re-read this session. [M]
- Prediction-market volume/OI via o1: NOT FOUND.

## Event categories / arbitrage overlap
- Whatever Kalshi lists (sports, politics, macro, crypto price). Fully duplicative of Kalshi, so no independent arbitrage leg.

## Shared liquidity
- Yes: prediction-market orders route to Kalshi; perps to Hyperliquid; spot to 100+ on-chain sources. [H whitepaper / M Phemex]

## Suspicious content
- None observed (no instructions aimed at AI agents). Docs include a generic "Documentation Index" note pointing to llms.txt (standard Mintlify boilerplate, not followed beyond fetching the index).

## Open questions
- How o1 executes Kalshi orders from a self-custodial wallet and on which chain.
- Whether the prediction-market product is currently live in the UI for non-US users (landing page omits it).
- Whether o1 adds a fee on top of Kalshi's.

## Sources
- https://o1.exchange (H)
- https://o1.exchange/legal/terms (H)
- https://o1.exchange/articles/ (H)
- https://docs.o1.exchange/llms.txt , /sitemap.xml (H)
- https://docs.o1.exchange/api/introduction , /api/alpha-tokens , /api/trading (H)
- https://docs.o1.exchange/getting-started/fees (H)
- https://docs.o1.exchange/token/disclosure , /token/whitepaper (H)
- https://phemex.com/academy/o1-exchange-perps-prediction-markets-no-custody (M)
- WebSearch result summaries (CoinMarketCap, KuCoin, Dealroom, Phemex) (M/L)
- Further searches blocked: session WebSearch budget exhausted.
