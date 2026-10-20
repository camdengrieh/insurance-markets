# Rothera Exchange and Clearing - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:10-01:20 UTC). READ-ONLY: page reads, public PDFs, and unauthenticated GETs to Rothera's own public-files host. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed. One URL (an X article) returned HTTP 402 and was dropped, not paid.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses or derived tables, each <= 50 KB): `docs/research/fixtures/rothera-exchange-and-clearing/` (section 12).

---

## 0. Bottom line

1. **Live and big.** CFTC-regulated DCM + DCO, launched late May 2026, 6.22 billion contracts traded 2026-05-21..2026-10-18 and ~98M contracts of open interest on 2026-10-18 (H, computed from Rothera's own daily files). It is an **independent, single central limit order book** (price/time priority), not an AMM or a sportsbook (H).
2. **But it is not reachable by an agent or a PayBox wallet.** Retail goes only through FCMs (Robinhood is the visible one). Direct access is for institutions (FCMs, or non-FCM "Direct Access Participants" that must also hold a Market Maker Agreement and trade for their own account only). Collateral is **USD** funded by wire / real-time payments, not crypto. Order entry and live market data are **FIX only**, and the platform docs sit behind a password (H). No REST/WebSocket is documented anywhere I could read.
3. **The only public data is end-of-day files**, free and unauthenticated: a per-symbol daily table (OHLC, settlement, volume, OI) and a full nanosecond-stamped trade tape, published once a day after the 4 pm CT roll (H). No live quotes, no order book, no market-list API.
4. **Robinhood is distribution, not a second liquidity pool.** Robinhood Derivatives LLC (FCM) routes event contracts into this same book (H). So "Robinhood" must not be modelled as an independent arbitrage leg next to Rothera. Robinhood separately routes other contracts to Kalshi/ForecastEx (M); those are other venues.
5. **adapter_priority = P2 (signal-only).** Real, deep, independent liquidity, and a free full trade tape that is valuable for lead-lag and calibration research against Kalshi/Polymarket. But no live quotes and no trade path means it can't be a live arbitrage leg, and EOD data is stale for edge detection.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Daily files regenerated | `https://publicfiles.rotheramarkets.com/` index "Generated 2026-10-18 21:30 UTC"; newest `mkt_eod_20261018.csv` (7,094 symbols, 184,790 trades on the day) | H |
| Company timeline | "May 2026: Initial launch with Core PCE Price Index, U.S. Weekly Jobless, and Professional Baseball"; June: soccer, tennis, Fed; July onward: football, golf, hockey, basketball, elections (https://www.rothera.io/company) | H |
| Fresh regulatory filings | Notice 26-101 dated 2026-10-12; product filing 26-112 Tesla Q3 2026 EPS; ~200 entries on /regulatory-notices | H |
| Recent news items | 2026-10-08 "On the Definition of a Swap", 2026-09-22 Adaptive infrastructure post (https://www.rothera.io/news-and-insights) | H |
| Conflicting claim | Datawallet "announced / in development" (from the discovery hint) is **stale/wrong**: the venue has traded since 2026-05-21 (first daily file) | H (own data) |
| Domain | `rotheramarkets.com` 301-redirects to `https://www.rothera.io/`; `rothera.com` timed out from my network (the FAQ's contact link points to rothera.com) | H/L |

Verdict: **still_live = true.** The official site is **https://www.rothera.io/** (the discovery hint's "official site not located" is resolved).

---

## 2. Kind and market model

- **Kind (H):** regulated exchange + clearinghouse for event contracts. Legal entity "Rothera Exchange and Clearing LLC", wholly owned by Rothera, LLC, a Robinhood/Susquehanna joint venture, "separate, but affiliated" from Robinhood (https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/). Formerly MIAXdx (itself ex-LedgerX): acquisition announced Nov 2025, closed Jan 2026 (https://www.rothera.io/company, H). SEF registration is "dormant".
- **Market model (H):** every contract is a **binary** "Will X ...?" swap (FAQ: "Its event contracts are swaps that can be traded until settlement"). Prices are in dollars **$0.01-$0.99**, minimum tick **$0.01** (NFL game T&C), settlement value of an in-the-money contract **$1**. Each outcome is its own symbol/contract (e.g. each team in a futures market, each Senate-race party, each spread/total line is a separate binary). Categorical sets are therefore sets of independent binaries whose prices need not sum to 1 (observed 2026-10-18: `CNTRLSEN-26-REP` 0.40 + `CNTRLSEN-26-DEM` 0.64 settlement prices). "Rothera does not set prices or odds; buyers and sellers submit orders" (FAQ, H). Not scalar; "scalar-like" products (CPI, claims, EPS thresholds, point totals, rate-change outcomes) are ladders of binary thresholds (e.g. `NFLTOTAL-26OCT18HOUJAX-43`, `ECUSFED-26OCT-H25`).
- **Order book (H):** single all-to-all **CLOB**, price/time priority (DCM Rule 4.3(B)); retail and institutional flow in the same book (FAQ). Order types: Limit orders and Quotes (market-maker limit orders) only; no indications of interest; resting limit orders auto-cancel **30 days** after placement (Rule 4.3). Hours **24/7**, maintenance Thursday 02:00-04:00 CT; trade-date roll at **16:00 CT** (https://www.rothera.io/venue, H).
- **Tokenisation (H):** none. Positions are cleared by the DCO and held at the FCM/Participant level in USD-collateralised accounts. No on-chain token.
- **Symbol format (H, from `mkt_eod` / trade tape):** `<FAMILY>[-<EVENT>]-<OUTCOME>`, e.g. `NFLGAME-26OCT18BUFLV-LV` (event BUFLV on 2026-10-18, outcome LV), `NFLSPREAD-26OCT18HOUJAX-JAX2`, `NFLTOTAL-26OCT18HOUJAX-43`, `ECUSFED-26OCT-H25`, `SENRACE-26OH-DEM`, `CNTRLHOU-26-REP`, `USPRESIDENT-28-JVAN`, `EPL-27-ARS`, `NBA-27-BOS`. Team/candidate codes are short abbreviations, so cross-venue matching needs a mapping table (see `docs/market-linking-design.md`). The daily table groups symbols by `product` (the event).

---

## 3. Chains and collateral

- **No blockchain.** USD only. Rule 6.1: Participants must deposit "the USD funds required to fully collateralize Orders ... prior to submission" to the Company DCO; contracts are fully funded, "no guarantee fund requirements" (venue page). Funding by wire and real-time payments (RTP); funds held in segregated accounts (https://www.rothera.io/venue, DCM Rulebook 2026-05-20, H).
- No stablecoin, no EVM/Solana contract, no bridge. (NOT FOUND: searched site pages, FAQ, rulebooks, participant agreement for any crypto funding path.)

---

## 4. Read API

**Verdict: `exists = official-public` for end-of-day files only; real-time data is participant-only FIX; no REST/WebSocket documented.**

### 4a. Public daily files (H; unauthenticated GET, no key, no stated rate limit)

Host: `https://publicfiles.rotheramarkets.com/` (AmazonS3 behind CloudFront; directory index is plain HTML, `cache-control: no-cache`). Pointer from `https://www.rothera.io/volume-and-open-interest`: Rothera "publishes volume, price, and open interest for the prior day's trading session daily at about 4:15 pm Central Time" and "if a file is unavailable, you will see 'access denied'" (H, summarised by page-fetch).

| Path | Content | Cadence |
|---|---|---|
| `clearing/outbound/mkt_eod_YYYYMMDD.csv` | one row per live or just-settled symbol | daily; series from 2026-05-21 (151 files) |
| `exchange/outbound/trade_data/trades_eod_YYYYMMDD.csv` (`.csv.gz` for recent days) | full trade tape: `timestamp,contract,price,quantity` (UTC, nanosecond precision, no side/aggressor, no counterparty) | daily; available 2026-07-28..2026-10-18 (88 files) |
| `contract_terms/<Family>-T&C.pdf` | per-family contract terms (56 PDFs) | when a family is listed |

`mkt_eod` columns (H, verified on `mkt_eod_20261018.csv`): `date, product, symbol, expiration_date, trade_count, volume, oi, block_volume, settlement_price, open, high, low, close, contracts_delivered`. All values are quoted strings. `volume`/`oi` are in contracts (face $1). `settlement_price` is the exchange's daily settlement (0/1 once the event has settled, e.g. `NFLGAME-26OCT18HOUJAX-HOU` = 1). OHLC blank when no trades. Example row: `"2026-10-18","CNTRLSEN-26","CNTRLSEN-26-DEM","2027-11-03","79","20342","945628","0","0.64","0.64","0.64","0.61","0.64","0"`.

Day boundary (H, trade tape 2026-10-18): first print 2026-10-17T21:00:00Z, last 2026-10-18T20:59:59Z, i.e. the 16:00 CT roll while CDT is in force. CDT ends 2026-11-01, after which the roll should move to 22:00Z (M, inferred from the T&C's CT definition).

Not in the public files: bids/asks, depth, event titles/descriptions, market status, resolution text. Titles come only from the per-family T&C PDFs and the filings on `/regulatory-notices`. **Market listing metadata is not machine-readable** beyond the symbol grammar.

Third-party aggregation: DeFi Rate says its Rothera volume series is licensed from "Rothera's public daily market reports" (https://defirate.com/prediction-markets/volume/rothera/, M).

### 4b. Real-time data (participants only)

- "Standard FIX API access for order entry and market data", drop copy, and API-accessible reference data; SFTP file access for FCMs; ISV integrations (https://www.rothera.io/solutions, https://www.rothera.io/venue, H). WebSocket: not mentioned (NOT FOUND: searched venue, solutions, FAQ, news pages).
- Platform docs: `https://docs.rothera.io/` redirects to a password gate titled "Rothera Platform Documentation" ("This page is password-protected", H). FIX message spec, ports, sessions: **NOT FOUND (gated)**.
- DCM Rule 10.2 / Non-FCM Participant Agreement s.9: market data may be used "solely for [the Participant's] own internal business purposes" and not redistributed to any third party without written consent (H). This governs participant feeds; the public EOD files carry no stated licence (NOT FOUND: searched /legal, FAQ, the files host).

### 4c. Endpoints I did NOT find

- No REST market list, no order-book endpoint, no WebSocket, no on-chain contract, no subgraph, no public GitHub org. The legacy LedgerX/MIAXdx docs host `docs.ledgerx.com` 301-redirects to `docs.miaxdx.com`, which now serves an unrelated page titled "Takeover By Hide_khan" (see section 11). Do not use any legacy LedgerX API link.

---

## 5. Trade path

**none for an agent / for PayBox.** (H)

- Retail: only via an FCM or introducing broker, "Retail customers access Rothera through intermediaries" (FAQ). Rule 4.4: anyone not an approved Direct Access Participant "may trade Contracts only as Customers of an FCM Participant". The FCM checks collateral before each order. Robinhood Derivatives, LLC is the visible FCM ("Clearing Firm" on /legal), app-only; no public Robinhood order API for event contracts found (NOT FOUND: searched Robinhood newsroom and Rothera pages; I did not search Robinhood developer docs).
- Direct: FCM Participant or Non-FCM "Direct Access Participant". Non-FCM agreement (v052126) says access is "for its own proprietary account" and that the participant "will maintain a Market Maker Agreement with the Company at all times". Market makers must be eligible contract participants, sign the program agreement, and meet minimum quoting metrics (https://www.rothera.io/solutions). Entities must be organised in the US (or another jurisdiction on a case-by-case basis), pass OFAC screening, and show beneficial ownership (Rule 2.2, H).
- Auth/signing: FIX session credentials issued on onboarding (M; details gated). No wallet signature scheme exists.
- Onboarding route: contact form on `/contact` only (H).

---

## 6. PayBox reachability

**paybox_reachable = no.** A PayBox EVM/Solana wallet cannot trade here: there is no on-chain contract or signed-order endpoint, funding is USD by wire/RTP into a clearing-member account, orders go through an FCM or FIX session, and KYC/ECP/US-entity rules apply (sections 3 and 5, H). No transaction proposal or typed-data signature maps to this venue. The only conceivable crypto-adjacent path would be an FCM that accepts crypto funding, which I did not find (NOT FOUND).

---

## 7. Fees

(H: https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf, file dated 2026-05-20, one page; rendered and read.)

- **Binary contracts, both sides pay on every trade ("the buyer and the seller will each be charged")**:
  `order fee = MAX( round( k x p x (1 - p) x c , 2 ), $0.01 )`, p = price in dollars, c = contracts, standard round-half-up.
- k values: **FCM retail customer 0.02**, **FCM professional trading firm 0.12**, **market maker 0.03**.
- Worked example in the PDF uses k = 0.06 (an illustrative k that is not in the table): 100 contracts at $0.35 -> $1.37.
- Implied per-contract cost at p = 0.50: retail $0.005, pro $0.030, MM $0.0075. At p = 0.10 or 0.90: retail $0.0018, pro $0.0108, MM $0.0027. $0.01 minimum per order.
- Robinhood adds its own commission on top: "never exceeding $0.01 per contract", lowest near $0.01/$0.99, Gold members up to 50% less; "exchanges typically charge an additional fee" (Robinhood newsroom 2026-06-04, H). A Robinhood retail net cost is therefore the Rothera fee plus the Robinhood commission (inferred, M).
- No settlement fee, deposit/withdrawal fee or maker/taker split is listed (NOT FOUND in the one-page schedule). Notice 26-10 (2026-05-05) was a "Revised Fee Schedule" filing; the linked schedule is the 2026-05-20 file, but I did not look for later revisions (M).

---

## 8. Resolution mechanism and dispute risk

- **Resolver (H):** **Rothera itself.** After trading closes "Rothera will determine the Expiration Value ... The market is then settled by Rothera." There is no oracle, no token vote, no third-party dispute window. The rulebook governs disputes; arbitration under DCM Chapter 9 is between Participants and the Company, not an end-customer remedy.
- **Source hierarchy (NFL game T&C, H):** "NFL.com and the official statistics ... ESPN, CBS Sports, Fox Sports, NBC Sports, the Associated Press, Reuters and the official broadcaster". First final result from the highest-ranked source governs; later revisions after Expiration are ignored. Expiration is 10:00 CT on the expiration date (up to 2 days after the scheduled game). If the result is delayed Rothera "may wait up to 24 hours after the Expiration Time ... after which it may resolve the Contract in its sole discretion".
- **Void / cancelled / postponed events (H):** not a void and not 50/50 by default. Abandoned, cancelled, or not rescheduled before expiry, or suspended and not resumed: "resolve based on the last fair market price as determined by the Exchange pursuant to Rothera DCM Rule 7.2" (long gets price x contracts, short gets $1 minus price). Forfeit before start: the forfeiting team resolves No. Disqualification/vacated result after start: No for that team. Moved date/venue: stays open.
- **Ad hoc settlement example (H):** Notice 26-101 (2026-10-12): for the NYG vs WAS game on 2026-10-11, "position holders ... will receive a payout calculated by multiplying the number of Contracts held by this $0.50 price" under Rule 7.2. The notice gives no reason. This is a concrete case where Rothera settled a game contract at $0.50.
- **Trade cancellation (H):** Rule 10.7: for Binary Option contracts the exchange "will generally not cancel or adjust an erroneous trade except in extraordinary circumstances". Rule 10.13: contracts not voidable for regulatory reasons.
- **Arbitrage consequence:** same-event contracts on Kalshi/Polymarket can settle differently on ties, abandonment, overtime/regulation scope and "sole discretion" calls. Treat any cross-venue hedge with Rothera as basis-risky, and require the market-linking layer to compare T&C clauses, not just titles. Dispute risk: **medium-low** for clean sports/macro results (objective sources, CFTC oversight), **higher** for edge cases (ties, suspensions) where Rothera retains discretion.

---

## 9. Geo / ToS / automation

- Regulated US venue; the entity-level rules are US-centric: US-organised entities by default, OFAC screening, beneficial-ownership disclosure (Rule 2.2, H). Non-US direct participants must rely on reverse solicitation and self-certify local legality (Non-FCM Agreement s.5.7, H). Retail eligibility by state is set by the FCM; the Robinhood post "doesn't say which states are eligible" (M).
- Automation: no ban found; FIX/API is the intended access method for FCMs/MMs. Participants must "maintain cyber security policies ... to protect ... any API" (Rule 2.3 text, H). Rule 7.2 allows limits on the number/size of orders. No website terms-of-use page was found that governs the public files (NOT FOUND: searched /legal, FAQ).
- Market-data licence: participant market data is internal-use only, no redistribution (see 4b). Whether our aggregator may republish values from the public EOD files is **unresolved** (open question).
- Prohibited persons for sports contracts: players, coaches, officials, league staff, agents and their close associates, plus anyone with MNPI (NFL game T&C, H).
- Surveillance: Eventus Validus platform (news item 2026-07-28, M).

---

## 10. Liquidity and category overlap

### Volume / OI (H unless noted; computed from `mkt_eod_*.csv` and `trades_eod_20261018.csv.gz`; units noted)

- **Units warning:** "volume" in Rothera's files is **contracts at $1 face value**. Premium actually paid is roughly 46-49% of that (46% on 2026-10-18 from the tape; DeFi Rate shows $566M paid vs 1.2B face for September). DeFi Rate's "$180M record day on 2026-07-07" equals 180,113,147 **contracts** (H, own sum), not $180M of cash; its own page says "Volume is contracts traded at their $1 face value" and "Dollars paid" is what traders spent (https://defirate.com/prediction-markets/volume/rothera/, H).
- 2026-10-18 (Sunday, NFL): 71,434,328 contracts, 184,790 trades, premium paid ~$33.2M (sum of price x quantity from the tape). NFL game/spread/total markets were 63.4M of the 71.4M contracts. Median trade 59 contracts, max 50,000.
- Monthly contracts (sum of daily `volume`): Jun 2.09B, Jul 1.69B, Aug 0.59B, Sep 1.16B, Oct 1-18 0.69B; total since 2026-05-21 = 6.22B. Peak day 2026-07-07 (180.1M, World Cup). Last 7 days 273.7M contracts, last 28 days 1.10B contracts (avg 39.2M/day). Weekday/Saturday troughs are 7-20M contracts.
- Open interest 2026-10-18: sum of symbol-level `oi` = 98.26M contracts (an upper bound on face value at risk; both sides of complementary symbols may be counted). Largest: NFL futures ~24.4M, NCAAF futures 9.7M, Senate races 9.0M, NFL games 5.9M, House control 4.6M, governors 3.7M, Fed decisions 3.3M, NBA 3.3M, 2028 presidential 2.6M.
- Rothera's own stats: 3.44B contracts across the World Cup, 2,902 contracts listed, "about 7-8% of total share among CFTC-regulated venues" (https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera, H as a venue claim, self-reported).
- M, uncorroborated: Crypto Briefing "3.5 billion contracts and $17 million revenue in Q2 2026" (single outlet). The Block page shows "Monthly Trades 1,653,594" with no month or unit label (H on the number, month unknown); it does not match any month of my trade counts (Aug 1.57M, Sep 2.96M) so I treat it as unreconciled. The discovery hint's "$610.9M" figure was not reproduced (NOT FOUND on the fetched Block page).

### Categories that overlap other venues (where arbitrage exists)

| Rothera family | Live example (2026-10-18) | Likely overlap |
|---|---|---|
| NFL games / spreads / totals, MLB, NHL, NBA, NCAAF/NCAAMB, soccer (EPL, UCL, World Cup earlier), tennis (ATP), golf | `NFLGAME-26OCT18HOUJAX-*`, `NFLSPREAD-*`, `NFLTOTAL-*` (line ladders) | Kalshi, Polymarket US/global, Robinhood's other venues (sports is the bulk of volume) |
| Politics | `CNTRLHOU-26`, `CNTRLSEN-26`, `SENRACE-26<ST>`, `GOVRACE-26<ST>`, `USPRESIDENT-28`, `USPRESPARTY-28` | Polymarket, Kalshi (US elections) |
| Macro | `ECUSFED-26OCT/26DEC/...` (Fed decisions H0/H25/H26/C25/C26 = hold, hike/cut buckets), `ECPCE`, `ECUNEMP` (weekly claims ladder) | Kalshi (Fed, CPI/PCE, claims), Polymarket |
| Corporate | Tesla Q3 2026 Adjusted EPS (filing 26-112) | Kalshi earnings markets |
| Crypto | "coming soon" (venue page) | none yet |

### Liquidity sharing

- **Distribution, not duplicate liquidity:** Robinhood routes "winner, spread, and total contracts" into Rothera (newsroom, H); a Robinhood buyer and a Rothera FCM client hit the same book. Robinhood is not a separate leg. Susquehanna is a JV owner; Rothera says it does not "operate an in-house market maker" (company page, H) but SIG's presence as an MM elsewhere is not established here (NOT FOUND).

---

## 11. Suspicious / untrusted content

- `docs.ledgerx.com` -> `docs.miaxdx.com` -> `/inactive`: the page is titled "Takeover By Hide_khan", on a ReadMe project whose subdomain tag is `hide0x0khan`. It looks like a hijacked/unclaimed legacy docs host. No AI-directed instructions were read; do not trust or link legacy LedgerX/MIAXdx docs.
- The real docs host `docs.rothera.io` is a ReadMe project (subdomain `miaxdx`) behind a password (H).
- `https://x.com/RotheraMarkets/article/2062555671921381521` returned HTTP 402 Payment Required; I stopped there and did not pay (requirements not recorded by the fetch tool).
- No text addressed to AI agents was found on rothera.io pages (H, per page fetches).

---

## 12. Fixtures and how to adapt

`docs/research/fixtures/rothera-exchange-and-clearing/`:
- `mkt_eod_20261018.sample.csv` - 70 rows curated from the real 2026-10-18 `mkt_eod` file across NFL, MLB, tennis, Fed, PCE, claims, Senate/House/governors, 2028 president, NBA, EPL, NCAAF (full file 826 KB, 7,094 rows; truncated sample).
- `trades_eod_20261018.sample.csv` - first 120 lines of the real trade tape (full file 184,790 rows).
- `publicfiles_index_excerpt.txt` - excerpt of the host's directory listing plus counts and header facts.
- `derived_daily_totals_from_mkt_eod.csv` - MY computation (not an API response): per-day totals of volume, trade count and summed OI for all 151 daily files.

Adapter sketch (signal-only): poll `publicfiles` index (or construct `mkt_eod_YYYYMMDD.csv` by date) after ~21:30 UTC (22:30 UTC once CST starts); parse `symbol` with the grammar in section 2; join to cross-venue markets via the linking layer; use `settlement_price`/`close` as a daily reference and the trade tape for lead-lag studies (nanosecond UTC stamps; no side). Do not treat these as executable quotes.

---

## 13. Open questions

1. FIX spec, session credentials, rate limits, and whether any delayed/real-time public feed exists: gated at `docs.rothera.io` and the contact form.
2. Licence for the public EOD files (redistribution/commercial use): no terms found.
3. Why Rothera settled NYG vs WAS (2026-10-11) at $0.50 (notice gives no reason) and how often ad hoc Rule 7.2 settlements occur; scan `/regulatory-notices` for more.
4. Whether any FCM other than Robinhood offers API/automated access to clients, and whether any accepts crypto funding.
5. Whether fee k values changed after the 2026-05-20 schedule, and what Robinhood's all-in per-contract cost is.
6. State/age eligibility for Robinhood event contracts (not stated).
7. Reconcile The Block's 1,653,594 "Monthly Trades" and the hint's $610.9M with the Rothera files.
8. The web search budget was exhausted mid-task (2 searches run), so third-party coverage (CNBC, The Information) was not read.

---

## Sources

- https://www.rothera.io/ (home), /venue, /solutions, /faq, /company, /legal, /regulatory-notices, /volume-and-open-interest, /contact, /news-and-insights - H (fetched 2026-10-19; page-fetch summaries, key lines quoted)
- https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera - H (venue self-report)
- https://www.rothera.io/post/built-for-the-frontier - H (2026-06-04)
- https://publicfiles.rotheramarkets.com/ and the daily files `clearing/outbound/mkt_eod_20261018.csv`, `exchange/outbound/trade_data/trades_eod_20261018.csv.gz`, 150 other `mkt_eod_*.csv` - H (unauthenticated GETs)
- https://publicfiles.rotheramarkets.com/contract_terms/NFLGame-T&C.pdf (also read SoccerOutcome, ElectionOutcome, FOMCRateDecision, NFLTotals terms for scanning only) - H
- Fee Schedule (2026-05-20): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf - H
- DCM Rulebook (2026-05-20): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71190_20260520%20-%20Rothera%20DCM%20Rulebook_Clean.pdf - H (rules 2.2, 4.3-4.6, 6.1, 7.2, 7.15, 10.2, 10.7, 10.13)
- Non-FCM Participant Agreement (v052126): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71196_Rothera%20Non-FCM%20Participant%20Agreement%20(v052126).pdf - H
- Notice 26-101 (2026-10-12): https://cdn.prod.website-files.com/6a99b37483d294062ea71050/6acd0c6c2ea9f0a879ecf7e6_Notice%2026-101.docx%20(1).pdf - H
- Robinhood newsroom (2026-06-04): https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ - H (first-party for Robinhood's side)
- https://defirate.com/prediction-markets/volume/rothera/ - M (third-party aggregation, units explained)
- https://www.theblock.co/data/decentralized-finance/prediction-markets/rothera-monthly-trades - M/L (unlabeled single value)
- Crypto Briefing / Coingape / CLEATZ / SCCG search-result summaries (2026-06 to 2026-07) - M/L (only summaries seen; not opened)
- https://docs.rothera.io/ (password gate) and https://docs.miaxdx.com/ (hijacked, see section 11) - H for what they serve
- https://x.com/RotheraMarkets/article/2062555671921381521 - HTTP 402, not read
