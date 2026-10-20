# Score Captain (scorecaptain.com) - venue spec

Researched 2026-10-19. Verdict: **skip** for trading/arbitrage. It is a free points game, not a market. No prices, no odds, no money, no chain.

## Summary
- Still live: yes [H]. Homepage returned HTTP 200 on 2026-10-19; sitemap lastmod is that day; fixtures for 2026-10-19/20 are served (https://scorecaptain.com, https://scorecaptain.com/api/v1/fixtures). Labelled "Beta" in the UI [H].
- Kind: free sports/esports exact-score prediction game ("forecasting-nonmoney") [H]. "No stake, no wager and no entry fee ... players cannot deposit money and cannot lose money" (https://scorecaptain.com/llms.txt).
- Football (12 competitions) and Mobile Legends: Bang Bang esports [H] (https://scorecaptain.com/faq).

## Market model [H]
- Not a market. Each user submits one exact scoreline (home, away; integers 0-30) per fixture, or a Home/Draw/Away "Result" pick. One pick per match, immutable, locks 5 min before kickoff (https://scorecaptain.com/developers/docs, https://scorecaptain.com/how-it-works/points).
- Points are scored against a rarity-based "price" shown in-UI (exact score about 18 for 1-1, up to 450 for 4-3; wrong winner -5). Prices derive from crowd rarity, not from any tradeable probability. No order book, AMM or tokens.
- No outcome tokenisation, no chain, no collateral.

## Read API
- exists: official-public for fixtures; authenticated (bot key) for own picks/stats. Docs: https://scorecaptain.com/developers/docs [H].
- Base: https://scorecaptain.com/api/v1
- `GET /fixtures?tab=upcoming|live|finished` - no key needed [H, confirmed with unauthenticated GET 2026-10-19: HTTP 200, 80 upcoming fixtures, 13.9KB]. Shape: `{ok, tab, fixtures:[{id, home, away, competition (SA/PD/PL/PPL/BSA/CL/ELC/FL1/BL1/DED seen), kickoff_utc, status, locks_at}]}`. Sample: docs/research/fixtures/score-captain/fixtures-upcoming-2026-10-19.json
- `GET /me` (Bearer `sck_...` key; `x-api-key` also works) - bot status, points, rank, pending picks, history [H, from docs; not called].
- `POST /predictions` - up to 50 picks per request [H, from docs; not called].
- No market data, price, book, trade or resolution endpoints. No websocket documented (NOT FOUND; searched: docs page, llms.txt, sitemap). No OpenAPI (GET /openapi.json = 404).
- Rate limits [H]: 120 req/min for sending picks (batch of 50 = 1), 300 req/min for reads; "polling fixtures once a minute is plenty".
- Caveat: robots.txt lists `Disallow: /api/` for all user agents, yet the docs publish the API for bots. Only one GET was made. Terms say "Do not automate predictions, scrape the site, hammer our API" while the developer page invites bots; the two conflict, so any production use needs written clearance from support.

## Trade path
None. Picks are free points entries authenticated by an account-bound API key; no wallet, signature, or on-chain action. PayBox/EVM wallet cannot trade it (nothing to buy or sell). paybox_reachable = no.

## Fees, collateral, chains
- No fees, no collateral, no chain [H] (FAQ: "There is no shop, nothing to buy, and no paid tier").
- Monthly prize "funded by a sponsor" for human players; "Prize money stays with human players" so bots are ineligible [H] (faq; developers/docs). User-run leagues may charge an off-platform entry fee paid by bank transfer/DuitNow to the organiser; Score Captain takes no cut [H] (faq). Not on-chain.

## Resolution
Grades on the 90-minute score; fixtures from football-data.org, live scores from TheSportsDB (CSP headers also list those hosts) [H] (faq, points page). Esports series score is maps won (best-of-3/5/7). Dispute risk irrelevant to trading since nothing is staked. Note user-run leagues have referee-entered scores [H, llms.txt].

## Geo / ToS / automation
- ToS "Fair play": "Do not automate predictions, scrape the site, hammer our API, or try to read other players' picks before kickoff." [H] (https://scorecaptain.com/terms). Developer bot program explicitly allowed (one bot per person, key required).
- Guests can predict without email; leaderboard needs verified email. No geo restriction found (NOT FOUND; searched terms, faq).

## Liquidity
None. No volume/OI/TVL. Self-reported engine accuracy 50.3% on 1,443 matches (about page/faq, self-reported [M]); home-side baseline about 45%, sharp bookmaker about 55% per their FAQ [M].

## Event coverage overlap
Football fixtures (PL, La Liga, Serie A, Bundesliga, Ligue 1, CL, World Cup, Euros etc.) and MLBB overlap sports markets elsewhere, but Score Captain has no prices, so no arbitrage. Possible weak use: the in-house engine / AI pundit picks and rarity "prices" as a sentiment signal, plus its fixture list (a free fixtures feed with kickoff_utc, mappable to other venues' sports events). Both are low value since the fixture source (football-data.org) is available directly and the engine is only about 50% accurate.

## Shared liquidity
N/A (no liquidity).

## Priority
skip. Free points game, no odds, no money, no chain; ToS restricts automation. If the aggregator wants sports fixture ID mapping, use football-data.org directly. Optional P2 "signal-only" is not recommended.

## Suspicious content
None found. (robots.txt/ToS conflict with bot program noted above; llms.txt contained no agent-directed instructions beyond a support contact.)

## Not found
Order book/prices, websocket, OpenAPI spec, on-chain contracts, GitHub repo, third-party coverage (WebSearch extended returned nothing independent about scorecaptain.com), volume stats.

## Sources
- https://scorecaptain.com (homepage, meta description) [H]
- https://scorecaptain.com/llms.txt [H]
- https://scorecaptain.com/developers and /developers/docs [H]
- https://scorecaptain.com/faq, /terms, /how-it-works/points [H]
- https://scorecaptain.com/robots.txt, /sitemap.xml [H]
- https://scorecaptain.com/api/v1/fixtures?tab=upcoming (unauthenticated GET, 2026-10-19) [H]
- WebSearch (extended) "Score Captain scorecaptain.com ..." - no independent results [L]

Confidence: high that it is live, free and not integrable as a trading venue.
