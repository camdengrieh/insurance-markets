# Rothera Exchange & Clearing (Robinhood/Susquehanna JV, ex-MIAXdx) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~03:05-03:20 UTC). READ-ONLY: WebFetch of Rothera/Robinhood/DeFi Rate pages, public PDFs (rulebook, fee schedule, participant agreements, contract terms, one notice), and unauthenticated GETs to Rothera's public-files host and docs hosts. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. Third-party text was treated as untrusted data. The shared WebSearch budget was already exhausted when I started, so I ran zero searches: third-party news (CNBC, The Information, The Block) and other FCMs / market makers could not be searched (listed in section 14). Nothing is personal or account specific in this file.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak, stale or speculative.

Fixtures: `docs/research/fixtures/rothera-exchange-clearing-robinhood-susquehanna-jv-ex-miaxdx/` (section 13).

---

## 0. Verdict

**adapter_priority = P2 (signal-only / research feed).** Confidence: high.

1. **Live, real, independent order book, large.** CFTC-registered DCM + DCO, trading since 2026-05-21 (first daily file). 6.22B contracts traded 2026-05-21..2026-10-18, about 1.19B contracts and 3.15M trades in the last 30 days, 98.3M contracts open interest on 2026-10-18 (H, computed from Rothera's own daily files). One central limit order book, price/time priority.
2. **No live read API for outsiders.** The only public data is two **end-of-day** files per day (per-symbol OHLC/settlement/volume/OI, plus the full nanosecond trade tape) on an S3/CloudFront host. Live quotes, depth, market lists and order entry are **FIX for approved FCMs / market makers only**; the platform docs are behind a password (H). No REST, no WebSocket documented anywhere (NOT FOUND).
3. **No trade path for an agent or PayBox wallet.** Retail only through an FCM (Robinhood Derivatives, LLC is the visible one); direct access needs a US-organised, ECP, market-maker-agreement institution; collateral is USD by wire/RTP; no chain, no token (H, sections 3, 5, 6).
4. **Robinhood is distribution, not a second pool of liquidity.** Robinhood routes selected contracts (World Cup, baseball at launch) into this same book. Robinhood separately sends other event contracts to KalshiEX and ForecastEX, which are other venues (H). So "Robinhood" must not be modelled as an independent leg next to Rothera, and Rothera itself is an independent leg versus Kalshi/Polymarket.
5. **Where it still matters:** sports (NFL/MLB/NHL/NBA/NCAAF game, spread, total ladders), US politics (Senate/House/governor/2028), Fed decisions. These overlap Kalshi and Polymarket, so the free trade tape and daily settlement/close are useful for calibration and lead-lag work against those venues. EOD latency makes it useless for live arbitrage detection.
6. **Corrections to the discovery hint:** (a) the 10-K's "90%" is **Rothera's stake in MIAXdx**, not Robinhood's stake in Rothera; the 10-K says Robinhood does "not wholly own or operationally control Rothera" (H). (b) rothera.io lists no API links, but it does say FIX exists and it links to the public daily files host (H). (c) "hybrid with Kalshi" describes **Robinhood's** routing (Kalshi, ForecastEX, Rothera), not Rothera's market structure (H). (d) `rotheramarkets.com` / `publicfiles.rotheramarkets.com` are Rothera's own hosts (the files host serves Rothera data, H); `rotheraexchange.com` I did not test.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| Public files index `https://publicfiles.rotheramarkets.com/` "Generated 2026-10-18 21:30 UTC"; newest `mkt_eod_20261018.csv` has 7,094 symbols and 184,790 trades on the day | 2026-10-18 | H |
| `https://www.rothera.io/company` timeline: "May 2026: Initial launch with Core PCE Price Index, U.S. Weekly Jobless, and Professional Baseball"; June soccer/tennis/Fed; "July 2026 onward: Professional Football, College Football, Elections, Golf, Hockey, and Basketball" | read 2026-10-19 | H |
| `https://www.rothera.io/regulatory-notices`: Notice 26-101 dated "October 12, 2026"; product filing 26-111 (NBA Cup MVP) dated 2026-10-14 in its filename | 2026-10-12..14 | H |
| `https://www.rothera.io/news-and-insights` newest post 2026-10-08 ("On the Definition of a Swap"); 2026-09-22 Adaptive infrastructure post | 2026-10-08 | H |
| Robinhood 10-K (FY2025): JV "Rothera ... acquired 90% of the issued and outstanding equity of MIAXdx in January 2026"; "Following closing, Rothera renamed MIAXdx to Rothera E&C" (accession 0001783879-26-000023, https://www.sec.gov/Archives/edgar/data/1783879/000178387926000023/hood-20251231.htm) | filed 2026 | H |
| Robinhood newsroom 2026-06-04: World Cup and professional baseball contracts "routed to Rothera" | 2026-06-04 | H |
| DeFi Rate Rothera volume page (data observed 2026-10-18 21:30 ET) agrees with my sums from the files (30-day contracts $1.2B vs my 1.19B; peak day 180M on 2026-07-07 vs my 180.1M) | 2026-10-18 | H (own data), M (DeFi Rate) |

Verdict: **still_live = true.** Official site: https://www.rothera.io (the hint's "rothera.com" in page links is a different spelling, not tested).

---

## 2. Kind and market model

- **Kind (H):** regulated exchange + clearinghouse for event contracts. "CFTC-regulated exchange and clearinghouse" with DCM and DCO registrations active, SEF "Dormant" (https://www.rothera.io/company, /faq). Legal entity "Rothera Exchange and Clearing LLC", wholly owned by Rothera, LLC, a Robinhood/Susquehanna JV (Robinhood newsroom 2026-06-04). Formerly MIAXdx (ex-LedgerX): agreement Nov 2025, closed Jan 2026.
- **Instrument (H):** FAQ: event contracts "are swaps". Every contract is a **binary** Yes/No, settlement value $1 to the in-the-money side, min tick $0.01, quoted $0.01-$0.99 (contract terms `NFLGame-T&C.pdf`: "Type of Contract is a swap", "Minimum Tick ... $0.01", "Settlement Value ... $1").
- **Categorical / scalar (H):** no native categorical or scalar type. Each outcome (each team, party, bucket, threshold) is its **own symbol**, e.g. `CNTRLSEN-26-REP` and `CNTRLSEN-26-DEM`; line/threshold ladders are many binaries (`NFLSPREAD-26OCT11NYGWAS-WAS1`..`WAS13`, `ECUNEMP-26OCT22CLAIMS-190000`). Settlement prices of sibling symbols need not sum to 1 (2026-10-18: REP 0.40 + DEM 0.64; `ECUSFED-26OCT` 0.85+0.15+0.02+0.02+0.01 = 1.05).
- **Book (H):** single all-to-all CLOB, price/time priority (DCM Rule 4.3(B)); retail and institutional flow "matched on the same all-to-all order book" (FAQ). Order types: Limit Order and Quote (a market maker's limit order) only; no indications of interest; resting limit orders auto-cancel **30 days** after placement (Rule 4.3). Block trades exist off-book for ECPs (Rule 4.7). Hours **24/7**, maintenance Thursdays 02:00-04:00 CT, trade date rolls at 16:00 CT (https://www.rothera.io/venue, Rule 4.6).
- **Not an AMM, parimutuel or sportsbook** (FAQ: "Rothera isn't a sportsbook ... Rothera doesn't set prices or odds").
- **Tokenisation (H):** none. Positions are cleared by the DCO and held at FCM/participant account level against USD collateral. No on-chain token or ID.
- **Symbol grammar (H, from `mkt_eod` and tape):** `<FAMILY>[-<EVENTKEY>]-<OUTCOME>`; the `product` column in `mkt_eod` is the event key. Examples: `NFLGAME-26OCT18HOUJAX-JAX` (game 2026-10-18 Houston at/vs Jacksonville, outcome JAX), `NFLTOTAL-...-43`, `NFLSPREAD-...-JAX2`, `SENRACE-26OH-DEM`, `CNTRLHOU-26-REP`, `USPRESIDENT-28-*`, `ECUSFED-26OCT-H0/H25/H26/C25/C26` (suffix codes not documented in what I read; decoding is inferred, L), `ECPCE-26SEPCORE-0.2`, `EPL-27-ARS`. 106 distinct families seen across all daily files; **no crypto-price or CPI families appear** (H, own scan). Team/candidate codes are short abbreviations, so cross-venue matching needs a mapping table (see `docs/market-linking-design.md`).

---

## 3. Chains and collateral

- **No blockchain.** USD only. FAQ/venue page: "Event contracts are fully funded, with no guarantee fund requirement"; customer funds "held in segregated accounts"; funding "by wire or real-time payments (RTP)" (https://www.rothera.io/venue, /solutions, H). DCM Rule 4.4(B): the exchange checks that the customer's collateral account "fully collateralize[s] the Order prior to entering into any Transaction" and rejects otherwise (H).
- No stablecoin, EVM/Solana contract, bridge or wallet funding path. NOT FOUND (searched: rothera.io home, /venue, /solutions, /faq, /company, /legal, the FCM and Non-FCM participant agreements).
- Collateral per contract is the full $1 split between sides (buyer posts price, seller posts $1 - price): so ~98.3M OI contracts on 2026-10-18 means roughly $98M of face value collateralised (M, OI semantics inferred).

---

## 4. Read API

**exists = official-public, but end-of-day files only. Real-time = participant-only FIX. No REST/WebSocket documented.**

### 4a. Public daily files (H; unauthenticated GET)

Host `https://publicfiles.rotheramarkets.com/` (server AmazonS3 behind CloudFront). Pointer: https://www.rothera.io/volume-and-open-interest says Rothera publishes "volume, price and open interest" for the prior session "daily at approximately 4:15 pm central time" and "If a file is unavailable you will see access denied" (H). Index page is a plain HTML table (`cache-control: no-cache`), "Generated 2026-10-18 21:30 UTC".

| Path | Content | Cadence / coverage |
|---|---|---|
| `clearing/outbound/mkt_eod_YYYYMMDD.csv` | one row per symbol live or just settled that day | daily; 151 files, 2026-05-21..2026-10-18; `Last-Modified` 21:15:48 GMT on the 2026-10-18 file |
| `exchange/outbound/trade_data/trades_eod_YYYYMMDD.csv` (`.csv.gz` for recent days) | full trade tape `timestamp,contract,price,quantity` | daily; 88 files, 2026-07-28..2026-10-18; `Last-Modified` 21:30:06 GMT |
| `contract_terms/<Family>-T&C.pdf` | per-family contract terms | 56 PDFs in the index (plus a folder row); I read NFLGame, FOMCRateDecision, USCorePCEIndex (full text) |

`mkt_eod` columns (verified 2026-10-18 file, 845,940 bytes, HTTP 200): `date, product, symbol, expiration_date, trade_count, volume, oi, block_volume, settlement_price, open, high, low, close, contracts_delivered`; every value is a quoted string; OHLC blank when no trades. Example row: `"2026-10-18","NFLGAME-26OCT18HOUJAX","NFLGAME-26OCT18HOUJAX-JAX","2026-10-20","17029","6614309","0","0","0","0.58","0.65","0.01","0.01","2427040"` (a game that settled the same day: `settlement_price` 0, `oi` 0, `contracts_delivered` 2,427,040). A settled symbol appears again the next day with zero volume and `contracts_delivered` set (e.g. `NFLGAME-26OCT11NYGWAS-*` on 2026-10-12).

Trade tape (H, `trades_eod_20261018.csv.gz`, 2,304,675 bytes, 184,790 rows): `"2026-10-17T21:00:00.459648056Z","NFLGAME-26OCT18BUFLV-LV","0.33","14"`. UTC, nanosecond stamps, no side/aggressor, no counterparty. The file for trade date D runs 21:00:00Z on D-1 to 20:59:59Z on D while CDT applies; the roll moves to 22:00Z after CDT ends on 2026-11-01 (M, inferred from the T&C's CT definition).

Not available publicly: bids/asks, depth, event titles/descriptions, market status, resolution text. Machine-readable listing metadata is limited to the symbol grammar and `expiration_date`; human titles live in the per-family T&C PDFs and filings on `/regulatory-notices`.

**Rate limiting (H, observed):** after ~140 rapid sequential GETs from one IP the CloudFront host returned HTTP 429 with an empty body and no `Retry-After` for several minutes; WebFetch (its own fetcher) also got 429 during that window; it cleared after roughly 5-6 minutes. A polite adapter needs 1-2 files per day, so poll at >= 5 s spacing with backoff. `robots.txt` on the files host returns 403 AccessDenied (S3 XML). No licence/terms for the files found (NOT FOUND, searched: /legal, /volume-and-open-interest, /faq).

Third-party reuse: DeFi Rate's volume page says its Rothera series is "licensed market data" reading "Rothera's public daily market reports" (https://defirate.com/prediction-markets/volume/rothera/, M). Useful cross-check only.

### 4b. Real-time data (participants only)

- "FIX: order entry, market data, and drop copy. API: reference data. WebSocket and SFTP are not mentioned" (https://www.rothera.io/venue, H); FAQ adds "ISV integrations, SFTP file access, reference data" (H). Rulebook Rule 4.5(C) mentions confirmations "via the API and/or Portal" and a Member Portal (H).
- Platform docs: `https://docs.rothera.io/` redirects to `/password?redirect=%2F`, title "Rothera Platform Documentation" (H). FIX spec, ports, sessions, rate limits: **NOT FOUND (gated)**.
- Reference management system by Connamara (2026-07-20 post): "designed to structure and manage thousands of event contracts"; the post says nothing about public APIs (H). Matching/clearing stack by Adaptive (Aeron Exchange Accelerator, 2026-07-14 post, H as a headline; its Sept post has no protocol detail).
- Market data licence for participants: Rule 10.2(B) and Non-FCM Participant Agreement s.9 allow use "for their own internal business purposes" and forbid redistribution/retransmission to third parties (H). This governs live feeds, not the public EOD files (unresolved).

### 4c. Endpoints I did NOT find

- No REST market list, order book, WebSocket, subgraph, contract address, public GitHub org (checked orgs `rothera`, `RotheraMarkets`, `rothera-io`, `miaxdx`: none; the `ledgerx` org holds only unrelated 2018/2022 repos, M).
- Legacy `docs.ledgerx.com` / `docs.miaxdx.com` now serve a ReadMe stub titled "Takeover By Hide_khan - Not Yet Active" (H). Do not use legacy LedgerX/MIAXdx API links.

---

## 5. Trade path

**none for an agent / PayBox.** (H)

- Retail: "Retail customers access Rothera through intermediaries" (FAQ). Rule 4.4(A): anyone not an approved Direct Access Participant "may trade Contracts only as Customers of an FCM Participant", with orders transmitted by the FCM over a secure connection (H). Visible FCM: Robinhood Derivatives, LLC (listed as "Clearing firm" on /legal; app-only UX at robinhood.com/us/en/prediction-markets/). Robinhood's 2026-06-04 post links only crypto-trading API docs; **no public Robinhood order API for event contracts found** (NOT FOUND, searched: that post and the prediction-markets page; no search engine available).
- Direct: FCM Participant or Non-FCM "Direct Access Participant". Non-FCM agreement (v052126): trading "for its own proprietary account", must remain an ECP and "maintain a Market Maker Agreement with the Company at all times"; market makers need ECP status, the program agreement and minimum quoting metrics (https://www.rothera.io/solutions, H). Entities must be organised in the US by default, pass OFAC and beneficial-ownership screening (Rule 2.2(A), H).
- Auth/signing: FIX session credentials issued at onboarding (M; spec gated). No wallet signature scheme exists.
- Onboarding: contact form only (`/contact`); no self-serve.

---

## 6. PayBox reachability

**paybox_reachable = no.** There is no on-chain contract, no signed-order endpoint, no crypto funding route; funding is USD wire/RTP into a clearing relationship; orders go through an FCM or a gated FIX session; the participant rules require KYC'd US-organised ECP institutions for direct access (sections 3 and 5, H). No EVM/Solana transaction proposal or typed-data signature maps to Rothera on Base, Ethereum, BNB, Arbitrum, Polygon or Solana.

---

## 7. Fees

(H: `Rothera Fee Schedule_20260520.pdf`, one page, dated by its filename; the Webflow CDN URL came from an earlier in-repo note, I fetched and read the PDF directly, HTTP 200. I did not find the page on rothera.io that links it.)

- Binary contracts: "the buyer and the seller will each be charged" on every trade (both sides, no maker/taker split):
  `order fee = MAX( round( k x p x (1 - p) x c , 2 ), $0.01 )`, p = price in dollars, c = contracts, round half up.
- **k: FCM retail customer 0.02; FCM professional trading firm 0.12; market maker 0.03.** (The PDF's worked example uses k = 0.06, a value not in the table: 100 contracts at $0.35 -> $1.37.)
- Per contract at p = 0.50: retail $0.0050, pro $0.0300, MM $0.0075. At p = 0.10 or 0.90: retail $0.0018, pro $0.0108, MM $0.0027. $0.01 minimum per order, so tiny orders are relatively expensive. Worked table in the fixtures (derived).
- FCM add-ons: Robinhood commission "never exceeding $0.01 per contract", lower near $0.01/$0.99, Gold up to 50% less, and "exchanges may charge an additional fee" (Robinhood newsroom 2026-06-04, H). Net Robinhood retail cost = Rothera fee + Robinhood commission (M, inferred).
- Not stated in the one-page schedule: deposit/withdrawal fees, settlement fees, FIX/connectivity fees, market-data fees, volume tiers (NOT FOUND). Notice 26-10 (2026-05-05) was a "Revised Fee Schedule" filing; I did not look for later revisions.
- Arbitrage consequence: for a pro/algorithmic FCM account the k = 0.12 rate is costly (3c a contract at mid-price per side), roughly an order of magnitude above retail; a Rothera leg needs a wide edge unless it is a market-maker account.

---

## 8. Resolution mechanism and dispute risk

- **Resolver (H): Rothera itself.** NFL game T&C: "After trading ... has closed, Rothera will determine the Expiration Value ... The market is then settled by Rothera." No oracle, no token vote, no external dispute window. FAQ: settlement criteria are "tied to objective, publicly verifiable sources"; "The rulebook governs operational issues and disputes"; FAQ names no resolver. DCM Chapter 9 provides arbitration between participants and the Company (H, rulebook TOC).
- **Source hierarchy (NFL game, H):** NFL.com and official statistics, then ESPN, CBS Sports, Fox Sports, NBC Sports, AP, Reuters, official broadcaster. First final result from the highest-ranked source governs; later revisions are ignored. Expiration 10:00 CT on the expiration date (up to 2 days after the scheduled game); if the result is delayed, "the Exchange may wait up to 24 hours ... after which it may resolve the Contract in its sole discretion".
- **Win definition (NFL, H):** "must have scored more points (a strictly greater number) than their opponent at the conclusion of regulation time (four quarters of play plus any applicable overtime ...)". A tie is **not addressed** in the clauses I read (L: both teams' contracts would then be "No" under a literal reading; unverified).
- **Void/cancel/suspend (H):** abandoned or cancelled or not rescheduled before expiry, or suspended and never resumed: "resolve based on the last fair market price as determined by the Exchange pursuant to Rothera DCM Rule 7.2" (long gets price x contracts, short gets ($1 - price) x contracts). Forfeit before start: that team's contract resolves No (opponent Yes). Moved date/venue: stays open. FOMC contract: delayed release -> last fair market price; meeting cancelled -> the "0 bps / No Change" strike resolves Yes, all others No.
- **Concrete ad hoc settlement (H):** Notice 26-101 (2026-10-12): for NYG vs WAS on 2026-10-11 "position holders ... will receive a payout calculated by multiplying the number of Contracts held by this $0.50 price" under Rule 7.2; no reason given. The data agree: both `NFLGAME-26OCT11NYGWAS-*` symbols show `settlement_price` 0.5 on 2026-10-12 with `contracts_delivered` 983,707 (WAS) and 1,410,509 (NYG), after closing at 0.46/0.47 on 2026-10-11 with intraday range 0.03-0.97 (H, own data); the spread symbols settled normally (e.g. `...-WAS1` at 0). Why it was $0.50 (tie? abandonment?) is unstated (L).
- **Trade cancellation (H):** Rule 10.7: for binary contracts the exchange "will generally not cancel or adjust an erroneous trade except in extraordinary circumstances".
- **Arbitrage consequence:** the same game or macro event on Kalshi or Polymarket can settle differently on ties, abandonment, overtime/regulation scope and "sole discretion" calls. Any cross-venue hedge against Rothera is basis-risky; the market-linking layer must compare T&C clauses, not just titles. Dispute risk: **medium-low** for clean results with objective sources under CFTC oversight; **higher** for edge cases where Rothera keeps discretion.

---

## 9. Geo / ToS / automation

- Regulated US venue. Direct participants: US-organised by default, OFAC screening, beneficial-ownership disclosure (Rule 2.2). Non-US direct participants must self-certify cross-border access and "reverse solicitation" (Non-FCM Agreement s.5.7, H). Retail state/age eligibility is set by the FCM and not stated in Robinhood's 2026-06-04 post ("eligible customers") (M).
- Automation: no prohibition found; FIX/API is the intended access for FCMs and market makers. Rule 7.2(A)(5) lets the exchange set limits on number/size of orders; Rule 7.6 prohibits misuse of the platform; Rule 7.3 prohibits spoofing, wash/pre-arranged trades, front-running (H).
- Market data licence: participant data is internal-use only, no redistribution (Rule 10.2(B)). Whether the aggregator may redistribute values from the public EOD files is **unresolved** (no terms found).
- Position accountability (NFL game, FOMC): 5,000,000 contracts for participants, 25,000,000 for market makers (H, T&Cs; FOMC calls them "Position Limit").
- Prohibited persons: players, coaches, officials, league staff, agents and close associates (sports); Fed staff compiling the FOMC decision (macro) (H).
- Surveillance vendor: Eventus Validus (2026-07-28 post, H as a headline).

---

## 10. Liquidity and category overlap

### Volume / OI (H unless noted; computed from `mkt_eod_*.csv` and `trades_eod_20261018.csv.gz`)

- **Units warning:** Rothera "volume" is **contracts at $1 face**. Premium actually paid is ~46% of face on 2026-10-18 (tape: $33.16M paid for 71.43M contracts). DeFi Rate: 30-day $1.2B contracts vs $579M paid (M). Do not compare face volume with other venues' dollar volume.
- Contracts by month (sum of daily `volume`): May (from 05-21) 2.1M; Jun 2.09B; Jul 1.69B; Aug 0.59B; Sep 1.16B; Oct 1-18 0.69B. **Total 6.22B** over 151 days (16.96M trades). Peak day 2026-07-07: 180.1M (World Cup). Last 7 days 273.7M, last 30 days 1.19B (3.15M trades). Weekday/Saturday troughs 7-20M.
- 2026-10-18 (Sunday, NFL): 71.43M contracts, 184,790 trades, median trade 59 contracts, max 50,000. NFL game/spread/total markets were ~63.4M of the 71.4M. Split by category: sports 70.7M, politics 0.60M, macro 0.10M contracts (my family mapping).
- Open interest (sum of symbol-level `oi`): 98.26M contracts on 2026-10-18; peak in the series 133.4M on 2026-06-25. Largest on 2026-10-18: NFL futures 24.4M, NCAAF futures 9.7M, Senate races 9.0M, NFL games 5.9M, House control 4.6M, governors 3.7M, Fed decisions 3.3M, NBA 3.3M, 2028 president 2.6M.
- Venue's own claims (H as claims): World Cup 3.44B contracts, 2,902 contracts listed, "about 7-8% of total market share among CFTC-regulated venues" (https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera, 2026-08-04). DeFi Rate shows Rothera at ~1% share of all prediction-market volume for the last 30 days (M).
- Not reproduced: the hint's Block "$610.9M" and Crypto Briefing "$17M Q2 revenue" (not fetched; The Block URL guess returned 404).

### Categories that overlap other venues (where arbitrage can exist)

| Rothera family | Live example (2026-10) | Likely overlap |
|---|---|---|
| NFL/NCAAF games, spreads, totals; NHL, MLB, NBA game/spread/total; EPL/UCL; tennis (ATP/WTA) ; golf | `NFLGAME-26OCT18HOUJAX-*`, `NFLSPREAD-*`, `NFLTOTAL-*` (line ladders) | Kalshi, Polymarket (global and US), others; sports is most of the volume (99% on 2026-10-18, 81% on 2026-09-15 when a macro event was live) |
| US politics | `SENRACE-26<ST>`, `GOVRACE-26<ST>`, `HOURACE-26*`, `CNTRLHOU/SEN-26`, `USPRESIDENT-28`, `USPRESNOM-28`, `VPPARTYNOM` | Polymarket, Kalshi |
| Macro | `ECUSFED-26OCT/26DEC...` (Fed decision buckets), `ECPCE-*CORE-0.x` (core PCE month-on-month % change vs a threshold; the T&C lets each listing use above/below/exactly/at least/at most/between, and the symbol does not show which, H for T&C, L for mapping), `ECUNEMP-*CLAIMS-<n>` (weekly claims thresholds) | Kalshi (Fed, PCE, claims), Polymarket |
| Crypto price, CPI headline | **none listed** (106 families scanned) | n/a |

### Liquidity sharing (H)

- **Robinhood routes into Rothera's book** ("winner, spread, and total contracts" for World Cup and baseball at launch). A Robinhood buyer and any other FCM client hit the same CLOB: Robinhood is **not** a separate leg. Robinhood's event contracts on other events go to KalshiEX or ForecastEX (disclosure text), which are independent venues.
- Rothera shares nothing with Kalshi/Polymarket: separate exchange, separate book, separate clearing (DCO). Susquehanna (a JV owner) as a market maker on the book: NOT FOUND (no source names any market maker).

---

## 11. Adapter notes (if built as a signal-only feed)

1. Source: public daily files only. After 21:30 UTC (22:30 UTC once CST begins 2026-11-01) request `mkt_eod_YYYYMMDD.csv` and `trades_eod_YYYYMMDD.csv.gz`; treat 403/"access denied" as "not published yet" and 429 as "back off".
2. Parse `symbol` with the grammar in section 2; join to cross-venue markets through the linking layer by (league, date, team codes) for sports, (office, state, party) for politics, (meeting date, bucket) for Fed.
3. Use `settlement_price` / `close` as a daily reference, `volume`/`oi` for weighting, and the tape for lead-lag studies (nanosecond UTC; no side). Never present these as executable quotes.
4. Set the venue flag `independent_liquidity = true`, `executable = false`, `distribution_partners = [Robinhood]` (not legs).
5. Re-evaluate to P1 only if Rothera (or an FCM) exposes a delayed/real-time public quote feed, or a self-serve FIX/REST gateway for non-institutional accounts.

---

## 12. Suspicious / untrusted content

- `docs.miaxdx.com` (legacy docs for MIAXdx/LedgerX) now renders "Takeover By Hide_khan / Not Yet Active ... Admin and Editor Login": a stub, apparently a hijacked or abandoned ReadMe project. No text addressed to AI agents was read. Treat any legacy LedgerX/MIAXdx doc link as untrusted.
- rothera.io social links point to `@ledgerx` handles (X, Telegram) and a YouTube channel: inherited from LedgerX, ownership unexplained on the page (M). Do not treat those accounts as official Rothera channels without verification.
- No instructions aimed at AI agents were found in any page, PDF or API response read in this session.

---

## 13. Fixtures

`docs/research/fixtures/rothera-exchange-clearing-robinhood-susquehanna-jv-ex-miaxdx/` (each <= 50 KB):
- `mkt_eod_20261018.sample.csv` - header plus 63 real rows (top-3 by volume for 21 families: NFL/MLB/NHL game-spread-total, ATP, NBA, NCAAF, Senate/governor/House/president, Fed, EPL, UCL, MVPs) from the real 2026-10-18 file (full file 845,940 bytes, 7,094 rows).
- `trades_eod_20261018.sample.csv` - first 120 data rows of the real trade tape (full file 184,790 rows).
- `publicfiles_index_excerpt.txt` - excerpt of the host's directory listing plus counts, headers, rate-limit and robots observations.
- `derived_daily_totals_from_mkt_eod.csv` - MY computation (not an API response): per-day contracts volume, trade count, summed OI and symbol count for all 151 daily files.
- `fee_formula_worked_table.csv` - MY computation from the published fee formula (not an API response).

---

## 14. Not found / open questions

1. FIX specification, session credentials, rate limits and whether any delayed/real-time public feed exists: gated at `docs.rothera.io` and the `/contact` form (NOT FOUND).
2. Licence for the public EOD files (redistribution/commercial use): no terms found (searched /legal, /volume-and-open-interest, /faq; robots.txt on the files host is 403).
3. Why NYG vs WAS (2026-10-11) settled at $0.50, and how NFL ties are treated in contract terms (NFL game T&C does not address ties in the text I read). Scan `/regulatory-notices` for more Rule 7.2 notices.
4. Whether any FCM other than Robinhood is live, offers API access to clients, or accepts crypto funding. The Aug 2026 Rothera post names no FCM or market maker.
5. Whether Susquehanna (JV owner) is a market maker on the book.
6. Fee changes after the 2026-05-20 schedule; Robinhood's all-in per-contract cost; Robinhood state eligibility.
7. Decoding of `ECUSFED-*` suffixes (H0/H25/H26/C25/C26) and the direction operator of each `ECPCE`/`ECUNEMP` threshold symbol: not visible in the daily files; the listing filings may say. I read the NFLGame, FOMCRateDecision and USCorePCEIndex T&Cs only (they define the operator set, not each listing's choice).
8. CFTC register entry (DCM/DCO designation dates): the CFTC DCM page I fetched is a search tool without a static list; registration is stated by Rothera (/company, /faq) and in Robinhood's 10-K only.
9. WebSearch budget was exhausted: no news corroboration (CNBC, The Information, The Block, Crypto Briefing) was read this session.

---

## Sources

Primary (read first-hand this session, 2026-10-19):
- https://www.rothera.io , /venue , /solutions , /faq , /company , /legal , /regulatory-notices , /news-and-insights , /volume-and-open-interest (H)
- https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera (2026-08-04, H as venue claim)
- https://www.rothera.io/post/rothera-selects-connamara-systems-to-build-innovative-reference-management-system-for-event-contracts (2026-07-20, H)
- https://www.rothera.io/post/adaptive-building-high-performance-infrastructure-for-rotheras-event-contract-markets (2026-09-22, H)
- https://publicfiles.rotheramarkets.com/ (index, `clearing/outbound/mkt_eod_*.csv`, `exchange/outbound/trade_data/trades_eod_20261018.csv.gz`, `contract_terms/NFLGame-T&C.pdf`, `contract_terms/FOMCRateDecision-T&C.pdf`) (H)
- Rothera DCM Rulebook 2026-05-20 (105 pages): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71190_20260520%20-%20Rothera%20DCM%20Rulebook_Clean.pdf (H: Rules 2.2, 4.3-4.7, 7.2, 7.3, 7.6, 10.2, 10.7)
- Rothera Fee Schedule 2026-05-20: https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf (H)
- Rothera Non-FCM and FCM Participant Agreements (v052126), linked from /legal (H)
- Notice 26-101 (2026-10-12): https://cdn.prod.website-files.com/6a99b37483d294062ea71050/6acd0c6c2ea9f0a879ecf7e6_Notice%2026-101.docx%20(1).pdf (H)
- Robinhood FY2025 10-K: https://www.sec.gov/Archives/edgar/data/1783879/000178387926000023/hood-20251231.htm (H, first 100,000 characters read; the rest of the 450k-character document was not)
- Robinhood newsroom, 2026-06-04: https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ (H)
- https://robinhood.com/us/en/prediction-markets/ (H, disclosure footer only)
- https://docs.rothera.io/ (password gate), https://docs.miaxdx.com/ (stub), https://www.rothera.io/robots.txt (H)

Secondary:
- https://defirate.com/prediction-markets/volume/rothera/ (M, observed 2026-10-18)
- https://www.cftc.gov/IndustryOversight/TradingOrganizations/DCMs/index.htm (no list rendered; not used as evidence)
