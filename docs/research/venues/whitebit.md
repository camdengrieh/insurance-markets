# WhiteBIT - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. WhiteBIT is a large custodial crypto exchange (CEX). It is registered as a Polymarket *builder* (an order-routing front-end), so any prediction-market access it offers is Polymarket's CLOB liquidity, not an independent venue. Builder volume is tiny. No WhiteBIT prediction-market API exists in its official docs. Nothing to adapt: the Polymarket adapter already covers all this liquidity (and Polymarket builder volume by builder code is a possible attribution signal only).

## Is it live?

- The exchange itself is live (WhiteBIT / W Group, ~35M users claimed; US entity announced late 2025). M - https://www.prnewswire.com/news-releases/whitebit-marks-7-years-of-growth-introduces-w-group-as-a-global-fintech-powerhouse-302624058.html (press release, Nov 2025, as surfaced by search; not opened)
- A prediction-market product at WhiteBIT: **not confirmed**. whitebit.com returned HTTP 403 to WebFetch. NOT FOUND (searched: WebSearch extended x3 for "WhiteBIT prediction markets", "WhiteBIT Polymarket", "WhiteBIT event contracts"; no official announcement or blog post).
- Polymarket builder registration is real and recent: builder "WhiteBIT", verified=true, builderCode `0xa0d2e61f...71cbf2`, no logo. First (and only) volume bucket is calendar 2026, i.e. nothing in 2025. H - https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume?timePeriod=ALL (fixtures saved).
- Still trading in the last month: MONTH leaderboard rank 174, $6,103.67 volume, 6 active users. H (2026-10-19).
- All-time: rank 354 of ~600 builders, $32,448.91 volume, 34 active users. H (2026-10-19). For scale, rank 1 (betmoar) is $2.34B all-time. H

## Kind and market model

- kind: cex-product (Polymarket front-end), at most. M - pm.wiki directory (via WebSearch snippet only; page itself redirected to x.com and was not read) describes it as custodial: "platform holds user funds and matches orders" and as an extra surface in a general exchange. Unverified against WhiteBIT.
- Market model = whatever Polymarket exposes: binary / neg-risk categorical CLOB with ERC-1155 conditional tokens on Polygon, USDC collateral. M (inferred from builder mechanism; see Polymarket spec in docs/research/08-venues-polymarket-kalshi.md).
- Builder mechanism: the builder app attaches its builder code to each order sent to Polymarket's CLOB; the code is serialised onchain in the signed order; Polymarket matches and covers gas via relayer; volume is credited per code. H - https://docs.polymarket.com/programs/builders/overview

## Chains and collateral

- Polygon + USDC (Polymarket). M. No WhiteBIT-specific chain/collateral found.
- Whether WhiteBIT users trade from custody (exchange-held funds) or from user wallets: NOT FOUND. Likely custodial (M).

## Read API

- exists: **none** for WhiteBIT prediction markets. H - https://docs.whitebit.com/ product list (Market Data, Spot, Margin, Futures, Crypto Lending, Sub-Accounts, Mining Pool, Convert, WhiteBIT Codes) has no prediction/event section.
- The only machine-readable trace is Polymarket's public builder analytics (unauthenticated GET, H):
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=50&offset=N` returns `[{rank (string), builder, builderCode, volume, activeUsers, verified, builderLogo}]`. Limit appears capped at 50; paginate with offset (ALL list ends at offset 600).
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL` returns per-builder rows bucketed by `dt` (yearly buckets observed: 2025-01-01, 2026-01-01).
- Fixtures: docs/research/fixtures/whitebit/polymarket-builders-leaderboard-whitebit.json, docs/research/fixtures/whitebit/polymarket-builders-volume-ALL-whitebit-betmoar.json
- WhiteBIT's own public spot API host: `https://whitebit.com/api/v4/public/*` per docs (not tested; `api.whitebit.com/api/v4/public/markets` returned 404 nginx). Spot crypto only, irrelevant to event markets. L

## Trade path

- none via WhiteBIT (no documented API). Programmatic trading of the underlying liquidity should go direct to Polymarket (EIP-712 signed orders on Polygon), not through WhiteBIT. Using WhiteBIT's builder code would only be possible with WhiteBIT's own builder credentials; not applicable.
- PayBox reachability: **no** for WhiteBIT as a venue (custodial CEX, no API). The same exposure is reachable via the Polymarket adapter.

## Fees

NOT FOUND for WhiteBIT prediction access. Polymarket builder docs page does not state builder fee amounts or fee sharing (H - same URL). Do not assume.

## Resolution mechanism

Inherited from Polymarket (UMA optimistic oracle, per Polymarket spec). M. WhiteBIT's own dispute/terms for such markets: NOT FOUND.

## Geo / ToS / automation

NOT FOUND (whitebit.com 403 to fetch tool; no terms for prediction access located). WhiteBIT announced a separate US entity (spot, instant exchange, on/off ramp for KYC'd US users); no evidence of prediction markets there. M

## Liquidity

- Polymarket builder volume attributed to WhiteBIT: $32,448.91 all-time, 34 users (H, 2026-10-19, data-api.polymarket.com); $6,103.67 / 6 users in the trailing month (H, same date). Effectively nil.
- Exchange-level volume is not relevant to this product.

## Event categories / overlap / shared liquidity

- Categories: politics, crypto, sports, macro per pm.wiki (M, snippet only) - i.e. the Polymarket catalogue.
- **Shares liquidity with Polymarket** (orders are routed to Polymarket's CLOB). Not an independent arbitrage leg. H for the builder mechanism, M for WhiteBIT using it as described.

## Open questions

- Is the WhiteBIT prediction UI live to the public, and in which jurisdictions? (whitebit.com 403)
- Does WhiteBIT take a builder fee on top of Polymarket fees?

## Suspicious content

None encountered. (pm.wiki URL 308-redirected to an X profile; not followed.)

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=150 (H)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=350 (H)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL (H)
- https://docs.polymarket.com/programs/builders/overview (H)
- https://docs.whitebit.com/ (H, product list only)
- https://whitebit.com/ (403, not read)
- https://pm.wiki/projects/whitebit (M, via search snippet only; unverified third-party directory)
- https://www.prnewswire.com/news-releases/whitebit-marks-7-years-of-growth-introduces-w-group-as-a-global-fintech-powerhouse-302624058.html (M, search result only)
