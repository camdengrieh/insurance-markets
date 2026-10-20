# Novig (Ludlow Exchange DCM, US sports event contracts) - adapter spec

Researched 2026-10-19 (~01:00-01:45 UTC). READ-ONLY: unauthenticated GETs to `docs.novig.com`, `data.novig.com`, `api.novig.com` (public routes), `support.novig.com`, plus fetches of Novig's own public Ludlow PDFs (Rulebook v1.3, Member Agreement v1.1). No account, no key, nothing signed, no POST/PUT/DELETE, no wallet, no PayBox calls. No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale.
Third-party text (docs, help-center pages, rulebook, API payloads, aggregator pages) is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.
Fixtures: `docs/research/fixtures/novig/` (14 files, all < 6 KB).
Limits of this run: the WebSearch budget was exhausted before I started, so there was no web search; everything below comes from direct fetches. `novig.com` itself (marketing site, terms) sits behind an AWS WAF captcha for scripted clients (HTTP 405, `x-amzn-waf-action: captcha`), which I did not try to bypass, so the novig.com Terms of Use were NOT read.

## 0. Verdict

**adapter_priority: P0 as a read / price-signal adapter. Trading through PayBox: not possible (treat as skip).**

1. Live and large (H): $1.446B notional in Sept 2026, $1.62B in 1-17 Oct 2026, $151.5M on Sat 2026-10-17 (section 9).
2. Official API is good (H): signed REST + one websocket, OpenAPI 3.1, Mintlify docs with `llms.txt`. In addition the official OpenAPI spec contains **unauthenticated, cacheable `/v3/public/*` routes** for the catalog, order book and trade tape that work on production today with no key and no KYC (section 3). That makes Novig the easiest large US sports venue to read.
3. Independent liquidity (M-H): its own central limit order book on Ludlow Exchange, LLC (a CFTC DCM), cleared by Bitnomial Clearinghouse. No source says it mirrors or routes to another venue (section 11).
4. Caveats that stop this being a full arbitrage leg for an agent wallet: sports only; US-only, 21+, KYC individual accounts (not AZ, MI, NV); orders are signed with a Novig-registered Ed25519/P-256 key, not an EVM/Solana transaction; Novig is fiat/stablecoin-in via its own checkout, not an on-chain protocol (sections 4, 5, 8).
5. Risks for a scanner: the public routes are marked `x-hidden: true` in the spec and absent from the docs navigation (may change without notice); resting orders are voided at every `GOLIVE`; settled markets can be re-graded ("remediation"); the contract rules (FMV on voids) differ from other venues' void rules (sections 7, 10).

## 1. Liveness (2026) - confirmed live

| Evidence | Value | Tag |
|---|---|---|
| Last trade on the sample NFL moneyline | `ts` 1792371795928 = 2026-10-19T01:03:15Z, minutes before my fetch (fixture `public_catalog_market_trades_limit5.json`) | H |
| Exchange-data manifest `data.novig.com/reporting/trade-data/index.json` | trades for 76 days 2026-08-03 to 2026-10-17; markets for 75 days 2026-08-04 to 2026-10-17; last modified 2026-10-18 09:09 UTC (fixture `exchange_data_index.json`) | H |
| Open events on 2026-10-19 | NFL 44, NCAAF 59, NBA 22, MLB 12, NHL 7, MLS 14, EPL 8, La Liga 12, Champions League 18, ATP 147, WTA 71, UFC 17, F1 3 (public catalog, point-in-time counts, includes futures placeholder events) | H |
| API changelog | entries dated 2026-10-14 (soccer team totals, 1H totals) and 2026-10-15 (live taker fee 0.03 -> 0.06) | H (https://docs.novig.com/api-reference/changelog) |
| Live fee value | public market object shows `fee.coefficient "0.06"` on 2026-10-19, so the 10-15 change is in force | H |
| Help-center legal docs | Ludlow Rulebook v1.3 and Member Agreement v1.1, both dated 2026-09-02 on the help-center article | H |
| Cleatz (hint source) | "Novig Exchange" Sept 2026 observed notional $1.45B, 4,211,101 transactions; page updated 2026-09-22, data through 2026-10-17 | M (https://cleatz.com/prediction-market-revenue/) |

**Resolving the DeFi Rate conflict (approved but not yet trading)**: that claim is stale. The exchange has published daily trade files since 2026-08-03 and trades $30M-$180M a day (H). The Cleatz $1.45B figure is reproduced almost exactly by my own sum of `dailyVolume` over Sept 2026 ($1,446,326,352), so Cleatz appears to read Novig's own data files (H for my sum; M for Cleatz's provenance, since its page does not name the feed).

Corporate structure (H/M): the legal exchange is **Ludlow Exchange, LLC**, a Delaware LLC (Rulebook Rule 2.1), which operates as a Designated Contract Market (Novig help center "Rules, Legal Restrictions & Compliance"; Market Rules notice says "Novig is now a CFTC-licensed" DCM). Clearing is **Bitnomial Clearinghouse, LLC**, a DCO (Rulebook Rule 3.1(d); help-center "Bitnomial Clearinghouse Acknowledgement"). Novig is the operating brand and front end (Ludlow's member contact address is a novig domain - M, inference). Earlier Novig product was a sweepstakes model: the help center still has "Sweepstakes Rules" and "Novig Cash" wording (M, from collection descriptions). Ludlow's own site `https://www.ludlowexchange.com/` is a bare landing page ("Est. 2025, New York") (H). DCM designation date: **NOT FOUND** (searched: the cftc.gov DCM index fetched through WebFetch did not show Ludlow in extracted text; no web search available).

## 2. What it is

- **Kind**: regulated exchange (CFTC DCM), central limit order book, fully cash-collateralised event contracts on **sports only** (H).
  - Rulebook Rule 6.1(b): "All Member positions are fully cash collateralized."; Rule 5.4(a): all trading is anonymous; matching is price-time priority (definition of "Matching Algorithm").
  - Help center "What is Novig?": "CFTC-regulated exchange for event contracts on sports outcomes"; offered nationwide except Arizona, Nevada, Michigan; 21+ (H, https://support.novig.com/en/articles/10336081-what-is-novig).
- **Market model (H, https://docs.novig.com/api/concepts/universe-model)**: Sport > League > Event (one game) > Market (one question) > Outcome. **An order names an outcome, never a market**, and each outcome has its own book.
  - Binary two-outcome markets: `MONEY` (home/away), `SPREAD` (home/away, `strike` = home handicap), `TOTAL`, `TEAM_TOTAL` (over/under); player props Over/Under or Yes/No.
  - **Three-way soccer** is three separate Yes/No markets (`MONEYLINE_3_WAY_WIN` home, `MONEYLINE_3_WAY_DRAW`, `MONEYLINE_3_WAY_WIN` away). "No" means any other result, not "the other team".
  - 184 market types (fixture `public_types_markets.json`): game lines, 1H lines, ~100 player/team prop types, futures (`CHAMPIONSHIP_WINNER`, `SUPER_BOWL_WINNER`, `WORLD_SERIES_WINNER`, `STANLEY_CUP_WINNER`, `MVP_WINNER`, `SERIES_WINNER`, division/conference winners, golf top-N, World Cup `GROUP_*`).
  - `COMBO` (parlay) contracts exist, priced by RFQ from liquidity providers; they have no book and are 43-49% of volume (section 9). Ignore for the scanner.
  - Outcomes array order is not fixed: match by `outcomeId`. `outcomes[].status` is `TBD`, `WIN`, `LOSS`, `PUSH`, or a bare decimal string (FMV price).
- **Tokenisation**: none on-chain. Contracts are ledger entries at Bitnomial. **One contract pays 1 cent in the API's quantity unit** ("A winning contract pays full value, 1c"; `qty` 100 = $1.00 payout), but the public CSV docs say "one contract pays $1" with fractional `qty`. The two units differ by 100x (H, both pages). Normalise on read: API `qty / 100` = USD payout.
- **Price**: decimal-string probability, three places, on a 279-tick grid: 0.001-0.050 step 0.001; 0.055-0.945 step 0.005; 0.950-0.999 step 0.001 (H, https://docs.novig.com/api/concepts/money). Every order is a **buy** of one outcome at that price. A bid on outcome A at p is liquidity for outcome B at 1 - p.
- **Collateral/chain**: USD balances, 5 decimal places, held at the clearinghouse (Rulebook Rule 8.1: Ludlow does not hold member funds). No chain. Funding rails in section 5.

## 3. Read API

Official docs: https://docs.novig.com (Mintlify; index https://docs.novig.com/llms.txt; every page also served as `.md`). OpenAPI 3.1 at https://docs.novig.com/api-reference/spec-files/openapi-v3.json (778 KB; `info.version` 3.0.0; its `servers` lists only Paper). A deprecated v1 "NBX" API (OAuth2/JWT) is also documented under `/deprecated/`; build on v3 only (H).

| Environment | Base URL | Money | Location check |
|---|---|---|---|
| Production | `https://api.novig.com` | real | yes |
| Paper | `https://api.paper.novig.com` (ws `wss://api.paper.novig.com`) | play ($10,000 start) | no |

Paper needs its own sign-up (not done); production and paper keys are not interchangeable (H, https://docs.novig.com/api/environments).

**A. Unauthenticated public REST (best option for a scanner; confirmed live on production 2026-10-19)**

Present in the official OpenAPI spec with curl/TS/Python samples, key `none`, throttle `public`, "edge network caches each response, so it can be a few seconds old", but tagged `x-hidden: true` and not in `llms.txt` or the nav (H for spec, so treat as undocumented-but-official; could change).

| Route | Notes | Observed |
|---|---|---|
| `GET /v3/public/types/{sports,leagues,markets,event-statuses}` | JSON arrays of strings | 200; `cache-control: public, max-age=3600` |
| `GET /v3/public/catalog/events?league=&status=&startsAfter=&startsBefore=&limit=&after=` | `{items:[{eventId, description "Away @ Home", sport, league, status, startsTs}], next}` | 200; max-age=15 |
| `GET /v3/public/catalog/events/{id}` | one event | in spec, not fetched |
| `GET /v3/public/catalog/markets?league=&marketType=&eventStatus=&event=&startsAfter=&startsBefore=&limit=&after=` | `{items:[{marketId, description, eventId, marketType, strike, status, voids, startsTs, fee{coefficient,makerCredit,charged}, outcomes[{outcomeId,name,status}]}], next}`; authenticated docs say `limit` 1-5000, default 500 | 200 |
| `GET /v3/public/catalog/markets/{id}` | one market | 200 |
| `GET /v3/public/catalog/markets/{id}/book?depth=1..20` | `{marketId, seq, orders:{<outcomeId>:[{orderId, price, qty}]}}`, best price first, time priority within a price; supports `ETag`/`If-None-Match` (304) | 200; `cache-control: public, max-age=5, stale-while-revalidate=5` |
| `GET /v3/public/catalog/markets/{id}/trades?limit=` | `{items:[{tradeId, outcomeId, price, qty, ts}], next}` newest first | 200 |

Response-shape notes from the live samples (fixtures `public_catalog_*.json`):
- Pagination: `next` is an opaque cursor (a UUID-like id on the public routes, base64 in the docs example) passed as `after`; do not parse it.
- Price strings are not zero-padded consistently: the book returned `"0.27"`, `"0.25"`, `"0.295"`, while trades returned `"0.270"`. Parse as decimals.
- Markets carry `voids: "FMV"` (not in the docs pages I read; it appears to say how a void is graded - M) and `strike: "0"` on moneylines (the docs say moneylines omit `strike`; the live payload includes `"0"` - H, docs and payload differ).
- Market `description` is just the team code (`"PHI"`) and outcome names are codes (`PHI`/`DAL`); the human text lives on the event (`"Dallas Cowboys @ Philadelphia Eagles"`). Docs: "Don't parse" descriptions and match by ID.
- Public rate limit: bucket size NOT FOUND (`GET /v3/limits` needs a key). Observed: **HTTP 429 after ~13 back-to-back requests from one IP**, recovered within seconds; paced at 1.5 s per request there was no further 429 (H, my own test). The documented edge limit is 2,000 requests/min/IP and 8 KiB request body, and the edge answers an HTML 403 with no JSON when it trips (H, https://docs.novig.com/api/throttling).
- Client note: `curl` and Node 20 `fetch` got 200; Python 3 `urllib` with the same User-Agent got an HTTP 403 once. Cause not investigated (possible bot/TLS filtering at the CloudFront edge); I did not try to work around it. Test your real HTTP client early.
- No geo-block observed on the public routes from a non-US IP.

**B. Authenticated REST + websocket (official, documented path)**
- Same catalog routes under `/v3/catalog/*` and `/v3/types/*`, plus `/v3/history/{events,markets,positions}` (settled markets with grades, `settledAfter` cursor), `/v3/portfolio/{fills,positions}`, `/v3/orders*`, `/v3/account/*`, `/v3/keys*`, `/v3/limits`, `/v3/echo`. Read keys: `trading`, `trading::read`, `management`, `management::read`. Every request, GET included, carries three headers and is signed (section 4).
- Rate limits (token buckets per key, H, https://docs.novig.com/api/throttling): place 256 burst / 8 Hz; cancel 256 / 16 Hz; read 64 / 16 Hz; account 64 / 8 Hz; stream 512 / 32 Hz; history 512 / 4 Hz. `429` carries `Retry-After`. Throttles count per key, so split across keys.
- **Websocket** `GET /v3/ws` (same host as REST), keys `trading` or `trading::read` only. Heartbeat 15 s. Verbs `subscribe`, `unsubscribe`, `snapshot`, `status`, `query_markets`, `query_events`, plus `place`, `cancel`, `cancel_all`. Channels: `lifecycle` (weight 1), `trades` (4), `bbo` (8), `book` (16), and private `orders`, `positions`. Up to 8,192 watched markets per connection. Each subscription starts with a snapshot carrying `seq`; deltas follow with gap-free `seq` per market; `book` deltas are `add`/`remove` (`reason` fill or cancel). Strictly increasing `nonce` per connection (H, https://docs.novig.com/api/streaming/connection).
- **Bulk history, fully public**: `https://data.novig.com/reporting/trade-data/<YYYY-MM-DD>/{trades.csv,markets.csv}` plus `index.json`. Static files on a CDN, one day per file midnight-midnight Eastern, published about 05:00 ET next day. `markets.csv`: `date,marketId,reportTicker,openInterest,dailyVolume,open,high,low,close,status` (OHLC in cents). `trades.csv`: `timestamp,outcomeId,marketId,contractSeries,league,marketType,tradeType,legs,cost,qty,side` (one TAKER and one or more MAKER rows per trade, anonymised, fees excluded). Files are large (2026-10-17: trades 154 MB, markets 20 MB), so use HTTP Range or only fetch `markets.csv` (H, https://docs.novig.com/public-data/overview and fixtures `exchange_data_*`).
- Affiliate "Odds Screens" integration (apply at the affiliate program) is the docs' intended path for odds-comparison sites: signed `trading::read` key, catalog + book (H, https://docs.novig.com/affiliates/odds-screens). I did not apply. Whether commercial redistribution of prices via the public routes needs affiliate terms: **NOT FOUND**.

## 4. Trade path

- **Programmatic placement exists** (H): `POST /v3/orders` (201 = queued, not resting; confirm via private stream `open`), `POST /v3/orders/batch`, `DELETE /v3/orders/{id}`, `DELETE /v3/orders` (cancel all), websocket `place`/`cancel`/`cancel_all`. Body: `{outcomeId, price "0.665", qty int>=1, tif, ttl?, clientId?}`; `tif` includes GTC, GTT (needs `ttl`), IOC, FOK, PO (post-only) per the order-lifecycle page. `clientId` is not checked for uniqueness, so a replay places a second order (H, spec).
- **Auth/signing (NOVIG-V3)**: headers `Novig-Key-Id` (key UUID), `Novig-Timestamp` (unix ms, +-30 s skew), `Novig-Signature` (standard padded base64). Signed canonical string is six LF-joined lines: `NOVIG-V3`, timestamp, METHOD, path, canonical query (decode, re-encode uppercase hex, sort bytewise, line always present), lowercase hex SHA-256 of the raw body. Ed25519 (no digest) or P-256 ECDSA/SHA-256 (DER). 30 published test vectors at `/api-reference/spec-files/signing-vectors.json`; `POST /v3/echo` verifies a signer (H, https://docs.novig.com/api/signing).
- **Key model (H, https://docs.novig.com/api/concepts/account-model)**: one `management` key per trader, created only in the web app (Profile > Settings > Novig API, behind a logged-in web session); it opens/funds subaccounts and cannot place orders. Up to 10 subaccounts, each with its own balance and exactly one live `trading` key (created through `POST /v3/account/subaccounts` with a public key you generate). "No key can both move money and place orders"; a leaked trading key cannot withdraw. The management key cannot be created by API, so a first human login is unavoidable.
- Every order is a **buy**. "Selling" a held outcome = buying the opposite outcome (which nets against it). Snap prices down to the grid before sending. `GOLIVE` voids every resting order on the event's markets and repeats on delays/reviews (H).
- Settlement and balances are off-chain at the clearinghouse; there is nothing to simulate on-chain.

## 5. PayBox reachability

**paybox_reachable: no** for trading; funding-only is conceivable. (Reasoned from Novig's docs; I made no PayBox calls.)
- Orders are authorised by Ed25519/P-256 signatures of a six-line canonical string made with a Novig-registered key, not by an EVM transaction or EIP-712 message. A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) has no role in order entry, and Novig has no smart contract to send transaction proposals to.
- A Solana wallet's Ed25519 key is algorithmically compatible with `POST /v3/account/subaccounts` registration (SPKI public key) in principle, but it would need a per-request arbitrary-message signature on every call including reads, a human-created management key first, and a KYC'd US individual behind the account. Whether PayBox exposes arbitrary-message signing for this: unknown, not tested. I would not plan on it (M).
- Funding: the help center documents a stablecoin deposit via Coinflow ("only stablecoins (USDC or USDT)"; chain chosen in checkout, not named in the article; a unique deposit address per attempt that expires after 1 hour; "no fee" tier). Card/Apple Pay cost 3%; bank (Stripe/Aeropay) and stablecoin are the no-fee "Discount" tier. A PayBox wallet could in principle send USDC/USDT to that address, but only after a KYC'd, geolocated human has opened the checkout (H for article text: https://support.novig.com/en/articles/12092529-using-coinflow-for-stablecoin-deposits and .../15062817-standard-and-discount-pricing). Withdrawals listed: bank transfer, debit card, Venmo (min $10), identity verification first; no crypto withdrawal listed (H, .../16194062-withdrawing-funds). So money cannot come back to a PayBox wallet.
- The Member Agreement requires trading "solely for Your own account and not as an intermediary, agent, or nominee for any other Person" (6.1.8) and Rulebook 3.1(c)(5)(C) repeats it. A shared agent/plugin that trades for many users through one Novig account would breach this; a per-user plugin using each user's own keys is the only compliant shape (H).

## 6. Fees

Source: https://docs.novig.com/api/concepts/fees (current, per-market) and https://docs.novig.com/fees (older page still carrying the RFQ schedule and some stale 0.03 text). **Read `market.fee` from the API; never hardcode.**

- **Taker pays, maker never pays.** `Fee = c * P * (1 - P) * N * 1c` where `P` is the execution price (not the limit), `N` the contracts in the fill in API units (so USD fee = `c * P(1-P) * qty / 100`). Rounds half-up to $0.00001; no cent floor.
- Coefficients (H): game markets **0.06 since 2026-10-15** (it was 0.03 before; NCAAF, MLB, NHL had 0.06 since 2026-10-08); futures (NFL, MLB, NCAAF) 0.06; RFQ/combination 0.10 (older page, may be stale).
- **When charged**: game markets have `fee.charged = WHEN_LIVE`, i.e. only on fills matched while the event is `OPEN_INGAME` (evaluated at match time). **Pregame taker trades are free.** Futures with `charged = ALWAYS` pay in every phase. PGA, ATP, WTA, UFC futures carry no futures fee ("Game" schedule, never live).
- Worked values at c = 0.06: 10,000 qty ($100 payout) at 0.50 costs $1.50; at 0.30 or 0.70 $1.26; at 0.10 $0.54. Peak is 1.5% of payout at P = 0.5.
- **Maker credit**: `makerCredit` is the maker's share of the taker fee on the same fill: 0.5 on game markets, 0.7 on futures, paid in cash credits under the Maker Credit Program (in-game on straight contracts, every fill in NFL/NCAAF futures) (H, https://docs.novig.com/maker-credit-program).
- Other costs: card/Apple Pay deposit 3%; bank and stablecoin deposits no fee; withdrawal fees NOT FOUND (article lists methods and a $10 minimum only).
- The websocket `fill` event carries no fee; fetch `GET /v3/portfolio/fills` (field `fee` appears only on charged fills).

## 7. Resolution and dispute risk

- Settlement is by **contract specification** per series (PDFs listed at https://support.novig.com/en/articles/16083642-contracts for MLB/WNBA/UFC/NFL/PGA/MLS/ATP/WTA props, spreads, totals, winners; the PDFs are signed, expiring links and I did not read them, so per-sport void/overtime/DNP rules are **NOT FOUND**).
- Grades (H, https://docs.novig.com/api/concepts/event-lifecycle): `Winner` (WIN/LOSS), `Pushes` (collateral back), `FMV(price)` (each outcome pays its decimal price, prices in a market sum to 1.000). Each market voids one way, push or FMV, never both. Markets move OPEN > CLOSED > SETTLED.
- **Remediation can reverse a settlement**: the market returns to `CLOSED`, outcomes to `TBD`, then is regraded (H). Treat `SETTLED` as not final for a while; poll `/v3/history/markets?settledAfter=` for re-grades (`settledTs` moves forward).
- Rulebook (v1.3, https://support.novig.com/en/articles/16075446-ludlow-exchange-llc-rulebook, read from the PDF text):
  - Rule 6.2(d): Ludlow "has sole discretion to interpret a Contract's terms"; unresolved cases pay by last traded price, else the **Outcome Review Committee**, whose determinations are "final and not subject to review"; Ludlow may void a trade ab initio.
  - Rule 7.1: Market Outcome Review Process, decision within 24 hours, final. Rule 7.2: Ludlow may change Source Agency or adjust expiration (postponed/cancelled events).
  - Rule 5.8: a member may request review of a trade within 15 minutes and before expiration; Ludlow computes a fair value and a "No Cancellation Range" and may cancel or adjust trades outside it; decisions final. Rule 6.1(c): a trade rejected by the clearinghouse is void ab initio.
  - Combination contracts: a voided leg is valued at its last traded price (rule 6.2(c)); not refunded.
- Disputes: informal resolution, then mandatory arbitration in New York, class-action waiver (Member Agreement sections 22-25). No on-chain oracle or bond; the exchange is the oracle.
- **Cross-venue arbitrage consequence**: Novig voids postponed/suspended contests at FMV (last traded price) or pushes; Kalshi/Polymarket-style venues may refund or resolve differently. Do not treat a Novig leg and a counter-leg elsewhere as risk-free across postponements, abandoned games, overtime/DNP rules, or player-prop voids until the per-contract PDFs are compared.

## 8. Geo / ToS / automation

- Eligibility: 21+, physically in the US, not in Arizona, Michigan or Nevada; Rulebook also needs a US bank account (or foreign bank for non-US residents, but Novig's own pages say US-located) and identity/criminal-background verification (H: support "Rules, Legal Restrictions & Compliance"; Rulebook 3.1(c); Member Agreement 6.1.2). Trading is for the member's own account only (6.1.8).
- **API location checks** (H, https://docs.novig.com/api/api-keys#location-checks): every signed route runs an IP check (refuses restricted states and VPN/proxy/Tor/relay; "A data-center address is fine") and a "companion" check (the key holder's last device geolocation from the Novig app must exist, pass, and for placements be < 3 days old). Failure returns `451` with causes such as `GEOLOCATION_OUT_OF_BOUNDARY`, `GEOLOCATION_BLOCKED_NETWORK`, `GEOLOCATION_BLOCKED_SOFTWARE`, `GEOLOCATION_EXPIRED`. Cancels skip both checks. So an unattended bot needs the human to open the app at least every 3 days.
- **Automation is explicitly allowed through the official API**: Rulebook defines "API", lets members place and cancel via API (5.3(c)), requires "adequate controls ... to prevent excessive messaging" for automated functionality (5.3(a)(3)), applies an order-rate limiter, and obliges non-discriminatory access for independent software vendors (2.21). Prohibited: wash/prearranged/accommodation trades, spoofing, volume inflation, circumventing order handling (5.11) (H). The Member Agreement has no explicit bot/API clause (grep of the PDF text for api/automat/algorithm/bot found none; NOT FOUND).
- Account hygiene: one `management` key; 10 live subaccounts; one public key may be used only once across Novig; signed body capped at 8 KiB at the edge.
- Public unauthenticated routes: no ToS statement found either way (novig.com terms unreadable behind the captcha). Use modest polling (cache TTL is 5-15 s anyway) and prefer the websocket or the affiliate program for production-grade use.
- Position limits are set per contract (Rule 5.13), not published in what I read.

## 9. Liquidity (H unless noted; all derived from Novig's own public CSVs fetched 2026-10-19)

`dailyVolume` is in contracts that each pay $1, so summing it gives notional dollars of payout (premium staked by both sides together equals the same number). `openInterest` is in the same unit. My sums are in fixture `exchange_data_daily_summary_2026-09-01_to_2026-10-17.json`.

| Window | Total notional | Of which COMBO (parlay RFQ, no book) | Straight (order-book) notional |
|---|---|---|---|
| Sept 2026 (30 days) | $1,446,326,352 | $619,887,268 (42.9%) | ~$826.4M (~$27.5M/day) |
| 1-17 Oct 2026 (17 days) | $1,623,427,344 (~$95.5M/day) | $802,206,109 (49.4%) | ~$821.2M (~$48.3M/day) |
| Sat 2026-10-17 | $151,508,553 | $67,425,644 | ~$84.1M (NCAAF alone $60.9M, NFL $6.3M, NHL $4.2M, UFC $2.8M) |
| Mon 2026-10-12 | $85,731,703 | $43,186,747 | ~$42.5M |

- Open interest at close of 2026-10-17: $52.7M total, of which COMBO $32.5M, so straight-book OI ~$20.2M (NFL $12.5M, NCAAF $5.3M, MLB $0.8M, NHL $0.7M) (H). Total OI swings with the weekly cycle: $11.5M at close of Mon 2026-10-12 versus $52.7M on Sat 2026-10-17.
- Growth: Sept daily average $48M, Oct 1-17 average $95M; weekends are 2-3x weekdays. The Cleatz Sept figure ($1.45B) matches my sum, but Cleatz's own methodology is opaque (M).
- Unit check: the API's `qty` is 1-cent units, so a book level of `qty 10000` is $100 payout.
- **Book depth sample** (single point, NFL moneyline, game ~8 days away, fixture `public_catalog_market_book_depth5.json`): PHI best bid 0.295 (35,000 qty = $350 payout over two orders), DAL best bid 0.665 (10,700 qty = $107 payout); implied ask on PHI = 1 - 0.665 = 0.335 (4-cent wide). Five price levels each side held about $877 (PHI) and $447 (DAL) of payout. Pregame books far from kickoff are thin; depth builds near the start and is wiped at `GOLIVE` (M, one sample).
- DeFiLlama / TVL: not applicable (off-chain). Third-party aggregator coverage that confirms independent listing: River Markets lists Novig as one of five exchanges, AGG and Predictefy and Prediction Hunt list it (per this repo's `docs/research/14-platform-of-platforms.md`, M).

## 10. Event coverage and arbitrage overlap

- **Sports only** (H). Leagues from the public type list (38): NFL, NBA, MLB, NHL, NCAAF, NCAAB, NCAAWB, NCAABSB, WNBA, UFC, Boxing, CFL, MLS, FIFA Club World Cup, EPL, Bundesliga, Serie A, La Liga, Liga MX, Ligue 1, Champions League, Europa League, WTA, ATP, PGA, TGL, League of Legends, Counter Strike 2, Dota 2, WBC, FIFA World Cup, Olympics Hockey Men, KBO, NPB, UEFA Nations League, F1, NASCAR, ENTERTAINMENT. At the time of the probe `ENTERTAINMENT` had zero open events, and PGA, NCAAB, NASCAR, League of Legends, Counter Strike 2 and FIFA World Cup showed 0 (off-season or not yet listed). The help center's sports page lists football (pro/college/CFL), baseball, basketball, golf, hockey, tennis, MMA and mentions no politics, economics, crypto or weather markets (H).
- **No politics, macro, or crypto-price markets**: overlap with XO-style crypto/politics books is nil. Overlap exists only where another venue lists the same games: US pro and college football/basketball/hockey/baseball moneyline, spread and total lines, tennis match and set markets, UFC winner and distance, top soccer leagues, plus season futures (champion, MVP, division winners). That is where cross-venue price gaps with sports books on Kalshi, Polymarket (global/US), ProphetX and others would be found (M; those venues are covered by other workflows and I did not compare quotes).
- **Matching keys for the market-linking layer**: `league` + event `startsTs` + `description` ("Away @ Home" with full team names) + `marketType` + `strike` + `outcomeId` names (team codes). Moneyline `MONEY` markets carry `strike "0"`. For three-way soccer use the Yes side of each `MONEYLINE_3_WAY_*` market. `voids` and the per-contract PDF decide whether two listings are truly the same instrument.
- Fee asymmetry is useful for the scanner: pregame taker fills are fee-free at Novig; in-game taker fills pay up to 1.5% of payout, and everything resting is voided at go-live.

## 11. Liquidity shared with another venue?

**No evidence of shared liquidity; treat as an independent leg (M-H).**
- Own CLOB on a separately regulated exchange (Ludlow) with its own clearinghouse (Bitnomial); price-time priority; anonymous (H, Rulebook).
- The book is fed by retail takers, "EMM"/market makers who join through the API and Maker Credit Program, and RFQ liquidity providers for parlays (H, API docs). Professional market makers may quote the same game on several venues, so quotes are correlated but the books are separate.
- Other platforms (River Markets, AGG, Predictefy, Prediction Hunt) appear to route to or read Novig as a distinct venue, not as a mirror (M, from this repo's notes). No source describes Novig routing orders to Kalshi or Polymarket, or listing their contracts.
- Not verified: whether any other front end (a sportsbook or app) resells Ludlow contracts through the same book. Searched the Novig docs and help center only.

## 12. Adapter sketch (for the aggregator)

1. Poll `GET /v3/public/types/leagues` hourly; for each wanted league poll `GET /v3/public/catalog/events?league=...` (15 s cache) and `.../markets?league=...&marketType=MONEY,SPREAD,TOTAL` (paginate by `next`).
2. For each active market poll `.../markets/{id}/book?depth=20` (5 s cache) using `If-None-Match`; or, if you hold a `trading::read` key, subscribe to `book` on the websocket and keep `seq`-ordered state.
3. Normalise: price per outcome = best bid; **ask(A) = 1 - best bid(B)** for two-outcome markets; size = `qty / 100` USD payout (or contracts at $1); mark books empty/untradable when event `status` is not `OPEN_PREGAME`/`DELAYED` or market `status` is not `OPEN` (live books start empty after `GOLIVE`).
4. Net edge calculation must include taker fee `c*P(1-P)` only when `fee.charged` applies to the intended phase, and the 3% deposit fee if funded by card.
5. Keep the pagination cursor opaque, retry 429 using `Retry-After` when present, cap polling at a few requests per second per IP, and expect that the public routes could disappear or be keyed.
6. History/backtests: use `data.novig.com` `markets.csv` (OHLC, volume, OI by market per day) and `trades.csv` (tape), joining on `marketId`.

## 13. Not found / open questions

- DCM designation date and CFTC order for Ludlow: NOT FOUND (searched: cftc.gov DCM index page fetch; no web search available this run).
- novig.com Terms of Use: NOT FOUND (captcha-gated for scripted clients; not bypassed). Whether unauthenticated polling of `/v3/public/*` is permitted or needs an affiliate agreement: NOT FOUND.
- Public-route rate limit numbers: NOT FOUND (observed 429 after a ~13-request burst).
- Per-sport void, overtime and player-DNP rules: NOT FOUND (contract specification PDFs are expiring signed links, not read).
- Which chains/stablecoin networks Coinflow accepts: NOT FOUND in the article. Whether any deposit or withdrawal can be automated: NOT FOUND (and likely KYC-gated).
- Whether Novig's quoted `voids` field values are only `FMV`/`PUSH`: observed only `FMV` (NFL moneylines).
- Why Python `urllib` got a 403 while `curl` and Node `fetch` succeeded: not investigated.
- Quote-level comparison against Kalshi, Polymarket, ProphetX for the same games: not done (outside this task).

## 14. Suspicious content

None found. The docs, spec, help-center pages and PDFs contained no instructions aimed at AI agents. Hygiene note: the help-center PDF links are signed, time-limited URLs and are deliberately not recorded here.

## 15. Sources

- Novig API docs home https://docs.novig.com ; index https://docs.novig.com/llms.txt ; environments /api/environments ; account model /api/concepts/account-model ; universe model /api/concepts/universe-model ; event lifecycle /api/concepts/event-lifecycle ; order lifecycle /api/concepts/order-lifecycle ; money /api/concepts/money ; keys /api/api-keys ; signing /api/signing ; throttling /api/throttling ; catalog /api/catalog ; streaming /api/streaming/{connection,book,lifecycle,tape,private} ; fees /api/concepts/fees and /fees ; maker credit /maker-credit-program ; exchange data /public-data/{overview,trades,markets} ; affiliates /affiliates/{overview,odds-screens,futures} ; changelog /api-reference/changelog (all H, fetched 2026-10-19).
- OpenAPI 3.1 spec https://docs.novig.com/api-reference/spec-files/openapi-v3.json (H).
- Public endpoints: https://api.novig.com/v3/public/... (H, section 3). Bulk data: https://data.novig.com/reporting/trade-data/index.json and per-day CSVs (H).
- Help center https://support.novig.com/en/ : What is Novig (/articles/10336081), Sports available (/articles/10336189), Rules, Legal Restrictions & Compliance (/articles/15124242), Market Rules (/articles/9612523), Contracts (/articles/16083642), Bitnomial Clearinghouse Acknowledgement (/articles/16075420), Ludlow Rulebook (/articles/16075446, PDF v1.3), Ludlow Member Agreement (/articles/16075495, PDF v1.1), Payments (/collections/13999353-payments, /articles/12092529, /articles/15062817, /articles/16194062) (all H for what each page says; extracted partly through a summarising fetch tool, so quotes are short and unverified word-for-word except the PDF text I read directly).
- Ludlow site https://www.ludlowexchange.com/ (H, landing page only).
- Cleatz https://cleatz.com/prediction-market-revenue/ (M, aggregator page, updated 2026-09-22). This repo's `docs/research/14-platform-of-platforms.md`, `10-aggregation-landscape.md`, `16-linking-methods-services.md` for third-party venue lists (M).
- DeFi Rate claim in the task hint ("approved but not yet trading"): not fetched; contradicted by the primary data above (L, stale).

## 16. Fixtures (`docs/research/fixtures/novig/`)

- `public_types_{sports,leagues,markets,event-statuses}.json`: public type lists (production).
- `public_catalog_events_NFL_limit3.json`, `public_catalog_markets_NFL_MONEY_limit2.json`, `public_catalog_market_single.json`, `public_catalog_market_book_depth5.json`, `public_catalog_market_trades_limit5.json`, `public_catalog_events_ENTERTAINMENT_empty.json`: live samples from `api.novig.com/v3/public/*` on 2026-10-19 (event descriptions contain a literal "@" meaning "at", not an email).
- `exchange_data_index.json`, `exchange_data_markets_2026-10-17_sample.csv` (15 rows chosen by me), `exchange_data_trades_2026-10-17_head.csv` (first 25 rows via HTTP Range).
- `exchange_data_daily_summary_2026-09-01_to_2026-10-17.json`: my own derived daily totals (see section 9), not an official Novig statistic.
