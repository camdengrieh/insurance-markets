# Polywhaler (polywhaler.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
- Not a market venue. It is a paid analytics / whale-tracking layer over Polymarket and Kalshi, plus a trading front-end (Orca) that routes to those two venues. [H]
- adapter_priority: P2 (signal-only). It adds no independent liquidity and no resolution of its own. Its value is as a signal source (whale and "smart money" flow, insider scores), and only on the Quant plan.

## Liveness [H]
- Site live on 2026-10-19; sitemap lastmod 2026-10-19T07:20Z. https://polywhaler.com/sitemap.xml
- Terms last updated April 10, 2026. https://polywhaler.com/terms
- Live data: https://polywhaler.com/api/trades returned trades timestamped minutes earlier (Fed October 2026 market).
- Wikidata inception 2025-10-19 (from the task hint, [M], not re-checked).

## Kind and market model [H]
- Kind: aggregator-or-data (analytics, alerts, copy-trade front-end). No own markets, no own order book, no own outcome tokens.
- Mirrors Polymarket (CLOB, binary outcome tokens, conditional tokens) and Kalshi (regulated, centralised order book, contracts). Trade object carries `asset` (Polymarket token id), `conditionId`, `outcomeIndex`, `priceProbability`, and `ticker` for Kalshi. OpenAPI Trade schema (saved fixture).
- Orca (https://orca.polywhaler.com, "Polymarket Paper & Live Trading" page title) provides paper trading, backtest, copy-trading simulation. Homepage says live trading on Polymarket or Kalshi with "zero Orca fees" (Pro). [H for the claim being made, not verified by use]

## Chains and collateral
- None of its own. Polymarket side: Polygon, USDC (known from the Polymarket venue; not re-verified here) [M]. Kalshi side: USD fiat, no chain [M]. Wallet addresses in the data are Polymarket proxy wallets (`proxyWallet`). [H]

## Read API
- Official, authenticated, paid. Quant plan only (Pro and Free keys are rejected). https://polywhaler.com/developers and https://polywhaler.com/docs/developer [H]
- Base URL: `https://polywhaler.com/api/v2` (OpenAPI `servers` = `https://polywhaler.com/api`, paths prefixed `/v2`). v1 `/api/v1` frozen, sunset April 16, 2027. [H]
- OpenAPI 3.1 spec, public, no auth, 680 KB: https://polywhaler.com/api/v2/openapi.json (43 paths). Reference docs: /docs/api, errors at /docs/api/v2/errors, webhooks at /docs/api/webhooks (not fetched). [H]
- Auth: `Authorization: Bearer pwhk_...`. Key scopes: `read`, `watchlist:write`, `webhooks:write`, `exports:write`. Up to 5 live keys, expiry configurable, rotation overlap 24h. [H]
- Limits: 10,000 requests/day (reset 00:00 UTC), 100 requests/min/key; RateLimit-* headers; 429 with Retry-After. [H]
- Envelope `{data, meta, pagination}`; cursor pagination (`cursor`, `limit`). [H]
- Key endpoints (all GET, from OpenAPI):
  - `/v2/trades` params: venue (polymarket default, kalshi, all), wallet, category, side, minAmount, minInsiderScore, maxProbability, eventSlug, marketSlug, sports (include/exclude/only), from, to, include=smartMoney, limit, cursor
  - `/v2/trades/{id}`, `/v2/smart-money/trades`, `/v2/smart-money/flow`, `/v2/smart-money/leaderboard`
  - `/v2/markets` (markets ranked by whale volume), `/v2/positions/aggregated`
  - `/v2/insider/events`, `/v2/clusters`, `/v2/wallets/{address}` (+ `/trades`, `/positions`, `/score/history`, `/cluster`)
  - `/v2/outcomes` (resolved outcomes / P&L), `/v2/black-swan`, `/v2/oracle`, `/v2/crypto/markets`, `/v2/forecasts/btc*`, `/v2/methodology`, `/v2/usage`
  - Write endpoints are only account-side (watchlist, webhook endpoints, exports). Nothing places trades.
- Coverage limits: only `/v2/trades` and the `trade.whale` webhook cover Kalshi; everything else is Polymarket only. [H]
- Whale-trade storage floors: Polymarket from $2,000; Kalshi from $5,000 ($10,000 for sports and 15-minute/hourly markets) per developer docs; the OpenAPI Trade description says "$10k+ on Polymarket" (docs inconsistent). [H]
- Freshness: whale trades sync every minute; leaderboard every 15 min; BTC forecast hourly. So it lags native venue feeds. [H]
- Push: no WebSocket documented (NOT FOUND in developer page / OpenAPI paths). Webhooks only: 15 event types (`trade.whale`, `trade.smart_money`, `wallet.rank_changed`, `export.completed`, ...), Standard Webhooks signing (`whsec_`), HTTPS on 443/8443 to public addresses. [H]
- Bulk exports CSV/JSON/Parquet up to 100,000 rows per job (Polymarket trades or outcomes). [H]
- Unofficial/internal: the site's own front-end JSON routes (e.g. `GET /api/trades`, `/api/markets/overview`, `/api/markets/count`) answer unauthenticated and are listed as Allow in robots.txt, but they are undocumented, `x-robots-tag: noindex`, and the Terms bar bulk scraping. Do not build on them. [H]
- Fixtures: docs/research/fixtures/polywhaler/ (see below).

## Trade path
- None via the data API. Orca offers live trading on Polymarket and Kalshi inside its own web app; no programmatic Orca API found (NOT FOUND in OpenAPI paths; Orca docs not read). [H/M]
- For an agent, trade directly on Polymarket / Kalshi (covered by other specs). Polywhaler is not a leg.

## PayBox reachability
- paybox_reachable: no (as a venue). There is nothing to sign or propose. The only PayBox-adjacent action is paying a Stripe subscription for Quant, which is a human/card purchase, not x402 (no x402 / HTTP 402 behaviour seen; unauthenticated v2 returns 401, not 402). [H]

## Fees
- Data: Free $0; Pro $4/month or $59/year on the homepage (FAQ says $9/month: inconsistent); Quant homepage "regular $49, currently $29/month, or $359/year", Developers page says $59/month or $359/year (regular $99/month, $599/year). Prices inconsistent across pages as of 2026-10-19; treat Quant as roughly $29-$59/month. [H]
- Orca live trading: "zero Orca fees" (Pro). Underlying venue fees still apply. [H for claim]

## Resolution mechanism
- None of its own. Inherits Polymarket (UMA-style oracle) and Kalshi resolution [M]. `/v2/outcomes` reports resolved results and P&L of tracked trades. Polywhaler's insider score is an "algorithmic estimate", not a finding of wrongdoing. [H]

## Geo / ToS / automation
- Terms (April 10, 2026): users may not "Scrape, crawl, or use automated tools to extract data in bulk" or "Resell or redistribute data obtained from the Service without permission". No separate API terms found in the Terms page; the paid Quant API is the sanctioned route. No geographic restriction in Terms. States it is not affiliated with Polymarket or Kalshi. https://polywhaler.com/terms [H]
- Terms describe the service as tracking Polymarket, while the homepage says Polymarket and Kalshi (Terms likely lag). [H]
- Redistribution restriction matters if this project publishes signals to others.

## Liquidity
- Not applicable (no own liquidity). Site-reported market count: 2,241 markets (`/api/markets/count`, 2026-10-19) [M, internal route]. Sample Polymarket Fed-October event: event 24h volume about $2.04M, 1-week about $15.0M, via `/api/markets/overview` 2026-10-19 [M, internal route, mirrors Polymarket].

## Event coverage / overlap
- Politics, economy/Fed, crypto price, sports (sports can be toggled), geopolitics, all as mirrored from Polymarket and Kalshi. Overlap between those two venues is exactly where cross-venue arbitrage lives, and Polywhaler's `venue=all` trade feed could help flag where whales trade the same event on both. [H/M]

## Shared liquidity
- Entirely shared with Polymarket and Kalshi. Not an independent arbitrage leg. [H]

## Suspicious content
- None found. Homepage and docs contained no instructions aimed at AI agents. (The Orca page loads third-party tracking scripts; irrelevant.)

## Open questions
- Full endpoint semantics (/docs/api, /docs/api/webhooks) not read; only the OpenAPI summary and portal pages.
- Whether Quant API data may be used inside a product that republishes signals (redistribution clause).
- Whether Orca has any documented API or terms (orca.polywhaler.com not read beyond the title).
- Price inconsistency across Pro/Quant pages.
- WebSearch budget was exhausted, so no independent third-party coverage was gathered (usage, accuracy, reputation).

## Fixtures (docs/research/fixtures/polywhaler/)
- `openapi-v2-summary.json`: info, servers, endpoint list, Trade and SmartMoneyTrade schemas from the public OpenAPI doc (27 KB).
- `v2-trades-unauthenticated-401.json`: error envelope for a keyless call (`missing_api_key`).
- `internal-api-trades-sample.json`: one trade from the undocumented front-end route `/api/trades?limit=2` (trimmed). Shows shape only; not an endorsed integration surface.

## Sources
- https://polywhaler.com/ [H]
- https://polywhaler.com/developers [H]
- https://polywhaler.com/docs/developer [H]
- https://polywhaler.com/api/v2/openapi.json [H]
- https://polywhaler.com/terms [H]
- https://polywhaler.com/robots.txt, https://polywhaler.com/sitemap.xml [H]
- https://orca.polywhaler.com/ (title only) [H]
- https://www.wikidata.org/wiki/Q141670346 (from task hint, not re-read) [M]
