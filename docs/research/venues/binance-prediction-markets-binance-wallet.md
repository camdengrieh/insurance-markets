# Binance prediction markets (Binance Wallet / Binance app "Prediction") - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: official docs pages and raw markdown (developers.binance.com, binance.com support FAQ, docs.predict.fun), public GitHub source read with `gh api` (binance-connector-js, ccxt), npm registry metadata, unauthenticated GETs to `api.binance.com` (documented SAPI host), `api.llama.fi` and `api.predict.fun`. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool, WebSocket session or browser automation. No third-party code cloned, installed or run. Scripted requests used the User-Agent `insurance-markets-research/0.1` only.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred, or read through the summarising fetch tool; **L** = weak or stale (older than 6 months is flagged).
Fixtures: `docs/research/fixtures/binance-prediction-markets-binance-wallet/` (5 files, largest 7.5 KB). Third-party text is untrusted data; nothing in it was followed.
Constraint: the shared web-search budget was exhausted before I could search; every claim below comes from direct page/API/GitHub reads, plus one search result list I got before the budget ran out (used only for the 9 Apr 2026 launch date and the Finance Magnates snippet).
Siblings: `binance-web3-wallet-prediction-trading.md`, `binance-wallet-prediction-markets-via-predict-fun.md` and `binance-predictions-predict-fun-integration.md` cover the same product. I did not rely on them; my conclusions agree with theirs.

## 0. Verdict

- **adapter_priority: skip** (duplicate liquidity; keep only a registry alias `binance_wallet_prediction -> routes_to: predict_fun`).
- **Live: yes.** Official Prediction Trading API changelog has entries to 2026-10-08, `@binance/w3w-prediction` 2.2.0 was published 2026-10-15, the Binance support FAQ was updated 2026-07-07, and the production API routes answer (H, section 1).
- **Not a venue, a front end.** Binance "aggregates prediction markets from third-party providers. The current primary provider is Predict (Predict.Fun)... on BNB Smart Chain"; it "does not directly create or manage market events, nor does Binance act as the counterparty" (H, Binance FAQ). Every API call hard-codes `vendor=predict_fun`, order books are "pulled from upstream market makers (Predict.fun)" and the stream "pauses" if Predict.fun disconnects (H, WS docs). Quotes, outcome tokens, fees and resolution are all Predict.fun's. Counting Binance next to Predict.fun double-counts one pool.
- **Official API exists but is authenticated end to end.** 36 REST endpoints + 15 stream events = the "51" in the lead (H, counted from `llms.txt`, fixture). Even market data returns `-2014 API-key format invalid` without a key (H, fixture). Access needs a Binance account, a Prediction Account, Secure Auto-Sign and an API key with the "Prediction Trading" permission, and is "available only to eligible users" (H).
- **Not reachable from a PayBox EVM wallet** through this path: the caller only signs the Binance REST request; the on-chain order is signed server-side by the user's Binance-held Keyless (MPC) wallet. The same book is reachable directly through Predict.fun's own EIP-712 order flow (that is the Predict.fun adapter's job).
- Cross-venue arbitrage value is zero beyond Predict.fun. The only things this venue adds are (a) a second, equally key-gated read path to the same books and (b) geo/ToS metadata for users who trade via Binance.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| The Block, 2026-03-31: Binance is beta-testing in-app on-chain prediction markets via a third-party integration, partner Predict.fun on BNB Smart Chain, separate prediction account, no jurisdiction list. Spokesperson: "We are beta testing in-app access to on-chain prediction markets through a third-party integration." (older than 6 months; superseded below) | H (via fetch tool) | https://www.theblock.co/post/395817/binance-tests-prediction-market-feature |
| Binance support FAQ "Frequently Asked Questions on Binance Wallet Prediction Markets": publishDate 2026-03-30 14:22 UTC, lastUpdateTime 2026-07-07 10:34 UTC. App needs iOS 3.11.1+ / Android 3.11.2+; "[Prediction] at the top of the [Markets] page in [Exchange] view". | H | https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec (text extract: fixture `binance_faq_prediction_markets_text_2026-10-19.txt`) |
| Search result listing (before budget ran out) said the in-app rollout happened 2026-04-09, with gas "fully sponsored by Binance" and "Users find it under the Markets tab". Launch date and gas claim are single-snippet. | M | https://www.financemagnates.com/forex/retail-traders-can-now-access-prediction-markets-through-binance-wallet/ , https://cryptobriefing.com/binance-prediction-markets-integration/ (titles seen, pages not read) |
| API change log: initial release 2026-05-25; entries 2026-06-16, 2026-08-14 (OTC block trades, MM deposit/withdraw), 2026-09-10, 2026-10-08. | H | https://developers.binance.com/en/docs/products/w3w-prediction/change-log.md (fixture `binance_w3w_prediction_change-log_2026-10-19.md`) |
| npm `@binance/w3w-prediction`: latest 2.2.0, published 2026-10-15T15:53Z; 2.1.5 on 2026-10-09; MIT; repo binance/binance-connector-js. | H | https://registry.npmjs.org/@binance/w3w-prediction |
| Production routes answer: `GET api.binance.com/sapi/v1/w3w/wallet/prediction/{category/list,market/list,order-book/last-trade-price}` -> HTTP 400 `{"code":-2014,"msg":"API-key format invalid."}`; an invented sibling route -> HTTP 404. So the routes are deployed. | H | fixture `sapi_unauth_probes_2026-10-19.json` |
| Product page `https://www.binance.com/en/markets/prediction`: WebFetch returned HTTP 404; curl returned HTTP 202 with an empty body (bot challenge). Content could not be read. | H (negative) | direct requests 2026-10-19 |
| Underlying venue is active: DefiLlama shows Predict.fun 24h volume $14.26M on 2026-10-19 (section 10). | M | https://api.llama.fi/summary/dexs/predict-fun |

No sign of shutdown or pause. "Southeast Asia (Indonesia/Malaysia) prediction products, 1 Apr 2026" from the lead: NOT FOUND (searched: could not search; not on any page I read). Treat as unverified.

## 2. Market model

- **Kind:** exchange-app front end to Predict.fun's hybrid CLOB. Off-chain central limit order book for matching, on-chain settlement through a CTF exchange (Predict.fun "Technical Overview": "an off-chain Central Limit Order Book (CLOB) for order matching... on-chain smart contracts handle the execution, settlement, and resolution"). Not AMM, not parimutuel. (H, https://docs.predict.fun/developers/technical-overview.md)
- **Binary and categorical.** Binance FAQ: each outcome (YES and NO) is a share priced $0.01 to $0.99, winner pays $1. API field `topicType` (example in ccxt comments: `FLAT`), `chartType` (example `CRYPTO_UP_DOWN`), and `outcomes[]` per market; WS docs mention multi-outcome names ("Trump", "Biden"). Predict.fun builds multi-outcome (winner-takes-all) markets as sets of binary YES/NO markets linked by a NegRisk adapter. (H FAQ + WS doc; H Predict tech overview; ccxt example M)
- **Hierarchy (H, `market/list`, `market/detail` docs and connector types):** `marketTopicId` (event) -> `markets[]` (`marketId` Binance internal id, `externalId`, `conditionId`, `status`, `tradingStatus`, `decimalPrecision`, `tradeVolume`, `liquidity`) -> `outcomes[]` (`name`, `price`, `chance`, `index`, `tokenId`, `winner`). Topic fields include `vendor`, `chainId`, `slug`, `title`, `question`, `description`, `collateral`, `feeRateBps`, `slippageBps`, `isYieldBearing`, `tradeVolume`, `liquidity`, `participantCount`, `publishedAt`, `startDate`, `endDate`, `status`.
- **Tokenisation:** each outcome has a `tokenId` = the ERC-1155 conditional-token position id (Predict.fun "converts collateral into conditional tokens (ERC1155)"). Orders are EIP-712 typed data in Predict.fun's exchange. (H Predict tech overview; the mapping `tokenId` = ERC-1155 id is M, inferred from the two sources)
- **Join keys for dedupe against the Predict.fun adapter:** `conditionId` and `externalId` (M: not confirmed they equal Predict.fun's ids without an authenticated response; verify on first authenticated call).
- **Status semantics (H, market/detail doc 2026-10-08):** topic `status` in `REGISTERED | RESOLVED | PAUSED | CLOSED`; only `markets[].tradingStatus == OPEN` allows new orders (others: `MATCHING_NOT_ENABLED`, `CANCEL_ONLY`, `CLOSED`); a topic can hold several markets; "There is no separate cancelled, invalid or refunded status"; a split payout (several `winner: true`, `price` 0.5 each) is possible. Price tick = 10^-`decimalPrecision`.
- **Order types (H):** `MARKET` (must use `FOK`) and `LIMIT` (must use `GTC`, `priceLimit` required). No IOC, post-only or GTD. Order flow is quote-then-place.

## 3. Chains and collateral

- **Chain:** BNB Smart Chain (chainId 56; quote default `chainId` "56 (BSC)"). (H)
- **Collateral:** USDT only on the Binance path: "Only USDT can be used for orders" (H, FAQ). Amounts in the API are wei with 18 decimals (`1000000000000000000` = 1 USDT; H, get-quote doc). Predict.fun itself says users can deposit USDT or USDC (M, docs page title), and DefiLlama counts USDT on BSC (+ USDB on Blast). Predict.fun has yield-bearing markets (collateral deposited into Venus vTokens) and plain ones; `isYieldBearing` is exposed per topic. (H tech overview)
- **Accounts:** a Prediction Account is "separate from your Spot/Funding Accounts and Binance Wallet", "powered by Binance Wallet Keyless technology", created at first order; it holds an MPC wallet address (`wallet/list` returns `walletAddress`, `walletId`). Orders can be funded from Spot/Funding balance (`fundingSource=CEX`) or from the Prediction Account balance (`fundingSource=MPC`, default); `accountType` SPOT/FUNDING is "settlement/reference" only. Transfers between Spot/Funding and Prediction Account are "instant" (`transfer/inbound|outbound`). (H, FAQ + trade-api doc comments)
- Agentic Wallet (Binance's AI-agent wallet) trades the same markets with "BSC USDT balance"; its supported chains are BSC, Ethereum, Base, Solana, but prediction bets are BSC USDT. (H, https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/prediction-market.md and .../welcome.md)

## 4. Read API

- **Existence:** `official-authenticated`. Nothing is readable without a Binance API key + signature (H, probes returned -2014). A public (unauthenticated) market feed: NOT FOUND (searched: developers.binance.com `llms.txt`, change log, connector SDK, ccxt module header: "every endpoint, including market data, requires apiKey/secret credentials").
- **Docs:** https://developers.binance.com/en/docs/catalog/web3-wallet-prediction-trading (SPA; page text did not render through the fetch tool). Machine-readable index: https://developers.binance.com/en/docs/llms.txt (H, section "Prediction Trading REST API (1.0.0)" and "Prediction Trading Streams (1.0.0)"). Typed client with the OpenAPI-derived descriptions: https://github.com/binance/binance-connector-js/tree/master/clients/w3w-prediction (H, read via `gh api`).
- **Base URLs (H):** REST `https://api.binance.com/sapi/v1/w3w/wallet/prediction/...`; WebSocket `wss://api.binance.com/sapi/wss?random=..&topic=..&recvWindow=..&timestamp=..&signature=..` (Binance SApi WSS, "Binance CMS General Info" spec).
- **Counts (H, fixture `binance_docs_llms_txt_prediction_extract_2026-10-19.txt`):** 36 REST endpoints + 15 stream events (14 user events + per-market order book) = 51. Of the 36 REST, 10 are "restricted to authorized market makers" (8 `otc/blocktrade/*`, `deposit/apply`, `withdraw/apply`; H change log 2026-08-14). The 2026-09-10 change log entry says "All 28 Prediction Trading endpoints" (it names six groups and omits the 8 OTC endpoints; 28 + 8 = the 36 listed today), so the "28" in older notes is not a conflicting count.
- **Market-data endpoints (all GET, signed, `Weight(IP): 1` per docs; H):**
  - `category/list` (L1/L2 categories).
  - `market/list?l1Category&l2Category&sortBy=RECOMMENDED|VOLUME|PARTICIPANTS|CREATED_TIME|END_DATE&orderBy&offset&limit` (limit default 20, 1-100; returns `marketTopics[]`, `total`, `offset`, `limit`, `hasMore` per ccxt-commented sample, M).
  - `market/search?query&topK` (topK default 20, 1-50).
  - `market/detail?marketTopicId` (full topic incl. variant data and timeline).
  - `order-book?vendor=predict_fun&marketId&tokenId` -> `{outcome, tokenId, timestamp, bids:[{price,size}], asks:[{price,size}]}` (shape from ccxt source comment, M; the SDK type confirms the field names `outcome, tokenId, timestamp, bids, asks`, H). One call per outcome token.
  - `order-book/last-trade-price?marketId`.
- **Account endpoints (signed, need "Prediction Trading" permission + SAS; H):** `wallet/list`, `pnl/portfolio`, `quota/limit/status`, `balance/payment-options`, `order/list`, `order/history`, `position/list|filter|token|settled-history`, `pnl/query`, `redeem/status`, `transfer/list|status`.
- **WebSocket streams (H, https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/orderbook.md):**
  - Topic `web3_prediction_orderbook_{marketId}`, multiple topics joined with `|`. Broadcast by topic (not per user), at-most-once, no strict ordering (use `updateTimestampMs`), nothing cached offline (REST snapshot after reconnect), latency "< 200 ms" after the upstream event, message < 4 KB, depth "generally <= 50" levels.
  - Payload (stringified JSON inside `data`): `{"msgType":"orderbook","marketId":8859231,"updateTimestampMs":..., "asks":[[0.32,500],...], "bids":[[0.31,800],...]}`; asks ascending, bids descending; prices/sizes are JSON numbers and may carry float noise (e.g. `6865.999999999999`). Note this differs from REST (`{price,size}` objects).
  - Update rate: ~1-3 msgs/s per active market on average, peak ~10/s. Connection limits: ping every 30 s, 5 msgs/s per connection, a connection lives 24 h. Auth: header `X-MBX-APIKEY`, HMAC-SHA256 over the alphabetically sorted query string; the same connection also carries the 14 per-user events (`web3_prediction_pm_market_buy_success`, `..._limit_order_filled`, `..._claim_success`, `..._market_close`, ...).
  - Only active markets are pushed; resolved/closed markets are not.
- **Auth and limits (H):** SAPI signed requests (HMAC-SHA256; the SDK also supports RSA and Ed25519 key pairs), header `X-MBX-APIKEY`, `timestamp`, `recvWindow`, `signature`. REST weight is 1 per endpoint since the 2026-09-10 correction (earlier docs said 200; the ccxt module still encodes 200 against a 12000/min SAPI IP budget, so its throttling is 200x too conservative, M). The overall SAPI IP budget is not restated in the prediction docs: NOT FOUND (searched: change log, llms.txt, connector README).
- **Sample responses:** authenticated shapes could not be confirmed live (no key, by design). Only the unauthenticated error shape is saved (fixture). Treat all response field lists above as documentation-derived, not live-verified.
- **Resolution data:** `outcomes[].winner` after resolution, `status=RESOLVED`, `position/settled-history`, and a user-level `pm_market_close` push (no amount/outcome in the push; REST required). (H)

## 5. Trade path

- **Programmatic placement exists, but only through Binance.** Flow (H, trade-api docs): `POST trade/get-quote` (params `walletAddress, tokenId, side BUY|SELL, amountIn (wei), orderType MARKET|LIMIT, slippageBps 1-10000, priceLimit, chainId, feeRateBps (default 200), fundingSource MPC|CEX, fundTransferAmount`) returns `quoteId, averagePrice, lastPrice, priceImpact, feeAmount (wei string), feeRateBps, feeDiscountBps, minReceive, expireAt` -> `POST trade/place-order-bundle` (`walletAddress, walletId, quoteId, timeInForce, accountType SPOT|FUNDING, orderType, slippageBps, priceLimit, fundingSource`) -> `POST trade/batch-cancel` (`cancelInfoList[i].orderId`; bracket-encoding pitfall: standard HTTP libraries percent-encode `[`/`]` and produce `-1022`, workaround is hand-built bodies). BUY amount = USDT spent, SELL amount = shares.
- **Signing scheme:** the client signs only the Binance REST request (SAPI HMAC / RSA / Ed25519 key). The on-chain Predict.fun order is created and signed by Binance's MPC Keyless wallet once the user has enabled "Secure Auto-Signing (SAS)"; `place-order-bundle`, `batch-cancel` and `transfer/inbound` "require SAS authorization" (`-31003` otherwise). No endpoint accepts a user-signed order or returns a transaction to sign. (H)
- **Minimums:** server-set, can change; BUY checked by `amountIn`, SELL by share quantity; a successful quote does not guarantee acceptance or fill (`-9000 Your order amount is too small`). Predict.fun's own minimum is 1 USDT. (H)
- **Setup prerequisites (H, FAQ 5d6f65bc34ff40799b17d84e3630d1f0, published 2026-06-08):** (1) create a Prediction Account in the Binance App; (2) enable SAS in Assets > Prediction > Settings; (3) on the website, API Management, create a key and enable "Prediction Trading". All need a logged-in, verified-eligible Binance user: not something this project can or should do.
- **Agent path from Binance itself:** "Binance Agentic Wallet" skill (MPC keyless, QR sign-in, per-day limits) offers natural-language prediction trading (H, docs above). It is Binance-controlled custody, not PayBox.

## 6. PayBox reachability

- **paybox_reachable: no** for the Binance path. A PayBox EVM wallet holds its own keys; this path never asks for a user-wallet signature. It needs a Binance login, Binance-held MPC wallet and a Binance API key.
- Funding the Prediction Account's BSC wallet address from an external wallet is not documented (NOT FOUND: the docs only describe Spot/Funding transfers; deposit-to-MPC from outside is plausible on-chain but untested and unsupported by the docs, M). Even if it worked it would not give PayBox the ability to place orders.
- The underlying book is reachable through the Predict.fun venue: BNB Chain, EOA or smart-wallet signing of EIP-712 orders, REST at `https://api.predict.fun/` (mainnet requires an API key from the developer console; my unauthenticated GET returned HTTP 401 `unauthorized`; testnet needs none; default 240 req/min; H, https://dev.predict.fun/ and probe). Any PayBox integration should target Predict.fun directly (BSC support in PayBox: not checked; PayBox tools were not called).

## 7. Fees

- **Binance charges nothing itself.** FAQ: "Fees are displayed in real time on the order confirmation screen to reflect the vendor fees... fees are not directly collected by Binance." API: "no additional access fees"; trading fees "match other access channels" (H, FAQ 5d6f65...).
- **Predict.fun taker/maker (H, https://docs.predict.fun/the-basics/predict-fees-and-limits.md):** makers pay no fee. Taker raw fee = base fee % x min(price, 1 - price) x shares; percentage fee = raw / (price x contracts); a 10% discount multiplies the fee by 0.9. Base fee in the page's example is 2% (the API default `feeRateBps = 200` and per-topic `feeRateBps: 200` in the sample agree, M). Page examples: at 0.50, 100 shares, fee $1.00 ($0.90 discounted); at 0.80, $0.40 ($0.36). Predict.fun's quoted range is 0.018% to 2% depending on price. Minimum order 1 USDT.
- `feeRateBps` in quotes (default 200, range 1-10000, caller-settable) is best read as the worst-case fee encoded in the order, with Predict.fun's fee module refunding down to the actual fee at match time ("FeeModuleV2... makers and takers pay only the actual fee determined at match time rather than worst-case fees encoded in orders"; M for the link between the two). Some fees are paid in shares (referral doc: "Some fees are paid in shares").
- Gas: sponsored by Binance per press (M, single snippet); not stated in the FAQ ("The page does not mention gas or network fees" - H negative). Predict.fun smart wallets also skip gas.
- Referral via the Predict.fun dApp inside Binance Wallet: inviter 10% of invitees' fees, invitee 5% rebate; only trades through the Wallet dApp qualify (H, https://docs.predict.fun/binance-wallet-referrals/binance-wallet-referral-faqs.md). Predict Points (PP) can be earned via API trading (H, FAQ 5d6f65...).
- For edge maths: round-trip cost at p=0.50 is up to 2% x 0.5 = 1% of notional per taker leg (before discount); near 0.95 it is about 0.1%. Use `min(p, 1-p)`.

## 8. Resolution mechanism and dispute risk

- **Resolver: Predict.fun, not Binance.** Binance FAQ: "All Predict.fun's markets are resolved through a decentralized on-chain oracle system... a resolution proposal is submitted with a bond. If unchallenged, the market resolves automatically. If disputed, it escalates through an arbitration process." (H)
- **Predict.fun docs (H, https://docs.predict.fun/knowledge-base/how-resolution-works-on-predict.md):** "As of March 2026, all new markets on Predict are served by UMA's Optimistic Oracle." Anyone proposes with a bond; short challenge window; first dispute = new proposal round, second dispute = UMA token-holder vote. Undisputed markets resolve in roughly two hours; disputes several hours to a day; a UMA vote up to a week. Bond size and liveness length: NOT FOUND on that page.
- **Contradiction to flag:** the protocol "Technical Overview" describes `UmaCompatibleOptimisticOracle` with "Whitelisted requestors... Whitelisted proposers... No bonding or dispute mechanism (simplified trust model)" and valid prices 0, 0.5, 1 (H, https://docs.predict.fun/developers/technical-overview.md; undated, possibly pre-March-2026). Until the on-chain adapter is checked, assume centralisation risk: market creation and proposals can be operator-gated.
- **Up/Down price rounds** (BTC, ETH, BNB and a list of US equities/ETFs): settle from Chainlink Data Streams v3 reports delivered on-chain; Up if end > start, Down if end < start, Flat if equal; a role-gated `emergencyCloseRounds` exists when the contract is paused (H, https://docs.predict.fun/developers/chainlink-price-markets.md). "Flat" is a distinct third resolution; model the 50/50 / split case (the API can return two winners at 0.5 each).
- **Edge cases:** no cancelled/invalid/refunded state in Binance's API; invalid/50-50 handling in Predict.fun's UMA flow is NOT FOUND on the resolution page. Binance can also act on events that "don't align with our values" (listing review), which could delist a market (H, FAQ).
- **Claiming:** resolved winners must be redeemed (`batch-redeem`, or [Claim] in the app); `pm_market_close` push only tells the user a market resolved. Treat unclaimed winnings as locked until redeemed. (H)

## 9. Geo, ToS, automation

- **Binance side (H, FAQ):** "Prediction Markets may not be available in your country or region." "Binance ADGM entities do not provide the Prediction Markets services." Binance Wallet is described as self-custody "not under the supervision of the Financial Services Regulatory Authority". No jurisdiction list on any page I read (The Block: "no jurisdiction list"). The API is "available only to eligible users", availability "depends on regional regulatory and compliance requirements" (H, FAQ 5d6f65...). KYC requirement for the API: not stated (the FAQ names none; the API FAQ lists none either).
- **Predict.fun ToS (H, https://docs.predict.fun/terms-of-service.md, "Last Updated: November 18, 2025", possibly stale):** trading is barred for persons in "the UNITED STATES OF AMERICA, UNITED KINGDOM, FRANCE, ONTARIO, SINGAPORE, POLAND, THAILAND, AUSTRALIA, BELGIUM, TAIWAN" or sanctioned territories; the body "Restricted Jurisdictions" paragraph omits Australia and Belgium (inconsistent list). VPN circumvention is prohibited; violators may have wallets put in "close-only mode". The ToS forbids "data mining tools, robots, crawlers, or similar data gathering and extraction tools" against the Site/Interface; the API with a key is a separate documented channel (M, my reading). Disputes: BVI arbitration.
- **Automation:** Binance explicitly offers the Prediction Trading API and an Agentic Wallet for AI agents (H), so automated trading by an eligible account is sanctioned. Rules on market makers: only the OTC block-trade and MM deposit/withdraw endpoints are "restricted to authorized market makers" (H). Binance's general API terms for this product: NOT FOUND (searched: FAQ pages, Wallet Terms of Use page returned only navigation text via the fetch tool).
- **Implication:** a read-only aggregator cannot read this API without a user's Binance key, and a third-party service holding users' Binance keys with trading permission is a custody-adjacent design to avoid. Do not build around this path.

## 10. Liquidity

- **Binance-attributed volume/OI/TVL: NOT FOUND** (searched: DefiLlama protocols list - only a "Binance Wallet" entry in category Wallets with no TVL; Binance support pages; developers docs). No public Binance-side metric exists, and there is no unauthenticated way to read topic `tradeVolume`/`liquidity` fields.
- **Underlying venue, Predict.fun (DefiLlama, fetched 2026-10-19; fixture `defillama_predict-fun_tvl_volume_2026-10-19.json`; M):** TVL $10.17M (BSC $10.13M, Blast $0.04M; methodology = USDB/USDT held in conditional-token and wrapped-collateral contracts). Volume ("dexs" dimension, methodology text empty so notional vs shares basis unconfirmed): 24h $14.26M (2026-10-19, may be a partial day), 7d $103.4M, 30d $350.2M, 1y $3.39B, all-time $3.49B; daily volume 2026-10-12..18 between $12.5M and $16.2M. Finance Magnates snippet quoted roughly $277M 30-day notional at launch time (L, snippet not read, date unknown). An all-time/1-year figure of $3.4B for a venue launched Dec 2025 should be treated with caution (M).
- Depth per market is not known without a key; the WS payload keeps up to about 50 levels. Binance's `participantCount` and `liquidity` fields exist per topic (H) but are authenticated.

## 11. Event coverage and overlap

- **Categories (H):** FAQ: sports, economics, world events, culture, crypto. Agentic Wallet doc: crypto, sports, politics, economy, culture. Recurring "BTC 5-minute / 15-minute / 1h Up or Down" rounds (Chainlink-resolved) are the headline automated-trading example; Predict.fun also lists ETH, BNB and equity/ETF up-down streams (SPY, QQQ, MSFT, NVDA, ...). Esports and World Cup 2026 campaigns appear in Predict.fun's docs index (H: llms.txt titles "The Predict International", "The Predict Cup").
- **Overlap where arbitrage exists:** crypto price (Polymarket, Kalshi, Limitless and Opinion also list BTC/ETH price and up/down rounds, with different oracles: Chainlink Data Streams here vs Pyth/Chainlink/Binance klines elsewhere, so resolution-source basis risk), sports (match winners, World Cup), politics and macro (Fed rate, CPI where listed). Specific overlapping events were not enumerated (market list needs a key).
- This overlap belongs to the **Predict.fun** adapter. Binance should not be a separate leg.

## 12. Shared liquidity

- **Fully shared with Predict.fun**: same books, same ERC-1155 outcome tokens, same oracle, same fee schedule. Binance's own docs call Predict.fun the "upstream market makers" for the order-book stream and fix `vendor` to `predict_fun` (H). Binance says it "will aggregate" other third-party providers (The Block, H via fetch; FAQ says "third-party providers", H), but only `predict_fun` is documented as a vendor today (examples in the API use `predict_fun`; no second vendor id found, M).
- Users of Binance and of Predict.fun's own site trade into one book. There is no independent Binance price, so there is never a Binance-vs-Predict.fun arbitrage.
- Revisit trigger: if Binance adds a second vendor (a `vendor` value other than `predict_fun` in `market/list`), or Binance-only market makers appear (the 2026-08-14 OTC block-trade endpoints are for "authorized market makers" but settle through the same vendor, M).

## 13. Adapter spec (what to build, if anything)

1. Registry entry only: `id: binance-wallet-prediction`, `kind: front-end/aggregator`, `routes_to: predict_fun`, `independent_liquidity: false`, `chain: bsc(56)`, `collateral: USDT`, `geo: [binance: unspecified list; predict.fun: US, UK, FR, Ontario, SG, PL, TH, AU, BE, TW + sanctioned]`, `read_api: authenticated (Binance key)`.
2. If a user supplies their own Binance API key (never store it in PayBox, never request it), a *private user-side signal* adapter could read `market/list`, `order-book` (per `tokenId`), WS `web3_prediction_orderbook_{marketId}` and map `conditionId`/`externalId` -> Predict.fun ids. Priority for this is below the Predict.fun direct adapter and is not recommended.
3. Normalisation notes: REST book is `{price,size}` strings/objects, WS book is `[price,size]` numbers with float noise; round before comparing. Use `markets[].tradingStatus == OPEN`, not topic `status`. Prices in `(0,1)`; tick from `decimalPrecision`. Amounts in 18-decimal wei strings.
4. Fee model for edge scans: taker only, `base% x min(p, 1-p)` with `base` = `feeRateBps/10000` (default 2%); makers 0. Add resolution-oracle basis risk (Chainlink Data Streams / UMA) when pairing with other venues.

## 14. Not found / open questions

- Public (keyless) market data: none found; confirm only if Binance later documents one.
- Real authenticated response shapes (field names above come from docs/SDK types; ccxt sample comments are secondary).
- Binance-attributed share of Predict.fun volume; any Binance-only liquidity.
- Jurisdiction list for Binance's Prediction product and for the API ("eligible users" undefined).
- Binance's API-specific terms on automation/market making/scraping.
- Predict.fun UMA bond size, liveness length, 50/50 handling; reconcile "Technical Overview" (no bond, whitelisted proposers) with the March-2026 UMA page.
- Whether an external wallet can fund the Prediction Account's BSC wallet directly.
- 1 Apr 2026 Southeast Asia (Indonesia/Malaysia) announcement: not verified (no search possible).
- Binance consumer page `https://www.binance.com/en/markets/prediction`: could not be read (404 via fetch tool, 202 empty via curl).

## 15. Suspicious / embedded instructions

- Binance Agentic Wallet docs instruct installing a skill with `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet` (an install command aimed at agent users, plus "Agent Native" `llms.txt` / `llms-full.txt` links). Not run. No other embedded instructions found. The DefiLlama protocol response contains a Predict.fun referral link with a ref code; not followed and not reproduced.

## 16. Sources

Primary (H):
- https://developers.binance.com/en/docs/llms.txt (prediction REST + stream index; counted 36 + 15)
- https://developers.binance.com/en/docs/products/w3w-prediction/change-log.md
- https://developers.binance.com/en/docs/products/w3w-prediction/websocket-streams/orderbook.md , .../integration-guide.md , .../wallet-events.md
- https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/prediction-market.md , https://developers.binance.com/en/docs/products/agentic-wallet/welcome.md
- https://github.com/binance/binance-connector-js/tree/master/clients/w3w-prediction (market-data-api.ts, trade-api.ts, README.md, response types, via `gh api`)
- https://registry.npmjs.org/@binance/w3w-prediction
- https://www.binance.com/en/support/faq/detail/cfdb4d8b27b545119e66f68c54ef04ec (FAQ; read through the fetch tool and the public CMS article JSON)
- https://www.binance.com/en/support/faq/detail/5d6f65bc34ff40799b17d84e3630d1f0 (API FAQ, 2026-06-08; read through the fetch tool, M for exact wording)
- https://docs.predict.fun/the-basics/predict-fees-and-limits.md , /knowledge-base/how-resolution-works-on-predict.md , /developers/technical-overview.md , /developers/chainlink-price-markets.md , /terms-of-service.md , /binance-wallet-referrals/binance-wallet-referral-faqs.md , /llms.txt ; https://dev.predict.fun/ (base URLs, key requirement, rate limit)
- Unauthenticated probes: `https://api.binance.com/sapi/v1/w3w/wallet/prediction/*` (-2014), `https://api.predict.fun/v1/markets?first=1` (401)
Secondary (M):
- https://www.theblock.co/post/395817/binance-tests-prediction-market-feature (2026-03-31, over 6 months old)
- https://api.llama.fi/protocol/predict-fun , https://api.llama.fi/summary/dexs/predict-fun?dataType=dailyVolume
- https://github.com/ccxt/ccxt/blob/master/ts/src/prediction/binance.ts (confirms "every endpoint, including market data, requires apiKey/secret", `vendor` default, sample shapes in comments; also lists Binance among 9 prediction exchanges: binance, hyperliquid, kalshi, limitless, myriad, opinion, polymarket, predictfun, sxbet - by file names under `cs/ccxt/exchanges/prediction/`)
Weak (L): Finance Magnates / Crypto Briefing / CoinMarketCap Academy titles and snippets from one search result list (launch 2026-04-09, gas sponsored, ~$277M 30-day volume): pages not read.

## 17. Fixtures saved (`docs/research/fixtures/binance-prediction-markets-binance-wallet/`)

- `sapi_unauth_probes_2026-10-19.json` - 3 unauthenticated GETs returning -2014 plus 1 invented route returning 404.
- `binance_docs_llms_txt_prediction_extract_2026-10-19.txt` - the 36 REST + 15 stream index lines (the "51").
- `binance_w3w_prediction_change-log_2026-10-19.md` - official change log, verbatim.
- `binance_faq_prediction_markets_text_2026-10-19.txt` - plain-text extract of the support FAQ.
- `defillama_predict-fun_tvl_volume_2026-10-19.json` - small extract of the underlying venue's TVL and volume.
