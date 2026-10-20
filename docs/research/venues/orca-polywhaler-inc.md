# Orca (Polywhaler Inc.) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Orca is NOT a venue. It is a paper/live trading front-end (and whale-copy simulator) built by Polywhaler that routes real orders to Polymarket and Kalshi. It has no markets, order book, collateral or resolution of its own. Its liquidity is 100% shared with Polymarket and Kalshi, so it is not an independent arbitrage leg. The only integrable asset is the sibling Polywhaler data API (whale-trade flow, wallet scores), a paid signal source (Quant tier, authenticated). adapter_priority = skip as a venue adapter; at most P2 as an optional signal feed.

## Still live (2026)

- orca.polywhaler.com returns HTTP 200; sitemap lastmod 2026-10-19; footer "(c) 2026 Polywhaler" [H] https://orca.polywhaler.com , https://orca.polywhaler.com/sitemap.xml
- iOS app "Orca: Prediction Markets" by Polywhaler, v1.1.0 on US App Store, free, Finance category; requires iOS 16.4 [H] https://apps.apple.com/us/app/orca-prediction-markets/id6799124142
- Polywhaler API responds (401 without key) on 2026-10-19 [H] https://polywhaler.com/api/v2/trades

## Kind and market model

- Kind: broker-or-frontend / paper-trading simulator plus whale analytics. "Orca is an independent tool built on public market data and is not affiliated with or endorsed by Polymarket or Kalshi." [H] https://orca.polywhaler.com (footer)
- Markets are Polymarket (binary/categorical CLOB, ERC-1155 conditional tokens on Polygon) and Kalshi (binary contracts, CLOB) markets, unmodified. A live portfolio is tied to exactly one venue; Polymarket and Kalshi cannot be mixed in one portfolio [H] https://polywhaler.com/docs/venues , https://polywhaler.com/docs/orca
- Paper portfolios use simulated bankroll against live prices, "realistic fills" priced at executable prices [H] https://orca.polywhaler.com

## Chains and collateral

- None of its own. Polymarket leg: USDC in the user's Polymarket account on Polygon [H] https://polywhaler.com/docs/orca/connect-accounts . Kalshi leg: USD cash on Kalshi (off-chain, regulated) [H] same page.
- Non-custodial: "Orca never holds your funds." [H] https://polywhaler.com/docs/orca/live-trading
- Caveat: for Kalshi, Orca stores the user's Kalshi RSA private key (encrypted at rest) on Polywhaler servers and signs requests server-side - so Kalshi "non-custodial" means funds stay on Kalshi, but Orca holds a trade-scope credential [H] https://polywhaler.com/docs/orca/connect-accounts

## Read API

Orca itself: no public API found. robots.txt disallows /api/ and /new [H] https://orca.polywhaler.com/robots.txt . NOT FOUND (searched: orca.polywhaler.com, polywhaler.com/docs, developers page, OpenAPI spec): any Orca-specific market/orderbook/trading API.

Sibling Polywhaler API (official, authenticated, Quant plan only):
- Docs: https://polywhaler.com/docs/api , https://polywhaler.com/docs/developer ; OpenAPI 3.1: https://polywhaler.com/api/v2/openapi.json (public GET, 47 operations, 680KB) [H]
- Base URL: https://polywhaler.com/api (paths /v2/...) [H]
- Auth: `Authorization: Bearer pwhk_...`; key creation requires a Quant account (not done; read-only research) [H]
- Limits: 10,000 requests/day (reset 00:00 UTC), up to 100/min per key; up to 5 live keys per account [H] https://polywhaler.com/docs/developer
- Key endpoints: GET /v2/trades (venue=polymarket|kalshi|all; filters minAmount, minInsiderScore, maxProbability, eventSlug, marketSlug, sports, from/to, cursor pagination), GET /v2/trades/{id}, /v2/markets (markets by whale volume), /v2/wallets/{address}[/positions|/trades|/cluster|/score/history], /v2/smart-money/{leaderboard,trades,flow}, /v2/positions/aggregated, /v2/outcomes (resolved with P&L), /v2/insider/events, /v2/clusters, /v2/crypto/markets, /v2/exports (CSV/JSON/Parquet up to 100k rows), /v2/usage [H] OpenAPI spec
- Webhooks: 15 event types (trade.whale, trade.smart_money, trade.insider_flagged, cluster.detected, ...), Standard Webhooks signing, https only (443/8443) [H] https://polywhaler.com/docs/developer . No websocket documented (NOT FOUND, searched developers page, docs, OpenAPI).
- Not a price/orderbook API: it exposes whale fills only (size >= $10k on Polymarket; Kalshi uses own floors), not quotes, books or full market lists. For prices use Polymarket/Kalshi directly.
- Trade shape (from the official OpenAPI example, not a live response): id (tx hash or `kx_<id>`), venue, wallet, side BUY/SELL, outcome, outcomeIndex, priceProbability 0..1, sizeShares, amountUsd, tradedAt, market{title,eventSlug,marketSlug,conditionId,asset,category,endsAt}, insider{score,breakdown} [H]
- Fixtures: no unauthenticated success response exists. Saved the 401 envelope and an OpenAPI excerpt (route list + Trade schema), see below.
- Legacy: v1 frozen; unofficial public routes listed in polywhaler.com/robots.txt (/api/trades, /api/markets/search, ...) exist but /api/ is Disallowed and Terms forbid bulk scraping - do not use [H] https://polywhaler.com/robots.txt , https://polywhaler.com/terms

## Trade path

- Orders are placed only through the Orca web UI (Pro plan), not a documented API. Polymarket: wallet (MetaMask/WalletConnect) prompts the user to sign every order; Kalshi: Orca places the order immediately with the stored API key as a marketable limit (fill-or-cancel, nothing rests) [H] https://polywhaler.com/docs/orca/live-trading
- No automated copy-trading on live portfolios yet ("Every live trade is one you place"); auto-copy is paper-only [H] same page.
- No programmatic order endpoint is documented. For a PayBox/EVM wallet: Orca adds nothing; trade Polymarket directly (CLOB signed orders, Polygon USDC) or Kalshi directly via their own APIs. PayBox is reachable only in the trivial sense that a Polygon wallet could sign Polymarket orders through the Orca UI, which is a human/browser flow (no browser automation allowed) and strictly worse than direct Polymarket integration.

## Fees

- Orca fee: 0% on live orders; exchange fees apply at normal rates [H] https://orca.polywhaler.com (FAQ)
- Kalshi fee stated by Orca: 7% x price x (1 - price) per contract, folded into estimates [H] https://polywhaler.com/docs/orca/live-trading
- Subscription: web pricing page shows Free; Pro "$4/month ($59 billed annually)"; Quant $29/month (regular $49, limited-time) or $359/yr; Quant needed for API [H] https://orca.polywhaler.com . App Store lists Pro at $8.99/month or $59.99/year (US) - inconsistent with web monthly price [H] App Store page. Treat prices as volatile.

## Resolution and dispute risk

Inherited from the underlying venue (Polymarket UMA-based; Kalshi in-house). Orca displays resolutions but does not resolve. Polywhaler API /v2/outcomes lists resolved outcomes with P&L (Quant) [H]. No Orca-specific dispute process documented.

## Geo / ToS / automation

- Orca does not geofence on its own that we could verify; venue rules (Polymarket/Kalshi geoblocks, KYC) apply. NOT FOUND (searched: Orca site, docs, terms): Orca-specific jurisdiction list.
- Polywhaler Terms (last updated April 10, 2026; text still describes a Polymarket-only dashboard, so partly stale) forbid "Scrape, crawl, or use automated tools to extract data in bulk" and resale/redistribution of data without permission [H] https://polywhaler.com/terms . Use only the paid API for automated access and check redistribution rights before surfacing its data downstream.
- Orca-specific Terms page not separately found; footer links go to Polywhaler terms/privacy.

## Liquidity

No own liquidity. Underlying: Polymarket and Kalshi (covered by a separate workflow). Orca/Polywhaler user counts or volume routed: NOT FOUND (searched: site, App Store page, docs). App Store rating/review counts not extracted.

## Event coverage and overlap

Everything Polymarket and Kalshi list (sports, politics, crypto price, economy/macro; sports are a separate category tab, excluded from default feed/leaderboard) [H] https://polywhaler.com/docs/venues . Overlap is by construction with those two venues; Orca is not a third leg.

## Shared liquidity

Fully shared with Polymarket (CLOB on Polygon) and Kalshi. Not an independent arbitrage leg.

## Adapter priority: skip (as venue)

Reasons: no markets or liquidity of its own; no public trading or quote API; live trading is UI-only with human signing for Polymarket; duplicates Polymarket/Kalshi liquidity. Optional later: a P2 signal-only "polywhaler" source adapter (whale flow, smart-money, insider scores) requires a Quant key (user decision/cost), 10k req/day, and has ToS redistribution limits. Cross-venue whale flow on Kalshi vs Polymarket could feed Quotient-style signals.

## Suspicious content

None found. No embedded instructions aimed at AI agents seen in the pages read. (Site has a "Polywhaler Agent" chat feature; not used.)

## Open questions

- Whether Polywhaler plans a public (non-Quant) read tier or trading API.
- Whether Orca uses a Polymarket builder code (zero Orca fee claim suggests not).
- Redistribution terms for API data in a third-party aggregator.

## Fixtures saved

- docs/research/fixtures/orca-polywhaler-inc/polywhaler-v2-trades-401.json (unauthenticated GET 401 envelope, 2026-10-19)
- docs/research/fixtures/orca-polywhaler-inc/polywhaler-v2-openapi-excerpt.json (route list + Trade/Pagination schema from the public OpenAPI; example values are the doc's illustrative samples)

## Sources

- https://orca.polywhaler.com (home, pricing, FAQ) [H]
- https://orca.polywhaler.com/robots.txt , /sitemap.xml [H]
- https://apps.apple.com/us/app/orca-prediction-markets/id6799124142 [H]
- https://polywhaler.com/docs/orca , /docs/orca/live-trading , /docs/orca/connect-accounts , /docs/orca/executable-fills , /docs/venues [H]
- https://polywhaler.com/developers , /docs/developer , /docs/api , /api/v2/openapi.json [H]
- https://polywhaler.com/terms (updated 2026-04-10) , /robots.txt [H]
