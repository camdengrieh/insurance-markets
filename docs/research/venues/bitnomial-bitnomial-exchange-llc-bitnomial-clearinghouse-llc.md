# Bitnomial (Bitnomial Exchange, LLC DCM + Bitnomial Clearinghouse, LLC DCO) - adapter spec

Researched 2026-10-19 (~02:00-03:00 UTC). READ-ONLY: unauthenticated GETs to `bitnomial.com` (site, docs, rulebook, public `/exchange/api/*` market-data routes, regulatory PDFs), `botanical.finance`, `gh api` for the `bitnomial` GitHub org (listing + one README), a few WebFetch summaries (CoinDesk, CFTC press release). No account, no key, nothing signed, no POST/PUT/DELETE, no wallet, no PayBox calls, no third-party code cloned or run. Web search budget ran out partway through (2 searches done), so some searches I wanted (launch coverage, partner list) were not possible.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak, stale or internally inconsistent.
Third-party text (site, docs, PDFs, API payloads) is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.
Fixtures: `docs/research/fixtures/bitnomial-bitnomial-exchange-llc-bitnomial-clearinghouse-llc/` (6 files, all < 4 KB).

## 0. Verdict

**adapter_priority: skip (revisit trigger below).**

1. **The venue is live, but its own prediction markets are not observable.** The exchange and clearinghouse trade and clear crypto futures, perps, options and spot in 2026 (H). The prediction-market product was *approved* (DCO order 2025-12-12; CFTC staff no-action letter 26-01, 2026-01-08) (H), yet the public product API on 2026-10-19 contains **zero** products of type `event`: 5,961 products ever listed (563 future, 829 spread, 4,502 option, 36 perpetual, 31 spot), none event; the site's own volume/OI feed has no event/prediction product type either (H, fixtures `product_specs_type_census.json`, `voi_summary_and_sample.json`). The only event contract in the rulebook is a single BTC > $150,000 binary (EBUC, self-certified 2025-07-21) that does not appear in the product API (H). I found no launch press release, no event-contract volume and no Bitnomial-native prediction listings anywhere. That resolves the tracker's "both live and pending": live exchange, prediction product approved but not observably launched (H for absence in the API; M for "not launched").
2. **Most "Bitnomial prediction liquidity" lives at partner DCMs that merely clear there.** Bitnomial Clearinghouse accepted Railbird Exchange LLC event contracts for clearing (CFTC filing BTNL 2026-61, 2026-05-26) (H). Novig's exchange (Ludlow Exchange, LLC) names Bitnomial Clearinghouse as its DCO (M here: from the in-repo Novig note, `docs/research/venues/novig.md`, which cites Ludlow's Rulebook Rule 3.1(d) and a Novig help-center page; I did not re-read those). A clearinghouse is not an order book: those venues are separate legs, to be specced on their own, and Bitnomial adds no extra independent price for them.
3. **No usable trade path for an agent wallet.** Order entry is over a binary protocol (BTP) on private network links (DMA) or via a broker/CQG; the public REST API is market data plus read-only account routes. Accounts are KYC'd US-regulated futures accounts with an FCM. No on-chain contracts, no EVM/Solana signing (section 4, 5).
4. **Revisit trigger**: poll `GET https://bitnomial.com/exchange/api/v1/prod/product/specs?active=true` once a day and flip the adapter on if any row has `type == "event"`. Bitnomial's own market-data page JavaScript already filters `specs.filter(s => s.type === 'event')` (H, `https://bitnomial.com/js/market/data/market-data.js`), so that is where launched event contracts will most likely appear, with the same `/product/data` and WebSocket `book` / `trade` plumbing.

Corporate fact that matters for stability: Payward (Kraken's parent) announced the acquisition on 2026-04-17 (up to $550M) and completed it on 2026-05-01; Bitnomial "will continue to operate within the Payward group, with its existing licenses ... and third-party clearing operations intact" (H, https://bitnomial.com/news/2026-05-01/payward-completes-acquisition-bitnomial/). Payward's stated plan is spot margin, perps and options on Kraken/NinjaTrader first; prediction markets are not mentioned in the closing note.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Public product API, 2026-10-19 | 513 active products (125 futures, 125 calendar spreads, 198 options, 34 perps, 31 spot); newest listing dated 2026-09-28; max `product_id` 6763 | H |
| News room | TRX futures launch 2026-07-27; Wedbush joins DKeX and Bitnomial Clearinghouse 2026-06-29; Payward closes acquisition 2026-05-01; Injective futures 2026-04-15 | H (https://bitnomial.com/news) |
| Rulebook index | "Rulebook - August 04, 2026"; DCM page "May 15, 2026", DCO page "October 02, 2026" | H |
| Regulatory page | 2026 rule filings up to BTNL 2026-121 (Cardano and Dogecoin spot updates), only no-action letter listed is 26-01 | H (https://bitnomial.com/exchange/regulatory) |
| Prediction-market product | Landing page `/market/predictions` says Bitnomial "received CFTC approval to offer prediction markets" and focuses on "crypto and economic events"; no launch date, no contract list | H (https://bitnomial.com/market/predictions) |
| Volume/OI feed for event contracts | none: `productType` values are only Future, Option, Perpetual, Spot | H (fixture `voi_summary_and_sample.json`) |

## 2. What it is

- **Kind (H)**: US-regulated derivatives group (Bitnomial, LLC, Chicago): a DCM (Bitnomial Exchange, LLC), a DCO (Bitnomial Clearinghouse, LLC) and an FCM (Bitnomial Clearing, LLC); owned by Payward since 2026-05-01. Sources: https://bitnomial.com/ footer text, https://bitnomial.com/exchange, news above.
- **Market model**: central limit order book on every product, price-time matching, limit orders only (Day or IOC), no market orders/stops (H, https://bitnomial.com/exchange/docs/api/btp/order-entry/). Prices in integer "ticks" times `price_increment`; notional volume/OI in cents on the stable endpoints (H, https://bitnomial.com/exchange/docs/api/rest/products/).
- **Prediction contracts, as designed (H)**:
  - Legal form: "Fully Collateralized Swaps" accepted for clearing by the Clearinghouse (Rulebook Rule 502 "Swaps"). The no-action letter covers "binary and bounded swaps referencing digital assets, economic indicators, and financial outcomes"; the letter's definition of fully collateralized is a position where the DCO holds funds at all times sufficient to cover the maximum possible loss (CFTC Letter 26-01, 17 CFR 39.2).
  - Binary yes/no at $1.00 / $0.00 settlement; the clearing filing for Railbird (BTNL 2026-61) says Bitnomial "clears binary contracts versus scalar contracts" (H). So expect binary only, no scalar, and categorical events as sets of separate binaries (M, inferred).
  - **The one contract spec on file, EBUC (H, https://bitnomial.com/exchange/rulebook/product/bitcoin/ebuc/ and filing https://bitnomial.com/exchange/regulatory/cftc/product-filings/25-024.pdf)**: "Bitcoin US Dollar Price Over/Under Event Futures": $1.00 per contract, tick $0.01, price limit $0-$1.00, position limit 1,000,000 contracts, 100% margin, over/under price $150,000, settles $1.00 if the computed implied-spot settlement is at or above the over/under price else $0.00; the expiry date-time field is blank on the rulebook page. Original certification text says it is "a financially-settled, margined events futures contract" (so it is a futures, not a swap, and margin rate 100%).
- **Tokenisation**: none. Positions are ledger entries at the clearinghouse (H: no on-chain contract, token or address anywhere in the docs or the GitHub org; org holds Haskell libraries, a Python BTP client and a Wireshark BTP plugin only).
- **Hours**: 24/7 with a weekly maintenance window Fridays 17:00-18:00 CT (H, https://bitnomial.com/exchange/docs/market-operations/market-hours/); the EBUC product table says "23/5" (H, inconsistency within Bitnomial's own pages, unresolved).

## 3. Read API

Official docs: https://bitnomial.com/exchange/docs (REST, WebSocket, BTP, FIX). Third-party code in the org (`bitnomial/python-btnl-client`) is a thin client for the same endpoints (H, README read via `gh api`).

| Surface | Endpoint | Access | Tag |
|---|---|---|---|
| REST base | `https://bitnomial.com/exchange/api/v1/prod/` | public for market data | H |
| Product specs | `GET /product/specs[?active=true]`, `/product/spec/:id` | public, no auth (3.1 MB unfiltered, 289 KB active) | H |
| Product data (prices, settlement, volume, OI) | `GET /product/data[?active=true]`, `/product/data/:id` | public; `volume`/`open_interest` published next morning ~8:30 CT, null until then | H |
| Block trades, indexes, funding rates | `/block-trades`, `/index/hashrate/data/`, `/funding-rates` | public | H (docs) |
| Charts, market stats | `GET /exchange/api/web/charts/price/:id`, `/web/charts/voi`, `/web/market/stats/trailing/all-products` | public, **"draft ... non-stable ... subject to change without notice"** | H |
| Account data | `GET /orders`, `/orders/working`, `/fills` | HMAC-signed (below) | H |
| WebSocket | `wss://bitnomial.com/exchange/ws`, JSON; channels `trade`, `book` (snapshot then `level` deltas by `ack_id`), `block`, `status` (Open/Close/Halt) | docs say public internet, no login described; must send `subscribe` within 10 s; product codes by symbol or base symbol | H (docs only; I did not open a socket) |
| BTP (binary) | order entry + pricefeed | DMA only (AWS PrivateLink / Direct Connect / VPN); onboarding by email to the exchange help desk | H |
| FIX 4.4 | drop copy only | DMA | H |

- **Auth for private REST**: headers `BTNL-AUTH-TIMESTAMP` (ISO8601 ms, within 30 s of server), `BTNL-CONNECTION-ID` (hex), `BTNL-SIGNATURE` = base64(HMAC-SHA256(secret = the connection's hex AuthToken, message = `METHOD + path + "?" + query + "BTNL-AUTH-TIMESTAMP"+ts+"BTNL-CONNECTION-ID"+id + body`)). Connections (id + token) are created in the customer portal by a verified account (H, https://bitnomial.com/exchange/docs/api/rest/authentication/ and `/api/connection-ids/`).
- **Rate limit**: 200 requests per 5 minutes on the exchange REST API, excess returns HTTP 403 (H, https://bitnomial.com/exchange/docs/api/rest/overview/). BTP: 50,000 messages/s per connection (H, order-entry risk-management page). WebSocket limits: NOT FOUND (searched: websocket overview/subscribe/trade/book/status doc pages).
- **Resolution data**: the product API carries `settlement_price`, `settlement_time`, `settlement_price_comment`, `product_status` (`active`/`forthcoming`/`expired`), `final_settle_time`. Event outcome fields (an event title, outcome, reference source) are NOT FOUND in any documented response type; the documented `ProductSpec` TypeScript types cover only future/spread/option (searched: products doc page, live JSON for all 5,961 rows).
- **Gotchas** (H unless noted): (a) `product_data.notional_volume` is in cents on `/v1/prod`, but in USD on `/web/market/stats/trailing`; (b) the unfiltered `/product/specs` is 3 MB, always pass `active=true`; (c) the trailing-stats endpoint looks unreliable: its 24h notional sums to $5.2B across 46 rows (a perp with 991,581 contracts shows $742M) while the voi feed shows spot at $40-96M per day, so do not use `/web/market/stats` for liquidity (L); (d) the docs' REST `ProductSpec` types lag the live JSON (`type` also takes `perpetual` and `spot`, live rows also carry `quote_asset`, `funding_*`); (e) the site Terms restrict automated access and redistribution of "Bitnomial Data" (section 8), so check them before putting Bitnomial prices in a product that is shown to other people; stay on the documented API routes and keep inside 200 req/5 min.

Fixtures saved (all unauthenticated GETs on 2026-10-19):
- `product_specs_sample.json` (one active product per type), `product_specs_type_census.json` (derived: counts by type and status, `event_type_count: 0`), `product_data_sample.json`, `trailing_stats_top5.json`, `voi_summary_and_sample.json`, `rulebook_EBUC_product_terms.txt`.

## 4. Trade path

- **Programmatic order entry exists but is not retail-reachable (H)**: BTP v3 `Open` message (limit, Day/IOC, product id, price in ticks, quantity) after a `Login` with `connectionId` + 32-byte `authToken`, only over DMA network links; BTP v4 (not finalised) adds post-only. The public REST docs have no order placement or cancel route (only `GET /orders`, `/orders/working`, `/fills`) (H). Indirect access via CQG or an FCM/clearing member (Hidden Road, Marex, NinjaTrader Clearing, R.J. O'Brien, Wedbush, Bitnomial Clearing) (H, https://bitnomial.com/clearinghouse).
- **Retail front end**: "Start Trading" goes to the Botanical app (https://app.botanical.finance/), whose landing page describes perpetual and physically settled futures and options and does not mention prediction markets (H, https://botanical.finance). Futures accounts "require additional verification with an FCM" (H, docs footer). I did not open the app (needs an account).
- **Auth/signing**: HMAC-SHA256 shared secret per connection; no EVM, Solana or EIP-712 signing anywhere.

## 5. PayBox reachability

**paybox_reachable: no.** There is no on-chain market, no transaction proposal or signed-order flow an EVM wallet can use. Funding is a KYC'd account at a US FCM/DCO; collateral accepted by the clearinghouse is USD, BTC, ETH, XRP with haircuts of 0 / 15 / 20 / 40% (H, https://bitnomial.com/clearinghouse), and the Clearing Fees block mentions blockchain network fees for deposits/withdrawals (H), so a crypto deposit exists, but the deposit chains/addresses were not read and trading itself would still be HMAC REST/BTP from a verified account (not a PayBox primitive). Treat Bitnomial as a read-only / signal venue at best, and today there is nothing prediction-market-shaped to read.

## 6. Fees

- Posted schedule (on https://bitnomial.com/exchange, "All fees listed here are inclusive of both Exchange & Clearinghouse fees"): Bitcoin Complex and Crypto Complex products without a minimum contract size: $0.07/side for Participants, $0.10/side for Non-Participants; products with a minimum contract size: $0.0007 / $0.0010 per side per minimum contract; Spot Complex: 2 bps per side (H). An exchange-fee cut from $2.00 to $0.02 on named futures (BUS, ETUD, SOUH, ...) took effect 2026-01-21 (H, filing BTNL 2026-01).
- **Event-contract fee: NOT FOUND** (searched: exchange fees block, clearinghouse page, help-center FAQ which only says details are on a "Fees" page, rule 312 which says fees are "posted at the Website", filings 25-024 and 26-061). If the per-contract $0.07-$0.10 rule were applied to a $1.00-payout binary it would be 7-10% of face per side, which would make it untradeable for arbitrage; unknown whether EBUC or later event contracts get a special schedule (L).
- Partner exchanges that clear here set their own fees.

## 7. Resolution and dispute risk

- Design (H): settlement computed by the exchange from rule 509 (Rule 509.6 for EBUC, referencing the exchange's own "implied spot price" from its futures curve: `S_i = P_p - B_d * T_f`), and Rule 509 reserves **sole discretion** to set an alternative settlement price if the stated procedure is not representative, and to "adjust Daily and Final Settlement Prices as it deems necessary" (https://bitnomial.com/exchange/rulebook/chapter/5/rule/509/). Rule 508 lets the exchange bust or adjust trades; its decisions are "final". Bitnomial is therefore its own oracle for its own price-threshold contracts (centralised, reference is its own curve not a third-party index), which is a higher basis risk against Polymarket/Kalshi crypto-price markets that settle on external indices.
- For partner contracts (Railbird, Novig), settlement references are set by each partner exchange and "official pre-defined Reference Source" (H, filing BTNL 2026-61); disputes are theirs.
- The rulebook has arbitration (Chapter 7) and governing-law rules (Rule 1009); event-specific dispute process: NOT FOUND (searched: rulebook index, rules 502, 508, 509, EBUC product page; the PDF rulebook could not be text-extracted beyond the HTML mirror).
- CFTC staff relief is non-binding and revocable: the letter says it "is not binding on the Commission" and the Divisions can "modify, suspend, terminate" it, and expressly does not address whether the contracts are consistent with CEA section 5c(c)(5)(C) or Reg. 40.11 (the event-contract public-interest rules) (H, CFTC Letter 26-01, footnote 16). The no-action conditions: fully collateralized, cleared at Bitnomial Clearinghouse, **publish time-and-sales on the website (timestamp, contract, quantity, price) promptly**, provide data to the CFTC (H). I found no such published tape for any event contract, consistent with none trading.

## 8. Geo, ToS, automation

- US-regulated; the Terms do not list restricted countries. Botanical says "U.S. traders are welcome without a VPN" and that its perps are "available globally" (headline); neither sentence is about prediction markets (H, https://botanical.finance). Eligibility for prediction contracts specifically: NOT FOUND (searched: terms, help center, predictions page, Botanical landing page).
- Account: KYC'd account plus FCM verification for futures (H). API order entry is a documented, supported mechanism for onboarded Participants (H, docs).
- **Data-use terms are restrictive for an aggregator (H, https://bitnomial.com/terms, "Permitted Uses" / "Prohibited Uses")**: use of the Website or Data Feed is limited to "personal, informational, or non-commercial purposes" plus "internal business use, evaluation, education, compliance, and research"; it prohibits redistribution, rebroadcasting, "electronically extracting, scraping, collecting, mining, downloading", "using bots, scraping tools, spiders, or other automated means ... to access, extract, monitor, or copy content or data", and using the data to build "indexes, investment products, reference rates, valuation services, or end-user market data services". It is unclear whether the documented public REST/WebSocket market-data routes count as "Data Feed" for this purpose. Consequence: an internal arbitrage scanner is probably within "internal business use", but republishing Bitnomial prices to end users in an aggregation product would need written permission (L: legal reading, not advice).
- Participant requirements (Rule 303): good standing, registrations, Participant Agreement, tied to a Clearing Member (H) - i.e. API order entry is for institutions or via a broker, not an anonymous agent.

## 9. Liquidity (with dates)

- **Bitnomial-native prediction contracts: no volume, no OI, no listings observable on 2026-10-19 (H, absence).**
- Whole venue, for scale only (draft `/web/charts/voi`, 2026-09-21 to 2026-10-16, 26 days; notional converted from cents; L because the endpoint is unstable and its siblings disagree): spot about $40-96M per trading day; perps $200.6M in total; futures $0 and options $0 notional volume in the window; open interest on 2026-10-16: perps $1.49M, everything else $0 (fixture `voi_summary_and_sample.json`). The derivatives complex that would back prediction markets is thin.
- Clearinghouse-level volume for Railbird/Novig is not published by Bitnomial; see those venues.

## 10. Event coverage and arbitrage overlap

- Declared scope: crypto price outcomes and macro/economic indicators ("token price movements to macroeconomic indicators") (H, press release 2025-12-12, https://bitnomial.com/news/2025-12-12/prediction-markets-approval). That overlaps Polymarket and Kalshi crypto-price and macro (CPI, Fed, jobs) markets, which would be the arbitrage surface **if** any listing appears.
- Actual listings: none observable; the only spec on file is BTC >= $150,000 (an out-of-the-money level relative to typical 2026 questions; expiry date blank).
- Sports/politics: not announced for Bitnomial-native contracts. Partner clearing (Railbird: "economic, governmental, or other statistical determinations" plus "sports governing body for game results" as examples in the filing; Novig: sports) is a separate-venue question.
- **Signal use**: Bitnomial BTC/ETH options and perps could in principle give option-implied probabilities for price-threshold markets, but options show zero volume/OI in the window above, so it is not a usable signal source today (H for the numbers, L for the endpoint).

## 11. Shared liquidity

Own order book for its own contracts, separate from every other venue (H: CLOB at the exchange). Clearing is shared infrastructure, not shared liquidity: Bitnomial Clearinghouse is the DCO for Railbird (H) and Novig/Ludlow (M); DKeX (DraftKings' exchange) is mentioned in the same Wedbush release as a separate venue (H) with no statement that Bitnomial clears it. Counterparty/default risk is correlated across those venues (a clearinghouse event would hit them together), but prices are independent.

## 12. Not found / open questions

- Any listed `event` product, contract list or launch date for Bitnomial-native prediction markets (searched: product API all rows, voi feed, market-data JS, predictions page, news room pages 1-2, rulebook product index, 2025-2026 regulatory filings text for "event contract"/"Over/Under"/"prediction").
- Event-contract fee schedule; WebSocket rate limits; event-contract dispute process; Rule 509.6 text (the HTML Rule 509 page ends at "Options Settlement Prices" and does not contain a 509.6; the product page cites it); confirmation that the Botanical app exposes prediction contracts (not opened, needs an account).
- Why EBUC (certified 2025-07-21) is absent from the public product API (never listed, listed under a hidden type, or delisted) is unknown. The Aug 2025 filing BTNL 2025-26 amended Rules 502 and 509 and may be the answer; not read in depth.
- Whether the public WebSocket works unauthenticated (docs say it is a public-internet API; I did not connect).
- Railbird Exchange LLC: separate venue, not researched here (its homepage `railbird.com` redirected to an unrelated site, so the brand/domain is unconfirmed).
- Web search was exhausted: no independent press coverage was checked beyond two search runs and a CoinDesk fetch (CoinDesk 2026-01-08, M).

## Sources

- Site and docs (H): https://bitnomial.com/ ; https://bitnomial.com/market/predictions ; https://bitnomial.com/exchange ; https://bitnomial.com/clearinghouse ; https://bitnomial.com/news and the four 2025-12-12 / 2026-04-17 / 2026-05-01 / 2026-06-29 releases under it ; https://bitnomial.com/terms ; https://bitnomial.com/help ; https://bitnomial.com/exchange/regulatory
- API docs (H): https://bitnomial.com/exchange/docs and its `api/overview`, `api/environments`, `api/network-setup`, `api/connection-ids`, `api/rest/{overview,authentication,products,orders,fills,charts,market-stats,indexes}`, `api/websocket/{overview,subscribe,trade,book,status}`, `api/btp/{overview,login,order-entry}`, `market-operations/{taxonomy,product-notation,market-hours,order-entry-risk-management,customer-roles}`, `change-management/{changelog,upcoming-changes}`
- Live endpoints (H, 2026-10-19): `https://bitnomial.com/exchange/api/v1/prod/product/specs`, `.../product/data?active=true`, `https://bitnomial.com/exchange/api/web/market/stats/trailing/all-products`, `https://bitnomial.com/exchange/api/web/charts/voi?begin_time=2026-09-19T00:00:00Z&end_time=now`
- Site JavaScript (H): https://bitnomial.com/js/market/data/market-data.js and `util/config.js`
- Rulebook (H): https://bitnomial.com/exchange/rulebook ; chapter 5 rules 502, 508, 509 ; chapter 3 rules 301, 303, 312 ; chapter 8 rules 820, 823 ; product page `.../product/bitcoin/ebuc/`
- CFTC and filings (H): CFTC Letter No. 26-01 (2026-01-08) https://bitnomial.com/exchange/regulatory/cftc/no-action-letters/26-01.pdf ; CFTC press release 9166-26 https://www.cftc.gov/PressRoom/PressReleases/9166-26 (summary only) ; BTNL 2025-24 https://bitnomial.com/exchange/regulatory/cftc/product-filings/25-024.pdf ; BTNL 2026-01 (fee reduction) `.../product-filings/26-001.pdf` ; BTNL 2026-61 (Railbird event contract swaps accepted for clearing) `.../product-filings/26-061.pdf` (PDF paths under https://bitnomial.com/exchange/regulatory/cftc/)
- GitHub (H): https://github.com/bitnomial (org repo list via `gh api orgs/bitnomial/repos`), README of `bitnomial/python-btnl-client`
- Botanical (H): https://botanical.finance
- Secondary (M): CoinDesk 2026-01-08 "Bitnomial wins U.S. regulator's nod on prediction markets push" https://www.coindesk.com/policy/2026/01/08/bitnomial-wins-u-s-regulator-s-nod-on-prediction-markets-push-joins-growing-crowd ; search-result snippets for Payward/other coverage (not independently opened); in-repo `docs/research/venues/novig.md` for the Novig-clears-at-Bitnomial claim.
