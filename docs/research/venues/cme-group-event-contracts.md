# CME Group event contracts - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc reads, unauthenticated GETs to documented hosts, public Confluence REST reads, PR Newswire / Wikipedia / SEC `data.sec.gov` reads. No account, wallet, key, signature, POST/PUT/DELETE or PayBox money tool was used (only `discover_plugins` and `discover_services`, which are read-only). Third-party text was treated as untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, a sibling research note, or my inference from first-hand data; **L** = weak or stale. Anything older than 6 months is flagged.

Fixtures: `docs/research/fixtures/cme-group-event-contracts/` (section 15). There is **no public unauthenticated read API**, so there is no live market-data sample. The fixtures are real 401/403 responses plus documentation text.

---

## 0. Bottom line

1. **Live, and the exchange is real and big, but the product is institutional plumbing, not an open venue.** CME Globex lists two event-contract families (section 2): legacy "event options" and, since 2025-12-05, 24/7 fully funded "swap-based" Yes/No contracts. Orders go in only through a CFTC-registered FCM over iLink; there is no retail or wallet API (H, CME Client Systems Wiki).
2. **Independent order book.** CME Globex runs its own central order book (MBO/MBP channel 333 "Event Contracts II", H). It is an independent leg against Kalshi, Polymarket, ForecastEx and CDNA. It is **not** independent of the front ends that route into it: FanDuel Predicts, DraftKings Predictions, Plus500 (clearing for FanDuel) and the CME slice of IBKR (section 12).
3. **The sports half has been moving away.** Flutter's Q2 2026 release (2026-08-05, H): "In coordination with CME, we have agreed that all FanDuel Predicts sports and novelties contracts will now be moved to Crypto.com, while continuing to provide our customers access to CME's financial markets." NEXTPredict (2026-08-07, M) says CME is distancing itself from sports contracts and quotes CME's CEO calling sports prediction markets "gambling". The CME wiki still lists sports swaps as of 2026-08-14 (H) and I found no delisting notice. So the part of CME that stays relevant for arbitrage is **financial, crypto and macro** (indices, gold, oil/gas, BTC, GDP, CPI) (section 11).
4. **Read access = licensed and authenticated only.** Real-time prices come from CME Market Data (MDP 3.0 multicast, Smart Stream on Google Pub/Sub, or the OAuth WebSocket API at `wss://markets.api.cmegroup.com/marketdatastream/v1`), all behind a CME Group Login, an OAuth API ID and an entitlement granted by CME's Global Account Management (H). `cmegroup.com` itself blocks scripts and its Data Terms of Use prohibit scraping (H, 403 fixture). I could not read the CME site, rulebook, contract specs or fee pages at all (section 14).
5. **No PayBox path.** USD, FCM-carried, KYC'd accounts, FIX/iLink order entry. A PayBox EVM or Solana wallet cannot trade it, hold a position, or sign anything CME accepts (section 6).
6. **Liquidity is large in aggregate but unknown for the part that matters.** CME said on 2026-02-13 that 100 million event contracts had traded in about 8 weeks since the December launch (H, but 8 months old, and it includes sports). No current ADV or open interest for the financial contracts was found (section 10).
7. **adapter_priority = P2.** Signal-only, and only if the operator already holds (or will buy) a CME market-data entitlement. No trading adapter. Do not model FanDuel, DraftKings, Plus500 or IBKR-CME as separate legs.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| CME Client Systems Wiki, "Swap-Based Event Contracts and 24-7 Trading" (page version 2026-08-14) | "Effective Friday, December 5, 2025 (trade date Monday, December 8, 2025), CME Group launched 24/7 trading for new swap-based event contracts." Production. New sports and event swaps were added through 2026-01 and 2026-02 per its revision history | H |
| Same wiki, "Event-Based Contracts Expansion to 24-7 Trading" (2026-04-23) | Event contracts on Bitcoin (product `ECBTC`, channel 329) move to 24/7 from 2026-05-29 4:00 pm CT | H (plan); M that it happened (I did not read a post-launch confirmation) |
| MDP 3.0 channel guide (page version 2026-10-13) | Channel 329 "Event-based contracts" and channel 333 "Event Contracts II" are listed | H |
| PR Newswire 2026-02-13, "CME Group Announces 100 Million Event Contracts Traded" | "after just eight weeks of trading" | H (fetched via the fetch tool's summary) |
| CME Q1 and Q2 2026 earnings releases (2026-04-22, 2026-07-22) | Footnote: amortization "at FanDuel Prediction Markets Holdings LLC" ($1.4M per quarter), reported in equity income | H |
| Flutter Q2 2026 release (2026-08-05) | CME remains the source of "financial markets" contracts for FanDuel; sports/novelties moved to Crypto.com | H |

Verdict: **still_live = true**. Stale flag: the 100M milestone is 8 months old. CME's Q3 2026 earnings release is due around 2026-10-21/22 (date not verified); it may or may not break out event contracts (Q1 and Q2 did not).

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated exchange (CME Globex, a designated contract market; cleared by CME Clearing). Contracts are "listed with, and subject to the rules and regulations of Designated Contract Markets (DCM)" (wiki). Retail access is through FCM front ends.
- **Two product families:**
  1. **Legacy "event contracts"** (launched 2022; M for the year, from the example filename dated 2022). Technically **options on futures** with a fixed payout. Product code convention `EC` + underlying code, e.g. `ECES` (E-mini S&P 500), `ECYM`, `ECBTC`. The "Call" is the Yes contract (pays if the underlying ends above the strike) and the "Put" is the No contract (pays if it ends at or below). Cash-settled, USD. Master file at launch: fixed payout 20.00, tick 0.25, price limits 0.25 to 20.00. Daily-expiring periods (period code = expiry date). Reference Data API subtype `EVENT`. Covers "metals, energy, equities, and foreign currencies" plus Bitcoin. (H for the wiki text; the 20.00 figure is stated "at launch" in a page last modified 2026-06-02, so re-check `fixPayout` in the Reference Data API before relying on it.)
  2. **Swap-based event contracts ("Event Contracts II")**, launched 2025-12-05. "Fully-funded contracts [that] provide a straightforward way for clients to take a 'yes' or 'no' position ... all with defined risk", "positions starting at just $1" (H, wiki and PR Newswire 2025-08-20). They are legally swaps. Final settlement prices are published as **0 or 100** (H). Reference Data API subtype `EVTSW`. Trade 24/7 on market segment 90.
- **Market structure (H):** central limit order book on CME Globex with market makers (mass-quote protections are documented for these products; delta protections do not apply). It is not an AMM and not parimutuel. Binary Yes/No only for the swap family; the legacy family is one strike ladder per underlying and day.
- **Outcome tokenisation:** none on-chain. Identity is a Globex security ID, an ITC-style symbol (legacy example `ECYMQ210 C3100` = product, month code, day, call/put, strike) and, for the swaps, Reference Data API `eventName` (example in the docs: "Best of 2026 Oscars"), `eventStartTimestamp`, `leagueReal` (e.g. NFL), `assetStatus` (e.g. POSTPONED) and `sevenDayTradingIndicator` (H, instrument attribute spec, added 2026-06-18).
- **Price/payout units of the swaps:** prices run 0 to 100 points (settlement 0 or 100, H). FanDuel's app describes $1 per contract with prices of $0.01 to $0.99 (M, NEXTPredict page summary), which is consistent with 1 point = 1 cent and a $1 payout. The exact contract multiplier is in `event-swaps-products.csv` on cmegroup.com, which is blocked to scripts: **NOT FOUND**.
- **Related but different (H, PR Newswire titles):** CME FutureSports Performance Index (FSPI) futures, NHL futures (2026-09-28) and baseball futures (2026-10-12) are index futures, not binary event contracts. Do not map them as event markets.

---

## 3. Chains and collateral

- **No chain, no token.** Collateral is USD cash held at the clearing FCM; "fully funded" means the payout is fully collateralised up front (H). Settlement and clearing are through CME Clearing and the FCM (trade reports via CME STP FIXML, H).
- A wallet on Base, Ethereum, BNB, Arbitrum, Polygon or Solana has no role.

---

## 4. Read API

**Verdict: `official-authenticated`.** Nothing public and unauthenticated carries event-contract prices. (H, all below from the CME Client Systems Wiki, a public Confluence site, and my own unauthenticated probes.)

| Service | Base URL | What it gives | Auth |
|---|---|---|---|
| **CME Reference Data API v3** | `https://refdata.api.cmegroup.com/refdata/v3/` (`products`, `instruments`, `tradingSchedules`, `optionSeries`; UAT `refdata.api.uat.cmegroup.com`) | Product and instrument catalogue: `subtype` filter (`EVENT`, `EVTSW`), `fixPayout`, `referenceProduct` link from the non-tradable synthetic future to the tradable one, event attributes above | OAuth 2.0 bearer token. Token endpoint `https://auth.cmegroup.com/as/token.oauth2`, tokens expire after 30 minutes. Needs a CME Group Login (multi-factor) and an OAuth API ID created in the CME Customer Center. "Entitlement registration is not required to access Futures and Options attributes" (so the catalogue may be obtainable without a paid entitlement; unverified because I may not create accounts) |
| **CME Market Data over WebSocket API** | `wss://markets.api.cmegroup.com/marketdatastream/v1` (UAT `markets.api.uat.cmegroup.com`) | JSON: Top of Book (1-deep, overlay, at most every 500 ms per instrument, message type `TOB`), Trades (`TRD`), Stats (`STAT`: cleared volume, open interest, settlement). The swap page says this API supports the 24/7 event swaps | OAuth bearer in the `Authorization` header at the upgrade request, and the API ID **must be entitled** by CME Global Account Management (paid licence, price NOT FOUND) |
| **MDP 3.0 market data** | UDP multicast / TCP recovery (connectivity files, CME Group Login) | Full book (MBO/MBP). Channel **329** "Event-based contracts" (legacy), channel **333** "Event Contracts II" (swaps) | Licensed, co-lo or CME network connectivity |
| **CME Smart Stream on GCP (Pub/Sub, SBE)** | Google Pub/Sub topics | Same MDP content over cloud; wiki: channel 329 added 2025-10-02, and the swap page says it supports 24/7 trading | Licensed |
| **Settlements and Valuations channel 263** "Event Contracts Settlements and Valuations" | MDP | Final settlement 0 or 100 with preliminary/final/"FinalFinal" flags | Licensed |
| **Event Contracts Master File** | `cmegroup.com/ftp/fprf/csv/CME.EventContracts.YYYYMMDD.csv` (daily, 3:30-4:00 pm CT) | Next-day eligible legacy event contracts (CSV schema in fixture) | The host is blocked to scripts; wiki also says a "Firm FTP Server" exists. Not fetched |
| **CME STP FIXML** | `https://posttrade.api.cmegroup.com/cmestp7d/query` | Trade reports for the 24/7 swaps (FCM back office, not prices) | x-cme-token; entitlement required |

- **Unauthenticated probe results (2026-10-19, fixtures):** `refdata.api.cmegroup.com/refdata/v3/products` and `markets.api.cmegroup.com/marketdatastream/v1` both return `HTTP 401 {"errorResponse":{"code":"401","message":"api key or token is invalid",...}}`; `posttrade.api...` returns 401 FIXML "Authentication Failed". A wiki page quotes `api.refdata.cmegroup.com/v3/...`; that hostname does not resolve (DNS failure), so use `refdata.api.cmegroup.com`.
- **Rate limits:** no numeric REST or WebSocket limits in the pages I read: NOT FOUND (searched the Reference Data API v3 page and the WebSocket API pages). Known: 30-minute token life, book updates throttled to 500 ms per instrument, weekly maintenance window Friday 10:00 pm to Saturday 7:00 pm CT for Reference Data (H).
- **24/7 behaviour a client must handle (H):** daily maintenance 4:00-4:01 pm CT, extended Saturday maintenance 2:00-4:00 am CT during which sessions are dropped and sequence numbers reset to 1; Good-Till orders are not supported on the 24/7 Bitcoin event contracts.
- **Public website:** `cmegroup.com` pages, `robots.txt` and the `CmeWS` quote endpoints returned a 403 scraping notice to the generic UA (fixture). **Do not scrape.**
- **Good news for catalog work:** the CME Client Systems Wiki is public, and its REST API (`/wiki/rest/api/search`, `/wiki/rest/api/content/{id}?expand=body.storage`) answered unauthenticated GETs. It documents technical behaviour only (no prices, no contract specs). I treated it as a documentation source, not a data feed.

---

## 5. Trade path

- **Native path (H):** iLink order entry (binary/FIX) to **Market Segment Gateway 90** (24/7 swaps), new Order Entry Service Gateway for "Event Contracts II" (market segment id 4), Drop Copy on segment 90, trade capture via STP FIXML. Clients already certified on MDP 3.0, iLink and Drop Copy 4.0 need no new certification, but the sessions are sponsored by a clearing firm and sit behind Globex Credit Controls (GC2) and Inline Credit Control.
- **Per-FCM opt-in (H):** "the clearing firm administrator must select Accept (default selection is Reject)" for Event Contract Swaps, with a separate switch for the sports subset. So each FCM chooses whether to carry them.
- **CME Direct does not support the swap-based event contracts** (H). The Convenience Gateway sessions have no access to the 24/7 markets (H).
- **Retail/API-adjacent routes (M, sibling notes):** IBKR exposes CME event contracts with `exchange=CME`, `secType` FOP/OPT and `tradingClass` beginning "EC" via its Web API and TWS API (`docs/research/venues/interactive-brokers-forecasttrader.md`); FanDuel Predicts and DraftKings Predictions are closed apps (their sibling notes). I did not verify which CME family IBKR carries (the "EC" class suggests the legacy options). Whether the new swaps are reachable through IBKR: **NOT FOUND**.
- **Signing scheme:** FIX/iLink session credentials and FCM account authority. No wallet signature, no EIP-712.

---

## 6. PayBox reachability

**paybox_reachable: no.** Reasons (H unless noted): off-chain; USD cash at an FCM; identity is a KYC'd customer of an FCM; orders are FIX/iLink messages on a sponsored session; no transaction proposal or signed-order format exists for a wallet. `discover_plugins("CME Group event contracts")` returned no plugin (2026-10-19). `discover_services("CME event contracts")` returned no CME service; it surfaced an unrelated third-party x402 listing described as "regulated US event contracts (prediction markets): implied probability, bid and ask, volume" (not verified, not called, no payment; whether it covers CME is unknown, M). Funding an FCM account from a wallet (stablecoin on-ramp) might exist at some brokers but would not make the position PayBox-tradable. Unverified.

---

## 7. Fees

- **Exchange fee:** CME's event-contract fee schedule is on cmegroup.com: **NOT FOUND** (blocked).
- **IBKR US (M, via sibling note `interactive-brokers-forecasttrader.md`, which read `interactivebrokers.com/en/pricing/commissions-events.php` on 2026-10-19 as H):** CME Event Contracts: IBKR commission USD 0.01 per contract plus third-party exchange fee USD 0.01 per contract. IBKR itself was 403 to me.
- **DraftKings (M, NEXTPredict summary quoted in `draftkings-predictions.md`):** CME contracts $0.02 per contract per side.
- **FanDuel Predicts (M, NEXTPredict page summary):** a "2% transaction fee" described as applying on cash-outs/early sells, 2 cents per dollar of potential payout; the page's own text is internally inconsistent about whether it applies at settlement. Irrelevant for a scanner that excludes FanDuel as a leg.
- Payer: the customer, per fill. Plan on **about $0.02 per contract per side all-in on a $1 contract** (M); that is 2% of notional at a 50-cent price and about 4% at 5 cents, so tails are expensive. Settlement/exercise fee: NOT FOUND.

---

## 8. Resolution and dispute risk

- **Mechanism (H for the structure):** exchange-determined cash settlement. Swaps settle at 0 or 100 published on MDP 3.0 and channel 263 as preliminary (flag `00000010`) then final (`00000011`) then "FinalFinal" (`00100011`) settlement. **Weekend rule:** "Final settlements ... will only occur during the week", so a contract that expires Saturday or Sunday has only a preliminary actual settlement until the next business day (H). Legacy options settle against the true underlying future's settlement (M, from the `TrueUnd` field: it "determine[s] whether the contract finished in or out of the money"), with the exact-at-strike case going to No (`ATMFlag = ITMP`, H).
- **Reference source per contract** (e.g. which CPI print, which BTC benchmark, which sports result feed): NOT FOUND (rulebook and contract specs are on the blocked site). Third-party hints (M, `draftkings-predictions.md`): CME Group data for indices, commodities and economic data; Nadex for crypto.
- **Dispute process:** no on-chain or token-holder dispute. Disputes and corrections are CME rulebook and CFTC matters; the rulebook text on voids, postponements and corrections was not readable (NOT FOUND). Reference Data has an `assetStatus = POSTPONED` flag, so postponement is a modelled state (H).
- **Arbitrage risk:** the same real-world event can settle on a different source and timestamp than Kalshi or Polymarket (for example BTC benchmark, S&P settlement vs close, CPI release revisions). Per-contract rule matching is required before pairing legs (see `docs/market-linking-design.md`). Cross-reference: ForecastEx `FES`/`FNQ` contracts themselves settle on the CME E-mini daily settlement (H in `forecastex.md`), so CME index contracts and ForecastEx index contracts share an oracle.

---

## 9. Geo, ToS and automation

- **Website:** "Use of scripts, software, spiders, robots, avatars, agents, tools or other scraping mechanisms is strictly prohibited by CME Group's website Data Terms of Use" and the IP was blocked on the first request (H, fixture). I made a handful of probes in one short burst and then stopped. The first WebFetch attempts to `cmegroup.com` timed out.
- **Location control (H):** for the swap instruments, Globex validates iLink tag 9537 (Location) on new order, cancel/replace, mass quote and cross; a restricted jurisdiction is rejected with a Business Reject (tag 380 = 100, text "Value is incorrect for this tag '9537'"). Restrictions are per instrument, which fits sports being limited by state. Docs also say "Clients in permitted foreign jurisdictions can trade these products 24/7".
- **Who can trade:** only through an FCM that has opted in (default Reject, H). Individual eligibility is set by the FCM (FanDuel: US-wide for financial contracts, sports in 18 states per NEXTPredict, M).
- **Automation:** algorithmic access is the native mode of Globex via iLink and market-data licences; it needs a sponsoring clearing firm, credit limits (GC2, weekend limits from 2026-05-11, kill switch from 2026-05-29) and compliance with CME rules (rule text not read). Market-data licence and redistribution terms: NOT FOUND. Assume redistribution or display of CME prices inside an aggregator needs a CME licence (M).
- **Regulatory/political risk (M):** CME's CEO publicly criticised sports prediction markets on the Q2 2026 call (NEXTPredict, 2026-08-07); NEXTPredict links the retreat to legal and regulatory risk around sports (M, the stated reason is not in CME's or Flutter's own text). Financial contracts are not in that line of fire as far as I could tell.

---

## 10. Liquidity

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| Cumulative event contracts traded | **100 million** in about 8 weeks since the December launch (about 1.8M contracts/day average, my arithmetic) | PR Newswire 2026-02-13 | H, **stale (8 months)**, includes sports, contracts not dollars |
| Notional | Not stated by CME. If one contract is a $1 payout (M), traded notional is at most about $100M for that period | inference | L |
| Current ADV, open interest, volume by product | **NOT FOUND**. CME's Q1 and Q2 2026 earnings releases do not break out event contracts; their ADV "includes futures and options on futures only" | PR Newswire 2026-04-22, 2026-07-22 | H (absence) |
| FanDuel Predicts economics | "FanDuel Predicts Q2 revenue was not material" | Flutter Q2 2026 release, 2026-08-05 (via sibling note) | M |
| Cleared volume / OI per instrument | Exposed by the licensed `STAT` WebSocket messages, not publicly | wiki | H |

Interpretation: the 100M figure shows real retail demand, but most of the period (Dec 2025 to Feb 2026) was NFL season, and sports have since moved to CDNA for FanDuel. The residual financial and macro flow on CME is therefore unknown and could be a small fraction. Treat liquidity as **unverified until measured through a licensed feed**.

---

## 11. Event coverage (overlap with other venues)

All swap categories H from the wiki and PR Newswire unless noted.

| CME category | Examples | Overlaps | Note |
|---|---|---|---|
| Equity indices | S&P 500, Nasdaq-100 (swaps: "multiple times a day"; legacy: `ECES`) | Kalshi index brackets, Polymarket index up/down, ForecastEx `FES`/`FNQ` (which settle on CME E-mini settlement) | Best fit: CME is the reference source |
| Crypto price | Bitcoin event contracts (legacy `ECBTC`, 24/7); crypto swaps on "key cryptocurrencies" | Polymarket and Kalshi BTC/ETH/SOL thresholds, ForecastEx crypto | Benchmark and timestamp must match |
| Commodities and FX | Oil and gas, gold, metals, EUR/USD etc. (legacy) | Kalshi commodity brackets, ForecastEx gold/silver/copper | |
| Macro | GDP, CPI at launch; others (unemployment, NFP, fed funds) reported by third parties (M) | Kalshi economics, Polymarket Fed/CPI | Source revision rules matter |
| Sports | Game point spreads and totals (pro football, basketball, hockey, college), season champions, tennis, international hockey, Olympic medal counts (listed Dec 2025 to Feb 2026) | Kalshi, Polymarket sports | **Being moved off CME for FanDuel (Flutter, H)**; whether CME still lists or trades them: NOT FOUND |
| Culture / novelty | Grammys, "Best of 2026 Oscars" | Kalshi, Polymarket entertainment | Same caveat |
| Politics | None found for CME | | NOT FOUND |

---

## 12. Does it share liquidity with another venue?

- **CME is the source book; the others are doors into it.**
  - **FanDuel Predicts**: FCM FanDuel Prediction Markets LLC, "powered by CME Group & CDNA markets" (M via sibling `fanduel-predicts.md`); CME financial contracts only going forward (Flutter, H). Plus500 is the clearing partner (M via sibling `plus500-futures-us-event-contracts.md`, which read it first-hand).
  - **DraftKings Predictions**: introducing broker with Wedbush as FCM; CME and CDNA are the exchanges (H in sibling `draftkings-predictions.md`, from the 10-K).
  - **Interactive Brokers**: CME event contracts reached from an IBKR account (M via sibling).
- **So FanDuel, DraftKings, Plus500 and IBKR-CME are not independent legs.** A price seen on any of them is the CME book (or, for sports/novelties on FanDuel and some DraftKings contracts, the CDNA book).
- **CME is independent of** Kalshi, Polymarket, ForecastEx, Limitless etc. Register it as `exchange = cme`, `independent = true`, `public_read = false`, `aliases = [fanduel-predicts (financial), draftkings (CME slice), ibkr-cme, plus500 (clearing)]`.
- Possible market-maker overlap (M): Flutter says it has begun market-making across prediction-market platforms (about $50M revenue expected in 2026 from market-making, H via the same Flutter release), so a quote on CME may be reflecting FanDuel's own pricing engine.

---

## 13. Adapter recommendation

**adapter_priority = P2** (signal-only, licence-gated).

- Independent order book: yes. Strong API surface: yes, but authenticated, licensed, FCM-gated and not testable by me. Liquidity: large headline, unverified for the surviving financial slice. PayBox trade path: none.
- If the operator already has a CME market-data entitlement (WebSocket API or Smart Stream), a read-only adapter is cheap and well specified: discover instruments with Reference Data v3 (`subtype=EVTSW` and `EVENT`, read `eventName`, `fixPayout`, `referenceProduct`), subscribe to `TOB`/`TRD`/`STAT` over the WebSocket, and treat settlement 0 or 100 as truth. Without an entitlement, do not build it; the only unauthenticated paths (the website) are prohibited.
- A trading adapter is out of scope: it would be an FCM integration with a human-held, KYC'd account.
- Re-check after CME's Q3 2026 earnings (about 2026-10-21/22) for any event-contract volume disclosure, and after a measured week of `STAT` data.

---

## 14. NOT FOUND (searched: cmegroup.com [403/blocked], CME Client Systems Wiki, PR Newswire CME releases, SEC `data.sec.gov` submissions index, Wikipedia, NEXTPredict, Flutter Q2 2026 release; the WebSearch budget was already exhausted when I started, so no web searches ran)

- CME event-contract product pages, rulebook chapters, contract specifications, price/payout multiplier of the swaps, the product list `event-swaps-products.csv`, the exchange fee schedule, the market-data licence price and redistribution terms (all on the blocked site).
- Per-contract settlement sources and the dispute/void clauses.
- Current ADV, open interest or notional for event contracts; the split between sports and financial volume.
- Whether sports swaps are still listed and trading on CME after the FanDuel move.
- Numeric rate limits for the Reference Data API and WebSocket API.
- Whether the new swaps are reachable through IBKR (as opposed to the legacy `EC*` options), and Robinhood/Webull/Coinbase links to CME event contracts (no hits in sibling notes).
- SEC filing text (10-K 2025, 10-Q Q2 2026): `www.sec.gov/Archives/...` returned 403 to the generic User-Agent. Recorded as **blocked: requires a contact address**. Only the `data.sec.gov` submissions index (list of filings) was readable. Wikipedia's "CME owns 51%" of the FanDuel JV is a Wikipedia statement citing the 10-K; Flutter's statements show a non-controlling interest "in Sisal and CME", so the ownership split is unreconciled (irrelevant for the adapter).

## 15. Fixtures (`docs/research/fixtures/cme-group-event-contracts/`)

| File | What it is |
|---|---|
| `README.txt` | Index and warning that there is no live market-data sample |
| `cmegroup_403_scraping_notice.txt` | Real 403 body from `cmegroup.com` (contact address redacted) |
| `refdata_v3_products_unauth_401.txt` | Real 401 from the Reference Data API (headers+body) |
| `markets_ws_marketdatastream_unauth_401.txt` | Real 401 from the WebSocket API host |
| `posttrade_stp_unauth_401.txt` | Real 401 FIXML from the STP host |
| `wiki_search_api_response_event_contracts.json` | Real response from the public Confluence search API (documentation index) |
| `wiki_event_contracts_master_file_page.txt` | Wiki text: legacy event-contract CSV schema (documentation, not a live response) |
| `wiki_event_contracts_overview_page.txt` | Wiki text: Reference Data fields (`subtype=EVENT`, `fixPayout`, `referenceProduct`); notes the unresolvable host |
| `wiki_swap_based_event_contracts_excerpts.txt` | Selected passages: channels 333/263, segment 90, tag 9537, settlement flags, STP |
| `wiki_event_based_contracts_247_excerpt.txt` | Excerpt: Bitcoin event contracts to 24/7, maintenance windows |
| `flutter_q2_2026_cme_excerpt.txt` | The Flutter sentence about moving sports to Crypto.com |

## 16. Sources

- CME Client Systems Wiki (public Confluence), fetched 2026-10-19: Event Contracts (`/spaces/EPICSANDBOX/pages/457220544`), Event Contracts Master File (`.../457088455`), Swap-Based Event Contracts and 24-7 Trading (`.../988020743`), Event-Based Contracts Expansion to 24-7 Trading (`.../1394343937`), New 24-7 Event Contracts (`.../1062502402`), MDP 3.0 Channel Guide (`.../457323048`), CME Reference Data API Version 3 (`.../457215780`), Product Parameter Specifications (`.../457413675`), Instrument Attribute Specifications (`.../457413632`), Real-Time Futures and Options WebSocket API (`.../457414253`), Revision History (`.../457411930`). H.
- PR Newswire: CME and FanDuel partnership (2025-08-20, `.../cme-group-and-fanduel-partner-to-develop-innovative-event-contracts-platform-302534926.html`); CME 100 million event contracts traded (2026-02-13, `.../cme-group-announces-100-million-event-contracts-traded-302688111.html`); CME Q4 2025, Q1 2026 and Q2 2026 earnings releases (`.../302678360`, `.../302749450`, `.../302831456`); CME September/Q3 2026 ADV (2026-10-02, no event-contract mention). H (read through the fetch tool's page summaries).
- Flutter Entertainment Q2 2026 earnings release (2026-08-05): `https://flutter.com/media/g23an0ae/flutter-q2-2026-earnings-release.pdf`, text extracted locally. H.
- NEXTPredict: `https://nextpredict.io/platforms/` (discovery hint), `.../platforms/fanduel/`, `.../platforms/cme-group/` (article "CME Group distances from FanDuel Predicts, but still open to retail flow", 2026-08-07). M.
- Wikipedia (REST page source) "CME Group", "FanDuel", "Crypto.com", fetched 2026-10-19 (leads and citations only). M.
- Yahoo Finance (FanDuel/Crypto.com announcement 2026-06-09) and FOW summary. M.
- SEC `https://data.sec.gov/submissions/CIK0001156375.json` (filing list only). H.
- Probes of `refdata.api.cmegroup.com`, `markets.api.cmegroup.com`, `posttrade.api.cmegroup.com`, `www.cmegroup.com` (see fixtures). H.
- In-repo sibling notes, read as M: `docs/research/venues/fanduel-predicts.md`, `draftkings-predictions.md`, `interactive-brokers-forecasttrader.md`, `forecastex.md`, `plus500-futures-us-event-contracts.md`.
- PayBox `discover_plugins` and `discover_services` (read-only), 2026-10-19.

## 17. Privacy and safety

Every scripted request used only the User-Agent `insurance-markets-research/0.1`; no contact address, email, name, username or home path went into any request, header, query or fixture (the fixture folder and this note were grepped for such identifiers before finishing). The one local helper (a PDF text extractor using macOS PDFKit) contained no identifiers and ran offline. After CME's block notice I sent no further requests to `cmegroup.com`. No suspicious or instruction-bearing content was found in any source. Three pages carried 403/timeouts (cmegroup.com, interactivebrokers.com, fanduel.com) and were not worked around.
