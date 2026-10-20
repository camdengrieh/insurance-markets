# Underdog (UDX) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (UTC 02:40-03:00, i.e. the evening of 2026-10-18 US Eastern). READ-ONLY: official docs, public legal PDFs, and unauthenticated GETs to documented hosts (`api.underdogexchange.com`, `api.uat.udx.underdogsports.com`, `docs.underdogexchange.com`, `data.underdogexchange.com` and the two static data hosts it loads). One extra public GET to Kalshi's documented market-data API for a single price cross-check. No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data and nothing in them was followed. Scripted requests used only the User-Agent `insurance-markets-research/0.1`.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a fetch-tool summary, a sibling repo note, or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" where nothing was found. Nothing here is older than 6 months unless flagged.

Fixtures (each <= 50 KB): `docs/research/fixtures/underdog-udx/` (section 14).

Relation to earlier repo notes (same venue, different slugs; I did not edit them):
- `underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc.md` - the fullest spec; I re-verified its key facts independently and they reproduce (differences in section 13).
- `underdog-predict-underdog-exchange-udx.md` - EOD-only analysis; its "no usable public live API / P2" conclusion is **superseded** (a keyless live REST API exists, section 4).
- `underdog-predict-udm-llc-fcm.md` - the UDM FCM front end (skip; routes to Kalshi). **This file is the canonical `underdog-udx` spec.**

---

## 0. Bottom line

1. **Live (H).** UDX is Underdog's own CFTC-regulated DCM + DCO (ex-Aristotle Exchange). Trades printed sub-second on 2026-10-19 02:42Z during an NFL game (`GET /trades`). Official daily data (generated 2026-10-18): GA 2026-07-17, $2,008.9M cumulative notional, $1,304.1M in the last 30 days, peak day $108.4M on 2026-10-17. `underdogfantasy.com` itself returns HTTP 403 from Cloudflare (the discovery hint's "challenge"); the live brand domain is `underdogsports.com` (`/exchange`, `/predict`), the API is `api.underdogexchange.com`.
2. **Official, documented, keyless read API (H).** OpenAPI 3.1 (REST, 2026-07-15) and AsyncAPI 3.0 (WebSocket, 2026-08-11) at `docs.underdogexchange.com`. Six REST operations are public (catalog, one market, L2 order book, market trades, global trades, candlesticks); everything else, and all WebSocket use, needs an RSA-signed API key.
3. **Independent order book (H for structure, M for price independence).** Own CLOB, own clearinghouse. Kalshi/Crypto.com contracts shown inside the Underdog app belong to those exchanges and are not in the UDX API.
4. **Sports only (H).** All 20,640 open single-leg markets I enumerated are sports. About 81% of the 2026-10-17 notional was multi-leg `UDXCOMBO` parlay contracts (H, computed).
5. **Quotes are market-maker quotes: median spread 3 cents, about $3k premium within 5 cents per side** (64 sampled books, 44 two-sided). Taker fee `0.07 x P x (1-P)` per contract. One same-moment NBA check against Kalshi: UDX 0.50/0.54 vs Kalshi 0.51/0.52 (UDX wider, no crossing). Good as an independent price signal, poor for pure arbitrage.
6. **PayBox cannot trade it.** USD-only KYC'd account tied to an Underdog Fantasy account, US state geofence, RSA-PSS request signing with a user-held key. Reads are reachable (public GET).
7. **adapter_priority = P1** (read/signal leg). Not P0: sports-only, wide MM quotes, ~4 req/s public limit, WebSocket needs a key, and no PayBox trade path (so it cannot be an executable arbitrage leg for the PayBox plugin).

---

## 1. Is it still live? (2026-10-19)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.underdogexchange.com/trades?limit=20` at 02:42:46Z | 20 prints across about 5 seconds: single legs, player props, `UDXCOMBO` | H |
| `GET /markets/UDXNFLGAMEWIN_DALGB26OCT182020_DAL/candlesticks` 1h | 664,534 contracts / 4,491 trades (hour ending 01:00Z), 535,101 / 3,167 (ending 02:00Z) | H |
| `platform-overview.json`, `Last-Modified: Sun, 18 Oct 2026 12:10:22 GMT`, `data_through_date_et` 2026-10-17, `highlights.udx_ga_date` "2026-07-17" | Daily-updated metrics | H |
| EOD manifest `generated_at` 2026-10-18T09:04:48Z, 113 days 2026-06-24..2026-10-17 | Daily reports | H |
| Rulebook "Version 1.4, Effective as of October 1, 2026" (PDF behind `underdogsports.com/exchange/rulebook`) | Current rules | H |
| UDX Fee Schedule "Effective Friday, October 9, 2026, at 10:00 a.m. Eastern Time" | Recent rule activity | H |
| Docs `llms.txt` `Last-Modified` 2026-10-16; changelog: REST 2026-07-15, WebSocket 2026-08-11 | Maintained | H |
| `underdogsports.com/exchange` and `/predict` HTTP 200; `underdogfantasy.com` HTTP 403 (Cloudflare) | Live (brand moved to underdogsports.com) | H |
| Press: launched 2026-07-18; Aristotle DCM/DCO acquired March 2026; CFTC designated Aristotle's DCM September 2025 (the last is >6 months old) | gaming.net 2026-07-20, byline "an AI research agent for Gaming.net" | M/L |

Verdict: **still_live = true.**

Naming mess: the footer, Terms, fee schedule and Participant Agreement say "Aristotle Exchange DCM/DCO, Inc. d/b/a Underdog Exchange"; the rulebook v1.4 says "Underdog Exchange DCM, Inc. / Underdog Clearinghouse, Inc." Same venue (H). Another Underdog entity, UDM LLC ("Underdog Predict"), is an FCM that brokers Kalshi/Crypto.com contracts; the `/predict` page says contracts are offered by "one or more designated contract markets (DCMs) including UDX, Kalshi, and Crypto.com | Derivatives North America" (H, via fetch-tool summary).

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated, fully collateralised event-contract exchange; DCM and DCO, "exclusively self-cleared" (Rulebook 5(h)). Retail participates directly. Rulebook 4(a)(ii): no FCM or IB may submit trades on behalf of customers, so UDM does not route UDX orders.
- **Contracts (H, docs "Markets and Trading"):** binary. "A winning contract settles to $1.00. A losing contract settles to $0.00." **Only YES is traded**: "There is no separate NO contract. Buying NO at $0.40 is economically equivalent to selling YES at $0.60." A position is the signed net YES quantity.
- **Prices / sizes (H):** decimal strings in dollars, YES space. All 20,640 open single-leg markets have `tick_size` "0.001", `minimum_price` "0.001", `maximum_price` "0.999". Quantity has up to 2 decimals (0.01 contract). Docs: "never assume whole cents".
- **Matching (H, docs "Order Entry", Rulebook Rule 5):** central limit order book, price-time priority. `gtc | day | ioc | fok`, `post_only`, self-trade prevention (cannot be disabled). RFQ/quote workflow with maker "last look" for size and multi-leg. Not an AMM, not parimutuel.
- **Structure:** series -> event -> market. A "categorical" event is several independent binaries, each with its own book (soccer 1X2 = `..._HOME`, `..._AWAY`, `..._DRAW`; a two-team game winner is two books). No cross-book coupling, so the two-way ask sum is observable (DAL/GB: asks 0.18 + 0.83 = 1.01; bids 0.15 + 0.80 = 0.95).
- **Multi-leg combos (H):** `type=multi_leg`, ticker `UDXCOMBO-<id>`, `legs:[{ticker, outcome yes|no, external_ids}]`, own book. Fee schedule has a separate maker line for `ENTITYCOMBO` ("Will all of <components> occur?").
- **Unusual single-leg product (H):** `UDXNFLSWPP_*` (450 open) "Resolves Yes if [team] wins ... without its win probability falling below 10% over any 1 minute window." No counterpart elsewhere; do not link to plain moneylines.
- **Tokenisation:** none on-chain. Positions are rows at the DCO. Participant Agreement prohibited use (f): "to trade any Exchange Product off of the Exchange facility, unless expressly permitted under Exchange Rules" (H); Trading Privileges are "non-transferable, non-assignable" (Rulebook, H). A separate rule barring position transfer was cited by the earlier pass (M, not re-read).
- **Provider ids (H):** `external_ids.optic_odds = {fixture_id, market_id, team_id | player_id}` on 20,629 of 20,640 open single-leg markets. Docs: "Use it to join UDX markets onto a provider's feed instead of matching on tickers or descriptions." Other venues in this project do not expose Optic Odds ids, so cross-venue linking is still league + date + team/player + line + period.
- **Ticker grammar (M, inferred from 20k tickers; HHMM is US Eastern):** `UDX{LEAGUE}{TYPE}_{AWAY}{HOME}{YY}{MON}{DD}{HHMM}_{OUTCOME|LINE}`, e.g. `UDXNFLGAMEWIN_DALGB26OCT182020_DAL`, player props append a slug (`UDXNFLPASSYDS_DALGB26OCT182020JORDANLOVE_249.5`); some NHL props use hex ids (`UDXNHLGOALS_26101820000764A77C48E4_0.5`). Prefer `external_ids` + `description` over the grammar.
- **Spread / total semantics (H, descriptions):** "Baltimore Ravens beat the Cincinnati Bengals by at least 1.5 points"; "above 29.5 points in the ... game"; tennis totals count games; all end with "originally scheduled for <time> ET on <date>".

---

## 3. Chains and collateral

- **No blockchain (H).** Collateral is **USD cash** at the clearinghouse. Rulebook deposits clause (6(c)(i) per the earlier pass; text re-read in the PDF this session): "All deposits must be made in U.S. dollars. Crypto currencies, foreign currencies, credit card transactions, and securities are not acceptable for deposits." Participant Agreement s.7: funding by ACH debit (and a possible minimum deposit). Funds sit in segregated bank accounts (UDX "Security of Funds" PDF, read in the previous workflow pass; not re-read here, M).
- Fully collateralised: orders the account cannot fund are rejected `insufficient_funds` (H, docs "Order Entry"). No deposit/withdrawal endpoint exists in the REST spec; `POST /portfolio/transfers` only moves cash between the member's own accounts (H, OpenAPI path list).

---

## 4. Read API

**Verdict: `official-public` for market data (REST, keyless); `official-authenticated` for WebSocket, portfolio and trading.**

| Env | REST | WebSocket |
|---|---|---|
| Production | `https://api.underdogexchange.com/` | `wss://api.underdogexchange.com/ws` |
| UAT (fake funds) | `https://api.uat.udx.underdogsports.com/` | `wss://api.uat.udx.underdogsports.com/ws` |

Docs: `https://docs.underdogexchange.com` (also `/llms.txt`, `/llms-full.txt` 1.1 MB, `/openapi.yml`, `/asyncapi.yml`, `/changelog/rss.xml`). Send `UDX-Version: 2026-07-15` on REST (omitting it selects the oldest supported version); WebSocket subprotocol `udx.json.2026-08-11`. UAT catalog is also keyless (H, GET returned 200).

### 4a. Public REST (OpenAPI `security: [{}, ...]`; each confirmed live on production, H)

| Operation | Path | Notes |
|---|---|---|
| List markets | `GET /markets?status=&type=single_leg\|multi_leg&limit<=100&page=` | Ticker-ascending, `next_page_url` is an opaque cursor, `Cache-Control: no-store`. `status` in `unopened, open, paused, closed, expired` (expired/closed/paused return history; unopened was empty). Full open single-leg crawl: 207 pages, 20,640 markets. |
| Get market | `GET /markets/{ticker}` | `{market:{description, expires_at, external_ids, maximum_price, minimum_price, status, tick_size, ticker}}` (+ `legs` for combos). **No volume, OI, last price or result fields.** |
| Order book | `GET /markets/{ticker}/orderbook?depth=` | L2 snapshot `{orderbook:{ticker, bids:[[price,qty]], asks:[[price,qty]]}}`, decimal strings, YES space, best first. |
| Market trades | `GET /markets/{ticker}/trades?limit=` | `{trades:[{executed_at (6 fractional digits UTC), price, quantity, taker_side, ticker, trade_id}], next_page_url}`, newest first. |
| All trades | `GET /trades?executed_at_or_after=&executed_at_or_before=&limit=` | Global tape across every market; one call covers all venues' liquid books. |
| Candlesticks | `GET /markets/{ticker}/candlesticks?period_interval=1m\|1h\|1d&period_ended_after=&period_ended_before=` | `{candlesticks:[{period_ended_at, open, high, low, close, volume, trade_count}]}`. The earlier sibling note reported HTTP 500 for timestamps without fractional digits; **I could not reproduce it** (200 with `...T03:00:00Z`), treat as intermittent and prefer six digits. |

Everything else (orders, portfolio, accounts, grants, transfers, RFQs, quotes, users, api_keys, `rate_limit_profile`) needs a signed key or bearer token; unauthenticated `GET /orders` returns `401 application/problem+json` type `urn:udx:problem:invalid-authentication-credentials` (fixture). Errors are RFC 9457 with `urn:udx:problem:*` types.

**Resolution / outcome data is not in the public API (H).** `Market` has no result field; `expired` means trading ended, not settled. The only place a result appears is the authenticated per-account `Settlement` object: `market_result` in `yes | no | void` ("void means the market settled at a partial value rather than YES or NO"). A resolution check must therefore come from another venue's result or a sports-data source, not from UDX.

### 4b. WebSocket (H, AsyncAPI 2026-08-11)

- **Needs an API key with `read` scope even for public market data** (docs "Authentication": "The key must have the `read` scope. A key without it receives `403`"). AsyncAPI production server security is `signedApiKey`.
- Channels: `orderbook` (L1/L2/L3, snapshot then sequenced updates, `snapshot` command to re-baseline), `market_lifecycle` (change-only: created/opened/paused/closed/expired/deleted/metadata_updated), private `orders`/`fills`, `rfqs`, `quotes`. No public trades or ticker channel; "no catalog read" over WS, seed from REST. No session resume; server pings every ~30 s (answer pongs); close codes 1001, 1012 (events not replayed), 4001, 4003 (slow consumer).
- FIX: the glossary says the terms are shared "across REST, WebSocket, and FIX", but no FIX spec is published (NOT FOUND: searched llms.txt page list, docs sitemap).

### 4c. Authentication (H, docs "Authentication"; read only, no key created)

Headers `UDX-Access-Key`, `UDX-Access-Timestamp` (Unix ms, within 30 s), `UDX-Access-Signature` = base64 of **RSA-PSS / SHA-256 / 32-byte salt** over `timestamp + METHOD + path + bodyHash + idempotencyKey` (path without query; `bodyHash` = lowercase hex SHA-256 of the exact body bytes, empty string if no body). WebSocket signs `timestamp + GET + /ws` once at upgrade. Key is an RSA 2048-4096 bit keypair; the exchange stores only the public key. Scopes: `read`, `trade`, `funds:transfer`, `accounts:manage`, `keys:manage`, `grants:manage`, `users:manage`. Interactive sessions use `Authorization: Bearer`.

### 4d. Rate limits (H)

- Member-wide buckets `read`, `write`, `cancel`, shared across all keys/users/connections; headers `RateLimit-Policy` / `RateLimit`; `429` + `Retry-After`; `GET /rate_limit_profile` (authenticated) gives the member's capacities (NOT FOUND for numbers, they are only returned to a member).
- **Unauthenticated callers share a per-client limit.** Every public response carried `RateLimit-Policy: "read";q=8;w=2` and `RateLimit: "read";r=7;t=1`, i.e. 8 tokens refilling in 2 s, about 4 requests per second if each request costs one token (cost for public calls not stated; "per client" is not defined, NOT FOUND). My 207-page crawl at 0.5 s spacing (429s were counted: zero) plus about 100 other requests (64 book reads at 0.5 s spacing and some bursts; those scripts retried silently and did not log 429s) showed no failures. Public 429 type: `urn:udx:problem:unauthenticated-rate-limit-exceeded`.
- Public reads worked from a non-US network (served by a non-US Cloudflare edge), so the data API is not US-geofenced for reads (H, one vantage point only).

### 4e. Official end-of-day files (H; the only public OI and per-market daily volume)

Linked from `https://data.underdogexchange.com/` ("Market Data"), unauthenticated, T+1 morning UTC:
- `https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json` (18 KB): daily 2025-08-01..2026-10-17, `metrics.notional`, `notional_udx`, `notional_other_exchange` (USD millions), `transactions` (thousands).
- `https://cftc-public-reports.underdogfantasy.com/manifest.json` (127 KB) -> `/reporting/market_data_YYYY-MM-DD.json(.gz)` (per ticker `open_interest, daily_volume, block_volume, high, low (whole cents), status "Finalized"`; 227,133 rows, 4.5 MB gz for 2026-10-17) and `trade_data_YYYY-MM-DD.json(.gz)` (every print; 426,420 rows for 2026-10-17). Newest entry first in the manifest; early dates are `published_with_warnings` with zero rows.
- The data page defines "Notional volume is contracts traded x $1 face value" (H). So "$108M" is 108M contracts, not dollars paid.
- EventTracker's coverage table lists "Underdog UDX" as Daily, with Now/Prices/Volume/OI ticked and Depth not (H, https://eventtracker.ai/coverage): it consumes these EOD files, not the live API.

---

## 5. Trade path

**Programmatic order placement exists and is documented, but only for an onboarded member holding a user-owned RSA API key (H).**

- `POST /orders` `{ticker, client_order_id, side buy|sell, quantity, price, time_in_force, post_only?, account_id?, self_trade_prevention_type?}`; `price` is the **YES price regardless of side**. Writes answer `202 Accepted`; the outcome is asynchronous (poll `GET /orders/{id}`, or private WS `orders`/`fills`). Also `POST /orders/{id}/amend`, `DELETE /orders/{id}`, bulk `DELETE /orders`, `UDX-Idempotency-Key` (part of the signed message). Enumerated rejections: `insufficient_funds`, `market_closed`, `post_only_would_cross`, `self_trade_prevented`, `price_out_of_bounds`, `rate_limited`, ...
- **Getting a production key is not documented.** Docs only say "Create your first key in the UDX UAT app" (`app.uat.udx.underdogsports.com`) and "The exchange assigns the first user's scopes during onboarding". Rulebook 5(b)(ii): the Participant API requires executing "such agreements as Underdog Exchange requires" and meeting "financial minimums, volume minimums, technical competency, and capacity restrictions"; the ISV "Exchange Programming Interface" needs ISV agreements. Individual-trader eligibility, minimums and the production key flow: NOT FOUND (searched: all 26 docs pages via llms-full.txt, Terms, Participant Agreement, Rulebook).
- **Account prerequisites (H, Terms s.1 "Registration"):** "you must have and maintain an account with Underdog Sports, LLC d/b/a Underdog Fantasy (a 'Linked Underdog Account')"; KYC; 18+; located in an operating state; USD ACH funding.
- UAT exists with fake funds, so a trade adapter can be built and tested end to end by a human who creates a UAT key. I did not create one.

---

## 6. PayBox reachability

**paybox_reachable = partial: read yes, trade no.**

- **Trade: no.** No chain, no token, no on-chain collateral. The credential is an RSA-PSS signing key; a PayBox EVM or Solana wallet cannot produce it, and there is no transaction proposal or EIP-712 order to sign. Per the repo's PayBox note (`docs/research/06-paybox-platform.md`, M) plugin sandboxes can inject only static owner-level brokered headers, no per-request signature, and each call is a fresh 10 s sandbox. Funding is barred from crypto. Driving a human's KYC'd account from a shared plugin would also conflict with the Terms (section 9).
- **Read: yes (M).** The public GETs are plain HTTPS to `api.underdogexchange.com`; a plugin with that host allow-listed, or any server, can call them. WebSocket needs a key and is unsuitable for a stateless plugin.

---

## 7. Fees (H, UDX Fee Schedule effective 2026-10-09 10:00 ET; PDF bytes hash-matched to the prior extract)

- **Taker:** `Fees = Round(0.07 x C x P x (1-P))` dollars; P in dollars, C contracts; round to the nearest cent, exact halves to the nearest even cent. At P = 0.50: 1.75 cents per contract (3.5% of premium); at 0.20 or 0.80: 1.12 cents.
- **Maker** (resting order that later trades): `Round(0.0175 x C x P x (1-P))`; no fee for cancelling.
- **`ENTITYCOMBO` maker:** uses the taker formula (0.07).
- Rounding is per trade and C may be 0.01, so small fills round to $0.00 or $0.01; model fees per fill.
- Market makers may receive "discounts on fees, rebates on fees, revenue share" (Participant Agreement, M from prior pass). Amounts confidential.
- Charged by the exchange to the trader; no gas or chain fee. Deposits are ACH; withdrawals "alternate methods may incur additional fees" (Rulebook 5(i), prior pass, M). Whether the UDM FCM commission ($0.01 per contract per side in the UDM schedule, M) applies to UDX orders: NOT verified.
- Round-trip rule of thumb at P = 0.50: crossing the ask costs about half the 3c spread (1.5c) plus 1.75c fee, about 3.3c per contract from mid, before the other leg's costs.

---

## 8. Resolution mechanism and dispute risk

- Each market's `description` is the resolution text ("Resolves Yes if ... during the full duration of the game / entire game, including regulation time and any officially designated overtime periods ... originally scheduled for 8:20pm ET on October 18, 2026"). Settlement data source: NOT FOUND (searched: market descriptions, rulebook, docs, Terms). Postponement, cancellation, void, retirement and walkover handling are not stated in descriptions (a substring scan of the 20,091-market crawl in the earlier pass found none; I did not repeat it on the 20,640 set, M). Rulebook Rule 11 "Contract Specifications" is a generic stub; no per-sport spec found.
- **Exchange-controlled and discretionary (H, Rulebook Rule 5(a)):** UDX may "designate a new Underlying ... and ... change any associated Contract Specifications or Rules after the first day of trading" (5(a)(iv)); and "Prior to Settlement of any contract, Underdog Exchange may, at its sole discretion, initiate a review ... by the Settlement Committee ... will have full discretion to resolve the market or contract outcome and shall be considered final" (5(a)(v)). `void` is a defined settlement outcome (partial value). Participant disputes go to arbitration (Rule 9-10, prior pass, M).
- Credit risk is the DCO (fully collateralised, segregated bank accounts): low. **Rule-set risk is high and basis risk vs Kalshi / Polymarket US on the same game is real** (overtime, 1H definitions, "originally scheduled", postponement). Treat every cross-venue pair as "related" until a human approves a rules diff.
- No on-chain oracle and no UMA-style dispute window.

---

## 9. Geo, ToS, automation

- **US only, 18+, state-limited (H/M).** Terms "Location": services "are intended for jurisdictions in which Underdog Exchange operates"; location by GPS/IP; "connection methods or systems that mask your location, such as a virtual private network" can block access (H). `/predict` page: "Must be 18+ and present in a state where Underdog Predict operates" and "Must be a U.S. resident" (H, fetch-tool summary). State list: NOT FOUND (searched: exchange page, predict page, Terms, docs). Press says unavailable in 13 jurisdictions including Nevada and D.C. (gaming.net, AI-bylined, M/L; sibling note found conflicting 31/35/37/38 counts, L).
- **Automation (H, Terms prohibited conduct item 9, verbatim):** "scrape, access, monitor, index, frame, link, or copy any content or information on the Services by accessing the Services in an automated way, using any robot, spider, scraper, web crawler, or using any method of access other than manually accessing the publicly-available portions of the Services through a browser or accessing the Services through any approved mobile application, application programming interface, or client application". Item 10 bars bypassing access limits. Participant Agreement prohibited use (d): no automated software to "scrape or extract data from the Website, or otherwise to 'crawl' or 'spider' any portion of the Exchange or its website".
  - Reading (M, my interpretation, not legal advice): the documented REST API is the "approved ... application programming interface", and the docs publish the public endpoints as keyless, so polling them within the stated limit is approved use; scraping the web app is not. The docs site `robots.txt` allows all with `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (applies to the docs only); `api.underdogexchange.com/robots.txt` is 404.
- Market data redistribution, commercial reuse, arbitrage, multi-account and bonus rules: nothing found (NOT FOUND, searched: Terms, Participant Agreement, Rulebook excerpts, docs). A hosted multi-user product that republishes UDX data should get written confirmation.
- Market makers get structural advantages (cancel-on-disconnect, throughput) and "may be required, during specific times, to maintain a maximum spread size and ... a minimum depth within the spread"; "pricing and liquidity outside of the required times may be worse" (Participant Agreement, H). Expect wider books off-hours.
- Hours: 24/7 for most markets unless a market's rules say otherwise (exchange holidays-and-hours page, prior pass, M); halts possible: "a market may be paused or halted for trading" (Rulebook, Contract Specifications (c) "Halted Markets", H).

---

## 10. Liquidity (all dated)

| Metric | Value | Source (tag) |
|---|---|---|
| UDX cumulative notional (contracts x $1), since 2026-07-17 | $2,008.9M | overview JSON, data through 2026-10-17 (H) |
| UDX last 30 days / last 7 days | $1,304.1M / $391.0M; daily 97.3, 32.2, 35.7, 33.8, 44.2, 39.4, 108.4 | same, computed (H) |
| UDX by month | Jul (from 17th) $9.9M; Aug $347.3M; Sep $721.7M; Oct 1-17 $930.0M | same (H) |
| Underdog routed to other exchanges (Kalshi/CDNA), last 30 days | $612.5M (not UDX, not in the UDX API) | same (H) |
| 2026-10-17 (Sat, college football) | volume 108.45M contracts, OI 39.26M; combos 87.40M volume (80.6%), 35.84M OI; single-leg 21.05M volume, 3.42M OI (OI is after that day's finished games settle) | `market_data_2026-10-17.json.gz`, 227,133 rows, recomputed (H) |
| 2026-10-17 top single-leg families by volume | NCAAF game winner 9.69M, spread 3.06M, total 1.45M, WTA match 0.99M, ATP challenger 0.57M, ATP 0.51M, UFC 0.49M, NHL 0.42M, WNBA 0.35M, EPL 0.23M, NFL 0.21M | same (H) |
| Open single-leg catalog, 2026-10-19 | 20,640 markets, 250 ticker families: NCAAF 6,176; NBA 4,155; NFL 3,481; NHL 1,275; ATP 607 (+152 challenger); WTA 574; UCL 357; Liga MX 354; MLS 349; Serie A 333; La Liga 329; EPL 306; MLB 274; Ligue 1 254; Bundesliga 249; UEL 249; WNBA 245; EFL L1 224; UFC 80; CS2 50; plus Saudi Pro, Argentina, Colombia, Brazil, Libertadores/Sudamericana, ITF | own crawl (H) |
| Live book depth, 64 books (2 soonest-expiring win markets in each of 32 league prefixes), 2026-10-19 ~02:48Z | 44 two-sided (20 empty: finished, in play or 3+ days out); **median spread 0.03 (0.01-0.06)**; median premium within 5c of best: ~$3.4k bid / ~$3.0k ask; best NFL book (in play) ~$21.8k bid and $6.5k-$154k ask within 5c | REST `/orderbook`, computed (H; fixture) |
| Live NFL moneyline, DAL v GB, in play | 1-minute candles 02:01-02:05Z: 50-59 trades and 13.6k-24.9k contracts per minute | REST candlesticks (H) |
| Same-moment cross-check, NBA BOS v DET (2026-10-19 02:51Z) | UDX BOS 0.50 (1,500) / 0.54 (1,529), DET 0.47 / 0.51; Kalshi BOS 0.51 (10,648) / 0.52 (16,110), DET 0.48 / 0.49 | UDX orderbook + Kalshi public GET (H, single observation) |

Interpretation (M): UDX is re-homing Underdog's own parlay-heavy retail flow from Kalshi/CDNA onto its own book (cumulative "other exchange" $5.58B vs UDX $2.01B; last-30-day other $612M vs UDX $1,304M). Single-leg depth is real but thin versus Kalshi, and the quotes are market-maker style. An `open` market does not mean a quote exists (finished games stay `open` until trading ends; finished tennis shows `closed`, one stale ATP Challenger from 2026-10-12 shows `paused`). Gate on a two-sided non-empty book.

---

## 11. Event overlap and shared liquidity

- **Overlap (arbitrage-relevant): sports only.** NFL, NCAAF, NBA, WNBA, NHL, MLB (game, innings, props), ATP/WTA/ITF tennis, UFC, CS2, soccer (EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, UCL, UEL, EFL, Saudi Pro, Argentina, Brazil, Colombia, Libertadores/Sudamericana). Types: game/match winner (soccer incl. a DRAW binary), spread, total, team total, 1H/2H/quarter/period variants, BTTS, player props (points, rebounds, assists, threes, passing/rushing/receiving yards, TD, shots on goal, goals, sacks), overtime, plus combos. **No politics, macro, crypto-price or weather markets** (H: 0 keyword hits for election/president/senate/bitcoin/fed/cpi/weather/crypto across all 20,640 descriptions). A handful of non-game oddities with ~0 volume: MLB CBA, MLB 2027 season start, NBA Las Vegas expansion, NFL team sale price.
- **Shared liquidity:** UDX single-leg books are an **independent leg** relative to Kalshi, Crypto.com Derivatives NA and Polymarket US (separate DCM/DCO, own CLOB; H for structure). Price independence is M: the same professional market makers can quote on several venues, and the one cross-check above shows prices tracking Kalshi within about 1-2 cents. **Not independent:** Kalshi/CDNA contracts offered inside the Underdog app (UDM FCM) are those exchanges' own books and are absent from the UDX API and EOD reports. Combos have no counterpart elsewhere except as synthetics of legs.

---

## 12. Adapter spec (if built)

**Read adapter (P1):**
1. **Catalog:** every 60-300 s walk `GET /markets?status=open&type=single_leg&limit=100` (about 207 pages; at 0.5 s spacing about 105 s), follow `next_page_url` as given; keep `{ticker, description, expires_at, status, external_ids.optic_odds, tick_size}`. Skip `UDXCOMBO` and `UDXNFLSWPP` for plain-leg linking. Optionally add the key-gated WS `market_lifecycle` later.
2. **Link:** parse ticker + description into `{league, marketType, away, home, kickoffET, outcome|line, period}`; join to Kalshi / Polymarket US by league + date + team/player + line + period; mark pairs "related" until a rules diff is approved.
3. **Prices:** `GET /markets/{ticker}/orderbook?depth=5` for the linked subset only, budget well under 4 req/s; keep decimal strings; compute best bid/ask, spread, premium within 5c; treat empty or one-sided books as no quote. Use `GET /trades?executed_at_or_after=` as one cheap global tape for freshness.
4. **Edge math:** add taker fee `0.07*P*(1-P)` per contract (round per fill) to any UDX taker leg; require edge above half-spread plus fee.
5. **Volume / OI:** candlestick volume (live) and the T+1 EOD files (per-ticker OI and daily volume; poll `manifest.json` after ~09:10 UTC).
6. **Flags:** `liquidity_class = live-orderbook`, `tradable_by_paybox = false`, `independent_of = [kalshi, crypto.com-cdna, polymarket-us]`, `us_only = true`, `fee_model = quadratic_0.07_taker_0.0175_maker`, `resolution_visible_publicly = false`.

**Trade adapter (only for a US-eligible human who opts in; not via PayBox):** build against UAT; RSA-PSS signer as in 4c; `POST /orders` then poll or private WS; honour asynchronous-write and idempotency rules; keep the private key out of model context. Production eligibility is an open question.

---

## 13. Differences from the sibling UDX notes

- Re-verified independently: platform-overview numbers; 2026-10-17 EOD totals (227,133 rows; 108,449,635 contracts; OI 39,259,023; combo share 80.6%); fee formulas; Terms and Participant Agreement quotes; rulebook v1.4 clauses; rate-limit headers; public/auth split of the OpenAPI operations.
- Updated numbers: open single-leg catalog is 20,640 markets / 207 pages now (sibling: 20,091 / 201), and 20,629 carry `optic_odds` ids (sibling: 20,080); my 64-book sample gave median spread 0.03 (sibling 36 books, also 0.03).
- Not reproduced: the candlestick HTTP 500 on whole-second timestamps.
- New here: same-moment Kalshi comparison, `UDXNFLSWPP` product, `expired/closed/paused` history via the `status` filter, "no public result field" finding, and the market-maker max-spread disclosure.
- The `underdog-predict-underdog-exchange-udx.md` priority (P2) and "no live API" statements should be treated as superseded.

---

## 14. Fixtures (`docs/research/fixtures/underdog-udx/`, all <= 50 KB)

| File | What |
|---|---|
| `rest_GET_markets_status-open_type-single_leg_limit-3_2026-10-19.json` | verbatim catalog page (`external_ids`, `next_page_url`) |
| `rest_GET_markets_ticker_NFL-DAL_2026-10-19.json` | verbatim single market |
| `rest_GET_orderbook_NFL-DAL_depth-10_2026-10-19.json`, `..._NFL-GB_...json` | verbatim L2 books of both sides of one game |
| `rest_GET_market_trades_NFL-DAL_limit-5_2026-10-19.json`, `rest_GET_trades_global_limit-20_2026-10-19.json` | verbatim trade prints |
| `rest_GET_market_candlesticks_NFL-DAL_1h_...json`, `..._1m_...json` | verbatim OHLCV candles |
| `rest_GET_markets_type-multi_leg_limit-2_2026-10-19.json` | verbatim combo markets with `legs` |
| `rest_GET_orders_unauthenticated_401_2026-10-19.json`, `rest_response_headers_GET_markets_2026-10-19.txt` | problem+json 401; rate-limit headers (cookie header removed) |
| `derived_catalog_counts_single_leg_open_2026-10-19.json` | counts from my crawl (derived) |
| `derived_orderbook_sample_64_markets_2026-10-19.json` | spread/depth rows for the 64-book sample (derived) |
| `derived_crosscheck_udx_vs_kalshi_NBA-BOSDET_2026-10-19.json` | top-of-book comparison (derived; Kalshi levels derived from its public book) |
| `eod_platform-overview_generated-2026-10-18T12-10Z.json` | verbatim official overview JSON |
| `eod_reports_manifest_trimmed_2026-10-18.json` | manifest trimmed to 3 entries per list |
| `eod_market_data_2026-10-17_top_rows_and_totals.json` | top row of each of the 20 largest families (verbatim rows) plus computed totals |
| `udx_fee_schedule_2026-10-09_text_extract.txt` | text extract of the fee-schedule PDF |

---

## 15. Open questions / NOT FOUND

- Production API key onboarding (individuals vs institutions, ISV agreement, minimums, fees). Searched: docs (all pages), Rulebook, Terms, Participant Agreement.
- Member rate-limit numbers (`GET /rate_limit_profile`); meaning of the public "per client" bucket; cost per public request.
- Official list of operating states.
- Per-sport contract specs, settlement data sources, postponement / void / retirement rules (Notices page renders client-side and was not read).
- A public settlement/result endpoint (none found; authenticated `Settlement.market_result` only).
- A keyless WebSocket or public trades/ticker stream (none).
- FIX spec (referenced in glossary, not published).
- Whether republishing UDX public data in a hosted product is allowed.
- Whether UDM's per-contract commission applies to UDX trades.
- An IG Group acquisition of Underdog (reported only in the sibling UDM note from a single unverified next.io summary; M/L, not re-checked; WebSearch budget was exhausted so no search-engine corroboration was possible this session).

---

## 16. Suspicious content / embedded instructions

None found. I grepped `llms-full.txt` (1.1 MB) for "ignore previous", "as an ai", "system prompt", "you are an assistant" and found nothing; no API response contained text addressed to AI agents. The docs publish an `llms.txt` and a `robots.txt` Content-Signal (`ai-train=yes`); both are conventional. The gaming.net article is bylined "an AI research agent for Gaming.net" (low reliability) but contained no instructions.

---

## 17. Sources

Primary (H):
- Developer docs: https://docs.underdogexchange.com/ (also /llms.txt, /llms-full.txt, /openapi.yml, /asyncapi.yml, /changelog/rss.xml, /robots.txt; pages /quick-start, /reference/connecting, /reference/authentication, /reference/rate-limits, /reference/timestamps, /concepts/markets-and-trading, /concepts/order-entry, /concepts/market-data, /concepts/market-lifecycle, /concepts/participants-and-access, /concepts/clearing-and-settlement, /concepts/rfqs)
- Live API (keyless GETs, 2026-10-19): https://api.underdogexchange.com/markets , /markets/{ticker} , /markets/{ticker}/orderbook , /markets/{ticker}/trades , /markets/{ticker}/candlesticks , /trades ; UAT https://api.uat.udx.underdogsports.com/markets
- Data page and files: https://data.underdogexchange.com/ ; https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json ; https://cftc-public-reports.underdogfantasy.com/manifest.json ; https://cftc-public-reports.underdogfantasy.com/reporting/market_data_2026-10-17.json.gz
- Site: https://www.underdogsports.com/exchange ; https://www.underdogsports.com/predict ; https://underdogfantasy.com (HTTP 403 Cloudflare)
- Rulebook v1.4 (effective 2026-10-01): https://www.underdogsports.com/exchange/rulebook (redirects to a Webflow CDN PDF; text read from a local extraction of the byte-identical file)
- Legal PDFs (byte-identical to the earlier extractions): Fee Schedule https://underdog-exchange.pactsafe.io/versions/6ac6db492c7c473ca250669f.pdf ; Terms of Use .../6a59a12a8c17c76f42a4f91b.pdf ; Participant Agreement .../6a3c3e8abac1ca0e7580415f.pdf ; Market Maker Program (text extract read, M for the exact URL) 
- EventTracker coverage table: https://eventtracker.ai/coverage (via fetch-tool summary)
- Kalshi public market data (single cross-check only): https://api.elections.kalshi.com/trade-api/v2/markets , /markets/KXNBAGAME-26OCT20BOSDET-BOS/orderbook

Secondary (M/L):
- https://www.gaming.net/underdog-takes-its-prediction-market-fully-in-house/ (2026-07-20, AI-bylined; via fetch-tool summary)
- Repo notes: `docs/research/venues/underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc.md`, `docs/research/venues/underdog-predict-underdog-exchange-udx.md`, `docs/research/venues/underdog-predict-udm-llc-fcm.md`, `docs/research/06-paybox-platform.md`
- WebSearch was not usable (shared budget exhausted), so there is no search-engine discovery or corroboration in this note.
