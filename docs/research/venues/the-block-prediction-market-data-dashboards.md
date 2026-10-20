# The Block prediction-market data dashboards - spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. One GET of the public dashboard page and one of `theblock.pro` with the generic User-Agent `insurance-markets-research/0.1`; the Terms page was read through the WebFetch tool (a direct curl got HTTP 403). No account, login, key, wallet, signature, POST/PUT/DELETE, browser automation or PayBox tool. I did NOT request `theblock.co/api/*` (disallowed by robots.txt) or any `data.tbstat.com` / `data-private.tbstat.com` chart-JSON URL (see section 6). Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, a small-model page summary, or my inference from first-hand data; **L** = weak or stale. Web search budget ran out mid-task, so some follow-ups are NOT FOUND (section 12).

---

## 0. Bottom line

1. **This is a media company's chart page, not a venue.** It has no markets, no order flow, no resolution and nothing to trade. It republishes volume, open interest, fee and trader-count series for other venues. (H)
2. **Live and freshly updated.** The page returned HTTP 200 on 2026-10-19; its schema.org Dataset says `dateModified` 2026-10-17 and latest points are dated 2026-10-16/17 (H).
3. **No official public API.** The only machine-readable thing on the public page is a schema.org `DataFeed` JSON-LD block with the single latest point per chart (41 items) (H). Full series sit in chart-JSON files on `data.tbstat.com` (22 charts, public CDN) or a private S3 bucket (24 charts); both are undocumented (H for the URL classes, which come from the page payload). The Block Pro advertises "API access available" for news, data and funding, sales-gated, no price published (H, theblock.pro).
4. **The Terms forbid exactly what an aggregator would do with it.** Effective 2026-04-08, the Terms prohibit "systematic or automated data collection" including scraping/extraction, and prohibit processing the Content with AI/ML "including to summarize, reword, or paraphrase" (H via WebFetch quotes, section 8). Do not wire this site into the pipeline, and note that reading it with an AI tool for this very report sits inside that clause. Use it as a one-off human reference, with attribution.
5. **The numbers do not reconcile with primary sources, so they are a sanity check, not a truth source.** The same week shows Kalshi at 13.01B on one chart and 10.11B on another; Rothera "USD" volume equals contracts at $1 face value, not dollars paid; HIP-4 volume is about 2.8x DefiLlama's (section 7).
6. **adapter_priority = skip.** Value to the project is (a) a cross-venue weighting prior for which venues deserve adapters (section 5), and (b) three leads. All of that is captured here once. Pull live numbers from each venue's own API/files or from DefiLlama instead.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.theblock.co/data/decentralized-finance/prediction-markets` on 2026-10-19 | HTTP 200, 853 KB HTML, title "Prediction Market Data: Polymarket & Kalshi \| The Block" | H |
| schema.org Dataset/DataFeed in the page | `dateModified` 2026-10-17T00:00:00Z; `isAccessibleForFree: true`; `license` = https://www.theblock.co/terms-service; creator and provider = The Block | H |
| Latest points per chart | Daily series end 2026-10-16 or 2026-10-17; weekly series end week of 2026-10-12; monthly series are 2026-10-01 (month to date, M) | H |
| Chart records in the page payload | 46 chart records (41 have a latest-point item in the JSON-LD). Chart-config "last updated" stamps range 2024-07-19 to 2026-10-13 | H |
| Hint cross-check | Venues named in the weekly chart: kalshi, polymarket (merged), nadex, rothera, predict, opinion, hip4, forecastex, limitless. Robinhood appears as a contracts-traded chart. Venture-funding chart present. Hint confirmed | H |

---

## 2. What it is (kind and model)

- **kind:** aggregator-or-data (editorial dashboards). Operator: The Block (crypto media + data; paid tier "The Block Pro" at theblock.pro). (H)
- **Market model / tokenisation / chain / collateral:** not applicable. It does not issue or list contracts. The venues it covers span CLOBs on Polygon (Polymarket international, pUSD collateral, M), CFTC DCMs in USD (Kalshi, Polymarket US, Rothera, Nadex/CDNA, ForecastEx) and on-chain venues (Hyperliquid HIP-4, Opinion, Predict, Limitless).
- **Dashboard inventory** (46 chart records, grouped; fixture `chart_catalog_metadata.json`):
  - Polymarket: active traders (monthly), new markets (monthly), daily USD volume per category (+ share), sports sub-category volume, crypto Up/Down volume and share across 5M/15M/1H/4H/1D and per coin, daily fees (international only), US vs non-US election weekly volume, pUSD supply.
  - Polymarket US: daily volume, volume per category, monthly fees, monthly trades.
  - Kalshi: daily open interest, daily active markets, daily USD volume per category (+ share).
  - Cross-venue: Polymarket+Polymarket US+Kalshi monthly volume, cumulative volume, share; daily open interest comparison; weekly volume (Kalshi/PolymarketUS/Polymarket); weekly notional volume and share for nine venues (source Artemis); prediction-markets-to-spot-exchange volume ratio.
  - Rothera: monthly volume, monthly trades, daily open interest, cumulative volume. Hyperliquid HIP-4: daily and cumulative volume (source Token Terminal). Robinhood: monthly event contracts traded. Yearly venture funding.
  - Chart data-source attribution inside the payload: The Block 41 charts, Token Terminal 3, Artemis 2 (H).

---

## 3. Read API

| Item | Finding | Tag |
|---|---|---|
| exists | **none official-public.** Unofficial/undocumented chart-JSON files exist; The Block Pro advertises API access (authenticated, sales-gated) | H |
| Docs URL | NOT FOUND for a public API (searched: the dashboard page, `theblock.co/terms-service`, `theblock.pro` landing text). `theblock.pro` says "Hundreds of proprietary datasets and charts ... Custom data requests supported on demand. API access available. Schedule a demo" | H |
| Base URLs | Page: `https://www.theblock.co/data/decentralized-finance/prediction-markets` and per-chart pages `.../prediction-markets/<slug>`. Chart images: `https://data.tbstat.com/dashboard-images/<slug>.png`. Chart JSON hosts (not requested): `https://data.tbstat.com/dashboard/...json` (22 charts), `https://s3.amazonaws.com/data-private.tbstat.com/poc_highchart/...json` (24 charts) | H (URLs read from page payload) |
| Machine-readable on the page | schema.org `DataFeed` > `DataFeedItem` > `Observation` with `variableMeasured[{name,value,unitText}]` and `dateModified`: latest point per chart only. Sample: `docs/research/fixtures/the-block-prediction-market-data-dashboards/jsonld_datafeed_excerpt.json` | H |
| Per-chart flags in payload | All 46 carry `show_on_free_dashboard` and `show_on_pro_dashboard`; 40 carry `allow_csv_download`. I did not test whether CSV export works or who may use it (no account) | H for flags, UNTESTED for behaviour |
| Auth / rate limits | None documented. Pro API terms not public | H |
| WebSocket | none | M (nothing found) |
| History | Only via chart-JSON or Pro. Series length unverified | UNTESTED |

---

## 4. Trade path, PayBox reachability, fees, resolution

- **Trade path:** none. There is nothing to place, cancel or sign. (H, by nature of the site)
- **PayBox reachable:** no. No transaction proposal or signed order exists for a dashboard. The venues it covers are assessed in their own notes.
- **Fees:** the site charges none for the public page (`isAccessibleForFree: true`, H). The Block Pro is quote-based; a third-party company profile snippet says plans start around 2,500 USD/year (L, search-result snippet from a profile aggregator, not verified on a primary page).
- **Resolution / dispute risk:** none at The Block. The data-quality risk is real (section 7): definitions are undocumented and charts disagree.

---

## 5. Liquidity and overlap (the useful part)

All figures are **The Block's presentation of other venues' activity**, from the JSON-LD on the public page, fetched 2026-10-19 (H as to what the page says; M as to truth, see section 7).

**Weekly notional volume, week labelled 2026-10-12 (Artemis-sourced chart, last updated per page 2026-09-28 config; Polymarket = International + US merged):**

| Venue key | USD (as published) | Share of the 9 |
|---|---|---|
| kalshi | 13,008,959,582 | 79.8% |
| polymarket (merged) | 2,589,893,171 | 15.9% |
| nadex | 230,038,044 | 1.4% |
| rothera | 195,187,315 | 1.2% |
| predict | 145,051,866 | 0.9% |
| opinion | 86,023,140 | 0.5% |
| hip4 | 34,291,625 | 0.2% |
| forecastex | 2,712,439 | 0.02% |
| limitless | 1,793,222 | 0.01% |

Reading (M): Kalshi + Polymarket are about 96% of notional. Every other venue combined is about 4%; Limitless and ForecastEx are near zero on this measure. "predict" is a series key only; I assume Predict.fun (M).

**Other headline points (all H as published; dates are the chart's latest point):**

| Metric | Value | Date |
|---|---|---|
| Open interest, Kalshi | 1,978,988,878 USD | 2026-10-16/17 |
| Open interest, Polymarket | 375,432,005 USD | 2026-10-17 |
| Open interest, Polymarket US | 312,446,879 USD | 2026-10-17 |
| Open interest, Rothera | 89,111,632 USD | 2026-10-16 |
| Monthly volume (taker notional, month to date): Kalshi / Polymarket US / Polymarket | 41.23B / 6.48B / 2.35B USD | 2026-10-01 bucket |
| Cumulative volume: Kalshi / Polymarket / Polymarket US | 302.8B / 113.5B / 32.4B USD | 2026-10-01 bucket |
| Daily volume, Polymarket US | 439,464,078 USD | 2026-10-16 |
| Daily fees, Polymarket (international only) | 1,439,592 USD | 2026-10-17 |
| Monthly fees, Polymarket US | 46,274,656 USD | 2026-10-01 bucket |
| HIP-4 daily / cumulative volume | 6,255,762 / 576,312,568 USD | 2026-10-16 |
| Rothera monthly / cumulative volume | 610,937,391 / 6,141,725,935 "USD" | 2026-10-01 bucket / 2026-10-16 |
| Robinhood event contracts traded (monthly) | 4.7 billion contracts | 2026-08-01 bucket (STALE-ish: about 2.5 months old) |
| Yearly venture funding, prediction markets | 2,283,250,000 USD | bucket 2026-01-01; chart config last updated 2026-03-30, so likely year-to-date at end of March (M, STALE) |
| Polymarket pUSD supply | 482,268,767 USD | 2026-10-16 |

**Category mix (shares computed by me from the published per-category values; M):**

| Venue, day | Sports | Crypto | Politics/elections | Other notable |
|---|---|---|---|---|
| Kalshi, 2026-10-16 (total 2.47B) | 16.9% | 15.6% | about 0.5% (Politics 0.4%, Elections 0.1%) | **Combos 61.1%**, Exotics 3.1%, Commodities 2.3% |
| Polymarket intl, 2026-10-17 (total 179M) | 66.3% | 11.2% | 4.6% | Other 14.1% |
| Polymarket US, 2026-10-16 (total 439M) | 27.3% | 13.4% | 0.3% | Uncategorized 46.5%, Combos 12.4% |

- Polymarket crypto Up/Down on 2026-10-17: 5M windows 12.26M, 15M windows 5.45M, 1H/4H/1D about 0.53M together; BTC about 87% of 5M and 15M volume (H). So Polymarket crypto "volume" is mostly ultra-short windows that few other venues list (M).
- **Where cross-venue arbitrage can exist (M):** sports (largest on every venue, but Kalshi's volume is dominated by combos/parlays that are hard to match across venues); crypto price ladders (Kalshi, Polymarket, Nadex/CDNA, Hyperliquid HIP-4); Fed/macro (Kalshi, Rothera, ForecastEx, Polymarket small). Politics/elections volume is small right now on all of them (pre-US-midterm lull is my guess, not sourced).
- **Shared liquidity (do not treat as independent legs):** (a) the weekly chart merges Polymarket International and Polymarket US; (b) Robinhood event contracts route into Rothera's book per `rothera-exchange-and-clearing.md` (M), so Robinhood and Rothera are one pool; (c) the "nadex" series is Crypto.com | Derivatives North America per `og-crypto-com-nadex.md` and `fanatics-markets.md`, whose contracts also sit behind other US brand front ends (M).

---

## 6. Why I did not sample the chart-JSON files

The page payload exposes chart-JSON URLs, so a response-shape sample was technically possible. I skipped it because (1) the endpoints are undocumented, (2) the Terms prohibit "systematic or automated data collection", and (3) the orchestrator rule limits unauthenticated GETs to documented API hosts. The page's own JSON-LD already gives the response shape that matters. Fixtures saved (metadata and a 4-item JSON-LD excerpt only, no series):

- `docs/research/fixtures/the-block-prediction-market-data-dashboards/chart_catalog_metadata.json` (46 chart records: slug, title, config date, visibility flags, csv flag, host class, attribution)
- `docs/research/fixtures/the-block-prediction-market-data-dashboards/jsonld_datafeed_excerpt.json`

---

## 7. Data-quality cross-checks (why it is not a truth source)

| Check | Result | Tag |
|---|---|---|
| Kalshi week of 2026-10-12 | 13,008,959,582 on the Artemis weekly-notional chart vs 10,112,131,832 on the "Kalshi, PolymarketUS, and Polymarket Weekly Volume" chart: 1.29x apart, same page, same label | H (numbers), M (cause unknown) |
| Polymarket week of 2026-10-12 | 2.59B merged (Artemis) vs 1.96B (US) + 0.89B (intl) = 2.85B on the other chart | H / M |
| Rothera "USD" | Cumulative 6,141,725,935 on 2026-10-16. My Rothera note counts 6.22B contracts at $1 face through 2026-10-18 with 71.4M on 10-18, which leaves about 6.149B through 10-17, within about 0.1%. So the "USD" is contracts x $1 face, not dollars paid (premium was about 46-49% of face) | M (inference joining two H sources) |
| HIP-4 | The Block 6.26M for 2026-10-16 vs DefiLlama "halved" 2.26M for the same day and a tracker 3.48M for 24h to 2026-10-19 (per `hyperliquid-outcomes-hip-4.md`). About 2.8x DefiLlama. The earlier hint "6.26M" is now confirmed first-hand as what the page says | H (page), M (comparison) |
| ForecastEx | 2.71M for the week vs about 0.49M/day matched notional in `forecastex.md` (3.4M/week) | M, same order of magnitude |
| Methodology text | Monthly charts: "Trading volume for prediction markets uses taker notional volume." Weekly chart: sourced to Artemis; Polymarket merged. No definition of notional (face vs premium), no list of included products | H |
| Monthly bucket | "2026-10-01" values are month to date (about 16 days), not full-month | M |

Rule for the project: never mix these numbers with premium-paid volume from primary sources. If used at all, use rank order and shares, not levels.

---

## 8. Geo / ToS / automation

- **robots.txt** (H, https://www.theblock.co/robots.txt): `/data/` is allowed; `/api/`, `/wp-json/`, `/ws/`, `/search`, `/preview/`, `/_tbp/`, `/tbco/` are disallowed. It also declares `Content-Signal: search=yes, ai-input=yes, ai-train=yes`, which **contradicts** the Terms below. The Terms are the legal text; treat the stricter reading as binding.
- **Terms of Service**, effective Date April 8, 2026 (H via WebFetch, https://www.theblock.co/terms-service):
  - Acceptable Use: "conduct any systematic or automated data collection activities", listing scraping, data mining, extraction and harvesting.
  - Your Use of the Service: you must not "train artificial intelligence or machine learning using the Content" or "process the Content using artificial intelligence or machine learning ... including to summarize, reword, or paraphrase the Content."
  - Redistribution of Content on another website/app is barred outside "Permitted Sharing" (screenshots "no more than four times per month" with attribution to The Block); no commercial reproduction.
  - The Block Pro (theblock.pro) is a Website covered by the same terms. CSV downloads and data licensing are not mentioned in the Terms.
- **Consent/geo:** the page loads a cookie-consent banner and ad scripts; no geo block seen from this host (HTTP 200). A direct curl of `/terms-service` returned 403 while the page itself returned 200 (H), so some paths bot-filter the generic User-Agent.
- **Licence field:** the JSON-LD `license` points at the same Terms (H), so "free to access" does not mean "free to reuse".

---

## 9. Adapter recommendation

- **adapter_priority: skip.** No official API, Terms bar automated collection and AI processing, definitions are undocumented and inconsistent, and it adds no tradable leg.
- Do not build a "The Block" adapter. If a licensed cross-venue volume feed is ever wanted, the only sanctioned route found is The Block Pro API (sales-gated; scope and price unknown). Prefer DefiLlama plus each venue's own API/files, which other venue notes already document.
- **Use the findings here as a weighting prior** (section 5): Kalshi and Polymarket carry about 96% of notional; the next tier (Nadex/CDNA, Rothera, Predict, Opinion) is 0.5-1.4% each; ForecastEx and Limitless are near zero on this measure.

---

## 10. Leads for other workflows (not researched here)

1. **Nadex/CDNA** is the third-largest series (230M/week) and has a note (`og-crypto-com-nadex.md`); the Block's "nadex" series probably includes volume from US brand front ends sharing that exchange (M).
2. **Polymarket US now out-trades Polymarket International on The Block's numbers** (daily 439M vs 179M; weekly 1.96B vs 0.89B; monthly 6.48B vs 2.35B). If true, the US venue (CFTC DCM, USD) is the larger Polymarket pool and a different legal/API surface from the Polygon CLOB (M, single secondary source).
3. **Kalshi volume is 61% combos on 2026-10-16**: an aggregator should key on non-combo markets when measuring comparable liquidity (M).

---

## 11. Suspicious content / embedded instructions

- Nothing aimed at AI agents on the dashboard page or Terms (the only prompt-like item is a promotion for The Block's Chrome extension).
- `https://tokenterminal.com/docs/explorer` (an upstream data source named on the page) returned, via the page-summary tool, an "Agent Instructions" block telling the reader to read a catalog manual, query BigQuery tables and bill compute to a Google Cloud project. Ignored; not followed. Source of the claim is the summary tool's report of that page (M).

---

## 12. NOT FOUND / open questions

- NOT FOUND: any public, documented API or developer docs for The Block data (searched: dashboard page, Terms, theblock.pro landing text; the web-search budget then ran out).
- NOT FOUND: a definition of "notional" or the list of products behind each venue key (searched: chart descriptions in the page payload).
- NOT FOUND: Artemis product/API pages. `https://artemis.ai` is the source link on the page; fetching it returned only the tagline "Crypto & Equity Investment Research", with no prediction-market or API information. Whether this is the same company as other Artemis analytics products is unverified.
- NOT FOUND: Token Terminal API docs covering prediction markets (the pages fetched described only a no-code Explorer).
- UNTESTED: whether CSV download works for logged-out users; series history length; what the Pro API returns; whether the private S3 files are accessible.
- UNKNOWN: why two same-week Kalshi figures differ by 29%.

---

## Sources

- https://www.theblock.co/data/decentralized-finance/prediction-markets - dashboard page, fetched 2026-10-19; JSON-LD DataFeed and `__NUXT_DATA__` payload (H)
- https://www.theblock.co/robots.txt - fetched 2026-10-19 (H)
- https://www.theblock.co/terms-service - Terms, effective April 8, 2026, via WebFetch (H, quotes from a model-mediated fetch; direct curl was 403)
- https://www.theblock.pro/ - Pro landing page text, fetched 2026-10-19 (H)
- https://thegrid.id/profiles/the_block - company-profile aggregator snippet for the Pro price (L)
- https://tokenterminal.com/docs/explorer - upstream source named on the page; contains embedded agent instructions (M)
- https://artemis.ai - upstream source link on the page; tagline only (L)
- Repo notes used for cross-checks: `docs/research/venues/rothera-exchange-and-clearing.md`, `hyperliquid-outcomes-hip-4.md`, `forecastex.md`, `og-crypto-com-nadex.md`, `fanatics-markets.md`
