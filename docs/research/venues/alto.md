# Alto (altostrats.com) - venue spec

Researched 2026-10-19. Read-only: public GETs of the marketing site, app shell and static JS bundles. No accounts, keys or POSTs. WebSearch budget was exhausted this session, so no third-party corroboration (GitHub org, press) was possible.

## Verdict

Alto is NOT a venue. It is a non-custodial strategy/basket front-end (operated by NEXA DEV LLC) that places orders on **Polymarket US** from the user's own account via the user's own Polymarket US API credentials. It has no market data, order book, contracts, tokens or public API of its own. Liquidity is 100% shared with Polymarket US, so it is never an independent arbitrage leg. adapter_priority: **skip** for a venue adapter. At most a P2 "signal" idea: its strategy rule definitions (e.g. "NFL divisional home underdog") are a conceptual signal source, but none are exposed via API. [H]

## Live status

- Site and app respond 200 in Oct 2026: https://altostrats.com (Vite SPA, "Private beta"), https://app.altostrats.com (Next.js app). [H]
- Sitemap lastmod 2026-07-21; Terms "Last updated: September 2026"; footer (c) 2026 NEXA DEV LLC; app shows activity dated "Oct 12" and ESPN headlines from Week 6 NFL 2026. [H]
- Gated beta: unauthenticated `GET https://app.altostrats.com/api/me` returned `"gateOpen":false,"seatsTaken":1` (fixture). Waitlist count endpoint returned 40 (fixture). So tiny usage. [H]
- The task hint (GitHub org created 2026-07-29, bio "Prediction markets, reimagined as a portfolio - non-custodial baskets of event contracts, with honest NAV") could not be verified: `gh api orgs/altostrats` and `users/altostrats` returned 404, repo search found nothing relevant. The org name is unknown. [L]
- The hint's phrases "event contracts" and "honest NAV" are loosely consistent with the site ("Honest reporting" page; baskets). [M]

## Kind and market model

- kind: strategy/basket aggregator and execution UI on top of another exchange. [H]
- A "strategy" is a rules-based filter over third-party markets ("every market in a defined window that meets its rules"). Buying a strategy places "real orders, one per market in the basket" in the user's own Polymarket US account. No pooled capital, no Alto token, no NAV token. [H]
- Underlying markets are Polymarket US binary Yes/No contracts, priced in cents (UI shows "Yes 57c / No 43c"). Sports only so far (MLB, NFL, college football, World Series; NCAA/NFL/MLB logos; ESPN used for schedules/news). [H]
- Exit modes in the trade ticket: "Hold to end" (until every basket market settles); "Recommended exit / Average ROI exit" marked "Soon". [H]
- Strategies seen (8 slugs): cfb-heisman-top4-favorites, cfb-one-loss-contender-vs-undefeated, cfb-quality-underdog-25-35, cfb-quality-underdog-45-50, mlb-f5-pitcher-edge, nfl-divisional-home-underdog, nfl-post-overtime-fade, world-series-favorites-hold. Example MLB strategy page: backtest 2022-2025, 858 qualifying bets, 57.0% hit rate, avg odds 1.85, 3% allocation cap; page says the rule "doesn't pick live games yet". Backtest figures are the vendor's own, unverified. [H for page content, L for the numbers' validity]

## Chains and collateral

- Polymarket US is a CFTC-regulated exchange with "dollars in a regulated brokerage account", not on-chain USDC. [H] (app /connect page)
- Alto itself: no chain, no contracts, no collateral token. The /connect page says polymarket.com (global, on-chain, USDC) orders are not supported: "Alto can't place orders on polymarket.com yet. That venue needs on-chain signing and a funded wallet, which Alto hasn't built." [H]
- Market data shown to non-US users comes from polymarket.com (global) per /connect page ("every price you see comes from polymarket.com"). [H]

## Read API

- exists: none (no public developer API). [H]
- No docs site; /docs and /llms.txt serve the SPA shell (200 HTML, not docs). robots.txt only disallows /motion. [H]
- The app bundle references first-party session routes only: `/api/account, /api/feedback, /api/invite, /api/me, /api/pmus/{automation,connect,demo/reset,execute,log-purchase,reconcile,sell}, /api/pmus/run-week/{arm,finish,leg,plan}, /api/waitlist`. These are UI backend endpoints for logged-in users, undocumented, and not meant as an integration surface. Unauthenticated `/api/me` returns a stub (fixture); `/api/pmus/automation` returned 404 to GET. Do not build on them. [H for existence, M for purpose]
- Fixtures: `docs/research/fixtures/alto/app-api-me.json`, `waitlist-count.json`, `sitemap.xml`. None contain market data.
- For prices/books use the underlying venue (Polymarket US developer API, covered by another workflow; Alto points users to https://polymarket.us/developer for key management). [H]

## Trade path

- Alto places orders server-side using Polymarket US API credentials the user supplies ("using API credentials you supply for your own account there"). It "cannot withdraw from your account". "Standing orders" can be armed so Alto places legs automatically within accepted limits. [H] (Terms, footer)
- Hence Alto offers no trade API to third parties. An agent wanting the same exposure should trade Polymarket US directly. [H]

## PayBox reachability

- paybox_reachable: no. Reason: there is nothing on-chain to propose a transaction against, and the only trade path is a Polymarket US brokerage account with API keys (US-only, KYC'd), not an EVM/Solana wallet. Even the global polymarket.com path is not supported by Alto. [H]

## Fees

- Alto fees: not disclosed. Disclosures page says "Applicable fees, if any, should be disclosed to users before they authorize relevant transactions"; the trade ticket has a "Fees" row and the portfolio shows "after fees incl. $x in fees", but no formula was found. NOT FOUND (searched: terms, disclosures, how-alto-works, methodology, strategy page, JS bundles for fee/bps/service fee). [H that no formula is published]
- Venue fees: "Third-party venues may separately charge their own fees" (Polymarket US schedule not researched here). [H]

## Resolution

- Resolution and settlement are entirely Polymarket US's; Alto "does not operate the underlying prediction markets" and is not the counterparty. Basket P&L settles when every leg settles. Dispute risk = Polymarket US rules plus Alto bugs in leg selection. [H]

## Geo / ToS / automation

- Trading is US-only today; "Availability is geo-routed by jurisdiction"; non-US users are browse-only. [H]
- Terms prohibit "use automated systems in violation of applicable restrictions" and interference/manipulation (the clause is conditional, not a flat ban). Operator is NEXA DEV LLC, contact via a generic info@ mailbox on the site. [H]
- No API terms, because no API.

## Liquidity

- Own volume/OI/TVL: none (no pooled capital, no contracts). Waitlist count 40 and one seat taken on 2026-10-19 (fixture, [H]). No external volume figures found. [H for absence in primary sources]

## Event overlap and shared liquidity

- Categories: US sports (MLB, NFL, college football). These overlap Polymarket (global and US), Kalshi and others, but only because Alto reads Polymarket markets.
- liquidity_shared_with: Polymarket US (exclusive execution venue); price display from polymarket.com global. NOT an independent arbitrage leg. [H]

## Open questions

- GitHub org name and any public repos or contracts behind the "non-custodial baskets / honest NAV" bio (unverified; may describe a planned on-chain product).
- Whether Alto will add polymarket.com on-chain execution (page says not built yet); if it ever ships on-chain baskets or a NAV token, re-evaluate.
- Fee schedule.

## Sources

- https://altostrats.com (landing, meta description "Private beta"), https://altostrats.com/robots.txt, /sitemap.xml, /legal and /assets/index-*.js bundle [H]
- https://app.altostrats.com/ (footer text), /how-alto-works, /terms, /disclosures, /risk, /methodology, /honest-reporting, /the-edge, /connect, /strategies/mlb-f5-pitcher-edge [H]
- https://app.altostrats.com/_next/static/chunks/*.js (route strings, polymarket.us/developer reference) [H]
- https://app.altostrats.com/api/me, https://altostrats.com/api/waitlist-count (unauthenticated GETs, fixtures) [H]
- gh api orgs/altostrats, users/altostrats: 404 [H]
