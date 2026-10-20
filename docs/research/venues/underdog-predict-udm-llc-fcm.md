# Underdog Predict (UDM, LLC, CFTC-registered FCM) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, public legal PDFs, a CFTC public FCM report, and unauthenticated GETs to two public data hosts that Underdog's own data page publishes. No account, wallet, key, signature, POST/PUT/DELETE or money-moving PayBox tool was used (two read-only PayBox `discover_*` queries only). Third-party pages were treated as untrusted data. WebSearch quota was exhausted (shared limit) before I could use it, so there is no search-engine corroboration; everything below comes from fetched pages.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference from first-hand data; **L** = weak/stale. "(wf)" = read through the WebFetch summariser rather than as raw text. "NOT FOUND (searched: ...)" where nothing was found.

Sibling note (read it together with this one): `docs/research/venues/underdog-predict-underdog-exchange-udx.md` covers **UDX**, Underdog's own exchange (independent order book, EOD data files, P2). This note covers the **UDM, LLC FCM / "Underdog Predict" front end** and what it routes. I re-verified the points where the two overlap (marked H below) and did not repeat the UDX contract-family analysis.

Fixtures (real responses/extracts, each <= 50 KB): `docs/research/fixtures/underdog-predict-udm-llc-fcm/` (section 15).

---

## 0. Bottom line

1. **Live (H).** Underdog's prediction-market business did $132.6M notional on 2026-10-17, its peak day (official data JSON generated 2026-10-18). The FCM, UDM LLC, appears in the CFTC's FCM financial report as of 2026-08-31.
2. **UDM is a broker, not a venue.** It is a registered clearing FCM (NFA member) whose only exchange/clearing membership is **Kalshi Klear, LLC**; its FCM agreement with Crypto.com's exchange (NADEX/CDNA) was "not operational" as of the 2026-07-20 disclosure (H). UDM's own docs say orders may be executed "on any exchange or other market ... in the discretion of UDM" and that settlement follows "the rules of the listing exchange" (H).
3. **Not an independent arbitrage leg.** Kalshi-routed contracts bought through UDM are the same order book as Kalshi. UDX contracts shown in the Underdog app are **not** executed by UDM at all: UDX Rule 4(a)(ii) bars any FCM or IB from submitting trades (H). So the only independent Underdog liquidity is UDX (separate slug, P2); UDM adds nothing independent.
4. **No API of any kind (H/M).** No developer portal, docs, OpenAPI, WebSocket or FIX spec (`/developers` returns 404). Orders go through the Underdog app/website only. The account agreement requires the customer to "place all trades ... directly yourself" unless a third-party agent is disclosed and approved in advance.
5. **PayBox cannot reach it.** USD only; funded solely from a linked Underdog Fantasy account; KYC; US-state geofence; no chain, no wallet signing (H).
6. **adapter_priority = skip** for this slug. Use the Kalshi adapter for the Kalshi leg and the UDX note for the independent leg. The only useful thing here is a daily demand signal from Underdog's public overview JSON (section 5a), which belongs inside the UDX signal adapter.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.underdogsports.com/predict` returns HTTP 200 (`underdogsports.com/predict` and `underdogpredict.com` 301 to it); page text: "Underdog Predict is a registered FCM offering event contracts." | Live | H |
| Official overview JSON `generated_at` 2026-10-18T12:10:21Z, `data_through_date_et` 2026-10-17; non-zero volume every month since 2025-09; `pm_launch_date` "2025-08-21" | Live and growing | H |
| CFTC "Financial Data for FCMs" report as of 2026-08-31 lists "UDM LLC" (FCM, DSRO NFA, row 71) | Registered and reporting | H |
| UDM legal docs: Futures Account Agreement v2.0 effective 2026-08-11; Additional Risk Disclosure effective 2026-10-08; 1.55(k) updated 2026-07-20 | Active rule/paperwork churn | H |
| next.io 2026 page: "In July 2026, Underdog agreed to be acquired by UK-based IG Group ... up to $1.3 billion ... pending regulatory approval, closing late 2026 or early 2027" (wf, not corroborated; IG's news page returned nothing usable) | Ownership change pending | M/L |

Verdict: **still_live = true** (as a front end). Watch item: an IG Group takeover (M/L) could change terms.

---

## 2. Kind and entity map

- **Kind (H):** broker / front end. "UDM, LLC d/b/a Underdog Predict" is a CFTC-registered Futures Commission Merchant and NFA member (Terms of Use s.5; 1.55(k) s.1). Address 150 Waterbury Street, Brooklyn NY. It "clears all of its customers' transactions through a registered derivatives clearing organization" (1.55(k) s.3). Customers are "US-based retail" with "self-directed accounts".
- **Page text (H, raw HTML of `/predict`):**
  - "Event contracts are offered by one or more designated contract markets (DCMs) including UDX, Kalshi, and Crypto.com | Derivatives North America."
  - Three separate disclaimers: (a) UDM LLC FCM; (b) "Aristotle Exchange DCM, Inc. and Aristotle Exchange DCO, Inc. ('Underdog Exchange' or 'UDX')"; (c) "Crypto.com Derivatives North America via Underdog as a Technology Service Provider".
  - The page does not explain which orders go where.
- **What UDM can actually route (H, 1.55(k) s.3, data as of 2026-06-08, doc updated 2026-07-20):** "UDM is a member of Kalshi Klear, LLC. In addition, UDM, LLC entered into an FCM member agreement with North American Derivatives Exchange (NADEX) dba crypto.com, which is not operational at this time. UDM does not currently hold any other futures exchange or clearing organization memberships."
- **UDX is not a UDM route (H):** UDX Rulebook v1.4 (effective 2026-10-01) Rule 4(a)(ii): "No registered Futures Commission Merchant, registered Introducing Broker, or other intermediary may submit trades in Contracts for execution on behalf of its customers." The UDX Terms of Use also describe UDX as "separate from ... UDM, LLC d/b/a/ Underdog Predict". So UDX users trade as UDX participants (still with a Linked Underdog Account), not through the FCM.
- **CDNA (Crypto.com) contracts (H/M):** the page says they are offered "via Underdog as a Technology Service Provider", i.e. CDNA's own onboarding/FCM, not UDM, which fits UDM's CDNA agreement being "not operational". Whether CDNA flow is live in the app today: NOT FOUND (no post-July source).
- **Net:** today the UDM FCM path is, on the evidence, **Kalshi only** (M, inference from the membership list; the 1.55(k) is 3+ months old).
- **History (M, gaming.net 2026-07-20 via wf):** product launched September 2025 (data file says 2025-08-21), routed "first Crypto.com and later Kalshi"; Aristotle DCM/DCO acquired March 2026; UDX launched 2026-07-18 and takes over in-house the contracts Underdog used to route out.

---

## 3. Market model

- Contracts are exchange-defined; the front end only presents them. Account Agreement s.15 (H): event contracts "will be typically presented as a 'Yes/No' trade", fully collateralised, "settled by cash payment ... as determined under the rules of the listing exchange and/or its clearinghouse"; "some of these contracts are considered 'swaps'".
- Kalshi-routed contracts: binary yes/no CLOB contracts on Kalshi's book (see the Kalshi spec, `docs/research/08-venues-polymarket-kalshi.md`). No tokenisation: positions are rows at the clearinghouse/FCM.
- next.io (wf, M): prices $0.01 to $0.99; "early cash-out" while in an eligible location; also "Combo entries" that pair prediction picks with at least two fantasy picks (settled separately). Parlay/"combo" products here are a fantasy hybrid, not tradable legs on another venue.
- Order types, tick sizes and minimum sizes in the Underdog app: NOT FOUND (no public order-entry documentation; `app.underdogsports.com/rules/prediction-picks` returned 403 to WebFetch and was not retrieved).

---

## 4. Chains and collateral

- **No blockchain (H).** USD only. Customer funds sit with UDM at Banc of California; 1.55(k): "the current policy of UDM is not to invest such funds in any investments permitted by CFTC Regulation 1.25"; held in the Cleared Swaps Customer Account (no 30.7 account) (H).
- **Funding runs through Underdog Fantasy (H, Account Agreement s.2):** "Your Account can only be funded from your Linked Underdog Account"; UDM may auto-transfer funds from the linked account and sweep excess cash back at end of day; you "agree to maintain a net liquidating balance of $1,000.00 between your Linked Underdog Account and your Account at UDM". Funds in the Linked Underdog Account lose CFTC customer protection (Underdog Sports, LLC is not CFTC-regulated).
- next.io (wf, M): $10 minimum deposit, no deposit/withdrawal fee, withdrawals up to 72 hours, PayPal/Venmo cannot fund prediction entries. (Conflicts mildly with the $1,000 net-liquidating-balance clause; the clause is the contract, treat next.io as L on this.)
- Fully collateralised: the order is rejected if funds are insufficient (Account Agreement s.15).

---

## 5. Read API

**Verdict: `exists = none`** for markets, prices, books, trades or resolution. Only aggregate platform statistics are public.

### 5a. Public, unauthenticated, official, aggregate only (H)

| Endpoint | What | Notes |
|---|---|---|
| `GET https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json` | `schema_version` "2.1.0"; `labels` (443 ET dates 2025-08-01..2026-10-17); `metrics.{notional, notional_udx, notional_other_exchange}.daily` (USD millions) and `.all_time`; `metrics.transactions` (thousands); `highlights` (`peak_day`, `peak_month`, `pm_launch_date`, `udx_ga_date`) | 18,151 bytes, `application/json`, HTTP 200, regenerated daily. `notional_other_exchange` is Underdog flow executed on exchanges other than UDX, i.e. the UDM-routed (Kalshi, possibly CDNA) volume. No auth, no rate limit documented (NOT FOUND). Fixture saved. |
| `GET https://cftc-public-reports.underdogfantasy.com/manifest.json` | Index of UDX daily CFTC-format report files (2026-06-24..2026-10-17, 113 per list) | 126,595 bytes. **UDX only**; says nothing about UDM-routed trades. Trimmed fixture saved. Daily files are covered in the UDX note. |

### 5b. Everything else

- No developer portal, API docs, OpenAPI, GraphQL, WebSocket, FIX spec, SDK or MCP server found. Searched: `underdogsports.com/developers` (soft-404 "Not Found" page, HTTP 404), `docs.` and `developer.underdogsports.com` (do not resolve), `underdogsports.com`, `/exchange`, `/predict`, `legal.underdogpredict.com`, the UDM Terms/Account Agreement, GitHub (`gh search repos "underdog predict"`, `gh search code "underdogpredict"`, org `Underdog-Inc`: 18 public repos, none an API or client, only generic forks incl. `quickfix` and `quickfix-ruby-ud`, which hints at internal FIX use, L). `help.underdogsports.com` returns 403 to scripts and was not retrieved.
- Third-party profile (M): API Evangelist's repo `api-evangelist/underdog-fantasy` (probe dated 2026-08-02) states "Underdog publishes no public API" and that `api.underdogfantasy.com` is the non-public backend for the app. Consistent with my probes. I did not touch `api.underdogfantasy.com`.
- For the Kalshi-routed leg, read Kalshi's own public API instead (see the Kalshi spec).

---

## 6. Trade path

**None for an agent.**

- Only channel: the Underdog app/website ("internet-based electronic order entry", Account Agreement s.4(c), s.14). No API key, no FIX, no signing scheme exists publicly (NOT FOUND).
- Account Agreement s.4(a)(iv) (H): "You will place all trades for your Account directly yourself without the services of a third-party agent acting on your behalf unless you have expressly disclosed your use of such third-party agents to UDM in writing and we have granted our advance approval."
- Terms of Use s.6(ix) (H) forbids accessing the Services "in an automated way, using any robot, spider, scraper, web crawler, or using any method of access other than manually accessing the publicly-available portions of the Services through a browser or accessing the Services through any approved mobile application, application programming interface, or client application". An "approved ... application programming interface" is contemplated but none is published.
- Account Agreement s.14(c): UDM may "delay or refuse to execute any order" and remove contracts from the electronic list at its sole discretion.
- Requirements to open: Linked Underdog Fantasy account, CIP/KYC (name, address, DOB, SSN), US resident, 18+, eligible state, location by GPS/IP.

---

## 7. PayBox reachability

**paybox_reachable = no.** There is no on-chain collateral, no transaction proposal and no signable order. Funding is a USD bank/card flow into a KYC'd fantasy account that auto-sweeps into the FCM. A PayBox EVM/Solana wallet cannot fund or trade it. Automating a human's KYC'd account would also breach Terms s.6(ix) and Account Agreement s.4(a)(iv). PayBox discovery: `discover_plugins` for "Underdog prediction markets" returned no plugin; `discover_services` returned only unrelated third-party Hyperliquid-odds data services (untrusted, not examined further).

---

## 8. Fees

- **UDM commission (H, UDM Fee Schedule; in-document effective date February 12, 2026; legal center lists v1.0 dated March 16, 2026; >6 months old, possibly stale):** "$0.01 per contract, per side (i.e., opening or closing a position)". So a round trip on 10 contracts is $0.20; holding to settlement is charged once on the opening side (my reading of "per side" as opening/closing orders).
- **Plus pass-through:** "Exchange fees ... set and collected by the applicable exchange ... will be passed through to the customer where applicable" and regulatory/assessment fees. No minimum commission.
- **Exchange fee for Kalshi-routed fills:** Kalshi's taker formula (see the Kalshi spec; the repo note records `0.07 x C x P x (1-P)`, M). The Underdog app may show a combined "fee"; next.io's example of $0.02 per contract is labelled hypothetical (M) and I could not reconcile it to commission plus Kalshi fee, so do not use it.
- **Who pays:** the customer. Underdog also keeps interest on permitted investments of customer funds (Account Agreement s.2(a)(v)), though it states it makes none (1.55(k)).
- UDX trades carry UDX's own fee schedule (taker `0.07 x C x P x (1-P)`, per the UDX note); whether UDM's $0.01 also applies to UDX trades is unknown.

---

## 9. Resolution mechanism and dispute risk

- UDM does not resolve markets. Settlement is "as determined under the rules of the listing exchange and/or its clearinghouse" (Account Agreement s.15, H). For Kalshi-routed contracts that is Kalshi's rulebook and its determination process; see the Kalshi spec. Underdog page links "Kalshi Sports Event Trading contract specifications and Rules" (H).
- Extra layers of risk specific to UDM (H, Account Agreement s.15 and Risk Disclosure item 10): if courts let states restrict sports event contracts, open positions "may become untradeable"; customers "may be unable to close their positions, or positions could be liquidated prematurely"; if the exchange or UDM halts a contract "any potential payouts ... may not occur" and the position "become worthless".
- Dispute path with UDM: written complaint, 30-day informal resolution, class-action waiver, one-year limitation period (Terms s.13, 14, 18, H). Disputes about the linked fantasy account fall under Underdog Fantasy's terms.
- Counterparty/credit: 1.55(k) (H, financials as of 2026-05-31): total equity $9,217,217; regulatory capital $8,557,864; net worth $9,217,217; no proprietary trading; no pending material actions. 97 event-contract customers account for 50% of customer funds (a small, concentrated book).
- CFTC report as of 2026-08-31 (H): UDM adjusted net capital $8,170,980; funds in cleared-swap segregation $8,009,239 against a customer requirement of $891,392. For scale, Robinhood Derivatives LLC shows $36.2M required and FanDuel Prediction Markets LLC $3.4M on the same date (fixture).
- Basis risk for arbitrage: none against Kalshi itself (same contract); real against Polymarket/others (different rules).

---

## 10. Geo, ToS, automation

- US-only, 18+, "present in a state where Underdog Predict operates"; "Must be a U.S. resident" (`/predict` page, H). The services are "intended for jurisdictions in which UDM operates"; location is checked by GPS, IP, beacons or software; a VPN or disabled location "may not be able to determine your location and you will not be able to access the Services"; UDM may suspend or terminate if you prevent accurate location (Terms s.9, H).
- State list: not on the site (H, "No list is provided"). next.io (wf, L) claims "38 states + Washington D.C." but its own list shows 22 states plus DC; other 2026 reviews cited in the UDX note give 31 to 38. NOT FOUND for an official list.
- Automation: see section 6 (Terms s.6(ix), Account Agreement s.4(a)(iv)). Verdict: human-operated only unless Underdog approves an agent or API in writing.
- Multi-accounting / arbitrage: no explicit ban found (NOT FOUND). Terms s.6(xxiv) forbids "bonus abuse of any kind, including abuse of any offers or promotions" and s.6 gives UDM sole discretion to restrict "improper, unfair, fraudulent or otherwise adverse" conduct (H). UDM may also "refuse to execute any order" that it judges could breach law or policy (s.14(c)).
- Position limits: the customer must comply with CFTC/exchange limits; UDM may liquidate on breach (Account Agreement s.16, H). UDM-specific per-contract caps: NOT FOUND.
- Customer-facing risk: a Linked Underdog Account is mandatory and sits outside CFTC customer protection (H).

---

## 11. Liquidity (all from the official overview JSON, data through 2026-10-17, generated 2026-10-18; H)

"Notional" = contracts x $1 face value (data page wording, per the UDX note), not dollars at risk. The `notional_other_exchange` series is the best available proxy for UDM-routed activity (Kalshi, plus CDNA if it is live; split NOT FOUND).

| Month (USD M notional) | Underdog total | UDX | Other exchange (UDM-routed) |
|---|---|---|---|
| 2025-09 (first month) | 77.5 | 0 | 77.5 |
| 2026-03 | 408.2 | 0 | 408.2 |
| 2026-06 | 766.2 | 0 | 766.2 |
| 2026-07 (UDX from 07-17) | 708.2 | 9.9 | 698.3 |
| 2026-08 | 741.5 | 347.3 | 394.2 |
| 2026-09 | 1,349.7 | 721.7 | 628.1 |
| 2026-10 (1-17) | 1,211.3 | 930.0 | 281.3 |

- Last 30 days: total $1,916.6M, UDX $1,304.1M, other exchange **$612.5M (32%)**. Last 7 days of other exchange: 32.6, 14.5, 13.1, 13.3, 18.9, 16.3, 24.2 ($M/day; the last value is Saturday 2026-10-17).
- All-time since 2025-08: total $7,585.5M (UDX $2,008.9M, other $5,576.6M); 48.4M transactions.
- Reading: UDX is re-homing Underdog's own customer flow, so UDM-routed volume is shrinking in absolute terms (about $25.5M/day in June versus $16.5M/day over 2026-10-01..10-17, roughly -35%, even though October is football season; my arithmetic from the series, M). Corroboration (H): UDM's cleared-swap customer funds requirement was only $0.89M on 2026-08-31 and 97 customers held half of customer funds (1.55(k)), a small book compared with the notional churn.
- Depth/OI/book: NOT FOUND for the UDM leg (no per-contract data; everything visible would be Kalshi's book).
- Company claims (M, gaming.net 2026-07-20): about $6.5B notional since September 2025 and 5M+ registered customers; broadly consistent with the $7.6B figure through October.

---

## 12. Event overlap and shared liquidity

- **Categories:** Underdog is sports-first ("Prediction markets are largely about sports", CEO quote via gaming.net, M). The Underdog page says "sports, and other event markets". Which non-sports Kalshi markets (politics, macro, crypto price) are exposed in the Underdog app: NOT FOUND. In the Underdog data, UDX's 2026-10-17 tickers were sports-only (per the UDX note).
- **Overlap where arbitrage lives:** NFL, NCAA football, NBA, WNBA, NHL, MLB, soccer, tennis, UFC; the same games exist on Kalshi and Polymarket US. But the overlap is with **Kalshi itself**, so the UDM price is the Kalshi price plus a $0.01 per-side commission.
- **Shared liquidity (H by structure):**
  - UDM-routed Kalshi contracts = Kalshi's order book. **Not independent** of Kalshi; do not count as a leg.
  - CDNA contracts (if live) = CDNA's book, via Underdog as TSP. **Not independent** of CDNA/OG.com (see `og-crypto-com-nadex.md`).
  - UDX contracts = UDX's own CLOB, independent exchange, but not reachable via UDM and covered under the UDX slug.
- Because Underdog's customers are US retail with parlay-heavy flow, any price differences between the Underdog app and Kalshi are fee-and-presentation effects, not a distinct liquidity pool (M).

---

## 13. Adapter spec (if anyone insists)

There is nothing venue-specific to integrate. Recommended handling in the registry:

1. Register `underdog-predict-udm-llc-fcm` as `kind = "broker-frontend"`, `tradable = false`, `shared_with = ["kalshi", "cdna"]`, `independent = false`, and **do not create markets** under it. Link users to the Kalshi adapter.
2. Optional daily signal (belongs in the UDX signal adapter, not here): poll the platform-overview JSON once per day (after about 12:15 UTC) and store `notional_udx`, `notional_other_exchange`, `transactions` per ET date as a US-retail sports demand index.
3. Optional compliance/health watch: the monthly CFTC "Financial Data for FCMs" report (row "UDM LLC") if UDM exposure ever matters; it is not a trading input.
4. Re-evaluate if Underdog publishes a participant API, if UDM discloses an approved API/agent program, or if the IG Group deal changes the product.

Priority: **skip** (no API, shares liquidity with Kalshi, and the independent Underdog leg already has its own slug).

---

## 14. Open questions

- Is CDNA flow live in the app today, and is the "other exchange" series Kalshi-only or Kalshi plus CDNA?
- Does UDM expose Kalshi's full catalogue (politics, macro, crypto) or only sports?
- Does UDM have, or plan, an approved API/agent program (Terms s.6(ix) says "approved ... application programming interface")?
- Does UDM's $0.01 per-side commission also apply to UDX trades? Is the app fee display consistent with commission plus exchange fee?
- Official list of operating states (22 + DC, 31, 35, 37 or 38 + DC are all reported).
- Status and terms of the IG Group acquisition (single secondary source).
- The "Electronic Trading and Order Routing Systems Disclosure Statement" referenced in Account Agreement s.14(a) is not in the legal center list (NOT FOUND); it may describe routing rules.

---

## 15. Fixtures (`docs/research/fixtures/underdog-predict-udm-llc-fcm/`)

| File | What |
|---|---|
| `platform_overview_2026-10-18.json` | Verbatim response of the platform-overview JSON (18,151 bytes) fetched 2026-10-19 |
| `reports_manifest_trimmed_first2_2026-10-18.json` | UDX report manifest with only the first 2 entries per list (original 126,595 bytes); adds a `_note` key |
| `cftc_fcm_report_2026-08-31_event_contract_fcm_rows.json` | Rows for UDM LLC and six other event-contract FCMs (values copied verbatim, re-keyed by column letter with the header map) from the CFTC August 2026 FCM xlsx |
| `udm_fee_schedule_text_2026-02-12.txt` | Text extracted from the public UDM fee-schedule PDF (company email redacted) |
| `udm_1_55k_disclosure_excerpt_2026-07-20.txt` | Sections 3, 4 and part of 6 of the UDM 1.55(k) disclosure (firm business, memberships, complaints) |
| `udm_futures_account_agreement_excerpts_2026-08-11.txt` | Excerpts: linked-account funding, authorization/routing, trade-yourself clause, event-contract section |

---

## 16. Suspicious content / embedded instructions

None found. No page, PDF or JSON addressed AI agents. The third-party API Evangelist README contains security-contact boilerplate aimed at humans (not instructions to me) and was only used as a secondary signal.

---

## 17. Sources

Primary (H):
- https://www.underdogsports.com/predict (HTML read directly; disclaimers for UDM, UDX and CDNA)
- https://underdogsports.com/exchange/ (wf; names Aristotle Exchange DCM/DCO, does not mention UDM) and https://underdogsports.com (wf; no developer or API link)
- https://legal.underdogpredict.com/underdog-predict-legal-center (wf; document list)
- UDM PDFs (public, text extracted locally):
  - Terms of Use v3.0 (Mar 16, 2026): https://underdogpredict.pactsafe.io/versions/69b875cfa4428cb8abaf6593.pdf
  - Futures Account Agreement v2.0 (Aug 11, 2026): https://underdogpredict.pactsafe.io/versions/6a7b7627052b7a59c1efae20.pdf
  - 1.55(k) Disclosure v2.1 (Jul 20, 2026): https://underdogpredict.pactsafe.io/versions/6a5e99fe036b0bfc6664f135.pdf
  - Fee Schedule: https://underdogpredict.pactsafe.io/versions/69b85d23240ac4b2dc86f87b.pdf
  - Futures Risk Disclosure: https://underdogpredict.pactsafe.io/versions/69b85d519eafd02921f7b0d1.pdf
  - Additional Risk Disclosure (Oct 8, 2026): https://underdogpredict.pactsafe.io/versions/6ac7fec38fc88fc1ebfae62f.pdf (account-specific notice, no market information)
- UDX Rulebook v1.4 (effective 2026-10-01): https://www.underdogsports.com/exchange/rulebook (redirects to a Webflow CDN PDF); UDX Terms of Use: https://underdog-exchange.pactsafe.io/versions/6a59a12a8c17c76f42a4f91b.pdf
- https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json
- https://cftc-public-reports.underdogfantasy.com/manifest.json
- CFTC FCM financial data (as of 2026-08-31): https://www.cftc.gov/MarketReports/FinancialDataforFCMs/index.htm and https://www.cftc.gov/sites/default/files/2026-10/01%20-%20FCM%20Webpage%20Update%20-%20August%202026.xlsx
- GitHub: `gh api orgs/Underdog-Inc/repos`, `gh search repos/code` (no API repo found)

Secondary (M/L):
- https://next.io/prediction-markets/underdog/ (wf; fees example, states, IG Group deal, deposits; claims internally inconsistent on state count)
- https://www.gaming.net/underdog-takes-its-prediction-market-fully-in-house/ (wf; 2026-07-20 timeline and volume claims)
- https://github.com/api-evangelist/underdog-fantasy (third-party probe dated 2026-08-02: no public API)

Not retrieved: `https://app.underdogsports.com/rules/prediction-picks` (403 to WebFetch), `https://help.underdogsports.com` (403 to curl), NFA BASIC firm profile (search form, no static page), WebSearch (quota exhausted).

Cross-references in this repo: `docs/research/venues/underdog-predict-underdog-exchange-udx.md` (UDX), `docs/research/venues/og-crypto-com-nadex.md` (CDNA), `docs/research/08-venues-polymarket-kalshi.md` (Kalshi), `docs/research/14-platform-of-platforms.md` (Prediction Hunt lists Underdog).
