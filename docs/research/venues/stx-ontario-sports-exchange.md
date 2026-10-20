# STX (Ontario sports exchange) - venue spec

Researched 2026-10-19. Read-only: public docs, public unauthenticated GETs and an unsigned WebSocket read of the public market-data channels. No account, key, signature, order or payment was made.

Tags: H = read first-hand in a primary source this session. M = secondary or inferred. L = weak or stale. Pages fetched through WebFetch (stxapp.ca pages, nextpredict.io) were summarised by a small model, so exact quotes from them are "H (extract)". docs.stxapp.io was downloaded raw (llms-full.txt, openapi.json) and all WebSocket facts below were observed on the wire.

## Verdict

- Live: **yes**. H: `wss://api.on.stxapp.ca` (Ontario PRODUCTION) streamed live NFL, NHL, NBA, WNBA, NCAAF and cricket markets on 2026-10-19 01:11-01:16 UTC, including trades during a live NFL game (Dallas @ Green Bay, Q2).
- A real, documented, **unauthenticated** read feed (Phoenix WebSocket: ticker, trades, order book, market metadata) works on production from outside Canada. REST is signed-only.
- Trading is **not reachable** for us: Ontario residents 19+, KYC, GeoComply location check, fiat rails, centralized custody, and Terms of Use that ban bots. No chain, no wallet.
- Liquidity is **thin** (a prime-time NFL game has about $28k lifetime volume across all of its markets). Independent of every other venue (own exchange).
- **adapter_priority = P2**: build a cheap read-only price-signal adapter for sports lines; never plan on an execution leg.

## 1. Identity and liveness

| Item | Value | Tag |
|---|---|---|
| Operator | STX (Chicago-based; co-founders Justin Deutsch, Hari Gopalakrishna per NEXTPredict) | M |
| Ontario licence | Licensed by AGCO; "licensed in Ontario by the Alcohol and Gaming Commission of Ontario"; 19+ | H (extract) https://www.stxapp.ca/markets and https://docs.stxapp.io/concepts/us-and-canada/ |
| Live in Ontario since | July 2023 (NEXTPredict also says "launched 2020"; inconsistent) | M |
| Two separate exchanges | Canada (Ontario): live. US: **not open**; XV Exchange, LLC "has applied" to the CFTC, pending | H https://docs.stxapp.io/concepts/us-and-canada/ |
| US application dates | XV Exchange LLC filed 2025-12-09; XV Clearing LLC filed 2026-02-27; founder expects US launch by Nov 2026 | M https://nextpredict.io/platforms/stx/ (page dated 2026-09-30) |
| Docs freshness | docs.stxapp.io last modified 2026-10-12; changelog newest entry 2026-10-03 (v1.5.1); GitHub org `stxapp` repos pushed 2026-10-18 | H |
| House Rules | effective 2026-10-14 | H (extract) |
| Terms of Use | effective 2026-04-15 (just over 6 months old) | H (extract) |
| Products | Sports only: football, hockey, baseball, soccer, basketball, cricket | H (extract) https://www.stxapp.ca/markets |

US exchange is out of scope until the CFTC designation lands (watch item). Its demo host `demo.stxapp.io` runs the same API.

## 2. Kind and market model

- Kind: centralized, regulated sports **exchange** (central limit order book, fiat). Not on-chain. H https://docs.stxapp.io/concepts/how-markets-work/
- Every market is a **binary** contract; each outcome is its **own market with its own order book**. A moneyline is two markets; soccer 3-way is three; a spread ladder is one market per line. Their prices need not sum to `max_price`. H https://docs.stxapp.io/concepts/market-shape/
- `max_price` is read per market (new markets $1.0000, price range $0.01-$0.99; older markets can differ). An order must price strictly below `max_price`; price is a whole cent. H
- Order types: limit and market (market orders never rest). Optional `expiration` (`good_till_start`, `good_till_time`) and `cancel_on_disconnect`. No atomic replace (cancel then place). H https://docs.stxapp.io/concepts/order-types/ , https://docs.stxapp.io/risk-controls/
- Sell side = short: liability is `(max_price - price) x qty`; buys cost `price x qty`. Fully collateralised, no margin or leverage. H https://docs.stxapp.io/concepts/positions/
- Tokenisation: **none**. Contracts are exchange database rows; positions are not transferable. There is no NO token; "NO" = sell the YES market.
- Categorical/scalar: not native. Mutually exclusive sets are modelled as sibling binary markets that share a `grouping_id` (`{event_id}:moneyline:full`, `{event_id}:spread:full`, `{event_id}:3way:regulation`). H
- Market statuses: `scheduled`, `pre_open`, `open`, `closed`, `resulted`, `cancelled`, `voided`; rendered `suspended` when `trading=false` on an open market. H https://docs.stxapp.io/concepts/market-status/
- Settlement values: win `max_price`, lose $0, `push`/`settled` in between. Observed NFL moneyline text: "settle into $1 if the Green Bay Packers beats the Dallas Cowboys and settle into $0 if they do not. In case of a draw we result into a push and settles to $0.50." H (live `description` field, fixture `ws-market-join-reply-orderbook-events.json`).
- Intra-venue note: the two sides of a moneyline are independent books, so `ask_home + ask_away < 1` (or `bid_home + bid_away > 1`) is possible; fees (section 7) usually eat it. M (inference from H doc statement).

## 3. Chains and collateral

- Chains: **none**. Collateral: cash balance held by STX (custodial). H
- Funding (deposit methods): Interac (Send/Request), Visa, Mastercard, PayPal, MuchBetter, bank transfer. M (NEXTPredict); H that the portfolio API lists Interac `sub_method` values. No crypto deposit is mentioned anywhere in docs (grep of full docs for crypto/USDC/wallet found only signing and the liability "wallet fields"). H
- Currency: NOT FOUND (searched: docs.stxapp.io llms-full.txt, openapi.json for CAD/USD/currency; money fields are "dollar strings"). Presumably CAD for Ontario; unconfirmed.

## 4. Read API

Docs: https://docs.stxapp.io/ (Starlight site; machine-readable: `/llms.txt`, `/llms-full.txt`, `/openapi.json` (16 operations), `/openapi.preview.json` (US demo only), Postman collection `/downloads/stx-rest-api.postman_collection.json`). H

Hosts (H https://docs.stxapp.io/environments/ and /concepts/us-and-canada/):

| Env | REST + WS host | Notes |
|---|---|---|
| Ontario production | `api.on.stxapp.ca` | live money; keys created at stxapp.ca |
| Ontario demo | `demo.stxapp.ca` | play money |
| US demo | `demo.stxapp.io` | play money, shared books |
| US production | not announced | |

### Auth model for reads

- **REST: every `/api/v1` route requires a signed request.** Unauthenticated `GET /api/v1/markets?limit=1` returned `401 {"error":"Missing or invalid API key credentials"}` on all three hosts (H, probed 2026-10-19; fixture `rest-markets-unauthenticated-401.json`). Real REST response bodies could therefore not be sampled; the shape below is from the docs (H, documentation example, not a live sample).
- **WebSocket: the market-data topics accept an UNSIGNED handshake** as long as a `User-Agent` header is sent (else 403). Confirmed on **production** `api.on.stxapp.ca` from a non-Canadian IP: HTTP 101, joins `ok`. H (probe + https://docs.stxapp.io/websockets/).
- Signing (for account channels and REST): Ed25519 over `timestamp_ms + METHOD + path(with query)`; headers `X-STX-ACCESS-KEY`, `X-STX-ACCESS-TIMESTAMP`, `X-STX-ACCESS-SIGNATURE`; +/-30 s; body not signed; WS handshake signs `GET` + `/socket/websocket` (no query). H https://docs.stxapp.io/api/authentication/
- API key creation is self-service in the web app after registering and verifying email ("My Profile -> API Keys", Read only or Read/Write; BYO public key supported). A production account needs full Ontario KYC. H (docs) / M (KYC implication from Terms).
- Rate limits: **none published, none enforced today** (no 429); "will be announced in the changelog before enforced". H https://docs.stxapp.io/concepts/rate-limits/

### WebSocket (Phoenix channels), `wss://api.on.stxapp.ca/socket/websocket?vsn=2.0.0`

Frames are `[join_ref, ref, topic, event, payload]`. Heartbeat `[null,"hb","phoenix","heartbeat",{}]` at least every 60 s (use 15-30 s). Pushes are coalesced (book about 200 ms, `markets` about 2 s). No sequence numbers; replace books wholesale; resync after reconnect. H

| Topic | Join payload | Gives | Units | Observed |
|---|---|---|---|---|
| `ticker` | `{}` or `{sports,competitions}` | per-market change feed: ids, symbols, sport, competition, best bid/offer + size, last price, open_interest, total_volume (contracts), bid/offer depth | dollar strings | yes |
| `trades` | `{}` or `{market_ids,event_ids}` | anonymous executions; `action` = taker side | dollar strings | yes (6 trades in 240 s) |
| `orderbook` | `{market_ids:[...]}` (required) | `book` snapshot per market: levels with price, quantity, liquidity, total_quantity, total_liquidity | dollar strings | yes |
| `market:<uuid or symbol>` | `{}` | join reply = full market record (title, question, description, rules, specifier, participants, event_start, status, recent_trades, bids/offers) + `ob`; then `order_book_update` (about 200 ms) and `market_update`; `request_snapshot` to resync | record in **cents**, `ob` in **dollar JSON numbers** | yes |
| `markets` | `{rule_filters?,message_types?}` | `market_created` (all fields) and `market_updated` (diff). **No initial snapshot** | **cents**, JSON numbers | yes |
| `market_updates` | `{}` then `watch` | lighter change feed for watched markets | cents | not probed |
| `events` | `{event_ids:[...]}` (required) | lifetime **dollar** volume per event | dollar string | yes |
| `market_stats` | market ids | price history buckets | | not probed |
| `orders:/fills:/positions:/settlements:/balances:/account:/user_info:/order_slip:{user_id}` | signed socket only | own account | | not probed (needs key) |

Money formats differ per surface (REST dollar strings; `markets`/`market_updates` cents; `market:<id>` `ob` dollar numbers; `orderbook` dollar strings). The adapter must normalise by topic. H https://docs.stxapp.io/concepts/market-shape/

### REST endpoints (all signed; H, docs)

| Purpose | Endpoint |
|---|---|
| Markets (catalogue + top of book) | `GET /api/v1/markets` (filters `market_ids,event_ids,status,trading,sports,competitions,sort_by[...]`; `limit` default 100, max 200; opaque `cursor`) |
| Events | `GET /api/v1/events`, `GET /api/v1/events/{event_id}/players` |
| Own orders/fills/positions | `GET/POST /api/v1/orders`, `POST /api/v1/orders/batched` (<=100), `DELETE /api/v1/orders/{id}`, `DELETE /api/v1/orders/batched`, `DELETE /api/v1/orders/all`, `GET /api/v1/fills`, `GET /api/v1/positions` |
| Account | `GET /api/v1/me`, `/account/balance`, `/account/market_stats` |
| Portfolio | `/portfolio/{settlements,deposits,withdrawals,fees,adjustments,loyalty}` |
| Resolution | `status` and `result` (`pending, won, lost, void, settled, push`) fields on the market; `settled_at`; `powered_by` names the resulting provider; settlements via `/portfolio/settlements` (own) |
| Public trades / order book over REST | **NOT FOUND** (searched: openapi.json paths, llms.txt). Book depth only via WebSocket (REST `bids`/`offers` are top levels only); public trade tape only via `trades` topic. |

Documented `GET /api/v1/markets` fields useful for matching (H): `market_id, event_id, grouping_id, grouping_name, rules, specifier, sport, competition, event_title, event_start, event_status, participants, title, question, description, status, trading, max_price, price, last_traded_price, bids[], offers[], open_interest, total_volume (contracts), volume24h (contracts), in_play_delay_sec, result, settled_at, powered_by, symbol`. Docs say `GET /markets` "is heavily cached ... designed to handle high query rates".

SDKs (official): TypeScript `@stxapp/stx-typescript` (npm), Python `stx-python` (PyPI), C# `STX.Sdk` (NuGet); examples MIT-licensed at github.com/stxapp/stx-api-examples. H. Not installed or run.

### Bootstrapping an adapter without a key (M, inferred from H docs)

1. Open the unsigned socket (UA set, heartbeat), join `ticker {}`, `trades {}`, `markets {}`.
2. Harvest `market_id, event_id, market_symbol, sport, competition` from `ticker`. For title/question/rules/specifier/participants/event_start, join `market:<market_id>` once per market (reply carries the full record + book). Use `orderbook {market_ids}` for books of many markets on one join.
3. Caveat: `ticker` and `markets` are change feeds; **markets that never move are invisible** until they do. A cold start needs patience or a signed key (`GET /markets` gives the full catalogue). Illiquid markets matter little for arbitrage.
4. Keep `grouping_id` (never `symbol`, which changes on reschedule, never `grouping_name`).

Cross-venue matching keys available: `sport`, `competition`, `event_start` (UTC), `participants[]` (`name, role, short_name, abbreviation`), `rules` + `specifier` (leg), `grouping_id` (set), plus free-text `question`/`description` for sanity checks. H

## 5. Trade path

- Programmatic order placement exists: `POST /api/v1/orders` (JSON body flat: `market_id, action buy|sell, order_type limit|market, price "0.42", quantity "10"`, optional `client_order_id, expiration, expiration_time, cancel_on_disconnect, geo_location`), signed with the Ed25519 API key, Read/Write scope. Batch place up to 100, batch cancel, cancel-all. FIX orders also exist (`fix_order` field). H https://docs.stxapp.io/api/rest/orders/place-order/
- Production orders carry a **GeoComply location token** (`geo_location`) in geo-fenced environments; omitting it is a 422 unless the IP is accepted; VPN/proxy/hosting IPs can be refused. H (docs); C# SDK fetches the token for server-side bots. H
- Third-party apps can act for members via OAuth 2.0 (ISV program, **invite only**; `orders.write` needs an IP allow-list; no scope moves money). H https://docs.stxapp.io/isv/
- A "List your own markets on STX (Preview)" ISV page exists; details not read (irrelevant to a price-signal adapter).
- In-play delay: orders on `in_progress` events queue for `in_play_delay_sec` (per sport; a live NFL market showed 0 on 2026-10-19; per-account exemption possible). Account limits `ORDER_LIABILITY` and `MAX_ORDER_LIABILITY_PER_ORDER` are tuned for "casual participants, not market makers"; raise via support. H

### Can a PayBox / EVM wallet trade it?

**No.** `paybox_reachable = no`. STX is a custodial fiat exchange with no on-chain contracts, no crypto deposit path, no transaction-proposal or signed-order scheme that a wallet could produce (orders are authorised by an STX-issued/registered Ed25519 API key tied to a KYC'd Ontario account). Nothing for Base, Ethereum, BNB, Arbitrum, Polygon or Solana. Funding is Interac/cards/PayPal. H/M

## 6. Resolution and dispute risk

- Winners are determined by the operator, graded against official league/NCAA results with **Sportradar** named as the data source. H (extract) https://stxapp.ca/legal/house-rules
- STX **may correct incorrect settlements at any time, reverse a settlement for error, and nullify wagers** found "problematic" during live trading or after the event; payment may be delayed by a security review. H (extract)
- Disputes: complaints in writing; STX aims at 90 days; escalation to iGaming Ontario customer care; otherwise binding individual arbitration in Toronto (ICDR Canada), one-year limit. H (extract) https://stxapp.ca/legal/terms-of-use
- No on-chain oracle or token-holder dispute layer. Risk is counterparty/operator discretion, not manipulation of a voting game.
- Rules that differ from other venues (breaks hedges on shortened or odd games): H (extract)
  - Draw/tie in a 2-way NFL moneyline: push at $0.50 (live market text).
  - Schedule: game cancelled or moved to another local day -> open positions close at their opening price (not a plain void).
  - Baseball: moneyline needs 5 full innings (4.5 if home leads); totals/run lines need 9 (8.5); suspended games resumed within 36 h keep action.
  - Football: interrupted/postponed void unless completed within 48 h. Hockey/basketball: must resume within 24 h.
  - Soccer: 90 min plus stoppage only; extra time and shootouts excluded.
  - Overtime/extra innings included for football, basketball, hockey (shootout adds a goal), baseball.
- Operational: markets can go `suspended`; in-play queue delay; engine "failure to complete or sequence matches" disclaimed (Platform Methodology 8.1). H (extract)

## 7. Fees

Official formula (taker pays, maker free), https://help.stxapp.ca/articles/fee-schedule/ (H extract):

`Fee = ceil( f x C x p x (100 - p) / 100 )` in cents, with `f` the loyalty-tier/maker-or-taker factor, `C` contracts matched, `p` matched price in cents (1-99). Fees are summed across all matched parts of a wager, then rounded **up once** to the cent. In dollars per contract: `f x p x (1 - p)`.

| Tier | Maker f | Taker f | Max taker fee per contract (at 50c) |
|---|---|---|---|
| Rookie | 0.00 | 0.10 | 2.5c |
| Veteran | 0.00 | 0.08 | 2c |
| All-Star | 0.00 | 0.06 | 1.5c |
| MVP | 0.00 | 0.04 | 1c |
| Hall of Fame | 0.00 | 0.00 | 0c |

- Charged when the taker order matches (before 2026-06-22 fees were taken at settlement). H (extract)
- Example, Rookie taker, 100 contracts at 0.50: $2.50 on $50 premium (5%); at 0.70: $2.10 on $70 (3%). M (arithmetic)
- Per-account schedule: read in the web app (My Profile -> Fee Schedule); API exposes `trade_fee`, `total_fee`, settlement `fee`, `/portfolio/fees`, `order_slip` pre-trade costing. H https://docs.stxapp.io/concepts/fees/
- NEXTPredict's "commission up to 3% on winning trades" conflicts with the official schedule; treat as stale. L
- Deposit/withdrawal fees: NOT FOUND (searched: fee-schedule page, docs).

## 8. Geo, ToS, automation

- Only users **physically in Ontario**, 19+, who pass KYC; STX uses third-party location tracking (GeoComply). One account per person. H (extract) https://stxapp.ca/legal/terms-of-use , https://docs.stxapp.io/concepts/us-and-canada/
- **Bots clause (conflict):** "Robots or any software designed to play automatically at online sports betting sites is not allowed"; scraping/crawling by "bots, spiders, web crawlers" barred; sanction: account closure and forfeiture of winnings and funds. The Terms do not mention the API. H (extract, Terms effective 2026-04-15)
- Yet the developer docs invite algorithmic clients (market-making limits, cancel-on-disconnect, FIX, ISV program). The two are in tension; unresolved. Get written confirmation from STX before any trading automation. The unsigned public market-data socket is explicitly documented for use ("Market-wide channels accept it on an unsigned connection"), but a strict reading of the "crawler" clause is a risk for heavy scraping; stay light (one socket, no polling).
- Docs require a `User-Agent` on REST and WS (403 otherwise). H
- Regulatory framing: AGCO/iGaming Ontario licensed sports betting, **not** CFTC-regulated; the site calls itself "designed and intended to be used solely for betting on sports". H (extract)

## 9. Liquidity (measured 2026-10-19, Sunday evening ET; one NFL game live)

| Metric | Value | Tag |
|---|---|---|
| Lifetime volume, NFL DAL @ GB (live, Q2), all markets on the event | $28,252 | H (`events` channel, 01:16 UTC) |
| Lifetime volume, NFL WSH @ SF (Monday night, pre-game) | $5,944 | H |
| Lifetime volume, NHL CAR @ CGY (live) | $5,338 | H |
| Lifetime volume, WNBA ATL @ GS | $647 | H |
| NBA, NCAAF, cricket events sampled (future dates) | $0 | H |
| Largest sampled single market (DAL @ GB moneyline, GB side) | OI about 4,273 contracts, lifetime 14,008 contracts; book 1,944 @ 0.69 bid vs 4,626 @ 0.70 offer (about $1.3k and $3.2k) | H (fixture) |
| Trades in a 240 s window, whole exchange | 6 trades, 8-200 contracts each (median about 10) | H (fixture `ws-trades-sample.json`) |
| Median spread on 12 two-sided markets in that window | about 10c (live props wide) | H (computed from ticker best bid/offer) |
| World Series winner futures | $2,600 volume as of 2026-09-30 | M (NEXTPredict) |
| Platform-wide aggregate volume / OI / TVL | NOT FOUND (searched: stxapp.ca, docs, NEXTPredict; no public aggregate) | |

One snapshot, one evening; not a time series. Extrapolate with care. Not compared against other venues in this session (those are covered by the parallel workflow); the absolute numbers above are small.

## 10. Overlap with other venues (where arbitrage could exist)

- Sports game lines: NFL, NCAAF, NHL, NBA, WNBA and cricket seen live on the wire; MLB (World Series winner futures per NEXTPredict, M) and soccer (La Liga symbol examples in the docs) not observed on the wire. Overlap with Kalshi, Polymarket sports, Limitless, etc. is real for moneyline/spread/total, and for player props on NFL (pass TDs, receptions) and WNBA. H (symbols/markets observed)
- Politics, crypto price, macro, weather, entertainment: **none**. H (site and docs list sports only)
- Independence: STX runs its own matching engine and Ontario-only pool. It does **not** share liquidity with another venue that we know of. H/M (own book; no pooling statement found). The US exchange (XV Exchange) is separate by design. Independent leg in principle, but untradable for us, so it can only act as a **reference price** (the Ontario sharp/soft signal).
- Arbitrage frictions if someone legally could trade both sides: taker fee up to 2.5c per contract, in-play queue delay, push-at-0.50 on ties, different void and shortened-game rules, CAD vs USD settlement, withdrawal path through fiat, tiny size, wide spreads on props (median about 10c in the sample).

## 11. Adapter spec (read-only signal)

- `venue_id`: `stx-ontario`. Mode: `signal_only`, `tradable=false`.
- Connection: one WebSocket, UA `<product>/<version>`, heartbeat 20 s, exponential backoff reconnect, rejoin all topics, replace books on reconnect, call `request_snapshot` on `market:<id>` topics.
- Price normalisation: store prices as decimal dollars; convert `markets`/`market_updates` cents / 100; read `max_price` per market (cents 100 -> 1.00) and implied probability `price / max_price`.
- Outcome mapping: STX market = YES leg; NO price = `max_price - price`; keep `grouping_id` and sibling legs so the aggregator can reason about the whole set (moneyline pair, 3-way, ladders).
- Staleness: treat a market as stale if no `ticker`/`market_update` for N seconds; respect `status != open` or `trading=false` (suspended); mark `in_play_delay_sec > 0` and `event_status in_progress`.
- Settlement metadata to attach: `rules`, `specifier`, `description`, `powered_by`, void/tie rules per sport (section 6), and a flag `ties_push_at_half` for 2-way NFL.
- Do not attempt orders. If STX ever grants written API/bot permission and an Ontario-resident operator exists, the trade path is the signed REST/WS in section 5.

## 12. Not found / open questions

- NOT FOUND: platform-wide volume/OI; currency (CAD?) of the Ontario exchange; deposit/withdrawal fees; any published statement on sharing liquidity; any Terms clause that mentions the API; whether the unsigned feed is rate limited or monitored (docs say no limits today).
- NOT FOUND: GitHub contract/subgraph (not applicable, no chain). WebSearch was unavailable (session budget exhausted), so no independent news or CFTC status check beyond NEXTPredict (2026-09-30).
- stxapp.io (US site) returned HTTP 403 to fetch; status.stxapp.ca returned a JS shell with no readable status text.
- Open: does STX consider the public WS feed use by a non-customer allowed? Is a bot/API licence available for non-Ontario data consumers? Will the CFTC designation land (and could a US exchange be an independent second STX leg with crypto-friendly rails)?

## 13. Suspicious content

None found. `llms.txt`/`llms-full.txt` are ordinary documentation and contained no instructions aimed at an AI agent. The authentication page publishes a throwaway test Ed25519 private key explicitly labelled "never authenticate a real request"; it was not copied or used. The Live-markets page contains marketing ("there is currently a lot of room in it") but nothing instructional.

## 14. Fixtures (docs/research/fixtures/stx-ontario-sports-exchange/)

All captured 2026-10-19 from `wss://api.on.stxapp.ca` (unsigned, generic UA `insurance-markets-research/0.1`), trimmed, each under 50 KB:

- `ws-markets-ticker-trades-joins-and-pushes.json` - join replies for `markets`/`ticker`/`trades` and the first ticker and `market_updated` pushes (cents vs dollars side by side).
- `ws-market-join-reply-orderbook-events.json` - `market:<uuid>` join reply (full market record + `ob`), `orderbook` `book` frame, `order_book_update`, `market_update`, `events` reply.
- `ws-trades-sample.json` - the 6 `trade` frames seen exchange-wide in 240 s.
- `ws-ticker-latest-per-market-240s.json` - latest ticker push per market (20 markets, 10 events).
- `rest-markets-unauthenticated-401.json` - the REST failure shape (REST needs signing, so no live 200 sample exists).

## Sources

- https://www.stxapp.ca/markets and https://www.stxapp.ca/ (H extract; live product, 19+, AGCO, links to developers and fee schedule)
- https://nextpredict.io/platforms/stx/ (M; dated 2026-09-30; US CFTC application dates, founders, fee claim that conflicts with the official schedule)
- https://docs.stxapp.io/ , /llms.txt , /llms-full.txt , /openapi.json (H raw), and pages: /api/authentication/ , /concepts/{how-markets-work,market-shape,market-status,order-types,positions,fees,rate-limits,settlements,account-limits,us-and-canada}/ , /environments/ , /websockets/ , /websockets/channels/{market-data,markets,events}/ , /websockets/order-book/ , /explore/live-markets/ , /quick-start/ , /risk-controls/ , /isv/ , /changelog/
- https://help.stxapp.ca/articles/fee-schedule/ (H extract)
- https://stxapp.ca/legal/terms-of-use (H extract; effective 2026-04-15) and https://stxapp.ca/legal/house-rules (H extract; effective 2026-10-14)
- https://github.com/stxapp (gh api, repo list and push dates only; no code read or run)
- Live probes 2026-10-19: unauthenticated `GET https://{api.on.stxapp.ca,demo.stxapp.ca,demo.stxapp.io}/api/v1/markets` -> 401; unsigned WebSocket `wss://api.on.stxapp.ca/socket/websocket?vsn=2.0.0` (own minimal client, join/read only)
