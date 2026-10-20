# Iowa Electronic Markets (IEM, University of Iowa) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to `iemweb.biz.uiowa.edu`, `iem.uiowa.edu` (login and signup form pages only, nothing submitted), `apps.biz.uiowa.edu` (chart app) and `cftc.gov` (two public PDFs), plus Wikipedia. No account, login, POST, signature or PayBox money tool was used (PayBox `discover_plugins` and `discover_services` were called once each; both read-only). The web-search budget ran out mid-session, so no news search was done (section 1). Third-party text was treated as untrusted data; nothing in it was followed. All scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a sibling research note, or my inference from first-hand data; **L** = weak or stale. Anything older than 6 months is flagged.

Fixtures: `docs/research/fixtures/iowa-electronic-markets-university-of-iowa/` (section 14).

---

## 0. Bottom line

1. **Live, but tiny and about to run out of road.** Three markets are open (2026 Congress, Senate, House control), all opened July 2025 and all about to resolve on the 2026-11-03 election; "Economic Indicator Markets: none open" (H). After liquidation the venue has no open public markets until the next cycle (the 2024 presidential markets opened 2023-05-20, so a 2028 set would plausibly open around mid-2027; that is an M/L inference).
2. **Real money, but capped at $500 per account and funded by US check.** Accounts hold $5 to $500, one account per person, funded by mailed check, money order or "electronic transfer" to the University; withdrawals are mailed checks (H). Outstanding "net issued" bundles are 3,137 / 2,949 / 2,955 across the three markets, i.e. about **$9.0k** of total collateral (H for the counts, M for the sum).
3. **No API and no programmatic trade path.** Public data is three HTML market-info pages with bid/ask/last (no sizes), refreshed on a 15-minute lag for logged-out viewers. Trading is only through a session-based web app after a mailed-check account. The IEM's own FAQ tells people to "save the web page as HTML" to get data into a spreadsheet (H).
4. **Not reachable from PayBox.** No chain, no token, no wallet, no signed order. Fiat check in, fiat check out (section 6).
5. **Independent liquidity, and it overlaps one thing: US 2026 chamber control.** That is also the flagship category on Polymarket and Kalshi. The IEM prices differ from them by several points (section 11), but the leg cannot be sized, shorted or automated, so the gap is not a tradeable edge.
6. **One scanner-relevant mechanism: bundle parity.** A $1.00 fixed-price bundle can be minted or redeemed at any time, so `sum(asks) < 1` or `sum(bids) > 1` within a market is a nominal arbitrage. At 2026-10-19 02:21 UTC the House26 asks sum to 0.955 (section 11); sizes are unknown, the quotes may lag by up to 15 minutes, and the ceiling is $500 per account, so it is worth about $23 at most.
7. **adapter_priority = skip.** Optionally revisit as a P2 signal-only scraper when 2028 markets open. For now a 30-line cron fetch of the market-info page at 15-minute cadence would capture everything worth having.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Home page, fetched 2026-10-19 02:14 UTC | HTTP 200; footer "©2026 The University of Iowa"; three markets "are now open"; Apache/2.4.52, WordPress (`wp-json` link) | H, https://iemweb.biz.uiowa.edu/ |
| Market-info pages, fetched 2026-10-19 02:15-02:17 UTC | Quotes stamped "current as of 21:17:00 CDT, Sunday, October 18, 2026" with non-empty bids/asks and "last" prices; Congress26 net issued 3,137 bundles; open 07/23/25, close 01/24/27 | H |
| Current-markets page | Political: Congress26, House26, Senate26. Economic indicator markets: none open. Classroom markets not open to the public | H, https://iemweb.biz.uiowa.edu/markets/current-markets/ |
| Recent-markets page | 2024 Presidential (Pres24_VS, Pres24_WTA), 2024 Congressional (Congress24, House24, Senate24), 2022 Congressional, 2022 French and Quebec, 2020 sets. 2024 markets closed 01/24/25 | H, https://iemweb.biz.uiowa.edu/markets/recent-markets/ |
| Wikipedia article, page last edited 2026-08-30 | No statement of suspension or closure; article tagged as needing an update since Oct 2020 | M |

Verdict: **still_live = true.** Stale flags: the FAQ and Trader Manual describe the IEM as run "for academic research and teaching" and carry legacy text (telnet accounts before 1999, "WebEx" naming); the prospectus says trading opens "Friday, July 25th, 2025" while the market page says 07/23/25 (L, 2-day inconsistency, immaterial). I could not run a news search (budget exhausted), so there is no confirmation beyond the venue's own pages that nothing is planned for after the 2026 cycle.

---

## 2. Kind and market model

- **Kind (H):** academic, not-for-profit, real-money "futures market" run by the Henry B. Tippie College of Business. Not a CFTC-registered venue; operates under two CFTC staff no-action letters (section 7).
- **Contracts (H):** each contract pays $1 or $0 (winner-takes-all) or, in vote-share markets, an amount tied to a share (the 2024 `Pres24_VS` market was "based on vote shares", M on the exact payoff formula, closed). **Categorical, mutually exclusive and exhaustive**, not binary Yes/No pairs. Live markets:
  - `Congress26`: `DH_DS26`, `DH_RS26`, `RH_DS26`, `RH_RS26`, `OTHER26` (DH = Democrats hold 218+ of 435 House seats; DS = Democrats hold 51+ of 100 Senate seats; RS = Republicans hold 51+ or 50 plus the Vice Presidency; OTHER = at least one chamber with neither party past the threshold).
  - `Senate26`: `RS.gain26` (Republicans more than 53 seats), `RS.hold26` (50 to 53), `RS.lose26` (49 or fewer).
  - `House26`: `RH.gain26` (more than 220), `RH.hold26` (218 to 220), `RH.lose26` (217 or fewer).
- **Mint/redeem (H):** a **fixed-price bundle** (one of each contract in the market) can be bought from or sold to the system at any time for exactly $1.00; it pays $1.00 whatever happens. "New contracts enter circulation only through bundle purchases." This is the equivalent of Polymarket's split/merge and is also how a "short" is built: buy a bundle, sell the contract you do not want. Short selling and margin are not allowed (H).
- **Order book (H):** continuous double auction with limit orders (bid/ask with an expiry) and market orders. Price range 0.000 to 1.000, tick **$0.001**. Price-time priority; a trade executes at the price of the older order; orders cannot be edited, only withdrawn; no self-trades; each order is feasibility-checked only when it reaches the front of the queue. Market orders do not rest: any unfilled remainder is cancelled. Only the best bid and best ask are shown ("the restriction to the best bid and ask will remain"), so **depth and sizes are not visible** to anyone, public or logged in (FAQ).
- **Tokenisation:** none. Positions are rows in the exchange's database, identified by the market name and symbol string (e.g. `Congress26` / `DH_DS26`). Not transferable.

Source for all of the above: https://iemweb.biz.uiowa.edu/trader-manual/executing-trades/, the Congress26 prospectus, and the FAQ (all H).

---

## 3. Chains and collateral

- No chain, no token. Collateral is USD cash held in a University of Iowa account ("funds are deposited to a University of Iowa account", FAQ, H). Account balance is fungible across IEM markets.
- Foreign political markets used local currency and separate sign-ups (FAQ, H); none are open now.

---

## 4. Read API

**Verdict: `none` official. There is a scrapeable public HTML read (quotes with a lag). Classified in the schema as `unofficial-only`.**

| Item | Finding | Tag |
|---|---|---|
| Official API docs | **NOT FOUND** (searched: home, FAQ, Trader Manual, IEMXChange guide, Market Reports page, historical-data pages, IEM citations page, `wp-json` types list). No mention of an API, CSV export, feed or websocket anywhere | H |
| Data policy | "Data can be exported by saving the web page as HTML" and importing into a spreadsheet (FAQ). Public prices "are posted every 15 minutes" (IEM Basics). Logged-out quotes "with up to a 15-minute lag"; logged-in "real-time" with a 15-second browser refresh (Market Reports) | H |
| Base URL | `https://iemweb.biz.uiowa.edu/` (WordPress front end) | H |
| Market discovery | `GET /markets/current-markets/` lists three `iem_market_info` links. Slug pattern for the live set: `/iem_market_info/2026-u-s-{congressional,senate,house}-control-winner-takes-all-market/`. Older markets use different slugs (`pres24_vs`, `congress24`) | H |
| Quotes | `GET /iem_market_info/<slug>/` returns an HTML page with: Market (name, description, open and close date), Assets (symbol and payoff text), Bundles (type, price, **net issued**), Quotes table (`Symbol, Bid, Ask, Last, Low, High, Average`, caption "current as of HH:MM:SS CDT, <date>"), chart iframe, price-history form. Prices are decimal dollars to 3 places; `- - -` means no trades | H (fixtures `market_info_*_extract.html`, `quotes_snapshot_2026-10-19.json`) |
| Quote freshness | The caption timestamp matched my request time (21:15:17, 21:17:00 CDT on two fetches), and prices were identical between the two fetches. So the caption is a render time, not the age of the data; the manual says up to 15 minutes | H for observation, M for interpretation (only 2 samples) |
| Price history | A **POST** form to `https://iemweb.biz.uiowa.edu/wp-admin/admin-post.php` with `action=pricehistory`, `Market_ID=442` (Congress26), `parent_id=1289`, `ph_month`, `ph_year`. Per the manual it returns daily best bid/ask at midnight, last price, volume and dollar volume. **Not called** (POST; and `robots.txt` has `Disallow: /wp-admin/`) | H for the form, NOT FOUND for a response sample |
| Chart app | `GET https://apps.biz.uiowa.edu/IEMOffice/chart/market/Congress26` returns HTML with embedded Chart.js datasets (`{x:"/Date(ms)/", y: <cents>}`, daily, 406 points, 2025-09-07 to about 2026-10-17). It contained only **2 of the 5 series** (OTHER26, RH_DS26) and `y` is price x 100, so it is not a reliable history source | H (fixture `chart_app_congress26.html`) |
| Resolution data | **NOT FOUND** as machine-readable data. The prospectus defines it; closed-market pages show no final values in the extract I read | H |
| WordPress REST | `/wp-json/wp/v2/types` exposes only generic CMS types (posts, pages, media, menus, templates, accordions); no market post type | H (fixture `wp_json_types.json`) |
| Auth, rate limits, websocket | Public pages need no auth. Rate limits: **NOT FOUND** (no policy, no `Crawl-delay`). `robots.txt`: `User-agent: *`, `Disallow: /wp-admin/`, `Allow: /wp-admin/admin-ajax.php`. Websocket: none found | H |

Adapter note: a read adapter would parse the three tables from the market-info HTML. Poll no more often than every 15 minutes (the data does not move faster for logged-out viewers) and send a descriptive User-Agent. Quote sizes are not available from any public source.

---

## 5. Trade path

**Official programmatic path: none.**

- The trading engine is the Java web app **IEMXchange** (Struts `.action` URLs on `https://iem.uiowa.edu/iem/trader/`, Apache Tomcat 9; the login and signup pages are public forms). Access needs a trader ID and password; each login also issues a temporary per-session password, and an **IP Security** feature rejects requests that do not come from the machine that logged in ("Requests should come from the machine you logged on from") unless the user selects "IP Security Disabled" at login (all H, Trader Manual security page and FAQ).
- No API key, no signing scheme, no order endpoint is documented. Driving the web UI with a script would be an undocumented, unsupported path on an account that is tied to a real name and postal address (the signup form collects name, address, phone, country, academic affiliation and an email that must be confirmed). I did not log in (login is a POST) and did not attempt it.
- A public **practice market** exists (guest accounts `aaa` to `zzz`, as printed on the login page). It cannot trade the real-money contracts. I did not use it.

---

## 6. PayBox / EVM reachability

**paybox_reachable = no.**

- No smart contract, token or chain; funding is a mailed or electronic transfer of US currency to the University ("To open an account, you will need to send some form of US currency (personal check, money order, electronic transfer) to the IEM office", FAQ, H), activated "within 24-48 hours of receiving payment". An EVM or Solana wallet in PayBox has nothing to sign, no collateral to move and no order format the IEM accepts.
- Withdrawals are checks mailed by the University's accounts-payable group on the 15th and 30th (H).
- PayBox catalog check (2026-10-19): `discover_plugins` for "Iowa Electronic Markets" returned no plugins; `discover_services` page 1 returned unrelated Polymarket data proxies (not followed up, no payment made) (H).

---

## 7. Regulatory status

- The FAQ says: "The IEM is not regulated by, nor are its operators registered with, the Commodity Futures Trading Commission or any other regulatory authority." It also says the Division of Trading and Markets issued two no-action letters dated **February 5, 1992** and **June 18, 1993** extending relief to the IEM's Political and Economic Indicator Markets, "without explicitly asserting jurisdiction" (H, FAQ). IEM Basics adds that the IEM is "under the regulatory purview" of the CFTC but not regulated by it (H; the two sentences are loosely worded).
- I downloaded both letters from `cftc.gov/sites/default/files/files/foia/repfoia/foirf0503b002.pdf` and `...b004.pdf`. They are **scanned images with no text layer**, and no OCR tool was available, so I could only view the first page of each at low resolution: the 1992 letter is addressed to Prof. George R. Neumann about the "Iowa Presidential Stock Market (IPSM)" and the 1993 letter responds to a 1993-03-16 request supplemented by the "IEM Trader's Manual" (H for those facts). **The conditions of the relief are NOT FOUND (letters not read beyond page 1).** The $500 cap therefore comes from the IEM's own documents, not from the letters.
- Correction to the discovery hint: the cap is described on the IEM site as an **account investment range of $5 to $500**, "you can only deposit $500 maximum" (H), not a per-contract position limit. Wikipedia says the same ("between $5 and $500 at risk", M).
- Consequence (M, my inference): relief of this kind is tied to the small, non-profit, academic character of the operation. A scaled-up or automated third-party use is exactly what a regulator or the Steering Committee could object to.

---

## 8. Fees

All H, from https://iemweb.biz.uiowa.edu/trader-manual/iem-basics/ and the FAQ.

- **No commissions or transaction fees** on trades. The IEM says its issuing method means it neither profits nor loses on trades.
- One-time, **non-refundable $5.00 account activation charge** per account.
- **$5.00 inactivity charge** for accounts with no login in the previous six months, assessed July 1 and January 1.
- Withdrawal needs a balance of at least $2.00; processed on the 15th and 30th; check arrives about two weeks later. No fee stated for the withdrawal.
- Implicit costs: wide spreads and unknown depth (section 10), and the mailed-check float on both deposit and withdrawal.

Fee formula for the aggregator: `fee = 0` per trade; model the $5 fixed cost and $500 capital cap separately.

---

## 9. Resolution mechanism and dispute risk

From the Congress26 prospectus (H, fixture `prospectus_congress26_text.txt`):

- **Official sources:** the U.S. Senate website for party affiliation of continuing senators (the day before the election); **The New York Times** election results as posted at **5pm CST on Wednesday 2026-11-04** or soon after; fallback to the Washington Post if not reported by midnight; fallback to the NYT print edition of 2026-11-05.
- Composition counted by each member's party **as on the ballot** (or as of senate.gov the day before for non-contested senators). Vacant unelected Senate seats count for the governor's party. Run-offs delay liquidation until the outcome is determinable, counting parties as of the date elected.
- A candidate nominated by a major party and another party counts as that major party; a candidate with only non-major nominations counts as **Other**. (M inference: how independents who caucus with a party are treated can differ from Polymarket's and Kalshi's rules. Not checked against any specific candidate.)
- Market page close date 01/24/27 12:00; "This market will remain open until contract liquidation", and liquidation values are credited to cash accounts (H). Withdrawal then takes about two to four weeks by check.
- **Dispute process: none.** "The judgment of the IEM Steering Committee will be final in resolving questions of typographical or clerical errors and ambiguities." One discretionary, non-appealable body (H). Spin-offs and splits are possible with 2 days' notice (H).
- Risk: low probability of dispute, but no formal remedy and no on-chain finality; rule text differs from the other venues, so a title match is not a rules match (the sibling note `docs/research/08-venues-polymarket-kalshi.md` makes the same point for Polymarket versus Kalshi).

---

## 10. Geo / ToS / automation

- **Who can trade (H, FAQ):** "All interested participants world-wide can trade in our political markets"; earnings and returns markets were academic-only. No age, residency or nationality rule is stated on the pages I read (NOT FOUND: a terms-of-service or eligibility page; searched the FAQ, signup page, Trader Manual and IEM Basics). Signup collects real name, address and phone; the IEM does "not allow duplicate accounts" (H).
- **Automation:** **NOT FOUND**; no document addresses bots, scripts or programmatic order entry. The only machine-access signals are IP binding of the session, the `robots.txt` above, and the "traders must have a personal login" wording. Quote exactly (IEM Basics): "You must have a personal loginID and password to access the trading engine for the real-money IEM markets." Any automation of a real account should be cleared with the IEM office first (the contact address is on https://iemweb.biz.uiowa.edu/about-iem/contacting-the-iem/). I did not contact anyone.
- **Anonymity:** trades and orders are anonymous to other traders; the IEM surveys traders for research (H).
- **Trades are final;** only unexecuted orders can be withdrawn (H).

---

## 11. Liquidity and category overlap

**Liquidity (all values fetched 2026-10-19 02:15-02:17 UTC, page stamps 2026-10-18 21:17 CDT):**

| Market | Net bundles issued | Bundle price | Sum of bids | Sum of asks |
|---|---|---|---|---|
| Congress26 (5 contracts) | 3,137 | $1.00 | 0.999 | 1.180 |
| Senate26 (3) | 2,949 | $1.00 | 0.840 | 1.245 |
| House26 (3) | 2,955 | $1.00 | 0.907 | 0.955 |

- Net issued bundles pay $1.00 each at liquidation, so they equal the dollars of collateral in the market (about $9.0k across the three; M for the equivalence, H for the counts). This is the best available OI proxy. **No volume figure** is public except through the price-history form (not called). **No top-of-book size** is public.
- Spreads are wide on the thin contracts: `RS.hold26` bid 0.005 / ask 0.300; `DH_RS26` 0.090 / 0.200; `RS.gain26` 0.155 / 0.240. The main contracts are tighter: `DH_DS26` 0.670 / 0.700, `RS.lose26` 0.680 / 0.705, `RH.lose26` 0.790 / 0.800 (H, fixture `quotes_snapshot_2026-10-19.json`).
- **Intra-market bundle parity check (the one mechanism a scanner should implement for the IEM).** Because a fixed-price bundle can be bought from or sold to the system at $1.00 at any time (section 2), the touch must satisfy `sum(bids) <= 1.00 <= sum(asks)`. Observed (2026-10-19 02:17 and 02:21 UTC, identical on both fetches):
  - Congress26: sum of bids 0.999, sum of asks 1.180. No edge (bids miss by 0.001).
  - Senate26: sum of bids 0.840, sum of asks 1.245. No edge.
  - **House26: sum of asks 0.955** (`RH.gain26` 0.125 + `RH.hold26` 0.030 + `RH.lose26` 0.800) against a $1.00 sell-bundle price, a gross 0.045 per bundle at the touch. This is a nominal violation, not a verified trade: ask sizes are not published, the public quotes can lag up to 15 minutes, the `RH.lose26` "last" (0.820) is above its current ask (0.800), and with the $500 account ceiling the dollar value is at most about $23 even if the full size existed (M, my arithmetic: 500 / 0.955 x 0.045). I did not test it (no account). Treat it as evidence that the IEM book is not kept tight, and as a unit test for the scanner, not as a strategy.
- Hard ceiling on any one participant: $500 of account money, and the account must be funded by mail.

**Overlap with other venues:**

| Category | IEM today | Overlap | Tag |
|---|---|---|---|
| US politics, 2026 chamber control | Congress26, Senate26, House26 | Direct overlap with the Senate and House control markets on Polymarket and Kalshi | M (sibling note `docs/research/08-venues-polymarket-kalshi.md`, snapshot 2026-10-18 about 17:35 UTC) |
| Sports, crypto price, macro | none open | none | H |
| Fed policy, economic indicators | historical only (a Fed Funds market is in the archive) | none now | H |

**Illustrative cross-venue gap (M, not a recommendation):** the sibling note recorded Polymarket "Republican Party control the Senate" Yes best ask 0.38 and Kalshi `CONTROLS-2026-R` YES bid 0.38 at about 17:35-17:38 UTC on 2026-10-18. The IEM equivalent of Democratic control is `RS.lose26` (Republicans 49 or fewer seats) at bid 0.680 / ask 0.705, last 0.700, about 9 hours later, so the IEM implies roughly 0.30 for Republican control against 0.38 elsewhere. That is a 6-8 point gap, but it is gross, from non-simultaneous snapshots, depth is unknown, rule text differs (section 9), the IEM cannot be shorted without buying the full bundle, a leg is capped at $500, and the whole market liquidates in about 3 weeks. Worth knowing as a signal of how thin and unconnected the IEM is; not a tradeable edge.

---

## 12. Shared liquidity

None. The IEM runs its own order book and its own bundle system on University of Iowa servers (H). It is an **independent** price source, unlike front ends that route into another venue. It also has no price linkage to any other venue (no market maker or arbitrage bot is mentioned in the docs; M, absence of evidence).

---

## 13. adapter_priority = skip

- **Not worth building as a trading leg:** $500 account ceiling, about $9k total collateral, three markets that liquidate within weeks, no API, no programmatic order path, check-based funding, a real-name account, and a discretionary Steering Committee as the resolver.
- **Signal value is real but small:** the IEM has a long academic record as a forecasting market, but its three live markets duplicate what Polymarket and Kalshi already price with far more liquidity.
- **When to revisit:** if 2028 presidential or other markets open with a different design, or if the IEM publishes a data feed. At that point a P2 signal-only scraper (read the market-info HTML, 15-minute poll) would be a few hours of work.

---

## 14. Fixtures

All under `docs/research/fixtures/iowa-electronic-markets-university-of-iowa/`. Every file was produced from unauthenticated GETs on 2026-10-19 with `User-Agent: insurance-markets-research/0.1`. No cookies were stored; the login page set a session cookie that was discarded.

| File | Source / what it shows |
|---|---|
| `quotes_snapshot_2026-10-19.json` | Parsed Congress26, Senate26, House26: description, open/close, bundle net issued, asset payoff text, bid/ask/last/low/high/average (the 3-market snapshot used in section 11) |
| `market_info_congress26_extract.html`, `market_info_senate26_extract.html`, `market_info_house26_extract.html` | Raw HTML of the market info section of each page (boilerplate removed): shows the table structure a scraper must parse |
| `chart_app_congress26.html` | `GET https://apps.biz.uiowa.edu/IEMOffice/chart/market/Congress26` (37 KB), shows the embedded 2-series Chart.js data |
| `prospectus_congress26_text.txt` | Text of the Congress26 prospectus (contracts, liquidation rules, sources, bundle rules, access, fees) |
| `robots_iemweb.txt` | `robots.txt` (disallows `/wp-admin/`) |
| `wp_json_types.json` | WordPress REST type list, showing no market data type |
| `home_response_headers.txt` | Response headers of the home page (Apache, WordPress REST link) |

Reproduce: `curl -sS -m 20 -A "insurance-markets-research/0.1" https://iemweb.biz.uiowa.edu/iem_market_info/2026-u-s-senate-control-winner-takes-all-market/`

---

## 15. NOT FOUND / open questions

- NOT FOUND (searched: all IEM site pages listed above, CFTC PDFs): any API, CSV export, bulk historical file, websocket, rate-limit policy or terms of service. Historical Data pages list closed markets only (no download links; checked 5 pages for csv/xls/zip/pdf/json/txt hrefs).
- NOT FOUND: conditions of the 1992 and 1993 CFTC letters (scanned images, no OCR tool, only page 1 viewed).
- NOT FOUND: trading volume, order sizes, number of traders for the 2026 markets. Price-history POST not called.
- NOT FOUND: any confirmation of IEM plans after the 2026 cycle (web search budget exhausted; no news check).
- Open: does an account balance grown by trading profit stay above the $500 deposit cap (the docs limit deposits only)? Does the IEM allow any API-style or scripted access on request? Both would need an email to the IEM office; not sent.
- Open: whether the 15-minute public lag is a cache on the WordPress page or on the data feed (two samples about 4 minutes apart were identical on all 11 contracts).

---

## 16. Suspicious content

None found. No text addressed to AI agents or any instruction-like content appeared in the IEM pages, the CFTC letters (page 1 only), Wikipedia or the PayBox discovery results. (The PayBox `discover_services` results contained vendor descriptions and payment-required terms for unrelated Polymarket data proxies; nothing was called or paid.)

---

## 17. Sources

- IEM home page https://iemweb.biz.uiowa.edu/ (H, fetched 2026-10-19)
- Current markets https://iemweb.biz.uiowa.edu/markets/current-markets/ (H)
- Recent markets https://iemweb.biz.uiowa.edu/markets/recent-markets/ (H)
- Historical data https://iemweb.biz.uiowa.edu/markets/historical-data/ (H)
- Congress26 market info https://iemweb.biz.uiowa.edu/iem_market_info/2026-u-s-congressional-control-winner-takes-all-market/ (H); Senate26 .../2026-u-s-senate-control-winner-takes-all-market/ (H); House26 .../2026-u-s-house-control-winner-takes-all-market/ (H)
- Congress26 prospectus https://iemweb.biz.uiowa.edu/iem_prospectus/iem-prospectus-2026-u-s-congressional-control-winner-takes-all-market/ (H)
- FAQ https://iemweb.biz.uiowa.edu/about-iem/faq/ (H)
- IEM Basics https://iemweb.biz.uiowa.edu/trader-manual/iem-basics/ (H)
- Executing Trades https://iemweb.biz.uiowa.edu/trader-manual/executing-trades/ (H)
- IEMXChange guide: security https://iemweb.biz.uiowa.edu/trader-manual/iemxchange-userss-guide/security/ and market reports .../market-reports/ (H)
- Withdrawals https://iemweb.biz.uiowa.edu/account-maintenance/withdrawals/ and Adding to Your Investment .../adding-to-your-investment/ (H)
- Chart app https://apps.biz.uiowa.edu/IEMOffice/chart/market/Congress26 (H)
- Trader login and signup form pages https://iem.uiowa.edu/iem/trader/TraderLogin.action (H, forms only; nothing submitted)
- CFTC letters http://www.cftc.gov/sites/default/files/files/foia/repfoia/foirf0503b002.pdf (1992-02-05) and .../foirf0503b004.pdf (1993-06-18) (H for date and addressee, page 1 only)
- Wikipedia https://en.wikipedia.org/wiki/Iowa_Electronic_Markets (M; last edited 2026-08-30)
- Sibling research note `docs/research/08-venues-polymarket-kalshi.md` (M, Senate-control comparison snapshot 2026-10-18)
- Discovery hint https://mickbransfield.com/cftc-regulated-pms/ (not fetched; the cap and letter dates were verified on IEM and CFTC primary pages instead)
