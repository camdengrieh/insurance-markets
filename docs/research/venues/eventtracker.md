# EventTracker (eventtracker.ai, by PodComet) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Sources: the public pages of eventtracker.ai (fetched through the fetch tool, which returns model summaries, plus raw robots.txt / sitemap.xml / llms.txt via curl), a search-engine result set, GitHub search, and two third-party directory pages. No account, no login, no wallet, no POST, no signing, no payment, no browser automation. The internal `/api/` prefix was NOT requested. WebSearch budget ran out partway through the session, so third-party coverage is thin.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference; **L** = weak/stale. Where something is not documented it says NOT FOUND (searched: ...).

Fixture: `docs/research/fixtures/eventtracker/liveness-and-access-probes-2026-10-19.txt` (status codes only; NOT an API response, because no public API exists).

---

## 0. Bottom line

1. **EventTracker is not a venue. It is a display-only, read-only analytics site that re-publishes data from 29 other venues** ("takes no wagers, holds no funds, and operates no order book", llms.txt; "We do not execute trades or hold customer trading funds", /about-us). There is nothing to trade on it and no market to list in an arbitrage graph. (H)
2. **Still live as of 2026-10-19**: /home and /coverage return 200 today, robots.txt was edited 2026-07-05, Terms dated June 21 2026, newest blog post October 15 2026. Product looks about six months old (its own data starts 2026-04-29). (H)
3. **No data API.** /coverage: "REST API - coming soon. No data API is offered today." The planned REST API is for ET& subscribers only. No docs, no OpenAPI, no SDK, no repo. (H)
4. **The Terms ban what we would have to do to ingest it today**: no robots/scrapers/headless browsers "except through interfaces PodComet provides, such as the ET& API"; no redistribution without written permission; data for "personal or internal business use only"; no building "competing products". Even once the API ships, an arbitrage scanner is arguably a competitor to its ET& "arbitrage alerts" and "Cross-Venue board". (H for text via fetch summary; M for my reading of the competing-product clause; not legal advice.)
5. **Not reachable from PayBox**: only payment is a card subscription on its website. No chain, no token, no signing.
6. **adapter_priority = skip.** Value to this project is as a manual cross-check (its venue list, its published fee schedules and volume measurements, its feature set to emulate), not as an adapter or a signal feed. Revisit if the ET& REST API ships and a written data-use agreement covers a scanner.

---

## 1. Is it still live? (2026) and identity

| Evidence | Result | Tag |
|---|---|---|
| `GET https://eventtracker.ai/home`, `/coverage`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` on 2026-10-19 | all HTTP 200, served via Cloudflare | H |
| robots.txt header comment | "Last updated 2026-05-26 (build .231)"; AI-crawler block added "2026-07-05 (GEO)" | H |
| Terms https://eventtracker.ai/terms | "Last updated June 21, 2026"; operator PodComet LLC, a Wyoming LLC; still contains bracketed `[COUNSEL: ...]` drafting notes in sections 5.5 and 15.2, so it is not final | H (fetch-tool summary) |
| Blog https://eventtracker.ai/blog | newest post "Oct. 11th: A Prediction Markets Day to Remember", dated October 15 2026; earlier posts Sep 24, Sep (newsletter 01), Oct (newsletter 02) | H |
| Awesome-list issue https://github.com/Predictbook/awesome-prediction-market-analytics-tools/issues/15 | maintainer added EventTracker under "Cross-Platform Odds Aggregators" on 2026-09-21; asked for a backlink on 2026-10-18 | H (issue text is third-party, untrusted) |
| Launch date | NOT FOUND as a statement. Blog says its records run "April 2026 onward" and its measurement window starts April 29 2026 | M |
| Operator | PodComet LLC. Co-founders named on /about and in the issue: a CEO (information-science background) and a Chief Communications Officer; "six independent co-founders" is claimed in a listing blurb, only two are named | M |
| Older beta label | A search-result snippet said podcomet.ai showed "Beta v0.2" with a feed from Polymarket, Kalshi, Manifold, Limitless, MetaForecast and PMXT. podcomet.ai now 302-redirects to eventtracker.ai, so that snippet is an old build | L (stale) |
| Hosting | Cloudflare; every response carries `Link: <https://huggingface.co/spaces/PodComet/podcomet-event-meter>;rel="canonical"` (that Space returns 401, private or gated) | H (header), M (meaning) |

Verdict: **still_live = true**.

Venue count is inconsistent across its own material: 29 (coverage page, home, llms.txt), 28 (Oct 15 blog: "49,688 live markets on Oct. 11 across 28 venues, with 25 venues trading"; also the number the awesome-list used), "over 20" (press release quoted in the issue), 24 venues in the Sep 24 window, and a logo grid of 32 names on /home that includes Hyperliquid and is not in the coverage table (H, fetch summaries). Treat 29 as the upper bound of the current coverage page.

## 2. Kind and market model

- **Kind:** third-party aggregator and research dashboard; "independent", "unaffiliated", claims no payment from venues for coverage or placement and no affiliate links (Oct 15 blog, llms.txt). Describes venues as "partners" on /about, but no data-partnership terms are published (H).
- **Market model:** none of its own. It normalises other venues' binary, categorical and sports markets into "events" with cross-venue matching ("same event matched across venues"), a "Fair Price" consensus, and a 0 to 100 "TeeKee" confidence score for events listed on more than one venue. How matching works is NOT FOUND (searched: /why-etand, /about-us, llms.txt, blog index). Proprietary scores: "ETScore", "ETτ" (Terms).
- **Extra boards:** perpetuals (kept separate from the event-contract book so their "much larger volumes" do not distort prediction-market figures), combos/parlays, smart-money wallets, news (GDELT proxy appears in the CSP). (H, /why-etand)
- **Tokenisation:** not applicable.

## 3. Chains and collateral

None. It holds no funds. Subscription payment is by card; "Payment is by card, and you can cancel anytime" (H, /why-etand). No crypto payment, x402 or on-chain checkout is mentioned (NOT FOUND, searched: /why-etand, /terms, /home).

## 4. Read API

| Item | Detail | Tag |
|---|---|---|
| Official public API | **None.** "No data API is offered today." Planned: "REST API - coming soon" for ET& subscribers | H (/coverage, /home, /why-etand, llms.txt) |
| Docs | NOT FOUND (searched: /docs, /api, /openapi.json all 302 to /signup; sitemap lists no developer page; GitHub org PodComet has only unrelated repos: a football simulator, an equipment-metadata project, a research repo) | H |
| Internal API | robots.txt disallows `/api/`, `/wallet/`, `/donate`, `/tg/webapp` for archive.org and for named AI crawlers, so an internal `/api/` exists. It is undocumented, was not called, and the Terms prohibit automated access outside provided interfaces | H (robots.txt), M (that it carries market data) |
| Public pages | /home and /coverage are public; /events, /markets and everything else redirect to /signup (login wall) | H |
| Websocket / push | NOT FOUND for any API. The app uses Pusher Beams for push notifications and Telegram alerts for ET& (CSP header, /why-etand) | H |
| Auth / limits for the future API | NOT FOUND. Terms refer to "API keys" that must be confidential and per-account, "rate limits or tier gating" that may not be circumvented, and "Feed Data from APIs or bulk exports" as confidential (H, fetch summary of Terms). The Terms therefore anticipate keys, tiers and bulk exports, but nothing is documented | M |
| Refresh cadence of its own data | Free: "refreshed once per collect cycle (>= 15 min apart)". ET&: "<= 45 s = the most-traded markets on that venue" for 5 venues only (Futuur, Kalshi, Limitless, Polymarket, Polymarket US); 3 venues "Daily = the venue publishes one end-of-day file" (ForecastEx, Rothera, Underdog UDX); the other 21 are >= 15 min on both tiers. /why-etand also says sx.bet order books update "as they change" on ET&, which conflicts with the sx.bet row (>= 15 min) | H (/coverage, /why-etand), conflict noted |

So even as a signal feed it would be at best 45 s old on five already-covered venues, and 15 min or daily on the rest. For an arbitrage scanner that is stale; our own adapters must read each venue directly.

## 5. Trade path

**None.** "We do not execute trades" (/about-us). No orders, no signing, no wallet connect for trading. "My Positions" imports holdings from a *public Polymarket wallet address* for display (read-only; ET& feature), and manual entries for other venues. (H)

## 6. PayBox / EVM wallet reachability

**no.** There is no on-chain component and no trade endpoint. The only purchasable thing is the ET& subscription ($22/mo or $199/yr, 7-day free trial that auto-converts, card only), which is a website checkout, not a transaction proposal or signed order. If the REST API ships, its key would be a secret credential (PayBox `request_secret` territory) rather than a wallet action. Nothing was purchased or signed. (H for pricing; M for the key-as-secret idea)

## 7. Fees

EventTracker itself: Free tier $0 (email + password; follow 1 wallet + 1 event); ET& $22/mo or $199/yr (about three months free vs monthly), 7-day trial, auto-renew, fees non-refundable except statutory rights, liability capped at greater of 12 months' fees or USD 100. (H, /home, /why-etand, /terms)

**It publishes other venues' fee schedules, which are directly useful for a scanner.** Newsletter Issue 02 "The Uncertainty Tax" (https://eventtracker.ai/blog/2026-10-issue-02-the-uncertainty-tax), "fee schedules as published on September 18, 2026" (H for what the post says; M that each rate is current, since venues "may change their fee schedules"):

| Venue | Structure per EventTracker | Rates cited |
|---|---|---|
| Kalshi | per-trade fee on takers, plus the buy/sell gap | rate 0.07 |
| Polymarket | per-trade fee on takers, part rebated to patient (maker) traders | 0.07 crypto, down to 0.04 politics, zero on geopolitics |
| Polymarket US | taker fee, rebate to patient traders | moved to 0.0695 on Sep 16 2026 |
| Opinion | taker fee, half rebated to patient traders | rate not stated |
| Novig | gap, plus fee once a game is live (takers, live play only) | 0.03 once live |
| PredictIt | 10% of winning profit, 5% of withdrawals | |
| sx.bet | gap, plus 5% of profit on winning parlays; singles have no fee | |

The post's worked examples fit **fee = rate x contracts x p x (1 - p)** (100 contracts at 50c on Kalshi = 0.07 x 100 x 0.25 = $1.75; Polymarket politics 0.04 x 100 x 0.25 = $1.00; Kalshi at 10c or 90c = $0.63). The formula is my inference from the examples (M), not stated by EventTracker. Typical buy/sell gaps it measured: Polymarket 2c (54,516 readings, Apr-Aug), Kalshi 5c (156,654 readings, Jun-Aug), Opinion 7c (87 readings, Aug only, thin), PredictIt full-outcome price sum $1.01, Novig $1.00 (H, its own tracking).

## 8. Resolution mechanism and dispute risk

EventTracker resolves nothing. Its "event intelligence" page shows resolved, refunded and voided markets per venue (H, /home). The risk for us is different: **its cross-venue matching and "arbitrage alerts" disclose no matching method, no threshold, and no statement of whether fees or resolution-rule differences are netted** ("The page does not explain how markets are matched across venues, what gap thresholds trigger an alert, or whether fees are deducted", /why-etand fetch). Any "same event" pair it shows may carry settlement-rule basis risk (different oracles, cutoff times, void rules), so its alerts are leads, not riskless arbitrage. (M)

## 9. Geo / ToS / automation

- Operator PodComet LLC (Wyoming), governing law Wyoming; users 18+; "Users are solely responsible for complying with local laws, including those governing access to linked venues" (H, fetch summary).
- **Automation:** quote: "must not use any robot, spider, scraper, headless browser, or other automated means to access" the Service except via interfaces PodComet provides (H, /terms, fetch summary; short quote). Circumventing rate limits or tier gating is banned.
- **API data:** quote: "must not relay, submit, resell, or otherwise provide data obtained through the API to any third party" (H). API keys are per-subscriber and confidential.
- **Redistribution:** no copying, republishing or sharing data, scores or analyses "without our prior written permission"; "personal or internal business use only"; no competing products or earning revenue from third parties using its data without a separate written agreement (H).
- robots.txt: no `User-agent: *` disallow; explicit welcome to AI crawlers for public content, but `/api/` and `/wallet/` off-limits (H). That allows reading public pages, not scraping an internal API.
- Consequence: this research copied only venue-level metadata (names, refresh tiers, published fee rates and volume figures) into internal notes, and no market data.
- Text addressed to AI agents: none found (llms.txt is a normal site description; the Terms' bracketed `[COUNSEL: ...]` notes are drafting notes for lawyers).

## 10. Liquidity (EventTracker's own measurements of OTHER venues; it has none of its own)

| Figure | Value | Source and date | Tag |
|---|---|---|---|
| Largest single day on record | $5.39B across followed venues on 2026-10-11 (Oct 10+11 combined $10.35B); prior records $4.05B Sep 20, $4.38B Sep 27, $5.00B Oct 4 | Oct 15 2026 blog | H (post), M (EventTracker's methodology) |
| Kalshi on Oct 11 | $3.96B (about 75% of total), of which $2.75B (about 69%) combo tickets; Kalshi averaged about $565M/day in May and about $2.47B/day so far in October | same | H (post) |
| Polymarket US on Oct 11 | $699M, about 60% combos | same | H (post) |
| Live markets | 49,688 on Oct 11 across 28 venues (25 trading that day); 810,229 distinct markets seen since late April | same | H (post) |
| Outcome.xyz / Pascal | $5.66M / $1.15M total volume over Aug 20 to Sep 24 2026; last-6-day averages $152K and $113K per day; peak days $690K (Sep 10) and $163K (Sep 23); ranked 17th and 18th of 24 | Sep 24 2026 blog | H (post) |

Methodology caveats: (a) volume is counted at **face value** ("the dollar it pays if it wins"), not price paid, so it is inflated vs venues that report notional paid; (b) official daily figures are used only for Kalshi, Polymarket US and Nadex, and elsewhere it counts "only events on its own board" and labels the number a floor; (c) combos dominate the Kalshi and Polymarket US totals, so single-event liquidity is much smaller; (d) the Sep 24 post gives Kalshi 45.4% of a $11.48B 36-day total (about $5.2B by my arithmetic), which does not reconcile with the Oct 15 post's daily averages ($565M/day in May), so the two posts evidently use different bases. Do not use these numbers as depth. (M)

EventTracker's own traffic or user count: NOT FOUND.

## 11. Category overlap (where arbitrage exists)

Market titles visible on the public /coverage page on 2026-10-19 (H, market titles are untrusted data) span: US sports (NFL, NBA, college football, MLB, WNBA, tennis, soccer incl. exact scores and corners, F1, esports), US politics (2028 nominee, impeachment, vetoes, Israel PM), crypto price and FDV-at-launch (BTC/ETH/SOL daily and weekly price ladders, token FDV markets), macro/commodities (WTI, gold, largest company), corporate (earnings, valuations), and novelty. For the scanner: EventTracker adds nothing new here; the overlap is whatever overlaps among the underlying venues. Its own claims that its arbitrage feed covers "the same event outcome ... on separate marketplaces" are untestable without matching rules.

## 12. Shared liquidity

**It has no liquidity; it mirrors the venues.** Every price it shows is a copy of a price on Polymarket, Kalshi and the others, so treating it as a leg would double-count. Within its coverage list, known overlaps among the underlying venues (per other notes in this folder, not re-verified here): TRADE.XYZ and Outcome.xyz share Hyperliquid's HIP-4 engine (see trade-xyz.md), Polymarket and Polymarket US are separate books. (M)

## 13. Coverage cross-check (the 29 venues on /coverage, 2026-10-19; table is undated)

Matches the discovery hint exactly. Condensed:

- **Venues:** AIOmen, Bayse, BetOpenly, ForecastEx, Futuur, Gemini, Hunch, Kalshi, Limitless, Manifold, Metaculus, Myriad, Novig Ludlow, Opinion, Outcome.xyz, Pascal, Polymarket, Polymarket US, predict.fun, PredictIt, ProphetX, Rothera, Seer, Smarkets, sx.bet, TRADE.XYZ, Underdog UDX, world.xyz, XO Market. All "Now" (H).
- **Prices:** all 29. **Volume:** 21 (missing for Bayse, BetOpenly, Futuur, Hunch, Metaculus, Novig Ludlow, ProphetX, Seer). **Depth:** only 12 (BetOpenly, Kalshi, Limitless, Outcome.xyz, Pascal, Polymarket, Polymarket US, predict.fun, Smarkets, sx.bet, TRADE.XYZ, world.xyz). **OI:** 13 (BetOpenly, ForecastEx, Futuur, Hunch, Kalshi, Pascal, Polymarket US, predict.fun, Rothera, Seer, Smarkets, Underdog UDX, world.xyz).
- **XO Market row:** Prices, Volume, no Depth, no OI, >= 15 min on both tiers (H). So EventTracker is no help for XO book data.
- **Named in prose but absent from the table:** Nadex (official daily figures used, Oct 15 blog) and Hyperliquid (logo grid). Open question whether they are additional sources (M).
- **Not in the "already covered" set of this research stream and therefore worth a venue-spec each** (leads, not verified): AIOmen, Bayse, ForecastEx, Futuur, Gemini, Hunch, Metaculus, Novig Ludlow, Outcome.xyz, Pascal, ProphetX, Rothera, Seer, Smarkets, sx.bet, TRADE.XYZ, Underdog UDX, world.xyz, BetOpenly. EventTracker's volume measurements say Outcome.xyz and Pascal are tiny (about 0.05% and 0.01% of tracked volume over 36 days), so treat them as P2 unless their own docs say otherwise.

## 14. How EventTracker could still help this project

1. **Manual cross-check** of our market-linking output against its Cross-Venue board and TeeKee score (needs a paid ET& login used by a human; no automation; do not store or redistribute its data).
2. **Feature benchmark:** it ships what our aggregation layer plans: consensus fair price, per-venue refresh tiers, arbitrage alerts on the top-traded markets at 45 s, combos/perps segregated from the event book, a freshness stamp on every cross-venue price ("each row stamped with how old its price is").
3. **Fee-model source:** the Sep 18 fee schedule table in section 7, to be re-verified at each venue's own docs before use.
4. **Not a signal feed** until a documented API exists and permits internal-use quant tooling.

## 15. Suspicious content / embedded instructions

None found. /llms.txt, /coverage, blog posts and Terms contain no instructions addressed to AI agents. The coverage page lists live market titles scraped from venues (data only). The `[COUNSEL: ...]` notes in the Terms are lawyer drafting notes.

## 16. Open questions

1. Will the ET& REST API ship, with what auth, rate limits and field set, and does its licence allow an internal arbitrage scanner (the competing-product clause)?
2. How does EventTracker match events across venues, and does its arbitrage engine net fees and resolution-rule differences?
3. How does it source each venue (public APIs, PMXT-style unified library, partner feeds, scraping)? An older snippet suggested PMXT and MetaForecast (L).
4. Is the sx.bet refresh tier ">= 15 min" (coverage row) or "as they change" (/why-etand)?
5. Are Nadex and Hyperliquid additional sources beyond the 29 listed?
6. Reconcile the 29 / 28 / "over 20" venue counts.

## Sources

- https://eventtracker.ai/coverage and https://eventtracker.ai/home (fetched 2026-10-19; /coverage raw HTML also pulled via curl and scanned for long text): coverage table, "No data API is offered today", refresh tiers, pricing, feature list. H
- https://eventtracker.ai/why-etand (2026-10-19, fetch summary): ET& features, 45 s refresh, pricing, API coming soon. H
- https://eventtracker.ai/about-us and https://eventtracker.ai/about (2026-10-19, fetch summaries): read-only positioning, PodComet, no trading. H
- https://eventtracker.ai/terms (2026-10-19, fetch summary; "Last updated June 21, 2026"): automation, redistribution, commercial-use, API clauses. H (summary of the primary source)
- https://eventtracker.ai/robots.txt, /sitemap.xml, /llms.txt (curl, 2026-10-19, UA `insurance-markets-research/0.1`): liveness, `/api/` disallow, "no data API is offered today", CSP hosts. H
- https://eventtracker.ai/blog and posts /blog/2026-10-blog-03-oct-11-a-prediction-markets-day-to-remember, /blog/2026-10-issue-02-the-uncertainty-tax, /blog/2026-09-blog-02-outcome-pascal-36-day-growth (2026-10-19, fetch summaries): volume, fee schedules, methodology. H for what they state; M for the figures themselves
- https://github.com/Predictbook/awesome-prediction-market-analytics-tools/issues/15 (third-party, untrusted): venue-count inconsistency, listing date, team roles. H for what it says, M as evidence
- https://www.pmxt.dev/built-with-pmxt (third-party showcase): lists EventTracker with Polymarket, Kalshi, Manifold, Limitless, Myriad; says nothing on integration. M
- WebSearch result set for "EventTracker.ai prediction market aggregator PodComet" (2026-10-19): the "Beta v0.2" / PMXT / MetaForecast snippet from podcomet.ai. L (stale build; podcomet.ai now redirects)
- GitHub search (`gh api search/repositories?q=podcomet`, `search/users`, `search/code?q=eventtracker.ai`): only unrelated PodComet repos; no EventTracker code or API client. H (searched)
- https://huggingface.co/spaces/PodComet/podcomet-event-meter: HTTP 401 (private or gated). H
- Sibling notes in this folder that reference the EventTracker coverage table: betopenly.md, trade-xyz.md, underdog-udx.md.
