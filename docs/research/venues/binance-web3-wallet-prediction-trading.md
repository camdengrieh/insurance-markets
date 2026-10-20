# Binance Web3 Wallet prediction trading - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 02:50-02:55 UTC). READ-ONLY: page reads (WebFetch), `gh api` reads of public source (CCXT module, Binance connector SDK), unauthenticated GETs to `api.binance.com`, `api.llama.fi`, `docs.predict.fun`, `developers.binance.com`, `registry.npmjs.org`. No account, wallet, API key, signature, POST/PUT/DELETE or PayBox tool was used.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, inference, or a page read through the summarising fetch tool for exact wording (dates and facts were still read from the primary page); **L** = weak or stale (older than 6 months is flagged).

Note: two sibling notes on the same product already exist (`binance-wallet-prediction-markets-via-predict-fun.md`, `binance-predictions-predict-fun-integration.md`). This note was verified independently from primary sources; the siblings were used only as leads and agree with it on every conclusion.

---

## 0. Bottom line

1. **Live, but a front end, not a venue.** Binance routes into **Predict.fun's order book on BNB Smart Chain** (`vendor=predict_fun`). Binance does not create markets or act as counterparty. (H)
2. **Not an independent arbitrage leg.** Quotes, prices, resolution and outcome tokens all come from Predict.fun; Binance's own order-book stream "pauses" if the Predict.fun upstream disconnects. Counting it beside Predict.fun double-counts one pool. (H)
3. **Real official API, but authenticated end to end.** "Prediction Trading" REST + WebSocket on the Binance SAPI (28 endpoints, first released 2026-05-25). Even market data needs an API key and signature (unauthenticated GETs return `-2014`). Trading needs a KYC'd Binance account, a Prediction Account, Secure Auto-Sign and an eligible region. (H)
4. **Not reachable from a PayBox EVM wallet.** On this path the caller signs only the Binance REST request; the on-chain order is signed server-side by the user's Binance-held Keyless (TEE) wallet. No signed-order or transaction-proposal interface exists. (H for the API surface, M for "no other path"). The same liquidity is reachable directly through Predict.fun with an EOA (that is the Predict.fun adapter's job).
5. **adapter_priority = skip** (duplicate liquidity). Keep only a registry record `binance_wallet_prediction -> routes_to: predict_fun` so the aggregator never shows it as a separate pool, plus its geo/fee notes.

---

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Binance Support FAQ "Binance Wallet Prediction Markets" https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec | Published 2026-03-30 14:22, updated 2026-07-07 10:34 | H (via summarising fetch) |
| Binance dev docs change log https://developers.binance.com/en/docs/products/w3w-prediction/change-log.md | Initial release 2026-05-25; entries 2026-06-16, 08-14 (OTC block trades + MM deposit/withdraw), 09-10, **10-08 (11 days ago)** | H (raw markdown) |
| npm `@binance/w3w-prediction` https://registry.npmjs.org/@binance/w3w-prediction | latest 2.2.0 published **2026-10-15**; 2.1.5 on 2026-10-09 | H |
| Live API host | `GET /sapi/v1/w3w/wallet/prediction/market/list` -> HTTP 400 `-2014 API-key format invalid` (route exists, wants a key); a bogus sibling route -> HTTP 404. So the routes are deployed in production on 2026-10-19. | H (fixture) |
| Product page https://www.binance.com/en/markets/prediction | Could not be read: `curl` got HTTP 202 with an empty body (bot/JS challenge), WebFetch got HTTP 404. Page is cited as the product URL by CCXT's `urls.www` only. | not confirmed first-hand |
| DefiLlama `predict-fun` (the underlying pool) | 24h volume $14.34M on 2026-10-19 | H |

Verdict: **still_live = true** (launch Mar-Apr 2026 is about 6.5 months old; all operating evidence is from the last 2 weeks to 4 months).

---

## 2. Kind and market model

- **Kind (H):** consumer front end + official partner API over a third-party protocol. FAQ: Binance "aggregates markets from third parties"; main provider Predict.fun on BNB Smart Chain; Binance "does not create or manage events" and is not the counterparty. Binance Wallet services are provided by Binance Barbados Limited; the ADGM entity does not provide them.
- **Two Binance surfaces (H/M):** (1) in-app "Prediction" with a separate **Prediction Account** (Keyless technology, distinct from Spot/Funding/Binance Wallet, created on first order) - this is what the REST API drives; (2) the Predict.fun dApp inside Binance Wallet (the Predict.fun referral FAQ distinguishes the two). Whether they share one wallet address: NOT FOUND.
- **Market model (H, SDK/docs):** order book (CLOB), not AMM or parimutuel. `MARKET` (time in force `FOK`) and `LIMIT` (`GTC`). Price of an outcome share is in (0,1) USDT; tick = 10^-`decimalPrecision` (2 means 0.01). Binary Yes/No markets and **multi-outcome** markets ("Trump / Biden / ..." in the WS guide). No scalar markets documented.
- **Ids / tokenisation (H, SDK types):** event = `marketTopicId`; child market = `marketId` (+ `externalId`, **`conditionId`**); outcome = `outcomes[].tokenId` (string) with `name`, `index`, `price`, `chance`, `winner` (set after resolution; "more than one outcome can be true when the payout is split"). Topic fields: `vendor`, `chainId`, `slug`, `topicType`, `chartType`, `symbol`, `collateral`, `feeRateBps`, `slippageBps`, `isYieldBearing`, `tradeVolume`, `liquidity`, `participantCount`, `startDate`, `endDate`, `status`. Crypto up/down markets carry `variantData` (`type`, `startPrice`, `endPrice`, `priceFeedId`, `priceFeedProvider`, `priceFeedSymbol`).
- On-chain token standard (ERC-1155 conditional tokens, `CTFExchange`) is Predict.fun's design, covered by the Predict.fun spec (M here; not re-read this session).

---

## 3. Chains and collateral

- **Chain (H):** BNB Smart Chain; SDK `chainId` default `56` ("Default 56 (BSC)").
- **Collateral (H):** USDT only ("you can only use USDT", FAQ). API amounts are strings in **wei, 18 decimals** (`1000000000000000000` = 1 USDT).
- **Funding (H, SDK):** `fundingSource` = `MPC` (balance in the prediction wallet, default) or `CEX` (Spot/Funding, with optional `fundTransferAmount` auto-transfer); `accountType` SPOT/FUNDING is only the settlement/reference account (change log 2026-09-10). Transfers Spot/Funding <-> prediction wallet are API endpoints (`transfer/inbound|outbound|list|status`, need SAS).
- **Gas (M):** Binance reportedly sponsors BNB Chain gas (Cryptobriefing via search snippet, not in the Binance docs I read).

---

## 4. Read API

**Exists: official-authenticated. No public/unauthenticated read path on the Binance side.** (H)

- Docs: https://developers.binance.com/en/docs/catalog/web3-wallet-prediction-trading (REST catalog is client-rendered; endpoint text read from `llms.txt`/`llms-full.txt` and the official SDK source); WS: https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/{integration-guide,orderbook,wallet-events}; change log above.
- Base URLs (H): REST `https://api.binance.com`, prefix `/sapi/v1/w3w/wallet/prediction/`; WS `wss://api.binance.com/sapi/wss`.
- Market-data endpoints (H, all `GET`, SDK `isSigned: true`, "Weight(IP): 1"):
  - `category/list` (L1/L2 categories)
  - `market/list` (`l1Category`, `l2Category`, `sortBy` RECOMMENDED|VOLUME|PARTICIPANTS|CREATED_TIME|END_DATE, `orderBy`, `offset`, `limit` 1-100, default 20)
  - `market/search` (`query`, `topK` 1-50; semantic search)
  - `market/detail` (`marketTopicId`; nested `markets[]`, `outcomes[]`, `timeline`, `variantData`)
  - `order-book` (`vendor` e.g. `predict_fun`, `marketId`, `tokenId`) -> `outcome`, `tokenId`, `timestamp`, `bids[]`/`asks[]` of `{price,size}` strings
  - `order-book/last-trade-price` (`marketId`)
- **Trades:** no public trade tape. Only user-scoped `order/list`, `order/history`, `position/*`, `pnl/*`. A last-trade-price per market exists. (H)
- **Resolution state (H, change log 2026-10-08):** `status` (REGISTERED | RESOLVED), `markets[].tradingStatus` (only `OPEN` allows new orders), `outcomes[].winner`. "There is no separate cancelled, invalid or refunded status." WS topic `web3_prediction_pm_market_close` signals resolution (user-scoped topic).
- **Auth (H):** header `X-MBX-APIKEY`; HMAC-SHA256 over the sorted query string appended as `signature`, plus `timestamp`/`recvWindow` (CCXT implements HMAC; SDK also supports RSA/Ed25519). Key is created by a human under Account > API Management with the **"Prediction Trading"** permission enabled; the account also needs a Prediction Account and "Secure Auto-Signing" enabled (Binance API FAQ https://www.binance.com/en/support/faq/detail/5d6f65bc34ff40799b17d84e3630d1f0, published 2026-06-08). In the REST catalog the market-data operations are not suffixed "(PREDICTION_TRADE)" while all others are, which hints that a plain key may suffice for market data (M inference, untested - cannot create a key here).
- **Unauthenticated probe (H, 2026-10-19):** `market/list`, `category/list`, `order-book`, `market/search` all -> `HTTP 400 {"code":-2014,"msg":"API-key format invalid."}`. Fixture: `binance_sapi_unauth_probe_2026-10-19.txt`. Host reachable from the research location (no 451).
- **Rate limits:** per-endpoint "Weight(IP): 1" (H; change log 2026-09-10 corrected it "from 200 to 1 to match measured production behavior"). CCXT's module still models cost 200 against a 12000/min budget (stale, L). Binance's generic SAPI wording is "each endpoint with IP limits has an independent 12000 per minute limit" (H for that sentence in other product sections of `llms-full.txt`, M that it applies here). Product-specific cap: NOT FOUND (searched: change log, SDK, FAQ, llms-full). WS: 5 messages/s per connection, PING every 30 s, 24 h max connection life (H).
- **WebSocket order book (H, `.../websocket-streams/orderbook`):** topic `web3_prediction_orderbook_{marketId}` (marketId = Binance's id; join to tokens via REST), full snapshot every push: `asks` ascending, `bids` descending, `[price,size]` JSON numbers, `updateTimestampMs` for ordering, typically 50 levels or fewer, avg 1-3 msg/s per market (peak ~10/s), <200 ms after the upstream event, at-most-once, no replay; broadcast by topic. Subscribing still needs a signed connection and API key. "Third-party market making / arbitrage strategies" are listed as an intended use case.
- **Official SDKs (H):** `@binance/w3w-prediction` (npm, 2.2.0), plus Java/PHP connectors and `binance-cli` (from sibling lead, M). CCXT has a `binance` prediction module (`ts/src/prediction/binance.ts`, read this session).
- **Better read path for the aggregator:** Predict.fun's own API for the same books (covered by the Predict.fun spec; needs its own self-service key per project note 09, M).
- **Third-party alternative (M, untrusted):** DepthFeed (`depthfeed.com`, "independent", not Binance-affiliated) sells historical/forward L2 snapshots of Predict.fun markets distributed through Binance Wallet; paid "Quant" plan, 60 s sampling. Not needed.

Sample shapes: no live response is obtainable without a key. Saved instead: SDK field schema (`binance_sdk_response_type_fields_2026-10-19.json`) and CCXT docstring examples (`ccxt_binance_prediction_doc_example_shapes_2026-10-19.json`, labelled as documentation examples, not live captures), plus the official WS payload in `binance_dev_docs_ws_orderbook_2026-10-19.md`.

---

## 5. Trade path

- **Programmatic: yes, but only as a Binance-authenticated, server-signed flow (H).**
  1. `POST trade/get-quote` (`walletAddress` = the user's prediction wallet, `tokenId`, `side` BUY|SELL, `amountIn` in wei (BUY: USDT; SELL: shares), `orderType` MARKET|LIMIT, `slippageBps` 1-10000, `priceLimit` required for LIMIT, `chainId` default 56, `feeRateBps` default 200, `fundingSource`) -> `quoteId`, `amountOut`, `feeAmount`, `averagePrice`, `priceImpact`, `minReceive`, `expireAt`.
  2. `POST trade/place-order-bundle` (`quoteId`, `walletAddress`, `walletId`, `timeInForce` FOK for MARKET / GTC for LIMIT, `accountType`, `orderType`, `slippageBps`, `priceLimit`, `fundingSource`) - "Requires SAS authorization".
  3. `POST trade/batch-cancel` (indexed bracket params `cancelInfoList[i].orderId`; vendor auto-set to `predict_fun`; known `-1022` signature issue with mainstream HTTP libraries, workarounds documented). `GET order/list`, `order/history`.
  4. Claim: `POST batch-redeem`, `GET redeem/status`. Positions/PnL: `position/*`, `pnl/*`. Wallet: `wallet/list`, `quota/limit/status` (daily limit), `balance/payment-options`.
  5. Authorised market makers only: 8 OTC block-trade endpoints and `deposit/apply`/`withdraw/apply` (2026-08-14).
- **Signing scheme (H/M):** the caller signs only the Binance REST request (API key + HMAC). The on-chain order signature is produced by Binance's wallet infrastructure for the user's Keyless wallet; the SAS FAQ (https://www.binance.com/en/support/faq/detail/90cb7110cf164a9e822edfb9fe6b5108, updated 2026-07-13) says keys live in a TEE that "cannot be accessed by anyone, not even Binance" (H), but that page lists DEX, Pro/Quick Trade, DCA etc. and does **not** name prediction trading (so applicability is M). No EIP-712 order surface is exposed to the caller.
- **Gotchas (H, change log):** a successful quote does not guarantee a fill; minimum order is server-defined (no fixed value documented since 2026-10-08); `walletAddress` not owned by the UID returns generic `-3026`; `transfer/inbound` without SAS returns `-31003`.

### PayBox reachability: **no** (Binance path)

A PayBox EVM wallet (one address across all `eip155:*`; BNB Smart Chain (56) is in PayBox's chain catalog per project note 06, M) cannot use this path: orders need a Binance UID, a human-created API key with Prediction Trading permission, a Prediction Account and SAS, and are signed by Binance's custody. There is no transaction-proposal or signed-order interface. Whether an external wallet may deposit USDT straight to the prediction wallet address: NOT FOUND (only Spot/Funding transfers are documented for non-MM users). Reachable instead: the underlying **Predict.fun** order book via EOA EIP-712 orders and BSC approvals (separate spec).

---

## 6. Fees

- **Binance (H via summarising fetch):** "Fees are not directly collected by Binance"; vendor fees shown on the order confirmation screen. API access has no extra fee and "trading fees, if any, match other access channels" (API FAQ). Quote returns `feeAmount` (wei), `feeRateBps` (default 200), `feeDiscountBps`; order objects expose `marketProviderFee` and `networkFee` (SDK, M from sibling).
- **Underlying Predict.fun (H, https://docs.predict.fun/the-basics/predict-fees-and-limits.md):** makers pay no fee; takers pay `base fee (2%) x min(price, 1 - price) x shares`; optional 10% fee discount (x0.9). Derived by me from the formula (M): the fee as a share of notional is 2% for prices at or below 0.50 and `2% x (1-p)/p` above it (about 0.02% at 0.99). Minimum order 1 USDT per Predict.fun docs; Binance says its minimum is server-defined.
- **Channel differences (H):** Predict.fun's Binance-Wallet-dApp referral gives inviters 10% and invitees a 5% rebate of fees, only for trades via the dApp inside Binance Wallet (https://docs.predict.fun/binance-wallet-referrals/binance-wallet-referral-faqs.md).
- **Points (H):** Predict Points are provided/operated by Predict.fun, tracked per address; Binance Wallet is only a display channel (https://www.binance.com/en/support/faq/detail/6975400a88cc4592a604178e5d71b048, 2026-06-02).

---

## 7. Resolution and dispute risk

- **Binance FAQ (H):** the provider's markets "resolve through a decentralized on-chain oracle"; a resolution proposal is submitted with a bond; if nobody challenges, it resolves automatically; if disputed, it escalates to arbitration. Winners redeem $1 per share (FAQ/press; Predict.fun doc below).
- **Predict.fun (H, https://docs.predict.fun/knowledge-base/how-resolution-works-on-predict.md):** "As of March 2026, all new markets on Predict are served by UMA's Optimistic Oracle": bonded proposal, challenge window, second round, then UMA token-holder vote. Undisputed resolution about 2 hours; disputes hours to a day; UMA vote up to about a week.
- **Crypto up/down rounds (M, sibling note + `variantData.priceFeedProvider` field):** resolved from a price feed (Chainlink Data Streams per Predict.fun docs, not re-read here); a "Flat" case may exist.
- **Dispute / basis risk for arbitrage:** a Polymarket-vs-Predict.fun pair resolves through different UMA instances and rule texts; split payouts are possible (`winner` may be true for several outcomes) and there is no cancelled/invalid status in the Binance API. Cross-venue rule equality must be checked market by market (unverified).

---

## 8. Geo, ToS, automation

- **Binance (H via summarising fetch):** "Prediction Markets may not be available in your country or region"; no country list in the FAQ or the API FAQ. API is "limited to eligible users"; the FAQs state Prediction Markets are accessible only to people holding a Binance Wallet. The Binance ADGM entity does not provide them. A search found no published excluded-country list either (NOT FOUND).
- **Automation (H):** officially supported: REST API, WS streams, SDKs, CLI, and an Agentic Wallet "Prediction Market" use case that explicitly offers to "hand the whole loop to an automated strategy" (https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/prediction-market.md). API-specific terms of use for this product: NOT FOUND.
- **Underlying Predict.fun ToS (H, "Last Updated: November 18, 2025", about 11 months old, possibly stale):** trading prohibited for persons in the United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan or other restricted territories; VPN circumvention prohibited; bars "data mining tools, robots, crawlers, or similar data gathering and extraction tools to scrape ... the Site" (so use official APIs, not page scraping).
- **Implication:** a trader on this route must be eligible under both Binance's unpublished regional list and Predict.fun's ToS; this is a hard gate independent of technical reachability.

---

## 9. Liquidity (with dates)

- **Predict.fun total (the pool Binance routes into), DefiLlama 2026-10-19 (H, fixture `defillama_predict_fun_2026-10-19.json`):** 24h volume $14.34M (-11.7% d/d), 7d $103.4M, 30d $350.2M, all-time $3.49B, TVL about $10.16M (BSC $10.12M, Blast $0.04M; TVL was $10.77M a day earlier).
- **Binance-attributed volume or TVL:** NOT FOUND (searched: DefiLlama, Binance FAQs and dev docs, web search, press). The per-topic `tradeVolume`, `liquidity` and `participantCount` fields exist in the authenticated API, so a keyed scan could measure Binance-listed coverage directly.
- **Press (M, stale-prone):** Predict.fun cumulative volume about $1.7-1.8B and 4M orders by Q2 2026 (financefeeds, cryptonews via search results); launch-time 30-day notional about $277M. No October 2026 Binance-specific figure found.
- **Integrity caveat (M):** Predict.fun runs a points programme (Predict Points, H), so headline volume is an upper bound; size any arbitrage on displayed depth only. Binance WS shows 50 levels or fewer per market.

---

## 10. Event categories that overlap other venues

- **Categories (H):** crypto, sports, politics, economy, culture (Agentic Wallet doc). Recurring crypto up/down series (BTC 5-minute and 15-minute are named in Binance's docs; hourly appears in the CCXT example).
- **Overlap (M, by category only; not verified market by market):** crypto price up/down (Polymarket, Limitless, Opinion, Hyperliquid outcomes); politics, Fed/macro and sports (Polymarket, Kalshi). Predict.fun's own market schema reportedly carries Polymarket/Kalshi cross-reference fields (project note 09, M), which belong to the Predict.fun adapter.
- **Arbitrage implication:** the Binance surface adds no new prices; use Predict.fun once.

---

## 11. Shared liquidity

**Yes: it shares its order book with Predict.fun. Not an independent leg.** (H for mechanism; M for "100%")

Evidence (H): the WS doc says the service "pulls real-time orderbook (bid/ask) data from upstream market makers (Predict.fun)" and the channel pauses if the upstream disconnects; `order-book` takes `vendor=predict_fun`; `batch-cancel` auto-sets `vendor` to `predict_fun`; market objects carry on-chain ids (`conditionId`, `tokenId`); the FAQ names Predict.fun as the primary provider. Residual uncertainty: Binance may list only a curated subset of Predict.fun markets, and "primary provider" leaves room for additional vendors later (the `vendor` parameter is extensible).

---

## 12. Adapter recommendation

- **adapter_priority: skip.** Duplicate liquidity; read API needs a Binance key (even for books); trading is server-signed and unreachable from PayBox; regional eligibility opaque.
- **Do now:** registry/pool-membership record only, e.g. `{ id: "binance-wallet-prediction", kind: "frontend", routes_to: "predict_fun", pool_id: "predict_fun", chain: "bsc:56", collateral: "USDT", fee: "predict.fun taker fee only (maker 0), Binance adds none (FAQ)", api: "official, authenticated (Binance API key)" }`.
- **Optional later (P2 at best):** a Binance execution route behind the Predict.fun pool for users who already hold a Binance prediction account (`get-quote` then `place-order-bundle`); quotes expose `feeAmount` and `priceImpact`, useful to pre-validate fills. Not needed for scanning.
- **Unique signal:** none found; Binance-specific flow share is unpublished.

## 13. Open questions

1. Is Binance flow literally the same CLOB as predict.fun's (compare a funded test order's `vendorOrderId` against Predict.fun's match feed)? Needs a funded account; out of scope.
2. Which Predict.fun markets does Binance list (curated subset)? Needs a keyed `market/list`.
3. Does a Binance key without "Prediction Trading" permission work on the market-data endpoints? Needs a human-created key.
4. Binance's excluded-country list for Prediction Markets; API terms of use for this product.
5. Can an external wallet deposit to the prediction wallet address, and are the in-app Prediction Account and the Binance Wallet dApp the same address?
6. Hint in the task brief says Binance is "only listed as a reference-data source in Predexon": not investigated (outside the primary-source scope here).

## 14. Not found

- Public unauthenticated Binance prediction read endpoint (searched: SDK `isSigned` flags, llms.txt, four live GETs).
- Binance-attributed prediction volume/TVL (searched: DefiLlama, Binance FAQs and dev docs, web search).
- Binance restricted-country list (searched: two Binance FAQs, API FAQ, web search).
- Binance API terms of use specific to prediction trading.
- Product-specific REST rate-limit cap beyond weight(IP)=1.
- An explicit Binance sentence saying users trade "in the same order book as predict.fun" (only vendor/id/pause evidence).
- Binance product page first-hand read (HTTP 202 empty / 404).

---

## Sources

H (primary, read this session):
- Binance FAQ, Binance Wallet Prediction Markets (published 2026-03-30, updated 2026-07-07): https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec
- Binance FAQ, Prediction Markets API (2026-06-08): https://www.binance.com/en/support/faq/detail/5d6f65bc34ff40799b17d84e3630d1f0
- Binance FAQ, Secure Auto Sign (published 2025-10-14, updated 2026-07-13): https://www.binance.com/en/support/faq/detail/90cb7110cf164a9e822edfb9fe6b5108
- Binance FAQ, Predict Points (2026-06-02): https://www.binance.com/en/support/faq/detail/6975400a88cc4592a604178e5d71b048
- Binance dev docs: https://developers.binance.com/en/docs/llms.txt , https://developers.binance.com/en/docs/llms-full.txt , change log .../products/w3w-prediction/change-log.md , WS .../websocket-streams/orderbook.md and .../integration-guide.md , Agentic Wallet .../products/agentic-wallet/use-cases/trading/prediction-market.md
- Official SDK source: https://github.com/binance/binance-connector-js/tree/master/clients/w3w-prediction (modules `market-data-api.ts`, `trade-api.ts`; `types/*.ts`)
- npm registry: https://registry.npmjs.org/@binance/w3w-prediction
- CCXT module: https://github.com/ccxt/ccxt/blob/master/ts/src/prediction/binance.ts
- Live probes of https://api.binance.com/sapi/v1/w3w/wallet/prediction/* (fixture)
- Predict.fun docs: https://docs.predict.fun/the-basics/predict-fees-and-limits.md , .../knowledge-base/how-resolution-works-on-predict.md , .../binance-wallet-referrals/binance-wallet-referral-faqs.md , .../terms-of-service.md (Last Updated 2025-11-18)
- DefiLlama: https://api.llama.fi/summary/dexs/predict-fun , https://api.llama.fi/protocol/predict-fun . Note: https://api.llama.fi/summary/derivatives/predict-fun returned HTTP 402 "Upgrade to the paid API plan at https://defillama.com/subscription" (a subscription wall, not an x402 payment requirement); stopped, nothing paid.

M (secondary / project notes):
- Web search snippets: Cryptobriefing https://cryptobriefing.com/binance-prediction-markets-integration/ , Financefeeds https://financefeeds.com/predict-fun-hits-1-7b-volume-as-binance-rolls-out/ , cryptonews.net, CoinDesk 2026-04-09 https://www.coindesk.com/markets/2026/04/09/binance-enters-prediction-markets-arena-via-predict-fun-integration
- DepthFeed (independent paid data service, read through the summarising fetch): https://depthfeed.com/binance-prediction-market-data
- Project notes: `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md`, sibling venue notes listed at the top.

Fixtures (docs/research/fixtures/binance-web3-wallet-prediction-trading/):
- `binance_sapi_unauth_probe_2026-10-19.txt` (live -2014 and 404 responses)
- `binance_dev_docs_llms_txt_prediction_endpoints_2026-10-19.txt` (official endpoint and stream list)
- `binance_dev_docs_change_log_2026-10-19.md`, `binance_dev_docs_ws_orderbook_2026-10-19.md` (official doc copies)
- `binance_sdk_response_type_fields_2026-10-19.json` (schema from the official SDK, not a live response)
- `ccxt_binance_prediction_doc_example_shapes_2026-10-19.json` (documentation examples, identifiers redacted)
- `defillama_predict_fun_2026-10-19.json`

Embedded-instruction check: none of the fetched pages, API responses or docs contained instructions aimed at AI agents beyond ordinary product copy (Binance `llms.txt` is an AI-oriented index and the Agentic Wallet page contains example user prompts; none were followed). Privacy check: all scripted requests used the User-Agent `insurance-markets-research/0.1`; the one script written was grepped for "@" (no hits); no personal identifier appears in any request, search query, fixture or this note.
