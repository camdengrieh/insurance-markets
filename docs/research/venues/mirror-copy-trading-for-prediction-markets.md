# Mirror (Mirror Trade) copy-trading app: venue spec

Researched 2026-10-19. READ-ONLY. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
Note: the WebSearch budget was exhausted this session, so no independent third-party coverage was checked.

## Verdict
- Kind: broker-or-frontend (mobile copy-trading app). NOT a venue. No order book, no markets, no resolution of its own. [H]
- Routes to Kalshi and Polymarket only. Any liquidity is those venues' liquidity, so it is NOT an independent arbitrage leg. [H]
- No public API, no docs, no developer page, no ToS. [H]
- adapter_priority: skip. Possible P2 "signal" idea only if it exposes a leaderboard feed, but nothing public exists.

## Is it live (2026)?
- Website https://mirrortrade.pro returns HTTP 200; footer "(c) 2026 Mirror Trade"; privacy policy dated March 8, 2026. [H]
- App Store listing (id6759851620): version 1.0 on Mar 16, latest 1.0.10 on May 6 (year not printed; consistent with 2026). Only 3 ratings, avg 4.0. About 5 months since last update as of 2026-10-19, so possibly stale / low traction. [H for listing, M for year]
- Listing title "Mirror: Copy Pros. Make Money!"; the website links the same app id under the URL slug "signalscout-eventmarketalerts" and the Play package is com.cherrypick.KalshiPolyMarketTracker, so the product appears to have been renamed from a Kalshi/Polymarket tracker/alert app (SignalScout) to a copy-trading app. [H for URLs, M for inference]
- Seller "Daksha Shrivastava", copyright "(c) 2025 CherryPick Tech". Site contact/privacy host is useagentbase.dev (X: @UseAgentBaseDev), which did NOT resolve in DNS from here (curl exit 6) on 2026-10-19. [H]
- Verdict: live but tiny and early-stage; still_live = true.

## Product model
- Site: browse "strategists" ranked by win rate, ROI, streak; "Follow & Copy" with a budget; live P&L "with live Kalshi prices"; whale alerts and trade feed with push; strategists post positions with reasoning. [H] https://mirrortrade.pro
- Site claims strategist stats are "verified from their public Kalshi profile" (so ingest is from Kalshi's public data). [H]
- App Store text: followers can "auto-execute" experts' moves; 1.0.10 notes list "Auto-execute trades"; experts "earn a cut" when copied. [H] https://apps.apple.com/us/app/mirror-copy-pros-make-money/id6759851620
- Custody / how execution works (user's own Kalshi API key? Polymarket proxy wallet? deep link?): NOT FOUND (searched: homepage, privacy policy, App Store page). The website says nothing about execution, wallets or keys, so execution may be partial or a roadmap claim. [L]

## Market model, chains, collateral
- None of its own. Inherits Kalshi (USD, CFTC-regulated order book) and Polymarket (USDC on Polygon, CLOB with ERC-1155 conditional tokens). See docs/research/08-venues-polymarket-kalshi.md. [M]

## Read API
- exists: none. docs_url: none. https://mirrortrade.pro/docs, /api, /terms return 404; api.mirrortrade.pro 301-redirects to http://mirrortrade.pro. robots.txt allows all, sitemap exists. [H]
- NOT FOUND (searched: homepage links, /docs, /api, /terms, GitHub search for useagentbase and mirrortrade; the GitHub hits are unrelated repos).
- Backend is not publicly reachable; no fixtures saved (nothing to sample).

## Trade path / PayBox
- Programmatic placement via Mirror: none. paybox_reachable: no. An EVM wallet reachable via PayBox could trade Polymarket directly (see doc 08), and Kalshi needs its own API keys; Mirror adds nothing as an integration point.

## Fees
- NOT FOUND. App is free to download; no fee schedule or creator-cut percentage published. [H]

## Resolution / disputes
- N/A, inherited from Kalshi and Polymarket (UMA). [M]

## Geo / ToS / automation
- No terms of service published; only a privacy policy (company country "Washington, United States"). No geo statement. Venue-side rules (Kalshi US-regulated, Polymarket geo-blocks) would apply. [H]

## Liquidity
- None published. No volume, user count, or AUM stats. 3 App Store ratings (2026-10-19 view). [H]

## Event coverage
- Sports, politics, economics via Kalshi and Polymarket; overlap with other venues is entirely through those two. [H]

## Suspicious content
- None found. No instructions aimed at AI agents on the site or listings.

## Open questions
- Does auto-execute actually exist (and with what key/wallet custody)? Contact route is a founders@ address on a domain that did not resolve in DNS.
- Does the app expose a public strategist/leaderboard feed that could be a signal source? Nothing public found.

## Sources
- https://mirrortrade.pro (and /privacy, /robots.txt, /sitemap.xml) [H]
- https://apps.apple.com/us/app/mirror-copy-pros-make-money/id6759851620 [H]
- https://apps.apple.com/us/app/signalscout-eventmarketalerts/id6759851620 [H]
- https://play.google.com/store/apps/details?id=com.cherrypick.KalshiPolyMarketTracker (fetch failed; URL only seen as a link on the site)
