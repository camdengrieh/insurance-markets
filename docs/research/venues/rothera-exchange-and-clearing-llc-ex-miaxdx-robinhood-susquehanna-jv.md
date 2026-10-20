# Rothera Exchange and Clearing LLC (ex-MIAXdx; Robinhood/Susquehanna JV) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 02:00-02:20 UTC). READ-ONLY: page reads, public PDFs, unauthenticated GETs to Rothera's public-files host and its own site, plus read-only PayBox `discover_plugins` / `discover_services`. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or money-moving PayBox tool was used. Third-party text was treated as untrusted data; nothing in it was followed. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a page-summary tool result, a sibling note, or my inference from first-hand data; **L** = weak or stale.

Relation to the sibling note `docs/research/venues/rothera-exchange-and-clearing.md` (an earlier pass at the same venue under a shorter slug): I re-read the primary sources rather than copying it. The two agree on every substantive point. Differences are listed in section 13.

Fixtures: `docs/research/fixtures/rothera-exchange-and-clearing-llc-ex-miaxdx-robinhood-susquehanna-jv/` (section 12).

---

## 0. Bottom line

1. **Live, large, and its own order book.** CFTC-registered DCM and DCO. First print 2026-05-21 (H, first daily file: 21 symbols, 79 contracts). Peak day 180.1M contracts (2026-07-07, World Cup); 71.4M contracts on 2026-10-18 and about 39M/day over the last 28 days (H, computed from Rothera's own daily files). It is one price/time central limit order book (H, DCM Rule 4.3(B)), not Kalshi liquidity.
2. **Not reachable by an agent or a PayBox wallet.** Retail may trade "only as Customers of an FCM Participant" (H, Rule 4.4(A)); direct access is for approved Direct Access Participants (institutions; the Non-FCM form requires a Market Maker Agreement and proprietary trading only). Collateral is **USD** ("the USD funds required to fully collateralize Orders", Rule 6.1). Order entry and live market data are **FIX**; the platform docs are behind a password. No REST or WebSocket is documented anywhere I could read.
3. **The only public read data is end-of-day files** (unauthenticated, no key): a per-symbol daily table and a nanosecond-stamped trade tape, posted after the 16:00 CT roll (about 21:30 UTC). No quotes, no book, no market list, no titles. The host throttled me with HTTP 429 after about 190 requests in 4 minutes.
4. **Robinhood is distribution into this same book**, not a second pool. Robinhood Derivatives LLC routes selected contracts to Rothera (H, Robinhood newsroom 2026-06-04); it still offers Kalshi and ForecastEx contracts where Rothera lists nothing (M). Never model Robinhood as a separate leg next to Rothera.
5. **adapter_priority = P2 (signal-only).** Real, independent, deep liquidity and a free full trade tape (good for calibration and lead-lag against Kalshi and Polymarket), but daily data is stale for live edge detection and there is no trade path for us.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://publicfiles.rotheramarkets.com/` index, `last-modified: Sun, 18 Oct 2026 21:30:10 GMT`, "Generated 2026-10-18 21:30 UTC"; newest `mkt_eod_20261018.csv` (7,094 symbols, 184,790 trades) | files still produced daily, 151 `mkt_eod` files since 2026-05-21 | H |
| Regulatory notices page (`/regulatory-notices`): newest entries 26-103 to 26-112 (NBA Cup, Tesla Q3 2026 EPS product filings); Notice 26-101 dated 2026-10-12 | active listing and rulebook activity | H |
| News page: items dated 2026-10-08 ("On the Definition of a Swap"), 2026-09-22 (Adaptive infrastructure), 2026-08-19, 2026-08-04 World Cup stats | active | H |
| Robinhood JV page, update note: JV "closed its acquisition of MIAXdx" on 2026-01-20; MIAX keeps a 10% stake; Susquehanna is day-one liquidity provider | matches the discovery hint | H (page-fetch summary) |
| Robinhood newsroom 2026-06-04: Robinhood routes "a selection of World Cup and professional baseball contracts to Rothera" | routing started 2026-06-04 | H (page-fetch summary) |
| MarketsWiki page "last edited on 5 September 2026" | corroboration only | M |

Verdict: **still_live = true.** The discovery hint's launch facts hold: JV close 2026-01-20 (H), first contracts 2026-05-21 (H, own data), Robinhood routing from 2026-06-04 (H). Official site is **https://www.rothera.io/** (`rotheramarkets.com` 301-redirects to it; `rothera.com` timed out after 20 s from my network, L; `api.rothera.io` and `api.rotheramarkets.com` do not resolve).

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated exchange and clearinghouse for event contracts. Legal entity "Rothera Exchange and Clearing LLC", a wholly owned subsidiary of Rothera, LLC, "a joint venture managed by Robinhood Markets, Inc. and Susquehanna International Group"; described as "separate but affiliated" from Robinhood Derivatives (Robinhood newsroom 2026-06-04). Registrations: DCM, DCO, SEF listed as dormant (https://www.rothera.io/company). Formerly MIAXdx (acquisition agreed Nov 2025, closed Jan 2026, per Rothera's company page).
- **Market model (H):** every contract is a **binary** swap, "Yes" pays $1, "No" pays $1 if Yes fails (NFL game T&C: "The Type of Contract is a swap"). Quoted in dollars 0.01 to 0.99, tick $0.01 (https://www.rothera.io/event-contracts). Each outcome is its own symbol, so a categorical event is a set of separate binaries whose prices need not sum to 1 (e.g. 2026-10-18 settlement prices `CNTRLSEN-26-REP` 0.40 and `CNTRLSEN-26-DEM` 0.64, own data). No scalar contract; "scalar-like" products (point totals, claims, EPS, Fed bucket) are ladders of binary thresholds (`NFLTOTAL-26OCT18HOUJAX-43`, `ECUSFED-26OCT-H25`).
- **Order book (H):** price/time priority central limit order book; only **Limit Orders and Quotes** (market-maker limit orders); no indications of interest; resting limit orders are normally cancelled **30 days** after placement (Rule 4.3). 24/7 trading, Thursday 02:00-04:00 CT maintenance, trade date rolls at 16:00 CT (https://www.rothera.io/venue, Rule 4.6).
- **Tokenisation (H):** none. Positions are cleared by the DCO and carried at the FCM or Participant level in USD-collateralised accounts. There is no on-chain token.
- **Symbol grammar (H, from the daily files):** `<FAMILY>[-<EVENT>]-<OUTCOME>`, e.g. `NFLGAME-26OCT18BUFLV-LV`, `NFLSPREAD-26OCT18HOUJAX-JAX2`, `NFLTOTAL-26OCT18HOUJAX-43`, `ECUSFED-26OCT-H25`, `SENRACE-26TX-REP`, `NBA-27-ATL`, `USPRESNOM-28DEM-JTAL`. Team and candidate codes are short abbreviations, so cross-venue matching needs a mapping table (see `docs/market-linking-design.md`). The `product` column groups symbols into an event.

---

## 3. Chains and collateral

- **No blockchain, USD only (H).** Rule 6.1: Participants "shall deposit and maintain with Company DCO the USD funds required to fully collateralize Orders ... prior to submission". Contracts are fully funded with "no guarantee fund requirements" and funds are held in segregated accounts; funding is by wire and real-time payments (https://www.rothera.io/venue).
- No stablecoin, EVM or Solana contract, bridge or crypto funding path was found (NOT FOUND, searched: venue, solutions, FAQ, company, event-contracts pages, DCM rulebook, Non-FCM agreement). "Crypto" appears only as a "Coming Soon" product category on the venue page.
- Note for PayBox's chain catalog: Robinhood Chain (4663) exists in the PayBox catalog, but nothing found links it to Rothera (NOT FOUND).

---

## 4. Read API

**Verdict: `official-public` for end-of-day files only. Real-time data is participant-only FIX. No REST or WebSocket documented.**

### 4a. Public daily files (H; unauthenticated GET, no key)

Host `https://publicfiles.rotheramarkets.com/` (AmazonS3 behind CloudFront; the root is a plain HTML directory index, `cache-control: no-cache`). The pointer is on https://www.rothera.io/volume-and-open-interest: Rothera "publishes volume, price and open interest for the prior day's trading session daily" "at approximately 4:15 pm central time"; "Historical files are available via our public files site"; "If a file is unavailable you will see access denied". The index itself was regenerated at 21:30 UTC.

| Path | Content | Coverage on 2026-10-19 |
|---|---|---|
| `clearing/outbound/mkt_eod_YYYYMMDD.csv` | one row per live or just-settled symbol | 151 files, 2026-05-21 to 2026-10-18 |
| `exchange/outbound/trade_data/trades_eod_YYYYMMDD.csv.gz` (some days also plain `.csv`) | full trade tape `timestamp,contract,price,quantity` | 83 dates, 2026-07-28 to 2026-10-18 (88 files) |
| `contract_terms/<Family>-T&C.pdf` | per-family contract terms | 57 PDFs |

`mkt_eod` columns (H, `mkt_eod_20261018.csv`, 845,940 bytes, 7,094 rows): `date, product, symbol, expiration_date, trade_count, volume, oi, block_volume, settlement_price, open, high, low, close, contracts_delivered`, every field double-quoted. Volume and OI are contracts of $1 face. Settled symbols carry `settlement_price` 0 or 1, `oi` 0 and `contracts_delivered` (e.g. `NFLGAME-26OCT18HOUJAX-HOU`: settlement 1, delivered 1,405,163). Example live row: `"2026-10-18","CNTRLSEN-26","CNTRLSEN-26-DEM","2027-11-03","79","20342","945628","0","0.64","0.64","0.64","0.61","0.64","0"` (verified in the file I downloaded this session).

Trade tape (H, `trades_eod_20261018.csv.gz`, 2,304,675 bytes, 184,790 rows): UTC timestamps to the nanosecond, price in dollars, quantity in contracts, no side or aggressor, no counterparty. Day boundary: first print 2026-10-17T21:00:00.459Z, last 2026-10-18T20:59:59.968Z, i.e. the 16:00 CT roll while CDT applies (CDT ends 2026-11-01; the roll should then be 22:00Z, M inferred).

**Rate limit (H, observed):** after about 190 sequential GETs (0.2 to 0.5 s apart, about 4 minutes) the host returned **HTTP 429**, empty body, `server: CloudFront`, no `Retry-After`, and kept doing so for at least 15 minutes on `mkt_eod_*` URLs. 16 daily files (2026-08-29 to 2026-09-13) could not be fetched. No limit is documented. A poller must fetch at most one or two files per day and cache.

Not in the files (H): bids, asks, depth, event titles or descriptions, status, resolution text. Titles live only in the T&C PDFs and the filings on `/regulatory-notices`. **Market listing metadata is not machine-readable** beyond the symbol grammar and the `product` column. `robots.txt` on the files host returns 403 AccessDenied; on `www.rothera.io` it holds only a Sitemap line.

### 4b. Real-time data (participants only)

- "Standard FIX API for order entry and market data", drop copy, "API-accessible reference data", SFTP file access, ISV integrations via API (https://www.rothera.io/solutions, /venue, /faq; H). WebSocket and REST: not mentioned (NOT FOUND, searched: venue, solutions, FAQ, company, event-contracts, news, sitemap).
- Platform docs: `https://docs.rothera.io/` answers 302 to `/password?redirect=%2F` (H). FIX spec, ports, sessions, rate limits: **NOT FOUND (gated)**.
- Participant market data is "solely for [the Participant's] own internal business purposes" and may not be redistributed to a third party without written consent (H, Non-FCM Participant Agreement s.9; Rule 10.2 treats market data as the Company's proprietary information). The public EOD files carry no stated licence (NOT FOUND, searched: /legal, /volume-and-open-interest, FAQ).
- The rulebook defines an **ISV** class (Rule 2.9): ISV access is "subject to criteria", and persons using an ISV "must themselves be Participants". So an aggregator cannot get live data or order entry without a participant relationship (H).

---

## 5. Trade path

**None for an agent or for PayBox (H).**

- Retail: only through an FCM. Rule 4.4(A): non-Direct-Access persons "may trade Contracts only as Customers of an FCM Participant, and all Customer Orders must be transmitted to the Company by each Customer's FCM Participant". Rule 4.4(B): the Company checks the collateral account before each order and rejects it if under-collateralised. FAQ: "Retail orders reach the exchange through intermediaries."
- Visible FCM: Robinhood Derivatives, LLC, app-only. I found no public Robinhood API for event contracts: `docs.robinhood.com` redirects to `/crypto/trading` (crypto API), and the "Robinhood Agents" page (https://robinhood.com/us/en/agents/) describes agentic trading under the brokerage entity and crypto, with no mention of prediction markets or event contracts in the text I read (M, absence). Whether Robinhood Agents or its MCP connection can place event contracts is **unresolved** (open question 5).
- Direct: Rule 2.2 requires a Participant Agreement, OFAC screening, beneficial-ownership disclosure and US organisation "or such other jurisdiction as the Company may permit on a case-by-case basis"; the Non-FCM form says access is "for its own proprietary account" and that the participant "will maintain a Market Maker Agreement with the Company at all times". Market makers must be eligible contract participants, sign the program agreement and meet minimum quoting metrics (https://www.rothera.io/solutions). All H.
- Auth and signing: FIX session credentials issued on onboarding (M; details gated). No wallet-signature or API-key scheme exists. Onboarding is the contact form on `/contact` only.

---

## 6. PayBox reachability

**paybox_reachable = no.** A PayBox EVM or Solana wallet cannot trade here: no on-chain contract, no signed-order endpoint, USD funding by wire or RTP into a clearing-member account, orders only through an FCM or a FIX session, and KYC, entity and OFAC rules (sections 3 and 5, H). No transaction proposal or typed-data signature maps to this venue. Live read-only PayBox discovery on 2026-10-19: `discover_plugins` for "rothera" and for "prediction market event contracts" returned no plugins; `discover_services` for "rothera robinhood prediction market" returned only unrelated third-party x402 listings (a Polymarket/Kalshi odds search, a Robinhood Chain data feed, a Robinhood Chain RPC), none for Rothera (H for what the tools returned; those listings are untrusted vendor data and were not used).

---

## 7. Fees

Source: Rothera Fee Schedule dated 2026-05-20, one page (https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf), rendered and read (H). Text copy in the fixtures.

- Binary contracts, **buyer and seller each pay on every trade**: `order fee = MAX( round( k x p x (1 - p) x c , 2 ), $0.01 )`, p = price in dollars, c = contracts, round half up.
- k: **FCM retail customer 0.02**, **FCM professional trading firm 0.12**, **market maker 0.03**. The PDF's worked example uses k = 0.06 (100 contracts at $0.35 gives $1.37), a value that is not in its own table; treat the table as authoritative (M on which is stale).
- Per contract at p = 0.50: retail $0.005, professional $0.030, market maker $0.0075; at p = 0.10 or 0.90: retail $0.0018, professional $0.0108, market maker $0.0027. $0.01 minimum per order, so many small orders are expensive (inferred from the formula, H on the formula).
- Robinhood adds its own commission: "never exceeding $0.01 per contract", lowest near $0.01 and $0.99, Gold subscribers up to 50% less, and "exchanges typically charge an additional fee" (Robinhood newsroom 2026-06-04, H, page-fetch summary). At the 2026-05-27 Bernstein conference the CFO described a 2-cent per-contract fee split 1 cent each between Robinhood and the exchange and said the structure "is not gonna stay" (M, secondary report; may predate the Rothera schedule).
- No settlement, deposit or withdrawal fee, and no maker/taker split, appears in the one-page schedule (NOT FOUND, searched: fee schedule PDF). Notice 26-10 (2026-05-05) and 25-04 are "Revised Fee Schedule" filings on the notices page; I did not check for revisions after 2026-05-20 (open question 4).

---

## 8. Resolution mechanism and dispute risk

- **Resolver (H): Rothera itself.** NFL game T&C: "After trading of the Event Contract has closed, Rothera will determine the Expiration Value ... The market is then settled by Rothera." No oracle, no token vote, no external dispute window. Disputes between a Participant and the Company go to rulebook arbitration (Chapter 9); an end customer reaches it only through the FCM.
- **Source hierarchy (NFL game T&C, H):** "NFL.com and the official statistics published on its public website, ESPN, CBS Sports, Fox Sports, NBC Sports, the Associated Press, Reuters and the official broadcaster". The first final result from the highest-ranked source governs; revisions after Expiration are ignored; the Exchange may defer to a corrected result issued before Expiration if it deems the first "clearly erroneous". `expiration_date` in the daily file is the event date plus 2 days (e.g. a 2026-10-18 game lists 2026-10-20); in practice finished games showed `settlement_price` 0/1 in the same-day file (H, own data).
- **Delays and discretion (H):** if the result is delayed or unavailable the Exchange "may wait up to 24 hours after the Expiration Time ... after which it may resolve the Contract in its sole discretion".
- **Abandoned, cancelled or not rescheduled before Expiration (H):** resolves "based on the last fair market price as determined by the Exchange pursuant to Rothera DCM Rule 7.2"; long gets price x contracts, short gets $1 minus the price. Suspended and not resumed: same. Forfeit before the start: the forfeiting side resolves No. Vacated or disqualified after the start: No for that team. Moved date or venue: stays open. The 2026-05-20 rulebook's Rule 7.2 is a general "Procedures" rule (it lists "determine the daily settlement price of a Contract"); it does not itself define a "fair market price" for voids (H, read the rulebook text), so the void formula is set by the T&C and by Exchange notices.
- **Concrete ad hoc settlement (H):** Notice 26-101 (2026-10-12): position holders in the NYG vs WAS game of 2026-10-11 "will receive a payout calculated by multiplying the number of Contracts held by this $0.50 price" under Rule 7.2. The notice gives no reason. Rothera does not publish an oracle trail for this.
- **Trade cancellation (H):** Rule 10.7: for Binary Option contracts the Company "will generally not cancel or adjust an erroneous trade except in extraordinary circumstances".
- **Arbitrage consequence:** the same real-world game on Kalshi or Polymarket can resolve differently on ties, abandonment, regulation versus overtime scope and "sole discretion" calls. Any cross-venue hedge carries basis risk; the linking layer must compare T&C clauses, not just titles. Dispute risk: low to medium for clean sports and macro results (objective sources, CFTC oversight); higher for edge cases where Rothera keeps discretion.

---

## 9. Geo / ToS / automation

- Regulated US venue. Direct participants: US-organised by default, OFAC screening, beneficial-ownership disclosure (Rule 2.2). Non-US direct participants must rely on reverse solicitation and self-certify local legality (Non-FCM Agreement s.5.7: access must be "solely on its own initiative", participant "assumes sole responsibility for compliance with all applicable laws"). Retail state or country eligibility is set by the FCM; Robinhood's post says only "to all eligible customers" (H, page-fetch summary) and its prediction-markets page lists no eligibility rules in the text I read (NOT FOUND).
- Automation: no ban found. FIX/API is the intended access for FCMs, ISVs and market makers. Rule 7.3 prohibits spoofing, wash and fictitious trades, front-running and similar; Rule 7.2 lets the Company limit order count and size per Participant (H).
- Data licence: participant market data may not be redistributed (section 4b). Whether our aggregator may republish values derived from the public EOD files is **unresolved** (no terms found).
- Position limits are per strike per participant: jobless claims and Core PCE 2.5M contracts (participants) and 25M (market makers); baseball 500K and 5M (https://www.rothera.io/event-contracts, H; that page is stale and lists only three categories).
- Prohibited persons for sports contracts: players, coaches, officials, league staff, agents and close associates, plus anyone with material non-public information (NFL game T&C, M: from the sibling note's read; I did not re-read that clause).

---

## 10. Liquidity and category overlap

### Volume and OI (H unless noted; computed from Rothera's `mkt_eod_*.csv` and `trades_eod_20261018.csv.gz`, fetched 2026-10-19)

- **Units warning:** "volume" in these files is **contracts at $1 face**. Premium actually paid is about 46% of face (2026-10-18 tape: 71,434,328 contracts, sum of price x quantity = $33.16M, ratio 0.464).
- 2026-10-18 (Sunday, NFL): 71,434,328 contracts, 184,790 trades, median trade 59 contracts, max 50,000. NFL game, spread and total markets were 63.4M of the 71.4M contracts.
- Last 7 days (2026-10-12 to 2026-10-18): 273.7M contracts. Last 28 days (2026-09-21 to 2026-10-18): 1.098B contracts, 39.2M per day. Weekday and Saturday troughs 7M to 20M contracts.
- Peak day in the files: 2026-07-07, 180,113,147 contracts, 420,741 trades. Monthly sums of the files I could fetch: Jun 2.09B, Jul 1.69B, Aug 1-28 0.52B, Sep 14-30 0.69B, Oct 1-18 0.69B. The 16 days 2026-08-29 to 2026-09-13 are missing (HTTP 429), so my total of 5.69B contracts since launch is a **lower bound**. The sibling note's 6.22B total and its Aug 0.59B and Sep 1.16B (M) are consistent with mine plus the missing days.
- Open interest 2026-10-18: sum of symbol-level `oi` = 98.26M contracts (an upper bound on face value at risk; both outcome symbols of one event can each carry OI). Largest groups: NFL season futures 24.4M, NCAAF 9.7M, Senate races 9.0M, NFL games 5.9M, House control 4.6M, governors 3.7M, Fed decisions 3.3M.
- Venue self-report (https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera, 2026-08-04, H as a claim): 3.44B contracts over the World Cup, 2,902 contracts listed, "about 7-8% of total market share among CFTC-regulated venues".
- Robinhood Q2 call, secondary only (M): Rothera "top three DCM", 2.1B contracts in Q2, $17M of Robinhood's $156M Q2 event-contract revenue, Robinhood customers 13.6B contracts and 2M prediction-market customers. My June total of 2.09B contracts matches the 2.1B (H for mine). Robinhood primary release not read (search-result summaries only; the news sites returned 403).
- Stale flags: The Block's "Monthly Trades 1,653,594" has no month or unit and does not match my counts (L); the discovery hint's dollar figures were not reproduced.

### Categories that overlap other venues (where arbitrage exists)

| Rothera family | Live example (2026-10-18) | Likely overlap |
|---|---|---|
| NFL game, spread, total; MLB, NHL, NBA, NCAAF, soccer, tennis, golf | `NFLGAME-*`, `NFLSPREAD-*`, `NFLTOTAL-*` (line ladders) | Kalshi, Polymarket US and global, Robinhood's other routes. Sports are the bulk of volume |
| Politics | `CNTRLHOU-26`, `CNTRLSEN-26`, `SENRACE-26<ST>`, `GOVRACE-26<ST>`, `USPRESNOM-28*` | Polymarket, Kalshi |
| Macro | `ECUSFED-26OCT/...` (Fed buckets), Core PCE (`ECPCE`), weekly claims (`ECUNEMP`) | Kalshi, Polymarket |
| Corporate | Tesla Q3 2026 Adjusted EPS (filing 26-112) | Kalshi earnings markets |
| Crypto price | "Coming soon" only | none yet |

### Liquidity sharing

- Rothera's book is **independent** of Kalshi, Polymarket and ForecastEx (H: its own CLOB and its own trade tape).
- **Not independent of Robinhood.** Robinhood routes "winner, spread and total" style contracts into Rothera (H, Robinhood 2026-06-04); a Robinhood customer and an FCM client trade against the same book. Susquehanna is a JV owner and day-one liquidity provider (H, Robinhood JV page), although Rothera says it "does not operate an in-house market maker" (H, company page). MarketsWiki notes the same tension (M).
- Direction of travel (M): the CFO said in late May that Robinhood expects to migrate "most" of its flow to Rothera in the "near to medium term" while possibly keeping a backup exchange; a later headline says "most, but far from all" (title only). Kalshi-listed flow from Robinhood is Kalshi's, not Rothera's.
- A search result mentions an OG.com partnership as an "infrastructure and clearing provider" for Robinhood's prediction markets; I could not verify it (search budget exhausted) and it does not change Rothera's own book (open question 6).

---

## 11. Suspicious / untrusted content

- `https://docs.ledgerx.com/` redirects to `https://docs.miaxdx.com/inactive`, which serves a page titled **"Takeover By Hide_khan"** (H, fetched 2026-10-19, 13,627 bytes, HTTP 401 at the final URL). It looks like an unclaimed or hijacked legacy docs host. I read no instructions in it and followed none; do not use or link legacy LedgerX or MIAXdx API docs.
- The real platform docs `https://docs.rothera.io/` are password-protected (H).
- No text addressed to AI agents was found on rothera.io, the public files index, the Robinhood pages or the PDFs read (H, for the pages and files I opened).
- A search result pointed at an X article (`x.com/RotheraMarkets/article/...`); I did not fetch it. The sibling note records HTTP 402 for it (M); no payment was attempted.

---

## 12. Fixtures and how to adapt

`docs/research/fixtures/rothera-exchange-and-clearing-llc-ex-miaxdx-robinhood-susquehanna-jv/` (all under 50 KB):

- `mkt_eod_20261018.sample.csv` - 170 real rows from the real 2026-10-18 file, the top two symbols by volume for each of its 85 families (full file 7,094 rows).
- `trades_eod_20261018.sample.csv` - the header plus the first 120 real trades of the tape (full 184,790 rows).
- `publicfiles_index_excerpt.txt` - response headers, counts, first links, and the 429 observation.
- `derived_daily_totals_from_mkt_eod.csv` - MY computation (not an API response): per-day symbols, trades, volume and summed OI for the 135 daily files fetched; the 16 throttled days are marked `NO_http_429`.
- `fee_schedule_2026-05-20.text.txt` and `notice_26-101_2026-10-12.text.txt` - text extracted from the two PDFs (the notice's venue mailbox is redacted).

Adapter sketch (signal-only): poll the index (or build `mkt_eod_YYYYMMDD.csv` by date) once per day after about 21:30 UTC (22:30 UTC once CST starts), one request per file with backoff on 429; parse `symbol` with the grammar in section 2; join to Kalshi and Polymarket markets through the linking layer using the T&C PDF clauses; use `settlement_price` and `close` as daily references and the tape (nanosecond UTC, no side) for lead-lag and calibration. These are not executable quotes.

---

## 13. Differences from the sibling note and open questions

Differences from `rothera-exchange-and-clearing.md`:

- That note's cumulative 6.22B and monthly rows come from all 151 daily files; mine are lower because 16 files were throttled (section 10). No disagreement beyond that.
- I read Rule 7.2 itself: in the 2026-05-20 rulebook it is a generic "Procedures" rule, and the "last fair market price" void formula is stated in the T&C, not in the rulebook (section 8).
- I added: the HTTP 429 behaviour, Rule 2.9 (ISV class), the Robinhood Agents page check, live PayBox discovery results, the Q2-call figures and CFO routing comments (M), and the OG.com lead.
- No personal identifier was found in the sibling note or its fixtures during this pass.

Open questions:

1. FIX spec, credentials, rate limits, and whether any delayed or real-time public feed exists: gated at `docs.rothera.io` and the contact form.
2. Licence and redistribution terms for the public EOD files; the 429 limit is undocumented.
3. How often Rothera settles ad hoc at a fixed price (Notice 26-101 was $0.50 with no reason); scan `/regulatory-notices` for more.
4. Whether fee k values or Robinhood's per-contract commission changed after 2026-05-20.
5. Whether Robinhood Agents or its MCP connection can place event contracts, and whether any other FCM offers programmatic access or crypto funding.
6. OG.com's role in Robinhood's stack, and whether other FCMs have joined Rothera (River Markets lists Rothera as "Future integration", H, https://docs.rivermarkets.com).
7. The 16 missing daily files (2026-08-29 to 2026-09-13) should be fetched later, slowly, to complete the cumulative total.

---

## Sources

- https://robinhood.com/newsroom/robinhood-prediction-markets-joint-venture/ - H (page-fetch summary: JV partners, MIAX 10%, closing 2026-01-20)
- https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ - H (2026-06-04; routing, fees, entity relationship)
- https://robinhood.com/us/en/prediction-markets/ and https://robinhood.com/us/en/agents/ and https://robinhood.com/newsroom/robinhood-presents-yes-no-event/ (2025-12-16, stale for 2026) - H for what they say, M for absence claims
- https://www.rothera.io/ pages: /venue, /solutions, /faq, /company, /event-contracts (stale), /legal, /regulatory-notices, /volume-and-open-interest, /news-and-insights, /post/performance-under-pressure-what-the-world-cup-proved-for-rothera, /robots.txt, /sitemap.xml - H (fetched 2026-10-19; page-fetch summaries, key lines quoted)
- https://publicfiles.rotheramarkets.com/ (index, `clearing/outbound/mkt_eod_*.csv` x135, `exchange/outbound/trade_data/trades_eod_20261018.csv.gz`, `contract_terms/NFLGame-T&C.pdf`) - H (unauthenticated GETs)
- Fee Schedule 2026-05-20: https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf - H
- DCM Rulebook (file titled "v1 updated 050526", linked 2026-05-20): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71190_20260520%20-%20Rothera%20DCM%20Rulebook_Clean.pdf - H (Rules 2.2, 2.9, 4.3, 4.4, 4.6, 6.1, 7.2, 7.3, 7.15, 10.2, 10.7)
- Non-FCM Participant Agreement (v052126): https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71196_Rothera%20Non-FCM%20Participant%20Agreement%20(v052126).pdf - H (recitals, s.5.7, s.9)
- Notice 26-101 (2026-10-12): https://cdn.prod.website-files.com/6a99b37483d294062ea71050/6acd0c6c2ea9f0a879ecf7e6_Notice%2026-101.docx%20(1).pdf - H
- https://docs.rothera.io/ (password gate), https://docs.ledgerx.com/ and https://docs.miaxdx.com/inactive (hijacked page), https://docs.robinhood.com/ (redirect) - H for what they serve
- https://docs.rivermarkets.com - H ("Rothera | US regulated prediction markets | Future integration")
- https://www.marketswiki.com/wiki/index.php?title=Rothera - M (last edited 2026-09-05)
- https://nexteventhorizon.substack.com/p/robinhood-cfo-says-most-prediction-flow-moving-to-rothera - M (Bernstein conference remarks, 2026-05-27)
- Search-result summaries only, not opened: gamblinginsider.com/news/179795/robinhood-q2-rothera-top-3-prediction-market-exchange (403), ingame.com/robinhood-rothera-earnings-call (403), defirate.com Robinhood Q2 revenue article, theblock.co Rothera monthly trades - M/L
- PayBox `discover_plugins` / `discover_services` (read-only), 2026-10-19 - H for what they returned
- Sibling note `docs/research/venues/rothera-exchange-and-clearing.md` - M (used as a lead; all key facts re-read above)
