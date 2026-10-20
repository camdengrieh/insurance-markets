# Oddpool - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc reads, unauthenticated GETs to the documented API host (7 probes, generic User-Agent `insurance-markets-research/0.1`), no account, no API key, no wallet, no signing, no POST/PUT/DELETE, no PayBox tool. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/oddpool/` (section 11). **None is a live data response**: every data endpoint needs an API key and I did not create one. The only real responses are `/health`, `/` and the 401s.

---

## 0. Bottom line

1. **Oddpool is not a venue. It is a data/analytics aggregator over Kalshi, Polymarket and (partially) Opinion.** It has no market model, no collateral, no order placement and no liquidity of its own. It cannot be an arbitrage leg, and every price it shows is a copy of a price on a venue we already cover directly. (H)
2. **It looks like it is being absorbed by Kalshi.** Oddpool's own pricing page says "Oddpool is no longer accepting new subscriptions. Existing subscriptions and free accounts continue as normal." (H, oddpool.com/pricing raw HTML, 2026-10-19). Three secondary reports dated 2026-09-05, 2026-09-10 and 2026-09-16 say the founders announced "Oddpool is joining Kalshi" (M, section 1). The Y Combinator company page shows Status: Inactive (H). The API itself still answers (`/health` 200, H).
3. **The useful paid surfaces are closed to new users.** The arbitrage API needs Premium, WebSocket `book`/`trade`/`snapshot` and whale data need Pro, and new subscriptions are closed. A new free account gets only search, historical data (about 1 hour delayed, from March 2026), and the WebSocket `dist` channel for 2 events at 1 req/s and 1,000 requests/month. (H, docs.oddpool.com authentication, rate-limits, websocket/limits; pricing page)
4. **ToS conflict with our use case.** The terms forbid "trading automation" and incorporating Oddpool data "into a competing product, data feed, or commercial API", and limit data to "personal, internal use" (section 7). A cross-venue aggregation/arbitrage layer is a competing product.
5. **adapter_priority = skip.** Duplicate liquidity and duplicate function, paid features unobtainable, ToS-hostile, and likely to be folded into a competitor-owned exchange. Two things are worth keeping as research inputs (not as an adapter): Oddpool's settlement-fungibility taxonomy (section 9) and its public docs as a benchmark for our own matcher.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.oddpool.com/health` | `200 {"status":"ok"}` at 2026-10-19; `GET /` returns `{"message":"Prediction Markets API"}` | H |
| oddpool.com, docs.oddpool.com | Both serve, footer "(c) 2026 oddpool"; docs include a weather feed vertical and Opinion in the arb scanner | H |
| Pricing page banner | "Oddpool is no longer accepting new subscriptions. Existing subscriptions and free accounts continue as normal." Page still shows "Get Started Free" buttons, so new free sign-ups may still work; I did not test (would need to create an account). Banner date not shown. | H |
| Last public product activity | Changelog newest entry 2026-05-06 (Oddbot); research posts 2026-05-04 and 2026-05-28. Nothing after that on the site: roughly 5 months quiet. | H |
| Acquisition / "joining Kalshi" | Dealroom note dated 2026-09-05 says Oddpool "is now joining the regulated event contracts exchange Kalshi to build institutional data tooling" (page summary via WebFetch). BettingJobs dated 2026-09-10 says Oddpool "is joining Kalshi", founders cite talks with Kalshi's CEO. Dealroom 2026-09-16 headline: Kalshi acquires data startup Oddpool, terms undisclosed; says Kalshi can build institutional tooling in-house. A search result snippet shows the Oddpool X post: "Oddpool is joining @Kalshi. Ritesh and I came out of @ycombinator this past spring and raised a $3M seed." None of these says whether the public API/pricing continues. I could not open the X post (HTTP 402 to WebFetch, recorded and stopped) or Prediction News (HTTP 403). Seed size is inconsistent across reports ($3M vs US$1.94M). | M |
| YC profile | ycombinator.com/companies/oddpool: Batch Spring 2026, team size 2, `ycdc_status: Inactive` in the page JSON and "Inactive" in the rendered Status field. | H |

Verdict: **still_live = true** as a service (API and site answer, existing subscribers served), but **closed to new paid customers and probably being folded into Kalshi**. Treat it as a sunset risk. (A web-search budget limit stopped me from searching further for a Kalshi-side announcement; that is the main open question.)

---

## 2. Kind and market model

- **Kind (H):** third-party data aggregator / analytics SaaS ("Aggregated market probabilities. Informational only - not financial advice." - site footer). Products: cross-venue search, historical orderbook/trade archive, live WebSocket feeds with a liquidity-weighted cross-venue probability, whale-trade tracking (trades >= $500, Pro), arbitrage and price-spread scanners (Premium), paper trading, an LLM analyst ("Oddbot"), and an enterprise-only "Reference Data" API that maps the same real-world event/outcome across venues.
- **Market model: none of its own.** It republishes the venues' own models. Normalised view: contract prices 0-1 as decimal strings or floats, YES/NO sides, sizes as absolute quantities, Unix-ms timestamps. Kalshi history is native YES bids + NO bids; Polymarket history is per-token (one row per CLOB token, YES and NO). (H, docs kalshi/orderbook, polymarket/orderbook, websocket/messages)
- **Identifiers it hands back (H, docs arbitrage/current):** Kalshi `market_ticker`; Polymarket `condition_id` + `yes_token_id`/`no_token_id` (CLOB token ids); Opinion `child_market_id` + `yes_token_id`/`no_token_id`; Polymarket US `<marketSlug>#YES|NO` (reference API only). These are venue-native, usable directly on each venue's own API.
- **Coverage claims differ across Oddpool's own pages (H):** pricing page and docs index say Kalshi and Polymarket only; the arbitrage docs and the 2026-02-16 changelog add Opinion as a third scanner venue; the enterprise reference API lists `kalshi`, `polymarket`, `polymarket_us`. The home page claims "700K+ markets" (undated; unverified, M).

## 3. Chains and collateral

Not applicable. Oddpool holds no funds and has no chain. Collateral is whatever the underlying venue uses (Kalshi USD; Polymarket USDC on Polygon; Opinion on BNB Chain - covered by the parallel venue workflow, not re-verified here). (H for "no wallet/funds" - nothing in docs or ToS mentions deposits, wallets, tokens or x402.)

---

## 4. Read API

- **Existence:** official, **authenticated** (API key) - plus an undocumented "signature" auth path (see below). Docs: https://docs.oddpool.com ; machine index https://docs.oddpool.com/llms.txt (H, 10.5 KB, saved) and https://docs.oddpool.com/llms-full.txt (H, 166 KB, not saved). No OpenAPI file: `GET /openapi.json` -> 404 (H). `api.oddpool.com/llms.txt` -> 404, though the docs page links to it (H).
- **Base URLs:** REST `https://api.oddpool.com` ; WebSocket `wss://feeds.oddpool.com/ws` (H).
- **Auth:** `X-API-Key: oddpool_...` header; keys generated in account settings at oddpool.com/account. WebSocket: send `{"action":"auth","api_key":"..."}` after connecting; server replies with tier and limits. Without a key every data endpoint returns `401 {"detail":"Authentication required (API key or signature)"}` (H, 4 endpoints probed). The "or signature" alternative is **not documented** anywhere I could find (searched docs for signature, x402, wallet, USDC, payment: no match). I did not send any 402/x402 probe because none was advertised.
- **Rate limits (H, docs rate-limits):** Free 1 req/s, 1,000 req/month hard cap, 1 key. Pro 10 req/s, 1M/month. Premium 25 req/s, 5M/month. Enterprise 500 req/s unlimited. `429` with `Retry-After`. Older changelog entries quote different numbers (10 req/s burst + 1,000/min for Pro; 1,000 req/min for Premium) - treat the docs page as current, the changelog as stale (L).
- **WebSocket limits (H, docs websocket/limits):** Free 1 connection, 2 events, `dist` channel only, no snapshots. Pro 3 connections, 10 events, all channels. Premium 10 connections, unlimited events. Errors `CHANNEL_NOT_ALLOWED`, `EVENT_LIMIT`, `CONNECTION_LIMIT`.
- **Plan gating (H, docs authentication + pricing):** Search = Free. Historical = Free. WS `dist` = Free; `book`/`trade`/`snapshot` = Pro. Whale API = Pro. Arbitrage and Price-spreads API = Premium. Reference Data API (`/reference/v2/*`) = enterprise only (403 otherwise).
- **Key endpoints (all H from docs, none exercised):**
  - Markets/events: `GET /search/series`, `/search/markets` (needs `q` or `series_id`; filters exchange, status, category, min volume/liquidity, `settled_after/before`, `sort_by`; limit 1-100, offset paging), `/search/events`, `/search/recent/markets`, `/search/recent/events`, `/search/events/{event_id}/markets`.
  - Prices/books (history only): `GET /historical/{kalshi|polymarket}/orderbook` (1m or 5m snapshots, Unix-ms `start_time`/`end_time`, limit 1-200, `pagination_key` cursor), `/historical/{venue}/top-of-book`, `GET /markets/ohlcv?market_ids=...` (1-50 markets; 6h/1d/1w/1m bars), `GET /events/{event_id}/ohlcv`.
  - Trades: `GET /historical/{venue}/trades` (Polymarket rows carry `side`, `price`, `size`, `transaction_hash`, `fee_rate_bps`).
  - Live: WebSocket channels `dist:{event_key}` (cross-venue probability, per-venue prob and USD depth within +/-5c of mid), `book:{event_key}:{outcome}`, `trade:{event_key}:{outcome}`, `snapshot:{event_key}` (full state every 60 s). Event keys come from `GET /feeds/catalog?feed=macro|crypto|weather&status=...&expand=channels`. Feeds: macro (FOMC, CPI, NFP, GDP, unemployment, equities, gold/silver) and crypto (BTC/ETH 5m, 15m, hourly with Binance spot/futures reference on every message). Only events Oddpool has matched across venues get a feed; venue-native ids are rejected as event keys.
  - Cross-venue signals: `GET /arbitrage/current?min_net_cents=&orderbook=true` and `GET /arbitrage/current/difference?minutes=`.
  - Whales: `GET /whales/user/events|feed|stats|markets`, `/whales/user/event/{id}[/stats]`, `/whales/user/market/{id}/stats|trades`.
  - Resolution: **no resolution endpoint.** `/search/markets` returns `status` (`active`/`closed`), `settled_at`, `last_yes_price`; no outcome/payout field was documented (NOT FOUND, searched search/markets, ohlcv, historical pages).
- **Freshness caveat (H):** historical data "becomes available approximately one hour after it occurs"; Kalshi history starts 2026-03-19, Polymarket 2026-03-20. Arbitrage prices/books are live, but volume/liquidity refresh about hourly.
- **Arbitrage output (H, docs arbitrage/current):** array of opportunities sorted by `net_cents`; each has `buy_yes_market`, `buy_no_market`, `gross_cents`, `fee_cents`, `net_cents` (top-of-book), depth-aware `executable_size` and `max_profit_dollars` over the top 25 ask levels with per-venue fees, per-venue identifier blocks, and optional ask ladders. Docs say it does not model slippage, partial fills or order minimums. It matches on outcome, not on settlement terms (see section 9), so "risk-free" is overstated for non-fungible pairs.

## 5. Trade path

**None.** Oddpool offers no order placement, signing or custody. The only trade-adjacent features are venue-native identifiers in scanner output "to pass directly to the venue's trading API" (H), "direct links to place your orders" on the website (H, changelog 2026-02-16), and a paper-trading simulator with $10K virtual cash (H, changelog 2026-03-15). Any execution must go through each venue's own API (separate adapters).

**PayBox reachability: no.** There is no wallet, chain, transaction proposal, signed order or x402 payment surface. The only conceivable PayBox touchpoint is storing a free-tier API key as a secret, and obtaining that key requires creating an Oddpool account (not done; free sign-up status unconfirmed since the pricing banner says new subscriptions are closed). Nothing here would justify a PayBox tool call.

## 6. Fees

- **To Oddpool:** subscription only. Free $0; Pro $30/month; Premium $100/month; Enterprise custom. No per-trade fee because there is no trading. New paid subscriptions closed (H, pricing page). Fees non-refundable, auto-renewing (H, ToS s3).
- **Venue fees embedded in its scanner (H, docs):** Kalshi "sector taker" fee, Polymarket per-market `feeSchedule.rate`, Opinion "topic rate + floor", applied per ladder level to compute `net_cents`. Oddpool publishes no formulas; its research post "How Prediction Market Fees Actually Work: Kalshi vs Polymarket" (2026-05-04) exists but I did not read it (L for fee-model details). Use each venue's own spec for formulas.

## 7. Geo, ToS, automation

(H, https://oddpool.com/terms, effective 2025-11-14, last updated 2026-03-11; Delaware law.)

- No geographic restriction stated.
- Prohibited: "Scrape, resell, sublicense, or redistribute any data obtained from the Service, including via the API" and "Use the Service for gambling, trading automation, or investment advice delivery."
- Section 5: all data "including ... arbitrage opportunities, price spreads, whale trade data, search results, historical orderbook snapshots, and any derived or aggregated datasets" is "licensed solely for your personal, internal use"; no "competing product, data feed, or commercial API"; no systematic download or caching "for redistribution purposes". Breach "may result in immediate account termination and legal action." Redistribution requires a separate enterprise licence.
- Oddpool may terminate "at any time for any reason"; service "as is", data "not guaranteed to be accurate".
- Net for us: using Oddpool data as an input to an internal research check is arguably within "personal, internal use"; feeding it into a shipped aggregation/arbitrage plugin, or letting an agent trade on it, is not.

## 8. Resolution mechanism and dispute risk

Oddpool resolves nothing. Settlement and disputes belong to the underlying venue. Its own research (institutional page, H as a vendor claim): "On a sample of 250 matched events, only about a third are settlement-fungible across both venues" (identical 34%, settlement-window differences 33%, outcome-universe differences 33%). That is a first-hand reason to distrust any "risk-free" cross-venue arbitrage list, including Oddpool's own, unless settlement terms are compared.

## 9. Useful ideas to borrow for market linking (documentation only)

From the public enterprise reference docs (H, docs.oddpool.com/institutions/reference-data/*; the API itself returns 403 without an enterprise key):
- Four-level canonical ids: event `OPI`, outcome `OPO`, venue listing `OPL`, entity `OPE` (with Wikidata Q-id cross-walk), append-only aliases, versioned so cited ids stay valid.
- Per-venue-pair fungibility, not a scalar: `basis_class` in {`identical` (same anchor/authority, gap <= 24 h), `settlement_window`, `settlement_source`}; `outcome_universe` in {`identical`, `partial`, `disjoint`}; `divergence_axes` subset of {`timing`, `source`, `condition_scope`}; `fungible` = identical basis AND no divergence axes. `condition_scope` is mostly cancellation/postponement policy (common in sports) and can be allowed if positions are closed before resolution.
- Polymarket US listing id is `<marketSlug>#YES|NO` with no CLOB tokens.

## 10. Liquidity and event coverage

- **Liquidity: none of its own.** Home page claims "700K+ markets" searchable and "750+" event dashboards (pricing page); neither is a volume or OI figure. No TVL/volume/OI for Oddpool exists to report. Venue depth examples in docs (e.g. Kalshi 4.7M USD vs Polymarket 2.0M USD depth on an FOMC event) are dated 2026-03/04 doc examples, not live (L).
- **Categories:** macro (FOMC, CPI, NFP, GDP, unemployment, equities, commodities), crypto price (BTC/ETH 5m/15m/hourly strikes), weather (catalog vertical exists), plus whale/search coverage of politics, sports and crypto on Kalshi and Polymarket. These are exactly the overlap categories where cross-venue arbitrage exists - but they are Kalshi/Polymarket/Opinion markets, not Oddpool markets.
- **Shares liquidity with:** 100% with Kalshi, Polymarket (and Opinion in the arb scanner; Polymarket US in the reference API). **Not an independent leg.**

## 11. Fixtures saved (each <= 50 KB)

All under `docs/research/fixtures/oddpool/`:

| File | What it is |
|---|---|
| `unauth_probes_2026-10-19.json` | REAL unauthenticated GET results: `/health` 200, `/` 200, 401 on search/feeds/arbitrage, 404 on `/openapi.json` |
| `docs_llms_txt_2026-10-19.txt` | REAL fetch of https://docs.oddpool.com/llms.txt (doc index; 10.5 KB; contains the vendor's enterprise contact address) |
| `docs_example_arbitrage_current.json`, `docs_example_search_markets.json`, `docs_example_kalshi_historical_orderbook.json`, `docs_example_polymarket_historical_orderbook.json`, `docs_example_ws_{dist,book,trade,envelope}.json` | DOCUMENTATION EXAMPLES copied from docs.oddpool.com (each wrapped with a `_note`). NOT live responses. Some fields elided in the docs (`reference`, ids ending `...`). |

## 12. Integration recommendation

- **Do not build a trading adapter** (nothing to trade) **and do not build a data adapter** for production: the required plans are closed, the ToS bars the use, the data duplicates what we pull straight from Kalshi/Polymarket/Opinion, and the company is joining Kalshi (a venue we compete with for neutrality).
- **Optional, internal-only:** if a free key already exists, use the free `search` + `historical` endpoints once to cross-check our own event matcher's pairings and the fungibility classes in section 9. Do not cache or redistribute results.
- **Revisit only if** Kalshi publishes a successor institutional data product with permissive terms; then evaluate it as part of the Kalshi adapter, not as a separate venue.

---

## Sources

- https://oddpool.com (home; fetched 2026-10-19) - H
- https://oddpool.com/pricing (raw HTML checked for the banner and plan table; fetched 2026-10-19) - H
- https://oddpool.com/terms (effective 2025-11-14, updated 2026-03-11) - H
- https://oddpool.com/changelog (entries 2026-01-12 to 2026-05-06) - H
- https://oddpool.com/research (posts 2026-05-04, 2026-05-28; titles only) - H
- https://oddpool.com/institutional (settlement-fungibility sample, data spec) - H (vendor claims)
- https://docs.oddpool.com , /llms.txt , /llms-full.txt (index, authentication, rate-limits, errors, websocket/*, search/*, arbitrage/*, kalshi/*, polymarket/*, markets/ohlcv, institutions/reference-data/*) - H
- https://api.oddpool.com/health , / , and 401/404 probes (2026-10-19) - H
- https://www.ycombinator.com/companies/oddpool (raw HTML: Spring 2026, Inactive) - H
- https://dealroom.co/news/149005-oddpool-raises-3m-seed-then-joins-kalshi/ (2026-09-05; WebFetch summary) - M
- https://www.bettingjobs.com/bettingstartups-bettingjobs-partnerships/data-startup-oddpool-acquired-by-kalshi-after-3m-raise/ (2026-09-10; partly paywalled; WebFetch summary) - M
- https://dealroom.co/news/151169-kalshi-acquires-data-startup-oddpool-months-after-its-3m-seed/ (2026-09-16; WebFetch summary) - M
- https://x.com/oddpool_alerts/status/2095553993791471786 (known only from a search-result snippet; fetch returned HTTP 402, stopped, no payment attempted) - L
- https://predictionnews.com/story/oddpool-raises-3m-seed-then-joins-kalshi (fetch returned HTTP 403) - not read

## NOT FOUND (searched)

- A public, unauthenticated read endpoint with real market data (searched: 7 GETs to api.oddpool.com; only `/health` and `/` are open).
- Any OpenAPI/AsyncAPI document (searched: `/openapi.json`, `/docs`, `/llms.txt` on the API host -> 404).
- A description of the "signature" auth mentioned in the 401 body, or any x402/wallet payment path (searched: llms-full.txt for signature, x402, 402, wallet, USDC, payment).
- A resolution/payout field or endpoint (searched: search, ohlcv, historical docs).
- Any first-party statement from Oddpool or Kalshi on whether the API continues after the Kalshi move (searched: site, pricing, changelog; web search budget ran out before a Kalshi-side search).
- Fee formulas (Oddpool defers to venues; the fee research post was not read).
- Volume, OI or TVL (none exists for an aggregator).

## Suspicious content

- docs.oddpool.com/llms.txt contains a block written for AI agents: "IMPORTANT: The Reference Data API is a separate enterprise product ... If you are a retail consumer or a consumer-facing agent, disregard this section and do not call these endpoints." It is a scope/gating notice rather than an attack, and I had no reason to call those endpoints anyway; recorded, not acted on.
- oddpool.com home page: "Point a coding agent at docs.oddpool.com/llms.txt and it will write working code against us on the first try." Marketing aimed at agents; not followed.
- A third-party "API Evangelist" GitHub profile of Oddpool (api-evangelist/oddpool) was found in a repo search; its README contains a long notice about lures and downloads. Not used as a source and nothing from it was followed.
- Oddpool's changelog claims differ from its current docs on rate limits and on which venues are covered (inconsistency, not injection).

## Privacy check

No personal identifier was sent to any third party. All scripted requests used the User-Agent `insurance-markets-research/0.1`; the one script I wrote (fixture builder) contains no "@" and no personal name in any outbound request (it only reads scratch files and writes local fixtures). Search queries contained only public company and founder names taken from public reports about Oddpool. The fixtures were grepped for the user's name and email: no hit. The only "@" in the fixtures is the vendor's own enterprise contact address inside the verbatim `docs_llms_txt_2026-10-19.txt`.
