# PredictionHero (predictionhero.com) - cross-venue aggregator and arbitrage scanner - adapter spec

Researched 2026-10-19 (about 03:00 to 03:45 UTC). READ-ONLY. Method: WebFetch and WebSearch of the vendor site and listings; unauthenticated `curl` GETs (generic User-Agent `insurance-markets-research/0.1`) of public pages that robots.txt allows (home, `/data`, `/terms`, `/disclaimer`, `/company`, `/pricing`, `/journalists`, one event page, `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml` and two child sitemaps, the Intercom help center at `help.predictionhero.com`); `gh api` read of the awesome-list README; DNS lookups of five guessed subdomains. No account, no sign-up, no API key, no wallet, no POST, no browser automation, no PayBox tool. Third-party text was treated as data; nothing in it was followed.

Tags: **H** = read first-hand in a primary source this session (URL given); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak, stale or vendor claim without evidence. "NOT FOUND (searched: ...)" marks a documented absence.

Fixtures (all <= 26 KB): `docs/research/fixtures/predictionhero/` (section 13).

---

## 0. Bottom line

1. **Not a venue. A free-to-browse web aggregator with no trading, no custody and no public API.** It ingests five venues (Polymarket, Kalshi, Opinion, Limitless, Predict.fun), groups "the same event" across them, shows a volume-weighted "PH Consensus", flags resolution-rule differences ("RDA") and has a paid in-app "Arbitrage" scanner (Standard plan, $24.95/month). It has no liquidity of its own, so it cannot be an arbitrage leg. (H: llms-full.txt, help center, home page state)
2. **Live and actively maintained.** Page data stamped 2026-10-19T03:05Z, sitemap regenerated 2026-10-19T00:08Z (511,239 URLs), site version v0.45.0, help articles dated 2026-09-09. Still labelled BETA. (H)
3. **API: sales-gated and undocumented.** `/data` ("API & Data Licensing") promises JSON/CSV, API-key auth, sandbox, a 99.9% SLA and "pre-computed arbitrage opportunities", but gives no endpoint, no schema, no limits, no price, only a "Contact" prompt. The help center says "a public API or data export feature is available for research or professional use" and links to the same page. No docs host exists (api./docs./developers./developer./data.predictionhero.com do not resolve). (H for the absence, L for the claims)
4. **Do not build on the site's own `/api`.** The front end reads from `/api` (inline `VITE_API_BASE_URL":"/api"`), robots.txt says `Disallow: /api/` for every agent, and the ToS bars scraping. I did not probe it. (H)
5. **ToS blocks reuse of the data.** No scraping or abuse; no copying, distributing or derivative works of "data compilations" without written consent except personal non-commercial use. Anything beyond manual spot-checking needs a written licence. (H)
6. **Coverage adds nothing we lack.** All five venues are already covered by our native adapters; PH does not cover XO, Trueo, Myriad, Manifold, PredictIt or Polymarket US. Its only unique output is the cross-venue event grouping, match confidence and AI-written rule-divergence text.
7. **adapter_priority = skip** as a venue or data adapter. Keep as a human cross-check and as a benchmark for our own market-linking (manual spot checks only). Revisit only if a licence, docs and a sandbox key are obtained. (Section 11)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://predictionhero.com/` | HTTP 200, Cloudflare, date header 2026-10-19T03:03:51Z | H |
| Market rows on one event page (`/event/presidential-election-winner-2028`) | latest `updatedAt` per venue on 2026-10-19: Kalshi 03:01:58Z, Polymarket 02:59:03Z, Predict 03:00:19Z, Limitless 03:01:09Z, Opinion 03:05:30Z (but see section 7: the sampled Opinion row carried no price and dated 2026-10-18T21:55Z) | H (fixture) |
| `sitemap.xml` | header comment "generated: 2026-10-19T00:08:54Z, sitemaps: 22, urls total: 511239"; `events-active.xml` has 28,465 URLs | H |
| Footer version | "PredictionHero (c) 2026 v0.45.0"; label BETA in nav | H |
| Help center (Intercom) | articles dated 2026-04-14 and 2026-09-09 | H |
| Terms of Use | "Last updated: February 1, 2026" (8.5 months old: possibly stale, but it is the current text) | H |
| Third-party listings | awesome-list entry "Phase: beta, Added Aug 2026"; BetaList "Featured" 2026-08-09; Hackernoon author page with no stories | M |
| Earlier snapshot | WebSearch summary of the homepage fetched 2026-09-01: 32,763 events, 3,246 matched events, 24h volume $88.9M, total volume $119.5B | M |

Verdict: **still_live = true**. Youngest product (first public footprint about Aug 2026 per BetaList/awesome list; the site itself may be older, "launched in 2026" per a comparison site, M).

---

## 2. Kind and market model

- **Kind (H):** web analytics front end / aggregator. llms-full.txt: "does not execute trades or facilitate betting ... custody user funds ... create or run markets ... influence or determine event resolution ... estimate, simulate, invent, or modify probabilities". Venue buttons deep-link out (with PH referral parameters, section 6).
- **Market model:** none of its own; it mirrors each venue's model. It tags structure as binary / multi-outcome / range-based and active / resolved / disputed (llms-full.txt). Outcomes are not tokenised by PH; each row carries the venue's own id (`platformInternalId`, `ticker`) (H, fixture).
- **Data model seen in page state (H, fixture `event-page-state-sample.json`; an internal front-end payload, not an API):**
  - Aggregated event: `groupId`, `groupKey`, `matchConfidence` (0.95 on the example), `platforms`, `groupedEvents` (one platform-native event per venue), `resolutionRules` (RDA text), `resolutionRulesDetails` (JSON: status, severity, issue, divergences[], edgeCases[]), `officialRules` (raw venue rule text per platform), `metadataGeneratedAt`.
  - Market row (candidate / outcome level): `marketGroupKey` (shared across venues for the same candidate), `marketMatchConfidence` (1 or 0.95), `platform`, `platformInternalId`, `price`, `priceNo`, `chance`, `bestBid`, `bestAsk`, `lastTradePrice`, `spread`, `volume`, `volume24`, `openInterest`, `liquidity`, `roi`, `apy`, `tradeUrl`, venue-specific status (`kalshiStatus`, `limitlessStatus`, `polymarketUmaResolutionStatus`), `unifiedStatus`.
  - Group summary: `chance` (consensus), `bestYesPrice`, `bestYesPlatform`, `spread`, `platformCount`, `lowConfidence`.
- **Consensus formula (H, llms-full.txt):** "PH Consensus" = volume-weighted mean of implied probabilities over markets that have traded and quote firmly (bid/ask gap <= 10c and Yes+No overround <= 10c); if none passes, plain volume-weighted mean flagged low confidence. Worked example in the doc: 60% with $9M and 64% with $1M gives 60.4%.
- **Price semantics are not uniform (M, inference from the fixture):** on the sample event `price` equals the best ask for Kalshi (22c, bid 21c) and Polymarket (20.5c, bid 20.4c), but sits mid-book for Limitless (20.5c with bid 19.5c / ask 21.5c). Treat PH `price` as display-only.

---

## 3. Chains and collateral

Not applicable to PH itself (no wallet, no deposits: "you cannot deposit funds or execute trades directly on this site", help center H). Chains and collateral are those of the five venues; see the per-venue specs from the parallel workflow. PH's Dune-sourced block lists Polymarket, Kalshi, Limitless, Predict and Opinion (H, fixture).

---

## 4. Read API

| Question | Answer | Tag |
|---|---|---|
| Official public API | NOT FOUND (searched: `/data`, `/pricing`, help center "Data & Sources" collection, robots.txt, llms.txt, llms-full.txt, sitemap, DNS for api./docs./developers./developer./data. subdomains, GitHub repo search for "predictionhero" (no PH-owned repo), WebSearch x3) | H |
| Commercial API (claimed) | "API & Data Licensing" at https://predictionhero.com/data: real-time probability/price, liquidity, volume, spreads, market depth, time to resolution; cross-venue comparisons incl. "pre-computed arbitrage opportunities ... best execution venue, expected profit, liquidity constraints"; historical archives; sentiment; indices (Global Election, Global Conflict, AI Regulation, Recession Probability); custom endpoints; JSON/CSV; sandbox; "99.9% Uptime SLA"; "API key authentication, rate-limit protection" | H (that it is claimed), L (that it works as described) |
| Endpoints, schemas, limits, pricing, websocket | NOT FOUND. The page says "Contact our team for ... flexible licensing options"; the "Contact" link shows no address | H |
| Help-center wording | "A public API or data export feature is available for research or professional use. To learn more, click here or reach out" (article dated 2026-09-09). Contradicts "enterprise licensing" on `/data` | H |
| Embeds | "free ... live odds that can be embedded" and a journalists page with citation guidelines and widgets (page is client-rendered, contents not retrievable without JS) | M |
| Front-end API | Same-origin `/api` (inline `window._env_`); a bare `GET /api` returned 404 JSON `{"message":"Cannot GET /api","error":"Not Found","statusCode":404}` (NestJS-style error body, M). Disallowed by robots.txt; not probed | H |
| Page-level machine-readable data | Event pages embed schema.org JSON-LD (WebPage, Event, ItemList of Product rows with "Current price", "Current probability", "Source") and a server-rendered React Router loader payload. Both are SEO/hydration artefacts, not an interface; the ToS bars scraping | H |
| Statements about upstream | "data sourced directly from leading prediction market platforms via their public APIs" (help center, 2026-04-14) | H |

Freshness (H, llms-full.txt): high-activity markets "as often as every 60 seconds"; others slower, depending on source limits. Trending score recomputed every 15 minutes.

Confirming response shapes: there is no API to GET. The closest first-hand shapes are the JSON-LD and page-state fixtures (section 13), captured from one allowed page fetch.

---

## 5. Trade path and PayBox

- **Trade path: none.** PH has no order entry, wallet connection or settlement. Each row has a `tradeUrl` that opens the venue with PH's referral parameters. (H)
- **PayBox reachability: no (for PH itself).** There is nothing to sign or propose. Execution legs live on the underlying venues; whether a PayBox EVM wallet can trade each of them is answered in their own specs. (Possibly relevant: if a licence were bought, payment would be an invoice/contract outside PayBox; no x402 or HTTP 402 behaviour was observed anywhere, M.)

---

## 6. Fees and monetisation

- **PH charges no trading fee** (it does not trade). Revenue seen: Standard subscription $24.95/month (help center, 2026-09-09, H), referral links to venues (H: `tradeUrl` values for Kalshi, Polymarket, Predict.fun and Limitless carry referral query parameters, codes redacted in the fixture; the Opinion link had none), and API/data licensing (price unpublished).
- **Plan split (H, help center):** free = browse, odds, 12 months of history, watchlist of 3 events; Standard adds Strike-Zone probability slider, 24h activity, spread, APY and ROI filters, unlimited watchlist, saved filters, 3 years of history, and the **Arbitrage scanner** ("Scan events for guaranteed-profit patterns"). I did not subscribe, so the scanner's logic, output and fee handling are NOT FOUND.
- **Displayed ROI/APY are gross of venue fees (M, inference):** the event page's worked example for Kalshi at 22c reads "455 shares ... Total Payout $455 ... Net Profit $355 ... ROI 355% ... APY 95% ... 825 days to resolution". $100 / 0.22 = 454.5 shares; $355 profit is exactly payout minus stake with no Kalshi taker fee; page-state `roi` 354.54 = (1/0.22 - 1) x 100 and `apy` 95.40 is consistent with compounding that ROI over 825 days. So any "arbitrage" or "ROI" figure from PH must be re-priced with our own fee models (Kalshi, Polymarket, etc. formulas are in the venue specs and `docs/aggregation-design.md`).
- Venue fees and who pays: see venue specs. The insights article list includes "Kalshi Fees vs Polymarket Fees" (not read; client-rendered).

---

## 7. Resolution, matching and dispute risk

- **PH does not resolve anything** (H). It mirrors venue status: `unifiedStatus` (active / resolved / disputed), Polymarket UMA state (`polymarketUmaResolutionStatus`, a `/uma-disputed` page), `kalshiStatus`, `limitlessStatus`.
- **Matching method (H, llms-full.txt, vendor description):** "semantic title analysis, outcome-structure comparison, entity recognition, time alignment, and market-classification logic"; FAQ: "may use automated semantic analysis or AI-assisted processing". No precision/recall published; `matchConfidence` / `marketMatchConfidence` exist but their derivation is NOT FOUND. Example fields: aggregated event 0.95, candidate rows 1 or 0.95.
- **Matched share (H, page state):** 2,795 matched event groups of 30,932 active event groups (9.0%); 33,813 active events; 425,485 markets. Only about 1 in 11 groups spans more than one venue.
- **Resolution Divergence Alerts (H, fixture):** for the 2028 presidential winner group the RDA says Polymarket resolves on AP/Fox/NBC calls with an inauguration fallback while Kalshi resolves solely on who is inaugurated, severity "normal", with edge cases (contested election, no inauguration). The text carries `metadataGeneratedAt` 2026-09-20 and the flag `resolutionRulesDetailsGenerated: true`, i.e. machine-generated and a month old at capture: treat as a lead, re-read both rule texts before trusting it (matches our rule-hash-pinned linking design in `docs/market-linking-design.md`).
- **Data-quality traps seen in one sample event (H, fixture):**
  - Opinion rows: 36 rows, the sampled one with `price` null, no bid/ask, `volume` 0, last update 2026-10-18T21:55Z (about 5 hours older than the others). Opinion's Dune block is also nearly empty (only `uniqueUsers` 256,733). Treat Opinion coverage as thin or lagging.
  - Predict.fun sampled row (Tulsi Gabbard): `price` 0.776, `bestBid` 0.002, `bestAsk` 0.776, `volume` $12.91 on an illiquid book. A naive gap scan would show a huge "edge" that is just an empty book.
  - Same candidate appears under different spellings across venues ("J.D. Vance", "JD Vance"); PH handles this with `marketGroupKey`.

---

## 8. Geo, ToS and automation

- **Terms of Use, last updated February 1, 2026 (H, https://predictionhero.com/terms):**
  - Sec. 6: do not "Attempt to reverse engineer, scrape, or abuse the platform"; do not "Misrepresent PredictionHero or its data".
  - Sec. 7: "You may not copy, reproduce, distribute, or create derivative works without prior written consent, except for personal, non-commercial use"; covers "data compilations".
  - Sec. 2: 18+. Sec. 14/15: US law, binding arbitration, class-action waiver. Sec. 4: not affiliated with any venue (yet outbound links carry referral parameters).
  - Terms contain no API rules ("the Terms don't set rules for API access"); API terms would come with a licence (NOT FOUND).
- **robots.txt (H, fixture):** `Allow: /` for all agents, `Disallow: /api/` and `Disallow: /search?`, Bytespider fully blocked, explicit `Content-Signal: search=yes, ai-input=yes, ai-train=yes` for named AI crawlers (including ClaudeBot). Crawler-friendly for public HTML, but the ToS still forbids scraping; the two are inconsistent and the stricter reading governs for us.
- **Geo:** no restriction stated for the site (help center: "In most jurisdictions, accessing market data ... is permitted"); trading legality is the venues' matter. (H)
- **Automation:** no sanctioned automated access exists short of a licence. Hard rule for this project: no scripted reads of PH pages in production; use it by eye only.

---

## 9. Liquidity (all figures are PH's own, 2026-10-19 ~03:05Z page state unless noted)

| Metric | Value | Source and caveat | Tag |
|---|---|---|---|
| Active events / event groups / markets | 33,813 / 30,932 / 425,485 | layout loader `metrics` | H (as PH reports) |
| Matched event groups | 2,795 | same; was 3,246 "matched events" on 2026-09-01 (M, search summary, definitions may differ) | H / M |
| Cumulative volume, all 5 venues | $144.96B (Kalshi $84.29B + Polymarket $51.86B = $136.15B, 94% of total) | `totalVolume`, `kalshiPolymarketVolumeStats` | H |
| 24h volume | $169.2M | `volume24h`. Looks low against Kalshi plus Polymarket alone, so PH's coverage or definition is partial (M) | H / M |
| Open interest | $1.69B | `totalOpenInterest` (PH sum) | H |
| Events per venue | Polymarket 18,127 (53.6%), Kalshi 12,290 (36.4%), Predict 2,528 (7.5%), Limitless 487 (1.4%), Opinion 382 (1.1%) | `platformEventShare` | H |
| Dune-sourced per-venue block | Polymarket: USD vol $96.5B, OI/TVL $353M, 3.25M users; Kalshi: OI $1.79B, tx 1.84B; Limitless: USD vol $3.90B, OI $0.3M; Predict: USD vol $6.77B, OI $11.4M; Opinion: users 256,733 only | `dune` block, `dataAsOf` mixed (2026-10-01 for notional volume and transactions, 2026-10-19 for OI). The home page tile "24H TRANSACTIONS 2,713,634,710" equals `dune.total.transactions`, a cumulative figure with a 2026-10-01 as-of date, so the tile label is wrong (M) | H / M |
| Example event liquidity (2028 US presidential winner) | total volume $797.3M, liquidity $62.1M, OI $51.8M; 24h volume is inconsistent within the same page: loader and FAQ text say about $0.52M, the rendered header says $141.6M (+173%) | event page, loader payload | H |

PH's numbers are an aggregate of other venues' liquidity and are not an independent pool.

---

## 10. Event categories that overlap (where cross-venue edge exists)

- 18 categories (H, llms-full.txt): politics, elections, world, financials, economics, companies, crypto, science-and-technology, education, health, climate-and-weather, transportation, entertainment, social, sports, mentions, commodities, other.
- Observed multi-venue groups (H, home/event pages): US 2028 presidential winner and party nominees (all five venues; 180 rows in the page's JSON-LD list, `marketCount` 254 in the aggregated event object), US midterms (House / Senate / balance of power), NFL game and spread/total markets, Fed decision in October, French and Brazilian presidential elections, Ballon d'Or, F1 drivers' champion, US recession by end of 2026. Category object `platforms` lists: Politics = Polymarket, Kalshi, Limitless; Education = Polymarket, Predict, Opinion.
- Per-category matched counts: NOT FOUND (not shown outside the paid scanner).
- Overlap with XO Market: **none**; XO is not a PH venue, so PH cannot supply XO linkage.

---

## 11. Shared liquidity and adapter ranking

- **Shared liquidity (H):** PH holds none; it is entirely derivative of Polymarket, Kalshi, Opinion, Limitless and Predict.fun. It is therefore NOT an independent arbitrage leg and never counts as a separate pool in `docs/platform-registry-design.md`. (Separately, Predict.fun is the engine behind Binance Web3 Wallet prediction trading per `docs/research/venues/ccxt-prediction-module.md`; that is a venue-level matter for the parallel workflow.)
- **adapter_priority: skip.** Reasons: no accessible API, no trading, duplicate liquidity, ToS forbids scraping and derivative use, five venues we already cover natively, matching is AI-assisted with no published accuracy, and its ROI/APY are gross of fees.
- **Where it can still help (cheap, non-automated):**
  1. Manual cross-check of our own linked pairs against PH "aggregated" events and RDA text (spot checks only, personal use, no stored copies beyond the small fixtures here).
  2. A checklist of rule-divergence phrasing (media call vs certification vs inauguration) to feed our rule-hash comparison.
  3. If we ever want a hosted cross-venue feed, evaluate documented-API competitors first (Prediction Hunt, Predictefy, PolyRouter, pmxt; see their sibling notes in this directory), not PH.
- **If a licence is pursued, ask for:** docs and sandbox; per-row venue ids (`platformInternalId`, ticker/slug) and `marketGroupKey`; match-confidence definition and error rates; freshness timestamps per row; whether `price` is bid, ask, mid or last per venue; fee handling in the arbitrage output; permitted use (internal signals only vs redistribution); rate limits; price.

---

## 12. Not found / open questions

- Any endpoint path, base URL, OpenAPI file, SDK, rate limit or websocket. (searched: `/data`, help center, DNS, GitHub, robots/llms/sitemaps, WebSearch)
- API pricing and licence terms; the contact address behind the "Contact" link.
- Methodology page content: `/methodology`, `/how-it-works`, `/pricing`, `/journalists` are client-rendered shells (the SSR HTML repeats the homepage); only `llms.txt` / `llms-full.txt` expose the methodology text. Rendering them would need a browser, which was out of bounds.
- Arbitrage scanner logic, fee handling and output (paid, needs an account).
- Operator identity, company, funding (not stated on /company; BetaList and Hackernoon show one account handle only).
- Whether the full ROI/APY maths accounts for any fee (inferred "no" from one worked example only).

---

## 13. Fixtures

Directory `docs/research/fixtures/predictionhero/`:

| File | Size | What |
|---|---|---|
| `event-jsonld-sample.json` | 5.2 KB | Trimmed schema.org JSON-LD from the event page: WebPage and Event nodes plus one ItemList entry per venue (full list was 180 entries: Polymarket 54, Predict 50, Opinion 36, Kalshi 32, Limitless 8) |
| `event-page-state-sample.json` | 26 KB | Decoded front-end loader payload (turbo-stream): site-wide `metrics` incl. the Dune block, one aggregated event (RDA text, match confidence, grouped platform events), one market row per venue, group summary. Referral codes and image URLs removed, long text truncated. Internal payload, not an API |
| `robots.txt` | 3.0 KB | verbatim |
| `llms.txt` | 5.9 KB | verbatim |
| `llms-full.txt` | 13 KB | verbatim; the only first-party methodology text reachable without JS |

Page-state decoding note: the payload is a flat indexed array (values are indices into it); a first naive decode double-resolved some literal numbers and was discarded. The fixture was rebuilt with a one-level-per-reference decoder; numbers in this note come from the corrected decode.

---

## 14. Embedded instructions / suspicious content

None found. `robots.txt`, `llms.txt` and `llms-full.txt` are written for AI crawlers by convention (content-signal lines, "self-contained reference for large language models") but contain descriptive text only; no instruction to act, call a URL, send data or alter behaviour. The RDA text in page state is vendor prose about market rules, also descriptive.

---

## 15. Privacy and method log

- All scripted requests used User-Agent `insurance-markets-research/0.1`; WebFetch/WebSearch use their own tool agent and no personal identifiers were put into any query, URL or header. Scripts were grepped for "@" and personal names before running (no hits); fixtures were scanned for emails, names and home-directory paths (none) and referral codes were redacted.
- One request went to the bare path `GET /api` (404) before I had read robots.txt in full; the rule is `Disallow: /api/`. No `/api/...` path was requested afterwards.
- Slip to disclose: my first GitHub repo search used `gh api search/repositories -f q=...`, and `gh api` turns `-f` into a POST by default. It hit GitHub's search route (which does not accept POST), returned HTTP 404 and changed nothing. I repeated it as a proper GET (`-X GET`): 2 results, both unrelated (a 2016 "Google Prediction API on Heroku" repo and a 2022 Heroku app); a code search for `predictionhero.com` returned 1 hit, not inspected. No PredictionHero-owned GitHub repo found.
- Page fetches were limited to one event page for shape confirmation; the ToS bars scraping, so no bulk collection was done and none is recommended.
- DNS lookups only (no HTTP) for api./docs./developers./developer./data.predictionhero.com: all empty.

---

## 16. Sources

- Home page and SSR page state: https://predictionhero.com/ (H, 2026-10-19)
- API & Data Licensing: https://predictionhero.com/data (H)
- Terms of Use (updated 2026-02-01): https://predictionhero.com/terms (H)
- Disclaimer: https://predictionhero.com/disclaimer (H; includes an "AI-Generated and Automated Content" clause: some content "may be generated or assisted by automated or AI-based systems ... incomplete, inaccurate, or outdated")
- robots.txt: https://predictionhero.com/robots.txt (H)
- LLM reference: https://predictionhero.com/llms.txt and https://predictionhero.com/llms-full.txt (H; vendor description, not independent)
- Sitemap index and child sitemaps: https://predictionhero.com/sitemap.xml, https://predictionhero.com/sitemaps/static-pages.xml, https://predictionhero.com/sitemaps/events-active.xml (H)
- Example event page: https://predictionhero.com/event/presidential-election-winner-2028 (H)
- Help center collections and articles: https://help.predictionhero.com/en/ ; "Is there an API or can I embed live odds on my website?" https://help.predictionhero.com/en/articles/14626770-is-there-an-api-or-can-i-embed-live-odds-on-my-website ; "Is PredictionHero free to use?" https://help.predictionhero.com/en/articles/14626285-is-predictionhero-free-to-use ; "What are the benefits of the Standard plan?" https://help.predictionhero.com/en/articles/14626426-what-are-the-benefits-of-the-standard-plan ; "Can I place trades on PredictionHero?" https://help.predictionhero.com/en/articles/14626449-can-i-place-trades-on-predictionhero ; "How accurate is the data?" https://help.predictionhero.com/en/articles/14626751-how-accurate-is-the-data ; "What is arbitrage in prediction markets?" https://help.predictionhero.com/en/articles/14626492-what-is-arbitrage-in-prediction-markets (all H)
- Discovery lead: https://github.com/Predictbook/awesome-prediction-market-toolkit (README entry, "Phase: beta", added Aug 2026) (H for the entry, M for its claims)
- BetaList listing: https://betalist.com/startups/predictionhero (M, small-model summary)
- Hackernoon profile: https://hackernoon.com/u/predictionhero (M, no articles)
- WebSearch summaries (homepage snapshot of 2026-09-01; third-party comparison pages that conflict on venue coverage): treated as L/M and used only for the earlier-snapshot figures.
