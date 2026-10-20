# VidMarket (thevidmarket.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. VidMarket is not a prediction market in the financial sense. It is a free, no-money, single-page "Must-See / Skip" voting game for ranking YouTube videos and the top ~400-500 YouTube channels, with a points score for "calls". There is no collateral, no tokenised outcomes, no order book or AMM, no chain, and no price. Nothing to arbitrage against other venues.

## Is it live?

- Live: homepage served 2026-10-19, title "The VidMarket - the daily market for video". [H] https://www.thevidmarket.com/
- `/api/feed` returned YouTube videos published 2026-10-18, so the backend is actively running. [H] https://www.thevidmarket.com/api/feed?handles=@lexfridman
- Show HN posted 2026-09-14 by user ryanpere2298 (16 points, 2 comments): "The idea is to explore whether an intersection of social media, popularity, and prediction markets can exist and what it can look like." [H] https://hn.algolia.com/api/v1/items/49690614
- HN commenter noted most markets would have very little participation. [H] same URL.
- A web search found no other coverage, funding, docs or social accounts. NOT FOUND (searched: WebSearch extended "VidMarket prediction market YouTube daily market for video"). Not to be confused with TubeMarket (tubemarket.vercel.app), a different product. [M]

## Kind and market model

- Kind: gamified social ranking / reputation game. Not a financial market. [H, from the JS bundle https://www.thevidmarket.com/assets/index-BIe-0Dcw.js]
- Mechanics seen in the client bundle [H]:
  - Each video gets two counters, `must` and `skip`. Net = must - skip. One vote per video per user; votes can be undone or reversed.
  - "Call Top 3": each user has 3 calls per day. When the window closes, a call settles at +3 if net >= 3 (the market "agreed"), +5 more if called before the video was trending, and -1 if it "went nowhere". The result is a personal points score (wins/losses/score).
  - Channel directory: roughly 400-500 YouTube channels in categories, ranked by 7-day views adjusted by reader votes (3% per net vote, clamped to +/-25). There is a "floor" with listings/delistings of channels.
- Outcomes are counters and a locally computed score, not tokens. Binary/categorical/scalar framing does not apply.
- No money, wager, collateral or payout anywhere in the client code. Keyword scan found no wallet, USDC, chain or token terms. [H]
- Account model: a "reader" handle with a client-generated key, synced via `POST /api/reader`. No wallet, no auth provider. [H]

## Chains and collateral

None. NOT FOUND (searched: bundle for wallet/usdc/solana/ethereum, HN thread, web search).

## Read API

- Official docs: NOT FOUND (searched: site root, /robots.txt, /terms, /llms.txt all 404; web search; HN thread).
- Undocumented first-party JSON endpoints used by the SPA, unauthenticated GET, base `https://www.thevidmarket.com`. [H]
  - `GET /api/votes?videos=<id,id>&channels=<id,id>` returns `{"videos":{"<id>":{"must":0,"skip":0}},"channels":{},"store":true}` (up to 60 ids).
  - `GET /api/result?videos=<ids>` returns `{"results":{"<id>":{"must":0,"skip":0}},"store":true}`.
  - `GET /api/floor` returns `{"ok":true,"listings":[],"delistings":[],"closesAt":1786925383514}`.
  - `GET /api/close?read=1` returned `{"date":null,"ranks":null}`.
  - `GET /api/feed?ids=...&handles=@...` returns YouTube video metadata (videoId, title, channel, channelId, published, description, views) and a handle-to-channelId map.
- Observed activity: freshly published videos (including one from the day before) showed must=0 / skip=0, so participation looked negligible. [H, one-off sample on 2026-10-19; M as a general conclusion]
- Auth/rate limits: none seen on GET; limits NOT FOUND. These endpoints are private app plumbing with no stability guarantee and no ToS. [M]
- Websocket: none seen. [M]

Fixtures (small, unauthenticated GET, 2026-10-19), under `docs/research/fixtures/vidmarket/`:
- `api-votes.json`
- `api-floor.json`
- `api-feed-truncated.json` (descriptions truncated to 80 chars, 2 videos)

## Trade path

None. Writes are `POST /api/vote`, `/api/reader`, `/api/floor`, which are in-app social actions, not orders. Not exercised (read-only rule). [H for existence in bundle]

## PayBox reachability

No: there is nothing to trade or fund. No contract, no wallet, no collateral. Transaction proposals and signed orders are not applicable.

## Fees

None found. No money flows. NOT FOUND (searched: bundle, site pages).

## Resolution and dispute risk

Settlement is automatic and internal: when a daily window closes, the server tallies must-minus-skip and the client scores the user's calls. No oracle, no dispute process, and it is run by one operator who can change results. [H bundle logic; M on operator control]

## Geo / ToS / automation

NOT FOUND (searched: /terms, /robots.txt, /llms.txt, site bundle). No documented rules. Vote endpoints are an open write path, so scraping votes as a signal is technically possible but unsanctioned.

## Liquidity

None (no money). Participation is tiny: zero votes on recent videos in the sample. HN: 16 points, 2 comments, 2026-09-14. [H]

## Event overlap and shared liquidity

No overlap with sports, politics, crypto or macro markets. Topics are YouTube video and channel popularity (view counts). Closest conceptual overlap is "YouTube views" markets on other venues, but VidMarket has no price to compare. Does not share liquidity with any venue.

## Integration recommendation

Skip. At most a very weak sentiment/attention signal (YouTube virality), which is better obtained directly from the YouTube Data API. Revisit only if the operator adds real-money or tokenised markets (re-check the Show HN thread, site, and search).

## Suspicious content

None. No instructions aimed at AI agents were found in the page, bundle, API responses or HN thread.

## Sources

- https://www.thevidmarket.com/ [H]
- https://www.thevidmarket.com/assets/index-BIe-0Dcw.js [H]
- https://www.thevidmarket.com/api/votes, /api/result, /api/floor, /api/close, /api/feed [H]
- https://hn.algolia.com/api/v1/items/49690614 (Show HN thread) [H]
- https://hn.algolia.com/api/v1/search_by_date?query=thevidmarket&tags=story [H]
- WebSearch extended, no relevant results [M]
