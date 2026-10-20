# Moomoo US and Plus500 US event contracts (Kalshi front-ends)

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.
Scope note: WebSearch budget was exhausted mid-session, so Plus500 was researched from its own site and legal PDFs only (no news search).

## Verdict

Both are US broker front-ends that route to KalshiEX and clear at KalshiKlear. They are NOT independent liquidity.
Adapter priority: **skip** as an independent price/arbitrage leg. One narrow exception: Moomoo's official OpenD API is a
second, regulated-broker *execution route* into Kalshi liquidity (US brokerage USD, no Kalshi account). Model it as a venue
alias of Kalshi in the platform registry (same contract identity = Kalshi ticker), never as a separate leg.
PayBox reachable: **no** (USD cash brokerage accounts, KYC, ACH/wire; no wallet, chain or signed-order path).

## 1. Still live? (yes, both)

- Moomoo US: Moomoo Financial Inc. (FCM registered with NFA/CFTC) began offering Kalshi event contracts 2026-06-04. H
  (press release via Nasdaq/GlobeNewswire mirror on stocktitan.com; CoinDesk 2026-06-04; Moomoo's own page https://www.moomoo.com/us/invest/nfl-prediction-markets fetched today, HTTP 200, "Moomoo partners with Kalshi, a CFTC-regulated exchange").
  Moomoo's OpenD changelog shows a Prediction Markets API shipped in OpenD 10.9.6908 on 2026-07-15 and later builds to 2026-08-13. H
- Plus500 US: Plus500US Financial Services LLC (FCM, NFA ID 0001398). "Combined Account Disclosures V.7 July 2026" contains a full
  Event Contracts Risk Disclosure; fees page lists a "Prediction Markets contract commission". H
  (https://us.plus500.com/en/prediction-markets returns 200 today; the www.plus500.com host returns 403 to scripted clients, us.plus500.com does not.)
  Launch date: about-us timeline says "Plus500 adds Prediction Markets to its U.S. trading platform" with no date on the page (H for the fact, date not on page). Early Feb 2026 from an earlier search summary is M.
- Third-party corroboration: Dimers (page updated 2026-10-16) reviews both; it does not say how they route. M

## 2. What they are (kind, market model, tokenisation)

- Kind: regulated broker front-ends (FCMs) for exchange-listed event contracts (CFTC-classified cleared swaps) on KalshiEX; no own matching engine. H
- Evidence that contracts ARE Kalshi markets, not look-alikes:
  - Moomoo OpenD contract codes are `EC.` + Kalshi tickers, e.g. `EC.KXWCADVANCE-26JUL14FRAESP-FRA`, `EC.KXODIMATCH-26JUL140600INDENG-IND`; event codes `EC.<ticker>.EVENT`, series codes `EC.<series>.SERIES` (Series -> Event -> Contract is Kalshi's hierarchy). H (Moomoo API docs, Q18 and quote pages)
  - Plus500 US firm disclosure: "The Firm clears Event Contracts traded on the Chicago Mercantile Exchange and KalshiEx"; exchange membership KalshiEX LLC (April 2025); clearing member of KalshiKlear LLC approved 2025-04-26; clearinghouses used directly include KalshiKlear. H (https://cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/1790575895/7/CCFirmDisclosure.pdf, mentions July 2026 events so it is current)
  - Plus500 User Agreement cleared-swaps addendum points customers at the Kalshi Clear LLC rulebook (https://kalshi.com/regulatory/rulebook). H
  - Plus500's site category tree (Sports, Politics, Elections, Economics, Financials, Crypto, Mentions, Companies, Commodities, Climate and Weather, Science and Technology, Entertainment) matches Kalshi's taxonomy, incl. "Mentions" and "election combos". M (inference, fixture below)
- Plus500 also clears CME Group event contracts (as clearing partner for FanDuel Predicts). Whether Plus500's own retail PM screen lists any CME event contracts is NOT FOUND; treat as unknown. H for clearing role, unknown for retail listing.
- Market model: binary YES/NO, central limit order book at Kalshi, price 0.01 to 0.99 (Moomoo API: "Prediction market: 0.01 ~ 0.99, allowing 2 decimal places"), winner pays $1.00. Fully collateralized, no margin, not marked to market. H (Moomoo API docs; Plus500 Event Contracts Risk Disclosure)
  Moomoo's book exposes YES bids/asks and NO bids/asks (NO bid = 1 - YES ask). Multi-leg "Combo (parlay)" orders via RFQ (`request_combo_quotes` then `place_combo_order`, quote_id expires). H
- Tokenisation: none. Positions are broker-ledger entries cleared at KalshiKlear; "Event Contracts cannot be sold or transferred to another Exchange". H

## 3. Chains and collateral

No chain. Collateral is USD cash in the brokerage/FCM account, pre-funded to cover full loss; orders are rejected if cash is short. H
Funding (per Dimers, M): Moomoo ACH/wire, withdrawals 3-7 days; Plus500 debit cards, ACH, wire, Apple/Google Pay, withdrawals 1-3 days.

## 4. Read API

### Moomoo US: official-authenticated (local gateway) — H
- Docs: https://openapi.moomoo.com/moomoo-api-doc/en/ ; event-contract overview https://openapi.moomoo.com/moomoo-api-doc/en/quote/event-contract-overview.html
- No hosted REST base URL. You run OpenD (a local gateway, logged in with a moomoo ID) and talk to it over TCP protobuf on `127.0.0.1:11111` (api_port default) or an optional WebSocket port (`websocket_port`, off unless set; intended for JavaScript). SDKs: Python, Java, C#, C++, JavaScript, raw proto. H (OpenD config docs)
- Support matrix (intro page): Prediction Market / Event Contract quote = yes; live trading = yes for Moomoo US only (not FUTU HK, SG, AU, MY, CA, JP); paper trading = no. H
- Quote API (OpenD >= 10.9.6908, 2026-07-15):
  - Discovery: `get_event_contract_category`, `filter_competition`, `get_event_contract_series_list`, `get_event_contract_event_list`, `get_event_contract(event_code)` (contract_list with title, open/close/determination/settled times, status, result, settlement_value, volume, tick_size, category, tag; paginated up to 1000), `get_event_contract_milestone_list`, `get_valid_combo_list`, `request_combo_quotes`.
  - Prices: `get_event_contract_snapshot(code_list)` returns price, cumulative_volume, yes/no best bid/ask with sizes, last_trade_time, volume_24h, open_interest. `get_event_contract_order_book(code, num=10)` returns yes_bids/yes_asks/no_bids/no_asks as [(price,size)]; needs `subscribe_event_contract(..., [SubType.ORDER_BOOK])` first.
  - Streaming: `subscribe_event_contract` with ORDER_BOOK, K-line, TICKER handlers (push callbacks). History: `request_history_event_contract_kline`.
  - Resolution: contract fields `status` (ECStatus, e.g. ACTIVE, FINALIZED), `result`, `settlement_value`, `determination_time`, `settled_time`.
  - Doc-example response shapes saved (not live): `docs/research/fixtures/moomoo-and-plus500-us-event-contracts/moomoo-opend-docs-event-contract-examples.md`. No unauthenticated live sample is possible.
- Auth/limits: moomoo ID login in OpenD; the account needs prediction-market (PREDICTION) trading permission for orders. Quote right for event contracts is "Aligned with the moomoo [app]" (authority page). Order placement is limited to 15 requests per 30 s per acc_id (min 0.02 s apart), shared with Place Combo Order. Quote-side rate limits NOT FOUND (searched: intro, authority, quote pages).
- Adapter implication: heavy (local daemon, interactive login, per-user account). For price data the Kalshi public API is strictly better and carries the same book.

### Plus500 US: no official API — H (absence), M (conclusion)
- NOT FOUND (searched: us.plus500.com home, prediction-markets, fees, about, terms pages; User Agreement PDF; PM page JS bundle): any developer/API page, API key, FIX or WebSocket for retail. Trading is in the proprietary web/app platform at futures.plus500.com (login required).
- The marketing site calls an undocumented JSON backend at `https://sat.plus500.com/prediction-markets/api/...` (found in the site's own JS bundle): `categories?minEventsPerSubCategory=2`, `categories/{id}/events?maxEvents=20`, `events/{id}/exists`, `events/{id}/category`, and `website-search/api/PredictionSearch?query=...&take=100`. Four unauthenticated GETs returned 200 JSON: category tree; bare numeric `EventIds`; `{"Exists":true}`; a category hierarchy. No prices, books, volume or resolution fields. Fixtures saved. L as a data source: undocumented, and the returned event ids did not correlate with the requested category (e.g. category `economics_fed` returned ids that equal Polymarket Gamma ids of crypto up/down events; that match is meaningless because Gamma ids are dense integers, so do not treat Plus500 ids as Polymarket ids).
- No ToS clause was found permitting scraping of that backend; do not build on it.

## 5. Trade path

- Moomoo: programmatic orders via OpenD, official. Single contract: `OpenFutureTradeContext(host, port, security_firm=SecurityFirm.FUTUINC)`, `unlock_trade(<trade pwd>)`, then `place_order(price, qty=0, code='EC.<kalshi ticker>', trd_side, order_type, amount=<notional>, pred_side=PredSide.YES|NO, trd_env=TrdEnv.REAL)`; cancel and positions use the standard trade API; combo orders via `place_combo_order`. Live only, no paper. H (Q18, place-order docs)
  Auth is the logged-in moomoo ID session plus the trade-unlock password; there is no signed-order scheme. No extra API fee: "There is no extra fee for trading through Moomoo API" (same fees as app). H
- Plus500: none (manual in the platform). H/M
- PayBox / EVM wallet: **not reachable**. Neither accepts on-chain funds or signed transactions; collateral is USD in a KYC'd brokerage account. Transaction proposals from an EVM or Solana wallet cannot place or fund these orders. The only wallet-adjacent path is fiat off-ramp then ACH/wire by the human owner, which is outside the PayBox model.

## 6. Fees

- Moomoo: "$0 Commissions ... Restrictions and other fees apply" on the event-contracts page; no per-contract schedule published on the page or pricing page. Whether Kalshi's exchange fee is passed through is NOT FOUND (searched: event-contract page, pricing page, API fee page, press release). H for the quoted text, unknown for amounts.
- Plus500: "Prediction Markets contract commission: 0.01 USD, per side, not including Exchange and NFA fees as applicable" (NFA fee applies only to futures). So $0.01 per contract per side commission, exchange fee treatment unclear. H (https://us.plus500.com/en/feescharges). Promo: "Trade $10, get $20" (code on page).
- For edge maths assume at least Kalshi's own fee schedule applies on top; do not assume $0 all-in. M

## 7. Resolution and dispute risk

Same as Kalshi: determined under the listing exchange's and clearinghouse's rules (KalshiEX / KalshiKlear; rulebook https://kalshi.com/regulatory/rulebook). Settlement value $1.00 or $0, cash settled. H (Plus500 User Agreement s.12 and Risk Disclosure; Moomoo page)
Disclosed risks relevant to a bot: source-agency data errors, trading halts at exchange or CFTC direction, and forced liquidation/delisting on short notice from litigation (explicitly names sports event contracts), plus FCM risk. The broker "may liquidate or close out positions ... without further notice". H (Plus500 Combined Account Disclosures V.7 July 2026)
Moomoo-specific resolution rules NOT FOUND beyond "settles at $1.00 or $0.00". Crypto 15-minute contracts reportedly settle on CF Benchmarks real-time indexes per Kalshi help (M, via prediction.express).

## 8. Geo, ToS, automation

- US only, "eligible users", and "Not all contracts are available in all U.S. states" (Moomoo, H). Plus500: broad set of states plus DC per Dimers (M); state list not read first-hand.
- Moomoo: automation is explicitly supported through the official API (needs PREDICTION permission, live account). Moomoo also markets "API Skills" for AI agents with a disclaimer that it does not sponsor any AI agents and agent output is not investment advice (press release, H). Anything beyond the documented API (scraping the app) is not covered.
- Plus500: no API; User Agreement contains no automation clause (searched for automated, algorithm, API, robot: none). Treat unattended bots as unsupported. M
- Third-party regulatory status: sports event contracts are under litigation in several states (Plus500 disclosure, H).

## 9. Liquidity

- Order flow lands in KalshiEX's single book; broker volume is a subset of Kalshi volume, not additive. H (architecture) / M (no published split)
- No venue-level volume, OI or TVL published for either broker. NOT FOUND (searched: Moomoo newsroom/page, Plus500 about/fees/PM pages; Plus500 investor site returned no PM news).
- Moomoo's event-contract page lists a "24H Volume" top-8 ranking (e.g. a BTC 15-minute contract at "248.49M Vol", an NFL game at "67.46M Vol", 2027 Pro Football Champion at "5.00M Vol"). Undated static render, units described as number of contracts; L, use only as colour. These are Kalshi contracts' totals, not Moomoo-only.
- Get Kalshi liquidity numbers from the Kalshi venue note, not here.

## 10. Event-category overlap (where arbitrage would exist)

Everything overlaps Kalshi 1:1 because it IS Kalshi: sports (NFL, soccer incl. World Cup, cricket, MMA, tennis, golf, esports), politics/elections, economics (Fed, CPI, jobs, GDP), financials, crypto price (15-minute BTC/ETH/SOL/XRP/DOGE and hourly), commodities, climate/weather, entertainment, mentions, tech/science. H (Moomoo page tabs; Plus500 category fixture). Cross-venue overlap with Polymarket, Opinion, Limitless, etc. therefore equals Kalshi's overlap.

## 11. Aggregation guidance

- Do not add a "moomoo" or "plus500" market feed. Add `venue_aliases: {moomoo: kalshi, plus500: kalshi}` (or an `execution_routes` list on the Kalshi venue) and key contracts by Kalshi ticker; strip the `EC.` prefix for Moomoo codes.
- If an execution-route abstraction exists, a Moomoo route could submit Kalshi-equivalent orders via OpenD for users who hold a Moomoo US account. Constraints: local OpenD process, interactive login, trade-unlock password, 15 req/30 s, order amount in notional USD plus `pred_side`, live only. This is optional and low value versus Kalshi's own API.
- Arb-scanner rule: never count Kalshi and Moomoo/Plus500 as two legs of one arbitrage.

## 12. Open questions

- Does Plus500's retail PM screen list CME event contracts (FanDuel/CME) in addition to Kalshi? If so, those would be a separate (CME) venue worth its own note. Needs a logged-in view or a news source (search budget was exhausted).
- Exact exchange-fee pass-through at Moomoo and Plus500 (only commissions are published).
- Moomoo quote-API rate limits and subscription quotas for event contracts.
- Plus500 state availability list and exact launch date.

## Sources

- Moomoo event contracts page (fetched 2026-10-19): https://www.moomoo.com/us/invest/nfl-prediction-markets (H)
- Moomoo press release mirror, 2026-06-04: https://www.stocktitan.net/news/FUTU/moomoo-partners-with-kalshi-to-expand-access-to-prediction-vr7cpr989x4d.html (H, mirror of company release); Moomoo newsroom https://www.moomoo.com/us/newsroom/prediction-markets (H)
- CoinDesk 2026-06-04: https://www.coindesk.com/business/2026/06/04/moomoo-expands-into-prediction-markets-through-kalshi-partnership (M); ROI-NJ 2026-06-04: https://www.roi-nj.com/2026/06/04/tech/moomoo-and-kalshi-partner-to-increase-access-to-prediction-markets/ (M); prediction.express: https://prediction.express/moomoo-opens-kalshi-event-contracts-as-15-minute-bitcoin-markets-move-toward-brokerages/ (L/M, internally inconsistent on crypto launch)
- Moomoo API docs v10.11 (fetched 2026-10-19): intro https://openapi.moomoo.com/moomoo-api-doc/en/intro/intro.html ; changelog .../changelog/changelog.html ; authority .../intro/authority.html ; fee .../intro/fee.html ; event-contract overview .../quote/event-contract-overview.html ; snapshot .../quote/get-event-contract-snapshot.html ; order book .../quote/get-event-contract-order-book.html ; contract list .../quote/get-event-contract.html ; subscribe .../quote/subscribe-event-contract.html ; place order .../trade/place-order.html ; Q&A Q18 .../qa/trade.html ; OpenD config .../opend/opend-cmd.html (all H)
- Plus500 US: https://us.plus500.com/en/prediction-markets ; fees https://us.plus500.com/en/feescharges ; about https://us.plus500.com/en/aboutus ; terms index https://us.plus500.com/en/support/termsandagreements (H)
- Plus500 legal PDFs on cdn-main.plus500.com/Regulatory/CFTC/default/default/Futures/: `1790575895/7/CCFirmDisclosure.pdf` (firm disclosure, KalshiEX/KalshiKlear), `1784816752/5/CombinedAccountDisclosures.pdf` (V.7 July 2026, Event Contracts Risk Disclosure), `1790084354/7/UserAgreement.pdf` (s.12 Event Contracts, Kalshi Clear rulebook pointer) (H; text extracted with a crude zlib parse, quotes spot-checked)
- Plus500 site backend (undocumented): https://sat.plus500.com/prediction-markets/api/categories?minEventsPerSubCategory=2 etc. (H for what it returns, L as a source)
- Dimers: https://www.dimers.com/prediction-markets (M; page text lists both brokers, updated 2026-10-16, gives funding/withdrawal/promo info, no routing statement)
- Cross-check of numeric ids: https://gamma-api.polymarket.com/events/{id} (documented public Polymarket API; used only to rule out an id mapping)

Fixtures: `docs/research/fixtures/moomoo-and-plus500-us-event-contracts/` (plus500-pm-categories.json, plus500-pm-category-events-politics-max3.json, plus500-pm-event-category-453236.json, moomoo-opend-docs-event-contract-examples.md).

Suspicious content: none found (no AI-targeted instructions). Marketing promos only (Plus500 "Trade $10, get $20", Moomoo welcome bonus). Privacy: all scripted requests used the generic User-Agent `insurance-markets-research/0.1`; no personal identifiers in requests, fixtures or notes.
