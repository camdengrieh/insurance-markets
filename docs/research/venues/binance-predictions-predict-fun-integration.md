# Binance Predictions (Predict.fun integration) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads (WebFetch), `gh api` raw file reads of the public Binance connector source, unauthenticated GETs to documented hosts, and one WebSearch (the shared search budget then ran out, so press coverage beyond that query was read by direct fetch only). No account, wallet, API key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited in Sources); **M** = secondary source, page-summary tool output, or my inference from first-hand data; **L** = weak or stale (older than 6 months is flagged).

Method note: WebFetch returns a small-model summary of a page, not raw HTML. Quotes from Binance FAQ pages are therefore only as exact as that summary. The dev-docs `.md` pages and the SDK source were read raw with curl / `gh api`, so those are first-hand.

Related note: a near-duplicate discovery entry for the same product exists at `docs/research/venues/binance-wallet-prediction-markets-via-predict-fun.md` (written by a parallel run; I read it as a lead only and re-verified the facts below myself). Conclusions agree. The registry should merge the two entries under one id.

Fixtures (<= 50 KB each): `docs/research/fixtures/binance-predictions-predict-fun-integration/` (listed at the end).

---

## 0. Bottom line

1. **Live, but a front end, not a venue.** Binance Wallet / the Binance app routes orders into **Predict.fun's order book on BNB Smart Chain**. Binance does not create markets, hold the book, or act as counterparty (H: Binance FAQ, CoinDesk, Binance dev docs).
2. **Not an independent arbitrage leg.** Prices, depth, resolution and outcome tokens all come from Predict.fun. Binance's own WebSocket doc says quotes "come from Predict.fun; if upstream disconnects, this channel pauses" (H). Counting it next to Predict.fun double-counts one pool.
3. **It has an official, authenticated-only API** (REST + WebSocket, initial release 2026-05-25, 28 REST endpoints, SDKs for JS/Java/PHP, plus a CLI). **Every endpoint, including market data, needs a Binance API key + signature**; keyless GETs return `-2014` (H, live probe). Trading also needs a Prediction Account, Secure Auto-Sign and an eligible region.
4. **Not reachable from a PayBox wallet.** Orders on the Binance path are quoted and signed server-side with the user's Binance Wallet Keyless key; there is no signed-order or transaction-proposal interface. The same liquidity is reachable directly through Predict.fun with an EOA (EIP-712 orders, USDT on BSC), which belongs to the Predict.fun adapter.
5. **adapter_priority = skip.** Keep only a registry/pool-membership record: `binance_prediction -> routes_to predict_fun`, so the scanner never lists it as a separate pool, plus its fee stack and geo rules.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| CoinDesk, 2026-04-09 "Binance enters prediction markets arena via Predict.fun integration" | Binance added prediction markets to Binance Wallet via Predict.fun; separate prediction account; Binance not counterparty | H |
| trendingtopics.eu article (dated 10 April 2026 by the page) | Same announcement; app path "Markets > Prediction"; BNB Smart Chain; market and limit orders; no Binance-specific volume given | H |
| Binance Support FAQ "Binance Wallet Prediction Markets" | "Published 2026-03-30 14:22", "Updated 2026-07-07 10:34" | H |
| Binance Support FAQ "Prediction Markets API" | Describes API setup requirements (see section 4) | H (content), publication date 2026-06-08 is M (from the sibling note) |
| Binance dev docs change log | Initial release 2026-05-25; later entries 2026-06-16, 2026-08-14, 2026-09-10, **2026-10-08 (11 days ago)** | H |
| DefiLlama `predict-fun` (the underlying venue) | 24h volume $14.45M on 2026-10-19 | H |

Verdict: **still_live = true.** The launch is about 6.3 months old (2026-04-09), so launch-era press is near the staleness line, but the operational evidence (change log, DefiLlama) is from the last two weeks.

---

## 2. Kind and market model

- **Kind (H):** consumer front end plus official partner API over a third-party protocol. Binance FAQ: Binance aggregates markets from third-party providers, the primary provider is Predict.Fun (a decentralized prediction-market protocol on BNB Smart Chain), and Binance "doesn't create or manage events" or act as counterparty. The API FAQ adds that the service requires a Binance Wallet and is delivered by Binance Barbados Limited.
- **Two entry points (H/M):** (1) in-app "Prediction" under Markets in the Binance app, with a dedicated **Prediction Account** (separate from Spot/Funding and from Binance Wallet; Keyless wallet generated on first order) (H, FAQ); (2) the **Predict.fun dApp inside Binance Wallet**, which Predict.fun's referral FAQ treats as a distinct frontend from "the Classic version, the Predict.fun website, or other frontends" (H). Whether (1) and (2) use the same wallet address: NOT FOUND (searched: Binance FAQs, Predict.fun referral FAQ).
- **Market model (H):** binary YES/NO shares priced 0.01 to 0.99 USDT, a winning share pays $1 (trendingtopics, Binance Agentic Wallet doc: "Prices sit between 0 and 1 USDT"). Multi-outcome events exist (Binance WS doc: "Trump" / "Biden" style outcome names; Predict.fun neg-risk adapter). CLOB, market orders (Binance sends FOK) and limit orders (GTC). Scalar markets: NOT FOUND (searched: Binance dev docs, SDK types). Tick size comes from `decimalPrecision` in market detail.
- **Tokenisation (H, Predict.fun Technical Overview):** ERC-1155 conditional tokens (Gnosis CT fork). Off-chain CLOB matching by an operator, on-chain settlement via `CTFExchange.matchOrders` / `NegRiskCtfExchange`; orders are EIP-712 structured data. Multi-outcome collateral is a `WrappedCollateral` backed by USDT; yield-bearing variants exist (`isYieldBearing` in Binance's market object).
- **Binance id model (H, SDK types):** event = `marketTopicId`; child market = `marketId` (+ `externalId`, `conditionId`); outcome = `outcomes[].tokenId` with `name`, `index`, `price`, `chance`, `winner`. Topic-level: `vendor`, `chainId`, `collateral`, `feeRateBps`, `slippageBps`, `isYieldBearing`, `tradeVolume`, `liquidity`, `participantCount`, `status`, `startDate`, `endDate`. Join keys to Predict.fun: `conditionId` and `tokenId` (M: inferred from on-chain-style ids, not compared against Predict.fun responses because Predict.fun mainnet also needs a key).

---

## 3. Chains and collateral

- **Chain (H):** BNB Smart Chain. SDK `chainId` default `56`; CoinDesk and trendingtopics say BNB Smart Chain.
- **Collateral (H):** USDT only ("Orders are settled in USDT only", Binance FAQ). API amounts are USDT in wei with 18 decimals (BSC USDT format; SDK doc says `feeAmount` is "denominated in wei (18 decimals)").
- **Funding (H):** `fundingSource` = `MPC` (balance in the prediction wallet, default) or `CEX` (Spot/Funding, auto-transfer); `accountType` SPOT/FUNDING is only a settlement reference. FAQ: by default orders draw on Spot/Funding balances; this can be switched to the Prediction Account. Transfer endpoints: `transfer/inbound`, `transfer/outbound`, `transfer/list`, `transfer/status`.
- **Gas (H/M):** CoinDesk: Binance covers blockchain gas costs (H). Binance FAQ text did not state it in the part I read (M that it is permanent).

---

## 4. Read API

**Exists: official-authenticated. There is no public unauthenticated read path on the Binance side.**

- **Docs (H):** `https://developers.binance.com/docs/w3w_prediction` (SDK README link, M); machine-readable index `https://developers.binance.com/en/docs/llms.txt` lists the endpoints; per-page markdown e.g. `https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/orderbook.md`, `.../integration-guide.md`, `.../change-log.md`. Endpoint parameter detail comes from the official SDK source.
- **Base URLs (H):** REST `https://api.binance.com`, prefix `/sapi/v1/w3w/wallet/prediction/`. WebSocket `wss://api.binance.com/sapi/wss`.
- **Market-data endpoints (H; all `isSigned: true` in SDK `market-data-api.ts`):**
  - `GET category/list`
  - `GET market/list` (category filters, sort by RECOMMENDED / VOLUME / PARTICIPANTS / CREATED_TIME / END_DATE, paging)
  - `GET market/search` (query, semantic top-K)
  - `GET market/detail` (`marketTopicId`; `markets[]`, `outcomes[]`, `timeline`, `variantData`)
  - `GET order-book` (`vendor` e.g. `predict_fun`, `marketId`, `tokenId`; returns `outcome`, `tokenId`, `timestamp`, `bids[]`, `asks[]` as `{price,size}` strings)
  - `GET order-book/last-trade-price` (`marketId`)
- **Trades / resolution (H):** no public trade tape on the Binance side; only user-scoped `order/history`, `position/settled-history`, `redeem/status`. Resolution state is in `status`, `markets[].tradingStatus` (only that field decides whether new orders may be attempted) and `outcomes[].winner`; per the 2026-10-08 change log there is no separate cancelled / invalid / refunded status, and a split payout is represented by more than one winner. WS topic `web3_prediction_pm_market_close` signals resolution (user-scoped stream).
- **Auth (H):** header `X-MBX-APIKEY`; HMAC-SHA256 signature over the alphabetically sorted query string plus `timestamp` / `recvWindow` (SDK also supports RSA/Ed25519 keys, M). The key is created by a human in Binance web Account > API Management with the **Prediction Trading** permission; the account also needs a Prediction Account and Secure Auto-Sign enabled (Binance API FAQ). Access is "limited to eligible users" by region. The API FAQ does not mention KYC or define eligibility (H: absence); the sibling note's "KYC'd" wording is not supported by that page.
- **Unauthenticated probe (H, 2026-10-19):** `GET https://api.binance.com/sapi/v1/w3w/wallet/prediction/{market/list|category/list|order-book}` -> `HTTP 400 {"code":-2014,"msg":"API-key format invalid."}`. The host is reachable from the research location (no HTTP 451). Fixture: `binance_sapi_prediction_unauth_probe_2026-10-19.txt`. No live response *shape* could be confirmed without a key; the schema fixture is from the SDK types.
- **Rate limits:** each endpoint is Request Weight(IP) = 1 (H, change log 2026-09-10, corrected from 200). The overall per-IP cap for this product: NOT FOUND (searched: change log, API FAQ, SDK, llms.txt). WS (H, orderbook doc): 5 messages/s per connection, PING every 30 s, connection lives 24 h.
- **WebSocket (H):** `web3_prediction_orderbook_{marketId}` topics, multiple topics joined with `|` in one connection. Each push is a full snapshot: `{msgType:"orderbook", marketId, updateTimestampMs, asks:[[price,size]...] ascending, bids descending}` with prices and sizes as JSON numbers (floating-point noise possible), typically <= 50 levels, ~1-3 msg/s per market (peak ~10/s), at-most-once, no ordering guarantee (use `updateTimestampMs`), delivery < 200 ms after the upstream event, `data` is a stringified JSON needing a second parse. Broadcast by topic. A signed connection (API key) is still required. 14 user-event topics prefixed `web3_prediction_pm_*` carry `pushId` for dedup; money amounts there are truncated to 2 decimals.
- **SDKs (H):** `@binance/w3w-prediction` (JS, in `binance/binance-connector-js` `clients/w3w-prediction`), Java and PHP connectors and `binance-cli` (per llms.txt/README, M for exact package names).
- **Better read path for the aggregator (M):** Predict.fun's own API. Its mainnet reads also need an `x-api-key`: my unauthenticated `GET https://api.predict.fun/v1/markets?first=1` returned `HTTP 401 {"success":false,"code":401,"error":"unauthorized"}` (H, 2026-10-19), but keys are self-service per `docs/research/09-venues-onchain-clob.md` (M). That avoids needing a Binance account at all. Belongs to the Predict.fun spec.

---

## 5. Trade path

- **Programmatic: yes, but only as a Binance-authenticated, server-signed flow (H, SDK `trade-api.ts` + llms.txt):**
  1. `POST trade/get-quote` (`walletAddress`, `tokenId`, side, `amountIn` wei, `orderType` MARKET|LIMIT, `slippageBps` 1-10000, `priceLimit` for LIMIT, `chainId` default `56`, `feeRateBps` default `200` range 1-10000, `fundingSource`) -> quote with `quoteId`, `amountOut`, `feeAmount`, `averagePrice`, price impact, `expireAt` (response fields from SDK docs; M for exact names). "A successful quote does not guarantee that an order is accepted or filled" (change log 2026-10-08).
  2. `POST trade/place-order-bundle` (`quoteId`, `walletAddress`, `walletId`, `timeInForce` FOK for MARKET / GTC for LIMIT, `accountType`, `orderType`, `slippageBps`, `fundingSource`).
  3. `POST trade/batch-cancel`, `GET order/list`, `GET order/history`.
  4. `POST batch-redeem` / `GET redeem/status` for claims; position / PnL / wallet / quota endpoints.
  5. Market-maker-only (authorised MMs, added 2026-08-14): 8 OTC block-trade endpoints and `deposit/apply` / `withdraw/apply`.
- **Signing scheme (H/M):** the caller signs only the Binance REST request (API key + HMAC/RSA/Ed25519). The on-chain order signature is produced on Binance's side by the Keyless wallet. Binance's Secure Auto-Sign FAQ (H) says keys live in a TEE that no one, including Binance, can access, but that page lists DEX trades, Quick Trade, transfers, DCA etc. and does not list prediction markets or API trading, while the API FAQ says SAS must be enabled for the API (H). So the exact custody story for prediction orders is partly inferred (M). No order-level EIP-712 data is exposed to API users.
- **Gotchas (H, change log):** bracket-encoded `cancelInfoList[i]` params break signatures in common HTTP libraries (-1022); a well-formed but foreign `walletAddress` returns generic `-3026`; `transfer/inbound` without SAS returns `-31003`; minimum order size is set by the server and not documented as a fixed number.

### PayBox reachability: **no** (for the Binance route)

- The Binance route needs a Binance UID, a human-created API key with Prediction Trading permission, a Prediction Account and SAS; signing happens on Binance's side. A PayBox wallet can neither sign these orders nor propose transactions for them. Whether an outside wallet can deposit USDT directly to the prediction wallet's BSC address: NOT FOUND (searched: Binance FAQs, dev docs).
- The underlying liquidity is a different story: per the project's PayBox notes (`docs/research/06-paybox-platform.md`, H in that note) the PayBox EVM wallet exposes `typedData` (EIP-712) and `message` signing and BNB Smart Chain (56) is in its chain catalog, so a PayBox wallet can in principle sign Predict.fun orders directly. That is the Predict.fun adapter's job, with its own key and geo gates (section 8). I did not call any PayBox tool.

---

## 6. Fees

- **Binance (H):** fees "reflect vendor fees"; "not directly collected by Binance" (FAQ). API has no separate access fee; trading fees "match other access channels" (API FAQ). Gas is sponsored on this channel (CoinDesk, H). The SDK default `feeRateBps = 200` (2%) is a cap-style parameter, not proof of what is charged.
- **Predict.fun underlying (H, docs.predict.fun "Predict Fees and Limits", undated):** makers pay no fee; takers pay Raw Fee = Base Fee x min(Price, 1 - Price) x Shares (base fee 2% in the page's example); a 10% discount multiplies the fee by 0.9; minimum order 1 USDT; no other limits listed. The page's headline range "0.018% to 2%" is loosely worded (the page's own fee table seems to assume 100 shares); treat the formula as authoritative.
- **Channel differences (H):** Predict.fun's referral FAQ: for trades made via the dApp in Binance Wallet, inviters earn 10% of invitees' eligible fees and invitees get a 5% rebate, paid in USDT; trades on the website or other frontends do not qualify. Predict Points are also earned through the Binance API (API FAQ).
- **Net:** effective taker cost on the Binance route is Predict.fun's taker fee (possibly less a small rebate); no extra Binance fee found. Spot-to-prediction transfers are free per the FAQ ("available instantly"); fee on transfers NOT FOUND.

---

## 7. Resolution mechanism and dispute risk

- **Binance FAQ (H):** "Markets resolve through a decentralized on-chain oracle. A resolution proposal is submitted with a bond. If unchallenged, the market resolves automatically. If disputed, it escalates through arbitration."
- **Predict.fun resolution page (H, undated, says "As of March 2026, all new markets on Predict are served by" UMA's Optimistic Oracle):** bonded proposal by anyone after expiry, challenge window (length not stated), counter-bond starts a second round, then structured debate and UMA token-holder vote. Typical: ~2 hours undisputed, hours to a day if disputed, up to a week for a UMA vote. Invalid / 50-50 handling is not described on that page.
- **Predict.fun Technical Overview (H, undated):** the UMA-compatible oracle has whitelisted proposers, valid prices 0 / 0.5 / 1, and "no bonding or dispute mechanism". This contradicts the resolution page and the Binance FAQ; probably older text, unresolved. A 0.5 (50/50) outcome exists in the contract design, whereas Binance's API exposes no cancelled/refunded status (only `winner` flags, possibly several), so a 50/50 would surface as a split winner flag (M).
- **Up/down price markets (M):** per the sibling note, resolved by Chainlink Data Streams with an Up/Down/Flat outcome; I did not re-read that page this session.
- **Arbitrage risk (M):** a Polymarket vs Predict.fun pair on the "same" question can resolve differently (different oracle instance, different rules text, a Flat or 50/50 branch). Treat rule equality as unverified per market; resolution risk sits on Predict.fun, not Binance.

---

## 8. Geo, ToS and automation

- **Binance (H):** "may not be available in your country or region"; no country list in the FAQ or API FAQ. Binance ADGM entities do not provide it; services come from Binance Barbados Limited, "not supervised" by the FSRA or another regulator (FAQ, CoinDesk). The API is for "eligible users" by region. Binance explicitly offers the REST/WS API, SDKs, CLI and an Agentic Wallet "Prediction Market" use case (includes handing the loop to an automated strategy, H), so programmatic trading by an eligible user is clearly intended. Binance terms of use specific to prediction API/bot trading: NOT FOUND (searched: API FAQ, Binance FAQ).
- **Predict.fun ToS (H, "Last Updated: November 18, 2025", about 11 months old, possibly stale):** restricted: United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Taiwan (Section 4a), plus Australia and Belgium in Section 1, plus comprehensive-sanctions jurisdictions; VPN circumvention prohibited; wallets may be put in close-only mode. Section 4b bans robots/crawlers/data-mining tools that scrape the Site; no explicit bot-trading or API clause. Binance is not named in the ToS. Short quote: wash trading, spoofing, front-running and manipulation are prohibited.
- **Implication:** a user needs to be eligible under both Binance's unpublished region list and Predict.fun's ToS. For a US/UK/EU-based operator this is a hard gate regardless of technical reach.

---

## 9. Liquidity (with dates)

- **Predict.fun (the pool Binance routes into), DefiLlama, fetched 2026-10-19 (H):** dexs summary 24h volume $14,446,135 (-11.0% d/d), 7d $103,425,526, 30d $350,179,966, all-time $3,480,312,673; protocols TVL $10,159,253 (latest point 2026-10-19 01:18 UTC; chains Blast + BSC). Fixture: `defillama_predict_fun_and_binance_wallet_2026-10-19.json`.
- **Binance-attributed volume:** NOT FOUND (searched: DefiLlama dexs overview and protocols - "Binance Wallet" is a `Wallets` row with null TVL and no volume row; CoinDesk; trendingtopics; Binance FAQs; Binance dev docs). Binance has not published a share of Predict.fun's flow.
- **Press (M, self-reported, stale):** a search summary (April 2026) quoted Predict.fun at over $1.8B cumulative volume and 4M orders; DefiLlama's all-time $3.48B on 2026-10-19 supersedes it.
- **Integrity caveat (M, `docs/research/09-venues-onchain-clob.md`):** Predict.fun runs a points programme, so headline volume is an upper bound; size any arb on displayed depth. Binance's order-book channel shows <= ~50 levels per market (H, doc).

---

## 10. Event categories that overlap other venues

- **On the Binance surface (H):** the Binance Agentic Wallet doc names categories "crypto, sports, politics, economy, and culture" and showcases BTC 5-minute and 15-minute Up/Down markets. The sibling note lists Predict.fun programmes (FIFA World Cup 2026, esports, stock up/down) from its news page; not re-read here (M).
- **Overlap with other venues (M, category level only, not matched market by market):** crypto price up/down (Polymarket, Limitless, Opinion, Hyperliquid), politics, Fed/macro and sports lines (Polymarket, Kalshi). The project's note 09 says Predict.fun's market schema carries `polymarketConditionIds[]` and `kalshiMarketTicker` (M, from that note; behind an API key).
- **Arbitrage implication:** the Binance surface adds no new prices. Use Predict.fun once; mark Binance as a route/fee variant.

---

## 11. Shared liquidity

**It shares its order book with Predict.fun (H for the mechanism, M for "100%").** Evidence: Binance FAQ names Predict.fun as primary provider; `order-book` takes `vendor=predict_fun`; the WS doc says quotes are pulled "from upstream market makers (Predict.fun)" and the channel pauses if upstream disconnects; the batch-cancel docs say the server auto-fills `vendor` as `predict_fun`. Not found: an explicit sentence that Binance users trade in the same book as the Predict.fun site (Predict.fun's referral FAQ explicitly does not say). Residual uncertainty: Binance may list only a curated subset of Predict.fun markets, and the Binance dApp and in-app Prediction Account may be different addresses on the same book. Either way it is not an independent leg. The same class of duplicate: other wallets that surface Predict.fun (e.g. Trust Wallet, M from sibling note).

---

## 12. Adapter recommendation

- **adapter_priority: skip** (duplicate liquidity; Binance read API needs a Binance account + API key; trading is server-signed and unreachable from PayBox).
- **Do now:** registry record only:
  `{ id: "binance_prediction", kind: "frontend", routes_to: "predict_fun", pool_id: "predict_fun", chain: "bsc:56", collateral: "USDT", fee_stack: "predict.fun taker fee only (maker 0); Binance adds none found; gas sponsored", geo: "Binance region list unpublished + Predict.fun ToS list", api: "official, authenticated (Binance API key)" }`
- **Optional later (P2, only if an operator already holds an eligible Binance prediction account):** an execution route behind the Predict.fun pool using `get-quote` -> `place-order-bundle`; the quote's fee and price impact can pre-validate fills. Not needed for scanning.
- **Signal value:** none unique; Binance-specific flow share is unpublished.

## 13. Open questions

1. Explicit confirmation that Binance flow lands in the same Predict.fun CLOB (would need a funded test order and a comparison of Binance's `vendorOrderId`-style ids with Predict.fun's order matches; out of scope for read-only research).
2. Which Predict.fun markets Binance lists (curated subset?) and Binance's country exclusion list.
3. Whether the Binance Wallet dApp and the in-app Prediction Account share an address.
4. Overall per-IP rate cap for the prediction SAPI group.
5. Predict.fun resolution-doc conflict (bonded UMA vs whitelisted proposers) and how 50/50 outcomes appear in Binance's API.
6. Whether a non-Binance wallet can deposit directly to the prediction wallet address.

## 14. Not found

- Public/unauthenticated Binance prediction read endpoint (searched: SDK `isSigned` flags, llms.txt, three live GETs).
- Live response shapes from Binance (no key); only SDK schema and documented WS example captured.
- Binance-attributed prediction volume or TVL (searched: DefiLlama dexs + protocols, CoinDesk, trendingtopics, Binance FAQs, dev docs).
- Binance restricted-country list for Prediction Markets (searched: Binance Wallet Prediction Markets FAQ, Prediction Markets API FAQ, CoinDesk).
- Binance terms of use specific to API/bot trading of prediction markets.
- Overall REST rate cap for this product.
- Binance-published statement that quotes are Predict.fun's live CLOB beyond the vendor field and the WS pause behaviour.

---

## Sources

H (primary, read this session):
- CoinDesk, 2026-04-09: https://www.coindesk.com/markets/2026/04/09/binance-enters-prediction-markets-arena-via-predict-fun-integration (read via WebFetch summary)
- trendingtopics.eu (dated 10 April 2026): https://www.trendingtopics.eu/binance-enters-prediction-markets-with-predict-fun-integration-on-bnb-chain/ (read via WebFetch summary; it reproduces Binance's own disclaimers)
- Binance Support FAQ, Binance Wallet Prediction Markets (published 2026-03-30, updated 2026-07-07): https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec
- Binance Support FAQ, Prediction Markets API: https://www.binance.com/en/support/faq/detail/5d6f65bc34ff40799b17d84e3630d1f0
- Binance Support FAQ, Secure Auto Sign (published 2025-10-14, updated 2026-07-13): https://www.binance.com/en/support/faq/detail/90cb7110cf164a9e822edfb9fe6b5108
- Binance dev docs: https://developers.binance.com/en/docs/llms.txt ; .../products/w3w-prediction/change-log.md ; .../products/w3w-prediction/websocket-streams/orderbook.md ; .../websocket-streams/integration-guide.md ; .../products/agentic-wallet/use-cases/trading/prediction-market.md
- Official connector source: https://github.com/binance/binance-connector-js/tree/master/clients/w3w-prediction (files `src/rest-api/modules/market-data-api.ts`, `trade-api.ts`, and `src/rest-api/types/*`)
- Live unauthenticated probes 2026-10-19: `https://api.binance.com/sapi/v1/w3w/wallet/prediction/*` (HTTP 400, -2014) and `https://api.predict.fun/v1/markets?first=1` (HTTP 401)
- Predict.fun docs: https://docs.predict.fun/llms.txt ; https://docs.predict.fun/the-basics/predict-fees-and-limits ; https://docs.predict.fun/binance-wallet-referrals/binance-wallet-referral-faqs ; https://docs.predict.fun/knowledge-base/how-resolution-works-on-predict ; https://docs.predict.fun/terms-of-service ; https://docs.predict.fun/developers/technical-overview (the last five via WebFetch summary)
- Predict.fun developer docs index: https://dev.predict.fun/llms.txt
- DefiLlama: https://api.llama.fi/summary/dexs/predict-fun ; https://api.llama.fi/protocol/predict-fun ; https://api.llama.fi/overview/dexs ; https://api.llama.fi/protocols

M (secondary or project notes):
- WebSearch result list (one extended query, 2026-10-19): The Block 2026-03-31 beta story, Cryptobriefing, TradingView/Finance Magnates, Dyutam and others for the 2026-04-09 launch date and the "$1.8B cumulative" figure; not individually opened.
- Project notes: `docs/research/09-venues-onchain-clob.md` (Predict.fun key requirement, points caveat, cross-venue id fields) and `docs/research/06-paybox-platform.md` (PayBox signing intents, chain catalog).
- Sibling spec for the same product: `docs/research/venues/binance-wallet-prediction-markets-via-predict-fun.md` (used only as a lead; items not re-verified are tagged M above).

Not fetched: Binance X announcement; Binance "Predict Points" FAQ; Predict.fun Chainlink price-market doc; Predict.fun news pages.

Fixtures (docs/research/fixtures/binance-predictions-predict-fun-integration/):
- `binance_sapi_prediction_unauth_probe_2026-10-19.txt` (live -2014 responses)
- `binance_dev_docs_llms_txt_prediction_endpoints_2026-10-19.txt` (official endpoint and stream list excerpt)
- `binance_sdk_response_type_fields_2026-10-19.json` (SDK schema plus the documented WS example payload; not a live response)
- `binance_w3w_prediction_change_log_2026-10-19.md` (copy of the official change log)
- `defillama_predict_fun_and_binance_wallet_2026-10-19.json`

Privacy and injection check: all scripted requests used only the User-Agent `insurance-markets-research/0.1`; the fixture script was grepped for `@` and personal names before running (only local filesystem paths matched, none sent outbound) and the fixtures were scanned afterwards with no hits. None of the fetched pages contained instructions aimed at AI agents beyond ordinary product copy (Binance's llms.txt index and Agentic Wallet example prompts are documentation, not directives); nothing was followed.
