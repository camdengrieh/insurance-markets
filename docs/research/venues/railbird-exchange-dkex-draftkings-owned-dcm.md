# Railbird Exchange, LLC d/b/a DKeX (DraftKings-owned DCM) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages and PDFs, `gh` repo/code search, local PDF text extraction. No account, wallet, key, signature, POST or payment. No scripted requests were made to railbirdexchange.com or api.railbirdexchange.com by this run (see "Limits").

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, inference, or relayed from the sibling note; **L** = weak or stale. "M (sib)" = relayed from `docs/research/venues/railbird-exchange-draftkings.md`, a parallel run of this same venue that read the exchange's own site and rulebook with `curl` earlier today. I could not re-read those primary sources myself.

## Limits (read first)

- `railbirdexchange.com` and `dkex.com` (301 to the former) return HTTP 403 to WebFetch, so I could not read the rulebook, ToU, product certifications or fee page on the exchange's own host. Claims that depend on them are tagged M (sib).
- The sibling note records that the DKeX Website Terms of Use bar bots/scripts/scrapers from collecting site content. I therefore did not re-hit the site or its undocumented JSON endpoint. The fixtures for those endpoints are copies of the sibling's samples (see Fixtures).
- WebSearch budget for the session was exhausted before I started; discovery relied on WebFetch of known URLs, SEC EDGAR, CFTC, Bitnomial, DeFi Rate and the DraftKings IR CDN.
- This note **supersedes** `docs/research/venues/draftkings-predictions.md` on one point: DKeX does list its own contracts on its own order book (that note left it "unverified" and ranked DraftKings `skip`). It adds to the sibling note: clearing house named (Bitnomial), CFTC letter 26-13, Investor Day deck, DeFi Rate volume cross-check.

## 0. Bottom line

1. **Live and large (H).** DraftKings announced the DKeX launch on 2026-06-26. DeFi Rate, using the exchange's own daily market reports, shows about $2.0B of contracts (at $1 face) traded 1-18 Oct 2026 and $745M in the week of 12-18 Oct (M, observed 2026-10-18 20:30 ET). Volume ramped from near zero in July ($12M) to September ($1.9B).
2. **Real exchange, independent order book (H).** Railbird Exchange, LLC is a CFTC-designated contract market with its own central limit order book, fully collateralised binary contracts, cleared by **Bitnomial Clearinghouse** (moving off QC Clearing). Sports only so far.
3. **Independent leg for sports arbitrage, with one caveat (H/M).** DKeX liquidity does not come from CME, Crypto.com/CDNA, Kalshi or Polymarket. But DraftKings Predictions, the DraftKings FCM and affiliate Gus Cap are front ends or participants on the same book, and DraftKings says it also acts as market maker, so quotes are correlated with DraftKings Sportsbook pricing.
4. **Not integrable today.** No public API docs, no public live prices or book (only end-of-day CSVs and a settlement feed), access is KYC'd Self-Clearing Member or FCM customer, collateral is USD, and the ToU (as relayed) bans scripted collection. **PayBox cannot reach it.**
5. **adapter_priority = P2 (signal-only).** Raise to P1 if DKeX grants member/FCM API access plus a market-data licence that allows internal aggregation. The blocker is access, not depth.

## 1. Still live in 2026? Yes

| Evidence | Tag |
|---|---|
| DraftKings press release dated 2026-06-26: "announced the launch of its proprietary prediction markets exchange, DKeX, with integration into the unified DraftKings: Sports & Casino app"; "DKeX leverages the technology and CFTC license from DraftKings' acquisition of Railbird Technologies"; sports event contracts in 18 states. https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Launches-Proprietary-Exchange-to-Bolster-Differentiated-Predictions-Experience-2026.pdf | H |
| DraftKings 10-Q for the quarter to 2026-06-30, Note 3: Railbird acquired 2025-10-21; total consideration $84.8M ($18.3M cash, $28.7M equity, $37.8M contingent, up to $200M maximum); $58.1M operating-licence intangible; Railbird Exchange, LLC is "a federally licensed exchange designated by the CFTC". Revenue since acquisition "not material"; Prediction Markets revenue sits inside Sports revenue, not broken out. https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm | H |
| Q2 2026 results release (2026-08-06): CEO says Predictions is "growing faster than we anticipated"; no DKeX/Railbird wording; no separate Predictions volume. https://www.sec.gov/Archives/edgar/data/1883685/000188368526000027/q226-prx8kexx991.htm | H |
| Bitnomial news item dated 2026-06-29: "Wedbush joins DKeX and Bitnomial Clearinghouse"; Wedbush clients can clear and execute on DKeX. https://bitnomial.com/news/2026-06-29/wedbush-dkex-bitnomial-clearinghouse/ | H |
| DeFi Rate volume page for DraftKings Predictions, built from the exchange's daily market reports, observed 2026-10-18 20:30 ET: October to 18th $2.0B ($396M "dollars paid"), September $1.9B, August $89M, July $12M, June (from 11th) $13K. https://defirate.com/prediction-markets/volume/draftkings/ | M (aggregator, derived from exchange files) |
| Sibling run: settlements endpoint newest `settledAt` 2026-10-19T01:27Z, 416,861 settled markets in 12 h; product certifications dated up to 2026-10-16; CFTC submission REX 26-30 dated 2026-10-02. | M (sib) |
| CFTC letter 26-13 states "Railbird is a designated contract market" and recounts that staff letter 25-26 (2025-08-07) already gave Railbird relief; the hint "DCM approved June 2025" is therefore plausible, but I did not find the designation order itself. | H (letter 26-13) / L (June 2025 date) |

## 2. Kind and structure

- **kind = regulated-exchange (CFTC DCM), operator-owned.** Parent DraftKings Inc. (Nasdaq: DKNG). Retail distribution is DraftKings Predictions (operated by subsidiary GUS III LLC) inside the DraftKings app (H, press release).
- **Vertical stack (H, DraftKings Investor Day deck, March 2026, slide 18/22/27):** introducing broker, FCM, DCM (exchange), clearinghouse, market maker. The 2026 roadmap lists in-house FCM and DCO, combos, market making, in-house DCM; "launched with CME exchange; integrated Crypto.com to expand capabilities". Slide 27 says the sports product delivers content "through multiple exchange connections and in-house exchange". So DraftKings Predictions is a multi-exchange front end and DKeX is only one of its sources. https://s21.q4cdn.com/869500724/files/doc_presentations/2026/03/DraftKings-2026-Investor-Day-Final.pdf
- **Clearinghouse (H):** CFTC staff letter 26-13 (2026-05-04) grants no-action relief to "Railbird, Bitnomial, and their participants" and states "Bitnomial will now serve as the DCO clearing Railbird Contracts", "Railbird intends to clear contracts exclusively through Bitnomial after a transition period", replacing QC Clearing (the DCO of the former QCEX). The Commission amended Railbird's DCM order to let FCMs intermediate and carry customer accounts. https://www.cftc.gov/csl/26-13/download (extract in fixtures). Whether the QC Clearing transition is finished: NOT FOUND.
- **Affiliates on the exchange (M, sib):** "DraftKings Futures Commission Merchant ... introduces customers", and Gus Cap LLC "is a self-clearing member". What Gus Cap trades: NOT FOUND.
- **Third-party FCM (H):** Wedbush Securities joined DKeX on 2026-06-29. Other FCMs: NOT FOUND.

## 3. Market model

- **Binary YES/NO contracts, $1 notional, price in dollars, central limit order book with price-time priority** (H: the MM-program filing describes the aim of increasing liquidity on the exchange's central limit order book; M (sib): rulebook Rules 5.6-5.9 and certification GAMEWIN, price range $0.01-$0.99). The letter calls the products binary options or variable payout contracts that Railbird represents as CEA "swaps" and says they are fully collateralised with preset price caps and floors (H, letter 26-13). No categorical or scalar contracts seen; variable payout is defined in the rulebook but none observed (M, sib).
- **Combos ("parlays")**: bundles of legs traded as one instrument `COMBO-<uint64>`, also via RFQ; a losing leg settles the combo early at 0 (M (sib), fixture settlements sample). DraftKings says combos launched in mid-May and that more than 30% of customers had used them as of the 2026-06-26 release (H, press release). Sibling-derived: combos were 74% of contracts and about 28% of premium on 2026-10-17 (M (sib), arithmetic checked against its derived JSON).
- **Single-game props** are one binary per strike, ticker pattern `<LEAGUE>-<PRODUCT>-<PERIOD>-<event id>-<entity>[-GTE-P<strike*10>]` (M (sib), inferred from fixture rows).
- **Tokenisation: none.** Positions are ledger rows at the DCO. No chain, no token.
- **Hours:** about 23 h a day, 7 days, maintenance 5-6 am ET (M (sib)).

## 4. Chains and collateral

- No blockchain. Collateral is **USD cash**, held by the DCO, fully collateralised (H, letter 26-13 condition 1; M (sib) for the rulebook's bank-rail funding and no mention of crypto, stablecoins or cards).
- Bitnomial Clearinghouse accepts BTC, ETH and XRP as margin with haircuts for Bitnomial's own derivatives (H, https://bitnomial.com/clearinghouse). Whether any DKeX position can be margined with digital assets: NOT FOUND. Fully collateralised event contracts point to USD, so assume no.

## 5. Read API

**Verdict: `official-authenticated`** (exists for members, no public docs) plus a few public static/JSON endpoints that are end-of-day or settlement-only.

- **Docs URL: NOT FOUND** (searched: WebFetch of the DraftKings, DeFi Rate, Bitnomial and CFTC pages above; GitHub `gh search code "railbirdexchange.com"` and `"api.railbirdexchange.com"`, `gh search repos railbird|dkex` returned no SDK, OpenAPI or client; only unrelated blocklists and directories).
- **Evidence an API exists:** the DKeX market-maker programme requires participants to have "the ability to consistently monitor API usage" (H, https://cdn.prod.website-files.com/654e9651eae6c070bb781f0b/6a10bc7ef89698ca039302d4_MM%20Program%20(05.22.2026)%20-%20Public%20FINAL.pdf); the sibling quotes rulebook rules naming a "DKeX API" and an "advanced tier" of it, and a REST API that reports each market's price ladder (M (sib)).
- **Public endpoints seen by the sibling run (M (sib); response shapes saved in fixtures):**
  - `GET https://api.railbirdexchange.com/api/v1/settlements/recent?minutes=<n>&page=<n>&pageSize=<n>` returns `{"settlements":[{"marketName","ticker","status","settledAt","settlementPrice"}],"page","pageSize","totalCount","totalPages"}`. Other paths on that host returned 403 to the sibling.
  - Daily CSVs under `https://railbirdexchange.com/reports/{daily-market,daily-settlement,time-and-sales}/` (columns: Business Date, Symbol, Status, Open Interest, Trade Volume, High/Low, Last Price, Maturity; 27-100 MB per day, posted around noon ET) plus `/resources/certs/certs.json` and `/resources/notices/notices.json`.
- **A public trade tape is a regulatory condition (H):** letter 26-13 condition 3 requires Railbird to "publish on its website" for all contracts "trade timestamp, contract, quantity, and price" promptly after execution. In practice the sibling found it as a daily CSV, so there is no intraday public tape that I know of.
- **Live prices, order book, per-market lookup, WebSocket, FIX: NOT FOUND** publicly.
- **Auth and limits:** NOT FOUND. Rule-level order-rate caps exist but numbers are not public (M (sib)).
- **Market data rights (M (sib)):** members may use market data internally but may not redistribute it; an aggregator that re-publishes DKeX prices would need a licence.

## 6. Trade path

- **Programmatic for onboarded participants only.** A Self-Clearing Member signs a Self-Clearing Member Application and Agreement (H, MM filing) and enters orders via the website or API; FCMs may now intermediate customers (H, letter 26-13). Wedbush is an FCM on the exchange (H). Auth and request-signing scheme: NOT FOUND (M (sib): ID and password for the website; API credentials undocumented).
- Rulebook membership terms relayed by the sibling: KYC, a bank account, OFAC screening, and a certification that the member trades only for itself, which does not fit an agent that trades for other people unless it sits behind an FCM (M (sib)).
- DraftKings Predictions retail: fiat, KYC, in-app only; no API found (M; sibling note on DraftKings Predictions).
- Contact route for connectivity: the sibling saw a connectivity mailbox on the site's contact page; I did not contact anyone.

## 7. PayBox reachability: **no**

USD bank-rail collateral at a DCO, KYC'd membership or FCM account, undocumented API credentials. No EVM or Solana transaction proposal, signed order, deposit address or contract exists. A PayBox card or transfer could at most fund a human's brokerage account out of band. Not tested with any PayBox tool (not needed; no money-moving or signing tool was called).

## 8. Fees

- **Official fee schedule PDF, May 2026 (H, extract in fixtures; part of CFTC submission #26-04 per DeFi Rate (M)):** no membership fee, no settlement fee, no charge to place/cancel/modify. Taker fee per contract by the price of the taker's own side: $0.01 pays $0.0050; $0.02 pays $0.0085; $0.03-$0.98 pays $0.0100; $0.99 pays $0.0050. Maker $0.0025 per contract. Total per execution rounded **up** to the nearest $0.01.
- **Current site schedule (M (sib), differs from the May PDF):** FCM-routed taker tiers start at $0.0025 for $0.001-$0.009; **Market Maker (direct member) taker is a flat $0.02**; no rate stated for other direct members; combo maker fee `ceil_cent(0.035 * C * P * (1 - P))`. The PDF is probably superseded; use the site version for modelling and re-check.
- **DraftKings retail fees (M):** DeFi Rate (updated 2026-10-10) quotes both "up to 2 cents per contract per side" and the exchange schedule above, and says a sale before resolution pays the fee again. Whether DraftKings adds a markup on top of the exchange fee: NOT FOUND.
- Arbitrage implication (arithmetic on H numbers): a 1-contract taker round trip costs roughly 1 cent per side at mid prices on the FCM-routed schedule, and up to 2 cents for a direct-member market maker taking.

## 9. Resolution and dispute risk

- **The exchange resolves its own contracts** under per-product terms self-certified to the CFTC (M, DeFi Rate 2026-05-26: six self-certified product filings GAMEWIN, GAMESPREAD, GAMEPROPERTY, ENTITYSTAT, ENTITYACHIEVEMENT, ENTITYOUTPERFORM, first listing after close of business 2026-05-27; I did not read the certifications). Detail from the GAMEWIN certification (M (sib)): source priority is the governing body, then major media, then broadcasters; the exchange may overrule a result it deems "clearly erroneous"; postponed/cancelled events resolve to the **last fair market price set by the exchange**, not void and not 50/50.
- Further discretion (M (sib)): Outcome Review Committee decision within 72 hours that is final (Rule 7.1); exchange may change the source agency after trading starts (Rule 7.2); trade-bust decisions are final (Rule 5.11); settlement proceeds can be held up to 12 hours.
- **Conflict of interest (M, inference):** the same group runs the largest US sportsbook, the retail Predictions front end, the exchange, an FCM, a self-clearing member and (per the Investor Day deck) a market maker. The rulebook limits an FCM trading against its own customer's order but not the affiliate's liquidity-provider role (M (sib)).
- **Regulatory risk (H on titles only):** letter 26-13 states it does not address whether Railbird Contracts are consistent with CEA 5c(c)(5)(C) or Rule 40.11 (the sports/gaming event-contract restrictions), and is staff-only and revocable. The CFTC released a notice of proposed rulemaking on 2026-10-09 titled "CFTC Seeks Public Comment on Notice of Proposed Rulemaking Concerning the Inclusion of Certain Event Contracts in the Definition of Swap" (H, title seen on the CFTC press-release listing; body not read). State challenges to sports event contracts exist (sibling note on DraftKings Predictions).
- Halts occurred: a market-halt notice dated 2026-06-17 and maintenance windows (M (sib)).

## 10. Geo, ToS, automation

- **Retail:** DraftKings Predictions sports contracts in 18 states (H, press release); DeFi Rate (2026-10-10) says financial markets are available in 12 states and none in Maine or New Hampshire (M). State list: NOT FOUND. US residents, fiat USD, KYC.
- **Direct membership:** non-US residents with a foreign bank are contemplated by the rulebook (M (sib)); whether DKeX onboards them now: NOT FOUND.
- **Automation:** order-entry automation is expected for members (M (sib): rules on excessive messaging controls, algo malfunction). **Website automation is banned** by the ToU (last updated 2026-05-05, M (sib)): bots, scripts and scrapers may not "interact with the Website or the Content ... to collect any Content", and Content may not be used to train AI models. The CSVs and the settlements JSON count as Content on that reading. Safe position: no unattended scraping; request a data agreement or use member data only.
- Position limits and accountability levels: NOT FOUND; large-trader reporting threshold 250,000 contracts (M (sib)).

## 11. Liquidity (with dates)

| Metric | Value | Source / tag |
|---|---|---|
| DraftKings Predictions, week ended 2026-06-21 | about $3.4B annualized consumer volume, about $11.3B annualized total trading volume | H, press release (this was before DKeX carried material flow) |
| DKeX contracts traded at $1 face, 1-18 Oct 2026 | $2.0B (premium paid $396M) | M, DeFi Rate from exchange daily reports, observed 2026-10-18 |
| Week 12-18 Oct 2026 (18th incomplete) | $745M face; prior week $734M; 28 Sep-4 Oct $648M; 7-13 Sep $429M; 17-23 Aug $7.9M | M, DeFi Rate |
| Sports share, 19 Sep-18 Oct 2026 | $1.0B, 33.9% of DraftKings Predictions volume (the rest is probably combos, my inference) | M, DeFi Rate |
| Single days, premium: 14 Oct $14.9M, 15 Oct $20.2M, 17 Oct $40.3M (college football Saturday) | sibling computed from the time-and-sales CSVs | M (sib) |
| Open interest at close 2026-10-17 | 77.1M contracts at $1 face, 65.0M of them combos | M (sib) |

Caveats: "volume" conventions differ (face value vs premium vs both sides). Depth, spreads and top-of-book size are NOT FOUND (no public book). The venue is young and ramping with the NFL and college football season, so autumn numbers may not hold in the offseason. Compare apples to apples before ranking against Kalshi or Polymarket.

## 12. Event overlap (where arbitrage can exist)

- **On DKeX itself (M (sib), 93 certified product names through 2026-10-16):** NFL and college football (game win, spread, totals, player stats, awards, outrights), NBA/WNBA, NHL, MLB, NPB/KBO, ATP/WTA, UFC, soccer leagues (EPL, La Liga, Bundesliga, Ligue 1, MLS, Liga MX and others). **Politics, crypto price and macro: not found among DKeX certified products.**
- **Overlaps** with Kalshi and Polymarket sports markets and with sportsbooks. Best candidates are single-game binaries (moneyline, totals, spreads, player-prop strikes) that exist at the same strike elsewhere. Combos are bespoke and hard to hedge.
- DeFi Rate lists financials, economics, crypto, politics, business and culture on DraftKings Predictions (M). Given the Investor Day deck (CME and Crypto.com connections), I infer those non-sports markets are routed to CME or Crypto.com/CDNA, not DKeX (M, inference; not confirmed). They are therefore not DKeX liquidity.

## 13. Shared liquidity

- **DKeX is independent of CME, CDNA, Kalshi and Polymarket** (H for own CLOB and own clearing; MM programme text).
- **Not independent of DraftKings itself:** the DraftKings Predictions app, DraftKings FCM and affiliate Gus Cap trade or route into the same book; DraftKings states a market-maker role in its stack (H, Investor Day deck). Count DraftKings Predictions and DKeX as one leg, never two.
- Wedbush FCM clients also reach this book (H).
- Professional market makers probably quote several venues (M, inference), which keeps cross-venue edges small.

## 14. Adapter spec (for the aggregator)

Registry entry: `{ id: "dkex", name: "DKeX (Railbird Exchange)", kind: "regulated-exchange", market_model: "binary-clob", currency: "USD", chain: null, independent_from: ["kalshi","polymarket","cme","cdna"], same_leg_as: ["draftkings-predictions-sports"], live_read: "member-api-only", eod_read: "public-files-tos-restricted", tradable: "member-or-fcm-only", paybox: false }`.

- Instrument id = `ticker`/`Symbol`; each is one YES/NO binary, NO price = 1 - YES on the same book. Price unit USD per contract, 0.001-0.999 depending on ladder; quantity integer contracts; payout $1.
- Fee function: use the current site schedule (section 8) and round per execution up to a cent.
- Settlement statuses seen: `Settled`, `Settled Early`; daily-market statuses: `Open`, `Closed`, `Settled`. Settlement price can be a fraction (postponement contingency).
- **Feeds today:** (a) live book and trades: member or FCM API, undocumented, blocked; (b) settlement outcomes: public JSON, ToU-restricted; (c) end-of-day volume, OI and trades: CSVs, ToU-restricted and very large; (d) listing calendar: CFTC product certifications (new contract families appear days before listing).
- **Signal value without membership (if ToU cleared):** daily volume by league, new-listing calendar, settlement outcomes for rule cross-checks, combo share of flow. Not tradable prices.
- **Upgrade triggers to P1:** API docs obtained from DKeX or an FCM (Wedbush) with a market-data licence for internal aggregation; written confirmation that an automated agent can trade behind an FCM; confirmation of intraday public trade tape.

## 15. NOT FOUND / open questions

- Public API docs, auth/signing, WebSocket/FIX, rate-limit numbers (searched: DraftKings, DeFi Rate, Bitnomial and CFTC pages, GitHub code and repo search).
- Rulebook, ToU, certifications and current fee page on the exchange's own host (403 to WebFetch; relayed from the sibling only).
- Completion date of the QC Clearing to Bitnomial transition; whether Bitnomial's own FCM can carry DKeX customers; whether any digital-asset margin is accepted for DKeX positions.
- Order types and time-in-force; depth and typical spreads; position limits.
- What Gus Cap LLC does; which DraftKings Predictions markets still route to CME or Crypto.com after June 2026.
- Whether non-sports products are planned on DKeX.
- Re-check triggers: DraftKings Q3 2026 10-Q (early Nov 2026), new CFTC submissions REX 26-xx, the CFTC swap-definition rulemaking comment period.

## 16. Fixtures (all <= 50 KB), `docs/research/fixtures/railbird-exchange-dkex-draftkings-owned-dcm/`

- `PROVENANCE.txt` - who fetched what and why some files were copied, not re-fetched.
- `dkex-fee-schedule-2026-05-official-extract.txt` - text of the exchange's May 2026 fee schedule PDF (H).
- `cftc-letter-26-13-railbird-bitnomial-extract.txt` - text of CFTC letter 26-13 (H).
- `api-v1-settlements-recent-sample.json`, `daily-market-report-2026-10-17-head.csv`, `daily-settlement-2026-10-17-head.csv`, `time-and-sales-2026-10-17-head.csv` - response shapes copied from the sibling run's fixtures (M (sib)); not re-requested.

## 17. Sources

Primary or near-primary (read this session, H):
- DraftKings press release 2026-06-26: https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Launches-Proprietary-Exchange-to-Bolster-Differentiated-Predictions-Experience-2026.pdf
- DraftKings Investor Day deck, March 2026: https://s21.q4cdn.com/869500724/files/doc_presentations/2026/03/DraftKings-2026-Investor-Day-Final.pdf
- DraftKings 10-Q (quarter to 2026-06-30): https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm ; Q2 results release: https://www.sec.gov/Archives/edgar/data/1883685/000188368526000027/q226-prx8kexx991.htm
- CFTC staff letter 26-13 (2026-05-04): https://www.cftc.gov/csl/26-13/download ; letter list: https://www.cftc.gov/LawRegulation/CFTCStaffLetters/AllLetters/index.htm?page=1 ; it cites letter 25-26 (2025-08-07), https://www.cftc.gov/csl/25-26/download (not read)
- DKeX Fee Schedule PDF (May 2026): https://cdn.prod.website-files.com/654e9651eae6c070bb781f0b/6a074b1fee3d59f98499ae83_Fee%20Schedule.pdf
- DKeX Market Maker Program filing (CFTC submission 26-06, 2026-05-22): https://cdn.prod.website-files.com/654e9651eae6c070bb781f0b/6a10bc7ef89698ca039302d4_MM%20Program%20(05.22.2026)%20-%20Public%20FINAL.pdf
- Bitnomial: https://bitnomial.com/news/2026-06-29/wedbush-dkex-bitnomial-clearinghouse/ ; https://bitnomial.com/clearinghouse ; https://bitnomial.com/exchange/docs (Bitnomial's own exchange API, not DKeX)

Secondary (M):
- DeFi Rate: https://defirate.com/news/draftkings-railbird-exchange-files-first-sports-prediction-market-contracts/ (2026-05-26) ; https://defirate.com/news/draftkings-predictions-tops-2-3b-annualized-volume-railbird-launch-parlays-soon/ (2026-05-08) ; https://defirate.com/prediction-markets/draftkings/ (data as of 2026-10-10) ; https://defirate.com/prediction-markets/volume/draftkings/ (observed 2026-10-18)
- Trade press: https://www.pymnts.com/economy/markets/2026/draftkings-brings-11-billion-prediction-market-into-flagship-app/ ; https://bettorsinsider.com/news/2026/06/28/draftkings-launches-dkex-its-own-prediction-markets-exchange-built-on-railbird-technology/ ; https://www.cryptotimes.io/2026/06/26/draftkings-launches-own-prediction-market-exchange-dkex-drops-cme/
- Sibling notes in this repo: `docs/research/venues/railbird-exchange-draftkings.md` (rulebook 2026-09-22, ToU, site fee page, public endpoints, volume computation), `docs/research/venues/draftkings-predictions.md` (CME/CDNA broker structure, stale on DKeX).

Prompt-injection check: none of the pages, PDFs or search results read in this session contained instructions aimed at an AI agent. A GitHub code-search hit exposed a third-party staff email address in an unrelated file; not recorded or used.
