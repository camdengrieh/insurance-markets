# Stoxxi (stoxxi.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority = **skip**. Live, but it is a play-money exchange ("AMMO" has no monetary value), so it cannot be an arbitrage leg and has no settlement value. Its prices may be mirrored from Polymarket/Kalshi (see below), so it is at best a redundant signal. Its ToS forbids bots and scraping. It has 2 markets and no visible user activity.

## Identity and liveness

- Operator: Double Digitize ("Stoxxi"), governed by Dutch law. [H] https://www.stoxxi.com/terms (last updated 5 July 2026)
- Site live and serving 2026-10-19 (HTTP 200). [H] https://www.stoxxi.com
- Engine health endpoint reports healthy, uptime 2,912,879 s (about 33.7 days), `connections: 0`, `markets.count: 2`, `ammQuoting.quoting: true`. [H] https://engine.stoxxi.com/health (fixture `engine-health.json`)
- GitHub org created 2026-07-09, one public repo `stoxxi/orderbook` (MIT, 1 star, last push 2026-07-09). [H] https://github.com/stoxxi ; npm `@stoxxi/orderbook` 1.1.0-1.1.2, all published 2026-07-09. [H] https://registry.npmjs.org/@stoxxi/orderbook
- Very young (about 3.5 months). One public project, no community footprint found. WebSearch budget was exhausted this session, so independent coverage was NOT FOUND (searched: only the official site, GitHub and npm).

## Kind and market model

- Kind: forecasting, play-money, not real-money. ToS: "Stoxxi is a play-money social prediction arena. You trade virtual shares on real-world events using 'AMMO', an in-app virtual currency. No real-money wagering." and "AMMO has no monetary value ... cannot be exchanged for money". [H] https://www.stoxxi.com/terms
- Homepage: "Automated Market Maker (AMM)" with "enter or exit a position instantly, 24/7"; "Free 1,500 AMMO For New Operators"; clans; leaderboard scored by Brier score. [H] https://www.stoxxi.com
- Engine is also a price-time-priority CLOB. The repo says the library is "the matching core that powers stoxxi.com, a production virtual-money prediction exchange". The AMM quotes into the book (health shows `ammSolvency` with `buyingPower`, `perMarketCompleteSets`, `ammPnL`). [H] https://github.com/stoxxi/orderbook ; https://engine.stoxxi.com/health
- Structure from `/api/markets`: market `type: "NEG_RISK"`, `sumConstraint: "1.0000"`. Each market is a multi-outcome event whose outcomes are YES instruments (`instruments[]`, with `complementInstrumentIds`). Price decimals 4, tick 0.0001, price range 0.0001-0.9999, min order size 1. Outcomes are internal database instruments, not tokens. [H] fixture `api-markets-trimmed.json`
- Live market count: 2. F1WDC26 (F1 2026 World Drivers Champion, 27 instruments, 5 placeholders, ends 2026-12-06) and FIFAWC26 (World Cup 2026 winner, 50 instruments, 2 placeholders). The FIFA market has `endDate` 2026-07-19 but is still `status: ACTIVE`, with instruments flagged `isResolved: true`. This is stale state. [H] https://www.stoxxi.com/api/markets, fetched 2026-10-19
- Every non-placeholder instrument carries `polyTokenId` (Polymarket CLOB token id) and `kalshiTicker` (e.g. `KXF1-26-MV`): 22 of 27 in F1, 48 of 50 in FIFA. The instruments are explicitly mapped to Polymarket and Kalshi contracts. [H] same endpoint. The purpose is not documented. It is likely mirroring or seeding prices from those venues, so Stoxxi probably has no independent price information [M, inferred, NOT FOUND in docs].

## Chains and collateral

None. No chain, wallet or token. The only unit is AMMO, a revocable in-app licence ("Balances and history may be reset without compensation"). Fields `negativeAdapterAddress: null` and `auditLogId: null` confirm no on-chain component. [H] terms and `/api/markets`. Paid Stripe plans (Pro, Elite) buy features only. [H] terms section 6

## Read API

- Official, documented API: **none**. NOT FOUND (searched: homepage links, /docs (redirects to a 307 placeholder), /api/docs 404, /llms.txt 307, /robots.txt 404, /sitemap.xml 404, GitHub org (orderbook library only), and the JS bundles for API paths).
- Undocumented but unauthenticated JSON used by the web app:
  - `GET https://www.stoxxi.com/api/markets` returns 200 `application/json`, about 118 KB, `cache-control: public`, Vercel-cached. It has no prices, books or volumes, only metadata. [H] fixture `api-markets-trimmed.json`
  - `GET https://engine.stoxxi.com/health` returns status, AMM solvency and market count. [H] fixture `engine-health.json`
- The frontend config references `NEXT_PUBLIC_ENGINE_WS_URL=wss://engine.stoxxi.com` and `NEXT_PUBLIC_ENGINE_HTTP_URL=https://engine.stoxxi.com`. [H] from the site JS bundles. Prices, depth and trades appear to flow over the websocket and require login. I did not connect to it. Message schemas: NOT FOUND.
- `https://engine.stoxxi.com/` and `/api/markets` on the engine host return 404.
- Auth/limits: none documented for the public endpoints. Auth for the app uses Better Auth under `/api/auth` (Google or email login), seen in the JS bundles [M].
- Bundle-visible private routes (not called): `/api/orders/cancel`, `/api/orders/replace`, `/api/user/visibility`. [H] as strings in JS, behaviour unverified.

## Trade path

Logged-in users trade over the websocket to the engine, with cancel/replace via the `/api/orders/*` routes. No API keys, signing scheme or developer trading API is documented. NOT FOUND. Not reachable from PayBox: there is no chain, no EVM or Solana transaction, and no signed-order scheme. **paybox_reachable = no.**

## Fees

NOT FOUND in the ToS or homepage. There are no monetary fees since there is no money. The ToS says paid plans give "features and tooling only - never an advantage in how orders are matched or filled".

## Resolution

Instruments have `resolutionSource`, `resolvedValue` and `isResolved` fields, but the sample values are null, and no resolution policy or dispute process is documented. NOT FOUND. The stale FIFA market (resolved instruments, market still ACTIVE after its end date) suggests manual or lagging resolution. [M] Dispute risk is irrelevant because there is no value at stake.

## Geo, ToS and automation

- Age 16 or over, one account per person. [H] terms
- Section 7 forbids: "use bots, scripts, or automation to interact with the Service, or scrape it". Automated trading or scraping is therefore a ToS breach. [H] https://www.stoxxi.com/terms. The unauthenticated GETs I made were a single-shot read of public config for this research.
- No geo-block documented.

## Liquidity

No volume, OI or TVL figures are published. NOT FOUND. Signals: `connections: 0` on the engine at fetch time, 2 markets, AMM inventory of 50,000 complete sets in F1 and 0 in FIFA, `ammPnL` -5.76e12 in raw units (scaling unknown), and the project is about 3.5 months old. [H] engine health, 2026-10-19. The liquidity is virtual and not tradable for real value.

## Event overlap

F1 drivers' championship and World Cup winner (sports). Those overlap Polymarket and Kalshi, and are explicitly mapped to them via `polyTokenId` and `kalshiTicker`. Stoxxi prices cannot be monetised, so there is no arbitrage. The mapping itself is the only reusable asset: a ready-made Polymarket token id to Kalshi ticker crosswalk for two events (about 70 outcomes). Verify before use [M].

## Shared liquidity

Not an independent leg. It has no real-money liquidity, and its prices may be seeded from Polymarket/Kalshi [M].

## Adapter recommendation

skip. Optional: treat `/api/markets` as a source for a cross-venue id crosswalk only. Do not build a trading or price adapter.

## Open questions

- How AMM quotes are derived (mirrored from Polymarket/Kalshi, or an internal curve)?
- Websocket schema and whether any unauthenticated market-data channel exists.
- Whether the FIFA market is intentionally left ACTIVE.

## Suspicious content

None found. No embedded instructions aimed at AI agents in the pages or APIs read.

## Sources

- https://www.stoxxi.com (homepage) [H]
- https://www.stoxxi.com/terms (Terms of Service, 5 July 2026) [H]
- https://www.stoxxi.com/protocol (brand manifesto, no technical content) [H]
- https://www.stoxxi.com/api/markets [H]
- https://engine.stoxxi.com/health [H]
- https://github.com/stoxxi and https://github.com/stoxxi/orderbook (README via gh api) [H]
- https://registry.npmjs.org/@stoxxi/orderbook [H]
- Site JS bundles under https://www.stoxxi.com/_next/static/ (engine host and route names) [H]
- Fixtures: docs/research/fixtures/stoxxi/api-markets-trimmed.json, docs/research/fixtures/stoxxi/engine-health.json
