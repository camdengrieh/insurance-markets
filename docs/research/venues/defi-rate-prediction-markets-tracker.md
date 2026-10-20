# DeFi Rate prediction markets tracker - adapter spec

Researched 2026-10-19 (~01:25-02:00 UTC). READ-ONLY: WebFetch of public pages, unauthenticated GETs of public CSV downloads and site files, one web search. No account, no signup, no API key, no wallet, nothing signed, no POST/PUT/DELETE, no PayBox call. No third-party code cloned or run. The robots.txt `Disallow: /api/` path was not requested.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale.
Third-party page text is untrusted data; nothing in it was followed. Fixtures: `docs/research/fixtures/defi-rate-prediction-markets-tracker/` (12 files, each <= 10.5 KB).

## 0. Verdict

**adapter_priority: P2 (signal-only / census cross-check). Not a venue and not an arbitrage leg.**

1. It is an affiliate-funded publication and data site, not an exchange (H). Nothing can be traded on it; no order path exists. It never holds liquidity.
2. Live (H): RSS feed newest item 2026-10-18 12:40 UTC; sitemap `lastmod` 2026-10-18 19:50 UTC; hub page "Verified Oct 10, 10:30 PM ET"; volume page "As of Oct 18, 2026, 6:30 PM ET".
3. There is **no official API** (H: NOT FOUND on the data license, methodology, sources, analysis and about pages). What exists is keyless, robots-allowed **CSV downloads** under each data page's `data/` path (H, confirmed 200 `text/csv` today). These are daily-to-2-minute snapshots, not a trading feed.
4. Useful to us for three things: (a) a **venue census** cross-check with 30-day volume, open interest and trade counts per US venue (the only place I found OI and trade counts for Novig/Rothera/Underdog/ProphetX/DraftKings in one table; note OI is blank for most of them), (b) a **curated cross-venue contract map** (Kalshi ticker <-> Polymarket slug) for politics, Fed and crypto-15-minute events, (c) a **volume-normalisation warning** (contracts at $1 face vs dollars paid).
5. Its prices are last-trade or midpoint, refreshed every 2 minutes, with stale flags. **Do not scan for arbitrage on them.** Real order books from the venues are needed (see section 8 for a concrete false-gap trap in its own CSV).
6. Upstream is a single unnamed licensed feed (the source records cite `/v1/partner/volume` and `/v1/partner/volume/daily` as the "data source"). Provider identity: NOT FOUND (searched: methodology, sources page, about, analysis, web search of the exact path). If the project wants this data properly, go to the venues directly (Kalshi, Polymarket US, etc. are in other specs) or ask the site for a feed (contact in section 3).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| RSS `https://defirate.com/feed/` newest item | 2026-10-18 12:40:09 UTC ("Polymarket Promo Code RATE: $25 Bonus for Cowboys vs. Packers SNF"); next 2026-10-18 11:41 UTC | H |
| Sitemap `https://defirate.com/sitemap.xml` | 1,017 `lastmod` entries, newest 2026-10-18T19:50:03Z; 171 `/odds/` URLs, 104 under `/odds/nfl` | H |
| Hub page `/prediction-markets/` | "Verified Oct 10, 10:30 PM ET" (9 days old at fetch) | H |
| Volume page `/prediction-markets/volume/` | "As of Oct 18, 2026, 6:30 PM ET"; window 2026-09-18 to 2026-10-17 | H |
| CSV `volume-daily.csv` | last row 2026-10-19 (partial day, many cells blank) | H |
| Site history | Founded 2020 as a DeFi lending-rate tracker (about page); prediction-market coverage added later | H (self-description) |

## 2. What it is

- **Kind**: aggregator-or-data (publisher). Next.js site behind Cloudflare. Owner/legal entity NOT FOUND (about page names a nine-person newsroom, no company; funding undisclosed) (H).
- **Business model (H, about + hub)**: affiliate commissions on sign-up links ("promo code RATE" and others), data licence, custom data pulls. Treat every ranking, "score" or bonus on the site as commercially motivated; this is why the hint says "use as a census cross-check, not a primary source".
- **Market model**: not applicable. It reports other venues' contracts. It normalises price to a 0-1 probability (cents on pages, decimals in CSV), uses **bid-ask midpoint when both sides exist, otherwise last trade**, and the source record says which (H, methodology + CSV `price_type`).
- **Chains/collateral**: not applicable (no balances, no tokens). Venues covered are US-regulated CFTC venues (Kalshi, Polymarket US, Gemini, FanDuel Predicts, DraftKings Predictions, OG, Underdog, Rothera, Novig, ProphetX, ForecastEx) plus Polymarket international (H, hub + volume page).

## 3. Read API / data access

| Surface | Status | Tag |
|---|---|---|
| Official REST/WebSocket API | **NOT FOUND** (searched: `/data-license/`, `/prediction-markets/methodology/`, `/prediction-markets/volume/sources/`, `/analysis/`, `/about/`, llms.txt, web search). The `/analysis/` page is a request form (data type, platforms, date range, CSV export or dashboard access as formats); it mentions no API and no pricing (WebFetch summary of the page, so paraphrase, not a quote). | H |
| robots.txt | `User-agent: *  Allow: /  Disallow: /api/  Disallow: /preview/` -> CSV paths below are allowed; `/api/` is off limits and was not touched | H |
| CSV downloads | Public, keyless, `200 text/csv; charset=utf-8`. Paths are per data page: `/prediction-markets/volume/data/{volume-venues,volume-daily,volume-categories,volume-top-markets,volume-snapshot}.csv`, `/prediction-markets/data/{hub-apps,hub-operators,hub-snapshot}.csv` (+ timestamped copies like `hub-apps-2026-10-10T2230.csv`), `/odds/<topic>/data/*.csv` (e.g. `fed-decision/data/fed-snapshot.csv`, `us-president/data/pres-snapshot.csv`, `crypto/data/crypto-snapshot.csv`). Listed in each page's "Data and sources" section; no machine-readable index found (llms.txt and sitemap do not enumerate them). | H |
| Frozen snapshots | `/prediction-markets/volume/snapshot/2026-10-18T1830/` (permanent citation copy) | H (URL from sources page; page not fetched) |
| Source records | `/[page]/sources/` per page (e.g. `/odds/fed-decision/sources/`) list contract ids; not fetched in full | M |
| llms.txt | `https://defirate.com/llms.txt` exists (10.4 KB), index of pages, no API description | H |
| Rate limits / auth | NOT FOUND. Cloudflare-fronted; a normal GET with a plain User-Agent worked for ~20 requests with no throttling. Nothing published, so be gentle (cache for >= 2 min; the data does not change faster). | H/M |
| Upstream feed | Source rows name "DeFi Rate market data" with `contract_id` `/v1/partner/volume` and `/v1/partner/volume/daily`. That is an internal/partner endpoint of an unnamed vendor. Not documented, not public, not to be probed. | H |

**Contact for data/feed requests (published on the site)**: the address listed on the about and analysis pages (a generic newsroom mailbox, 24h reply claimed). Not used by this research. Deliberately not copied here beyond this pointer.

### Confirmed response shapes (fixtures)

1. `volume-venues.csv` (590 B), header: `venue,volume_30d,prior_30d,change_pct,share,open_interest,trades,est_fees`. Values are **contracts at $1 face value** in USD units, not dollars paid. Example (2026-10-18 snapshot): Kalshi `78174289122, 49192584069, 58.9, 0.757, 1473913754 (OI), 411287688 (trades)`; Polymarket US `12379924269, ..., OI 84338678, 6201279 trades`; Polymarket `4558822192, ..., OI 350558802, 41589718 trades`. `est_fees` is empty for every venue. `open_interest` is blank for DraftKings, Gemini, Novig, ProphetX, Rothera, Underdog.
2. `volume-snapshot.csv` / odds `*-snapshot.csv` (long format), header: `figure_id,figure,figure_value,figure_display,record_family,venue,contract_id,role,price_type,bid,ask,price,rate_or_value,unit_or_basis,traded_24h_usd,quote_state,quote_age,attribution,observed_at`. Example (Fed snapshot): `oct-hike,"The Fed hikes on Oct. 28",12.5,13%,contract,Kalshi,KXFEDDECISION-26OCT-H25,direct contract,last trade,,,0.125,,,13078,fresh,1136s,,2026-10-18T21:25:00-04:00` and the Polymarket twin `contract_id=will-the-fed-increase-interest-rates-by-25-bps-after-the-october-2026-meeting-20260617190324032` at 0.125 with 123,950 USD 24h traded.
3. Others saved: `volume-daily.csv` (wide table, one column per venue, USD/day), `volume-categories.csv` (24H/7D/30D by category), `volume-top-markets.csv` (market title, venue, category, volume; titles only, **no ids**), `crypto-snapshot.csv`, `pres-snapshot.csv`, `hub-apps.csv`, `hub-operators.csv`, `llms.txt`, `robots.txt`.

Data-quality notes (H, from the files):
- Cross-venue prices exist only for **Kalshi and Polymarket** in the three odds snapshots I parsed (Fed 9 rows, President 48 rows: 28 Polymarket + 20 Kalshi, Crypto 18 rows). No Gemini/Polymarket US/Rothera/Novig rows there. The hub page says it compares Kalshi, Polymarket, Polymarket US, Gemini (about page); I did not find those extra venues in the CSVs I sampled.
- `quote_state` stale appears often (a Kalshi presidential row is `stale` with 24 USD traded in 24h; a Polymarket Dec-hike row is stale at 10,473 s). `bid`/`ask` are blank for most `last trade` rows.
- `volume-top-markets.csv` has no contract ids, so it cannot be joined to venue APIs without fuzzy title matching.

## 4. Trade path

**None.** DeFi Rate has no order entry, no wallet, no custody, no signing, no x402 endpoint. "Trade" buttons are affiliate deep links to the venues (H, page text "DeFi Rate earns a commission when you sign up through these links"). Anything bought through those links is a venue account sign-up, which this project must not do and which is not needed.

## 5. PayBox reachability

**paybox_reachable: no.** There is nothing to trade or sign. The venues it lists are US-regulated, KYC'd, fiat-funded CFTC venues (except Polymarket international), mostly not reachable by an EVM wallet; their reachability is assessed in their own specs (`kalshi`, `polymarket`, `polymarket-us` outside this workflow; `draftkings-predictions.md`, `fanduel-predicts.md`, `gemini-predictions.md`, `novig.md`, `prophetx.md`, `rothera-exchange-and-clearing.md`, `underdog-predict-underdog-exchange-udx.md`, `og-crypto-com-nadex.md`, `forecastex.md`, `robinhood-prediction-markets.md`, `coinbase-prediction-markets.md`, `fanatics-markets.md` all exist in this directory).

## 6. Fees

DeFi Rate charges nothing for the CSVs (data licence permits republishing with credit). Venue fees it publishes (all **M**, secondary, affiliate site; use the venue specs for primary figures):
- Formula-based venues (Kalshi, Polymarket US, Gemini, OG, Crypto.com): about `0.07 x contracts x price x (1 - price)`, roughly 1.75 cents per contract at 50 cents; makers pay less or nothing; Polymarket US pays makers a rebate (fees page "as of Oct 2, 2026"; `hub-apps.csv` says Polymarket US "up to 1.74%", maker rebate up to 0.31%).
- Flat: FanDuel Predicts 2 cents per contract (also on early cash-out); DraftKings up to 2 cents per side; Robinhood commission up to 1 cent plus up to 1 cent exchange fee; Fanatics up to 2 cents; ForecastEx 1 cent exchange fee; PredictIt 10% of profit.
- The site itself says the calculators page prose (Kalshi ~0.7%) does not match its fee table, and that "other venues' fees aren't in its feed", so cross-venue net-of-fee edges cannot be fully computed from it. Do not take its fee numbers into an arbitrage engine (L/M).

## 7. Resolution / dispute risk

Not applicable (it resolves nothing). Risk is **data risk**: stale quotes (flagged after 30 min), last-trade prices presented as "price", and an upstream feed it does not name. It flags its own caveats in places (e.g. a Kalshi +59% figure "being double-checked with the data provider"). Resolution wording differences across venues for the "same" event are not documented on the pages I read; in its methodology only "venues listing the same outcome" are averaged.

## 8. Geo / ToS / automation

- Data licence (`/data-license/`, H): lets anyone "quote any figure, chart it, and republish our CSVs and snapshots, commercially or not", with credit "DeFi Rate" and a link; keep the observation time with the number; exchange/protocol data remain subject to their owners' terms. It says nothing about scraping, automated polling or an API.
- Terms of service page: NOT FOUND (searched: /terms/, /terms-of-service/, /tos/, /disclaimer/, /disclosures/ all 404; linked footer pages are about, data-license, privacy, editorial-guidelines). Privacy page not read.
- robots.txt allows everything except `/api/` and `/preview/` (H).
- Geo: the site is US-consumer oriented (state-by-state legality pages). No geo-block seen from this runner (the Cloudflare edge answered from a BKK PoP). Not a trading venue, so no trading geo rules apply to it.
- Practical rule for an adapter: poll the CSVs no faster than every few minutes, send an honest User-Agent, cache, attribute "DeFi Rate" with a link and the `observed_at` if the numbers are ever shown to a person or republished.

**Trap seen in its own data (H, `crypto-snapshot.csv`, 2026-10-18 21:20 ET)**: Kalshi "BTC up in 15 min" midpoint 0.575 (`KXBTC15M-26OCT182130-30`) next to Polymarket "reference only" 0.485, no contract id, 0 USD traded; ETH shows 0.485 vs 0.605 the other way. The site marks these rows `reference only` and says unlinked quotes are never averaged or ranked. A naive scanner reading the CSV would see 9-12 cent "arbitrage" that is not a tradable same-window contract. This is exactly why DeFi Rate must not be an arbitrage price source.

## 9. Liquidity (venue census as DeFi Rate reports it)

Source: `volume-venues.csv` and the volume page, window 2026-09-18 to 2026-10-17, as of 2026-10-18 6:30 PM ET (H as a reading of DeFi Rate; M as a measure of the venues because the feed is unnamed). Units are **contracts at $1 face value**; dollars actually paid are far lower.

| Venue | 30d volume (face) | Share | vs prior 30d | Dollars paid (page) | OI (CSV) |
|---|---|---|---|---|---|
| Kalshi | $78.2B | 75.7% | +59% | $18.1B (23c/contract) | $1.47B |
| Polymarket US | $12.4B | 12.0% | +133% | $3.4B (27c) | $84.3M |
| Polymarket (intl) | $4.6B | 4.4% | -8% | $2.3B (50c) | $350.6M |
| DraftKings Predictions | $3.0B | 2.9% | +138% | $616M (21c) | blank |
| Novig | $2.4B | 2.3% | +143% | $677M (28c) | blank |
| Underdog Exchange | $1.3B | 1.3% | +137% | $202M (16c) | blank |
| Rothera | $1.1B | 1.1% | +28% | $560M (49c) | blank |
| ProphetX | $295M | 0.3% | +56% | not shown | blank |
| Gemini | $43M | 0.04% | +3% | not shown | blank |
| Total | $105.3B (CSV snapshot $105.6B) | | | $26.3B | |

- Not in the table: Opinion, Limitless, Predict.fun, Myriad, FanDuel Predicts, OG, ForecastEx, Robinhood, Coinbase, Crypto.com, Fanatics (H: absent from the volume page).
- Category mix, 30D (`volume-categories.csv`): Combos $55.7B, Sports $34.9B, Crypto $11.3B, Finance $1.1B, Politics $0.58B, Weather $0.22B, World $0.17B, Economics $0.14B, Mentions $0.08B, Culture $0.08B, Tech $0.07B. **Sports-heavy and parlay-heavy**; politics/economics are about 0.7% of volume.
- Compare the paid-per-contract column: Kalshi 23c vs Polymarket 50c shows why face-value share overstates Kalshi (parlay/longshot contracts). For edge sizing use dollars paid or order-book depth, not face volume.

**Internal inconsistency (H, flag for the census)**: the hub page (verified 2026-10-10) and `hub-operators.csv` list **Novig as "Approved, not launched ... not yet trading"**, while the volume page (2026-10-18) and `volume-venues.csv` report Novig with $2.4B 30-day volume and 7.2M trades. The hub text is stale or wrong; the volume feed is the better evidence of liveness. Do not use the hub status column as truth.

## 10. Event-category overlap (where arbitrage could exist)

From DeFi Rate's odds pages (H, sitemap + llms.txt; per-event cross-venue CSVs sampled for Fed, 2028 president, 15-minute crypto): **politics (2026 midterms, Senate, 2028 nominees), Fed/rates, NFL/NBA/UFC sports, short-window crypto, oil, entertainment**. The cross-venue price tables are effectively **Kalshi vs Polymarket only**. The census also confirms where overlapping contracts exist across US venues: sports (Kalshi, Polymarket US, DraftKings, Novig, Underdog, Rothera, ProphetX all sports-heavy), crypto up/down (Kalshi, Polymarket). Politics and economics overlap exists mainly between Kalshi and Polymarket (intl).

## 11. Liquidity shared with another venue

Not a venue, so N/A, but the census has duplicate-liquidity hazards the aggregator should model (M, from the venue structure in `hub-operators.csv`): FanDuel Predicts and DraftKings Predictions run on CME-affiliated partner exchanges; OG Predictions and Underdog Predict route through Crypto.com/CDNA (Underdog "routes through CDNA as an FCM alongside its own Aristotle exchange"); Robinhood carries ForecastEx order flow. These are distribution fronts that can share one underlying book, so they are not independent legs. Verify per venue before treating them as separate (see each venue spec).

## 12. Integration recommendation

- Build **no trading adapter**. Optionally build a thin `census` reader that fetches `volume-venues.csv` (and `hub-operators.csv`) every few hours to (a) detect new/dead US venues, (b) compare venue 30-day volume and OI against our own measurements, (c) alert when a venue enters or leaves the table. Treat output as a hint with `observed_at`, never as a price.
- Optionally use the odds CSVs' `contract_id` pairs to **seed the market-linking table** (Kalshi ticker <-> Polymarket slug) for politics/Fed events, then verify against each venue's own API before use (`docs/market-linking-design.md`). Only rows with `role = direct contract` on both sides are linkable; `reference only` rows are not.
- Leads surfaced by the site's news slugs only (titles read from the sitemap, articles not read, L): "Sleeper receives NFA approval to offer prediction markets", "JuiceX wins CFTC exchange approval", "Novig receives CFTC approval as ProphetX launches sports prediction markets", "Kalshi launches pro trading terminal (prediction markets + perps)", "Kalshi moves to end volume rewards". No venue file exists in `docs/research/venues/` for Sleeper or JuiceX; verify before adding.

## 13. NOT FOUND

- Official API, OpenAPI spec, rate limits, auth, WebSocket (searched: data-license, methodology, volume sources, analysis, about, llms.txt, web search for the vendor path).
- Identity of the upstream data vendor behind `/v1/partner/volume*` (searched: site pages, web search of the exact path; results listed unrelated vendors only).
- Terms of service (searched: five common paths, all 404).
- Legal owner/operating entity and funding (about page).
- Machine-readable index of the CSV paths.
- Cross-venue prices for Polymarket US, Gemini, Rothera, Novig, DraftKings, Underdog, ProphetX on the odds CSVs I sampled (only 3 of the 171 odds topics sampled; others may differ).

## 14. Suspicious content

None found. No text aimed at AI agents in the pages or CSVs read. The only "instruction-like" text is commercial: promo codes (RATE, BEST) and the request to cite DeFi Rate with a link; neither was acted on.

## 15. Sources

| # | URL | Used for | Tag |
|---|---|---|---|
| 1 | https://defirate.com/prediction-markets/ | hub: venue list, "Verified Oct 10", Novig status, CSV links | H |
| 2 | https://defirate.com/prediction-markets/volume/ | volume table, as-of, CSV download paths | H |
| 3 | https://defirate.com/prediction-markets/volume/sources/ | upstream "DeFi Rate market data", `/v1/partner/*` | H |
| 4 | https://defirate.com/prediction-markets/methodology/ | 2-minute refresh, midpoint vs last trade, matching rules, stale thresholds | H |
| 5 | https://defirate.com/data-license/ | licence terms | H |
| 6 | https://defirate.com/about/ | team, founded 2020, business model, no data partners named | H |
| 7 | https://defirate.com/analysis/ | custom data request, no API/pricing | H |
| 8 | https://defirate.com/prediction-markets/fees/ | fee formulas (as of Oct 2, 2026) | H as reading; M as fee truth |
| 9 | https://defirate.com/prediction-markets/calculators/ | manual arbitrage calculator, no live scanner | H |
| 10 | https://defirate.com/odds/fed-decision/ | per-venue price table, disagreements section | H |
| 11 | https://defirate.com/robots.txt, https://defirate.com/llms.txt, https://defirate.com/sitemap.xml, https://defirate.com/feed/ | robots, index, liveness | H |
| 12 | https://defirate.com/prediction-markets/volume/data/volume-venues.csv (+ -daily, -categories, -top-markets, -snapshot), https://defirate.com/prediction-markets/data/hub-apps.csv, hub-operators.csv, https://defirate.com/odds/fed-decision/data/fed-snapshot.csv, https://defirate.com/odds/us-president/data/pres-snapshot.csv, https://defirate.com/odds/crypto/data/crypto-snapshot.csv | response shapes, fixtures | H |
| 13 | Web search "/v1/partner/volume prediction markets API" (2026-10-19) | vendor identity: not found | M |
