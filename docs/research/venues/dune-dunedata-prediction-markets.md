# Dune "@dunedata" prediction-markets dashboard (and Dune's prediction-market data layer)

Researched 2026-10-19. Read-only: public unauthenticated GETs, WebFetch, Wayback CDX/HEAD for one known URL. No accounts, API keys, wallets, signing or payments. Tags: **H** = read first-hand in a primary source this session, **M** = secondary/inferred (including anything extracted by WebFetch's summariser from a page I could not read raw), **L** = weak or stale.

## Verdict (read this first)

- **This is not a venue. It is an analytics/data layer.** Nothing can be traded on Dune. There is no order book, no market, no resolution mechanism of its own. adapter_priority = **P2 (signal-only)**.
- **The exact URL in the brief is dead.** `https://dune.com/dunedata/prediction-markets` returns **HTTP 404** today (H, WebFetch 2026-10-19). Wayback shows it was a `308` redirect to `https://dune.com/datadashboards/prediction-markets` on 2026-03-09 and 2026-08-21, and a `404` on 2026-09-17 (H, CDX + HEAD, fixture). The same dashboard (or its successor) is **live at `https://dune.com/datadashboards/prediction-markets`** (Dashboard ID 188176, owner `datadashboards`, monthly series through October 2026) (M, WebFetch extraction; curl gets a 403 bot wall so I could not read it raw). `dune.com/collection/prediction-markets/overview` is also a 404 (H).
- **The dashboard itself has no API.** It is a rendered web page. Its charts are saved Dune queries (IDs 6696130, 6696131, 6696132, 6696134, 6696145, 7376904, 6689536, 7375816 per the page, M). Reading those queries or the underlying tables programmatically needs a **Dune API key on a paid plan** (or per-request payment over MPP/Tempo). Free accounts are "view-only"; API access is "not available" (H, docs).
- **Dune data is lagged (about 1 hour for curated tables, daily for Kalshi legacy tables, "never contains the current day" for the dashboard's Kalshi feed)**, so it cannot be a live price leg for an arbitrage scanner. Its value for this project is (a) discovering which venues have real taker volume, (b) backfilling history for backtests and linking studies, (c) a cross-check on venue-reported volume and OI. Venue-native APIs remain the source for live prices.
- **The hint ("Polymarket, Kalshi, Limitless, Myriad") is outdated.** The live dashboard now lists Kalshi, Polymarket, Polymarket (US), Opinion, Limitless, Myriad, Predict, Overtime, Crypto.com, Novig and an "Other" group (Overtime, Gemini, Myriad, ForecastEx) (M).

## Is it still live? Evidence (all dated)

| # | Signal | Date | Tag |
|---|---|---|---|
| 1 | `dune.com/dunedata/prediction-markets`: WebFetch returns HTTP 404 | 2026-10-19 | H |
| 2 | Wayback CDX for that URL: 200 captures 2025-09-08 to 2025-10-16; `308` 2025-10-31, 2026-03-09, 2026-08-21; **`404` 2026-09-17** (last capture). HEAD of the 2026-03-09 and 2026-08-21 captures: `location: .../datadashboards/prediction-markets` | 2026-03 to 2026-09 | H (fixture `wayback-cdx_dunedata_prediction-markets.json`) |
| 3 | `dune.com/datadashboards/prediction-markets` loads via WebFetch; shows an October 2026 monthly row; Wayback has 200 captures through 2026-10-04 | 2026-10-19 | M (extraction) / H (CDX list) |
| 4 | `dune.com/datadashboards/kalshi-overview` loads (Dashboard ID 190387, query 5741344, last complete row 2026-08-18 in the first 100K chars read) | 2026-10-19 | M |
| 5 | Dune docs publish a curated "Prediction Markets" catalog (Polymarket, Kalshi, Hyperliquid HIP-4, cross-venue), "Refresh ~1 hour"; docs reference Polymarket Combos "from May 29, 2026" so the page is fresh | 2026-10-19 | H (docs, fixture) |
| 6 | Crowdfund Insider: Dune launched a unified Polymarket + Kalshi dataset | 2026-05-25 | M (third-party) |
| 7 | Third-party listing `polymark.et/product/dunedata` still points at the dead `/dunedata/` path (with `utm_source`), says charts refresh weekly and "Kalshi data may need a manual refresh because of API limits"; only date on it is "© 2025" | 2026-10-19 | M (stale listing) |

The "@dunedata" handle appears to have been renamed or migrated to "@datadashboards" (inference from the 308 redirect; no Dune statement found, NOT FOUND, searched: Dune docs, Wayback). The X account named on the listing is `x.com/dunedash` (M, unverified).

## Kind and market model

- **Kind**: aggregator/analytics (data warehouse + dashboards). Not a venue. (H)
- **Market model**: none of its own. The curated schema normalises other venues into one shape: every market shown from its **Yes side**, `price` = P(Yes) in [0,1], resolution vocabulary `yes | no | void | scalar | unresolved`, `is_parlay` flag, unified `category` enum with the raw label in `category_native`. Join key is `(venue, market_id)`, where `market_id` is a Polymarket `condition_id` or a Kalshi ticker (H, docs `prediction_markets/overview`, read through WebFetch of the page; the saved raw docs list the same table inventory).
- **No cross-venue event matching.** The docs say identifiers are venue-scoped; unification is at schema level only. There is no table that maps "same event on Polymarket and Kalshi" (H as an absence on the cross-venue overview page; NOT FOUND, searched: Dune docs cross-venue overview, all-tables-overview).

## Chains and collateral

- Not applicable to Dune itself. The data it covers: Polymarket on **Polygon**, Kalshi **off-chain** (partner/regulatory reporting), Hyperliquid **HIP-4** outcome markets on Hyperliquid (not yet in the cross-venue tables) (H, docs).
- Paying Dune for API calls (optional MPP route): **Tempo** payment channel, challenge says `chainId 4217` with an escrow contract (H, live 402, fixture). That chainId is Tempo mainnet only by my recollection of Tempo's docs; I did not verify it (L).

## Read API

| Item | Finding | Tag |
|---|---|---|
| Existence | **Official, authenticated, paid.** Dune SQL API: run saved queries or raw SQL, fetch results | H |
| Docs | `https://docs.dune.com/api-reference/overview/introduction`; index `https://docs.dune.com/llms.txt`; prediction-market catalog `https://docs.dune.com/data-catalog/curated/prediction-markets/overview` | H |
| Base URL | `https://api.dune.com/api/v1/...`; MCP server `https://api.dune.com/mcp/v1` (OAuth or `x-dune-api-key`) | H |
| Key endpoints | `POST /api/v1/sql/execute` (raw SQL, body `{sql, performance}`), `POST /api/v1/query/{id}/execute`, `GET /api/v1/execution/{id}/status`, `GET /api/v1/execution/{id}/results` (also `/csv`), `GET /api/v1/query/{id}/results` (latest saved result, no new execution, still charges credits by size) | H |
| Auth | Header `X-DUNE-API-KEY`; key scopes `Read` and `Read/Write`; keys made in the web app (settings -> API). Unauthenticated: `GET /query/6534228/results` -> **401 `{"error":"invalid API Key"}`** | H (docs + live GET) |
| Alternate auth | **MPP (Machine Payment Protocol)** on `POST /v1/sql/execute`, `GET /v1/execution/:id/results`, `GET /v1/execution/:id/csv`: HTTP 402 `WWW-Authenticate: Payment ... method="tempo", intent="session"`; client library `mppx`; no key or account. Live unauthenticated GET of a results URL returned the 402 challenge (decoded in fixture: Tempo `chainId 4217`, `suggestedDeposit` 10.00 units at 6 decimals, an escrow contract, a recipient). I stopped there; nothing paid | H |
| Rate limits | Per IP 1000 rps. Plus: low-limit endpoints (execute, create/update query...) **70 rpm**, high-limit (results, status, read query) **200 rpm**. Enterprise 350+ / 1000+ rpm. Free: API "not available". **Analyst-plan limits: NOT FOUND** (docs table omits Analyst) | H |
| Cost | Credits by compute used (no per-query formula published). Analyst $75/mo for 4,000 credits; Plus $399/mo for 25,000 credits ($349/mo annual); Enterprise custom. Trial: 2,500 credits for up to 14 days. Data export: Analyst 10 credits/MB, Plus 2 credits/MB. Extra credits about $1.40 to $1.88 per 100 | H (docs) |
| Freshness | Curated tables "Refresh ~1 hour" (a search snippet mentioned an older docs version saying about 24 h; the current docs pages I read all say about 1 hour, so treat 1 h as current). Kalshi legacy `market_report`/`trade_report` are **daily** aggregates, not fills | H / M |
| WebSocket / streaming | NOT FOUND (searched: docs.dune.com llms.txt; no streaming endpoint for query results) | M |
| Result retention | Execution results stored 90 days; max result size 32 GB (truncates) | H |
| Tables (public) | `polymarket_polygon.market_trades`, `market_details`, `market_prices_hourly`, `users_address_lookup`; `kalshi.market_report`, `kalshi.trade_report` | H |
| Tables (gated: **Enterprise entitlement**) | `polymarket_polygon.{combo_*, positions, ohlcv_hourly, open_interest_hourly, market_actions}`, `kalshi.{market_trades, market_details, ohlcv_hourly, open_interest_hourly}`, `hip4_hyperliquid.*`, **`prediction_markets.{markets, trades, ohlcv_hourly, open_interest_hourly}`** (the cross-venue schema) | H (saved raw docs lines 16-27) |
| Dashboard data | Dashboard widgets are the public queries above; reading them through the API still needs a key (public query results can be read with a key: "must either be public or owned by you") | H |

Net: the genuinely useful cross-venue tables sit behind an **Enterprise** entitlement; with a Plus key you can read only the public Polymarket tables and Kalshi daily reports. That is a poor fit for a scanner.

Unauthenticated response shapes confirmed 2026-10-19 and saved in `docs/research/fixtures/dune-dunedata-prediction-markets/`: `api-unauthenticated-responses.json` (402 MPP challenge, 401 results, 401 MCP), `wayback-cdx_dunedata_prediction-markets.json`, `docs_prediction-markets-overview.md`, `docs_all-tables-overview.md` (raw Mintlify markdown of the public docs), `dashboard-datadashboards-prediction-markets_extract.json` (summariser extraction, **not raw**, M). No live data sample exists because every data endpoint needs a key or a payment.

## Trade path

**None.** Dune is read-only analytics. No order placement, no signing scheme. (H)

## PayBox reachability

- Trading: **no** (nothing to trade).
- Using Dune as a paid data source from an agent: **unclear/partial.** Dune's key-less route is **MPP over Tempo payment channels**, not x402. PayBox's x402 proposal kind accepts only `eip155:8453` and `solana:mainnet` per the earlier PayBox platform notes (`docs/research/06-paybox-platform.md`, H there), and a PayBox `discover_services` search for "dune analytics sql query" returned five third-party x402 SQL/data services and **no Dune service on page 1** of a paginated result (`has_more` true; not exhausted) (H for what was returned, M that none exists). Whether a PayBox wallet can open a Tempo channel via `request_wallet_sign` typed-data vouchers is **unverified** (MoonPay's launch post lists Tempo among networks, M, from `08-venues-polymarket-kalshi.md`). Cheapest practical route: a normal Dune API key held as a plugin secret.

## Fees

- No trading fees (nothing is traded). Data cost as in the Read API table.
- The datasets expose venue fees, e.g. `kalshi.market_trades` has estimated taker and maker fees (H, docs), which is useful for net-edge modelling, but it is gated.

## Resolution mechanism and dispute risk

- Dune does not resolve anything; it reflects each venue's outcome in `resolved_outcome` / `market_outcome` / `settlement_value`. Polymarket docs note a decided series ends on its resolution-hour bar whose close is the exact settlement value (H). Dispute risk therefore lives in each venue, not Dune. Caveat for a scanner: a title match across venues is not a rules match (see `docs/research/08-venues-polymarket-kalshi.md`), and Dune does not help with that.
- Data-quality risks stated by the dashboard owner: **no wash-volume filter**; "Notional Volume is equal to contracts, a contract does not equal a dollar" (so notional is not USD); Polymarket parlays missing and Hyperliquid refreshed manually (page title); Kalshi data "uploaded by Kalshi", never includes the current day (all M, WebFetch extraction of the dashboard page).

## Geo, ToS, automation

- Dune Terms of Service (last updated 2026-06-03, M via WebFetch of `dune.com/terms`): users "must not use bots, crawlers, scrapers, or other automated means to access or collect data" from the Services; the **SQL API is governed by a separate addendum that I did not read** (it overrides the general terms). The terms do not mention trading use and give no accuracy guarantee. Public query content: others may view/fork/copy with credit. So: use the official API with a key, never scrape the dashboard HTML. (Dune's own bot wall returns 403 to scripted page GETs; I did not try to bypass it.)
- No geo-blocking on the API observed (a 401/402 came back from the API host). No jurisdiction rules found for data access.
- Redistribution/commercial reuse of query results: no general clause found on the terms page (M); Enterprise addendum unknown. NOT FOUND (searched: dune.com/terms).

## Liquidity (volume/OI snapshots from the dashboard)

All from `dune.com/datadashboards/prediction-markets`, read 2026-10-19 via WebFetch's summariser over the first 100K of about 10.3M characters (M; page does not state its own refresh time; Kalshi never includes the current day). **Notional = contracts, not USD. No wash filter.** Compare using taker volume.

| Venue | Oct 2026 month-to-date taker volume | Oct 2026 notional (contracts) | All-time open interest ("TVL" column) |
|---|---|---|---|
| Kalshi | 8.81B | 48.5B | 1.593B |
| Polymarket (US) | 1.76B | 7.04B | 0 |
| Polymarket (global) | 1.41B | 2.73B | 347.0M |
| Novig | 448M | 1.62B | 33.1M |
| Predict | 51.6M | 449M | 11.1M |
| Other (Overtime, Gemini, Myriad, ForecastEx) | 165M | 364M | 9.8M |
| Crypto.com | n/a | 1.41B | n/a |
| Limitless | 0.25M | 5.4M | 0.40M |

- "Open Interest" is labelled TVL in the query and shown as an all-time/current total; the extraction did not give an "as of" date for it (treat as 2026-10 snapshot, L on the date).
- Third-party cross-check (M, stale): predictreport.io (dated 2026-03-17, updated 2026-09-24) cites about $5.35B combined Polymarket + Kalshi weekly notional for the first week of March 2026 and says Dune "is not real-time".
- Dune x Keyrock report (Polymarket, Kalshi, Crypto.com, Myriad, Limitless, Opinion, ...; "130x monthly volume growth since 2024", Brier about 0.09) is described only second-hand (M, predictreport.io). I did not locate the report itself (NOT FOUND, searched: web search budget was exhausted before I could look; one WebFetch of predictreport.io only).

## Event categories that overlap other venues

Dune lists no category-level volume in the pages I read. The unified `category` enum exists (gated) and the launch article lists: Fed decisions, CPI, employment, shutdown/debt ceiling, single-stock price targets and earnings, elections, tariffs/regulation, token prices and ETF approvals, geopolitics (M, Crowdfund Insider 2026-05-25). Sports are the largest US volume driver on Kalshi/Polymarket US/Novig but I have no Dune number for it (NOT FOUND). Arbitrage use: Dune can rank which overlapping venues deserve adapters, not find the arb.

## Shared liquidity

N/A (no liquidity of its own). It reports other venues' liquidity, so **not an arbitrage leg**.

## Leads surfaced (not researched here)

- **Hyperliquid HIP-4** outcome markets are in Dune's catalog (`hip4_hyperliquid.*`); an existing note `docs/research/venues/hyperliquid-outcomes-hip-4.md` already covers it (not re-read).
- Dune's dashboard names venues I did not check against the venue list: Polymarket (US), Novig, Overtime, Gemini, ForecastEx, Crypto.com (notes exist for several in `docs/research/venues/`).

## Suspicious / embedded instructions

None found. The polymark.et listing, Dune docs, the 402 body and the dashboard extraction contained no text addressed to AI agents. Dune's docs do contain "give your agent this prompt" setup text ("Read https://tempo.xyz/SKILL.md and set up tempo") aimed at users' coding agents; I did not follow it. PayBox `discover_services` returned unrelated third-party service descriptions (agent402.tools, aiskills402.com, hubvibe-io.com, allium); none contained instructions to me.

## Adapter recommendation

- **P2, signal/analytics only.** Do not build a venue adapter. If wanted later: a "DuneBackfill" data source behind an API-key secret, used for (1) historical hourly prices/OI per market to calibrate fill-probability and lead-lag studies, (2) venue ranking by taker volume, (3) category mix. It cannot serve live legs (about 1 h lag) and the useful unified tables need an Enterprise entitlement.
- Cost to try it honestly: Plus plan about $349 to $399/month, or MPP pay-per-request (unverified from PayBox).
- Do **not** cite the Dune dashboard's notional numbers as dollars.

## Open questions

1. What is the Analyst-plan API rate limit? (not in docs)
2. Can a PayBox wallet open a Tempo MPP session (typed-data voucher signing)? Not tested; would need a human-run test.
3. What does the SQL API addendum say about redistribution, caching and commercial reuse?
4. Is the `@dunedata` -> `@datadashboards` rename official, and does `dune.com/dunedata/*` have other surviving pages?
5. Real lag of `prediction_markets.*` in practice (docs say about 1 h).

## Sources

- https://dune.com/dunedata/prediction-markets (404, 2026-10-19) and https://dune.com/collection/prediction-markets/overview (404)
- https://dune.com/datadashboards/prediction-markets (WebFetch extraction, 2026-10-19)
- https://dune.com/datadashboards/kalshi-overview (WebFetch extraction, 2026-10-19)
- https://docs.dune.com/data-catalog/curated/prediction-markets/overview (+ `/all-tables-overview`, `/polymarket/overview`, `/prediction_markets/overview`, `/kalshi/overview`)
- https://docs.dune.com/api-reference/overview/{introduction,authentication,rate-limits,billing}.md, https://docs.dune.com/api-reference/executions/endpoint/{execute-sql,get-query-result,get-execution-result}.md
- https://docs.dune.com/resources/credits-billing/how-credits-work.md, https://docs.dune.com/learning/how-tos/pricing-faqs.md
- https://docs.dune.com/docs/agents/mpp.md, https://docs.dune.com/docs/agents/mcp.md, https://docs.dune.com/llms.txt
- https://dune.com/terms (WebFetch, last updated 2026-06-03 per page)
- Live unauthenticated GETs to https://api.dune.com/api/v1/execution/.../results (402), /api/v1/query/6534228/results (401), /mcp/v1 (401)
- Wayback CDX/HEAD for dune.com/dunedata/prediction-markets and dune.com/datadashboards/prediction-markets
- https://polymark.et/product/dunedata (stale listing, M)
- https://predictreport.io/ecosystem/dune-analytics-prediction-markets (M, 2026-03-17, updated 2026-09-24)
- https://www.crowdfundinsider.com/2026/05/280950-dune-analytics-unifies-prediction-markets-data-from-polymarket-and-kalshi/ (M, 2026-05-25)
- PayBox `discover_services` (read-only), query "dune analytics sql query"
- Fixtures: `docs/research/fixtures/dune-dunedata-prediction-markets/`
