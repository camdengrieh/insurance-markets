# Railbird Exchange, LLC d/b/a DKeX (DraftKings) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web reads, `curl` GETs against the exchange's own website and one public JSON endpoint, SEC EDGAR via WebFetch. No account, wallet, key, signature, POST or payment. Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Read this first (limits and one process problem):
- **ToU conflict, disclosed.** The DKeX Website Terms of Use (last updated 2026-05-05) forbid "any automated means ... bots, scripts, ... parsers, spiders, screen scrapers" to "interact with the Website or the Content, including ... to collect any Content" (H, ToU prohibited-uses list). I read that clause only after I had already pulled the site's static files with `curl` (about 25 small GETs of HTML/JS/PDF/JSON, one call to the settlements JSON endpoint, and four daily-report CSVs of 27-71 MB each, roughly 210 MB, to compute volume). I stopped scripted access once I read the clause. The fixtures are small samples (28 KB total). Production use should not rely on scraping this site; see section 5. Delete the fixtures if you want a cleaner posture.
- Endpoint probing: after finding the one public JSON path I tried about ten other guessable paths and docs hostnames on `api.railbirdexchange.com`; all returned HTTP 403 "Access Denied" (WAF) and I stopped. I did not try to get around it.
- WebSearch ran twice, then the session budget ran out. News coverage is therefore thin; the core of this note is DKeX's own site, rulebook, certifications and DraftKings' press release.
- The DKeX trading API has **no public documentation** (NOT FOUND; searched: site nav and route manifest, rulebook, ToU, GitHub repo and code search). Everything about API behaviour below is what the rulebook and site say about it, not an interface spec.
- Process nit: one throwaway probe output went to `/tmp` instead of the scratchpad; deleted.

---

## 0. Bottom line

1. **Live, and big.** DraftKings launched DKeX on 2026-06-26 (H, press release). In the 12 hours before 2026-10-19 01:30 UTC the exchange's public endpoint reported **416,861 settled markets** (H, fixture). Public daily reports show **$14.9M, $20.2M and $40.3M of premium traded** on 14, 15 and 17 Oct 2026 (derived from H data, section 11).
2. **It is a real exchange, not a broker front end.** Railbird Exchange, LLC is a CFTC-registered designated contract market with its **own central limit order book** (price-time priority), a registered DCO clearing every trade, full cash collateral, binary $1 contracts (H, rulebook dated 2026-09-22). This **supersedes** the sibling note `docs/research/venues/draftkings-predictions.md`, which concluded DraftKings Predictions was a CME/CDNA introducing broker and left DKeX as "unverified". As of 2026-06-26 DraftKings Predictions runs on DKeX and the press coverage says it dropped CME (M). That sibling note should be updated; I did not edit it.
3. **Independent leg for sports arbitrage, but only sports.** Every certified product through 2026-10-16 is a sports contract (93 product names, H fixture). No politics, crypto-price or macro. Overlap with other venues is sports (NFL, college football, NBA, NHL, MLB, tennis, UFC, soccer).
4. **Not integrable today.** No public real-time prices or book (only end-of-day CSVs and a settlement feed), no public API docs, access to the trading API requires a KYC'd Self-Clearing Member or FCM relationship funded by bank wire/ACH (H, rulebook; no crypto mentioned), and the ToU bans scripted collection of site content. **PayBox cannot reach it.**
5. **adapter_priority = P2 (signal-only), upgrade to P1 if** DKeX grants member API access and a market-data licence that allows internal use inside an aggregator (see 5 and 14). The liquidity is real and independent; the blocker is access, not depth.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| DraftKings press release 2026-06-26 (Business Wire id 20260624009284, PDF on DraftKings IR CDN): "announced the launch of its proprietary prediction markets exchange, DKeX, with integration into the unified DraftKings: Sports & Casino app"; "DKeX leverages the technology and CFTC license from DraftKings' acquisition of Railbird Technologies" | Launched 2026-06-26 | H |
| `https://railbirdexchange.com` (title "DKeX", "CFTC-Regulated DCM"; `dkex.com` 301-redirects to it) | Official site up on 2026-10-19 | H |
| CFTC submissions listed on the site: latest "CFTC Submission REX 26-30" dated 2026-10-02; product certifications dated up to 2026-10-16 (college football) | Actively listing | H (fixtures `notices-manifest.json`, `certs-manifest.json`) |
| `GET https://api.railbirdexchange.com/api/v1/settlements/recent?minutes=720&page=1&pageSize=3` returned `totalCount: 416861`, newest `settledAt` 2026-10-19T01:27:46Z | Trading and settling right now | H (fixture) |
| Daily report files from 2026-06-11 to 2026-10-17 (129 market, 129 time-and-sales, 127 settlement files); first product certified for listing "after close of business on May 27, 2026" (GAMEWIN letter dated 2026-05-22) | Exchange trading predates the 2026-06-26 app-integration announcement by weeks; continuous since mid-June | H (manifests, certification) |
| Market Maker Program effective 2026-10-07 to 2028-10-07 | Liquidity programme just renewed/started | H (`/resources/market-maker-program-description-september-2026.pdf`) |
| The hint "Q1 2026 earnings: expected to launch own Railbird exchange in the coming weeks" and the 2025-10-21 acquisition article | Resolved: acquisition closed Oct 2025, launch 2026-06-26 | H (press release) / M |

DraftKings' Q2 2026 results release (2026-08-06) and the 10-Q (2026-08-07) do **not** mention DKeX by name and do not break Predictions out of Sports revenue; they only confirm Predictions exists and Railbird Exchange, LLC is "a federally licensed exchange designated by the Commodity Futures Trading Commission" with a $58.1M operating-licence intangible (H, SEC EDGAR via WebFetch).

---

## 2. Kind and corporate structure

- **kind = regulated-exchange (CFTC DCM), operator-owned.** Railbird Exchange, LLC d/b/a DKeX; the rulebook's indemnification rule refers to Nevada law, so it is probably a Nevada LLC (M). Parent: DraftKings Inc. (Nasdaq: DKNG).
- **Distribution:** DraftKings Predictions (operated by DraftKings subsidiary GUS III LLC, per the press-release boilerplate; H) inside the DraftKings Sports & Casino app. "DraftKings Futures Commission Merchant ... introduces customers to access the Exchange" and "Gus Cap LLC ... is a self-clearing member of the Exchange" (H, `/regulatory-compliance` page). So DraftKings has an affiliated FCM and an affiliated direct trading member. What Gus Cap trades is NOT FOUND.
- **Third-party FCMs:** the rulebook has an FCM Member class (Rule 3.2) and the Market Maker Program text says applicants may be "members with direct access, FCM members, or customers of FCM members" (H). Names of FCMs other than DraftKings' affiliate: NOT FOUND.
- **Clearinghouse:** "the applicable registered Derivatives Clearing Organization providing clearing services" (rulebook definition) - **not named** anywhere I read (NOT FOUND; searched the full rulebook text, fees page, certification GAMEWIN, MM programme). The rulebook's first page says Self-Clearing Member provisions "will not apply ... until the Clearinghouse has obtained any required regulatory approvals", i.e. direct self-clearing access may not yet be live (H, wording of the 2026-09-22 rulebook cover note; actual status NOT FOUND).

---

## 3. Market model (H unless tagged)

- **Binary contracts only, as far as certified:** YES/NO, $1 notional, quoted in dollars per contract, minimum tick set by ladder; payout $1 to the winning side (Rule 6.3, 13.1; certification GAMEWIN: "sized with a one-dollar notional value", price range $0.01-$0.99). The rulebook also defines "Variable Payout Contracts" but I saw none in the certified list.
- **Order book:** central limit order book, anonymous, matched by price then time; fills on an "or better" basis; partially filled remainder rests (Rules 5.6, 5.8, 5.9). Members can see best bid/offer, open interest, volume and **depth to the fifth price level** (Rule 5.14). Order = direction (buy/yes or sell/no), price, quantity (Rule 5.4(a)(2)); order types beyond limit, time-in-force, post-only and market orders: NOT FOUND in the rulebook.
- **Price ladders** (resting orders must be on-ladder or are rejected): `whole_cent_all` (1c, most singles), `tapered_deci_1_half_5_whole_center` (select singles), `tapered_deci_5_half_10_whole_center` (all combos); the REST API reports each market's ladder (site `/price-ladders`, fixture `site-extracts-fees-ladders-hours.txt`).
- **Combination contracts ("COMBOS", "parlays"):** bundles of legs that trade as one instrument, ticker `COMBO-<uint64>`, market name is the legs joined by " / " (e.g. "Yes - Nadia Lagaev - Winner / Yes - Valentino Conte - Winner / ...") (H fixture). They trade via the book and via an **RFQ system** (Rule 5.3(b)); all combos are "high volatility markets" with shorter RFQ windows (H). They settle early at 0 when any leg loses (`status: "Settled Early"`, `settlementPrice: 0`, H fixture). Combos are 74% of contracts but only about 28% of premium (section 11).
- **Strike ladders:** single-game props and spreads are separate binaries per strike. Symbols look like `<LEAGUE>-<PRODUCT>-<PERIOD>-<26-char event id>-<entity code>[-GTE-P<5 digit strike*10>]`, e.g. `MLB-PHRN-FG-01DU6T4ITMPMO1G-RIOS000-GTE-P00025` = "Richie Palacios 2.5" (home runs), `P00005` = 0.5 (M: inferred from the settlement fixture, not documented).
- **Mutually exclusive sets** exist (e.g. GAMEWIN: aggregate payout across the set equals the contract size) (H, cert).
- **Tokenisation:** none. Positions are rows in a clearinghouse ledger, not tokens. No chain.

---

## 4. Chains and collateral

- **No blockchain.** Collateral is **USD cash** held at the DCO, segregated per CFTC rules ("Member Property" / "Customer Segregated Account"); positions are fully cash-collateralised (Rule 6.1(b)) (H).
- Funding/withdrawal: Self-Clearing Members fund and receive via an account at a U.S. financial institution (or a foreign bank for non-U.S. residents) "via one of the acceptable methods as stated on the Website"; withdrawals are batched to the DCO within one business day (Rules 3.1(a)(3), 6.4) (H). Crypto, stablecoins and cards: not mentioned anywhere (NOT FOUND; grep of rulebook for crypto/stablecoin/digital asset/card).

---

## 5. Read API

**Verdict: `official-authenticated` for live data and trading (exists, undocumented publicly); a thin set of public static/JSON endpoints for end-of-day and settlement data.**

Evidence the API exists (H): rulebook Rules 2.16(e) ("DKeX API"), 5.9(b) (trade confirmations "via the API"), 5.10(a) ("via DKeX's interface ... or the API" to cancel), 6.3(e) ("notification of Settlement via API"), 5.11(d) ("advanced tier of DKeX's API"); site `/price-ladders`: "Our REST API indicates which ladder is used for each market." The ToU also lists "developer resources" among site Content. **Docs URL: NOT FOUND** (no link in the site nav or routes; no GitHub repo or code hit). A `DKeXconnectivity` mailbox and a "Trading Interface & Software Support" mailbox are listed on `/contact` (H); I did not contact anyone.

**Public endpoints that responded without auth (H, fixtures):**

| What | URL | Shape |
|---|---|---|
| Recent settlements (the site's own "Settlement Notices" page uses it; 12h window) | `GET https://api.railbirdexchange.com/api/v1/settlements/recent?minutes=<n>&page=<n>&pageSize=<n>` | `{"settlements":[{"marketName","ticker","status","settledAt","settlementPrice"}],"page","pageSize","totalCount","totalPages"}`; `settledAt` ISO-8601 UTC; `settlementPrice` is a decimal (0 or 1 for resolved binaries, can be a fraction for fair-price settlements) |
| Daily Market Report CSV | `GET https://railbirdexchange.com/reports/daily-market/Daily Market Report - (YYYY.MM.DD).csv` (index: `/reports/daily-market/manifest.json`) | `Business Date,Symbol,Status,Open Interest,Trade Volume,High Price (USD),Low Price (USD),Settlement/Last Trade Price (USD),Maturity Date and Time (ET)`; ~68 MB/day |
| Daily Settlement Report CSV | `/reports/daily-settlement/Daily Settlement Report - (YYYY.MM.DD).csv` (manifest alongside) | `Market Name,Ticker,Status,Date and Time of Settlement (ET),Price (USD)`; ~100 MB/day |
| Time & Sales CSV (anonymised trades) | `/reports/time-and-sales/Time & Sales Report - (YYYY.MM.DD).csv` (manifest alongside) | `Business Date,Symbol,Transaction Date and Time,Last Price (USD),Last Quantity`; ~27-71 MB/day; the site says reports update "by approximately 12PM ET each day" |
| Product certifications and exchange notices (CFTC filings) | `/resources/certs/certs.json`, `/resources/notices/notices.json` (PDFs under `/resources/certs/` and `/resources/notices/`) | `{"reports":[{"name","date","href"}]}` |
| Rulebook, ToU, MM programme | `/resources/rulebook.pdf`, `/resources/website-terms-of-use.pdf`, `/resources/market-maker-program-description-september-2026.pdf` | PDF |

Other paths on `api.railbirdexchange.com` (root, `/api/v1`, `/docs`, `/openapi.json`, `/api/v1/markets`, etc.) returned HTTP 403 "Access Denied" to an unauthenticated GET (H). There is **no public live price, order-book or per-market endpoint** (NOT FOUND). WebSocket / FIX: not mentioned in the rulebook or site (NOT FOUND).

**Auth and limits:** Self-Clearing Members log in with an ID and password (Rule 5.2); how API requests are authenticated or signed is NOT FOUND. "Order rate limiter functionality will cap the maximum number of Orders ... per second ... per Member" (Rule 5.4(a)(1)); numbers NOT FOUND. Members must ensure automated order entry has controls against excessive messaging (Rule 5.4(a)(4)). Exchange fees are the same for members, persons with trading privileges and independent software vendors that get "equal access" (Rule 3.9(b)), so an ISV route is contemplated.

**Market data rights (matters for an aggregator):** DKeX claims ownership of market data; Members "may use market data for their own internal business purposes" but "may not distribute, sell or retransmit market data to any third party" (Rule 11.1(b)). An aggregator that republishes DKeX prices to other users would need a separate licence. The ToU additionally bars feeding site Content to AI/ML models for training or fine-tuning (H).

---

## 6. Trade path

- **Programmatic, but only for onboarded members.** Orders are entered electronically over the internet by a Self-Clearing Member (website or API), or by an FCM on behalf of FCM Customers (Rules 5.4, 5.5). Cancels/amends via interface or API (Rule 5.10). Trades are novated to the DCO on match; a trade rejected by the DCO is void ab initio (Rule 6.1(d),(e)).
- **Auth/signing scheme:** NOT FOUND. The rulebook describes user ID + password for the website; API credentials and any request signing are undocumented in public sources. Member responsibility: the member is liable for all trades made with its credentials (Rule 5.2(e)).
- **Who can be a member (Rule 3.1(a)):** a natural person or validly organised entity, KYC and background check, bank account as above, not OFAC-listed, eligible for clearing membership at the DCO, and certify it "will trade only for itself and will not serve as an intermediary for any other Person". Non-U.S. residents are contemplated (foreign bank allowed). So an agent trading on behalf of other users does not fit the direct-member model; it would need to sit behind an FCM.

## 7. PayBox reachability

**paybox_reachable = no (for trading).** USD bank-rail collateral at a DCO, KYC'd legal-person membership, ID/password or undocumented API credentials. No EVM or Solana transaction proposal, signed order, deposit address or smart contract exists, so there is nothing for a PayBox wallet to sign or send. A PayBox card or transfer could at most fund a human's bank/broker account out of band. Read-only access to the public end-of-day files is possible from any host but runs into the ToU (section 10).

---

## 8. Fees (H, official site `/fees-and-hours` bundle; fixture `site-extracts-fees-ladders-hours.txt`)

Exchange fees, charged on matched trades only; no fee for placing/cancelling/modifying; no membership or settlement fee.

| Taker's side price | FCM-routed taker fee per contract | Market Maker (direct member) taker fee; other direct members: not stated |
|---|---|---|
| $0.001-$0.009 | $0.0025 | $0.02 |
| $0.010-$0.019 | $0.0050 | $0.02 |
| $0.020-$0.029 | $0.0085 | $0.02 |
| $0.030-$0.979 | $0.0100 | $0.02 |
| $0.980-$0.999 | 0.5 x ($1 - price) | $0.02 |

- Fee per execution is rounded **up to the nearest $0.01**; "price" is the price of the taker's own side (YES at $0.02 taking => $0.0085; NO at $0.98 taking => $0.01).
- **Maker fee:** $0.0025 per contract (all non-combo contracts) = $0.25 per 100.
- **Combo maker fee:** `ceil_cent(0.035 * C * P * (1 - P))`, C contracts, P price in dollars (max about $0.00875 per contract at $0.50).
- Market makers can earn rebates/incentives under the programme (amounts in Schedule 1 to the MM agreement, not public).
- **Customer-facing fees on DraftKings Predictions: NOT FOUND.** The sibling note quotes NEXTPredict (M) as $0.01-$0.03 per contract and a "CDNA and DKEx exchange fee" ladder ($0.01/$0.02/$0.03 by price band); that does **not** match DKeX's own published exchange schedule above, so either DraftKings adds a markup/transaction fee or the third-party summary is wrong. Treat DraftKings retail fees as unknown until `draftkings.com/predictions-terms` can be read (it is behind Akamai; sibling note could not open it).
- The site says taker fees "are differentiated between orders routed through an FCM and orders submitted by Market Makers that are direct members"; it states **no taker rate for a non-Market-Maker Self-Clearing Member** (NOT FOUND). Arbitrage implication (H arithmetic): a Market Maker taker pays $0.02 per contract at every price (2 points of $1 notional per leg), above the FCM-routed schedule except near the extremes; maker is $0.0025 either way (as published).

---

## 9. Resolution and dispute risk

- **Resolution by the exchange itself** under each contract's Terms and Conditions (self-certified to the CFTC under Part 40). Example, GAMEWIN (H, certification of 2026-05-22): source priority = governing body of the event, then major media (ESPN, AP), then official broadcasters; "unless the Exchange, in its sole and absolute discretion, for any reason or no reason, determines that such result is clearly erroneous". Corrections after expiration are ignored. Expiration 10:00 ET, up to a week after the period; settlement no later than the next day unless under review.
- **Postponed beyond tolerance, cancelled, or material format change before start: "Resolves to the last fair market price, as determined by the Exchange"** (H, GAMEWIN contingency table). Interrupted-event and near-complete rules are per sport. This differs from venues that void or settle 50/50, and it is set by the exchange, so cross-venue pairs need per-contract rule mapping.
- **Outcome Review (Rule 7.1):** before settlement DKeX may open a review in its sole discretion; the Outcome Review Committee decides within 72 hours, "full discretion", "final". **Rule 7.2:** DKeX may change the Source Agency/underlying and the expiration "in its sole discretion" after trading starts. **Rule 6.3(c):** settlement proceeds are held up to 12 hours before crediting.
- **Trade busts:** DKeX may adjust prices or cancel trades in market-disrupting events; its decisions "shall be final and not subject to appeal" (Rule 5.11). Erroneous trades from algorithm malfunction can be considered "extraordinary circumstances" only for market makers or advanced-API members (Rule 5.11(d)).
- **Conflict of interest (M, my inference from H facts):** the same group runs the largest U.S. sportsbook, the retail Predictions front end, the exchange, an FCM and a self-clearing member (Gus Cap). Rules restrict an FCM from trading opposite its customer's order (Rule 5.6(c)) but say nothing about the affiliate's role as liquidity provider.
- **Legal continuity (M, sibling note citing the 10-K):** state challenges to CFTC-regulated sports event contracts; DraftKings says sports event contracts are offered in 18 states (H, press release).
- **Market halts exist:** a "Notice to Members regarding Market Halt" is dated 2026-06-17 and ad hoc maintenance windows on 2026-07-30 (H, `notices-manifest.json`). Rule 13.1(f),(k) allow halts and order-entry/display delays.

---

## 10. Geo, ToS, automation

- **Retail:** DraftKings Predictions sports event contracts are available "in 18 states" (H, press release); fiat USD, KYC. List of states: NOT FOUND (DraftKings pages are behind Akamai).
- **Direct membership:** Rule 3.1 allows non-U.S. residents with OFAC clearance and a foreign bank able to transact with the DCO (H). Whether DKeX is actually onboarding non-U.S. members today: NOT FOUND.
- **Automation:** order-entry automation is expressly contemplated for members (Rules 5.4(a)(4), 5.11(d)). **Website automation is banned**: ToU prohibits bots/scripts/scrapers "to interact with the Website or the Content, including ... to collect any Content", tampering with security controls, and use of Content to train AI models (H). The static CSVs and the settlements JSON are Website Content under the ToU's definition ("market data, settlement reports ... developer resources"). Take the safe reading: **no unattended scraping; request a data agreement or use member API data only.**
- **Governing law/forum for site terms:** New York, exclusive forum Manhattan (H, ToU).
- Account-holder rules that matter to a bot operator: trade only for yourself (3.1(a)(9)(iii)), no wash/pre-arranged trades (5.16), position limits and accountability levels per contract (table NOT FOUND; large-trader reporting threshold 250,000 contracts per `/regulatory-compliance`, H).

---

## 11. Liquidity (all derived from public DKeX files unless tagged; dates are business dates in the file label)

| Metric | Value | Source / tag |
|---|---|---|
| DraftKings Predictions, week ended 2026-06-21 | ~$3.4B annualized consumer volume; ~$11.3B annualized total trading volume (about $31M/day on the larger figure) | H, press release (metric definitions not given) |
| 2026-10-17 (Sat, college football) | 952,024 trades; 251.4M contracts; **$40.3M premium** (sum price x quantity); combos 185.9M contracts / $11.5M; CFB singles $22.7M | derived from time-and-sales CSV, H data (fixture `derived-volume-stats.json`) |
| 2026-10-15 (Thu) | 575,650 trades; 143.8M contracts; $20.2M premium (combos $6.0M) | derived |
| 2026-10-14 (Wed) | 359,529 trades; 80.9M contracts; $14.9M premium (combos $4.0M) | derived |
| Open interest at close of 2026-10-17 | 77.1M contracts (each $1 face), of which combos 65.0M, CFB 8.5M, NFL 1.9M | derived from Daily Market Report; the contract-volume total there (251,393,299) equals the time-and-sales total, a consistency check |
| Settlements in the 12h to 2026-10-19 01:30Z | 416,861 markets (mostly combos) | H, public JSON |

Caveats: "volume" conventions differ (contracts at $1 face vs premium vs both sides). Time-and-sales rows carry Business Date 20261019 though every timestamp is 10/17 ET (unexplained). One sample per weekday type only; no seasonal series. Order-book depth and spreads: NOT FOUND (no public book). Compare apples to apples before ranking against Kalshi or Polymarket volumes.

---

## 12. Event overlap (arbitrage surface)

From 93 certified product names and the daily-market symbol prefixes (H data):

| Category | On DKeX | Overlaps |
|---|---|---|
| American football | NFL and college football: game win, spread, totals, player stats and achievements (first TD), awards (MVP, Heisman), outright (Super Bowl, CFP) | Kalshi, Polymarket (US and global), other sports venues; sportsbooks |
| Basketball / hockey / baseball | NBA (incl. preseason), WNBA, NHL (also exact score, BTTS, puck line, overtime), MLB, NPB, KBO | same |
| Tennis, MMA, soccer | ATP, WTA, ITF; UFC; EPL, La Liga, Bundesliga, Ligue 1, MLS, Liga MX, others | same |
| Politics, crypto price, macro/economics, entertainment | **NOT FOUND** among certified products through 2026-10-16 | - |

Best arbitrage candidates are binary game-winner and totals/spread ladders that exist at the same strike on another venue; combos are bespoke and hard to hedge. Unknown product `IIWINNINGTEAM-SPIRANAC-2026` (certified 2026-10-06) is not understood (NOT FOUND what it is).

## 13. Shared liquidity

- **Independent of CME, CDNA, Kalshi, Polymarket:** own CLOB with its own market makers (H, rulebook Ch. 4 and MM programme). The DraftKings Predictions app and the DraftKings FCM are **front ends to the same book**, so they are not separate legs. Third-party FCMs could route in, but none are named (NOT FOUND).
- Do CME or CDNA contracts still appear inside DraftKings Predictions for non-sports products (finance, economics) after 2026-06-26? NOT FOUND. A trade-press headline says DraftKings "Drops CME" (M, cryptotimes.io, 2026-06-26, small-model summary of the article). DKeX itself lists only sports.
- DraftKings' affiliate Gus Cap LLC trades as a self-clearing member; if it is the house market maker, liquidity is partly DraftKings' own balance sheet and quotes are correlated with DraftKings Sportsbook pricing (M, inference; role NOT FOUND).
- Market makers quoting here probably also quote Kalshi/Polymarket/Sportsbooks, which is what makes cross-venue edges small but real (M).

---

## 14. Adapter spec (for the aggregator)

**Registry entry:** `{ id: "dkex", name: "DKeX (Railbird Exchange)", kind: "regulated-exchange", market_model: "binary-clob", currency: "USD", chain: null, independent: true, fronts: ["draftkings-predictions"], live_read: "member-api-only", eod_read: "public-files-tos-restricted", tradable: "member-only", paybox: false }`.

**Data model mapping**
- Instrument id = `ticker`/`Symbol` string (e.g. `NHL-WIN-FG-<event>-<team>`). Each is one YES/NO binary; the NO price is `1 - YES` on the same book.
- Price unit = USD per contract, 0.001-0.999 (ladder-dependent); quantity = integer contracts; payout $1.
- Fee function (taker, FCM-routed): piecewise table in section 8, round up to cent per execution; maker 0.0025; combo maker `0.035*C*P*(1-P)`.
- Settlement status values seen: `Settled`, `Settled Early`; daily market status: `Open`, `Closed`, `Settled`.
- Settlement price can be a non-binary fair-price (postponement/cancel contingency).

**Feeds**
1. Live prices/book/trades/positions: member API (undocumented publicly). Needs a Self-Clearing Member or FCM account; request API docs and a market-data licence via DKeX's connectivity/membership contacts listed on `/contact`. **Blocked.**
2. Settlement outcomes: `/api/v1/settlements/recent` (public, undocumented, ToU-restricted).
3. End-of-day volume/OI/high/low: Daily Market Report; trade-level history: Time & Sales (both ToU-restricted; very large).
4. Listing discovery: `/resources/certs/certs.json` (CFTC self-certification PDFs; new product families appear here days before listing; for example Michigan-Ohio State game contracts certified 2026-10-16 for 2026-11-28).

**Signals it can provide today without membership (if the ToU is cleared):** daily volume by league, new-listing calendar, settlement outcomes for resolution cross-checks, combo share of flow. These are context signals, not tradable prices.

**Upgrade triggers to P1:** member API docs obtained; market-data licence permitting internal aggregation; confirmation that a program-run agent can be a customer of an FCM; clearinghouse name and self-clearing go-live confirmed.

---

## 15. NOT FOUND / open questions

- Public API docs, auth/signing scheme, WebSocket/FIX availability, rate-limit numbers (searched: site nav and route manifest, rulebook, ToU, GitHub repos and code search).
- Name of the DCO / clearinghouse; whether self-clearing is live; names of third-party FCMs.
- Position limit table; order types and time-in-force; per-market depth and typical spread.
- Customer-facing DraftKings fees on top of the DKeX schedule; list of the 18 states.
- What Gus Cap LLC does; whether DraftKings Predictions still carries any CME/CDNA contracts.
- Whether non-sports products (finance, economics, entertainment) are planned on DKeX (the press release says only that DraftKings will expand the offering).
- DraftKings Q3 2026 10-Q (expected early Nov 2026) and any DKeX rulebook amendments (CFTC submissions REX 26-xx) are the re-check triggers.

## 16. Fixtures (all <= 50 KB) in `docs/research/fixtures/railbird-exchange-draftkings/`

- `api-v1-settlements-recent-sample.json` - real response, `GET /api/v1/settlements/recent?minutes=720&page=1&pageSize=3`.
- `daily-market-report-2026-10-17-head.csv`, `time-and-sales-2026-10-17-head.csv`, `daily-settlement-2026-10-17-head.csv` - first lines of the daily reports (full files are 68-104 MB).
- `certs-manifest.json`, `notices-manifest.json` - the site's own CFTC filing indexes.
- `site-extracts-fees-ladders-hours.txt` - fee table, price ladders, hours, affiliate disclosure and route list extracted from the site's JS bundles (the pages are client-rendered).
- `derived-volume-stats.json` - my computed volume/OI from the full CSVs (not an exchange figure).

## 17. Sources

- DraftKings press release, 2026-06-26 (H): https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Launches-Proprietary-Exchange-to-Bolster-Differentiated-Predictions-Experience-2026.pdf (Business Wire: https://www.businesswire.com/news/home/20260624009284/en/, not readable by me, 403). Text extracted locally with macOS PDFKit.
- DKeX official site (H): https://railbirdexchange.com/ (alias https://dkex.com/), including `/fees-and-hours`, `/price-ladders`, `/regulatory-compliance`, `/regulatory-notices`, `/settlement-notices`, `/incentive-program`, `/contact`, `/resources/rulebook.pdf` (Rulebook dated 2026-09-22, 111 pages), `/resources/website-terms-of-use.pdf` (last updated 2026-05-05), `/resources/market-maker-program-description-september-2026.pdf`, `/resources/certs/GAMEWIN.pdf` (CFTC 40.2 certification dated 2026-05-22), `/resources/certs/certs.json`, `/resources/notices/notices.json`, `/reports/*/manifest.json`.
- Public API call (H): https://api.railbirdexchange.com/api/v1/settlements/recent
- DraftKings Q2 2026 results release (Exhibit 99.1 to 8-K filed 2026-08-07, H): https://www.sec.gov/Archives/edgar/data/1883685/000188368526000027/q226-prx8kexx991.htm ; 10-Q for the quarter to 2026-06-30 (H, Note 3 Railbird): https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm ; EDGAR filing list: https://data.sec.gov/submissions/CIK0001883685.json
- Trade press (M, secondary): https://bettorsinsider.com/news/2026/06/28/draftkings-launches-dkex-its-own-prediction-markets-exchange-built-on-railbird-technology/ ; https://www.cryptotimes.io/2026/06/26/draftkings-launches-own-prediction-market-exchange-dkex-drops-cme/ ; https://www.pymnts.com/economy/markets/2026/draftkings-brings-11-billion-prediction-market-into-flagship-app/ ; search listing also showed sbcamericas.com (2026-06-26), ingame.com, investing.com, defirate.com and cdcgaming.com items that I could not open (403/404) and did not rely on.
- Original lead (L, stale): https://sbcamericas.com/2025/10/21/draftkins-railbird-prediction-market/ (acquisition, Oct 2025).
- Sibling notes in this repo (not re-verified): `docs/research/venues/draftkings-predictions.md` (stale on DKeX, see 0.2), `docs/research/venues/fanduel-predicts.md`.
- Third-party content in this note (web pages, PDFs, JS bundles, API JSON) was treated as data. No embedded instructions aimed at AI agents were seen, other than the ToU clause against using Content for AI training (a legal term, recorded in section 10).
