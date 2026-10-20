# Gambit Zone (gambit.zone) - adapter spec

Researched 2026-10-19 (~01:50-02:10 UTC). READ-ONLY: unauthenticated GETs to documented hosts, `gh api` file reads, no accounts, no wallet connections, no signing, no POST/PUT/DELETE, no browser automation. PayBox tools were not called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (DefiLlama PR bodies, site copy, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/gambit-zone/` (8 files, all <= 18 KB).

## 0. Verdict

**adapter_priority: P2** (signal / thin leg; cheap read adapter, do not build a trading adapter first).

1. **Live, but idle at check time.** Official API answers, maintenance flag false, a vault was re-valued at 01:00 UTC today, docs deployed ~2026-10-08 (H). But `GET /users/api/v1/assets` and `GET /market/v1/tickers` returned **zero tradeable instruments** on ~8 calls over ~4 minutes (01:55-01:59 UTC) (H). So I could not capture a real order book or trade sample. Could be an hours-dependent listing or a pause; unknown.
2. **Real, documented, keyless market-data API** (REST + WebSocket, OpenAPI 3.0.3) and a JWT-authenticated trading API explicitly branded "Market Maker Reference" (H). Technically the best-documented small venue I have seen.
3. **Very thin and centralised.** Only visible liquidity is one public vault (GLP) with total value about $201.5K (H, 2026-10-19). Max single deposit $1,000 USDC; withdrawals are admin-approved once a day; docs say "alpha testing" (H). Off-chain matching and settlement by the operator; no on-chain market contracts documented.
4. **Crypto-price-only** (above/below strike at expiry, Deribit-style instruments). The overlap with Polymarket/Kalshi/Limitless/Predict.fun crypto-price markets is real, but the settlement source and expiry times probably differ (basis risk), and the fee is charged per contract not per notional (up to ~4%+ of notional at mid prices, more at the tails; see section 5).
5. PayBox: an Arbitrum EOA can fund it (USDC transfer) and can produce the one wallet-signature login, but orders are not signed individually (JWT bearer), so trading runs in our service, not as PayBox transaction proposals (section 4).

## 1. Liveness and identity (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama protocol id 7912 "Gambit Zone", category Prediction Market, chain Arbitrum, twitter `Trade_Gambit`, description "Gambit is a decentralised prediction market focused exclusively on predicting asset prices." No TVL series (`module: dummy.js`), `url` blank, `audits: 0` | `GET https://api.llama.fi/protocol/gambit-zone` | H |
| Listing PRs `DefiLlama-Adapters` #19329 / #19346 (2026-05-20), treasury PR #19353 (2026-05-21, merged), #19354 (closed). PR body: **Website `https://app.gambit.zone`**, Chain Arbitrum, "Current TVL: 200,000" (self-reported), oracle "Deribit for crypto prices ... used for calculation of fair price and the settlement price", referral program yes, no audits, no github | `gh api repos/DefiLlama/DefiLlama-Adapters/pulls/{19329,19346,19353,19354}` | H (what they wrote); M (claims true) |
| Domain match: docs say referral links are `https://app.gambit.zone/?ref=...`, and the docs and API live on `docs.gambit.zone` / `api.gambit.zone` | https://docs.gambit.zone/docs/referral-program | H |
| API up: `GET /users/api/v1/config/maintenance` -> `{"data":[{"value":false}],"success":true}` at 2026-10-19 01:55 UTC | fixture `config_maintenance_2026-10-19.json` | H |
| Vault `Gambit Liquidity Provider (GLP)` ACTIVE, `updated_at_us` = 2026-10-19 01:00:00 UTC, `created_at_us` = 2026-05-01 15:38 UTC | fixture `vaults_public_2026-10-19.json` | H |
| Docs site CDN object age 911,421 s (~10.5 days) on 2026-10-19, so last (re)deploy about 2026-10-08 | HTTP headers of https://docs.gambit.zone/ | H (header); date M |
| **No tradeable instruments listed**: `/users/api/v1/assets` -> `data: []`, `/market/v1/tickers` -> `data: []` (~8 calls, 01:55-01:59 UTC) | fixtures `assets_empty_*`, `tickers_empty_*` | H |
| Marketing site `https://www.gambit.zone/` (last-modified 2026-10-15) is now **"Gambit Terminal"**, a crypto/US-equities research terminal with Hyperliquid perps; the words "prediction", "Polymarket", "Kalshi", "Arbitrum" do not appear on the homepage, the sub-pages I fetched, `llms.txt`, or the terminal ToS | grep over fetched pages | H (absence) |

Read of the above: the prediction-market product still has live infrastructure and an up-to-date doc set, but the operator's front page has pivoted to a terminal product. Treat as "alive, possibly deprioritised". The identity link (DefiLlama "Gambit Zone" == gambit.zone) rests on the PR's website field matching the docs' app domain (M-H). Same-name projects on DefiLlama are different: "Gambit Financial" (BNB perps, id 3087) and "Gambit Trade" (zkSync/Arbitrum perps, id 3325, dead URL) (H, `api.llama.fi/protocols`).

## 2. What it is

- **Kind**: onchain-other in DefiLlama's taxonomy, but functionally a **centralised off-chain order book with on-chain USDC deposits/withdrawals on Arbitrum** (H, docs). Matching, balances, settlement all happen on the operator's servers; the three internal wallets (Deposit / Trading / Vault) are ledger entries, not on-chain accounts.
- **Market model (H, https://docs.gambit.zone/docs/trading-predictions)**: binary "predictions" on crypto prices: "Will the price of [crypto] be above [strike] at [expiry]?" Instrument = underlying + expiry + strike. Pays $1.00 or $0.00 per contract. Price range $0.0001-$0.9999 (4 dp). Min quantity 1 contract. Continuous limit order book (price-time presumably; not documented), with L2 books, trades, candles.
  - Rules: Up buyer wins if settlement index price is **strictly above** strike; Down buyer wins if **strictly below**; **exactly equal -> buyer loses both ways** (H, docs).
  - Cannot trade "an hour before expiry" (H, docs).
  - Selling = opening a short against the contract (collateral reserved = $1 x qty + fee, H docs fees page).
  - The API calls the instruments `asset_type` `OPTION` or `TRADFI_OPTION`, with `instrument_name`, `currency`, `strike_price`, `expiry_timestamp` (microseconds), `settlement_index_price`, `force_close`, `force_close_price`, `oi_cap` (H, OpenAPI `Asset`). The API calls it "the Gambit binary options platform" (H). `TRADFI_OPTION` is not explained anywhere in the docs (NOT FOUND).
  - How "Up" vs "Down" is encoded (separate instruments, call/put in `instrument_name`, or a side flag) is **not documented** (NOT FOUND; no live asset row to look at).
- **Tokenisation**: none. No outcome tokens; positions are database rows (H). Not transferable, not composable.
- **Chain / collateral (H, docs)**: Arbitrum only; USDC only. Deposits by on-chain USDC transfer to "the platform's deposit address" (address not published in docs; shown in the app after login: NOT FOUND). Internal precision 1e6.
- **Other products**: community vault (GLP) providing liquidity; vault leaders can open their own vaults; referral points (rewards "coming soon"). "Multiplier: a leverage factor applied to certain prediction contracts" appears in the glossary and nowhere else (NOT FOUND).

## 3. Read API (official, public for market data)

- **Docs**: https://docs.gambit.zone (user guide) and the API reference https://api.gambit.zone/users/docs (Scalar UI) backed by **https://api.gambit.zone/users/openapi.json** (OpenAPI 3.0.3, "Gambit API - Market Maker Reference", v2.0.0, 71 KB). Excerpt saved in `openapi_excerpt_2026-10-19.json`. (H)
- **Base URLs (H, requests succeeded)**:
  - Market data + config + vault lists (no auth): `https://api.gambit.zone/market/v1/...` and `https://api.gambit.zone/users/api/v1/...`. The OpenAPI `servers: [/users]` makes the market paths look like `/users/market/v1/...`; that returned 404. The working form is **`/market/v1/...` with no `/users` prefix** (H, tested).
  - Account/trading (JWT): `https://api.gambit.zone/users/api/v1/...`
  - WebSockets: `wss://api.gambit.zone/market/ws` (public), `wss://api.gambit.zone/users/ws` (authenticated trading/account/chat). The spec mentions a staging host `api.staging.gambit.zone`; it failed TLS handshake from here (H), ignore it.
- **Envelope**: `{"success": bool, "data": [...], "timestamp": <microseconds>}`; paginated lists add `pagination{currentPage,totalItems,totalPages}` and take `page` and `page_limit`. All prices, quantities, volumes are **integers x1e6** (microUSDC); all times are **microseconds since epoch** (H, spec).

| Need | Endpoint (no auth unless noted) | Tag |
|---|---|---|
| Market list | `GET /users/api/v1/assets?page=&page_limit=` (also `?asset_id=` filter, any status). Fields: `id` (UUID = asset_id), `currency`, `asset_type`, `expiry_timestamp`, `expiry_date`, `strike_price`, `is_active`, `oi_cap`, `settlement_index_price`, `instrument_id`, `instrument_name`, `force_close`, `force_close_price`, `open_interest`, `volume` | H spec; response currently empty |
| Best bid/ask + stats for all | `GET /market/v1/tickers`: `asset_id, bid_price, bid_quantity, ask_price, ask_quantity, last_traded_price, model_price, open_interest, volume (24h), timestamp_us`. `model_price` = "theoretical model price" (likely Deribit-vol-derived digital price; model not described: NOT FOUND) | H spec; response currently empty |
| Book | `GET /market/v1/books?asset_id=<uuid>&depth=1..1000` (default 100) -> `[{asks:[{price,quantity}], bids:[...], seq, timestamp_us}]` | H spec |
| Trades | `GET /market/v1/trades?asset_id=&limit=1..1000` -> `{price, quantity, is_buyer_maker, seq, timestamp_us, count}` | H spec |
| Candles | `GET /market/v1/candles?asset_id=&interval=1m|15m|1h|4h|1d&limit<=1440&start_time&end_time` -> OHLCV x1e6, `open_time_us`, `close_time_us`, `closed` | H spec |
| Resolution | `settlement_index_price` on the asset; `GET /users/api/v1/settlements` (JWT; fields `settlement_status UNSETTLED|SETTLED`, `settlement_index_price`, `payout`); docs say settlement index also shown on the app's "Settlement History" tab | H spec |
| Ops flags | `GET /users/api/v1/config/{maintenance,withdrawal-mode,withdrawal-fee,access-code-required}`: today false / false / 3000000 (= 3 USDC) / false | H (fixtures) |
| Vaults | `GET /users/api/v1/public/vaults`, `/public/vaults/summary` | H (fixtures) |
| Market WS | `wss://.../market/ws`; send `{"method":"subscribe","params":{"channels":["tickers:<asset_id>" | "books:<depth>:<asset_id>" | "trades:<asset_id>" | "candles:<interval>:<asset_id>"]}}`; pushes `{"type":"data","channel":..., "asset_id":..., "data":{...}}`; heartbeat `{"method":"heartbeat"}`; the book has a `seq` for gap detection | H spec; **not connected** (no live instruments, and opening a socket gives no extra shape info) |

- **Auth/limits**: market data needs no key. **Rate limits: NOT FOUND** (searched the OpenAPI text, docs FAQ, ToS; no `429`/`Retry-After` documented). CORS is `*`. Nothing else.
- **Not available**: no historical settled-contract list without auth (the `/assets?asset_id=` filter returns "any status" for a known UUID, but you must know the UUID); no public "all trades" feed; no volume history; DefiLlama has no volume/fees adapter for it (`/summary/fees/gambit-zone` and `/summary/dexs/gambit-zone` return 400 "not found").
- **Real response samples captured** (fixtures): `config_*`, `vaults_public`, `vaults_summary`, `assets_empty`, `tickers_empty`, `openapi_excerpt`. Book/trade/candle payload shapes are from the spec only (H spec, NOT observed live). The first live capture should be done by the adapter's integration test.

## 4. Trade path and PayBox reachability

- **Auth (H, spec)**: (1) `GET /users/api/v1/auth/nonce` -> short-lived nonce (valid ~15 min); (2) wallet signs the nonce; (3) `POST /users/api/v1/auth/verify {wallet_address, signature, nonce, referrer_code?, access_code?}` -> `{user_id, jwt, token_type: Bearer, expires_at_us, ...}`. The spec example has a ~24 h JWT lifetime (86,400 s between the example `created_at_us` and `expires_at_us`; L, from sample numbers). Signature scheme (EIP-191 `personal_sign` vs EIP-712) and exact message text: **NOT FOUND** (spec says only "Signature over the nonce"; docs say "sign a message ... not a transaction"). This is account creation on first sign-in (`is_new_account`), so it was not exercised.
- **Orders (H, spec)**: `POST /users/api/v1/binary/order` with Bearer JWT: `{asset_id, id?(client order id), type: LIMIT|MARKET_LIMIT, tif: GTC|IOC|FOK, is_buy_side, quantity (x1e6), limit_price (x1e6), is_reduce?, is_post_only?}`; cancel one `DELETE .../binary/order {id, asset_id}`; cancel all `DELETE .../binary/order/all`. Order lifecycle statuses (NEW, VALIDATED, PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED, EXPIRED) and terminal confirmations come over the **trading WebSocket** (`method: auth` with `client_id` + `jwt_token`, then `order`). Order type `FORCE_CLOSE` exists (platform-initiated). Old `/binary_order` routes are deprecated.
- **No per-order signature**: orders are authorised by the JWT only. Anyone holding the JWT can also call `POST /wallet/withdraw` with an arbitrary destination (H, spec: withdrawal body takes `wallet_address`; "reserves from your MAIN wallet and enforces per-tx and daily caps" - the cap values are NOT FOUND). Store the JWT as a secret; never log it.
- **Funding**: USDC on Arbitrum, transferred on-chain to the platform deposit address; credited after 12-48 confirmations depending on size (~2-8 min), max **$1,000 per deposit**, then an internal **free, instant** transfer Deposit -> Trading wallet (H, docs). Withdrawal: from Deposit wallet only, flat **3 USDC** fee, min 3 USDC, processed **once daily ~13:00-14:30 UTC subject to admin approval** (H, docs).
- **PayBox reachable: partial.** An Arbitrum EOA held in PayBox could (a) send the USDC deposit (`request_transfer`, deposit address obtained from the logged-in app; not in docs) and (b) sign the login nonce (`request_wallet_sign`, if PayBox can produce the message type Gambit expects; unverified, and each login needs a human approval window). It cannot place orders as "transaction proposals" or "signed orders" because order entry is JWT + HTTPS/WS, not on-chain and not signature-per-order. So the plugin would need the aggregator process to hold a JWT and trade off-PayBox, with PayBox only used for funding/withdrawal-address control. Withdraw destination should be pinned to the PayBox wallet; the `withdraw` endpoint is a live hazard if the JWT leaks.
- **Settlement of funds**: custody is entirely with the operator between deposit and withdrawal (H). Counterparty risk is the main reason this should never be a large-notional leg.

## 5. Fees

- **Formula (H, https://docs.gambit.zone/docs/fees)**: `fee = quantity x fee_rate`, charged on the **number of contracts**, not on `price x quantity`. Example from docs: 100 contracts at $0.50 with a 2% taker rate -> fee $2.00 (4% of the $50 notional), total cost $52.00. A 1.5% maker rate is shown in the FAQ/tooltip example. Buy total = `qty x limit_price + qty x fee_rate`; sell reserve = `qty + qty x fee_rate`. The docs examples are illustrations; **actual tier thresholds and rates: NOT FOUND publicly** (`GET /users/api/v1/fee-config` and the in-app Account Overview are JWT-gated; units are "bps x1e6").
- **Who pays**: taker on MARKET_LIMIT or immediately-filling LIMIT; maker on resting LIMIT; post-only guaranteed maker; reduce-only reserves the higher of the two and refunds excess (H, docs). `MARKET_LIMIT` fills at best price **plus 0.5% protection** (FAQ, H).
- **Other**: withdrawal flat 3 USDC (H, API confirms `3000000`); vault performance fee set by leader (GLP shows `fee: 0`, H fixture); gas for deposits on Arbitrum is on the user. No settlement fee mentioned.
- **Arbitrage implication (M, arithmetic from the docs example)**: if rates are near 2%/1.5% of $1, round-trip cost to enter and hold to settlement is about 2% of payout per contract at any price, i.e. ~40% of notional at a 5-cent contract and ~4% at 50 cents. Only wide dislocations (>5-10 points) in mid-priced strikes can survive that.

## 6. Resolution, custody, dispute

- **Mechanism (H docs; M for oracle)**: at expiry the platform compares a "settlement index price" to the strike and credits/debits the Trading Wallet automatically. The docs never name the index. The listing PR says **Deribit** index for "fair price and the settlement price" (M, the operator's own statement to DefiLlama). Expiry timestamps come from an "instrument feed" stored in ms (OpenAPI Asset note, H), consistent with Deribit's instrument list (M).
- **Operator powers visible in the schema (H)**: `force_close` / `force_close_price` on assets, order type `FORCE_CLOSE`, `oi_cap` per instrument, admin-approved withdrawals, "We reserve the right to decline cancellation requests if a balance discrepancy is detected" (withdraw docs).
- **Dispute process**: NOT FOUND (no UMA/Kleros/escalation; no documented process for a wrong index print). Treat as "operator decides". No audit (DefiLlama `audits: 0`), no GitHub, no on-chain contracts documented.
- **Basis vs other venues (M)**: Deribit-index time of expiry (Deribit dailies expire 08:00 UTC) vs Polymarket/Kalshi/Limitless sources (Binance/Chainlink/CF Benchmarks windows) -> different expiry timestamps and averaging windows; strict-inequality tie rule differs again. The matcher in `docs/market-linking-design.md` should mark Gambit contracts `resolution_source_equiv = false` unless the index and timestamp are matched by hand.

## 7. Geo / ToS / automation

- The prediction app's own Terms of Service were **not retrievable**: `app.gambit.zone` answers with a Vercel bot-challenge (HTTP 429/403 for curl and WebFetch); I did not try to bypass it. Docs mention a ToS signature on first login but no jurisdiction list (NOT FOUND).
- The **Gambit Terminal** ToS (https://terminal.gambit.zone/terms, updated 2026-09-17, H) covers the terminal and gambit.zone, not necessarily the prediction app: operator "Gambit"; users must be 18+, not sanctioned, "not located in a country or region where using the Service is prohibited"; §9 forbids "scrape or harvest data from the Service at scale" and circumventing "rate limits, access controls". It does not name any list of countries.
- Automation: the OpenAPI is titled "Market Maker Reference" and documents programmatic order entry and WebSockets, so API trading is clearly intended (H); no written API ToS or rate-limit policy (NOT FOUND).
- Legal posture (M, my inference, not advice): an unlicensed offshore operator listing binary options on crypto prices; US/UK/EU access likely restricted in the app ToS I could not read. Do not route US persons' funds here without reading the app ToS.

## 8. Liquidity (as of 2026-10-19)

| Metric | Value | Source / tag |
|---|---|---|
| GLP vault `total_value` | **201,522,022,600** (units x1e6 -> **$201,522.02**) | `GET /users/api/v1/public/vaults`, 2026-10-19 01:00 UTC re-valuation (H; unit reading M) |
| GLP `total_shares` | 200,722,875,888 -> value/unit about 1.0040 (+0.4% since inception 2026-05-01, if units started at 1.0; M) | same |
| Vault count | 1 active (`/public/vaults/summary`: `active_vaults 1, tvl 201522022600`) | H |
| Self-reported TVL at listing | $200,000 (2026-05-20) | DefiLlama PR body, H (claim), L (staleness 5 months) |
| Volume / OI / trades | **NOT FOUND**: tickers and assets empty at check; DefiLlama has no TVL series or volume adapter | H (absence) |
| Treasury addresses per DefiLlama registry (Arbitrum; tokens USDC + native ETH; owners): `0xDA1f681eEC73bC4a7CB6C90696F0744D46C282d6`, `0x5Fd54D6835D32AdFAd96339051Fc8CD2E441a65D`, `0xdF582Ae88f1Abd0AdF6D48988A87ceD1594f4791` | `registries/treasury.js`, key `treasury/gambitzone`, merged 2026-05-21 | H (registry); role (hot wallet vs deposit vs operator) unknown. Balances not read (Blockscout API is behind a Cloudflare challenge; JSON-RPC needs POST) |

The vault is described as "community-owned ... provides liquidity to Gambit" (H, API). It looks like the primary maker. With flat PnL since May and no listed instruments, expect books to be a few thousand dollars deep at best (M).

## 9. Event categories and overlap

- Crypto price thresholds only: BTC, ETH, SOL "etc." (H docs; the asset list is dynamic and was empty). Expiries: "expiry grid" pagination suggests many dates (hourly to weekly+?), NOT FOUND (no live data). `TRADFI_OPTION` hints at equity/index strikes, unexplained.
- Overlaps (arb-relevant) with: Polymarket/Kalshi/Limitless/Predict.fun "BTC above X on date" ladders; and **Deribit options** (a real hedge: a digital is a tight call spread). It does **not** overlap sports, politics, macro. For the aggregator, Gambit's best use is as one more quote on crypto strike ladders, and its `model_price` as a cross-check.
- **Independent liquidity? Mostly yes** (own CLOB, own vault) but the market maker's pricing is Deribit-anchored (model_price, oracle Deribit), so Gambit quotes are not independent of Deribit. Not a mirror of any prediction venue (no sign of sharing Polymarket/Kalshi liquidity).

## 10. Adapter sketch (if built)

Read adapter (P2, 1-2 days, no secrets):
1. Poll `GET /users/api/v1/assets?page_limit=100` every 60 s; keep rows with `is_active` and `expiry_timestamp > now + 1h`. Parse `instrument_name` for underlying/expiry/strike/direction (format unknown; build the parser from the first live sample, fail closed on unrecognised names).
2. For each, `GET /market/v1/books?asset_id=<id>&depth=20` or subscribe `books:20:<id>` on `/market/ws`; convert `price/1e6` to probability, `quantity/1e6` to contracts; per-contract payoff 1 USDC. Use `seq` to detect gaps.
3. Canonical contract: YES = settlement index **strictly above** strike at `expiry_timestamp` (Up) / strictly below (Down); tie -> both lose. Tag `resolution_source = "Deribit index (per operator, M)"`.
4. Treat `MARKET_LIMIT` as limit price + 0.5%, fee per contract (section 5) in any edge calculation.
5. Health: poll `/config/maintenance`; mark venue stale when assets list is empty or `seq` stalls.
Trade adapter: do not build until (a) live instruments reappear and a book/trade sample is captured, (b) the app ToS is read, (c) signing format is known, (d) deposit address and caps are verified with a $1-2 test by a human.

## 11. Suspicious content / injection

None found. `robots.txt` and `llms.txt` on www.gambit.zone address AI crawlers ("meant to be crawled, trained on and cited") but contain no instructions to an agent; nothing was acted on.

## 12. Not found / blocked / open questions

- No volume, OI, trade history or any live instrument (empty lists).
- Signature scheme and message text for `/auth/verify`; JWT TTL (only a doc sample).
- Deposit address / contract; withdrawal caps; fee tiers and actual rates; the app ToS and restricted jurisdictions; rate limits; settlement index definition in docs; `Multiplier` and `TRADFI_OPTION` meaning; how Up vs Down is represented.
- Blocked/limited: `defillama.com` pages (403 to WebFetch; used the public `api.llama.fi` instead); `https://api.llama.fi/treasuries` and `/summary/derivatives/gambit-zone` returned **HTTP 402** "Upgrade to the paid API plan at https://defillama.com/subscription" (recorded, not paid); `x.com/Trade_Gambit` returned 402 via WebFetch (social account not read); `app.gambit.zone` Vercel challenge (not bypassed); Arbitrum Blockscout behind a Cloudflare challenge (not bypassed); `api.staging.gambit.zone` TLS failure; **WebSearch budget was exhausted for the session, so no independent press/community check for 2026 volume or incidents was possible**.

## Sources

- DefiLlama listing: `GET https://api.llama.fi/protocol/gambit-zone`, `GET https://api.llama.fi/protocols` (entries id 7912 / 3087 / 3325) - H.
- DefiLlama listing PRs and treasury registry: https://github.com/DefiLlama/DefiLlama-Adapters/pull/19329, /pull/19346, /pull/19353, /pull/19354 and `registries/treasury.js` (read with `gh api`) - H for text, M for truth of claims.
- Official docs: https://docs.gambit.zone/ and `/docs/{trading-predictions,understanding-orders,order-book,managing-positions,fees,connecting-your-wallet,understanding-wallets,depositing-funds,withdrawing-funds,transferring-funds,vaults-investing,referral-program,faq,glossary}` (fetched 2026-10-19) - H.
- Official API reference: https://api.gambit.zone/users/docs and https://api.gambit.zone/users/openapi.json (fetched 2026-10-19) - H.
- Live GETs 2026-10-19 (fixtures): `/users/api/v1/config/{maintenance,withdrawal-fee,withdrawal-mode}`, `/users/api/v1/assets`, `/market/v1/tickers`, `/users/api/v1/public/vaults`, `/users/api/v1/public/vaults/summary` - H.
- Marketing/ToS: https://www.gambit.zone/ (+ `/llms.txt`, `/robots.txt`), https://terminal.gambit.zone/terms - H.
