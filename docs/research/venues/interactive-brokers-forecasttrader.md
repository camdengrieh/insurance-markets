# Interactive Brokers ForecastTrader / IBKR Prediction Markets - adapter spec

Researched 2026-10-19 (~01:00-02:00 UTC). READ-ONLY: public unauthenticated GETs and page fetches only. No IBKR account, no login, no API key, nothing signed, no POST/PUT/DELETE, no wallet. Two read-only PayBox discovery calls (`discover_plugins`, `discover_services`, query "interactive brokers"); no PayBox money or signing tool was called. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, stale (>6 months) or recalled without a source.
Third-party text (docs pages, press releases, review sites, PDFs, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/interactive-brokers-forecasttrader/` (8 files, each <= 6 KB).
Search caveat: the shared WebSearch budget ran out part-way through, so two planned look-ups (IBKR-specific prediction-market volume; confirmation that IBKR flow lands in Kalshi's own book) were not done. They are listed under open questions.

## 0. Verdict

**adapter_priority: skip** as a standalone adapter (revisit only if the project ever supports a user-held IBKR brokerage account as an execution route).

1. Live (H, section 1). Product is branded **IBKR Prediction Markets** (since 2026-05-14), with "ForecastTrader" still used in the UI, Campus and API docs.
2. **It is a broker front-end, not a venue.** It routes into three separate CFTC-regulated exchanges: ForecastEx (IBKR's own affiliate), Kalshi and CME Group. Kalshi and CME liquidity is those exchanges' own books, so it is not an independent leg (section 12). The only liquidity that is IBKR-specific is ForecastEx, and that is better specced as its own venue.
3. **Not reachable through PayBox** (section 6): fiat, KYC'd FCM account, session-based login, no chain, no wallet signature anywhere in the path.
4. **Read API exists but is authenticated** (IBKR username session or OAuth). Individuals cannot use OAuth 2.0. Only keyless data is (a) an undocumented 5-contract marketing JSON and (b) ForecastEx's public daily CSV files (section 4).
5. The signal worth having (ForecastEx prices and volumes on US midterms, CPI, Fed, BTC price, city temperatures) is available keylessly from ForecastEx, so an IBKR session adds nothing for a read-only aggregator.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Official product home | `https://www.interactivebrokers.com/predictionmarkets/en/home.php` (title "IBKR Prediction Markets", breadcrumb "IBKR ForecastTrader Home") fetched 2026-10-19: "Trade political, climate, and economic events - on CME Group, Kalshi, and ForecastEx" | H |
| App | `https://forecasttrader.interactivebrokers.com/eventtrader/#/markets` redirects to `https://www.interactivebrokers.com/predictionmarkets/app/` (the URL the API docs call "IB ForecastTrader") | H |
| Campus commentary | IBKR Prediction Markets feed has items dated 2026-10-16, 10-14, 10-13, 10-12, 10-09 (`https://www.interactivebrokers.com/campus/category/traders-insight/forecast-trader/` -> redirects to `ibkrcampus.com/campus/category/traders-insight/prediction-market/`) | H |
| Live prices | Public marketing endpoint returned live quotes 2026-10-19 01:20 UTC (fixture `ibkr_public_marketing_contracts.json`) | H |
| ForecastEx matched volume | files exist for every day through 2026-10-18 (fixtures) | H |
| Launch of unified product | Business Wire 2026-05-14 "Interactive Brokers Expands Prediction Markets, Unifying Access to Kalshi, CME Group, and ForecastEx". Read via a Yahoo Finance copy summarised by the fetch tool (the Business Wire URL returned 403 / transport error) | H/M |
| Earlier history | API docs examples use Aug/Sep 2024 ForecastEx data (FF Sep 17 '24); product line dates from 2024 | H (docs) / M (date) |

Press release facts (H/M, paid promotional text): "IBKR Prediction Markets"; users "search and trade contracts from all three exchanges" without separate accounts; order UI "shows liquidity across venues and sends orders to the venue with the best net price" including fees; "contracts from Kalshi and CME Group are being added on a rolling basis"; "additional notable exchanges" planned; "Product and market availability varies by IBKR affiliate and client country of residence."

## 2. Kind and operator

- **Kind**: broker front-end / aggregator for regulated event-contract exchanges (CFTC-registered). Operator: Interactive Brokers LLC, "a CFTC-registered Futures Commission Merchant and a clearing member and affiliate of ForecastEx LLC" (H, `commissions-events.php`). ForecastEx LLC is "a CFTC-registered Designated Contract Market and Derivatives Clearing Organization" (H, same page; ForecastEx FAQ).
- Account types: IBKR brokerage account (IBKR Pro for API use); event contracts sit alongside stocks, options, futures, crypto (H, home FAQ). Sign-up promo: "$10" on opening a prediction-market account (H, home page) - irrelevant to the adapter.

## 3. Market model

- **Binary YES/NO, fixed $1.00 payout** per contract, quoted $0.01 to $0.99 (H: IBKR home FAQ; `price_increment` "$0.01" in the rules endpoint reference). The Campus lesson says "$0.02 and $0.99" (H, conflicting; treat the live tick rule per contract as authoritative via `/forecast/contract/rules`).
- **Threshold ladders instead of categorical markets**: each market (e.g. "US Consumer Price Index Yearly") has many strikes ("Above 3.8%"), each strike has a YES contract and a NO contract. Some multi-outcome products exist (e.g. "Federal Race Outcomes", strike label "Senate-D, House-D") (H, fixture).
- **Tokenisation = IBKR contract IDs (conids)**: IBKR models event contracts as options (ForecastEx) and futures options (CME): **Call = YES, Put = NO**, one conid each, persistent for the life of the instrument. ForecastEx products hang off an artificial index conid per product code; CME products hang off the real CME index/future. TWS API: "Exchange may be set to FORECASTX, KALSHI, and CME", secType OPT (H, `docs/tws-api/contracts/event-contracts`).
- **Order book vs AMM**: each underlying exchange runs its own central limit order book; IBKR shows top-of-book (market data fields bid/ask/last and sizes). No AMM, no parimutuel (H, API guide).
- **ForecastEx specifics (H)**: buy-only. Positions are opened by buying YES or NO and reduced by buying the opposite contract, which IBKR nets automatically (execution reports side "B" then "N"). A match happens when a YES buy price and a NO buy price sum to $1.00: every row of the pairs file has `yes_price + no_price = 1.00` (fixture `forecastex_daily_pairs_20261018_head.csv`). Consequently IBKR's displayed YES bid is derived: in all 5 live marketing rows `bid_yes = 1 - ask_no` and `bid_no = 1 - ask_yes`, and `ask_yes + ask_no` = 1.02 to 1.05 (fixture). An aggregator should model ForecastEx as two ask-only books, and treat "bid" as a synthetic.
- **Sells on CME/Kalshi contracts**: the older API guide says CME contracts can be bought and sold; the newer Web API page says "Event Contracts do not permit Sell orders" without carve-out. Conflict, unresolved (open question).
- **Collateral**: ForecastEx is fully cash-collateralised; "ForecastEx currently accepts cash (USD) as collateral" (H, `forecastex.com/members`). No chain, no token.
- **Incentive coupon**: ForecastEx contracts earn interest on position value, "USD 3.38% APY ... paid monthly" (H, IBKR home page, 2026-10-19). Matters for carry when comparing long-dated legs.

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs | Web API: `https://www.interactivebrokers.com/docs/web-api/` (llms.txt index at `/docs/web-api/llms.txt`, append `.md` to pages); event-contract guide `https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/`; TWS API `https://www.interactivebrokers.com/docs/tws-api/contracts/event-contracts` | H |
| Base URLs | Production `https://api.ibkr.com/v1/api`; Client Portal Gateway `https://localhost:5000/v1/api` (software run by the account holder); sandbox `https://qa.interactivebrokers.com` | H |
| Unauthenticated | Every probed path on `api.ibkr.com` returns `401 {"error":"No valid lb criteria","statusCode":401}` (fixture `api_ibkr_com_unauthenticated_401.txt`) | H |
| Rate limits | 10 req/s per authenticated username; snapshot 10 req/s; history 10 req/s or 50 req/min; orders and trades 1 req/5 s; 429 on excess; "IP addresses may be put in a penalty box for 10 minutes" | H |
| Market-data limits | 100 market-data lines by default (scales with commissions/equity); snapshot max 100 conids and 50 fields; WS `smd` subscriptions terminate after 10 minutes and must be re-sent (Web API changelog) | H |
| Websocket | `wss://localhost:5000/v1/api/ws` (gateway, cookie `api=<session>`) or `wss://api.ibkr.com/v1/api/ws?oauth_token=<token>`; topic `smd+<conid>+{"fields":["31","84","85","86","88","7059"]}`, one instrument per subscription | H |

**Event-contract endpoints (all authenticated; shapes copied from docs, NOT verified live; fixture `ibkr_docs_excerpts_NOT_LIVE.txt`)**
- Discovery: `GET /forecast/category/tree` (newer reference) or `GET /trsrv/event/category-tree` (older guide); `GET /iserver/secdef/search?symbol=<product>`, `GET /iserver/secdef/strikes?conid=&exchange=FORECASTX&sectype=OPT&month=SEP24`, `GET /iserver/secdef/info?conid=&exchange=FORECASTX&sectype=OPT&month=&strike=` (one request per month and strike; returns the YES/Call and NO/Put conid pair). CME: `exchange=CME&sectype=FOP`, filter `tradingClass` prefixed "EC". Kalshi: only the TWS API page documents `exchange=KALSHI`; the Web API discovery workflow for Kalshi is NOT FOUND.
- Per contract: `GET /forecast/contract/details?conid=` (question, strike, expiration, `conid_yes`/`conid_no`, `underlying_conid`, `payout`), `GET /forecast/contract/rules?conid=` (`source_agency`, `data_and_resolution_link`, `market_rules_link`, `last_trade_time`, `release_time`, `payout_time`, `price_increment`), `GET /forecast/contract/schedules?conid=` (trading hours).
- Prices: `GET /iserver/marketdata/snapshot?conids=...&fields=31,84,85,86,88,7059` (last, bid, ask size, ask, bid size, last size; top of book only; the first call per conid is a pre-flight that may return no data - general IBKR behaviour, M); `GET /iserver/marketdata/history` (OHLC; "historical data ... only available for a given instrument while it is trading"). Full order-book depth for event contracts: NOT FOUND. Trades tape: only the account's own executions. Resolution outcomes: underlying data sets are retrievable through history on the underlier conid while live (H, guide); an "official settled outcome" endpoint is NOT FOUND.
- Auth to read at all: a logged-in IBKR username session even for market data (docs: market data needs "Authorized Web API session" and "Brokerage session"). Market-data subscription cost for event contracts: NOT FOUND.

**Keyless data that does exist (both useful for a signal feed, neither is a book)**
1. **Undocumented public marketing JSON** `GET https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing` (called by the public home page's own script; H). Returns `{"contracts":[...]}` with 5 rows ("highest open interest" per category): `conid_yes`, `conid_no`, `exchange`, `ask_yes`, `ask_no`, `bid_yes`, `bid_no`, `last_trade_time` (epoch seconds, **it is the last-trade (expiry) time, not a trade time**: values decode to 2026-10-20, 2026-12-10, 2027-01-04), `product_conid`, `product_exchange`, `product_name`, `strike_label`, `category_id`, `category_name`. One row has `exchange: FORECASTX` but `product_exchange: KALSHI` (CPI Yearly, Above 3.8%); meaning unknown (open question). Cache-control no-store; no documented terms or limits. Fixture: `ibkr_public_marketing_contracts.json`. Treat as fragile.
2. **ForecastEx public files** (ForecastEx, not IBKR): `https://forecastex.com/api/download?type=summary|pairs|prices&date=YYYYMMDD`, bucket `forecastex-public-data` (H, `forecastex.com/data`). `pairs` = every matched pair in the 24 h window ending ~16:15 US/Central of the file date (`pair_id,event_contract,expiration_date,quantity,yes_price,no_price,pair_time`; refreshed every 10 minutes per the page); `summary` = `product_id,product_name,product_category,total_pairs`. Fixtures: `forecastex_daily_summary_20261018.csv`, `forecastex_daily_pairs_20261018_head.csv`. This is trade history, not a live book.

## 5. Trade path

- Programmatic placement exists for the account holder: Web API order endpoints (generic IBKR `/iserver/account/{accountId}/orders`, M), TWS API, and FIX exists as an IBKR API (event-contract support over FIX not checked); the event-contract guide says "Submission of orders for Event Contracts via the Web API functions like orders for any other instrument"). Time-in-force Day / IOC / GTC in the UI (H, Campus lesson). ScaleTrader algo is available (H, home page). Order-placement endpoint details were not re-read; they are generic IBKR (M).
- **Auth/signing**: no signatures over orders. Access is a session: (a) **Client Portal Gateway** for individuals: IBKR username + password + 2FA entered in a browser on the same machine as the gateway, all calls from that machine, one brokerage session per username across all IBKR platforms, up to 24 h, drops after ~5-6 min idle unless `/tickle` is called; (b) **OAuth 1.0a** (organisations; third-party vendors need Compliance approval, and the doc estimates 2-3 weeks screening, 3-6 weeks Compliance review and 3-5 weeks legal/configuration, i.e. months); (c) **OAuth 2.0** `private_key_jwt` for "licensed Organizations, Financial Advisors, and IBrokers"; "OAuth 2.0 is not available to Individual account structures" (H, quotes from `docs/web-api/authentication/oauth-2/register`). An RSA key >= 3072 bits is registered with IBKR.
- Account prerequisite: "fully open and funded" live account of type "IBKR Pro" for API use (H, Web API Getting Started).
- Routing: IBKR's own smart UI picks the venue with the best net price including fees; via API the caller addresses a specific conid on `FORECASTX`, `KALSHI` or `CME` (H for CME/ForecastEx, TWS doc for Kalshi).

## 6. PayBox reachability

**paybox_reachable: no.** Reasons (H unless noted): off-chain; the counterparty is a regulated FCM that custody-holds USD; identity is an IBKR username with KYC; trade auth is a browser-established session or an IBKR-registered OAuth client, not a wallet signature; ForecastEx collateral is USD cash. A PayBox EVM/Solana wallet cannot submit transaction proposals or signed orders to it. `discover_plugins` and `discover_services` for "interactive brokers" / "ibkr" returned no plugin and no x402 service (2026-10-19). Funding an IBKR account from a wallet (stablecoin deposit) may exist but I did not verify it (NOT FOUND; one recollection that IBKR added USDC funding in 2025 is L and unsourced); even if present it is a transfer to an exchange-style deposit address, not a trading path.

## 7. Fees

IBKR US schedule (H, `https://www.interactivebrokers.com/en/pricing/commissions-events.php`, fetched 2026-10-19; fixture `ibkr_commissions_events_excerpt_20261019.txt`):

| Product | IBKR commission | Third-party exchange fee |
|---|---|---|
| ForecastEx Forecast Contracts | USD 0.00 / contract | USD 0.01 / contract |
| Kalshi Event Contracts | USD 0.01 / contract | USD 0.01 / contract |
| CME Event Contracts | USD 0.01 / contract | USD 0.01 / contract |

- Flat per-contract, paid by the buyer on each fill; no percent-of-notional formula is published on that page. ForecastEx's own FAQ: "$0.01 per contract, charged to each side at execution" (H). Settlement/exercise fee: NOT FOUND (searched IBKR commissions page, ForecastEx FAQ). Rates are for US direct clients; "may change ... at any time"; introduced or advised accounts may pay more (H). Other affiliates (CA/IE/HK/SG) have their own pages (links present on the home page; not read).
- Third-party review sites disagree on CME (one reports $0.10 commission + $0.15 exchange fee) and say the order preview is controlling (L/M, search snippets only; the IBKR page above is the primary source and says $0.01 + $0.01). Whether Kalshi's own fee formula is replaced by the flat $0.01 for IBKR flow is not stated (open question).
- Spread cost dominates: in the 5 live marketing rows the YES spread was 4 to 5 cents (0.71/0.75, 0.64/0.66, 0.89/0.91, 0.67/0.72, 0.79/0.83) (H, fixture, one snapshot).

## 8. Resolution and dispute risk

- IBKR does not resolve markets. Each exchange does, under its own rulebook. For ForecastEx the rules endpoint exposes the named `source_agency`, `data_and_resolution_link`, `market_rules_link` (a per-product Terms and Conditions PDF on `data.forecastex.com`), `release_time` and `payout_time` (H, reference example: EIA for US CO2 emissions). Settlement is $1.00 or $0, "paid out" at `payout_time` into the IBKR account.
- ForecastEx per-product T&C PDFs were downloaded (CPIY, USCE) but text could not be extracted with the tools available, so their dispute, revision and source-failure clauses are NOT READ. Same for the ForecastEx Rulebook, Kalshi's and CME's rulebooks (Kalshi is covered in a separate spec).
- Risk specific to this stack: an aggregator comparing ForecastEx to Kalshi or Polymarket on "the same" event (daily city high temperature, CPI, Fed decision, BTC highest price) must compare the exact source, station, rounding, timestamp and revision rule per contract, not the title. ForecastEx is an IBKR affiliate that "has affiliated companies that also participate in its markets" and says it has conflict rules (H, FAQ); counterparty and exchange risk sits with ForecastEx/clearing.

## 9. Geo, ToS and automation

- Eligibility: "available to eligible Interactive Brokers clients"; "Availability ... may vary based on the IBKR affiliate and the client's country of residence"; **US election contracts "are only available to eligible US residents"** (H, home FAQ). The home page links regional prediction-market pages for .ca, .ie, .hk and .sg (H, links only; contents not read). Canada-specific launch claim from a search snippet (L).
- Hours: "available around the clock, seven days a week ... may have periodic maintenance windows" (H); Web API `/iserver` is unavailable briefly each night around 01:00 local time per region, and the Web API has maintenance on Saturday evenings (H).
- Automation: allowed for your own account with a funded IBKR Pro account ("Clients with fully open and funded accounts may use our Web API ... immediately, without any onboarding", H). Anything that serves other people's accounts is a third-party vendor needing approval, and "we expect third-party vendors offering automated trading solutions to hold applicable registration with financial authorities" (H, Web API Getting Started). One brokerage session per username across all IBKR platforms; running TWS/mobile logs the API session out (H). Market data is per username ("any username subscribed will be assessed a separate market data subscription fee", H). These make a hosted multi-user aggregator impractical on IBKR; a single-user local tool is fine. No IBKR-specific rule on arbitrage or on scraping the public marketing JSON was found (NOT FOUND; searched docs and home page).

## 10. Liquidity

| Item | Value | Source / date | Tag |
|---|---|---|---|
| ForecastEx matched pairs, 24 h to 2026-10-18 16:15 CT | 342,558 pairs (1 pair = USD 1.00 collateral, so about USD 0.34M notional) | `forecastex.com/api/download?type=summary&date=20261018`; sum equals the sum of `quantity` in the pairs file | H |
| ForecastEx range 2026-10-10 to 10-18 | 342,558 to 659,225 pairs/day, mean about 470K (about USD 0.47M/day) | same endpoint, 9 daily files (fixture `forecastex_daily_pairs_by_category_20261010_20261018.csv`) | H |
| Mix on 2026-10-18 | Environmental 300,789 (88%: LA daily high 122,957; Houston 25,576; Seattle 24,022; SF 18,183), Elections 30,349 (House control 27,826), Financial 7,686 (Bitcoin highest price 4,423), Economic 3,734 (CPI yearly 2,010; Fed decision 965) | same | H |
| Election spikes | 106,307 pairs on 2026-10-14 and 94,929 on 10-16 | same | H |
| Kalshi / CME volume through IBKR | NOT FOUND (IBKR publishes no per-venue or per-product volume; searched IBKR home, Campus, commissions page, API docs) | - | - |
| Open interest | IBKR shows "Highest Open Interest" lists but values need a login; ForecastEx OI NOT FOUND in the public files read | - | - |

A back-of-envelope reading: ForecastEx is a thin venue (well under USD 1M/day) dominated by city-temperature markets; the political and macro products that overlap other venues trade a few thousand to tens of thousands of pairs a day.

## 11. Event-category overlap (where arbitrage could exist)

- **Politics**: ForecastEx House control (HORC), Senate races by state (AXX*), House district races (e.g. G02NE, G11OH); marketing JSON shows "US Senate Majority Democratic" 0.64/0.66 and "US House Control Democratic" 0.89/0.91 with last trade 2027-01-04 (H). Same questions exist on Polymarket and Kalshi (their specs cover them). Resolution dates and certification rules likely differ.
- **Macro**: US CPI yearly/core (CPIY, CPIC), Fed decision (FFDEC), unemployment (UNR), plus Canada CPI/GDP and BoJ (H, summary file). Overlap with Kalshi and Polymarket macro.
- **Crypto price**: Bitcoin and XRP highest/lowest price (YXHBT, YXLBT, YXHXR, YXLXR), also CME Ether event contract example in the TWS docs. "Highest/lowest price in a period" is a barrier-type contract; map carefully to Polymarket's "above X at time T" style.
- **Commodities / equities**: gold, silver, copper, S&P 500 futures price (H, summary); CME event contracts on indices and FX (H, docs).
- **Weather**: daily and hourly city temperature highs (LA, Houston, Seattle, SF, Miami, Austin, Las Vegas, Chicago, Philadelphia) overlap Kalshi's KXHIGH* series (the TWS doc's own Kalshi example is KXHIGHLAX) and Polymarket weather markets; this is the highest-volume ForecastEx category (H) and the most mechanical to link, subject to station and rounding rules.
- **Sports**: none. IBKR's category list is Government, Economic Indicators, Elections, Technology, Financial Markets, Environmental and CME Event Contracts (H, Campus lesson). Kalshi sports contracts via IBKR: NOT FOUND (press release says initial focus is elections, climate and economic indicators).
- **Intra-IBKR**: IBKR "groups similar contracts from connected exchanges into one searchable view" (M, press release), so the same event can appear on ForecastEx, Kalshi and CME inside one account; IBKR's own router already takes the best net price, so little intra-IBKR edge is left for an outsider.

## 12. Shared liquidity (independence)

- **Kalshi contracts on IBKR**: IBKR is an access channel to Kalshi's exchange (TWS API `exchange=KALSHI`; IBKR fee page labels the Kalshi charge "Third Party Fees - Exchange Fee"; press release says orders are routed to the venue with the best net price). I infer the same Kalshi order book as Kalshi direct, so **not independent from Kalshi** (M; the inference is strong but I did not find an explicit "same book" statement).
- **CME contracts on IBKR**: routed to CME's central book (H that IBKR lists them on the CME venues; M for the inference). **Not independent from CME.**
- **ForecastEx**: IBKR's own affiliate exchange; its book is shared by all ForecastEx members (FCMs), so IBKR is one of several access routes, not the venue itself (H, `forecastex.com/members`: firms may apply as FCM Members; the broker list on `/members/fcms` is rendered client-side and was not retrievable). ForecastEx **is** independent from Polymarket/Kalshi/others and is the only genuinely separate liquidity in this stack.
- Consequence: as an arbitrage leg, "IBKR ForecastTrader" must be modelled as three venues behind one broker. Only the ForecastEx leg adds independent price information.

## 13. Adapter recommendation

- Do not build an IBKR trading adapter: PayBox cannot reach it, the API needs an interactive login (gateway) or an IBKR-approved OAuth client (not available to individuals for OAuth 2.0), Kalshi/CME liquidity duplicates direct venues.
- For the aggregator signal layer, use ForecastEx directly: poll `forecastex.com/api/download?type=pairs|summary` (keyless, 10-minute refresh claimed) for last-trade prices and volume, and the IBKR marketing JSON only as a convenience cross-check (5 rows, undocumented). Price from the pairs file is a last matched `yes_price`, not a bid/ask.
- If a future milestone supports a user's own IBKR account: use the Client Portal Gateway on the user's machine, discovery via `/forecast/*` and `/iserver/secdef/*`, prices via `/iserver/marketdata/snapshot` (<= 100 conids, <= 10 req/s) or the `smd` websocket (re-subscribe every 10 minutes), keep the session alive with `/tickle`, persist conids locally (docs recommend this).

## 14. Open questions

1. Can YES/NO contracts on Kalshi and CME be sold directly via IBKR, or only closed by buying the opposite side? (docs conflict)
2. Does IBKR's flat USD 0.01 Kalshi "exchange fee" replace Kalshi's own fee formula for IBKR flow?
3. IBKR-specific volume and open interest per venue (not published; not found).
4. Why does the marketing JSON show `exchange: FORECASTX` with `product_exchange: KALSHI` for CPI Yearly? (cross-listed product grouping vs data quirk)
5. Does the Web API expose Kalshi discovery the same way as FORECASTX (docs show only FORECASTX and CME workflows)?
6. Market-data subscription cost/need for event contracts through the API.
7. ForecastEx dispute/revision clauses (T&C PDFs and Rulebook not read).
8. Whether IBKR accepts stablecoin funding (unverified), relevant only for a funding story.

## 15. NOT FOUND (searched)

- Dedicated product page under the old guess `.../en/trading/forecasttrader.php` (404); the live product page is `/predictionmarkets/en/home.php`.
- Public unauthenticated book/depth endpoint for IBKR event contracts (searched Web API reference, llms.txt, home page script, `api.ibkr.com` probes).
- Kalshi discovery workflow in the Web API docs (llms.txt has zero "kalshi" matches; only the TWS API page names it).
- Settlement/exercise fee, per-venue volume, open interest, market-data fees (IBKR pages above).
- Explicit IBKR terms on arbitrage or on scraping the marketing JSON.
- ForecastEx FCM member list (JS-rendered page).

## 16. Suspicious / injection-like content

None aimed at changing behaviour. Notices seen and treated as data only: IBKR docs pages carry "For AI agents: a documentation index is available at the root level at /llms.txt" and an "Open in Claude" button; I fetched `llms.txt` purely as a navigation index of the official docs and executed nothing from it. Third-party affiliate review sites appeared in search results; used only as leads, tagged M/L.

## 17. Sources

- IBKR Prediction Markets home: https://www.interactivebrokers.com/predictionmarkets/en/home.php (H, 2026-10-19)
- App: https://forecasttrader.interactivebrokers.com/eventtrader/#/markets -> https://www.interactivebrokers.com/predictionmarkets/app/ (H)
- Public marketing JSON (undocumented): https://www.interactivebrokers.com/tws.proxy/public/forecasttrader/prediction/contract/marketing (H)
- Commissions: https://www.interactivebrokers.com/en/pricing/commissions-events.php (H)
- Event contracts in the Web API (guide): https://www.interactivebrokers.com/campus/ibkr-api-page/event-contracts/ (H)
- Web API discovery page: https://www.interactivebrokers.com/docs/web-api/trading/instrument-discovery/finding-event-contracts.md (H)
- Web API reference, event contracts: https://www.interactivebrokers.com/docs/web-api/api-reference/trading/trading-event-contracts/get-forecast-categories.md and `get-forecast-contract.md`, `get-forecast-rules.md`, `get-forecast-schedule.md` (H)
- Web API pacing: https://www.interactivebrokers.com/docs/web-api/trading/usage-and-availability/pacing-limitations.md ; auth FAQ: https://www.interactivebrokers.com/docs/web-api/authentication/faq.md ; trading sessions: .../authentication/trading.md ; CP Gateway limits: .../authentication/cpgw/limitations-of-the-client-portal-gateway.md ; OAuth 2.0: .../authentication/oauth-2/introduction.md and `register.md` ; websocket guides: .../v1/ws/connection-guide/ (H)
- Web API getting started / third parties: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/ (H)
- Web API changelog: https://www.interactivebrokers.com/docs/web-api/changelog.md (H)
- TWS API event contracts: https://www.interactivebrokers.com/docs/tws-api/contracts/event-contracts (H)
- Campus lesson: https://www.interactivebrokers.com/campus/trading-lessons/prediction-markets-at-interactive-brokers/ (H)
- Campus feed: https://ibkrcampus.com/campus/category/traders-insight/prediction-market/ (H)
- Press release (Business Wire, 2026-05-14, read via Yahoo Finance copy): https://finance.yahoo.com/markets/options/articles/interactive-brokers-expands-prediction-markets-140800029.html (M/H)
- ForecastEx: https://forecastex.com/ , /faq , /data , /members , /regulatory ; data: https://forecastex.com/api/download?type=summary&date=20261018 and `type=pairs` (H)
- Third-party leads, not relied on: search-engine snippets of brokerchooser.com, camusocpa.com, californiapredictionmarkets.com, predictionmarketsworld.com (L/M)
- PayBox `discover_plugins` / `discover_services` queries "interactive brokers", "interactive brokers ibkr": empty (H, 2026-10-19)
