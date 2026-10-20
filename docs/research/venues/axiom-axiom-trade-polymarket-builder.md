# Axiom (axiom.trade) Polymarket builder - venue spec

Researched 2026-10-19. Read-only. Verdict: **skip** (adapter_priority). It is a front-end/router that attaches a builder code to Polymarket orders. It has no markets, books or API of its own, and no independent liquidity.

## Summary

- "Axiom" is a verified entry in Polymarket's public Builder Leaderboard (builder code `0xa547d7b8...f4414`). [H, data-api.polymarket.com, 2026-10-19]
- axiom.trade is a Solana-centric memecoin/perps trading terminal. Its docs (docs.axiom.trade, `llms.txt` index) list swaps, limit orders, Pulse, wallet tracking, Hyperliquid perps, staking. They contain NO page on Polymarket or prediction markets. [H, docs.axiom.trade/llms.txt]
- The link between the leaderboard "Axiom" and axiom.trade is NOT verified. axiom.trade returned HTTP 403 to curl and WebFetch. A web search to confirm was not possible (session search budget exhausted). The "ForbesPredict by Axiom" lead was also not verifiable. Treat the name match as [M/L].
- Because any Polymarket order routed by Axiom settles on Polymarket's own CLOB, it is the SAME liquidity as Polymarket. It is not an independent arbitrage leg.

## Live status

- Leaderboard still lists it in Oct 2026 (rank 48 for MONTH, 263 active users, about $0.95M volume). [H]
- Activity is declining: first meaningful volume May 2026 ($616), peak Jun 2026 ($8.14M, 3,805 users, rank 23), then Jul $3.87M, Aug $0.83M, Sep $0.77M, Oct (partial month) $0.95M. [H, `builders/volume?timePeriod=MONTH`]
- All-time builder volume about $14.57M, 5,455 active users, rank 47 of the leaderboard. [H, `builders/leaderboard?timePeriod=ALL`, 2026-10-19]
- Whether the Axiom Polymarket UI is still publicly offered: NOT FOUND (searched: axiom.trade 403, docs.axiom.trade llms.txt, no mention).

## Kind and market model

- kind: broker/front-end (Polymarket builder-code router). No own markets.
- Market model is Polymarket's: binary and categorical (neg-risk) markets on a CLOB, outcome tokens are conditional tokens. See docs/research/08-venues-polymarket-kalshi.md for details; not re-researched here.

## Chains and collateral

- Polymarket settles on Polygon (137), collateral pUSD per existing notes. [H via docs/research/08, not re-verified]
- Axiom's own chain focus is Solana (and Hyperliquid for perps). How Axiom funds a Polymarket order (bridge? Polygon wallet?) NOT FOUND.

## Read API

- exists: none for Axiom itself. NOT FOUND (searched: docs.axiom.trade llms.txt index, 0 hits for "polymarket|predict").
- For attribution/volume only, Polymarket publishes builder stats (public, unauthenticated):
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=0` -> array of `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}` [H, response shape confirmed]
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH` -> time series of `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` per builder per month (2,920 rows) [H]
  - Docs: Polymarket builders page https://docs.polymarket.com/developers/builders/builder-intro (builder dashboard at builders.polymarket.com). [H]
- Market data (books, prices, trades, resolution) comes from Polymarket's own Gamma/CLOB/data APIs, covered by the parallel Polymarket workflow.
- Fixtures: `docs/research/fixtures/axiom-axiom-trade-polymarket-builder/builders-leaderboard-ALL-sample.json`, `.../builders-volume-MONTH-axiom.json`.

## Trade path

- Axiom exposes no programmatic trading API. [NOT FOUND in docs index]
- A PayBox agent trading Polymarket directly would sign orders itself and could set its own builder code. The builder code is serialized in the signed order, and volume is attributed to the builder. [H, docs.polymarket.com builder-intro] There is no reason to go through Axiom.

## PayBox reachability

- paybox_reachable: no (for Axiom as a distinct venue). The only reachable thing is Polymarket itself (EVM typed-data signing on Polygon), tracked in the Polymarket spec.

## Fees

- Axiom's fee schedule for Polymarket orders: NOT FOUND (Axiom docs have fee pages for Solana swaps only; no Polymarket mention).
- Polymarket page does not state how builders earn fees. [H, builder-intro page says only gas-free txs, attribution, leaderboard/grants]

## Resolution

- Identical to Polymarket (UMA-based per Polymarket docs; see docs/research/08). Axiom adds no resolution layer.

## Geo / ToS / automation

- axiom.trade blocks non-browser clients with 403 (Cloudflare-style; cause not inspected). Axiom ToS for prediction trading: NOT FOUND.
- Polymarket geoblock and builder rules apply (see docs/research/08, section on geoblock and co-location not available to builder-program participants).

## Liquidity

- Axiom-routed Polymarket volume: about $0.95M in Oct 2026 (month to date as of 2026-10-19), $14.57M all-time. [H, data-api.polymarket.com, 2026-10-19]
- Liquidity shared with: Polymarket (100%). Not an independent leg.

## Event coverage overlap

- Whatever Polymarket lists (sports, politics, crypto price, macro). Overlaps with all other venues only via Polymarket itself.

## Adapter priority: skip

- No API, no own liquidity, declining volume, and the identity of the builder is unconfirmed.
- Possible minor use: builder leaderboard as a signal of retail flow share per front-end. Low value for the aggregator.

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 [H]
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=0 [H]
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH [H]
- https://docs.polymarket.com/developers/builders/builder-intro (read via summarising fetch, so strictly M for details) [M]
- https://docs.axiom.trade/llms.txt (full page index; no Polymarket/prediction page) [H]
- https://axiom.trade -> HTTP 403 (not readable)
- docs/research/08-venues-polymarket-kalshi.md (internal)

## Not found / open

- Confirmation that leaderboard "Axiom" == axiom.trade (search budget exhausted, site 403).
- Any Axiom prediction-market UI, fee schedule, ToS or API.
- "ForbesPredict by Axiom" - not verified.
- No suspicious or instruction-like content was found in any fetched material.
