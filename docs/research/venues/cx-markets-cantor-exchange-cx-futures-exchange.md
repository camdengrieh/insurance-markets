# CX Markets (Cantor Exchange / CX Futures Exchange): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public web pages, public CFTC filing pages and PDFs, public rulebook PDFs, generic unauthenticated GETs. No account, wallet, login, POST, signing, payment or browser automation. Generic User-Agent `insurance-markets-research/0.1` on all scripted requests.

Confidence tags: **H** = read first-hand in a primary source this session (cited), **M** = secondary source, summariser output or my inference from first-hand data, **L** = weak or stale. "(fetch-summarised)" means the page went through the WebFetch summariser and was not read raw.

## 0. Bottom line

**adapter_priority: skip.** There is no live, tradable "CX Markets" prediction venue to quote or trade on 2026-10-19, and no public API of any kind.

1. **The name "CX Markets" now points at three different things.** (a) The legacy exchange entity CX Futures Exchange, L.P. (originally Cantor Futures Exchange) was renamed **FMX Futures Exchange, L.P.** and lists US Treasury and SOFR futures, not event contracts. (b) The cxmarkets.com website was re-branded to **Water Street Labs, LLC (WSL)**, a brand-new CFTC DCM designated 2026-07-16. (c) The old **TradeWeather** weather-contract front end at `trading.cxmarkets.com` serves only a static "Temporarily Offline for Maintenance" page dated 2021. [H, sections 1 and 2]
2. **WSL has been designated but shows no sign of trading.** No contract list, no market data page, no product filing at the CFTC, rulebook contract chapter "reserved", website is a three-link stub. [H/M, section 2]
3. **Ownership: Fanatics.** BGC Group sold WSL and CX Clearinghouse L.P. to Fanatics (agreement announced 2026-07-27; BGC's 10-Q calls both "former subsidiary"). The stated purpose is to let Fanatics Markets list and clear its own prediction markets. [H/M, section 1] If WSL later becomes the book behind Fanatics Markets it is **not an independent arbitrage leg** relative to Fanatics Markets, and today Fanatics Markets still routes to the Crypto.com / CDNA book. [H/M, section 12]
4. **Not reachable from PayBox / an EVM wallet.** USD collateral at a US clearinghouse, non-intermediated KYC'd Participants, no chain. [H, section 6]

**Revisit triggers (cheap to poll):** (i) `https://cxmarkets.com/` gains a markets / contracts / market-data link; (ii) the CFTC DCM rule/product filing pages (https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizationProducts and `.../TradingOrganizationRules`) start showing a Water Street Labs organisation code (none in the filter list on 2026-10-19); (iii) Fanatics Markets legal pages (`/legal/disclosures`, `/legal/availability`) start naming Water Street Labs or CX Clearinghouse instead of CDNA (grep found no mention on 2026-10-19); (iv) the CFTC row for WSL (https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/59469) gains an amended order permitting FCMs.

## 1. Is it still live? Entity map

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| "Cantor Exchange, LLC" (first application; Wikipedia ties the name to a 2008 Hollywood Stock Exchange box-office plan) | CFTC row **Withdrawn**, dated 2008-11-20 (remark mentions a 2006-01-26 stay request) | H, CFTC DCM list, fixture `cftc-dcm-rows-cx-lineage.json` |
| Cantor Futures Exchange, L.P. -> CX Futures Exchange, L.P. -> **FMX Futures Exchange, L.P.** | Designated 2010-04-20; CFTC remark: "formerly CX Futures Exchange, L.P. and originally Cantor Futures Exchange, L.P."; "FMX Division" with intermediated trading approved 2024-01-22. BGC's 10-Q glossary: FMX operates an exchange for US Treasury futures and SOFR futures; CFTC rule filings dated 2026-10-01 to 2026-10-16 are Treasury / SOFR incentive programs. | H (CFTC row and filing list; 10-Q glossary fetch-summarised) |
| CX Futures Exchange forex / gold binary options and weather contracts (TradeWeather) | Wikipedia stub (last edited 2026-06-09): forex and gold binaries stopped listing after 2019-03-29 "until further notice". `trading.cxmarkets.com` returns the same static 9,064-byte TradeWeather "Upgrades and Improvements - In Progress / Temporarily Offline for Maintenance" page for every path, `Last-Modified: 2021-06-02`, `X-Cache: Error from cloudfront`, footer "(c)2021 CX Futures Exchange, L.P." | H for the headers and page text (fixture `trading-cxmarkets-com-maintenance-page-headers.txt`); M for my reading that the origin app is down and CloudFront is serving its error page; Wikipedia fetch-summarised, L for currency |
| **Water Street Labs, LLC** (DCM) | CFTC **Designated 2026-07-16** (Order of Designation, application record 2025-12-16 to 2026-07-16). Delaware LLC, New York. Equity owned by Water Street Labs Holdings, LLC. Rulebook v1.0 dated 2025-10-24, current v1.8 dated 2026-07-02, uploaded to cxmarkets.com 2026-08-19. | H: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/59469 , order PDF (fixture `cftc-wsl-order-of-designation-2026-07-16.extracted.txt`), WSL rulebook (fixture `wsl-rulebook-excerpts-v1.8-2026-07-02.txt`) |
| **CX Clearinghouse, L.P.** (DCO) | CFTC **Registered 2010-04-20**, "Formerly known as Cantor Clearinghouse, L.P. ... permitted to clear fully collateralized futures, options on futures, and swaps." Rulebook v1.2 dated 2025-07-07 still names "CX Futures Exchange, L.P." as the Exchange. | H, fixture `cftc-dco-row-cx-clearinghouse.json`, https://cxmarkets.com/wp-content/uploads/2025/07/CXClearinghouseRules-20250707.pdf |
| cxmarkets.com | Live WordPress site titled "WATER STREET LABS"; only links: Rules, Contact Us, "Access Your Funds" (-> the offline `trading.cxmarkets.com/transfers`). Footer "(c) 2026 WATER STREET LABS". Contact addresses are on the `fanaticsmarkets.com` domain. `robots.txt` allows all except wp-admin; `<meta robots noindex,nofollow>`. | H, fixture `cxmarkets-com-site-text-2026-10-19.txt` |
| Sale to Fanatics | Agreement announced 2026-07-27 (Fanatics acquires WSL and CX Clearinghouse from BGC Group; BGC and Fanatics also partner on data products and "retail and institutional" prediction markets). BGC's Q2 2026 10-Q glossary describes both as "former subsidiary". A search summary (not re-verified in the filing) says the sale completed 2026-08-05. | H for the 10-Q glossary lines (fetch-summarised); M for the announcement via PYMNTS 2026-07-27, Gaming Intelligence 2026-07-27, Pulse 2.0 2026-07-31, FinanceFeeds 2026-07-28, Investing.com 2026-07-27 (the GlobeNewswire release itself returned HTTP 403); M/L for the 2026-08-05 date |

Verdict: **still_live = false** for the "CX Markets / Cantor Exchange" prediction, forex-binary or weather product. The only live regulated venue on the legacy entity is FMX (rates futures, irrelevant to event arbitrage), and WSL is designated but not visibly operating.

Hint from discovery ("current status unclear") is resolved: renamed and re-purposed, as above.

## 2. Kind and market model (what WSL says it will be)

- **Kind:** CFTC-designated contract market (DCM), non-intermediated, fully collateralized, cleared at CX Clearinghouse (DCO). Owned by Fanatics since the August 2026 close (M, see section 1). [H for DCM/DCO facts]
- **Market models (from the CFTC order, H):** "anonymous trading of fully collateralized futures and swaps on a (1) two-sided central limit order book, and (2) a parimutuel single-sided auction". The order also says WSL "will not permit any futures commission merchant to intermediate any transactions or carry accounts for customers", and condition (3) bars FCM intermediation "unless this Order of Designation has been amended".
- **CLOB mechanics (H, rulebook IV-5, IV-7):** limit orders only; price-time priority; cancel/replace allowed on the book; optional two-sided single-price opening auction with an "Equilibrium Price" (IV-20).
- **Pari-mutuel mechanics (H, IV-5):** single-sided bids "executed and cleared immediately for the full quantity" and "may not be cancelled".
- **Outcome tokenisation:** none. Positions are cleared contracts at CX Clearinghouse (novation, rulebook X-4). No ERC-20/1155/SPL tokens. [H]
- **Binary / categorical / scalar:** NOT FOUND. Contract terms are in "Chapter IX ... reserved" (CFTC Exhibit L-1, H) and no contract rule or self-certification has been published (searched: WSL rulebook, CFTC DCM product and rule filing lists, cxmarkets.com). "Futures and swaps" with a pari-mutuel auction is consistent with binary event-style contracts and with the old TradeWeather landfall / rainfall / snowfall / high-temperature ladders, but that is inference (L).

## 3. Chains and collateral

- **Chains:** none. [H]
- **Collateral:** "U.S. Dollars on deposit in a Clearinghouse Custody Account" (CX Clearinghouse rule IV-9(a), plus any asset a Contract Rule designates) and each order is credit-checked against Available Funds (WSL IV-4). [H, fixture `cx-clearinghouse-rules-excerpts-2025-07-07.txt`]
- **Funding rails:** NOT FOUND beyond "a mechanism that is acceptable for transferring funds to and receiving funds from the applicant's Clearing Account" (WSL III-3(c)/(d)) and the "Access Your Funds" link, which is dead (maintenance page). No crypto/stablecoin route appears anywhere in either rulebook (searched "stablecoin", "digital", "crypto" terms: none).

## 4. Read API

**Official: none** (`exists = none`). Searched: cxmarkets.com (three pages), `robots.txt`, `sitemap.xml` (404), `wp-sitemap.xml` (404), WSL rulebook, CX Clearinghouse rulebook, CFTC Form DCM exhibits L/U/cover (public ones), host probes `api.`, `docs.`, `developer.`, `regulatory.cxmarkets.com` (DNS does not resolve), `regulatory.cantorexchange.com` (301 to cxmarkets.com), `cantorexchange.com` and `tradeweather.com` (TLS name mismatch, nothing served).

- The rulebook contemplates an API: V-12 regulates "any application programming interface(s), software development library(ies), or internet-based connection(s)" and system certification, and the WSL Direct System is accessed "directly via the Internet" (H). No spec, base URL, auth scheme, rate limit or WebSocket is public. NOT FOUND.
- Public data duty: the Exchange must publish CFTC Reg. 16.01(e) daily data (volume, open interest, prices) on its website (IV-8, Core Principle 8; H). The CFTC filing says the Exchange web address "will be available 60 days prior to the Exchange becoming operational" (H, Exhibit L-1). No such data page exists on 2026-10-19.
- Redistribution of data received through the WSL Direct System is prohibited unless the Exchange permits it (IV-10; H).
- Third-party feeds: NOT FOUND, and not searched for beyond this venue's own sources (the project's aggregator notes `ccxt-prediction-module.md` and `dome-api-polyrouter-pmxt-cross-venue-data-apis.md` cover the generic aggregators).
- **No fixtures of an API response exist because there is no API.** Evidence fixtures saved instead (section 15).

## 5. Trade path

- **Programmatic placement: none available today.** Direct (non-intermediated) Participants enter limit orders through the proprietary WSL Direct System via Authorized Traders (defined as natural persons). API/connectivity is permitted in principle (V-12) but requires Exchange certification and no onboarding documents are public. [H for rules, NOT FOUND for onboarding/API]
- **Who can be a Participant:** natural persons (age of majority, funds mechanism, at least one Authorized Trader) and entities; positions only for "proprietary Trading Accounts"; FCMs / intermediaries may not submit customer trades (III-3(a),(c),(d),(h)); "Referring Participants" may solicit orders but not enter orders for the referred Participant (III-11). [H]
- **Auth / signing scheme:** NOT FOUND. Not wallet-signature based as far as any document indicates.

## 6. Reachable from PayBox / an EVM or Solana wallet?

**No (paybox_reachable = no).** There is no on-chain component: collateral is USD at a US DCO, access requires onboarding as a Participant with a Clearing Account, and the exchange rules bar intermediaries from submitting customer trades. A transaction proposal or signed order from an EVM / Solana wallet has nothing to target. [H]

## 7. Fees

NOT FOUND. WSL III-5 and CX Clearinghouse IV-11 both say the Board "shall have the sole authority to set the times and amounts of any fees"; the Form DCM fee exhibit (Exhibit K) is under a confidentiality request (Exhibit U). Incentive programs, DPMs and market makers are provided for (III-6, V-10, V-11) with no terms. [H]

## 8. Resolution mechanism and dispute risk

- **Settlement / resolution:** per individual Contract Rules, which do not exist publicly yet (IX-1, "reserved"). Cleared and settled at CX Clearinghouse (X-1). NOT FOUND for any oracle or source of truth. [H]
- **Disputes:** error-trade review request within ten minutes of an incorrect execution (IV-11), Exchange emergency powers (IV-18), NFA-run arbitration under NFA Member Arbitration Rules with a rule against suing first (VIII). [H]
- **Structural risk:** a newly designated exchange with an untested rulebook, an ownership change right after designation, a clearinghouse rulebook (2025-07-07) that still names the old exchange entity, and an order of designation whose "no FCM" condition conflicts with Fanatics's FCM-intermediated retail model (the other note shows Morton St. Trading Investments as Fanatics's FCM, see `fanatics-markets.md`). Any of these may be amended. [H for each document; the conflict is my inference, M]

## 9. Geo / ToS / automation

- No Terms of Use, user agreement or geo-availability page was found on cxmarkets.com (3 pages only) or at `trading.cxmarkets.com`. NOT FOUND.
- Rulebook limits relevant to an automated scanner: no spoofing or layering (VI-12), no wash trading (VI-14), market-data redistribution banned (IV-10), connected systems must not cause disruption and must be certified (V-12), orders entered by natural-person Authorized Traders (definition), Exchange discretion to deny access (III-3(f)). [H]
- US-regulated, so US-person access is the expected audience; no explicit geofence text found. [L]

## 10. Liquidity

NOT FOUND. No volume, open interest or TVL exists because no WSL contracts are known to be listed. TradeWeather and the forex binaries are dormant (section 1). FMX's Treasury/SOFR volumes are irrelevant to this project and were not looked up. [H for absence in the sources read]

## 11. Event categories and overlap

None today. Fanatics's stated aim for owning an exchange is to "directly list and clear" prediction markets (M, press coverage 2026-07-27), and Fanatics Markets today offers sports, culture, finance and politics contracts (M, PYMNTS). If WSL lists those, overlap with Polymarket / Kalshi / Crypto.com would be in sports and politics, but that is speculation until a contract list exists. Historic CX products (forex binaries, weather, box-office) have no overlap with other event venues except weather markets elsewhere. [L]

## 12. Shared liquidity (is it an independent leg?)

- **Today:** not applicable (no market). Fanatics Markets itself still routes to Crypto.com | Derivatives North America (CDNA); its Aug/Sep/Oct 2026 legal pages contain no mention of Water Street Labs or CX Clearinghouse (grep of `/`, `/legal`, `/legal/disclosures`, `/legal/availability`, `/legal/fcm-fee-disclosure`, `/legal/customer-agreement` on 2026-10-19: no hits; H) and NEXTPredict (2026-09-18) still describes the CDNA arrangement (M).
- **If WSL goes live:** it is Fanatics-owned and would become the book behind Fanatics Markets, so treat WSL and Fanatics Markets as one liquidity pool and one adapter. BGC is a data and institutional-distribution partner, which may bring cross-posted liquidity. [M]

## 13. Adapter priority

**skip.** No markets, no API, no PayBox route, dormant legacy products. Revisit only on the triggers in section 0. If it ever launches with an API, the likely adapter class is "US regulated CLOB, KYC'd direct access, USD", comparable to the Kalshi / CDNA pattern, and it should be spec'd together with Fanatics Markets.

## 14. Open questions

1. Exact closing date of the WSL / CX Clearinghouse sale (search summary says 2026-08-05; the GlobeNewswire release and SEC EDGAR returned 403 to scripted fetches).
2. Which contracts WSL will list first, and whether WSL's order of designation will be amended to allow FCM intermediation for Fanatics's retail flow.
3. Whether the TradeWeather weather contracts still exist anywhere (the `trading.cxmarkets.com` app origin appears down) and whether FMX or WSL inherited the old CX rulebook for them.
4. Whether the 2025-07-07 CX Clearinghouse rulebook has since been amended to name Water Street Labs.
5. FMX Futures Exchange is not a prediction venue; no work done on it beyond identifying the lineage.

## 15. Fixtures

`docs/research/fixtures/cx-markets-cantor-exchange-cx-futures-exchange/` (all small; evidence of status, not API samples because no API exists):

- `cftc-dcm-rows-cx-lineage.json` (CFTC DCM search rows: Water Street Labs, FMX, Cantor Exchange, plus Crypto.com and Polymarket US for comparison)
- `cftc-dco-row-cx-clearinghouse.json`
- `cftc-wsl-order-of-designation-2026-07-16.extracted.txt` (4-page public CFTC order, text extracted locally)
- `wsl-rulebook-excerpts-v1.8-2026-07-02.txt` and `cx-clearinghouse-rules-excerpts-2025-07-07.txt` (short verbatim excerpts)
- `cxmarkets-com-site-text-2026-10-19.txt` (visible text and links; contact addresses omitted)
- `trading-cxmarkets-com-maintenance-page-headers.txt`

## 16. Sources

Primary (H):
- CFTC DCM list: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations (queried with `Show_All=1`, Status filters Designated / Dormant / Vacated / Withdrawn), 2026-10-19
- CFTC filing page, Water Street Labs: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/59469
- CFTC Order of Designation, 2026-07-16: https://www.cftc.gov/filings/documents/2026/orgdcmwslorderdesgsign260716.pdf
- CFTC Form DCM cover sheet, Exhibits L and U: https://www.cftc.gov/filings/documents/2026/orgdcmwslcoverpage260127.pdf , `.../orgdcmwslexhibitl260127.pdf` , `.../orgdcmwslexhibitu260127.pdf` (an earlier version of the rulebook was filed 2026-01-27 as Exhibit M and was not downloaded; Exhibit K, fees, is confidential)
- CFTC filing page, FMX Futures Exchange (formerly CX Futures Exchange): https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizations/16669
- CFTC DCO list (CX Clearinghouse): https://www.cftc.gov/IndustryOversight/IndustryFilings/ClearingOrganizations
- CFTC DCM rule and product filing lists: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizationRules , `.../TradingOrganizationProducts`
- Water Street Labs rulebook v1.8: https://cxmarkets.com/wp-content/uploads/2026/08/WSL-Exchange-Rules-20260702.pdf
- CX Clearinghouse rulebook v1.2: https://cxmarkets.com/wp-content/uploads/2025/07/CXClearinghouseRules-20250707.pdf
- https://cxmarkets.com/ , /contact-us/ , /exchange-and-clearinghouse-rules/ , https://trading.cxmarkets.com/transfers
- https://fanaticsmarkets.com/ and its `/legal*` pages (grep only)

Secondary (M):
- BGC Group Form 10-Q for the period ended 2026-06-30 (glossary lines via WebFetch summariser; direct curl blocked): https://www.sec.gov/Archives/edgar/data/0001094831/000162828026055187/bgcg-20260630.htm
- https://www.pymnts.com/partnerships/processor-acquisition/2026/fanatics-strikes-deal-acquire-cftc-registered-infrastructure-prediction-markets/ (2026-07-27)
- https://www.gamingintelligence.com/finance/233984-fanatics-acquires-its-own-prediction-market-exchange-from-bgc-group/ (2026-07-27)
- https://www.investing.com/news/company-news/fanatics-to-acquire-bgcs-prediction-market-exchange-units-93CH-4813936 (2026-07-27)
- https://pulse2.com/fanatics-to-acquire-exchange-and-clearinghouse-from-bgc/ (2026-07-31)
- https://financefeeds.com/fanatics-makes-its-boldest-prediction-market-move/ (2026-07-28)
- https://nextpredict.io/platforms/fanatics/ (2026-09-18)
- https://thesource.com/2026/07/28/fanatics-markets-bgc-prediction-market-acquisition/ (2026-07-28)
- https://www.sgieurope.com/technology/fanatics-brings-some-financial-plumbing-in-house/122448.article (2026-07-29, paywalled; title only)
- Press release (not readable here, HTTP 403): https://www.globenewswire.com/news-release/2026/07/27/3333493/0/en/fanatics-to-acquire-exchange-and-clearinghouse-from-bgc-parties-to-partner-on-prediction-markets.html

Weak / stale (L):
- https://en.wikipedia.org/wiki/CX_Futures_Exchange (stub, content stops at 2019; last edited 2026-06-09)

## 17. Process notes

- WebSearch budget ran out after two searches; the remaining facts come from direct fetches. A search-engine summary (not re-verified) is the only source for the 2026-08-05 closing date.
- `sec.gov` returned "Undeclared Automated Tool" (HTTP 403) to the generic User-Agent: blocked: requires a contact address, so the 10-Q was read only through the WebFetch summariser. GlobeNewswire also returned 403 (Akamai); not worked around.
- PDFs were parsed with a small local Python script (no third-party code); extraction left letter-spacing artifacts, so quotes in the fixtures are cleaned wording and rule numbers follow each rulebook's table of contents.
- No embedded instructions aimed at AI agents were found in any page, PDF or API response read (suspicious_content: none).
- Privacy: no personal identifier was sent in any request, query or header; scripts were scanned for "@" and the user's name before use.
