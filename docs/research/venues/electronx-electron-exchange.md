# ElectronX (Electron Exchange, "EXI") - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of electronx.com pages and of the public document CDN (cdn.sanity.io) that the site links to, plus WebFetch. No account, sign-up, wallet, key, signature, POST/PUT/DELETE or PayBox call was used. All third-party/site text was treated as untrusted data; nothing in it was followed. Scripted requests used the User-Agent `insurance-markets-research/0.1` only. Note: the shared WebSearch budget was exhausted when I tried to search, so there is **no independent (non-ElectronX) source** behind anything below; every H tag means "read first-hand on ElectronX's own site or documents" and the claims are the venue's self-reports.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred, or my own computation from H data; **L** = weak/stale.

---

## 0. Bottom line

1. **Live and real, but it is not a prediction market.** It is a CFTC-designated exchange (DCM) plus clearinghouse (DCO) for **hourly cash-settled US power-price contracts** (bounded futures and "binary options") on seven ISOs. Volume is growing (July 2026: >37,000 contracts, H) but binary options, the only prediction-market-like product, trade ~77 contracts per weekday (H data, M computation).
2. **PayBox cannot reach it.** Funding is a USD wire to a Bank of Montreal omnibus account after KYC/KYB; there is no on-chain leg, no token, no EVM/Solana path (H).
3. **Official API exists but is authenticated and onboarding-gated**: FIX 5.0 SP2 over FIXT.1.1 (order entry, market data to 25 levels, drop copy) plus a web UI and CSV bulk upload. Public data is limited to **end-of-day CSV reports** (H, fixtures saved).
4. **No overlap with the prediction venues in scope** (nobody else lists hourly ERCOT/PJM/MISO/CAISO/SPP/NYISO/ISO-NE price contracts that I know of; the only other energy venue in these notes, Inframarkets, is unconfirmed live). So no arbitrage leg.
5. **adapter_priority = skip.** Revisit only if (a) an energy/power-price prediction market on a PayBox-reachable chain goes live and (b) someone wants ElectronX's public end-of-day prices as calibration data.

---

## 1. Is it still live? (2026) - yes

| Evidence | Tag |
|---|---|
| `https://www.electronx.com/` HTTP 200 on 2026-10-19; title "ElectronX \| Precision Trading for Power Volatility"; "Now Trading: ERCOT, PJM, MISO, CAISO, SPP, NYISO, and ISO-NE contract suites" (/products) | H |
| Daily Market Data Report CSVs published for every calendar day, newest listed **2026-10-17** (/regulatory, 33 files 2026-09-15..2026-10-17) | H |
| FIX Specification v.20261015.1 dated 15 Oct 2026; Execution Fees "Effective 10.1.2026"; new $5,000 minimum deposit "Effective Oct. 1, 2026" (/account-resources, /faq) | H |
| CFTC designation as DCM and DCO announced 2025-08-29 (press release); ERCOT live Feb 2026, PJM 2026-04-06, MISO+CAISO 2026-06-01, SPP+NYISO+ISO-NE 2026-08-24 | H |
| CFTC amended order of designation 2026-08-10 allowing intermediated access via FCMs, "will commence this fall" (not confirmed started) | H |

---

## 2. Kind and market model

- **Kind:** regulated-exchange (DCM + DCO, Chicago). Central limit order book, price-time priority (FIFO), anonymous (Rulebook 5.5; /faq). **Fully collateralized**: each participant posts the full maximum loss before an order becomes match-eligible; no leverage, no variation margin (/faq, /products). (H)
- **Contract unit:** 1 MWh, hourly, per hub/zone/interface. 120 contracts listed per instrument (next 5 days x 24 hours). Trading Mon-Fri 07:00-20:00 CT; closed on exchange holidays. (H, /products)
- **Instruments (H, /clearing counts):** ERCOT 28, PJM 28, MISO 16, CAISO 8, SPP 12, NYISO 16, ISO-NE 4 = **112 instruments** across 4 products (3 bounded-futures ranges + 1 binary option).
- **Bounded Futures** (`BFUT<upper>-<ISO>-<hub>-<yymmdd>-<HE>`): pays the hourly average real-time price clipped to [floor, ceiling]. ERCOT ranges: Standard $0-$100, Moderate $0-$500, Extended -$250 to $5,000. Tick $0.25/MWh (ERCOT spec). (H)
- **Binary Options** (`BOPT-<ISO>-<hub>-<yymmdd>-<HE>`): settle **$100 if the hourly average real-time price is >= the strike, else $0**; strike = the previous day's day-ahead price for the same hub/hour (ERCOT spec: "equal to or greater"). Quoted $0-$100, tick $0.25 in ERCOT; observed trade prices in the CSV fixture are multiples of $0.25 (e.g. 43.50, 77.00). The price/100 is therefore the market's probability that real time clears day-ahead. (H; strike/DA mechanics per ISO on /products)
- **No** categorical or scalar-outcome prediction markets, no tokenised outcomes; positions are rows in the clearinghouse. Block trades not permitted (Rulebook 5.11). (H)
- Symbol quirk: DST fall-back repeats 02:00 as hour code `X2`; spring-forward has no `03`. (H, FIX spec)

---

## 3. Chains and collateral

- **No blockchain.** Collateral is **USD cash** at the clearinghouse. Inbound: wire to ElectronX's Bank of Montreal omnibus account; outbound: request via ops, standard 2 days, same-day if requested before 13:00 CT; wire fee $25. (H, /clearing, Clearing Fees PDF)
- Interest pass-through program on balances (avg daily balance must exceed $1,000,000; rate = Fed Funds target lower bound minus 125 bp). (H, program PDF dated Jan 30, 2026)
- Stablecoin/crypto: Rulebook has zero mentions of stablecoin/USDC/crypto (searched the extracted text). (H)

---

## 4. Read API

- **Official programmatic API = FIX** (FIXT.1.1 session, FIX 5.0 SP2 application layer). Spec PDF `ElectronX FIX Specification v.20261015.1.pdf` is public (URL in `fixtures/electronx-electron-exchange/official-documents-index.json`); the companion "FIX Reference Guide" (network connectivity, QuickFIX configs, data dictionary) is **not public** (NOT FOUND on /account-resources). (H)
- **Market data over FIX:** `MarketDataRequest [V]` snapshot or snapshot+updates, depth 0 (full) or up to **25 levels**, entry types Bid/Offer/Trade/Open/Close/Settlement/High/Low/Trade Volume/Open Interest; `SecurityListRequest [x]` lists instruments with tick (969) and lot (562); `SecurityDefinitionUpdateReport [BP]` announces new listings; Drop Copy sessions for execution reports. Book is returned per order, not aggregated. (H)
- **Auth:** session credentials issued at onboarding (SenderCompID; optional Password 554; Logon must NOT carry SenderSubID). Onboarding = KYC/KYB, then access to a **Beta environment** (also usable to test API integrations), then funding, then production. (H, FIX spec, /faq)
- **Rate limits:** exist (excess messages get `BusinessMessageReject` "Message rate limit throttled", cancels included) but the numeric limit is NOT FOUND (searched: FIX spec "Rate Limiting" section, /account-resources). Also Mass Quote Protection (per-account rolling-window execution cap, configured by Market Ops). (H)
- **Session schedule:** weekly sequence reset Sunday 06:15 UTC. Cancel-on-disconnect and cancel-on-logout are documented. (H)
- **REST/WebSocket/subgraph:** NOT FOUND (searched: /account-resources, /faq, /products, sitemap, FIX spec). Press says "API-first platform", FAQ says "direct API"; the only documented one is FIX (+ CSV order upload, max 200 rows/file, 1 MB). (H)
- **Public unauthenticated data (the only thing an adapter could poll without onboarding):** the "Daily Market Data Report" CSVs, one per calendar day, listed on https://www.electronx.com/regulatory and hosted on `cdn.sanity.io/files/bpyvas7v/production/<hash>.csv`. The URLs are content hashes, so they are discoverable only by parsing the /regulatory page payload (Next.js/Sanity); there is no stable "latest" URL and no documented API for it. Columns: `business_date, contract, product, instrument, rto_iso_date, hour_ending, expiration_utc, open_interest, total_trading_volume, trade_session_low_price, trade_session_high_price, reference_price` (`-` when no trade; `reference_price` is the settlement price, 0 or 100 for binaries). End-of-day only, newest file lags ~1-2 days. (H, fixtures)
  - Rulebook 5.9 obliges ElectronX to post pricing, volume and open interest for all active contracts each trading day, which is what these files are. (H)
- Resolution data (the settlement inputs) are the ISOs' own public feeds (ERCOT real-time SPP, PJM dataminer2, MISO, CAISO OASIS, SPP portal, NYISO OASIS, ISO-NE) listed on /products. (H)

Fixtures (`docs/research/fixtures/electronx-electron-exchange/`):
- `daily-market-data-2026-10-16.csv` (Friday report, 22.7 KB, 166 contract rows) and `daily-market-data-2026-10-17-saturday.csv` (7.2 KB, shows volume 0 and open interest carried on weekends).
- `derived-liquidity-summary.json` - my per-day aggregation of all 33 CSVs (derived, not an exchange figure).
- `official-documents-index.json` - titles, dates and CDN URLs of the rulebook, fee schedules, FIX specs, programs, missive.

---

## 5. Trade path (programmatic)

- **Possible only as an onboarded Participant** (or a Delegated Participant acting for one): FIX 5.0 SP2 `NewOrderSingle [D]`, `OrderCancelReplaceRequest [G]`, cancel, `OrderMassCancelRequest [q]` (4 flavours), execution reports, trade busts and Trade Capture Reports. All orders are LIMIT; TIF Day, GTC, IOC, FOK, GTD (FAQ lists Limit and Market-Limit; FIX spec says "all orders are LIMIT orders" with a documented market-equivalent). Quantity must be an integer lot; ClOrdID must be unique; `CustOrderCapacity (582)` is required. (H)
- **No signing scheme beyond FIX session credentials**; no wallet signatures, no transaction proposals. The audit-trail rules require a Manual Order Indicator on orders (Rulebook 3.6(k), FIX tag 1028 appears on execution reports), so automated order flow is expected and identified. (H)
- Intermediated route: FCM access approved 2026-08-10, "commence this fall"; per Rulebook Appendix A, **FCM Customers may trade Bounded Futures only, not Binary Options** (FCM proprietary accounts and direct Participants can trade both). (H)

---

## 6. Reachable through PayBox? - no

PayBox is a non-custodial wallet for EVM/Solana. ElectronX settles only in USD held at the clearinghouse, funded by bank wire after KYC/KYB, with account, user and clearing-member agreements. There is no transaction a PayBox wallet can propose or sign that funds or trades it. (H for the funding rail; M for the conclusion about PayBox.)

---

## 7. Fees

| Item | Value | Tag |
|---|---|---|
| Execution fee (per contract, effective 2026-10-01) | Tier 1 (0-249 lifetime contracts) $0.25; Tier 2 (250-999) $0.20; Tier 3 (1000+ lifetime contracts OR >= $25k lifetime deposits) $0.15. Tiers only ever improve. Fee schedule does not say maker vs taker; read as charged to each side. | H (maker/taker side M) |
| Clearing fee | $0.05 per lot | H |
| Settlement fee (open position at expiry) | $0.05 per lot | H |
| Wire fee | $25 (outbound/inbound per schedule) | H |
| Minimum initial funding | $5,000 (waivable by ElectronX) | H |
| Collected | Daily by the DCO from Clearing Members; rebates paid monthly by the 15th | H |
| Liquidity/market-maker programs | Founder LP, Core LP, Market Maker (July 2026), Size Liquidity, Advanced and Precision Liquidity programs reduce fees or pay rebates | H (titles), terms not summarised |

Round-trip cost on a binary (max payout $100): about $0.20 to $0.30 per side all-in at Tier 1 ($0.25 execution + $0.05 clearing; plus $0.05 settlement if held), i.e. ~0.2-0.3% of the $100 notional per side. (M, my arithmetic.)

---

## 8. Resolution and dispute risk

- **Resolution:** objective, ISO-published prices; no discretionary oracle. ERCOT, SPP, NYISO, ISO-NE: first published value is final. PJM: verified hourly LMP published T+1 (11:00-12:00 ET), so PJM contracts expire at the hour but settle next day. MISO: Preliminary Ex-Post LMP T+1 by 08:00 EST. CAISO: average of four FMM LMPs. (H, /products and ERCOT specs)
- **Missing ISO data:** the Clearinghouse "may substitute pricing that, in the Clearinghouse's judgment, is reasonably comparable" (Rulebook 6.3(d)). That is a discretion risk. (H)
- **Errors/busts:** error review within 10 minutes of confirmation; the Exchange decides in its "sole discretion" whether to cancel trades or pay a monetary adjustment (Rule 5.7); the FIX spec documents Trade Busts. Arbitration chapter exists (Rulebook ch. 9). (H)
- Settlement timing: ERCOT is near-immediate after the hour; PJM/MISO next business morning. Capital is locked until then. (H)

---

## 9. Geo, ToS, automation

- **Who may trade:** institutions and individuals meeting membership and onboarding requirements (/faq). Participants "must be U.S. residents or residents of specific foreign jurisdictions" per the Non-US Jurisdictions Missive (effective 2025-12-02): **Bermuda, Cayman Islands, Israel (Qualified Investors only)** (H). Natural persons: 18+, no statutory disqualification (Rule 3.1(c)). Participants must also be Clearing Members.
- **Automation:** API trading is the intended mode (FIX, CSV upload, drop copy; ISV access program exists, Rule 3.10). Conduct rules prohibit fraud, manipulation, wash and disruptive trading (Rule 7.1). An autonomous agent would need to be a Participant or a Delegated Participant (which must hold any registration the CEA requires for placing orders on behalf of others, Rule 3.1(d)(iv)). (H)
- **Site ToS** (last updated Jan 31, 2025) is a generic website agreement with no scraping/automation clause. **robots.txt** (Cloudflare-managed) sets `Content-Signal: search=yes, ai-train=no, use=reference` and disallows ClaudeBot, GPTBot, CCBot and others site-wide. Polling the /regulatory page for CSV links from an automated adapter would sit against that signal; ask ElectronX for a Market Data account instead (they offer "Market Data access subject to onboarding requirements"). (H)

---

## 10. Liquidity (source and date)

All numbers from the 33 public daily CSVs, business dates 2026-09-15..2026-10-17, my aggregation (M for the aggregation, H for the inputs). One contract = 1 MWh.

| Metric | Value |
|---|---|
| Bounded futures, average weekday volume (24 weekdays) | ~4,030 contracts |
| Binary options, average weekday volume | ~77 contracts (range 5-249; 5 on 2026-10-16) |
| Bounded futures, avg weekday open interest | ~1,870 contracts; concentrated in MISO/PJM (~1,340-1,510 each on 10-15/10-16) |
| Binary options, avg weekday open interest | ~23 contracts |
| Rough traded notional per weekday | ~$237k (volume x mid of session low/high; **L** proxy) |
| Self-reported | July 2026 >37,000 contracts (37 GWh), record month; record single day 1,839 contracts on 2026-05-27; ~50 early members as of 2026-04-06 (press releases, H as reports of a claim) |

Binary books are essentially quote-clusters: on 2026-10-15 the 9 ERCOT binary contracts with volume traded exactly 5 lots each at one price, i.e. a market maker being hit, not a continuous two-sided market. (M)

---

## 11. Event-category overlap (where arbitrage could exist)

- Power-price contracts overlap with **no** Polymarket/Kalshi/Limitless-type venue that I am aware of; NOT FOUND (searched: only the repo's own venue notes, because the web search budget was exhausted; `docs/research/venues/inframarkets.md` also found "none elsewhere").
- Only conceivable cross-venue relationships: (a) Inframarkets-style on-chain ERCOT/PJM threshold markets, if they ever trade (not confirmed live in its own note); (b) weather/temperature markets as a loose driver of hourly price spikes (not an arbitrage).
- **Does not share liquidity with another venue** (own order book and clearinghouse), but there is no counterpart venue to arbitrage against either. (H)

---

## 12. Open questions

- Real-time market-data terms and cost for an onboarded Participant, and whether a Market Data account is granted without trading.
- Position limits and accountability levels (Position Limits PDF dated 2026-08-20 was downloaded but my text extraction failed; not read).
- Whether FCM-intermediated trading has actually launched (promised "this fall" 2026).
- The exact numeric FIX rate limit and the Participant agreement's automation/ISV clauses (Participant & Clearing Member Agreement PDF text extraction failed; not read).
- Per-ISO tick sizes beyond ERCOT (only the ERCOT specs were read in full; others are served via `SecurityList` 969).

---

## Sources

All fetched 2026-10-19.

- https://www.electronx.com/ (home), /products, /regulatory, /clearing, /account-resources, /faq, /terms, /company, /robots.txt, /sitemap.xml (H)
- Press releases (PRNewswire text on the site): `/news-insights-collections/energy-exchange-electronx-earns-cftc-designated-market-and-clearing-approvals` (2025-08-29), `.../electronx-launches-miso-and-caiso-contract-suites-for-intraday-power-hedging` (2026-06-01), `.../electronx-receives-cftc-approval-for-intermediated-market-access` (2026-08-10), `.../electronx-launches-hourly-futures-contracts-for-spp-nyiso-and-iso-ne` (2026-08-24), `.../energy-exchange-electronx-launches-intraday-power-contracts-for-the-pjm-interconnection-market` (2026-04-06) (H)
- ERCOT Binary Options and Bounded Futures product specifications, ElectronX Rulebook (Aug 2026, sections 3.1, 3.5, 5.3, 5.5, 5.7, 5.9, 5.11, 6.3, 7.1, Appendix A), Non-US Jurisdictions Missive (2025-12-02), Execution Fees (eff. 2026-10-01), Clearing Fees, Interest Pass-Through Program, Market Maker Program (July 2026), CSV Order Upload File Rules, FIX Specification v.20261015.1: PDFs on `cdn.sanity.io/files/bpyvas7v/production/` (links in `docs/research/fixtures/electronx-electron-exchange/official-documents-index.json`) (H). PDFs were read via a small local text extractor; two PDFs (Position Limits, Participant & Clearing Member Agreement) did not extract and are unread.
- Daily Market Data Report CSVs 2026-09-15..2026-10-17 (same CDN; listed on /regulatory) (H)
- Local repo note `docs/research/venues/inframarkets.md` (researched same day, M) for the energy-overlap statement.
- No independent third-party sources: web search quota was exhausted.
