# Robinhood prediction markets hub - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:30-01:40 UTC). READ-ONLY: unauthenticated GETs to robinhood.com (landing page, sitemaps, newsroom, support articles, legal PDFs), to Rothera's public-files host and to Kalshi's public market endpoint; WebFetch of The Block; one read-only PayBox `discover_plugins` and one `discover_services` call (discovery only, nothing signed or paid, no 402 was received). No account, key, wallet, signature, POST/PUT/DELETE or browser automation. Third-party text was treated as untrusted data and no instruction in it was followed. Generic User-Agent `insurance-markets-research/0.1` only.

Method limit: the shared WebSearch budget was exhausted before this task started, so nothing here comes from a search engine. The cryptotimes article named in the discovery hint could not be located (URL unknown). Everything below comes from direct fetches of known URLs and links found on Robinhood's own pages.

Relationship to existing notes: `docs/research/venues/robinhood-prediction-markets.md` (a parallel pass over the same venue, slug without "-hub"). This note re-verified its key claims first-hand, found them intact, and adds the points flagged "NEW" below.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summarised-page read, or my inference from first-hand data; **L** = weak or stale (> 6 months).

Fixtures: `docs/research/fixtures/robinhood-prediction-markets-hub/` (4 files, section 15).

---

## 0. Verdict

**adapter_priority = skip** (as a Robinhood adapter). Confidence: high.

1. **Live and the largest US retail distribution channel (H/M).** Landing page returns 200 with live quotes timestamped 2026-10-19T01:30Z (H). Robinhood says 13.6 billion event contracts traded in Q2 2026 and over 45 billion since the March 2025 launch (H, newsroom 2026-09-08). The Block reports $156M of Q2 2026 event-contract revenue, more than crypto ($100M) or equities ($129M) (M, 2026-07-29).
2. **It is a broker/frontend (FCM), not an exchange, so it is not an independent liquidity leg (H).** Robinhood Derivatives, LLC routes every contract to one of four CFTC exchanges: Kalshi, ForecastEx, Rothera, and Crypto.com | Derivatives North America (CDNA, shown to users as OG.com). Each contract object on the landing page carries its exchange (`exchange: EXCHANGE_SOURCE_KALSHI|FORECASTEX|ROTHERA|CDNA`) and the exchange's own symbol.
3. **Shared liquidity re-proven (H, fixture `rh-vs-kalshi-top-of-book-hub.json`).** For four Kalshi-routed contracts (a Premier League match, a Serie A match, a BTC-year ladder rung and a WTA match) Robinhood's yes/no bid and ask equalled Kalshi's public API to the cent (one ask differed by 0.001 on a sub-cent-tick ladder, consistent with a seconds-long lag), and open interest matched to within 0.3%.
4. **No API and no programmatic trade path for event contracts (H).** Trading is mobile-app only; the web is view-only. docs.robinhood.com covers the Crypto Trading API only; the Agentic Trading MCP lists Account, Watchlist, Market data, Equities, Options, Crypto tools. Robinhood's own 2026-05-27 post says "event contracts, futures, and more are coming soon". That is the re-check trigger.
5. **Not reachable from a PayBox/EVM wallet (H).** USD cash in a KYC'd, US-resident-only brokerage; no chain, token or signed-order path. PayBox discovery returns no Robinhood plugin.
6. **NEW, one narrow value (H for the facts, M for the use).** The unauthenticated landing-page JSON carries live top-of-book with sizes for **Rothera, CDNA and ForecastEx** contracts, books that otherwise have no free live feed (Rothera: EOD files and FIX only; CDNA: FCM API in private beta; ForecastEx: CSV snapshots only). It is a CDN-cached (60 s) unofficial surface under content terms that forbid commercial mirroring, so it is at best an optional research-only signal, not an adapter.
7. **The real arbitrage legs are the exchanges Robinhood routes to** (Kalshi: covered elsewhere; Rothera, ForecastEx: sibling notes, both P2; CDNA/OG.com: no spec yet). The aggregator should map Robinhood symbols to exchange tickers and treat Robinhood as a label, never as a second book.

---

## 1. Is it still live? (2026)

| Evidence | Date | Tag |
|---|---|---|
| `GET https://robinhood.com/us/en/prediction-markets/` returns 200, 1,859,965 bytes, 54 featured events, 510 quote objects; newest quote `updated_at` 2026-10-19T01:30:07Z; an NFL game (Dallas v Green Bay, Rothera) in progress at Q2 4:18 | 2026-10-19 | H |
| `sitemap-prediction-markets.xml` (via `/us/en/` path): 4,135 URLs, 3,893 under `/events/`, newest lastmod 2026-10-19T01:37:57Z. The catalogue includes past events (dated Jan-Apr 2026 in their slugs), so 3,893 is not a live-market count | 2026-10-19 | H |
| Newsroom: hub launched 2025-03-17, "initially ... through KalshiEX LLC" | 2025-03-17 | H (older than 6 months, historical) |
| Newsroom: routing to Rothera starts 2026-06-04 ("a new affiliate exchange") | 2026-06-04 | H |
| Newsroom: routing to CDNA/OG.com starts 2026-09-08 | 2026-09-08 | H |
| Support article "Event contracts overview" names four exchanges: KalshiEX LLC, ForecastEX, LLC, Rothera Exchange and Clearing LLC, North American Derivatives Exchange, Inc. (the CDNA legal name); fee changes "effective June 1, 2026"; Michigan restriction effective 2026-09-09 | >= 2026-09-09 | H |
| The Block, 2026-07-29: Q2 event-contract revenue $156M | 2026-07-29 | M (read through a summarising fetch) |

Verdict: **still_live = true.**

---

## 2. Kind and structure

- **Kind: broker/frontend** (H). Page footer: "Event contracts are offered by Robinhood Derivatives, LLC., a registered futures commission merchant and swap firm." The Event Contracts Risk Disclosure (PDF dated 2026-06-01) says RHD "may clear swap transactions, or event contracts, for its clients as a clearing member of ForecastEx, Kalshi, or Rothera Exchange and Clearing LLC" (H; this document predates the CDNA deal and does not list CDNA).
- **Routing is per contract and chosen by Robinhood, not the user** (H, newsroom 2026-09-08): College and Pro Football "will route across OG.com, Kalshi, and Rothera, based on factors including what each exchange has available"; "event contracts will still route to Kalshi, ForecastEX, and Rothera"; midterm contracts route to Kalshi and Rothera, "with potential expansion to Crypto.com and OG.com in the coming weeks".
- **Per-contract exchange tag (H, fixture `rh-hub-exchange-source-tally.json`)**, 54 featured events, 512 contract objects on 2026-10-19:

| `exchange` (numeric `exchangeSource`) | contracts | symbol style | typical content in the featured set |
|---|---|---|---|
| `EXCHANGE_SOURCE_KALSHI` (2) | 384 (326 tradable) | Kalshi ticker, e.g. `KXEPLGAME-26OCT19TOTCOV-TOT` | tennis, soccer, esports, cricket, BTC ladders, rain, Fed/recession, AI model |
| `EXCHANGE_SOURCE_FORECASTEX` (1) | 109 (99 tradable) | `YXLBT_123126_80000` | BTC drawdown, metals, temperature |
| `EXCHANGE_SOURCE_ROTHERA` (3) | 13 (all tradable) | `NFLGAME-26OCT18DALGB-DAL` | NFL games, MLB, Fed decision |
| `EXCHANGE_SOURCE_CDNA` (4) | 6 (all tradable) | `NX.F.OPT.CFB-00001-261020-M.O.1.1.20270228` | college football games |

  The featured set is skewed to whatever Robinhood promotes; it is not the catalogue mix.
- **Ownership relations (H, Robinhood newsroom):**
  - Rothera: Robinhood Markets is "the controlling partner" of the joint venture that manages the exchange; Susquehanna is "a key partner and day-one liquidity provider"; MIAX retained "a strategic 10% equity stake"; the JV closed its acquisition of MIAXdx (a DCM/DCO/SEF) on 2026-01-20. Robinhood's percentage is not stated. (https://robinhood.com/newsroom/robinhood-prediction-markets-joint-venture/)
  - Crypto.com / OG.com: "Robinhood Markets will hold equity stakes in Crypto.com and OG.com following the latter's spin-off as an independent trading platform", priced in line with Citadel Securities' investment at a $20 billion valuation. **No stake size and no word "minority" appears in the primary post.** The discovery hint's "minority stakes" (cryptotimes) is therefore unverified (L); "clears through an exchange it partly owns" is true of Rothera in the sense that Robinhood is the controlling partner of its owner, not a minority holder.
  - Kalshi and ForecastEx: independent of Robinhood (ForecastEx is an Interactive Brokers subsidiary per the sibling note, M). The Block describes both as sources, not affiliates (M).
- **Commercial steering risk (M):** because Robinhood owns or will own equity in two of its four venues, per-contract routing may follow commercial interest as well as "what's available". The user gets no best-execution choice.

---

## 3. Market model

- **Binary Yes/No only for standard contracts** (H, support "Event contracts overview"): "Each contract is a binary Yes/No position"; price $0.01 to $0.99; settles $1 or $0. Non-standard payouts exist (tie $0.50 to both sides in boxing and pro football; tennis walkover at last traded price; cancelled or suspended events per the exchange) (H, support "Event contract settlement").
- **Categorical and scalar markets are sets of binaries** (ladders of threshold or bucket contracts with 20-40 rungs for BTC price, rain by city, etc.; `mutuallyExclusive` flag on winner-style events). Price sums need not equal 1 (M, not tested here).
- **Order book: each exchange runs its own CLOB; Robinhood shows one exchange's top of book.** The quote object (H, fixture) has `yes_bid_price, yes_ask_price, no_bid_price, no_ask_price, bid_size, ask_size, last_trade_price, last_trade_size, updated_at, state, symbol, instrument_id` plus venue timestamps. **Sizes are populated for Rothera, CDNA and ForecastEx quotes and null for all 384 Kalshi-routed quotes** (H, tally). `fundamentals.volume` is populated only for Rothera and CDNA contracts and is "0" for Kalshi/ForecastEx ones; `open_interest` is populated for all.
- **Tick:** `tickPriceRanges` 0 to 1 step 0.01 on sampled contracts; sub-penny pricing on some markets (H; support "Trading event contracts").
- **Combos:** preset and custom combos up to 10 legs trade as one contract, FOK (H).
- **Tokenisation: none** (H by absence). Positions are rows in an FCM account at Robinhood Derivatives cleared by the exchange's DCO. The Risk Disclosure adds: "Event Contracts cannot be sold or transferred to another Exchange"; exit before resolution only by taking an offsetting position (H). So a Robinhood position cannot be hedged by transfer, only by an opposite trade on the same exchange.

---

## 4. Chains and collateral

- **Collateral: USD cash**, held in a Robinhood Derivatives account funded from the customer's linked securities account; ACH instant deposits are not available for event contracts (H, support overview; RHD client agreement dated 2026-09-16 footer, per earlier extraction of the same PDF, hash-matched).
- **Chains: none.** Robinhood runs an Arbitrum-platform L2 (Robinhood Chain, public mainnet announced 2026-07-01, chainId 4663 per this repo's PayBox notes), but the mainnet announcement does not mention prediction markets or event contracts (H: searched the post for "prediction|event contract|Kalshi|Rothera|ForecastEx", no relevant hit). No on-chain event-contract venue from Robinhood was found.

---

## 5. Read API

**Official: none for event contracts (H, by exhaustive absence). Unofficial: the landing-page Next.js data.**

| Surface | Finding | Tag |
|---|---|---|
| Developer docs `https://docs.robinhood.com/` | Sitemap lists `/`, `/crypto/`, `/crypto/connect/`, `/crypto/trading/`, `/healthcheck/` (lastmod 2026-10-16). Crypto Trading API only. The home page is client-rendered; grep of its HTML for event/prediction/futures: zero hits | H |
| Agentic Trading MCP `https://agent.robinhood.com/mcp/trading` | Tool categories: Account/portfolio/other, Watchlist, Market data, Equities, Options, Crypto; "We'll be adding more tools in future releases"; needs a dedicated MCP account (https://robinhood.com/us/en/support/articles/agentic-trading-overview/) | H |
| Newsroom 2026-05-27 "Robinhood is Now Open to Agents" | "Agentic Trading is launching in beta with support for equities only out of the gate. Support for options, crypto, event contracts, futures, and more are coming soon as we move out of beta." (the support page above, read today, already lists options and crypto but not event contracts) | H |
| **Unofficial: landing page data** | `GET https://robinhood.com/us/en/prediction-markets/` returns HTML whose `<script id="__NEXT_DATA__">` `props.pageProps` has `events[]` (54), `quotes{contractId: quote}` (510), `fundamentals{contractId: {volume, open_interest}}` (485), `eventStates{eventId: {...}}` (54), `navigationTabs`. Header: `cache-control: public, s-maxage=60, stale-while-revalidate=300, stale-if-error=3600`. 1.86 MB per fetch; featured subset only | H |
| Per-event pages | Sitemap lists 3,893 `/events/` URLs; each presumably embeds the same shape; not sampled | M |
| WebSocket / REST host | No API host other than `cdn.robinhood.com` is referenced by the landing page; the app's live transport is not visible. NOT FOUND (private mobile API; not probed) | H |

**Staleness (H, fixture `rh-hub-exchange-source-tally.json`):** at 01:32Z, quote age quantiles over the 510 quote objects were p50 about 71 minutes, p90 about 43 days, max about 260 days (illiquid contracts keep their last update). Any quote older than a few minutes must be dropped. Effective freshness of the freshest quotes is 60 s CDN cache plus up to 300 s stale-while-revalidate, so up to about 6 minutes.

**Better source for every Kalshi-routed contract:** `GET https://api.elections.kalshi.com/trade-api/v2/markets/{ticker}` (public, unauthenticated, 200) returned the same top of book plus sizes, volume and `volume_24h_fp`; use the exchange API (H, fixture).

---

## 6. Trade path

**None programmatic.**

- Order entry is mobile app only: "Prediction markets are currently only available in the Robinhood mobile app ... only available to view on web, not trade ... not available on Robinhood Legend" (H, https://robinhood.com/us/en/support/articles/trading-event-contracts/).
- Order types: IOC limit at the natural price (default), GTD limit (expires 3 AM ET next calendar day, contracts only), dollar orders always IOC and opening-only, custom combos FOK; opening orders in whole contracts (H, same article).
- Account gating: must apply for and be approved for a Robinhood Derivatives account (H).
- The article does not mention an API, bots or automated trading for event contracts (H).
- Agentic Trading MCP cannot place event-contract orders today (tool list above). Auth scheme for the private app API: NOT FOUND (not probed; probing a private API would be reverse engineering).
- Even if event contracts reach the MCP, the account would be a KYC'd individual Robinhood MCP account ("Your agent can only place trades in your Robinhood Agentic account"), still USD, still routed by Robinhood.

---

## 7. PayBox / EVM wallet reachability

**paybox_reachable = no.**

- No transaction proposal or signed-order path exists: positions are FCM-ledger entries in USD (sections 3, 4, 6).
- PayBox catalogue, read-only, 2026-10-19: `discover_plugins("robinhood prediction markets event contracts")` returned `{"plugins":[],"has_more":false}`. `discover_services("robinhood event contracts kalshi")` returned only third-party x402 Kalshi data resellers (agent402.tools, x402tap.com, saylorinnovations.com), accepting USDC on Base, Polygon, Arbitrum, Solana and others. These are unrelated, paid, unverified listings (untrusted data); none was called, none concerns Robinhood or trading.
- PayBox does list Robinhood Chain (4663) in its chain catalogue (this repo, `docs/research/06-paybox-platform.md`, H on 2026-10-19), but no event-contract product lives there.
- Account opening needs US residency, age 18+, an individual brokerage account (H). An agent cannot own such an account.

---

## 8. Fees (who pays what)

All H from https://robinhood.com/us/en/support/articles/event-contracts-overview/ and https://cdn.robinhood.com/assets/robinhood/legal/RHD_Fee_Schedule.pdf (PDF re-downloaded this session, 107,647 bytes, metadata date 2026-05-28; the text "Commission Calculation (Effective June 1, 2026)" and the footnotes were read from a text extraction of the same-named file made earlier in this shared session, so M-to-H for the footnote wording; the formula itself is also stated on the support page I read directly).

- **Robinhood commission (customer pays, on open and on close):** `commission = ceil_to_cent(k * p * (1 - p) * c)`, `k = 10%` without Robinhood Gold, `k = 5%` with Gold ($5/month), p = price in dollars, c = contracts; "maximum of $0.01 per contract". At p = 0.50 the formula gives 2.5c (10%) or 1.25c (5%) per contract so the 1c cap binds for both tiers; at p = 0.90 it is 0.9c or 0.45c; at p = 0.99, 0.1c or 0.05c per contract.
- **Exchange fee (customer pays, passed through):** "Exchanges may charge up to $0.01 per contract on both opening and closing trades." Fee schedule footnote: "Exchange Fees for KalshiEx LLC products offered through Robinhood Derivatives, LLC are $.01 per contract, per side." ForecastEx and Rothera: the schedule defers to the exchanges' own schedules (it also names CME Group; CDNA/OG.com is not mentioned). Sibling notes: ForecastEx $0.01 per contract per side (H there); Rothera `fee = max(round(k*p*(1-p)*c, 2), $0.01)` with retail FCM k = 0.02 (H there, schedule dated 2026-05-20). CDNA: NOT FOUND.
- **Regulatory fee:** schedule lists NFA assessment $0.02 per contract per side ("As of Jan 1, 2018"); whether it applies to event contracts is not stated.
- **Worked example from Robinhood (H):** 100 Yes at $0.90, Gold, exchange fee $0.01: commission $0.45, total cost $91.45 (non-Gold $91.90).
- **NEW sanity check (M, my arithmetic):** $156M Q2 revenue / 13.6B contracts is about 1.15c per contract, consistent with the 1c commission cap plus other revenue; so the all-in friction on the Kalshi route is about 2c per contract per side at mid prices (1c commission + 1c exchange fee), 4c round trip on a $1 contract before spread. Going direct to the exchange is never costlier in explicit fees.
- Promotions can vary effective fees (the schedule "reserves the right to vary its rates and fees among customers").

---

## 9. Resolution mechanism and dispute risk

- **Robinhood does not resolve** (H, support "Event contract settlement"): "Robinhood doesn't determine the official settlement rules." The exchange partner sets terms and the data source; the landing-page JSON carries each contract's rules text and a link to the exchange's terms PDF (example: Rothera `NFLGame-T&C.pdf`: tie resolves $0.50 each; cancelled game settles "to the fair market value as determined by Rothera").
- **Timing:** sports usually 1-2 business days, elections much slower; proceeds withdrawable about 1 business day after settlement (H).
- **Dispute:** no on-chain oracle or UMA-style dispute. The article describes no formal appeal; wording issues are handled by exchange clarification and brief trading pauses (H). Robinhood "can't modify" outcomes.
- **Counterparty:** each position is cleared by the exchange's DCO with RHD as clearing member; on RHD insolvency customer rights follow Bankruptcy Code commodity-broker provisions and CFTC Part 190 (H, Risk Disclosure).
- **Cross-venue risk (M):** the same real-world question can resolve differently per exchange (tie treatment, overtime, suspended games, source agency). A Robinhood leg and a non-Robinhood leg with matching titles are not guaranteed to be equivalent; compare rules text before treating as an arbitrage pair.

---

## 10. Shared liquidity (is Robinhood an independent leg? No.)

Independence map for the aggregator:

| Robinhood label | Real book | Independent of Robinhood? | Evidence |
|---|---|---|---|
| Kalshi-routed | Kalshi CLOB | No: Robinhood is one FCM into Kalshi's single book | 4/4 price and OI match in fixture (H) |
| Rothera-routed | Rothera CLOB (retail via FCMs, Robinhood the visible one) | No for Robinhood, but Rothera is a separate book from Kalshi | Rothera sibling note + newsroom (H/M) |
| ForecastEx-routed | ForecastEx CLOB (also reachable via IBKR, Advantage Futures) | No for Robinhood | forecastex sibling note (M here) |
| CDNA/OG.com-routed | CDNA CLOB (Crypto.com App and OG.com) | No for Robinhood | newsroom 2026-09-08 (H) |

Robinhood "does not make markets in any futures or event contracts" (H, hub launch post 2025-03-17, older than 6 months but the FCM status is unchanged in the 2026 footer; the 2026-09-08 post describes routing only). The cross-exchange arbitrage is between the exchanges (Kalshi v Rothera v CDNA v ForecastEx) and between each and on-chain venues. Robinhood customers cannot exploit it because Robinhood picks the exchange per contract.

---

## 11. Liquidity (volumes with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Event contracts traded, Q2 2026 | 13.6 billion; over 5 billion during the World Cup | Robinhood newsroom 2026-09-08 | H |
| Since launch (~18 months) | over 45 billion; over 30 billion in Jan-Aug 2026 | same | H |
| Q2 2026 event-contract revenue | $156M (vs crypto $100M, equities $129M); total net revenue $1.31B | The Block, RT Watson, 2026-07-29 | M |
| Dollar notional | NOT FOUND (searched: newsroom posts, Q2 results newsroom stub which only links to investors.robinhood.com, support). Face-value ceiling is contracts x $1 = $13.6B for Q2 (M, my arithmetic); premium traded is lower and unknown | - | M |
| Open interest on the landing page, 54 featured events (contracts) | Kalshi-routed 73.4M; Rothera-routed 9.8M; ForecastEx-routed 1.7M; CDNA-routed 12.6k | page `fundamentals`, 2026-10-19 01:32Z | H (sums mine) |
| Rothera whole-exchange, trade date 2026-10-18 | 71.4M contracts, 184,790 trades, open interest 98.3M contracts; NFLGAME 44.3M of volume | Rothera `mkt_eod_20261018.csv`, fixture `rothera-mkt-eod-20261018-derived.json` | H |
| ForecastEx | about $0.5M/day matched notional (30-day avg), open interest about $10.1M | sibling note `forecastex.md`, 2026-10-18 | M here |
| Single live event | Dallas v Green Bay NFL (Rothera): DAL contract volume 3.93M, OI 4.04M at 01:30Z, bid 0.28 x 17,700 / ask 0.29 x 24,000 | page `quotes`/`fundamentals` | H |
| Kalshi-side example | Tottenham v Coventry: Kalshi 24h volume 34,094 contracts, OI 42,977; Robinhood shows OI 42,874 | Kalshi public API vs page, 2026-10-19 | H |

Unit caution: counts are contracts (face value $1), not dollars. What share of Kalshi's or Rothera's volume is Robinhood-originated is NOT FOUND (the exchanges' public data does not split by FCM).

---

## 12. Event categories and overlap (where arbitrage exists)

Categories (H, page navigation tabs): Featured, Live, 15 min, NFL, College football, Midterms, Baseball, Boxing, Chess, Climate, College basketball (M/W), Commodities, Cricket, Crypto, Canadian football, Economics, Education, Elections, Entertainment, Esports, Financial, Golf, Metals, MMA, Politics, NBA, NHL, WNBA, Racing, Soccer, Technology, Tennis.

| Category | Overlap with other venues | Note |
|---|---|---|
| Sports (NFL, soccer, tennis, NBA, NHL, esports) | Polymarket, Limitless, Kalshi direct, Rothera/CDNA direct | highest liquidity here; highest wording risk (ties, OT, suspension) |
| Politics / midterms / elections | Polymarket, Kalshi, Limitless, PredictIt, Rothera | Kalshi + Rothera routed now; CDNA "in the coming weeks" |
| Crypto price | Polymarket, Limitless, Kalshi; ForecastEx drawdown ladder | BTC end-2026 ladder from Kalshi (KXBTCY-27JAN0100-*) |
| Macro (Fed decision, rate cuts, recession) | Polymarket, Kalshi, Rothera, ForecastEx | Rothera lists Fed outcomes (symbol `ECUSFED-*` per sibling note) |
| Tech / culture | Polymarket, Kalshi | AI-model and streaming-count markets |
| Weather, metals, tuition | ForecastEx, Kalshi | little on-chain overlap |

---

## 13. Geo, ToS and automation rules

- **Eligibility (H, support overview):** US resident, 18+, individual brokerage account; not available in all states; "Maryland and Nevada residents can't trade sports contracts. Michigan residents can't open new sports contracts as of September 9, 2026." Derivatives account approval depends on experience, profile and state (H, trading article).
- **Automation:** no clause permits or prohibits bots for event contracts, and no sanctioned route exists. The RHD client agreement says use of Electronic Trading Services "is governed by additional agreements, disclosures, and terms" (an Electronic Trading and Order Routing Systems Disclosure, not read) and that the customer is "solely responsible for all orders entered or attempted" (H, hash-matched PDF extraction). Keyword search of the Terms and Conditions and client agreement for automat/scrap/robot/crawl/algorithm/API found no automation clause beyond the above and the content licence.
- **Content licence (H, https://cdn.robinhood.com/assets/robinhood/legal/Robinhood%20Terms%20and%20Conditions.pdf):** "Content is provided exclusively for personal and noncommercial access and use"; no part may be copied or distributed "including 'mirroring'" without consent. Scraping the landing page into a commercial aggregator is a ToS risk (M, my reading, not legal advice). `robots.txt` disallows only `/referral/`, `/user/`, `/subscriptions/`, `/reset_password/`, `/say-brokers/`, `/nexus/`, `/natedogg/`; the prediction-markets path is not disallowed (H).
- **Regulatory context:** CFTC-regulated; state litigation and CFTC posture in 2026 were not researched (search budget exhausted). NOT FOUND.

---

## 14. Recommendation for the aggregator

1. **Do not build a Robinhood adapter or treat Robinhood as a venue.** No API, no trade path, shared liquidity, restrictive content licence.
2. **Use Robinhood only as a symbol/label map.** Contract `symbol` is the exchange's own ticker and `exchange` names the book, so a Robinhood contract maps one-to-one to a Kalshi/Rothera/ForecastEx/CDNA instrument; dedupe on (exchange, symbol).
3. **Build or keep the exchange adapters:** Kalshi (parallel workflow, public REST), Rothera and ForecastEx (sibling notes, P2 signal-only), CDNA/OG.com (no spec yet; its FCM API at `exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction` is "under private beta", POST-only, HMAC-SHA256 private endpoints, requires an approved FCM account, and does not mention event contracts or CDNA, H).
4. **Optional research-only signal (NEW):** the landing-page JSON is currently the only free near-live view of Rothera, CDNA and ForecastEx top-of-book with sizes. If used at all, restrict to non-Kalshi `exchange` values, enforce the staleness guard (drop quotes older than about 2 minutes and treat the 60-300 s cache as latency), cap request rate, and weigh the content licence. Prefer sanctioned feeds (Rothera EOD files, ForecastEx CSV) for anything redistributed.
5. **Re-check triggers:** event contracts added to the Agentic Trading MCP tool list (Robinhood has said "coming soon"); a Robinhood event-contract developer API; Robinhood Chain event contracts; CDNA public API leaving private beta; Robinhood publishing per-exchange volume.

---

## 15. Fixtures (real responses or tables derived from them, each <= 50 KB)

`docs/research/fixtures/robinhood-prediction-markets-hub/`:

- `rh-hub-page-data-sample.json` (44.6 KB): trimmed `__NEXT_DATA__` extract from `GET https://robinhood.com/us/en/prediction-markets/` at 2026-10-19T01:32Z: one event per exchange (Rothera, Kalshi, CDNA, ForecastEx), up to 6 contracts each, with `quotes`, `fundamentals`, `eventState`; images, icons, colours and layout fields dropped, long text capped at 700 chars.
- `rh-hub-exchange-source-tally.json`: contracts per `exchange` and tradability, open interest per exchange, quote-age quantiles, navigation tab names.
- `rh-vs-kalshi-top-of-book-hub.json`: four-ticker Robinhood v Kalshi comparison (section 0 point 3).
- `rothera-mkt-eod-20261018-derived.json`: Rothera whole-exchange totals for 2026-10-18 and column list from `mkt_eod_20261018.csv`.

---

## 16. NOT FOUND / open questions

- NOT FOUND: any official or documented Robinhood API for event contracts (searched: docs.robinhood.com sitemap and home HTML, Agentic Trading support page and MCP tool list, newsroom 2026-05-27 and 2026-07-01 posts, event-contract support articles).
- NOT FOUND: dollar notional for Robinhood event contracts; CDNA/OG.com fee schedule as applied through Robinhood; Robinhood's equity percentage in Rothera, Crypto.com or OG.com; the cryptotimes article behind the "minority stakes" hint (searched: Robinhood newsroom, The Block; search engine unavailable); Robinhood's Q2 earnings press release (investors.robinhood.com not fetched; the newsroom entry is a stub linking to it; the SEC site was not queried because it requires a contact address in the User-Agent: blocked: requires a contact address).
- NOT FOUND (search budget exhausted): 2026 state litigation and CFTC posture on sports event contracts; independent confirmation of Robinhood's share of Kalshi or Rothera volume.
- Open: whether per-event pages expose full ladders and history beyond the landing page; whether the same event is ever routed to two exchanges at once (the page shows one `exchange` per contract); the Electronic Trading and Order Routing Systems Disclosure Statement (not read).

---

## 17. Sources (all fetched 2026-10-19 unless noted)

Primary (Robinhood):
- https://robinhood.com/us/en/prediction-markets/ (landing page, `__NEXT_DATA__`, footer) - H
- https://robinhood.com/sitemap.xml, https://robinhood.com/us/en/sitemap-prediction-markets.xml, https://robinhood.com/us/en/sitemap-newsroom.xml, https://docs.robinhood.com/sitemap.xml, https://robinhood.com/robots.txt - H
- Newsroom: https://robinhood.com/newsroom/robinhood-cryptocom/ (2026-09-08); https://robinhood.com/newsroom/the-world-cup-is-now-trading-on-robinhood-and-rothera/ (2026-06-04); https://robinhood.com/newsroom/robinhood-prediction-markets-joint-venture/ (2025-11-25, updated 2026-01-20); https://robinhood.com/newsroom/robinhood-prediction-markets-hub/ (2025-03-17); https://robinhood.com/newsroom/robinhood-is-now-open-to-agents/ (2026-05-27); https://robinhood.com/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/ (2026-07-01); https://robinhood.com/newsroom/robinhood-reports-second-quarter-2026-results/ (2026-07-29, stub) - H
- Support: https://robinhood.com/us/en/support/articles/event-contracts-overview/, `.../trading-event-contracts/`, `.../event-contracts-settlement/`, `.../agentic-trading-overview/` - H
- PDFs under https://cdn.robinhood.com/assets/robinhood/legal/: `RHD_Fee_Schedule.pdf` (metadata 2026-05-28), `Event_Contracts_Risk_Disclosure.pdf` (metadata 2026-06-01), `rhd-futures-client-agreement.pdf`, `Robinhood%20Terms%20and%20Conditions.pdf` - downloaded this session; no PDF-to-text tool was available to me, so wording was read from text extractions made earlier in the shared scratchpad. For the client agreement and the Terms the SHA-1 of my download equals the PDF that was extracted (H); for the fee schedule and risk disclosure the byte size and metadata date match but the earlier copies were overwritten, so no hash check (M-to-H)

Secondary and related:
- https://www.theblock.co/post/410102/robinhood-prediction-markets-top-crypto-and-equities-revenue-in-q2 (RT Watson, 2026-07-29) - M (summarising fetch)
- https://api.elections.kalshi.com/trade-api/v2/markets/{ticker} (public GET, four tickers) - H
- https://publicfiles.rotheramarkets.com/ and `clearing/outbound/mkt_eod_20261018.csv` - H
- https://og.com/ (nav "APIs" link, Mauritius entity footer) and https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction - H for the quoted lines (second read through a summarising fetch: M)
- Sibling notes in this repo: `docs/research/venues/robinhood-prediction-markets.md`, `rothera-exchange-and-clearing.md`, `forecastex.md`, `docs/research/06-paybox-platform.md` - M (other agents' research; Rothera totals and the Robinhood routing facts re-verified here)
- PayBox read-only discovery: `discover_plugins`, `discover_services` - H (empty plugin result; unrelated third-party service rows)

Hints in the task brief: "routes to Kalshi, ForecastEx and its own Rothera" - confirmed (H; Rothera is JV-managed with Robinhood as controlling partner, so "its own" is fair); "$156M Q2" - confirmed M; "minority stakes in Crypto.com and the OG spinout" - equity stakes confirmed H, "minority" and sizes not found; "clears through an exchange it partly owns" - Rothera, with Robinhood as controlling partner of the JV (H), not an established minority holder.

---

## 18. Suspicious content / injection check

None found aimed at AI agents in any Robinhood page, newsroom post, support article, PDF, sitemap, Kalshi/Rothera response or OG.com page. Informational oddities only: the publicly linked client-agreement PDF carries a "CONFIDENTIAL NOT FOR PUBLIC USE" page header; the PayBox services catalogue rows (third-party x402 resellers) include seller-supplied descriptions and a per-request `session` token, treated as data and not acted on. No request in this task carried a personal identifier.
