# OpenPX (openpx-trade/openpx)

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict
OpenPX is NOT a venue. It is an MIT-licensed, client-side, CCXT-style SDK (Rust core, Python and Node bindings) that wraps exactly two venues: Polymarket and Kalshi. It has no market, no order book, no liquidity, no hosted API, no resolution mechanism and no fees of its own. adapter_priority = skip as a venue leg. It is, at most, a reference implementation for how to normalise Polymarket and Kalshi schemas. Both of those venues are covered by a parallel workflow.

## Kind and liveness
- Kind: open-source aggregator SDK / library (not a trading venue). [H] https://github.com/openpx-trade/openpx README ("One interface to trade across Polymarket and Kalshi").
- Repo created 2026-03-11, MIT, 5 stars, not archived. [H] gh api repos/openpx-trade/openpx
- Latest release v0.3.1 on 2026-05-14; npm @openpx/sdk latest 0.3.1, first published 2026-04-23, last modified 2026-05-14. [H] https://registry.npmjs.org/@openpx%2Fsdk
- Last commit on main 2026-05-14 (about 5 months before today, so possibly stale). Pushes to the repo up to 2026-10-17 are on bot/auxiliary branches (for example bot/upstream-specs-refresh); no release since May. [H] gh api commits/branches/events. Status: published but low-activity; "still live" in the sense that the repo and packages exist, not in the sense of a service.
- https://www.openpx.trade is a landing page that says only "open-source unified trading engine for prediction markets" (no pricing, ToS, hosted API). [H] WebFetch. https://openpx.dev (the docs host named in README) returned HTTP 301 on 2026-10-19; redirect target not followed. [H]

## Market model, chains, collateral
Not applicable; inherited from the wrapped venues. Unified types are orderbook-style (L2 bids/asks), limit orders only (`create_order` "Place a limit order"). Outcomes addressed by market id plus outcome name ("Yes"). [H] README. Polymarket = Polygon/USDC CLOB, Kalshi = USD, CFTC-regulated exchange; those facts belong in the Polymarket and Kalshi specs.

## Read API
- Exists: none as a service. It is a library you run locally; it calls upstream APIs directly. exists = none. [H]
- Upstream hosts it wraps: Kalshi `https://api.elections.kalshi.com/trade-api/v2` (cursor pagination, max page 1000, default 20 rps / burst 5, writes 10 rps) and Polymarket `https://gamma-api.polymarket.com` (`/markets/keyset`, cursor `after_cursor`, max page 500, default 150 rps, bulk 20 rps). [H] engine/core/src/exchange/manifests/{kalshi,polymarket}.rs
- Unified methods: fetch_markets, fetch_market, fetch_orderbook, fetch_trades, create_order, cancel_order, fetch_positions, fetch_balance, fetch_fills, ws orderbook, ws activity. [H] README.
- Extras: sports live-score WebSocket (Polymarket) and crypto price WebSocket (Binance + Chainlink); no auth needed. [H] README / llms.txt
- Docs: https://github.com/openpx-trade/openpx/tree/main/docs (OpenAPI `docs/openpx.openapi.yaml` and AsyncAPI `docs/openpx.asyncapi.yaml` exist in-repo, which describe the SDK's unified surface, not a hosted endpoint; not verified whether anything serves them). Schema crosswalk: docs/schemas/mappings. [H] directory listing; [M] interpretation.
- No fixtures saved: there is no OpenPX-hosted endpoint to GET. Upstream shapes belong to the Polymarket/Kalshi specs.

## Trade path
Bring-your-own credentials, local signing in the SDK: Polymarket via `POLYMARKET_PRIVATE_KEY`, Kalshi via `KALSHI_API_KEY_ID` + `KALSHI_PRIVATE_KEY_PEM`. [H] README. Implication for PayBox: the SDK expects a raw private key in env, which does not fit a non-custodial PayBox flow. PayBox reachability = no (nothing OpenPX-specific to reach; Polymarket orders would need EIP-712 signing via wallet-sign requests and that is a Polymarket-adapter question; Kalshi needs RSA API keys and is not wallet-based). Do not adopt the SDK for execution.

## Fees, resolution, geo/ToS
- OpenPX fees: none documented (no hosted service, no builder fee found). NOT FOUND (searched: README, llms.txt, openpx.trade landing page). Venue fees and resolution are those of Polymarket and Kalshi.
- ToS / automation: NOT FOUND for OpenPX (no ToS on landing page). Upstream venue ToS and geo restrictions apply.

## Liquidity
None of its own. It is 100% shared with Polymarket and Kalshi, so it is not an independent arbitrage leg. Event categories overlap by definition (same markets). No volume/TVL figure applicable.

## Usefulness to this project
- Reference only: field crosswalk (schema/mappings/*.yaml) and unified `Exchange` trait are a worked example of Polymarket+Kalshi normalisation and cross-venue matching inputs. [M]
- Alternative to writing our own adapters is weak: Node SDK is a native napi-rs addon (third-party binary code; do not install), only two venues, last release May 2026.
- Peers in the same class (pmxt, CCXT-style layers) are separate leads.

## Suspicious content
None found. No agent-directed instructions seen in README, llms.txt or manifests.

## Not found
- Hosted OpenPX API or pricing; ToS; fee schedule; reasons for no release since 2026-05-14; contents of docs at openpx.dev (301 not followed).

## Sources
- https://github.com/openpx-trade/openpx (README, docs/llms.txt, engine/core/src/exchange/manifests/*.rs, releases, commits, branches) [H]
- https://registry.npmjs.org/@openpx%2Fsdk [H]
- https://www.openpx.trade [H]
- https://openpx.dev (HTTP 301 only) [H]
