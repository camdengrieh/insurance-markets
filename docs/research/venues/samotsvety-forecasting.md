# Samotsvety Forecasting - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip** (not a venue). Samotsvety is a group of elite forecasters with a static blog, not a market. There is no money, no order book, no tokens, no trade path and no API. The only machine-readable surface is a blog RSS feed whose newest post is dated 2024-10-22. Its only conceivable use for the aggregator is as an occasional, hand-ingested prior for a few long-horizon tail-risk questions (AI risk, nuclear, catastrophe), not as a venue adapter.

## Is it live?

- Site serves HTTP 200 (nginx/1.20.2) on 2026-10-19. H - https://samotsvety.org
- Site is static (footer credits werc / Alpine / nginx). Sections: Blog, Media mentions, Projects, Track record, newsletter, contact. H - https://samotsvety.org
- Newest blog post: 2024-10-22 "Samotsvety probabilities for potential precursors of existential risk"; the rest are 2021-2023. Nothing in 2025 or 2026 on the blog. Over 12 months stale. H - https://samotsvety.org/blog/ and https://samotsvety.org/blog/index.rss (fixture saved)
- GitHub org SamotsvetyForecasting has two repos: `optimal-scoring` (last push 2022-04-18) and `samotsvety.org` (the site source, last push 2025-07-13). H - `gh api orgs/SamotsvetyForecasting/repos`
- Track record page was last edited around 2023-2024 (profile updates 2023-05-27 to 2024-04-26). Members forecast on INFER, Good Judgment Open, Metaculus, Insight Prediction and Manifold. H - https://samotsvety.org/track-record/
- A secondary blog claims a January 2026 Samotsvety AGI-timelines update (~28% by 2030, eight forecasters). Not on the primary site; looks like a re-cite of the 2023 number. L - found via WebSearch only; not verified.

## Kind and market model

- kind: forecasting-nonmoney (a forecaster collective plus blog). H
- No market model: no outcomes tokenised, no order book, AMM or parimutuel. Output is point probability estimates in blog tables (for example per-forecaster probabilities for catastrophe categories over 10 years), published as HTML, EA Forum cross-posts and occasional Squiggle templates. H/M
- Questions are long-horizon (nuclear risk, AI risk, existential-risk precursors, one court-case post-mortem, Moore v. Harper). They are mostly not directly tradable on any venue. H (blog index)

## Chains and collateral

None. No money, no chain, no token. H (nothing on the site mentions any)

## Read API

- exists: **none** (official), apart from an RSS feed for the blog.
- Base URL: https://samotsvety.org
- Docs: NOT FOUND (searched: homepage, /blog/, /projects/, /track-record/; `/api`, `/openapi.json`, `/rss.xml`, `/feed.xml`, `/blog/index.xml` all return 404).
- Only machine-readable endpoint: `GET https://samotsvety.org/blog/index.rss` (RSS 2.0, ~14KB, 7 items; each has title, link, guid, pubDate, HTML description). H - fixture `docs/research/fixtures/samotsvety-forecasting/blog-index.rss` (author email in the feed was redacted in the fixture).
- Numeric probabilities are inside HTML tables in post bodies, so any ingestion is scrape-and-parse or manual entry. No stable schema. M
- Auth, rate limits, websocket: none documented. Static nginx site, so poll at most daily.
- Related third-party aggregator: Metaforecast (QURI) is listed on the Projects page as a tool. Not researched here (out of scope; it indexes other platforms, not Samotsvety numbers). H that it is listed, https://samotsvety.org/projects/

## Trade path

none. No orders, no signing, no accounts. Not reachable through PayBox in any sense (no wallet, no transaction, nothing to propose). H

## Fees

None (not a market). H

## Resolution mechanism and dispute risk

None. Forecasts are scored after the fact by the individual forecasters' platforms (INFER, GJOpen, Metaculus). Samotsvety blog posts have no formal resolution; one 1-year post-mortem (2023-02-26) reviews a single forecast. Risk for aggregator use: the numbers have no resolution source and may never be updated. H/M

## Geo / ToS / automation

NOT FOUND (searched: homepage, track-record, projects). No ToS or robots-style automation policy located. Content is public blog text. Consulting is offered by contact only (a mailto link). H

## Liquidity

None. Not applicable. Nearest "market" activity: one member's large bet on Insight Prediction (a play-money-ish leaderboard, 2022) noted on the track-record page. L (undated, 2022)

## Event-category overlap (for arbitrage)

- AI timelines / AI risk, nuclear risk, existential-risk precursors: some overlap with Polymarket/Manifold/Metaculus long-dated questions, but resolution wording will not match and horizons are 10+ years. A numeric prior only. M
- Sports, politics (elections), crypto price, macro: no published Samotsvety forecasts on the site. H (blog index)
- Not a venue, so no arbitrage leg exists.

## Liquidity shared with other venues

Not applicable. Their forecasts live on other platforms (INFER, Metaforecast, GJOpen, Metaculus, Manifold) that are researched separately or are not markets. If those are of interest, adapt those venues, not this site. H

## Recommendation for the aggregator

1. Do not build an adapter.
2. Optional signal-only: a manual JSON file of Samotsvety numbers (post URL, date, question, probability, horizon) mapped to Metaculus/Polymarket/Manifold long-dated questions, flagged stale with a 2024-10-22 as-of date, low weight.
3. Re-check the blog RSS `lastBuildDate`/newest item if you want monthly freshness. Cheap to poll, but it has been inactive for about 12 months.

## Sources

- https://samotsvety.org (home; H)
- https://samotsvety.org/blog/ and https://samotsvety.org/blog/index.rss (post list, RSS; H)
- https://samotsvety.org/track-record/ (platforms, dates; H)
- https://samotsvety.org/projects/ (projects list; H)
- https://github.com/SamotsvetyForecasting (org repos via `gh api orgs/SamotsvetyForecasting/repos`; H)
- WebSearch "Samotsvety forecasting 2026" (extended): no primary 2026 publication found; the January 2026 AGI update claim comes from a secondary blog only (L)

## Open questions

- Whether Samotsvety has posted anywhere (EA Forum, Substack newsletter at /.newsletter/) in 2025-2026; the site itself shows nothing. Not checked: newsletter archive.
