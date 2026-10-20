# Predictions Network (thebestpredictionmarkets.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (~03:00-03:20 UTC). READ-ONLY: public unauthenticated GETs of the site's HTML shells, `robots.txt`, `llms.txt`, `llms-full.txt`, `rss.xml`, sitemaps, 45 SSR `/compare/<slug>` pages (1 request per second, generic User-Agent `insurance-markets-research/0.1`), one static JS bundle, WebFetch of two public pages, one WebSearch. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. The site's internal JSON API (`/api/...`) was deliberately NOT requested: `robots.txt` disallows it for every user agent and it is undocumented (section 3). Third-party text was treated as untrusted data; nothing in it was followed.

Research limit: the shared WebSearch budget ran out after the first search. A Foregate follow-up search was refused, so Foregate facts below come from the site itself plus the sibling note `docs/research/venues/foregate-vision-probability-inc.md`, not from new research.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale (> 6 months). Nothing older than 6 months was relied on; the site's own legal pages are dated June 2026 and its geo matrix `asOf` values are 2026-06 to 2026-08.

---

## 0. Bottom line

1. **Live (H), but it is not a venue.** It is a consumer odds-comparison and affiliate site: "an independent comparison desk" that lists the same event across platforms and links out to trade. It "never takes bets, holds funds, or acts as a counterparty" (H, `llms.txt`). There is nothing to trade on it and no market of its own, so it can never be an arbitrage leg.
2. **No official or documented data API (H).** The only machine-readable outputs are `llms.txt`, `llms-full.txt` (10 platform fact sheets), `rss.xml` (latest 40 compared markets, titles only), sitemaps (5,000 market URLs) and server-rendered `/compare/<slug>` pages that carry the title and the *list of platforms* pricing the market but **no prices**. Prices, volumes, spreads and history come from an undocumented `/api/*` that `robots.txt` disallows (H). I did not probe it.
3. **Hourly refresh, self-declared lag (H).** Its own terms say "Prices refresh hourly and may lag the venue by a few minutes". Too slow to act on an arbitrage; fine as a hint list.
4. **Conflict of interest and unverifiable matching (H/M).** Revenue is affiliate commission (H, the site's own text). The operator looks like an SEO/affiliate agency whose "trusted by" logos include venues it ranks (M). Matching method is not published. A search-engine snapshot of its "price gaps" section cited an 88-point gap between two venues on the 2028 Democratic nomination market (L), which points to outcome-mapping errors or thin books.
5. **Its venue count is inflated by shared liquidity (H/M).** 23 of 24 sampled pages that list Foregate also list Polymarket, and a sibling note finds Foregate is a Polymarket-backed pass-through. The site's own registry marks `plus500` as `family: kalshi` and `predictstreet` as `family: matchbook`.
6. **Most useful as a discovery and benchmarking source, not a runtime adapter.** (a) Its client bundle ships a platform registry and geo-availability matrix naming venues we may not have covered (section 9). (b) The ~5,000 cross-venue matched-event pages are a free, noisy recall benchmark for our own market linker. Build no runtime adapter now.
7. **adapter_priority = P2 (signal-only).** Reasons in section 11.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://thebestpredictionmarkets.com/` | HTTP 200 (nginx), 8.4 KB SSR shell, title "Best Prediction Markets: compare prediction markets side by side"; `www.` host serves the same page | H |
| `sitemap.xml` index | 4 child sitemaps (pages, platforms, markets, archive), `lastmod` 2026-10-19T02:42 UTC, i.e. regenerated within the hour of probing | H |
| `sitemap-markets.xml` | exactly 5,000 `<loc>` entries (looks like a cap), `lastmod` range 2026-09-10 to 2026-10-19T02:34Z; 8 entries touched < 1 h ago, 719 < 24 h, 803 < 7 d, 3,468 < 30 d, 2 older | H |
| `rss.xml` | 40 items, newest `pubDate` Mon, 19 Oct 2026 02:34:11 GMT | H |
| Sample compare page `dateModified` | 2026-10-19T03:03:18Z | H |
| `robots.txt` last-modified | Sat, 10 Oct 2026 13:46:18 GMT | H |
| Legal pages | Terms and Responsible-trading tagged "June 2026"; footer "(c) 2026 Best Prediction Markets" | H |
| Launch date | NOT FOUND (searched: site pages and bundle strings; no "founded" or changelog; the earliest sitemap `lastmod` is only a touch time) | - |

Verdict: **still_live = true.**

The task hint says "10 venues in nav vs 12 in the awesome-list blurb". Both are wrong as a count of what is tracked: the nav and `llms-full.txt` list 10 platforms with their own pages, but the compare pages and bundle reference at least 21 platform ids (section 9). In 45 sampled compare pages, 13 distinct platform ids appeared.

---

## 2. Kind, operator and business model

- **Kind:** consumer odds-comparison site with affiliate outbound links, plus editorial articles, guides, per-country landing pages (`/us`, `/uk`, ... 111 country codes under `/<cc>/platforms`), promo-code pages (`/promo-codes/kalshi`, `/og`, `/prophetx`, `/predapp`) and a newsletter. (H, `sitemap-pages.xml`, 132 URLs in `sitemap-platforms.xml`)
- **Self-description (H, `llms.txt`):** "A market is only published once two or more independent platforms price it ... Prices are pulled live from each platform's own order book/market data, not estimated ... Revenue comes from affiliate commissions on outbound links; this never changes the odds shown or which venue is ranked cheapest."
- **Ranking:** own 1-5 editorial rating per platform (Polymarket 5.0, Kalshi 4.9, ProphetX 4.7, Gemini 4.6, OG 4.5, Limitless 4.4, PRED 4.4, Foregate 4.2, Futuur 4.1, SX Bet 4.1; H, `llms-full.txt`). Play-money venues are unrated (H, bundle string `page:about:rate:p2:c`).
- **Operator:** the comparison site never names a company on the pages I read (the About text is client-rendered; its strings are in the bundle and name none). Branding shows "Predictions Network": X account `x.com/Predictions365` and LinkedIn `linkedin.com/company/predictions-network` appear in the site's JSON-LD `sameAs` (H); a search engine titles the `www.` homepage "Predictions Network: compare prediction markets side by side (the United States)" (M). `predictionsnetwork.com` describes Predictions Network as a search-performance agency (SEO, paid search, "affiliate content distribution") with "10+ properties", a footer copyright to "Ellao Digital Limited", the same X handle, and "trusted by" logos for Polymarket, Kalshi, Crypto.com, Plus500, OG Prediction Markets, Foregate and Kapali (M: small-model summary of the page; the page does not name thebestpredictionmarkets.com). The site also publishes a Telegram "spread alerts channel" invite (private link, not joined) and a contact mailbox on the `predictionsnetwork.com` domain (H, bundle).
- **Implication (M):** treat ranking, "best odds" highlights and fee statements as marketing-adjacent. The operator's commercial relationship with several listed venues is plausible but unproven; its independence claim is self-asserted.

---

## 3. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API / docs | **NOT FOUND** (searched: `/docs`, `/api-docs` not in any sitemap or nav; `llms.txt`, `llms-full.txt`, `robots.txt`, About/FAQ strings in the bundle; no developer page; `predictionsnetwork.com` home page lists none) | H |
| Internal JSON API | Exists: `robots.txt` says "Only the JSON API is kept out of the index: it backs the pages themselves", `Disallow: /api/` and `Disallow: /__seo/` for every named agent. Route strings in the public JS bundle: `/api/home`, `/api/compare?...`, `/api/compare/<slug>`, `/api/history/<slug>`, `/api/charts/<slug>`, `/api/spreads`, `/api/search?q=`, `/api/archive?...`, `/api/resolved?...`, `/api/platforms`, `/api/offers`, `/api/geo`, `/api/analysis`, `/api/authors`, `/api/learn`, `/api/platform-logos/<id>`, `/api/subscribe`, `/api/track`. **Not requested** (robots disallow plus undocumented), so no response shape is confirmed. | H (existence), - (shape) |
| Rate limits, auth, WebSocket | NOT FOUND (API not probed; none documented). No `WebSocket`, `wss://` or `EventSource` string appears in the bundle (grep), so the client polls HTTP only. | - |
| Machine-readable public files | `/llms.txt`, `/llms-full.txt` (fact sheets for 10 platforms: rating, KYC, fees text, payout, regions, regulation), `/rss.xml` (title, link, pubDate, category, description; 40 newest comparisons; categories seen: world 15, crypto 8, politics 6, sports 5, entertainment 3, economics 3), `/sitemap*.xml` (CORS `*` on several of these). `robots.txt` explicitly welcomes named AI crawlers (GPTBot, ClaudeBot, Claude-User, PerplexityBot, CCBot, ...) to everything except `/api/` and `/__seo/`. | H |
| Server-rendered compare page | `/compare/<slug>` returns the title, breadcrumb and an `<h2>Platforms pricing this market</h2>` list of platform slugs, plus `dateModified` in JSON-LD. **No prices, no per-venue market ids or URLs, no outcomes.** The rest is client-rendered from `/api/compare/<slug>`. Fixture: `compare-page-ssr-sample.html`. | H |
| Pages that return nothing server-side | `/spreads`, `/markets`, `/about`, `/faq` return only a `<div id="root"></div>` stub (WebFetch of `/spreads` got only the title "Price gaps across every platform") | H |
| Fields visible on the client (from i18n strings) | per-comparison "Price", "Highest price", "Spread", "% cheaper on best", "Total volume", "Resolves", "Platforms", "Min - fees", hourly/daily/weekly/monthly/yearly price-history chart, a "Data may be outdated" stale badge, and "Implied probability by platform" matrix (raw, then ranked "after each platform's entry fee"). The spreads page says gaps are shown "before fees". | H (labels only) |

Net: a clean machine API would require asking the operator (About says "Partnerships, corrections, press or feedback: we read everything"). Absent that, there is no compliant way to pull its prices.

---

## 4. Trade path and PayBox reachability

- **Trade path: none (H).** It does not take orders; every "Trade" button is an affiliate redirect to the venue (H, i18n `compare:cta:trade`, `compare:about:affiliate-note`). Do not follow those links (they carry referral parameters).
- **PayBox: not reachable (`no`).** There is no contract, no signed-order endpoint and no deposit address; nothing for a wallet to propose. Reachability must be assessed per underlying venue, not through this site.

---

## 5. Fees

- **Site fees:** none to users (H, "Reading comparisons ... is completely free").
- **What it says about venue fees (fact sheets, H as statements, but see the caution):**
  - Polymarket "No trading fee: only Polygon gas (cents)"
  - Kalshi "Per-contract trading fee"
  - Limitless "No platform fee: only Base network gas"
  - SX Bet "Small fee on matched order fills"
  - Gemini/OG "per-contract"
  - ProphetX "~2% commission on net winnings only"
  - PRED "Exchange spreads; on-chain gas on Base"
  - Foregate "0% claim fee; network gas only"
  - Smarkets "2% commission on net winnings" (from the bundle registry)
- **Caution (M):** the Polymarket line is out of date. `docs/research/08-venues-polymarket-kalshi.md` (a sibling note, H there) documents category taker fees (for example 0.05 sports, 0.07 crypto, 0.04 politics, geopolitics 0) with a maker rebate, and a sibling note finds Foregate adds a 2% fee. The site's "best price after each platform's own entry fee" ranking therefore cannot be used for fee-accurate arbitrage math. Compute fees from each venue's own documentation.

---

## 6. Resolution mechanism and dispute risk

- The site resolves nothing. Its `/resolved` (last 7 days) and `/archive` ("Resolved markets and the final odds each platform closed at") pages are client-rendered from `/api/resolved` and `/api/archive` (not probed). (H for the descriptions in `llms.txt`)
- The site publishes no rule-text comparison. Whether two matched contracts have the same resolution criteria is outside what it shows; a sibling note (`08`) already documents a Polymarket/Kalshi pair with different rule text and a negative net edge. **Matched title is not matched resolution.** (M)
- No dispute-risk data of its own.

---

## 7. Geo, ToS and automation rules

- **Terms of Use (H, bundle strings, "June 2026"):** four sections only: (1) informational only, "Prices refresh hourly and may lag the venue by a few minutes"; (2) no custody, no execution; (3) affiliate disclosure; (4) eligibility 18+. **No clause about scraping, automated access, API use, redistribution or licensing** (NOT FOUND in those strings; the rendered Terms page was not readable server-side).
- **robots.txt (H):** one group for all agents; `Allow: /`; `Disallow: /api/` and `Disallow: /__seo/`. Crawling the HTML (`/compare/*`, sitemaps, RSS, llms files) is permitted; the JSON API is not for crawlers.
- **Geo matrix (H, bundle, per-platform `asOf` 2026-06 to 2026-08):** the site ships a per-platform availability map. Examples: Polymarket global except US via "Polymarket US (QCX LLC ...)" with state overrides (AZ, IL, MD, MA, MI, MT, NV, OH blocked); Kalshi served outside its `overrides`; Gemini and OG US-only; Smarkets allow-list (UK, Ireland, Malta, Sweden, Crown Dependencies, Gibraltar); Opinion Labs "very broad blocklist: US/UK + all EU/EEA + an Asia set"; Limitless and SX Bet US blocked. Useful as a lead, but self-reported with `confidence` fields from "low" to "high" (Pascal's geo list "UNVERIFIED"). Fixture: `bundle-geo-matrix-excerpt.js`.
- **For us:** reading public HTML at low rate is allowed; reading `/api/` is not (robots). If we ever want its API, ask the operator.

---

## 8. Liquidity and coverage

- **Venue liquidity:** none; it is not a venue. TVL, OI: N/A.
- **Site traffic / "volume":** NOT FOUND (the "Total volume" per comparison is client-rendered; no traffic figure published). The sitemap lists 5,000 market URLs on 2026-10-19 (H), which looks like a hard cap rather than the true total.
- **Composition of the 5,000 compare URLs (H, slugs):** 4,515 (90.3%) contain "-vs-" (match-winner and similar head-to-head markets); the rest are futures and yes/no events.
- **Platform co-occurrence (H, my sample of 45 random compare pages, `random.seed(7)`, 2026-10-19):** pages list 2 platforms in 25, 3 in 10, 4 in 5, 5 in 3, 7 in 2 of 45. Platform counts: polymarket 29, foregate 24, kalshi 22, smarkets 11, limitless 9, gemini 8, og 7, sxbet 7, futuur 4, prophetx 2, opinionlabs 2, matchbook 2, predictfun 2. Foregate with Polymarket: 23 of 24. Fixture: `compare-platform-membership-sample-45.json`. (Small sample; do not extrapolate precisely.)
- **Sampled slugs with "-2", "-3", "-4" suffixes** (for example `coastal-carolina-vs-marshall-3`, `zimbabwe-vs-west-indies-6`) mean multiple comparisons for the same pairing; whether these are different dates, different bet types or matcher duplicates is NOT FOUND (M that the matcher is not guaranteed one-to-one).

---

## 9. Event categories, overlap and venue leads

**Category overlap where arbitrage exists (H for labels, M for depth):** the site's eight category pages are politics, crypto, sports, economy, culture, geopolitics, tech, science (plus "world" and "entertainment" in RSS). Sampled coverage is dominated by sports and esports head-to-heads (MLB, NCAA football, NBA, soccer, tennis, CS/Dota, UFC, cricket) and long-dated futures (2028 US presidential and nominee markets, Spain PM, Ligue 1/LaLiga/F1 champions, OpenAI IPO, "Clarity Act signed in 2026", crypto price targets). These are the same classes our scanner targets. The site cannot tell us whether any pair is *tradable*, because it hides book depth.

**Venue registry in the public JS bundle (H; fixture `bundle-platform-registry-excerpt.js`), 18 ids with their own tagline, plus 3 server-side-only ids:**

| id | what the registry says | note for us |
|---|---|---|
| polymarket, kalshi, limitless, futuur, manifold, myriad, opinionlabs, predictfun | already covered by the parallel workflow | skip here |
| sxbet | on-chain P2P sports exchange | sibling note `sx-bet.md` |
| gemini, og | US CFTC event contracts | sibling notes exist |
| smarkets | UK exchange, registry blurb says "Real-time and historical odds via a free API" (M, vendor claim) | sibling note `smarkets.md` |
| matchbook | UK betting exchange | sibling note `matchbook-predictions-triplebet-ltd-uk.md` |
| predictstreet ("ADI Predict Street") | `family: "matchbook"` (same liquidity) | not an independent leg |
| plus500 | `family: "kalshi"`, `isBrandLive: false` (broker route into Kalshi contracts) | not an independent leg |
| pascal | "Non-custodial order-book prediction markets on Solana ... keyless public read API", `isBrandLive: true` | lead; sibling note `pascal.md` |
| hyperliquid | "On-chain markets on a high-speed L1 ... validator-settled", USDH, World Cup/FOMC/CPI | lead; sibling notes `hyperliquid-hip-4-*.md` |
| azuro | `enabled: false` in the registry; "Decentralized sports liquidity on Polygon" | sibling note `azuro.md` |
| prophetx, predapp (PRED), foregate | on `llms-full.txt` and compare pages but not in the bundle (server-side) | sibling notes `prophetx.md`, `pred.md`, `foregate-vision-probability-inc.md` (Foregate = Polymarket pass-through) |

The registry's `enabled:false` flag on `opinionlabs` and `azuro` conflicts with `opinionlabs` appearing on live compare pages (2 of 45) (M: flag semantics unknown).

**Shared liquidity (important for dedup):** the site itself lists Foregate, Plus500 and ADI Predict Street as separate platforms, but they are Polymarket-backed, Kalshi-backed and Matchbook-backed respectively (see rows above and the Foregate note). Counting them as extra "legs" overstates independent pricing.

---

## 10. Data-quality red flags

1. Hourly refresh and "may lag by a few minutes" (H, terms).
2. Fee claims simplified or stale (section 5).
3. No published matching method; slug suffix duplicates; an 88-point cross-venue gap cited by a search engine (L, cached snapshot of the home "Where the platforms disagree" section, probably a mis-mapped outcome or a dead book).
4. Geo/availability fields are self-reported (`confidence` low to high).
5. Affiliate revenue model; operator is an SEO/affiliate agency (M).

---

## 11. adapter_priority = P2

- **Not P0/P1:** it adds no independent liquidity (it has none), has no documented API, refreshes hourly, hides book depth, and its machine-readable API is disallowed to crawlers.
- **Not "skip":** it is live and it carries two things our project can reuse at no cost: (a) a registry/geo matrix naming venues and shared-liquidity "families" (already folded into the sibling notes), (b) a noisy but broad set of cross-venue title-matched events with platform membership, usable as a recall benchmark for our own linker.
- **Recommended handling:**
  1. Do not build a runtime adapter.
  2. Optionally run a low-rate offline job (<= 1 request/second) over `sitemap-markets.xml` to harvest `{slug, title, platform set}`, then check whether our linker finds the same groupings. It gives no prices or venue market ids, so it validates recall only.
  3. Treat the Telegram "spread alerts" and `/spreads` list as human hints, never as execution signals.
  4. If a data feed is ever wanted, request it via the operator's partnership contact and get licence terms in writing (no terms on automated use exist today).

---

## 12. Fixtures (all <= 50 KB) in `docs/research/fixtures/predictions-network-thebestpredictionmarkets-com/`

| File | What | Size |
|---|---|---|
| `robots.txt` | full robots file | 1.2 KB |
| `llms.txt`, `llms-full.txt` | site index and 10 platform fact sheets | 5.4, 12.0 KB |
| `rss.xml` | latest 40 compared markets (2026-10-19 02:34Z) | 21.2 KB |
| `sitemap-index.xml` | 4 child sitemaps | 0.7 KB |
| `sitemap-markets-head-sample.xml` | first 12 `<url>` of 5,000 | 2.8 KB |
| `compare-page-ssr-sample.html` | SSR response for `/compare/democratic-nominee-for-2028-presidential-election` | 9.5 KB |
| `compare-platform-membership-sample-45.json` | {slug: {title, platforms[]}} for 45 random compare pages | 7.5 KB |
| `bundle-platform-registry-excerpt.js` | the client bundle's platform registry object (names, fees text, regions, families) | 12.6 KB |
| `bundle-geo-matrix-excerpt.js` | the bundle's per-platform geo-availability map | 12.4 KB |
| `bundle-api-route-strings.txt` | the `/api/...` route literals found in the bundle (not requested) | 0.7 KB |

There is no fixture of an API response because no compliant public API response was available.

---

## 13. Not found / open questions

- NOT FOUND: official API, API docs, rate limits, auth, WebSocket (searched: robots, llms files, sitemaps, nav, bundle route strings, operator home page).
- NOT FOUND: scraping/automation clause in the Terms (only 4 sections in the bundle strings; rendered Terms page not read).
- NOT FOUND: matching methodology, tolerance rules, how "same outcome" is decided, how "fees" are computed per venue, per-venue price source (REST, WebSocket or subgraph).
- NOT FOUND: site launch date, traffic, true total market count (sitemap capped at 5,000).
- NOT FOUND: the actual operator-venue commercial relationships.
- Open: does the operator license a data feed? Does `/api/` permit non-crawler programmatic use under a partnership? Is the 5,000 cap in the sitemap or in the product?

---

## 14. Sources

Primary (H):
- https://thebestpredictionmarkets.com/ and https://www.thebestpredictionmarkets.com/ (SSR shell)
- https://thebestpredictionmarkets.com/robots.txt
- https://thebestpredictionmarkets.com/llms.txt and https://thebestpredictionmarkets.com/llms-full.txt
- https://thebestpredictionmarkets.com/rss.xml
- https://thebestpredictionmarkets.com/sitemap.xml, `sitemap-pages.xml`, `sitemap-platforms.xml`, `sitemap-markets.xml`
- https://thebestpredictionmarkets.com/compare/democratic-nominee-for-2028-presidential-election and 44 other `/compare/<slug>` pages (sample list in the JSON fixture)
- https://thebestpredictionmarkets.com/assets/index-BWoh2EXD.js (public client bundle: i18n strings for About/FAQ/Terms/Privacy, platform registry, geo matrix, API route literals)
- https://thebestpredictionmarkets.com/spreads, `/about`, `/faq` (client-rendered stubs; only titles readable)

Secondary (M/L):
- https://predictionsnetwork.com/ (WebFetch summary: SEO/affiliate agency, copyright holder, logos; M)
- https://x.com/Predictions365 and a web search summary of "Predictions Network" (search-engine snapshot; the 88-point-gap example is L)
- Sibling notes in this repo: `docs/research/14-platform-of-platforms.md` (section 2.6, which already lists this site), `docs/research/08-venues-polymarket-kalshi.md` (Polymarket fee schedule), `docs/research/venues/foregate-vision-probability-inc.md`
