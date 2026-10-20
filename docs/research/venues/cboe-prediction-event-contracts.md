# Cboe prediction / event contracts ("Cboe Predicts") - venue spec for the cross-venue aggregator

Researched 2026-10-19 (fetches ran around 03:20 to 03:35 UTC, Sunday evening US time, so US markets were closed). READ-ONLY: Cboe web pages and PDFs read with WebFetch (a small-model summary, so quotes are as returned by that tool) plus local stdlib text extraction of three public cdn.cboe.com PDFs (contract spec, FAQ, fee schedule; extraction is lossy and I say where it was), and 4 unauthenticated GETs/HEADs to Cboe's public delayed-quote CDN with the generic User-Agent `insurance-markets-research/0.1`. No account, key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No PayBox tool was called. The shared WebSearch budget was already used up when I started, so I could not search for news; everything below comes from fetched primary pages. All third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summary of a secondary page, or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" means no source found; nothing is guessed.

Overlap note: `docs/research/venues/cboe-predicts-cboe-exchange-sec-regulated-binary-options-on-xsp.md` (another worker, same day) covers the same product under a different discovery name. I re-verified its key facts independently and my numbers agree. The two tracker entries ("Cboe prediction/event contracts" and "Cboe Predicts ... binary options on XSP") are ONE venue and should be deduplicated into one adapter.

Fixtures: `docs/research/fixtures/cboe-prediction-event-contracts/` (section 4).

---

## 0. Verdict

**adapter_priority = P2 (signal-only / thin). Confidence: high on the classification, medium on the numbers.**

1. **Live, regulated, but narrow.** Cboe Predicts launched 2026-06-23 with one underlying (Mini-S&P 500 "XSP", 1/10 of SPX), daily 0DTE/1DTE cash-settled European binary options (H, section 1). Strikes in a 80%-110% band around the prior close.
2. **It is an SEC securities option, not a CFTC event contract and not a crypto market.** Listed on Cboe Options Exchange, cleared at OCC, traded through broker-dealer accounts (Interactive Brokers, Charles Schwab). USD collateral at a broker. No chain, no token, no wallet.
3. **PayBox cannot trade it** (section 6). It can only be a read-only signal and reference leg.
4. **No official public API.** An undocumented public JSON on `cdn-api.cboe.com` returns 15-minute-delayed top-of-book quotes for the binaries (H, tested). Real-time data is a licensed Cboe product. The binaries JSON has not updated since 2026-10-14 17:28 UTC (H, section 1), so treat it as unreliable.
5. **Thin.** The only measurable sample: 83 contracts volume and 23 open interest across 244 series mid-session on 2026-10-14 (H, computed from fixture). Compare: Cboe reports XSP vanilla options at records of 274 thousand contracts monthly ADV, so the binaries are a rounding error so far.
6. **Independent of crypto and prediction venues, but not an independent probability source**: Cboe market makers hedge the binaries with XSP/SPX vanilla options (M, inference). The value to Quotient is a regulated, market-made probability curve for "where does the S&P 500 close today/tomorrow" to benchmark Kalshi / Polymarket / ForecastEx index markets.
7. **Watch list that could raise priority** (section 12): KPI binary options (SR-CBOE-2026-061, still pending on Cboe's own page), flexible-payout contracts, any documented market-data API or cheap licensed feed, volume growth.

---

## 1. Is it still live? (2026)

Yes, with one data-pipeline caveat.

| Evidence | Date | Tag |
|---|---|---|
| Cboe product page `https://www.cboe.com/markets/prediction-markets`: S&P 500 prediction markets on XSP; Yes/No and Long Call/Put strategies; only Interactive Brokers is named, via a "Get Started" link; "Trade through Cboe's trusted, regulated broker-dealer partners." No launch date, regulator or region text on the page. | read 2026-10-19 | H |
| Launch press release "Cboe Introduces Cboe Predicts, Launching First Products in New Prediction Markets Suite": XSPBW and XSPBX binaries on the Mini-S&P 500 Index; IBKR "available now", Charles Schwab "in the coming months", other retail platforms "over time"; "centrally cleared through the Options Clearing Corporation (OCC)"; "will trade within the same regulatory framework as U.S.-listed options". https://ir.cboe.com/news/news-details/2026/Cboe-Introduces-Cboe-Predicts-Launching-First-Products-in-New-Prediction-Markets-Suite/default.aspx | 2026-06-23 | H |
| Cboe "Find a Broker": "Interactive Brokers LLC - XSP Binary Options - APAC, North America, EMEA"; "Charles Schwab & Co., Inc. - XSP Binary Options - North America"; "Product availability may vary by region. Check with the broker for details." https://www.cboe.com/tradable_products/find_a_broker/ | read 2026-10-19 | H |
| Cboe Q2 2026 results release: CEO Craig Donohue lists "expanding event contracts" among priorities (no figures). Cboe Predicts appears in the release only in the trademarks section. https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Results-for-Second-Quarter-2026/default.aspx | 2026-07-31 | H |
| Cboe fee schedule "Fees Schedule - October 1, 2026" contains "Rate Table - Binary Options" and "Index Binaries" rows (text extracted locally). https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf | 2026-10-01 | H |
| goodmoneyguide.com UK prediction-markets guide (page dated 16 Oct 2026): Cboe "currently offers simple yes-or-no contracts based on the S&P 500", is "preparing company-specific prediction contracts based on earnings and other KPIs" and said these were "expected to launch imminently"; also "these prediction products cannot currently be marketed or sold to UK retail traders". https://goodmoneyguide.com/trading/uk-prediction-markets/ | 2026-10-16 | M (secondary; this is the discovery hint, now confirmed as written) |
| Real trades in the quote feed: e.g. `XSPBW261014C00772000` last trade 0.58 at 2026-10-14T13:10:25 ET (fixture). | 2026-10-14 | H |

**Caveat (reproduced independently):** `https://cdn-api.cboe.com/api/global/delayed_quotes/options/_XSPBX.json` has `last-modified: Wed, 14 Oct 2026 17:28:31 GMT` and an inner `timestamp` of `2026-10-14 17:28:28`. At 03:23 UTC on 2026-10-19 it was 4.4 days old, spanning two full trading days (Thu 15 and Fri 16 Oct). The sibling file `_XSP.json` was `last-modified: Sat, 17 Oct 2026 00:04:54 GMT` with index last trade 2026-10-16T16:14:59 ET (H, fixture). So either the binaries pipeline stalled or the product was paused after 14 Oct. Cannot be resolved from public sources (see open questions). `still_live = true` for the product based on the Oct 19 broker page and product page, with this caveat.

The venue is about 4 months old at this date, so no staleness problem in the sources except Cboe's website Terms (dated 2022-11-16, L).

---

## 2. Kind and market model

- **Kind (H):** regulated securities exchange (Cboe Options Exchange), SEC-regulated "security options", centrally cleared at OCC, distributed through broker-dealers. Cboe Predicts site: a contract based directly on a securities index is "a security option, not a swap"; the CFTC "oversees some similar index-referencing contracts offered as swaps on designated contract markets" (that is the Kalshi / CME style, which Cboe is NOT using for these products). https://cboepredicts.cboe.com/
- **Instruments (H for the spec lines I could extract, M where noted):**
  - Two option classes on the same underlying: **XSPBW** (PM-settled, expires 3:00 pm CT on expiration day; these are the only series seen in live data) and **XSPBX** (AM-settled via settlement-value symbol XSR; also the name of the product family and of the underlying binary index). Underlying "Mini S&P 500 Binary (XSPBX) Index" is equivalent to XSP, 1/10th of SPX.
  - European-style cash binary: call pays $100 if the settlement value is at or above the strike, put pays $100 if below. Multiplier $100. Quote in decimals, one point = $100, minimum increment 0.01 ($1.00). Strike interval "no less than $0.50". Expirations: Cboe may list 1 day up to 36 months out. (Spec PDF, local text extraction.)
  - At launch only 0DTE and 1DTE are listed; strikes spanning 80% to 110% of the XSPBX closing level in $1 increments, added as the market moves (FAQ PDF). Live data: 61 strikes per expiry (630 to 850) with half-point strikes near the money, 2 expiries (261014, 261015), 122 series each (calls and puts), 244 total.
- **"Yes" and "No" are separate instruments**, not two sides of one book: Yes = binary call at strike K, No = binary put at strike K (Cboe page examples: Yes at $0.40 pays $100 if XSP finishes above 740; No at $0.60 for below 740). Observed 2026-10-14: strike 772 call 0.52/0.56, put 0.44/0.48 (H, fixture). Call bid + put ask and call ask + put bid bracket 1.00 as expected.
- **Order book:** central limit order book on Cboe Options Exchange; market-maker plus customer orders. No Lead Market-Maker program at launch and no FLEX (FAQ headings; answers extracted, M-H). Regular hours 8:30 a.m. to 3:15 p.m. CT Mon-Fri; binaries on XSP are not in Global/Curb hours at launch (FAQ table row visible, details scrambled in extraction, M).
- **Tokenisation: none.** Positions are OCC-cleared options positions in a broker account; no outcome token, AMM, or parimutuel pool.
- **Not live yet:** "flexible payout option that delivers three potential payout outcomes" (cboepredicts.cboe.com, no date; H for the statement); Quoted XSP vertical spreads via Quoted Spread Book (pipeline hub still labels both "Pre-launch Resource Hub", H); binary options on key performance indicators (SR-CBOE-2026-061, section 8).
- **Cboe also has digital futures on CFE** (moved to Cboe Futures Exchange in Q2 2025 per the Q2 2026 release, H); these are crypto futures, not event contracts. No CFE event-contract product found: NOT FOUND (searched: cboe.com prediction-markets page, press release, Q2 2026 release, pipeline hub; the CFE product-spec URL I guessed returned 404).

---

## 3. Chains and collateral

- **Chains: none.** (H: no chain or token appears on any Cboe Predicts page, release, spec or fee table.)
- **Collateral:** US dollars in a broker account. Spec margin rules (M, from the sibling note's read of the spec; my extraction of that section was unreadable): buyers pay 100% of premium; writers deposit and maintain 100% of the $100 exercise amount. Cash settlement the next business day. Position limit 1,500,000 contracts per expiration (the XSPBX FAQ has a position-limit entry; the figure is M).
- Clearing: OCC (H).

---

## 4. Read API

**Official public API: NONE FOUND** (searched: cboe.com prediction-markets page, cboepredicts.cboe.com ("No API, SDK, or developer resources are mentioned"), pipeline hub ("The page makes no statement about APIs"), press release). `read_api.exists = unofficial-only` for free data; real-time exists only as a paid licensed feed.

### 4a. Delayed-quote JSON (public, undocumented, tested) - H that it works, M on stability and terms

- Pattern: `GET https://cdn-api.cboe.com/api/global/delayed_quotes/options/{UNDERLYING}.json`, underscore prefix for index underlyings.
  - Binaries: `.../options/_XSPBX.json` returned HTTP 200, `application/json`, 103,488 bytes, Cloudflare/CloudFront cache (`cache-control: max-age=0, s-maxage=5, stale-while-revalidate=5`), no auth, no rate-limit headers.
  - Regular XSP: `.../options/_XSP.json` HTTP 200, 7,245,778 bytes, 16,522 series, root `XSP` only (it does NOT contain the XSPBW series).
  - `.../options/_XSPBW.json` returned HTTP 403 (111 bytes). So the binaries live under the `_XSPBX` underlying key even though series roots are `XSPBW`.
- Shape (`_XSPBX.json`): `{timestamp, symbol, data:{symbol:"^XSPBX", security_type:"index", current_price, price_change, open, high, low, close, prev_day_close, iv30, seqno, last_trade_time, tick, options:[...]}}`. Each option row: `option` (root + yymmdd + C/P + strike x1000, e.g. `XSPBW261014C00772000`), `bid`, `bid_size`, `ask`, `ask_size`, `iv`, `open_interest`, `volume`, `delta`, `gamma`, `vega`, `theta`, `rho`, `theo`, `change`, `open`, `high`, `low`, `tick`, `last_trade_price`, `last_trade_time` (US Eastern, naive), `percent_change`, `prev_day_close`. Prices are dollars per $1.00 of payout (0.55 = $55 per $100 contract). No `put_call` field: parse C/P from the symbol.
- Delay: snapshot `timestamp` 17:28:28 UTC versus index `last_trade_time` 13:13:28 ET (= 17:13:28 UTC) is a 15-minute gap (H, observed; the delay being a stated policy is M).
- **No order-book depth** beyond top-of-book bid/ask and sizes; **no trade tape; no websocket.** Rate limits: NOT FOUND (searched: response headers, robots.txt, Cboe Terms).
- `robots.txt` on www.cboe.com: `Disallow: /book/` and `Disallow: /*market_statistics/volume_reports/`; the CDN path is not disallowed in what I read (H, fetched 2026-10-19). `cdn.cboe.com`'s robots.txt was not readable by the sibling note; I did not re-test.
- Risk: undocumented, can change or be blocked; and see the staleness caveat in section 1.

### 4b. Official market data (licensed, paid)

- Cboe's page for the binaries hub lists "US Options Complex Multicast TOP" and "PITCH" specs plus an Integration Guide for the XSP binaries and QSB verticals; **BOE and FIX specs are not listed** on that page; market-data inquiries go to a Cboe email address shown on the hub (H, WebFetch summary). Pricing: NOT FOUND (searched: pipeline hub, market data services page via sibling note). The fee schedule defines machine/automated use as licensed "Non-Display Usage" for Exchange Market Data (M, sibling note read; I did not re-read that clause).
- Cboe DataShop and LiveVol are linked from the prediction-markets page (H); I did not verify they carry binaries.

### 4c. Fixtures saved (all <= 50KB; no personal identifiers; `set-cookie`, `cf-ray`, `x-amz-cf-id` headers stripped)

- `docs/research/fixtures/cboe-prediction-event-contracts/delayed-quotes-_XSPBX-near-the-money.json` (28.4KB): index quote plus 52 of 244 series, strikes within 6 points of 772.02, both expiries, calls and puts; includes the staleness note.
- `docs/research/fixtures/cboe-prediction-event-contracts/delayed-quotes-_XSP-index-quote.json` (1.9KB): XSP index quote showing the sibling file is fresh to 2026-10-16.
- `docs/research/fixtures/cboe-prediction-event-contracts/response-headers-_XSPBX.txt` and `response-headers-_XSP.txt`.

---

## 5. Trade path (programmatic placement)

- **Only via a broker-dealer account:** Interactive Brokers (live since 2026-06-23) and Charles Schwab (listed on Cboe's broker page as of 2026-10-19; go-live date NOT FOUND). Cboe Predicts: onboarding via "permissions, suitability checks, and risk controls" (sibling note, M-H). Direct exchange access needs Cboe membership (Trading Permit Holder) and exchange order-entry protocols.
- **Programmatic orders through broker APIs: plausible but unverified for this product.** IBKR has a general trading API and Schwab has a Trader API in general, but whether XSPBW/XSPBX are quotable or tradable through either is NOT FOUND (searched: Cboe pages; IBKR product/commission pages returned HTTP 403 for the sibling note; I did not retry them). If it works it uses the broker's credentials/session, not wallet signatures.
- Cboe flags the contracts as complex and "suited to sophisticated market participants" (sibling note, M).

---

## 6. PayBox / EVM wallet reachability

**No (trading). Read-only: yes.**

- No chain, no token, no on-chain settlement, no signed-order scheme. Funds sit at a US broker in USD. A PayBox EVM (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet cannot place, cancel or fund orders by transaction proposals or signed orders. An on-ramp to a broker account is a bank/KYC process outside PayBox. (H for the no-chain facts; M for the reachability conclusion, which is inferred.)
- A PayBox plugin could make HTTPS GETs to `cdn-api.cboe.com` (public JSON) as a data feed, but that is not trading and its terms/stability are unclear.

---

## 7. Fees

- **Exchange transaction fee for index binaries (H, fee schedule dated Oct 1, 2026, text extracted locally):** `Transaction Fee = ((k * p * (1 - p) * c) * m)` where k = tier-based constant, p = contract price ($0.01 to $1.00), c = contracts traded, m = contract multiplier (100). Constants as extracted: Customer {HC} 1.2%; Clearing Trading Permit Holder Proprietary {HD} 1.4%; Cboe Options Market-Maker/DPM/LMM {HB} 1.4% electronic removing liquidity, {HA} $0.05 electronic adding liquidity, {HM} $0.15 manual. The table layout was scrambled by extraction, so the code-to-capacity mapping is H for the formula and the numbers, M for exactly which code is which capacity.
- **Worked example (customer, k = 1.2%):** p = 0.50 gives 0.012 x 0.25 x 100 = $0.30 per contract; p = 0.10 or 0.90 gives $0.108. The fee peaks at 0.50 and falls toward zero near 0 or 1.
- Binaries (XSPBX) are excluded from several volume programs (Liquidity Provider Sliding Scale, Marketing Fee, customer volume threshold lists exclude XSPBX; H, seen in the extracted notes), and SR-CBOE-2026-071 (approved 2026-08-12) is the fee filing tied to listing the XSP binaries (H, Cboe rule-filings page).
- **Who pays:** the exchange fee is assessed on the member/clearing firm; a retail customer pays whatever the broker passes through plus broker commission. Broker commission for these contracts: NOT FOUND (searched: Cboe pages; IBKR commissions page 403 for the sibling note).
- No gas, bridge, deposit or withdrawal fee at the venue level. Market data fees: section 4b.

---

## 8. Resolution mechanism and dispute risk

- **Mechanical index settlement, no oracle voting.** XSPBW (PM): settlement value is derived from the official closing level of the S&P 500 (XSP = 1/10), "calculated using the closing sales price in the primary market of each component security of S&P 500 Index on the expiration date" (FAQ, local text extraction, H; the sentence is partly cut in the extraction, so the wording is M-H). XSPBX (AM, symbol XSR): based on opening prices of the components on expiration date (spec headings; M-H). Call pays $100 if the settlement value is at or above the strike, put if below (H).
- **Rule history in 2026 (H, Cboe rule-filings page https://www.cboe.com/us/options/regulation/rule_filings/):** SR-CBOE-2026-028 approved 2026-03-27 (binaries on exclusively listed index options in GTH/Curb hours); SR-CBOE-2026-032 approved 2026-04-02 (binary options on all indexes; expiration-based position limits; Amendment No. 1 approved 2026-07-13); SR-CBOE-2026-034 approved 2026-04-09 (permissible exercise settlement values); SR-CBOE-2026-071 approved 2026-08-12 (fees). **SR-CBOE-2026-061, "binary options overlying key performance indicators" reported by certain stock issuers: status Pending, filed 2026-06-30, Amendment No. 1 dated 2026-10-01 (H).** The SEC rulemaking page I tried returned "There are no results" (not usable). The 2026-10-16 secondary report (goodmoneyguide) says KPI contracts were "undergoing final regulatory work" and "expected to launch imminently" (M). Treat KPI binaries as imminent but unconfirmed.
- **Dispute risk: very low** versus crypto venues (regulated index settlement, OCC guarantee). Residual risks: S&P index corrections or delayed prints, trading halts near the close, settlement-time quirks (regular trading ends 3:15 pm CT but XSPBW trading ends 3:00 pm CT on expiry, per spec; M-H). KPI binaries, if listed, will resolve from issuer-reported figures and may have more ambiguity.
- No adjustment/halt clauses read in full.

---

## 9. Geography, ToS and automation

- **Access is gated by broker eligibility.** Cboe's broker page: IBKR in APAC, North America and EMEA; Schwab in North America; "Product availability may vary by region" (H). Cboe states the products "are complex and suitable only for sophisticated market participants" and, in some jurisdictions, are limited to professional/qualified investors (sibling note quoting the FAQ footer; M).
- **UK:** per the secondary guide, Cboe says these products "cannot currently be marketed or sold to UK retail traders"; the guide also notes the FCA banned binary options for retail in 2019 (M; goodmoneyguide, 2026-10-16). Polymarket and Kalshi are described there as not allowed to operate in the UK (M).
- **Website Terms** (page "last updated November 16, 2022", so stale, L): Materials "are not intended for trading purposes"; one personal, non-commercial copy only, other copying or electronic storage needs Cboe's prior written consent via a "Request to Use Cboe Content"; no derivative works "including financial products, services, or indices"; no interference with servers. Robots/scraping/automated access is not mentioned by name (H via WebFetch summary of https://www.cboe.com/terms/).
- **Implication for the aggregator:** the public JSON is the website's own data CDN and is covered by these Terms in spirit; a hosted multi-user product that stores or redistributes Cboe quotes needs a Cboe content or data license. A single user's tool reading it transiently for personal use is the least risky shape. Cboe-specific automation limits for trading come from the broker's API terms: NOT FOUND (searched: Cboe pages).
- Operational: I fetched with the generic UA, once per file, did not retry on the 403 for `_XSPBW.json`, and did not hit any disallowed path.

---

## 10. Liquidity (dated)

- **Binaries, snapshot 2026-10-14 17:28 UTC (about 12:28 pm CT, delayed), computed from the fetched `_XSPBX.json` (H):** 244 series (2 expiries), total volume 83 contracts (63 for expiry 261014, 20 for 261015; 16 series traded; about $4,566 of premium at last-trade prices), total open interest 23 contracts (all in 261014), 160 of 244 series two-sided. Near the money (strikes within 5 index points, two-sided quotes): median bid-ask spread 0.035 ($3.50 on a $100 contract), median bid size 5 contracts, displayed sizes in the deep wings 50 to 55 contracts. Largest single series: `XSPBW261014P00778500`, volume 20, OI 20.
- Position limit 1.5 million contracts per expiration implies the product is built for scale, but observed usage is orders of magnitude below that (M).
- Underlying options complex, for context: Cboe's September 2026 volume release (2026-10-05) reports XSP options ADV records of 274 thousand (month), 251 thousand (quarter), XSP 0DTE ADV 165 thousand (month), 146 thousand (quarter); it has NO binary or Cboe Predicts figures (H, https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-September-2026/default.aspx).
- No TVL, no cumulative binary volume anywhere public: NOT FOUND (searched: Cboe stats pages via sibling note, Q2 2026 and September 2026 releases). The volume reports path is disallowed in robots.txt and was not fetched.
- One snapshot of one slice of one day, taken mid-session on an early-life product; do not extrapolate.

---

## 11. Event categories, overlap, and independence

- **Coverage:** only "S&P 500 (XSP) settles at or above a level", daily. No sports, politics, crypto or general macro. Schwab said it plans to keep contracts to financial events with verifiable outcomes (sibling note citing Yahoo Finance, 2026-06-22; M). KPI binaries (earnings/issuer KPIs) would add single-company events if approved.
- **Overlap where arbitrage or cross-checks exist (M, from local venue notes; verify in the Kalshi, Polymarket and ForecastEx specs):**
  - ForecastEx lists S&P 500 / Nasdaq-100 daily markets (`FES`, `FNQ`) settling on CME E-mini daily settlement (local note `docs/research/venues/forecastex.md`).
  - Kalshi lists index brackets and hourly index ladders (local notes `docs/research/venues/webull-event-contracts.md`, `docs/research/venues/forecastex.md`).
  - Polymarket price ladders on indexes (same Webull note).
  - **Settlement-source mismatch is the main basis risk:** Cboe settles on the official S&P 500 close (XSP, 1/10 of SPX), others may settle on CME E-mini settlement or a different index print. That gap is a risk for any cross-venue leg, not a free lunch.
  - Within Cboe, a binary call at strike K approximates a $1-wide XSP vertical call spread divided by the strike gap, and sits on the XSP vanilla option surface; consistency checks (monotone in strike; call + put at the same strike around 1.00) can be run on Cboe data alone (M, derived from fixture).
- **Shared liquidity:** Cboe binaries have their own central limit order book; no shared liquidity with Kalshi, Polymarket, ForecastEx or any crypto venue (M). IBKR and Schwab are access routes to the SAME Cboe book (not independent legs of each other). Economically it is a derivative of the Cboe vanilla index-option market because dealers hedge with it (M, inference), so the probability is not an independent information source from SPX options.
- **Arbitrage conclusion:** useful as a reference quote and a cross-instrument consistency check; not a leg the PayBox agent can execute.

---

## 12. Adapter recommendation

- **adapter_priority: P2.** Reasons: single underlying, daily expiries, tiny observed volume, no official API, no wallet/PayBox path, stale data file.
- **If built (read-only signal adapter):**
  - Venue id `cboe-predicts`; market key `XSPBW{yymmdd}` + strike (e.g. `XSPBW261014:772`); outcome YES = binary call at strike, NO = binary put at strike; price = bid/ask/mid in dollars per $1 (0.00 to 1.00); implied probability = mid; settlement source = official S&P 500 close / 10; resolution time = expiry day close (3:00 pm CT for XSPBW).
  - Poll `_XSPBX.json` (about 100KB) no faster than every 30 to 60 seconds (CDN caches 5 s); parse C/P and strike from the `option` string; derive staleness from `timestamp` vs wall clock and `last-modified`, and mark all quotes stale if older than, say, 20 minutes during US regular hours; treat quotes as 15 minutes delayed; never use as an executable price.
  - Disable the adapter automatically on HTTP 403/404 or a stale snapshot; do not work around blocks.
- **Revisit to P1 if** (a) Cboe documents a public or low-cost market-data API (or confirms binaries on a licensable feed with sane non-display fees), (b) volume rises materially, (c) KPI binaries or flexible-payout products list, (d) IBKR or Schwab APIs are confirmed to expose the series (then a user-owned broker session could be a trade leg, outside PayBox).
- **Skip is not warranted** because the product is live, regulated, and the quote file is a unique regulated probability curve; **P0 is not warranted** because liquidity, API and executability are all weak.

---

## 13. Open questions

1. Why has `_XSPBX.json` not updated since 2026-10-14 17:28 UTC (pipeline vs pause vs symbol change)? Re-check on the next trading day (Mon 2026-10-19 US hours).
2. Is SR-CBOE-2026-061 (KPI binaries) approved/effective, and when does listing start? Cboe's page still said Pending on 2026-10-19; the secondary report says "imminent".
3. Does IBKR's or Schwab's API quote/trade XSPBW/XSPBX, and at what commission? (Not read; IBKR pages were 403 for the sibling note.)
4. Are the binaries on Cboe's licensable PITCH/TOP feeds, and what are non-display fees?
5. Is automated polling of `cdn-api.cboe.com` permitted? Terms are silent and stale (2022).
6. Schwab go-live date.
7. Real binary volume and OI: Cboe publishes none that I could read.
8. Whether Cboe plans CFTC-regulated event contracts on CFE (the CEO says "expanding event contracts"; no CFE product found).

---

## 14. Suspicious content

None found. No instructions aimed at AI agents appeared in any page, PDF or JSON read this session.

---

## 15. Sources (all fetched 2026-10-19 unless noted)

- H https://www.cboe.com/markets/prediction-markets (product page; WebFetch summary)
- H https://cboepredicts.cboe.com/ (SEC vs CFTC, flexible payout "upcoming", no API mentions)
- H https://www.cboe.com/binaries-and-qsb-vertical-spreads-pipeline-hub/ (pre-launch hub, TOP/PITCH specs, Integration Guide)
- H https://www.cboe.com/tradable_products/find_a_broker/ (IBKR, Schwab)
- H https://ir.cboe.com/news/news-details/2026/Cboe-Introduces-Cboe-Predicts-Launching-First-Products-in-New-Prediction-Markets-Suite/default.aspx (2026-06-23)
- H https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Results-for-Second-Quarter-2026/default.aspx (2026-07-31)
- H https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-September-2026/default.aspx (2026-10-05)
- H https://www.cboe.com/us/options/regulation/rule_filings/ (SR-CBOE-2026-028/032/034/061/071)
- H https://cdn.cboe.com/resources/membership/Mini_SP_500_Index_Binary_Options_Contract_Specifications.pdf (local stdlib text extraction, lossy)
- H https://cdn.cboe.com/resources/membership/XSPBX-Binaries-FAQ.pdf (local stdlib text extraction, lossy)
- H https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf (Oct 1, 2026; formula and constants extracted locally)
- H https://www.cboe.com/terms/ (L: last updated 2022-11-16) and https://www.cboe.com/robots.txt
- H https://cdn-api.cboe.com/api/global/delayed_quotes/options/_XSPBX.json and /_XSP.json (unauthenticated GETs; `_XSPBW.json` returned 403)
- M https://goodmoneyguide.com/trading/uk-prediction-markets/ (dated 16 Oct 2026; the discovery hint; UK retail restriction and KPI "imminent" claim)
- M `docs/research/venues/cboe-predicts-cboe-exchange-sec-regulated-binary-options-on-xsp.md` (sibling note, used only to cross-check items I could not re-extract: margin/position limit/settlement-date details, Schwab article, IBKR 403s)
- M `docs/research/venues/forecastex.md`, `docs/research/venues/webull-event-contracts.md` (S&P overlap on other venues)
- Could not use: https://www.sec.gov/rules-regulations/self-regulatory-organization-rulemaking/cboe-exchange-inc (empty result list), https://www.cboe.com/us/futures/product_specifications/ (404), https://ir.cboe.com/news/default.aspx (news list is client-rendered; no items captured). WebSearch was unavailable (shared budget exhausted), so no news search was possible.
