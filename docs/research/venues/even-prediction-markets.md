# Even: Prediction Markets (Android app, package com.app.kuru)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

adapter_priority: **skip**. Even is a very young (released 2026-07-15), tiny (100+ installs) mobile front end. There is no public API, no docs, no website and no on-chain contract that we could find. The only hard evidence of its trading backend is a verified Polymarket builder account named "Even" with about 83k USD lifetime volume, which suggests it routes orders to Polymarket's CLOB (M). If so it is a duplicate of Polymarket liquidity, not an independent arbitrage leg. Polymarket is already covered by another workflow.

## Is it live?

- Play Store listing exists, free, category Finance, "100+" downloads, released Jul 15 2026, last updated Aug 12 2026 (H, Play page, fixture `play-store-listing.json`). That is about 2 months without an update as of today.
- Developer: Toxic Flow Labs Pte. Ltd. No developer website is listed on the Play page; the support email is on the toxicflow.xyz domain (H).
- Polymarket builder activity for builder "Even": ALL-time 83,451 USD volume and 55 active users (rank 297); last month 2,290 USD and 5 users (rank 199); last week 103 USD and 1 user (rank 168). Verified flag true. Fetched 2026-10-19 (H, public Data API, fixture `polymarket-builder-leaderboard-even-row.json`). So it is alive but almost dormant.
- Linking the builder "Even" to this Play app is M: the name matches and the hint came from a prior discovery pass, but I found no page that states it. Not confirmed.

## Operator

- Toxic Flow Labs describes itself as a Singapore software consultancy ("designs and builds products, protocols, and production infrastructure"); it lists one named client, Kuru, "a fully onchain spot order book built on Monad" (H, https://www.toxicflow.xyz/). The toxicflow.xyz site does not mention Even or prediction markets (H).
- Kuru docs describe a Monad on-chain order book DEX with swap and trade products and a "Kuru Flow" aggregator; no mention of prediction markets, Polymarket, builder codes or Even (H, https://docs.kuru.io/ via fetch summary).
- So the package name `com.app.kuru` most likely reflects the developer's prior Kuru mobile work (package reuse), not Even being operated by Kuru (M). Relationship to Kuru: NOT confirmed. Treat Even as a Toxic Flow Labs product (M).
- even.xyz, even.trade and even.gg are domain-for-sale parking pages, unrelated (H). Other guessed domains did not resolve or were empty. The real web or API host is NOT FOUND.

## Market model, chains, collateral

- Play description: "mobile-first prediction market app", markets on FIFA/football, politics, macro, crypto, oil, business, culture, breaking news; features are watchlist, price alerts, PnL and position tracking, order and trade updates (H, Play page). It says "Availability, features and markets may vary by region."
- Nothing says Even runs its own market contracts, order book or AMM. Outcome tokenisation, chain and collateral: NOT FOUND (searched: Play page, toxicflow.xyz, kuru.io docs, Polymarket builder leaderboard). If it is a Polymarket builder front end then the model is Polymarket's: binary CTF outcome tokens on Polygon, USDC-family collateral, CLOB (M, inferred from the builder docs: "Orders still go to Polymarket's CLOB ... The builder code doesn't change where trades execute", H, https://docs.polymarket.com/developers/builders/builder-intro).

## Read API

None found. NOT FOUND (searched: Play listing, toxicflow.xyz, kuru.io docs, guessed domains, GitHub repo and code search for the org and package name). No docs URL, no base URL, no websocket. The web search tool was out of budget this session, so a broader web search for an Even website, app store page on iOS, X account or docs was NOT performed; this is the main residual gap. The 1-2 response shapes saved are the Polymarket builder leaderboard row (the only public data about Even) and the Play listing fields, not an Even API.

For a scanner, the useful public read surface is Polymarket's own Data/Gamma/CLOB APIs (covered elsewhere), not Even's.

## Trade path and PayBox reachability

- Programmatic order placement on Even: none documented (NOT FOUND).
- Via PayBox: not reachable through Even. If Even is a Polymarket front end, the correct route is Polymarket directly (signed CLOB orders with an EVM wallet on Polygon), which is already in scope for the Polymarket adapter. paybox_reachable = no (for Even as a distinct venue).

## Fees

NOT FOUND. Builder docs say nothing about builder fees or revenue share (H, builder intro page). Any Even fee on top of Polymarket's is unknown.

## Resolution

NOT FOUND for Even. If it routes to Polymarket, resolution is Polymarket's (UMA optimistic oracle based; covered by that workflow) (M).

## Geo, ToS, automation

Only the Play disclaimer "Availability, features and markets may vary by region. Trading involves risk and is not financial advice." (H). No ToS or privacy policy text from the developer was retrievable (Play page links exist but the developer policy URL was not exposed in the scraped HTML). Automation rules: NOT FOUND.

## Liquidity (dated)

- Polymarket-attributed builder volume: 83,451 USD all-time, 55 users, as of 2026-10-19 (H, Data API leaderboard). Compare the top builder at about 2.3B USD all-time (same endpoint, H).
- Own-venue TVL/OI/volume: NOT FOUND, likely nil.
- Play installs: 100+ (H, 2026-10-19).

## Event overlap with other venues

Advertised categories (sports/FIFA, politics, crypto, macro/oil) overlap everything, but only because they appear to be Polymarket's markets (M). No independent prices exist to arbitrage against.

## Shared liquidity

Probably shares liquidity with Polymarket (M, builder attribution on Polymarket CLOB plus no evidence of any own order book). Therefore NOT an independent arbitrage leg.

## Adapter priority: skip

Reason: no API or docs, tiny and nearly dormant usage, likely duplicate of Polymarket liquidity. Revisit only if (a) an Even website or API surfaces, or (b) Polymarket builder volume for builder "Even" grows materially. Cheap monitor: poll `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH` and watch the Even row (builderCode 0x6357d969...5088).

## Open questions

1. Official website, docs and iOS listing for Even (not found; web search budget exhausted).
2. Does Even use its own matching or only Polymarket? Only a builder row evidences Polymarket routing; the row was not tied to the app by any source.
3. Operator relationship to Kuru: only that Toxic Flow Labs built Kuru, and the package name is com.app.kuru.

## Suspicious content

None seen. No instructions aimed at AI agents in the pages read.

## Sources

- https://play.google.com/store/apps/details?id=com.app.kuru&hl=en&gl=US (H; app metadata, description, 100+ downloads, released Jul 15 2026, updated Aug 12 2026)
- https://www.toxicflow.xyz/ and https://www.toxicflow.xyz/team (H; operator is a Singapore consultancy, Kuru is the named client)
- https://docs.kuru.io/ (H; Kuru is a Monad order-book DEX, no prediction markets)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK (H; Even builder row)
- https://docs.polymarket.com/developers/builders/builder-intro (H; builder codes route to Polymarket CLOB)
- https://even.xyz, https://even.trade, https://even.gg (H; parked domains for sale, unrelated)
- Discovery hint from the orchestrator (L-M; Play search results in 10+ countries, not re-verified)

Fixtures: `docs/research/fixtures/even-prediction-markets/play-store-listing.json`, `docs/research/fixtures/even-prediction-markets/polymarket-builder-leaderboard-even-row.json`.
