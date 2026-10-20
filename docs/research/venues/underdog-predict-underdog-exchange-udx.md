# Underdog Predict / Underdog Exchange (UDX) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, public legal PDFs, and unauthenticated GETs to the two data hosts that the official UDX data page itself loads (one 4.5 MB gzipped daily report, a few Range-limited heads). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data. WebSearch quota ran out mid-session (shared limit), so third-party news coverage rests on the first ~10 search hits plus two readable articles; the primary-source sections are complete.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak/stale. "NOT FOUND (searched: ...)" where nothing was found.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/underdog-predict-underdog-exchange-udx/` (section 11).

---

## 0. Bottom line

1. **Live and growing fast.** UDX (the exchange) went GA 2026-07-17 and printed $108.4M notional on 2026-10-17 (peak day so far); Underdog's whole prediction-market business did $132.6M that day (H, official data JSON generated 2026-10-18).
2. **Two different things share the brand.** (a) **Underdog Predict** = UDM, LLC, an FCM/front end that routes to several exchanges (Kalshi, Crypto.com Derivatives NA) and to (b) **UDX** = Underdog's own CFTC-regulated DCM + DCO (ex-Aristotle Exchange), with its own central limit order book. UDX is an **independent order book** (not shared with Kalshi/CDNA). The Kalshi/CDNA contracts offered inside the Underdog app are NOT independent: same books as Kalshi/CDNA. (H, data page + legal pages)
3. **~81% of UDX volume on the peak day was parlays/combos** (UDXCOMBO, $87.4M of $108.4M). Single-leg sports binaries were ~$21.0M that day (mostly NCAA football), $3.4M end-of-day OI (H, computed from the official daily report). A single-leg sports leg that overlaps Kalshi / Polymarket US exists, but see 4.
4. **No usable public live API.** The only public data is end-of-day (EOD) CFTC-format files (volume, OI, high/low, trade prints). A live order book / order entry API is only mentioned in the rulebook as "may provide ... by agreement" and no docs exist publicly (NOT FOUND). Nothing is available for live prices.
5. **PayBox cannot reach it.** Funding is US-dollar bank transfer only ("Crypto currencies ... are not acceptable for deposits"), KYC, US-state geofence, and a mandatory linked Underdog Fantasy account. No on-chain leg, no wallet signing. (H)
6. **adapter_priority = P2.** Signal-only: EOD per-game volume/OI as a cross-check on sports interest. Revisit only if UDX publishes a participant API or a third-party aggregator (e.g. Prediction Hunt, M) provides live Underdog prices.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Result | Tag |
|---|---|---|
| UDX data page JSON `platform-overview.json`: `generated_at` 2026-10-18T12:10:21Z, `data_through_date_et` 2026-10-17, `highlights.udx_ga_date` "2026-07-17", `pm_launch_date` "2025-08-21" | Live, UDX volume nonzero every day since 2026-07-17 (89 days with volume) | H |
| Daily report manifest `generated_at` 2026-10-18T09:04:48Z, 113 daily reports 2026-06-24 .. 2026-10-17 | Live | H |
| Rulebook "Underdog Exchange DCM, Inc. and Underdog Clearinghouse, Inc.", Version 1.4, effective October 1, 2026 | Current rulebook | H |
| UDX Fee Schedule "Effective Friday, October 9, 2026" (legal center lists it as version 3.0 effective Oct 7) | Recent rule activity | H |
| Press: UDX launched 2026-07-18 after self-certifying first seven contracts 2026-07-15; acquired Aristotle DCM/DCO in March 2026 | Consistent with the above (the date differs by a day: 07-17 in Underdog's own JSON) | M |
| `https://www.underdogsports.com/predict/` and `https://underdogsports.com/exchange/` load (HTTP 200); `underdogpredict.com` 301s to the former; `underdogexchange.com` 301s to `/exchange/` | Live | H |

Verdict: **still_live = true**.

Naming mess (watch for in the adapter): legal docs mix "Aristotle Exchange DCM/DCO, Inc." (site footer, fee schedule, risk disclosure, market maker program) with "Underdog Exchange DCM, Inc. / Underdog Clearinghouse, Inc." (rulebook v1.4). The rulebook URL's CDN filename says "Effective as of 7-30-26" but the PDF inside says October 1, 2026, v1.4, so the file was replaced in place. (H)

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated, fully collateralised event-contract exchange (DCM + DCO, "exclusively self-cleared"), direct participation by retail ("Underdog Exchange allows direct participation by you", Risk Disclosure). Underdog also operates UDM, LLC (d/b/a Underdog Predict), a registered FCM that fronts other exchanges' contracts. (data page: "Underdog routes prediction-market trades across multiple exchanges (DCMs) both as a broker (FCM) and direct to UDX".)
- **Matching (H, Rulebook Rule 5):** central limit order book; order types: Limit, Marketable Limit (aggressive, remainder cancelled), Cancel, Fill-or-Kill, and Request-for-Quote (RFQ) for sizes above a per-contract threshold. Price-time priority (better price first, then first received by the DCM; cancel/replace loses priority). Market makers must use Post-Only quotes (MM Program). No stop orders listed.
- **Contract shape (H, press + data):** binary options, $1 notional, price 0.1c to 99.9c per the press ("trade between $0.001 and $0.999", M). Prices in the daily files are whole cents; quantities are **fractional** (`contracts_traded` 70.88, 4, 117.94 ...). `payout_type` is "Binary Option" for every one of the 227,133 rows of 2026-10-17 (H, computed).
- **Contract families live on 2026-10-17 (H, computed from `market_data_2026-10-17.json.gz`; 5,239 distinct report tickers):**
  - Game/match winner (`GAMEWIN`, `MATCHWIN`, `FIGHTWIN`), incl. soccer draw outcomes as separate binaries; spreads (`SPREAD`), totals (`TOTAL`), team totals, half/quarter variants (`1H`, `2H`, `1Q`..`4Q`), both-teams-to-score (`BTTS`), NFL/NBA/MLB/NHL player props (`NFLRECYDS`, `NBAPTS`, `MLBHR`...), `NFLTD`, `OVERTIME`.
  - **`UDXCOMBO`**: multi-leg "AND/OR" parlay contracts, one ticker per combination (`UDXCOMBO-<numeric id>`, 221,895 rows that day). Press says UDX supports AND/OR logic and that parlay contracts were self-certified (M). Rulebook MM Program lists "Contingent Multi-Leg Outcome Contracts" and a fee schedule line for `ENTITYCOMBO` "Will all of <components> occur?" (H).
  - A few non-game markets: `UDXMLBCBA_26_DEC02` (MLB collective bargaining), `UDXMLBSTART_27_APR01` (season start), `UDXNFLTEAMSALE_36JAN01_{10B,12B,14B}` (NFL team sale price thresholds). These have OI but ~0 volume.
- **Ticker grammar (M, inferred from ~5k tickers; HHMM is Eastern time because the 2026-10-18 HOU-JAX London game shows `0930`):** `UDX{LEAGUE}{MARKETTYPE}_{AWAY}{HOME}{YY}{MON}{DD}{HHMM}_{OUTCOME|LINE}`, e.g. `UDXNFLGAMEWIN_HOUJAX26OCT180930_JAX` (JAX wins), `UDXNBATOTAL_UTAPHX26OCT162200_241.5` (over 241.5), `UDXNCAAMFBSPREAD...`. Futures-like: `UDXMLBCBA_26_DEC02`. Team codes are 2-5 letter abbreviations (PSGSTR, BRELIL, NDBYU).
- **Outcome tokenisation:** none on-chain. Positions are rows in the Clearinghouse participant account (rulebook 6(g)(i)). No ERC-20/1155 shares, no transferability (Rule 7(g): off-exchange transfer prohibited).
- Not scalar, not categorical-by-token: a "categorical" event (e.g. 1X2) is several independent binaries (e.g. `..._PSG`, `..._STR`, `..._DRAW`).

---

## 3. Chains and collateral

- **No blockchain involved (H).** USD in a Clearinghouse account at Banc of California, segregated, "not commingled with UDX operational funds" (UDX Security of Funds, H). Rulebook 6(c)(i): deposits by "cash, ACH, wire transfer, ... RTP"; "All deposits must be made in U.S. dollars. Crypto currencies, foreign currencies, credit card transactions, and securities are not acceptable for deposits." Participant Agreement: ACH debit funding; deposits available no later than 3 settlement-bank business days unless advanced (up to $1,000, 5 business days) (H).
- Fully collateralised: Clearinghouse collects full margin on opening a position and shrinks the order if funds are short (Rule 6(f)); Clearinghouse is the central counterparty via novation (H).

---

## 4. Read API

**Verdict: `exists = official-authenticated`** (live data gated, undocumented; only EOD files are public).

### 4a. Public, unauthenticated, official (EOD only) - H

The UDX market-data page (`https://data.underdogexchange.com/`, linked from `underdogsports.com/exchange`) loads two static JSON hosts; both returned 200 with no auth, `Content-Type: application/json`:

| Endpoint | What | Size / cadence |
|---|---|---|
| `https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json` | Daily series 2025-08-01 .. 2026-10-17 (443 days): `metrics.notional`, `notional_udx`, `notional_other_exchange` (USD millions), `transactions` (thousands), `all_time`, `highlights` (`peak_day`, `peak_month`, `udx_ga_date`). `schema_version` 2.1.0, ET timezone. | 18 KB, regenerated daily (generated_at 2026-10-18T12:10Z) |
| `https://cftc-public-reports.underdogfantasy.com/manifest.json` | Index of daily reports: `{reports:{market_data:[{date,format,url,key,compressed_url,compressed_key,source_report_types:["PMKTDATA"],status:"published",row_count}], trade_data:[... ["TCR"] ...]}, generated_at, status, version}`. 113 days per list, 2026-06-24 .. 2026-10-17. | 127 KB |
| `https://cftc-public-reports.underdogfantasy.com/reporting/market_data_YYYY-MM-DD.json` (and `.json.gz`) | Per-ticker EOD row: `date, ticker_name, report_ticker, payout_type, open_interest, daily_volume, block_volume, high, low, status:"Finalized"`. Contracts, whole-cent prices. | 65.2 MB raw / 4.5 MB gz for 2026-10-17 (227,133 rows) |
| `https://cftc-public-reports.underdogfantasy.com/reporting/trade_data_YYYY-MM-DD.json` (and `.json.gz`) | Every print: `ticker_name, report_ticker, date, create_ts (ET, ns precision, -04:00), contracts_traded, price` (cents). | 101.3 MB raw for 2026-10-17 (426,420 rows) |

Notes:
- The UDX data page labels these "CFTC-format market and trade data, published daily" (CFTC Reg 16.01 public data; the rulebook Rule 5(h) commits to publishing volume, OI, prices). Daily reports are for **UDX only** (not the Kalshi/CDNA routed volume).
- The data page says "Notional volume is contracts traded x $1 face value" and that the overview is "an aggregated view of all prediction-market activity on Underdog" (fantasy excluded). The sum of `daily_volume` over all 227,133 rows of 2026-10-17 is 108,449,635, matching `notional_udx` 108.4255M in the overview. (H)
- `high` / `low` are whole cents, and `low` is often 0 on illiquid or one-sided rows, so they are not reliable quotes. There is **no bid/ask, no depth, no last price field**; the trade file does give last print per ticker with ms timestamps but the file is published T+1 morning (manifest generated ~09:04 UTC for the prior ET day).
- Range requests work (HTTP 206), so a head of a daily file can be fetched cheaply. Use `.json.gz`.
- Files are plain public S3/CDN objects; no rate limit was documented (NOT FOUND). I made only ~10 requests.

### 4b. Live data / participant API - NOT publicly documented

- Rulebook Rule 5(b)(ii) "Market Access": (1) exchange GUI (web/mobile), (2) **"Exchange Programming Interface"** managed by UDX *for Independent Software Vendors* (ISVs must sign agreements, meet "financial minimums, functional usability, technical competency, and client support"), (3) ISV-built GUIs, (4) **"Participant Application Programming Interface"**: "Participants must execute such agreements as Underdog Exchange requires ... meet objective minimum standards ... including financial minimums, volume minimums, technical competency, and capacity restrictions." UDX may throttle message rates. (H)
- No developer docs, OpenAPI, FIX spec, WebSocket spec or base URL found. Searched: `underdogsports.com/exchange`, `data.underdogexchange.com`, `legal.underdogexchange.com`, `legal.underdogpredict.com`, rulebook, Terms, Participant Agreement, MM Program, GitHub (`gh search repos "underdog predict"`, `"underdogexchange"`, code search `underdogexchange.com`, org `underdogfantasy`): nothing. (NOT FOUND)
- The notices page (`/exchange/notices`) is rendered client-side from a Contentful CDN; I did not query it (the page embeds a delivery token and I did not use it). Self-certification filings are therefore not read first-hand. (NOT FOUND for the list)
- Third-party: Prediction Hunt (`prediction.com/api/v2`) lists "Underdog" among its venues (prior repo note `docs/research/14-platform-of-platforms.md`, M); not verified here, and it needs an API key.

---

## 5. Trade path

**None available to an agent/PayBox today.** To trade you must: have a **linked Underdog Fantasy account** (UDX Terms 1. Registration), complete KYC/CIP, be 18+ and located in an operating state (GPS/IP check; VPN masking may block), fund by ACH in USD (H). Orders then go through the Underdog app/web GUI. A programmatic path would require signing UDX's Participant Agreement/API agreement and meeting volume/capital minimums, or the Market Maker program (needs deposits, binding Post-Only quotes). Auth/signing scheme: NOT FOUND (no public docs). (H for the rules, NOT FOUND for the scheme)

Rulebook Rule 4(a)(ii) also states "No registered Futures Commission Merchant, registered Introducing Broker, or other intermediary may submit trades in Contracts for execution on behalf of its customers." (H) So the Underdog Predict FCM (UDM) cannot be the routing agent for UDX orders; UDX users appear to be direct UDX Participants (my reading, M).

---

## 6. PayBox reachability

**paybox_reachable = no.** No chain, no on-chain collateral, no transaction proposal or EIP-712 order to sign; deposits in crypto are explicitly barred; account is KYC'd to a natural person/entity with a linked fantasy account. A PayBox EVM/Solana wallet could not fund or trade it, and automating a human's KYC'd account would also breach the Terms (section 8). A PayBox plugin could only (at most) read the EOD files.

---

## 7. Fees (H)

- **UDX taker fee:** `Fees = Round(0.07 x C x P x (1-P))` in dollars, P = price in dollars, C = contracts; round to nearest cent, ties to even (UDX Fee Schedule, effective 2026-10-09 10:00 ET). Max at 50c is 1.75c/contract. Same shape as Kalshi's general fee formula (M, from prior repo notes 08).
- **UDX maker fee** (resting order that later trades): `Round(0.0175 x C x P x (1-P))`; no cancel fee.
- **`ENTITYCOMBO` ("Will all of <components> occur?")**: maker fee uses the taker formula (0.07).
- Market makers may get "discounts on fees, rebates on fees, revenue share" (Participant Agreement 3(n)); amounts in the confidential Market Maker Agreement.
- **Underdog Predict (UDM) commission:** $0.01 per contract per side + pass-through exchange fees and regulatory fees (UDM Fee Schedule effective 2026-02-12; this predates UDX, so whether it still applies to UDX trades is unknown; M for applicability).
- Deposits/withdrawals: routine withdrawals via ACH; "alternate methods may incur additional fees" (Rulebook Rule 5(i)).
- Fee schedule PDFs saved as text fixtures (company support email redacted).

---

## 8. Resolution mechanism and dispute risk

- Per-contract rules (Underlying, Final Settlement Price, tick, position limits, expiry) are in "Contract Specifications" under Rule 11 (Rulebook). The published Rule 11 text is a generic stub; **no per-sport contract specifications or settlement-source list was found** (NOT FOUND: rulebook, legal center, exchange page, data page).
- Exchange-controlled and discretionary (H, Rule 5(a)):
  - UDX may "designate a new Underlying" and change contract specs/rules **after the first day of trading** if reliability is impaired (5(a)(iv)).
  - "Prior to Settlement of any contract, Underdog Exchange may, at its sole discretion, initiate a review ... by the Settlement Committee ... will have full discretion to resolve the market or contract outcome and shall be considered final." (5(a)(v))
  - Error trades: Participant must notify within 10 minutes; DCM decides "in its absolute and sole discretion", may bust trades or pay a monetary adjustment (5(e)).
  - Risk Disclosure: contract "may not settle as expected ... the Payout Criterion may be changed in accordance with the Rules ... results ... ambiguous in the way Underdog Exchange initially defined".
- Counterparty risk is the DCO (central counterparty, novation, fully collateralised, funds in segregated bank accounts, invested under 17 CFR 1.25) - low credit risk, high **rule-set risk**. Basis risk against Kalshi/Polymarket US contracts on the same game: postponement/void rules, overtime treatment, "1H" definitions etc. may differ and are unpublished.
- No on-chain oracle, no UMA-style dispute window.

---

## 9. Geo, ToS, automation (H unless noted)

- US-only; 18+; "intended for jurisdictions in which Underdog Exchange operates", location by GPS/IP, VPN masking may block (UDX Terms). Official state list: NOT FOUND. Press: "available in 37 U.S. states ... not available in 13 jurisdictions, including Nevada and Washington, D.C." (M, PredictionAuthority via a page summary); other 2026 reviews give ~35+DC, 38+DC or 31+DC (L, conflicting).
- Automation: UDX Terms forbid accessing the Services "in an automated way, using any robot, spider, scraper, web crawler, or using any method of access other than manually accessing the publicly-available portions of the Services through a browser or accessing the Services through any approved mobile application, application programming interface, or client application". Participant Agreement 4(d): no automated scraping of the Website. So: only an **approved API** is permitted; bots against the web app are out. The static JSON data files are published by Underdog for download and referenced by its own page; reading them is a normal use but their ToS on reuse is not stated separately (NOT FOUND).
- Arbitrage / multi-account: no explicit rule (NOT FOUND). Terms prohibit "bonus abuse of any kind" (UDM Terms of Use section 6, via page summary, M). Linked Underdog account required.
- Market makers have structural advantages (cancel-on-disconnect, higher throughput, fee rebates) the Participant Agreement discloses to takers.
- Trading hours: "24/7 for most markets" (exchange holidays-and-hours page), halts possible, US-holiday adjustments.

---

## 10. Liquidity (all from the official overview JSON, data through 2026-10-17, generated 2026-10-18; H)

| Metric (USD notional = contracts x $1) | Value |
|---|---|
| UDX all-time (since 2026-07-17) | $2,008.9M |
| UDX 2026-10-17 (peak day, Saturday, college football) | $108.4M |
| UDX last 7 days (10-11..10-17) | $391.0M ($97.3M, 32.2, 35.7, 33.8, 44.2, 39.4, 108.4) |
| UDX last 30 days | $1,304.1M (68% of Underdog's $1,916.6M total) |
| UDX by month | Jul (from 7/17) $9.9M; Aug $347.3M; Sep $721.7M; Oct 1-17 $930.0M |
| Underdog routed to other exchanges (Kalshi/CDNA), last 30 days | $612.5M; $24.2M on 10-17 |
| Underdog total transactions all-time | 48.4M (thousands in file: 48,357.4) |
| Underdog total (all exchanges) all-time since 2025-08 | $7,585.5M |

UDX, 2026-10-17 end-of-day (computed from `market_data_2026-10-17.json.gz`, H): total volume $108.4M, total OI $39.3M; **`UDXCOMBO` volume $87.4M / OI $35.8M** (194,887 combo tickers traded); single-leg volume $21.0M, OI $3.4M (OI is post-settlement of that day's finished games, so it undercounts intraday depth). Top single-leg families by volume: NCAAF game winner $9.7M, NCAAF spread $3.1M, NCAAF total $1.5M, WTA match $1.0M, ATP challenger $0.57M, ATP $0.51M, UFC fight $0.49M, NHL game $0.42M, WNBA game $0.35M, EPL game $0.23M, NFL game $0.21M (on a Saturday; NFL volume will be larger on Sundays). Largest single contract: `UDXNCAAMFBGAMEWIN_NDBYU26OCT171930_BYU` $806k volume.

Read the volume carefully: Underdog's whole-business volume was flat-to-rising ($766M June, $742M Aug, $1,350M Sep) while "other exchange" fell from $766M (Jun) to $394M (Aug) to $281M (Oct 1-17): UDX is largely **re-homing Underdog's own customer flow** from Kalshi/CDNA to its own book. That customer flow is parlay-heavy, retail, and likely market-made with wide combo prices, so depth on the single-leg legs that overlap other venues should be assumed thin and unverifiable until a live book is accessible. (M, inference)

---

## 11. Event overlap and shared liquidity

**Overlap (arbitrage-relevant):** sports only. NFL, NCAA football, NBA, WNBA, NHL, MLB (player props, season markets), EPL, La Liga, Serie A, Bundesliga, Ligue 1, Liga MX, MLS, Brasileirao, Argentine league, EFL Championship, UCL, ATP/WTA/ITF tennis, UFC, CS2 (H, from ticker prefixes). Game winner / spread / total / BTTS / player props line up with Kalshi sports and Polymarket US sports. No politics, macro or crypto-price markets seen in the 5,239 tickers of 2026-10-17 (H for that day). Non-sports oddities: MLB CBA and NFL team sale price thresholds (no volume).

**Shared liquidity:**
- UDX's own CLOB is a separate DCM/DCO book, so **UDX single-leg markets are an independent leg** relative to Kalshi / Crypto.com / Polymarket US (H for separate exchange, M for independence of market-maker inventory: the same professional MMs may quote everywhere and hedge across venues, so prices are probably tightly correlated with Kalshi).
- **Not independent:** Kalshi and Crypto.com Derivatives NA contracts offered inside the Underdog Predict app are the same order books as on those exchanges (Underdog is a broker/front end). Do not count them as an Underdog leg. They also don't appear in the UDX daily reports (those are UDX only). (H, data page + legal page)
- UDXCOMBO has no counterpart on other venues except as a synthetic of several legs (and Kalshi's own multivariate products, not verified here).

---

## 12. Adapter spec (if built)

Only an EOD "signal" adapter is possible now.

1. Poll `manifest.json` (daily after ~09:10 UTC). For each new `market_data` / `trade_data` date fetch `.json.gz` (4.5 MB market data / 10.9 MB trade data for 2026-10-17, per HEAD).
2. Parse `report_ticker` into `{league, marketType, away, home, kickoffET, outcome|line}` (grammar in section 2). Exclude `UDXCOMBO*` from single-leg linking.
3. Emit per-contract `{volume_contracts, open_interest, high_cents, low_cents, last_print_ts, last_print_price}` for linking to Kalshi/Polymarket US events by league + date + teams. Treat prices as cents 0-100, quantity fractional.
4. Mark venue `liquidity_class = "eod-only"`, `tradable = false`, `independent_of = ["kalshi","cdna"]` for UDX, `shared_with = ["kalshi","cdna"]` for UDM-routed contracts (not fetchable).
5. Re-evaluate when/if a participant API, WebSocket or FIX spec is published, or if a licensed aggregator (Prediction Hunt, M) exposes Underdog quotes.

---

## 13. Open questions

- Does a live Participant/ISV API exist, who has access, what is the auth scheme and rate limit?
- Official list of operating states (conflicting 31/35/37/38 + DC reports).
- Per-sport contract specs (settlement sources, postponement/void/overtime rules, position limits). Rulebook Rule 11 is a stub.
- Whether UDM's $0.01/contract commission applies to UDX trades.
- Why price in daily trade rows is sometimes `0` with a large quantity (e.g. UDXCOMBO 210 contracts at price 0): rounding of sub-cent prices? Unknown.
- Are the Kalshi/CDNA contracts in the app a smaller and shrinking share? (observed, yes: 32% of last 30 days)
- Prediction Hunt's actual Underdog coverage.

---

## 14. Suspicious content / embedded instructions

None found. Nothing in the pages or JSON was addressed to AI agents. Note only: the data-page JS validates manifest URLs ("a compromised or malformed manifest entry" guard) and the notices page embeds a Contentful delivery token (not used).

---

## 15. Fixtures (docs/research/fixtures/underdog-predict-underdog-exchange-udx/)

| File | What |
|---|---|
| `platform_overview_2026-10-18.json` | Verbatim response of the platform-overview JSON (18 KB) |
| `reports_manifest_trimmed_first3_2026-10-18.json` | Manifest with only first 3 entries per list (original 127 KB) |
| `market_data_2026-10-17_sample.json` | 35 verbatim rows chosen from the 227,133-row daily file (all families, 3 combos) |
| `trade_data_2026-10-17_first_rows.json` | First 29 verbatim rows of the trade file (HTTP Range head) |
| `udx_fee_schedule_text_2026-10-09.txt`, `udm_predict_fee_schedule_text_2026-02-12.txt` | Text extracted from the public fee-schedule PDFs (company support email redacted) |

---

## 16. Sources

Primary (H):
- https://www.underdogsports.com/predict/ (301 from underdogpredict.com) - brand, entities (UDM LLC FCM; Aristotle Exchange DCM/DCO operate UDX; CDNA and Kalshi contracts)
- https://underdogsports.com/exchange/ and /exchange/holidays-and-hours - UDX landing, 24/7 hours, holiday list, footer with Aristotle entity names
- https://data.underdogexchange.com/ - data page text; loads the two JSON hosts below
- https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json
- https://cftc-public-reports.underdogfantasy.com/manifest.json , `/reporting/market_data_2026-10-17.json(.gz)`, `/reporting/trade_data_2026-10-17.json` (head)
- Rulebook (Underdog Exchange DCM/Clearinghouse v1.4, effective 2026-10-01): https://www.underdogsports.com/exchange/rulebook (redirects to a Webflow CDN PDF)
- https://legal.underdogexchange.com/ and PDFs: UDX Fee Schedule https://underdog-exchange.pactsafe.io/versions/6ac6db492c7c473ca250669f.pdf ; Market Maker Program https://underdog-exchange.pactsafe.io/versions/6a3ee4aed70b0d7ee21009a6.pdf ; Participant Agreement .../6a3c3e8abac1ca0e7580415f.pdf ; Terms of Use .../6a59a12a8c17c76f42a4f91b.pdf ; Security of Funds .../6a3c3ea9c9e0798b4be07a41.pdf ; Risk Disclosure .../6a59a1a084ffda3c6f13e5fe.pdf
- https://legal.underdogpredict.com/underdog-predict-legal-center ; UDM Fee Schedule https://underdogpredict.pactsafe.io/versions/69b85d23240ac4b2dc86f87b.pdf ; UDM Terms of Use https://underdogpredict.pactsafe.io/versions/69b875cfa4428cb8abaf6593.pdf (clauses read by a page summary or grep, partly M)

Secondary (M/L):
- https://predictionauthority.com/news/underdog-udx-cftc-exchange-launch-2026/ (launch 2026-07-18, self-certified 07-15, $1 notional/$0.001-$0.999, 37 states / 13 jurisdictions) - via page summary
- https://www.gaming.net/underdog-takes-its-prediction-market-fully-in-house/ (Aristotle acquired March 2026; routed via Crypto.com then Kalshi before; ~$6.5B notional since 2025-09) - via page summary
- Search hits only (not opened; 403 or quota): predictionnews.com, ingame.com, sbcamericas.com (2026-03-09 acquisition; 2026-07-20 launch), sportspro.com, legalsportsreport.com (Oct 2026), next.io (L)
- Repo prior notes: `docs/research/09-venues-onchain-clob.md` (Aristotle/Underdog confusion), `docs/research/14-platform-of-platforms.md` (Prediction Hunt lists Underdog)
