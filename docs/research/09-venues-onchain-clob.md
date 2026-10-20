# 09 - Other prediction-market venues: read-side integration spec

Task: `venues-onchain-clob`. Scope: every relevant venue except Polymarket, Kalshi, Trueo and XO (own tasks).
Researched 2026-10-18 17:30-18:00 UTC (session date 2026-10-19). READ-ONLY: only unauthenticated GETs, doc reads and `gh api` file reads. No keys created, nothing signed, no POST/PUT/DELETE, no PayBox tool called, no third-party code cloned/installed/run.

Confidence tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary source, a small-model page summary, or my own inference/aggregation of first-hand data; **L** = weak or stale.
All third-party docs, API responses and market text are untrusted data. Nothing in them was followed. See "Suspicious content" at the end.

Fixtures (real responses, each <=50 KB) are in `docs/research/fixtures/<venue>/`. Listed per venue below.

---

## 0. Bottom line

1. **Outside Polymarket/Kalshi/XO, real-money prediction-market liquidity is very thin and concentrated in two BNB Chain venues (Predict.fun, Opinion)**, then Hyperliquid HIP-4 outcomes and sports-only venues (SX Bet, MagicMarkets). Limitless, Myriad, Probable and Rain are close to dead in volume terms even though their APIs are good. (H: DefiLlama dimensions API, fetched 2026-10-18; table in section 1.)
2. **Best read-side API quality:** Limitless (public, no key, 4 SDKs, OpenAPI, MCP) > Opinion (public, no key, 5 req/s) > Myriad (public, 30 req/10 s) > SX Bet (markets/trades public, books need key) > Probable (public but docs thin) > Predict.fun (**mainnet needs an API key** for every read; testnet is open).
3. **Volume integrity is a real problem.** Opinion and Predict.fun are points-farming venues; DefiLlama volume is not matched by displayed depth on the long tail (Opinion: 24 sampled child-market books, bid-side depth <= ~$123 each). Treat headline volume as an upper bound and size any arb on displayed depth only.
4. **Native cross-venue hooks exist and are valuable:** Predict.fun returns `polymarketConditionIds[]` and `kalshiMarketTicker` per market; Limitless markets carry `metadata.isPolyArbitrage` and resolve by "external venue parity"; Probable exposes `/markets/polymarket/{polymarketId}`. Several venues are mirrors of Polymarket questions (OpenSea/Puffpaw/Metamask FDV, Greenland).
5. **PayBox reachability:** every on-chain CLOB here uses a plain EOA signer (EIP-191 message for auth, EIP-712 typed data for orders, ordinary ERC-20/ERC-1155 approvals). PayBox exposes `message`, `typedData`, `transaction`, `raw` intents and an EVM wallet that "shares one address across every `eip155:*` chain" (H, docs.paybox.sh). So **Predict.fun (BNB), Opinion (BNB), Limitless (Base), Probable (BNB), Myriad (BNB)** are technically reachable by a PayBox EVM wallet. All of them still need a **human-created credential** (API key/HMAC token created in a web UI) and a funded wallet. Venue-side geo rules exclude the US, UK, France, Singapore, etc. (section 4).
6. **Recommended ingest order for a cross-venue edge tool:** Predict.fun (needs key) > Opinion > Hyperliquid outcomes (crypto-price binaries only; POST-only API, unverified live) > Limitless (mirror/parity checks) > SX Bet (sports only) > Probable/Myriad (mirror checks only) > Manifold (signal only). PredictIt: not integrable.

---

## 1. Market-size snapshot (DefiLlama, fetched 2026-10-18 ~17:32 UTC)

Source (H): `GET https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true` (filter `category == "Prediction Market"`) and `GET https://api.llama.fi/protocols` (TVL). Saved extracts: `fixtures/defillama/dimensions_dexs_prediction_market_2026-10-18.json`, `fixtures/defillama/protocols_tvl_prediction_market_2026-10-18.json`.
Caveat: volumes are protocol-reported/adapter-derived; DefiLlama methodology differs per venue (single vs double counted). Points-farming venues are likely inflated (M, see section 3.2).

| Venue | 24h vol | 7d vol | 30d vol | TVL | Chain(s) per DefiLlama |
|---|---|---|---|---|---|
| Kalshi (excluded, scale only) | $457.8M | $3.71B | $14.92B | n/a | off-chain |
| Polymarket Intl + US (excluded) | $92.8M + $104.8M | $542M + $718M | $2.21B + $3.06B | $372M | Polygon / off-chain |
| **Predict.fun** | $14.8M | $102.2M | $345.8M | $12.4M | BSC (+Blast listed) |
| **Opinion** | $8.4M | $58.5M | $276.0M | $3.06M | BSC |
| MagicMarkets (sports, custodial) | $2.36M | $21.3M | $62.8M | n/a | off-chain |
| XO Market (excluded) | $2.44M | $16.6M | $50.2M | n/a | XO chain |
| PredictStreet (ADI chain) | $4.2K | $50K | $46.3M | $1.34M | ADI (30d figure looks like a one-off spike) |
| **Hyperliquid Outcomes (HIP-4)** | $2.85M | $18.5M | $45.1M | n/a | Hyperliquid L1 |
| TurboFlow Prediction Markets | $2.23M | $10.6M | $44.6M | n/a | BSC (Solana 0) |
| **SX Bet V3** (sports) | $6.91M | $27.7M | $38.9M | n/a | SX Rollup |
| Polymarket Combos (excluded) | $1.18M | $5.77M | $21.2M | | Polygon |
| world (PayBox official, Solana) | $0.49M | $3.18M | $13.1M | $0.21M | Solana |
| PancakeSwap Prediction (up/down) | $0.35M | $2.04M | $8.09M | | BSC |
| Overtime (sports AMM) | $0.37M | $2.14M | $7.81M | $1.36M | Arbitrum/Base/OP/Polygon |
| Sport.fun | $75.5K | $881K | $4.21M | $2.18M | Base |
| **Limitless** | $15.6K | $143.9K | $3.33M | $0.36M | Base |
| Azuro | 0 | 0 | $2.12M | $0.24M | Polygon/Base |
| Alpha Arcade | $96.7K | $568K | $1.91M | $0.21M | Algorand |
| **Myriad** | $203 | $19.2K | $1.89M | $0.23M | Abstract/Linea/BSC (+Celo) |
| PRED | $45.1K | $476K | $0.86M | $0.17M | Base |
| **Probable** | 0 | $73 | $2.2K | $0.20M | BSC |
| **Rain** | 0 | 0 | 0 | $16.4M | Arbitrum |

Reading: only Predict.fun and Opinion are in the same order of magnitude as the leaders' tails; everything else is <= $62.8M/30d. Limitless fell to roughly 1% of Predict.fun. (H for the numbers; M for interpretation.)

---

## 2. Per-venue specs

### 2.1 Predict.fun (BNB Chain)  -  rank 1 for edge tool

- Docs (H): user docs `https://docs.predict.fun` (llms.txt index); **developer docs `https://dev.predict.fun`** (llms.txt, per-endpoint OpenAPI 3.0 `.md` pages; labelled "Predict API (Beta)"); Developer Console `https://developers.predict.fun`; SDKs `@predictdotfun/sdk` (TS, MIT, last push 2026-07-28 per `gh api`), `predict-sdk` (Python); WebSocket `wss://ws.predict.fun/ws` (M, from search; WebSocket pages exist in dev.predict.fun index).
- Base URLs (H, dev FAQ): mainnet `https://api.predict.fun/` ("API key required"); testnet `https://api-testnet.predict.fun/` ("API key not required"). Primary servers ap-northeast-1.
- **Auth (H):** mainnet: header `x-api-key` on every read (verified: `GET /v1/markets` and `/v1/markets/1/orderbook` with no key return HTTP 401 `{"success":false,"code":401,"error":"unauthorized"}`). Personal/order endpoints additionally need `Authorization: Bearer <JWT>`: `GET /v1/auth/message` -> sign message (EOA: `signMessage`; Predict smart account: SDK `signPredictAccountMessage`) -> `POST /v1/auth {signer,message,signature}` -> `data.token`. API keys are **self-service in the Developer Console** (crypto.news, published 2026-09-01: "Developers can create Predict.fun applications and generate API keys without opening a manual support request." - M, secondary).
- **Rate limits (H):** "On Mainnet, the default rate limit for an API key is 240 requests per minute." Testnet 240 rpm without key; live headers confirm `ratelimit-limit: 240`, `ratelimit-policy: "rpm";q=240;w=60`. Higher tiers requestable in console; new apps get order create/cancel burst limits (M).
- **Public(ish) read endpoints (H, dev.predict.fun llms.txt):** `GET /v1/markets` (params `first`, `after` cursor, `status=OPEN|RESOLVED`, `tagIds`, `marketVariant`, `sort` incl. `VOLUME_24H_DESC`, `hasActiveRewards`), `GET /v1/markets/{id}`, `/v1/markets/{id}/stats`, `/v1/markets/{id}/last-sale`, `/v1/markets/{id}/orderbook`, `/v1/markets/{id}/timeseries`, `GET /v1/categories`, `/v1/tags`, `/v1/search`, `GET /v1/orders/matches` (public match events, filter by category/market/min value/signer, newest first), `GET /v1/positions/{address}` (positions by address). Paths confirmed from each endpoint's OpenAPI block in dev.predict.fun. All need `x-api-key` on mainnet.
- **Identity (H):** numeric market `id` (one id per binary question; multi-outcome = "NegRisk" categories where each candidate is its own binary market with `questionIndex`, `categorySlug`, `isNegRisk:true`); `conditionId`, `oracleQuestionId` (bytes32); outcomes carry `onChainId`/`positionId` (ERC-1155 id, decimal string). **Cross-venue fields:** `polymarketConditionIds` (array) and `kalshiMarketTicker` (testnet sample: Polymarket id populated, Kalshi null).
- **Units (H):** orderbook returns Yes-side only: `{"data":{"marketId","updateTimestampMs","lastOrderSettled","asks":[[price,size]],"bids":[[price,size]]}}`; price is a float 0-1 at the market's `decimalPrecision` (2 in sample); size in shares (float). Derive No book by swapping sides and complementing prices at that precision (`getComplement`, doc "Understanding the Orderbook"). Order/amount fields on the signing path are **wei (1e18)** for both USDT and shares. `feeRateBps` (200 in sample) and `feeExponent` (1) are per market and must be signed into the order.
- **Fees (H, docs.predict.fun "Predict Fees and Limits"):** "Makers pay no fee on Predict. Takers pay anywhere from 0.018% to 2%". Raw fee = base fee x min(price, 1-price) x shares; 10% discount programme; minimum order 1 USDT.
- **Collateral / settlement (H):** BNB Smart Chain (56), **USDT (18 decimals on BSC)**; ERC-1155 conditional tokens (Gnosis CTF fork), `CTFExchange`/`NegRiskCtfExchange` with off-chain matching and on-chain `matchOrders`; separate yield-bearing (Venus) and non-yield contract sets (contract list on dev.predict.fun "Deployed Contracts").
- **Resolution (H, conflicting):** KB page says "As of March 2026, all new markets on Predict are served by UMA's Optimistic Oracle" (bond + challenge; ~2 h undisputed, up to ~1 week if escalated). The undated "Technical Overview" still describes a simplified oracle with "No bonding or dispute mechanism" and whitelisted proposers. Treat the Technical Overview as stale; chainlink-data-streams markets exist for up/down price markets.
- **ToS / geo / bots (H, ToS "Last Updated: November 18, 2025" - ~11 months old, possibly stale):** trading "NOT PERMITTED" for residents/entities in **United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan** and sanctioned territories; VPN circumvention prohibited; wallets may be put in close-only mode. Prohibits "data mining tools, robots, crawlers ... to scrape or otherwise remove data from the Site" - the official API/dev console is the sanctioned route, but this clause is a reason to use only the keyed API (never scrape the web app). No explicit ban on trading bots found (grep for bot/automat/API: only "automatically generated" content).
- **Liquidity tier:** top-2 venue by reported volume (24h $14.8M, 30d $345.8M, TVL $12.4M - H, DefiLlama 2026-10-18). Mainnet depth NOT sampled (needs key). Points-farming incentives (PP) mean volume quality is uncertain (M: incrypted/lbank guides; "no direct evidence of wash trading, only inference").
- **PayBox reachability (M, reasoned from docs):** EOA is a supported account type ("traditional EOA or a Smart Wallet"). Flow a PayBox EVM wallet could follow: `request_wallet_sign` op `message` (JWT login) -> BNB `transaction` approvals (USDT -> exchange, ERC-1155 `setApprovalForAll`) -> `typedData` per order -> plugin POSTs to `/v1/orders`. Requirements: BNB for approval gas, human-created API key, JWT held by the plugin (secret handling = gate item 1 analogue). Geo-restricted.
- **Fixtures:** `fixtures/predict-fun/testnet_markets_first2.json` (GET `/v1/markets?first=2`, testnet), `fixtures/predict-fun/testnet_orderbook_market437.json` (GET `/v1/markets/437/orderbook`, testnet; compacted by me: levels capped at 8 and two helper fields `asksLen`/`bidsLen` added that are NOT in the API response). **Mainnet shapes are identical per the OpenAPI but were not fetchable without a key.**
- Gotchas: Yes-side-only book; complement rounding; per-market `feeRateBps` must be signed; `status` field `REGISTERED` plus `tradingStatus` `OPEN` both exist; description text is attacker-controlled.

### 2.2 Opinion (opinion.trade, BNB Chain)  -  rank 2

- Docs (H): `https://docs.opinion.trade` (GitBook, llms.txt); Open API pages under `/developer-guide/opinion-open-api/*` (each page embeds an OpenAPI 3.0.3 JSON); WebSocket and Python/TypeScript "CLOB SDK" docs (Python SDK "Technical Preview", v0.4.1).
- Base URLs (H): reads `https://openapi.opinion.trade/openapi`; SDK/trading host `https://proxy.opinion.trade:8443` (SDK config).
- **Auth (H):** "Public data endpoints do not require an API key." Verified live: `GET /market`, `/token/orderbook`, `/token/latest-price`, `/quoteToken` all 200 with no key. Authenticated endpoints use header `apikey`. **Keys are self-service via an EIP-712 wallet signature** (`POST/GET/DELETE /auth/api-key`, domain `Opinion OpenAPI` v1 chainId 56, message `OpinionApiKeyAuth{walletAddress,action,timestamp}`, 5-minute expiry), but "Your wallet must be a registered Opinion account with a trading wallet enabled", i.e. one web onboarding step first. Builders can also use an application form (Google Form). Not exercised by me.
- **Rate limits:** docs say "15 requests per second" per API key (H, rate-limiting page). **Live unauthenticated responses carry `x-ratelimit-limit-second: 5`** (H, observed) - assume 5 rps without a key.
- **Public read endpoints (H, from embedded specs):** `GET /market` (params `page`, `limit` max 20, `status=activated|resolved`, `marketType` 0 binary/1 categorical/2 all, `sortBy` 1 new/2 ending/3 vol/4 vol asc/5 vol24h/6/7 vol7d/8, `chainId`, `labelId`), `/market/{id}`, `/market/categorical/{id}`, `/market/slug/{slug}`, `/label`, `/token/latest-price?token_id=`, `/token/orderbook?token_id=`, `/token/price-history?token_id=&interval=1m|1h|1d|1w|max&start_at&end_at`, `/quoteToken`, `/positions/user/{wallet}`, `/trade/user/{wallet}`, `/order`, `/order/{id}`, `/resolution/markets`, `/resolution/market/{id}`, `/resolution/disputes`.
- **Identity (H):** integer `marketId`; binary markets and categorical parents with `childMarkets[]` (each child is a binary market); per market `yesTokenId` / `noTokenId` (uint256 decimal string = CTF position id), `questionId`, `conditionId` (empty string in all sampled rows), `quoteToken` address, `chainId` "56". Query by `token_id` for books.
- **Units (H):** orderbook `{"errno":0,"errmsg":"","result":{"market","tokenId","timestamp"(ms),"bids":[{"price":"0.66","size":"154.69..."}],"asks":[...]}}`; price decimal string (3 dp observed), size in shares (string float). **Books for YES and NO tokens are mirrored** (verified on 3 markets: NO bids = 1 - YES asks, same sizes), so fetch either. Two different response envelopes exist: market endpoints `{code,msg,result}`, token/quoteToken/auth endpoints `{errno,errmsg,result}`. Volumes are USD decimal strings.
- **Fees (H, docs "Fees"):** "Fees apply to the taker only; makers are not charged." Taker 0%-1%, highest near 50% probability; **$5 minimum order, $0.25 minimum fee**; Opinion pays match/settle gas.
- **Collateral / settlement (H):** BNB Chain (56), **USDT 18 decimals** (`/quoteToken` returns symbol USDT, decimal 18, a `ctfExchangeAddress`); off-chain matching, on-chain settlement via CTF Exchange + ConditionalTokens; users hold funds in a **Gnosis Safe "trading wallet"** (SDK `multi_sig_addr`); one-time "Enable Trading" approves exchange + CTF (Safe tx, EIP-712 signature relayed by backend in Builder Mode).
- **Resolution (H):** "most markets are resolved through Opinion AI, which serves as the primary oracle mechanism"; dispute/rationale endpoints with $OPN staking. Resolution basis risk vs UMA venues is high.
- **ToS / geo / bots (H, ToS "Last Updated: October 19, 2025" - ~12 months old, possibly stale):** Restricted Jurisdictions include **United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, South Korea, People's Republic of China, Taiwan, Hong Kong** plus sanctioned regions; VPN prohibited. Same "data mining tools, robots, crawlers ... scrape" clause as Predict.fun, but Opinion documents an official self-service API key and bot-oriented SDK, so API use is clearly intended (M reading).
- **Liquidity tier:** 24h $8.4M / 30d $276.0M, TVL $3.06M (H, DefiLlama). **Displayed depth is far below headline volume**: 24 sampled child-market books (LoL Worlds region, "companies acquired", 2028 Dem nominee) had best-bid depth between $0 and $123 and spreads from 5c to >50c; listing shows e.g. "LoL: Worlds 2026 Winning Region" cumulative volume $1.51B (H, my sampling 2026-10-18; interpretation M). DeFi Rate (2026) argues January volume "raises questions" (points-driven). Treat as thin and incentive-distorted.
- **PayBox reachability (M):** EOA + Safe trading wallet; API key via `typedData`; orders EIP-712; BNB gas only for split/merge/redeem and approvals if not relayed. Needs prior web onboarding (human). Geo-restricted.
- **Fixtures:** `fixtures/opinion/market_list_binary_limit3.json` (GET `/market?status=activated&sortBy=5&limit=3`), `fixtures/opinion/market_list_categorical_trimmed.json` (`marketType=2`, 1 parent + 2 children), `fixtures/opinion/token_orderbook.json` (`/token/orderbook`), `fixtures/opinion/token_latest_price.json`.
- Gotchas: default `marketType=0` hides all categorical parents (sample: 178 binary vs 395 incl. categorical); `sortBy=5` on binary-only list is not where the volume is; limit capped at 20; `latest-price.side` is a string like `sell-limit`; `conditionId` empty so cross-venue matching must use titles/rules.

### 2.3 Limitless (Base)  -  best API, dead books

- Docs (H): `https://docs.limitless.exchange` (Mintlify, llms.txt, OpenAPI at `https://api.limitless.exchange/api-json`, docs copy `/openapi.json`); SDKs TS/Python/Go/Rust (all >= 1.2.0 support new venues), MCP server, `agents-starter` repo, WebSocket `wss://ws.limitless.exchange` (namespace `/markets`), changelog current to **2026-10-14**.
- Base URL (H): `https://api.limitless.exchange`, single global endpoint, Base mainnet 8453. "There is no sandbox, testnet, mock mode, or Base Sepolia deployment."
- **Auth (H):** "Public endpoints like market browsing and orderbook data do not require authentication." Verified live (`/markets/active`, `/markets/{slug}`, `/markets/{slug}/orderbook` 200 without key). Trading/portfolio use **scoped HMAC tokens** (`lmts-api-key`, `lmts-timestamp` within 30 s, `lmts-signature` = base64 HMAC-SHA256 of `ts\nMETHOD\npath?query\nbody`); tokens are generated in the web UI (create-api-key "Only available for users authenticated via the UI (Privy)"). Legacy static API keys deprecated.
- **Rate limits:** general API limits exist (`429`, honour `Retry-After`) but **numeric limits for market-data reads are NOT FOUND** (searched: api-reference/introduction, developers/*, changelog; only numbers found are for unrelated X-connection endpoints: 120 public reads/min/IP). Observed: no rate-limit headers on public reads; CDN `cache-control: public, max-age=30`.
- **Public read endpoints (H):** `GET /markets/active` (`limit` <= 25 else 400, `page`, `sortBy` newest/ending_soon/lp_rewards/high_value/trending), `/markets/active/{categoryId}`, `/markets/categories/count`, `/markets/active/slugs`, `/markets/{addressOrSlug}`, `/markets/search`, `/markets/stable/{slug}`, `/markets/{slug}/orderbook` (YES-side only, one market per request), `/markets/{slug}/historical-price`, `/markets/{slug}/events` (finalized trades), `/markets/{slug}/get-feed-events`, market pages/navigation, public portfolio (`/portfolio/{account}/positions`, `traded-volume`, `history`, `realized-pnl`), `GET /maintenance/status`, leaderboards. WebSocket for orderbook/price/lifecycle. Path names verified against `https://api.limitless.exchange/api-json` (H).
- **Identity (H):** string `slug` (unique, includes a ms timestamp suffix) and numeric `id`; `conditionId`; `tokens.yes/no` (uint256 decimal strings); groups (`marketType:"group"`, negRisk) vs `single`; `tradeType` `clob` (497 of 503 active in my pull) or `amm`; recurring markets have `stableSlug`. `venue.exchange` is the EIP-712 `verifyingContract`; **three legacy venue versions plus "new trading venues" since 2026-10-14** (`venue.feeModuleType == "COLLATERAL"`, fee paid in USDC from wallet via `feeModule`, sign `feeRateBps = 0`).
- **Units (H):** USDC on Base **6 decimals**; orderbook size in raw 6-decimal share units (`150000000` = 150 shares), price a plain 0-1 decimal; `minSize`/`maxSpread` strings in REST but may be numbers on WebSocket. Book is YES-side with NO liquidity folded in (derive NO = 1 - p, swap sides).
- **Fees (H):** CLOB buy 0.40%-3.00% paid in outcome tokens, sell 0.42%-1.50% paid in USDC, AMM flat 0.40%; "Fees only apply to takers"; maker rebates programme.
- **Resolution (H):** "Pyth Network now resolves the majority of markets automatically"; Chainlink TWAP for 5/15-minute up/down; sports data providers (API-Sports, PandaScore); **"External venue parity" (markets mirrored from another venue settle within minutes of the source)**; manual team resolution for admin events (24-72 h); creator-reported for user "custom markets". Metadata flag `isPolyArbitrage`.
- **ToS / geo / bots (H, ToS Last Updated 2026-09-15 - fresh):** "not available for trading to users from the following jurisdictions: United States of America, Republic of China, and the Canadian provinces of Ontario (ON) and Alberta (AB)." **Bots explicitly allowed:** the "Building Responsible Trading Agents" page says "Market making is not on this list" (of prohibited conduct); prohibits wash trading, spoofing/layering, coordinated trading, multi-account evasion; exchange enforces self-trade prevention per profile, address blocklist, no per-account exposure caps; an on-chain `OrderCancelled` can get the maker address blocked ("Cancel through the API, never on-chain"). Limitless even ships a "cross-market-mm" strategy hedging on Polymarket.
- **Liquidity tier:** very low. DefiLlama 24h $15.6K / 30d $3.33M / TVL $0.36M (H). My full pull of 503 active markets (2026-10-18): cumulative `volumeFormatted` summed to only ~$562K, largest single market ~$64.7K (a "Stripe next round valuation" group); 10 top-volume CLOB books sampled all had best-bid depth <= $90 and wide/absent quotes (M, own aggregation).
- **PayBox reachability (M):** Base EOA in **EOA trading mode** (smart-wallet 1-click mode makes the API reject EOA-signed orders; switchable via an authenticated call); USDC approvals to `venue.exchange` (+ `feeModule` on new venues) as ordinary `transaction`s; orders as `typedData`; HMAC token must be created by a human in the UI. Docs also offer an MCP server where "every new order is a proposal that the account owner approves in the browser" (H, responsible-agents page).
- **Fixtures:** `fixtures/limitless/market_detail_greenland.json` (GET `/markets/{slug}`, trimmed, creator address removed), `fixtures/limitless/orderbook_greenland.json` (GET `/markets/{slug}/orderbook`).
- Gotchas: `limit` > 25 returns 400; first page of `/markets/active` is by priority (5-min crypto markets with ~0 volume), not volume; books can be one-sided (best bid 0.003 / ask 0.899); `description` is HTML.

### 2.4 Myriad Markets (BNB / Abstract / Linea / Celo)  -  open API, near-zero real volume

- Docs (H): `https://docs.myriad.markets` (Next.js SPA; **no `.md`/llms.txt**; API reference at `/builders/myriad-api-reference`, order book at `/builders/myriad-order-book/order-book-api`, contracts at `/builders/contract-addresses`; I read the server-rendered HTML text). Also CLI, MCP server and JS SDK per the builders page (M).
- Base URLs (H): prod `https://api-v2.myriadprotocol.com/`, staging `https://api-v2.staging.myriadprotocol.com/`, WebSocket (Centrifugo) `wss://ws.myriadprotocol.com/ws`.
- **Auth (H):** "Most read endpoints remain public, with higher rate limits if an API key is provided." Verified `GET /markets`, `/markets/{id}`, `/markets/{id}/orderbook` with no key. Orders use API key + HMAC (`x-api-key`, `x-api-timestamp` +-30 s, `x-api-signature` over `<ts>.<METHOD>.<path+query>.<body>`) or SIWE session JWT. **Legacy bare-API-key auth sunset 2026-08-15 (already past):** bare `x-api-key` on authenticated endpoints now returns `401 SIGNATURE_REQUIRED`.
- **Rate limits (H):** "Requests with API key - 200 requests/second per IP and/or API key. Requests w/o API key - 30 requests/10 seconds per IP"; orders 200 per 10 s per trader. (No `X-RateLimit-*` headers seen on my unauthenticated reads.)
- **Public reads (H):** `GET /markets` (`trading_model=amm|ob|all` default **amm**, `state`, `network_id`, `sort`, `keyword`, `page`, `limit` <= 100), `/markets/{id|slug}` (needs `network_id`, and `trading_model=ob|all` for order-book markets), `/markets/{id}/orderbook?network_id=&outcome=0|1`, `/markets/{id}/trades`, `/markets/{id}/events`, `/markets/{id}/holders`, `/events`, `/events/{id}/orderbook` (NegRisk), `/users/{address}/portfolio|events|markets` (open to anyone), `/tags`, `/topics`. No standalone resolution or price endpoint (state fields + WebSocket).
- **Identity (H):** numeric `id` + `networkId` (56 BNB, 2741 Abstract, 59144 Linea, 42220 Celo) or `slug`; outcomes 0 = Yes, 1 = No; ERC-1155 `tokenId = (marketId << 1) | outcomeId`; events group markets (`eventId`, `negRisk`).
- **Units (H):** order-book prices are integers in [1, 1e18] (0.50 = `500000000000000000`), tick 0.01; amounts in token base units (18 decimals => 1e18 = 1 share); REST orderbook returns `[price,amount]` string pairs; market `bestBid/bestAsk` are 0-1 decimals. EIP-712 domain `MyriadCTFExchange` v1; `Order(trader,marketId,outcomeId,side,amount,price,minFillAmount,nonce,expiration)`.
- **Fees (H, market rows):** order-book market sample `taker_fee_bps: 176` with a 100-entry curve peaking ~180 bps near 50% and `maker_fee_bps: 0`; AMM rows show 0 fee.
- **Collateral (H, own aggregation of 351 open markets, 2026-10-18):** order-book markets (275) on BNB use **USD1 (World Liberty Financial USD, 18 dec)**; 10 AMM markets use USDT; Abstract uses USDC.e; **all high-volume Celo (42220) and two Abstract markets are denominated in "Myriad PTS" (a points token), i.e. NOT real money**. Summed real-money 24h `volume24h`: BNB order-book ~$80, BNB AMM ~$500 (USD1 ~$140 + USDT ~$362), Abstract USDC.e ~$40; order-book `liquidity` ~$107K in total; largest order-book market cumulative volume ~$36K. Celo PTS markets show ~5.6M PTS/24h (points).
- **Resolution (H, sample):** `oracle.name` "Myriad" (team) with a `resolutionSource` URL (e.g. sec.gov); `voided` flag; `resolvesAt`.
- **ToS / geo / bots:** NOT FOUND (searched: myriad.markets/terms and /tos (SPA shell), community-guidelines page, web search). Treat as unknown; assume US excluded.
- **PayBox reachability (M):** BNB EOA, USD1 collateral (a token PayBox may not list; unverified), HMAC key needs a SIWE wallet login first. Low priority given volume.
- **Fixtures:** `fixtures/myriad/markets_list_ob_limit2_trimmed.json`, `fixtures/myriad/market_ob_1237.json` (trimmed), `fixtures/myriad/orderbook_1237_outcome0.json`.
- Gotchas: default `trading_model=amm` hides the order-book markets; PTS vs real-token markets are intermixed in the same list; `description` is long markdown (the raw `/markets` list is ~450 KB/100 rows).

### 2.5 Probable (BNB Chain; PancakeSwap/YZi Labs-backed)  -  Polymarket-style clone, dead volume

- Docs (H): `https://docs.probable.markets` (GitBook, llms.txt: how it works, fees, restricted jurisdictions, resolution; **no API reference page**). The API surface comes from an OpenAPI spec in the third-party `pmxt-dev/pmxt` repo (`core/specs/probable/probable.yaml`, MIT, read via `gh api`) - treat as M, then confirmed live.
- Base URLs (H, spec + live): market data `https://market-api.probable.markets` (no auth); orderbook/trading `https://api.probable.markets` (L1/L2 auth, headers `prob_address`, `prob_signature`, `prob_api_key`, `prob_passphrase`, `prob_timestamp`, `prob_nonce`).
- **Public reads (H, live):** `GET /public/api/v1/markets/?active=true&page=N` (20/page; `pagination.totalResults` 109 active on 2026-10-18), `/events/`, `/markets/{id}`, `/markets/polymarket/{polymarketId}` and `/markets/bsc/{bscQuestionId}` (**cross-reference lookups**), `/public-search/`, `GET api.probable.markets/public/api/v1/book?token_id=`, `/price?token_id=&side=BUY|SELL`, `/prices`, `/midpoint`, `/prices-history?market=&interval=`, `/trades`. Rate limits: NOT FOUND (no headers observed; pmxt sets 500 ms spacing - L).
- **Identity (H):** string market `id`, `event_id`, `condition_id`, `question_id`, `market_slug`, `clobTokenIds` (JSON-encoded string array), `tokens[{token_id,outcome}]`, `neg_risk`.
- **Units (H):** book `{asks,bids,asset_id,market,hash,min_order_size,neg_risk,tick_size,timestamp}`, prices/sizes decimal strings at 6 dp; **`asks` arrive unsorted** (sample returned 0.873 before 0.35) - sort client-side. `volume24hr` on market rows is unreliable (e.g. 166,932,833 on a market with $2.4K liquidity vs DefiLlama 30d total $2.2K).
- **Fees (H):** "Only takers pay fees. Makers trade free."; taker 0.01%-1.75%, highest at 50%; Probable pays gas.
- **Collateral / resolution (H):** BSC USDT; **UMA optimistic oracle** per market (`liveness` 7200 s, proposed_price, price_expiration_ts fields in rows); disputes go to UMA vote (24-48 h); unresolved => 50/50. Users get a **proxy wallet** (gas-sponsored creation).
- **ToS / geo (H, docs page undated):** Restricted Jurisdictions "include ... the United States, United Kingdom, China, France, Canada, Singapore, Poland, Thailand, and Taiwan". Bot policy NOT FOUND (no ToS reachable: probable.markets/terms 404).
- **Liquidity tier:** effectively zero (DefiLlama 30d $2.2K, TVL $0.20M, H). Sampled market 698 (OpenSea FDV > $5B): bids <= 0.042, one ask 0.35 for ~152K shares.
- **PayBox reachability (M):** BSC EOA login (L1 signature) -> API key creation via `/auth/api-key/{chainId}` -> proxy wallet deposit; orders EIP-712 (Polymarket-style `@prob/clob`). Feasible but not worth building trading first.
- **Fixtures:** `fixtures/probable/market_698_trimmed.json`, `fixtures/probable/book_market698_yes.json`.

### 2.6 Hyperliquid Outcomes / HIP-4 (HyperCore)  -  best new venue for crypto-price binaries (NOT verified live)

- Docs (H): official `https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md`, `.../for-developers/api/asset-ids.md`, `.../api/exchange-endpoint.md` (split/merge/negate outcome actions), `.../api/rate-limits-and-user-limits.md`, `.../trading/contract-specifications.md#recurring-outcomes`; third-party Chainstack HIP-4 docs (M).
- Base URL: `https://api.hyperliquid.xyz` (testnet `api.hyperliquid-testnet.xyz`). **Reads are `POST /info`** - which my ground rules forbid - so **no live response shape was captured**; shapes below come from official docs + the pmxt type definitions (M).
- Read endpoints (M): `{"type":"outcomeMeta"}` -> `{outcomes:[{outcome,name,description,sideSpecs:[{name}]}],questions:[{question,name,namedOutcomes,...}]}`; `{"type":"l2Book","coin":"#10"}` -> `levels[0]` bids, `levels[1]` asks, each `{px,sz,n}`; balances via `spotClearinghouseState` (`+<enc>` tokens). `outcomeMeta`/`l2Book` for outcomes are only served by the official API, not by hosted RPC providers (Chainstack says so).
- **Identity (H, asset-ids page):** `encoding = 10 * outcome + side` (side 0 = Yes, 1 = No); coin `#<enc>`, token `+<enc>`, asset id `100_000_000 + enc`. The contract spec lives in the `description` string, e.g. `class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d` and 15-minute `priceBucket` outcomes (H, contract-specifications).
- **Units (M, Chainstack):** prices are probabilities in [0.001, 0.999], tick 0.0001 on the BTC binary (varies), integer sizes, **minimum notional $10 USDH**, no leverage; collateral **USDH** (official HIP-4 page only says "quote token").
- **Fees (conflict):** official HIP-4 page: "Fees are currently zero for outcome markets for initial testing" (page undated, may be stale); Chainstack: minting free, closing/settlement fees at `userFees` rate, no maker rebates.
- **Rate limits (H):** per IP, aggregated REST weight 1200/min; `l2Book` and `allMids` weight 2, other info requests weight 20; address-based limit of 1 request per 1 USDC traded after a 10,000-request buffer.
- **Resolution (H):** protocol-native; recurring BTC markets settle at 06:00 UTC (daily) or every 15 minutes to the HyperCore mark price using linear interpolation between mark-price updates (no third-party oracle); Yes pays `settleFraction`. Multi-outcome "questions" have `negate`/`merge` operations. Mainnet activation reported 2026-05-02 (L, single third-party mention).
- **Liquidity tier:** 24h $2.85M / 7d $18.5M / 30d $45.1M (H, DefiLlama; methodology: buy+sell fills halved). Depth not sampled.
- **ToS / geo:** NOT FOUND (app.hyperliquid.xyz/terms is an SPA shell; WebFetch returned only the title). Known-unknown, assume US excluded.
- **PayBox reachability (M):** funding is USDC into HyperCore via the Arbitrum bridge (PayBox supports Arbitrum per the task statement); every order is an L1-action signature (msgpack "phantom agent" hash signed as EIP-712 - the docs warn "there are two signing schemes"), which PayBox could sign with `typedData` or `raw`, but each action would require a PayBox signing request unless an API/agent wallet is approved (which puts a key outside PayBox). PayBox's own `discover_tokens` labels Hyperliquid as `eip155:999` (HyperEVM, native HYPE) - that is a different layer from HyperCore where outcomes live.
- **Fixtures:** none (POST-only; see above).
- Why it matters for edge: it is the only venue here with deep, recurring crypto-price binaries that map onto Limitless/Predict.fun/Polymarket "BTC up/down at time T" markets.

### 2.7 SX Bet (SX Network, sports only)

- Docs (H): `https://docs.sx.bet` (Mintlify, llms.txt, API reference); V3 exchange ("OBv3"); `GET /metadata/obv3` returns EIP-712 domain, asset and limits.
- Base URLs (H): mainnet `https://api.sx.bet`, testnet "Toronto" `https://api.toronto.sx.bet`, WebSocket `wss://realtime.sx.bet/connection/websocket` (Centrifuge). Chain id **4162**, USDC 6 decimals, escrow contract in `metadata` (H, live). V2 endpoints are gone: `GET /metadata` => 400 "OrderBook V2 is no longer supported".
- **Auth (H):** public: `/metadata/obv3`, `/markets/*`, `/fixture/*`, `/leagues`, `/sports`, `/teams`, `/live-scores`, `/search`, `/trades-v3/public`. Everything else, **including `GET /orders-v3/odds/best` and `/orderbook-v3/snapshot/market`, needs header `x-sx-api-key`** (live: 401 `BAD_AUTH`). Key generated in the web app after wallet login (one active key; shown once). Docs contradict themselves on `odds/best` (rate-limit page lists it as "public"; auth matrix and live behaviour say key required) - trust live behaviour.
- **Rate limits (H):** public market/fixture/league/sports/teams/live-scores/search share **500 req/60 s per IP**; `/trades-v3/public` 200/60 s; `/metadata/obv3` 500/60 s; authenticated budgets per key (e.g. orders GET 1,200/60 s, book snapshot 27,500/300 s).
- **Identity / units (H):** `marketHash` (bytes32), `sportXeventId`, `outcomeOneName/TwoName`, `line`, `type` (market type code); **odds are implied probabilities scaled 1e20 (string)** in the maker frame, taker = 1e20 - maker; amounts USDC 6 dp strings; min order 1 USDC; `oddsLadderStepSize` 125 = 0.125% step (units of 1e15 on the 1e20 scale, docs "Odds rounding"; exceptions 0.1% and 99.9%).
- **Fees (H):** taker 1% on net profit of winning bets, maker 0%, parlays 5%; per-account fee rates via `/user/fees-v3`; SX covers betting gas.
- **Resolution:** sports data feeds per sport ("Betting Rules"); no external oracle. Betting delays (live 8 s default, per-sport/league overrides) are exposed in metadata.
- **ToS / geo (M):** WebFetch of `https://sx.bet/terms` (an SPA) returned only: "SX Bet is not available in the United States or other prohibited jurisdictions." No bot clause found; docs state "There are no account limits".
- **Liquidity tier:** 24h $6.9M / 30d $38.9M (H, DefiLlama, both stakes counted). Book depth NOT sampled (key needed).
- **PayBox reachability (M):** own chain; funding path is "USDC you already hold in your EOA" on SX Network via EIP-2612 permit (`/user/transfer-to-proxy`) or bridges (Arbitrum native bridge, Glide, MoonPay). SX Network (4162) support in PayBox is unverified, so practically the weakest EVM fit.
- **Fixtures:** `fixtures/sx-bet/markets_active_pageSize2.json` (GET `/markets/active?pageSize=2`), `fixtures/sx-bet/trades_public_pageSize3.json` (GET `/trades-v3/public?pageSize=3`; user addresses/usernames removed).
- Use for edge tool: sports lines cross-check vs Polymarket sports / Predict.fun sports / MagicMarkets; sports only.

### 2.8 MagicMarkets (custodial sports exchange)  -  not on-chain, key + deposit required

- Docs (H): `https://docs.magicmarkets.com` (Mintlify, llms.txt, OpenAPI 3.1 at `https://magicmarkets.com/v2/openapi.json`), CLI (MIT), hosted MCP `https://magicmarkets.com/mcp`.
- Auth (H): docs: "Every request is authenticated with an API key" (`X-Api-Key`) and "API access needs a minimum deposit of 10 USDT." **Live behaviour:** `GET /v2/events/?sport=fb` works with no key (but returned stale events from 2025-11-01 plus current ones); `GET /v2/offers/` (prices) returns 401 `auth_error`.
- Model: custodial peer-to-peer sports exchange that "puts orders from other traders and liquidity aggregated from more than 25 sportsbooks, sports exchanges and prediction markets" into one book (H); stakes in USDT; decimal odds on a tick schedule; zero commission; operator 3-102-947650 SRL (Costa Rica), Anjouan Gaming licence.
- Geo (H): not available in US, UK, France, Germany, Netherlands, Spain, Australia, Austria, China, Singapore, Hong Kong, Macau, etc. (docs "Company and licence").
- Liquidity: 24h $2.36M / 30d $62.8M (H, DefiLlama via a team-maintained Dune dataset).
- PayBox reachability: deposits are plain USDT transfers to a per-account address (a PayBox `request_transfer` could do it) but there is no wallet-signed trading; key must be created in the web UI. **Not worth integrating for on-chain arbitrage; at most a sports-odds read source after a $10 deposit.**
- Fixture: `fixtures/magicmarkets/events_fb_limit2_trimmed.json` (partial; offers need a key).

### 2.9 Rain (Arbitrum One)  -  PayBox-friendly shape, no volume

- Source (M): third-party npm package `@buidlrrr/rain-sdk@2.0.0` README/AGENTS.md read from jsDelivr (not executed); not an official Rain docs site. Environments: dev/stage/prod APIs (`prod-api.rain.one`), Arbitrum One 42161, **USDT 6 decimals**, pools/markets with per-option prices in 1e18, permissionless creation (`buildCreateMarketTx`), AI oracle with dispute window (2 h on prod) and RAIN-holder vote (search result, M).
- **Key design fact (H, README):** "Core transaction type - returned by all builders": every action returns an unsigned `{to,data,value}` transaction, which matches the PayBox `io.paybox/transactionProposal` model and is also a precedent for a **programmatic market-creation path** (relevant to gate item 5 for XO).
- REST paths for market listing are not documented outside the SDK (NOT FOUND); no fixtures captured; DefiLlama shows TVL $16.4M but zero volume (H). Pool/AMM style, not an order book. Low priority.

### 2.10 Manifold (play money: signal only)

- Docs (H): `https://docs.manifold.markets/api`. Base `https://api.manifold.markets/v0/` (old `manifold.markets/api` slated to disappear).
- Auth/limits (H): reads need no key; writes use `Authorization: Key {key}`. "There is a rate limit of 500 requests per minute per IP." Licensing text: permitted uses include "Building bots, automated trading systems, algorithmic tools"; prohibited: scraping other than via API, circumventing limits, and using API data to train AI/ML models for commercial purposes without a licence (contact data@manifold.markets). Comments cost M$1 via API.
- Reads (H, live): `GET /v0/search-markets?term=&sort=liquidity&filter=open&contractType=BINARY&limit=`, `/v0/markets`, `/v0/market/{id}`, `/v0/slug/{slug}`, `/v0/market-probs?ids=...`, `/v0/bets?contractId=`, `/v0/users`, positions/portfolio endpoints; perp-market endpoints now exist (`create-perp`, `get-perp-events`).
- Units (H): `probability` float 0-1, `pool {YES,NO}` in mana, `token: "MANA"`, `mechanism: "cpmm-1"`, `totalLiquidity` 10,000 typical, times in ms. Market ids are alphanumeric strings.
- Signal value: free, keyless, liquid-ish on long-dated politics (e.g. JD Vance 2028 nomination cpmm pool ~$10K mana each side, cumulative volume ~93K mana), but `volume24Hours` tiny; mana is not money, so the probability is a crowd forecast, not a tradable price. Useful as a slow prior and for market-creation lint (duplicate question detection), not for arbitrage.
- **PayBox reachability:** none (no chain). No geo/ToS issue for reading.
- Fixtures: `fixtures/manifold/search_markets_president_trimmed.json`, `fixtures/manifold/market_detail_ulm6rrplx5_trimmed.json`, `fixtures/manifold/bets_ulm6rrplx5_trimmed.json` (user ids stripped).

### 2.11 PredictIt  -  not integrable

- Verified (H): `GET https://www.predictit.org/api/marketdata/all/` and `/api/marketdata/markets/{id}` return **HTTP 403 "Attention Required! | Cloudflare"** to a programmatic client. I did not attempt to bypass it. The `https://www.predictit.org/` home page also 403s for WebFetch.
- Secondary (M/L, conflicting): US-citizen-only USD fiat; per-contract cap $850 -> $3,500 (July 2025); 10% fee on profits + 5% withdrawal fee; CFTC no-action framework with Aristotle/Underdog entity confusion in 2026 (DeFi Rate, March 2026: Aristotle Exchange acquired by Underdog; PredictIt "will keep operating under the no-action letter"). No evidence of a public developer programme.
- PayBox reachability: none (fiat, US-only, no wallet).

### 2.12 Other venues considered and set aside

| Venue | Why set aside (confidence) |
|---|---|
| TurboFlow prediction markets (BSC, $44.6M/30d) | Perps DEX with event contracts and football; no public API docs found (searched: DefiLlama page, press, search). Chains conflict BSC vs "BSC + Solana". (M) |
| PredictStreet (ADI Chain, USDC.e) | 30d figure is a spike (7d $50K); no API docs found; launched in Gibraltar / Fanatics US states (M). |
| Overtime, Azuro, PancakeSwap Prediction | Sports AMMs / parimutuel up-down rounds (Chainlink), not order books; PancakeSwap exposes subgraphs not REST (M). Could provide odds reads later. |
| Sport.fun, PRED, Alpha Arcade, Seer, Augur, Meridian, Levr Bet | < $5M/30d, mostly AMM / niche (H on volume, no API review). |
| Gemini Predictions, DraftKings DKeX, Crypto.com OG, Smarkets | Regulated/fiat venues; Gemini added a public volume API 2026-07-30 (M, search). Not reachable by a crypto wallet; Smarkets is GBP fiat. |
| Metaculus | Forecasting site (no trading); listed in pmxt; could be a signal source. Not read this session (L). |

---

## 3. Cross-venue modelling notes for an aggregator

### 3.1 Unit and identity normalization

| Venue | Price | Size | Collateral decimals | Market id | Outcome token id | Books |
|---|---|---|---|---|---|---|
| Predict.fun | float 0-1 (2 dp) | shares float (wei on orders) | USDT 18 | int `id` | `outcomes[].onChainId` | Yes-side only |
| Opinion | decimal string (3 dp) | shares string | USDT 18 | int `marketId` / child ids | `yesTokenId`/`noTokenId` | per token, mirrored |
| Limitless | float 0-1 | int, 1e6 = 1 share | USDC 6 | `slug` | `tokens.yes/no` | Yes-side only |
| Myriad | int string, 1e18 = 1.0, tick 0.01 | int string 1e18 = 1 share | varies (USD1 18) | `id` + `networkId` | `(id<<1)|outcome` | per outcome |
| Probable | decimal string (6 dp) | decimal string | USDT 18 | string `id` | `clobTokenIds[]` | per token, unsorted |
| Hyperliquid | float 0.001-0.999 | integer | USDH | outcome int | `#10*outcome+side` | merged Yes/No |
| SX Bet | 1e20-scaled implied prob (maker frame) | USDC 6 | USDC 6 | `marketHash` | n/a (escrow) | key-gated |
| Manifold | prob float | mana | n/a | string id | n/a | AMM (CPMM) |

Rules: always store prices as exact decimals and sizes as integers in base units; convert only at the edge. Always derive the other side from the venue's convention (Predict.fun/Limitless Yes-only books; SX maker/taker frame; Hyperliquid merged books).

### 3.2 Edge and arbitrage reality check

- **Fee hurdles (taker):** Limitless buy 0.40-3.00% (at 3% below 50c), Predict.fun 0.018-2% (fee = base x min(p,1-p)), Opinion 0-1% + $0.25 min, Probable 0.01-1.75%, Myriad up to ~1.8%, SX 1% of profit; maker orders are free on all of them. A cross-venue arb therefore needs either a spread larger than the sum of taker fees or resting maker orders on one leg (Limitless itself publishes a maker-on-Limitless / FAK-hedge-on-Polymarket pattern).
- **Resolution basis risk:** UMA OO (Predict.fun since 2026-03, Probable, Polymarket), Pyth/Chainlink/sports feeds (Limitless), "Opinion AI" (Opinion), venue team (Myriad, Limitless manual), protocol mark price (Hyperliquid), Chainlink Data Streams (Predict.fun up/down). Same title does not mean same payoff: compare rules text, edge cases (50/50, void), cut-off time zones.
- **Depth is the binding constraint:** sampled books on Limitless, Opinion (long tail), Probable and Myriad are tens to low hundreds of dollars. Use displayed depth within N cents of mid, not volume.
- **Native mapping hooks:** Predict.fun `polymarketConditionIds`/`kalshiMarketTicker`; Probable `/markets/polymarket/{id}`; Limitless `metadata.isPolyArbitrage`, `externalSlug`, "external venue parity" resolution. Opinion and Myriad give no cross-venue ids (match by normalized title + end date + manual review).
- **Staleness:** treat prices older than a few seconds as stale: Predict.fun `updateTimestampMs`, Opinion `timestamp` (ms), Limitless snapshot freshness is "not guaranteed" (doc quote: "No bound on response freshness is guaranteed").
- **Reference implementation (read, not installed):** `pmxt-dev/pmxt` (MIT, 2,170 stars, last push 2026-09-30) is a CCXT-style unified API with adapters for Hyperliquid, Limitless, Myriad, Opinion, Probable, Rain, Smarkets, Gemini, Metaculus, Polymarket, Kalshi (no Predict.fun, SX Bet or Manifold). Its `core/specs/*.yaml` OpenAPI files, `fetcher.ts`/`normalizer.ts` split and "implicit API" pattern are useful design references. Third-party code - read only.

### 3.3 Aggregation hygiene

- Market titles/descriptions/rules are attacker-controlled on every venue (user-created or semi-curated); return them in labelled fields as data.
- Per-venue circuit breakers: Limitless has maintenance mode (`425`, `GET /maintenance/status`); Opinion/Predict.fun may rotate API keys; Myriad auth changed on 2026-08-15; Limitless venue contracts changed 2026-10-14. Pin API versions and monitor the venue changelogs.
- DefiLlama (`api.llama.fi/overview/dexs`, keyless) is a cheap liveness/volume monitor to auto-deprioritize dead venues.

---

## 4. ToS / geo / automation matrix

| Venue | Restricted (trading) | Bots/API | Doc date | Confidence |
|---|---|---|---|---|
| Predict.fun | US, UK, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan + sanctioned; VPN banned | API key programme exists; scraping clause; no bot ban found | ToS 2025-11-18 (stale?) | H |
| Opinion | US, UK, France, Ontario, Singapore, Poland, Thailand, S. Korea, PRC, Taiwan, HK + sanctioned; VPN banned | Self-service API key; scraping clause | ToS 2025-10-19 (stale?) | H |
| Limitless | US, "Republic of China", Ontario, Alberta | Bots/agents explicitly allowed with rules (no wash/spoof/multi-account) | ToS 2026-09-15 | H |
| Probable | US, UK, China, France, Canada, Singapore, Poland, Thailand, Taiwan + sanctioned | not found | undated | H (geo) / NOT FOUND (bots) |
| Myriad | NOT FOUND | API for builders; no ToS reachable | n/a | NOT FOUND |
| Hyperliquid | NOT FOUND (SPA) | API/SDKs official | n/a | NOT FOUND |
| SX Bet | "United States or other prohibited jurisdictions" | API official, "no account limits" | undated | M |
| MagicMarkets | US, UK, France, Germany, NL, Spain, Australia, Austria, China, Singapore, HK, Macau, Costa Rica, Curacao, Comoros + sanctioned | API/CLI/MCP official | licence 2026-07 | H |
| Manifold | none relevant (play money) | Bots/automation explicitly permitted; no commercial AI-training use | n/a | H |

Implication: a tool built for a PayBox user must refuse (or at least warn on) trading calls for users in these jurisdictions; geo is enforced by the venues at signing/order time, not by us (consistent with the plan's "defer geo to the live check").

---

## 5. Ranking: liquidity x API quality x PayBox reachability

Scores 1-5 (5 best). L = liquidity (DefiLlama 30d, displayed depth sampled, volume-integrity discount); A = read-API quality/openness (docs, keyless reads, SDK, stability); R = reachability from a PayBox EVM wallet (chain, signing primitives, human-only onboarding steps). Product in last column. Judgement calls (M).

| Rank | Venue | L | A | R | L x A x R | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Predict.fun** | 4 | 4 | 4 | 64 | Ingest first; needs a self-service API key; BNB EOA; geo-restricted |
| 2 | **Opinion** | 3 | 4 | 3 | 36 | Keyless reads; thin real depth; Safe wallet + web onboarding |
| 2 | **Hyperliquid Outcomes** | 3 | 4 | 3 | 36 | Crypto-price binaries only; POST-only reads unverified by me; Arbitrum funding |
| 4 | SX Bet | 3 | 4 | 2 | 24 | Sports only; own chain; books need key |
| 5 | MagicMarkets | 3 | 3 | 2 | 18 | Custodial; key + 10 USDT; sports |
| 6 | Limitless | 1 | 5 | 3 | 15 | Best docs, dead books; use for parity/mirror checks and as a design reference |
| 7 | Myriad | 1 | 4 | 3 | 12 | Real-money volume ~hundreds $/day; PTS markets are points |
| 8 | Rain | 1 | 2 | 5 | 10 | PayBox-shaped SDK, no volume |
| 9 | Probable | 1 | 3 | 3 | 9 | Polymarket clone with dead volume; useful cross-ref endpoint |
| - | Manifold | n/a | 5 | 0 | n/a | Signal only (play money) |
| - | PredictIt | n/a | 0 | 0 | 0 | Cloudflare 403, fiat, US-only |

Read-first sequencing by openness rather than product: Limitless, Opinion, Myriad, Probable, Manifold, SX markets are readable without a key today; Predict.fun needs a key; Hyperliquid needs POST; MagicMarkets offers need a funded key.

---

## 6. Analogues for the plan's feasibility gate (not XO answers)

These come from other venues and PayBox docs; none answers the XO-specific gate items.

- **Gate 1 (auth/credentials):** the common pattern is wallet-signed login minting a revocable secret: Predict.fun JWT + API key, Opinion API key via EIP-712, Limitless HMAC token from UI login, Probable L1->L2 keys, Myriad SIWE + HMAC, SX API key. All require a long-lived secret held outside the wallet. A PayBox plugin would need per-user secret storage or an agent-orchestrated login. Status for XO: unanswered.
- **Gate 2/8 (order flow, sign-then-submit):** every venue here is "build EIP-712 order -> sign -> POST". PayBox documents `request_wallet_sign` with `message` (EIP-191), `typedData` (EIP-712), `transaction`, `authorization` (EIP-7702) and `raw`; autonomous grants return `pending_signature`, others `pending_approval` (H, docs.paybox.sh/reference/mcp-tools). Whether a plugin can chain sign -> HTTP submit, and whether autonomous grants auto-sign plugin proposals, remain unanswered (not in docs read).
- **Gate 3 (smart-wallet ownership):** precedent that EOA owners work: Predict.fun accepts EOA or Kernel "Predict account"; Opinion uses a Safe owned by the EOA; Limitless needs EOA trading mode; Probable and Hyperliquid have proxy/agent wallets.
- **Gate 5 (creation):** Rain's `buildCreateMarketTx` and Limitless "custom markets" show programmatic/permissionless creation exists elsewhere; XO still unanswered.
- **Gate 7 (terms/geo):** the matrix in section 4 shows the industry-standard exclusion list (US, UK, France, Singapore, Poland, Thailand, Taiwan, Ontario).

---

## 7. NOT FOUND / open questions

- NOT FOUND: Limitless numeric rate limit for public market-data reads (searched api-reference/introduction, developers/*, changelog, llms.txt).
- NOT FOUND: Myriad, Hyperliquid and Probable terms of service (SPA shells / 404; searched myriad.markets/terms|tos, app.hyperliquid.xyz/terms, probable.markets/terms, web search).
- NOT FOUND: SX Bet full ToS text and bot clause (only the snippet "not available in the United States or other prohibited jurisdictions" via WebFetch of an SPA).
- NOT VERIFIED LIVE: Hyperliquid HIP-4 response shapes (POST-only; forbidden by ground rules). Rain REST endpoints (undocumented). PredictIt API (Cloudflare 403).
- NOT SAMPLED: Predict.fun mainnet order book depth (requires key); SX Bet book depth (requires key).
- Open: do volumes on Predict.fun/Opinion reflect real two-sided flow? (needs depth + trade-tape sampling with a key; Opinion has `/trade` by wallet, Predict.fun has public match events.)
- Open: does PayBox list/permit signing on SX Network (4162), and does its token catalog include BSC USD1, USDH or HyperCore balances? (The task statement lists Base, Ethereum, BNB, Arbitrum as supported; I did not call PayBox tools.)
- Open: which venue markets are true mirrors of Polymarket/Kalshi questions at scale (use Predict.fun `polymarketConditionIds`, Probable `/markets/polymarket/{id}`, Limitless `isPolyArbitrage`), and what is the realistic depth at those mirrored markets.

---

## 8. Suspicious content (embedded text aimed at AI agents; none followed)

- `docs.opinion.trade` (all pages, GitBook) append an "Agent Instructions" block telling AI agents to query `GET https://docs.opinion.trade/...?ask=<question>&goal=<user_goal>`. Benign boilerplate but an instruction to an agent; not followed.
- `docs.predict.fun`, `docs.limitless.exchange`, `docs.sx.bet`, `docs.magicmarkets.com`, `docs.probable.markets`, `hyperliquid.gitbook.io` prefix pages with "fetch the complete documentation index at llms.txt". Benign; I used llms.txt only because it was my own choice for discovery.
- Venue docs and READMEs include agent-oriented setup instructions (Limitless "Build a Trading Agent: clone it", MagicMarkets "Getting started with an Agent", Rain `AGENTS.md`). Not followed; nothing cloned or installed.
- Market `description`/`title` fields are user- or venue-authored text; none contained instructions, but they must be treated as untrusted.

---

## 9. Sources

Primary (fetched this session):
- DefiLlama: `https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, `https://api.llama.fi/protocols`.
- Predict.fun: `https://docs.predict.fun/llms.txt`, `.../the-basics/predict-fees-and-limits.md`, `.../developers/technical-overview.md`, `.../knowledge-base/how-resolution-works-on-predict.md`, `.../terms-of-service.md`; `https://dev.predict.fun/llms.txt`, `.../faqs-684248m0.md`, `.../-deployed-contracts-1860295m0.md`, `.../understanding-the-orderbook-685654m0.md`, `.../ts-how-to-authenticate-your-api-requests-663127m0.md`, `.../how-to-create-or-cancel-orders-679306m0.md`, `.../get-markets-25326905e0.md`, `.../get-the-orderbook-for-a-market-25326908e0.md`; live `https://api-testnet.predict.fun/v1/markets`, `/v1/markets/437/orderbook`; `https://api.predict.fun/v1/markets` (401); `gh api repos/PredictDotFun/sdk`.
- Opinion: `https://docs.opinion.trade/llms.txt`, `.../developer-guide/opinion-open-api/{overview,authentication,rate-limiting,market,token,quote-token,position,trade,order,resolution}.md`, `.../opinion-clob-python-sdk/{overview,core-concepts/architecture,core-concepts/gas-operations,getting-started/configuration,builder-mode/enable-trading}.md`, `.../trade-on-opinion.trade/{fees,resolution}.md`, `.../legal/terms-of-use.md`; live `https://openapi.opinion.trade/openapi/{market,token/orderbook,token/latest-price,quoteToken}`.
- Limitless: `https://docs.limitless.exchange/llms.txt`, `.../developers/{introduction,authentication,responsible-agents,venue-system,migrate-to-new-trading-venues,cross-market-market-making,eip712-signing}.md`, `.../api-reference/{introduction,trading/orderbook,markets/browse-active}.md`, `.../user-guide/{fees,market-resolution,smart-contracts,wallet-types,terms-of-service}.md`, `.../changelog.md`; live `https://api.limitless.exchange/markets/active`, `/markets/{slug}`, `/markets/{slug}/orderbook`.
- Myriad: `https://docs.myriad.markets/builders/myriad-api-reference` (server-rendered text), `.../builders/myriad-order-book/order-book-api` (WebFetch summary, M); live `https://api-v2.myriadprotocol.com/markets`, `/markets/{id}`, `/markets/{id}/orderbook`.
- Probable: `https://docs.probable.markets/llms.txt`, `.../legal/restricted-jurisdictions.md`, `.../trade-on-probable/fees.md`, `.../markets/how-are-markets-resolved.md`, `.../overview/how-it-works.md`, `.../get-started/create-an-account.md`; `gh api repos/pmxt-dev/pmxt/contents/core/specs/probable/probable.yaml`; live `https://market-api.probable.markets/public/api/v1/markets/`, `https://api.probable.markets/public/api/v1/{book,price}`.
- Hyperliquid: `https://hyperliquid.gitbook.io/hyperliquid-docs/llms.txt`, `.../hip-4-outcome-markets.md`, `.../for-developers/api/{asset-ids,rate-limits-and-user-limits,exchange-endpoint,signing,info-endpoint}.md`, `.../trading/contract-specifications.md`; `https://docs.chainstack.com/docs/hyperliquid-hip4-outcome-markets-trading` (WebFetch summary, M); `gh api repos/pmxt-dev/pmxt/contents/core/src/exchanges/hyperliquid/fetcher.ts`.
- SX Bet: `https://docs.sx.bet/llms.txt`, `.../developers/{rate-limits,unit-conversions,fees,funding}.md`, `.../api-reference/{auth-matrix,references,api-key}.md`, `.../user-guides/trading/fees.md`; live `https://api.sx.bet/{metadata/obv3,markets/active,trades-v3/public,orders-v3/odds/best}`; `https://sx.bet/terms` (WebFetch, M).
- MagicMarkets: `https://docs.magicmarkets.com/llms.txt`, `.../platform/{company-and-licence,settlement}.md`, `.../developers/{overview,authentication,api-reference/introduction,quickstart}.md`; live `https://magicmarkets.com/v2/events/`, `/v2/offers/`; `https://glama.ai/mcp/connectors/com.magicmarkets/mcp` (WebFetch, M).
- Rain: `https://cdn.jsdelivr.net/npm/@buidlrrr/rain-sdk@2.0.0/README.md` (and AGENTS.md); web search results (M).
- Manifold: `https://docs.manifold.markets/api`; live `https://api.manifold.markets/v0/{search-markets,market/{id},bets,market-probs}`.
- PredictIt: live `https://www.predictit.org/api/marketdata/all/` (403); `https://en.wikipedia.org/wiki/PredictIt` and web search (M/L).
- PayBox: `https://docs.paybox.sh/llms.txt`, `https://docs.paybox.sh/reference/mcp-tools` (markdown), used for signing intents and EVM address model only.
- pmxt: `gh api repos/pmxt-dev/pmxt` (metadata, tree, `ARCHITECTURE.md`).
- Secondary (M): `https://defirate.com/news/opinion-hits-8b-in-monthly-prediction-market-volume-but-the-data-raises-questions/`, `https://crypto.news/predict-fun-rolls-out-self-service-developer-dashboard/` (2026-09-01), `https://defirate.com/?p=7975` (PredictIt/Aristotle), `https://cryptobriefing.com/gemini-predictions-market-volume-api/`.

Short verbatim quotes used for load-bearing facts:
- Opinion: "Public data endpoints do not require an API key." (docs.opinion.trade/developer-guide/opinion-open-api/authentication)
- Predict.fun: "On Mainnet, the default rate limit for an API key is 240 requests per minute." (dev.predict.fun FAQ)
- Predict.fun: "Makers pay no fee on Predict. Takers pay anywhere from 0.018% to 2%" (docs.predict.fun fees)
- Limitless: "There is no sandbox, testnet, mock mode, or Base Sepolia deployment" (docs.limitless.exchange/developers/introduction)
- Limitless: "Market making is not on this list." (developers/responsible-agents)
- Myriad: "Requests w/o API key - 30 requests/10 seconds per IP" (docs.myriad.markets api reference)
- Probable: "Only takers pay fees. Makers trade free." (docs.probable.markets fees)
- Hyperliquid: "REST requests share an aggregated weight limit of 1200 per minute." (rate-limits page); "Fees are currently zero for outcome markets for initial testing." (HIP-4 page)
- SX Bet: "Odds are 1e20-scaled integers and amounts are base unit integers." (developers/unit-conversions); "Public market-data routes work without one." (api-reference/api-key)
- MagicMarkets: "API access needs a minimum deposit of 10 USDT." (developers/authentication)
- Manifold: "There is a rate limit of 500 requests per minute per IP." (docs.manifold.markets/api)
- PayBox: "An EVM MPC wallet shares one address across every `eip155:*` chain." (docs.paybox.sh/reference/mcp-tools)

---

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. All probes were unauthenticated GETs, doc reads, static reads of public JS bundles or `gh api` file reads, run 2026-10-18 ~17:55-18:10 UTC (local 2026-10-19 00:55-01:10 +07). No POST, no keys, no signing, no PayBox tool called, no third-party code run. Scratch outputs are in the session scratchpad, not the repo. The WebSearch budget ran out part-way, so a few searches below could not be repeated (marked).

Overall: the notes are accurate on the high-stakes facts (volumes, base URLs, auth gating, units, fee numbers, geo lists for the top venues). Four items need correction, two "NOT FOUND" items are refuted, and the headline ranking is provisional.

### A. Re-derived from primary sources and CONFIRMED (no change)

| # | Claim | Evidence (verifier, this session) |
|---|---|---|
| 1 | DefiLlama prediction-market volumes (Predict.fun $14.8M 24h / $345.8M 30d; Opinion $8.36M / $276.0M; MagicMarkets, Hyperliquid Outcomes $45.1M, SX Bet V3 $38.9M, Limitless $3.33M, Myriad $1.89M, Probable $2.2K, Rain 0) | Re-fetched `api.llama.fi/overview/dexs`: all figures identical to the notes (e.g. Predict Fun 345840136, OPINION 276004534). TVLs re-checked via `/protocols` (Rain 16.4M, Predict Fun 12.4M, Opinion 3.06M, Limitless 0.36M, Probable 0.20M). H |
| 2 | Predict.fun mainnet needs a key, testnet does not, 240 rpm | `GET api.predict.fun/v1/markets` returned 401 `unauthorized`; testnet returned 200 with `ratelimit-limit: 240`. FAQ: "On Mainnet, the default rate limit for an API key is 240 requests per minute." H |
| 3 | Predict.fun fees, Yes-side book, wei units | Fee page: "Takers pay anywhere from 0.018% to 2%", formula `Base Fee x min(Price, 1 - Price) x Shares`, min order 1 USDT. Orderbook page: "The order book stores prices based on the `Yes` outcome." Order guide uses 18-decimal wei for USDT and shares. H |
| 4 | Predict.fun ToS date and geo list | "Last Updated: November 18, 2025"; list US, UK, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan; scraping clause present. H |
| 5 | Predict.fun cross-venue fields and UMA | Testnet rows carry `polymarketConditionIds` (one id each) and `kalshiMarketTicker: null`; KB: "As of March 2026, all new markets on Predict are served by UMA's Optimistic Oracle". H |
| 6 | Opinion keyless reads, 5 rps live vs 15 rps docs | `/market`, `/quoteToken`, `/token/orderbook`, `/token/latest-price` all 200 with no key; headers `x-ratelimit-limit-second: 5`; docs: "The API imposes a rate limit of 15 requests per second." `/quoteToken` = USDT, decimal 18, chain 56. H |
| 7 | Opinion auth/fees/mirroring/ToS | EIP-712 domain `Opinion OpenAPI` v1 chainId 56, message `OpinionApiKeyAuth{walletAddress,action,timestamp}`; "Fees apply to the taker only", 0-1%, $5 min order, $0.25 min fee; NO book = mirror of YES book (YES ask 0.709 x 341.2 vs NO bid 0.291 x 341.2); `limit>20` silently clamps to 20; ToS "Last Updated: October 19, 2025" with the quoted country list; resolution "most markets are resolved through Opinion AI". H |
| 8 | Opinion thin depth | LCK child: best bid 0.66 x 154.7 (about $102); LCP child (cumulative volume $748.9M): bids 0.002 x 346 and 0.001 x 20,166 (about $21), asks from 0.042; LEC: bid 0.001 x 8.4. Consistent with "$0-$123". H |
| 9 | Limitless public reads, units, caps, fees, ToS, bots | `/markets/active` 200 keyless, `limit=26` returns 400, `totalMarketsCount` 503, USDC decimals 6, orderbook size `30000000` = 30 shares; fees table "Buy 0.40% - 3.00%", "Sell 0.42% - 1.50%", "Fees only apply to takers"; ToS "Last Updated: September 15, 2026" with US / Republic of China / Ontario / Alberta; "Market making is not on this list."; changelog top entry Oct 14, 2026. H |
| 10 | Myriad limits, default model, real-money volume | Docs: "Requests w/o API key - 30 requests/10 seconds per IP", `trading_model` "(default: amm)". Live: BNB order-book 272 markets (top-100 by 24h volume sum to about $59), Celo markets in token symbol PTS with 5.8M PTS 24h, BNB USDT/USD1 24h in the low hundreds of dollars. No `X-RateLimit-*` headers seen on public reads (docs say they are included; behaviour matches the notes). H |
| 11 | Probable | Keyless markets API (109 active, 20/page), book at `api.probable.markets/public/api/v1/book` with asks not sorted, `volume24hr` 171,998 on a market with liquidity 65.99, taker 0.01%-1.75%, restricted list incl. US/UK/China/France/Canada/Singapore/Poland/Thailand/Taiwan, UMA disputes; pmxt spec has `/markets/polymarket/{polymarketId}`. H |
| 12 | SX Bet auth gating, units, fees, limits | Live: `/orders-v3/odds/best` and `/orderbook-v3/snapshot/market` return 401 `BAD_AUTH` even with a valid `marketHash`; `/metadata/obv3` = chainId 4162, USDC 6 decimals, `oddsLadderStepSize` 125; docs "Odds are 1e20-scaled integers"; user guide "1% on profit | 0% | 5%" (taker/maker/parlay); public budgets 500/60s shared, 200/60s trades, and the rate-limit page lists `/orders-v3/odds/best` as public (5,500/60s) while the auth matrix lists it as keyed (the notes' conflict statement is right). H |
| 13 | Hyperliquid HIP-4 doc facts | Asset-ids page: `encoding = 10 * outcome + side`, coin `#<encoding>`, token `+<encoding>`, asset id `100_000_000 + encoding`; rate limits "1200 per minute", `l2Book` weight 2; HIP-4 page "Fees are currently zero for outcome markets for initial testing."; contract-spec examples `priceBinary ... period:1d` and `priceBucket ... period:15m`. Chainstack page (M): USDH collateral, $10 min notional, mainnet launch May 2, 2026. USDH is not on any of the three official pages. H/M |
| 14 | MagicMarkets | `/v2/events/` keyless; `/v2/offers/?sport=..&event_id=..` returns 401 `auth_error` (without params it returns 400 `validation_error` first); docs "API access needs a minimum deposit of 10 USDT."; licence Anjouan, operator 3-102-947650 SRL, restricted list as in the notes. H |
| 15 | Manifold, PredictIt | Manifold docs quote 500 req/min/IP and permit "Building bots, automated trading systems"; PredictIt `/api/marketdata/all/` returns 403 Cloudflare challenge. H |
| 16 | PayBox intents | docs.paybox.sh mcp-tools: op table `message` (EIP-191), `typedData` (EIP-712), `transaction`, `authorization` (EIP-7702), `raw`; "An EVM MPC wallet shares one address across every `eip155:*` chain"; `pending_signature` (autonomous) vs `pending_approval`. H |
| 17 | pmxt-dev/pmxt | `gh api`: MIT, 2170 stars, pushed 2026-09-30. H |
| 18 | NOT FOUND, Limitless numeric public-read rate limit | Re-searched `api-reference/introduction` ("The API enforces rate limits ... HTTP 429"), llms.txt, changelog. Only numbers: 10 req/10 s for the partner AMM trade endpoint and 120 public reads/min/IP for the X-connection endpoint. Absence confirmed. H |
| 19 | Notes contain no secrets or user wallet addresses | grep of the notes file: no 0x strings of 8+ hex chars, no key/JWT/PEM patterns; the only email is the public `data@manifold.markets`. Fixture 0x values are tx/market hashes and public token or exchange contract addresses, no user addresses. H |

### B. CORRECTED

**B1. Opinion response envelope (notes section 2.2 "Units", tagged H).** The notes say market endpoints return `{code,msg,result}` and token/quoteToken/auth endpoints `{errno,errmsg,result}`. Live behaviour: every endpoint tried (`/market`, `/market/{id}`, `/market/categorical/{id}`, `/label`, `/token/latest-price`, `/token/orderbook`, `/quoteToken`) returns `{errmsg, errno, result}`. The `{code,msg}` shape is what the docs' embedded OpenAPI declares, not what the server sends (the researcher's own fixture `fixtures/opinion/market_list_binary_limit3.json` already shows `errno`). Also: list endpoints wrap rows in `result.list` (+ `total`), detail endpoints in `result.data`, latest-price returns the object directly in `result`. A parser written from the notes would mis-handle every market response. Corrected text: "Server envelope is `{errno, errmsg, result}` on all tested endpoints; docs spec says `{code,msg,result}` for market routes (docs/live mismatch). Wrapper key differs: `result.list` (lists) vs `result.data` (details)." H.

**B2. Opinion `conditionId` is not empty everywhere (sections 2.2 and 3.2 say "empty string in all sampled rows ... Opinion gives no cross-venue ids").** True only for the list endpoint. `GET /market/{id}` returns a populated 32-byte `conditionId` (market 8453) and `GET /market/categorical/{id}` returns populated `conditionId` on every child (market 360 children 6143-6148); the parent's is empty. Corrected: "`conditionId` is empty on `/market` list rows but populated on detail endpoints; it is Opinion's own CTF condition, so it still does not map to Polymarket/Kalshi ids, but it is usable as a join key to on-chain events." H. (That it is Opinion-specific rather than a Polymarket id is M inference; I did not compare to a Polymarket id.)

**B3. Limitless credential creation "must be created by a human in the UI" (sections 0.5, 2.3, risks).** Overstated. `developers/authentication` documents a headless path: "Programmatically (headless / CI)": obtain a Privy identity token, then `POST /auth/api-tokens/derive` returns `tokenId` and `secret`; "The `trading` scope is available to all users - no application required." Partner scopes (`account_creation`, `delegated_signing`, server-signed orders via `onBehalfOf`) need an application via the Programmatic API. Still unverified whether a PayBox-controlled EOA can obtain a Privy identity token without a browser. Corrected: "Token derivation is UI-first but has a documented headless Privy-identity-token route; whether an agent-controlled EOA can complete the Privy step is open." H for the docs, unknown for feasibility.

**B4. PayBox reachability is stated more strongly than evidence (summary: "PayBox's ... intents can cover ... on BNB/Base/Arbitrum"; notes 0.5 "technically reachable").** What is H: the intent types exist and one EVM address spans `eip155:*` chains. What is NOT shown: that BNB (56), Base, Arbitrum or SX (4162) are signable in practice. The docs add: "Catalog membership does not guarantee provider coverage or trading support" and "Numeric IDs let newly supported provider networks work without a new chain enum." The notes' own NOT FOUND list says chain support was not confirmed, which contradicts the confident summary line. Corrected: treat per-chain signing coverage as unverified (M at best), per the researcher's own open question. Gate 4 therefore stays "unanswered".

**B5. pmxt adapter list incomplete (section 3.2).** The tree also has `baozi`, `hunch`, `suibets`, `polymarket_us`, `kalshi-demo`, `mock` adapters. "Per-venue OpenAPI specs" exist only for `gemini-titan, kalshi, limitless, metaculus, myriad, opinion, polymarket, probable, smarkets` (none for Hyperliquid or Rain). The "not Predict.fun, SX Bet or Manifold" statement is correct. H.

**B6. Staleness flag missing on the DeFi Rate source (section 2.2, "DeFi Rate (2026)").** The article is dated 2026-02-23 (data through Feb 15), about 8 months old, so over the 6-month staleness bar. It says the points programme rewards trade size and "All signs point to wash volume being a major factor" (inference, not measurement) and that the Jan figure was about $8B/month on Dune, against $276M/30d on DefiLlama now. The methodologies differ so I make no like-for-like claim, but the notes present Opinion as the #2 venue without noting the earlier peak or the age of the source. M.

### C. REFUTED "NOT FOUND" items (terms did exist and were reachable)

**C1. Hyperliquid Terms of Use (notes: "NOT FOUND ... SPA shell").** The terms text is in a static JS chunk of the official app (`app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js`, referenced from the app bundle). Read as text, nothing executed. H.
- Date: "Last updated on June 15, 2026" (fresh).
- Clause 1.6: Interface "not available to 'Restricted Persons'": residents/entities in "the United States of America or Ontario, Canada", sanctioned territories, and citizens of those territories wherever located. VPN/proxy evasion is prohibited.
- Clause 1.7 (outcome markets specifically): outcome markets "are not available to 'Excluded Persons'", defined as persons in "certain jurisdictions that we designate from time to time" or where use "would require us or any third party to obtain any license". Clause 1.8: they may block the "outcome markets tab". So the HIP-4 jurisdiction list is open-ended and not published in the terms: a plugin cannot hard-code it.
- Clause 3.1.8 "Automated or High-Frequency Abuses": prohibits "bots, scripts, or other automated methods to interact with the Interface in ways that exceed reasonable usage". Not a blanket bot ban. The terms govern the web Interface; whether they bind direct API use is a legal question I did not resolve.
- Replace the notes' "Hyperliquid: NOT FOUND" cells (sections 2.6, 4, 7) with the above. Bot policy: conditional, not prohibited.

**C2. SX Bet terms and bot clause (notes: only the snippet "not available in the United States or other prohibited jurisdictions"; "No bot clause found").** `sx.bet/terms` is a catch-all SPA that renders only that snippet, but the footer links to `https://help.sx.bet/en/articles/3613372-terms-and-conditions`. A WebFetch summary of that article (so M, small-model extraction, no calendar date: "Updated over 2 weeks ago") reports: residency bans incl. Ontario, Australia, Austria, Comoros, France, Germany, Netherlands, Spain, UK, USA plus sanctioned countries, and a catch-all for any jurisdiction SX "in our sole discretion" prohibits; and a scraping/bot clause: you may not "use any robot, spider, crawler, scraper, or other automated means" to access the service or extract data unless "provided by us"; separately no "robots and programmed devices to participate in game play" where the aim is to disrupt or defraud; odds scraping is barred. It has no explicit API, algorithmic-trading or market-making clause. So "no bot clause" should read "bot/scraper clause exists; official API use is the sanctioned route; automated trading not addressed". Confirm against the primary page before relying on exact wording.

**C3. Rain REST paths (notes: "undocumented"; "NOT FOUND").** The npm package the researcher read contains the paths in compiled source (static read of `dist/markets/*.js` on jsDelivr, M because third-party): list `GET {apiUrl}/pools/public-pools?limit&offset&sortBy=totalLiquidity|totalVolumn|age&status=New|Live|Waiting_for_Result|Under_Dispute|Under_Appeal|Closed|Closing_Soon|Dispute_Window_Open|Appeal_Window_Open|Pending_Finalization`, detail `GET {apiUrl}/pools/pool/{marketId}`, hosts `dev-api|stg-api|prod-api.rain.one`. Live from this machine: `prod-api.rain.one/` and `www.rain.one/` returned 403 and `/pools/public-pools` timed out at 12-25 s, so response shapes remain unverified. "Dead" is also nuanced: DefiLlama daily volume is non-zero through 2026-09-15 (all-time $40.9M, a $1.38M day on 2026-08-25) and then falls to zero while TVL stays $16.4M, so the collapse is about 5 weeks old, not long-standing.

### D. Still UNVERIFIABLE or not resolved this session

- Myriad ToS / restricted jurisdictions / bot policy: `myriad.markets/*` is an SPA (all routes return the same 782 KB shell), no terms link in `docs.myriad.markets` sitemap, `docs.myriad.markets` legal paths 404, one extra web search returned nothing. NOT FOUND stands (not a refutation).
- Probable ToS, bot policy, numeric rate limit: `probable.markets/terms*` 404, docs index lists only "Restricted Jurisdictions" under legal, no rate-limit headers on `market-api`. NOT FOUND stands. A second web search could not run (budget exhausted).
- Live Hyperliquid HIP-4 response shapes and depth: reads are POST `/info` and POST is forbidden here; no keyless GET alternative found. Unverified. The "R=3, A=4" scores for Hyperliquid in section 5 rest on docs only.
- Predict.fun mainnet depth and any "volume is real" claim: key required, not sampled. Section 5 gives Predict.fun L=4 and rank 1 without any depth sample, while the one comparable venue that was sampled (Opinion) showed depth under $125 per book against $276M/30d. Treat the ranking (64 / 36 / 36 / ...) as provisional, driven by DefiLlama volume and judgement, not measurement.
- SX Bet and MagicMarkets order-book depth (keys; MagicMarkets also a deposit). Unverified.
- TurboFlow, PredictStreet, PredictIt developer programme: no further sources found; not re-searched (budget).
- Limitless `isPolyArbitrage` semantics beyond field presence; "external venue parity" resolution timing ("within minutes") was not re-checked.
- Secondary (M) items not independently confirmed: Chainstack "closing/settlement fees at userFees rate" vs official "currently zero"; DefiLlama methodology "buy+sell fills halved" for Hyperliquid Outcomes (it is consistent with, but not proven by, the Opinion cross-check in E2).

### E. Missed findings worth adding

1. **DefiLlama "Interface" category.** Front-ends over other venues carry large attributed volume and were not mentioned: Outcome.xyz (Hyperliquid HIP-4 front-end) 24h $4.86M / 30d $75.8M, larger than the "Hyperliquid Outcomes" protocol line ($45.1M), so the HIP-4 headline depends on attribution method; Betmoar.fun $80.2M, Traderline $35.9M, Gate Predictions $29.7M (all use DefiLlama's shared `polymarket.ts` adapter, i.e. Polymarket order flow), Jupiter Prediction $6.1M. These are routing layers, not independent liquidity. Also small but listed in the prediction category: PredictEX $0.69M, Closer $0.35M, Meridian Predict, Trueo $17K/30d (Base). No missed venue with real independent volume beyond the notes' list was found in the DefiLlama data (H, `api.llama.fi/overview/dexs` category "Prediction Market" has 51 rows).
2. **Opinion volume is concentrated in two markets.** Parent-level `volume24h`: "LoL: Worlds 2026 Winning Region" $8.56M (cumulative $1.51B) and "Which companies will be acquired before 2027?" $8.04M (cumulative $1.61B). Together $16.6M, about 2x the venue's DefiLlama 24h ($8.36M), consistent with DefiLlama halving buy+sell or counting parent+child once (M inference). Their displayed books are the thin ones in A8. Strong support for the "headline volume is an upper bound" warning; also a data-quality tip: for Opinion, rank by displayed depth, not `volume`.
3. **Opinion fee floor bites.** $0.25 minimum fee on the $5 minimum order is a 5% effective taker fee; market rows also carry a `rebate: {maker: 0.5}` field (a maker-rebate programme the notes do not mention). H (docs + live row).
4. **Limitless cross-venue metadata is richer than listed.** The top-volume active market (a "What price will Ethereum hit" ladder) carries `isPolyArbitrage: true`, `externalProvider: "polymarket"`, `externalSlug`, `polymarketSeriesId`, `polymarketHitSymbol`, `polymarketHitDuration` in `metadata`, and group markets need the child slug for `/orderbook` (the group slug returns "Market not found"). H.
5. **PayBox already ships an official `hyperliquid` plugin (spot only) and a `world` plugin (Solana)** per `06-paybox-platform.md` (lines 177 and 277). HIP-4 outcome tokens are spot-like (`#enc` coins), so whether that plugin can list or trade outcomes is a cheap read-only check for the Hyperliquid reachability question. Not cross-referenced in this file.
6. **Hyperliquid fee statements now have three sources:** official "currently zero" (undated), Chainstack "only charges fees when closing or settling", DefiLlama description "fees charged when positions are closed or settled". Two of three agree against the official page; treat zero fees as unreliable.

### F. Verdict on the structured summary

- Facts: the summary lists 23 facts. 18 confirmed or spot-checked as written (1-9, 11, 13-19, 23); 4 need correction or qualification (fact 10 for B3 Limitless token creation, fact 20 for C3 Rain, fact 21 for B4 PayBox chain reach, fact 22 for B5 pmxt adapters); 1 not re-fetched (fact 12, Limitless oracle list; only the `isPolyArbitrage` field was confirmed). Errors B1 (Opinion envelope) and B2 (conditionId) are in the notes body (section 2.2/3.2), not in the summary facts. The Predict.fun/Opinion/Limitless/Myriad/Probable/SX/Hyperliquid/MagicMarkets numbers, base URLs, units and fee percentages all reproduced.
- NOT FOUND list (12): 2 refuted (Hyperliquid ToS, SX Bet ToS/bot clause), 1 partly refuted (Rain REST paths), 8 stand (Limitless rate limit confirmed absent; Myriad ToS, Probable ToS and rate limit, HIP-4 live shapes, Predict.fun mainnet depth, SX/MagicMarkets depth, TurboFlow/PredictStreet docs, PredictIt programme unresolved), 1 (PayBox chain coverage) stands and contradicts the summary headline (B4).
- Gate verdicts: no status change. Gates 1-7 and 9 remain "unanswered" for XO (these notes are analogues only); gate 8 stays "partial".
