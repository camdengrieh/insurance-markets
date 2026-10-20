# Acceptodds (acceptodds.com) - venue spec

Researched 2026-10-19. Verdict: **skip** (play-money, no market data in the public API, no trade path, no onchain leg).

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Summary
- Live: yes. acceptodds.com returned HTTP 200 on 2026-10-19; API `/api/v1/version` reports v0.1.0, started 2026-10-14. [H]
- A for-fun, play-money (in-app "reputation") prediction market on whether each ICLR 2027 (and NeurIPS 2026) paper is accepted. Not convertible to money. [M, via Show HN text as relayed by WebFetch + search snippet]
- LMSR automated market maker, binary Accept/Reject per paper, ~42k ICLR 2027 markets. [M]
- Zero real-money value, no chain, no collateral: cannot be an arbitrage leg. At most a "signal" on paper acceptance, unrelated to any other venue's categories.

## Market model [M]
- Binary (Accept vs Reject), one market per submission. Prices from Hanson's LMSR; traders can sell and rebuy; public P&L leaderboard. Everyone gets 1,000 reputation ($rep) to trade with "in each venue" (venue = conference).
- Outcomes are not tokenised; internal ledger only.
- Source: Show HN https://news.ycombinator.com/item?id=49976376 and search snippets of acceptodds.com pages (not read directly: see below).

## Chains and collateral
- None. Collateral is reputation, "can't be converted to money" (Show HN). [M]

## Read API
- Official public REST API with OpenAPI 3 spec: https://acceptodds.com/api/v1/openapi.json (127 KB, fetched). Docs UI: https://acceptodds.com/docs. [H]
- Base URL: https://acceptodds.com/api/v1 . Reads public, no key (`/llms.txt`). [H]
- IMPORTANT: the published OpenAPI describes only "the safe for work edition": "There are no markets, prices or trading here." Endpoints are paper listings, citations, related papers, map, follows, groups, reading lists, tokens, affiliations, announcements. No endpoint for prices, books, trades, positions or resolution. [H]
- Key endpoints: GET /listings (cursor, limit, kind, q), GET /listings/{id}, /listings/{id}/citations, /related, /minimap, /text, GET /map, /map/titles, /map/search, /transitions, GET /version. Listing fields: id, slug (e.g. `neurips2026-148140`), title, summary, authors, keywords, links, kind (e.g. "NeurIPS 2026"), closedAt, createdAt, followers, views. [H]
- Auth: bearer API token `pm_live_...` (scopes read, admin; `trade` "still accepted and grants nothing more" - a leftover from the market edition), or cookie session (better-auth; signup requires an email at an approved institution). Writes must come from the site's own Origin. [H]
- Rate limits: per-token buckets, headers X-RateLimit-Limit / -Remaining / -Reset; sizes not documented. [H]
- Websocket: NOT FOUND (searched: openapi.json paths, llms.txt, robots.txt).
- robots.txt: Allow /api/v1/openapi.json, Disallow /api/ (so crawler-wise, API is not for bots by robots.txt, though Show HN says bots are welcome). [H]
- Market/price data seen on the web UI (search snippets: "79% chance this paper gets accepted") is only reachable by passing the "Take me to the safe for work edition" gate, which is a POST /enter form. Not done (read-only rules). The landing page and paper pages fetched without that cookie show no prices. [H]

## Trade path
- None programmatic and documented. Show HN claims "Bots are allowed and encouraged" [M] but the spec has no trade endpoints. Any trading is by reputation inside the account ledger.

## PayBox reachability
- No. No wallet, chain, token or signed order. Paybox_reachable = no.

## Fees
- NOT FOUND (searched: Show HN, openapi.json, llms.txt, site pages). Play money; irrelevant.

## Resolution
- Per Show HN snippet: each market settles when the conference publishes its decisions (ICLR 2027 decisions date not found). [M] Resolution source is OpenReview/conference outcomes, which acceptodds does not control. Dispute process NOT FOUND.

## Geo / ToS / automation
- /terms and /privacy fetched return the same landing shell without body text (no terms read). NOT FOUND (searched: /terms, /privacy, /faq, /docs landing). Show HN says bots allowed. Site is "a game made for fun" with no affiliation to ICLR/OpenReview (search snippet). [M]

## Liquidity
- No money liquidity. Scale: ~42k ICLR 2027 markets at launch (Show HN, 2026-10-06 to 10-13) [M]; listings show a `views` counter only. No volume/OI/TVL figures anywhere.

## Event overlap
- Academic paper acceptance (ICLR, NeurIPS). No overlap with sports, politics, crypto or macro venues. Possible niche overlap only with Manifold-style play-money markets on conference acceptance (not researched here).

## Shared liquidity
- Independent, but worthless as a leg (play money).

## Priority: skip
- Play-money, no price endpoint, no onchain footprint. Revisit only if the project wants a "crowd forecast of paper acceptance" signal and the authors expose a market-data endpoint.

## Suspicious content
- None found. Landing page footer has an obfuscated contact email (Cloudflare protection); not decoded or recorded.

## Fixtures
- docs/research/fixtures/acceptodds/listings_limit2_trimmed.json (GET /listings?limit=2, trimmed to 1 listing, summary truncated)
- docs/research/fixtures/acceptodds/openapi_index.json (path index + security schemes)
- docs/research/fixtures/acceptodds/version.json

## Sources
- https://acceptodds.com (landing, H, 2026-10-19), /robots.txt, /sitemap.xml, /llms.txt (H)
- https://acceptodds.com/api/v1/openapi.json (H), https://acceptodds.com/api/v1/listings?limit=2 (H), /api/v1/version (H)
- https://news.ycombinator.com/item?id=49976376 Show HN (M, via WebFetch summary)
- Web search snippets of acceptodds.com paper/kind pages, https://agihunt.info/p/1a123842fc4c86b347d31c51f81 and Chaos Agents daily 2026-10-06 (M/L)
- Further web searches were blocked by the session search budget.
