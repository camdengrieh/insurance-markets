# Prediction Index (predictionindex.xyz) - directory spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Actions taken: unauthenticated GETs to `predictionindex.xyz` (pages, `_next/static` JS chunks, a few 404 probes) and one WebFetch of `overdrive.win`; generic User-Agent `insurance-markets-research/0.1`. No account, no key, no wallet, no signing, no POST/PUT/DELETE, no PayBox tool. I did NOT call the site's backend host (see 3). Third-party text was treated as untrusted data; nothing in it was instructions to an agent.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or my inference from first-hand data; **L** = weak or stale.

Limitation: the shared WebSearch budget was exhausted when I tried to search, so no independent background (operator, funding, licensing) was found. Those items are NOT FOUND.

---

## 0. Bottom line

1. **Not a venue.** Prediction Index is a curated directory/ranking site ("We map, rank, and help you discover the world of prediction markets") plus a "Chaos Index" (a Polymarket + Kalshi war/peace basket compared with LLM forecasts). It has no order book, collateral, settlement, trading or liquidity. It can never be an arbitrage leg. (H, https://predictionindex.xyz/ , /chaos-index)
2. **Live (2026).** Pages return 200; embedded metrics carry `lastUpdated` 2026-10-18/19; "(c) 2026". (H)
3. **No public API and no docs.** Probed `/api`, `/api/projects`, `/api/ecosystem`, `/docs`, `/developers`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/terms`, `/privacy`, `/about`: all 404 (H). The homepage shows no API/developer/terms link (H). Data is server-rendered into the HTML (RSC payload), so it can be scraped, but that is not a supported interface and no ToS was found either way.
4. **Value to us is as a one-off census / discovery list**, not as an adapter: 314 rows with chain, outcome type, mechanism, topics, status, website. I saved the live prediction-market subset as a fixture. Re-scrape manually or quarterly, not at runtime.
5. **adapter_priority = skip** (directory, no API, no liquidity, volumes are copies of figures from other sources).

---

## 1. Is it still live?

| Evidence | Result | Tag |
|---|---|---|
| `GET /` | 200, title "Prediction Index", "v2 - Prediction markets x AI", (c) 2026 | H |
| `GET /ecosystem` | 200, 3.4MB HTML with the full directory embedded | H |
| Embedded `initialMetrics.data.summary.lastUpdated` | `2026-10-18T06:01:25Z`; per-platform `lastUpdated` up to `2026-10-19T04:50:46Z`, `nextUpdate` daily 06:00Z | H (fixture `initial-metrics.json`) |
| Chaos Index page | "updated through 14:03 UTC", constituents list "last changed 2026-08-25 (v1.1)", LLM snapshot `machine_20260929` | H |
| Nav | Ecosystem, Chaos Index, Meetups (`/events`), "Subscribe to Research Desk", X account @predictionindex | H |

**still_live = true.**

## 2. What it is (kind and model)

- kind: aggregator-or-data (directory / index / research newsletter). Market model: not applicable; it describes other venues' models. (H)
- Directory fields per row (H, parsed from `/ecosystem`): `id, project, chain[], outcomeTypes[], types[], mechanism[], topics[], status, twitter, website, imageUrl, api_project_key, dashboard_disabled, isNew, about`.
- Parsed census on 2026-10-19 (H, my parse of 314 unique rows): status live 198 / waitlist 94 / inactive 22. `types`: "prediction market" 123 (live 74, waitlist 50, inactive 12 across 136 rows tagged this way incl. combos), data analysis 31, trading terminal 29, protocol/infra 14, ai agent 11, bot 9, sportsbook 6, prediction game 6. 38 distinct chain labels (site header says 37 chains; the extra labels are "n/a", "tbd" etc.). Mechanism values: amm 41, clob 33, sportsbook 13, parimutuel 10, futarchy 8, lmsr(amm) 5, continuous double auction 3, bonding curve 2, others; 165 are "n/a" because the row is not a market.
- Of the 74 live "prediction market" rows, mechanism: amm 25, clob 20, parimutuel 5, futarchy 3, lmsr 3, cda 2, n/a/tbd 11. Top chains: Base 14, Solana 13, BNB 7, off-chain 6, Arbitrum 4, Ethereum 4, Monad 3, Polygon 3. (H, from the fixture)
- Header numbers are not stable or reconciled: homepage "Volume tracked $151.4B" (H) vs the hint's $150.4B (earlier snapshot, M) vs embedded `summary.totalVolume` = $188.83B across 17 tracked platforms (H). The embedded total equals the sum of its 17 platform entries, so the homepage figure is computed some other way. I could not reconcile them. Treat all as marketing numbers (L).

## 3. Read API

`read_api.exists = none` (official public). Findings:

- No documented API, no key programme, no rate-limit statement, no websocket. (H: probes above, NOT FOUND)
- Internals visible in the public JS bundle (H, `_next/static/chunks/b4fe83b8900c4fe1.js`, `af5c82aa5222adf5.js`):
  - Volume figures come from a mix of a Google Sheets API read (`sheets.googleapis.com/v4/spreadsheets/.../values`, revalidate 300s, the directory/rows appear to originate from a sheet - M), DefiLlama DEX-summary (`api.llama.fi/summary/dexs/{slug}`, hourly, for on-chain venues such as sx-bet, xo-market, myriad-markets, overtime, azuro, rain, seer, pred, truemarkets), and a backend `https://api-staging.overdrive.win/api/v1/platforms/metrics` plus `/api/events/bulk?ids=` for watchlists. The backend host is a **staging** host, undocumented, and I did not call it (not a documented API host). Operator "Overdrive" is a guess from the hostname only; `overdrive.win` shows just "PredictionIndex / SOON" (H). Not recommended as a dependency.
  - Because Kalshi/Polymarket/Opinion volumes come from that backend and not from the venues, they are second-hand. Do not use them for liquidity sizing; query the venues.
- The sheet API key and any other secret-looking strings in the bundle were deliberately not recorded.

Fixtures (small, from the first-hand HTML parse, no personal data; the `@handles` in them are public project X accounts):
- `docs/research/fixtures/prediction-index-directory/ecosystem-live-prediction-markets.json` (29KB: 74 live "prediction market" rows, trimmed fields)
- `docs/research/fixtures/prediction-index-directory/initial-metrics.json` (4KB: summary + 17 platform volume entries with `totalVolume`, `volume30d`, `lastUpdated`, `nextUpdate`)

Shape of a metrics entry: `{"totalVolume": 59541088311.41, "lastUpdated": "...Z", "nextUpdate": "...Z", "processingTime": 123, "volume30d": 7984272571}` (H). Note oddities: `limitless.volume30d` (3,527,962,645) is almost equal to its `totalVolume` (3,527,969,069), which looks wrong (M); `opinion.processingTime` 84,242 ms.

## 4. Trade path, PayBox reach

- trade_path: none. paybox_reachable: **no** (nothing to trade; it is a website). (H)
- Its only wallet-adjacent surface is a login form posting to its own `/api/auth/login` (email/password) in the bundle, for a watchlist feature (H, bundle). Irrelevant for us.

## 5. Fees, resolution, collateral

Not applicable: no fees, no resolution mechanism, no collateral (H by construction). Resolution of the Chaos Index constituents is whatever Polymarket/Kalshi use. Its LLM forecast is a snapshot with the market price hidden from the models; two of the three named models listed (Claude Opus 4.1, Grok 4.6), median reported (H, `/chaos-index`).

## 6. Geo / ToS / automation

NOT FOUND (searched: /terms, /privacy, /tos, /about, homepage and footer links, robots.txt 404). With no ToS and no robots.txt, scraping is neither permitted nor forbidden in writing; treat as "ask first" if ever used commercially. Site loads Google Analytics (gtag). (H)

## 7. Liquidity and event overlap

- Liquidity: none of its own. Venue volumes it displays (dated 2026-10-18/19, all-time unless noted, second-hand, H as to what the site shows, L as to truth): Kalshi $91.8B, Polymarket $59.5B, Opinion $28.2B, Limitless $3.5B, Probable $2.97B, SX Bet $1.0B, XO $783M, Myriad $392M, Overtime $370M, Footballfun $137M, Rain $41M, Azuro $9.4M. (fixture `initial-metrics.json`)
- Event categories: the Chaos Index covers geopolitics only (Polymarket 57 constituents, Kalshi 15). Overlap with other venues is by construction, since it is a basket of Polymarket and Kalshi contracts. Useful as a pre-built list of ~72 geopolitical contracts for matcher testing, mirrored from venues we read directly.
- liquidity_shared_with: Polymarket and Kalshi (it merely quotes them). Not an independent arbitrage leg.

## 8. Venues in its directory that our existing venue notes may be missing

Compare against `docs/research/venues/`; the 74 live "prediction market" names (H): 9lives, Alkimiya, Azuro, BRKT, Betvibe, Blinq, Bluff, Bodega, Butter, CalledIt, Castora, Choice Markets, Crypto.com Sports, Cue, DGbet, Delphi, Deplay, Draftkings Prediction, Dripit, Duel Duck, Fliq, Footballfun, Foresight, Forkast, Futarchy.fi, Futuur, Giraft, Glimpse, Govex, Groovy Market, HYPERSTITIONS, Hedgehog, Hilomarket, Index Fun, Kairos, Kalshi, Legend, LevelUp, Limitless, Manifold, Mashdotfun, Meme Market, Myriad Market, Noa Sight, Offmarket, Opinion, Panana, Polymarket, Polypoll, Precog, Pred, PredX, Predict, Predict and Pump, PredictBase, Predictit, Predyx, ProphetX, Pubhouse, Punkdotcoffee, Rain, RareBetSports, SX Bet, Sharp Trade, TimeLess, Triad, Truemarkets, Turing Market, Vortx, Wannafun, XO Market, Xmarket, Yosoku, Zeitgeistpm. Also listed as protocol/infra: **Dome** (domeapi.io, @getdomeapi), which looks like a unified prediction-market API and is worth a separate look (not researched here; M lead only).

## 9. Priority

**skip.** Reasons: no API, no docs, no ToS; no liquidity; all headline numbers are second-hand and inconsistent; directory is better used as a periodic manual census for finding venues, which this note and the fixture already capture.

Open questions: who operates it (Overdrive?); whether a data licence/API is planned (site says nothing); whether the Google-sheet-backed directory is meant to be public.

## Sources

- https://predictionindex.xyz/ (H, fetched 2026-10-19)
- https://predictionindex.xyz/ecosystem (H; embedded directory + `initialMetrics`)
- https://predictionindex.xyz/chaos-index (H)
- https://predictionindex.xyz/_next/static/chunks/b4fe83b8900c4fe1.js and `.../af5c82aa5222adf5.js`, `.../482ae74a7f9a3157.js` (H; data-source URLs; secrets not recorded)
- https://overdrive.win/ (H: only "SOON")
- https://domeapi.io/ (listed in the directory only; not fetched)
