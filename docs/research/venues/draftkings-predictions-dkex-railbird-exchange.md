# DraftKings Predictions / DKeX (Railbird Exchange) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public GETs of the DraftKings IR CDN, cftc.gov, data.sec.gov, bitnomial.com; WebFetch of public pages and SEC filings; `gh api` raw reads of third-party GitHub files. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Generic User-Agent `insurance-markets-research/0.1` only.

Tags: **H** = read first-hand in a primary source this session (URL cited; "WebFetch excerpt" means the quoted sentences came back from a WebFetch of the primary page); **M** = secondary source, third-party analysis, or my inference; **M (sib)** = relayed from a sibling note in this repo that read the exchange's own site and rulebook; **L** = weak, stale or internally inconsistent.

Limits (read first):
- `railbirdexchange.com` returned **HTTP 403 to WebFetch** (H). `predictions.draftkings.com` also 403 (Akamai; H). I made **no scripted request** to `railbirdexchange.com` or `api.railbirdexchange.com`: the DKeX Website Terms of Use, as quoted by sibling note `railbird-exchange-draftkings.md`, bar bots/scripts from collecting site Content. Everything about the rulebook, site fees, ToU, certifications and the public JSON/CSV endpoints is therefore **M (sib)**; the response samples in the fixtures are **copies** of the sibling run's, not re-fetched.
- The session's web-search budget was exhausted before I started (one attempt, no results). Discovery relied on direct fetches, SEC, CFTC, DeFi Rate, Bitnomial, Wedbush and GitHub.
- Sibling notes read for context: `railbird-exchange-draftkings.md`, `railbird-exchange-dkex-draftkings-owned-dcm.md`, `draftkings-predictions.md` (the last is stale on DKeX: it ranked DraftKings `skip` believing it was only a CME/CDNA broker). Where I agree with them, the claim is re-checked against a primary source of my own unless tagged M (sib).

---

## 0. Bottom line

1. **Live and growing (H/M).** DraftKings announced the launch of its own exchange DKeX on 2026-06-26 (H, press release). Railbird Exchange, LLC was designated a CFTC DCM on 2025-06-13 (H, CFTC letter 25-26). A third-party aggregator built from the exchange's daily files shows $231M of contracts (at $1 face) traded on 2026-10-17, a record day, and $2.0B for 1-18 Oct 2026 (M, DeFi Rate, observed 2026-10-18 21:30 ET).
2. **One brand, two layers.** *DraftKings Predictions* is the retail front end (subsidiary GUS III LLC, an NFA-registered introducing broker, H). *DKeX* is the exchange behind it, an independent CLOB with its own clearing (Bitnomial Clearinghouse, H). Before DKeX, Predictions ran on CME and Crypto.com | CDNA with Wedbush as FCM (H, FY2025 10-K). Since 2026-06-26 the sports flow runs on DKeX (H: "vertically integrated foundation"; M: trade press says it dropped CME). Whether any non-sports contract in the app still routes to CME/CDNA: NOT FOUND.
3. **Independent leg for sports, but a price follower.** The DKeX sports book is independent of Kalshi, Polymarket, CME and CDNA (H structure). But the DraftKings app, the DraftKings FCM and affiliate Gus Cap trade the same book (M sib), and a third-party trade-level study through 2026-10-01 finds DKeX single-game quotes sit on the DraftKings sportsbook / Pinnacle prices with a ~3 cent two-sided spread (M). Count DraftKings Predictions + DKeX as **one** leg.
4. **Not integrable today.** No public API docs, no public live prices or order book, only end-of-day CSVs and a settlement JSON that the ToU (as relayed) forbids scraping; trading needs a KYC'd Self-Clearing Member or an FCM account (e.g. Wedbush); collateral is USD at the clearinghouse. **PayBox cannot reach it.**
5. **adapter_priority = P2 (signal-only / watchlist).** Real, independent and large for sports, but no legitimate live feed and no execution path. Do not schedule adapter engineering until DKeX grants a data/API agreement. See section 13.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| DraftKings news release 2026-06-26: "announced the launch of its proprietary prediction markets exchange, DKeX, with integration into the unified DraftKings: Sports & Casino app"; "DKeX leverages the technology and CFTC license from DraftKings' acquisition of Railbird Technologies"; "sports event contracts in 18 states". https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Launches-Proprietary-Exchange-to-Bolster-Differentiated-Predictions-Experience-2026.pdf (fixture extract) | Launched | H |
| CFTC staff letter 25-26 (2025-08-07): "On June 13, 2025, Railbird was designated as a DCM, and on December 16, 2024, QC Clearing was registered as a DCO." https://www.cftc.gov/csl/25-26/download | DCM status | H |
| CFTC staff letter 26-13 (2026-05-04): Bitnomial replaces QC Clearing as the DCO for Railbird contracts; Railbird's DCM order amended to allow FCM intermediation. https://www.cftc.gov/csl/26-13/download | Exchange operating and regulated | H |
| Bitnomial news item 2026-06-29: Wedbush "announced membership in both DKeX, DraftKings' proprietary exchange, and the Bitnomial Clearinghouse". https://bitnomial.com/news/2026-06-29/wedbush-dkex-bitnomial-clearinghouse/ ; Wedbush release repeats it (no go-live date, eligibility or API/FIX statement) | Third-party FCM member | H |
| DeFi Rate volume page, updated 2026-10-18 (daily files from 2026-06-11): Oct 17 $231M face / $36M paid / 866K trades; week Oct 12-18 $745M | Trading heavily one day before today | M |
| Independent GitHub study (`Kuriboh493/draftkings-edge`, data to 2026-10-01): 12.4M trades, 2.09B contracts, 113 business days from 2026-06-11 | Same series, corroborates DeFi Rate (~$2.0B face through Sep) | M |
| DraftKings 10-Q (quarter to 2026-06-30, filed 2026-08-07), Note 3: Railbird acquired 2025-10-21; "a federally licensed exchange designated by the Commodity Futures Trading Commission"; Prediction Markets revenue sits inside Sports revenue. https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm | Exchange owned and carried at $58.1M operating-licence intangible | H (WebFetch excerpt) |
| SEC filing list through 2026-10-02: 8-Ks of 2026-08-25 (items 1.01/2.03/7.01) and 2026-09-25 (item 4.01) are not prediction-related; no shutdown, injunction or withdrawal found | No adverse event found | H (list) |
| `railbirdexchange.com` / `dkex.com` | 403 to WebFetch; not scripted. Discovery hint says dkex.com redirects to the former, title "DKeX" | M (hint) |

Verdict: **still_live = true.** Latest datapoint is 2026-10-18 trading data.

---

## 2. Kind and structure

- **Kind:** CFTC-designated contract market (exchange) owned by DraftKings Inc. (Nasdaq: DKNG), plus the DraftKings Predictions retail broker front end. Not a protocol, no chain. (H)
- **Corporate stack:** introducing broker (GUS III LLC d/b/a DraftKings Predictions, H press release boilerplate), DCM (Railbird Exchange, LLC d/b/a DKeX, H), DCO (Bitnomial, H). The Investor Day deck (March 2026) reportedly lists an in-house FCM, DCO and market maker on the roadmap (M sib; I did not open the deck). DraftKings is registered "as an introducing broker" and earns "introducing fees ... paid by futures commission merchants" (H, FY2025 10-K, WebFetch excerpt).
- **Affiliates on the exchange (M sib, from the exchange's regulatory-compliance page):** "DraftKings Futures Commission Merchant, which introduces customers to access the Exchange" and Gus Cap LLC, "a self-clearing member". What Gus Cap trades: NOT FOUND.
- **Third-party FCM:** Wedbush (H). Others: NOT FOUND.
- **Clearing:** Bitnomial Clearinghouse, LLC is "now" the DCO and "Railbird intends to clear contracts exclusively through Bitnomial after a transition period" (H, letter 26-13). Whether the QC Clearing transition has finished: NOT FOUND.
- **Pre-DKeX structure (H, FY2025 10-K filed 2026-02-13, WebFetch excerpts):** launched 2025-12-19; relied on "Wedbush Securities Inc. ... in its capacity as our futures commission merchant", "Crypto.com | Derivatives North America (CDNA)" and "CME's and CDNA's market makers that provide liquidity"; offered in 47 jurisdictions. Secondary pages dated 2026-08-26 still list "DKEx, CDNA, and CME" (L, NEXTPredict, internally inconsistent) and the discovery hint says a broker site shows GUS III "routing to DKeX, CDNA and CME" (M, hint). I read these as: the app may still show some CME/CDNA-listed non-sports contracts; unverified.

## 3. Market model

- **Binary YES/NO contracts, $1 notional, price in dollars per contract, central limit order book, price-time priority, fully cash-collateralised** (M sib: rulebook Rules 5.6-5.9, certification GAMEWIN price range $0.01-$0.99; H: letter 26-13 says Railbird contracts "are fully collateralized and therefore have preset price caps and floors" and are binary options or variable payout contracts that Railbird represents as CEA "swaps"). Variable payout contracts are defined but none seen in the 100-item certification index (M sib fixture read by me).
- **Combos ("parlays"):** bundles of legs traded as one instrument `COMBO-<uint64>`, also via an RFQ system (M sib). DraftKings says combos launched mid-May and "more than 30% of customers have used combinations" (H, press release). Third-party study: combos were 1.24B of 2.09B contracts and ~24% of YES stake through 2026-10-01; buyers lost 19.3% of $120M (M, Kuriboh493). Combos are bespoke and not hedgeable elsewhere: exclude from the scanner.
- **Single contracts:** one binary per strike, symbol `LEAGUE-MARKETTYPE-PERIOD-EVENTID-OUTCOME[-GTE-P000xx]` where the last token is the line x10 (M, decoded identically by two independent third parties: `nosherzapoo/dkex-railbird-dashboard` and the sibling note). Examples in the fixture: `MLB-PHRN-FG-01DU6T4ITMPMO1G-RIOS000-GTE-P00025` = "Richie Palacios 2.5". Team/player codes (e.g. `NYTS000`) are opaque and mapped via the settlement report's market names (M).
- **Tokenisation:** none; positions are clearinghouse ledger rows. **Categorical/scalar:** none observed.
- **Hours:** about 23 h/day, 7 days, maintenance 5-6 am ET (M sib).

## 4. Chains and collateral

- **No chain.** USD cash at the DCO, fully collateralised (H letter 26-13 condition 1; M sib: rulebook funding via bank accounts, no crypto, stablecoin or card mention).
- Bitnomial Clearinghouse accepts BTC (15% haircut), ETH (20%), XRP (40%) for its *own* derivatives besides USD (H, https://bitnomial.com/clearinghouse, WebFetch excerpt); whether any DKeX position can use digital-asset margin: NOT FOUND. Fully collateralised event contracts point to USD only (M, inference).
- DraftKings retail funding (M, L): Apple Pay, debit, bank transfer; not crypto-friendly.

## 5. Read API

**Verdict: `official-authenticated`** (member API exists, undocumented publicly) plus thin public end-of-day files.

- **Docs URL: NOT FOUND.** Searched: Bitnomial docs (no DKeX mention, H), Bitnomial clearinghouse page, Wedbush release, DeFi Rate, `gh search code/repos` for `api.railbirdexchange.com`, `railbirdexchange`, `dkex`, `railbird exchange` (hits: blocklists, a YC directory entry, and two data-analysis repos built on the public CSVs; no SDK, OpenAPI or client).
- **Evidence an API exists (M sib):** rulebook rules naming the "DKeX API" (trade confirmations, cancels, settlement notifications, an "advanced tier"), site text "Our REST API indicates which ladder is used for each market", and the market-maker programme requiring ability to monitor API usage. WebSocket/FIX: NOT FOUND.
- **Public endpoints (M sib; shapes saved in fixtures, not re-requested):**
  - `GET https://api.railbirdexchange.com/api/v1/settlements/recent?minutes=<n>&page=<n>&pageSize=<n>` -> `{"settlements":[{"marketName","ticker","status","settledAt","settlementPrice"}],"page","pageSize","totalCount","totalPages"}`. Other paths on that host returned 403 to the sibling.
  - Daily CSVs `https://railbirdexchange.com/reports/{daily-market,daily-settlement,time-and-sales}/` with `manifest.json` per family, from 2026-06-11. Columns: Daily Market `Business Date,Symbol,Status,Open Interest,Trade Volume,High Price (USD),Low Price (USD),Settlement/Last Trade Price (USD),Maturity Date and Time (ET)`; Time & Sales `Business Date,Symbol,Transaction Date and Time,Last Price (USD),Last Quantity` (no aggressor side); Settlement `Market Name,Ticker,Status,Date and Time of Settlement (ET),Price (USD)`. 27-100 MB per day, posted around noon ET (DeFi Rate says "next morning"). Two independent third parties describe the same manifest/CSV scheme (M, `nosherzapoo/dkex-railbird-dashboard`, `Kuriboh493/draftkings-edge`).
  - `/resources/certs/certs.json`, `/resources/notices/notices.json` (CFTC filings; new product families appear days before listing).
- **Regulatory reason a tape exists (H):** letter 26-13 condition 3: Railbird "will publish on its website ... trade timestamp, contract, quantity, and price" promptly after execution. In practice this is the daily Time & Sales CSV; no intraday public tape found.
- **No public live price, order book or per-market endpoint** (NOT FOUND). Members see best bid/offer and depth to five levels (M sib, Rule 5.14).
- **Auth and limits:** member ID/password for the website; API credential and signing scheme NOT FOUND; per-member order-rate cap exists but number is not public (M sib).
- **Market-data rights (M sib):** members may use data internally but "may not distribute, sell or retransmit market data to any third party" (Rule 11.1(b)). An aggregator that republishes DKeX prices needs a licence.
- **DraftKings Predictions app (retail):** no API found. Akamai blocks plain clients; a third-party study says its pages open only with browser TLS impersonation (`curl_cffi`) (M). An Apify scraper exists (relayed by sibling). **Do not build on either**: bot-protection evasion and likely ToS breach.
- Fixtures: `docs/research/fixtures/draftkings-predictions-dkex-railbird-exchange/` (section 16).

## 6. Trade path

- **Programmatic for onboarded participants only.** Self-Clearing Members enter orders via website or API; FCMs may now intermediate customers (H letter 26-13; Wedbush is a member, H). Auth/signing: NOT FOUND (undocumented credentials, not wallet signatures).
- Direct membership terms (M sib, Rule 3.1): KYC, bank account, OFAC check, and a certification that the member "will trade only for itself and will not serve as an intermediary for any other Person". An agent trading for other people must sit behind an FCM.
- Retail DraftKings Predictions: in-app only, fiat, KYC; no API.
- Contact route for connectivity exists on the exchange's contact page (M sib); not contacted.

## 7. PayBox reachability: **no**

USD at a DCO, KYC'd membership or FCM account, undocumented API credentials. No EVM/Solana transaction proposal, signed order, deposit address or contract exists, so no Base/Ethereum/BNB/Arbitrum/Polygon/Solana wallet can place or sign anything. A PayBox card/transfer could at most fund a human's brokerage account out of band; that is not an agent trade path. No PayBox tool was called.

## 8. Fees

**Exchange fees (M sib, current site `/fees-and-hours`; a May 2026 PDF in fixtures differs and is probably superseded):** no membership, settlement, or order/cancel/modify fee; charged on matches only; per-execution total rounded **up to the nearest $0.01**.
- Taker, FCM-routed, per contract by the price of the taker's own side: $0.001-$0.009 -> $0.0025; $0.010-$0.019 -> $0.0050; $0.020-$0.029 -> $0.0085; $0.030-$0.979 -> $0.0100; $0.980-$0.999 -> 0.5 x ($1 - price).
- Taker, Market Maker (direct member): flat $0.02. Other direct members: not stated.
- Maker: $0.0025 per contract. Combo maker: `ceil_cent(0.035 * C * P * (1 - P))`.
- May 2026 PDF (M sib): taker $0.0050 at $0.01, $0.0085 at $0.02, $0.0100 at $0.03-$0.98, $0.0050 at $0.99; maker $0.0025.

**DraftKings retail fees: unresolved.** DeFi Rate (verified 2026-10-10): "Up to 2 cents per contract per side, all-in" in its summary but "takers pay between $0.005 and $0.01" in its body, and a sale before resolution pays again (M, self-contradictory). NEXTPredict: $0.01-$0.03 (L, inconsistent). DraftKings' own terms: unreadable (403). The effective retail cost also includes the quote spread (~3 cents two-sided on NFL moneylines, M, Kuriboh493) and the combo markup (~2-2.7% per leg, M).

Arbitrage arithmetic (on M sib numbers): buying 100 YES at $0.50 as an FCM-routed taker costs $1.00 (1 cent per contract = 2% of price); holding to settlement avoids a second fee. A direct-member taker pays 2 cents.

## 9. Resolution and dispute risk

- **The exchange resolves its own contracts** under per-product terms self-certified to the CFTC (M sib, GAMEWIN certification dated 2026-05-22): source priority governing body, then major media, then broadcasters; the exchange may overrule a result it deems "clearly erroneous"; postponed/cancelled events resolve to "the last fair market price, as determined by the Exchange", not void and not 50/50. The fixture shows early settlements at $0.07 and $0.50 for same-event contracts (H data; cause not stated).
- **Discretion (M sib):** Outcome Review Committee decides within 72 hours, final (Rule 7.1); source agency can change after trading starts (7.2); trade busts final (5.11); settlement proceeds can be held up to 12 hours (6.3(c)); market halts have occurred (notice 2026-06-17).
- **Conflict of interest (M, inference from H facts):** the same group runs the largest US sportsbook, the retail front end, the exchange, an FCM and a self-clearing member, and DraftKings' desk is the main combo maker (M, third-party). Cross-venue pairs need per-contract rule mapping because Kalshi/Polymarket void or settle differently.
- **Regulatory continuity (H):** letter 26-13 "is not intended to address whether any of the Railbird Contracts are consistent with ... CEA section 5c(c)(5)(C) or Commission regulation 40.11" and is staff-only; the FY2025 10-K says "there are currently numerous lawsuits challenging the CFTC's exclusive jurisdiction over event contracts" and "we may not be able to continue to offer certain event contracts". On 2026-10-09 the CFTC released an NPRM to expressly include event contracts (sports, politics, cultural, weather) in the swap definition and an interim final rule excluding casino-style gambling products from it (H titles and dates, M content: WebFetch of https://www.cftc.gov/PressRoom/PressReleases/9310-26 and /9309-26; comment periods 30 days from Federal Register publication). Sports contracts remain the most legally exposed category.

## 10. Geo, ToS, automation

- **Retail:** US only, state by state. Press release: sports event contracts "in 18 states" (H). DeFi Rate (verified 2026-09-09, M): all markets in 18 states + DC (AK, AL, CA, DE, DC, FL, GA, HI, ID, MN, ND, NE, NM, OK, RI, SC, SD, TX, UT); financial markets only in 12 (AR, AZ, CT, IA, LA, MI, MT, NV, OH, PA, TN, WA); sports unavailable in 18 plus PR (CO, IL, IN, KS, KY, MA, MD, MO, MS, NC, NJ, NY, OR, VA, VT, WI, WV, WY); none in ME and NH. Older secondary counts (38 / 45 / 47-48 states) are for different dates or categories (L).
- **Direct members:** non-US residents with a foreign bank are contemplated by the rulebook (M sib); whether DKeX onboards them now: NOT FOUND.
- **Automation:** order-entry automation is expected for members (M sib: rules on excessive messaging controls, algo malfunction). **Website automation is banned**: the ToU (last updated 2026-05-05, M sib) forbids bots/scripts/scrapers "to interact with the Website or the Content ... to collect any Content" and use of Content to train AI models. The CSVs and the settlements JSON count as Content on that reading. Safe position: no unattended collection; get a written data agreement.
- DraftKings' own Predictions terms (automation, fees): NOT FOUND (403).

## 11. Liquidity (with dates)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Week ended 2026-06-21 | ~$3.4B annualized consumer volume; ~$11.3B annualized total trading volume (metric definitions not given; pre-dates material DKeX flow) | DraftKings press release | H |
| 2026-10-17 (Sat, college football) | $231M face; $36M paid; 866K trades | DeFi Rate, observed 2026-10-18 | M |
| Week 12-18 Oct 2026 | $745M face (last day incomplete); 2.7% of all venues; prior week $734M (2.9%) | DeFi Rate | M |
| 1-18 Oct 2026 / Sep 2026 / Aug / Jul | $2.0B / $1.9B / $89M / $12M face ($396M / $437M / $34M / $6M paid) | DeFi Rate | M |
| 2026 to date (from 2026-06-11) | $3.9B face, $863M paid | DeFi Rate | M |
| 2026-06-11 to 2026-10-01 | 12.4M trades, 2.09B contracts, YES side put up $494M; singles 844M contracts ($374M), combos 1,244M contracts ($120M) | Kuriboh493/draftkings-edge | M (third-party calc.) |
| Open interest at close 2026-10-17 | 77.1M contracts ($77M face), of which 65.0M combos | sibling derivation from the daily market report | M (sib) |
| Order-book depth, spreads | Members only; ~3 cents two-sided on NFL moneylines (2026-10-01 sample) | NOT FOUND publicly; Kuriboh493 | M |

Reading: "volume" is face value and counts every contract once, so headline numbers overstate capital at risk (paid is ~20% of face). Single-contract open interest is small (about 12M contracts, ~$12M face, at the Oct 17 close), so executable depth in any one game is thin and unknown. The venue is ramping with the NFL/college football season; offseason volume may fall. Compare apples to apples (face vs paid, one side vs both) before ranking against Kalshi or Polymarket.

## 12. Event overlap (where arbitrage can exist) and shared liquidity

**On DKeX (M sib fixture of the exchange's certification index, 100 items to 2026-10-16, all sports):** NFL and college football (win, spread, totals, player stats and achievements, awards, outrights such as Super Bowl and CFP), NBA, WNBA, NHL (puck line, exact score, BTTS, overtime), MLB, NPB, KBO, tennis, UFC, soccer leagues, golf (symbols such as `PGA-...`). **Politics, crypto price, macro: no certified DKeX product found.** DeFi Rate lists financials, economics, crypto, politics, business, culture on the DraftKings Predictions app (M); I infer those are not DKeX liquidity (M, inference).

**Overlap:** sports single-game binaries (moneyline, spread, totals, player-prop strikes) that exist at the same strike on Kalshi and Polymarket US/global, plus sportsbooks. Third-party trade-level evidence (M, Kuriboh493, data to 2026-10-01): single contracts overall are near fair (YES buyers -1.6% of stake), pre-game moneyline buyers pay about 7% over fair while in-play buyers pay about 1%, and on NFL moneylines DKeX YES buyers returned -6.4% vs -2.1% on Kalshi (before Kalshi's taker fee) over a four-week sample. So edges against Kalshi/Polymarket will be small and fee-sensitive, and are largest pre-game; combos are structurally overpriced (2-2.7% per leg) and not hedgeable.

**Shared liquidity:**
- Independent of Kalshi, Polymarket, CME and CDNA for the sports book (H own CLOB + own DCO; M sib MM programme).
- **Not independent of DraftKings:** the DraftKings Predictions app, DraftKings FCM, Gus Cap and Wedbush FCM clients all reach this one book; DraftKings' desk is a major maker and Flutter reportedly the other (L: "DraftKings has said", per a third party). Quotes track DraftKings Sportsbook and Pinnacle (M). Treat as one leg, correlated with the sharp-book consensus the scanner may already hold.
- Any non-sports contract in the app that is still CME/CDNA-listed is that exchange's liquidity, not a distinct leg (unverified).

## 13. Adapter priority and spec

**P2 (signal-only / watchlist).** Why not P1: no legitimate live feed, no execution path for our wallet stack, ToU bars scraping, data redistribution needs a licence, quotes follow the sportsbook. Why not skip: independent regulated sports book with real volume (~2.7% of all venues by face value, M), a public regulatory tape/EOD record, and the blocker is a commercial agreement rather than missing depth.

Registry stub (no code until unblocked): `{ id: "dkex", name: "DKeX (Railbird Exchange)", kind: "regulated-exchange", market_model: "binary-clob", currency: "USD", chain: null, independent_from: ["kalshi","polymarket","cme","cdna"], same_leg_as: ["draftkings-predictions-sports"], live_read: "member-api-only", eod_read: "public-files-tos-restricted", tradable: "member-or-fcm-only", paybox: false }`.

Data model: instrument id = `ticker`/`Symbol`; NO price = 1 - YES on the same book; price USD 0.001-0.999 depending on ladder (whole-cent for most singles; tapered 0.1c/0.5c ends for select singles and all combos, M sib); quantity integer contracts; payout $1; settlement price may be fractional; statuses `Open`, `Closed`, `Settled`, `Settled Early`. Exclude `COMBO-*`. Fee function per section 8.

Feeds today: (a) live book/trades: member or FCM API, blocked; (b) settlements and EOD files: public but ToU-restricted; (c) listing calendar: product certifications (watch the CFTC filings pages for Railbird rather than the exchange site: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations, linked from the CFTC DCM page, not opened by me).

**Upgrade to P1 if:** DKeX (or an FCM such as Wedbush) supplies API docs plus a market-data licence permitting internal aggregation; written confirmation that a program-run agent may trade behind an FCM; an intraday public tape; or DKeX lists non-sports (politics/crypto/macro) contracts.
**Re-check:** DraftKings Q3 2026 10-Q (early Nov 2026); new CFTC submissions (REX 26-xx); NPRM comment period outcome; any state action against DraftKings Predictions.

## 14. NOT FOUND / open questions

- Official API docs, auth/signing, WebSocket/FIX, rate-limit numbers (searched: sources in section 5).
- First-hand text of the rulebook, ToU, current fee page and certifications (railbirdexchange.com 403 to WebFetch; not scripted).
- DraftKings' own Predictions terms: retail fee markup, automation rules (403).
- Which DraftKings Predictions contracts, if any, still route to CME or CDNA after 2026-06-26.
- Completion of the QC Clearing -> Bitnomial transition; digital-asset margin for DKeX positions; other FCMs.
- Order types and time-in-force; depth, spreads, position limits.
- What Gus Cap LLC trades; the identity of the "other large maker".
- Whether non-sports products are planned on DKeX.
- Any court or state action specific to DKeX or DraftKings Predictions after 2026-08-26 (web search unavailable).

## 15. Suspicious content

- `https://github.com/HarrierOnChain/DraftKings-Predictions` (and its toolkit parent): a "trading bot" repo that labels its status "roadmap" while claiming DraftKings Predictions is "live in production today" and telling users to clone, "drop in your keys" and run, with a Telegram contact. No DraftKings API exists to support it. Likely promotional or credential-harvesting bait. Read as data only; not cloned, run, or relied on.
- `https://apify.com/hypebridge/draftkings-predictions` (relayed by the sibling note, not fetched by me): contains text aimed at AI agents and advertises "browser TLS impersonation" and proxy fallback to evade bot blocking. Not followed.
- `Kuriboh493/draftkings-edge` documents using TLS impersonation against Akamai; recorded as a fact about access friction, not followed.
- The ToU clause against feeding Content to AI models (relayed) is a legal term, recorded in section 10.

## 16. Fixtures (all <= 50 KB), `docs/research/fixtures/draftkings-predictions-dkex-railbird-exchange/`

- `PROVENANCE.txt` - which files I fetched and which are copies, and why.
- `draftkings-press-release-2026-06-26-extract.txt`, `cftc-letters-25-26-and-26-13-extract.txt`, `sec-edgar-draftkings-filings-2026.json` - first-hand (H).
- `defirate-volume-extract-2026-10-18.txt` - small-model summary of a third-party page (M).
- `api-v1-settlements-recent-sample.json`, `daily-market-report-2026-10-17-head.csv`, `time-and-sales-2026-10-17-head.csv`, `daily-settlement-2026-10-17-head.csv`, `dkex-fee-schedule-2026-05-official-extract.txt` - copied from sibling runs' fixtures (M sib), shape evidence only.

## 17. Sources

First-hand (H):
- DraftKings news release 2026-06-26 (IR CDN PDF): https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Launches-Proprietary-Exchange-to-Bolster-Differentiated-Predictions-Experience-2026.pdf
- CFTC letters 25-26 and 26-13: https://www.cftc.gov/csl/25-26/download , https://www.cftc.gov/csl/26-13/download
- CFTC press releases 2026-10-09 (titles read; content via WebFetch summary): https://www.cftc.gov/PressRoom/PressReleases/9310-26 , https://www.cftc.gov/PressRoom/PressReleases/9309-26
- DraftKings FY2025 10-K (filed 2026-02-13): https://www.sec.gov/Archives/edgar/data/1883685/000188368526000013/dkng-20251231.htm ; 10-Q (to 2026-06-30): https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm ; filing list: https://data.sec.gov/submissions/CIK0001883685.json (all read via WebFetch/curl; 10-K and 10-Q partially)
- Bitnomial: https://bitnomial.com/news/2026-06-29/wedbush-dkex-bitnomial-clearinghouse/ , https://bitnomial.com/clearinghouse , https://bitnomial.com/exchange/docs ; Wedbush release: https://www.wedbush.com/wedbush-joins-dkex-and-bitnomial-clearinghouse-further-expanding-access-to-prediction-markets-and-digital-asset-derivatives/
- 403 evidence: https://railbirdexchange.com/ and https://predictions.draftkings.com/en/how-to-trade-predictions-availability returned HTTP 403 to WebFetch on 2026-10-19.

Secondary (M/L):
- DeFi Rate: https://defirate.com/prediction-markets/volume/draftkings/ (updated 2026-10-18) ; https://defirate.com/prediction-markets/draftkings/ (updated 2026-10-10; states verified 2026-09-09)
- Trade press: https://www.cryptotimes.io/2026/06/26/draftkings-launches-own-prediction-market-exchange-dkex-drops-cme/ ; https://bettorsinsider.com/news/2026/06/28/draftkings-launches-dkex-its-own-prediction-markets-exchange-built-on-railbird-technology/ ; https://www.pymnts.com/economy/markets/2026/draftkings-brings-11-billion-prediction-market-into-flagship-app/ ; https://nextpredict.io/platforms/draftkings/ (2026-08-26, L)
- Third-party GitHub analyses (untrusted data): https://github.com/Kuriboh493/draftkings-edge (data to 2026-10-01) ; https://github.com/nosherzapoo/dkex-railbird-dashboard (pushed 2026-09-20)
- Sibling notes (M sib): `docs/research/venues/railbird-exchange-draftkings.md` (rulebook dated 2026-09-22, ToU, site fees, endpoints, certification index), `docs/research/venues/railbird-exchange-dkex-draftkings-owned-dcm.md`, `docs/research/venues/draftkings-predictions.md` (stale on DKeX)
- Discovery hints: MEXC article and dimers (M, not re-verified by me)

Prompt-injection check: the pages, PDFs and API-style files I read contained no instructions aimed at an AI agent except as listed in section 15.
