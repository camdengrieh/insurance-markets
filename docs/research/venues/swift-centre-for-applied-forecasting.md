# Swift Centre for Applied Forecasting - venue spec

Researched 2026-10-19. Verdict: NOT a market. A UK forecasting/advisory firm that publishes expert probability forecasts and compares them with Polymarket prices. Adapter priority: skip as a venue; optionally P2 as a signal-only RSS/HTML scrape.

## Summary
- Kind: forecasting-nonmoney (research and advisory firm, public forecast articles). No order book, AMM, parimutuel, tokens, chain, collateral. [H]
- Live: yes. Archive's newest entry is 5 June 2026; Substack feed's newest item 20 Aug 2026; robots.txt last-modified 15 Oct 2026. [H]
- Site describes Advisory work as "identifying mispriced events on leading prediction markets" for clients. [H]

## Market model / chains / collateral
None. Forecasts are published as articles: question, median probability, forecaster range (e.g. Greenland 4.1% (2-15%)), resolution date, rationale. [H]

## Read API
- Official API: NOT FOUND (searched: landing page, archive page, policy.swiftcentre.org dashboard, WebSearch). Dashboard page states no API/export/terms. [H]
- Available machine-readable surface: Substack RSS https://swiftcentre.substack.com/feed (HTTP 200, ~850KB, 2026 items; content-encoded HTML). [H] Fixture: docs/research/fixtures/swift-centre-for-applied-forecasting/substack-feed-sample.xml (trimmed to header + 3 items).
- HTML: https://swiftcentre.org/publicforecasts/ (archive, 45 entries 2022-2026, no feed link), sitemap https://swiftcentre.org/sitemap.xml, robots.txt allows all. [H]
- Separate dashboard https://policy.swiftcentre.org/ ("Bridge the Gap" AI policy project, Next.js; 5 forecasts, 29 policy advice submissions; forecast date, resolution date, probability, criteria). No API found; /api returned 404. [H]
- Auth/rate limits/websocket: none documented.

## Trade path
None. PayBox reachability: no (nothing to trade). Could only be consumed as an off-chain signal.

## Fees / resolution / geo-ToS
- Fees: none. Resolution: forecasts name resolution dates/criteria, but there is no settlement; no dispute mechanism. [H]
- ToS for scraping: NOT FOUND (searched: landing, dashboard); robots.txt allows all. Footer links to responsible-disclosure, privacy, cookies and a "Fair disclosure policy" (contents not read).

## Liquidity / overlap
- Liquidity: n/a. Shares no liquidity with any venue; not an arbitrage leg.
- Overlap as signal: geopolitics (Iran, Ukraine ceasefire, Greenland, Panama Canal), AI policy, UK politics. Example (published 2 Feb 2026, forecasts made 27 Jan 2026): Swift vs Polymarket: Greenland 4.1% vs 12%; Ukraine ceasefire/peace 22% vs 43%; Panama Canal 6.7% vs 15%; Khamenei out by Mar 31 27% vs 26%; US strike on Iran by Mar 31 68% vs 55%. [H] https://www.swiftcentre.org/publicforecasts/yk77y2zct07ttcl00lmuk2x2s629fh
- Cadence is low (~1-2 posts/month in 2026; 8 posts Jan-Jun 2026), probabilities embedded in prose/interactive charts, forecasts go stale quickly. Parsing would be bespoke LLM/HTML extraction.

## Open questions
- Whether interactive charts expose JSON; fair disclosure policy contents; whether Swift staff trade the compared markets.

## Sources
- https://www.swiftcentre.org (landing) [H]
- https://swiftcentre.org/publicforecasts/ [H]
- https://policy.swiftcentre.org/ [H]
- https://www.swiftcentre.org/publicforecasts/yk77y2zct07ttcl00lmuk2x2s629fh [H]
- https://swiftcentre.substack.com/feed (curl 2026-10-19) [H]
- https://www.swiftcentre.org/robots.txt, https://swiftcentre.org/sitemap.xml [H]
- WebSearch extended (secondary corroboration, X/UnHerd) [M]
