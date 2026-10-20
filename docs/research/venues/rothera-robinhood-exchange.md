# Rothera (Robinhood's exchange) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Sources: first-party web pages (WebFetch returns a small-model summary of each page, so wording from pages is as returned), PDFs read directly (fee schedule, NFL game T&C, Non-FCM Participant Agreement, Notice 26-101), unauthenticated GETs to Rothera's public-files host and to Robinhood's public pages. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation; no PayBox tool called. All third-party text treated as untrusted data; no instructions aimed at agents were found. The shared web-search budget ran out after one search, so news coverage is thin (listed in section 13).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, page-summary inference, or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/rothera-robinhood-exchange/` (section 12).

Note on scope: Rothera is the exchange. "Robinhood" is (a) a co-owner of Rothera and (b) the retail FCM that routes flow into it. Robinhood's own app is not a separate venue (section 10).

---

## 0. Verdict

**adapter_priority = P2 (signal-only). Confidence: high.**

1. **Live and large (H).** CFTC-registered DCM + DCO, launched late May 2026. Public daily files show about 6.2 billion contracts (face $1) traded 2026-05-21 to 2026-10-18 and 98.3M contracts of open interest on 2026-10-18. Single central limit order book, binary $0.01-$0.99 contracts, 24/7.
2. **No live read API (H).** Real-time data and order entry are FIX only, for FCMs and market makers; the platform docs are behind a password. The only public data are end-of-day CSVs (a per-symbol daily table and a full trade tape), published once a day at about 4:15 pm CT. No quotes, no order book, no market list.
3. **No trade path for an agent (H).** Retail reaches Rothera only through an FCM; the only FCM listed is Robinhood Derivatives, LLC, whose event-contract trading is mobile-app only. Robinhood's official agent interface (Trading MCP) does not list event contracts as of 2026-10-19. Direct access is institutional (ECP, own account, must also hold a Market Maker Agreement).
4. **Not reachable from a PayBox wallet (H).** USD only (wire / real-time payments), no chain, no token, no signed order.
5. **Liquidity is real and book-independent, but retail flow is Robinhood's.** Rothera's CLOB is separate from Kalshi's, ForecastEx's and Crypto.com's books. Robinhood sends each event to exactly one of those exchanges (section 10), so Robinhood is not a second leg next to Rothera.
6. **Why still worth a signal adapter:** free, unauthenticated, nanosecond-stamped trade tape plus daily OI/settlement for sports, US politics and macro: the categories that overlap Kalshi and Polymarket. Good for lead-lag and calibration studies, and as a daily reference price. Too stale and too slow for live edge detection.

Discovery hint check: "Robinhood routed via Kalshi then launched Rothera" is incomplete. Robinhood still routes to Kalshi, ForecastEx, Rothera and (since 2026-09-08) Crypto.com's exchange and OG.com (H, section 1). "13.6B event contracts in Q2 2026" is a Robinhood-wide figure across all venues (H), not a Rothera figure. A separate article's "Rothera 3.5B contracts in Q2" does not match the exchange's own files (about 2.1B contracts in Q2, section 10).

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| Public files host directory index "Generated 2026-10-18 21:30 UTC"; newest `mkt_eod_20261018.csv` has 7,094 symbols and 184,790 trades that day. https://publicfiles.rotheramarkets.com/ | 2026-10-18 | H |
| rothera.io company page timeline: founded Jul 2025; JV funding Oct 2025; MIAXdx acquisition announced Nov 2025, closed Jan 2026; "May 2026 initial launch" (Core PCE, weekly jobless claims, pro baseball); June soccer, tennis, Fed; July onward football, golf, hockey, basketball, elections. Registered DCM, DCO, SEF (SEF dormant). https://www.rothera.io/company | 2026-10-19 | H |
| Regulatory notices through No. 26-112 (Tesla Q3 2026 EPS contract), NBA Cup / NBA filings dated about 2026-10-14; Notice 26-101 dated 2026-10-12. https://www.rothera.io/regulatory-notices | 2026-10-19 | H |
| Rothera news page: posts dated 2026-09-22 (Adaptive infrastructure), 2026-10-08 and 2026-10-09 (swap-definition essay). https://www.rothera.io/news-and-insights | 2026-10-19 | H |
| Robinhood newsroom 2026-06-04: "Robinhood is sending event contracts to Rothera, starting with ... World Cup and professional baseball". https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ | 2026-06-04 | H |
| Robinhood newsroom 2026-09-08: Robinhood routes event contracts to Kalshi, ForecastEX and Rothera; from 2026-09-08 also a selection of football contracts to Crypto.com's platform and OG.com; Robinhood "will hold equity stakes in Crypto.com and OG.com"; Q2 2026 "13.6 billion event contracts traded on Robinhood"; "over 45 billion" since launch; "more than 30 billion" in 2026 through August. https://robinhood.com/newsroom/robinhood-cryptocom/ | 2026-09-08 | H |

**still_live = true.** Official site is https://www.rothera.io/ (`rotheramarkets.com` is the data host).

---

## 2. Kind and market model

- **Kind (H):** regulated exchange (DCM) and clearinghouse (DCO) for event contracts, legal entity Rothera Exchange and Clearing LLC, wholly owned by Rothera, LLC, a joint venture "managed by Robinhood Markets, Inc. and Susquehanna International Group" (Robinhood newsroom 2026-06-04). Ex-MIAXdx (acquired Jan 2026). "Not a consumer destination": retail goes through intermediaries (FAQ https://www.rothera.io/faq, H).
- **Contract type (H):** each event contract is a **swap** ("The Type of Contract is a swap", NFL game T&C, https://publicfiles.rotheramarkets.com/contract_terms/NFLGame-T&C.pdf). Binary Yes/No, settlement value of an in-the-money contract $1, minimum tick $0.01 (same T&C). Prices therefore live in $0.01-$0.99.
- **Categorical / scalar:** not native. Multi-outcome events and ladders are sets of independent binaries (one symbol per team, per party, per spread or total line). Their prices need not sum to 1. Example from the 2026-10-18 file: `CNTRLSEN-26-REP` close 0.40 and `CNTRLSEN-26-DEM` close 0.64 (H).
- **Order book (H):** central limit order book with price/time priority; "FIX for order entry, market data, and drop copy" (https://www.rothera.io/venue). Hours 24/7; weekly maintenance Thursday 02:00-04:00 CT; trades after 16:00 CT go in the next day's reports.
- **Tokenisation:** none. Positions are cleared by the DCO and held at the participant/FCM level.
- **Symbol grammar (H, from the EOD file):** `<FAMILY>[-<EVENT>]-<OUTCOME>`, e.g. `NFLGAME-26OCT18BUFLV-LV`, `NFLSPREAD-26OCT11NYGWAS-WAS3`, `ECUSFED-26OCT-H25`, `CNTRLHOU-26-REP`, `SENRACE-26OH-DEM`, `USPRESIDENT-28-...`. The EOD file groups symbols by `product` (the event). 85 family prefixes were live on 2026-10-18. Team and candidate codes are abbreviations, so cross-venue matching needs a mapping table.

---

## 3. Chains and collateral

- **No blockchain (H).** USD only. Funding "wire transfers and real-time payments (RTP)", "fully-funded event contracts (no guarantee fund requirement)", segregated funds accounts (https://www.rothera.io/venue). Direct participants post margin/collateral under the DCO rules; margin set by the company "in its sole and absolute discretion" (Non-FCM Participant Agreement s.7, H).
- Robinhood customers: "buying power is settled cash"; instant deposits cannot be used for event contracts (https://robinhood.com/us/en/support/articles/event-contracts-overview/, H).
- No stablecoin, EVM/Solana contract, bridge or crypto funding path found (NOT FOUND, searched: rothera.io venue/solutions/FAQ/company pages, Robinhood event-contract support pages, Non-FCM agreement).
- Robinhood Chain (an Arbitrum-platform L2, mainnet per Robinhood 2026-07-01, H) carries stock tokens and DeFi; the Robinhood posts I read do not mention event contracts on it (NOT FOUND, searched: the 2026-07-01 Chain post, 2026-05-27 agents post, 2026-09-29 HOOD Summit post).

---

## 4. Read API

**exists = official-public (end-of-day files only). Real-time = participant-only FIX. No REST, no WebSocket.**

### 4a. Public daily files (H, unauthenticated GET, no key)

Host `https://publicfiles.rotheramarkets.com/` (S3 behind CloudFront, plain HTML directory index). Rothera says it publishes "volume, price, and open interest for the prior day's trading session daily at about 4:15 pm Central" (https://www.rothera.io/volume-and-open-interest, H). No licence or usage terms are stated there (NOT FOUND, searched: /volume-and-open-interest, /legal).

| Path | Content | Cadence / coverage |
|---|---|---|
| `clearing/outbound/mkt_eod_YYYYMMDD.csv` | one row per live or just-settled symbol | daily; 151 files, 2026-05-21 to 2026-10-18 |
| `exchange/outbound/trade_data/trades_eod_YYYYMMDD.csv` (`.csv.gz` for newer days) | full trade tape | 88 files, 2026-07-28 to 2026-10-18 |
| `contract_terms/<Family>-T&C.pdf` | per-family contract terms | one per listed family |

- `mkt_eod` columns (H, header identical in the files I fetched, 2026-05-21 through 2026-10-18): `date, product, symbol, expiration_date, trade_count, volume, oi, block_volume, settlement_price, open, high, low, close, contracts_delivered`. All values quoted strings. Example row: `"2026-10-18","NFL-27WINNER","NFL-27WINNER-BUF","2027-02-16","76","23142","1530191","0","0.13","0.13","0.13","0.12","0.13","0"`.
- Trade tape columns (H): `timestamp,contract,price,quantity`, UTC with nanoseconds, no side or aggressor, no counterparty. 2026-10-18 tape runs 2026-10-17T21:00:00.459Z to 2026-10-18T20:59:59.968Z (the 16:00 CDT roll). Roll should move to 22:00Z once CST starts on 2026-11-01 (M, inferred).
- **Rate limit (H, observed):** after about 110 sequential GETs at roughly 0.4 s spacing, CloudFront answered **HTTP 429 with an empty body** and kept doing so for several minutes (no Retry-After header seen). A download script without `-f` silently writes zero-byte files. Poll at most once per day for the newest file, space requests by several seconds, and treat an empty body as a failure.
- Not in the public files: bids/asks, depth, event titles, market status, resolution text. Titles come only from the T&C PDFs and regulatory filings, so listing metadata is not machine-readable beyond the symbol grammar.
- Third party: DeFi Rate licenses Rothera's public daily reports and republishes volume (https://defirate.com/prediction-markets/volume/rothera/, M).

### 4b. Real-time (participants only)

- FIX API for order entry and market data, drop copy, reference-data download, SFTP and ISV integrations (https://www.rothera.io/solutions, H). WebSocket and REST: not mentioned (NOT FOUND, searched: venue, solutions, FAQ, news pages).
- Docs host `https://docs.rothera.io/` redirects to `/password?redirect=%2F`, title "Rothera Platform Documentation", password-protected (H). FIX spec, ports, session limits: NOT FOUND (gated).
- Participant market data is for "own internal business purposes" only and may not be redistributed without written consent (Non-FCM Participant Agreement s.9, H). Whether the public EOD files may be republished is not stated (open question).

### 4c. Robinhood-side read surfaces (all unofficial or absent)

- No official Robinhood API for event contracts. `docs.robinhood.com` sitemap (lastmod 2026-10-16) lists only `/crypto/`, `/crypto/connect/`, `/crypto/trading/` (H). The Trading MCP (`https://agent.robinhood.com/mcp/trading`) lists account, watchlist, market-data, equities, options and crypto tools; event contracts and futures are not listed (H, https://robinhood.com/us/en/support/articles/agentic-trading-overview/ and `.../onboarding-an-external-agent/`, 2026-10-19). On 2026-05-27 Robinhood said event contracts were "coming soon" for agentic trading (https://robinhood.com/us/en/newsroom/robinhood-is-now-open-to-agents/, H).
- Unofficial: the public hub pages (sitemap lists 4,209 URLs, https://robinhood.com/us/en/sitemap-prediction-markets.xml, H) embed per-contract JSON with the exchange symbol and an exchange enum (`EXCHANGE_SOURCE_ROTHERA` or `EXCHANGE_SOURCE_KALSHI`), tick ranges, expiry, plus volume/open-interest fields. I found no bid/ask fields. One page (`/prediction-markets/midterms/`) is about 6 MB. This is undocumented and I did not read Robinhood's terms on scraping; do not build on it. Useful once as a mapping aid (Robinhood contract <-> exchange symbol). See fixture.

---

## 5. Trade path

**none for an agent or for PayBox. (H)**

- **Retail:** Robinhood Derivatives, LLC (FCM), mobile app only; "The web is view-only, and event contracts aren't available on Robinhood Legend"; limit orders only (IOC or good-til-date to 3 AM ET next day; dollar orders are IOC; custom combos are fill-or-kill); needs a Robinhood Derivatives account approval (https://robinhood.com/us/en/support/articles/trading-event-contracts/, H). Rothera's own site lists Robinhood Derivatives, LLC as the one current clearing member / clearing firm (https://www.rothera.io/legal, H).
- **Direct:** FCM Participant, or Non-FCM "Direct Access Participant": an entity (not an FCM) that is an Eligible Contract Participant, trades "for its own proprietary account", and "will maintain a Market Maker Agreement ... at all times" (Non-FCM agreement recitals and s.3, H). Market makers must be ECPs, sign the program agreement and meet minimum quoting metrics (https://www.rothera.io/solutions, H). Onboarding: contact the team (no self-serve flow found).
- **Auth / signing:** FIX session credentials issued on onboarding (M, details gated). No wallet-signature scheme.

---

## 6. PayBox reachability

**paybox_reachable = no.** An EVM or Solana wallet reachable through PayBox cannot place, sign or fund anything here: no on-chain contract, no signed-order endpoint, USD wire/RTP funding into a clearing-member account, KYC'd FCM or ECP-only direct access (sections 3 and 5, H). No transaction proposal or typed-data signature maps to Rothera. The only theoretical route would be an FCM that accepts crypto funding and offers an API; I found none (NOT FOUND).

---

## 7. Fees

**Exchange fee (H):** https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71193_Rothera%20Fee%20Schedule_20260520.pdf (dated 2026-05-20, one page, read directly).

- "For each trade of any Binary Range Contracts, the buyer and the seller will each be charged": `order fee = MAX( round( k x p x (1 - p) x c , 2 ), $0.01 )`, p = price in dollars, c = contracts, round half up.
- k: **FCM retail customer 0.02**, **FCM professional trading firm 0.12**, **market maker 0.03**. (The PDF's worked example uses k = 0.06, which is not in the table: 100 at $0.35 gives $1.37.)
- Per contract at p = 0.50: retail $0.005, pro $0.030, MM $0.0075.
- No settlement, deposit/withdrawal or maker/taker fee is listed (NOT FOUND in the one-page schedule). Later revisions not checked (Notice 26-10 was a revised fee schedule; open question).

**Robinhood layer (H):** https://robinhood.com/us/en/support/articles/event-contracts-overview/ (fees "effective June 1, 2026"): commission = `k x p x (1 - p) x c`, k = 5% with Gold ($5/month) or 10% without, capped at $0.01 per contract; "exchange fees, up to $0.01 per contract, apply to both opening and closing trades". Example: 100 contracts at $0.90 cost $0.45 (Gold) or $0.90 (non-Gold) commission plus exchange fees. Robinhood waived its contract fees on earnings contracts through year-end (2026-09-29 post, H) but those are Cboe-listed, not Rothera.

---

## 8. Resolution mechanism and dispute risk

- **Resolver (H):** Rothera itself. "After trading of the Event Contract has closed, Rothera will determine the Expiration Value ... The market is then settled by Rothera." No oracle, token vote or external dispute window (NFL game T&C). Source agencies are listed in a hierarchy (NFL game: NFL.com, ESPN, CBS, Fox, NBC, AP, Reuters, official broadcaster); first final result from the highest-ranked source governs; later revisions are ignored. Expiration 10:00 AM CT, at most 2 days after the scheduled game; settlement date no later than the day after expiration.
- **Discretion (H):** if a result is delayed, Rothera "may wait up to 24 hours after the Expiration Time ... after which it may resolve the Contract in its sole discretion"; "Rothera reserves the right to make settlement determinations" (DCM Rule 7.2 as quoted in the T&C).
- **Void / abandoned / unresolved (H):** not a void and not 50/50 by default. Abandoned, cancelled, not rescheduled, or suspended and not resumed: resolves "based on the last fair market price as determined by the Exchange pursuant to Rothera DCM Rule 7.2" (long gets price x contracts; short gets (1 - price) x contracts). Forfeit before start: the forfeiting team resolves No.
- **Real ad hoc settlement (H):** Notice 26-101, dated 2026-10-12: for NYG vs WAS on 2026-10-11, "position holders ... will receive a payout calculated by multiplying the number of Contracts held by this $0.50 price", under Rule 7.2; no reason given in the notice. In the 2026-10-11 EOD file both winner contracts last traded about 0.46-0.47 (NYG 0.47, WAS 0.46) (H, from the file). I did not establish why.
- **Trade cancellation:** Rule 10.7 "will generally not cancel or adjust an erroneous trade except in extraordinary circumstances" (M: from a sibling repo note, I did not re-read the 1.4 MB rulebook PDF because no PDF-to-text tool was available).
- **Legal/regulatory contingency (H):** the participant agreement warns that contracts "may be the subject of active litigation, regulatory enforcement actions, and/or legislation", that Rothera may be required to "suspend, limit, or terminate certain activities or contracts", and that "open positions may be liquidated and the participant may not recover the full value" (s.5.8). Rothera published a post on the CFTC's proposed event-contract public-interest rule on 2026-08-19 (title seen, content not read, H/L).
- **Arbitrage consequence:** same-event contracts on Kalshi or Polymarket can settle differently on ties, abandonment, overtime scope and Rothera's discretionary calls. The market-linking layer must compare T&C clauses, not just titles. Dispute risk: medium-low for clean results from objective sources, higher for edge cases.

---

## 9. Geo / ToS / automation

- **Robinhood eligibility (H):** 18+, US resident, individual brokerage account. Event contracts are "not available in all states"; Maryland and Nevada residents cannot trade sports contracts; Michigan residents cannot open new sports contracts as of 2026-09-09 (https://robinhood.com/us/en/support/articles/event-contracts-overview/).
- **Rothera direct access (H):** entities organised in the US by default; non-US direct participants must self-certify reverse solicitation and local legality (Non-FCM agreement s.5.7); OFAC/AML warranties (s.5.5).
- **Automation:** no ban found for FIX/API use by participants; participants are "fully responsible" for orders submitted by their authorised users, including errors (s.4.2). Robinhood's agent terms say agents may place trades without per-trade approval if the customer allows it, but only in the dedicated agentic account and only for the product set listed above (H). No website terms-of-use page governing the public files was found (NOT FOUND, searched: /legal, FAQ).
- **Data licence:** participant data internal-use only; public EOD files unlicensed-or-unstated (open question).
- **Prohibited persons (sports):** players, coaches, officials, league staff, agents, close associates, and anyone with MNPI (NFL game T&C, H).

---

## 10. Liquidity and category overlap

**Units warning (H):** Rothera "volume" and "oi" are contracts at $1 face value. Premium actually paid on 2026-10-18 was about $33.2M against 71.4M contracts (average price 0.464, from the tape).

**Volume and OI from Rothera's own files (H, my sums of `mkt_eod_*.csv`; 4 days, 2026-09-09 to 2026-09-12, were rate-limited (HTTP 429) and are missing from the sums, see fixture):**
- 2026-10-18 (Sunday, NFL): 71,434,328 contracts, 184,790 trades, median trade 59 contracts, max 50,000. NFL game, spread and total markets were 63.4M of the 71.4M contracts.
- Monthly contracts: Jun 2.09B, Jul 1.69B, Aug 0.59B, Sep at least 0.97B (about 1.2B with the 4 missing days, per DeFi Rate, M), Oct 1-18 0.69B. Sum of the 147 fetched days: 6.04B (DeFi Rate: 6.2B since 2026-05-21, M). Q2 2026 (May 21 to Jun 30) is about 2.09B contracts, so the "3.5B contracts in Q2" in the Crypto Briefing piece (https://cryptobriefing.com/rothera-powers-robinhood-prediction-market/, 2026-08-20, credited "via marketbeat.com", no data source named) does not match Rothera's own files (L).
- Peak day 2026-07-07: 180,113,147 contracts (World Cup). Last 7 days (2026-10-12 to 10-18): 273.7M contracts. Weekday or Saturday troughs: 7-20M.
- **Open interest 2026-10-18:** 98.26M contracts (sum over symbols, an upper bound on face value at risk). Largest families: NFL futures 24.4M, NCAAF futures 9.7M, Senate races 9.0M, NFL games 5.9M, House control 4.6M, governors 3.7M, Fed decisions 3.3M, NBA futures 3.3M, 2028 president 2.6M. Peak summed OI was 133.4M on 2026-06-25.
- Rothera self-report (2026-08-04): 3.44B contracts across the World Cup, 2,902 contracts listed, "about 7-8% of total market share among CFTC-regulated venues", "roughly 30% average share relative to the largest market in the specific contracts Rothera listed" (https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera, H as a venue claim).
- Robinhood-wide (all exchanges, H): 13.6B contracts in Q2 2026; more than 5B during the World Cup; more than 30B in 2026 through August (https://robinhood.com/newsroom/robinhood-cryptocom/).
- Not found: Rothera TVL (not applicable), order-book depth, bid-ask spreads (no public book).

**Category overlap (where arbitrage can exist):**

| Rothera family (live 2026-10-18) | Overlap |
|---|---|
| NFL game / spread / total ladders, NHL, MLB, NBA futures, NCAAF futures, soccer (EPL, UCL), tennis, golf | Kalshi, Polymarket (sports is the bulk of volume) |
| US politics: House/Senate/Congress control, Senate and governor races, 2028 president and nominee | Kalshi, Polymarket |
| Macro: Fed decisions (`ECUSFED`), Core PCE, weekly jobless claims | Kalshi (Fed, PCE, claims), Polymarket |
| Corporate: Tesla Q3 2026 EPS (Notice 26-112) | Kalshi earnings markets; Robinhood's earnings contracts are Cboe-listed (H, 2026-09-29 post) |
| Crypto price | none live: no BTC/ETH symbols in the 2026-10-18 file (H); venue page says crypto is "Coming Soon" |

**Shared liquidity:**
- **Rothera's book is its own (H).** Rothera does not share a book with Kalshi, ForecastEx or Crypto.com's CDNA. Rothera's DCO may in future clear trades from third-party venues (Non-FCM agreement s.18, H); no instance found.
- **Robinhood is distribution, not a second pool (H).** Robinhood is the only listed clearing member and routes flow into Rothera. On the public midterms hub page, each of 487 events maps to exactly one exchange: 123 Rothera, 364 Kalshi, none split (H, one page, 2026-10-19). Chamber control, Senate and governor races are Rothera; House-district races and redistricting are Kalshi. So a Robinhood price for an event is that single exchange's price.
- **Implication:** model Rothera as an independent venue for sports, politics and macro, and model Robinhood as a distribution channel with no price of its own. Cross-venue edge is Rothera vs Kalshi / Polymarket for the same event. Retail flow into Rothera is mostly Robinhood's (M, inferred: the only visible FCM), so Rothera prices may track Robinhood-customer sentiment more than professional flow. Susquehanna is a JV owner; its market-making role on Rothera is NOT FOUND ("in-house market maker" question: the 2026-08-04 post does not say).

---

## 11. Suspicious / untrusted content

- No text addressed to AI agents was found on rothera.io, Robinhood newsroom or support pages, the public files host, or in the PDFs read.
- Legacy hosts `docs.ledgerx.com` and `docs.miaxdx.com` are reported by a sibling repo note as a hijacked docs page ("Takeover By ..."); I did not visit them. Do not use legacy LedgerX/MIAXdx doc links (M).
- Robinhood's hub pages are large embedded JSON blobs; I parsed them as data only.

---

## 12. Fixtures and adapter sketch

`docs/research/fixtures/rothera-robinhood-exchange/`:
- `mkt_eod_20261018.sample.csv` - 60 real rows (top symbols by volume in 16 families) from the real 2026-10-18 file (full file 845,940 bytes, 7,094 rows).
- `trades_eod_20261018.sample.csv` - first 100 trades of the real tape (full tape 184,790 rows, 2.3 MB gz).
- `publicfiles_index_excerpt.txt` - excerpt and counts from the directory index plus response-header facts.
- `derived_daily_totals_from_mkt_eod.csv` - MY computation (not an API response): per-day sums of volume, OI and trades; 4 days blank (HTTP 429).
- `robinhood_hub_page_eventContracts_excerpt.json` - two contract objects (one Rothera, one Kalshi) from a public Robinhood hub page. Unofficial; shows the symbol and exchange fields.

**Adapter sketch (signal-only):** once a day after about 21:30 UTC (22:30 UTC after 2026-11-01), GET the index, then only the newest `mkt_eod` and `trades_eod` files (spacing of seconds, fail on empty body or 429). Parse `symbol` with the grammar in section 2, join to Kalshi/Polymarket markets via the linking layer, store `settlement_price`, `close`, `volume`, `oi` per symbol per day, and use the tape for lead-lag and calibration. Do not present these as executable quotes. If real-time data is ever needed, the route is a Rothera FIX participant or an institutional vendor, not an agent.

---

## 13. Open questions

1. FIX spec, rate limits and any delayed or real-time public feed: gated at `docs.rothera.io` and the contact form.
2. Licence for the public EOD files (redistribution, commercial use): none stated.
3. Why Rothera settled NYG vs WAS at $0.50, and how often Rule 7.2 ad hoc settlements occur.
4. Whether any FCM besides Robinhood is live, offers an API, or accepts crypto funding.
5. Whether the fee k values changed after 2026-05-20.
6. How Robinhood decides which exchange gets an event (Robinhood says routing considers liquidity; the support pages do not say how).
7. Whether Robinhood's Trading MCP will add event contracts (stated as "coming soon" 2026-05-27, not listed 2026-10-19).
8. DCM rulebook details (Rules 4.4, 7.2, 10.2, 10.7) were taken from the T&C and participant agreement; the 1.4 MB rulebook PDF could not be text-extracted here.
9. Web search was exhausted after one query, so independent news (CNBC, The Information) was not read; the 2026-08-19 CFTC public-interest proposal was not read.

---

## Sources

- https://www.rothera.io/ , /venue , /solutions , /faq , /company , /legal , /regulatory-notices , /volume-and-open-interest , /news-and-insights - H (fetched 2026-10-19; page-summary wording)
- https://www.rothera.io/post/performance-under-pressure-what-the-world-cup-proved-for-rothera - H (venue self-report, 2026-08-04)
- https://publicfiles.rotheramarkets.com/ , `clearing/outbound/mkt_eod_*.csv` (147 of 151 fetched), `exchange/outbound/trade_data/trades_eod_20261018.csv.gz`, `contract_terms/NFLGame-T&C.pdf` - H (unauthenticated GETs; HTTP 429 observed)
- Rothera Fee Schedule 2026-05-20 (PDF, link in section 7) - H
- Rothera Non-FCM Participant Agreement v052126 (https://cdn.prod.website-files.com/6a99b37483d294062ea71053/6a99b37483d294062ea71196_Rothera%20Non-FCM%20Participant%20Agreement%20(v052126).pdf) - H (read directly)
- Rothera Notice 26-101 (https://cdn.prod.website-files.com/6a99b37483d294062ea71050/6acd0c6c2ea9f0a879ecf7e6_Notice%2026-101.docx%20(1).pdf) - H (read directly)
- https://docs.rothera.io/ - H (password gate)
- https://robinhood.com/newsroom/robinhood-cryptocom/ (2026-09-08), https://robinhood.com/us/en/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ (2026-06-04), https://robinhood.com/us/en/newsroom/robinhood-is-now-open-to-agents/ (2026-05-27), https://robinhood.com/us/en/newsroom/hood-summit-2026/ (2026-09-29), https://robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/ (2026-07-01), https://robinhood.com/newsroom/robinhood-presents-yes-no-event/ (2025-12-16) - H
- https://robinhood.com/us/en/support/articles/event-contracts-overview/ , `.../trading-event-contracts/` , `.../agentic-trading-overview/` , `.../onboarding-an-external-agent/` , https://robinhood.com/us/en/agents/ - H (page-summary wording)
- https://robinhood.com/us/en/prediction-markets/ , `/prediction-markets/midterms/` , https://robinhood.com/us/en/sitemap-prediction-markets.xml , https://docs.robinhood.com/sitemap.xml - H for what they serve
- https://defirate.com/prediction-markets/volume/rothera/ - M (third-party aggregation of Rothera's public reports)
- https://cryptobriefing.com/rothera-powers-robinhood-prediction-market/ - L (single outlet, "via marketbeat.com", conflicts with first-party files)
- https://www.theblock.co/data/decentralized-finance/prediction-markets/rothera-monthly-trades - L (single unlabeled value 1,653,594, no month or unit; not reconciled)
- Sibling repo notes (`docs/research/venues/rothera-exchange-and-clearing*.md`, `robinhood-prediction-markets*.md`) - used only as leads; every H claim above was re-read or recomputed this session, except the items marked M in sections 8 and 11.
