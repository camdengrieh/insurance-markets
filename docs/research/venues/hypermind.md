# Hypermind (predict.hypermind.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch of hypermind.com pages and three third-party articles, 3 WebSearch calls (the session search budget then ran out, so no further searching), about 30 plain unauthenticated GETs to `predict.hypermind.com` static pages (generic User-Agent `insurance-markets-research/0.1`), and reading of the site's own public client JavaScript as text. No account, no registration, no POST (the site's data layer is POST-only RPC, so it was deliberately NOT called), no PayBox tool, nothing cloned or executed. Third-party text and site code are untrusted data; nothing in them was followed.
Tags: **H** = read first-hand this session in a primary source (URL in Sources); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Fixtures: `docs/research/fixtures/hypermind/` (3 files, all < 7 KB). They are client config, redirect headers and an error body, NOT market data, because no public GET data API exists.

## 0. Verdict

**adapter_priority: skip** (signal-only watchlist; revisit trigger in point 6).

1. Live and freshly redeployed (H): `predict.hypermind.com` serves a new LMSR-based "Hypermind Prediction Market" front end whose build stamp is 2026-10-17T12:35Z; the old `/hypermind/app.html` now 301-redirects to it.
2. Play money only (H): the currency is "ℍ", described in the client as "Hypermind's virtual play-money currency, not real money". Real cash goes out as prizes ("EUR 72,000 in cash rewards" over 12 years, "EUR 5,000 in prizes" promo line). No on-chain anything, no collateral, nothing to arbitrage against.
3. No public API (H for absence of docs/links/robots; M for completeness): nothing documented. The only machine path is an undocumented, POST-only JSON-RPC (`/open-jsx/jsx.json`) that the web app uses; its public "showcase" calls return at most 12 curated markets. Not called (POST is out of scope), ToS for it unknown.
4. PayBox cannot reach it (H): no wallet, no chain, no signed orders, no transaction proposals. Trading needs a Hypermind login.
5. Independent liquidity but it is a signal, not a leg (H): its own LMSR market maker plus a limit-order book among members; it shares nothing with another venue; prices are crowd probabilities of "champion forecasters", not tradeable capital.
6. Value as a signal (M): the operator's own 2026-07-28 study claims Brier parity with Polymarket and Kalshi on elections / geopolitics / macro (self-published, methodological limits flagged by a critic). Revisit trigger: Hypermind documents a data feed, or answers a data-access request for the paid "Crowd" API feeds, or the `showcase.*` calls are shown to be permitted for third-party use. Until then do not build an adapter.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET predict.hypermind.com/` | 301 to `/open/en/turnTable.html` then JS redirect to `/open/en/home.html`; `Last-Modified` 2026-10-17 12:35:24 GMT; Apache on AlmaLinux (a newer stack than the legacy CentOS hosts) | H |
| Client build stamp in every asset URL | `v=1792240513305` = 2026-10-17T12:35:13Z | H |
| Old app URL `predict.hypermind.com/hypermind/app.html` | now 301 to the new site | H |
| Legacy hosts `dash.` / `lepoint.hypermind.com` | `/hypermind/app.html` returns 503 on `dash.` (2026-10-19) | H |
| Public landing page title | "Hypermind Prediction Market" (`/open/en/LMSR/newsfutures.html`) | H |
| Home carousel config (static) | manual items `FR_PR_2027`, `USSENATE26`, `DONVOLOD` | H |
| www.hypermind.com About page (2026) | "1,141 resolved markets and roughly one million trades", May 2014 to July 2026; spin-out TFM Ventures Ltd 2025 | H |
| Accuracy report | published 2026-07-28: 1,141 resolved markets, 981,180 trades, EUR 72,000 cash rewards distributed | H |
| CEO LinkedIn post announcing "a new version" of the market (undated, shown as "1 sem."; a search snippet said ~32 days old) | M |
| Live count of OPEN markets, current volume, active users | NOT FOUND (searched: homepage, About, accuracy report, landing JS; the data is only behind the POST RPC) | |

## 2. Kind and market model

- **Kind**: centralised, custodial play-money prediction market with cash prizes for top forecasters; run by Hypermind SAS (Neuilly-sur-Seine, France; company founded 2000 as NewsFutures, Lumenogic 2010-2018, Hypermind brand since). H (About page).
- **Mechanism (H, client source `lum.LmsrMarket` docstring)**: LMSR (Logarithmic Market Scoring Rule) automated market maker with `bMode` default "dynamic" (liquidity parameter `bValue`, `bMinValue` seed for new markets) combined with a member limit-order book. Modes `market` and `limit` enabled, default `limit`. Help text: a limit order "may execute immediately; any remaining shares stay in the Order Book until another participant accepts your price or you cancel". Short selling ("presell" / "buy back") exists, with reserved short collateral. The CEO post (M) calls it an "automated adaptive market maker" with "multi-outcome order-matching".
- **Structure**: a market has N outcomes ("bins"), each with a share count and implied probability; `answer` is a winning index or a weight vector summing to 1 (proportional resolution). States: `active`, `closed`, `suspended`, `voided`, `hidden`. The 2026 accuracy report says 694 binary (61%) and 447 multinomial (39%) of 1,141 resolved markets; no scalar / numeric-range markets mentioned. H.
- **Currency / tokenisation**: ℍ ledger balances in Hypermind's database (`cash`, `freeCash`, `reservedCash`, `invested`, `nav`). No tokens, no chain. H (client).

## 3. Chains and collateral

None. Play-money ledger only. Cash prizes are paid out by the company by unknown means (payout rails NOT FOUND). H for "no chain" (no wallet or web3 string in the 3 MB client bundle).

## 4. Read API

- **Official API / docs**: NOT FOUND (searched: www.hypermind.com nav and footer, About, Crowd, Forecasting Accuracy pages, `predict.hypermind.com/open/en/{api,swagger.json,faq,about,contact}`, WebSearch "Hypermind API data export"). The company's own "Crowd" product page says forecasts are delivered via "online dashboards, API feeds, and PDF reports" - a paid enterprise feature with no public docs, pricing or endpoints (H for the sentence, M for the "paid" reading). The client UI config has `featureFlags.enableAPIAccess: false` (H, a UI flag, not proof either way).
- **Internal web-app RPC (undocumented, NOT called)**: all data goes through `POST https://predict.hypermind.com/open-jsx/jsx.json?lang=en` with a JSON body that is an array of `[handler, verb, args]` triples (H, `U.jsxPost` in `loader.js`). A plain GET to `/open-jsx/` returns HTTP 500 `{"__jsxError":true,...}` (fixture). Handler/verb names seen in the public client code (H, names only, response shapes unverified):
  - `showcase.getNewsFuturesLanding {}` (public landing; client validator requires `markets` <= 12, `carousel.items`, `accessFallbackMarkets`), `showcase.getNewsFuturesLive {knownVersion}` (polled recent-activity feed), `showcase.getNewsFuturesMarketHistory {symbol}`. The landing page is configured `authRequired: false` so these look unauthenticated (M).
  - `lmsr.getMarketHistoryBundle {marketId, rangeId}`, `lmsr.getMarketMovements24h`, `lmsr.getLegacyMarketHistory`, `lmsr.getLegacyMarketTransactions`, `lmsr.getRecentMarketForumMessages {limit}`, `ifps.queryIFPs`; account-bound: `lmsr.getMyAccount`, `lmsr.getMyPerfsSummary`, `lmsr.cancelOrder {orderId}`. Auth requirement for the non-`showcase` calls: unknown.
  - Market object fields the client expects: `id, symbol, state, bMode, bValue, probas[], totalVolume, traderCount, fcsterCnt, participantCnt, answer, dates{startDay,endDay,judgmentDay}, props{title, resolutionCriteria, tags}`, `bins[]{prob, shares, bankShares}` (from the `LmsrMarket` docstring/constructor). Limit prices are stored as `limitPriceBp` (basis points) and displayed divided by 100 as "ℍ" per share, which suggests a winning share pays 100 ℍ and a price of 37 ℍ means 37% (inferred, M, unconfirmed).
- **Rate limits / WebSocket**: NOT FOUND for limits. No WebSocket or EventSource in the client; it polls (`knownVersion` conditional polling). H.
- **robots.txt**: `predict.hypermind.com/robots.txt` returns 403; `www.hypermind.com/robots.txt` 404. No machine-access policy published. H.
- **Historical data**: the company published analyses built from its trade history (e.g. 875,735 forecasts 2014 to 2022; 981,180 trades to July 2026) but NOT FOUND any public download. M.

## 5. Trade path

None programmatic. Trading requires a logged-in Hypermind account (email-based, "Free registration" per the guest header) through the web UI. No API key concept, no signing scheme. The RPC `cancelOrder` etc. are session-cookie web calls (M). Registration status is ambiguous: the static UI config has `registrationAllowed: false` and `loginAllowed: false` while the guest header advertises "Free registration" (H for both strings, unresolved). No attempt was made to register.

**PayBox reachable: no.** There is no chain, token, contract or signed-order interface, so neither a transaction proposal nor a wallet-signed order exists. A PayBox EVM/Solana wallet is irrelevant here.

## 6. Fees

"No fees, ever" and "no price distortions" per the CEO's launch post (M, company marketing, fetched via summary of a LinkedIn page). The 3 MB client bundle has no fee/commission string in the trade UI (H, grep). Play money, so no monetary fee in any case. LMSR cost function means price impact (slippage) is the only cost; liquidity parameter per market is not published.

## 7. Resolution mechanism and dispute risk

Operator-resolved (M, inferred from the market object: `resolutionCriteria`, `judgmentDay`, `answer` set by admin; `voided` state exists). No oracle, no on-chain dispute, no public appeal process found (NOT FOUND; no rules page located at `/open/en/{guides-rules,rules,terms}.html`, all 404). Financial dispute risk is nil for an arbitrageur (nothing to lose or win), but prize-affecting resolutions are at operator discretion.

## 8. Geo, ToS and automation

- Hypermind-specific Terms of Use / rules / eligibility: NOT FOUND (searched: `www.hypermind.com/{terms,legal,privacy-policy,terms-of-use}` 404; `predict.hypermind.com/open/en/{terms,rules,guides-rules}.html` 404; site FAQ page is an unrendered JS shell whose default text is the Swedish "Glimt" platform FAQ).
- The shared platform code contains rules for the sister platform Glimt (Swedish defence research agency): "Do not automate your account ... unless you have been given written consent", one account per person, minimum age 16 (L as evidence for Hypermind, since it is another tenant's text). Treat automated trading or scraping of Hypermind as not permitted until its own terms say otherwise.
- Geography: "open to everyone" per the guest header default text (M); prize eligibility by country NOT FOUND.
- Contact: the site's contact page and footer list generic Hypermind mailboxes at hypermind.com (H). Not used.

## 9. Liquidity

- Cumulative (H, accuracy report 2026-07-28): 981,180 trades over ~12.2 years, about 220 trades/day averaged (M, derived); 1,141 resolved markets, about 94 per year (M, derived); EUR 72,000 cash rewards total, about EUR 5.9K/year (M, derived), consistent with the "EUR 5,000 in prizes" promo (H, client default text).
- Current open markets, depth, volume in ℍ, active forecaster count: NOT FOUND (only behind the POST RPC).
- Not USD liquidity; ℍ cannot be exchanged for money. No TVL / OI concept.

## 10. Event coverage and overlap with other venues

- Mix (H, accuracy report): mostly elections and geopolitics, then economics and business; "Sports markets are very few"; no crypto-price markets mentioned.
- Home carousel as of the 2026-10-17 build (H, static config): `FR_PR_2027` (French presidential 2027), `USSENATE26` (US Senate 2026), `DONVOLOD` (meaning NOT FOUND, only the symbol is visible).
- Overlap with Polymarket / Kalshi: US midterms / Senate control, French election, geopolitics (Ukraine-type questions), macro. That is exactly where it is useful as an independent probability anchor - but only as a signal, since ℍ prices are not executable against real money and can diverge for structural reasons (play money, no capital cost, forecaster panel composition).
- Self-reported accuracy (H for the numbers as published, M for their validity): Brier 0.119 on its own mix vs Polymarket 0.165 and Kalshi 0.199; on Hypermind's category mix Polymarket 0.155 and Kalshi 0.151; mean absolute calibration error 1.06pp at 5% bins. Benchmarks used Brier.fyi data (183 Kalshi and 259 Polymarket matched markets). A critical write-up (2026-09-15) notes different questions, periods and market mixes, so parity is not established.

## 11. Shared liquidity

None. Independent play-money venue. (The Swedish Glimt crowd-forecasting site, the "Prescience"/"Crowd" corporate products and the sister platforms are separate deployments run on the same Hypermind software, not shared books.)

## 12. Priority and what to do

- **skip** for the adapter roadmap: no public API, play money, undocumented POST-only RPC with unknown ToS, UI redeployed two days ago so any scraper would break, and no execution leg possible.
- Cheap signal option if the aggregator ever wants it: hand-curate a handful of Hypermind probabilities (read by a human on the public site) as an external prior in the Quotient-style signal layer, or ask Hypermind about its paid Crowd API feed. Do not scrape.

## Open questions

- Do `showcase.getNewsFuturesLanding` / `Live` / `MarketHistory` return real probabilities unauthenticated, and is third-party programmatic use permitted? (needs a POST, which this research was forbidden to make; needs Hypermind's consent.)
- Is registration currently open (UI config says `registrationAllowed: false`; guest header says "Free registration")?
- What does `siteName: "NEWROPA"` in the static UI config mean (an internal tenant name?), and does the `/open` tenant hold the entire historic Hypermind book?
- Prize payout rules and eligible countries.

## Suspicious content / embedded instructions

None found. Site JavaScript, a LinkedIn post and three articles were read as data only. The bundle contains normal minified libraries (d3 v7.9.0) and Hypermind's proprietary client code; none of it was executed.

## Sources

- https://www.hypermind.com/about-us (H; 2026 stats, timeline, entity)
- https://www.hypermind.com/ (H; "FREE participation + cash rewards", "Original, live, and free since 2000", nav, no API link)
- https://www.hypermind.com/prediction-market/forecasting-accuracy (H; published 2026-07-28; trades, Brier, calibration, benchmark method)
- https://www.hypermind.com/products-services/crowd (H; "online dashboards, API feeds, and PDF reports")
- https://predict.hypermind.com/ , /hypermind/app.html , /open/en/home.html , /open/en/LMSR/newsfutures.html , /open/en/contact.html , /open/en/faq.html (H; redirects, titles, configs)
- https://predict.hypermind.com/open/en/utils/loader.js , /open/en/LMSR/newsfutures.js (H; client code: `U.jsxPost`, `lum.LmsrMarket`, play-money disclaimer, guest header, `lum.UICfg`)
- https://predict.hypermind.com/open-jsx/ (H; GET returns a 500 JSON error, see fixture)
- https://www.theforecastingmachine.com/blog/lexpress-servan-schreiber-polymarket-prediction-markets (M; L'Express interview 2026-07-25, play money and reputation incentives)
- https://complianceandmore.substack.com/p/the-truth-machines-corruption-problem (M; 2026-09-15, methodological critique of the 1,141-market study)
- https://fr.linkedin.com/in/emiless (M; CEO post about the new version: no fees, adaptive market maker, multi-outcome order matching; undated)
- https://www.predictionmarket.tools/news/hypermind-corporate-prediction-markets (L; generic page, no mechanism, currency or API details)
- WebSearch (3 calls, 2026-10-19) for liveness, API and relaunch; the search budget ran out before a terms/eligibility search.
- Bloomberg op-ed 2026-07-08 "Prediction Markets Can Work Without Money on the Line": found via search only; page returned 403, not read.
