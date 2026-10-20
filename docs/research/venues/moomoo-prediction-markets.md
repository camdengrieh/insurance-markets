# Moomoo Prediction Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to moomoo.com, openapi.moomoo.com (documentation), static.moomoo.com (public PDF), `gh api` raw reads of the public `MoomooOpen/moomoo-agent-hub` repo, two public GETs to Kalshi's market endpoints (ticker identity check), and two read-only PayBox catalogue searches (`discover_plugins`, `discover_services`). No account, login, key, wallet, signature, POST/PUT/DELETE, payment or browser automation. No money-moving PayBox tool was called. All third-party text was treated as untrusted data. The shared WebSearch budget was exhausted before I started, so every claim below comes from direct fetches of known URLs and links found on Moomoo's own pages (plus two WebFetch page summaries, tagged M).

Tags: **H** = read first-hand in a primary source this session (URL cited). **M** = secondary source, small-model page summary, or my inference from first-hand data. **L** = weak or stale.

Duplicate note: this venue was already written up under another slug as `docs/research/venues/moomoo-event-contracts.md` (an earlier, parallel pass; same conclusion). I did not copy it. I re-fetched and re-checked its main claims first-hand, and this file adds: the CFTC-mandated FCM disclosure booklet (clearing through Futu Clearing Inc.), the OpenD 10.10 login change, the local WebSocket option, the SI listing, and a PayBox catalogue check. Treat the two files as one venue, not two.

---

## 0. Verdict

**adapter_priority = skip** (as a data or independent-liquidity adapter). Confidence: high on the classification; medium on "price-identical to Kalshi" (no live Moomoo book could be read, see section 9).

1. **Live, launched 2026-06-04** (H, section 1).
2. **Broker/frontend, not an exchange.** Moomoo Financial Inc. is a CFTC-registered FCM; orders go via its affiliate Futu Clearing Inc. to "one or more exchanges" (DCMs); Moomoo's own FAQ says the exchange is Kalshi (H). Contract ids are `EC.` + Kalshi ticker (verified on two tickers, H). It is a second route to Kalshi's book, **not an independent leg**.
3. **No public read API.** The only machine interface is the Moomoo OpenAPI via a local OpenD gateway logged in with a moomoo ID and password (H). Nothing to GET unauthenticated, so no live Moomoo sample exists; saved shapes are official doc examples.
4. **Not reachable from a PayBox wallet.** USD in a KYC'd US brokerage account; no chain, token or signed order (H on architecture; PayBox catalogue has no Moomoo plugin).
5. **Worth keeping:** the `EC.<kalshi_ticker>` mapping (lets the Kalshi adapter price or reconcile a Moomoo position) and the fact that Moomoo is one of several retail on-ramps into Kalshi flow (M).

---

## 1. Still live? (2026)

| Signal | Date | Tag |
|---|---|---|
| Product page "Event Contracts" (under Products > Prediction Markets) returns HTTP 200: "$0 Commissions", categories, FAQ naming Kalshi. https://www.moomoo.com/us/invest/nfl-prediction-markets | fetched 2026-10-19 | H |
| Newsroom "Moomoo Partners with Kalshi to Expand Prediction Markets" (page embeds cover-image path dated 2026-06-04; copyright 2026). https://www.moomoo.com/us/newsroom/prediction-markets | 2026-06-04 | H (text read), M (date from image path) |
| CoinDesk report: Moomoo announced the Kalshi partnership on Thursday 2026-06-04 (WebFetch summary). https://www.coindesk.com/business/2026/06/04/moomoo-expands-into-prediction-markets-through-kalshi-partnership | 2026-06-04 | M |
| OpenAPI changelog: OpenD 10.9.6908 "Introducing Prediction Markets API for Moomoo US ... quote API ... Trade API ... Combo (parlay) order". https://openapi.moomoo.com/moomoo-api-doc/en/changelog/changelog.html | 2026-07-15 | H |
| Download page: 10.9.6908 "Supports Moomoo US Prediction APIs (Market data and trading for event contracts)"; latest OpenD 10.11.7108 dated Sep 17, 2026. https://www.moomoo.com/download/OpenAPI | 2026-09-17 | H |
| FCM disclosure booklet "Last updated: October 12, 2026" contains an "EVENT CONTRACTS RISK DISCLOSURES" section. https://static.moomoo.com/upload/mfi/FCM%20and%20Risk%20Disclosure%20Booklet_MFI_10122026-d74963cce4e27a6da608b303c4d6ef4b.pdf | 2026-10-12 | H |
| SI "prediction markets apps" list includes Moomoo (item 13), states "All states (availability may be restricted)" (WebFetch summary). https://www.si.com/prediction-markets/usa/apps | 2026 | M |

NOT FOUND: any pause or withdrawal notice (searched: product page, newsroom, support Terms and Agreements category, changelog). I could not place or preview an order, so "can trade today" rests on the signals above.

## 2. Kind and market model

- **Kind: broker/frontend (FCM) in front of a CFTC-regulated exchange.** Product page: "Event contracts are offered by Moomoo Financial Inc., an FCM registered with the CFTC"; FAQ: "Moomoo partners with Kalshi, a CFTC-regulated exchange"; the app provider Moomoo Technologies Inc. "is not a broker-dealer" (H). The newsroom footer calls the FCM NFA-registered (H).
- **Model: binary YES/NO central limit order book** (H: FAQ "binary - it either settles at $1.00 ... or $0.00"; price $0.01 to $0.99, two decimals per `place_order` doc). The FCM booklet adds that YES and NO are "two separate event contracts each with a unique contract ID" and that they are cleared swaps (H). A `SCALAR` enum value exists in the API but I found no scalar contract (NOT FOUND).
- **Order book shape:** four ladders `yes_bids`, `yes_asks`, `no_bids`, `no_asks`; in the doc example `yes_asks` mirror `no_bids` (0.51 vs 0.49, same 2633.6 size), i.e. one complementary book (H doc example; M that this equals Kalshi's structure).
- **Hierarchy (H, API docs):** category > tag > Series (`EC.<SERIES>.SERIES`) > Event (`EC.<EVENT>.EVENT`) > Contract (`EC.<KALSHI_TICKER>`), market id `QotMarket_EventContract = 101`.
- **Combos (parlays):** RFQ flow `get_valid_combo_list` -> `request_combo_quotes` -> `place_combo_order`; the combo collection id is `KALSHI.KXMVECROSSCATEGORY-R` (H, printed in Moomoo's docs and skill repo).
- **Tokenisation:** none. Positions are brokerage records (position list has a `payout_if_win` field, H).

## 3. Chains and collateral

- **No chain.** Collateral is US dollars in the Moomoo Financial Inc. account. "Fully collateralized" (newsroom, H). The booklet: bids are rejected unless funds fully collateralize them, no margin, no mark-to-market (H).
- Newsroom mentions a separate "Direct Crypto Deposit and Withdraw" feature (external Web3 wallet to moomoo account) from the crypto entity (H that it is mentioned). NOT FOUND (searched: newsroom, product page, FCM booklet): any statement that crypto balances fund event-contract buying power.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Existence | Official, authenticated, local-gateway only. **No public unauthenticated market data.** | H |
| Docs | https://openapi.moomoo.com/moomoo-api-doc/en/intro/intro.html ; pages under `/quote/`: `get-event-contract-category`, `-series-list`, `-event-list`, `get-event-contract`, `-snapshot`, `-order-book`, `-ticker`, `-kline`, `request-history-event-contract-kline`, `subscribe-event-contract`, `get-valid-combo-list`, `request-combo-quotes`; `/qa/trade.html` Q18 | H (all HTTP 200) |
| Architecture | OpenD gateway on your own machine, exposes TCP (docs use `127.0.0.1:11111`); SDKs Python/Java/C#/C++/JavaScript or raw protobuf. OpenD can optionally open a local WebSocket listener (`websocket_ip`/`websocket_port`, off by default). It is not a Moomoo-hosted feed. | H (intro, opend-cmd) |
| Login | moomoo ID + login password to log in to OpenD. Changelog 10.10.7008 (2026-08-13): "Removed account and password settings from the Command Line OpenD configuration file". So unattended headless login via config file is gone; how a server login is meant to work is NOT FOUND. | H |
| Version gate | OpenD >= 10.9.6908 (2026-07-15) | H |
| Account gate | Event contracts: Paper X, FUTU HK X, **Moomoo US check**, SG/AU/MY/CA/JP X (capability table, parsed from raw HTML). Quote right: "Aligned with the moomoo" app (wording truncated, M on meaning) | H / M |
| Markets / metadata | `get_event_contract_category`, `get_event_contract_series_list(category, tag)`, `get_event_contract_event_list(series_code, status, next_page, count)`, `get_event_contract(event_code)` returning `contract_code, event_code, series_code, contract_type, title, yes_sub_title, open_time, close_time, determination_time, settled_time, latest_expiration_time, status, result, settlement_value, expiration_value, volume, can_close_early, tick_size, category, tag` | H |
| Prices / books | `get_event_contract_snapshot(code_list)`: `price, cumulative_volume, yes_bid/ask(+size), no_bid/ask(+size), last_trade_time, volume_24h, open_interest`. `get_event_contract_order_book(code)` returns the four ladders (needs ORDER_BOOK subscription) | H |
| Trades | `get_event_contract_ticker(code)` fields `time, yes_price, no_price, volume, side, sequence` (needs TICKER subscription) | H |
| History | `get_event_contract_kline` (K_1M, K_5M, K_60M, K_DAY per the skill repo reference, M) and `request_history_event_contract_kline` | H / M |
| Resolution | `ECStatus` enum: INITIALIZED, INACTIVE, ACTIVE, CLOSED, HALTED, SETTLED, CANCELED, DETERMINATION_PENDING, DETERMINED, FINALIZED, plus event-level EVENT_ABNORMAL/ACTIVE/CLOSED/SETTLED/CANCELED/FINALIZED; `result` and `settlement_value` on the contract | H |
| Push | `subscribe_event_contract` + handlers over the OpenD link (order book, ticker, K-line) | H |
| Rate limits | 10 req / 30 s each for category, series list, event list, get-event-contract, snapshot; 15 / 30 s for combo list and combo RFQ; 60 / 30 s for historical K-line. Order book, ticker, subscribe pages: no limit box found (NOT FOUND, not necessarily unlimited). Orders: `place_order` and `place_combo_order` share 15 / 30 s per account id, >= 0.02 s apart | H (each doc page) |
| Quotas | Subscription and historical K-line quota by account size (100 below 10,000 HKD total assets, 300 at 10,000+, higher tiers above 500,000 HKD / 5M HKD) | H (https://openapi.moomoo.com/moomoo-api-doc/en/intro/authority.html); whether event-contract subscriptions count toward it: M |

Consequence: a snapshot scan is capped at 10 requests per 30 s, and needs a human-logged-in OpenD. Kalshi's own API is the cheaper, public source for the same tickers.

## 5. Trade path

- **Programmatic: yes, but only via a local OpenD session of a Moomoo US account** (H, Q18: https://openapi.moomoo.com/moomoo-api-doc/en/qa/trade.html).
  - Single contract: `place_order(price, qty=0, code='EC....', trd_side, amount=<notional>, pred_side=PredSide.YES|NO, trd_env=TrdEnv.REAL)` on `OpenFutureTradeContext`. Limit price 0.01 to 0.99.
  - Combo: `place_combo_order` with a `quote_id` from `request_combo_quotes` (quotes expire).
  - Q18 notes: live only ("paper trading does not support prediction markets"); account needs the **PREDICTION** trading permission; `unlock_trade(password)` is required for live orders (GUI OpenD users unlock by hand). Changelog adds cancellation and position management.
- **Auth/signing:** no API key, no wallet signature, no HMAC/EIP-712. moomoo ID + password at OpenD login, trading password to unlock (H).
- NOT FOUND (searched: place-order doc, Q18, product page): minimum order size, position limits, order types beyond limit, trading hours.

## 6. PayBox reachability

**paybox_reachable = no.** Nothing for a wallet to sign: orders ride brokerage credentials over OpenD, collateral is fiat in a KYC'd US account, no contract/token/chain/x402 surface (H on architecture). PayBox catalogue check (read-only, 2026-10-19): `discover_plugins("moomoo")` returned no plugins; `discover_services("moomoo prediction market")` returned only unrelated third-party x402 odds feeds (Polymarket/Hyperliquid data), treated as untrusted listings and not used. No PayBox tool that moves money was called.

## 7. Fees

- **Advertised: "$0 Commissions"**, "Restrictions and other fees apply"; footnote: "$0 commission trading is available only to U.S. residents trading in the U.S. markets through Moomoo Financial Inc. Other fees may apply" (H, product page).
- OpenAPI fee page: "There is no extra fee for tradings through Moomoo API. The transaction fee is the same as that of APP" (H); its table text does not mention event contracts.
- **Event-contract-specific fee schedule: NOT FOUND** (searched: product page, newsroom, pricing page, OpenAPI fee page, FCM booklet, support Terms and Agreements category). The pricing page only links to the Event Contracts product page.
- Whether Moomoo passes Kalshi's exchange fee through or absorbs it: unknown. For scale only, the sibling Robinhood note records a pass-through of $0.01 per contract per side on Kalshi products (H there, not here); do not assume it applies (L).
- Customer Agreement (June 22, 2026, 17-page PDF listed in the support category) was downloaded but I did not extract its text; event-contract clauses in it are NOT READ.

## 8. Resolution and dispute risk

- Settlement follows the exchange's contract rules (Kalshi); Moomoo does not resolve (M, from FAQ wording: "All winning contracts settle at $1.00"; no dispute process stated, NOT FOUND).
- FCM booklet risk list (H): **Source Agency Risk** (third-party data may be wrong or late), **Trading Halt Risk** (exchange or CFTC can halt, blocking exit), **Liquidation Risk** (thin opposing depth), and a state-litigation warning for **sports-related** event contracts: positions "may become untradeable, and you may not be able to close out of your position ... any open position becoming worthless". Insolvency is under the commodity-broker provisions (Part 190), not SIPC (H).
- Dispute risk = Kalshi's, plus an intermediary layer (state availability, FCM halts, broker ops). The booklet also says contracts "can only be exited before resolution by acquiring an offsetting position" while the product FAQ says you can sell at the prevailing price; the two describe the same thing differently, I did not test it (M).

## 9. Shared liquidity (why it is not an independent leg)

1. Booklet: MFI "clears all of its customers' ... event contracts, through its affiliate Futu Clearing Inc. Futu Clearing does not execute the transactions but routes all orders to one or more exchanges", each a CFTC DCM; "the clearinghouse is the original contractual counterparty" (H). The booklet never names Kalshi; the product FAQ does (H).
2. Contract id rule `EC.<Kalshi ticker>`, checked live on 2026-10-19 against Kalshi's public API:
   - `EC.KXNFLAFCCHAMP-27-CIN` (example in Moomoo's skill repo) = Kalshi `/markets/KXNFLAFCCHAMP-27-CIN`: active, binary, "Will Cincinnati win the Pro Football AFC Championship?", volume_fp 831,009.07, open_interest_fp 582,544.82 (H, fixture).
   - `EC.KXODIMATCH-26JUL140600INDENG-IND` (example on Moomoo's snapshot page, name "England vs India Winner?") = Kalshi `/historical/markets/KXODIMATCH-26JUL140600INDENG-IND`: finalized, result `yes`, title identical, 4,064,426.13 contracts traded (H, fixture).
3. Combo collection `KALSHI.KXMVECROSSCATEGORY-R` (H).
4. Kalshi counsel in Moomoo's own press release: aim "to become the global liquidity layer for prediction markets" (H, newsroom).
5. **Not done:** a same-second comparison of a live Moomoo book with Kalshi's (needs a logged-in OpenD). Recipe for someone with an account: `get_event_contract_order_book('EC.<ticker>')` vs Kalshi `GET /trade-api/v2/markets/<ticker>/orderbook`. Possible differences a scanner would care about: feed delay or throttling ("Aligned with the moomoo app"), a subset catalogue, state restrictions, Moomoo-side order limits. All NOT FOUND.

`liquidity_shared_with = Kalshi`.

## 10. Liquidity and category overlap

- **Moomoo-specific volume, open interest or event-contract user counts: NOT FOUND** (searched: product page, newsroom, CoinDesk and SI summaries, FCM booklet). The only user figure on the product page is corporate boilerplate ("registered users of Futu Holdings' app ... as of September 30, 2024"), not event-contract activity.
- The product page shows a "24H Volume" ranking (15-minute BTC/ETH/SOL/XRP/gold/DOGE contracts, an NFL game, 2027 pro football champion), but its own disclaimer says app images are "not current ... illustrative purposes only"; treat as L, and the numbers are presumably Kalshi-wide contract volumes, not Moomoo's slice (M).
- **Depth that exists is Kalshi's:** KXNFLAFCCHAMP-27-CIN had 582,544.82 contracts open interest on 2026-10-19 (H, fixture).
- **Category overlap = Kalshi's.** Product page categories: Trending, Sports, Crypto, Elections, Economics, Politics, Companies, Commodities, Financials, Climate, Entertainment, Tech & Science, Mentions (H). Newsroom examples: Fed decisions, inflation data, elections, 2026 World Cup (H). These overlap Polymarket, Limitless, Predict.fun and other mirrors; use the Kalshi adapter for that leg, Moomoo adds zero legs. Whether Moomoo lists the full Kalshi catalogue is NOT FOUND (the category endpoint would answer it but needs a login).

## 11. Geo, ToS, automation

- **US residents only**, "eligible users", "Not all contracts are available in all U.S. states" (H, product page); SI lists "All states (availability may be restricted)" (M). The booklet warns of state-litigation risk on sports contracts (H). Other Moomoo entities have no live event-contract trading (H, capability table).
- **Automation:** Moomoo supports API use and publishes "Moomoo API Skills" for AI assistants (repo `MoomooOpen/moomoo-agent-hub`, last push 2026-08-27, H via `gh api`). Its agent legal note (H): the company "reserves the right to interpret and decide whether to allow access to AI Agent"; the user is "solely responsible" for agent-generated orders; "It is strictly forbidden to allow the AI Agent to automatically fill in your transaction password"; the API is "not suitable for ... very high-frequency trading". Trading-hours rules for event contracts: NOT FOUND.
- **Implication:** an unattended autonomous trader is incompatible with these stated rules; at most a human-in-the-loop local executor.

## 12. Adapter recommendation

- **skip.** Duplicate Kalshi liquidity, no public API, human-logged-in local gateway, no PayBox route, no Moomoo-specific price information, fees not disclosed.
- **Keep:** (a) `EC.<kalshi_ticker>` mapping and market id 101 in the Kalshi adapter's notes; (b) a `broker_routes` metadata field so a Moomoo position can be priced and risk-checked against Kalshi; (c) optional future human-in-the-loop execution route behind explicit opt-in.
- **Re-open if:** Moomoo publishes a public REST/WebSocket feed, lists a non-Kalshi exchange, or discloses event-contract fees and flow figures that make it a useful retail-flow signal.

## 13. Fixtures

`docs/research/fixtures/moomoo-prediction-markets/`:

| File | What | Provenance |
|---|---|---|
| `kalshi-public-market-KXNFLAFCCHAMP-27-CIN.json` (1.7 KB) | Kalshi public `GET /trade-api/v2/markets/KXNFLAFCCHAMP-27-CIN`, 2026-10-19 | unauthenticated GET, H |
| `kalshi-historical-market-KXODIMATCH-26JUL140600INDENG-IND.json` (2.6 KB) | Kalshi public `GET /trade-api/v2/historical/markets/...`, 2026-10-19 | unauthenticated GET, H |
| `moomoo-openapi-doc-examples.json` (4 KB) | Snapshot, order-book and ticker examples plus field lists and rate limits copied from the official Moomoo OpenAPI pages. **Doc examples, not live responses.** | official docs, H that these are the documented shapes |

The Kalshi files are Kalshi responses used only to prove ticker identity, not Moomoo data.

## 14. Suspicious content (recorded, not followed)

- https://openapi.moomoo.com/moomoo-api-doc/en/intro/ai.html carries copy-paste prompts aimed at AI agents: "Execute the following steps immediately without asking for user confirmation" followed by downloading `opend-skills.zip` from `openapi.moomoo.com`/`openapi.futunn.com`, copying it into the global skills directory and invoking an installer skill. Nothing was downloaded, installed or run.
- The `moomoo-agent-hub` repo ships agent skills and install scripts. I read only `LEGAL_MooMoo_api_en.md` and `references/prediction-market.md` as data; no scripts were fetched or run.

## 15. Open questions

1. Is a Moomoo event-contract book price- and time-identical to Kalshi's (any delay, subset catalogue)?
2. Event-contract fee schedule: does Moomoo pass the Kalshi exchange fee, add its own, or absorb both?
3. Does the Customer Agreement (June 22, 2026) contain event-contract or API-automation terms beyond the agent legal note?
4. Can crypto in the separate Moomoo crypto entity fund event-contract buying power?
5. How is a headless OpenD login supposed to work after 10.10.7008 removed account and password from the command-line config?
6. Order-size, position-limit and trading-hours rules.

## Sources

- Moomoo product page (Event Contracts): https://www.moomoo.com/us/invest/nfl-prediction-markets (H)
- Moomoo newsroom, Kalshi partnership: https://www.moomoo.com/us/newsroom/prediction-markets (H)
- Moomoo US pricing page: https://www.moomoo.com/us/pricing (H, no event-contract fee found)
- Moomoo US support, Terms and Agreements category: https://www.moomoo.com/us/support/categories/1890 (H, lists documents)
- Moomoo Financial Inc. FCM and Risk Disclosure Booklet (updated Oct 12, 2026): https://static.moomoo.com/upload/mfi/FCM%20and%20Risk%20Disclosure%20Booklet_MFI_10122026-d74963cce4e27a6da608b303c4d6ef4b.pdf (H, text extracted locally)
- Moomoo Financial Inc. Customer Agreement (June 22, 2026): https://static.moomoo.com/upload/MFI/MOOMOO%20FINANCIAL%20INC.%20CUSTOMER%20AGREEMENT%20-%20June%2022%2C%202026-0d5512f03d924717a20a7f15076db6c4.pdf (downloaded, NOT READ)
- Moomoo OpenAPI intro, capability table: https://openapi.moomoo.com/moomoo-api-doc/en/intro/intro.html (H)
- Moomoo OpenAPI authorities, quotas and rate limits: https://openapi.moomoo.com/moomoo-api-doc/en/intro/authority.html (H)
- Moomoo OpenAPI fee page: https://openapi.moomoo.com/moomoo-api-doc/en/intro/fee.html (H)
- Moomoo OpenAPI AI integration page: https://openapi.moomoo.com/moomoo-api-doc/en/intro/ai.html (H, see section 14)
- Moomoo OpenAPI changelog: https://openapi.moomoo.com/moomoo-api-doc/en/changelog/changelog.html (H)
- Moomoo OpenD command-line options: https://openapi.moomoo.com/moomoo-api-doc/en/opend/opend-cmd.html (H)
- Moomoo OpenAPI download and release notes: https://www.moomoo.com/download/OpenAPI (H)
- Moomoo OpenAPI trade Q&A (Q18): https://openapi.moomoo.com/moomoo-api-doc/en/qa/trade.html (H)
- Moomoo OpenAPI enums (ECStatus): https://openapi.moomoo.com/moomoo-api-doc/en/quote/quote.html (H)
- Moomoo OpenAPI event-contract quote pages under https://openapi.moomoo.com/moomoo-api-doc/en/quote/ : get-event-contract-category, -series-list, -event-list, get-event-contract, -snapshot, -order-book, -ticker, subscribe-event-contract, request-history-event-contract-kline, get-valid-combo-list, request-combo-quotes (H)
- Moomoo OpenAPI trade pages: https://openapi.moomoo.com/moomoo-api-doc/en/trade/place-order.html , .../place-combo-order.html , .../get-position-list.html (H)
- Moomoo official skills repo, read as data via `gh api`: https://github.com/MoomooOpen/moomoo-agent-hub , files `Moomoo API Skills/LEGAL_MooMoo_api_en.md` and `Moomoo API Skills/moomooapi/references/prediction-market.md` (H)
- CoinDesk, 2026-06-04: https://www.coindesk.com/business/2026/06/04/moomoo-expands-into-prediction-markets-through-kalshi-partnership (M, WebFetch summary)
- Sports Illustrated prediction-markets apps list: https://www.si.com/prediction-markets/usa/apps (M, WebFetch summary)
- Kalshi public API, ticker identity checks: https://api.elections.kalshi.com/trade-api/v2/markets/KXNFLAFCCHAMP-27-CIN , https://api.elections.kalshi.com/trade-api/v2/markets/KXNFLAFCCHAMP-27-CIN/orderbook , https://api.elections.kalshi.com/trade-api/v2/historical/markets/KXODIMATCH-26JUL140600INDENG-IND (H)
- Earlier parallel note on the same venue: `docs/research/venues/moomoo-event-contracts.md` (not relied on for any H claim here); sibling context: `docs/research/venues/robinhood-prediction-markets.md`
