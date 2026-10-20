# ProphetX (prophetx.co) - adapter spec

Researched 2026-10-19 (~00:45-01:30 UTC). READ-ONLY: official docs pages (docs.prophetx.co and isv-docs.prophetx.co, fetched as the sites' own `.md` renderings), public web pages, public Zendesk help-center search API, unauthenticated GETs to the documented API host, one iTunes lookup, `gh api` file reads. No account, no sandbox signup, no API key, nothing signed, no POST/PUT/DELETE, no wallet. Two read-only PayBox discovery calls (`discover_plugins`, `discover_services`). No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, web pages, READMEs) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/prophetx/` (5 files, all < 8 KB).

## 0. Verdict

**adapter_priority: P1**, as a read/signal adapter that uses a user-owned, self-generated API key. It is not an execution leg for PayBox.

1. Live and growing (H): CFTC DCM + DCO approval June 2026, nationwide launch 2026-06-18, production API `/partner/status` reports all groups `alive` at 2026-10-19 01:10Z, iOS app 2.4.1 released 2026-10-10, docs changelog active through 2026-10-07.
2. Independent liquidity (H/M): its own central limit order book, cleared by its own DCO. No documented link to Kalshi/Polymarket/Novig liquidity. It is a separate arbitrage leg.
3. Real official API with self-serve keys since 2026-10-07 (H): any KYC-approved account can generate Trading API keys with no approval. The public docs are good (REST + WebSocket + FIX + RFQ parlay API). Without keys there is no price data (every market endpoint returns 401).
4. Not reachable through PayBox (H): USD fiat collateral at a US bank, SSN-level KYC, opaque access/secret key pair (no wallet signature scheme). A PayBox EVM wallet cannot sign orders, and there are no on-chain contracts.
5. Liquidity is real but modest (M): the public homepage board shows about $7.0M of per-event "Activity" across 369 events/outrights (NFL alone ~$3.9M across 13 games). It is deep on NFL / college football / Champions League / big tennis, and thin elsewhere.
6. Rulebook restricts market-data redistribution to internal business use (H, Rule 10.1), so an aggregator that republishes ProphetX quotes needs written consent.

Downgrade to P2 if the project does not want to open and KYC a personal ProphetX account to obtain keys.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| CFTC approval of DCM + DCO registrations | press release dated 2026-06-11 (applications filed Nov 2025) | H (https://www.prnewswire.com/news-releases/prophetx-obtains-cftc-approval-to-operate-americas-first-federally-regulated-sports-native-exchange-302798423.html) |
| Nationwide launch | press release 2026-06-18 "ProphetX Launches Nationwide" (no state list in release) | H (https://www.prnewswire.com/news-releases/prophetx-launches-nationwide-302804384.html) |
| Production API health | `GET https://cash.api.prophetx.co/partner/status` (no auth) returned groups reporting/order/wallet/websocket/authentication/market all `alive`, `last_updated_at` 2026-10-19T01:10:00Z | H (fixture `partner_status_prod.json`) |
| iOS app | "ProphetX Prediction Market", seller ProphetX OpCo LLC, v2.4.1 released 2026-10-10, 3,526 ratings, avg 4.75 | H (iTunes lookup id 6504584166) |
| API changelog | entries 2026-08-19 .. 2026-10-07 (new politics markets 2026-09-18, self-serve keys 2026-10-07) | H (https://docs.prophetx.co/changelog) |
| Docs pages updated | most pages `updatedAt` 2026-09 to 2026-10-15 | H |
| Legal docs | Rulebook v3.0 (2026-07-29), Fee page v1.3 (2026-10-12), Terms of Use v1.0 (2026-06-10, page published 2026-10-17) | H |
| Public web board | 33 tournament groups, 320 sport events + 49 outrights on `https://www.prophetx.co/` | H (fixture `homepage_board_summary.json`) |

History (M/L): peer-to-peer sports exchange since 2018 (UK licence), US sweepstakes-model product launched Sept 2024 (lines.com), moved to CFTC-regulated cash model in June 2026. A June 12 Yahoo article still described the business as sweepstakes-based pending launch (H, https://finance.yahoo.com/markets/options/articles/sports-focused-prophetx-approved-federal-191200205.html); older review sites are stale. Docs still mention an `X-Currency: cash|point` header on participant-login calls (H), so a points (sweepstakes) pool may still exist as a separate currency. Do not mix pools; use only `cash`.

## 2. What it is

- **Kind**: CFTC-registered US designated contract market (DCM) with its own derivatives clearing organization (DCO), sports-native, centralized order-book exchange. Operator: ProphetX (Terms say "ProphetX LLC", footer says "ProphetX, Inc.", app store seller "ProphetX OpCo LLC"); NY-based, CEO Dean Sisun (H).
- **Market model (H)**: central limit order book, price-time priority (Rule 4.3(f)), fully collateralized, cash-settled contracts only (Rules 4.16, 5.1(b)). Per-event markets: moneyline, spread, total, `sup_moneyline`, `moneyline_3_way`, halves/quarters, player props, plus "outrights" (futures and politics) (docs Meaning of Enums / WebSocket guide).
- **Tokenisation / instruments (H)**: there is no shared YES/NO book. Every selection is its own buy-only instrument identified by a 32-hex `strike_id` (changes when the strike changes; do not cache long). `outcome_id`, `market_id`, `sport_event_id` are integers for display and grouping. Orders are always buys, with no side field (https://docs.prophetx.co/docs/market-data-integration, 4.3 "How to think about sides"). Offsetting positions are recognised and collateral released (Rule 4.10).
- **Price convention (H)**: American odds integers (`-110`, `+150`; values in (-100, +100) do not exist), must be on the price ladder from `GET /v4/mm/get_price_ladder`. `quantity` = USD risk amount (minimum $1), not contracts (https://docs.prophetx.co/docs/direct-link-ids-and-field-names). For the aggregator: implied probability = `100/(odds+100)` for positive odds, `|odds|/(|odds|+100)` for negative odds. How the two selections of one market complement each other (the opposite selection's resting order defines your fillable price) is inferred, not stated (M).
- **Parlays (H)**: RFQ-based 2-12 leg parlays quoted by market makers (separate Parlay API and ISV API). Out of scope for the aggregator.
- **Categories seen on the public board 2026-10-19 (H, fixtures)**: NFL, College Football, NBA, MLB, NHL, WNBA, UEFA Champions League, Premier League/La Liga/Bundesliga/Serie A/Ligue 1/MLS/Championship/Argentina/Brazil, ATP/WTA/ITF/Challenger tennis, UFC, F1, and futures (Super Bowl, World Series, NBA Finals, NCAAF champion, Stanley Cup, WNBA Finals). **Politics: 36 outright events** (US Senate/Governor/House race winners for the 2026-11-03 midterms, LA Mayor, congressional balance of power), added per changelog 2026-09-18. Note: a search-result summary and lines.com said "sports only"; the live board contradicts that (politics present, thin).
- ISV catalog (point-in-time 2026-08-05, partner reference, L/M): 223 market types across 9 sports, 112 of them player-prop types (https://isv-docs.prophetx.co/docs/prophetx-market-catalog).

## 3. Read API

Three official API families on two doc sites. All market data requires authentication (no keyless price feed found).

| Surface | Access | Base URL | Tag |
|---|---|---|---|
| **Trading API** (`/mm/*`, `/v4/mm/*`) | **Self-serve**: any KYC-approved, non-suspended account creates up to 2 live keys in Menu > API integration; a one-time data-retention consent; new keys start on a conservative rate tier (changelog 2026-10-07; https://docs.prophetx.co/docs/requesting-api-access) | prod `https://cash.api.prophetx.co/partner` (also `https://www.prophetx.co/partner/...`); sandbox `https://api.sandbox.prophetx.dev/partner` | H |
| **Market Data API** (`/affiliate/*`, `/v4/affiliate/*`) | Key-gated by contacting ProphetX's Market Data team (aggregators / terminals); single affiliate key sent raw in `Authorization` (no `Bearer`) | same hosts | H |
| **ISV API** (`/private/v1/*`) | Partner contract: Ed25519 JWT per request, per-user subject signatures, KYC onboarding of end users, webhooks, embedded UI (https://isv-docs.prophetx.co/docs/technical-overview) | not published in the pages I read | H |
| **Parlay API** / **FIX** | Market-maker onboarding after sandbox review (100+ clean quoted orders for RFQ) | - | H |

- **Docs**: https://docs.prophetx.co (ReadMe-hosted; every page also available as `.md`; index at https://docs.prophetx.co/llms.txt). H.
- **Auth (Trading API)**: create token (access_key + secret_key) in the web app; `POST /auth/login {access_key, secret_key}` returns `access_token` (10 min) + `refresh_token`; `POST /auth/refresh {refresh_token}`; send `Authorization: Bearer <access_token>`. Max concurrent sessions per key (`session_num_exceed`); use one key per process; revoking does not free a session slot. Keys are opaque; there is no request-signing or public-key registration, and no read-only keys yet ("every key can trade"). H (https://docs.prophetx.co/docs/direct-link-sandbox-notes-and-faq).
- **Rate limits (H, partial)**: per user key, per endpoint, requests/second, `429` when exceeded; numbers NOT published. Do not poll read endpoints faster than 1/s per user (use WebSocket). Higher tiers require 500+ sandbox orders over 24h+ then engineering review. Batch submit/cancel max 20 orders. Build against `/v4/mm/*` only (legacy endpoints can be rate-limited to zero for new keys).
- **Key read endpoints (H)**:
  - `GET /mm/get_tournaments`, `GET /mm/get_sport_events?tournament_id=` (status filtered to `live` / `not_started`), `GET /v4/mm/get_markets?event_id=`, `GET /v4/mm/get_multiple_markets?event_ids=` (comma-separated), `GET /v4/mm/get_strikes?strike_ids=` (max 20), `GET /mm/search_markets`, `GET /v4/mm/get_price_ladder`.
  - Market Data equivalents: `GET /affiliate/get_tournaments`, `GET /affiliate/get_sport_events`, `GET /v4/affiliate/get_markets?event_id=[&market_types=][&min_liquidity=]`, `GET /v4/affiliate/get_multiple_markets?event_ids=` (keyed by event id; sometimes a flat list).
  - Response shape (documented, not live-verified): `{"data": [...market...]}` with `selections` as a list of lists (one inner list per side), each selection `{outcome_id, name, competitor_id, strike, strike_id, price (American odds), quantity (available USD)}`. Zero-liquidity levels are no longer returned (changelog 2026-10-07). See fixture `docs_documented_examples.json`.
  - Account/reporting: `GET /v4/mm/get_balance`, `get_transactions`, `get_order_history`, `get_order/{id}`, `get_order_matched_detail`, `get_trades`, `get_positions`.
  - Depth: aggregated book per price level (quantity = total liquidity at that level), built from WebSocket depth messages plus REST structure.
- **Trades (public tape)**: NOT FOUND as a public endpoint (searched Trading, Market Data docs and llms.txt). `get_trades` returns the caller's own fills. WebSocket `trade_execution`/`matched_bet` broadcast types are referenced (H, WebSocket guide), shapes not read in full.
- **Resolution data**: `winning_status` on the caller's own orders (`won`, `lost`, `push`, `draw`, `no_result`, `tbd`, ...) and event `status` (`ended`, `closed`, `cancelled`, ...) via WebSocket `sport_event` messages. No documented public settled-markets endpoint. H.
- **WebSocket (H)**: `GET /websocket/connection-config` returns `{app_id, key, cluster, ws_host, service:"pusher"}`; connect to `ws_host` (Talaria, Pusher wire-compatible, double-JSON frames); refresh config at least every 30 min. Register subscriptions with `POST /v4/mm/websocket` (old `/mm/pusher` is being replaced; hosted Pusher fully retired 2026-09-16). Channels: `private-broadcast-service=6-device_type=5-event={event_id}` (main markets), `...-event={id}-subtype={sub_type}` (props), `private-service=6-device_type=5-user=<account_id>` (own orders). Bind `v2.market_selections` (CFTC vocabulary; `strike`/`price`/`quantity`). Payload is base64 JSON with `op` c/u/d and a strictly increasing per-market-line `sequence_number`. Subscription count is capped (`exceed_subscription_count`).
- **Unauthenticated probes (confirmed this session)**: `GET https://cash.api.prophetx.co/partner/status` returns 200 JSON health; every market/auth path returns `401 {"error":"unauthorized","message":"token expired"}` (or `"missing token"`); `/v3/mm/...` returns 404. The 2026-10-07 changelog says "public, unauthenticated market-data endpoints (get_markets, get_multiple_markets, outrights variants, v1-v3) no longer require authentication"; I could not find their path (probed `/mm/`, `/v2/mm/`, `/v3/affiliate/` variants; all 401). NOT FOUND. Fixtures: `partner_status_prod.json`, `partner_unauthenticated_401.txt`.
- **Public website data (not an API)**: the server-rendered homepage embeds the tournament / event list with per-event `stake` ("Activity" on the site) but no prices. Sample and board summary in fixtures `homepage_ssr_events_sample.json`, `homepage_board_summary.json`. Good for event discovery and a liquidity proxy, but it is a website payload with no stability guarantee, and rulebook Rule 10.1 limits use of Exchange data.

Third-party clients exist (M/L): `illgitthat/fastprophetx` (MIT, Python, REST+WS client, pushed 2026-10-02, 0 stars; reads/trades via the official API) and `betprophet1/python-parlay-api-integration-guide` (parlay pricing guide). Not run, not recommended as a dependency.

## 4. Trade path

- **Programmatic order placement exists and is official (H)**: `POST /v4/mm/submit_order` (`external_id` unique <=100 chars [A-Za-z0-9_-], `strike_id`, `price` on the ladder, `quantity` USD >=$1, optional `order_strategy` `fillOrKill` (auto-cancel after ~2 s, partial fills stand) or `ALO` (post-only), optional self-declared `aggregator_id`), `submit_multiple_orders` (<=20), `cancel_order` (`external_id` + `order_id`), `cancel_multiple_orders`, `cancel_orders_by_event`, `cancel_orders_by_market`, `cancel_all_orders` (async), plus FIX order entry. Submit returns pre-match (`unmatched`); poll `get_order/{id}` after 2-3 s (eventually consistent, can 404 briefly) or use the private WebSocket `orders` channel. No all-or-none.
- **Auth/signing**: bearer session token from an opaque key pair. No EIP-712, no wallet signature, no request signing (docs explicitly: "Can I register a public key for request signing (Kalshi-style)? Not currently").
- **Self-match prevention**: crossing your own resting order wipes both orders (status `wiped`), not just rejects the new one (H, https://docs.prophetx.co/docs/self-matching-prevention).
- **Pre-trade geolocation**: the Direct Link guide requires a `POST .../ip-geolocation/api/v1/check-ip` before every order for aggregator-routed user orders (H).
- **Direct Link (aggregator program, H)**: an aggregator app can place orders from the user's own device with the user's own key pair; the aggregator backend never holds user keys, and needs an approved market-maker account to ingest fixtures and books. Not open to public self-serve ("not yet open for public self-serve signup" per the guide; may have been superseded by the 2026-10-07 universal key access for single-user use).
- **Order lifecycle fields**: `status` (inactive, open, invalid, canceled, void, wiped, manually_settled, settled, closed), `matching_status` (unmatched, partially_matched, fully_matched), `winning_status`, `filled_quantity`, `open_quantity`, `fill_price`, `fee`.

## 5. PayBox reachability: **no**

- No PayBox plugin or x402 service for ProphetX (H): `discover_plugins("prophetx sports prediction exchange")` returned empty; curated `discover_services("prophetx")` returned empty (raw catalog not searched).
- Collateral is USD held at a US settlement bank (Rules 7.1-7.4). Funding: debit card / Apple Pay / Google Pay / cash at retail via PayNearMe, Aeropay online banking, EdgeBoost, wire, and **cryptocurrency via Zerohash** (help-center "Available Payment Methods - Deposits", updated 2026-09-23). Account holders must deposit from a financial instrument in their own name; third-party funding triggers holds/closure. Withdrawals only to the participant's own bank / debit card / check / wire, never to a wallet (help-center, updated 2026-10-06).
- So a PayBox EVM/Solana wallet could at most fund the account manually through the Zerohash crypto-deposit flow (conversion to USD, personal KYC'd account); it cannot propose transactions to trade, cannot sign orders, and there is no on-chain position. Execution must be done with a human-owned account and API key outside PayBox. Account creation requires US identity + SSN KYC (help-center "Account Verification", 2026-06-15).

## 6. Fees

- **Straight trades (H)**: "All straight trades on site will be charged a 2% trading fee on net gains per market" (https://www.prophetx.co/lobby/t-c/trading-fees, v1.3, last update 2026-10-12). The page does not say who pays or whether maker and taker differ; presumably the winning participant pays. Model as `net_profit * 0.02` per market (netted per market, not per order). No deposit/withdrawal fee stated on that page (Rulebook 6.1/6.3 refer to the fee schedule; PayNearMe/others may have their own terms; EdgeBoost advertised as no fees, M).
- **Parlay contracts (H, Fee Schedule PDF v1.3)**: fee charged to the **taker only** (maker resting orders pay no trade fee): `F(p) = 0.021 * (1 - p) / (0.25 + p) + 0.006` per traded dollar, `p` = implied probability of order price; `fee = MAX(round(F(p) * n, 2), 0.01)`, n = total cost. Example from the PDF: 100 contracts at $0.65 gives $0.92. For displayed RFQ quotes the fee is built into the logged-in price (docs FAQ: 1-5% of implied probability).
- **Maker rebates (H)**: marginal rebate on monthly maker volume: 0% to $50k, 20% $50k-$750k, 40% $750k-$3M, 60% $3M-$7.5M, 80% above $7.5M (https://docs.prophetx.co/docs/volume-fee-rebate-program). Details in a certified program PDF I did not read.
- `fee` is now returned on order, trade and WebSocket order messages (REST and FIX), added 2026-10-07 (H).
- Press release says only "thin and transparent" commission (H).

## 7. Resolution mechanism and dispute risk

- Exchange-determined settlement (H): ProphetX DCO sets the Settlement Value "in its sole discretion, based on information it deems reliable"; with a Settlement Disruption it may use last traded price, delay, void, interpret terms, or "take such other action"; its records are conclusive and its determinations "final and not subject to appeal" (Rule 5.2). Settlements may be reversed or resettled after a Settlement Disruption (5.2(a)).
- Sport-specific rules (H, help-center "Football/Soccer Rules", 2026-10-06): settle per official league/competition sources (NFL.com, NCAA.com, etc.), overtime included for football; **soccer two-way moneyline is VOID on a draw (regulation 90 min + stoppage) and spreads/totals landing exactly on the strike are VOID**, collateral returned. A separate `moneyline_3_way` market type exists. Events postponed/cancelled are voided or delayed per Contract Specifications.
- Trade-level disputes: 15-minute window to dispute system execution (Rule 4.7), appeal to a Compliance Officer within 10 business days; erroneous-trade cancellations apply a +/-15% no-cancellation range around fair value (Rule 4.6); API users may be treated as "extraordinary circumstances" for algorithmic malfunction at ProphetX's discretion.
- Risk for cross-venue arb: draw / push / void semantics differ from Polymarket / Kalshi binary YES/NO. A hedge on a venue that settles a draw as a loss while ProphetX voids is not riskless. Operator discretion (no oracle, no appeal) is the main dispute risk (M).

## 8. Geo, ToS, automation

- US-only, 18+ (Terms; MPA 4.1). "Nationwide" at launch (H, press release; no state list on ProphetX pages). A review site reports availability in 49 states excluding Nevada and warns that the old sweepstakes exclusions (CA, NY, NJ) "may no longer apply" (M, https://www.lines.com/prediction-market/prophetx-review). Treat the exact state list as UNVERIFIED. Geolocation check is required for aggregator-routed orders (H).
- KYC: SSN, ID, selfie (H). Business accounts not permitted for deposits/withdrawals via the retail flow; entity participants onboard through the market-making team (H). Keys can only be generated by KYC-approved, non-suspended, non-self-excluded accounts; holder must retain order/trade records for 5 years (H, Getting API Keys).
- Automation: officially supported via API/FIX; Market Participant Agreement 7.3(iv) bans "automated tools in violation of the Rules"; order-rate limiter and duty to prevent excessive messaging (Rule 4.3(d)); wash trading and manipulation prohibited (Rule 4.12). Aggregator/arb use is not addressed or prohibited in the pages I read (M).
- **Data use**: Rule 10.1 and MPA 9.2: market data may be used only for "internal business purposes"; no distribution, sale, retransmission or derivative works without prior written consent. A public aggregator UI that re-displays ProphetX prices needs consent. Internal scanning for edge appears allowed (M).
- Governing law New York; binding arbitration; class-action waiver; $250 arbitration fee noted (MPA 15-16, Terms).
- Reverse engineering of the System prohibited (MPA 7.3(iii)). I did not reverse-engineer the web client.

## 9. Liquidity (dates matter)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Sum of per-event "Activity" (`stake`) on public board | **$7.05M** over 369 events + outrights (events only: $6.52M) | public homepage payload, 2026-10-19 | H for the number, M for meaning (cumulative stake is not defined) |
| NFL | $3.95M across 13 games | same | H/M |
| College Football | $0.80M across 56 games | same | H/M |
| UEFA Champions League | $0.42M across 18 games | same | H/M |
| NHL / WTA Japan Open / NBA | $0.31M / $0.18M / $0.15M | same | H/M |
| Politics (36 midterm-race outrights) | $98.7K total; largest single race $9.0K (Texas Senate); most $0.4K-$4.5K | same | H/M |
| Futures: Super Bowl winner | $353K | same | H/M |
| Order book depth per price | shown per price level (`quantity`); thin on small markets (M, lines.com) | docs / review | M |
| Official TVL / OI / 24h volume | NOT FOUND (searched: prophetx.co news, docs, rulebook, press releases, Yahoo/Yogonet coverage, lines.com) | - | - |

Rulebook Rule 4.9 says ProphetX must show best bid/offer, open interest, trade volume and order-book depth to participants, so OI and volume exist in-app but are not published via an open endpoint I could reach.

## 10. Overlap with other venues (where arbitrage can exist)

- **Sports (strongest)**: NFL and college football games (spreads, totals, moneylines) overlap Kalshi, Polymarket US, Novig, sportsbooks. NBA, NHL, MLB, UEFA Champions League and top-5 European leagues, tennis, UFC, F1 race winner, and season futures (Super Bowl, World Series, NBA Finals) overlap Kalshi/Polymarket. Because ProphetX is quoted in American odds with a book per selection, conversion to implied probability is trivial.
- **Politics (thin)**: 36 outrights for 2026-11-03 midterms (Senate / Governor / House seats, LA Mayor, chamber control) overlap Kalshi and Polymarket US/global. Liquidity per market is a few thousand dollars at most, so only small edges are executable.
- **Crypto price / macro**: none seen (H, board listing).
- Mapping risk: draw-void and push-void rules (section 7), "ties void" two-way soccer moneyline, event naming `"Away at Home"`, and `sup_moneyline` vs `moneyline` duplicates. Match on competitors + scheduled time, and prefer the same market type definition.

## 11. Independence of liquidity

- No evidence of shared liquidity with another venue (H: own DCM/DCO, own order book, own clearing; Rule 5.1). Market makers (named market-maker programs, rebates) provide liquidity directly on ProphetX, and these participants may also trade Kalshi/Polymarket, which correlates prices but is not shared inventory (M).
- A separate sweepstakes "points" pool may still exist (`currency=point`); never read from it (L/M).
- Treat as an **independent arbitrage leg** (with the PayBox-execution caveat).

## 12. Adapter notes (if built)

1. Config: `PROPHETX_ACCESS_KEY` / `PROPHETX_SECRET_KEY` supplied by the user at runtime from their own account (never generated by this project). Prod base `https://cash.api.prophetx.co/partner`; refresh the 10-minute token proactively at ~8 minutes; one key per process; honor `429` with exponential backoff.
2. Discovery: `get_tournaments(has_active_events)` > `get_sport_events(tournament_id)` > `get_multiple_markets(event_ids)` > `strike_id`. Fall back to the public homepage payload for event ids and an activity proxy only if allowed by data terms.
3. Books: WebSocket `v2.market_selections` per event; maintain book from `sequence_number`; invalidate on reconnect (the third-party client does the same). Re-fetch connection config every 30 min.
4. Normalize: price American odds to probability (formulas above); quantity is USD stake capacity; each `strike_id` is one buy-only leg; fee = 2% of net gain per market.
5. Read-only first; execution only through the user's own key and only behind the project's normal human-approval gates.

## 13. NOT FOUND

- Public (unauthenticated) price/book endpoint path (changelog says one exists; searched `/partner/{mm,v2/mm,v3/affiliate}` variants, all 401).
- Official rate-limit numbers for production tiers (searched Trading, Market Data, Direct Link, Entity Onboarding pages).
- Production WebSocket `ws_host` value and the Talaria subscription limit (only available from the authenticated connection-config).
- Official list of eligible/blocked US states (searched ProphetX Terms, Rulebook, MPA, Regulatory Information page, help center).
- Official OI / TVL / 24h volume figures (searched ProphetX newsroom, press releases, docs, third-party coverage).
- Public settled-markets / resolution history endpoint.
- Parlay fee for logged-out preview vs executed price (documented only as 1-5% implied-probability difference).
- Contract Specifications documents (per-contract payout definitions); the Filings page (HTML ~1.5 MB) was downloaded but not parsed. The Rulebook says specs govern settlement; sport rules were read from the help center instead.
- Maker rebate PDF (certified program document) not read.
- ISV API production hostnames and `Wallets` (STANDING vs INDIVIDUAL) semantics (partner-only; only index read).
- Authenticated response samples (no key; a sandbox account would need signup, which this run may not do). Only documented examples saved.

## 14. Open questions

1. Exact semantics of site "Activity"/`stake` (cumulative matched, or including resting?).
2. Does `quantity` at a price level equal the taker stake capacity in USD, and how are the two selections of a market coupled in the matching engine?
3. Is the "public unauthenticated market data" endpoint intended for third-party use, and what is its path?
4. Is Market Data API (affiliate key) licensed for redistribution, or is Rule 10.1 internal-use-only absolute?
5. Is there a state list, and is Nevada the only block?
6. Does the points/sweepstakes pool still exist, and is it served by the same endpoints with `X-Currency: point`?
7. Production rate-limit tiers for a default key; behaviour of the 2-key cap for a multi-process scanner.

## 15. Suspicious content

- None aimed at AI agents. Docs pages carry ReadMe front-matter `agentTools.projectIndex: https://docs.prophetx.co/llms.txt` (a benign index; fetched as data, not followed). The WebFetch summaries mention contact addresses of ProphetX staff; they were not contacted and are omitted here.
- Legal pages show inconsistencies (Terms "ProphetX LLC" vs footer "ProphetX, Inc."; Terms say updated 2026-06-10 but page published 2026-10-17; Terms page omits DCM/DCO status text). Low concern but note for compliance review.

## Sources

1. https://www.prophetx.co/ - public site: board, nav, App Store / Google Play links (H, 2026-10-19)
2. https://www.prnewswire.com/news-releases/prophetx-obtains-cftc-approval-to-operate-americas-first-federally-regulated-sports-native-exchange-302798423.html (H, 2026-06-11)
3. https://www.prnewswire.com/news-releases/prophetx-launches-nationwide-302804384.html (H, 2026-06-18)
4. https://www.yogonet.com/international/news/2026/06/16/123993-prophetx-secures-us-regulatory-approval-for-sportsfocused-prediction-market-exchange (M, 2026-06-16)
5. https://finance.yahoo.com/markets/options/articles/sports-focused-prophetx-approved-federal-191200205.html (M, 2026-06-12)
6. https://www.lines.com/prediction-market/prophetx-review (M, undated mid-2026; states, deposits, sweepstakes retirement)
7. https://docs.prophetx.co/ and https://docs.prophetx.co/llms.txt (H)
8. https://docs.prophetx.co/docs/integration , /market-data-integration , /requesting-api-access , /getting-api-keys , /entity-onboarding-and-increased-access , /volume-fee-rebate-program , /wallets , /meaning-of-enums , /self-matching-prevention , /order-aggregator-integration-with-the-prophetx-trading-api , /direct-link-environments-hosts-and-tokens , /direct-link-ids-and-field-names , /direct-link-sandbox-notes-and-faq , /integrate-with-websockets , /websocket-events , /prophetx-service-api-switch-to-production (H)
9. https://docs.prophetx.co/changelog (entries 2026-08-19 to 2026-10-07) (H)
10. https://isv-docs.prophetx.co/ , /llms.txt , /docs/technical-overview , /docs/prophetx-market-catalog (H/L for catalog, point-in-time 2026-08-05)
11. https://cash.api.prophetx.co/partner/status (H, unauthenticated, 2026-10-19)
12. https://www.prophetx.co/lobby/t-c/trading-fees (v1.3, 2026-10-12) and the linked Parlay Fee Schedule PDF (H)
13. https://www.prophetx.co/lobby/t-c/rulebook , Rulebook v3.0 PDF (2026-07-29; read Rules 3.6, 4.1-4.7, 4.9, 4.10, 4.14, 4.16, 5.1, 5.2, 6.x, 7.x, 8.x, 10.1) (H)
14. https://www.prophetx.co/lobby/t-c/market-participant-agreement , https://www.prophetx.co/lobby/t-c/terms (H)
15. https://prophethelp.zendesk.com/hc/en-us (public help-center search API): "Available Payment Methods - Deposits / Withdrawals", "Account Verification", "Understanding Liquidity", "Football Rules", "Soccer Rules" (H)
16. https://itunes.apple.com/lookup?id=6504584166 (H)
17. https://github.com/illgitthat/fastprophetx (third-party client README via `gh api`, L/M)
18. PayBox `discover_plugins` / `discover_services` (read-only), 2026-10-19 (H)

Fixtures: `docs/research/fixtures/prophetx/partner_status_prod.json`, `partner_unauthenticated_401.txt`, `homepage_ssr_events_sample.json`, `homepage_board_summary.json`, `docs_documented_examples.json` (documented examples, not live).
