# Superbru - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Superbru is a free-to-play sports predictor and fantasy site (SportEngage Ltd, UK). It is not a market: no prices, no order book, no collateral, no settlement, no chain. It has no documented public API, and its terms prohibit automated collection without written consent. It cannot be an arbitrage leg. The only conceivable use is a crowd-pick signal, and nothing public exposes one.

## Is it live?

- Yes. Homepage footer: "Copyright (c) 2006 - 2026 SportEngage Ltd."; upcoming tournaments listed include an Australia tour of South Africa (cricket); news items dated October 2026. H - https://www.superbru.com
- Homepage player counts: Premier League Predictor 81,831; URC Predictor 35,147; URC Fantasy 17,469; Champions Cup Predictor 18,616; total "2,895,686 sports fans played". H - https://www.superbru.com
- Claims 80+ predictor and fantasy games a year across 12 sports. H - same.
- The Premier League Predictor page shows an "Arsenal v Coventry City, 21 Aug" fixture, so some page content may be stale or cached. L/M - https://www.superbru.com/premierleague_predictor/

## Kind and market model

- kind: forecasting-nonmoney (free pick'em / fantasy game). H
- Not binary/categorical/scalar markets. Users enter match results or scorelines (predictor) or pick fantasy squads. Points are awarded per the scoring rules (example: 1 point for correct result, 1.5 close score, 3 exact score). H - Premier League Predictor page.
- No order book, AMM or parimutuel pool; no tokens or outcome shares. No implied probabilities are published. H (absence on public pages); the page tabs "Beat the Odds" and "Premium Insights" exist but their contents were not visible without login. M
- Pools ("gaming groups") are private leagues of friends. H - terms s. 9.1(2).

## Chains and collateral

None. No on-chain component and no crypto. Money appears only as a Premium subscription ($3.49/month, or $38.28 per year) for an ad-free site, extra pools and a weekly "Insights" email. H - https://www.superbru.com/premium. Cash prizes: NOT FOUND on the homepage, the premium page or the predictor page. The homepage feature list does mention "Compete in prize pools" but gives no amounts or entry costs. H (mention) / NOT FOUND (details).

## Read API

- exists: **none** (no documented or public API).
- Docs: NOT FOUND (searched: homepage links, /business, /premium, terms of use, robots.txt). WebSearch was unavailable (session budget exhausted), so no external search for an unofficial API was done.
- No API or developer link on the homepage; footer links go only to app stores, the business page and the help centre. H
- /business lists sponsorship, advertising, branded "Megapools" and consented first/second-party data; no API or data feed is mentioned. H - https://www.superbru.com/business
- https://www.superbru.com/robots.txt returns 404. https://www.superbru.com/api/ returns the HTML homepage (SPA-style fallback), not an API. H (probed with generic UA, GET only)
- Websocket: NOT FOUND.
- Fixtures: none saved, since no API response shape exists to record.

## Trade path

None. Nothing to place, cancel or sign. Not reachable through a PayBox wallet on any chain: there are no transactions, orders or deposits. paybox_reachable = no. H (by absence)

## Fees

No trading fees. Premium subscription only. H - https://www.superbru.com/premium

## Resolution mechanism

Results are scored by the operator from official match outcomes; no on-chain or oracle dispute process. Pool rules are set by SportEngage. M (inferred; no resolution doc read)

## Geo / ToS / automation

- Terms s. 4.2: systematic or automated data collection, scraping and data mining require "express written consent"; robots and spiders are prohibited except search-engine indexing. H (paraphrased via fetch) - https://www.superbru.com/policies/terms-of-use
- Terms are Version 2.0, last updated 25 May 2018 (possibly stale). English law; operator SportEngage Limited, England and Wales. Users under 13 need parental consent. No country restrictions stated; operator may restrict access at its discretion (s. 3.8). H
- Consequence: scraping crowd picks (if any were exposed) would breach the terms without written consent. Any use would need a data agreement via the business channel.

## Liquidity

No liquidity: nothing is staked. Engagement only: about 2.9M cumulative players (homepage, 2026-10-19), 81.8k in the Premier League Predictor. H. Liquidity is not shared with any other venue.

## Event overlap

Sports only (soccer, rugby union/league, cricket, tennis, golf, motorsport, American football, etc.). Overlaps sports markets on Polymarket, Kalshi and others in subject matter, but there are no prices to compare. No politics, crypto or macro. H

## Open questions

- Whether logged-in tabs ("Beat the Odds", "Premium Insights") expose aggregate crowd-pick percentages, and whether SportEngage would license that as a data feed. Not checked (no account creation allowed).
- Whether an unofficial or mobile-app API exists. Not searched (web search budget exhausted; app traffic inspection out of scope).

## Sources

- https://www.superbru.com (homepage, fetched 2026-10-19) H
- https://www.superbru.com/policies/terms-of-use H
- https://www.superbru.com/business H
- https://www.superbru.com/premium H
- https://www.superbru.com/premierleague_predictor/ H
- https://www.superbru.com/robots.txt (404) and /api/ (homepage HTML), probed 2026-10-19 H
