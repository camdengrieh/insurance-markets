# MetaForecast (metaforecast.org) - adapter spec

Researched 2026-10-19 (~02:00 UTC). READ-ONLY: unauthenticated GETs to metaforecast.org (HEAD-style header capture only, redirects not followed), WebFetch of two QURI pages, `gh api` file/commit reads of the public QURI repos. No account, no key, nothing signed, no POST/PUT/DELETE, no third-party code cloned or run. WebSearch was NOT available (session search budget exhausted), so findings rest on primary sources only.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (READMEs, commit messages, pages) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/metaforecast/` (3 small files).

## 0. Verdict

**adapter_priority: skip. The venue is DEAD (H).**

1. Metaforecast was formally discontinued on **2026-07-09**. The website and the public GraphQL API are no longer available (H, README below).
2. Live probe on 2026-10-19: `metaforecast.org/`, `/api/graphql` and `/api/frontpage` all return **HTTP 308 to `https://quantifieduncertainty.org/`** (H, fixture `liveness_redirect_headers.txt`). There is no API to adapt.
3. Even when alive it was never a venue: it was a read-only search index of other venues' probabilities, not tradeable, not independent liquidity, and its data was a lagging copy of sources this project reads directly (Polymarket, Kalshi, Manifold, Metaculus, PredictIt are all separate adapters).
4. The shutdown is permanent in intent: the maintainers removed the scraper cronjobs on 2026-07-12 and the QURI maintenance-mode post lists Metaforecast as a project being wound down.
5. The only salvage value is (a) a reference list of which sources an aggregator can scrape, and (b) a historical GraphQL schema for a normalised "question + options + quality indicators" record. Neither needs an adapter.

## 1. Liveness evidence (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://metaforecast.org/` 2026-10-19 01:58 UTC | `HTTP/2 308`, `location: https://quantifieduncertainty.org/`, `server: Vercel` | H (fixture) |
| `GET https://metaforecast.org/api/graphql` | same 308 to the QURI home page | H (fixture) |
| `GET https://metaforecast.org/api/frontpage` | same 308 | H (fixture) |
| Monorepo README `apps/metaforecast/README.md`: "Metaforecast was discontinued on July 9, 2026. The website and the public GraphQL API are no longer available. A full archive of the database was preserved; contact QURI if you need access to the data." | primary, repo `quantified-uncertainty/squiggle` | H (fixture `shutdown_readme_excerpt.md`) |
| Commit `cc5ba763` 2026-06-25 "Announce Metaforecast shutdown in banner": banner text "Metaforecast is shutting down. The site will be taken offline on July 9, 2026." | `gh api repos/quantified-uncertainty/squiggle/commits/cc5ba763` | H |
| Commit `7658992a` 2026-03-16 "Add broken-site banner to Metaforecast"; the pre-shutdown banner text replaced by `cc5ba763` read "We aren't currently maintaining Metaforecast. We hope to do so again in the future." | `gh api` commit list + `cc5ba763` diff | H |
| Commits `1f4cf1af` (2026-07-12 README shutdown note) and `afa52b20` (2026-07-12 "remove Metaforecast scraper cronjobs (shutdown)") | `gh api ...commits?path=apps/metaforecast` | H |
| QURI post "QURI is moving into maintenance mode", dated 2026-06-20: Guesstimate, SquiggleHub and RoastMyPost stay up; Foretold.io and Metaforecast "will be wound down" (the post says neither has worked for some time) | https://quantifieduncertainty.org/posts/quri-is-moving-into-maintenance-mode/ via WebFetch (summary by the fetch model; link text in the site nav still lists "Metaforecast") | H/M |
| Old standalone repo `quantified-uncertainty/metaforecast`: **archived**, last push 2025-02-09, README says "This repository is deprecated", code moved to the Squiggle monorepo `apps/metaforecast` | `gh api repos/quantified-uncertainty/metaforecast` | H |
| Last-known data freshness: the site was already reported broken from at least 2026-03-16 (banner), so its price data should be treated as stale well before the 2026-07-09 shutdown | inferred from banner commit | M |

Note: the starting hint ("metaforecast.org now returns a QURI blog page") is explained: the domain 308-redirects to the QURI home page (title "The Quantified Uncertainty Research Institute Blog"); it is a redirect, not a content move.

## 2. What it was (historical, for reference only)

- **Kind**: aggregator-or-data. A search engine over probabilities from prediction markets and forecasting platforms (H, README: "a search engine for probabilities from various prediction markes and forecasting platforms"). Operator: Quantified Uncertainty Research Institute (QURI). Source licence MIT (H, `gh api` repo metadata).
- **Market model**: none of its own. It stored a normalised `Question` record: title, url, description, `options[] {name, probability 0..1}`, platform, `qualityIndicators` (liquidity, numForecasters, numForecasts, openInterest, sharesVolume, spread, stars 0-5, tradeVolume, volume), `fetched`/`firstSeen` timestamps and a `history[]` of snapshots (H, fixture `historical_schema.graphql`).
- **Sources it scraped** (platform fetcher files at shutdown, H, `gh api .../apps/metaforecast/src/backend/platforms`): betfair, fantasyscotus, foretold, givewellopenphil, goodjudgment, goodjudgmentopen, guesstimate, infer, insight, kalshi, manifold, metaculus, polymarket, predictit, rootclaim, smarkets, wildeford, xrisk. The Polymarket fetcher read the Gamma API open markets and skipped `category === "Sports"` and markets missing prices, volume or liquidity (H, `polymarket/index.ts`). So even its coverage of overlap venues was partial.
- **Read API (historical)**: public GraphQL at `https://metaforecast.org/api/graphql` (Pothos server) with queries `frontpage`, `platforms`, `question(id)`, `questions(first/after/orderBy)`, `searchQuestions(input)` (Elasticsearch-backed fuzzy search with platform, stars and forecast-count filters) and a `createDashboard` mutation (H, fixture schema, README). Auth and rate limits: NOT FOUND in the repo docs read (searched: README, docs/graphql.md, schema). **Now gone.**
- **Chains / collateral / trade path / fees / resolution / liquidity**: not applicable. It never held funds or matched orders, so nothing to sign or propose; a PayBox wallet has nothing to trade here.

## 3. Relevance to the aggregation layer

- **Not an arbitrage leg** (no trading, no liquidity of its own). Its prices were copies of other venues' prices; using it would add latency and double-count signals already available from direct adapters.
- **Not a signal source** any more. The domain redirects away and the cron jobs that populated the DB are removed. A "full archive of the database" exists but is only available by contacting QURI (H, README); this is an offline research dataset at best (data ends ~mid-2026, and likely stale from at least March 2026), not a live feed.
- **Design reuse (M)**: the schema's `qualityIndicators` set (liquidity, spread, openInterest, volume, numForecasters) is a reasonable template for a cross-venue "market quality" struct, and the platform list is a checklist of venues other than those already assigned (Betfair, Smarkets, Good Judgment Open, INFER, Insight, Rootclaim are candidates for separate venue-specs if not already covered). This is a pointer only; none of those were researched here.
- **Overlap categories**: moot for the dead service. Historically politics, geopolitics, macro and crypto-adjacent questions overlapped with Polymarket/Kalshi/Manifold/Metaculus; sports were excluded from the Polymarket feed.

## 4. Fields requested by the schema, short form

| Field | Value | Tag |
|---|---|---|
| Still live | No (discontinued 2026-07-09; domain 308s to quantifieduncertainty.org) | H |
| Fees | none (read-only index) | H |
| Resolution | none of its own; inherited per source platform | H |
| Geo/ToS/automation | moot; MIT-licensed source code, but no running service. Any archive access is by contacting QURI (not done; no contact made) | H |
| Liquidity | none of its own; per-question `liquidity`/`volume` fields were copies from sources | H |
| Shares liquidity with | all of its sources (it has none of its own) | H |
| PayBox reachable | no (no wallet/trade surface) | H |

## 5. Not found / not done

- NOT FOUND (searched: README, docs/graphql.md, schema.graphql): documented auth, rate limits or websocket for the GraphQL API (never documented in the repo; endpoint is now dead).
- NOT DONE: no WebSearch (session budget exhausted); no contact with QURI about the archive; no Wayback/third-party archive fetches (not a documented API host; would only retrieve stale data anyway); no response shape confirmed from a live API because none exists. Fixtures are therefore redirect evidence plus the repo's historical schema.
- Whether other third parties (e.g. the Fletcher Discord bot, Global Guessing, Elicit) still expose Metaforecast-derived data: NOT CHECKED, low value.

## Sources

1. https://metaforecast.org/ , `/api/graphql`, `/api/frontpage` - live 308 probe 2026-10-19 (H).
2. https://quantifieduncertainty.org/ - QURI home; Links section still lists Metaforecast (H).
3. https://quantifieduncertainty.org/posts/quri-is-moving-into-maintenance-mode/ - 2026-06-20 (H/M, via WebFetch summary).
4. https://github.com/quantified-uncertainty/squiggle/tree/main/apps/metaforecast - README shutdown note; commits cc5ba763 (2026-06-25), 1f4cf1af and afa52b20 (2026-07-12), 7658992a/5a634108 (2026-03-16); schema.graphql; platforms dir; docs/graphql.md; docs/infra.md (H).
5. https://github.com/quantified-uncertainty/metaforecast - archived, deprecated, last push 2025-02-09 (H).
6. https://github.com/aland4747/awesome-prediction-markets - the discovery source (L; listed Metaforecast as an aggregator of Metaculus, Polymarket, Manifold, Good Judgment; now stale).

## Suspicious content

None found. (The shutdown README contains a normal contact-QURI sentence; nothing aimed at AI agents.)
