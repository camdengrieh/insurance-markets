# Adjacent (adjacent.markets, formerly adj.news) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official docs read, 20-odd unauthenticated GETs to `api.adjacent.markets`, `oracle.testnet.adjacent.markets` and `mcp.adjacent.markets` (generic User-Agent `insurance-markets-research/0.1`), GitHub reads via `gh api`. No account, no API key, no wallet, no signing, no POST/PUT/DELETE, no money-moving PayBox tool (only read-only `discover_services` / `discover_plugins`). Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Limitation: the shared WebSearch budget ran out partway through, so company-background items (funding, founder) rest on one earlier search plus one repost page and are tagged M or L.

---

## 0. Bottom line

1. **Adjacent is not a venue.** It is an indexing/benchmarking company that republishes Kalshi, Polymarket, Polymarket US and Gemini market data in one schema, plus indices, "reference rates", news and CFTC filings. No order book, no collateral, no settlement, no trading, no liquidity of its own. It cannot be an arbitrage leg; every price it shows is a copy of a price on a venue we can read directly. (H)
2. **Live and actively maintained.** API `GET /health` returned `{"status":"ok","version":"v2.32.0"}` on 2026-10-19; docs changelog has entries on 2026-10-15, 10-13, 10-08, 10-06, 10-01 (H).
3. **The free tier is useless for execution-grade edge.** Public data is 15-minute delayed, prices are last-trade `probability`, and only Kalshi detail rows carried bid/ask in my samples. Realtime needs Pro ($50/mo) or Premium ($250/mo), and "Neither plan permits redistribution or use in a financial product." Our plugin plausibly counts as a financial product. (H)
4. **Two things are mildly interesting as research inputs, not as an adapter:** (a) a free, curated set of 256 multi-venue "reference rates" that group the same NFL contract across Gemini, Polymarket and Polymarket US (a ready-made labelled set for testing our matcher); (b) its embedding-based `/related` endpoint, which shows what a naive similarity matcher gets wrong (section 4.4).
5. **adapter_priority = skip** (data aggregator, duplicate liquidity, 15-minute delay on the free tier, licence bars financial-product use). Prior conclusion in `docs/research/10-aggregation-landscape.md` section 1.5 ("skip for the plugin; fine for human research") is confirmed and sharpened here.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://adj.news` | HTTP 301 to `https://adjacent.markets/` | H |
| `https://docs.adj.news`, `https://api.adj.news` | do not resolve (curl exit 6). Old docs host is gone; current docs are `docs.adjacent.markets` | H |
| `GET https://api.adjacent.markets/health` | 200 `{"status":"ok","version":"v2.32.0"}` | H |
| `GET /api/v1/public/meta` | `snapshot_at 2026-10-19T02:44:19Z`, `refreshed_at 02:59:19Z`, all four tiers `mode: delayed, delay_seconds: 900` | H |
| Docs changelog (docs.adjacent.markets/changelog.md) | newest entries October 15, 13, 8, 6, 1 and September 30, 29, 24, 23, 17, 15, 10, 8, 4, 3 2026: roughly two releases a week | H |
| Homepage (WebFetch summary) | "147 prediction-market indices", news item dated 2026-10-18, snapshot values dated 2026-10-19 | M |
| GitHub org `adjacentresearchxyz` | created 2022-08-06; `adjacent-plugin` pushed 2026-10-12; `gloomberb` pushed 2026-10-15 | H |
| Funding | Foresight News repost on Bitget dated 2026-06-30: "$2.5M pre-seed", investors Night Capital, VanEck, UFO Holdings, Maven 11, DCG; the same page says the amount "has not been disclosed" (internal inconsistency), no primary source | M |
| Founder | Quicknode builder-guide listing names Lucas Kohorst; launched 2024 | M |

**still_live = true.** The company is funded (M) and shipping. Names: the brand moved from "Adjacent News / adj.news" to "Adjacent / adjacent.markets"; GitHub org is "Adjacent Research".

Stale venue claim: a Quicknode listing and the earlier hint say the venue set is Kalshi, Polymarket, Manifold, Metaculus (">40,000 markets", base `v2.api.adj.news`). That is the 2024-25 product (L). The current API reports `market_platforms: ["kalshi","polymarket","polymarket-us","gemini"]` (H, `/public/meta`). No Manifold or Metaculus. Docs inconsistency: `docs.adjacent.markets/index.md` still says "Kalshi and Polymarket" while `explore/market-data.md` and the API say four venues (H).

---

## 2. Kind and market model

- **kind: aggregator-or-data** (indexing and benchmarking provider; "calculating agent" for its own indices). Products: markets/events catalog with history, 147 indices (political 50-150 scale, NFL/NBA team indices, implied-level macro indices), cross-venue reference rates, news, CFTC filings, governance announcements, a SEDA oracle proxy, an MCP server, agent plugins. (H, docs.adjacent.markets/llms.txt, explore/*)
- **Market model: none of its own.** It republishes venue models in one schema: `market_type` (`binary` seen), prices on a **0-100 scale**, `yes_bid/yes_ask/no_bid/no_ask` (Kalshi only in my public samples), `status` enum `unknown|pending|active|closed|resolved|expired`. Categories (normalised across venues): Politics, Elections, World, Economics, Financials, Companies, Crypto, Sports, Science and Technology, Entertainment, Social, Health, Climate and Weather, Transportation, Other. (H, `/public/meta`, fixtures)
- **Tokenisation:** not applicable. Adjacent exposes venue ids with a prefix: `kalshi:<ticker>`, `polymarket:<0x conditionId>`, `polymarket-us:<slug>`, `gemini:GEMI-<event>-<contract>`. These are the native venue identifiers, usable on each venue's own API. (H, fixtures)
- **Units are venue-native and labelled:** `volume_unit` / `volume_24h_unit` / `open_interest_unit` in `contracts | shares | usd | mixed` (Kalshi contracts, Polymarket shares, Gemini contracts, Polymarket OI in USD, Polymarket US OI in shares). A good pattern to copy. (H, schema + samples)
- **Polymarket candles are synthetic books:** candle rows carry `source` (`kalshi_candlestick`, `polymarket_clob_history`, `polymarket_us_price_history`) and `synthetic_book: true|false`. Adjacent therefore probably does not hold true historical depth for Polymarket (M, my inference from the docs example of `/markets/{id}/candles`; I did not call the authenticated endpoint).

---

## 3. Chains and collateral

None. Adjacent holds no funds and no positions. The only on-chain surface is the **SEDA oracle proxy**: testnet `oracle.testnet.adjacent.markets` (ungated, 15-minute delayed index data; `/status/health` 200), mainnet `oracle.api.adjacent.markets` ("Not generally available", needs SEDA proof verification). It serves index/rate data, not a trading venue. (H, docs explore/oracles.md; live health GET)

Quicknode's listing mentions "Avalanche and Polygon PoS" as supported chains (L, third-party listing, no corroboration in Adjacent's own docs).

---

## 4. Read API

### 4.1 Summary (exists = official-public, with an authenticated realtime tier)

| Item | Value | Tag |
|---|---|---|
| Docs | https://docs.adjacent.markets (`/llms.txt`, page index of ~110 endpoints, `.md` for every page) | H |
| Anonymous base | `https://api.adjacent.markets/api/v1/public` - no token, CORS-open, 15-minute delayed | H |
| Authenticated base | `https://api.adjacent.markets/api/v1` - `Authorization: Bearer ak_...` or `?api_key=`; keys are created in the web app (Settings > API keys), scoped per resource | H |
| MCP | `https://mcp.adjacent.markets/mcp` (Streamable HTTP; tools `list`, `find`, `get`, `price`); append `?apiKey=` for realtime. Plain GET returned 406 (expects an event-stream client); I did not POST. | H |
| WebSocket | **None.** Pricing page: "WebSockets, the index builder, and ratings data are not included in these v1 plans." No WS endpoint documented. | H |
| Rate limits, free | 400 requests / 10 s burst and 480 / 60 s sustained per IP at the edge; 429 with `Retry-After`; public tier also shares one concurrency pool and can 429 under load | H |
| Rate limits, paid | Pro 30 req/min and 20,000/day; Premium 180 req/min and 150,000/day; organization-wide; 4 concurrent requests per org; daily reset 00:00 UTC; `RateLimit-*` headers | H |
| History depth, free | Hourly for previous 30 days or daily for previous 90 days; finer or deeper is paid | H |
| Reliability seen | 1 of ~25 calls returned `503 service_unavailable: "The request exceeded the database time budget. Retry in a few seconds."` (10.4 s); filtered list calls took 5-10 s. Changelog also documents 503 "catalog is rebuilding". | H |

### 4.2 Key endpoints

Anonymous (`/api/v1/public/...`):
- `GET /markets` - list; params `scope` (default `constituents`; use `all`), `search`, `sort` (`volume|ticker|price|open_interest|expiration`), `status` (default active only), `category`, `venue`/`platform` (CSV), `volume_min`, `oi_min`, `expires_before/after`, `page`, `per_page` (max 500). Totals cap at 10,000 (`total_capped: true`).
- `GET /markets/{id}` - detail: `question`, `description`, `probability`, volume/OI with units, `event_ticker`, `open_time`, `end_date`, `expiration_date`, `rules_primary`, `rules_secondary`, `yes_sub_title`, `settlement.sources` (Kalshi), `stats` (trailing returns, volatility).
- `GET /markets/{id}/prices?interval=1hour|1d` - bucketed price series.
- `GET /markets/{id}/related` - up to 3 similar markets (`similarity` 0..1, `platform`, `question`, `latest_price`).
- `GET /markets/{id}/indices`, `/news`, `/filings`; `GET /events`; `GET /rates`, `/rates/{id}`, `/rates/{id}/prices`; `GET /indices`, `/indices/{id}` (+ `constituents`, `prices`, `correlation`, `daily-values`, `membership-events`); `GET /announcements`; `GET /filings`; `GET /nfl-games`; `GET /meta`; `GET /plans`.

Authenticated only (confirmed: unauthenticated GET returns `401 {"error":"Missing or invalid Authorization header"}`): `/markets` (full catalog, realtime), `/markets/{id}/trades`, `/quotes` (raw top-of-book `yes_bid`, `yes_ask`, `mid` snapshots), `/candles` (OHLC with bid/ask), `/similar`, `/news`, `/export/*` (CSV/TSV), `/usage`, API-key management.

**No order-book depth endpoint exists.** NOT FOUND (searched: full llms.txt endpoint index, ~110 pages; only top-of-book quotes and trades). So Adjacent cannot supply size-aware executable edge even on the paid tier.

### 4.3 Observed response shapes (fixtures)

- `public_markets_list_scope-all_per3.json`: list rows. Polymarket row has `probability` (last traded price), `volume` in shares, `open_interest_unit: "usd"` but **no `open_interest` value**.
- `public_market_detail_kalshi_KXPRESPARTY-2028-R.json`: `probability 40.0`, **`yes_bid 40, yes_ask 41, no_bid 59, no_ask 60`**, OI 160,574.83 contracts, `rules_primary`, `settlement.sources`.
- `public_market_detail_gemini_CTRLUSHOU-GOP.json` and `..._polymarket_republicans-2028.json`: **no bid/ask fields at all**, only last-trade `probability`; Gemini has no `open_interest` either. So on the free tier only Kalshi gives a quote; the others give a last print up to 15 minutes old plus whatever the venue traded last. (H, 3 samples; Polymarket US detail not sampled.)
- `public_market_prices_kalshi_1hour_per3.json`: `{timestamp, price}` rows.
- `public_meta_2026-10-19.json`: venues, statuses, categories, freshness.

### 4.4 `/related` is similarity, not equivalence

For `kalshi:KXPRESPARTY-2028-R` ("Will Republican win the Presidency in 2028?") the three results were: Kalshi 2028-**D** (the opposite party) similarity 0.879; Kalshi 2032-R (different year) 0.876; Polymarket "Will the Republicans win the 2028 US Presidential Election?" (the true same-contract match) only **0.732**. The true match ranks last. A threshold-on-similarity matcher would link the wrong contracts first; any use needs rule-text verification. (H, fixture `public_market_related_kalshi_KXPRESPARTY-2028-R.json`; consistent with `docs/research/16-linking-methods-services.md` row for Adjacent.)

### 4.5 Reference rates: the one curated cross-venue artifact

`GET /public/rates` lists **1,523 rates** (2026-10-19). I paged all four pages. Breakdown by methodology and source venues (derived fixture `derived_rates_cross_venue_coverage_2026-10-19.json`):

| Methodology | Venues in sources | Count |
|---|---|---|
| event_contract_claim | kalshi only | 909 |
| event_contract_claim | gemini only | 352 |
| event_contract_claim | gemini + polymarket + polymarket-us | 245 |
| event_contract_claim | gemini + polymarket | 11 |
| simple_average | kalshi only (Adjacent RED/BLUE roll chains) | 6 |

So **256 rates are genuinely multi-venue, and all are NFL team contracts** (id prefix `nti_mv_`: conference, division, win totals). Kalshi never appears in a multi-venue rate. Other categories (politics, crypto, macro) have no cross-venue grouping at all. 223 of the 256 report a non-zero `spread`; the maximum is 47.5 points.

That 47.5-point "spread" (`nti_mv_min_wins_27_9`, fixture) is a **stale-print artifact, not an arbitrage**: Polymarket US last price 97.5 on 89,052 volume vs Polymarket global last price 50.0 on 129 shares of volume, with the Gemini source having zero volume and no price. The rate weights these 0.9986 / 0.0014 / 0. Lesson for our scanner: a spread computed from last prints is not executable; we need bid/ask and depth, which Adjacent does not provide. (H, fixture; interpretation M)

Rate formula (H, docs explore/reference-rates.md): `volume_weighted_average = sum(price_i * weight_i * count_i) / sum(weight_i * count_i)`; claim-price and NTI sleeve rates use volume alone; other methods `simple_average`, `median`.

---

## 5. Trade path

**None.** Adjacent has no order placement, no trading API, no custody, no signing. NOT FOUND (searched: llms.txt endpoint index for any order/trade-placement route, docs pages market-data, indices, rates, MCP, oracles, pricing; Quicknode listing "Trade API" refers to historical executions, `GET /markets/{id}/trades`, not order entry).

The only trading-adjacent code is the open-source `adjacent-plugin` repo (GitHub `adjacentresearchxyz/adjacent-plugin`, no licence, pushed 2026-10-12): its `trading-rebalance-index` command computes index drift via the Adjacent MCP and then "posts orders to the configured exchange" (Kalshi) with the **user's own Kalshi credentials** through a local script. That is a client of Kalshi's API, not an Adjacent trade path. Not executed, only read. (H for the command text; script not read)

---

## 6. PayBox reachability

**paybox_reachable = no.** There is nothing to trade, so no EVM transaction proposal or signed order applies. Paying for a plan: the docs say plans are managed in the web app under Settings > Billing and usage; payment method not documented (NOT FOUND: no x402 / crypto-payment mention anywhere in the docs). PayBox `discover_plugins` ("adjacent prediction market") returned no plugin, and `discover_services` ("adjacent prediction market data", first page) returned unrelated third-party x402 sellers, none of them Adjacent (H, 2026-10-19; later pages not read).

---

## 7. Fees

- Trading fees: none (no trading).
- Data plans (H, docs pricing.md and `GET /public/plans`): Free $0 (public, 15-minute delayed); Pro $50/month (5 seats, realtime, 30 rpm, 20k/day); Premium $250/month (10 seats, 180 rpm, 150k/day). Paid by the subscriber. Custom use cases are by contact.

---

## 8. Resolution mechanism and dispute risk

Adjacent resolves nothing. It mirrors each venue's lifecycle (`status`: pending, active, closed, resolved, expired, unknown) and venue rule text (`rules_primary`, Kalshi `settlement.sources` and `terms_url`, Gemini and Polymarket `description`). Dispute risk is the underlying venue's. Note `rules_primary` was an empty string for the Polymarket sample (rule text only in `description` on `/related`), and Gemini's `description` included a PDF terms link. For index products Adjacent publishes governance policies (corrections/restatements, index governance, methodology change, termination, information barrier) listed in the site llms.txt (H that they are listed; not read). (H)

---

## 9. Geo / ToS / automation

- **Licence limits (H):** "Neither plan permits redistribution or use in a financial product." (docs.adjacent.markets/pricing.md, Pro and Premium). Site definition: a reference rate "is for comparison across venues, not for trading." Oddpool, pmxt and Predictefy have comparable limits (doc 14).
- **Terms of service: NOT FOUND.** `https://adjacent.markets/terms` is a client-rendered SPA route with no static text and no markdown representation (`?format=md` returns a stub). Searched: `/terms`, `/legal`, `/privacy`, `/disclosures`, `/methodology`, `/about` (all stubs via `?format=md`), WebFetch of `/terms`, sitemap. Whether the free public tier allows commercial or automated use is therefore unknown.
- **Automation is invited** (H): public tier is "CORS-open", there is an MCP server, an agent-skills index and a multi-host plugin repo. Over-limit behavior is documented (429 + `Retry-After`).
- **Geo:** none documented for the data API (no trading, so no venue geoblock). NOT FOUND for any restricted-jurisdiction list.
- **Attribution/redistribution of free data:** not documented (NOT FOUND).

---

## 10. Liquidity

No liquidity of its own. Catalog size is the only measurable: every venue filter (`kalshi`, `polymarket`, `polymarket-us`, `gemini`) with `status=active&scope=all` returned `total = 10000, total_capped = true` on 2026-10-19, so each venue has at least 10,000 catalog rows (H). Some category-narrowed counts were below the cap: Kalshi Crypto 132 and Economics 5,597; Polymarket Crypto 689, Economics 325, Financials 2,733; Gemini Politics 646 and Economics 103 (H, live counts; they move). Underlying venue examples on that date: Kalshi `KXNBA-26-SAS` OI 21.1M contracts, 24h volume 1.09M contracts; Gemini House-control GOP 542k contracts lifetime volume (H, fixtures; these are venue numbers, not Adjacent's). The Quicknode ">40,000 markets" figure is old (L).

---

## 11. Event categories and overlap

Adjacent is only useful where it already links venues, which is narrow:
- **Sports (NFL team futures):** the only curated cross-venue groups (256 rates across Gemini, Polymarket, Polymarket US). Genuine overlap exists, but last-print spreads there are unreliable (section 4.5).
- **Politics / elections:** four venues list US midterm and 2028 contracts, but Adjacent links them only through the `/related` similarity (section 4.4) and through its own Kalshi-only RED/BLUE indices.
- **Crypto price, macro (CPI, rates):** Kalshi-only rate chains and indices (`cpi-2026-11-*`, implied-level "misery" index). No cross-venue grouping.
- Venue-coverage note for the orchestrator: Adjacent surfaces **Gemini** (`gemini:GEMI-...`) and **Polymarket US** as first-class venues. Gemini has its own spec in `docs/research/venues/gemini-predictions.md` (parallel work).

---

## 12. Shared liquidity

Adjacent shares nothing and owns nothing: it mirrors Kalshi, Polymarket, Polymarket US and Gemini. It is **not an independent leg**. Whether Polymarket global and Polymarket US share liquidity is out of scope here (Polymarket workflow).

---

## 13. Adapter priority

**skip.** Reasons: not a venue, duplicate prices, 15-minute delay and last-trade-only quotes on the free tier, no depth endpoint on any tier, no WebSocket, licence bars financial-product use, ToS unreadable. If a future decision needs a human-research or discovery signal, the free MCP/REST is fine to browse (that would be P2 at best, outside the plugin's runtime path).

Ideas worth borrowing without depending on the service:
1. Namespaced ids (`<platform>:<native id>`) and explicit `*_unit` fields beside every quantity.
2. A `synthetic_book` flag when depth is reconstructed rather than observed.
3. Reference-rate formulas (volume-weighted claim price, weights as a share of in-print volume) and the "quiet source drops out after 7 days" rule.
4. The 256 NFL multi-venue groups as a free labelled test set for our matcher (read at test time only; storage/redistribution rights unknown).

---

## 14. Fixtures

All under `docs/research/fixtures/adjacent/`, each under 4 KB, all unauthenticated public responses captured 2026-10-19 except the two files marked derived:
`public_meta_2026-10-19.json`, `public_markets_list_scope-all_per3.json`, `public_markets_list_gemini_per2.json`, `public_markets_list_polymarket-us_per2.json`, `public_market_detail_kalshi_KXPRESPARTY-2028-R.json`, `public_market_detail_gemini_CTRLUSHOU-GOP.json`, `public_market_detail_polymarket_republicans-2028.json`, `public_market_prices_kalshi_1hour_per3.json`, `public_market_related_kalshi_KXPRESPARTY-2028-R.json`, `public_rates_list_per3_sort-sources.json`, `public_rate_cross_venue_example_nti_mv_min_wins_27_9.json`, `public_plans.json`, `derived_rates_cross_venue_coverage_2026-10-19.json` (derived by me from 1,523 rates), `probes_health_auth_errors_2026-10-19.json` (hand-assembled summary of health, 401, 406 and 503 probes).

---

## 15. Suspicious / agent-directed content (treated as data, not followed)

- Every docs.adjacent.markets page starts with a banner telling agents to use `/llms.txt`, `/llms-full.txt` and to "Download /docs.zip to grep all markdown files locally"; `llms.txt` has a "Best way to inspect these docs" section with a `curl -L .../docs.zip` / `unzip` recipe. I did not download the zip; I fetched individual `.md` pages (read-only text) instead.
- `adjacent.markets/llms.txt` says the MCP docs are the "single source of truth; do not invent tool contracts from elsewhere". Not acted on.
- `adjacent-plugin` contains agent hooks and skills (pre/post tool-use hooks, "secret-redactor"); not executed, only listed.
- Docs contain a support mailto address (not reproduced here).

---

## 16. Not found / open questions

- NOT FOUND: Terms of service text (SPA, no static rendering). Open: does the free public tier permit automated or commercial use?
- NOT FOUND: any order-entry/trade API; any WebSocket; any depth endpoint; any crypto or x402 payment path for plans; any restricted-jurisdiction list.
- Not checked: authenticated endpoints (needs a paid key); the SEDA mainnet proxy; MCP tool listing (needs POST); Polymarket US detail bid/ask; how often the multi-venue NFL groups expand beyond NFL.
- Not confirmed: funding amount (conflicting in one repost) and whether "Adjacent Indices" in the funding news is the same entity as adj.news (the company's own site calls itself an "indexing and benchmarking company", which matches).

---

## Sources

H = first-hand this session.
- https://adjacent.markets/ (homepage, WebFetch summary, M for numbers) and https://adjacent.markets/llms.txt (H)
- https://docs.adjacent.markets/llms.txt, /index.md, /explore/market-data.md, /explore/reference-rates.md, /explore/indices.md, /explore/oracles.md, /explore/mcp.md, /pricing.md, /rate-limits.md, /changelog.md, /api/get-api-v1-public-markets.md, /api/get-api-v1-public-markets-id.md, /api/get-api-v1-markets-id-quotes.md, /api/get-api-v1-markets-id-trades.md, /api/get-api-v1-markets-id-candles.md (H)
- Live GETs 2026-10-19: https://api.adjacent.markets/health, /api/v1/public/meta, /public/markets, /public/markets/{id}, /public/markets/{id}/prices, /public/markets/{id}/related, /public/rates, /public/plans, https://oracle.testnet.adjacent.markets/status/health, https://mcp.adjacent.markets/mcp (H)
- https://adjacent.markets/sitemap.xml, /.well-known/api-catalog, /.well-known/agent-skills/index.json (H)
- GitHub: https://github.com/adjacentresearchxyz (org metadata and repo list via `gh api`), `adjacent-plugin` README, tree and `trading-rebalance-index` command text (H)
- Quicknode builder-guide listing https://www.quicknode.com/builders-guide/tools/adjacent-news-by-adjacent-news (WebFetch summary, M/L, dated 2024-25 product)
- Bitget repost of Foresight News funding item https://www.bitget.com/news/detail/12560605482810 (M); cryptorank copy returned 403 (not read)
- Earlier search result snippets (founder, Manifund "bootstrapped") (L)
- Prior repo notes: `docs/research/10-aggregation-landscape.md` section 1.5, `docs/research/16-linking-methods-services.md`, `docs/research/venues/oddpool.md`, `docs/research/venues/gemini-predictions.md`
