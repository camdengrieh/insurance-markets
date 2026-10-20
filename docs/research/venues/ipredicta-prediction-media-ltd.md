# iPredicta (Prediction Media Ltd) - venue spec

Researched 2026-10-19. Verdict: NOT a venue. A consumer web/iOS price-comparison and affiliate site with no public API, no order flow, and terms that forbid automated access. Adapter priority: skip.

## Summary
- [H] iPredicta is an information/aggregation site and iOS app that shows Kalshi and Polymarket (also Polymarket US, Betfair Exchange, Matchbook, Novig, Underdog, Kalshi via Robinhood) prices side by side. Source: https://ipredicta.co/ , https://ipredicta.co/compare/ , App Store listing.
- [H] Still live as of 2026-10-19: site returns 200, sitemap has entries lastmod up to 2026-09-30, App Store v1.0.0 released 8 Oct 2026, v1.1.0 about 16 Oct 2026. Very young (founded "early 2026" per About page).
- [H] It does not take bets or hold money; it links out to venues and earns affiliate commission. Terms: not an exchange or broker.

## Kind and market model
- Kind: aggregator / affiliate content site (not a venue). No markets of its own, no tokenisation, no order book, no collateral, no chain.
- [H] Compare page claims every listed market is offered by two or more venues; pair selection is curated. Code comment in the site JS: the curated pair list lives in `netlify/functions/_lib/cross-venue-pairs.js` ("WHICH questions are comparable is an editorial judgement") (https://ipredicta.co/assets/shared.js). Matching is therefore editorial, not an automated linker.
- [H] The feed carries a probability (last price), not a book: "Sell at and Buy at are shown as not available" (feed.js adapter comment). So even the data it shows is shallow.

## Read API
- Official public API: NOT FOUND (searched: homepage, /api, /docs, /developers, /llms.txt all 404 or absent; Terms page has no API terms; nav/footer have no developer link; sitemap has no API pages).
- [H] Internal, undocumented backend only: Netlify Functions called by the site's own JS: `/.netlify/functions/markets-feed?mode=full`, `cross-venue`, `politics-cards`, `moneyline-card`, `f1-cards`, `markets-index`, `explain-market`, `chat`, `subscribe`, `create-alert`. Static data files: `/assets/data/curated-refresh.json`, `kalshi-sports-restricted-states.json`, `kalshi-onboarding-countries.json`. Seen in https://ipredicta.co/assets/shared.js and homepage HTML.
- These were NOT called (undocumented, and Terms forbid automated access without written permission). No fixtures saved. Response shapes unconfirmed.
- Upstream data is Kalshi and Polymarket public APIs ([M] inferred from shared.js header comment "polymarket-live + kalshi-snapshot"), so there is nothing here that is not obtainable first-hand from those venues.
- Websocket: none found.

## Trade path
- None. [H] Terms: does not place trades or hold money. App Store: "does not take bets or hold money. It links out to each venue's own site".
- PayBox-reachable: no (nothing to trade). Trading would be done on the underlying venues.

## Fees
- None charged to users [H]: free app, no in-app purchases; affiliate commission paid by venues (Polymarket, Crypto.com, Matchbook, Kalshi; Kalshi relationship from 22 Sep 2026) at no extra cost to user.

## Resolution
- N/A. [M] Shows per-venue notes on how each venue's contract settles (App Store description), which is potentially useful editorial context for cross-venue resolution-mismatch risk, but only as human-readable text.

## Geo / ToS / automation
- [H] Terms ("Permitted use"): personal, non-commercial use; scraping/redistribution prohibited without written permission; access "by automated means" prohibited without written permission. Hard blocker for any adapter. https://ipredicta.co/terms/
- [H] robots.txt: allows `/`, disallows `/invest/`, `/partials/`, `/media/deck/`.
- 18+; availability depends on country and US state.

## Liquidity
- None of its own. No volume/OI/TVL. Site cards display Polymarket/Kalshi volumes (e.g. a 2026-09-29 snapshot in shared.js lists $3.2M-$66.8M per market), which are the upstream venues' figures.
- Shares liquidity with: Kalshi, Polymarket (global and US), plus Betfair, Matchbook, Novig, Underdog, Robinhood-Kalshi. It is a viewer of those, so it is NOT an independent arbitrage leg.

## Event coverage
- Politics (US midterms 2026, Brazil election), sports (NFL, EPL, F1, World Cup 2026, UFC), economy (Fed), crypto price, culture, tech, climate, geopolitics. All of it overlaps Kalshi/Polymarket by construction.

## Use for this project
- Competitive reference only: validates demand for Kalshi vs Polymarket disagreement display; editorial pair list is a weak human-curated signal, not consumable programmatically. Our aggregation layer should read Kalshi/Polymarket directly. Possibly contact them for permission only if curated pair list is wanted (low value).
- Contact (public): hello@ipredicta.co (company-published; do not use without user approval).

## Open questions
- Whether a partner/data API exists privately (press page and /support not fetched).
- Whether "more" venues beyond Kalshi/Polymarket have live prices vs only venue guides.

## Not found
- Official API docs, rate limits, websocket, GitHub repo, on-chain contracts, fee schedule, liquidity figures of its own, user numbers, funding. Extended web search was not possible (session search budget exhausted).

## Sources
- https://ipredicta.co/ (H, fetched 2026-10-19)
- https://ipredicta.co/robots.txt , https://ipredicta.co/sitemap.xml (H)
- https://ipredicta.co/terms/ (H, summarised via fetch tool)
- https://ipredicta.co/compare/ , https://ipredicta.co/about/ (H)
- https://ipredicta.co/assets/shared.js , /assets/js/adapters/feed.js (H, front-end source comments)
- https://apps.apple.com/ae/app/ipredicta/id6814522129 (H, fetched 2026-10-19)
