# Underdog Exchange (UDX; Aristotle Exchange DCM, Inc. / DCO, Inc.) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (machine clock was ~02:00-02:30 UTC on 2026-10-19, i.e. the evening of 2026-10-18 in US Eastern). READ-ONLY: official docs, public legal PDFs, and unauthenticated GETs to documented hosts (`api.underdogexchange.com`, `api.uat.udx.underdogsports.com`, `docs.underdogexchange.com`, the two public data hosts). No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party text was treated as untrusted data and nothing in it was followed. Scripted requests used the generic User-Agent `insurance-markets-research/0.1` only.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a fetch-tool page summary, a sibling research note, or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" where nothing was found. Nothing in this note is older than 6 months except where flagged.

Fixtures: `docs/research/fixtures/underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc/` (section 16).

---

## 0. Bottom line

1. **Live, and bigger than the exchange landing page suggests.** UDX went GA 2026-07-17 (Underdog's own data JSON) and a live NFL game was trading every second at 02:17 UTC on 2026-10-19 (H, `GET /trades`). UDX printed $2.0B notional since launch, $1.30B in the last 30 days, $108.4M on the 2026-10-17 peak day (H, official data JSON generated 2026-10-18).
2. **Correction to the earlier sibling note (`underdog-predict-underdog-exchange-udx.md`): there IS an official, documented, public API.** `https://docs.underdogexchange.com` (not linked from the exchange landing page) publishes OpenAPI 3.1 (REST, version 2026-07-15) and AsyncAPI 3.0 (WebSocket, version 2026-08-11) specs, a UAT environment, and states "The market catalog is public". I confirmed with unauthenticated GETs against **production** that market catalog, per-market order book (L2), recent trades, global trades and candlesticks all work with no key (section 4). The sibling note says "NOT FOUND ... no usable public live API" and ranks P2; that conclusion should be revised (its EOD-file findings remain correct and are complementary).
3. **Independent order book.** UDX runs its own CFTC-regulated DCM + DCO with its own central limit order book (H, rulebook). It is a separate leg from Kalshi, Polymarket US and Crypto.com. Kalshi/CDNA contracts shown inside the Underdog Predict app are NOT part of UDX and are not in the UDX API (M, sibling note + press).
4. **Sports only, and combos dominate volume.** All ~20,100 open single-leg markets I enumerated are sports (NCAAF, NBA, NFL, NHL, tennis, soccer, MLB, WNBA, UFC, CS2). About 81% of 2026-10-17 notional was `UDXCOMBO` multi-leg contracts (H, computed). Overlap with Kalshi / Polymarket US exists for single-leg game winner / spread / total / player props.
5. **Quoted prices are market-maker style: median spread 3 cents, ~$3k of premium within 5 cents on each side** across 30 liquid books I sampled (H, section 10). Plus a taker fee of `0.07 x P x (1-P)` per contract. Intra-venue two-way sums are ~1.01-1.05 on the ask side, so this is a poor venue for pure arb and a good independent price signal.
6. **Trading is out of reach for PayBox.** USD only (crypto deposits barred), KYC'd US participant with a linked Underdog Fantasy account, state geofence, RSA-PSS request signing with a user-held API key. No chain, no wallet signature, no token. Reads are reachable (public GET).
7. **adapter_priority = P1.** Cheapest high-quality sports read adapter I have seen so far: keyless REST, documented schema, independent book, live. Not P0 because it is sports-only, quotes are wide MM quotes, public REST is rate-limited (~4 req/s per client), WebSocket needs an API key, and nothing can be traded from PayBox. Upgrade to P0 only if the operator is a US-eligible person willing to hold a UDX account and trade by API against Kalshi.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.underdogexchange.com/markets/UDXNFLGAMEWIN_DALGB26OCT182020_DAL/trades?limit=5` | Five prints within 4 seconds, newest `executed_at` 2026-10-19T02:13:24.202979Z | H |
| `GET /trades?limit=3` (global) | Prints at 02:17:25Z across a single-leg, a player prop and a `UDXCOMBO` | H |
| 1-minute candlesticks, same market | 31-62 trades and 3,084-8,102 contracts per minute during the live game | H |
| `https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json`, `Last-Modified: Sun, 18 Oct 2026 12:10:22 GMT`, `data_through_date_et` 2026-10-17, `highlights.udx_ga_date` "2026-07-17" | Live daily-updated metrics | H |
| Rulebook "Underdog Exchange DCM, Inc. and Underdog Clearinghouse, Inc.", Version 1.4, "Effective as of October 1, 2026" | Current rulebook | H |
| UDX Fee Schedule "Effective Friday, October 9, 2026, at 10:00 a.m. Eastern Time" (entity "Aristotle Exchange DCM, Inc.") | Recent rule activity | H |
| Docs site `last-modified` 2026-10-16 (llms.txt/index); REST changelog 2026-07-15, WebSocket changelog 2026-08-11 | Maintained | H |
| `underdogsports.com/exchange/` loads; `underdogexchange.com` 301 -> `/exchange/` | Live | H |
| Press: self-certified first seven contracts 2026-07-15; launched 2026-07-18; Aristotle DCM/DCO acquired March 2026; Aristotle's DCM was designated by the CFTC in September 2025 (the last is >6 months old) | Consistent | M (predictionauthority.com, gaming.net, via fetch-tool summaries) |

Verdict: **still_live = true.**

Naming mess to handle in code and UI: the legal documents mix "Aristotle Exchange DCM/DCO, Inc." (site footer, fee schedule, Terms, Participant Agreement) with "Underdog Exchange DCM, Inc. / Underdog Clearinghouse, Inc." (rulebook v1.4). Same venue. The rulebook URL `underdogsports.com/exchange/rulebook` 301s to a Webflow CDN PDF whose filename says "Effective as of 7-30-26" but whose first page says October 1, 2026 / v1.4, so the file is replaced in place (H).

---

## 2. Kind and market model

- **Kind (H):** CFTC-regulated, fully collateralised event-contract exchange: a Designated Contract Market and a Derivatives Clearing Organization, "exclusively self-cleared" (Rulebook 5(h)(i)), direct participation by retail and institutions. Parent operates a separate FCM (UDM, LLC, "Underdog Predict") that routes to other exchanges; rulebook 4(a)(i) bars FCMs/IBs from submitting UDX trades on behalf of customers, so UDM is not a UDX router (H for the rule, M for my reading).
- **Contract (H, docs "Markets and Trading"):** binary. "A winning contract settles to $1.00. A losing contract settles to $0.00." **Only the YES contract is traded**; "There is no separate NO contract. Buying NO at $0.40 is economically equivalent to selling YES at $0.60." Positions are a signed net YES quantity per account and market.
- **Prices / sizes (H):** decimal strings in dollars in YES price space, `tick_size` "0.001" (deci-cents), `minimum_price` "0.001", `maximum_price` "0.999" on all 20,091 open single-leg markets I read; quantity with at most two decimals (smallest order 0.01 contract). Docs: "never assume whole cents".
- **Matching (H, Rulebook Rule 5(c) and docs "Order Entry"):** central limit order book, price-time priority. Time in force `gtc | day | ioc | fok`, `post_only`, self-trade prevention (`placed` default or `resting`; "cannot be disabled"). RFQ/quote workflow for large sizes with "last look" for makers. Amend keeps queue priority only if quantity decreases at the same price. Not an AMM, not parimutuel.
- **Structure:** series -> event -> market. A "categorical" event is several independent binaries, each with its **own order book** (e.g. a soccer 1X2 is `..._HOME`, `..._AWAY`, `..._DRAW`; a two-team game winner is two books, one per team). There is no complementary-book coupling, so the two-way sum of asks/bids is a real, observable number (section 10).
- **Multi-leg ("combo") markets (H):** `type=multi_leg`, ticker `UDXCOMBO-<numeric id>`, `legs: [{ticker, outcome: yes|no, external_ids}]` (2 to at least 8 legs seen), its own book. Fee schedule has a separate maker formula for `ENTITYCOMBO` "Will all of <components> occur".
- **Ticker grammar (M, inferred from ~20k tickers; HHMM is US Eastern):** `UDX{LEAGUE}{MARKETTYPE}_{AWAY}{HOME}{YY}{MON}{DD}{HHMM}_{OUTCOME|LINE}`, e.g. `UDXNFLGAMEWIN_DALGB26OCT182020_DAL`, `UDXNBASPREAD_...`, `UDXATPMATCHWIN_ACOTIR26OCT190200_FACOSTA`. Player props append a player slug before the line (`UDXNFLPASSYDS_DALGB26OCT182020JORDANLOVE_249.5`). Do not rely on the grammar for linking where `external_ids` exist.
- **Outcome tokenisation:** none on-chain. Positions are rows in the DCO's participant account; off-exchange transfer of positions is prohibited (Rulebook 7(g), H).
- **Provider identifiers (H):** each market carries `external_ids.optic_odds = {fixture_id, market_id, team_id | player_id}` (20,080 of 20,091 open single-leg markets; 11 had none). Docs: "Use it to join UDX markets onto a provider's feed instead of matching on tickers or descriptions." Optic Odds is a third-party odds data vendor; none of the other venues in this project expose its ids, so cross-venue linking still has to be league+date+team/player+line (and period: `1H`, `2H`, `1Q`...).

---

## 3. Chains and collateral

- **No blockchain involved (H).** Collateral is **USD cash** held by the Clearinghouse at a settlement bank, segregated: "Member funds on deposit with UDX are held in segregated bank accounts at Banc of California and are not commingled with UDX operational funds" (UDX "Security of Funds" PDF from the legal center, H). Rulebook 6(c)(i): "All deposits must be made in U.S. dollars. Crypto currencies, foreign currencies, credit card transactions, and securities are not acceptable for deposits." Deposits by ACH/wire/RTP; "available ... no later than three (3) Settlement Bank Business Days" unless advanced.
- Fully collateralised: margin is collected when a position opens; an order that the account cannot fund is rejected `insufficient_funds` (H, docs "Order Entry").
- Accounts: a **member** owns **users** and **accounts**; an API key belongs to a user, carries a subset of the user's scopes, and can be restricted to one account; `POST /portfolio/transfers` moves cash only between the member's own accounts (H, docs). There is no deposit or withdrawal endpoint in the REST spec (H, all 45 operations checked).

---

## 4. Read API

**Verdict: `official-public` for market data (REST, keyless); `official-authenticated` for streaming, portfolio and trading.**

Hosts (H, docs "Connecting"):

| Env | REST | WebSocket |
|---|---|---|
| Production | `https://api.underdogexchange.com/` | `wss://api.underdogexchange.com/ws` |
| UAT (fake funds) | `https://api.uat.udx.underdogsports.com/` | `wss://api.uat.udx.underdogsports.com/ws` |

Docs: `https://docs.underdogexchange.com` (also `/llms.txt`, `/llms-full.txt` ~1.1 MB, `/openapi.yml` 228 KB, `/asyncapi.yml` 171 KB, `/changelog/rss.xml`, `/.well-known/api-catalog`). Version selection: REST header `UDX-Version: 2026-07-15` (omitting it selects the oldest supported version); WebSocket subprotocol `udx.json.2026-08-11`.

### 4a. Public (no auth) REST operations - confirmed live against production (H)

| Operation | Path | Notes |
|---|---|---|
| List markets | `GET /markets?status=open&type=single_leg\|multi_leg&limit=<=100&page=<cursor>` | Ordered by ticker ascending; `next_page_url` is an opaque cursor, follow it as given. `status` in `unopened, open, paused, closed, expired`. Served live, never cached. Returned 20,091 open single-leg markets over 201 pages on 2026-10-19. |
| Get market | `GET /markets/{ticker}` | `{market:{description, expires_at, external_ids, maximum_price, minimum_price, status, tick_size, ticker}}` (multi-leg adds `legs`). No volume/OI/last-price fields. |
| Order book (L2 snapshot) | `GET /markets/{ticker}/orderbook?depth=1..1000` | `{orderbook:{ticker, bids:[[price,qty],...], asks:[[price,qty],...]}}`, decimal strings, YES price space, bids high to low, asks low to high. |
| Market trades | `GET /markets/{ticker}/trades?limit=` | `{trades:[{executed_at (µs, UTC), price, quantity, taker_side buy\|sell, ticker, trade_id}], next_page_url}`, newest first. |
| All trades | `GET /trades?executed_at_or_after=&executed_at_or_before=&limit=` | Global tape across markets; works as a live volume feed. |
| Candlesticks | `GET /markets/{ticker}/candlesticks?period_interval=1m\|1h\|1d&period_ended_after=&period_ended_before=` | `{candlesticks:[{period_ended_at, open, high, low, close, volume, trade_count}]}`. **Gotcha:** the same query with timestamps written without fractional digits (`2026-10-18T22:00:00Z`) returned HTTP 500 `urn:udx:problem:internal-error`; with six fractional digits (`...:00.000000Z`) it returned 200 (both saved). Docs say 0-6 fractional digits are accepted, so this is a server bug. Always send 6 digits. |

Everything else (orders, portfolio, accounts, grants, transfers, RFQs, quotes, users, api_keys, rate_limit_profile) requires a signed key or bearer token; an unauthenticated `GET /orders` returns `401 application/problem+json` `urn:udx:problem:invalid-authentication-credentials` (fixture). Errors are RFC 9457 problem details with stable `urn:udx:problem:*` types.

### 4b. WebSocket (H, AsyncAPI 2026-08-11)

- `GET /ws`, auth headers on the upgrade (below); **even market data requires an API key with the `read` scope** (docs: "WebSocket market data requires authenticating with an API key that has the `read` scope"). Not keyless.
- Channels: `orderbook` (per ticker, `level` L1 / L2 default / L3, `depth` 1-100 or "full", default 25; snapshot then sequenced updates, `snapshot` command to re-baseline after a gap), `market_lifecycle` (change-only: `market_created/opened/paused/closed/expired/deleted/metadata_updated`, carries the full market), private `orders`, `fills`, `rfqs`, `quotes`. Commands: subscribe/unsubscribe/snapshot, create/amend/cancel orders, RFQ and quote commands. No trades or ticker channel is listed, and "The WebSocket API has no catalog read": seed the catalog from REST, then follow `market_lifecycle`.
- Session facts: no resume (reconnect, re-auth, resubscribe, rebuild); server pings (answer with pongs, interval undisclosed); close codes 1001 (idle bound), 1012 (restart or lost upstream, events not replayed), 4001 (auth revoked), 4003 (slow consumer).
- The glossary says "UDX uses the same terms across REST, WebSocket, and FIX", but no FIX spec is published (NOT FOUND: the docs sitemap lists 26 non-API-reference pages, none for FIX).

### 4c. Authentication (H, docs "Authentication"; only read, nothing created)

Headers `UDX-Access-Key` (key id), `UDX-Access-Timestamp` (Unix ms, within 30 s of server clock), `UDX-Access-Signature` = base64 of **RSA-PSS / SHA-256 / 32-byte salt** over `timestamp + METHOD + path + bodyHash + idempotencyKey` (path without query; bodyHash = lowercase hex SHA-256 of the exact body bytes, empty string if no body). WebSocket signs `timestamp + GET + /ws` once at upgrade. Key = RSA 2048-4096 bit keypair; the exchange stores only the public key. Scopes: `read`, `trade`, `funds:transfer`, `accounts:manage`, `keys:manage`, `grants:manage`, `users:manage`. Also bearer access tokens for the interactive app.

### 4d. Rate limits (H)

- Shared per **member** across all keys, users and connections: buckets `read`, `write`, `cancel`; headers `RateLimit-Policy: "read";q=<capacity>;w=<refill seconds>` and `RateLimit: "read";r=<remaining>;t=<secs to full>`; `429` + `Retry-After`; `GET /rate_limit_profile` (authenticated) returns the member's capacity and costs. Member capacities: NOT FOUND (they are only returned to an authenticated member).
- **Unauthenticated callers share a separate per-client limit**: observed on every public response `RateLimit-Policy: "read";q=8;w=2` and `RateLimit: "read";r=7;t=1`, i.e. a bucket of 8 tokens refilling in 2 s, about 4 requests per second sustained (assuming 1 token per request; the cost per request is not stated for public calls). What "per client" means (IP?) is NOT FOUND. I made two catalog crawls (80 pages at 0.6 s spacing, then 201 pages at 0.5 s spacing) plus about 55 other requests with no failure observed (my crawler would silently have retried a 429; I did not log whether any occurred). Total load was roughly 340 requests; a production scanner should not repeat full crawls more often than needed.
- WebSocket: each command charges a bucket and weight; `subscribe` costs `1 + 1 per 50 subscriptions` against `read`; errors `rate_limit_exceeded` (with `retry_after_ms`), `capacity_exceeded`, `admission_unavailable`.

### 4e. Official end-of-day files (H, complementary; verified independently of the sibling note)

`https://data.underdogexchange.com/` (linked from the exchange landing page as "Market Data") loads two static hosts, both unauthenticated JSON:
- `https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json` (18 KB; daily series 2025-08-01..2026-10-17: `metrics.notional`, `notional_udx`, `notional_other_exchange` in USD millions, `transactions` in thousands, `highlights`).
- `https://cftc-public-reports.underdogfantasy.com/manifest.json` (127 KB) listing 113 daily reports 2026-06-24..2026-10-17, then `/reporting/market_data_YYYY-MM-DD.json(.gz)` (per-ticker `open_interest, daily_volume, block_volume, high, low, status:"Finalized"`; 227,133 rows / 4.5 MB gz for 2026-10-17) and `trade_data_YYYY-MM-DD.json(.gz)` (every print with `create_ts`, `contracts_traded`, `price` in cents; 426,420 rows / 10.9 MB gz). Published T+1 morning UTC. Several July dates are `published_with_warnings` with zero rows. These are the only source of **open interest and daily volume per market**; the live REST API has neither (only candlestick volume).

---

## 5. Trade path

**Programmatic order placement exists and is documented, but only for an onboarded member holding a user-owned RSA API key.**

- `POST /orders` body `{ticker, client_order_id, side: buy|sell, quantity, price, time_in_force, post_only?, account_id?, self_trade_prevention_type?}`; `price` is the **YES price regardless of side**. Answer is `202 Accepted` with `order_id`; the outcome is asynchronous (poll `GET /orders/{id}` until `resting | filled | rejected`, or use the private `orders`/`fills` WebSocket streams). Also `POST /orders/{id}/amend`, `DELETE /orders/{id}`, bulk `DELETE /orders`; `UDX-Idempotency-Key` header for safe retries (it is part of the signed message). Rejection reasons are enumerated (`insufficient_funds`, `market_closed`, `post_only_would_cross`, `self_trade_prevented`, `price_out_of_bounds`, ...). (H)
- **How to get a key:** the docs only describe creating a **UAT** key in `https://app.uat.udx.underdogsports.com/` ("Create your first key in the UDX UAT app"). A production onboarding or key-issuance procedure, eligibility for individual (non-ISV) accounts, and any financial/volume minimums are **NOT FOUND** in the docs (searched: all 26 non-API-reference docs pages via llms-full.txt). The rulebook (5(b)(ii)) says the Participant API and Exchange Programming Interface are available only after signing "such agreements as Underdog Exchange requires" and meeting "financial minimums, volume minimums, technical competency, and capacity restrictions" (H). The docs' "Participants and Access" says "The exchange assigns the first user's scopes during onboarding" (H).
- **Account prerequisites (H, UDX Terms of Use s.1 "Registration"):** "you must have and maintain an account with Underdog Sports, LLC d/b/a Underdog Fantasy (a 'Linked Underdog Account')", KYC/CIP, 18+, located in an operating state (GPS/IP; VPN masking may block), funded by USD ACH.
- UAT exists with fake funds, so an adapter can be built and tested end to end by a human who creates a UAT key. I did not create one.

---

## 6. PayBox reachability

**paybox_reachable = partial: read yes, trade no.**

- **Trade: no.** No on-chain asset or contract; collateral is USD in a KYC'd account; deposits in crypto are barred; the credential is an RSA-PSS signing key, which an EVM or Solana PayBox wallet cannot produce, and PayBox plugin sandboxes can only inject static, owner-level brokered headers (repo note `docs/research/06-paybox-platform.md`, M), which cannot carry a per-request signature. Auto-driving a human's KYC'd account from a shared plugin would also conflict with the Terms (section 9). No transaction proposal or typed-data order exists to sign.
- **Read: yes.** All market-data GETs are keyless HTTPS GETs to `api.underdogexchange.com`; a PayBox plugin (host allow-listed) or any server can call them (M for the plugin mechanics, H for the keyless GETs).

---

## 7. Fees (H, UDX Fee Schedule effective 2026-10-09 10:00 ET)

- **Taker** (aggressing order): `Fees = Round(0.07 x C x P x (1-P))` dollars; P = price in dollars, C = contracts; round to the nearest cent, exact halves to the nearest even cent. At P = 0.50 that is 1.75 cents per contract (3.5% of premium); at P = 0.20 or 0.80 it is 1.12 cents.
- **Maker** (resting order that later trades): `Round(0.0175 x C x P x (1-P))`; no fee for cancelling.
- **`ENTITYCOMBO`** ("Will all of <components> occur") maker fee uses the taker formula 0.07.
- Rounding is per trade and C may be fractional (0.01 contract), so small fills round to $0.00 or $0.01; model fees per fill, not per notional.
- Market makers may receive "discounts on fees, rebates on fees, revenue share" (Participant Agreement 3(n), H); amounts confidential.
- Fee is charged by the exchange to the trader; there is no gas or chain fee. Deposits/ACH withdrawals: routine ACH withdrawal processed free of stated charge, "alternate methods may incur additional fees" (Rulebook 5(i), H). Whether the Underdog Predict FCM commission (the sibling note reports $0.01 per contract per side, effective 2026-02-12) applies to UDX trades: NOT verified by me (M, applicability unknown).
- Comparison: same quadratic shape as Kalshi's general formula (coefficient 0.07). Round trip cost for a taker both ways at 50c is 3.5c per contract plus the ~3c quoted spread.

---

## 8. Resolution mechanism and dispute risk

- Each market's `description` is the resolution text, always of the form "Resolves Yes if <team/player> ... <full duration of the game / entire fight / originally scheduled for 8:20pm ET on October 18, 2026>". Of the 20,091 descriptions I scanned: "overtime" appears in 4,313, "regulation" in 3,461, "full duration" in 1,588 (overtime treatment is usually explicit, e.g. "during the entire game, including regulation time and any officially designated overtime periods"); none mentions postponement, cancellation, void, walkover, retirement, or a named data source (substring counts for postpon, cancel, void, refund, push, retire, walkover, source are all 0; H, computed from the live catalog). Settlement sources: NOT FOUND (searched: rulebook, market descriptions, docs, Terms).
- Rulebook Rule 11 "Contract Specifications" is a generic stub ("Each Contract will meet such specifications ... as set forth in the Rules governing such Contract"); no per-sport specification document was found (NOT FOUND: legal center, exchange page, notices not read, see section 14).
- **Exchange-controlled and discretionary (H, Rulebook Rule 5(a)):** UDX may designate a new Underlying; "Prior to Settlement of any contract, Underdog Exchange may, at its sole discretion, initiate a review ... by the Settlement Committee ... will have full discretion to resolve the market or contract outcome and shall be considered final." Error trades: participant notifies within 10 minutes; the DCM decides in its "absolute and sole discretion" (5(e), per the sibling note M; not re-read). Disputes between participants and UDX go to JAMS binding arbitration in New York with a class-action and jury waiver (Rule 9-10, H).
- Counterparty risk is the DCO (novation, fully collateralised, segregated bank accounts): low credit risk, high **rule-set risk**. Market `status` carries `paused` and `closed`; the rulebook allows halts (Rule 11(c)); `expires_at` is typically ~4 days after kickoff and `status` stays `open` until trading ends, so an `open` market for a finished game can exist (section 10).
- No on-chain oracle and no UMA-style dispute window. Basis risk vs Kalshi / Polymarket US on the same game: postponement, retirement, overtime and "originally scheduled" wording are unpublished or differ. Treat every cross-venue pair as "related" until a human approves a rules diff.

---

## 9. Geo, ToS, automation

- **US only; 18+; state-limited.** Terms "Location": services "are intended for jurisdictions in which Underdog Exchange operates"; location determined by GPS/IP; "connection methods or systems that mask your location, such as a virtual private network" can block access (H). Official state list: NOT FOUND on the exchange page, Terms or docs. Press says 37 states (not available in 13 jurisdictions, including Nevada and Washington, D.C.) (M, predictionauthority.com 2026-07-19; the sibling note found conflicting 31/35/37/38 counts, L).
- **Automation (H):**
  - Terms prohibited conduct item 9: "scrape, access, monitor, index, frame, link, or copy any content or information on the Services by accessing the Services in an automated way, using any robot, spider, scraper, web crawler, or using any method of access other than manually accessing the publicly-available portions of the Services through a browser or accessing the Services through any approved mobile application, application programming interface, or client application".
  - Participant Agreement prohibited-uses list item (d): no manual or automated software to scrape or extract data from the Website or "crawl or spider any portion of the Exchange or its website".
  - Reading: the documented API is the "approved application programming interface"; the docs explicitly say public REST market data "needs no authentication" and give the endpoints, so keyless reads of those endpoints are approved use (M, my interpretation, not legal advice). Scraping the web app is not.
  - Rulebook: API access needs signed agreements and minimums (5(b)(ii)); UDX "may throttle". Market makers get structural advantages (cancel-on-disconnect, throughput, rebates) disclosed to takers.
- **Redistribution / commercial reuse of market data, multi-account, arbitrage, wash-trade and bonus rules:** no data-licence or arbitrage prohibition found (NOT FOUND: searched Terms, Participant Agreement, Rulebook, docs). Rule 7 prohibits fictitious transactions and off-exchange trading. Linked Underdog account is mandatory. A hosted multi-user aggregator that republishes UDX data should get written confirmation.
- Hours: "Trading is available 24/7 for most markets, unless otherwise noted in a specific market's rules"; halts under the rulebook; holiday hours posted on the Notices page (H, `/exchange/holidays-and-hours`).

---

## 10. Liquidity (all dated)

Volume convention: Underdog's data page defines "Notional volume is contracts traded x $1 face value" (H, fetch-tool summary of data.underdogexchange.com). So $108M notional is 108M contracts, i.e. roughly $40-50M of premium at typical prices (M, my estimate).

| Metric | Value | Source / date |
|---|---|---|
| UDX all-time notional (since 2026-07-17) | $2,008.9M | official overview JSON, data through 2026-10-17 (H) |
| UDX last 30 days / last 7 days | $1,304.1M / $391.0M (daily 97.3, 32.2, 35.7, 33.8, 44.2, 39.4, 108.4) | same (H, computed) |
| UDX by month | Jul (from 17th) $9.9M; Aug $347.3M; Sep $721.7M; Oct 1-17 $930.0M | same (H, computed) |
| Underdog routed to other exchanges (Kalshi/CDNA), last 30 days | $612.5M (not UDX, not in the UDX API) | same (H, computed) |
| 2026-10-17 (Sat, college football) | UDX $108.4M notional, OI $39.3M; combos $87.4M (80.6%); single-leg $21.0M; 4,696 single-leg tickers traded; top families NCAAF game winner $9.7M, spread $3.1M, total $1.5M, WTA $1.0M | `market_data_2026-10-17.json.gz`, 227,133 rows (H, computed) |
| 2026-10-11 (Sun, NFL) | UDX $97.8M; single-leg $17.1M; NFL game winner $7.8M, spread $2.0M, total $0.9M; top market `UDXNFLGAMEWIN_BALATL..._BAL` 1.23M contracts | `market_data_2026-10-11.json.gz` (H, computed) |
| Live book depth, 36 sampled `GAMEWIN/MATCHWIN/FIGHTWIN` YES books across 18 leagues on 2026-10-19 02:15-02:30 UTC | 30 had two-sided books (6 empty: far-future NCAAF, an MLB game already underway, a UEL game); **median spread 0.03 (range 0.01-0.04)**; median premium within 5c of the best price ~$3,200 bid side / ~$2,900 ask side; best live NFL book had ~$21k bid / $7k-$130k ask within 5c | REST `/orderbook` (H, computed; fixture) |
| Live NFL moneyline (DAL v GB, in play) | hour ending 01:00Z: 664,534 contracts, 4,491 trades (YES price 0.52 -> 0.42); hour ending 02:00Z: 535,101 contracts, 3,167 trades (0.42 -> 0.11); 1-minute volume 3,084-8,102 contracts around 01:01-01:05Z | REST candlesticks (H) |
| Open single-leg markets (catalog) | 20,091 (NCAAF 6,176; NBA 4,083; NFL 3,008; NHL 1,289; ATP 607 + 152 challenger; WTA 566; UCL 357; Liga MX 354; MLS 349; Serie A 333; La Liga 329; EPL 306; MLB 274; Ligue 1 254; Bundesliga 249; UEL 249; WNBA 245; EFL League One 224; UFC 80; CS2 50; plus Saudi Pro League, Argentina, Colombia, Brazil, Libertadores/Sudamericana) | full crawl 2026-10-19 (H) |
| Multi-leg combos | 221,895 combo tickers traded on 2026-10-17; open count not enumerated | EOD file (H) |

Interpretation (M): UDX is re-homing Underdog's own customer flow from Kalshi/CDNA onto its own book (total Underdog volume roughly flat, "other exchange" volume falling, per the sibling note's monthly figures and the overview JSON). That flow is parlay-heavy and retail, and single-leg prices on this book are probably maker quotes tracking the same sharp consensus as other US sports venues. Depth is real (thousands of contracts per level, deep in play), but a 3c spread plus a 1.75c taker fee means roughly 5-7 cents of edge is needed to cross it.

An `open` market does not mean quotes exist: `status=open` includes games that are over or in progress with an empty or one-sided book. Gate on a two-sided non-empty book and `expires_at`.

---

## 11. Event overlap and shared liquidity

- **Overlap (arbitrage-relevant): sports only.** NFL, NCAAF, NBA, WNBA, NHL, MLB (game winner, MLB player props), ATP/WTA/ITF tennis, UFC, CS2, and soccer (EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, UCL, UEL, EFL League One/Championship, Saudi Pro League, Argentina, Brazil, Colombia, Libertadores/Sudamericana). Market types: game/match winner (soccer incl. separate DRAW binary), spread, total, team total, 1H/2H/quarter variants, BTTS, player props (points, rebounds, assists, threes, passing/rushing/receiving yards, touchdown, shots on goal), plus combos. No politics, macro, crypto-price or weather markets in the live catalog (H, 123 ticker families checked; 3 non-game oddities seen in the earlier EOD file: MLB CBA, MLB season start, NFL team sale price, ~0 volume).
- **Shared liquidity:** UDX's single-leg books are an **independent leg** relative to Kalshi, Crypto.com Derivatives NA, Polymarket US (separate DCM/DCO, own CLOB; H for the exchange structure, M for price independence since the same professional makers may quote everywhere). **Not independent:** Kalshi and CDNA contracts offered inside the Underdog Predict app are those exchanges' own books (broker/front end) and are not in the UDX API or UDX daily reports. Combos have no counterpart elsewhere except as a synthetic of several legs. The earlier-mentioned Aristotle deal did not include PredictIt (gaming.net, M); no liquidity is shared with PredictIt.

---

## 12. Adapter spec (if built)

**Read adapter (recommended, P1):**
1. **Catalog:** every 60 s poll `GET /markets?status=open&type=single_leg&limit=100` (follow `next_page_url`, ~201 pages, ~100 s at 0.5 s spacing) or, after the first load, go WebSocket `market_lifecycle` (needs a key) and re-read REST on a sequence gap. Cache `{ticker, description, expires_at, status, external_ids.optic_odds, tick_size}`. Skip `UDXCOMBO` unless building combo synthetics.
2. **Parse and link:** ticker grammar + description to `{league, marketType, away, home, kickoffET, outcome|line, period}`; map to Kalshi / Polymarket US events by league + date + teams/players + line + period; keep the pair as "related" until a rules diff is approved (sections 8, 9).
3. **Prices:** `GET /markets/{ticker}/orderbook?depth=5` for the linked subset (target a few hundred books per minute, i.e. well below ~4 req/s); store `[price, qty]` as decimal strings; compute best bid/ask, spread, depth within 5c; treat empty or one-sided books as no quote. Add the taker fee `0.07*P*(1-P)` per contract to any edge calculation. Use `GET /trades?executed_at_or_after=` as a cheap global tape (one call covers all markets) for last-trade freshness.
4. **Volume/OI:** from candlestick volume (live) and the T+1 EOD files (OI, daily volume per ticker); the live API has no OI.
5. **Timestamps:** send RFC 3339 with six fractional digits (the 500 gotcha in 4a). Always send `UDX-Version: 2026-07-15`.
6. **Flags:** `liquidity_class = "live-orderbook"`, `tradable_by_paybox = false`, `independent_of = ["kalshi","crypto.com","polymarket-us"]`, `us_only = true`, `fee_model = quadratic_0.07`.

**Trade adapter (only if a human US-eligible operator opts in, not via PayBox):** UAT first; RSA-PSS signer as in 4c; `POST /orders` -> poll or private WS; respect asynchronous-write and idempotency rules; keep the key out of model context. Production eligibility is an open question (section 14).

---

## 13. Differences from the sibling note (`docs/research/venues/underdog-predict-underdog-exchange-udx.md`)

I did not edit that file (scope limited to this note and fixtures). Its primary-source EOD findings reproduce (I recomputed 227,133 rows, $108.45M volume, 80.6% combos, $21.05M single-leg, fees, rulebook quotes). Its sections 4b, 5, 12 and priority (P2, "NOT FOUND ... no developer docs, OpenAPI, FIX spec, WebSocket spec or base URL") are superseded by this note because `docs.underdogexchange.com` and `api.underdogexchange.com` exist and were found by probing the `docs.` and `api.` subdomains of `underdogexchange.com`. Its "FIX" and "ISV API" speculation is consistent with the glossary mention of FIX.

---

## 14. Open questions

- How does a third party get a **production** API key (onboarding steps, individual vs institutional, minimums, ISV agreement)? Docs describe only UAT key creation.
- Member rate-limit numbers for authenticated keys (`GET /rate_limit_profile`), and what "per client" means for the public 8-token bucket.
- Official operating-state list; whether the API is reachable from outside the US for read (it was from this machine; I did not test geo behaviour).
- Per-sport contract specifications, settlement sources, postponement / void / retirement / overtime rules (rulebook Rule 11 is a stub; the Notices page, which lists self-certification filings, renders client-side and was not read).
- Whether public `GET` data may be redistributed in a hosted multi-user product.
- FIX: spec not published.
- Does the app/web UI price list differ from the API book (UI might apply Underdog markups)? Not tested.
- Frequency of the candlestick 500 and whether other query shapes trigger it.

---

## 15. Suspicious content / embedded instructions

None found. I scanned `llms-full.txt` (1.1 MB) for text addressed to AI agents ("ignore previous", "as an AI", system-prompt wording) and found none. The docs site offers "Open in ChatGPT / Claude / Cursor" buttons, a `llms.txt`, an `agent-readability.json` with `contentUsage: {search, ai-input, ai-train: true}` (applies to the docs, not to market data) and a WebMCP script; these are conventional and carried no instructions. No instructions in any API response.

---

## 16. Fixtures (`docs/research/fixtures/underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc/`, all <= 50 KB)

| File | What |
|---|---|
| `rest_GET_markets_status-open_limit-5_2026-10-19.json` | verbatim `GET /markets` page (shows `external_ids.optic_odds`, `next_page_url`) |
| `rest_GET_markets_ticker_NFL-DAL_2026-10-19.json` | verbatim `GET /markets/{ticker}` |
| `rest_GET_orderbook_NFL-DAL_2026-10-19.json`, `..._NFL-GB_...json` | verbatim L2 books of the two sides of one game |
| `rest_GET_market_trades_NFL-DAL_limit-5_2026-10-19.json`, `rest_GET_trades_global_limit-3_2026-10-19.json` | verbatim trade prints (µs timestamps, `taker_side`) |
| `rest_GET_market_candlesticks_NFL-DAL_1m_2026-10-19.json`, `..._1h_...json` | verbatim OHLCV candles; `rest_GET_market_candlesticks_1h_HTTP500_2026-10-19.json` is the server error for the zero-fraction timestamp variant |
| `rest_GET_markets_type-multi_leg_limit-2_2026-10-19.json` | verbatim combo markets with `legs` |
| `rest_GET_orders_unauthenticated_401_2026-10-19.json`, `rest_response_headers_markets_2026-10-19.txt` | problem+json 401 and the rate-limit headers |
| `rest_UAT_GET_markets_limit-2_2026-10-19.json` | UAT catalog is also keyless |
| `rest_orderbook_sample_36_markets_2026-10-19.json` | 36 verbatim books used for the spread/depth stats |
| `derived_catalog_counts_single_leg_open_2026-10-19.json`, `docs_openapi_operations_2026-07-15.txt` | derived by me (crawl aggregates; operation list with public/auth flag) |
| `docs_llms.txt`, `docs_changelog_rss.xml`, `docs_agent-readability.json` | verbatim docs index files |
| `eod_platform-overview_generated-2026-10-18T12-10Z.json`, `eod_reports_manifest_first3_...json`, `eod_market_data_2026-10-17_sample_27_rows_of_227133.json`, `eod_trade_data_2026-10-17_first_33_rows_of_426420.json` | official EOD data (manifest trimmed to 3 entries per list; sample rows verbatim) |
| `udx_fee_schedule_2026-10-09_text_extract.txt` | text extracted from the fee-schedule PDF |

---

## 17. Sources

Primary (H):
- Exchange landing page: https://underdogsports.com/exchange/ and https://underdogsports.com/exchange/holidays-and-hours
- **Developer docs:** https://docs.underdogexchange.com/ (also /llms.txt, /llms-full.txt, /openapi.yml, /asyncapi.yml, /quick-start, /reference/connecting, /reference/authentication, /reference/rate-limits, /reference/versioning, /concepts/markets-and-trading, /concepts/order-entry, /concepts/market-data, /concepts/market-lifecycle, /concepts/participants-and-access, /concepts/clearing-and-settlement, /walkthroughs/discovering-markets)
- **Live API (production, keyless GETs):** https://api.underdogexchange.com/markets, /markets/{ticker}, /markets/{ticker}/orderbook, /markets/{ticker}/trades, /markets/{ticker}/candlesticks, /trades; UAT https://api.uat.udx.underdogsports.com/markets
- Data page and files: https://data.underdogexchange.com/ ; https://data-production-platform-overview.s3.amazonaws.com/platform-overview/v1/platform-overview.json ; https://cftc-public-reports.underdogfantasy.com/manifest.json , /reporting/market_data_2026-10-17.json.gz , /reporting/market_data_2026-10-11.json.gz , /reporting/trade_data_2026-10-17.json (Range head)
- Rulebook v1.4 (effective 2026-10-01): https://www.underdogsports.com/exchange/rulebook (301 to a Webflow CDN PDF; text extracted locally with a scratch PDF parser, read Rules 4(a), 5(a)-(c), 5(b)(ii), 5(h), 5(i), 6(c), 6(g), 9, 10, 11)
- Legal center https://legal.underdogexchange.com/ and PDFs: Fee Schedule https://underdog-exchange.pactsafe.io/versions/6ac6db492c7c473ca250669f.pdf ; Terms of Use .../6a59a12a8c17c76f42a4f91b.pdf ; Participant Agreement .../6a3c3e8abac1ca0e7580415f.pdf ; Security of Funds .../6a3c3ea9c9e0798b4be07a41.pdf

Secondary (M/L):
- https://predictionauthority.com/news/underdog-udx-cftc-exchange-launch-2026/ (launch 2026-07-18, self-certified 2026-07-15, $1 notional, $0.001-$0.999, 37 states / 13 jurisdictions; via fetch-tool summary)
- https://www.gaming.net/underdog-takes-its-prediction-market-fully-in-house/ (published 2026-07-20; Aristotle DCM/DCO acquired March 2026; CFTC designated Aristotle's DCM in September 2025; PredictIt not part of the deal; via fetch-tool summary)
- Sibling repo notes: `docs/research/venues/underdog-predict-underdog-exchange-udx.md` (EOD analysis, UDM FCM fee), `docs/research/06-paybox-platform.md` (plugin sandbox limits), `docs/research/08-venues-polymarket-kalshi.md` (Kalshi comparison)
- WebSearch quota was exhausted for the whole session before I could use it, so no search-engine discovery was done; everything above comes from direct fetches.
