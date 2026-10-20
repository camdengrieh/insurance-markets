# Robinhood Prediction Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:00-01:35 UTC). READ-ONLY: page and PDF reads, unauthenticated GETs to robinhood.com and to Kalshi's public market endpoint, one read-only PayBox `discover_plugins` and one `discover_services` call (discovery only, nothing signed or paid). No account, key, wallet, signature, POST/PUT/DELETE or browser automation. All third-party text was treated as untrusted data. The shared WebSearch budget was exhausted for the whole session, so every fact below comes from direct fetches of known URLs and Robinhood's own sitemaps (links found by following Robinhood's own pages).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/robinhood-prediction-markets/` (4 files, section 15).

---

## 0. Verdict

**adapter_priority = skip** (as a venue / trading adapter). Confidence: high.

1. **Live and very large** in retail volume terms: more than 45 billion contracts traded since launch, 13.6 billion in Q2 2026 alone (H, Robinhood newsroom 2026-09-08). Landing page and sitemap regenerated 2026-10-19 01:15 UTC (H).
2. **Robinhood is a broker (FCM), not an exchange, so it is not an independent leg.** Robinhood Derivatives, LLC routes each contract to one of four CFTC exchanges: Kalshi, ForecastEx, Rothera (affiliated JV with Susquehanna) and, since 2026-09-08, Crypto.com | Derivatives North America ("CDNA") / OG.com. The landing page's own data tags every contract with its exchange (`exchange: EXCHANGE_SOURCE_KALSHI | _FORECASTEX | _ROTHERA | _CDNA`) (H, section 2).
3. **Shared liquidity proven first-hand:** for four Kalshi-routed contracts, Robinhood's yes/no bid, ask and last prices were identical to Kalshi's own public API, and open interest matched to within one contract (H, fixture `rh-vs-kalshi-top-of-book.json`). Robinhood adds no price information for Kalshi-routed contracts.
4. **No public API for event contracts, and trading is mobile-app only** ("only available to view on web, not trade", H). The documented developer surface is the Crypto Trading API (crypto only) and a Trading MCP whose tool list is account, watchlist, market data, equities, options and crypto (H). No event-contract endpoint was found anywhere.
5. **Not reachable from a PayBox wallet.** USD cash in a KYC'd, US-resident-only FCM account; no chain, no tokens, no wallet signing (H, section 7).
6. **What is worth keeping from this research:** (a) Robinhood contracts carry the exchange's own symbol (Kalshi tickers like `KXRECSSNBER-26`, Rothera `NFLGAME-26OCT18DALGB-DAL`, ForecastEx `YXLBT_123126_80000`, CDNA `NX.F.OPT.CFB-...`), so a Robinhood-to-exchange map is trivial; (b) the four underlying exchanges are the real arbitrage legs: Kalshi (covered elsewhere), ForecastEx and Rothera (sibling notes `forecastex.md`, `rothera-exchange-and-clearing.md`, both P2 per those notes), and CDNA/OG.com (no spec yet, section 14); (c) Robinhood's disclosed volume is a retail-flow sentiment series, not an execution venue.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| `https://robinhood.com/us/en/prediction-markets/` returns 200 with 54 embedded events, 510 live quotes, newest quote `updated_at` 2026-10-19T01:18:03Z; NFL game "Dallas vs Green Bay" in progress (Q1 4:43) at the page snapshot | 2026-10-19 | H |
| `sitemap-prediction-markets.xml` lastmod 2026-10-19T01:15:33Z, 4,128 URLs of which 3,886 are `/events/` pages | 2026-10-19 | H |
| Newsroom: "Robinhood Teams Up With Crypto.com and OG.com ..." (routing to CDNA/OG.com begins 2026-09-08) | 2026-09-08 | H (https://robinhood.com/newsroom/robinhood-cryptocom) |
| Newsroom: "The World Cup is Now Trading on Robinhood and Rothera" (Rothera routing starts, new fee model) | 2026-06-04 | H |
| Newsroom: JV with Susquehanna announced 2025-11-25; page update "On Jan. 20, 2026, the joint venture closed its acquisition of MIAXdx" | 2026-01-20 | H |
| Support article "Event contract restrictions" mentions a Michigan restriction effective 2026-09-09 (i.e. the page was edited after that date) | >= 2026-09-09 | H |

Verdict: **still_live = true.** History worth knowing: hub launched 2025-03-17 via Kalshi only; football 2025-08-19; CFTC had formally asked Robinhood to withdraw a pro-football-championship market on 2025-02-04 (suspended then) (H, newsroom). The product line has been regulatory-sensitive from day one.

---

## 2. Kind and structure

- **Kind (H):** broker/frontend. "Event contracts are offered by Robinhood Derivatives, LLC., a registered futures commission merchant and swap firm" (https://robinhood.com/us/en/prediction-markets/ footer). RHD "does not make markets in any futures or event contracts" (newsroom 2025-03-17 and 2025-08-19). RHD is "a clearing member of ForecastEx, Kalshi, or Rothera Exchange and Clearing LLC" (https://cdn.robinhood.com/assets/robinhood/legal/Event_Contracts_Risk_Disclosure.pdf, H). That PDF does not yet mention Crypto.com/CDNA (it predates the 2026-09-08 deal) (H).
- **Routing is per contract and chosen by Robinhood, not the user.** "College and Pro Football contracts will be routed to a combination of OG.com, Kalshi, and Rothera based on a number of factors, including what's available at each exchange"; midterm contracts "are currently routed to both Kalshi and Rothera, with potential expansion to Crypto.com and OG.com" (newsroom 2026-09-08, H). The user sees one price from one exchange; there is no best-execution choice exposed.
- **Per-contract exchange tag in the page data (H, fixture `rh-exchange-source-tally.json`).** Among the 54 featured events (512 contract objects in total) on 2026-10-19:

| `exchange` | contracts | what the featured set contains |
|---|---|---|
| `EXCHANGE_SOURCE_KALSHI` | 384 (326 tradable, 58 untradable) | tennis, cricket, soccer, esports, MMA, boxing, F1/NASCAR, BTC ladders, rain, streams, Fed cuts, recession, politics, AI, aliens |
| `EXCHANGE_SOURCE_FORECASTEX` | 109 (99 / 10) | BTC drawdown ladder, metals prices (platinum, palladium, copper), LA temperature, university tuition |
| `EXCHANGE_SOURCE_ROTHERA` | 13 (all tradable) | NFL games, an MLB game, Fed October decision |
| `EXCHANGE_SOURCE_CDNA` | 6 (all tradable) | college football games (symbols `NX.F.OPT.CFB-...`) |

  (Counts are of the 54-event featured subset only, not the 3,886-event catalogue. The featured set is skewed to whatever Robinhood promotes.)
- **Symbols are the exchange's own (H).** Kalshi-routed contracts use Kalshi tickers (`KXRECSSNBER-26`, `KXLLM1-26DEC31-A`, `KXBTC2026200-27JAN01-200000`, `KXALIENS-27`); Rothera uses `NFLGAME-26OCT18DALGB-DAL`; ForecastEx uses `YXLBT_123126_80000`; CDNA uses `NX.F.OPT.CFB-00001-261020-M.O.1.1.20270228`. Robinhood also has its own UUID per contract (`id` / `instrument_id`) and per event.

---

## 3. Market model

- **Binary Yes/No only** for standard contracts: "Every event contract has exactly 2 sides"; price $0.01-$0.99; cash settlement at $1 or $0; "no other settlement values for standard contracts" (https://robinhood.com/us/en/support/articles/how-event-contracts-work/, H). Nonstandard payouts exist (tie in boxing/football typically $0.50 to both sides; walkover, withdrawal, cancelled events; fair-value settlement) (support article "Event contract settlement", H).
- **Categorical sets are sets of binaries** (`mutuallyExclusive: true` on winner events; ladders with 20-40 strikes for BTC, rain, streams). Prices need not sum to 1 (H on the model; no sum test run here).
- **Order book:** each exchange runs a CLOB; Robinhood shows only one exchange's top of book. The page `quotes` object has `yes_bid_price, yes_ask_price, no_bid_price, no_ask_price, bid_size, ask_size, last_trade_price, last_trade_size, updated_at, state` (H, fixture). Sizes are present for Rothera quotes and `null` for Kalshi-routed ones (H, fixture).
- **Tick:** `tickSize: "0.01"`, `tickPriceRanges` 0 to 1 step 0.01 on the sampled contracts; sub-penny executions are possible "up to 1 decimal place" on some markets (support article "Trading event contracts", H).
- **Combos:** preset combos and custom combos up to 10 legs, traded as a single contract with an exchange-provided quote and FOK order type (H, same article).
- **Tokenisation:** none. Positions are rows in an FCM account at Robinhood Derivatives, held through the exchange's clearinghouse. No token, no ERC-1155, no on-chain representation (H by absence in all Robinhood docs read; NOT FOUND any on-chain path).

---

## 4. Chains and collateral

- **Collateral: USD cash** in a Robinhood Derivatives account that is funded from the customer's "Linked Securities Account"; RHD may auto-transfer funds between them (https://cdn.robinhood.com/assets/robinhood/legal/rhd-futures-client-agreement.pdf, doc footer stamp 20260916, H). Event contracts "may be required ... to fully collateralize the position" (same, H). Payouts available to withdraw about 1 business day after settlement (support article "Event contract settlement", H).
- **Chains: none.** Robinhood does run an L2 ("Robinhood Chain", chainId 4663 per the repo's earlier notes) and a Wallet with perpetuals and stock tokens, but no Robinhood page I read lists event contracts there (NOT FOUND; searched the agents page, support sitemap, newsroom sitemap, prediction-markets page).

---

## 5. Read API

**Official public API: none for event contracts (H by exhaustive absence).**

| Surface | Finding | Tag |
|---|---|---|
| Developer docs `https://docs.robinhood.com/` | Sitemap lists only `/`, `/crypto/`, `/crypto/connect/`, `/crypto/trading/`, `/healthcheck/` (lastmod 2026-10-17). Crypto Trading API only; no futures or event-contract section. | H |
| Trading MCP `https://agent.robinhood.com/mcp/trading` | Tools: "Account, portfolio, and other tools; Watchlist; Market data; Equities; Options; Crypto". No futures or prediction-market tools listed ("We'll be adding more tools in future releases"). Requires a dedicated "MCP account" (self-directed individual investing account). Support article: https://robinhood.com/us/en/support/articles/agentic-trading-overview/ | H |
| Robinhood Agents page | Says external agents connect via MCP; the Predict/Futures mentions on that page are navigation only | H |
| Unofficial: landing-page data | `GET https://robinhood.com/us/en/prediction-markets/` is a Next.js page; the `<script id="__NEXT_DATA__">` JSON (`props.pageProps`) carries `events[]`, `quotes{contractId: {...}}`, `fundamentals{contractId: {volume, open_interest}}`, `eventStates{}`, `navigationNodes[]`. Response is CDN-cached: `cache-control: public, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600` (H, fixture). 1.86 MB per fetch, featured subset only (54 events of 3,886). | H |
| Sitemap | `https://robinhood.com/sitemap.xml` -> `sitemap-prediction-markets.xml` (redirects to `/us/en/sitemap-prediction-markets.xml`): 3,886 `/events/` URLs (top path categories: elections 1,269; soccer 700; tennis 302; pro-football 236; culture 230; economics 190; college-football 170; climate 140; basketball 127; esports 117; hockey 108; baseball 80; crypto 79). Each event page presumably embeds the same shape; not individually sampled. | H (sitemap), M (per-event pages) |
| WebSocket / REST host | Landing page references no API host other than `cdn.robinhood.com`; the live quote transport is not visible. NOT FOUND (searched: landing HTML for `api.robinhood.com`, `wss://`). | H |

**Staleness warning on the unofficial data (H, fixture):** the `quotes` object contains entries whose `updated_at` is as old as 2026-01-31 (illiquid contracts) next to entries seconds old; `fundamentals.volume` is `"0"` or absent for Kalshi/ForecastEx-routed contracts while `open_interest` is populated. Treat any quote older than a few minutes as stale and do not assume `volume` is comparable across exchanges.

**Better source for every Kalshi-routed contract:** `GET https://api.elections.kalshi.com/trade-api/v2/markets/{ticker}` (public, unauthenticated) returned identical top-of-book (section 10). Use the exchange API, not Robinhood.

---

## 6. Trade path

**None programmatic.**

- Order entry is **mobile app only**: "Prediction markets are currently only available in the Robinhood mobile app. They are only available to view on web, not trade. They are not available on Robinhood Legend." (https://robinhood.com/us/en/support/articles/trading-event-contracts/, H).
- Order types: IOC limit (default), GTD limit (expires 3 AM ET the next calendar day), dollar orders (always IOC), custom combos FOK; opening orders are whole contracts only (same article, H).
- Account gating: must apply for and be approved for a Robinhood Derivatives account; eligibility based on experience, profile, state (H).
- The Trading MCP cannot place event-contract orders as of today (tool list above, H).
- Auth/signing scheme for the app's private order API: NOT FOUND (undocumented; not probed, and probing would be reverse-engineering a private API).

---

## 7. PayBox / EVM wallet reachability

**paybox_reachable = no.**

- No transaction proposal or signed-order path: positions are FCM-account entries denominated in USD; funding is via Robinhood's linked brokerage account; order entry is a logged-in mobile session (sections 4 and 6, H).
- PayBox catalogue check (read-only, 2026-10-19): `discover_plugins("robinhood prediction markets")` returned no plugins; `discover_services` returned only unrelated third-party x402 odds feeds for Polymarket/Hyperliquid (treated as untrusted listings, not used).
- Account-opening itself needs US residency, a government-ID KYC'd brokerage, age 18+ (H, support article "Event contracts overview"): an agent cannot own such an account.
- The sibling exchanges are also off-chain USD venues (see `rothera-exchange-and-clearing.md`, `forecastex.md`), so the PayBox path to event contracts runs through on-chain venues (Polymarket, Limitless, XO etc.), not through anything Robinhood routes to. CDNA/OG.com not researched.

---

## 8. Fees (who pays what)

All H from https://robinhood.com/us/en/support/articles/event-contracts-overview/ and https://cdn.robinhood.com/assets/robinhood/legal/RHD_Fee_Schedule.pdf (PDF metadata created/modified 2026-05-28, i.e. effective-from-June-1 schedule).

- **Robinhood commission (per order, paid by customer, charged on open and on close):**
  `commission = ceil_to_cent( k * p * (1 - p) * c )`, `k = 10%` without Robinhood Gold, `k = 5%` with Gold ($5/month); `p` = price in dollars, `c` = contracts; capped at **$0.01 per contract** ("maximum commission rate of $0.01 per contract"). Examples per 100 contracts: p=0.50 -> $1.00 (cap) for both tiers; p=0.90 -> $0.45 Gold / $0.90 non-Gold; p=0.99 -> $0.05 / $0.10.
- **Exchange fee (paid by customer, passed through):** "Exchanges typically charge an additional fee ... up to $0.01 per contract", on opening and closing trades. Fee schedule: **KalshiEX products via RHD = $0.01 per contract, per side**. ForecastEx and Rothera: "check the current Exchange Fee Schedules" (not in the RHD document; see sibling notes). CDNA/OG.com: NOT FOUND.
- **Regulatory fee:** schedule lists NFA assessment of $0.02 per contract per side under "Regulatory Fees" ("As of Jan 1, 2018"); whether it is charged on event contracts is not stated (M that it applies to futures; unclear for swaps).
- **Worked example from Robinhood (H):** buy 100 Yes at $0.90, Gold, exchange fee $0.01: commission $0.45, total cost $91.45.
- **Consequence for arbitrage (M, my arithmetic):** at mid prices the all-in friction on the Kalshi route is about 2 cents per contract per side (1c commission cap + 1c exchange), 4 cents round trip on a $1 contract, before spread. Going direct to the exchange is never costlier in explicit fees. Dollar orders are IOC at the natural price and cannot rest.
- Promotions exist (uncapped $0 commissions on World Cup trades after 5 referrals, from 2026-06-08), so effective fees can differ by customer (H, newsroom 2026-06-04; fee schedule reserves the right to vary rates).

---

## 9. Resolution mechanism and dispute risk

- **Robinhood does not resolve.** "Robinhood doesn't determine the official settlement rules. These terms are determined by the exchange partner" (support article "Event contract settlement", H). Each contract's data source, threshold definition (strict vs inclusive inequality), expiry and special rules sit in the About / terms PDF of its exchange (examples seen in the page data: Kalshi `.../contract_terms/*.pdf`, ForecastEx `forecastex.com/regulatory/...pdf`, Rothera `publicfiles.rotheramarkets.com/contract_terms/NFLGame-T&C.pdf`) (H).
- **Timing:** sports usually pay within 1-2 business days; elections can be much slower; funds withdrawable about 1 business day after settlement (H).
- **Dispute risk:** no UMA-style on-chain dispute; outcome is the named source agency's final published value, then the exchange's determination. Postponed games stay open until the contract expiry; cancelled events settle at "fair market value as determined by Rothera" (Rothera NFL terms, quoted in page data) or at $0 / last price / other, "Robinhood can't change or modify these settlement outcomes" (H). Practical cross-venue risk: **the same real-world question can have different resolution wording per exchange** (data source, tie treatment, overtime, early-close rules), so a Robinhood leg and a non-Robinhood leg are not guaranteed equivalent even when titles match (M, from the sample differences between Kalshi, Rothera and CDNA terms).
- **Counterparty risk:** cleared by the exchange's DCO; RHD is the clearing member. In RHD insolvency, customer rights follow the commodity-broker liquidation provisions of the Bankruptcy Code and CFTC Part 190 (Event Contracts Risk Disclosure, H).

---

## 10. Shared liquidity (is Robinhood an independent leg? No.)

**First-hand test, 2026-10-19 01:19 UTC** (fixture `rh-vs-kalshi-top-of-book.json`): Robinhood page `quotes` vs Kalshi `GET /trade-api/v2/markets/{ticker}`:

| Kalshi ticker | RH yes bid / ask | Kalshi yes bid / ask | RH open interest | Kalshi open interest |
|---|---|---|---|---|
| `KXLLM1-26DEC31-A` | 0.469 / 0.476 | 0.4690 / 0.4760 | 1,379,831 | 1,380,003.85 |
| `KXBTC2026200-27JAN01-200000` | 0.01 / 0.02 | 0.0100 / 0.0200 | 4,579,707 | 4,579,859.15 |
| `KXALIENS-27` | 0.041 / 0.042 | 0.0410 / 0.0420 | 9,466,999 | 9,466,999.44 |
| `KXRECSSNBER-26` | 0.03 / 0.04 | 0.0300 / 0.0400 | 947,995 | 947,995.89 |

Four of four identical (H). Also: Rothera-routed contracts go into Rothera's own book (Rothera's note and Robinhood newsroom, H/M), ForecastEx-routed into ForecastEx's, CDNA-routed into CDNA's. Robinhood "does not make markets" (H).

**Independence map for the aggregator:**
- Robinhood-on-Kalshi = Kalshi (duplicate leg; skip).
- Robinhood-on-Rothera = Rothera (single book fed by Robinhood and other FCMs; sibling note: Robinhood is the visible FCM).
- Robinhood-on-ForecastEx = ForecastEx (also reachable via Interactive Brokers; see `forecastex.md`).
- Robinhood-on-CDNA = CDNA/OG.com book.
- The **real arbitrage exists between the exchanges**, e.g. Kalshi vs Rothera vs CDNA on the same NFL game or FOMC decision, and each vs on-chain venues. Robinhood users cannot exploit it because routing is chosen by Robinhood. Robinhood is also a minority-owner / affiliate of Rothera and will take equity stakes in Crypto.com and OG.com (newsroom 2026-09-08, H), so routing may be commercially steered (M).

---

## 11. Liquidity (volumes with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Contracts traded since launch (~2 years) | > 45 billion; > 30 billion in Jan-Aug 2026 | newsroom 2026-09-08 | H |
| Q2 2026 | 13.6 billion event contracts; > 5 billion during the World Cup | same | H |
| 2026 YTD at 2026-06-04 | > 16 billion (2025 full year: > 12 billion) | newsroom 2026-06-04 | H |
| First year | 9 billion contracts, > 1 million customers (as of 2025-11-25) | newsroom 2025-11-25 | H |
| Notional USD | NOT FOUND (contracts, not dollars; each contract pays at most $1, so notional is well below the contract count) | searched: newsroom, support, JV post, Q2-2026 results stub page (content not rendered) | - |
| Open interest on page, 54 featured events (contracts) | Kalshi-routed 73.3M; Rothera-routed 8.8M; ForecastEx-routed 1.7M; CDNA-routed 12.3k | page `fundamentals`, 2026-10-19 01:19Z | H (sum computed by me) |
| Biggest single event on page | Dallas vs Green Bay NFL (Rothera): total volume 7.82M, OI 9.00M contracts (in-progress, snapshot 00:42-01:12Z) | page `eventStates` | H |
| Catalogue size | 3,886 event pages | sitemap 2026-10-19 | H |

Unit caution: the page renders per-event numbers such as "5.67M" without a unit label; `eventStates.totalVolumeOfAllContractsV2` is contracts (M). `The Block` Robinhood monthly event-contracts chart (from the discovery hint) was not located: NOT FOUND (search budget exhausted); Robinhood's own monthly operating data page was not reachable (investors.robinhood.com returned 403; the Q2-2026 results newsroom page is a stub).

---

## 12. Event categories and overlap (where arbitrage exists)

Robinhood's categories on 2026-10-19 (H, page nav and sitemap): sports (football, soccer, tennis, basketball, hockey, baseball, cricket, esports, MMA, boxing, golf, racing, chess), politics/elections/midterms, climate (rain, temperature), commodities/metals, crypto, economics (Fed decisions, rate cuts, recession), financial, FX, education (tuition), entertainment/culture (artist streams), technology (best AI model, nuclear licence, UFO disclosure). Overlap with other venues:

| Category | Overlap | Notes |
|---|---|---|
| Sports (NFL, soccer, tennis, NBA, NHL, esports) | Polymarket, Limitless, Kalshi direct, Rothera/CDNA direct | highest liquidity here (7.8M volume on one NFL game); also highest cross-venue resolution-wording risk |
| Politics / midterms / Congress bills | Polymarket, Kalshi, Limitless, PredictIt | 1,269 elections URLs; Kalshi + Rothera routed now, CDNA/OG "in coming weeks" |
| Crypto price | Polymarket, Limitless, Kalshi; ForecastEx drawdown ladder | BTC end-2026 ladder (28 strikes, Kalshi); "How low will Bitcoin get in 2026" (ForecastEx) |
| Macro (Fed decision, rate cuts, recession) | Polymarket, Kalshi, Rothera, ForecastEx | Fed October 2026 on Rothera; "Number of rate cuts in 2026", "Recession this year?" on Kalshi |
| Tech / culture | Polymarket, Kalshi | "Best AI at end of 2026" (Kalshi, Claude 48% on the page), Spotify-style stream counts |
| Weather, metals, tuition | ForecastEx, Kalshi | little overlap with on-chain venues |

---

## 13. Geo, ToS and automation rules

- **Eligibility (H, support article "Event contracts overview", "Event contract restrictions"):** US residents only, 18+, individual brokerage account, approved Robinhood Derivatives account (30-day re-application wait after repeated denials or disabling). State rules: Maryland residents cannot trade sports event contracts (the "restrictions" article says "Maryland residents can't trade event contracts"; the "overview" says sports); Nevada residents cannot open new sports contracts (from 2025-12-01); Michigan residents cannot open new sports event contracts from 2026-09-09; "Additional state restrictions may apply". Position-closing-only restrictions apply on margin calls. Insider rules: employees and others with potential non-public information may be restricted; each exchange adds prohibited-individual lists (Kalshi Appendix B; ForecastEx per-event rulebook).
- **Automation:** no Robinhood document I read permits or prohibits bots on event contracts explicitly. The RHD client agreement says electronic trading services are "governed by additional agreements, disclosures, and terms" including an "Electronic Trading and Order Routing Systems Disclosure Statement" (not read) and makes the customer "solely responsible for all orders entered ... via internet-based electronic order entry" and for keeping Login Information to themselves (H). No automation, scraping or API clause found (searched: terms and client agreement for automat, scrap, robot, crawl, spider, harvest, API, algorithm: zero hits). Practically, there is no sanctioned automation route for event contracts at all.
- **Content terms (H, https://cdn.robinhood.com/assets/robinhood/legal/Robinhood%20Terms%20and%20Conditions.pdf):** Content is "provided exclusively for personal and noncommercial access and use"; no part may be copied, republished or distributed ("including mirroring") for commercial enterprise without Robinhood's written consent. Scraping the landing page into a commercial aggregator is therefore a ToS risk; source prices from the exchanges' own public data instead (M, my reading; not legal advice). `robots.txt` disallows only `/referral/`, `/user/`, `/subscriptions/`, `/reset_password/`, `/say-brokers/`, `/nexus/`, `/natedogg/` (H); the prediction-markets path is not disallowed.
- **Regulatory:** CFTC-regulated; the 2025-02-04 CFTC request on sports contracts and ongoing state challenges are context (the state-litigation picture was not researched here). Robinhood also offers an opt-out of event contracts and sports notifications (H).

---

## 14. Recommendation for the aggregator

1. **Do not build a Robinhood adapter.** There is no API, no trade path, shared liquidity on most contracts and a content licence that discourages commercial scraping.
2. **Build exchange adapters instead** (the Robinhood routing map tells you which exchanges matter): Kalshi (covered by the parallel workflow), Rothera and ForecastEx (sibling notes; both P2/signal-only because live data is gated or coarse), and **CDNA / OG.com** (no spec yet). Lead for CDNA/OG.com: `https://og.com/` footer links "APIs" to `https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction`, which describes an FCM B2C REST/WebSocket API that is **in private beta**, POST-only with HMAC-SHA256 private endpoints and public market-data endpoints explorable without onboarding; the page does not mention event contracts (M, small-model summary, not verified further). OG.com's page also names a Mauritius entity ("Foris Capital MU Limited") for non-US users (M).
3. **If a Robinhood signal is wanted** (retail-flow proxy), the cheapest honest signal is the public disclosed volume/contract counts (quarterly/monthly), not scraped quotes. If quotes from the page are used anyway, add the staleness guard from section 5 and map `symbol` to the exchange ticker via `exchange`.
4. **Re-check triggers:** Robinhood adds futures/event contracts to the Trading MCP tool list; Robinhood publishes an event-contract developer API; Robinhood Chain gets on-chain event contracts. Any of these would change the verdict.

---

## 15. Fixtures (all real responses or tables derived from them, each <= 50 KB)

Directory `docs/research/fixtures/robinhood-prediction-markets/`:

- `rh-prediction-markets-page-data-sample.json` (45 KB): trimmed extract of `__NEXT_DATA__` from `GET https://robinhood.com/us/en/prediction-markets/` at 2026-10-19T01:19:16Z: one Rothera event (NFL), one Kalshi ladder (best AI), one CDNA event (college football), one ForecastEx ladder (copper), with their `quotes`, `fundamentals`, `eventStates`; long text and image fields trimmed.
- `rh-exchange-source-tally.json`: contracts per `exchange` and tradability for the 54 featured events, plus the page's category list.
- `rh-vs-kalshi-top-of-book.json`: the four-ticker comparison in section 10.
- `kalshi-public-market-KXRECSSNBER-26.json`: raw response from Kalshi's public API for one of the compared markets.

---

## 16. NOT FOUND / open questions

- NOT FOUND: any official or documented Robinhood API for event contracts (searched: docs.robinhood.com sitemap, Trading MCP tool list, agents page, support sitemap, newsroom sitemap, landing-page HTML for API hosts and websockets).
- NOT FOUND: dollar notional / trade value for Robinhood event contracts; fee schedules of ForecastEx, Rothera and CDNA/OG.com as applied through Robinhood; the Electronic Trading and Order Routing Systems Disclosure Statement; the Robinhood app's private API shape (not probed).
- NOT FOUND (search budget exhausted): The Block's Robinhood monthly event-contracts chart; Shift Markets' routing claim (superseded by Robinhood's own newsroom, which is stronger evidence); independent news on state litigation and CFTC posture in 2026.
- Open: how Robinhood chooses the exchange per contract and whether it ever routes the same event to two exchanges simultaneously (the page shows one `exchange` per contract; football is described as spread across OG.com, Kalshi and Rothera "based on a number of factors").
- Open: whether per-event pages (`/events/...`) expose richer data (full ladders, history charts) than the landing page; not sampled beyond the landing page.
- Open: whether the unofficial page data may be fetched at aggregator scale given the content terms (section 13).

---

## 17. Sources (all fetched 2026-10-19)

Primary (Robinhood):
- https://robinhood.com/us/en/prediction-markets/ (landing page, `__NEXT_DATA__`, footer disclosure) - H
- https://robinhood.com/sitemap.xml, https://robinhood.com/us/en/sitemap-prediction-markets.xml, https://robinhood.com/us/en/support/sitemap.xml, https://robinhood.com/sitemap-newsroom.xml, https://docs.robinhood.com/sitemap.xml - H
- https://robinhood.com/robots.txt - H
- Newsroom: https://robinhood.com/newsroom/robinhood-cryptocom (2026-09-08); https://robinhood.com/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera (2026-06-04); https://robinhood.com/newsroom/robinhood-prediction-markets-joint-venture (2025-11-25, updated 2026-01-20); https://robinhood.com/newsroom/pro-and-college-football-prediction-markets (2025-08-19); https://robinhood.com/newsroom/robinhood-prediction-markets-hub (2025-03-17); https://robinhood.com/newsroom/robinhood-receives-formal-request-from-the-cftc-to-roll-back-the-pro-football-championship-market (2025-02-04) - H
- Support: https://robinhood.com/us/en/support/articles/event-contracts-overview/, `.../how-event-contracts-work/`, `.../trading-event-contracts/`, `.../event-contracts-order-fills/`, `.../event-contracts-settlement/`, `.../event-contracts-restrictions/`, `.../agentic-trading-overview/` - H
- https://robinhood.com/us/en/agents/ - H (HTML read) ; https://robinhood.com/us/en/policy/futures-and-event-contracts/ (title and date only, "Last Updated: July 2026") - H
- Legal PDFs under https://cdn.robinhood.com/assets/robinhood/legal/: `RHD_Fee_Schedule.pdf`, `Event_Contracts_Risk_Disclosure.pdf`, `rhd-futures-client-agreement.pdf`, `Robinhood%20Terms%20and%20Conditions.pdf` - H
- https://docs.robinhood.com/ (and `/crypto/trading/`) - H for the sitemap; page body is client-rendered and was not read

Exchanges and related:
- https://api.elections.kalshi.com/trade-api/v2/markets/{ticker} (public unauthenticated GET, four tickers) - H
- https://www.rothera.io/, `/venue`, `/faq` - M (small-model page summaries; corroborated by the sibling note `docs/research/venues/rothera-exchange-and-clearing.md`)
- https://og.com/ (nav, "APIs" link) - M; https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction - M (small-model summary)
- Sibling notes in this repo: `docs/research/venues/forecastex.md`, `docs/research/venues/rothera-exchange-and-clearing.md` - M (other agents' research, not re-verified here)
- PayBox discovery (read-only): `discover_plugins` and `discover_services` for "robinhood prediction markets" - H (empty plugin result)

Hints in the task brief checked: Robinhood page footer (H, confirmed); Shift Markets routing claim (not fetched; superseded by Robinhood's newsroom, H); The Block monthly chart (NOT FOUND).

## 18. Suspicious content / injection check

None found aimed at AI agents in any page, PDF or API response read. Informational oddities only: the publicly linked client-agreement PDF carries a "CONFIDENTIAL NOT FOR PUBLIC USE" page header; Robinhood's contract text includes prohibited-trader lists. A third-party press page exposed a press contact address, which was deliberately not copied here. No request in this task carried any personal identifier (generic User-Agent `insurance-markets-research/0.1` only).
