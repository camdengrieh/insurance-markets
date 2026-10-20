# Aster Predictions (asterdex.com/en/trade/prediction) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public docs pages, `gh api` file reads, unauthenticated GETs to the documented API host `papi.asterdex.com`, DefiLlama public API, Sourcify public API, web search. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool, WebSocket session or browser automation. No third-party code cloned, installed or run. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/aster-predictions/` (9 files, largest 11.7 KB). Third-party text is untrusted data; nothing in it was followed.

## 0. Verdict

- **Live and well documented, but economically dead.** A real, official, public, Binance-style REST + WebSocket API exists for market data and signed trading (H). The only live market today is one rolling product, `BTC_UP_DOWN_5M` (5-minute BTC up/down). All 73 FIFA World Cup events are `CLOSED` (H, `exchangeInfo` 2026-10-19). Volume has fallen about 97% since June (30d $37.8k vs $1.43M in the month of 2026-06): $1.43M in 2026-06, $0.86M in 07, $0.29M in 08, $75k in 09, $31k for 2026-10-01..10-17 (H, DefiLlama). The live order book holds only market-maker "tail" quotes (bids 0.0001-0.0008, asks 0.9992-0.9999) plus, at times, a single 10-share order at 0.18-0.82 (H, 5 snapshots 2026-10-19 00:31-00:37 UTC). There is no usable two-sided price, so there is no signal and nothing to arbitrage against.
- **adapter_priority: skip** (revisit triggers in section 12). The API is cheap to integrate (Binance-like, public reads, no key), so a thin "watch" probe that polls `exchangeInfo` for new LIVE events is fine, but a trading leg is not worth building now.
- Operator-run, centralized order book inside Aster's exchange stack (spot account, USDT). Not a smart-contract market: outcome "tokens" are ledger entries (H: `baseAssetAddress: null`). Resolution is by Aster's own index with an Aster-reserved final say (H, user agreement 5.6 and 9.2).
- Geo: US, UK, Germany, France, Japan, Singapore, Australia, Thailand and about 25 other countries are barred from prediction trading (H). ToS bans bots "without our express permission" (H); the official API is arguably that permission but it is not stated (M).

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `GET https://papi.asterdex.com/api/v3/time` returned `serverTime` 1792369875591 = 2026-10-19 00:31:15 UTC, HTTP 200 | H | fixture `time_2026-10-19.json` |
| `exchangeInfo` on 2026-10-19: 74 `predictionEvents`: 1 `LIVE` (EVENT1 `BTC_UP_DOWN_5M`), 73 `CLOSED` (EVENT2 "2026 World Cup Champion" plus 72 group-stage match events, all `reduceOnly:true`, `markets: []`). 602 symbols: 26 `TRADING`, 576 `SETTLED`. | H | fixture `exchangeInfo_trimmed_2026-10-19.json` (trimmed from 948,045 bytes) |
| Rounds keep settling: 288 settled 5-minute rounds from 2026-10-18 00:30 UTC to 2026-10-19 00:25 UTC, each with an `openPrice`, `endPrice`, `winAsset`, `settleTime` and `settleHash`. I checked the rule "end >= open => Y wins" against all 288: 0 violations, 0 ties, 140 up / 148 down, settle lag 2.2-3.8 s after window end. | H | `exchangeInfo` (same call) |
| Launch: announced on X 2026-06-15 ("Aster Predictions is live as a new market type alongside spot and perps"), first markets BTC 5-minute up/down and 2026 World Cup. DefiLlama volume starts 2026-06-03, so a soft launch preceded the announcement; EVENT1 `startTime` is 2026-05-27. | M (press, DefiLlama) / H (exchangeInfo dates) | https://bitcoinfoundation.org/news/prediction-markets/binance-backed-dex-aster-launches-prediction-markets/ ; https://thecoinformer.com/news/binance-linked-aster-takes-on-hyperliquid-with-prediction-markets |
| Docs page current: https://docs.asterdex.com/trading/prediction.md (read 2026-10-19); API docs repo last pushed 2026-09-23 (H, `gh api`), prediction API doc in `V3(Recommended)/EN/aster-finance-prediction-api.md`. | H | below |
| DefiLlama listing "Aster Predictions" (id 8052, category Prediction Market, chain "Off Chain", parent Aster, no TVL) with daily volume points to 2026-10-17. | H | https://api.llama.fi/protocol/aster-predictions |

Not stale: all primary sources are 2026. Nothing older than 6 months was relied on, except the "Product releases" docs page, which stops at September 2025 and says nothing about predictions (H); ignore it.

## 2. Market model

- **Kind:** central limit order book run by Aster; binary shares priced 0.0001..0.9999 USDT; winners pay 1 USDT, losers 0. Not AMM, not parimutuel. (H, docs prediction page; `PRICE_FILTER` min 0.0001 / max 0.9999 / tick 0.0001 in live `symbols[]`.)
- **Product types seen in the API** (`predictionType`):
  - `UP_DOWN`: price-direction rounds. Live: `BTC_UP_DOWN_5M`, `period "5M"`, oracle symbol `BTCUSDT`. Docs examples also show `USD1_UP_DOWN_5M` and `ETH_UP_DOWN_5M`, which are NOT in today's `exchangeInfo` (H). Each round is a separate market named `BTC_UP_DOWN_5M_<windowStartUnixSec>` with symbols `<market>_YUSDT` (Up) and `<market>_NUSDT` (Down) and assets `<market>_Y` / `<market>_N`.
  - `MULTIVARIATE`: multi-outcome events (World Cup winner, match results). Modelled as a set of binary YES/NO markets, one per outcome (e.g. `EVENT4_ALGERIA_WIN_YUSDT` / `_NUSDT`), with `split` and `merge` endpoints to convert USDT to/from a full set of outcome tokens, i.e. Polymarket neg-risk style. (H, API doc; all such events are closed now, so the live shape is unverified.)
  - `MARKETONLY_MULTIPREDICT`: "only for whiteList mm" (H, API doc). Not public.
- **Round timeline** (H, live `liveRound`): `windowStartTime` on 300 s UTC boundaries; `tradingStartTime` = window start minus 60 min (pre-market "advance trading", status `PREMARKET`/`TRADING` with `time:0` empty books); `tradingEndTime` = window end minus 500 ms; settlement about 2-4 s after window end; settled markets delisted after 24 h (H, API doc). About 13 future rounds are pre-listed at any time.
- **Settlement rule:** Up wins if settlement price >= start price, else Down (H). Start price = spot index snapshot at window start (user agreement 3.3). Settlement price = TWAP of the spot index over a designated pre-close period; `settleIntervalSeconds: 15`, `settlementDataPointCount: 15` for BTC 5M, i.e. about 15 one-second samples (H for the numbers, M for my reading of them).
- **Tokenisation:** ledger assets inside the Aster account (`BTC_UP_DOWN_5M_1792369800_Y`), `baseAssetAddress: null` in every symbol (H). No ERC-20/SPL token. Y+N always equals 1 USDT (user agreement 4.2). The No book is a mirror of the Yes book: "No Price = 1 - Yes Price" (H, docs). I confirmed in the live depth: the N bids equal 1 minus the Y asks (fixtures `depth_live_round_{Y,N}_2026-10-19.json`).
- **Intra-venue mint/burn:** `POST /api/v3/prediction/mint` and `burn` create/redeem equal Y+N pairs against USDT (H, API doc). Because books are mirrored, there is no Y+N<1 arbitrage inside Aster.
- No leverage, no liquidation, no short selling (only sell what you hold) (H, user agreement 4.1/4.3).
- Order types: LIMIT and MARKET; market = IOC with slippage protection. Live `timeInForce` is `["GTC","IOC","GTX"]` (FOK is in the API doc's enum and event schema but not in live symbols) (H). Min notional 5 USDT, max notional 500,000, qty step 0.01, min qty 1 (live `symbols[]` filters, H). The user agreement reserves a per-round net position cap and cross-wallet aggregation (9.5, H).

## 3. Chains and collateral

- **Collateral:** USDT. Quote asset is `USDT` on every symbol; docs say all PnL and fees display in USDT (H). Trading is from the Aster **Spot** account (press: "shares trade from a user's Spot account", M; user agreement says wallet address is the account identifier, H).
- **Where it lives:** Aster Chain, a privacy-focused L1 (mainnet 2026-03-17/18, 50 ms blocks, gas 0), is the settlement layer for the V3 stack (H docs: https://docs.asterdex.com/aster-chain/overview.md). The prediction API doc calls `settleHash` an "On-chain settlement hash" but never names the chain; I could not resolve a settleHash on any explorer (NOT FOUND, searched: docs, API doc, web). Assume Aster Chain (L). DefiLlama lists chain "Off Chain" and has no TVL (H).
- **Funding chains (Aster deposit bridge, H, https://docs.asterdex.com/overview/smart-contracts.md and https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-chain.md):**
  - BNB Chain (56) vault `0x128463A60784c4D3f46c23Af3f65Ed859Ba87974`
  - Ethereum (1) vault `0x604DD02d620633Ae427888d41bfd15e38483736E`
  - Arbitrum (42161) vault `0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5`
  - Solana program `EhUtRgu9iEbZXXRpEvDj6n1wnQRjMi2SERDo3c6bmN2c` (`depositSol`, `depositToken`; append the program id as the last account to target the spot account)
  - SUI: spot only, transfer to a per-user deposit address from `GET /aster-chain/v3/spot/user-deposit-address`.
  - EVM call: `depositFor(address currency, address forAddress, uint256 amount, uint256 broker)` (payable) or `deposit(currency, amount, broker)`; `broker = 1000` deposits to the **spot** account, any other value to futures (H). I confirmed both functions exist in the Sourcify-verified `AstherusVault` implementation on BSC (impl `0x9a183b1E8939d7a7bd49C47ab0AD540f8aa07360`, exact match; https://sourcify.dev/server/v2/contract/56/0x9a183b1E8939d7a7bd49C47ab0AD540f8aa07360). The three vault addresses are EIP-1967 proxies (Sourcify `proxyResolution`), so Aster/timelock can upgrade the logic; the implementation has pause, role and validator-signed `withdraw` functions (H, ABI), i.e. custodial in effect.
- **Gate:** since 2026-09-01 every authenticated V3 call fails with `-5050 DEPOSIT_REQUIRED` until the main wallet has deposited (H, changelog 2026-08-31).

## 4. Read API

- **Official public API: yes** (`exists = official-public` for market data; trading and account data are signed). Docs: https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-finance-prediction-api.md (mainnet) and `...prediction-api-tesetnet.md` (sic; testnet). A rendered copy is linked from https://docs.asterdex.com/for-developers/aster-api.md. Repo `asterdex/api-docs`, last pushed 2026-09-23 (H).
- **Base URLs (H):** REST `https://papi.asterdex.com`; WebSocket `wss://pstream.asterdex.com`; testnet REST `https://papi.asterdex-testnet.com` (one GET to `/api/v3/time` returned 200 on 2026-10-19, H). The host is shared with Aster spot: unfiltered `GET /api/v3/ticker/bookTicker` returned 101 symbols, i.e. spot pairs (BTCUSDT, ASTERUSDT, ...) plus the 26 prediction symbols (H). Filter by `predictionEvents` from `exchangeInfo`, not by guessing symbol names.
- **Key endpoints (all `/api/v3/...`, unauthenticated unless noted; weights from doc):**
  - `GET /prediction/exchangeInfo` (weight 1): `rateLimits`, `predictionEvents[]` (event id/name, `predictionType`, `period`, `status` LIVE/CLOSED/INVALID, `category`, `liveRound`, `rounds[]` or `markets[]`), `symbols[]` with filters, `assets[]`. **Payload was 948 KB on 2026-10-19** (mostly 576 settled symbols and 301 rounds), so poll it rarely.
  - `GET /depth?symbol=&limit=` (5/10/20/50: weight 2; 100: 5; 500: 10; 1000: 20); `GET /ticker/bookTicker?symbol=` (1; all symbols 2); `GET /ticker/price`; `GET /ticker/24hr?symbol=` (returned `{}` for the live round, H); `GET /trades?symbol=&limit=` (1); `GET /historicalTrades` (20); `GET /aggTrades` (20); `GET /klines` (intervals `1s`, `1m`); `GET /time`; `GET /ping`.
  - Resolution data: `exchangeInfo.predictionEvents[].rounds[]` gives `openPrice`, `endPrice`, `winAsset`, `settleTime`, `settleHash` per settled round (H). Private: `GET /prediction/positions`, `/prediction/positionHistories`, `/prediction/settlementHistories` (signed).
  - **Doc vs live drift (H):** doc sample shows tickSize 0.01 and order limit 300 per 10 s; live shows tickSize 0.0001 and 1000 per 10 s. `GET /api/v3/prediction/ping` returned an HTML page, not JSON (use `/api/v3/ping` or `/time`). The changelog names `positionRisk` where the doc says `positions`. Treat the live `exchangeInfo` as authoritative.
- **Limits (H, live `exchangeInfo` 2026-10-19):** REQUEST_WEIGHT 6000 per minute (IP-based), ORDERS 6000 per minute and 1000 per 10 s (account-based). Response headers `X-MBX-USED-WEIGHT-1m` confirmed. 429 then 418 bans from 2 minutes up to 3 days; `Retry-After` header. Market data needs no key.
- **WebSocket (H doc, NOT tested: I opened no session):** `wss://pstream.asterdex.com/ws/<stream>` or `/stream?streams=`; streams `<symbol>@aggTrade`, `@depth`, `@depth<5|10|20>[@100ms]`, `@kline_<interval>`, `@ticker`, `@bookTicker`, `!bookTicker`, and `<eventName>@event` for TWAP progress (`market_start` with start price, `market_twap` per sample with `r` remaining points and `w` winner on the last). Symbols lowercase. Server pings every 3 min; max 5 client messages per second; 1024 streams per connection. Order-book maintenance recipe documented (snapshot + `U`/`u`/`pu`). User data stream via `listenKey` (60-min validity). Note the doc's own examples spell the stream `btc_up_dowm_...` (typo).
- **Third-party aggregates (H):** DefiLlama `https://api.llama.fi/protocol/aster-predictions` and `/summary/dexs/aster-predictions` (daily volume, no TVL); `/summary/fees/...` and `/summary/options/...` return 400 not found; `/summary/derivatives/aster-predictions` returned **HTTP 402** ("Upgrade to the paid API plan"); payment requirement recorded, no payment attempted.

### Confirmed response shapes (unauthenticated GET, 2026-10-19)

- `GET /api/v3/prediction/exchangeInfo` -> `{timezone:"UTC", serverTime, rateLimits:[{rateLimitType, interval, intervalNum, limit}], exchangeFilters:[], predictionEvents:[{eventName, eventId, oracleSymbol, predictionType, sides, period, startTime, endTime, status, currentRoundId, settleIntervalSeconds, settlementDataPointCount, reduceOnly, category, orderTypes, timeInForce, liveRound:{marketName, symbols[Y,N], assets[Y,N], roundId, tradingStartTime, tradingEndTime, windowStartTime, windowEndTime, roundStatus, openPrice, endPrice, winAsset, settleTime, settleHash}, rounds:[...], markets:[...]}], assets:[{asset}], symbols:[{status, baseAsset, quoteAsset, pricePrecision, quantityPrecision, listingTime, symbolType, baseAssetAddress:null, filters[], orderTypes, timeInForce, symbol, ocoAllowed}]}`. Fixture: `exchangeInfo_trimmed_2026-10-19.json`. Note `winAsset` is populated on unsettled rounds too (it showed the `_N` asset before settlement); only trust it when `roundStatus == "SETTLED"` (H, observed).
- `GET /api/v3/depth?symbol=BTC_UP_DOWN_5M_1792370100_YUSDT&limit=20` -> `{lastUpdateId, E, T, symbol, bids:[[price, qty]], asks:[[price, qty]]}` (fixtures `depth_live_round_Y_...`, `depth_live_round_N_...`). Note this differs from the doc sample, which shows no `symbol` key.
- `GET /api/v3/ticker/bookTicker?symbol=` -> `{symbol, bidPrice, bidQty, askPrice, askQty, time}`; pre-listed future rounds return zeros with `time:0` (fixture `bookTicker_live_round_Y_2026-10-19.json`).
- `GET /api/v3/trades?symbol=` -> `[{id, price, qty, baseQty, time, isBuyerMaker}]` (fixture `trades_settled_round_..._2026-10-19.json`; the doc says `baseQty` but the sample shows `baseQty` = 2 x qty at price 0.5, i.e. units unclear).
- DefiLlama `summary/dexs`: `{total24h, total7d, total30d, total1y, totalAllTime, totalDataChart:[[unixSec, usd]], ...}` (fixture, full 11.7 KB).

## 5. Trade path

- **Programmatic trading: yes, official.** `POST /api/v3/order` (LIMIT/MARKET, `newClientOrderId` for idempotency), `DELETE /api/v3/order`, query/open orders/cancel-all, plus `POST /api/v3/prediction/{mint,burn,split,merge}`, `POST /api/v3/noop` (cancels queued on-chain-pending requests with the same nonce) and `POST /api/v3/asset/wallet/transfer` (perp<->spot). (H, API doc.)
- **Auth (H, API doc "V3 Nonce Mechanism" and example):** each signed request adds `signer` (the API wallet / agent address), `nonce` (current time in microseconds, within 10 s of server time, no reuse; server keeps the last 100 nonces per account) and `signature`. Signature = EIP-712 typed data, domain `{name:"AsterSignTransaction", version:"1", chainId:1666, verifyingContract:0x000...0}`, primary type `Message{string msg}`, where `msg` is the URL-encoded parameter string including `nonce` and `signer`, signed with the **agent's** private key. (For the futures V3 agent registration the domain chainId is the request's `signatureChainId`: 56 for EVM, 101 Solana, not 1666.) The prediction doc does not mention a `user` field; the general V3 overview does (M: possible doc inconsistency, test needed on testnet).
- **Agent setup (H, futures V3 doc, assumed shared):** one-time `POST /fapi/v3/registerAndApproveAgent` signed by the main wallet with EIP-712 (`user, nonce, agentName, agentAddress, expired, signatureChainId, canSpotTrade, canPerpTrade, canWithdraw, ipWhitelist`). Withdraw permission requires an IP whitelist. Whether an agent needs a prediction-specific permission is NOT FOUND (only `canSpotTrade` / `canPerpTrade` exist; predictions ride the spot account, so `canSpotTrade` is the likely one, L). UI route: https://www.asterdex.com/en/api-wallet.
- **Legacy V1 HMAC keys:** new V1 key creation was switched off 2026-03-25 (H, API overview). The prediction API is V3 only.
- **Timing hazards (H doc):** trading is suspended 500 ms before round end (`tradingEndTime`); a 503 means "unknown, may have executed" (futures doc; assume the same).

## 6. PayBox reachability

- `paybox_reachable`: **partial**.
- **Funding is reachable.** The vaults are on Ethereum, BNB Chain and Arbitrum (all in PayBox's chain catalog per `docs/research/06-paybox-platform.md`, M: same-day project note) and Solana. An ERC-20 `approve` plus `depositFor(USDT, <own address>, amount, 1000)` is two ordinary single-call EVM transaction proposals (the PayBox "one transaction per proposal" rule), and PayBox shows only raw calldata (so approvers must trust the plugin). Solana needs a program instruction with the exact account list (H, doc). The wallet needs native gas on the source chain.
- **Order flow is the hard part.** Every order/cancel needs a fresh EIP-712 signature whose nonce must be within 10 s of Aster's clock, made by a registered **agent key**, not by the funds wallet. Options: (a) PayBox `request_wallet_sign` `typedData` per call (no domain restriction documented, M per the platform note) with the PayBox EOA registered as the agent: unverified whether Aster lets a wallet be its own agent, and the sign-then-submit round trip may exceed 10 s unless the grant is autonomous (unresolved in the platform note); (b) a dedicated trade-only agent key (`canWithdraw=false`) held by the plugin as a secret and signed inside the sandbox: workable but puts a hot key in plugin config. Neither was tested (no signing tool may be called here).
- One-time agent registration is a single `typedData` signature by the main wallet (domain chainId 56). Withdrawals need validator signatures and fees (`GET /api/v3/aster/withdraw/estimateFee` exists).
- With liquidity at about $1k per day none of this is worth building.

## 7. Fees

- **Trading fee:** "0% fee for both taker and maker at launch" (H, https://docs.asterdex.com/trading/prediction.md read 2026-10-19). The user agreement says maker and taker rates differ, apply to buys and sells, are charged in USDT and are "independently configured" (6.1, H). The API doc sample for `GET /api/v3/commissionRate` shows `makerCommissionRate 0.000200, takerCommissionRate 0.000700, settleCommissionRate 0.000100`, which contradicts the docs page and is probably just an illustrative sample (M). Live rates require the signed `commissionRate` call (returned `-1102 Mandatory parameter 'nonce'` unauthenticated, H): NOT FOUND.
- **Settlement fee:** 0.05% on winning shares only, formula `token quantity x settlement price x fee rate` (H, user agreement 5.4 and docs), i.e. 0.0005 USDT per winning share when it settles at 1. Charged to the winner, deducted from the payout. Fixed, not maker/taker dependent (6.2).
- Fees on sells are deducted from proceeds. No gas for orders (Aster Chain gas is 0, M). Volume counts toward Aster VIP tiers (H). Deposits/withdrawals pay source-chain gas and a withdraw fee.

## 8. Resolution and dispute risk

- **Price markets:** compare TWAP of the "underlying spot index price" with the start index snapshot (H). The prediction docs do not define the index. Aster's perp docs describe its Price Index as a volume-weighted average of major spot venues (Binance, HTX, Kraken, ...) with outlier handling (H, https://docs.asterdex.com/trading/perpetuals/fees-and-specs/mark-price.md); whether predictions use the same index is NOT FOUND (M that they do, because `oracleSymbol` is `BTCUSDT`). Start prices have 8 decimals and are not exchange ticks (e.g. 82170.06760870), consistent with a computed composite.
- **Event markets:** "official result of the event" (H); no named source. Currently no live event markets.
- **Aster keeps final say:** "In the event of external data source failures, abnormal pricing, or system errors, we reserve the right to initiate a settlement review and retain the authority to make the final determination. Such review conclusions are binding" (H, user agreement 5.6; also 9.2, 9.3 reversal of abnormal trades). Disclosed risks include index manipulation under extreme conditions and the 500 ms pre-settlement halt (7.4).
- **Disputes:** open a ticket on Aster's Discord with market, settlement time, order/trade ids, expected vs actual (H, docs FAQ 17). No on-chain dispute, no appeal, no bond.
- **Auditability:** each settled round exposes open/end price and a `settleHash`; I could not resolve the hash on an explorer (NOT FOUND). Settlement is operator-run and verifiable only through Aster's own data.

## 9. Geo, ToS, automation

- **Prediction-trading blocked countries (H, https://docs.asterdex.com/trading/prediction/service-region.md and the user agreement 2.4):** AU, BE, BY, BI, CF, CD, CU, DE, ET, FR, GB, IR, IQ, IT, JP, KP, LB, LY, MM, NI, PL, RU, SG, SO, SS, SD, SY, TH, TW, UM, US, VE, YE, ZW; regions CA-ON, UA-43, UA-14, UA-09. "Orders submitted from restricted regions will be rejected." The page says some countries are "frontend UI restricted ... the API itself is not restricted" but marks none, so which, if any, is unclear (H, ambiguity). Jurisdiction is decided by IP geolocation "and any other information"; VPN use does not cure it (user agreement 2.4). General ToS also bars US, Canada, UK, China, North Korea, Russia, Ukraine, Cuba, Iran, Venezuela, Syria (H, https://docs.asterdex.com/resources/terms-and-conditions.md, updated 2026-02-25). Public market-data GETs succeeded for me; this says nothing about whether an operator in a restricted country may trade.
- **Automation:** ToS 6.2(e): "To use any automated means, including bots, scrapers, or spiders, to access or use the Services without our express permission." The official API and API-wallet flow suggest permission for API use, but no text grants it (M). Prediction agreement 8.4 bans "Unauthorized scraping, collection, or commercial use of Platform data", relevant if Aster prices are redistributed as a signal product; also bans spoofing, wash trading, front-running and "circumventing risk control" (H).
- Self-trade prevention exists for futures (STP modes) but is not documented for predictions (NOT FOUND).
- 18+, own the wallet, funds from lawful sources (H).

## 10. Liquidity (with dates)

- **DefiLlama volume (H, https://api.llama.fi/summary/dexs/aster-predictions, fetched 2026-10-19; series 2026-06-03..2026-10-17):** all-time $2,695,909; 30d $37,767; 7d $12,081; last day (2026-10-17) $1,840. Monthly sums computed from `totalDataChart`: Jun $1,434,796; Jul $862,429; Aug $292,883; Sep $74,502; Oct 1-17 $31,299. DefiLlama methodology field is empty, so what counts as volume (notional vs shares, mint/burn) is NOT FOUND. A third-party search snippet quoted $68,724 for "30 days" earlier (L, stale cache).
- **My own sample (derived, fixture `trade_sample_summary_derived_2026-10-19.json`):** trades on every 3rd settled round over 2026-10-18 04:25 to 2026-10-19 00:25 UTC: 48 rounds, only 13 had any trade, 32 trades, about $156 notional, largest round $24.50. Scaled to all rounds and 24 h this is order $1k per day, consistent with DefiLlama (M).
- **Order book (H):** five snapshots 2026-10-19 00:31-00:37 UTC of the live round. Bids sit at 0.0001-0.0008 (up to 50,000 shares at 0.0001); asks at 0.9992-0.9999 (up to 50,000 at 0.9999). Inside quotes appeared only as a single 10-share order (0.40 ask / 0.60 bid in one snapshot, 0.65 bid, 0.82 bid, 0.18 ask in others). Pre-listed rounds are empty. No 24h stats (`{}`). A $5 minimum notional order cannot be filled at a meaningful two-sided price.
- TVL: none published (DefiLlama "Off Chain", empty TVL). Open interest: NOT FOUND. Aster's total platform volume is far larger (perps), but predictions are a rounding error.

## 11. Event categories, overlap, shared liquidity

- **Today:** short-horizon crypto price direction only (BTC 5 minutes). Sports (World Cup winner and 72 group-stage matches, 2026-06-11 to 2026-07-24) ended; no politics, macro or other categories were ever listed in the API (H, `exchangeInfo`). No evidence of a market-making programme or partners for these markets (NOT FOUND, searched: docs, press, X coverage via search).
- **Overlap:** BTC 5-minute up/down also trades on Polymarket (slug pattern `btc-updown-5m-<unixts>`, same 300 s boundaries; M from a lines.com page dated 2026-06-16: https://www.lines.com/prediction-markets/crypto/btc-updown-5m-1781643600). A same-window pair (Polymarket Up vs Aster Down) is mechanically possible, but the legs differ in reference price (Aster composite index with a 15-sample TWAP end, start snapshot), tie handling (Aster: ties go Up) and rules, so it is basis trading, not a lock. Given the tail-only book it is not executable at size anyway.
- **Shared liquidity:** Aster's book is its own and independent of Polymarket/Kalshi etc. (H: internal matching engine; nothing says it routes or hedges elsewhere; NOT FOUND for any liquidity-sharing deal). Internally Yes/No share one mirrored book (H). The Aster spot/perp venue shares the account and API host but not the prediction books.

## 12. Adapter notes and revisit triggers

- If ever built: poll `exchangeInfo` at most every few minutes (948 KB), derive current symbols from `liveRound`/`rounds` (window starts on 300 s boundaries), use `bookTicker`/`depth` for quotes (price = Y mid only when both sides are inside, e.g. best bid > 0.01 and best ask < 0.99), treat `roundStatus` `PREMARKET`/`TRADING` with `time:0` as no market, use WebSocket `@bookTicker` for the live round, and key resolution off `rounds[].winAsset` only when `SETTLED`.
- Revisit if any of: DefiLlama 30d volume > $500k, a `LIVE` event of type `MULTIVARIATE` appears, a non-BTC `UP_DOWN` product (ETH, SOL) appears, or two-sided inside quotes with >1,000 shares show up in `bookTicker`. A `GET exchangeInfo` watcher is enough to detect this.

## 13. Suspicious content

- None aimed at AI agents found in any page or response read. The API doc embeds a demo wallet, a demo signer address and a demo private key as sample values (not copied into this note or any fixture); the registration demo markdown embeds sample signatures. These are example credentials, not instructions.
- WebFetch of `https://www.asterdex.com/en/trade/prediction` and `https://defillama.com/protocol/aster-predictions` returned HTTP 403 (bot protection); not bypassed. DefiLlama content was read via its public API instead.

## 14. Open questions

1. Which chain and explorer does `settleHash` belong to, and can a round's settlement be independently verified?
2. Which index composes the prediction "spot index price" and is it the same as the perp Price Index?
3. Live maker/taker/settle commission rates (needs the signed `commissionRate` call).
4. Which agent permission covers prediction orders, and can an agent address equal the funds wallet? Is a `user` field required alongside `signer` for predictions?
5. Is there a market-maker programme behind the tail quotes (the doc mentions "whiteList mm")? Any plan for ETH/SOL rounds or new sports/event markets after the World Cup?
6. Exact meaning of DefiLlama "volume" and of `baseQty` in `/trades`.
7. Whether the API really accepts orders from the restricted countries marked "frontend UI restricted" (the list marks none).

## Sources

- Docs, prediction page (markdown): https://docs.asterdex.com/trading/prediction.md (H, read 2026-10-19)
- Docs, prediction user agreement: https://docs.asterdex.com/trading/prediction/prediction-user-agreement.md (H)
- Docs, service region: https://docs.asterdex.com/trading/prediction/service-region.md (H)
- Docs index: https://docs.asterdex.com/llms.txt (H); API landing: https://docs.asterdex.com/for-developers/aster-api.md (H)
- Docs, terms and conditions (updated 2026-02-25): https://docs.asterdex.com/resources/terms-and-conditions.md (H)
- Docs, smart contracts: https://docs.asterdex.com/overview/smart-contracts.md (H); Aster Chain overview: https://docs.asterdex.com/aster-chain/overview.md (H); mark price/index: https://docs.asterdex.com/trading/perpetuals/fees-and-specs/mark-price.md (H)
- Prediction API doc: https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-finance-prediction-api.md (H, read via `gh api` raw)
- Aster chain/deposit doc: https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-chain.md (H); futures V3 agent registration: https://github.com/asterdex/api-docs/blob/master/V3(Recommended)/EN/aster-finance-futures-api-v3.md (H); changelog: https://github.com/asterdex/api-docs/blob/master/CHANGELOG.md (H); V1 vs V3 overview: https://github.com/asterdex/api-docs/blob/master/Aster%20API%20Overview.md (H)
- Rendered API site repo (prediction docs present): https://github.com/asterdex/aster-api-website (H, tree listing only)
- Live API: https://papi.asterdex.com/api/v3/time, `/api/v3/prediction/exchangeInfo`, `/api/v3/depth`, `/api/v3/ticker/bookTicker`, `/api/v3/trades`, `/api/v3/ticker/24hr`, `/api/v3/commissionRate` (400 unauthenticated); https://papi.asterdex-testnet.com/api/v3/time (H, 2026-10-19)
- DefiLlama: https://api.llama.fi/protocol/aster-predictions ; https://api.llama.fi/summary/dexs/aster-predictions ; fees/options 400; derivatives 402 (H)
- Sourcify: https://sourcify.dev/server/v2/contract/56/0x128463A60784c4D3f46c23Af3f65Ed859Ba87974 (EIP-1967 proxy) and implementation https://sourcify.dev/server/v2/contract/56/0x9a183b1E8939d7a7bd49C47ab0AD540f8aa07360 (H); same pattern for chain 1 (`0x604D...736E`) and 42161 (`0x9E36...E1d5`) (H)
- Press: https://bitcoinfoundation.org/news/prediction-markets/binance-backed-dex-aster-launches-prediction-markets/ (2026-06-15, M); https://thecoinformer.com/news/binance-linked-aster-takes-on-hyperliquid-with-prediction-markets (2026-06-15, M)
- Polymarket BTC 5-minute page (overlap evidence): https://www.lines.com/prediction-markets/crypto/btc-updown-5m-1781643600 (M, search result not opened)
- Project context: `docs/research/06-paybox-platform.md` (PayBox chain catalog, signing semantics; M)
