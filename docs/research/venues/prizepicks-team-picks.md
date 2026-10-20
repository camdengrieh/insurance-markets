# PrizePicks Team Picks (PrizePicks Predict) - adapter spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public page reads and unauthenticated GETs only (generic User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. The WebSearch quota ran out partway through, so third-party corroboration is limited to what is cited below; every key claim rests on PrizePicks' own pages and legal PDFs.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference from first-hand data; **L** = weak/stale. "NOT FOUND (searched: ...)" where nothing was found.

Overlap note: an earlier pass on the same operator exists at `docs/research/venues/prizepicks-predict.md` (and `prizepicks-predict-and-sleeper-markets.md`). This file re-verified its key claims independently and adds the October 2026 Missouri suspension, the 2026-09-24 combo-lineup launch, the customer-agreement order and automation clauses, and a Kalshi public-API sample for the underlying book.

---

## 0. Bottom line

1. **Live, but it is a front end, not a venue.** "Team Picks" is the sports half of **PrizePicks Predict**, run by **Performance Predictions II, LLC** (CFTC/NFA-registered FCM, subsidiary of SidePrize LLC d/b/a PrizePicks). (H)
2. **All liquidity is Kalshi's.** The FCM disclosure (dated 2026-06-16) says trades are "transmitted to the Firm for execution on a Kalshi exchange" and "executed on KalshiEx, cleared through Kalshi Klear"; the launch release says "All event contracts listed on PrizePicks are Kalshi markets". **Not an independent arbitrage leg; it is the Kalshi book seen through a retail app.** (H)
3. **No API of any kind for customers**, and the FCM Customer Agreement bars third-party agents and software/automated access to the Platform. (H)
4. **PayBox cannot reach it.** US-resident, SSN-KYC'd, USD, debit-card/bank funded via a linked PrizePicks DFS account; no chain, token or signing surface. (H)
5. **Small and getting regulatory heat.** Required-to-be-segregated customer collateral was about $1.31M on 2026-10-15; PrizePicks suspended new Team Picks in Missouri on 2026-10-06. (H for collateral, M for Missouri)
6. **adapter_priority = skip.** Model it in the registry as `kind: broker_frontend`, `routes_to: [kalshi]` so the Kalshi adapter is not double counted. Read market data from Kalshi's public API.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Date | Tag |
|---|---|---|
| Help page "Team and Culture Picks": "Last updated: October 16, 2026"; "Where can I play?" same date, shows Team Picks "Powered by PrizePicks Predict" | 2026-10-16 | H |
| `predict-regulatory` daily "Cleared Swaps Customer Collateral Report", newest row 2026-10-15; monthly net-capital reports through August 2026 | 2026-10-15 | H |
| FCM Disclosure Document (CFTC 1.55) dated 2026-06-16; FCM Customer Agreement "as of June 16, 2026" | 2026-06-16 | H |
| Newsroom: new combo lineups ("multi-athlete and multi-team combo picks") launched, describes "PrizePicks Predict ... offering Team Picks and Culture Picks as event contracts" | 2026-09-24 | H |
| Newsroom: "largest day ever" for Prediction Markets on Big Game Sunday, "45% increase in trading volume" (no absolute numbers) | 2026-02-10 | H |
| Casino.org / SportsBettingDime: PrizePicks suspended new Team Picks in Missouri; existing entries stay live; Culture Picks unaffected; "Team picks are live in 34 states" | 2026-10-06/07 | M |
| Launch release: "Kalshi's Event Contracts Are Now Live in the PrizePicks App", 38 states + DC at launch (Team and/or Culture) | 2025-11-14 | H |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** FCM / broker front end. The Firm "provides execution, clearing, and settlement services for event contracts, which are regulated as cleared swaps" and "does not provide services with respect to daily fantasy sports" (those are SidePrize LLC). Source: regulatory-disclosure PDF s.4.
- **Contract model (H via Kalshi sample, M for PrizePicks mapping):** binary YES/NO event contracts priced $0.00-$1.00, full cash collateral, no margin ("binary options that require the full payment ... at execution"). Underlying order book is Kalshi's CLOB. PrizePicks displays price as a payout multiplier ("Numbers followed by x, like 2x"; 2x = $0.50). No on-chain tokenisation. Whole contracts only; $1 minimum purchase.
- **Team Picks scope (H):** game winners, spreads, totals, futures (champions, MVP, season results); sports named on the product page: NFL, CFB, WNBA, MLB, NBA, NHL, tennis, UFC (boxing in the state-page text). https://www.prizepicks.com/ways-to-pick
- **Two different things share the "Team Picks" name:**
  - *Single Team Picks* = a Kalshi contract bought through the FCM (H).
  - *Combo lineups* ("Combine up to 6 Team Picks", "Team & Player Lineups", launched 2026-09-24, Power Play only, fixed payout multipliers) are PrizePicks-style DFS entries. Whether each leg is a Kalshi contract or PrizePicks-priced is NOT FOUND; the customer agreement s.4(i) "Combination Trade" wording suggests the Kalshi leg is a real contract and the DFS leg is not. (M) Not arbitrageable either way.
- **Early exit (H):** single picks can be sold ("instant payout") at current market; availability depends on liquidity (thelines review, M).

## 3. Chains and collateral

None on-chain. Collateral is USD cash in a segregated "Cleared Swaps Customer Account" (LSOC) at the FCM/Kalshi Klear (H, disclosure s.9). Funding is only from the linked PrizePicks DFS account; "Contracts cannot be purchased ... using a credit card" (H, customer agreement s.4). Team/Culture Picks deposits accepted: Visa debit, Mastercard debit (eligible states), Instant Bank Transfer, Apple Pay via those debit cards; Venmo/PayPal/credit funds cannot be used for Team or Culture Picks (H, https://www.prizepicks.com/help-center/deposits, updated 2026-06-12). Payments processed via Aeropay (H, help-center/protecting-your-funds, 2026-05-16). Minimum deposit $10; one withdrawal per 24h; 72h hold on bank-transfer deposits (H, help-center/withdrawals, 2026-06-17).

## 4. Read API

- **Official/public API: NONE.** NOT FOUND (searched: sitemap.xml 5,630 URLs for developer/api/docs pages; robots.txt (allows all, no API paths); help center index (28 articles, none on API); product/legal pages; GitHub repo search for "prizepicks predict kalshi" returned 0 repos). (H for sitemap/robots)
- **Unofficial:** third-party repos exist for scraping the DFS Player Picks projections endpoint on `api.prizepicks.com` (repo metadata only, not opened; the one code hit named a PerimeterX bypass). None concern Team Picks. That host is undocumented, bot-protected and covered by the automation ban below, so it was not probed. (L)
- **Correct read path for the aggregator = Kalshi's public API** (shared liquidity). Documented hosts: REST `https://external-api.kalshi.com/trade-api/v2` (also `https://api.elections.kalshi.com/trade-api/v2`), WebSocket `wss://external-api-ws.kalshi.com/trade-api/ws/v2`; docs say market data is accessible without authentication, the WebSocket handshake needs API-key headers (H for URLs from https://docs.kalshi.com/getting_started/api_environments.md; M for the auth statements, from a summarised https://docs.kalshi.com/llms.txt). Confirmed two unauthenticated GETs this session (fixtures in section 12):
  - `GET /markets?series_ticker=KXNFLGAME&status=open&limit=2` returns `{cursor, markets:[{ticker, event_ticker, title, yes_sub_title, status, yes_bid_dollars, yes_ask_dollars, volume_fp, open_interest_fp, close_time, market_type:"binary", rules_primary, ...}]}` with dollar prices as 4-dp strings. (H)
  - `GET /markets/{ticker}/orderbook` returns `{orderbook_fp:{yes_dollars:[[price,size],...], no_dollars:[...]}}`. (H)
  - Kalshi's docs also list FCM-member-only endpoints (fills, orders, subtraders, positions); this is presumably how PrizePicks' FCM integrates and is not available to outsiders. (M)
- **PrizePicks-specific flow is not observable.** No field in public Kalshi data identifies which orders came from PrizePicks. So there is nothing PrizePicks-specific to ingest, and no mapping from PrizePicks board items to Kalshi tickers is published (NOT FOUND).
- Rate limits / websocket for PrizePicks: NOT FOUND (no API). Kalshi limits: https://docs.kalshi.com/getting_started/rate_limits.md (covered by the Kalshi spec).

## 5. Trade path

- **None for agents.** Orders are entered by a human in the PrizePicks app or website; order flow is routed by the FCM to KalshiEx. (H)
- Order rules per customer agreement s.14 (H): all orders are **limit orders**, price cannot be more than 5% from the current market price, unfilled orders expire "shortly thereafter", **no partial fills**; selling may require the same lot sizes as the original buys (two 35-lots must be sold as two 35-lot orders).
- Customer agreement s.12(c)(vii): trades must be placed "directly yourself without the services of a third-party agent ... unless you have expressly disclosed ... and we have granted our advance approval". s.27(iii): no software/program/device "to access or obtain information through the Platform or to automate the process of accessing or obtaining such information" other than a web browser or applications approved in writing. (H)
- Firm may limit positions, refuse any order, liquidate, or terminate the account at its sole discretion (s.13, s.19, s.20). (H)
- An affiliate market maker (Performance Predictions III LLC) trades the same Kalshi markets, may take the other side of customer orders, and gets preferential fees, data and connectivity (disclosure s.4/6; agreement s.12(q)). (H)

## 6. PayBox / EVM reachability

**paybox_reachable = no.** No chain, wallet or token interface; funding is fiat via debit/bank into a US-KYC'd PrizePicks account; no transaction proposals or signed orders exist. An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) cannot interact with it. (H)

## 7. Fees

- **Commission (H):** $0.005-$0.02 per contract, per side (open and close), total rounded up to the nearest cent. Table: $0.01 -> $0.005, $0.02 -> $0.010, $0.03 -> $0.015, $0.04-$0.99 -> flat $0.02 (so $2.00 per 100 contracts at any price from 4c to 99c). Added to the entry cost on buys, subtracted from proceeds on sells; **no fee if held to settlement** (help-center/team-and-culture-picks, updated 2026-10-16 states the same range). Fee schedule PDF is dated 2025-10-27 (almost 12 months old) but the October 2026 help page repeats the range.
- Charges may also include third-party DCO/regulatory fees and taxes; rates can change without notice and be varied for promotions (fee schedule, agreement s.5). (H)
- Whether Kalshi's own taker fee is additive or replaced by this commission: NOT FOUND. Implication (M): for a given book, buying through Kalshi directly is never worse on price and avoids the order-size and 5% price-band restrictions, so a PrizePicks leg is dominated by the Kalshi leg.
- Funding/withdrawal costs: card/bank via Aeropay; see section 3.

## 8. Resolution mechanism and dispute risk

- Contracts settle under **Kalshi's rulebook and each contract's "view full rules"** terms; customers acknowledge them (agreement s.11, s.22). Settlement is by KalshiEx/Kalshi Klear; proceeds credited to the Event Contract Account, then swept to the PrizePicks account. (H) Example rule text from the Kalshi sample: "If Philadelphia wins the Dallas vs Philadelphia Pro Football game originally scheduled for Oct 26, 2026, then the market resolves to Yes." (H)
- So resolution risk is Kalshi's (identical to the Kalshi leg), plus **FCM-layer risk**: position limits, liquidation "in its sole discretion", forced liquidation if a sports contract ceases to be available in a state (disclosure s.6), a 24-hour window to object to confirmations (agreement s.9), 1-year contractual claim limit, New York exclusive forum (s.31). (H)
- Regulatory dispute risk is elevated for **sports** contracts: the disclosure notes sports contracts were listed by self-certification and the CFTC "has not ... made a determination"; states are acting (Missouri AG cease-and-desist letters to six operators, not PrizePicks, in September 2026 per M sources; PrizePicks voluntarily suspended new Missouri Team Picks 2026-10-06; a web-search summary also mentioned Ohio cease-and-desist letters to 10 operators, source not opened, L).

## 9. Geo / ToS / automation

- US residents only; natural persons 18+ (19+ AL, 21+ AZ/IL/MA/VA/IA per state tables) with SSN/identity KYC; entities must be US-domiciled (agreement s.10, s.12(a-b), s.12(n)). (H)
- Availability by state differs by product. The "Where can I play?" page is **internally inconsistent**: headline "34 states + D.C.", body "33 states", explicit list of 31 states (28 at 18+, AL 19+, IA and VA 21+); the table block carries "Last updated: May 19, 2026" while the page says October 16, 2026. Missouri was suspended 2026-10-06. Treat any state list as unreliable; the app geo-checks at login. (H for the inconsistency)
- VPNs and location-altering services are prohibited; violators are blocked from deposits, withdrawals and entries (help-center/vpn, 2026-05-16). (H)
- Automation: prohibited as quoted in section 5. (H) Public pages are crawlable (`robots.txt` has an empty Disallow), but that covers page crawling, not use of the trading Platform.
- Other: PrizePicks offers 24/7 trading (disclosure s.6). Allwyn International AG owns 62.29% of the parent as of January 2026 (disclosure s.6). (H)

## 10. Liquidity (PrizePicks-only; the book itself is Kalshi's)

- **No volume or open-interest figure is published.** NOT FOUND (searched: press releases, help center, regulatory page, third-party reviews). The only volume statement is relative ("45% increase in trading volume on Big Game Sunday", 2026-02-10). (H)
- **Proxy: FCM "Cleared Swaps Customer Collateral Value Required to be Segregated"** (customer cash tied to open positions after the daily sweep to the PrizePicks account; roughly open interest at cost): **$1,309,207 on 2026-10-15**; across 100 daily reports 2026-05-29 to 2026-10-15: min $478,997, median $1,278,872, mean $1,392,433, max $4,883,179 (2026-06-30). Source: https://www.prizepicks.com/predict-regulatory (H for the numbers; M for the interpretation). Saved as fixture JSON.
- The FCM held $14.4M in segregation on 2026-10-15 (includes firm residual interest) and reported net capital $21.4M for August 2026 (H). Per the disclosure, 1,160 customers hold 50% of cleared-swaps customer funds as of 2026-04-30 (H).
- Scale context (M): Kalshi sample market `KXNFLGAME-26OCT26DALPHI-DAL` had `volume_fp` 48,393.84 and `open_interest_fp` 43,728.48 contracts on 2026-10-19; PrizePicks is a small fraction of that book.

## 11. Event overlap (where arbitrage exists) and shared liquidity

- **Categories offered (H):** US pro and college sports (winners, spreads, totals, futures), UFC/boxing, tennis; Culture Picks: politics/elections, music, movies, awards, economics (Culture Picks are out of scope for "Team Picks" but share the same plumbing).
- **Overlap with other venues:** everything overlaps with **Kalshi** (identical contracts) and, by event, with Polymarket US, Novig, Robinhood, Underdog, DraftKings Predictions, Crypto.com and sportsbooks. But because the book is Kalshi's, **PrizePicks adds no independent price**; any cross-venue edge is found on Kalshi directly.
- **Shared liquidity (H):** `shares_liquidity_with: kalshi` (relation `broker_for`). Evidence: https://www.prizepicks.com/predict-regulatory/regulatory-disclosure s.4-5; launch release 2025-11-14.
- **Polymarket route (M):** the 2025-11-11 release announced a multi-year Polymarket partnership for the "soon-to-launch" offering (H for the announcement). Nothing in the June 2026 disclosure (names only KalshiEx/Kalshi Klear) or the October 2026 help pages shows it live. Even if it launches, it would route into Polymarket's own book, so still an alias, not a leg.

## 12. Adapter recommendation

- **adapter_priority = skip.** Reasons: duplicate Kalshi liquidity; no API; ToS prohibits automation and third-party agents; fiat/KYC/US-only; tiny size; state-by-state shutdown risk for sports contracts.
- Registry entry: `slug prizepicks-team-picks`, `kind: broker_frontend`, `routes_to: [kalshi]`, `status: live`, `geo: US residents, per-state, sports contracts being rolled back state by state`, `data: {public_api: false, live_orderbook: false}`, `shared_liquidity: [{target: kalshi, relation: broker_for, evidence_url: https://www.prizepicks.com/predict-regulatory/regulatory-disclosure, confidence: H}]`.
- Do not build a scraper. If PrizePicks-specific pricing is ever wanted, the compliant routes are manual observation in the app or a written partnership/approval under agreement s.12(c)(vii) and s.27.
- Cheap monitoring worth keeping: poll the public `predict-regulatory` collateral table to watch whether the product keeps growing or shrinks (fixture shows the shape).

### Open questions
1. Is Kalshi's trading fee passed through on top of the PrizePicks commission, or replaced by it?
2. Are the legs of "combo" Team lineups real Kalshi contracts or PrizePicks-priced entries?
3. Does the affiliated market maker's flow change PrizePicks-visible prices relative to the Kalshi book (price improvement or stale quotes)?
4. Will the Polymarket route go live, and if so under which exchange/DCO?
5. How many states currently allow Team Picks (34+DC headline vs 31 listed vs Missouri suspension)?
6. PrizePicks-specific volume and open interest (not published).

---

## Fixtures (`docs/research/fixtures/prizepicks-team-picks/`)

| File | What | Source |
|---|---|---|
| `fcm-customer-collateral-and-net-capital.json` | 100 daily customer-collateral rows (2026-05-29 to 2026-10-15) and 12 monthly net-capital rows parsed from the public page | https://www.prizepicks.com/predict-regulatory |
| `kalshi-public-markets-series-KXNFLGAME-2026-10-19.json` | Real unauthenticated Kalshi response, 2 NFL game markets (4.5 KB): the underlying contract shape | `external-api.kalshi.com/trade-api/v2/markets` |
| `kalshi-public-orderbook-KXNFLGAME-26OCT26DALPHI-PHI-2026-10-19.json` | Real unauthenticated Kalshi order book (1.7 KB) | `.../markets/{ticker}/orderbook` |
| `fee-schedule-2025-10-27-summary.txt` | Commission table summarised | predict-regulatory/fee-schedule |
| `customer-agreement-2026-06-16-key-clauses.txt` | Short verbatim clauses (funding, order rules, automation, agents, disputes) | predict-regulatory/customer-agreement |
| `fcm-disclosure-2026-06-16-section4-excerpt.txt` | Kalshi routing, affiliated market maker, capital, ownership | predict-regulatory/regulatory-disclosure |

No PrizePicks API response fixture exists because there is no public API. The Kalshi samples are the underlying book and do not prove that a given Kalshi ticker appears on the PrizePicks board.

---

## Sources

- https://www.prizepicks.com/help-center/team-and-culture-picks (2026-10-16; pricing, fees, whole contracts, early sell) [H]
- https://www.prizepicks.com/help-center/where-can-i-play (2026-10-16; state availability, inconsistent counts) [H]
- https://www.prizepicks.com/ways-to-pick (product page: Team and Culture Picks, combos, FAQ; also reached via /teamandculturepicks) [H]
- https://www.prizepicks.com/predict-regulatory (index, daily collateral, net capital) [H]
- https://www.prizepicks.com/predict-regulatory/regulatory-disclosure (PDF dated 2026-06-16) [H]
- https://www.prizepicks.com/predict-regulatory/customer-agreement (PDF "as of June 16, 2026") [H]
- https://www.prizepicks.com/predict-regulatory/fee-schedule (PDF "as of 10/27/2025") [H]
- https://www.prizepicks.com/press-news/prizepicks-launches-prediction-markets-offering-with-kalshi (2025-11-14) [H]
- https://www.prizepicks.com/press-news/prizepicks-partners-with-polymarket-for-prediction-markets-expansion (2025-11-11) [H]
- https://www.prizepicks.com/press-news/prizepicks-sets-record-for-prediction-markets-engagement-on-big-game-sunday (2026-02-10) [H]
- https://www.prizepicks.com/press-news/prizepicks-launches-new-product-slate-for-football-season (2026-09-24) [H]
- https://www.prizepicks.com/help-center/deposits (2026-06-12), /withdrawals (2026-06-17), /protecting-your-funds (2026-05-16), /vpn (2026-05-16) [H]
- https://www.prizepicks.com/sitemap.xml and /robots.txt (no developer/API pages; robots allows all) [H]
- Provenance flag: the regulatory PDFs are embedded from a third-party-hosted viewer domain (`dainty-kleicha-6ab032.netlify.app`, path `/pdfs/*.pdf`), not a prizepicks.com host. Content matches first-party help-page footers and the first-party Kalshi release, so treated as authentic but flagged.
- https://docs.kalshi.com/getting_started/api_environments.md (REST/WS base URLs) [H]; https://docs.kalshi.com/llms.txt (endpoint index, FCM-member endpoints, market data without auth; WebFetch summary) [M]
- https://external-api.kalshi.com/trade-api/v2/markets and /markets/{ticker}/orderbook (unauthenticated GETs 2026-10-19) [H]
- https://www.casino.org/news/prizepicks-halts-team-picks-sports-derivatives-in-missouri/ (2026-10-07/08) [M]
- https://www.sportsbettingdime.com/news/industry/prizepicks-suspends-missouri-team-picks-sports-event-contracts/ (2026-10-06) [M]
- https://www.thelines.com/prediction-markets/prizepicks-predict/ (updated 2026-10-09; Kalshi backend, 34 Team Picks states, early-exit liquidity caveat) [M]
- https://sbcamericas.com/2026/10/07/prizepicks-sports-contracts-missouri/ returned HTTP 403; seen only as a search-result title [L]
- GitHub repo search results for PrizePicks scrapers (metadata only, nothing opened or cloned) [L]
- Discovery hint https://www.cbssports.com/prediction/news/best-prediction-market-apps/ was not read first-hand (superseded by primary sources above).

Suspicious content / embedded instructions: none found in any page or API response. Pages contained promotional copy, legal text and leftover template placeholders (`{{core_offer_banner=...}}`); nothing aimed at AI agents. Third-party GitHub hits include a CAPTCHA/bot-protection bypass demo for the PrizePicks DFS API; noted only, not opened.
