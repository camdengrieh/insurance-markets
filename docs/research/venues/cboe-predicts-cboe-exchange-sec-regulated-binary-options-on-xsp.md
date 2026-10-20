# Cboe Predicts (Cboe Exchange, SEC-regulated binary options on XSP)

Researched 2026-10-19. Read-only: public web pages, public PDFs on cdn.cboe.com, and 4 unauthenticated GETs to Cboe's public delayed-quote CDN. Nothing was signed, bought or registered. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. "NOT FOUND (searched: ...)" means no source found; nothing is guessed.

## 0. Verdict in one paragraph

Cboe Predicts is real, live and regulated, but it is a securities-options product, not a crypto or on-chain prediction market. It is a single-underlying (S&P 500 "XSP" index level) daily-expiry (0DTE and 1DTE) cash binary option, listed on Cboe Options Exchange, cleared at OCC, and reachable only through a US-style broker account (Interactive Brokers now, Schwab listed). There is no official public API, no chain, no wallet path and no PayBox path to trade. Volume observed in the only data we could read is tiny (83 contracts and 23 open interest across all series at mid-session on 2026-10-14). Its value to the aggregator is as a SIGNAL SOURCE: a regulated, market-made probability curve for "where will the S&P 500 close today / tomorrow". Priority P2.

## 1. Is it still live? (H, with one caveat)

- Cboe product page is up and describes Yes/No Mini-S&P 500 binary options paying $100, Interactive Brokers named as broker (H) https://www.cboe.com/markets/prediction-markets
- Launch press release dated 2026-06-23: XSPBW and XSPBX binaries available "now" through Interactive Brokers; Schwab "in the coming months"; centrally cleared by OCC (H) https://ir.cboe.com/news/news-details/2026/Cboe-Introduces-Cboe-Predicts-Launching-First-Products-in-New-Prediction-Markets-Suite/default.aspx and mirror https://www.stocktitan.net/news/CBOE/cboe-introduces-cboe-predicts-launching-first-products-in-new-ch8rrycxp8xx.html
- Cboe "Find a Broker" page lists both Interactive Brokers (APAC, North America, EMEA) and Charles Schwab (North America) as offering "XSP Binary Options" under "Prediction Markets" (H, fetched 2026-10-19) https://www.cboe.com/tradable_products/find_a_broker/
- Cboe Options fee schedule dated "October 1, 2026" has a "Rate Table - Binary Options" and excludes XSPBX from many programs (H) https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf
- Contract specification PDF has PDF metadata created/modified 2026-09-28 (H) https://cdn.cboe.com/resources/membership/Mini_SP_500_Index_Binary_Options_Contract_Specifications.pdf
- Real trades observed: delayed-quote file for `_XSPBX` snapshot 2026-10-14 17:28:28 UTC shows last trades the same morning, e.g. XSPBW261014C00772000 last 0.58 at 2026-10-14T13:10:25 ET (H, fixture below).
- CAVEAT (open question): that `_XSPBX.json` file has HTTP `last-modified: Wed, 14 Oct 2026 17:28:31 GMT` and has not changed in 5 days, while the sibling `_XSP.json` file was refreshed 2026-10-17 00:04 UTC. Either the website's delayed-quote pipeline for binaries stalled, or trading was paused after 14 Oct. Not determinable from public sources this session. Treat the endpoint as unreliable until re-checked on a trading day.
- Product is brand new (about 4 months old at this date), so no stale-source problem, but see section 11 for the one stale source (website Terms dated 2022).

## 2. Kind and market model (H)

- Kind: regulated securities exchange, listed cash-settled European-style binary (digital) options. Not CFTC event contracts: the release says "security options ... same framework as U.S.-listed options"; the cboepredicts site says contracts based directly on a securities index are security options under SEC jurisdiction, not swaps.
- Instruments: two option classes on the same underlying, differing by settlement time:
  - XSPBW: PM-settled (settles on the official close of the S&P 500, trades until 3:00 pm CT on expiry day). These are the daily 0DTE/1DTE contracts seen in live data.
  - XSPBX: AM-settled (settlement value symbol XSR, based on opening prices of the S&P 500 components on expiry date). Spec lists it; only XSPBW series were visible in live data. Note the options root symbol in OSI-style strings is XSPBW, while XSPBX is also the name of the underlying binary index and the product family.
- Underlying "Mini-S&P 500 Binary (XSPBX) Index" equals XSP, which is 1/10 of SPX (H, spec footnote 1). Example in data: XSP about 772 when SPX about 7,720.
- Payout: $100 multiplier; "Yes" = binary CALL pays $100 if settlement value is >= strike; "No" = binary PUT pays $100 if settlement value is < strike; otherwise $0. Exercise settlement value fixed at 1.00 x $100 multiplier (H, spec).
- Binary call and put at the same strike are complements (call + put = $1.00 per point, per the same-settlement definition: >= vs <), so "Yes" and "No" are two separate instruments with separate books, not one book with two sides. Observed: 772 strike call 0.52/0.56 and put 0.44/0.48 (H, fixture).
- Price quotation: decimals; one point = $100; minimum increment 0.01 ($1.00) (H, spec). Price range effectively 0.01 to 1.00.
- Strikes: spec says strike interval 0.50; FAQ says daily strikes are listed at $1 increments spanning 80% to 110% of the prior close of the XSPBX index, with additions as the market moves (H). Live data show 61 strikes per expiry from 630 to 850 for a spot near 772, with half-point strikes near the money (e.g. 778.5, 775.5) (H, fixture).
- Expirations: spec allows 1 day up to 36 months. At launch only 0DTE and 1DTE ("At launch, only 0 and 1 days to expiration contracts will be available"); one new expiry listed each trading day (H). Live data confirm exactly two expiries (261014, 261015) on 2026-10-14.
- Tokenisation: none. Positions are broker-account securities positions in OCC-cleared options; CUSIP 12517P1057 is given in spec for the product (H). There is no on-chain token, no outcome token, no AMM or parimutuel.
- Order book: central limit order book on Cboe Options Exchange (market-maker liquidity plus customer orders). FAQ: no Lead Market-Maker program at launch, no FLEX (H).
- Planned/other Cboe Predicts items (not live): Quoted XSP vertical spreads via Quoted Spread Book (hub says 0/1 DTE, $1-wide vertical spreads designated for QSB); "flexible payout" contracts ($0, partial, or $100) described as "upcoming" on cboepredicts.cboe.com (H); KPI binary options per SR-CBOE-2026-061 (see section 8). The task hint says KPI binaries were approved 2026-10-13; the Cboe rule-filings page we read lists SR-CBOE-2026-061 as "Pending" with Amendment No. 1 dated 2026-10-01 (H for what the page said; hint's approval claim is NOT confirmed by any source I could read; web search budget ran out).

## 3. Chains and collateral (H)

- No blockchain. Collateral is US dollars cash in a broker account.
- Buyers must pay 100% of the premium in full; writers (sellers) must deposit and maintain 100% of the exercise settlement amount ($100 per contract). Offsetting spread relief exists (short call offset by a long call at a lower strike, etc.) (H, spec "Customer Margin").
- Settlement: cash, on the business day following expiration (H, spec).
- Position limit: 1,500,000 contracts per expiration, no exercise limits (H, spec).

## 4. Read API (official / public / authenticated?)

Summary: NO official public API found. One unofficial-but-public JSON CDN used by cboe.com's delayed quotes pages works unauthenticated. Real-time data is a paid exchange data product.

### 4a. Delayed-quote JSON (public, undocumented, tested) (H that it works; M on stability and terms)

- Base: `https://cdn-api.cboe.com/api/global/delayed_quotes/options/{UNDERLYING}.json` (the older host `https://cdn.cboe.com/api/global/delayed_quotes/options/...` answers HTTP 307 to this host).
- Binaries: `https://cdn-api.cboe.com/api/global/delayed_quotes/options/_XSPBX.json` returned HTTP 200 application/json, 103,488 bytes. Underlying index quote: `symbol "^XSPBX"`, current_price 772.02 (the XSP-equivalent index level), open/high/low/close, iv30, seqno, last_trade_time.
- Per-series fields (244 series on the snapshot): `option` (root + yymmdd + C/P + strike x1000, e.g. `XSPBW261014C00772000`), `bid`, `bid_size`, `ask`, `ask_size`, `iv`, `open_interest`, `volume`, `delta`, `gamma`, `vega`, `theta`, `rho`, `theo`, `change`, `open`, `high`, `low`, `tick`, `last_trade_price`, `last_trade_time`, `percent_change`, `prev_day_close`. Prices are in dollars per $1.00 of payout (0.55 means $55 per contract). Calls: C; puts: P. Binary series have no `put_call` field; parse it from the symbol.
- Timestamp field is UTC; `last_trade_time` fields are US Eastern; implied delay about 15 minutes (consistent: snapshot 17:28 UTC vs index last tick 13:13 ET). The delay length is not stated in anything I could read, so this is M.
- Other tested: `_XSP.json` (regular XSP options and the XSP index quote): HTTP 200, 7.2 MB, 16,522 series, refreshed 2026-10-17 00:04 UTC. Variants without the leading underscore, or `_XSPBW`, returned 403 AccessDenied.
- Headers: `cache-control: max-age=0, s-maxage=5, stale-while-revalidate=5`, served via CloudFront. No auth. No rate-limit headers seen. Rate limits NOT FOUND (searched: response headers, Cboe terms, robots).
- No order book depth beyond top-of-book bid/ask and sizes; no trade tape; no websocket.
- Stability: undocumented, Cboe may change or block it; XSPBX file stale since 2026-10-14 (see section 1). Use as a signal feed only.
- Fixtures saved (trimmed, each under 50KB):
  - docs/research/fixtures/cboe-predicts-cboe-exchange-sec-regulated-binary-options-on-xsp/delayed-quotes-_XSPBX-trimmed.json (60 of 244 series; 32.7KB)
  - docs/research/fixtures/cboe-predicts-cboe-exchange-sec-regulated-binary-options-on-xsp/delayed-quotes-_XSP-index-trimmed.json (XSP index quote plus 8 regular XSP series; 5.3KB)

### 4b. Official market data (paid / membership) (M)

- Cboe sells US options feeds: Cboe One Options Feed, Cboe BBO, Book Depth, COB, Depth of Book, DROP, historical depth (H, https://www.cboe.com/market_data_services/us/options/ page listing). Binary options (XSPBX/XSPBW) are not mentioned on that page; pricing "contact Cboe". Technical specs (multicast TOP/PITCH) are linked on the pipeline hub only for the Complex Order Book / QSB (H). Whether XSPBW is carried on the same PITCH/TOP feed is NOT FOUND (searched: market data services page, pipeline hub).
- Cboe DataShop (datashop.cboe.com) and LiveVol (livevol.com) are linked from Cboe statistics pages; content not read (not verified they include binaries).
- Cboe fee schedule defines "Non-Display Usage" (machine or automated use) as a licensed category for Exchange Market Data (H), so real-time automated use of Cboe feeds needs a license.
- Volume / open-interest statistics: Cboe's US Options Market Volume Summary page had no binary figures in the text I could read; Cboe's September 2026 volume release (dated 2026-10-05) gives XSP options ADV records (monthly ADV record 274 thousand contracts, Q3 XSP 0DTE ADV record 146 thousand) but no XSPBX/XSPBW figures (H). The `market_statistics/volume_reports/` path is Disallow in www.cboe.com robots.txt (H), so I did not fetch it.

### 4c. Broker APIs (M)

- Interactive Brokers and Schwab both have trading APIs in general (TWS / Client Portal Web API; Schwab Trader API) but whether XSPBW/XSPBX contracts are tradable or quotable through them is NOT FOUND (searched: ibkr.com product page returned 403, Schwab page returned an authorization error). Treat as unknown.

## 5. Trade path (programmatic?)

- Only via a broker-dealer account: Interactive Brokers (live since 2026-06-23) and Charles Schwab (listed on Cboe's broker page as of 2026-10-19; exact launch date NOT FOUND). Onboarding includes "permissions, suitability checks, and risk controls before trading" (H, cboepredicts.cboe.com).
- Direct exchange access requires Cboe membership (Trading Permit Holder) using exchange order-entry protocols; not an agent-level path.
- Programmatic order placement through broker APIs: plausible (M) but unverified for this product; would use the broker's own credentials (IBKR session / Schwab OAuth), not wallet signatures.
- Contract is flagged by Cboe as "complex ... suited to sophisticated market participants" (H, pipeline hub).

## 6. PayBox / EVM reachability

- No. No chain, no token, no on-chain settlement, no signed-order scheme; funds live at a US broker. A PayBox EVM or Solana wallet cannot place, cancel or fund orders on this venue by transaction proposals or signed orders.
- Read-only use inside a PayBox plugin is technically possible if the plugin runtime can make HTTPS GETs to cdn-api.cboe.com (public JSON, section 4a), but that is a data feed, not trading, and its terms/stability are unclear.
- `paybox_reachable`: no (trading); read-only possible.

## 7. Fees (H for formula, M for the per-capacity constants)

Source: Cboe Exchange fee schedule dated October 1, 2026, "Rate Table - Binary Options" (https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf); SR-CBOE-2026-071 (approved, filed 2026-08-12) "adds standard transaction fees [for XSP binary options] and excludes these options from certain fee programs".

- Exchange transaction fee formula (H): Fee = (k x p x (1 - p) x c) x m, where k = tier-based constant, p = contract price in dollars ($0.01 to $1.00), c = contracts traded, m = multiplier (100).
- Constants (M: the PDF text extraction scrambled the table; my reading of it): Customer k = 1.2% (code HC); Clearing TPH proprietary and similar k = 1.4% (HD); Market-Maker/DPM/LMM removing liquidity k = 1.4% (HB); Market-Maker adding liquidity flat $0.05 per contract (HA); a manual rate also listed (HM). Verify against the PDF before relying on these.
- Worked example (customer capacity, k = 1.2%): at p = 0.50, fee = 0.012 x 0.25 x 100 = $0.30 per contract; at p = 0.10 or 0.90, fee = $0.108 per contract. The fee peaks at p = 0.5 and shrinks toward 0 or 1.00 (a deliberate shape for digital options).
- XSPBX is excluded from the Liquidity Provider Sliding Scale, Volume Incentive Program, Break-Up Credits, Affiliate Volume Plan, Marketing Fee, Clearing TPH Fee Cap, Customer Large Trade Discount, and several router subsidy programs (H, fee-schedule footnote).
- Who pays: the exchange fee is charged to the member; the retail customer pays whatever the broker passes through plus broker commission. Broker commissions for these contracts: NOT FOUND (searched: IBKR commissions page returned 403; press coverage silent).
- No gas, no withdrawal fee, no deposit fee at the venue level.
- Market data fees: see 4b.

## 8. Resolution mechanism and dispute risk (H)

- Resolution is mechanical, index-based, with no oracle voting or disputes:
  - XSPBW (PM-settled): settlement value is one-tenth (rounded to the nearest cent) of the official closing level of the S&P 500 index as reported by S&P Dow Jones Indices, "calculated using the closing sales price in the primary market of each component security" on expiration date (H, FAQ). Contract: call pays $100 if settlement value >= strike; put pays $100 if < strike.
  - XSPBX (AM-settled): XSR settlement value uses the opening sales price of each component security in its primary market on expiration date (H, spec).
  - Cash is delivered the business day after expiration; clearing by OCC.
- Rule changes in 2026 relating to settlement values: SR-CBOE-2026-034 (approved, 2026-04-09) changed permissible exercise settlement values for binary options; SR-CBOE-2026-032 (approved) allows binary options on all indexes and sets expiration-based position limits; SR-CBOE-2026-028 (approved) allows binaries on exclusively listed index options in Global/Curb Trading Hours (H, https://www.cboe.com/us/options/regulation/rule_filings/). Note the XSPBX FAQ says no Global/Curb hours at launch.
- Pending: SR-CBOE-2026-061 "Binary KPI options" (binary options on key performance indicators reported by certain stock issuers), filed 2026-06-30, Amendment No. 1 dated 2026-10-01, status "Pending" on the Cboe page; hint says approved 2026-10-13 (unconfirmed).
- Dispute risk: very low versus crypto venues (regulated index settlement, OCC guarantee). Residual risks: S&P index level corrections or calculation delays, OCC/exchange adjustments, trading halts near the close, a 15-minute gap between regular trading end (3:15 pm CT) and expiring XSPBW trading end (3:00 pm CT) (H, spec note). Spec adjustment/halting clauses not fully read.

## 9. Geography, ToS and automation (M, mostly)

- Product is US-listed securities options; access is gated by broker eligibility. Cboe's broker page shows IBKR in APAC, North America and EMEA and Schwab in North America; "availability varies by region ... check with the broker" (H). Cboe disclosures: products "are complex and are suitable only for sophisticated market participants"; in certain jurisdictions "only permitted for investment professionals, certified sophisticated investors, or high net worth corporations" (H, FAQ footer).
- Cboe website Terms (page dated November 16, 2022, so stale >6 months, L): site materials "are not intended for trading purposes"; users may not "interfere with or disrupt the Website"; copying requires written consent; users must be 18+. Automated access/scraping is not addressed in the Terms text I read. Use of Cboe Content requires pre-approval and a signed license (Cboe "Use of Content" page) (H).
- www.cboe.com/robots.txt: `Disallow: /book/` and `Disallow: /*market_statistics/volume_reports/`; the cdn.cboe.com robots.txt returns AccessDenied (H). The delayed-quote JSON path is not disallowed in what I could read.
- Operational: tests used the generic User-Agent `insurance-markets-research/0.1`; one cdn.cboe.com PDF download and a few JSON fetches only. An ir.cboe.com RSS fetch returned 403 and I did not work around it.
- Automating trading requires the user's own broker account and the broker's API terms; nothing about Cboe-specific automation limits was found (NOT FOUND, searched: Cboe pages, FAQ, spec).

## 10. Liquidity (dated)

- Only measurable sample: `_XSPBX.json` snapshot 2026-10-14 17:28 UTC (about 12:28 pm CT, mid-session, delayed): across 244 series (two expiries, 122 each), total volume 83 contracts (about $4,566 of premium at last-trade prices), total open interest 23 contracts, 160 of 244 series with two-sided quotes. Near-the-money (within 5 index points) quotes: median bid-ask spread about 0.035 ($3.50 per $100 contract), median bid size 5 contracts, typical displayed size 5 to 55 contracts. (H, computed from fixture)
- Position limit 1.5 million contracts per expiration means the product is built for scale, but observed usage is orders of magnitude lower (M).
- Cboe's monthly volume release of 2026-10-05 does not break out binaries (H); XSP vanilla ADV record 274 thousand (monthly) and Q3 0DTE record 146 thousand are not binary volume.
- No other volume/OI/TVL numbers found (NOT FOUND, searched: Cboe stats pages, press coverage, Yahoo/Simply Wall St article of 2026-06-27 had no volume).
- Quotes appear market-maker driven (50 to 55 lot sizes on both sides near the money, theoretical values in the feed), but there is no LMM program (H, FAQ), so depth may be uneven.

## 11. Event coverage and overlap with other venues (arbitrage relevance)

- Coverage: only "S&P 500 (XSP) settles at/above a level", daily 0DTE/1DTE, 61 strikes per day in a 80-110% band. No sports, politics, crypto or general macro. Schwab says it plans to limit contracts to financial-market events with "verifiable outcomes" excluding politics, sports and entertainment (H, Yahoo Finance 2026-06-22).
- Overlap with other venues (M/L, from background knowledge, NOT verified this session; verify in the Kalshi and Polymarket venue specs which a parallel workflow covers): Kalshi and Polymarket list daily S&P 500 close-level and up/down markets; options-implied digital probabilities from XSP/SPX vertical spreads and futures are a closely related price. Binary call price at strike K is approximately the risk-neutral probability that SPX/10 settles >= K, and can be cross-checked against $1-wide XSP vertical call spreads (Cboe's QSB product) and the vanilla XSP option surface.
- Cross-venue arbitrage here is cross-INSTRUMENT within the Cboe complex (digital price vs vertical spread vs vanilla chain) and cross-VENUE against S&P close markets elsewhere; the venue's own constraints (monotonic in strike, call + put at the same strike around $1.00) provide consistency checks the aggregator can run purely on Cboe data.
- Independence: Cboe liquidity does not share a book with any crypto or prediction venue (M). It is NOT independent of the Cboe vanilla option complex (market makers hedge binaries with XSP/SPX options), so informationally it is a derivative of the vanilla index-option market; treat as a reference signal, not an independent probability source.

## 12. Adapter recommendation

- adapter_priority: P2 (signal-only / thin). Reasons: single underlying, daily expiries, tiny observed volume (83 contracts, 23 OI), no official public API, trading only via broker accounts (no wallet or PayBox path), undocumented delayed-quote JSON that went stale on 2026-10-14.
- Value: a regulated market-maker quote curve for the S&P 500 close, usable as a signal in Quotient and as a benchmark for S&P close markets on other venues; also a template for later Cboe Predicts products (KPI binaries, flexible payout, QSB verticals) if they list.
- If built: poll `_XSPBX.json` (about 100 KB) at a low rate (the CDN caches for 5 s; poll no faster than every 30 to 60 s), compute implied probability = mid price (0.00 to 1.00), flag stale snapshots by comparing `timestamp` to wall clock and `last-modified`, and treat quotes as 15-minute delayed.
- Revisit priority if (a) Cboe documents a public/REST market-data API or adds binaries to a licensable low-cost feed, (b) volume rises materially, or (c) KPI binaries (approved or listed) add non-index events.

## 13. Open questions

1. Why has `_XSPBX.json` not updated since 2026-10-14 17:28 UTC while `_XSP.json` is fresh (pipeline problem vs trading pause vs symbol change)? Re-check on the next trading day.
2. Were KPI binary options (SR-CBOE-2026-061) approved 2026-10-13? The Cboe filings page still showed "Pending". No SEC approval order was read.
3. Does IBKR's or Schwab's API expose XSPBW/XSPBX quotes and order entry, and at what commission?
4. Are XSPBW/XSPBX series carried on Cboe's licensed PITCH/TOP/One feeds, and what are non-display fees?
5. Exact Schwab go-live date.
6. Whether Cboe permits automated polling of cdn-api.cboe.com; no explicit rule found.

## 14. Suspicious content

None found. No embedded instructions aimed at AI agents were seen in the pages, PDFs or JSON read.

## 15. Sources (all fetched 2026-10-19 unless noted)

- H https://www.cboe.com/markets/prediction-markets (product page)
- H https://cboepredicts.cboe.com/ (Cboe Predicts site; flexible payout "upcoming", broker-led onboarding, SEC vs CFTC FAQ)
- H https://cdn.cboe.com/resources/membership/Mini_SP_500_Index_Binary_Options_Contract_Specifications.pdf (contract spec; text extracted locally from the PDF)
- H https://cdn.cboe.com/resources/membership/XSPBX-Binaries-FAQ.pdf (FAQ; text extracted locally, some glyphs unreadable)
- H https://www.cboe.com/binaries-and-qsb-vertical-spreads-pipeline-hub/ (0/1 DTE at launch, QSB verticals, spec links)
- H https://www.cboe.com/tradable_products/find_a_broker/ (IBKR, Schwab)
- H https://ir.cboe.com/news/news-details/2026/Cboe-Introduces-Cboe-Predicts-Launching-First-Products-in-New-Prediction-Markets-Suite/default.aspx (launch release, 2026-06-23)
- H https://www.stocktitan.net/news/CBOE/cboe-introduces-cboe-predicts-launching-first-products-in-new-ch8rrycxp8xx.html (mirror of release)
- H https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf (fee schedule, Oct 1, 2026)
- H https://www.cboe.com/us/options/regulation/rule_filings/ (SR-CBOE-2026-028/032/034/061/071)
- H https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-September-2026/default.aspx (2026-10-05; no binary volume)
- H https://www.cboe.com/market_data_services/us/options/ (feed list)
- H https://www.cboe.com/use_of_content/ and https://www.cboe.com/terms/ (L: Terms page dated 2022-11-16)
- H https://www.cboe.com/robots.txt
- H https://cdn-api.cboe.com/api/global/delayed_quotes/options/_XSPBX.json and /_XSP.json (unauthenticated GETs; fixtures above)
- M https://finance.yahoo.com/markets/options/articles/charles-schwab-enters-prediction-markets-122141560.html (2026-06-22; Schwab plans, "Plus Zone", scope limits)
- M https://www.yogonet.com/international/news/2026/06/24/124968-cboe-launches-cboe-predicts-with-minisp-500-binary-options-through-interactive-brokers
- M https://finance.yahoo.com/markets/options/articles/investors-reacting-cboe-global-markets-020625255.html (2026-06-27; no volume)
- Not readable: ibkr.com commissions and product pages (403), schwab.com (authorization error), predictionnews.com (403), Cboe notices ids 59879 and 59881 (JS-loaded; only titles visible), ir.cboe.com RSS (403, not worked around), cdn.cboe.com robots.txt (AccessDenied).
- Web search budget was exhausted during this task; some searches could not be run (e.g. KPI approval 2026-10-13, volume statistics).
