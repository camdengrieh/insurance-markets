# 08. Read-side integration spec: Polymarket (global + US) and Kalshi

Task: `venues-polymarket-kalshi`. Researched 2026-10-19 (sample responses captured 2026-10-18 ~17:30-17:50 UTC). Read-only: public unauthenticated GETs and official docs only. No keys created, nothing signed, no PayBox tool called, no third-party code run.

Confidence tags: **H** = read first-hand in a primary source this session (path/URL cited); **M** = secondary, inferred, or a vendor/press source; **L** = weak or stale (>6 months old or contradicted). "NOT FOUND (searched: ...)" marks a documented absence. The plan's own XO and PayBox claims were treated as unverified leads and are not repeated here as findings.

Stale-source flags (older than 6 months relative to 2026-10-19): Kalshi Developer Agreement PDF (S3 `Last-Modified` 2023-11-09); Kalshi help article "Can I trade on Kalshi from outside the United States?" (dated 2026-03-20, about 7 months). Both are flagged where used.

---

## 0. Headline findings

1. **Polymarket changed a lot in 2026.** CLOB V2 went live on `clob.polymarket.com` on 2026-04-28; collateral is now **pUSD** (an ERC-20 on Polygon, 6 decimals, backed by USDC), not USDC.e; there are two position ledgers (CTF `clobTokenIds` and "Polymarket Protocol V2" `positionIds`) selected by a per-market `version` field; **Data API v1 is retired on 2026-10-24** (5 days from today) and v2 has a different envelope, casing and pagination. Anything written from 2024-25 memory is wrong in several places. [H]
2. **Order-book array ordering differs by venue, and the docs/spec disagree with themselves in places.** Polymarket CLOB: bids ascending, asks descending, **best level is the LAST element** (docs + live). Kalshi: `yes_dollars` / `no_dollars` bid arrays ascending, **best bid is last** (guide + live), although the OpenAPI text says "best to worst". Polymarket US: best first. XO: best first (live). A normaliser must sort explicitly. [H]
3. **Polymarket `GET /price?side=BUY` returns the best BID** (and `SELL` the best ask). It is the opposite of what a taker pays. Use `SELL` for the price to buy at. Confirmed by the OpenAPI description and two live reads. [H]
4. **Kalshi forbids what an aggregator does, unless authorized.** Developer Agreement v1.1 section 3: API use is limited to "facilitating a members own trading"; section 3.1 prohibits "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading" and sharing it with third parties without written authorization; section 3.2 prohibits "Facilitating trading or account creation by other members". The PDF is from 2023 (possible staleness) and it is unclear whether anonymous public reads count as "API use", but a multi-user hosted aggregator is squarely the risky case. Written authorization from Kalshi is a prerequisite to flag. [H for text, L for currency]
5. **Execution legality is a hard flag.** Polymarket (global) lists the US as close-only on both frontend and API, and its site makes users attest they are "not (i) a U.S. person". Polymarket US is a separate CFTC-regulated, fiat, SSN-KYC venue "Built for US residents". Kalshi is a US DCM that now accepts many foreign countries but has a restricted-jurisdiction list and, since 2026-08, a location attestation that gates API-key trading in Sports/Elections/Entertainment. XO restricts US/UK/France/Singapore/Ontario. A person can be eligible on all of Polymarket-global + Kalshi only if resident outside both venues' restricted lists, which excludes the US. See section 8. [H]
6. **Geoblocking is by request IP.** Polymarket's `GET https://polymarket.com/api/geoblock` reports on "the requesting IP address". An order submitted from a hosted plugin or server reports the server's IP, not the user's. Submitting orders server-side on behalf of a user in a restricted jurisdiction would amount to the circumvention Polymarket's attestation prohibits. [H for the endpoint behaviour, M for the inference about server-side submission]
7. **A same-looking pair is not the same contract.** The Senate-control pair I sampled (Polymarket vs Kalshi) has different rule text (Polymarket: VP tie-break, independents caucus, may stay open to 4 Jan; Kalshi: may be "determined early based on a consensus of media calls", else President pro tempore on 1 Feb 2027). Gross prices were within 1 cent, and net of fees the paired trade is negative (worked example in 5.3). Cross-venue "edge" must be gated on a rules comparison, not a title match. [H]
8. **Public data access is uneven.** Polymarket (Gamma, CLOB reads, Data API v2, market WebSocket) is fully public. Kalshi REST market data is public, but **its WebSocket requires API-key auth even for public channels**. Polymarket US REST market data (`gateway.polymarket.us`) is public, but both its WebSockets are on the authenticated host. [H]
9. **XO's read API is close to Polymarket-CLOB-shaped, its write path is not signature-compatible.** Shared: path names, JSON field names, WS event vocabulary, L1 `ClobAuth` EIP-712 struct and domain name, HMAC L2 recipe, fee curve `C * rate * p * (1-p)`, `LTE=` cursor sentinel. Different: header prefix (`XO_*`, though XO's own docs also say `POLY_API_KEY`), order EIP-712 domain and typehash, accepted signature type (smart account only), book ordering, tick size, neg-risk. One read adapter with per-venue config can cover both; one signer cannot. See section 7. [H]
10. **Polygon is announced as a PayBox network, not verified at tool level.** MoonPay's 2026-07-29 newsroom post lists Polygon among launch chains [M]. PayBox's `request_wallet_sign` supports a `typedData` (EIP-712) intent [H, tool schema], which is what Polymarket's `ClobAuth` and `Order` signing need. I did not call `discover_tokens(mode=chains)` because this task did not authorize PayBox calls. See section 9.

---

## 1. Relation to the plan's feasibility gate

This task covers venues other than XO, so it does not answer the gate directly. What it adds:

| Gate item | Contribution from this task |
|---|---|
| 1 auth/credentials | XO's L1/L2 auth is the same shape as Polymarket's (EIP-712 `ClobAuth` mints an `{apiKey, secret, passphrase}` triplet; HMAC thereafter). So the same per-user-secret problem applies; this task did not resolve where a plugin can hold it. |
| 2 order flow | XO and Polymarket both use signed-EIP-712 order payloads POSTed to a CLOB. Pattern is prepare -> `request_wallet_sign(typedData)` -> submit. For XO the typed data is Kernel-wrapped (hash only), so PayBox cannot show the order contents. |
| 4 chain support | Polygon appears in MoonPay's launch chain list [M]. XO chain 3223 not examined here. |
| 7 terms/jurisdictions | Documented for Polymarket, Polymarket US, Kalshi and (from XO's ToS) XO in section 8. |
| 8 sign-then-submit | Polymarket confirms the pattern is normal for CLOBs; whether autonomous grants auto-sign plugin proposals remains unresolved. |
| 3, 5, 6, 9 | Not addressed by this task. |

---

## 2. Polymarket (global)

### 2.1 Hosts

| Surface | Base URL | Auth for read | Source |
|---|---|---|---|
| Gamma (events, markets, search, tags) | `https://gamma-api.polymarket.com` | none | docs `getting-started/api`, OpenAPI `gamma-openapi.yaml` [H] |
| CLOB REST (books, prices, tick, fee, market info) | `https://clob.polymarket.com` | none for market data; L2 for orders/own trades | [H] |
| Data API v2 (trades, positions, resolutions, tokens, price history) | `https://data-api.polymarket.com/v2` | none ("No API key or authentication is required") | docs `api-reference/data-api/overview` [H] |
| Data API v1 | `https://data-api.polymarket.com` | none | **retired 2026-10-24** [H] |
| Market WebSocket | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | none | [H] |
| User WebSocket | `wss://ws-subscriptions-clob.polymarket.com/ws/user` | L2 creds | [H] |
| PolyBolt (crypto/equity reference prices) | `wss://ws-live-v2.polymarket.com/ws` | CLOB API credentials | changelog 2026-09-15 [H] |
| RTDS (legacy reference prices, comments) | `wss://ws-live-data.polymarket.com` | none | legacy for prices [H] |
| Bridge | `https://bridge.polymarket.com` | none | [H] |
| Relayer | `https://relayer-v2.polymarket.com` | Relayer/Builder key | [H] |
| Geoblock check | `https://polymarket.com/api/geoblock` | none | [H] |

### 2.2 Endpoint catalogue for a read-side adapter

| Need | Method + URL | Notes |
|---|---|---|
| List markets | `GET gamma /markets/keyset?closed=false&limit=100&after_cursor=` | Keyset pagination, `limit` max 100 (changelog 2026-05-14), response `{markets, next_cursor}`; `next_cursor` omitted on last page. Legacy `GET /markets` uses `limit`/`offset`. Filters include `slug[]`, `condition_ids[]`, `clob_token_ids[]`, `tag_id`, `end_date_min/max`, `volume_num_min`, `liquidity_num_min`, `uma_resolution_status`. [H] |
| List events | `GET gamma /events/keyset?closed=false&limit=&after_cursor=` (also `/events`) | Event carries nested `markets[]`. Filters `tag_slug`, `tag_id`, `title_search`, `series_id`, `live`, `featured`. [H] |
| Search | `GET gamma /public-search?q=<text>&limit_per_type=&page=&events_status=` | Returns `{events, tags, profiles, pagination{hasMore,totalResults}}`; events embed full market objects (a `limit_per_type=2` query returned about 200 KB, so trim before storing). [H] |
| Single market | `GET gamma /markets/slug/{slug}`, `/markets/{id}`; CLOB `GET /clob-markets/{condition_id}`; `GET /markets-by-token/{token_id}` | CLOB market info uses abbreviated keys (see 2.9). [H] |
| Single event | `GET gamma /events/slug/{slug}`, `/events/{id}` | [H] |
| Order book | `GET clob /book?token_id=` ; batch `GET /books?token_ids=a,b` or `POST /books` body `[{"token_id":..}]` | Batch size cap NOT FOUND (searched OpenAPI + docs). Response has `hash` for change detection. [H] |
| Best bid / ask | `GET clob /price?token_id=&side=BUY\|SELL` ; batch `/prices` | **`BUY` = best bid, `SELL` = best ask** [H]. |
| Mid / spread | `GET clob /midpoint`, `/spread` (batch `/midpoints`, `/spreads`) | [H] |
| Last trade price | `GET clob /last-trade-price?token_id=` ; batch `/last-trades-prices` | Returns `{"price":"0.5","side":""}` default when no trades (per OpenAPI). [H] |
| Public trades | `GET data /v2/trades?condition=<id>[,..]&limit=&cursor=` | CLOB `GET /data/trades` is the caller's OWN trades (needs L2). Rows include trader wallet/pseudonym (redacted in my fixture). [H] |
| Price history | `GET data /v2/prices-history?token_id=&interval=1d\|1w\|1m\|max&bucket_seconds=&limit=&cursor=` (also `start`/`end` or `as_of`) | Replaces the CLOB-hosted `GET /prices-history`, which still answered 200 on 2026-10-18 (legacy). Explicit `start`/`end` windows capped at 15 days; `max` is 12-hour buckets by default; 1-min data kept at least 7 days, 5-min 60 days, 30-min 90 days; 3h/12h permanent. [H] |
| Resolution status | Gamma market `umaResolutionStatus` (v1) / `resolutionStatus` (`inactive\|active\|resolved`, v2); `GET data /v2/resolutions?condition=` | `/v2/resolutions` is cached up to 5 s while live, 10 min once resolved; has `expected_settlement_time` + `settlement_time_basis` (2026-09-28). [H] |
| Token <-> market lookup | `GET data /v2/tokens?token_id=<up to 50>` or `?condition=` | Returns condition, module (`v1_ctf` or a V2 module), outcome slot, opposite token, neg-risk ids, resolved/final price. [H] |
| Tick size | `GET clob /tick-size?token_id=`; WS `tick_size_change` | Tick can change at runtime. [H] |
| Fee info | Gamma market `feesEnabled` + `feeSchedule`; CLOB `/clob-markets/{cid}` field `fd`; `GET /fee-rate?token_id=` | See 2.7 for why `/fee-rate` is not the fee. [H] |
| Server time | `GET clob /time` (bare unix seconds) | [H] |
| Health | `GET gamma /status`, `GET data /v2/status` | [H] |

### 2.3 Identity scheme

| Level | Identifier | Notes |
|---|---|---|
| Event | numeric `id`, `slug` (URL slug), `negRiskMarketID` for neg-risk groups | `GET /events/slug/{slug}` |
| Market | Gamma numeric `id`, `slug`, **`conditionId`** (0x + 64 hex), `questionID`, `groupItemTitle` | `conditionId` is the stable cross-API key; user-stream `markets` and market-wide cancels also use it. |
| Outcome (tradable asset) | **`clobTokenIds[i]`** (JSON-encoded string array) for `version:"v1"` markets, **`positionIds[i]`** (array) for `version:"v2"` markets; same index as the JSON-text `outcomes` array | Docs: "Choose the ID field by `version`, even when both fields are present." My v1 sample had both fields populated. Asset ids are decimal U256 strings; keep as strings. |

Gotchas, observed in a 100-market sample sorted by 24h volume (2026-10-18): all 100 had `version:"v1"` (no V2 market in the top 100), so the V2 path is documented but not exercised in my samples [H]. Only **48 of 100** had outcomes `["Yes","No"]`; others were `["Over","Under"]` (10), team names (e.g. `["Panthers","Eagles"]`, 7+), esports teams. **Do not assume Yes/No labels; use outcome index.** [H]

Data API v2 `/v2/tokens` returned `outcome_index: 1` and `clob_index: 0` for a "Yes" token. Map outcomes by `clob_index` / Gamma array order, not `outcome_index` (CTF index-set semantics differ). [H, one sample]

### 2.4 Binary and multi-outcome representation

- Each market is binary with two outcome tokens, each with its **own order book** (a Yes book and a No book). A complete set (1 Yes + 1 No) is backed by 1 pUSD; split/merge/redeem operate on sets. [H, docs `concepts/positions-tokens`]
- Multi-outcome events are an event with N binary markets. If mutually exclusive they are a **negative-risk group**: event `negRisk: true`, `negRiskMarketID`, markets `negRisk: true`; "A No share in any market can be converted into 1 Yes share in every other market." Augmented neg-risk adds placeholder/unnamed outcomes and an explicit "Other"; docs warn: "Only trade on named outcomes." `negRiskOther` marks the Other market. [H]
- Consequence for an aggregator: in a neg-risk event, the sum of Yes mid prices should be about 1; a no-arbitrage check within the event is possible using the conversion identity (1 No = all other Yes). Do not assume unnamed placeholder outcomes are tradable or priced.
- Executable Yes-buy price can come from the Yes ask or from the No bid via complement (1 - No bid) because complementary orders match at p and 1-p ("`$0.60` + `$0.40` = `$1.00`, the orders match"). Fetch both tokens' books and take the better synthetic price. [H for matching rule, M for exact book presentation]

### 2.5 Prices, sizes, ticks

- Prices are decimal strings in [0,1] USD per share (`"0.38"`); sizes are decimal strings in shares (`"849398.71"`). Book timestamps are stringified **milliseconds**; `GET /time` is seconds. [H]
- Tick size is per market: sample of 100 markets: 0.01 (65), 0.001 (35); World Cup markets use 0.0025 (changelog 2026-07-02). Min order size observed `5` (`orderMinSize`/`min_order_size`); the market-details doc describes `orderMinSize` as "in USDC" while the book returns `min_order_size: "5"`; unit unresolved, treat as shares until confirmed. [H for values, L for unit]
- Displayed "price" in UI is the midpoint unless spread > $0.10, then last trade. Gamma `outcomePrices` / `lastTradePrice` are not executable prices. [H]
- Some markets add a taker delay: 250 ms on selected crypto/finance up-down markets (crypto lowered to 50 ms 2026-08-17, then raised to 150 ms 2026-09-04); sports markets have a seconds-long `delayed` window. Sports resting orders auto-cancel at game start. [H]

### 2.6 Pagination and rate limits

| Surface | Pagination | Limit (per IP, Cloudflare, sliding 10 s window) |
|---|---|---|
| Gamma keyset | `after_cursor` / `next_cursor`; `offset` rejected | general 4,000/10s; `/events` 500/10s; `/markets` 300/10s; markets+events listing 900/10s; `/public-search` 350/10s [H] |
| Gamma legacy | `limit`/`offset` | same |
| CLOB market data | n/a | `/book` 1,500/10s; `/books` 500/10s; `/price` 1,500/10s; `/prices` 500/10s; `/midpoint` 1,500/10s; `/prices-history` 1,000/10s; tick size 200/10s; general 9,000/10s [H] |
| Data API v2 | opaque signed cursor, no `offset`; `has_more` exact | general 800/10s; `/v2/trades` 300; `/v2/prices-history` 200; `/v2/status` 100 [H] |
| Data API v1 | `limit`/`offset` (offset stops at 10,000) | 1,000/10s general; retired 2026-10-24 |

Cloudflare throttles (delays/queues) rather than rejecting; Data API v2 signals load with `429` + `Retry-After`. A separate per-signer token-bucket for order/cancel requests ("warning mode" from 2026-07-24 for two weeks; whether live enforcement has started: NOT FOUND, searched `trading-rate-limits` page) does not affect reads. [H]

### 2.7 Fees

- Formula (docs `trading/fees`): `fee = C x feeRate x p x (1 - p)`; "Makers are never charged fees. Only takers pay fees." Fees rounded to 5 decimals, minimum 0.00001 USDC. BUY fees add to collateral spend, SELL fees are deducted from proceeds (V2 API migration page). [H]
- Docs category table (taker rate / maker rebate): Crypto 0.07/20%; Sports 0.05/15%; Finance 0.04/25%; Politics 0.04/25%; Economics/Culture/Weather/Other 0.05/25%; Mentions 0.04/25%; Tech 0.04/25%; **Geopolitics 0**. No fee to deposit/withdraw USDC on Polymarket's side. [H]
- **The per-market live value is authoritative.** Gamma returns `feesEnabled` and `feeSchedule {rate, exponent, takerOnly, rebateRate}`. In the 100-market sample: 12 markets `feesEnabled:false`; 88 with `exponent:1` and rates 0.03 (36), 0.04 (7), 0.05 (42), 0.07 (3). The docs say Sports went 0.03 -> 0.05 on 2026-07-10, yet 31 live markets still carried `0.03 / rebate 0.15`, so the docs table and live data diverge (cause unknown). Read `feeSchedule` per market and refresh it. [H]
- `exponent` is documented as "Exponent applied to the price component of the fee curve"; all sampled values were 1, so the formula reduces to `rate * p * (1-p)`. Behaviour for exponent != 1 is not documented precisely (assume `(p(1-p))^exponent`, **M**).
- `GET /fee-rate?token_id=` returned `{"base_fee":1000}` for a market whose `feeSchedule.rate` is 0.04, and `/clob-markets` returned `mbf:1000, tbf:1000` with `fd:{r:0.04,e:1,to:true}`. The OpenAPI says "Base fee in basis points" but 1000 bps (10%) is not the charged fee. Treat `/fee-rate` / `mbf` / `tbf` as legacy signing-era fields and **use `fd` / `feeSchedule`**. [H for the values, M for the interpretation]
- How fees enter an edge calculation: see 5.3. Taker rebate and maker rebate programs exist but depend on the account (not modelled in a read adapter).

### 2.8 Collateral and settlement

- Collateral: **pUSD** ("Polymarket USD"), standard ERC-20 on **Polygon mainnet (chain 137)**, **6 decimals**, "backed by USDC" with wrap/unwrap through `CollateralOnramp` / `CollateralOfframp` (USDC.e <-> pUSD). Settlement is on-chain: off-chain operator matching, on-chain settlement through exchange contracts; positions are ERC-1155 (CTF ledger or V2 PositionManager). [H]
- Contract set (public, Polygon): pUSD `0xC011...2DFB`, ExchangeV3 `0xe333...00Aa` (V2 markets, EIP-712 domain version "3"), CTF Exchange `0xE111...996B` and Neg Risk CTF Exchange `0xe222...0F59` (domain version "2"), PositionManager `0x006F...9fEF`. Full list on `docs.polymarket.com/resources/contracts`. [H]
- Deposit: Bridge API converts deposits from Ethereum, Polygon, Arbitrum, Base, Optimism, BNB, Solana, Bitcoin, Tron, HyperEVM, others into pUSD on Polygon (min about $2, Ethereum $7). [H]

### 2.9 CLOB `clob-markets/{condition_id}` abbreviated keys (decoded)

From the OpenAPI `ClobMarketDetails`: `t` tokens `[{t: token_id, o: outcome}]`, `c` condition id, `mos` min order size, `mts` min tick size, `mbf`/`tbf` maker/taker base fee bps, `fd` fee details `{r rate, e exponent, to taker-only}`, `rfqe`, `itode` taker order delay enabled, `ibce`, `oas` min order age seconds, `gst` game start time. Other keys seen live (`ao`, `nr`, `cbos`, `aot`, `v`, `r`) are only partly described: `nr` appears to be neg-risk and `v` the version, `ao` accepting orders [M, inferred from values]. [H for the response, M for undocumented keys]

### 2.10 Resolution and dispute risk

- Two resolution sources: **UMA Optimistic Oracle** for prediction markets and **Chainlink TWAP** for up/down markets. Flow: proposal with a bond ("typically $750 pUSD" per docs) -> 2-hour challenge period -> if disputed, re-proposal -> second dispute escalates to UMA DVM token vote. Undisputed about 2 h; disputed 4-6 days. A 50/50 outcome is possible ("Unknown/50-50": each token redeems $0.50). [H]
- The docs' bond figure is not universal: the Senate market's Gamma record showed `umaBond:"10000"`, `umaReward:"10"`. [H]
- Polymarket Protocol V2 routes results via an `OracleAggregator` receiving from `OOReporterModule`, `ChainlinkReporterModule` and an `EOAReporterModule` (contract list). The role of the EOA reporter (manual/admin resolution) is not described in the pages I read. [H for names, NOT FOUND for semantics (searched contracts + migrate pages)]
- Dispute frequency: only secondary reports (e.g. a claim of "1,150 disputes since 2026" and Polymarket's rebuttal of "0.2%" of contracts; the March 2025 Ukraine-minerals UMA whale vote, which Polymarket itself acknowledged as an incorrect outcome). Treat counts as **L**; the qualitative risk (non-trivial, tail-heavy, long lock-up when disputed) is well attested. [L/M]
- Live state example: the Arsenal match market had `umaResolutionStatus:"proposed"` while still trading at 0.9995 on the day of the match, so "closed=false and acceptingOrders=true" does not mean "unresolved". Trade-ready check per docs: `active && !closed && acceptingOrders`. [H]

### 2.11 Automation, terms, geography

- Geography (docs `api-reference/geoblock`): OFAC jurisdictions blocked completely (IR, SY, CU, KP, Crimea/Donetsk/Luhansk). **Close-only on frontend and API** includes AU, BE, BR, CA-ON/BC/AB/QC, FR, DE, IT, PL, RU, SG, TW, TH, GB, **US**, UM, VE and others; close-only on the frontend only: IE, JP, MT (sports), NL, KR. "Close-only means users can close existing positions but cannot open new ones." Gamma `restricted: true` marks a market geo-restricted for some jurisdictions (set on the Arsenal sports market). [H]
- Site attestation (embedded in the polymarket.com page payload, 2026-10-18): users attest they are "not (i) a U.S. person; (ii) located in the United States, France or other restricted jurisdiction; and (iii) using a VPN or other measures to circumvent". Wallets can be put in close-only for non-compliance. [H]
- Bots/automation: the Terms of Use body could not be retrieved (client-rendered; `WebFetch` and raw HTML gave only a navigation shell). `integrity.polymarket.com` (read through a summarising fetch, so **M**) lists wash trading, spoofing, self-dealing, front-running and insider trading as prohibited and does not address automated/bot trading or API use; the API docs openly document direct integration (SDKs, market-making guide, builder program). Explicit bot clause: **NOT FOUND** (searched ToS page, integrity page, docs index). Co-location "is not available to Builder Program participants or third-party applications executing trades on behalf of end users." [H]
- Data redistribution terms for Gamma/CLOB/Data API: **NOT FOUND** (same searches). Public docs publish "No API key or authentication is required" and CORS `*` on `/v2`, which suggests open access, but that is not a licence.

### 2.12 WebSocket (public market channel)

Connect `wss://ws-subscriptions-clob.polymarket.com/ws/market`, send text `PING` every 10 s (server `PONG`), subscribe `{"assets_ids":["<asset_id>"],"type":"market"}`; add `"custom_feature_enabled":true` for `best_bid_ask`, `new_market`, `market_resolved`. Events: `book` (full snapshot, `hash`), `price_change` (with `best_bid`/`best_ask`), `last_trade_price`, `tick_size_change`. Add/remove assets live with `{"assets_ids":[..],"operation":"subscribe"|"unsubscribe"}`. Use the same asset id selected by `version`. [H]

### 2.13 Verified response shapes (live, 2026-10-18)

See section 11 for curl lines and fixture paths. Observed:

1. **Gamma market** (`/markets/slug/...`): strings for `outcomes`, `outcomePrices`, `clobTokenIds` (JSON text); numbers for `orderPriceMinTickSize` (0.01), `orderMinSize` (5), `volumeNum`; `feeSchedule {exponent:1, rate:0.04, takerOnly:true, rebateRate:0.25}`; `negRisk:true`; `umaBond:"10000"`; nested `events[]` with `negRiskMarketID`. About 100 top-level keys.
2. **CLOB book**: `{market, asset_id, timestamp:"1792344875523", hash, min_order_size:"5", tick_size:"0.01", neg_risk:true, last_trade_price:"0.380", bids[30], asks[54]}`; `bids[0]=0.01` ... `bids[-1]=0.37`; `asks[0]=0.99` ... `asks[-1]=0.38` (**best last**).
3. **Data API v2 trades**: envelope `{data:[{side, token_id, condition_id, size, price, timestamp, outcome, outcome_index, transaction_hash, ...}], pagination:{limit, offset, has_more, next_cursor}}`; numbers are JSON numbers (`price: 0.3799999982`), snake_case.
4. Also captured: Gamma events keyset (`{events, next_cursor}`), `/public-search`, CLOB `clob-markets`, scalar endpoints, CLOB and v2 price history (`{history:[{t,p}]}` vs `{data:[{timestamp,price,resolution_seconds}], pagination}`), v2 resolutions (`status:"posed"`), v2 tokens.

---

## 3. Polymarket US (separate CFTC-regulated venue)

It exists. Docs: `https://docs.polymarket.us/`. [H]

| Item | Finding |
|---|---|
| What it is | "Polymarket US is a fiat-based, US-regulated platform operating as a designated contract market (DCM) and derivatives clearing organization (DCO) under CFTC oversight. All trading is conducted in US dollars." Card text: "Fiat-based, CFTC-regulated exchange. Trades in USD. Built for US residents." [H] |
| Hosts | Public: `https://gateway.polymarket.us` (no key). Authenticated: `https://api.polymarket.us` plus `wss://api.polymarket.us/v1/ws/private` and `wss://api.polymarket.us/v1/ws/markets` (both need a key). Institutional REST/gRPC/FIX API also exists on `polymarketexchange.com` (not examined). [H] |
| Public endpoints (OpenAPI schemas under `/api-reference/oapi-schemas/`) | `GET /v1/markets` (filters `slug[]`, `id[]`, `active`, `closed`, `archived`, `volumeNumMin`, date ranges; `limit`/`offset`), `GET /v1/market/slug/{slug}`, `/v1/market/id/{id}`, `GET /v1/markets/{slug}/book`, `/v1/markets/{slug}/bbo`, `/v1/markets/{slug}/settlement`, `GET /v1/events`, `/v1/events/slug/{slug}`, `/v1/events/{id}`, `GET /v1/search?query=`, `GET /v1/price-history?symbol=<slug>&fixedInterval=|timestamp.startTimestamp=&fidelity=`, series, sports, tags. **Public trade tape: NOT FOUND** (searched the OpenAPI path list and llms index; trades appear only on the authenticated WS and RFQ trades). [H] |
| Auth for read | None for gateway; signed `X-PM-Access-Key` / `X-PM-Timestamp` (ms, within 30 s) / `X-PM-Signature` (Ed25519 over `timestamp+method+path`) for the authenticated API. Keys come from `polymarket.us/developer` after identity verification in the iOS app; docs mention an invite code. [H] |
| Rate limit | "general limit of 25 requests/s", enforced "per source IP and Cloudflare location"; RFQ/combos 1 req/s. `429` -> backoff. [H] |
| Identity | Market `slug` (e.g. `scc-senate-demst-2026-11-03-gte45`) and numeric `id`; event `slug`/`id`; `marketSides[]` carry `identifier`, `long`, `description`. **One instrument per market (the YES side)**; "To trade against an outcome, you sell YES." [H] |
| Units | Prices are objects `{"value":"0.9850","currency":"USD"}` (4-decimal strings), quantities strings. Tick 0.01 or 0.001 (`orderPriceMinTickSize`). Book fields: `bids[]`, `offers[]` with `px`/`qty`, **best first**. BBO: `bestBid`, `bestAsk`, `lastTradePx`, `currentPx`, `sharesTraded`, `openInterest`, `state` (`MARKET_STATE_OPEN`, pre-open/suspended/halted/expired per docs). [H] |
| Fees | Taker `0.0695 x C x p x (1-p)` (table-tennis 0.10); maker rebate flat -0.0125 until **2026-10-19 1:00 PM ET**, then 4 volume tiers (-0.0035 / -0.0070 / -0.0104 or none below $10M monthly maker volume); taker rebate tiers 3%-30% by prior-month volume; combo fills carry no maker rebate. [H] |
| Collateral | USD (bank/card/Apple Pay/PayPal/Venmo/wire/USDC deposits through the app). Not an on-chain venue; an EVM wallet can only fund it by depositing USDC through the app flow. [H] |
| Resolution | Exchange determines the result from sources listed in each market's rules (government, league, CF Benchmarks index, named news outlets); "All resolutions are final in accordance with the Polymarket US Exchange Rulebook". Rulebook not read. [H/NOT FOUND for dispute procedure] |
| Eligibility | KYC with legal name, address, date of birth and **Social Security number**; "You must complete KYC before you can deposit funds or trade." Market-integrity policy bars trading on confidential information; some contracts bar MNPI holders and sports participants. [H] |

Implication: Polymarket US is a venue for US-resident individuals/institutions only, with a different market set (sports-heavy), different identity (slug), and different auth. It should be a separate adapter, not a mode of the global one.

---

## 4. Kalshi

### 4.1 Hosts and versions

| Item | Value |
|---|---|
| REST (production) | `https://external-api.kalshi.com/trade-api/v2` (dedicated; documented 2026-05-07). The shared host `https://api.elections.kalshi.com/trade-api/v2` "also supported". Both answered `GET /exchange/status` 200. [H] |
| WebSocket (production) | `wss://external-api-ws.kalshi.com/trade-api/ws/v2` (shared `wss://api.elections.kalshi.com/trade-api/ws/v2` also supported) [H] |
| Demo | `https://external-api.demo.kalshi.co/trade-api/v2`, `wss://external-api-ws.demo.kalshi.co/trade-api/ws/v2` [H] |
| Version | Path prefix `/trade-api/v2`; OpenAPI document version **3.34.0** (`docs.kalshi.com/openapi.yaml`). API date-versioning was removed in 2025 (changelog "Removed API versioning", 2025-07-29). 358 changelog entries; subscribe to `docs.kalshi.com/changelog/rss.xml`. [H] |
| Other surfaces | FIX; a separate **Margin/Perps exchange** (`/trade-api/v2/margin/...`, own rate buckets) added in 2026; out of scope. [H] |

### 4.2 Endpoint catalogue (all unauthenticated unless noted)

| Need | Method + path | Notes |
|---|---|---|
| List markets | `GET /markets?status=open&limit=&cursor=&series_ticker=&event_ticker=&tickers=&mve_filter=exclude\|only` | `limit` default 100, max 1000; `cursor` pagination; `status` filter values `unopened, open, paused, closed, settled` (map to market statuses `initialized, active, inactive, closed, finalized`); one status per call; timestamp filters (`min_created_ts`, `min_updated_ts`, close/settled ts) are mutually exclusive with some status filters. [H] |
| List events | `GET /events?status=&series_ticker=&with_nested_markets=true&limit=<=200&cursor=` | Excludes multivariate events; use `/events/multivariate`. `GET /events/{event_ticker}?with_nested_markets=true&exclude_markets=true` (2026-10-15). [H] |
| Series | `GET /series`, `GET /series/{series_ticker}` | Carries `fee_type`, `fee_multiplier`, `settlement_sources`, `contract_url`, `additional_prohibitions`. [H] |
| Search | **NOT FOUND**: no free-text market search endpoint (searched all OpenAPI paths for `search`: only `/search/filters_by_sport` and `/search/tags_by_categories`). An aggregator must crawl `/series`, `/events`, `/markets` and index locally (which section 4.9 says may be restricted). | |
| Single market | `GET /markets/{ticker}` | [H] |
| Order book | `GET /markets/{ticker}/orderbook?depth=<=100`; batch `GET /markets/orderbooks?tickers=a,b,...` (max 100) | Response `{orderbook_fp:{yes_dollars:[[price,count],..], no_dollars:[..]}}`, **bids only**, ascending, **best last**. [H] |
| Best bid / ask / last | Market object: `yes_bid_dollars`, `yes_ask_dollars`, `no_bid_dollars`, `no_ask_dollars`, `yes_bid_size_fp`, `yes_ask_size_fp`, `last_price_dollars`; or derive from the book | `yes_ask = 1 - best no bid` [H] |
| Trades | `GET /markets/trades?ticker=&min_ts=&max_ts=&limit<=1000&cursor=&is_block_trade=` | Rows: `trade_id, ticker, yes_price_dollars, no_price_dollars, count_fp, taker_side, taker_outcome_side, taker_book_side, is_block_trade, created_time`. Older data: `GET /historical/trades`. [H] |
| Price history | `GET /series/{series}/markets/{ticker}/candlesticks?start_ts=&end_ts=&period_interval=1\|60\|1440`; batch `GET /markets/candlesticks?market_tickers=<=100&...` (max 10,000 candles); events: `GET /series/{s}/events/{e}/candlesticks`; settled-before-cutoff markets: `GET /historical/markets/{ticker}/candlesticks` | `period_interval=240` returned HTTP 400 (only 1, 60, 1440 are valid). [H] |
| Resolution status | Market `status` (`initialized, inactive, active, closed, determined, disputed, amended, finalized`), `result` (`yes\|no\|scalar`), `settlement_value_dollars`, `settlement_ts`, `settlement_timer_seconds` | [H] |
| Exchange health / schedule | `GET /exchange/status` (per `exchange_index` shard status), `GET /exchange/schedule` | Live `exchange_index_statuses`: 0 Default, 1 Combos, 2 Crypto & Commodities, 3 Tennis/Baseball/Basketball. [H] |
| Archive boundary | `GET /historical/cutoff` | Live: `market_settled_ts` and `trades_created_ts` 2026-08-19, `orders_updated_ts` 2026-10-04. Markets that settled before the cutoff are served only by `/historical/*`. [H] |
| Fee overrides | `GET /series/fee_changes`, `GET /events/fee_changes` | Scheduled fee type/multiplier changes. [H] |
| Rate-limit costs | `GET /account/endpoint_costs` | Public; market-data GETs are absent from the non-default list, so they cost the default 10 tokens. [H] |

### 4.3 Identity

Three-level ticker scheme: **series** (`CONTROLS`) -> **event** (`CONTROLS-2026`) -> **market** (`CONTROLS-2026-R`). Market ticker is the stable key. Combos/multivariate markets (`KXMVE*`, `mve_collection_ticker`, `mve_selected_legs`) are excluded from most feeds and from `market_lifecycle_v2`. Each market also carries `exchange_index` (shard). [H]

### 4.4 Binary and multi-outcome representation

- A market is a **single YES/NO contract**; there is one book with YES bids and NO bids. "A YES BID at price X is equivalent to a NO ASK at price ($1.00 - X)." Best YES ask = 1 - best NO bid; best NO ask = 1 - best YES bid. [H]
- Multi-outcome = one event with several markets; `mutually_exclusive: true` and `collateral_return_type` (`MECNET` on the Senate event) mark exclusive groups. Scalar results exist (`result: "scalar"`). [H]

### 4.5 Prices, sizes, ticks

- 2026 fixed-point migration: cent-integer price fields were removed from Market responses (announced 2026-01-06, released 2026-01-15), legacy fields removed by 2026-03-12 and the last ones by 2026-04-02. **All prices are `*_dollars` strings** (4 decimals, e.g. `"0.3800"`) and counts are `*_fp` strings (2 decimals, e.g. `"24.59"`; fractional contracts are possible). Do not parse as integers. [H]
- Tick: the `tick_size` field was removed 2026-05-07. Use `price_level_structure` and **`price_ranges[] = {start, end, step}`** per market. Structures seen live: `linear_cent` (0.01 step) and `tapered_deci_cent` (Senate market). At least ten structure names exist (three older ones, seven added 2026-07-23, plus `center_deci_edge_centi_cent` for combos with 0.0001 edge ticks). Consume `price_ranges`, not the label (Kalshi's own advice). [H]
- Volume/open interest are contract counts (`volume_fp`, `open_interest_fp`), not dollars; `notional_value_dollars` is "1.0000". [H]

### 4.6 Pagination and rate limits

- Cursor pagination everywhere (`cursor` in response; empty cursor = last page). [H]
- **Token buckets** (since 2026-04-23): each request costs 10 tokens by default; Read and Write budgets are separate. Per-second read budgets: Basic 200, Advanced 300, Expert 600, Premier 1,200, Paragon 2,400, Prime 4,800, Prestige 12,000 (2026-09-24 raised several by 20%). Read buckets for Basic/Advanced hold 3 seconds of budget. So Basic is about 20 reads/s sustained. `429` body `{"error":"too many requests"}`; no `Retry-After`. `GET /portfolio/balance` has its own 1 req/s bucket (2026-10-15). [H]
- **Limits for anonymous (no-key) reads: NOT FOUND** (searched rate-limits page, quick-start, OpenAPI). The docs state "Every authenticated request costs tokens". Assume IP-based and conservative.
- Batch order books (`GET /markets/orderbooks`, 100 tickers) are not on the non-default-cost list, so they appear to cost one default request (**M**, inferred from absence).

### 4.7 WebSocket

Channels (AsyncAPI): `orderbook_delta`, `ticker`, `trade`, `market_lifecycle_v2`, `multivariate_market_lifecycle`, `fill`, `user_orders`, `market_positions`, `communications`, `order_group_updates`, `cfbenchmarks_value(_5hz)`, `pyth_value`. "Authentication is required to establish the connection ... Some channels carry only public market data, but the connection itself still requires authentication." So a **read-only live feed needs a (read-scoped) API key**; unauthenticated users must poll REST. WebSocket subscriptions are ready when acknowledged (2026-09-17); optional compression (2026-09-24). [H]

### 4.8 Auth (for anything private, and for WebSocket)

Headers `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP` (ms), `KALSHI-ACCESS-SIGNATURE` = base64 of signature over `timestamp + METHOD + path` (path without query string). Key types: Ed25519 (recommended; web app default since 2026-10-01) or RSA-PSS (SHA-256); keys have `read` / `write` scopes (Dec 2025) and trade-scoped and sub-account-restricted variants (June-July 2026). Official SDKs sign either type from 3.31.0. [H]

### 4.9 Terms and automation (flag)

Kalshi Developer Agreement v1.1 (PDF `kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf`, last modified 2023-11-09, **possibly superseded**). Relevant clauses [H for text]:

- Sec. 3: "Use of Kalshi APIs is expressly limited to facilitating a members own trading on the Exchange; all other usages are disallowed and may result in account suspension."
- Sec. 3.1: "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading on Kalshi." No sharing "with third parties in any manner without prior written authorization".
- Sec. 3.2: "Facilitating trading or account creation by other members".
- Sec. 3.5: no use "for purposes of monitoring the availability, performance, or functionality" or benchmarking.
- Sec. 4.1.1: you must be a Member and comply with the Rulebook; sec. 4.3 requires exponential backoff; sec. 5: Kalshi may change limits "at its sole discretion without notice".
- Sec. 2.1: Kalshi may update the Agreement at any time.

Whether anonymous public GETs are "API use" is not answered by the text ("Accessing or using Kalshi's API shall be considered a binding acceptance"), so treat public reads as covered. Design consequence: a hosted multi-user aggregator that stores Kalshi data or shows it to others needs written authorization; a single user's own-account tool reading data transiently for their own trading is the clearly-permitted shape. A data-licensing programme: NOT FOUND (searched docs index and help center). [H/M]

Kalshi eligibility: help center (dated **2026-03-20**, stale-ish) says "you can trade on Kalshi from many countries" subject to the Member Agreement, with KYC and country of residence verified at signup; the restricted-jurisdiction list lives in Member Agreement section VI. I could not retrieve the Member Agreement or the fee schedule PDF (`kalshi.com` returned HTTP 429 / a bot checkpoint to curl and WebFetch; I did not try to bypass it). A search snippet listed restricted countries including Australia, Canada, France, Singapore, UK, India and sanctioned territories [M]. Since **2026-08-16**, `GET /api_keys` returns `api_key_region_expiration_ts`: "Once this date has passed, API keys are not valid for trading Sports, Elections, and Entertainment markets." Series carry `additional_prohibitions` (the Senate series lists 22 classes of barred persons such as campaign staff, lobbyists and officeholders). [H]

### 4.10 Fees

- The official fee schedule PDF (`kalshi.com/docs/kalshi-fee-schedule.pdf`) and `kalshi.com/fee-schedule` were blocked (HTTP 429 / bot checkpoint). Per-series data is public and authoritative: Series `fee_type` in `{quadratic, quadratic_with_maker_fees, quadratic_with_combo_maker_fees, flat}` and `fee_multiplier` (Senate series: `quadratic`, 1.0). Scheduled changes via `/series/fee_changes`; event-level overrides via `/events/fee_changes`. The OpenAPI says `quadratic` "is described by the General Trading Fees Table". [H]
- Coefficients are **M** (third-party guides only, not Kalshi's PDF): taker `0.07 x C x P x (1-P)` times `fee_multiplier`, rounded up; maker `0.0175 x C x P x (1-P)` where the series has maker fees (maker multiplier 0.25, combo 0.5 per OpenAPI description); one source says maker fees were switched on 2026-08-19 for resting orders, others say makers pay nothing on standard series (disagreement unresolved).
- Rounding is official: "Fee Rounding" page. Trade fee = model fee rounded up to $0.000001; then a "rounding fee" aligns the balance to $0.01 (non-direct members) or $0.0001 (direct members), with an accumulator rebate across an order's fills. Net fee = trade fee + rounding fee - rebate. Small orders therefore pay more than the smooth formula. [H]
- Settlement fee: zero for simple yes/no, may apply for sub-cent scalar settlement. Deposit/withdrawal: crypto withdrawals "No fees"; crypto deposits may incur provider and gas fees. [H]

### 4.11 Collateral and settlement

USD balance held at a CFTC-regulated exchange (not on-chain). Funding: bank, debit card, wire, and **crypto** through Zero Hash (US users) or "a separate provider" (international users); transfers "typically take up to 30 minutes"; crypto withdrawals require a prior crypto deposit. Supported assets and networks are shown only in the app (NOT FOUND in the help article; searched `Crypto Deposits`, `Crypto Withdrawals`). [H]

### 4.12 Resolution

Exchange-determined per contract terms (`rules_primary`, `rules_secondary`, `contract_terms_url`, event `settlement_sources`). Lifecycle: `closed` -> `determined` (settlement timer `settlement_timer_seconds`, result may be disputed) -> `disputed` -> `amended` (timer restarts) -> `finalized` (paid out). Some markets may close or be "determined early" (e.g. the Senate market: "may be determined early based on a consensus of media calls"). Dispute procedure and frequency live in the Rulebook (`kalshi.com/regulatory`, blocked): NOT FOUND. Dispute risk is lower-variance than UMA (single accountable exchange) but discretionary; early-determination timing differs from Polymarket's. [H for states, NOT FOUND for procedure]

### 4.13 2026 changes that affect a read adapter (changelog, in order of consequence)

- 2026-01-06/15 and 03-12, 04-02: cents -> fixed-point dollars/counts; legacy fields gone. 2026-01-15 fixed-point counts in REST; 2026-03 fractional trading and sub-penny pricing on new markets.
- 2026-02-19: live/historical split with `GET /historical/cutoff`; historical trades endpoint 2026-03-06.
- 2026-03-30: `GET /markets/orderbooks` (batch).
- 2026-04-23 / 06-05 / 09-24 / 10-15: new token-bucket rate limits, automated tiers, +20% for higher tiers, separate balance bucket.
- 2026-05-07: dedicated `external-api*.kalshi.com` hosts; `tick_size` removed; `outcome_side`/`book_side` fields added to orders/fills/trades (2026-05-06).
- 2026-07 to 2026-10: new `price_level_structure` values; `price_ranges` is the source of truth; exchange sharding (`exchange_index`, commodities on shard 2, basketball on shard 3 from 2026-09-10); `liquidity_dollars` removed (2026-10-01); `available_on_brokers` removed (2026-09-10); `GET /exchange/announcements` removed (2026-07-04).
- 2026-08-16: API-key location attestation expiry; 2026-09-24/10-01: Ed25519 keys.
- **Future-dated changelog entries**: three entries are labelled "October 22, 2026" (REST schema corrections, a margin funding change, FIX mass cancel) although today is 2026-10-19, so they are scheduled or mislabelled. [H]

### 4.14 Verified response shapes (live, 2026-10-18)

1. **Market** (`/markets`, nested in event): `ticker, event_ticker, market_type:"binary", status:"active", yes_bid_dollars:"0.3800", yes_ask_dollars:"0.3900", no_bid_dollars:"0.6100", no_ask_dollars:"0.6200", last_price_dollars, volume_fp:"8560060.54", open_interest_fp, close_time, expected_expiration_time, price_level_structure:"tapered_deci_cent", price_ranges[], rules_primary, rules_secondary, settlement_bounds_type, exchange_index`. `title`/`subtitle` are marked deprecated; use `yes_sub_title`/`no_sub_title`.
2. **Orderbook**: `{"orderbook_fp":{"no_dollars":[["0.5700","3007.01"],..,["0.6100","229301.30"]],"yes_dollars":[["0.3400","16334.25"],..,["0.3800","40226.29"]]}}` (best last; yes ask 0.39 = 1 - 0.61, matching the market summary).
3. **Trades**: `{"cursor":"...","trades":[{"count_fp":"24.59","created_time":"...","is_block_trade":false,"taker_side":"yes","yes_price_dollars":"0.3900","no_price_dollars":"0.6100","trade_id":"...","ticker":"CONTROLS-2026-R","taker_outcome_side":"yes","taker_book_side":"bid"}]}`.
4. Also captured: event with nested markets, series, candlesticks (`price`/`yes_bid`/`yes_ask` OHLC in `*_dollars`, `volume_fp`, `open_interest_fp`, `end_period_ts`), exchange status, historical cutoff.

---

## 5. Normalised model and cross-venue arithmetic

### 5.1 Proposed common fields

`venue` in `{polymarket, polymarket_us, kalshi, xo}`. Prices are `Decimal` in [0,1] USD per contract; sizes in contracts; timestamps UTC ISO-8601 (convert ms/s per venue). Keep the raw payload and an `asof` timestamp.

| Common field | Polymarket (global) | Polymarket US | Kalshi | XO (for the shared adapter) |
|---|---|---|---|---|
| `venue_market_id` | Gamma `conditionId` | market `slug` (also `id`) | market `ticker` | `condition_id` |
| `venue_event_id` | event `slug` / `id` | event `slug` / `id` | `event_ticker` | event id (Data API) |
| `group_id` | `negRiskMarketID` (if `negRisk`) | event slug | `series_ticker` + `event_ticker` | not applicable |
| `title` | `question` | `question` | `title`/`yes_sub_title` (title deprecated) | market title |
| `rules_text` | `description` (+ `resolutionSource`) | `description` | `rules_primary` + `rules_secondary` | rules in market |
| `rules_sources` | `resolutionSource` (often empty) | in rules text | event `settlement_sources[]` | per-market |
| `outcomes[i].id` | `clobTokenIds[i]` if `version=v1`, `positionIds[i]` if `v2` | synthetic `<slug>:long` / `:short` | synthetic `<ticker>:yes` / `:no` | `tokens[i].token_id` |
| `outcomes[i].label` | `outcomes[i]` (JSON text; not always Yes/No) | `marketSides[].description` | `yes_sub_title` / `no_sub_title` | `Yes`/`No` |
| `status` (normalised enum) | `active`, `closed`, `acceptingOrders`, `umaResolutionStatus` / `resolutionStatus` | `marketData.state` | `status` | `active` |
| `close_time` | `endDate` | `endDate` | `close_time` | n/a |
| `expected_resolution_time` | `/v2/resolutions.expected_settlement_time` | n/a | `expected_expiration_time`, `latest_expiration_time` | n/a |
| `tick` | `orderPriceMinTickSize` (+ WS `tick_size_change`) | `orderPriceMinTickSize` | `price_ranges[]` | `0.001` global |
| `min_size` | `orderMinSize` / book `min_order_size` | n/a | fractional (`count_fp`) | `min_order_size` ("0" when unknown) |
| `best_bid`, `best_ask` (YES leg) | `bestBid`/`bestAsk` or `/price` (SELL = ask) or last book entries | `bestBid.value`/`bestAsk.value` | `yes_bid_dollars` / `yes_ask_dollars` | first book entries |
| `book.bids/asks` (sorted bids desc, asks asc) | `bids` reversed; asks reversed | `bids` as-is; `offers` as-is | bids = `yes_dollars` reversed; asks = `1 - no_dollars` price (reverse order) | as-is |
| `last_price` | `lastTradePrice` / `/last-trade-price` | `lastTradePx` | `last_price_dollars` | `last_trade_price` |
| `volume`, `open_interest` | `volumeNum` (unit unconfirmed, likely USD), `/v2/oi` | `sharesTraded`, `notionalTraded`, `openInterest` | `volume_fp`, `open_interest_fp` (contracts) | n/a |
| `fee_model` | `feeSchedule {rate, exponent, takerOnly, rebateRate}` | docs: theta 0.0695 | series `fee_type`, `fee_multiplier` | `/fee-rate.base_fee` bps |
| `collateral` | pUSD, Polygon 137, 6 dec | USD (fiat) | USD (fiat) | USDC.e on chain 3223 |
| `geo_flag` | Gamma `restricted` + user geoblock | account-level KYC | series `additional_prohibitions` + key attestation | ToS list |
| `resolution_mechanism` | UMA OO (`v1`), V2 `OracleAggregator`, Chainlink TWAP | exchange rulebook | exchange rulebook | MODRA (AI panel) |

### 5.2 Book normalisation (pseudocode)

```
Polymarket (CLOB):  bids = sort_desc(book.bids by price); asks = sort_asc(book.asks by price)   # arrays arrive worst->best, best last
Kalshi:             yes_bids = sort_desc(orderbook_fp.yes_dollars)
                    yes_asks = sort_asc([(1 - p, q) for p, q in orderbook_fp.no_dollars])
                    no_bids  = sort_desc(orderbook_fp.no_dollars)
                    no_asks  = sort_asc([(1 - p, q) for p, q in orderbook_fp.yes_dollars])
Polymarket US:      bids = book.bids (desc); asks = book.offers (asc)                              # still sort explicitly
```

Always sort explicitly; never trust venue ordering (Kalshi's own spec text and guide disagree; XO and Polymarket are opposite).

### 5.3 Edge calculation with fees

Paired (hold-to-resolution) trade: buy YES on venue A at ask `a`, buy NO on venue B at ask `b`, size `n` contracts:

```
gross_edge/contract = 1 - (a + b)
fees  = feeA(a, n) + feeB(b, n)          # taker fees, charged in collateral
net_edge/contract = gross_edge - fees/n - bridge_or_gas/n - legging_reserve - basis_reserve
capital = n * (a + b) + fees
annualised = (net_edge / capital) * 365 / days_until_LATER_of_the_two_settlements
```

- Polymarket taker fee (per market, USD): `n * rate * (a*(1-a))^exponent` (exponent 1 in all observed markets), rounded to 5 dp, min 0.00001; BUY fee is added to spend. Maker: 0 (and a rebate).
- Kalshi taker fee: `ceil_6dp(coef * n * p * (1-p) * fee_multiplier)` plus the balance-alignment rounding (to $0.01 for non-direct members); coefficient 0.07 is **M**. For small `n` the rounding dominates.
- Polymarket US taker fee: `0.0695 * n * p * (1-p)`.
- Costs that are not fees: pUSD wrap/unwrap and bridge fees; Polygon gas if an EOA (not Relayer-sponsored) wallet; Kalshi deposit/withdrawal provider fees; time-value lock-up until the later settlement (disputed UMA markets lock 4-6 more days); legging risk when one leg fills and the other does not; Polymarket sports taker delay and game-start order cancellation; resolution-basis risk (below).
- **Worked example (illustrative, same-minute snapshot 2026-10-18 ~17:35-17:38 UTC):** Polymarket "Republican Party control the Senate" Yes best ask 0.38 (book last entry); Kalshi `CONTROLS-2026-R` YES bid 0.38, so Kalshi NO ask = 0.62. Buy Poly Yes + Kalshi No: `gross = 1 - (0.38 + 0.62) = 0.000`. Fees per contract: Poly `0.04*0.38*0.62 = 0.0094`; Kalshi `0.07*0.62*0.38 = 0.0165` (M coefficient). Net about `-0.0259` per $1.00 outlay (-2.6 points), before costs. Reverse direction (Kalshi YES ask 0.39 + Poly NO ask `1 - 0.37 = 0.63`): gross -0.02. No trade in either direction, as expected in a liquid, efficient pair. Rules differ between the two markets (headline 7), so even a positive number would not be riskless.

### 5.4 Matching "the same event"

Match by structured fields (event type, date, entity ids), then require a human- or rules-diff-approved mapping record: `(venue_a_market, venue_b_market, direction, rules_diff_notes, approved_by, approved_at)`. Items that must agree before any "arbitrage" label: resolution source, resolution timing/early-close rules, tie/void handling (Polymarket can resolve 50/50; Kalshi has scalar/early-determination paths), what happens on postponement, and eligibility prohibitions (Kalshi series barred-persons lists). Treat unmapped pairs as "related signals" only.

---

## 6. Rate-limit budget for a polling plan

| Venue | Cheapest bulk read | Sustained budget |
|---|---|---|
| Polymarket | `GET clob /books?token_ids=` (500 req/10s) or market WS (no auth) | Prefer WS `price_change` + periodic `/books`; Gamma keyset listing at 100/page, 300-900 req/10s |
| Kalshi | `GET /markets/orderbooks?tickers=` 100 per call (default cost 10 tokens, M); `GET /markets?limit=1000` | Basic: about 20 calls/s (burst 3x); WS needs a key |
| Polymarket US | `GET /v1/markets` + per-market `/bbo` (25 req/s per IP shared) | no public WS |
| XO | `GET /books` (5 req/s public) | 5 rps is the binding limit; public WS cap 3 connections |

---

## 7. XO vs Polymarket CLOB: what is shared, what differs

Sources: XO docs (`docs.xo.market`, via the `xo-docs` MCP), Polymarket docs, one live XO `GET /markets` + `GET /book`. [H unless noted]

**Shared**

| Area | Detail |
|---|---|
| L1 auth struct | `ClobAuth(address address, string timestamp, uint256 nonce, string message)`; domain name `ClobAuthDomain`, version `1`; attestation string "This message attests that I control the given wallet"; no `verifyingContract`. Only `chainId` differs (137 vs 3223). |
| Credential endpoints | `POST /auth/api-key`, `GET /auth/derive-api-key`, `GET /auth/api-keys`, `DELETE /auth/api-key`; response `{apiKey, secret, passphrase}` (secret shown once). |
| L2 HMAC | HMAC-SHA256 over `timestamp + METHOD + path + body`, URL-safe base64; ±30 s clock skew; `GET /time`. |
| REST read surface | Same paths and field names: `/book`, `/books`, `/price(s)`, `/midpoint(s)`, `/spread(s)`, `/last-trade-price`, `/last-trades-prices`, `/tick-size`, `/neg-risk`, `/fee-rate`, `/time`, `/prices-history`, `/markets`, `/simplified-markets`, `/sampling-markets`, plus `/order`, `/orders`, `/data/orders`, `/cancel-*`, `/balance-allowance`, `/heartbeats`. Book shape `{market, asset_id, bids[{price,size}], asks[], hash, timestamp(ms string), tick_size, min_order_size, neg_risk, last_trade_price}`. |
| Order envelope | `{order, orderType: GTC\|GTD\|FOK\|FAK, postOnly}`; response camelCase `{success, errorMsg, makingAmount, takingAmount, orderID, status: live\|matched\|delayed, transactionsHashes, tradeIds}`; cancel response `{canceled, notCanceled}`; XO documents this as chosen "to satisfy `polymarket-client-sdk` deserialisation". |
| Pagination | `{data, next_cursor, count, limit}` with end sentinel `"LTE="`. |
| WebSocket | `/ws/market` subscribe `{type:"market", assets_ids:[..]}`; events `book`, `price_change`, `last_trade_price`, `best_bid_ask`, `new_market`, `market_resolved`; text `PING`/`PONG`; `/ws/user` with L2 creds in the subscribe body. |
| Fee curve | `fee = C * rate * p * (1-p)`; makers 0 on rewards markets; fee not part of the signed order; `GET /fee-rate` returns `{base_fee}`. |
| Tokens | CTF-style conditional tokens; `condition_id` 0x-32-byte, `token_id` decimal U256; heartbeat auto-cancel semantics (XO: 30 s stale -> cancel all; Polymarket documents the same purpose). |
| Signature-type enum | Numeric `0..3`; XO retains the names `POLY_PROXY`, `POLY_GNOSIS_SAFE` but marks them "Reserved, not used by XO". |

**Differs**

| Area | Polymarket (global) | XO |
|---|---|---|
| L2 header names | `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_API_KEY`, `POLY_PASSPHRASE` (5; address is included) | XO's auth page and OpenAPI security schemes: `XO_API_KEY`, `XO_TIMESTAMP`, `XO_PASSPHRASE`, `XO_SIGNATURE` (4, no address), with hyphenated fallbacks. **XO's own key-creation response text says `POLY_API_KEY` / `POLY_PASSPHRASE`**. Unresolvable without credentials, which this task must not create. The claim in the task brief ("POLY_* headers") is therefore only partly supported. |
| HMAC details | key is the base64-decoded secret; query-string handling in the signed path not stated on the page | XO states the signed path **includes the query string**; whether the secret is base64-decoded first is not stated. Do not assume equality. |
| Order EIP-712 domain | name `Polymarket CTF Exchange`, version `3` (V2 markets, ExchangeV3) or `2` (CTF), chain 137, verifyingContract per market type | name `XO Market CLOB`, version `1`, chain 3223, verifyingContract `0x4bC5...1B77` |
| Order typehash | 11 fields: salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp (ms), metadata, builder | 13 fields: salt, maker, signer, beneficiary, tokenId, makerAmount, takerAmount, expiration, nonce(uint128), identifier(bytes16), metadata, side, signatureType. Different typehash, so an unmodified Polymarket signer cannot produce valid XO signatures. |
| Accepted signature types | 0 EOA, 1 proxy, 2 Safe, 3 Deposit Wallet (ERC-7739 `TypedDataSign` wrapper that includes the order contents) | **Only 3** (XO smart account, ERC-1271). EOA (0) rejected: "Only XO smart-account orders (`signatureType = 3`) are accepted today." The signature is `0x01 || validator || ecdsa(Kernel(bytes32 hash))`, a wrapper over the hash only, so a signer UI cannot display order contents. |
| Book ordering | best **last** (live and docs) | best **first** (live: bids 0.515, 0.500, 0.495; spec says asks ascending, bids descending) |
| Tick size | per market (0.01 / 0.001 / 0.0025), changes at runtime | `0.001` globally (400 `invalid price tick` otherwise) |
| Sizes | decimal strings (`"1108453.88"`) | "decimal-string integers in human shares" |
| Neg-risk | real feature with conversion | `neg_risk` "Always `false` on XO" |
| Discovery | Gamma (events, series, tags, `public-search`) on a separate host | CLOB `GET /markets` (`{condition_id, tokens[2], minimum_tick_size, neg_risk, active}`) plus a Data API with `marketScope` filter (`onlyClob`, `onlyClobPulse`); no Gamma-style search found in the api-reference tree (not exhaustively checked) |
| `count` semantics | page item count | docs say page count, but live `GET /markets?limit=3` returned `count: 47063` (total), so the field is not the page count |
| `min_order_size` | `"5"` | `"0"` when the gateway lacks MarketInfo (live book returned `"0"`) |
| `/fee-rate` meaning | `base_fee: 1000` for a 4% market; not the charged fee | `base_fee` is "the fee rate in basis points used in the curve" |
| Rate limits | thousands per 10 s | public REST 5 req/s; 3 public WS connections |
| Collateral / chain | pUSD, Polygon 137 | "XO USDC" (USDC.e), chain 3223 |
| Resolution | UMA / Chainlink / V2 aggregator | MODRA AI panel (per XO ToS) |
| Rate-limit/ban semantics | 429-less throttling at Cloudflare | `Error429.retry_after_ms` on writes |

**Conclusion for one adapter.** A single `ClobReadAdapter` can serve Polymarket and XO with per-venue config for: base URLs, book sort order, tick source (per-market vs fixed), fee interpretation, id selection (token vs position id), discovery source. A single *write* path cannot share the signer: same flow (L1 -> L2 -> sign typed data -> POST) but a different domain, typehash and wrapper per venue, and XO would need a Kernel-wrapped hash signature. Whether L2 header names are `XO_*` or `POLY_*` must be tested with a real credential (not done here).

---

## 8. Eligibility and legality matrix (execution flag)

| Venue | Who may trade | US persons | API/automation | Notes |
|---|---|---|---|---|
| Polymarket (global) | Non-US, non-restricted jurisdictions; attest not a US person, not using VPN | **Blocked / close-only** on frontend and API; US users are redirected to polymarket.us | API openly documented; explicit bot clause NOT FOUND; manipulation/wash trading banned | Geoblock is IP-based; third-party apps must not execute for users in restricted places; co-location is for own-account traders only |
| Polymarket US | KYC'd US individuals (SSN) and institutions; invite code may be needed | Yes (it is the US venue) | Keys only for verified account holders | Fiat USD; separate rulebook; maker/taker rebate regime changes 2026-10-19 |
| Kalshi | KYC'd members; many foreign countries allowed, with a restricted list in the Member Agreement; API-key location attestation for Sports/Elections/Entertainment | Yes | Developer Agreement v1.1: own trading only; no caching/aggregating/sharing without written authorization; no facilitating other members | Not on-chain; crypto deposits via Zero Hash / intl provider |
| XO | 18+, not in restricted regions | US, UK, France, Singapore, Ontario listed as restricted in the ToS | ToS: "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system"; scraping "for unauthorized purposes" barred | From XO ToS (`docs.xo.market/legal/terms-of-service`) |

Reading the matrix: cross-venue arbitrage between **Polymarket global and Kalshi** is lawful for a person only if they are outside both venues' restricted lists, which excludes US residents entirely and most large Western jurisdictions that appear on both lists (UK, France, Singapore, Australia, Ontario). **US residents** can use Kalshi and Polymarket US (different market sets) but not Polymarket global or XO. The aggregator should therefore (a) compute edge only as an information signal, (b) gate any execution path on a per-user, user-attested jurisdiction check from the user's own client IP (not the plugin host's IP), and (c) never route orders for a user through infrastructure that masks their location. This is a flag, not legal advice.

---

## 9. Could a PayBox EVM wallet trade there?

| Venue | Verdict |
|---|---|
| **Polymarket (global)** | Technically plausible; policy and plumbing caveats. It is EVM on Polygon (137), orders are EIP-712 typed data, L1 `ClobAuth` is EIP-712, the tool surface of PayBox has `request_wallet_sign` with a `typedData` intent [H, tool schema]. MoonPay's 2026-07-29 post lists Polygon among launch networks ("Solana and EVM-compatible chains including Ethereum, Hyperliquid, Tempo, Base, Robinhood Chain, Arbitrum and Polygon") [M]. **Unverified at the tool level**: the PayBox tool descriptions I could read name Base (8453), Robinhood (4663), Arc (5042), Avalanche (43114), Hyperliquid (999) but not Polygon; a `discover_tokens(mode=chains, query="polygon")` check is the follow-up (a read-only call, not authorised in this task). Account shape: docs list EOA (`signatureType 0`) as a supported wallet type [H]. The BUY approval (`pUSD.approve(ExchangeV3)`), SELL approval (`PositionManager.setApprovalForAll`) and USDC.e -> pUSD wrapping are on-chain transactions [H]; that an EOA must therefore hold POL for gas, while gasless operations go through the Relayer with a Relayer API key (documented for "the account"), is my inference [M]. **Session Keys** (beta; 180-day, scope-limited signer that cannot withdraw; needs a Builder API key and contacting Polymarket to enable) are the cleanest agent model: the PayBox wallet would be the session signer for a user's Deposit Wallet. L2 API credentials still have to be stored somewhere (same gate-1 problem as XO). Server-side order submission must respect the geoblock (section 8). |
| **Polymarket US** | No. Fiat/KYC venue; auth is Ed25519 `X-PM-*` keys from the developer portal. A wallet could at most fund it by depositing USDC through the app. |
| **Kalshi** | Not as a trading venue. It is a USD account with API-key auth (RSA-PSS / Ed25519 over `timestamp+method+path`); the PayBox wallet can only fund it via the app's crypto deposit flow (asset/network list not public). Speculative and unverified: a PayBox Solana wallet's Ed25519 key signing Kalshi request strings through `solanaMessage`; it would need a signing round-trip per request, which is unusable for reads and legally irrelevant to the Developer Agreement limits. **L**. |
| **XO** | Out of scope here; its docs say smart-account (Kernel) only. |

---

## 10. Design implications for the aggregator

1. Build per-venue adapters behind one capability interface; the Polymarket and XO read adapters can share code. Keep Polymarket US and Kalshi separate.
2. Use `/v2` Data API only (v1 dies 2026-10-24). Handle both position ledgers (CTF `clobTokenIds` / V2 `positionIds` chosen by `version`), and non-Yes/No outcome labels.
3. Compute executable prices from sorted books, with Kalshi's reciprocal YES/NO rule and Polymarket's synthetic-complement check. Never use Gamma `outcomePrices`/`lastTradePrice`, Kalshi `last_price_dollars`, or Polymarket `/price?side=BUY` as the buy price.
4. Fee model is data: read `feeSchedule` (Polymarket), series `fee_type` + `fee_multiplier` + scheduled/event overrides (Kalshi), and version the fee tables; Polymarket US rebates change 2026-10-19.
5. Treat resolution risk as first-class: store `rules_text`, `resolution_mechanism`, settlement timing and status; refuse "arbitrage" labels without an approved rules mapping.
6. Kalshi: unauthenticated users poll REST (batch 100 tickers per call); authenticated-key users can use WS. Do not persist or redistribute Kalshi data across users without written authorization; prefer on-demand, user-scoped, short-TTL reads.
7. Compliance gate before any execution: user-attested jurisdiction, venue eligibility matrix, client-side geoblock check, no server-side order relay for restricted users. First release should present signals, not trades, on non-XO venues.
8. Contract-test against the saved fixtures and add schema-drift alarms; Kalshi ships API changes weekly (358 changelog entries) and Polymarket's docs changed materially in 2026.
9. Quotient (prediction-market signals) was not in this task's scope.

---

## 11. Fixtures and the curl used

Saved under `docs/research/fixtures/` (all under 50 KB; trims noted). No credentials used. Third-party trader identifiers redacted.

**Polymarket** (`fixtures/polymarket/`):

| File | curl |
|---|---|
| `gamma_markets_list.json` | `curl -sS "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=2&order=volume24hr&ascending=false"` |
| `gamma_events_keyset.json` | `curl -sS "https://gamma-api.polymarket.com/events/keyset?limit=1&closed=false&order=volume24hr&ascending=false&tag_slug=politics"` (trimmed with `jq`: first event, 3 markets, `description` removed, cursor truncated; original was 117 KB) |
| `gamma_public_search.json` | `curl -sS "https://gamma-api.polymarket.com/public-search?q=bitcoin&limit_per_type=2&events_status=active"` (trimmed: first event, 2 markets, descriptions removed; original 200 KB) |
| `gamma_market_by_slug.json` | `curl -sS "https://gamma-api.polymarket.com/markets/slug/will-the-republican-party-control-the-senate-after-the-2026-midterm-elections"` (`description` removed) |
| `clob_book.json` | `curl -sS "https://clob.polymarket.com/book?token_id=<yes token>"` (trimmed to 5 best levels per side; the best level is last) |
| `clob_market_info.json` | `curl -sS "https://clob.polymarket.com/clob-markets/0x86bfb53af7250a40928975c551d12c185b762fa4ce0b40c6a64a50c946d72587"` |
| `clob_scalar_endpoints.json` | `/midpoint`, `/price?side=BUY`, `/price?side=SELL`, `/spread`, `/last-trade-price`, `/tick-size`, `/neg-risk`, `/fee-rate`, each with `?token_id=<yes token>` |
| `clob_prices_history.json` | `curl -sS "https://clob.polymarket.com/prices-history?market=<yes token>&interval=1d&fidelity=60"` (legacy route) |
| `data_v2_trades.json` | `curl -sS "https://data-api.polymarket.com/v2/trades?condition=0x86bf...2587&limit=3"` (`proxy_wallet`, `name`, `pseudonym`, `bio`, profile images redacted) |
| `data_v2_resolutions.json` | `curl -sS "https://data-api.polymarket.com/v2/resolutions?condition=0x86bf...2587"` |
| `data_v2_tokens.json` | `curl -sS "https://data-api.polymarket.com/v2/tokens?token_id=<yes token>"` |
| `data_v2_prices_history.json` | `curl -sS "https://data-api.polymarket.com/v2/prices-history?token_id=<yes token>&interval=1d&limit=5"` |

Yes token: `51939490109676186832507970701169130490548061087912630009168726706475001411420`.

**Polymarket US** (`fixtures/polymarket-us/`): `markets_list.json` (`GET https://gateway.polymarket.us/v1/markets?limit=2&active=true&closed=false`, trimmed to 1 market, description removed); `search_senate.json` (`GET .../v1/search?query=senate&limit=2`, trimmed to 1 event, 2 markets, descriptions removed); `bbo.json` (`GET .../v1/markets/scc-senate-demst-2026-11-03-gte45/bbo`); `book.json` (`GET .../v1/markets/scc-senate-demst-2026-11-03-gte45/book`).

**Kalshi** (`fixtures/kalshi/`): `markets_list.json` (`GET https://external-api.kalshi.com/trade-api/v2/markets?limit=2&status=open&mve_filter=exclude`); `event_controls_2026.json` (`GET .../events/CONTROLS-2026?with_nested_markets=true`, `rules_secondary` removed); `orderbook_controls_r.json` (`GET .../markets/CONTROLS-2026-R/orderbook?depth=5`); `trades_controls_r.json` (`GET .../markets/trades?ticker=CONTROLS-2026-R&limit=3`); `series_controls.json` (`GET .../series/CONTROLS`, prohibitions list trimmed from 22 to 2); `candlesticks_controls_r.json` (`GET .../series/CONTROLS/markets/CONTROLS-2026-R/candlesticks?start_ts=<now-86400>&end_ts=<now>&period_interval=60`); `exchange_status.json`; `historical_cutoff.json`.

Live XO sanity reads (not saved): `GET https://orderbooks.xo.market/markets?limit=500` and `GET /book?token_id=<active token>`.

---

## 12. Open questions

1. Does XO accept `POLY_*` headers in addition to `XO_*`? (needs a real credential; its docs conflict).
2. Kalshi: is an anonymous public read subject to the Developer Agreement, and is there a newer agreement or a data-licence programme? Obtain written authorization before building a multi-user aggregator.
3. Kalshi: current fee schedule coefficients and whether maker fees apply to your target series (PDF blocked); Rulebook dispute procedure; Member Agreement restricted-jurisdiction list.
4. Polymarket: ToS bot clause and any data-use terms (page unreadable); live per-signer limiter status; semantic of `EOAReporterModule`; unit of `orderMinSize`; exact `exponent` semantics; why live `feeSchedule` disagrees with the docs category table.
5. PayBox: `discover_tokens(mode=chains)` check for Polygon (137); can `request_wallet_sign` sign `typedData` with `chainId` 137/3223 and an arbitrary `verifyingContract`; do autonomous grants auto-sign it.
6. Kalshi crypto-deposit asset/network list (app-only).
7. Neg-risk V2 behaviour (no V2 market in my samples).
8. Does a Polymarket market's `restricted: true` flag correspond to specific jurisdictions the user must be checked against?

---

## 13. Sources

Polymarket (global):
- `https://docs.polymarket.com/llms.txt`; `/_llms/en/api-reference/predictions.txt`
- `https://docs.polymarket.com/getting-started/api.md` (hosts, L1/L2 auth). Quote: "Public market data is available without credentials."
- `https://docs.polymarket.com/concepts/{markets-events,positions-tokens,negative-risk,prices-orderbook,pusd,order-lifecycle,resolution}.md`
- `https://docs.polymarket.com/market-data/{overview,discover-markets,market-details,prices-order-books,realtime-data}.md`. Quote: "Bids are ordered by ascending price and asks by descending price, so the best bid and ask are the last entries"
- `https://docs.polymarket.com/trading/{fees,wallets-auth,place-orders,session-keys}.md`; `https://docs.polymarket.com/trading/bridge/{supported-assets,deposit}.md`
- `https://docs.polymarket.com/api-reference/{rate-limits,trading-rate-limits,geoblock}.md`; `/api-reference/data-api/overview.md`
- `https://docs.polymarket.com/migrate/data-api-v1-to-v2.md`. Quote: "Data API v1 is retired on October 24, 2026."
- `https://docs.polymarket.com/migrate/polymarket-v2/{overview,api-integrations}.md`. Quote: "Choose the ID field by `version`, even when both fields are present."
- `https://docs.polymarket.com/changelog/predictions.md`; `/resources/contracts.md`
- OpenAPI: `https://docs.polymarket.com/api-spec/{gamma,clob,data}-openapi.yaml`, `https://data-api.polymarket.com/v2/openapi.json`, `https://docs.polymarket.com/asyncapi.json`
- `https://polymarket.com/tos` (page payload: US-person/VPN attestation); `https://integrity.polymarket.com/`
- Live: `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com` (section 11)
- Secondary (L/M): Business Wire 2026-03-20 integrity rules release; KuCoin/CoinMarketCap/Hokanews coverage of UMA disputes (counts unverified)

Polymarket US:
- `https://docs.polymarket.us/llms.txt`; `/api-reference/{introduction,authentication,rate-limits}.md`; `/fees.md`; `/getting-started/what-is-polymarket-us.md`; `/concepts/{market-data,orders}.md`; `/learn/markets/{market-resolution,contract-settlement}.md`; `/learn/get-started/signup.md`; `/learn/trading/access-and-limits/trading-restrictions.md`
- OpenAPI: `https://docs.polymarket.us/api-reference/oapi-schemas/{markets,market,events,price-history}-schema.json`
- Live: `gateway.polymarket.us` (section 11)

Kalshi:
- `https://docs.kalshi.com/llms.txt`; `/openapi.yaml` (v3.34.0); `/asyncapi.yaml`
- `https://docs.kalshi.com/getting_started/{quick_start_market_data,rate_limits,orderbook_responses,fee_rounding,market_lifecycle,market_settlement,api_keys,making_your_first_request}.md`. Quote: "The highest bid (best bid) is the last element in each array"
- `https://docs.kalshi.com/websockets.md`, `/websockets/websocket-connection.md`. Quote: "Some channels carry only public market data, but the connection itself still requires authentication."
- `https://docs.kalshi.com/changelog/index.md` (entries cited by date)
- Developer Agreement v1.1: `https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf` (text extracted locally with PDFKit; S3 `Last-Modified: 2023-11-09`)
- Help center: `help.kalshi.com/en/articles/14026044-...` (2026-03-20), `/13823799-crypto-deposits` (2026-08-14), `/13823804-crypto-withdrawals` (2026-08-24)
- Blocked (HTTP 429 / bot checkpoint, not bypassed): `kalshi.com/docs/kalshi-fee-schedule.pdf`, `kalshi.com/fee-schedule`, `kalshi.com/docs/kalshi-member-agreement.pdf`, `kalshi.com/regulatory`
- Secondary (M): third-party fee guides (pm.wiki, polykal.net, predictefy and similar) for the 0.07 / 0.0175 coefficients
- Live: `external-api.kalshi.com/trade-api/v2` (section 11)

XO (comparison only): `docs.xo.market` pages `api-reference/{introduction,authentication,rate-limits}`, `guides/{wire-conventions,smart-accounts,fees}`, `api-reference/authentication/create-api-key`, `legal/terms-of-service`, OpenAPI `/openapi/api-reference/openapi.yaml`; live `orderbooks.xo.market`.

PayBox: tool schemas for `request_wallet_sign`, `discover_tokens`, `get_portfolio`, `request_swap` (loaded, not called); `https://www.moonpay.com/newsroom/moonpay-paybox` (2026-07-29).


---

## Verification (2026-10-19)

Adversarial verifier pass. Method: re-fetched the primary docs (docs.polymarket.com, docs.polymarket.us, docs.kalshi.com, docs.xo.market via the xo-docs MCP, Kalshi Developer Agreement PDF, Polymarket US Rulebook PDF, Kalshi help centre) and re-ran about 40 public unauthenticated GETs against gamma-api, clob, data-api, gateway.polymarket.us, external-api.kalshi.com and orderbooks.xo.market. No POST, no keys, no PayBox call, nothing executed from third-party code. Live reads were made on the system clock date 2026-10-18 (~17:55-18:05 UTC); the harness date is 2026-10-19, so "today" statements in the notes are one calendar day ahead of the machine clock. Confidence tags as above (H = read first-hand this pass).

Overall: the doc-derived facts are accurate and most live shapes reproduce. Verdict is **medium** reliability, not high, because of one production-breaking call-format error (Kalshi batch order books), one unflagged docs-versus-live contradiction (Polymarket `/price`), a batch GET form that fails live, and two NOT FOUND claims that are refutable.

### A. Corrected (partly right; corrected text given)

**A1. Polymarket `GET /price`: live behaviour matches the notes, but the docs contradict each other and the notes cite the wrong side of it.**
- Notes (headline 3, 2.2): "`BUY` = best bid ... Confirmed by the OpenAPI description and two live reads." Live re-check on four different tokens (Senate Yes, three NFL/soccer tokens): `side=BUY` returned exactly the last `bids[]` entry and `side=SELL` the last `asks[]` entry every time (e.g. BUY 0.36 / SELL 0.37 with bids[-1]=0.36, asks[-1]=0.37). [H]
- NOT FLAGGED in the notes: the docs prose page the notes cite for book ordering says the opposite. `https://docs.polymarket.com/market-data/prices-order-books.md`: "`BUY` returns the lowest ask, which is the price you would pay to buy. `SELL` returns the highest bid". The OpenAPI (`clob-openapi.yaml` /price) says "Returns the best bid price for BUY side or best ask price for SELL side." So two official sources disagree and live matches the OpenAPI. [H]
- Corrected text: "`/price?side=BUY` returns the best bid and `SELL` the best ask in live behaviour (OpenAPI agrees; the prose docs page says the reverse). Do not trust the prose; derive buy/sell prices from the sorted book and add a contract test that fails if the live semantics flip."

**A2. Kalshi batch order books: the notes give the wrong parameter encoding (silent wrong data).**
- Notes (4.2, 6, 10 item 6/9): `GET /markets/orderbooks?tickers=a,b,...`. The OpenAPI defines `tickers` as an array with `style: form, explode: true`, `maxItems: 100`, i.e. REPEATED params `tickers=A&tickers=B`. [H, `openapi.yaml` /markets/orderbooks]
- Live: `?tickers=CONTROLS-2026-R,CONTROLS-2026-D` returned HTTP 200 with ONE entry whose `ticker` was the literal string "CONTROLS-2026-R,CONTROLS-2026-D" and empty `yes_dollars`/`no_dollars`. `?tickers=CONTROLS-2026-R&tickers=CONTROLS-2026-D` returned two correct books (42/68 and 58/55 levels). [H]
- It is inconsistent inside Kalshi: `GET /markets?tickers=` and `GET /markets/candlesticks?market_tickers=` ARE comma-separated and worked comma-separated. An adapter that reuses one list encoder will get empty books with no error.
- Corrected text: "Batch order books use repeated `tickers=` params (max 100). Comma-joined values return HTTP 200 with a bogus empty book." Treat an empty book whose `ticker` contains a comma as an error.

**A3. Polymarket GET batch endpoints are unverified and failed live.**
- Notes (2.2) list `GET clob /books?token_ids=a,b` and say batch is also available via POST. Live: `GET /books`, `/midpoints`, `/last-trades-prices` and `/prices` with `token_ids=` returned HTTP 400 `{"error":"Invalid payload"}` for one token, comma-joined tokens and repeated params alike. The OpenAPI documents the GET form, but every curl example in `prices-order-books.md` for batch uses `-X POST`. I did not POST (rules), so the POST form is also unverified. [H for the 400s]
- Corrected text: "Batch reads: the documented GET variants returned 400 on 2026-10-18; use the POST variants shown in the docs after testing them with an authorised client."

**A4. Polymarket fee divergence has a visible cause (notes: "cause unknown").**
- Each Gamma market carries a `feeType`. In a fresh top-100 sample: 30 markets have `feeType: sports_fees_nfl_cfb_oct26` with `feeSchedule.rate 0.03, rebateRate 0.15` (all created 2026-09-07 to 2026-09-29, NFL games and props); 37 have `sports_fees_v3` with `rate 0.05, rebateRate 0.15` (created from 2026-10-04). The fees page documents neither `feeType` value. [H]
- Corrected text: "Docs table is a category default; NFL/CFB sports markets carry a separate fee type at 0.03. Always read `feeSchedule` (and key by `feeType`) per market." Counts in my re-sample were 12 fee-free, 0.03 x35, 0.04 x6, 0.05 x44, 0.07 x3: same pattern as the notes within live drift.

**A5. Polymarket `min_order_size` unit is documented (notes: "unit unresolved").**
- `https://docs.polymarket.com/trading/place-orders.md`: "`min_order_size` is the minimum number of shares the CLOB accepts for an order." The Gamma market-details page says `orderMinSize` is "in USDC", which looks like a docs error. Live: Gamma `orderMinSize` 5 and book `min_order_size "5"` on all 100 sampled markets. Treat as shares. [H docs, M on which page is wrong]

**A6. `outcome_index` in Data API v2 is inconsistent between routes (stronger than "one sample").**
- Same Yes token: `/v2/tokens` returned `outcome_index: 1, clob_index: 0`; `/v2/trades` for that condition returned `outcome: "Yes", outcome_index: 0` on four rows (No rows had 1). So `outcome_index` is not a stable key across routes. Map by token id plus Gamma array order. [H]

**A7. Kalshi maker-fee date and status (notes: "2026-08-19 ... disagreement unresolved").**
- The changelog the notes cite is the primary: entry labelled August 22, 2026: "Maker fees will be enabled at 5:00 AM ET on Thursday, August 20". So 2026-08-20 05:00 ET, not 08-19. The entry is written in the combo-RFQ context, so whether it enabled maker fees on all `quadratic_with_maker_fees` series is not stated. [H]
- Help centre `help.kalshi.com/en/articles/13823805-fees`: "In some cases, markets will have maker fees associated with them." That resolves the disagreement: maker fees are per-series (`fee_type` `quadratic_with_maker_fees` / `quadratic_with_combo_maker_fees`), not universal. OpenAPI: combo maker multiplier 0.5 "instead of 0.25". [H]
- The 0.07 taker coefficient stays M but gains a primary-source consistency check: Kalshi's own Fee Rounding worked example (`getting_started/fee_rounding.md`) uses a model fee of `$0.00363825` on `-$0.055` revenue, and 0.07 x 0.055 x 0.945 = 0.00363825 exactly (assuming 1 contract at 5.5c). Inference, not a statement of the coefficient. Maker 0.0175 = 0.07 x 0.25 is consistent with the OpenAPI 0.25 multiplier. [M]

**A8. Section 8 eligibility matrix mixes verified and unverified lists.**
- The Kalshi restricted-jurisdiction list (UK, France, Singapore, Australia, Ontario "appear on both lists") rests on a search snippet [M]; the Member Agreement was not retrieved and still returns HTTP 429 (`kalshi.com/regulatory`, `kalshi.com/docs/kalshi-fee-schedule.pdf` re-tried). The matrix reads as H. Mark Kalshi's list **unverifiable**; the Polymarket-global list is H (geoblock.md lists AU, FR, GB, SG, US, CA-ON and others). The help article only says "Supported countries and any specific geographic restrictions are detailed in that agreement."

**A9. Smaller precision fixes.**
- Gamma `/markets/keyset` silently clamps `limit` above 100 to 100 (limit=101 and 150 both returned 100 rows, HTTP 200) rather than erroring; `offset` is rejected with HTTP 422 "offset is not allowed on keyset endpoints". [H]
- Kalshi `GET /series` ignores `limit` and returns the whole catalogue (more than 3.5 MB; my 20 s curl timed out): do not call it unfiltered in a poller. [H]
- Kalshi `/markets` `status` filter: the endpoint prose lists four values (`unopened, open, closed, settled`) while the parameter enum is `[unopened, open, paused, closed, settled]`. The notes follow the enum; fine, but the docs disagree with themselves. [H]
- The `last_trade_price` field inside `GET /book` is not a per-token last price. At one instant the Yes book and the No book of the Senate market both reported `last_trade_price "0.630"` while the dedicated `/last-trade-price` returned 0.37 (Yes) and 0.64 (No). Supports the notes' rule never to use last-trade prices; add: do not use the book's `last_trade_price` either. [H]

### B. Refuted NOT FOUND claims (found on re-search)

**B1. "Batch size cap for CLOB `/books` NOT FOUND (searched OpenAPI + docs)": it is documented.** `prices-order-books.md`, "Fetch Multiple Order Books": "Maximum 500 items per request." The same line appears for batch prices, midpoints, spreads and last-trade prices (the OpenAPI also says "(max 500)" for last-trades-prices). [H]

**B2. "Polymarket US Rulebook dispute procedure NOT FOUND / Rulebook not read": the Rulebook is public.** `https://polymarketexchange.com/files/legal/latest/rulebook` redirects to `Polymarket US Rulebook (2026.09.30).pdf` (84 pages, HTTP `last-modified: Fri, 02 Oct 2026`). Text extracted locally. [H]
- There is no UMA-style dispute: Rule 10.4 "Contract Outcome Review Process": "The Company has full discretion in reviewing markets. Determinations made by the Company are final."; the Company "may also reverse the final outcome of a Contract in the case of obvious error."
- Rule 10.3(a): the Company "retains the discretion to modify associated Contract Specifications, including Settlement Date and Payout Condition at any time." Rule 10.3(b): it may adjust the Expiration Date.
- Rule 10.5 (natural persons): on death/incapacity the Exchange settles at last traded prices, "final and not subject to review."
- "Source Agency means the Exchange", which references the Sources named in contract terms.
- Rule 5.2(i): "Participants utilizing automated trading systems must implement pre-trade risk controls including order throttles, price collars, and kill switches." This is the first automation rule found for any Polymarket venue.
- Impact: Polymarket US settlement is discretionary and can be re-specified after listing, a larger resolution-basis risk for a cross-venue pair than the notes state for that venue.

### C. Unverifiable (could not independently confirm; stays as written or stays NOT FOUND)

- **Kalshi fee coefficients 0.07 / 0.0175 (official):** `kalshi.com/docs/kalshi-fee-schedule.pdf` and `kalshi.com/fee-schedule` still HTTP 429; the help centre links to the schedule but does not state the numbers. Web search returned only third-party guides. See A7 for the indirect consistency check. Not bypassed.
- **Kalshi Member Agreement and Rulebook text, restricted-country list:** same 429. Guessed S3 paths on `kalshi-public-docs.s3.amazonaws.com` returned 404.
- **Polymarket Terms of Use bot/automation clause:** `polymarket.com/tos` is a client-rendered shell; its payload contains only UI strings. Verbatim from the payload, confirming the notes: "attest that you are not (i) a U.S. person; (ii) located in the United States, France or other restricted jurisdiction; and (iii) using a VPN or other measures to circumvent or attempt to circumvent restrictions." No body text, no bot clause. NOT FOUND stands. (A web search budget was exhausted mid-pass; a second extended search found no ToS text either.)
- **Kalshi anonymous (no-key) rate limit:** NOT FOUND stands (rate_limits page says "Every authenticated request costs tokens"). New context: the 2026-10-15 changelog says already-public reads "accept a resource-bound MCP grant for per-user rate accounting; their anonymous payloads remain unchanged", which confirms anonymous reads exist but gives no limit.
- **Polymarket per-signer limiter live enforcement:** `trading-rate-limits.md` says "Polymarket will announce when live enforcement begins"; no announcement in the predictions changelog through 2026-10-07. NOT FOUND stands.
- **`EOAReporterModule` semantics:** `resources/contracts.md` lists the module and addresses only. NOT FOUND stands.
- **Polygon as a PayBox network:** MoonPay post (read through a summarising fetch, so M) is dated 2026-07-29 and lists Polygon after Arbitrum. The PayBox tool schemas I could read (`request_swap`: Robinhood 4663, Arc 5042, Avalanche 43114, Hyperliquid 999; `get_portfolio`: Base 8453, Solana; `discover_tokens`: any `eip155:<id>` accepted, catalogue "is metadata, not a signing or swap allowlist") do not name Polygon. `request_wallet_sign` `typedData` is an unconstrained object in the schema, so chain 137/3223 and arbitrary `verifyingContract` are not excluded by the schema, but acceptance is untested. Verdict unchanged (M).
- **WebSocket behaviour (Polymarket public market channel, Kalshi auth requirement):** documented in the primary pages (Kalshi: "the connection itself still requires authentication"), not tested live here (no WS client used).
- **Live XO write path / POLY_* vs XO_* headers:** unresolvable without a credential. The docs contradiction itself is confirmed (see D).

### D. Confirmed independently (no change)

- CLOB V2 live 2026-04-28 on `clob.polymarket.com`; pUSD on Polygon, 6 decimals (changelog, `concepts/pusd.md`). Data API v1 retired 2026-10-24 (migration page); v2 envelope `{data, pagination}`, snake_case, opaque cursor, CORS `*`, live. The 2026-09-04 changelog also calls v1 "frozen". [H]
- `version` picks `clobTokenIds` (v1) vs `positionIds` (v2): "Choose the ID field by `version`, even when both fields are present." Re-sample: 100/100 `v1`, 47/100 Yes/No; `positionIds` present on 71 of those v1 markets. [H]
- Book ordering, live: Polymarket best LAST on 4 tokens; Kalshi `orderbook_fp` best LAST (guide: "The highest bid (best bid) is the last element"; OpenAPI text still says "best to worst"); Polymarket US best FIRST (bids 0.98, 0.96 ...); XO best FIRST on 3 live books. [H]
- Polymarket fee formula, category table, rounding (5 dp, min 0.00001), Sports 0.03 to 0.05 on 2026-07-10, `/fee-rate` `base_fee 1000` on a 0.04 market; rate-limit tables (Gamma, CLOB, Data v1/v2) match `api-reference/rate-limits.md` line for line. [H]
- Geoblock page: close-only on frontend and API list (incl. US, GB, FR, DE, SG, AU) and frontend-only list (IE, JP, MT sports, NL, KR); endpoint checks the requesting IP; co-location not for third-party apps executing for end users. Live call returned `blocked:true` for this machine's egress; the response echoes the caller's IP, which is deliberately not recorded here. [H]
- Polymarket US: gateway public, `api.polymarket.us` authenticated with `X-PM-Access-Key/Timestamp/Signature` (Ed25519 over timestamp+method+path, 30 s), both WebSockets on the authenticated host, SSN-KYC, 25 req/s per source IP, taker 0.0695 (0.10 table tennis), rebate tiers effective 1:00 PM ET 2026-10-19, no public trade tape (`/v1/markets/{slug}/trades` and `/v1/trades` return 404). [H]
- Kalshi: hosts and 2026-05-07 changelog; OpenAPI 3.34.0; only `/search/tags_by_categories` and `/search/filters_by_sport` under search (also none in the 101-path spec; perps specs out of scope); token-bucket table (Basic read 200/s, 3 s capacity), `GET /account/endpoint_costs` default 10; `period_interval=240` returns 400 (1, 60, 1440 return 200); `/markets?limit=1000` OK and 1001 gives 400; WS auth requirement; `api_key_region_expiration_ts`; `tick_size` absent and `price_ranges` present; Senate series `fee_type quadratic, fee_multiplier 1`. 362 `<Update` blocks in the changelog now (notes say 358). [H]
- Kalshi Developer Agreement v1.1 text of s3, s3.1, s3.2, s3.5, s4.3, s5, s2.1 quoted accurately; S3 `Last-Modified: Thu, 09 Nov 2023`. [H]
- Senate pair rule text: Kalshi secondary "may be determined early based on a consensus of media calls ... President pro tempore of the Senate on February 1, 2027"; Polymarket description (majority of voting seats, VP tie-break, President Pro Tempore fallback). Worked example arithmetic holds (re-run at 18:00 UTC: Poly Yes ask 0.37 + Kalshi No ask 0.62 = gross +0.01, still negative after fees). [H]
- XO: header contradiction confirmed (`/api-reference/authentication` and `/guides/smart-accounts` say `XO_API_KEY/XO_TIMESTAMP/XO_PASSPHRASE/XO_SIGNATURE`; `create-api-key` and `derive-api-key` say `POLY_API_KEY` and `POLY_PASSPHRASE`); L1 uses `XO_ADDRESS`; order domain "XO Market CLOB" v1 chain 3223; 13-field typehash; only `signatureType = 3` accepted; tick 0.001; live `/markets` `count` was 47067 (total) with `limit=3`; ToS restricted-region list (US, UK, France, Singapore, Ontario) and bot sentence quoted accurately. Polymarket's 11-field V2 order typehash and ExchangeV3 domain (version "3") confirmed in `place-orders.md` and `api-integrations.md`. [H]
- Session Keys: beta, Deposit Wallet only, 180 days, cannot withdraw, needs a Builder API key and a rollout email. [H]
- Prediction-market gate verdicts in the structured summary are defensible as written (partial / unanswered); no status change.

### E. Missed findings (not in the notes)

1. Kalshi Developer Agreement also contains s3.7 "Sublicensing the API for use by a third party" (prohibited) and s6.4 (prior written approval for any public statement, marketing or promotional material relating to Kalshi or its API), plus s4.4 audit rights. These bite a plugin marketplace listing or marketing copy, not just data caching. [H]
2. Kalshi's own Quick Start (`getting_started/quick_start_market_data.md`) says: "Kalshi provides several public endpoints that don't require API keys." That invites anonymous reads but is not a licence; keep the notes' conservative position. [H]
3. Kalshi changelog 2026-10-15: registered MCP clients can read portfolio data under `read::mcp_portfolio` OAuth grants, and public reads accept an MCP grant for per-user rate accounting. An official Kalshi MCP surface exists; relevant to this repo's MCP-based plan and not examined by the notes. [H]
4. Polymarket docs carry two products the notes do not mention: Perps (`/perps/...`, pUSD collateral) and Combos/RFQ (`/trading/combos/...`; Session Keys can be scoped to CLOB, Combos or All). Also `wallets-auth.md`: "All Polymarket account wallets deployed on or after May 4, 2026" are Deposit Wallets, so new users are `signatureType 3`, not EOA. [H]
5. Polymarket changelog items that affect any order relay: 2026-07-24 `POST /order` and `/orders` stop returning `transactionHashes` on FAK/FOK matches (poll by `tradeID`); 2026-07-17 retirement of the CLOB v1 Neg Risk Adapter in the relayer. [H]
6. Polymarket US has an institutional host (`polymarketexchange.com`) with report endpoints "Search trades" and "Get trade stats" listed in its llms index (authenticated; not examined). That is the likeliest trade-tape source, so "no public trade tape" should be read as "no public tape on the retail gateway". [M]
7. PayBox `get_portfolio` mentions outcome (prediction-market) balances priced "from the exact held side's orderbook midpoint" when "World is enabled": a possible native PayBox prediction-market surface worth a lead for the PayBox stream. [M]

### F. Secrets and addresses check

- The notes file contains no API keys, secrets, passphrases, IPs, emails or 40-hex wallet addresses. The only 64-hex value is a public Polymarket condition id; contract addresses in the notes are truncated public protocol contracts. [H]
- Fixtures: `data_v2_trades.json` has `proxy_wallet`, `name`, `pseudonym`, `bio` and profile images set to "REDACTED". Other fixtures contain only public protocol or operator addresses (`submitted_by`, `resolvedBy`, USDC.e `assetAddress` in Gamma payloads). No user wallet. No geoblock fixture was saved, so no IP is stored. [H]
- This verification section records no IP address or credential.
