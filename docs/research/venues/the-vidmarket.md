# The VidMarket (thevidmarket.com) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction market. Skip.

## Summary

- [H] Live: https://www.thevidmarket.com/ returns HTTP 200 (Vercel, last-modified 2026-10-15). It is a React SPA, title "The VidMarket - the daily market for video".
- [H] It is a points-based popularity game over the top ~400 YouTube channels. Readers vote ("Must-See"), and "Call Top 3" on a video's ranking within 48 hours. Calls settle for points (+3 if the market agreed, +5 more if called before trending) and a "Taste Score" on a public leaderboard. Source: first-party JS bundle https://www.thevidmarket.com/assets/index-BIe-0Dcw.js (guide text).
- [H] No money, no tokens, no chain, no wallet, no collateral. Identity is an anonymous "reader" with a recovery code ("No email, no password"). Per-user state lives in localStorage keys (my_calls, my_votes, taste_score) plus a `/api/reader` endpoint.
- [H] The site's own disclosure says rankings are "opinion, not measurement" and "community sentiment and entertainment, nothing more"; it accepts no money or sponsorship, and is unaffiliated with YouTube.
- [L] The Show HN hint (2026-09-14) was not confirmed. WebSearch budget was exhausted this session, so no HN thread was read.

## Market model

Not binary/categorical/scalar contracts. Per-category ranked lists of recent YouTube videos (e.g. "News & Current Affairs", "Explainers & Documentary Journalism"), ordered by votes combined with public view counts. No order book, AMM, parimutuel pool or outcome tokens. [H, bundle + /api/standings]

## Read API

- Official docs: NOT FOUND (searched: site root, /robots.txt, /sitemap.xml, /llms.txt, /api/markets - all 404; bundle contains no docs link).
- Undocumented first-party same-origin JSON endpoints used by the SPA [H, bundle]: `GET /api/feed`, `/api/standings`, `/api/close?read=1` and `?movers=1`, `/api/result?videos=`, `/api/votes?videos=|channels=`, `/api/floor`, `/api/reader?board=1`; writes `POST /api/vote`, `POST /api/reader` (not called).
- Unauthenticated GET confirmed [H]: `/api/standings` returns `{ok, at, standings:{<category>:[{videoId,title,channel,published,views,net}]}}`. `/api/feed` returned `{"videos":[],"resolved":{}}` and `/api/close?read=1` returned `{"date":null,"ranks":null}` with no params. No rate limits, auth or websocket documented or observed.
- Data is YouTube view counts and vote nets, with no prices, probabilities, books or trades.

## Trade path

None. No order placement, no signing scheme. PayBox reachability: no, because there is nothing to transact on. Votes/calls are free anonymous POSTs for points.

## Fees, resolution, liquidity

- Fees: none (no money). [H]
- Resolution: internal, ranking after 48h window closes, by site's own vote+view-count ranking. Not an oracle-based resolution. [M]
- Liquidity: none; no volume/OI/TVL exists. [H]
- Geo/ToS/automation: NOT FOUND beyond the "Contact & Disclosure" tab (disclosure only; no API terms found). Votes are anonymous and "can be influenced by small numbers of voters".
- Liquidity sharing: n/a.

## Arbitrage relevance

None. Topics (YouTube channel popularity, video ranks) do not overlap sports, politics, crypto or macro contracts on other venues. At most a weak "attention" signal source, and not worth an adapter.

## Suspicious content

None found. The bundle contains no AI-targeted instructions.

## Sources

- https://www.thevidmarket.com/ [H]
- https://www.thevidmarket.com/assets/index-BIe-0Dcw.js [H]
- https://www.thevidmarket.com/api/standings [H]
- Fixtures: docs/research/fixtures/the-vidmarket/standings.json, feed-empty.json
- Show HN (2026-09-14): [L] not independently verified (search budget exhausted).
