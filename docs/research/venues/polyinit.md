# Polyinit (polyinit.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a venue. Polyinit is a third-party front end, bot and copy-trading layer on top of Polymarket (plus a Hyperliquid perps terminal). It has no market model, order book, resolution or liquidity of its own. It shares 100% of its prediction-market liquidity with Polymarket, so it is not an independent arbitrage leg. adapter_priority = skip. Its only use to the aggregator is as a signal source (builder-attributed Polymarket volume, copy-trade target wallets), and even that is covered by the Polymarket adapter.

## Live status (H)

- https://polyinit.com/ returns HTTP 200, title "Polyinit | Polymarket Trading Tools, Bots & Analytics" (H, fetched 2026-10-19).
- llms.txt shows an insights article "updated 2026-08-20" and a World Cup 2026 bracket page in the sitemap (H).
- Polymarket data-api builders leaderboard lists builder `polyinit.com`, verified=true, with DAY volume of about $1.4k (8 active users) on 2026-10-19 (H, fixture). Small but alive.

## Kind and market model

- kind = other (aggregator / routing front end / bot platform). Not a market operator.
- Prediction markets shown are "Live Polymarket markets and order books" (H, https://polyinit.com/llms.txt). Market model, tokenisation and collateral are therefore Polymarket's (binary and neg-risk categorical CLOB, ERC-1155 conditional tokens on Polygon). Not re-verified here; belongs to the Polymarket spec (M).
- Features (H, https://polyinit.com/user-guide): Quick Trade and trade page, bots (DCA, Market Maker, Crypto Market Up/Down, Sports, LP Farm, Weather, Reversal, Pendulum, Panic, Trail Grid), copy trading, wallet discovery, leaderboard (XP/PNL/volume), referrals, Builders analytics, papertrading simulation, Telegram trading, and a Perps terminal (Trail Grid runs on Hyperliquid perps).

## Chains and collateral

NOT FOUND on Polyinit pages (searched: user-guide/wallets-management, pricing-fees, llms.txt). The wallets guide distinguishes a signer EOA address from a "Polymarket proxy/deposit address", which matches Polymarket's proxy-wallet model (H for the signer/proxy text, M for the Polygon inference). Perps side uses Hyperliquid (H, user-guide).

## Read API

- exists = none (no public or documented developer API). The user guide and landing page link no API docs (H, WebFetch of /user-guide). Site paths /api, /ops-admin, /portfolio, /wallets, /docs, /telegram/link, /ref are declared private/internal in llms.txt, and robots.txt disallows /api/ (H). I did not probe them. `/api` and `/terms` return 404 (H).
- Official docs URL: https://polyinit.com/user-guide (end-user guide only).
- The data an aggregator needs (markets, books, trades, resolution) comes from Polymarket's own Gamma, CLOB and Data APIs, not from Polyinit.
- Only machine-readable Polyinit-related data found: Polymarket's public Data API builders leaderboard `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=50` (unauthenticated, H, fixture). Row shape: `rank` (string), `builder`, `builderCode` (bytes32 hex), `volume` (USD float), `activeUsers`, `verified`, `builderLogo`.
- Rate limits / websocket: NOT FOUND for Polyinit (n/a).

## Trade path

- Programmatic order placement via Polyinit: none (no API). Users trade via web UI, Telegram, or hosted bots (H, pricing-fees page).
- Programmatic trading of the same liquidity should go direct to Polymarket CLOB with signed orders, tagging the order with a builder code if wanted. Per Polymarket docs the builder code is "serialized onchain as part of the signed order" and credits the builder for matched volume; matched volume can take up to 24 hours to show on the leaderboard (H, https://docs.polymarket.com/developers/builders/builder-intro). Polymarket builder fee rates: NOT FOUND on that page.
- Custody: Polyinit lets users generate or import a signer private key in an in-app dialog and says to store recovery material (H, user-guide/wallets-management). Whether Polyinit holds the keys (custodial for bots) is NOT STATED. Treat as custodial/semi-custodial until shown otherwise (L).

## PayBox reachability

paybox_reachable = no (for Polyinit itself). There is no API, signing scheme or contract to target. An EVM wallet reachable via PayBox could only trade the underlying liquidity by going to Polymarket directly (signed orders / proxy wallet on Polygon), which is Polymarket's adapter, not this one. Do not fund a Polyinit-generated wallet from PayBox: custody is undocumented.

## Fees (H, https://polyinit.com/user-guide/pricing-fees)

- Polyinit platform fee: 1% of filled trade value ("fill price x size, in USDC"), on buys and sells, market and limit, manual, Telegram or bot. $100 fill = $1.00 fee. Paid by the trader.
- Referral-joined users pay 0.9% while attribution is active; discount applies to the Polyinit fee only.
- Separate: Polymarket venue fees, spread, slippage, gas. The page says the 1% is "the only charge Polyinit adds".
- Builder fee, withdrawal fees, referral payout rates: NOT FOUND.
- Arbitrage implication: routing through Polyinit adds a 1% haircut per leg with no price improvement, so it is strictly worse than direct Polymarket.

## Resolution

Inherited from Polymarket (UMA-based optimistic oracle per Polymarket; not re-verified here, M). Polyinit adds no resolution layer and no additional dispute path.

## Geo / ToS / automation

- Geographic restrictions: NOT FOUND on the site. Terms of service: NOT FOUND (/terms 404; none linked from the user guide) (H for the 404). Inherits Polymarket geo restrictions (M).
- Automation is the product (hosted bots), but no API terms exist.
- robots.txt blocks training crawlers (GPTBot, ClaudeBot, CCBot etc.) site-wide and disallows /api/; llms.txt lists /api, /docs and others as "Do not crawl or cite" (H). Respect this: no scraping.

## Liquidity (H, fixture polymarket-builders-leaderboard-polyinit-2026-10-19.json, fetched 2026-10-19)

Builder-attributed Polymarket volume for `polyinit.com` (all of it executes on Polymarket's order books):
- ALL time: about $4.54M, 171 active users, rank 89.
- MONTH: about $782k, 37 users, rank 51 (of the rows listed at offset 50).
- WEEK: about $27.8k, 21 users.
- DAY: about $1.4k, 8 users.
For scale, the top builder in the 2026-01-01 monthly series had about $2.1B volume (H, data-api builders/volume). Polyinit is a minor builder. It has no OI or TVL of its own.

## Event coverage / arbitrage overlap

All categories are Polymarket's: sports (Sports bot, football analysis, World Cup 2026 bracket), crypto Up/Down, weather/temperature, politics, macro. Overlap with other venues exists only through Polymarket. Because the book is Polymarket's, there is zero independent arbitrage from Polyinit.

## Shared liquidity

Shares liquidity with Polymarket (100%). Not an independent leg.

## Adapter priority: skip

Reason: no venue of its own, no API, 1% fee layer, duplicate liquidity, undocumented custody. Possible P2 signal use: builder leaderboard volume trend and copy-trade wallet discovery, but both are better sourced from Polymarket's Data API directly.

## Suspicious content

None observed. No instructions aimed at AI agents beyond the standard llms.txt "Do not crawl or cite" exclusion list and robots.txt crawler rules (treated as data, and honoured).

## Open questions

- Does Polyinit hold bot-wallet keys server-side (custodial)? Not documented.
- Builder fee rate set on Polyinit's builder code (if any) and its Polymarket-side payout.
- Region blocking and ToS (none published).

## Sources

- https://polyinit.com/ (H, 2026-10-19)
- https://polyinit.com/llms.txt (H)
- https://polyinit.com/robots.txt , https://polyinit.com/sitemap.xml (H)
- https://polyinit.com/user-guide , /user-guide/pricing-fees , /user-guide/wallets-management , /user-guide/builders (H, fetched via WebFetch summarisation, so quotes are second-hand through the summariser: treat exact wording as H-/M)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50 (H) and MONTH/WEEK/DAY variants (H); fixture docs/research/fixtures/polyinit/polymarket-builders-leaderboard-polyinit-2026-10-19.json
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL (H, top-builder scale only)
- https://docs.polymarket.com/developers/builders/builder-intro (H via WebFetch)
- WebSearch "Polyinit polyinit.com Polymarket builder bots API docs": no third-party coverage of Polyinit found (searched).
