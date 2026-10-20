# Binance Wallet prediction markets (via Predict.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 01:45 UTC). READ-ONLY: page reads (WebFetch), `gh api` file reads of public Binance connector source, DefiLlama / npm / Predict.fun docs GETs, and three unauthenticated GETs to `api.binance.com` (all rejected with -2014). No account, wallet, API key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed. The WebSearch budget ran out after the first query, so press coverage beyond that query was read by direct fetch only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months is flagged).

Fixtures (<= 50 KB each): `docs/research/fixtures/binance-wallet-prediction-markets-via-predict-fun/` (listed at the end of Sources). Direct quotes from Binance FAQ pages come from a page-summarising fetch tool, not a raw HTML read, so treat exact wording as M; the facts were cross-checked against the dev docs and SDK source where possible. Naming quirk: the FAQ calls the feature "Secure Auto-Sign (SAS)" while the connector docs expand SAS as "Self-Authorization Service"; same switch, two labels (H).

---

## 0. Bottom line

1. **Live and actively developed, but it is a front end, not a venue.** Binance routes orders into **Predict.fun's order book on BNB Smart Chain** (vendor id `predict_fun`). Binance does not create markets, hold the book or act as counterparty. (H: Binance FAQ, Binance dev docs, connector source.)
2. **Not an independent arbitrage leg.** Quotes, prices, resolution and outcome tokens all come from Predict.fun. The Binance order-book stream pauses if "the upstream provider (Predict.fun) disconnects" (H). Counting it next to Predict.fun double-counts one pool. The Binance FAQ says Predict.fun is "currently" the only provider (H), but the REST API has a `vendor` parameter, so more vendors could be added later.
3. **It does have a real, official, authenticated API** (new fact versus the discovery hint): "Binance Wallet Prediction Trading" REST + WebSocket, launched 2026-05-25, 28 endpoints, SDKs in JS/Java/PHP and a CLI. **Every endpoint, including market data, needs a Binance API key + signature** (unauthenticated GETs return -2014). Trading additionally needs a KYC'd Binance account, a Prediction Account, Secure Auto-Sign and region eligibility. (H)
4. **Not reachable from a PayBox EVM wallet.** On the Binance path the orders are quoted and signed server-side with the user's Binance Wallet Keyless (MPC) key in a TEE; there is no signed-order or transaction-proposal interface. The same liquidity IS reachable directly through Predict.fun with an EOA (EIP-712 orders, USDT on BSC). That belongs to the Predict.fun spec, not this one. (H for Binance mechanics, M for the "no other path" inference)
5. **Recommendation: adapter_priority = skip** (duplicate liquidity). Keep only a **registry / pool-membership record**: `binance_wallet_prediction -> routes_to: predict_fun`, so the aggregator never lists it as a separate pool, plus its fee stack and geo rules. Join key to Predict.fun if ever needed: `conditionId` and `tokenId` appear in both APIs (H).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Binance Support FAQ "Binance Wallet Prediction Markets" `https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec` | "Published on 2026-03-30 14:22", "Updated on 2026-07-07 10:34". Feature shows as "Prediction" under Markets in the Exchange view of the latest Binance App. | H |
| The Block, 2026-03-31 "Binance tests prediction market feature" | Beta, based on the Binance FAQ page; no launch date or jurisdictions given at that time | H |
| Cryptobriefing / TradingView-Finance Magnates / Dyutam | Binance announcement 2026-04-09 (Dyutam: 10:00 UTC); "Binance Wallet" integration of Predict.fun | M (secondary) |
| Binance FAQ "Prediction Markets API" (`.../faq/detail/5d6f65bc34ff40799b17d84e3630d1f0`) | Published 2026-06-08 08:30 | H |
| Binance dev docs change log `https://developers.binance.com/en/docs/products/w3w-prediction/change-log` | Initial release 2026-05-25; entries 2026-06-16, 08-14, 09-10, **10-08 (11 days ago)** | H |
| npm `@binance/w3w-prediction` | v1.0.0 2026-06-29 ... v2.2.0 **2026-10-15** (registry timestamps); repo `binance/binance-connector-js` `clients/w3w-prediction` | H |
| Predict.fun news: "Predict Launches Its Binance Referral Program" | Undated on the page; image path suggests Sept 2026. Referral FAQ at `docs.predict.fun/binance-wallet-referrals/binance-wallet-referral-faqs` | H (existence) / M (date) |
| DefiLlama `predict-fun` (the underlying venue) | 24h $14.45M, 7d $103.4M, 30d $350.2M, TVL $10.44M on 2026-10-19 | H |

Verdict: **still_live = true.** Launch itself (Mar-Apr 2026) is about 6.5 months old, but all operational evidence is from the last 2 weeks to 4 months.

---

## 2. Kind and market model

- **Kind (H):** consumer front end + official partner API over a third-party protocol. Binance FAQ: "Binance aggregates markets from third-party providers. The main provider is Predict.fun, a decentralized protocol on BNB Smart Chain ... Binance does not create events or act as the counterparty to trades." The page also says the provider chooses which events are listed. (Quotes are from the summary of the FAQ page; the FAQ itself says Predict.fun is the "current primary provider" and names no other.)
- **Two Binance entry points exist (H/M):**
  1. **In-app "Prediction" under Exchange > Markets** with a separate **Prediction Account** (not Spot/Funding/Binance Wallet), built on Binance Wallet Keyless (MPC). Funds default to Spot/Funding balances. This is what the REST API controls. (H)
  2. **"Predict.fun dApp on Binance Wallet"** (Web3 wallet dApp). The Predict.fun referral FAQ distinguishes trades "via the dApp on Binance Wallet" from "the Classic version, the Predict.fun website, or other frontends". Whether (1) and (2) share the same wallet address is NOT FOUND (searched: Binance FAQs, Predict.fun docs).
- **Market model (H):** binary YES/NO shares priced 0.01 to 0.99 USDT, winning share pays $1 (Binance FAQ). Multi-outcome events exist ("outcome names for multi-outcome markets" in Binance WS docs; Predict.fun neg-risk adapter). Order book (CLOB), market orders (Binance: FOK) and limit orders (GTC). No scalar markets documented. Price tick comes from `decimalPrecision` in market detail ("2 means a tick of 0.01").
- **Tokenisation (H, Predict.fun technical overview):** ERC-1155 outcome tokens from a Gnosis Conditional Tokens fork; off-chain matching, on-chain settlement via `CTFExchange` / `NegRiskCtfExchange`; some collateral is deposited in Venus vTokens (yield-bearing markets, `isYieldBearing`).
- **Binance id model (H, SDK types):** event = `marketTopicId`; child market = `marketId` (+ `externalId`, `conditionId`); outcome = `outcomes[].tokenId` with `name`, `index`, `price`, `chance`, `winner` (after resolution). Also `vendor`, `chainId`, `collateral`, `feeRateBps`, `slippageBps`, `isYieldBearing`, `tradeVolume`, `liquidity`, `participantCount`, `variantData` (crypto up/down start/end price, `priceFeedProvider`).

---

## 3. Chains and collateral

- **Chain (H):** BNB Smart Chain. SDK `chainId` defaults to `56` (BSC) in Get Quote; WS docs and press say BNB Chain.
- **Collateral (H):** USDT only ("Only USDT can be used for orders", Binance FAQ). API amounts are USDT in **wei, 18 decimals** (`1000000000000000000 = 1 USDT`), the BSC USDT format. Wallet Events docs: fund transfers currently support only USDT.
- **Funding sources (H, SDK):** `fundingSource` = `MPC` (balance in the prediction wallet, default) or `CEX` (Spot/Funding, auto-transfer), plus `accountType` `SPOT`/`FUNDING` for the settlement reference. Transfers between Spot/Funding and the prediction wallet are an API function (`transfer/inbound`, `transfer/outbound`, `transfer/list`, `transfer/status`).
- **Gas (M):** Binance sponsors BNB Chain gas for trades and settlement (Cryptobriefing, The Defiant, Dyutam, CMC; not stated in the Binance FAQ text I read). Order objects expose `networkFee` and `marketProviderFee` (H, SDK types).

---

## 4. Read API

**Exists: official-authenticated. There is NO public unauthenticated read path on the Binance side.**

- **Docs (H):** `https://developers.binance.com/docs/w3w_prediction` (connector README link); REST catalog `https://developers.binance.com/en/docs/catalog/web3-wallet-prediction-trading/api/rest-api`; WS pages `https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/{integration-guide,orderbook,wallet-events}`; machine-readable `https://developers.binance.com/en/docs/llms.txt` (lists the 28 endpoints). The catalog and docs pages render client-side, so endpoint detail below comes from llms.txt and the official connector source.
- **Base URLs (H):** REST `https://api.binance.com` (connector default `basePath`), path prefix `/sapi/v1/w3w/wallet/prediction/`. WebSocket `wss://api.binance.com/sapi/wss`.
- **Market-data endpoints (H; all `isSigned: true` in the SDK; weight(IP) = 1 each per Binance change log of 2026-09-10):**
  - `GET category/list` (L1/L2 categories)
  - `GET market/list` (`l1Category`, `l2Category`, `sortBy` = RECOMMENDED|VOLUME|PARTICIPANTS|CREATED_TIME|END_DATE, `orderBy`, `offset`, `limit` 1-100)
  - `GET market/search` (`query`, `topK` 1-50, semantic search)
  - `GET market/detail` (`marketTopicId`; markets[], outcomes[], timeline, variantData; `status` REGISTERED|RESOLVED; `markets[].tradingStatus` where only `OPEN` allows new orders)
  - `GET order-book` (`vendor` e.g. `predict_fun`, `marketId`, `tokenId`; returns `outcome`, `tokenId`, `timestamp`, `bids[]`, `asks[]` as `{price,size}` strings)
  - `GET order-book/last-trade-price` (`marketId`)
- **Trades / resolution:** no public trade-tape endpoint on the Binance side (user-scoped `order/history`, `position/settled-history`, `redeem/status` only). Resolution state: `status`, `tradingStatus`, `outcomes[].winner` ("more than one outcome can be true when the payout is split"; no separate cancelled/invalid/refunded status) (H, change log 2026-10-08). Wallet-event topic `pm_market_close` signals resolution.
- **Auth (H):** header `X-MBX-APIKEY`; HMAC-SHA256 over the sorted query string appended as `signature`, with `timestamp` and `recvWindow` (SDK also supports RSA and Ed25519 key pairs). Key created by a human in Binance web "API Management" with **Prediction Trading** permission under API Restrictions; account needs a Prediction Account and Secure Auto-Sign (SAS) enabled (Binance API FAQ). The API is "limited to eligible users, and availability depends on the user's region".
- **Unauthenticated probe (H, 2026-10-19):** `GET https://api.binance.com/sapi/v1/w3w/wallet/prediction/{market/list|category/list|order-book}` -> `HTTP 400 {"code":-2014,"msg":"API-key format invalid."}`. The host is reachable from the research location (no 451 geo-block at the HTTP layer).
- **Rate limits:** prediction pages state weight(IP) = 1 per endpoint. The overall cap for this product is NOT FOUND (searched: change log, llms-full.txt, SDK). Binance's generic SAPI rule says each IP-limited endpoint has an independent 12,000/min cap and over-limit returns 429 (H for the Spot docs, M that it applies here). WS: 5 messages/s per connection, 24 h max lifetime, PING every 30 s (H).
- **WebSocket (H):**
  - `web3_prediction_orderbook_{marketId}`: full `asks` (ascending) and `bids` (descending) arrays on each push, `[price,size]` numbers in (0,1), `updateTimestampMs` for ordering, `msgType: "orderbook"`, typically 50 levels or fewer, about 1-3 msgs/s per market (peaks about 10/s), at-most-once. Broadcast by topic (not routed by userId). Latency under 200 ms after the upstream event.
  - 14 user-event topics prefixed `web3_prediction_pm_*` (buy/sell success/fail, limit submit/filled/partial, claim, transfer, market close) with `pushId` for dedup. Payload `amount` is truncated to 2 decimals, so use REST for exact math.
  - Subscribing still requires a signed connection (API key).
- **Official SDKs (H):** `@binance/w3w-prediction` (npm, MIT, Node >= 22.12), Java `binance-connector-java` (`io.github.binance:binance-w3w-prediction`), PHP `binance-connector-php`, and `binance/binance-cli` (`w3w-prediction` subcommand).
- **Better read path for the aggregator:** Predict.fun's own API (`api.predict.fun`, `x-api-key`, self-service key) returns the same markets and books without a Binance account. See the Predict.fun spec. Predict.fun's `Market` schema has `conditionId`, `oracleQuestionId`, `polymarketConditionIds`, `isNegRisk`, `isYieldBearing`, `feeRateBps` (H, dev.predict.fun Market schema), which Binance's API does not expose beyond `conditionId`.

---

## 5. Trade path

- **Programmatic: yes, but only as a Binance-authenticated, server-signed flow (H).**
  1. `POST trade/get-quote` (`walletAddress`, `tokenId`, `side` BUY|SELL, `amountIn` wei, `orderType` MARKET|LIMIT, `slippageBps` 1-10000, `priceLimit` for LIMIT, `chainId` default 56, `feeRateBps` default 200, `fundingSource`) returns `quoteId`, `amountOut`, `feeAmount`, `averagePrice`, `priceImpact`, `minReceive`, `expireAt`.
  2. `POST trade/place-order-bundle` (`quoteId`, `walletAddress`, `walletId`, `timeInForce` FOK for MARKET / GTC for LIMIT, `accountType`, `orderType`, `slippageBps`) returns `orderId`. **Requires SAS authorization.**
  3. `POST trade/batch-cancel` (indexed bracket params; `vendor` is set server-side to `predict_fun`). `GET order/list`, `GET order/history` (order objects carry `vendorOrderId`, i.e. the Predict.fun order id).
  4. Claim: `POST batch-redeem`, `GET redeem/status`. Positions: `position/list`, `position/filter`, `position/token`, `position/settled-history`, `pnl/query`, `pnl/portfolio`. Wallet: `wallet/list`, `quota/limit/status` (a `dailyLimit` and `remainingDailyLimit` exist), `balance/payment-options`.
  5. Market-maker-only (authorised MMs): OTC block trades (8 endpoints) and `deposit/apply` / `withdraw/apply` (added 2026-08-14).
- **Signing scheme (H):** the caller signs only the Binance REST request (API key + HMAC/RSA/Ed25519). The on-chain order signature is produced by Binance's TEE-held MPC key for the user's prediction wallet ("Your private keys are stored in a Trusted Execution Environment ... Binance cannot access", SAS FAQ, which is written for Binance Wallet generally). Order-level EIP-712 details for this path are not exposed. That the Binance-signed order is a Predict.fun CTFExchange order is M (inferred from `vendor`, `vendorOrderId`, `conditionId`, ERC-1155 `tokenId`).
- **Known gotchas (H, change log):** bracket-encoded `cancelInfoList[i]` params break signatures in Python `requests` / Java `URI` / Go `net/url` / Node `url` (-1022); `walletAddress` not owned by the UID returns generic -3026; `transfer/inbound` without SAS returns -31003; minimum order set by server (-9000 "Your order amount is too small"); a successful quote does not guarantee fill.

### PayBox reachability: **no** (for the Binance path)

- The Binance path needs a Binance UID, a human-created API key with Prediction Trading permission, a Prediction Account and SAS. The signing key lives in Binance's MPC/TEE. A PayBox wallet can neither sign these orders nor propose transactions for them. Whether an external wallet can deposit USDT straight to the prediction wallet's BSC address is NOT FOUND (searched: Binance FAQs, dev docs; only Spot/Funding transfers are documented for non-MM users).
- The underlying liquidity is a different story: a PayBox EVM wallet (one address across `eip155:*` per the project's PayBox notes) can in principle sign Predict.fun EIP-712 orders and approvals on BSC. That is the Predict.fun adapter's job; it needs a Predict.fun API key (self-service) and is geo-restricted (section 8).

---

## 6. Fees

- **Binance (H):** "Vendor fees are shown on the order confirmation screen. Binance says it does not collect these fees. Full details are in the provider's documentation." API access has no additional fee; trading fees "match other access channels" (Binance API FAQ). Quote responses include `feeAmount`, `feeRateBps` (default 200 = 2% cap), `feeDiscountBps`; order objects include `marketProviderFee` and `networkFee`.
- **Predict.fun underlying (H, docs.predict.fun "Predict Fees and Limits"):** makers pay no fee; takers pay `base fee x min(price, 1 - price) x shares`, i.e. up to 2% of notional at 50c falling to 0.018% (with the 10% discount) at 1c / 99c; 10% discount programme; minimum order 1 USDT. Makers can earn rebates (Predict.fun news: "30% In Maker Rebates", Sept 2026, undated; M).
- **Channel differences (H):** Binance-dApp referral: inviter gets 10% of invitee fees, invitee a 5% fee rebate, paid in USDT, only for trades made via the dApp on Binance Wallet (Predict.fun referral FAQ). So the effective taker fee differs slightly by channel. Predict Points (PP) can also be earned via the Binance API (Binance API FAQ; PP are run by Predict.fun, tracked per address, Binance FAQ 2026-06-02).
- **Who pays gas (M):** Binance sponsors BNB Chain gas on this channel.

---

## 7. Resolution mechanism and dispute risk

- **Binance FAQ (H):** phases Open -> Ended/settlement pending (trading stays open) -> Resolved (outcome recorded on-chain, trading closes, winners claim $1/share). "A resolution proposal is submitted with a bond. If no one challenges it, the market resolves automatically. If disputed, it goes to arbitration." Binance reviews content conflicting with its values only after the fact; the provider decides which events list.
- **Predict.fun (H, docs.predict.fun "How Resolution Works on Predict"):** "As of March 2026, all new markets ... are served by UMA's Optimistic Oracle": bonded proposal, challenge window, second round, then UMA token-holder vote. Undisputed resolution about 2 hours; disputes hours to about a week.
- **Crypto and stock up/down rounds (H):** resolved by Chainlink Data Streams through `ChainlinkUpDownAdapter`; Up / Down / Flat (end price equal to start price); emergency manual close role exists when the contract is paused. Streams listed: BTC, ETH, BNB and a list of US stocks/ETFs (SPY, QQQ, MSFT, NVDA, GOOGL, META, TSM, AMZN, MU, AVGO, SPCX).
- **Doc inconsistency (M):** Predict.fun's "Technical Overview" still says only whitelisted proposers can submit prices and "there is no bonding or dispute mechanism", which contradicts the March-2026 resolution page and the Binance FAQ. Probably an older page; unresolved.
- **Risk for arbitrage:** a Polymarket (UMA) vs Predict.fun (UMA-compatible, different instance) pair can resolve differently on the same real-world question; "Flat" on up/down markets has no Polymarket equivalent in some series. Treat cross-venue resolution-rule equality as unverified per market.

---

## 8. Geo, ToS and automation

- **Binance (H):** "Prediction Markets may not be available in your country or region"; no country list given in the FAQ, API FAQ or the Binance Wallet Terms page I read (the Terms page text did not mention prediction markets at all). Services provided by Binance Barbados Limited, "not supervised by the Financial Services Regulatory Authority or any other regulator"; Binance ADGM entities do not provide them. The API is for "eligible users" by region.
- **Automation (H):** Binance explicitly offers the API, SDKs, a CLI and an Agentic Wallet "Prediction Market" skill (developers.binance.com Agentic Wallet docs: browse, quote, place market/limit, redeem, "hand the whole loop to an automated strategy"). Programmatic trading by an eligible, KYC'd user is clearly intended. API terms of use are NOT FOUND for this product (Binance Wallet Terms page had no API section).
- **Underlying Predict.fun ToS (H, "Last Updated: November 18, 2025", about 11 months old, possibly stale):** trading prohibited for persons in the United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan or other restricted territories; VPN circumvention prohibited; bars "data mining tools, robots, crawlers, or similar data gathering and extraction tools to scrape ... the Site". The official API is the sanctioned programmatic route on that side.
- **Implication:** any trader using this route must be in a jurisdiction allowed by BOTH Binance (unspecified list) and Predict.fun's ToS. For the project's users this is a hard gate, independent of technical reachability.

---

## 9. Liquidity (with dates)

- **Predict.fun total (the pool Binance routes into), DefiLlama 2026-10-19 (H):** 24h volume $14.45M (-11% d/d), 7d $103.4M, 30d $350.2M (+42.9% vs the prior 30d), TVL $10.44M (USDB on Blast + USDT on BSC in CTF and wrapped-collateral contracts). Fixture: `defillama_predict_fun_and_binance_wallet_2026-10-19.json`.
- **Binance-attributed volume:** NOT FOUND (searched: DefiLlama protocols and dexs overview - Binance Wallet is only a `Wallets` row with null TVL and no prediction-volume row; Binance FAQs; Binance dev docs; Predict.fun news and docs; three press pieces). Binance has not published a share of Predict.fun volume.
- **Press (M, self-reported, partly stale):** Predict.fun over $1.8B cumulative volume and 4M orders by end of March 2026; Trust Wallet about 125k users / 3.7M transactions (predictreport.io review published 2026-09-21; Dyutam 2026-04-10 quotes about $277M 30-day notional at the time).
- **Integrity caveat (M, from the project's earlier note `09-venues-onchain-clob.md`):** Predict.fun runs a points programme, so headline volume is an upper bound; size any arbitrage on displayed depth only. Binance's order-book channel typically shows 50 levels or fewer per market.

---

## 10. Event categories that overlap other venues (where arbitrage lives)

- **Categories on the Binance surface (H/M):** crypto, sports, politics, economy, culture (Binance Agentic Wallet docs); CMC lists crypto price events, sports (NBA, NFL, football), politics, macro, entertainment, AI milestones (M). Predict.fun's own docs and news add FIFA World Cup 2026 and esports (TI 2026, LoL Worlds) event programmes and 15-minute stock up/down markets (news dated 2026-09-23; H for existence).
- **Overlap with other venues (M, via category, not verified market by market):**
  - Crypto price up/down (BTC/ETH/BNB, 5m/15m/hourly) overlaps Polymarket, Limitless, Opinion and Hyperliquid outcomes. Binance's own agent doc uses the "BTC 5-minute Up/Down" series as its showcase.
  - Politics, Fed/macro, sports lines overlap Polymarket and Kalshi.
  - The Predict.fun market schema carries `polymarketConditionIds[]` (H), a native hook for mapping to Polymarket.
- **Arbitrage implication:** the Binance surface adds no new prices. Use Predict.fun once; mark Binance as a route/fee variant.

---

## 11. Shared liquidity (is it an independent leg?)

**No. It shares 100% of its order book with Predict.fun. (H for mechanism, M for "100%".)**

Evidence: Binance FAQ names Predict.fun as the provider; Binance `order-book` takes `vendor=predict_fun`; Binance WS doc: quotes "come from Predict.fun; if upstream disconnects, this channel pauses"; Binance orders carry `vendorOrderId`; Binance market objects carry `conditionId`/`tokenId` (on-chain ids); cancel sets `vendor` to `predict_fun`; PP are "provided and operated by Predict.fun". Not found: an explicit sentence saying "Binance users trade in the same order book as predict.fun" (predictreport.io says the same-book question is unconfirmed). Residual uncertainty: Binance may list only a curated subset of Predict.fun markets, and the Binance dApp vs in-app wallets may be different addresses on the same book.

Same class of duplicate: Trust Wallet "Predictions" tab (M, press: surfaces Predict.fun). DefiLlama has `trust-wallet-wallet` as `Wallets`; no prediction row.

---

## 12. Adapter recommendation

- **adapter_priority: skip** (duplicate liquidity; Binance read API requires a Binance account and API key; trading is server-signed and unreachable from PayBox). 
- **Do now:** add a registry record only:
  `{ id: "binance-wallet-prediction", kind: "frontend", routes_to: "predict_fun", pool_id: "predict_fun", chain: "bsc:56", collateral: "USDT", fee_stack: "predict.fun taker fee only (maker 0); Binance adds none; gas sponsored (M)", geo: "Binance eligibility list unpublished + Predict.fun ToS list", api: "official, authenticated (Binance API key)" }`.
- **Optional later (P2-ish, only if a user already has a Binance prediction account):** a `binance-prediction` execution route behind the Predict.fun pool, using `get-quote` then `place-order-bundle`. Quote objects expose fee and price impact, which can pre-validate fills. Not needed for scanning.
- **Useful signal:** none unique. Binance-specific flow share is unpublished.

## 13. Open questions

1. Explicit confirmation that Binance flow lands in the same Predict.fun CLOB (ask Predict.fun/Binance, or compare a funded test order's `vendorOrderId` against Predict.fun's `/v1/orders/matches`; needs a funded account, out of scope here).
2. Which Predict.fun markets Binance lists (curated subset?) and the Binance country exclusion list.
3. Whether the Binance dApp wallet and Prediction Account are the same address.
4. Rate-limit cap for the prediction SAPI group beyond weight(IP)=1.
5. Predict.fun resolution mechanism doc conflict (bonded UMA vs whitelisted proposers).
6. Whether a non-Binance wallet can deposit directly to the prediction wallet address.

## 14. Not found

- Public/unauthenticated Binance prediction read endpoint (searched: SDK `isSigned` flags, llms.txt, three live GETs).
- Binance-attributed prediction volume or TVL (searched: DefiLlama, Binance FAQs/dev docs, Predict.fun news/docs, press).
- Binance restricted-country list for Prediction Markets (searched: three Binance FAQs, Binance Wallet Terms page).
- Binance API terms of use specific to prediction trading.
- Binance-published statement that quotes are Predict.fun's live CLOB (only vendor/ids/pause behaviour).
- REST overall IP rate limit specific to this product.
- Exact Binance Wallet Keyless custody statement on whether Binance holds a key share (the Keyless FAQ is silent).

---

## Sources

H (primary, read this session):
- Binance Support FAQ, Binance Wallet Prediction Markets (published 2026-03-30, updated 2026-07-07): https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec
- Binance Support FAQ, Prediction Markets API (2026-06-08): https://www.binance.com/en/support/faq/detail/5d6f65bc34ff40799b17d84e3630d1f0
- Binance Support FAQ, Predict Points on Binance Wallet (2026-06-02): https://www.binance.com/en/support/faq/detail/6975400a88cc4592a604178e5d71b048
- Binance Support FAQ, Secure Auto Sign (published 2025-10-14, updated 2026-07-13): https://www.binance.com/en/support/faq/detail/90cb7110cf164a9e822edfb9fe6b5108
- Binance Support FAQ, Binance Wallet Keyless (MPC) (published 2023-10-23, updated 2026-02-23): https://www.binance.com/en/support/faq/detail/4efebcb9a937417ca31baa2f7754c50f
- Binance dev docs, WS integration guide / orderbook / wallet events / change log: https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/integration-guide , .../orderbook , .../wallet-events , https://developers.binance.com/en/docs/products/w3w-prediction/change-log
- Binance dev docs index and full text: https://developers.binance.com/en/docs/llms.txt , https://developers.binance.com/en/docs/llms-full.txt (Prediction Trading REST list; Agentic Wallet "Prediction Market" page)
- Official connector source: https://github.com/binance/binance-connector-js/tree/master/clients/w3w-prediction (modules `market-data-api.ts`, `trade-api.ts`, `wallet-api.ts`, `transfer-api.ts`, types; CHANGELOG 2.2.0 dated 2026-10-15); Java/PHP connectors and `binance/binance-cli` (example lists)
- npm registry `@binance/w3w-prediction` release timestamps: https://registry.npmjs.org/@binance/w3w-prediction
- Live unauthenticated probe of `https://api.binance.com/sapi/v1/w3w/wallet/prediction/*` (2026-10-19; fixture)
- Predict.fun docs: https://docs.predict.fun/llms.txt , .../binance-wallet-referrals/binance-wallet-referral-faqs , .../the-basics/predict-fees-and-limits , .../knowledge-base/how-resolution-works-on-predict , .../developers/technical-overview , .../developers/chainlink-price-markets , .../knowledge-base/wallets , .../terms-of-service (Last Updated 2025-11-18)
- Predict.fun developer docs: https://dev.predict.fun/llms.txt , https://dev.predict.fun/faqs-684248m0.md , https://dev.predict.fun/market-14037477d0.md , OAuth endpoints marked "not available for general use"
- Predict.fun news index: https://predict.fun/news
- DefiLlama: https://api.llama.fi/overview/dexs , https://api.llama.fi/protocols , https://api.llama.fi/protocol/predict-fun

M (secondary, read this session):
- The Block, 2026-03-31: https://www.theblock.co/post/395817/binance-tests-prediction-market-feature
- Cryptobriefing (Apr 9, 2026 announcement): https://cryptobriefing.com/binance-prediction-markets-integration/
- TradingView / Finance Magnates: https://www.tradingview.com/news/financemagnates:6b6d1ee1f094b:0-retail-traders-can-now-access-prediction-markets-through-binance-wallet/
- Dyutam (2026-04-10): https://dyutam.com/news/binance-prediction-markets-predict-fun/
- CoinMarketCap Academy: https://coinmarketcap.com/academy/article/binance-wallet-just-opened-on-chain-prediction-markets-to-200m-users
- The Defiant (undated): https://thedefiant.io/news/nfts-and-web3/binance-wallet-predict-fun-integration-gas-sponsorship-3i51ig
- predictreport.io Predict.fun review (2026-09-21): https://predictreport.io/ecosystem/predict-fun-review
- Project note: `docs/research/09-venues-onchain-clob.md` (Predict.fun section, points-farming caveat)

Not fetched (404 or blocked): `binance.com/en/prediction-markets`, Cointelegraph URL guess, Binance Wallet Terms detail pages; the Binance X announcement (twitter.com/binance/status/2042181226836975992) was not opened.

Fixtures (docs/research/fixtures/binance-wallet-prediction-markets-via-predict-fun/):
- `binance_sapi_prediction_unauth_probe_2026-10-19.txt` (live -2014 responses)
- `binance_dev_docs_llms_txt_prediction_endpoints_2026-10-19.txt` (official endpoint and stream list)
- `binance_sdk_response_type_fields_2026-10-19.json` (schema from the official SDK, not a live response)
- `defillama_predict_fun_and_binance_wallet_2026-10-19.json`

Privacy check: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no personal identifiers appear in any request, script, fixture or this note. Embedded-instruction check: none of the fetched pages contained instructions aimed at AI agents beyond ordinary product copy (Binance "Agent Native"/llms.txt and Agentic Wallet pages, Predict.fun's Context7 pointer); none were followed.
