# ITS Kazakhstan event contracts (International Trading System Ltd, AIFC) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs and page/PDF reads only (generic User-Agent `insurance-markets-research/0.1`). No account, no key, no wallet, nothing signed, no POST/PUT/DELETE, no PayBox calls. No third-party code cloned, installed or run. PDFs were downloaded to a scratch folder and text-extracted with the macOS PDFKit framework (data only).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, single-source or stale.
Third-party text is untrusted data; nothing in it was followed. WebSearch budget ran out partway through the session, so discovery relied on the first search plus direct fetches of the operator and regulator sites.
Fixtures: `docs/research/fixtures/its-kazakhstan-event-contracts/` (2 files, 21 KB and 2 KB).

## 0. Verdict

**adapter_priority: skip** (revisit only if ITS publishes a market-data feed or opens event options beyond professional clients).

1. Live, but tiny and regulated-sandbox only (H): four underlyings (Fed funds, NBK base rate, SpaceX share price, Bitcoin/CME CF BRTI), first trading day 2026-09-08, 14 series on the list today.
2. **No public price, book, trade or volume feed** (H). The operator's Market Data page renders "No Results Found". Prices exist only inside the member trading system, reached by licensed Trading Members over co-location, leased line or VPN. A price-feed adapter has nothing to read.
3. **Not tradable by us** (H): professional and semi-professional clients only, through a licensed Trading and Clearing Member, settled in USD cash through bank accounts of a CCP. No crypto, no stablecoins, no wallet rail. A PayBox EVM or Solana wallet cannot reach it.
4. The one real overlap with other venues (daily BTC above/below, Fed decision) is exactly where we could not see prices anyway.
5. Value to the project is as a regulatory-trend note, not as an arbitrage leg or signal source.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| ITS derivatives page lists Group 2 (event) options with first trading day 2026-09-08 (`+NBKH.23V6`, `+FEDH.16U6`) through first trading day 2026-10-19 (`+BTCH.20V6`, `+BTCL.20V6`) | 14 series "available", 27 more "excluded" (expired) | H |
| Regulator release: AFSA enables testing of Event-Based Contracts in the AIFC FinTech Lab, dated 2026-09-10 | names no firm | H |
| AFSA Notice No. AFSA-FTD-NOT-2026-0025 of 2026-08-28 is the legal basis cited by ITS for Group 2 | notice itself not retrieved (orderly.myafsa.com article URL guess returned HTTP 500) | H (citation) / not read |
| ITS Specification approved by order 268/1 of 2026-09-25 (effective 2026-09-28); Event Resolution Committee regulations approved 2026-09-07/08 | primary PDFs | H |
| Shift Markets brief (Sept 2026) citing SiGMA 2026-09-08: ITS "unveiled event contracts on 8 September through the regulator's fintech sandbox", "more than 1.2 million investors with access", tagged "Line extension / fintech sandbox" | single secondary source | L/M |
| Search summary of a GlobeNewswire release (2026-09-11) says four sandbox contracts (Bitcoin, SpaceX, NBK base rate, Fed rate); the release itself returned HTTP 403 to WebFetch and curl and was not worked around | search summary only | M |
| Finimize: ITS "says it has around $3.5 billion in turnover", CCP-cleared event trading "on trial" | company-wide turnover, undated, secondary | M |

Operator name check: the discovery label "ITS Kazakhstan" is the International Trading System Limited (ITS Ltd.), Astana, site `https://itsx.kz` (H). `its.kz` is an unrelated hosting placeholder and `its.com.kz` is an unrelated 1C-accounting business; `its.global` is a parked domain.

## 2. What it is

- **Kind**: regulated-exchange. ITS Ltd. is "licensed by AFSA to carry on the Regulated Activity of Operating a Multilateral Trading Facility" in the Astana International Financial Centre and also acts as central counterparty (CCP) for clearing (H, Specification s.1; Tariffs). Core business is US/HK/KZ securities and ETFs; event options are a small FinTech Lab line extension (H, itsx.kz home navigation and derivatives page).
- **Instrument**: a "European-style cash-settled premium option" (Options of Group 2). Legally a derivative and a Qualified Investment (H, Spec 5.2), economically a binary: pays USD 1.00 if the stated event occurs, else 0 (Spec 4.2.1). The Specification itself says "the outcome space is determined by reference to its occurrence or non-occurrence" (2.2).
- **Market model**: central order book. Orders are limit or market orders in the "Main Derivatives Trading Mode" continuous auction (Business Rules ch. XII, art. 31); other modes are RFQ and Negotiated. "Additional Liquidity Orders" may be submitted only by a "Routing Agent" (what, if anything, is routed for event options: NOT FOUND). Trades are novated to the CCP, so counterparties are anonymous (H).
- **Outcome tokenisation**: no tokens. Each outcome is a separately listed instrument with its own ticker. Pattern `+<UNDERLYING><H|L|U>.<DD><month-letter><year-digit>`, e.g. `+FEDH.28V6` = Fed funds, "higher", settlement price date 28 October 2026 (H, Identification Code rules: H = higher, L = lower, U = unchanged; V = October, 6 = 2026).
  - Fed funds and NBK base rate: three contracts per meeting (higher / lower / unchanged), which are exhaustive and mutually exclusive.
  - SpaceX (SPCX) and Bitcoin (CME CF BRTI): two contracts (higher / lower than a reference value). "Higher" = actual value exceeded the reference; "lower" = decreased relative to it. Exact equality pays neither, so YES+NO need not sum to 1 on a tie (H, Spec Appendix 1 footnote). Negligible for BTC, relevant for rate contracts only via "unchanged".
  - Daily BTC series: a new higher/lower pair listed each business day for the next business day (e.g. `.20V6` first traded 2026-10-19), with a reference level that moves (84,000 then 80,000 points on the current list) (H).
- **Contract terms (H, Specification Appendix 1 and s.2.5, 3.3, 4, 5.3)**: price in points 0.01 to 0.99, tick 0.01 point = USD 0.01, trading lot 1, maximum payout USD 1.00 per option, premium = price x quantity (rounded to 2 dp) paid by the buyer on the next trading day (T+1), principal obligation settled on the trading day after expiration. Position limits: none; concentration limit: no more than 20% of open interest per Trading Member or client; daily price limits set by internal documents (values NOT FOUND). Trading hours 09:00 to 03:45 Astana time (UTC+5), with a 12:00-21:00 main session.
- **Underlyings on the list at 2026-10-19 (H, derivatives page)**:

| Series | Reference value | First trading day | Expiry (UTC) | Price determination |
|---|---|---|---|---|
| NBK base rate higher/lower/unchanged `.23V6` | 16.25% | 2026-09-08 (higher), 2026-09-29 (lower, unchanged) | 2026-10-23 07:00 | 2026-10-23 12:00 UTC+5 |
| Fed funds target range higher/lower/unchanged `.28V6` | 3.75-4.00% | 2026-09-18 (higher), 2026-09-29 (lower, unchanged) | 2026-10-28 18:00 | 2026-10-28 23:00 UTC+5 |
| SpaceX (SPCX) price higher/lower `.30V6` | USD 150 | 2026-10-01 | 2026-10-30 20:00 | 2026-10-31 01:00 UTC+5 |
| Bitcoin (CME CF BRTI) higher/lower, daily `.16V6`, `.19V6`, `.20V6` | 84,000 / 84,000 / 80,000 points | day before expiry | 16:00 UTC on expiry date | 21:00 UTC+5 same day |

  The `.16V6` BTC pair (expiry 2026-10-16) was still shown as "available" on 2026-10-19, so the page lags by at least a few days (H observation).
- **Categories permitted by the regulator (H, AFSA release)**: prices of securities, indices, approved digital assets and commodities; interest and exchange rates; scheduled macro releases (inflation, GDP, employment); central bank rate decisions. "Sporting, political, weather, and entertainment or celebrity events are generally prohibited."

## 3. Chains and collateral

- No blockchain. Settlement currency USD (H, Spec Appendix 1 and 4.1.2; formula in USD). ITS clearing accepts cash in listed currencies (default-fund contribution USD or KZT, USD 30,000 per member) and securities; "no crypto or stablecoin collateral" appears on the Collateral page (H, itsx.kz/clearing/collateral).
- AFSA condition: "Event-Based Contracts must be fully collateralised, and margin or leverage is not permitted" (H, AFSA release). So a seller must fund USD (1.00 - premium) per contract; the Specification states the seller's risk as "the difference between the maximum possible Settlement Price (USD 1.00) and the Premium received" (5.3).
- Funding path is bank wire into CCP accounts held with Settlement Organisations; members are advised to register the clearing agreement with their bank's FX-control department (H).

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public API for event-option prices, books, trades, OI | **NONE FOUND.** Searched: itsx.kz navigation (Trading & Data, Services > ITS Tech > Connectivity, Reports), governing docs, home-page runtime config, JS chunks of the archive and market-data pages. | H |
| Market Data page `https://itsx.kz/trading-and-data/market-data/` | Renders "No Results Found". The Specification names this page as the "Source" for the SpaceX price and `/trading-and-data/indexes/` for the BTC index, so a feed may appear later. | H |
| Contract list (static HTML) `https://itsx.kz/trading-and-data/traded-instruments/derivatives/` | Public, no auth. Lists identification code, first and last trading day, price-determination date, reference value. No prices. Parsed in fixture `derivatives_page_group2_event_options_2026-10-19.json`. Site terms: reproduction of analytical material requires prior written consent. | H |
| Member connectivity (`/services/tech/connectivity/`) | Co-location (USD 500/month per rack unit, 800/month for 10 Gbps), Layer 2 line (USD 500 per month at 100 Mbps, 800 at 1 Gbps), or VPN (USD 100 one-time plus 100 per month per session). **No protocol named** (FIX / ITCH / WebSocket / API: NOT FOUND). Requires a contract with ITS Tech and Trading Member status. | H |
| Member reports (`/services/reports/`) | XML schemas for EXC02 (options agreements of a member), EXC22 (derivatives trading results), CLR07 (options obligations) etc. Member-only and the XML samples were not retrieved. | H (list only) |
| Site CMS JSON `https://itsx.kz/api/pdf/v1/archive/year?year=2026` and `.../archive/year/list` | Unauthenticated JSON listing of daily securities trading-results PDFs on `static.itsx.kz`. Undocumented, used by the site's own front end. The PDFs I opened (2026-09-09, 2026-10-16) are price tables for securities only: no derivatives, no volumes. Sample in fixture `site_cms_archive_year_sample_2026-10-19.json`. | H |
| WebSocket | NOT FOUND | - |
| Rate limits | NOT FOUND | - |

Embedded credential note: the itsx.kz page source exposes a client-side API key for a second host (`indexapi.itsx.kz`, index data) in its runtime config. I did not use it, call that host, or record the value.

## 5. Trade path

- **Programmatic placement**: only through a registered **Trading and Clearing Member** (brokers and management companies licensed in foreign states are eligible; accreditation about 1.5 months; Default Fund USD 30,000; KYC/FATCA; dedicated 100 Mbps line or VPN; additional approvals for derivatives) (H, itsx.kz/services/membership, clearing/collateral). Clients must be registered under the Regulations on Clearing Activities and trade through a Member.
- **Eligible clients for event options**: Professional Clients and eligible Semi-professional Clients passing an appropriateness assessment; retail excluded; individuals at least 21 (H, AFSA release). Group 2 footnote on the ITS page cites the same notice (H).
- **Auth / signing**: member-system credentials and channel; no wallet signatures, no EIP-712, no on-chain transaction. Protocol details NOT FOUND.
- **Reachable through PayBox?** **No.** There is no chain, token, contract address or signed-order scheme. A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet cannot propose a transaction that trades, funds or settles on ITS. Only a regulated broker that is an ITS Member could, and none was found that serves crypto-wallet agents (searched: ITS site; broker lists NOT FOUND).

## 6. Fees

- **Clearing fee, Group 2 options: 1% of the contract amount** (price in USD x number of options), "charged to each Clearing Member that is a party to the Option", i.e. both buyer's and seller's clearing members, on the trade date via the clearing pool (H, ITS Tariffs for Clearing Services, resolution of 2026-09-03, s.4.8 row 2). Compare Group 1 stock options at 0.0095% (row 1).
  - Worked example: buy 100 options at 0.50 -> contract amount USD 50 -> clearing fee USD 0.50 charged to each side. Round-trip cost to hold to expiry per side is 1% of premium notional, which is 0.5 cent on a 50c contract.
  - Minimum 0.01 unit; amounts rounded up to 0.01 (H).
- Trading-platform fee (exchange fee): NOT FOUND (searched: governing documents list, Tariffs PDF). Broker/Member commissions: NOT FOUND (set by each Member).
- Settlement is by cash payment of premium T+1 and principal on the next trading day after expiration; no gas.

## 7. Resolution and dispute risk

- Settlement price is USD 1.00 if the Underlying Event occurred according to the published value of the Variable in the named **Source** on the Settlement Price Determination Date, else USD 0.00 (H, Spec 4.2.1).
- Sources named in the List of Parameters (H, Appendix 1): Federal Reserve website for Fed funds; National Bank of Kazakhstan website for the base rate; **the Company's own website** for the SpaceX price (`itsx.kz/trading-and-data/market-data/`) and for the BTC index (`itsx.kz/trading-and-data/indexes/`). The Specification's definition of Source says "independent publicly available data source", but for two of four underlyings the Source is the operator.
- Fallback (Spec 6.1): if the Source has no data, changes methodology, malfunctions or there is a "manifest error or any other emergency circumstance", the **Event Resolution Committee (ERC)** decides, and the Company may change the price-determination or settlement date, determine the event from the latest data or another recognised public source, adjust technical parameters to "preserve the economic equivalence", or suspend trading. Adjustments may touch existing positions "to the extent necessary".
- ERC (H, Regulations approved 2026-09-07): three **ITS employees** (head of Risk Management, head of Clearing, COO); quorum two; simple majority; COO has the casting vote in a 2-member tie; members sign a pledge not to trade options and must recuse on conflicts. Operative part of each decision and its sources are published on the website the same calendar day; minutes with reasons are available to Trading Members on request. It may pick an alternative source "ad hoc, directly at the time of the meeting".
- No independent appeal body or external arbitration is described in the documents read (NOT FOUND; AIFC court / IFSA route not researched).
- Risk assessment: low frequency of ambiguity for Fed/NBK, moderate operator-discretion risk for BTC and SpaceX because the operator is both venue, source and (via ERC) final arbiter. CCP-cleared, fully collateralised, so counterparty default risk is low relative to unregulated venues.

## 8. Geo / ToS / automation

- Jurisdiction: AIFC (Astana, Kazakhstan), English common-law framework; regulator AFSA (H). Contracts are not for the general public: "They will not be available to the general retail public" (H, AFSA release). AFSA can "impose or amend conditions and limits, restrict particular products or require testing to cease" (H). The product exists only inside the **FinTech Lab sandbox**; no exit timeline found.
- Automation: no public rule against algorithmic trading found, but access requires Member status and a technical-connection contract; market abuse and financial-crime controls are mandatory (H, AFSA release). Specification 5.4: ITS monitors manipulation and concentration.
- Site copyright notice restricts reproduction of its analytical materials without written consent (H); scraping the contract list is probably tolerable for internal reference but should not be redistributed.
- US/other-country restrictions for foreign members: "Additional approvals for derivatives trading, depending on the entity's jurisdiction" (H, membership page); specifics NOT FOUND.

## 9. Liquidity

- Event options volume, open interest, number of participants: **NOT FOUND** (searched: market-data page, archive PDFs, news feed first page, tariffs, AFSA release). No figure at all as of 2026-10-19.
- Operator-level context only: "around $3.5 billion in turnover" (Finimize, M, company-wide, undated) and "1.2 million+ investors with access" (SiGMA via Shift Markets, L, refers to the platform, not eligible event-option clients).
- Because retail is excluded and each Member must be a licensed foreign broker/management company, expect very thin participation; treat as thin until data appears (M, inference).

## 10. Event overlap with other venues

Only categories where overlap and therefore arbitrage could exist (M, based on contract definitions, not on prices):

| ITS series | Possibly overlapping on | Note |
|---|---|---|
| Bitcoin (CME CF BRTI) above/below X at 16:00 UTC, daily | Polymarket / Kalshi / Limitless daily BTC strike markets | Strike grid, reference index and settle time vs those venues were not compared (NOT checked). Tie leaves both ITS legs at 0. |
| Fed funds higher / lower / unchanged, FOMC 2026-10-28 | Polymarket, Kalshi Fed decision markets | Categories exhaustive; ITS settles at 18:00 UTC announcement time. |
| SpaceX (SPCX) share price vs USD 150 on 2026-10-30 | Possible stock-price binaries on some venues | Existence on other venues NOT verified. |
| NBK base rate | none expected | Unique to Kazakhstan, no cross-venue leg. |

No sports, politics, weather or entertainment coverage by regulation.

## 11. Shared liquidity

ITS is its own MTF with its own CCP. No evidence of shared or mirrored liquidity with another prediction venue (H for the structure; "Routing Agent" role in the rules is for securities routing and its event-option use is NOT FOUND). It would be an independent leg if it were accessible.

## 12. Open questions

1. Will ITS publish indicative quotes or volume on the Market Data page (the Specification points the SpaceX source there)?
2. Is there any ITS Member broker willing to take a programmatic client for event options?
3. Text of AFSA Notice AFSA-FTD-NOT-2026-0025 (not retrieved) and the earlier "Notice on the Expected Approach"; sandbox exit conditions.
4. Business Rules detail on price limits and the Routing Agent for Group 2.

## Sources

- ITS derivatives contracts page (H): https://itsx.kz/trading-and-data/traded-instruments/derivatives/
- ITS Specification of the European-style cash-settled premium option, effective 2026-09-28 (H): https://itsx.kz/static/files/1_ITS_Specification_Option_EVENTS250926.pdf
- ITS Regulations on the Event Resolution Committee (H): https://itsx.kz/static/files/7_ITS_Regulations_on_the_Event_Resolution_Committee.pdf
- ITS Rules for Forming the Identification Code, Group 2 (H): https://itsx.kz/static/files/5_ITS_Forming_the_Identification_Code_EVE250926.pdf
- ITS governing documents index (H): https://itsx.kz/about/governing-docs/ and https://itsx.kz/about/governing-docs/derivatives/
- ITS Tariffs for Clearing Services, 2026-09-03, s.4.8 (H): https://itsx.kz/static/about_its/gov_docs/Tariffs_for_the_Provision_of_Clearing_Services_En_070926.pdf
- ITS Business Rules, chapter XII (H): https://itsx.kz/static/about_its/gov_docs/Business_Rules_070926.pdf
- ITS Clearing Rules, art. 31 derivatives (H): https://itsx.kz/static/about_its/gov_docs/ITS_Clearing_rules_eng_070926.pdf
- ITS derivatives trading hours (H): https://itsx.kz/trading-and-data/trading-hours/derivatives/
- ITS membership, connectivity, collateral, reports, market-making, market data pages (H): https://itsx.kz/services/membership/ , https://itsx.kz/services/tech/connectivity/ , https://itsx.kz/clearing/collateral/ , https://itsx.kz/services/reports/ , https://itsx.kz/services/mm/ , https://itsx.kz/trading-and-data/market-data/
- ITS site CMS archive listing (H): https://itsx.kz/api/pdf/v1/archive/year?year=2026
- AFSA release "AFSA Enables Testing of Event-Based Contracts in the AIFC FinTech Lab", 2026-09-10 (H): https://aifc.kz/news/afsa-enables-testing-of-event-based-contracts-in-the-aifc-fintech-lab/
- AIFC: Astana Finance Days 2026 results, mentions the legal framework for testing event-based contracts and AFSA recognising ITS clearing participation certificates (H): https://aifc.kz/news/astana-finance-days-2026-results-us26-trillion-in-assets-under-management-8000-participants-from-90-countries-and-special-guest-dimash-qudaibergen/
- AFSA FinTech Lab and notice register pages (H, no event-contract notice listed there): https://afsa.aifc.kz/fintech/ , https://afsa.aifc.kz/notice-register/
- Shift Markets prediction markets brief, September 2026, citing SiGMA 2026-09-08 (L/M): https://www.shiftmarkets.com/prediction-markets-brief/september-2026
- Finimize, "Kazakhstan Wants Astana To Be A Prediction Markets Hub" (M, undated): https://finimize.com/content/kazakhstan-wants-astana-to-be-a-prediction-markets-hub
- GlobeNewswire release 2026-09-11 "Kazakhstan-based ITS launches Prediction Market ..." (M; only seen through a search summary, direct fetch returned 403): https://www.globenewswire.com/news-release/2026/09/11/3360234/0/en/kazakhstan-based-its-launches-prediction-market-with-event-options-linked-to-bitcoin-spacex-and-central-bank-rates.html
- Ruled out as unrelated: https://its.kz (hosting placeholder), https://its.com.kz (1C services), https://its.global (parked).
