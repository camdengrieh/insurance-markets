# Bayse Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes at 01:53-02:00 UTC by server `date` header). READ-ONLY: doc reads, unauthenticated GETs to documented hosts, one WebSocket HTTP upgrade (101, no subscribe sent). No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. The documented `POST .../quote` endpoint was NOT called (rule: no POST). Third-party pages and API text were treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale. Anything marked "NOT FOUND" lists where I searched. WebSearch budget ran out partway (two follow-up searches refused), so regulation findings rest on pages I could fetch directly.

---

## 0. Bottom line

1. **Live and actively developed.** (H) API serves 411 open events, events created minutes before my probe, 136,760 resolved events, docs changelog to v0.1.15 (2026-06-23), perps launch reported 2026-10-01.
2. **Centralized, custodial, off-chain.** (H) No on-chain markets, no outcome tokens, no wallet signatures. Orders are placed with an HMAC API key belonging to a KYC'd Bayse account (email login, BVN/ID verification, Nigeria-governed). Crypto only touches the venue at deposit/withdrawal (USDT/USDC on BNB Chain "BEP20" or Solana).
3. **Two engines:** AMM (404 of 411 open events, instant execution, house-backed pool, mechanism undocumented) and CLOB (7 of 411, only 15-min/hourly crypto, FX, gold series; order books are tens of dollars deep).
4. **Thin.** (H, computed from API) Sum of event `liquidity` across all open events = $864,991, median $500 per event, top 10 events hold $574k. `totalVolume` is 0 on every event (field not populated), so there is no volume figure from the API. Self-reported (secondary, early 2026): >$13M cumulative volume, >200k users (M/L).
5. **Best-in-class read access for its size:** public REST for events, books, ticker, trades, price history, sports, series; public WebSocket; no key needed for reads. Rate limits documented for keyed use.
6. **PayBox cannot trade it** (no signed orders or tx proposals). PayBox could only fund the custodial deposit address, and the account itself needs a human KYC'd identity.
7. **adapter_priority = P2.** Cheap read-only adapter as a signal source (Nigeria/Africa-specific markets have no overlap; global sports/crypto/stock markets overlap with other venues but at hundreds of dollars of depth). No trading adapter.

---

## 1. Is it still live (2026)?

| Evidence | Tag |
|---|---|
| `GET https://relay.bayse.markets/health` -> `{"status":"ok"}`; `/version` -> `{"commit":"7ee57b1"}` (2026-10-19). Fixture `system_health_version.json` | H |
| `GET /v1/pm/events?status=open` -> `totalCount` 411; BTC 15-min event `createdAt` 2026-10-19T01:45:10Z; resolved list `totalCount` 136,760 with newest `resolvedAt` 2026-10-19T01:47:01Z | H |
| Docs changelog v0.1.15 dated 2026-06-23 ("Seven new soccer sports market types"); earlier entries Mar-May 2026 (https://docs.bayse.markets/llms.txt) | H |
| Nairametrics 2026-10-01: Bayse launched perpetual futures on stocks/indices/commodities/crypto/FX | M (promotional piece) |
| Support center has a "Perpetual Contracts (Getting Started)" collection (20 articles) and "Combos & Combo Trading"; neither product is in the public API docs index | H (existence), NOT FOUND (API) |
| Formerly "Gowagr" (escrow wagering app); `bayse.markets` homepage text: "The future of prediction markets in Africa" | H (homepage), M (rename, from secondary pieces) |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** centralized prediction market / exchange for Africa (Nigeria first), with USD and NGN wallets. Not a protocol; no smart contracts found (NOT FOUND, searched: docs index, support center, GitHub `gh api search/repositories`, homepage nav). Only third-party community repos exist (unofficial SDK, bots, widgets); none inspected.
- **Hierarchy (H, https://docs.bayse.markets/concepts/events-markets-outcomes):** Event -> Market -> Outcome. Every market is **binary** (two outcomes, UUIDs `outcome1Id`/`outcome2Id`, labels e.g. Yes/No or Up/Down). Event `type`: `SINGLE_MARKET`, `COMBINED_MARKETS` (mutually exclusive, only one resolves YES - this is how categorical markets such as "Who will win X" are built from N binary markets), `GROUPED_MARKETS` (independent). No scalar markets (range questions are encoded as N threshold or bucket markets).
- **Engines (H):** one engine per event (`engine` = `AMM` or `CLOB`).
  - AMM: "Algorithmic pricing based on supply/demand... instant execution". The curve is **not documented** (NOT FOUND, searched: concepts/market-engines, fees, order-lifecycle, quote reference; no mention of LMSR or constant product). The quote response has `tradeGoesOverMaxLiability`, which implies a house-funded pool with a liability cap (M, inference). AMM trades cannot be cancelled; you sell back.
  - CLOB: limit/market orders, time-in-force GTC/GTD/FAK/FOK, post-only, self-trade prevention modes, batch place/amend (max 20) and cancel (max 100), mint/burn of YES+NO pairs. Observed trade rows have `matchType":"MINT"` (taker buys YES at 0.43 against maker buying NO at 0.57), i.e. complementary-pair matching like a CTF exchange but on an internal ledger (H, fixture `clob_trades_btc15m.json`).
- **Tokenisation (H):** none on-chain. Positions are ledger rows keyed by `outcomeId` (UUID). Winning share pays 1.00 (USD) or 100 (NGN, `currencyBaseMultiplier` 100); losing share pays 0.
- **Prices (H, computed over all 1,666 markets in the open list):** `outcome1Price + outcome2Price` = exactly 1.00 for 1,571 markets, 1.01-1.06 for 93, 1.12 for 1 (M: the excess looks like spread on a minority of AMM markets; not documented). `yesBuyPrice`/`noBuyPrice` are 0 in the list response, so the executable AMM price (fee-inclusive) is only available from `POST .../quote` (untested here).
- **Event series (H):** 43 recurring series (15-min, hourly, 6-hourly, daily) for BTC/ETH/SOL/BNB/XRP, gold/silver/WTI, FX pairs, and daily up/down on SPY/NVDA/GOOGL/AAPL/MSFT/AMZN/TSLA/NFLX. `GET /v1/pm/events/series` (fixture `event_series_sample.json`).
- **Soccer (H):** matches are linked by `sportGameSlug` (e.g. `bm-game-20261021-avl-vik`); 3-way H2H is a `COMBINED_MARKETS` event of three binary markets (Home/Draw/Away); plus goals, corners, cards, both-halves, player props (`sportMarketType`).
- **IDs:** event UUID + slug; market UUID; outcome UUID. Slugs are stable human-readable strings (e.g. `who-will-win-the-2027-presidential-election`).

---

## 3. Chains and collateral

- **Trading collateral (H):** internal USD wallet or NGN wallet (one at a time; open positions in one currency must be closed before trading the other - FAQ). USD base multiplier 1, NGN 100.
- **Crypto rails (H, https://support.bayse.markets/en/articles/13751042-supported-crypto-networks-and-tokens-on-bayse-markets, fetched via small-model summary so M on exact wording):** deposits supported on **BEP20 (BNB Smart Chain)** and **Solana**, tokens **USDT** and **USDC**; "Funds sent via unsupported networks may be lost". The `GET /v1/wallet/assets` doc example lists networks `bep20`, `tron`, `sol` (H, docs example; the support article does not list Tron, so treat Tron as unconfirmed).
- **Fiat (H, support + blog):** NGN by Nigerian bank transfer to a per-user virtual account; withdrawals to a bank account in the **same first and last name** as the Bayse account.
- **Limits and fees (M, small-model summary of https://support.bayse.markets/en/articles/12449505-deposit-withdrawal-limits-and-fees):** NGN min deposit N200, min withdrawal N500, max N2.5M per withdrawal, deposit fee 1% (min N5, cap N1,000), withdrawal N20 flat. USDT min deposit $1, min withdrawal $1, **max withdrawal $1,400 per transaction**. "Bayse does not charge platform fees for deposits or withdrawals"; the listed fees are payment-provider fees.
- No EVM chain other than BNB Chain; no Base/Ethereum/Arbitrum/Polygon support found (NOT FOUND, searched: support article, wallet-assets reference, ToS).
- Third-party directory claim "Solana network natively for stablecoin deposits and withdrawals" (https://madeonsol.com/tools/bayse-markets, M) is consistent with the first-party support article.

---

## 4. Read API

Docs: https://docs.bayse.markets/ (Mintlify; machine index https://docs.bayse.markets/llms.txt; each page also served as `.md`). Docs v0.1.x. **No usable OpenAPI**: `https://docs.bayse.markets/api-reference/openapi.json` is the Mintlify "OpenAPI Plant Store" placeholder (H, fetched). Sandbox: "currently a work in progress; use the production URL" (H, api-reference/introduction).

- **Base URLs (H):** REST `https://relay.bayse.markets`; WS `wss://socket.bayse.markets/ws/v1/{markets|user|realtime}`; app `https://app.bayse.markets`.
- **Auth for reads (H, verified by unauthenticated GETs):** events, event by slug/id, series, price history, order books, ticker, trades, sports leagues/teams/games all returned 200 with **no key**. Docs say "Public - no authentication required. Provide X-Public-Key to receive personalized data". Keyed reads (`X-Public-Key: pk_...`) are required only for `/v1/pm/portfolio`, `/v1/pm/orders`, `/v1/pm/activities`, `/v1/wallet/assets`, liquidity-reward and rebate endpoints.
- **Rate limits (H, https://docs.bayse.markets/rate-limits):** per API key, **30 req/s reads, 20 req/s writes**; 429 with `Retry-After` and `retryAfter`; login 1 request per 2 minutes per email; key create/revoke/rotate 2 per 30 minutes per session; **max 2 active API keys per user**; WS 10 messages/s per connection, upgrades rate-limited per IP. Anonymous (no-key) limits: NOT FOUND (searched: rate-limits page, response headers show only `date`/`content-type`). I issued ~35 sequential GETs at ~0.6 s spacing with no 429.
- **Pagination (H, observed):** `page` + `size`, response `pagination: {lastPage, page, size, totalCount}`. **`size` is capped at 20 on `/v1/pm/events`** (size=100 returned 20); `/v1/pm/trades` max 100. The quickstart page's `pagination {total, limit, offset}` is wrong/stale.
- **Key endpoints (H, paths from docs; ones marked "probed" were called):**

| Purpose | Endpoint |
|---|---|
| List events (probed) | `GET /v1/pm/events?status=open&category=&seriesSlug=&sportGameSlug=&keyword=&currency=USD\|NGN&page=&size=` |
| Event by id / slug (slug probed) | `GET /v1/pm/events/{eventId}`, `GET /v1/pm/events/slug/{slug}` |
| Series (probed) | `GET /v1/pm/events/series`, `GET /v1/pm/events/series/{slug}/lean-events` |
| Order books (probed) | `GET /v1/pm/books?outcomeId[]=<uuid>&outcomeId[]=<uuid>&depth=10&currency=USD` (CLOB only) |
| Ticker (probed) | `GET /v1/pm/markets/{marketId}/ticker?outcomeId=<uuid>` (CLOB only) |
| Trades (probed) | `GET /v1/pm/trades?marketId=&outcomeId=&fromDate=&toDate=&page=&size<=100` (CLOB only; rows include taker/maker user UUIDs) |
| Price history (probed) | `GET /v1/pm/events/{eventId}/price-history?timePeriod=1W&outcome=YES` -> `markets[].priceHistory[] {e: ms epoch, p: price}` |
| Sports (probed games) | `GET /v1/pm/sports/{leagues,teams,games}` |
| Quote (public, POST, NOT called) | `POST /v1/pm/events/{eventId}/markets/{marketId}/quote` body `{side, outcomeId, amount, currency}` -> `price, currentMarketPrice, quantity, amount, costOfShares, fee, priceImpactAbsolute, completeFill, tradeGoesOverMaxLiability` |
| Resolution | read from event/market: `status` (open/paused/closed/resolved/cancelled/draft), `resolvedAt`, market `resolvedOutcome`/`resolvedOutcomeId`, `resolutionSource`, `rules`, `eventCloseValue`/`marketCloseValue` on crypto |

- **Event fields worth mapping (H, fixture `events_list_sample.json`):** `id, slug, title, category, type, engine, status, closingDate, resolutionDate, resolutionSource, liquidity, totalOrders, totalVolume (always 0), seriesSlug, assetSymbolPair, eventThreshold, sportGameSlug, sportMarketType, regions, markets[]{id, title, outcome1Id/Label/Price, outcome2Id/Label/Price, feePercentage, minimumOrderAmount, rules, status, propLine}`. For crypto CLOB markets also `liquidityReward{rewardPool,maxSpreadCents,minNotionalOrderSize}` and `makerRebate{rebatePercentage,minPayoutUsd}`.
- **WebSocket (H, handshake verified):** `wss://socket.bayse.markets/ws/v1/markets` returned `101 Switching Protocols` then `{"type":"connected",...}` with no auth (fixture `ws_markets_connected.json`). Channels per docs (https://docs.bayse.markets/websocket/market-data): `activity` (buy_order/sell_order fills per event), `prices` (full event snapshot on `price_update`), `orderbook` (snapshots, up to 10 `marketIds`), `user_trades`; `/ws/v1/realtime` for crypto/FX asset prices (BTCUSDT, ETHUSDT, SOLUSDT, XAUUSD, EURUSD, GBPUSD, USDNGN); `/ws/v1/user` per-message auth for fills. Server may batch several JSON objects per frame separated by `\n`. Ping every ~54 s, close if no pong in 60 s. I did not subscribe, so message shapes are docs-only (M).
- **Doc inconsistencies to expect (H):** FAQ points at `wss://relay.bayse.markets/v1/ws` with channels orderbook/trades/ticker, which conflicts with the WS docs (the `socket.bayse.markets` host is the one I verified). Quickstart and auth examples still use `"outcome":"YES"` although changelog v0.1.6 (2026-03-13) made `outcomeId` and `type` (LIMIT/MARKET) mandatory. The `trading-flow` page shows a quote shape (`expectedPrice, expectedShares, total`) that differs from the reference page. Trust the reference pages and the live responses.
- **Data quality (H, computed):** 39 of 411 "open"/"paused" events have a `closingDate` in the past (some by months, e.g. an Avengers market closing 2026-07-17 and soccer total-goals markets from 2026-09/10-11); `sports/games` returns games with past `startDate` still `UNPLAYED`. An adapter must filter on `status == open` AND `closingDate > now` (154 events have no `closingDate`).

Fixtures saved (all <= 50 KB): `docs/research/fixtures/bayse-markets/` - see section 12.

---

## 5. Trade path

- **Programmatic trading exists (H):** `POST /v1/pm/events/{eventId}/markets/{marketId}/orders` with body `{side, outcomeId, amount, type: LIMIT|MARKET, currency, price?, timeInForce?, postOnly?, stpMode?, maxSlippage?, expiresAt?}`; `DELETE /v1/pm/orders/{orderId}`; batch place/amend/cancel; mint/burn (`POST /v1/pm/markets/{marketId}/mint|burn`).
- **Auth/signing (H, https://docs.bayse.markets/authentication):** API key pair `pk_*` / `sk_*`. Write headers `X-Public-Key`, `X-Timestamp` (unix seconds, 5-minute window), `X-Signature` = base64(HMAC-SHA256(secret, `{timestamp}.{METHOD}.{path}.{sha256hex(body)}`)); path excludes host; body hash is empty string when no body. Keys are created in the web app (Account Settings > API Keys) or via `POST /v1/user/login` (email + password, returns session token + deviceId) then `POST /v1/user/me/api-keys`. Social-sign-in (Apple/Google) users must first set a password. The secret is shown once.
- **No wallet-signed orders, no on-chain transaction proposals, no allowances (H).** Settlement is on an internal ledger.
- **Terms on automation (M, small-model summary of https://www.bayse.markets/terms-of-service, cl. 7.2):** automated access is allowed "only through the public API, under the separate Bayse API Usage Policy"; that policy was not found (NOT FOUND, searched: homepage nav, docs index, partner page). Prohibited: credential stuffing, reverse engineering, scraping outside the API policy, bypassing rate limits.
- **Builder/market-maker access (H, https://www.bayse.markets/partner):** contact `build@`/`engineering@` addresses on the page (not copied here) for a builder program with liquidity incentives and rev share; no approval process described.

---

## 6. PayBox reachability

**partial (funding only; trading no).**

- Trading needs an HMAC key tied to a KYC'd Bayse user account. A PayBox wallet cannot sign Bayse orders or propose transactions that place them. An agent would need the secret key delivered as a secret (not a wallet capability) and a human-created, human-verified account (one account per person; ToS cl. 2, 7.1).
- PayBox could **fund** the account: `request_transfer` of USDT/USDC to the deposit address shown in the Bayse wallet, on **BNB Chain (BEP20)** or **Solana** (the deposit address comes from the web app or the keyed `GET /v1/wallet/assets`). Wrong-network deposits may be lost. Withdrawals back to crypto are capped at $1,400 per transaction (M) and require KYC (name match applies to bank withdrawals).
- Net effect for an arbitrage scanner: Bayse can be a **priced leg only for a human-operated account**; capital recycling is slow and bounded.

---

## 7. Fees

- **Formula (H, https://docs.bayse.markets/concepts/fees):** `fee = feeRate x C x P x max(1 - P, 0.5)`, capped at $1,000 per trade, where C = shares, P = execution price, feeRate = the market's `feePercentage` / 100. Effective fee as a share of notional = `feeRate x max(1 - P, 0.5)` (7.0% at P=0.30, 5.0% at P>=0.50 for feeRate 0.10).
- **I checked the formula against two real fills (H, `clob_trades_btc15m.json`):** size 0.18382106 @ 0.43 -> 0.1 x 0.18382106 x 0.43 x 0.57 = 0.0045054 (reported `takerFee` 0.00450545); size 6.27215215 @ 0.53 -> 0.1 x 6.27215215 x 0.53 x 0.5 = 0.166212 (reported 0.16621203). Both match.
- **Who pays:** AMM - fee is embedded in the execution price (no separate field). CLOB - **takers only**; makers pay nothing; buy-side fee reduces shares received, sell-side fee reduces proceeds.
- **`feePercentage` distribution over 1,666 open markets (H, computed):** 10% on 755 markets, 4% on 725, 3% on 124, 2% on 26, 1% on 22, 5% on 7, 13% on 3, 0.4% on 2, 0.8% on 1, 0.05% on 1. Typical: sports/politics 4%, crypto/FX CLOB 10%, stock/commodity daily 3%.
- **Maker incentives (H, docs + event payload):** liquidity rewards (epoch pools, e.g. `rewardPool` 0.1, `maxSpreadCents` 5, `minNotionalOrderSize` 10 on a BTC 15-min market) and maker rebates (`rebatePercentage` 0.5, `minPayoutUsd` 1) on CLOB markets.
- **Deposit/withdrawal:** see section 3 (NGN 1% deposit fee; no platform fee on crypto, provider fees apply).
- **Arb implication:** a 4-10% taker fee on a near-50/50 market is far larger than typical cross-venue spreads; AMM mid prices are not executable prices (embedded fee plus impact), so edge detection must use `quote`, not list prices.

---

## 8. Resolution mechanism and dispute risk

- **Centralized (M, small-model summary of ToS cl. 4):** some markets (digital assets, FX, designated sports) resolve automatically from named third-party data feeds; **all others are resolved manually by the Events Contracts team with officer sign-off**; edge cases may be extended, cancelled or refunded "in good faith". Disputes must be written and filed within **7 calendar days**; re-resolution needs objective evidence; **"the Company's decision is final"**. Resolution records kept 3 years.
- **Per-market sources (H, `resolutionSource` over 411 open events):** ESPN 60, SofaScore 57, INEC (Nigerian electoral commission) 55, UEFA 24, SLStat 16, Premier League 13, Opta 10, France Football 9, Headies 12, Punch 11, and **"TBD" on 42 events**. Crypto: Binance spot pages for hourly/daily thresholds, **Chainlink Data Streams 60-second TWAP** for 15-minute Up/Down; stocks/commodities: **Pyth** (pythdata.app); `rules` text carries the exact criteria (e.g. "Up if the TWAP at 2:00 AM GMT is higher than or equal to the TWAP at 1:45 AM").
- **Basis risk for arbitrage (M):** the same underlying on Polymarket/Kalshi/Limitless resolves on different oracles and cut-off times (note "higher than or equal" -> Up on ties). Do not treat as the same contract without comparing `rules`.
- **Dispute risk: high** for subjective or "TBD"-source markets (sole operator discretion, no third-party arbiter, no published appeal beyond the 7-day written dispute). Stale open markets past `closingDate` (section 4) show lifecycle hygiene is imperfect.
- The published "Dispute Resolution Policy" covers **H2H wagers only**, not prediction markets (H, per page text: "It doesn't cover Prediction Markets").

---

## 9. Geo, ToS and automation

- **Operator and law (M, ToS summary):** "Trence Technologies Inc., doing business as Bayse Markets"; footer address in Dover (Kent County, Delaware format); governing law **Nigeria**; compliance claimed only for Nigeria (cl. 3.1-3.2).
- **Eligibility:** 18+, one account per person, sanctions screening; identity verification at signup (government ID, proof of address, **BVN**); "Prohibited Jurisdictions" list exists but is **not published** ("Users must check it themselves"; access from one is a material breach). Which countries are blocked (US, UK, EU): NOT FOUND (searched: ToS, prohibition policy, homepage, partner page, FAQ).
- **Prohibition policy page (M, small-model summary):** bans insiders and people who can influence outcomes (candidates, INEC staff, athletes, artists, etc.). Its mention of "prohibited market types" was ambiguous in the summary; I did not rely on it.
- **Regulation (conflicting, treat as unsettled):** ToS names no licence or regulator (M). A 2026-10-08 Substack piece says the licence "is a gaming permit, granted by the Lagos State Lotteries and Gaming Authority... It is not a securities licence" (M, https://tdgmperusal.substack.com/p/nigeria-has-the-bet-it-has-not-built). Nairametrics 2026-10-01 calls Bayse "a licensed prediction market" while saying the perps launch is "tied to Bayse's effort in securing a license from FSGRN" (M). A search-engine summary said Lagos had earlier (March 2026) classed Bayse as unlicensed; I could not verify it (L, search budget exhausted before I could open the source). Bayse's own blog asserts "prediction markets are legal in Nigeria" (H that the page says it; the claim itself is unverified).
- **Quoted terms (sparingly):** "Access from a Prohibited Jurisdiction constitutes a material breach" (ToS cl. 3.3, via summary); automation permitted "only through the public API" (cl. 7.2, via summary).
- **Integration consequence:** a read-only adapter on the public API is low-risk; any trading adapter is gated on a human KYC'd account, unknown geo rules, and an API Usage Policy I could not find.

---

## 10. Liquidity (all from the live API on 2026-10-19 ~01:54-01:58 UTC unless stated)

| Metric | Value | Tag |
|---|---|---|
| Open events | 411 (404 AMM, 7 CLOB); 7 paused | H |
| Sum of event `liquidity` (USD) | $864,991 (semantics undocumented; treat as AMM pool/seed depth, not volume) | H number, M meaning |
| Median / top-10 / >=$10k events | $500 / $574,300 combined / 13 events | H |
| Largest | EPL 2026/27 title $100,700; MLS Cup $100,700; Nigerian 2027 presidential $100,000; La Liga $70,700; UCL $50,700; EPL top scorer $50,700 | H |
| By category (liquidity, events) | Sports $628k/221; Politics $125k/79; Entertainment $26k/13; Finance $12k/24; Crypto $20k/12; Technology $20k/11; Economy $8k/7 | H |
| `totalVolume` | 0 on all 411 open events (not populated) | H |
| `totalOrders` (open events) | 132,973, of which 103,199 are three celebrity yes/no markets (Asake albums, Davido retirement, Ayra Starr marriage) | H |
| CLOB depth example | BTC 15-min market: YES bid 0.16/ask 0.19; 5 levels hold ~$81 of bids; 24h volume field 0 | H |
| Self-reported cumulative | ">13 million dollars in volume across over 200,000 users" by early 2026; ~$11k paid in liquidity rewards | M/L (Substack opinion piece citing the builders, 2026-10-08) |
| DefiLlama TVL/volume | n/a (off-chain venue) | - |

A single AMM order of a few hundred dollars would move most markets materially; assume order sizes of $10-$100 per leg.

---

## 11. Event coverage and overlap with other venues (where arbitrage could exist)

| Category (open events) | Examples | Overlaps with | Note |
|---|---|---|---|
| Sports, futures (H) | EPL/La Liga/Serie A/Bundesliga/Ligue 1 title, UEFA Champions League winner, NBA champion, F1 Drivers' Champion, Ballon d'Or, MLS Cup | Polymarket, Kalshi, Azuro, Limitless | Combined events (sum of Yes prices needs checking: 1.00-1.04 observed on politics sets) |
| Sports, matches (H) | 23 soccer 3-way H2H (e.g. AVL vs VIK 0.775/0.135/0.085), totals, corners, cards, both-halves | Azuro, sportsbooks, Polymarket soccer | Each AMM market seeded ~$100-$1,500 |
| Crypto price (H) | BTC/ETH/SOL/BNB "above $X at 4 PM GMT" (Binance), BTC/ETH/SOL/XRP/BNB 15-min Up/Down (Chainlink TWAP), hourly, daily | Polymarket, Kalshi, Limitless, Predict.fun | Only venue on this list with a **public CLOB** for these; tiny depth; oracle differs |
| Stocks, commodities, FX (H) | SPY/NVDA/GOOGL/AAPL/MSFT/AMZN/TSLA/NFLX daily up/down, gold/silver/WTI, USD/JPY, EUR/GBP hourly | Polymarket and Kalshi daily up/down | Pyth-resolved; some quotes look crowd-biased (SPY "Up" 0.825 and Silver 0.705 at 01:55 UTC, before the US session) (M) |
| Tech/corporate (H) | "Anthropic IPO by __?" ($15.7k liquidity), OpenAI IPO closing market cap, CEOs out before 2027 | Polymarket | Manual resolution, "TBD" source |
| US politics (H) | "Which party will win the Senate in 2026?" (Dem 0.645 / Rep 0.365 at 10% fee), tariff stimulus checks | Polymarket, Kalshi | Thin ($1k) |
| Macro (H) | South Africa inflation, MPC decision, Nigerian GDP/reserves/oil output | Mostly **not** on other venues | Unique signal |
| **Nigeria/Africa-specific** (H) | 2027 Nigerian presidential race (state-by-state winners, 79 politics events), Headies awards, NGX, Dangote Refinery IPO, naira rate | Little or none (maybe Polymarket on Nigerian election) | Main differentiator; mostly Nigerian-resolver INEC/Punch sources |

**Shares liquidity with another venue? No evidence.** Bayse runs its own AMM and its own CLOB with internal MINT matching; nothing in docs, ToS or the partner page mentions routing to Polymarket or any other venue (NOT FOUND, searched: docs index, concepts pages, partner page, blog). Treat as an independent leg (but see thin depth and custody limits).

---

## 12. Fixtures (`docs/research/fixtures/bayse-markets/`, all real responses fetched 2026-10-19)

| File | Source | Notes |
|---|---|---|
| `events_list_sample.json` | `GET /v1/pm/events?status=open` | 3 events (Ballon d'Or AMM with markets cut to 3; AVL vs VIK soccer H2H; BTC 15-min CLOB); image URLs removed; otherwise raw |
| `event_by_slug_sample.json` | `GET /v1/pm/events/slug/aston-villa-vs-viking-october-21-2026` | raw |
| `event_series_sample.json` | `GET /v1/pm/events/series?size=3` | raw |
| `clob_books_btc15m.json` | `GET /v1/pm/books?outcomeId[]=...&depth=5` | raw (YES and NO books) |
| `clob_ticker_btc15m.json` | `GET /v1/pm/markets/{id}/ticker?outcomeId=` | raw |
| `clob_trades_btc15m.json` | `GET /v1/pm/trades?marketId=&size=10` | taker/maker user UUIDs replaced by `<stripped>` |
| `price_history_sample.json` | `GET /v1/pm/events/{id}/price-history?timePeriod=1W` | raw, 31 KB |
| `sports_games_sample.json` | `GET /v1/pm/sports/games?size=3` | raw |
| `system_health_version.json` | `GET /health`, `/version` | combined |
| `ws_markets_connected.json` | first frame after WS upgrade | clientId replaced |

---

## 13. Adapter notes (what to build)

1. Poll `GET /v1/pm/events?status=open&size=20&page=1..N` (about 21 pages, ~3 MB) every few minutes, filter `closingDate > now`; for CLOB events call `/v1/pm/books` (supports multiple `outcomeId[]`) or subscribe to `orderbook` on the WS (<= 10 markets per subscription).
2. Normalise: Bayse market = binary contract with `outcome1`/`outcome2`; combined events are mutually exclusive sets (use for categorical consistency checks).
3. For AMM markets treat `outcome1Price` as indicative only; fee (`feePercentage`) plus impact are embedded in execution. A public `POST /quote` exists; add it later only with an explicit decision about POST use.
4. Currency: request `currency=USD` (default). NGN prices are x100.
5. Mark `liquidity` as AMM seed depth, not tradable size, and cap displayed capacity accordingly.

---

## 14. Open questions

- AMM curve/cost function and what `liquidity` means precisely; real executable depth needs `POST /quote` samples.
- Anonymous (no-key) rate limit; whether a key changes read limits materially.
- The "Bayse API Usage Policy" (referenced in the ToS) and the list of prohibited jurisdictions; whether non-Nigerian residents can complete KYC (BVN is listed as a document "or other requested documents").
- Licence status (Lagos gaming permit vs FSGRN vs none) - needs a primary regulator source.
- Whether the perps and "combos" products have API access (not in the public docs index).
- Actual daily volume (API `totalVolume` is empty; no independent source).

---

## Sources

- https://www.bayse.markets (homepage, footer links; fetched 2026-10-19) - H
- https://docs.bayse.markets/llms.txt and `.md` pages: index, quickstart, authentication, rate-limits, faq, concepts/{events-markets-outcomes,market-engines,fees,order-lifecycle,multi-currency,trading-flow,market-data,event-series,sports-markets}, websocket/{introduction,connection,market-data,errors}, api-reference/{introduction,pm/list-events,pm/order-book,pm/ticker,pm/trades,pm/get-quote,pm/place-order,wallet/get-assets}, changelog/2026-03-12, 2026-06-23 - H
- https://docs.bayse.markets/api-reference/openapi.json (placeholder spec) - H
- Live probes: `https://relay.bayse.markets/{health,version,v1/pm/events,v1/pm/events/series,v1/pm/events/slug/...,v1/pm/events/{id}/price-history,v1/pm/books,v1/pm/markets/{id}/ticker,v1/pm/trades,v1/pm/sports/games}`; `https://socket.bayse.markets/ws/v1/markets` (HTTP upgrade only) - H
- https://www.bayse.markets/terms-of-service, /dispute-resolution-policy, /prohibition-policy, /partner, /blog/prediction-markets-in-nigeria - M (small-model page summaries)
- https://support.bayse.markets/en/ (collection index), .../collections/13895073-wallets-deposits-withdrawals, .../articles/13751042-supported-crypto-networks-and-tokens-on-bayse-markets, .../articles/12449505-deposit-withdrawal-limits-and-fees - H (index), M (article text via summary)
- https://madeonsol.com/tools/bayse-markets (directory listing; Solana deposit claim) - M
- https://nairametrics.com/2026/04/08/africas-largest-prediction-market-bayse-launches-financial-markets/ and https://nairametrics.com/2026/10/01/bayse-markets-launches-derivatives-for-stocks-indices-commodities-and-more/ (promotional) - M
- https://weetracker.com/2026/03/17/prediction-markets-nigeria-luno-launch/ - M (no licence detail)
- https://tdgmperusal.substack.com/p/nigeria-has-the-bet-it-has-not-built (2026-10-08; volume/users/licence claims) - M/L
- https://techcabal.com/2026/10/07/what-prediction-markets-must-fix-to-remove-the-gambling-label/ and https://techcabal.com/2026/08/24/africas-largest-prediction-market-bayse-called-the-osun-state-election-weeks-before-it-happened/ - blocked (HTTP 403 to WebFetch); only the search-result titles were seen
- GitHub `gh api search/repositories` for "bayse markets prediction": only unofficial community repos; no official org found - M
