# Predictbook (predictbook.co) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
Not a venue. It is an editorial "prediction markets intelligence desk" (news articles, whale alerts, Kalshi-vs-Polymarket spread alerts, live odds pages, Telegram PRO alerts). No trading, no public API, and the Terms of Service forbid scraping and AI use of its content. Adapter priority: **skip** (as an integration). At most, a human-read signal idea source. Everything it shows is derived from Polymarket and Kalshi, which are already covered by other workflows and are the independent legs.

## Liveness (H)
- Site live; newest content 2026-10-19 1:15 AM EDT (arbitrage alert) and 2026-10-18 whale alerts; articles dated 2026-10-16. Source: https://predictbook.co/signals , https://predictbook.co/ (fetched 2026-10-19). [H]
- Sitemap index (https://predictbook.co/sitemap.xml) lists pages, posts, categories, reports, live; live.xml lastmod 2026-10-14. [H]
- GitHub org Predictbook has repos pushed 2026-10-18 (awesome-prediction-market-toolkit, awesome-prediction-market-follows) - curated link lists only, no code/API. Source: `gh api orgs/Predictbook/repos`. [H]

## Kind and market model
- Kind: media / analytics / alerting. Not an exchange: ToS says "We are not a broker, exchange, or trading venue, and we do not execute trades, hold funds" (https://predictbook.co/terms-of-service, last updated 2026-08-16). [H]
- No market model, tokenisation, chains, collateral, fees, or resolution of its own. N/A.
- Venues covered: Polymarket and Kalshi only (homepage, signals page, ToS wording "exchanges like Kalshi and Polymarket"). [H]

## Read API
- Official public API: NOT FOUND (searched: homepage nav and footer, /api, /docs, /openapi.json, /llms.txt (all 404), robots.txt, web search "Predictbook predictbook.co prediction market analytics API", the org's GitHub repos and README of awesome-prediction-market-toolkit). [H]
- `/api/markets` returns HTTP 404 JSON `{"message":"Route not found \"/api/markets\""}`; robots.txt has `Disallow: /api`. The site appears to be a Next.js app with a CMS-style backend (response header hints, M). No documented API surface. [H for 404 and robots; M for stack]
- Websocket: NOT FOUND. Alerts are delivered via Telegram (t.me/Predictbook) and the web pages; "Predictbook PRO" gives real-time whale and arbitrage alerts on Telegram, "limited-time access", pricing not stated. [H]
- Scraping: ToS "You may not republish, redistribute, or scrape Predictbook content in whole or in substantial part, or use it to train, fine-tune, or evaluate any automated or AI system, without our prior written permission." Quoting with attribution and a link is allowed. [H] So do not build an adapter on its HTML. No fixtures saved for this reason (nothing machine-readable exists, and saving page content would conflict with the ToS).

## What the Signals page shows (H, 2026-10-19, for context only)
- Arbitrage alert shape: market title, YES leg on one venue and NO leg on the other with prices, spread %. Example: "Newsom and AOC 2028 Democratic ticket" YES on Kalshi 9.7c + NO on Polymarket 84.9c, "Spread 5.4%" (consistent with 100 - 94.6). Resolution-equivalence of the two markets is not shown, which is exactly the risk a linking layer must handle.
- Whale alert shape: venue, category, outcome, side, price, size (e.g. five-to-six figure USD trades on NFL games), trader (Polymarket shows a handle/address, Kalshi "unknown"), total position, potential payout. These come from Polymarket's public on-chain/API data and Kalshi's public trade tape (M, inferred; Predictbook does not document its sources).

## Trade path
None. A PayBox wallet cannot trade "Predictbook". Trading would go via Polymarket/Kalshi directly. paybox_reachable: no.

## Fees / resolution / dispute
N/A (not a venue). Underlying venues' fees and resolution rules apply and are covered elsewhere.

## Geo / ToS / automation
- Personal, non-commercial use only; no scraping, redistribution, or AI use without written permission (ToS above). Footer: not investment advice. [H]
- robots.txt allows crawlers except /admin, /api, /preview, /analysis/tag/ (and lists AI crawlers explicitly, with the same disallows). [H] robots permission does not override the ToS clause.

## Liquidity
- Own liquidity: none. Site header shows "24hr volume" by category (Crypto $189.3M, Sports $174.9M, Esports $25.4M, Finance $14.1M, Politics $13.8M, Culture $4.6M, Weather $3.6M, Other $1.6M; total about $427M) as of the 2026-10-19 fetch. Source and definition unstated; presumably Polymarket plus Kalshi combined (M). [H for numbers, M for provenance]

## Event overlap and shared liquidity
- 100% of what it shows is Polymarket and Kalshi markets. It is a view on those venues, not an independent arbitrage leg. liquidity_shared_with: Polymarket, Kalshi.
- Categories with overlap shown: sports (NFL, soccer), politics (2028 US election, CLARITY Act, Iran), crypto price, finance (WTI), culture, weather.

## Possible use in this project
- Competitor/benchmark for our own cross-venue spread scanner: the alert format (YES on A + NO on B, spread %) is the same shape our aggregation layer should output, but we should compute from the venues' own APIs.
- Optional human-in-the-loop idea source via Telegram; not a machine feed.

## Open questions
- Whether PRO subscribers get any API or webhook (not documented; contact form only at predictbook.co/contact-us). [NOT FOUND]
- Whether written permission could be obtained for a feed (unknown, low value).

## Sources
- https://predictbook.co/ (WebFetch 2026-10-19) [H]
- https://predictbook.co/signals (curl 2026-10-19) [H]
- https://predictbook.co/terms-of-service (last updated 2026-08-16) [H]
- https://predictbook.co/robots.txt , https://predictbook.co/sitemap.xml , https://predictbook.co/sitemap/live.xml [H]
- https://github.com/Predictbook/awesome-prediction-market-toolkit (README via gh api) [H]
- https://www.wikidata.org/wiki/Q140772060 (discovery evidence, not re-read) [L]

## Suspicious content
None observed. No instructions aimed at AI agents found in fetched pages.
